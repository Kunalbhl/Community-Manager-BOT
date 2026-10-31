import {
  OperationalActionDefinition,
  OperationalActionId,
  OperationalActionResult,
  OperationalActionHistoryEntry,
  OperationalActionResultStatus,
  OperationalExecutionRecord,
  OperationalExecutionState,
  OperationalLockRecord,
} from '../../../shared/types/observability.js';
import { discordService } from '../../integrations/discord/discord.service.js';
import { schedulerWorker } from '../../workers/scheduler.worker.js';
import { observabilityService } from './observability.service.js';
import {
  schedulesRepository,
  scheduledJobsRepository,
  durableLocksRepository,
  operationalExecutionsRepository,
  operationalLocksRepository,
  incidentsRepository,
  incidentTimelinesRepository,
} from '../../repositories/index.js';
import { checkFirestoreReadiness, isRealPersistenceMode } from '../../repositories/firestore.repository.js';
import { auditService } from '../audit.service.js';
import { secretsManager } from '../../security/secrets.js';
import { logger } from '../../logging/logger.js';

export const AUTHORITATIVE_RECOVERY_ACTIONS: OperationalActionDefinition[] = [
  {
    actionId: 'DISCORD_RECONNECT',
    label: 'Reconnect Discord Gateway',
    description: 'Safely reconnects the singleton Discord WebSocket Gateway client and verifies resulting state.',
    requiredRole: 'PLATFORM_OWNER',
    supportedComponents: ['DISCORD_GATEWAY'],
    targetComponent: 'DISCORD_GATEWAY',
    riskLevel: 'HIGH',
    confirmationRequired: true,
    supported: true,
  },
  {
    actionId: 'SCHEDULER_RESTART',
    label: 'Restart Scheduler Worker',
    description: 'Stops and cleanly restarts the background durable scheduler worker loop.',
    requiredRole: 'PLATFORM_OWNER',
    supportedComponents: ['SCHEDULER'],
    targetComponent: 'SCHEDULER',
    riskLevel: 'MEDIUM',
    confirmationRequired: true,
    supported: true,
  },
  {
    actionId: 'SCHEDULER_RECONCILE',
    label: 'Reconcile Scheduler State',
    description: 'Inspects and reconciles durable schedules, checking active and pending jobs without duplicating or deleting records.',
    requiredRole: 'PLATFORM_OWNER',
    supportedComponents: ['SCHEDULER'],
    targetComponent: 'SCHEDULER',
    riskLevel: 'LOW',
    confirmationRequired: false,
    supported: true,
  },
  {
    actionId: 'FIRESTORE_READINESS_RECHECK',
    label: 'Recheck Firestore Readiness',
    description: 'Executes an authoritative readiness health check against the persistent Firestore database store.',
    requiredRole: 'PLATFORM_OWNER',
    supportedComponents: ['DATABASE'],
    targetComponent: 'DATABASE',
    riskLevel: 'LOW',
    confirmationRequired: false,
    supported: true,
  },
  {
    actionId: 'HEALTH_RECHECK',
    label: 'Comprehensive System Health Recheck',
    description: 'Re-evaluates all operational alert conditions, telemetry counters, and subsystem dependencies.',
    requiredRole: 'PLATFORM_OWNER',
    supportedComponents: ['APPLICATION'],
    targetComponent: 'APPLICATION',
    riskLevel: 'LOW',
    confirmationRequired: false,
    supported: true,
  },
  {
    actionId: 'CLEAR_STALE_OPERATIONAL_LOCK',
    label: 'Clear Stale Durable Lock',
    description: 'Safely removes an expired or stale distributed concurrency lock after verifying identity and TTL expiration.',
    requiredRole: 'PLATFORM_OWNER',
    supportedComponents: ['DURABLE_LOCK'],
    targetComponent: 'DURABLE_LOCK',
    riskLevel: 'HIGH',
    confirmationRequired: true,
    supported: true,
  },
];

interface CachedExecution {
  result: OperationalActionResult;
  timestamp: number;
}

/**
 * Deep redaction scrubber to prevent leaking secrets into database or responses
 */
function sanitizeObject(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return secretsManager.redactString(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (typeof obj === 'object') {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (/token|secret|password|auth|cookie|key|credential/i.test(k)) {
        res[k] = '[REDACTED]';
      } else {
        res[k] = sanitizeObject(v);
      }
    }
    return res;
  }
  return String(obj);
}

export class OperationalRecoveryService {
  private idempotencyCache = new Map<string, CachedExecution>();
  private executionHistory: OperationalActionHistoryEntry[] = [];
  private readonly MAX_HISTORY = 100;
  private readonly IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly OPERATION_LOCK_TTL_MS = 60 * 1000; // 60 seconds

  constructor() {
    // Eagerly pre-load durable execution history in background
    this.loadDurableHistory().catch((err) => {
      logger.warn(`[OperationalRecovery] Initial durable history load: ${err?.message}`);
    });
  }

  /**
   * Return authoritative action registry with strictly immutable properties
   */
  getAvailableActions(): OperationalActionDefinition[] {
    return AUTHORITATIVE_RECOVERY_ACTIONS.map((a) => ({
      actionId: a.actionId,
      label: a.label,
      description: a.description,
      requiredRole: a.requiredRole,
      supportedComponents: [...a.supportedComponents],
      targetComponent: a.targetComponent,
      riskLevel: a.riskLevel,
      confirmationRequired: a.confirmationRequired,
      supported: true,
    }));
  }

  /**
   * Return recent execution history synchronously (ring buffer cache)
   */
  getExecutionHistory(): OperationalActionHistoryEntry[] {
    return [...this.executionHistory];
  }

  /**
   * Return durable execution history from persistent repository
   */
  async getExecutionHistoryAsync(limit: number = 100): Promise<OperationalActionHistoryEntry[]> {
    await this.loadDurableHistory();
    return this.executionHistory.slice(0, limit);
  }

  /**
   * Synchronize in-memory history cache from authoritative durable storage
   */
  async loadDurableHistory(): Promise<void> {
    try {
      const records = await operationalExecutionsRepository.list();
      records.sort((a, b) => new Date(b.createdAt || b.requestedAt).getTime() - new Date(a.createdAt || a.requestedAt).getTime());

      const mapped: OperationalActionHistoryEntry[] = records.map((r) => ({
        id: r.id,
        actionId: r.actionId,
        actorUserId: r.actorId,
        status: (r.resultCode || r.status) as OperationalActionResultStatus,
        correlationId: r.correlationId,
        timestamp: r.completedAt || r.createdAt,
        summary: r.message,
        details: r.metadata?.details,
        incidentId: r.incidentId,
        executionState: r.status,
      }));

      this.executionHistory = mapped.slice(0, this.MAX_HISTORY);

      // Populate idempotency cache for recent executions within TTL
      const nowMs = Date.now();
      for (const r of records) {
        if (r.idempotencyKey && r.status !== 'REQUESTED' && r.status !== 'PROCESSING') {
          const createdMs = new Date(r.createdAt || r.requestedAt).getTime();
          if (nowMs - createdMs < this.IDEMPOTENCY_TTL_MS && !this.idempotencyCache.has(r.idempotencyKey)) {
            this.idempotencyCache.set(r.idempotencyKey, {
              result: {
                actionId: r.actionId,
                status: (r.resultCode || r.status) as OperationalActionResultStatus,
                message: r.message,
                correlationId: r.correlationId,
                timestamp: r.completedAt || r.createdAt,
                details: r.metadata?.details,
                idempotentReplay: true,
                executionId: r.id,
                incidentId: r.incidentId,
              },
              timestamp: createdMs,
            });
          }
        }
      }
    } catch (err: any) {
      logger.warn(`[OperationalRecovery] Error loading durable history: ${err?.message}`);
    }
  }

  /**
   * Acquire a concurrency operation lock
   */
  private async acquireOperationLock(
    actionId: string,
    correlationId: string,
    actorUserId: string
  ): Promise<{ acquired: boolean; activeLock?: OperationalLockRecord }> {
    const lockKey = `op_lock_${actionId}`;
    try {
      const existing = await operationalLocksRepository.getById(lockKey);
      if (existing && existing.status === 'ACTIVE') {
        const expiresAtMs = new Date(existing.expiresAt).getTime();
        if (expiresAtMs > Date.now()) {
          // Actively held lock - block execution
          return { acquired: false, activeLock: existing };
        }
        // Abandoned lock - TTL has expired
        logger.warn(`[OperationalRecovery] Clearing abandoned lock "${lockKey}" expired at ${existing.expiresAt}`);
        await operationalLocksRepository.delete(lockKey).catch(() => {});
      }

      const lockRecord: OperationalLockRecord = {
        id: lockKey,
        actionId,
        ownerId: actorUserId || 'SYSTEM_OPERATOR',
        correlationId,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + this.OPERATION_LOCK_TTL_MS).toISOString(),
      };

      await operationalLocksRepository.create(lockRecord);
      return { acquired: true };
    } catch (err: any) {
      logger.warn(`[OperationalRecovery] Concurrency lock check failed: ${err?.message}`);
      return { acquired: true };
    }
  }

  /**
   * Release a concurrency operation lock
   */
  private async releaseOperationLock(actionId: string): Promise<void> {
    const lockKey = `op_lock_${actionId}`;
    try {
      await operationalLocksRepository.delete(lockKey);
    } catch {
      // Non-blocking
    }
  }

  /**
   * Check idempotency surviving process restart
   */
  private async checkDurableIdempotency(
    actionId: string,
    idempotencyKey?: string
  ): Promise<OperationalActionResult | null> {
    if (!idempotencyKey) return null;

    // 1. In-memory fast cache check
    const cached = this.idempotencyCache.get(idempotencyKey);
    if (cached && Date.now() - cached.timestamp < this.IDEMPOTENCY_TTL_MS) {
      if (cached.result.actionId === actionId) {
        logger.info(`[OperationalRecovery] In-memory idempotency hit for key ${idempotencyKey}`);
        return {
          ...cached.result,
          idempotentReplay: true,
        };
      }
    }

    // 2. Authoritative durable storage lookup
    try {
      const allRecords = await operationalExecutionsRepository.list();
      const match = allRecords.find(
        (r) =>
          r.idempotencyKey === idempotencyKey &&
          r.actionId === actionId &&
          r.status !== 'REQUESTED' &&
          r.status !== 'PROCESSING'
      );

      if (match) {
        const createdMs = new Date(match.createdAt || match.requestedAt).getTime();
        if (Date.now() - createdMs < this.IDEMPOTENCY_TTL_MS) {
          logger.info(`[OperationalRecovery] Durable idempotency hit for key ${idempotencyKey} (survived restart)`);
          const replayResult: OperationalActionResult = {
            actionId: match.actionId,
            status: (match.resultCode || match.status) as OperationalActionResultStatus,
            message: match.message,
            correlationId: match.correlationId,
            timestamp: match.completedAt || match.createdAt,
            details: match.metadata?.details,
            idempotentReplay: true,
            executionId: match.id,
            incidentId: match.incidentId,
          };

          this.idempotencyCache.set(idempotencyKey, {
            result: replayResult,
            timestamp: createdMs,
          });

          return replayResult;
        }
      }
    } catch (err: any) {
      logger.warn(`[OperationalRecovery] Durable idempotency lookup error: ${err?.message}`);
    }

    return null;
  }

  /**
   * Execute an operational recovery action with authorization, confirmation, idempotency, concurrency lock, and durable persistence
   */
  async executeAction(params: {
    actionId: string;
    actorUserId: string;
    confirmed?: boolean;
    idempotencyKey?: string;
    parameters?: Record<string, any>;
    correlationId?: string;
    incidentId?: string;
  }): Promise<OperationalActionResult> {
    const correlationId = params.correlationId || `corr_ops_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();
    const incidentId = params.incidentId || (params.parameters?.incidentId ? String(params.parameters.incidentId) : undefined);

    // 1. Idempotency Check (Survives Process Restart)
    if (params.idempotencyKey) {
      const idempotentMatch = await this.checkDurableIdempotency(params.actionId, params.idempotencyKey);
      if (idempotentMatch) {
        return idempotentMatch;
      }
    }

    // 2. Validate against Authoritative Action Registry
    const actionDef = AUTHORITATIVE_RECOVERY_ACTIONS.find((a) => a.actionId === params.actionId);

    // Create initial durable execution record
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const executionRecord: OperationalExecutionRecord = {
      id: executionId,
      actionId: params.actionId,
      actorId: secretsManager.redactString(params.actorUserId || 'SYSTEM_OPERATOR'),
      actorRole: 'PLATFORM_OWNER',
      targetComponent: actionDef?.targetComponent || actionDef?.supportedComponents?.[0] || 'SYSTEM',
      riskLevel: actionDef?.riskLevel || 'LOW',
      confirmationRequired: Boolean(actionDef?.confirmationRequired),
      confirmationProvided: Boolean(params.confirmed),
      idempotencyKey: params.idempotencyKey ? secretsManager.redactString(params.idempotencyKey) : undefined,
      status: 'PROCESSING',
      resultCode: 'PROCESSING',
      message: `Recovery action "${params.actionId}" requested.`,
      correlationId,
      requestedAt: nowIso,
      startedAt: nowIso,
      createdAt: nowIso,
      incidentId,
      metadata: sanitizeObject(params.parameters),
    };

    try {
      await operationalExecutionsRepository.create(executionRecord);
    } catch (err: any) {
      logger.warn(`[OperationalRecovery] Failed to create initial durable execution record: ${err?.message}`);
    }

    // Action support validation
    if (!actionDef) {
      const unsupportedResult: OperationalActionResult = {
        actionId: params.actionId,
        status: 'OPERATION_NOT_SUPPORTED',
        message: `Action "${secretsManager.redactString(params.actionId)}" is not supported by the operational recovery control plane.`,
        correlationId,
        timestamp: nowIso,
        executionId,
        incidentId,
      };

      await this.finalizeExecution(executionRecord, unsupportedResult, 'NOT_SUPPORTED', params.parameters);
      return unsupportedResult;
    }

    // 3. Confirmation check for high/medium risk actions (Authoritative Server-Side Only)
    if (actionDef.confirmationRequired && !params.confirmed) {
      const confirmationResult: OperationalActionResult = {
        actionId: params.actionId,
        status: 'CONFIRMATION_REQUIRED',
        message: `Action "${actionDef.label}" requires explicit operator confirmation (confirmed: true) due to ${actionDef.riskLevel} risk level.`,
        correlationId,
        timestamp: nowIso,
        details: {
          riskLevel: actionDef.riskLevel,
          confirmationRequired: true,
        },
        executionId,
        incidentId,
      };

      await this.finalizeExecution(executionRecord, confirmationResult, 'BLOCKED', params.parameters);
      return confirmationResult;
    }

    // 4. Concurrency Operator Protection
    const lock = await this.acquireOperationLock(params.actionId, correlationId, params.actorUserId);
    if (!lock.acquired) {
      const lockedResult: OperationalActionResult = {
        actionId: params.actionId,
        status: 'OPERATION_IN_PROGRESS',
        message: `Operation "${actionDef.label}" is currently in progress by another operator (lock held until ${lock.activeLock?.expiresAt}). Concurrent execution blocked.`,
        correlationId,
        timestamp: nowIso,
        details: {
          activeLockId: lock.activeLock?.id,
          lockedBy: lock.activeLock?.correlationId || lock.activeLock?.ownerId,
          expiresAt: lock.activeLock?.expiresAt,
          createdAt: lock.activeLock?.createdAt,
        },
        executionId,
        incidentId,
      };

      await this.finalizeExecution(executionRecord, lockedResult, 'BLOCKED', params.parameters);
      return lockedResult;
    }

    // 5. Execute Real Recovery Logic Under Operation Lock
    let result: OperationalActionResult;
    let executionState: OperationalExecutionState = 'SUCCEEDED';

    try {
      switch (actionDef.actionId) {
        case 'DISCORD_RECONNECT':
          result = await this.handleDiscordReconnect(correlationId);
          break;

        case 'SCHEDULER_RESTART':
          result = await this.handleSchedulerRestart(correlationId);
          break;

        case 'SCHEDULER_RECONCILE':
          result = await this.handleSchedulerReconcile(correlationId);
          break;

        case 'FIRESTORE_READINESS_RECHECK':
          result = await this.handleFirestoreReadinessRecheck(correlationId);
          break;

        case 'HEALTH_RECHECK':
          result = await this.handleHealthRecheck(correlationId);
          break;

        case 'CLEAR_STALE_OPERATIONAL_LOCK':
          result = await this.handleClearStaleLock(params.parameters?.lockId, correlationId);
          break;

        default:
          result = {
            actionId: params.actionId,
            status: 'OPERATION_NOT_SUPPORTED',
            message: `Execution for action ${params.actionId} is not implemented.`,
            correlationId,
            timestamp: new Date().toISOString(),
          };
      }

      result.executionId = executionId;
      result.incidentId = incidentId;

      // Map status to canonical execution state
      if (result.status === 'SUCCESS') {
        executionState = 'SUCCEEDED';
      } else if (result.status === 'ALREADY_CONNECTED') {
        executionState = 'ALREADY_CONNECTED';
      } else if (result.status === 'OPERATION_NOT_SUPPORTED') {
        executionState = 'NOT_SUPPORTED';
      } else if (result.status === 'CONFIRMATION_REQUIRED' || result.status === 'OPERATION_IN_PROGRESS') {
        executionState = 'BLOCKED';
      } else {
        executionState = 'FAILED';
      }
    } catch (err: any) {
      const safeErrorMsg = secretsManager.redactString(err?.message || 'Unexpected execution failure');
      result = {
        actionId: params.actionId,
        status: 'FAILED',
        message: `Recovery action failed: ${safeErrorMsg}`,
        correlationId,
        timestamp: new Date().toISOString(),
        executionId,
        incidentId,
      };
      executionState = 'FAILED';
    } finally {
      // Release concurrency operation lock
      await this.releaseOperationLock(params.actionId);
    }

    // 6. Incident Correlation
    if (incidentId) {
      await this.correlateWithIncident(
        incidentId,
        actionDef,
        result,
        params.actorUserId,
        Boolean(params.parameters?.resolveIncident)
      );
    }

    // 7. Finalize Durable Record & Audit
    await this.finalizeExecution(executionRecord, result, executionState, params.parameters);

    // 8. Cache in memory for fast replay within TTL
    if (params.idempotencyKey) {
      this.idempotencyCache.set(params.idempotencyKey, {
        result,
        timestamp: Date.now(),
      });
    }

    return result;
  }

  /**
   * Finalize durable execution record, audit log, and in-memory history cache
   */
  private async finalizeExecution(
    record: OperationalExecutionRecord,
    result: OperationalActionResult,
    executionState: OperationalExecutionState,
    parameters?: Record<string, any>
  ): Promise<void> {
    const completedAt = new Date().toISOString();

    record.status = executionState;
    record.resultCode = result.status;
    record.message = secretsManager.redactString(result.message);
    record.completedAt = completedAt;
    record.errorCode = result.status === 'FAILED' ? String(result.details?.error || result.details?.disconnectReason || 'EXECUTION_FAILED') : undefined;
    record.metadata = {
      ...sanitizeObject(parameters),
      details: sanitizeObject(result.details),
    };

    try {
      await operationalExecutionsRepository.update(record.id, record);
    } catch (err: any) {
      logger.warn(`[OperationalRecovery] Failed to update durable execution record: ${err?.message}`);
    }

    // Audit logging
    await this.recordAudit(record.actorId, record.actionId, result, record.correlationId, parameters);

    // Push into in-memory ring buffer
    this.pushHistory(record.actorId, record.actionId, result, record.correlationId, record.id, record.incidentId, executionState);
  }

  /**
   * Correlate recovery action with incident
   */
  private async correlateWithIncident(
    incidentId: string,
    actionDef: OperationalActionDefinition | undefined,
    result: OperationalActionResult,
    actorUserId: string,
    resolveRequested: boolean
  ): Promise<void> {
    try {
      const inc = await observabilityService.getIncidentById(incidentId);
      if (!inc) {
        logger.warn(`[OperationalRecovery] Incident ${incidentId} not found for correlation.`);
        return;
      }

      const nowIso = new Date().toISOString();
      const safeSummary = secretsManager.redactString(
        `Recovery action "${actionDef?.label || result.actionId}" executed (${result.status}): ${result.message}`
      );

      // Record recovery attempt on incident timeline history
      if (!inc.history) inc.history = [];
      inc.history.push({
        action: `RECOVERY_ATTEMPT_${result.status}`,
        actorUserId: actorUserId || 'SYSTEM_OPERATOR',
        timestamp: nowIso,
        details: safeSummary,
      });

      // Task 134: Record in durable incident timelines repository
      try {
        await incidentTimelinesRepository.create({
          id: `tl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          incidentId: inc.id,
          timestamp: nowIso,
          event: result.status === 'SUCCESS' ? 'RECOVERY_SUCCEEDED' : 'RECOVERY_FAILED',
          actorId: actorUserId || 'SYSTEM_OPERATOR',
          actorRole: 'OWNER',
          message: safeSummary,
          details: { actionId: result.actionId, status: result.status },
          correlationId: result.correlationId,
        });
      } catch {
        // Non-blocking
      }

      // Add operator note documenting the recovery attempt
      if (!inc.operatorNotes) inc.operatorNotes = [];
      inc.operatorNotes.push({
        noteId: `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        authorUserId: actorUserId || 'SYSTEM_OPERATOR',
        note: safeSummary,
        createdAt: nowIso,
      });

      // Only resolve incident if recovery genuinely succeeded and explicit resolution was requested
      if (result.status === 'SUCCESS' && resolveRequested) {
        inc.status = 'RESOLVED';
        inc.resolvedAt = nowIso;
        inc.history.push({
          action: 'INCIDENT_RESOLVED',
          actorUserId: actorUserId || 'SYSTEM_OPERATOR',
          timestamp: nowIso,
          details: `Incident resolved following verified operational recovery action: ${actionDef?.label}`,
        });
        logger.info(`[OperationalRecovery] Incident ${incidentId} successfully marked RESOLVED following verified recovery.`);

        try {
          await incidentTimelinesRepository.create({
            id: `tl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            incidentId: inc.id,
            timestamp: nowIso,
            event: 'RESOLVED',
            actorId: actorUserId || 'SYSTEM_OPERATOR',
            actorRole: 'OWNER',
            message: `Incident resolved following verified operational recovery action: ${actionDef?.label}`,
            details: { actionId: result.actionId },
            correlationId: result.correlationId,
          });
        } catch {
          // Non-blocking
        }
      }

      await incidentsRepository.update(inc.id, inc);

      await auditService.log({
        communityId: inc.communityId || 'SYSTEM',
        actorUserId: actorUserId || 'SYSTEM_OPERATOR',
        actorRole: 'OWNER',
        action: 'SYSTEM_INCIDENT_RECOVERY_ATTEMPTED' as any,
        targetType: 'incident',
        targetId: inc.id,
        metadata: {
          actionId: result.actionId,
          recoveryStatus: result.status,
          incidentStatus: inc.status,
          correlationId: result.correlationId,
        },
      });
    } catch (err: any) {
      logger.warn(`[OperationalRecovery] Incident correlation failed for ${incidentId}: ${err?.message}`);
    }
  }

  /**
   * Safe Discord Reconnect
   */
  private async handleDiscordReconnect(correlationId: string): Promise<OperationalActionResult> {
    const isConfigured = discordService.isConfigured();
    if (!isConfigured) {
      return {
        actionId: 'DISCORD_RECONNECT',
        status: 'NOT_CONFIGURED',
        message: 'Discord bot token is not configured or is a mock token in environment. Gateway reconnect skipped.',
        correlationId,
        timestamp: new Date().toISOString(),
        details: { gatewayState: 'NOT_CONFIGURED' },
      };
    }

    if (discordService.isConnected()) {
      const diag = discordService.getDiagnostics();
      return {
        actionId: 'DISCORD_RECONNECT',
        status: 'ALREADY_CONNECTED',
        message: 'Discord Gateway client is already active and connected.',
        correlationId,
        timestamp: new Date().toISOString(),
        details: {
          gatewayState: 'CONNECTED',
          pingMs: diag.pingMs,
          botTag: diag.botTag,
        },
      };
    }

    logger.info(`[OperationalRecovery] [${correlationId}] Initiating real Discord Gateway connection...`);
    const success = await discordService.connect();
    const currentState = discordService.getConnectionState();
    const isNowConnected = discordService.isConnected();
    const diag = discordService.getDiagnostics();

    if (success && isNowConnected) {
      observabilityService.updateDependencyStatus(
        'discord_gateway',
        'HEALTHY',
        'Discord Gateway reconnected and active.'
      );
      return {
        actionId: 'DISCORD_RECONNECT',
        status: 'SUCCESS',
        message: 'Discord Gateway client connected successfully.',
        correlationId,
        timestamp: new Date().toISOString(),
        details: {
          gatewayState: 'CONNECTED',
          pingMs: diag.pingMs,
          botTag: diag.botTag,
        },
      };
    }

    observabilityService.updateDependencyStatus(
      'discord_gateway',
      'DEGRADED',
      diag.disconnectReason || 'Gateway failed to reach CONNECTED state'
    );

    return {
      actionId: 'DISCORD_RECONNECT',
      status: 'FAILED',
      message: `Discord Gateway connection failed: ${diag.disconnectReason || currentState}`,
      correlationId,
      timestamp: new Date().toISOString(),
      details: {
        gatewayState: currentState,
        disconnectReason: diag.disconnectReason,
      },
    };
  }

  /**
   * Scheduler Worker Restart
   */
  private async handleSchedulerRestart(correlationId: string): Promise<OperationalActionResult> {
    logger.info(`[OperationalRecovery] [${correlationId}] Restarting scheduler worker...`);
    schedulerWorker.stop();
    schedulerWorker.start();
    observabilityService.recordSchedulerHeartbeat();

    const heartbeatInfo = observabilityService.getSchedulerHeartbeatStatus();
    return {
      actionId: 'SCHEDULER_RESTART',
      status: 'SUCCESS',
      message: 'Background scheduler worker stopped and restarted cleanly.',
      correlationId,
      timestamp: new Date().toISOString(),
      details: {
        schedulerState: heartbeatInfo.state,
        lastHeartbeatAt: heartbeatInfo.lastHeartbeatAt,
      },
    };
  }

  /**
   * Scheduler State Reconciliation
   */
  private async handleSchedulerReconcile(correlationId: string): Promise<OperationalActionResult> {
    logger.info(`[OperationalRecovery] [${correlationId}] Reconciling scheduler state...`);
    const allSchedules = await schedulesRepository.list();
    const allJobs = await scheduledJobsRepository.list();

    const nowIso = new Date().toISOString();
    const activeSchedules = allSchedules.filter((s) => s.status === 'ACTIVE');
    const pendingDueSchedules = activeSchedules.filter((s) => s.nextExecutionAt && s.nextExecutionAt <= nowIso);
    const failedJobs = allJobs.filter((j) => j.lastStatus === 'FAILURE');
    const runningJobs = allJobs.filter((j) => j.lastStatus === 'RUNNING');

    observabilityService.recordSchedulerHeartbeat();
    const heartbeatInfo = observabilityService.getSchedulerHeartbeatStatus();

    return {
      actionId: 'SCHEDULER_RECONCILE',
      status: 'SUCCESS',
      message: 'Scheduler durable state reconciled without modifying active job configurations.',
      correlationId,
      timestamp: new Date().toISOString(),
      details: {
        totalSchedules: allSchedules.length,
        activeSchedules: activeSchedules.length,
        pendingDueSchedules: pendingDueSchedules.length,
        runningJobsCount: runningJobs.length,
        failedJobsCount: failedJobs.length,
        schedulerState: heartbeatInfo.state,
        lastHeartbeatAt: heartbeatInfo.lastHeartbeatAt,
      },
    };
  }

  /**
   * Firestore Readiness Recheck
   */
  private async handleFirestoreReadinessRecheck(correlationId: string): Promise<OperationalActionResult> {
    logger.info(`[OperationalRecovery] [${correlationId}] Executing Firestore readiness check...`);
    const dbCheck = await checkFirestoreReadiness();
    const isReal = isRealPersistenceMode();

    observabilityService.updateDependencyStatus(
      'database',
      dbCheck.isReady ? 'HEALTHY' : 'UNAVAILABLE',
      dbCheck.isReady ? 'Persistent Firestore collection check passed.' : `Readiness check failed: ${dbCheck.error}`
    );

    return {
      actionId: 'FIRESTORE_READINESS_RECHECK',
      status: dbCheck.isReady ? 'SUCCESS' : 'FAILED',
      message: dbCheck.isReady
        ? 'Authoritative Firestore database readiness verified.'
        : `Firestore database check failed: ${dbCheck.error}`,
      correlationId,
      timestamp: new Date().toISOString(),
      details: {
        isReady: dbCheck.isReady,
        mode: isReal ? 'REAL_FIRESTORE' : 'SAFE_TRANSIENT_MEMORY',
        error: dbCheck.error,
      },
    };
  }

  /**
   * System Health Recheck
   */
  private async handleHealthRecheck(correlationId: string): Promise<OperationalActionResult> {
    logger.info(`[OperationalRecovery] [${correlationId}] Executing comprehensive health recheck...`);
    const detected = await observabilityService.detectAlertConditions();
    const overview = await observabilityService.getSystemHealthOverview();

    return {
      actionId: 'HEALTH_RECHECK',
      status: 'SUCCESS',
      message: 'Authoritative system health overview and alert condition scan completed.',
      correlationId,
      timestamp: new Date().toISOString(),
      details: {
        systemStatus: overview.status,
        activeIncidentsCount: overview.metrics.activeIncidents,
        newAlertsDetected: detected.length,
        totalRequests: overview.metrics.totalRequests,
        errorRatePercent: overview.metrics.errorRatePercent,
      },
    };
  }

  /**
   * Clear Stale Operational Lock safely
   */
  private async handleClearStaleLock(lockId?: string, correlationId: string = ''): Promise<OperationalActionResult> {
    if (!lockId || typeof lockId !== 'string' || !lockId.trim()) {
      return {
        actionId: 'CLEAR_STALE_OPERATIONAL_LOCK',
        status: 'FAILED',
        message: 'Parameter "lockId" is required to inspect and clear a stale lock.',
        correlationId,
        timestamp: new Date().toISOString(),
      };
    }

    const cleanLockId = lockId.trim();
    const lock = await durableLocksRepository.getById(cleanLockId);

    if (!lock) {
      return {
        actionId: 'CLEAR_STALE_OPERATIONAL_LOCK',
        status: 'LOCK_NOT_FOUND',
        message: `Lock "${cleanLockId}" was not found (already expired or released).`,
        correlationId,
        timestamp: new Date().toISOString(),
        details: { lockId: cleanLockId },
      };
    }

    const expiresAtMs = new Date(lock.expiresAt).getTime();
    const nowMs = Date.now();
    const isExpired = expiresAtMs <= nowMs;

    if (!isExpired) {
      return {
        actionId: 'CLEAR_STALE_OPERATIONAL_LOCK',
        status: 'LOCK_ACTIVE_NOT_STALE',
        message: `Lock "${cleanLockId}" is currently ACTIVE until ${lock.expiresAt}. It cannot be cleared while valid.`,
        correlationId,
        timestamp: new Date().toISOString(),
        details: {
          lockId: cleanLockId,
          expiresAt: lock.expiresAt,
          acquiredAt: lock.acquiredAt,
        },
      };
    }

    // Safely delete expired lock
    await durableLocksRepository.delete(cleanLockId);
    logger.info(`[OperationalRecovery] [${correlationId}] Safely deleted stale lock "${cleanLockId}".`);

    return {
      actionId: 'CLEAR_STALE_OPERATIONAL_LOCK',
      status: 'SUCCESS',
      message: `Stale lock "${cleanLockId}" (expired at ${lock.expiresAt}) has been safely cleared.`,
      correlationId,
      timestamp: new Date().toISOString(),
      details: {
        lockId: cleanLockId,
        acquiredAt: lock.acquiredAt,
        expiredAt: lock.expiresAt,
      },
    };
  }

  /**
   * Safe audit recorder with secrets scrubbing
   */
  private async recordAudit(
    actorUserId: string,
    actionId: string,
    result: OperationalActionResult,
    correlationId: string,
    parameters?: Record<string, any>
  ): Promise<void> {
    try {
      await auditService.log({
        communityId: 'SYSTEM',
        actorUserId: actorUserId || 'SYSTEM_OPERATOR',
        actorRole: 'OWNER',
        action: `OPERATIONAL_RECOVERY_${actionId}` as any,
        targetType: 'SYSTEM' as any,
        targetId: actionId,
        metadata: {
          status: result.status,
          correlationId,
          summary: result.message,
          parameters: sanitizeObject(parameters),
          executionId: result.executionId,
          incidentId: result.incidentId,
        },
      });
    } catch {
      // Non-blocking
    }
  }

  /**
   * History recorder with ring buffer cap
   */
  private pushHistory(
    actorUserId: string,
    actionId: string,
    result: OperationalActionResult,
    correlationId: string,
    executionId?: string,
    incidentId?: string,
    executionState?: OperationalExecutionState
  ): void {
    const entry: OperationalActionHistoryEntry = {
      id: executionId || `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      actionId,
      actorUserId,
      status: result.status,
      correlationId,
      timestamp: result.timestamp,
      summary: result.message,
      details: result.details,
      incidentId,
      executionState,
    };

    this.executionHistory.unshift(entry);
    if (this.executionHistory.length > this.MAX_HISTORY) {
      this.executionHistory.pop();
    }
  }
}

export const operationalRecoveryService = new OperationalRecoveryService();
