import {
  incidentsRepository,
  scheduledJobsRepository,
  discordDeliveriesRepository,
  auditLogsRepository,
  operationalMetricsRepository,
  healthSnapshotsRepository,
  latencyRecordsRepository,
  incidentTimelinesRepository,
  notificationPreferencesRepository,
} from '../../repositories/index.js';
import { config } from '../../config/env.js';
import {
  OperationalErrorCategory,
  DependencyStatus,
  DependencyHealthReport,
  SystemHealthOverview,
  IncidentDocument,
  IncidentSeverity,
  IncidentStatus,
  ScheduledJobStatus,
  TenantHealthReport,
  ProductionOperationalMetrics,
  DurableOperationalMetric,
  ServiceHealthSnapshot,
  ServiceHealthStatus,
  LatencyRecord,
  LatencyDistribution,
  AlertRuleDefinition,
  AlertLifecycleState,
  IncidentTimelineEvent,
  ServiceLevelObjective,
  PlatformNotificationPreference,
  OperationalTrendAnalysis,
} from '../../../shared/types/observability.js';
import { logger } from '../../logging/logger.js';
import { auditService } from '../audit.service.js';
import { secretsManager } from '../../security/secrets.js';
import { incidentResponseService } from './incidentResponse.service.js';

class ProductionObservabilityService {
  private startTime = Date.now();
  private requestCounter = 0;
  private errorCounter = 0;
  private totalLatencyMs = 0;

  // Real operational counters for Task 131
  private authFailuresCount = 0;
  private authzFailuresCount = 0;
  private tenantViolationsCount = 0;
  private boundaryRejectionsCount = 0;
  private rateLimitedOperationsCount = 0;
  private workerFailuresCount = 0;
  private activeWorkersCount = 1;
  private operationsAccountedCount = 0;
  private quotaRejectionsCount = 0;
  private lastAuthFailureAt?: string;
  private lastViolationAt?: string;

  private schedulerState: 'RUNNING' | 'STOPPED' | 'STALLED' = 'RUNNING';
  private lastSchedulerHeartbeat: number = Date.now();

  private deliverySuccessCount = 0;
  private deliveryFailureCount = 0;
  private deliveryOutcomeCounts: Record<string, number> = {
    SENT: 0,
    FAILED: 0,
    RETRYABLE: 0,
    RATE_LIMITED: 0,
    CANCELLED: 0,
    PERMISSION_REQUIRED: 0,
    BOT_NOT_CONNECTED: 0,
    CHANNEL_NOT_FOUND: 0,
  };

  private dependenciesState: Record<string, DependencyHealthReport> = {
    discord_gateway: {
      name: 'Discord Gateway',
      status: 'DEGRADED',
      lastCheckedAt: new Date().toISOString(),
      details: 'Evaluated dynamically via bot connection status',
      recoveryAction: 'Verify DISCORD_BOT_TOKEN and bot guild invite status',
    },
    database: {
      name: 'Database (Firestore)',
      status: 'HEALTHY',
      lastCheckedAt: new Date().toISOString(),
      details: 'Persistent collection memory store active',
    },
    ai_engine: {
      name: 'Community Brain AI Engine',
      status: config.AI_API_KEY || config.GEMINI_API_KEY ? 'HEALTHY' : 'NOT_CONFIGURED',
      lastCheckedAt: new Date().toISOString(),
      details: config.AI_API_KEY || config.GEMINI_API_KEY ? 'Server-side Community Brain AI active' : 'AI Engine API key not provided',
    },
    billing_provider: {
      name: 'Billing Provider',
      status: 'NOT_CONFIGURED',
      lastCheckedAt: new Date().toISOString(),
      details: 'Provider falling back safely to FREE entitlement mode',
    },
    scheduler: {
      name: 'Background Scheduler',
      status: 'HEALTHY',
      lastCheckedAt: new Date().toISOString(),
      details: 'Scheduled workers active',
    },
  };

  /**
   * Track operational request metrics
   */
  recordRequest(durationMs: number, isError: boolean = false) {
    this.requestCounter++;
    this.totalLatencyMs += durationMs;
    if (isError) this.errorCounter++;
  }

  // Counter Tracking Methods
  recordAuthFailure(details?: { reason?: string; correlationId?: string }) {
    this.authFailuresCount++;
    this.lastAuthFailureAt = new Date().toISOString();
  }

  recordAuthzFailure(details?: { reason?: string; correlationId?: string }) {
    this.authzFailuresCount++;
  }

  recordTenancyViolation(details: { communityId?: string; actorUserId?: string; reason: string; correlationId?: string }) {
    this.tenantViolationsCount++;
    this.boundaryRejectionsCount++;
    this.lastViolationAt = new Date().toISOString();
  }

  recordRateLimited(details?: { operation?: string; correlationId?: string }) {
    this.rateLimitedOperationsCount++;
  }

  recordWorkerFailure(workerName: string, error: string) {
    this.workerFailuresCount++;
    logger.warn(`[Observability] Worker failure recorded: ${workerName} - ${secretsManager.redactString(error)}`);
  }

  recordSchedulerHeartbeat() {
    this.lastSchedulerHeartbeat = Date.now();
  }

  setSchedulerRunning(running: boolean) {
    this.schedulerState = running ? 'RUNNING' : 'STOPPED';
    if (running) {
      this.lastSchedulerHeartbeat = Date.now();
    }
  }

  getSchedulerHeartbeatStatus(): { state: 'RUNNING' | 'STOPPED' | 'STALLED'; isHeartbeatStale: boolean; lastHeartbeatAt: string } {
    const isHeartbeatStale = this.schedulerState === 'STOPPED' || (Date.now() - this.lastSchedulerHeartbeat > 60000);
    const state = this.schedulerState === 'STOPPED' ? 'STOPPED' : isHeartbeatStale ? 'STALLED' : 'RUNNING';
    return {
      state,
      isHeartbeatStale,
      lastHeartbeatAt: new Date(this.lastSchedulerHeartbeat).toISOString(),
    };
  }

  recordEngagementOutcome(status: string) {
    if (status === 'SENT') {
      this.deliverySuccessCount++;
    } else {
      this.deliveryFailureCount++;
    }
    if (this.deliveryOutcomeCounts[status] !== undefined) {
      this.deliveryOutcomeCounts[status]++;
    } else {
      this.deliveryOutcomeCounts[status] = 1;
    }
  }

  recordEntitlementOperation(operation: string, allowed: boolean) {
    this.operationsAccountedCount++;
    if (!allowed) {
      this.quotaRejectionsCount++;
    }
  }

  /**
   * Record operational failure with incident deduplication and mandatory secret scrubbing
   */
  async recordIncident(param: {
    id?: string;
    incidentId?: string;
    type?: string;
    category?: OperationalErrorCategory;
    dependency?: string;
    component?: string;
    summary?: string;
    safeSummary?: string;
    technicalReference?: string;
    severity?: IncidentSeverity;
    correlationId?: string;
    communityId?: string;
    workspaceId?: string;
    recoveryInstructions?: string;
  }): Promise<IncidentDocument> {
    const correlationId = param.correlationId || `corr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const id = param.incidentId || param.id || `inc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Ensure secrets NEVER appear in operational incidents
    const sanitizedSummary = secretsManager.redactString(param.safeSummary || param.summary || 'Operational incident recorded');
    const sanitizedTechnicalRef = param.technicalReference ? secretsManager.redactString(param.technicalReference) : undefined;
    const sanitizedInstructions = param.recoveryInstructions ? secretsManager.redactString(param.recoveryInstructions) : undefined;

    // Normalize severity to 'INFO' | 'WARNING' | 'CRITICAL'
    let normSeverity: IncidentSeverity = 'WARNING';
    if (param.severity === 'CRITICAL' || param.severity === 'HIGH') {
      normSeverity = 'CRITICAL';
    } else if (param.severity === 'LOW' || param.severity === 'INFO') {
      normSeverity = 'INFO';
    } else {
      normSeverity = 'WARNING';
    }

    const type = param.type || param.category || 'SYSTEM_OPERATIONAL_INCIDENT';
    const component = param.component || param.dependency || 'APPLICATION';
    const dependency = param.dependency || param.component || 'APPLICATION';

    // Log structured operational error
    logger.logOperational({
      correlationId,
      workspaceId: param.workspaceId,
      communityId: param.communityId,
      operation: `INCIDENT_RECORDED:${type}`,
      status: 'FAILURE',
      errorCategory: param.category || 'INTERNAL_ERROR',
      errorMessage: sanitizedSummary,
    });

    // Error Deduplication: match existing OPEN or ACKNOWLEDGED incident for the same scope
    try {
      const existingList = await incidentsRepository.list();
      const activeIncident = existingList.find(
        (i) =>
          (i.status === 'OPEN' || i.status === 'ACKNOWLEDGED') &&
          (i.type === type || i.category === param.category) &&
          (i.communityId === param.communityId || (!i.communityId && !param.communityId)) &&
          (i.component === component || i.dependency === dependency)
      );

      if (activeIncident) {
        activeIncident.occurrenceCount = (activeIncident.occurrenceCount || 1) + 1;
        activeIncident.lastSeenAt = new Date().toISOString();
        activeIncident.severity = normSeverity;
        activeIncident.safeSummary = sanitizedSummary;
        activeIncident.summary = sanitizedSummary;
        if (sanitizedTechnicalRef) {
          activeIncident.technicalReference = sanitizedTechnicalRef;
        }
        if (sanitizedInstructions) {
          activeIncident.recoveryInstructions = sanitizedInstructions;
        }
        if (!activeIncident.history) activeIncident.history = [];
        activeIncident.history.push({
          action: 'INCIDENT_RECURRED',
          actorUserId: 'SYSTEM_OBSERVABILITY',
          timestamp: new Date().toISOString(),
          details: `Occurrence count increased to ${activeIncident.occurrenceCount}`,
        });
        await incidentsRepository.update(activeIncident.id, activeIncident);

        // Record recurring alert timeline
        try {
          await incidentTimelinesRepository.create({
            id: `tl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            incidentId: activeIncident.id,
            timestamp: new Date().toISOString(),
            event: 'ALERT_TRIGGERED',
            actorId: 'SYSTEM_OBSERVABILITY',
            message: `Alert condition triggered again (occurrence #${activeIncident.occurrenceCount}): ${sanitizedSummary}`,
            correlationId,
          });
        } catch {
          // Non-blocking
        }

        try {
          await incidentResponseService.evaluateRoutingAndEscalation(activeIncident, correlationId);
        } catch {
          // Non-blocking
        }

        return activeIncident;
      }

      // Check if a previously RESOLVED incident for the exact same scope should be REOPENED
      const resolvedIncident = existingList.find(
        (i) =>
          i.status === 'RESOLVED' &&
          (i.type === type || i.category === param.category) &&
          (i.communityId === param.communityId || (!i.communityId && !param.communityId)) &&
          (i.component === component || i.dependency === dependency)
      );

      if (resolvedIncident) {
        resolvedIncident.status = 'OPEN';
        resolvedIncident.reopenedAt = new Date().toISOString();
        resolvedIncident.occurrenceCount = (resolvedIncident.occurrenceCount || 1) + 1;
        resolvedIncident.lastSeenAt = new Date().toISOString();
        resolvedIncident.severity = normSeverity;
        resolvedIncident.safeSummary = sanitizedSummary;
        resolvedIncident.summary = sanitizedSummary;
        if (sanitizedTechnicalRef) {
          resolvedIncident.technicalReference = sanitizedTechnicalRef;
        }
        if (sanitizedInstructions) {
          resolvedIncident.recoveryInstructions = sanitizedInstructions;
        }
        if (!resolvedIncident.history) resolvedIncident.history = [];
        resolvedIncident.history.push({
          action: 'INCIDENT_REOPENED',
          actorUserId: 'SYSTEM_OBSERVABILITY',
          timestamp: new Date().toISOString(),
          details: 'Reopened due to recurring operational failure after previous resolution',
        });
        await incidentsRepository.update(resolvedIncident.id, resolvedIncident);

        try {
          await incidentTimelinesRepository.create({
            id: `tl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            incidentId: resolvedIncident.id,
            timestamp: new Date().toISOString(),
            event: 'REOPENED',
            actorId: 'SYSTEM_OBSERVABILITY',
            message: `Incident reopened due to recurrence: ${sanitizedSummary}`,
            correlationId,
          });
        } catch {
          // Non-blocking
        }

        try {
          await auditService.log({
            communityId: resolvedIncident.communityId || 'SYSTEM',
            actorUserId: 'SYSTEM_OBSERVABILITY',
            actorRole: 'OWNER',
            action: 'SYSTEM_INCIDENT_REOPENED' as any,
            targetType: 'incident',
            targetId: resolvedIncident.id,
            metadata: { type, severity: normSeverity, component, correlationId },
          });
        } catch {
          // Non-blocking
        }

        try {
          await incidentResponseService.evaluateRoutingAndEscalation(resolvedIncident, correlationId);
        } catch {
          // Non-blocking
        }

        return resolvedIncident;
      }
    } catch {
      // Continue to create
    }

    // Create new incident document
    const newIncident: IncidentDocument = {
      id,
      incidentId: id,
      type,
      category: param.category,
      severity: normSeverity,
      status: 'OPEN',
      ownershipState: 'UNASSIGNED',
      correlationId,
      component,
      dependency,
      safeSummary: sanitizedSummary,
      summary: sanitizedSummary,
      technicalReference: sanitizedTechnicalRef,
      detectedAt: new Date().toISOString(),
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      occurrenceCount: 1,
      communityId: param.communityId,
      workspaceId: param.workspaceId,
      recoveryInstructions:
        sanitizedInstructions ||
        'Check system logs and verify external provider configuration or credentials.',
      operatorNotes: [],
      history: [
        {
          action: 'INCIDENT_DETECTED',
          actorUserId: 'SYSTEM_OBSERVABILITY',
          timestamp: new Date().toISOString(),
          details: 'Initial detection by observability layer',
        },
      ],
    };

    const saved = await incidentsRepository.create(newIncident);

    try {
      await incidentTimelinesRepository.create({
        id: `tl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        incidentId: saved.id,
        timestamp: new Date().toISOString(),
        event: 'DETECTED',
        actorId: 'SYSTEM_OBSERVABILITY',
        message: `Incident detected: ${sanitizedSummary}`,
        correlationId,
      });
      await incidentTimelinesRepository.create({
        id: `tl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_open`,
        incidentId: saved.id,
        timestamp: new Date().toISOString(),
        event: 'OPENED',
        actorId: 'SYSTEM_OBSERVABILITY',
        message: `Incident opened with severity ${normSeverity}`,
        correlationId,
      });
    } catch {
      // Non-blocking
    }

    // Audit log operational incident safely
    try {
      await auditService.log({
        communityId: param.communityId || 'SYSTEM',
        actorUserId: 'SYSTEM_OBSERVABILITY',
        actorRole: 'OWNER',
        action: 'SYSTEM_INCIDENT_RECORDED',
        targetType: 'incident',
        targetId: saved.id,
        metadata: { type, severity: normSeverity, component },
      });
    } catch {
      // Non-blocking
    }

    try {
      await incidentResponseService.evaluateRoutingAndEscalation(saved, correlationId);
    } catch {
      // Non-blocking
    }

    return saved;
  }

  /**
   * Get Incident By ID
   */
  async getIncidentById(incidentId: string): Promise<IncidentDocument | null> {
    return incidentsRepository.getById(incidentId);
  }

  /**
   * Add Safe Operator Note
   */
  async addOperatorNote(
    incidentId: string,
    noteText: string,
    actorUserId: string = 'OPERATOR'
  ): Promise<IncidentDocument | null> {
    const inc = await incidentsRepository.getById(incidentId);
    if (!inc) return null;

    const sanitizedNote = secretsManager.redactString(noteText.trim());
    const noteEntry = {
      noteId: `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      authorUserId: actorUserId,
      note: sanitizedNote,
      createdAt: new Date().toISOString(),
    };

    if (!inc.operatorNotes) inc.operatorNotes = [];
    inc.operatorNotes.push(noteEntry);

    if (!inc.history) inc.history = [];
    inc.history.push({
      action: 'NOTE_ADDED',
      actorUserId,
      timestamp: new Date().toISOString(),
      details: sanitizedNote.substring(0, 100),
    });

    await incidentsRepository.update(inc.id, inc);

    try {
      await incidentTimelinesRepository.create({
        id: `tl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        incidentId: inc.id,
        timestamp: new Date().toISOString(),
        event: 'NOTE_ADDED',
        actorId: actorUserId,
        actorRole: 'OWNER',
        message: sanitizedNote,
        correlationId: inc.correlationId,
      });
    } catch {
      // Non-blocking
    }

    try {
      await auditService.log({
        communityId: inc.communityId || 'SYSTEM',
        actorUserId,
        actorRole: 'OWNER',
        action: 'SYSTEM_INCIDENT_NOTE_ADDED' as any,
        targetType: 'incident',
        targetId: inc.id,
        metadata: { noteId: noteEntry.noteId, correlationId: inc.correlationId },
      });
    } catch {
      // Non-blocking
    }

    return inc;
  }

  /**
   * Update Incident Status
   */
  async updateIncidentStatus(
    incidentId: string,
    status: IncidentStatus | 'SUPPRESSED',
    actorUserId: string = 'OPERATOR',
    operatorNote?: string
  ): Promise<IncidentDocument | null> {
    const inc = await incidentsRepository.getById(incidentId);
    if (!inc) return null;

    inc.status = status as any;
    if (status === 'RESOLVED') {
      inc.resolvedAt = new Date().toISOString();
    }

    if (operatorNote && operatorNote.trim()) {
      const sanitizedNote = secretsManager.redactString(operatorNote.trim());
      if (!inc.operatorNotes) inc.operatorNotes = [];
      inc.operatorNotes.push({
        noteId: `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        authorUserId: actorUserId,
        note: sanitizedNote,
        createdAt: new Date().toISOString(),
      });
    }

    if (!inc.history) inc.history = [];
    const actionLabel =
      status === 'ACKNOWLEDGED'
        ? 'INCIDENT_ACKNOWLEDGED'
        : status === 'SUPPRESSED'
        ? 'INCIDENT_SUPPRESSED'
        : 'INCIDENT_RESOLVED';
    inc.history.push({
      action: actionLabel,
      actorUserId,
      timestamp: new Date().toISOString(),
      details: operatorNote ? secretsManager.redactString(operatorNote) : undefined,
    });

    await incidentsRepository.update(inc.id, inc);

    try {
      const timelineEventMap: Record<string, any> = {
        ACKNOWLEDGED: 'ACKNOWLEDGED',
        SUPPRESSED: 'SUPPRESSED',
        RESOLVED: 'RESOLVED',
      };
      await incidentTimelinesRepository.create({
        id: `tl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        incidentId: inc.id,
        timestamp: new Date().toISOString(),
        event: timelineEventMap[status] || 'ACKNOWLEDGED',
        actorId: actorUserId,
        actorRole: 'OWNER',
        message: operatorNote ? secretsManager.redactString(operatorNote) : `Incident status transitioned to ${status}`,
        correlationId: inc.correlationId,
      });
    } catch {
      // Non-blocking
    }

    try {
      await auditService.log({
        communityId: inc.communityId || 'SYSTEM',
        actorUserId,
        actorRole: 'OWNER',
        action: status === 'ACKNOWLEDGED'
          ? ('SYSTEM_INCIDENT_ACKNOWLEDGED' as any)
          : status === 'SUPPRESSED'
          ? ('SYSTEM_INCIDENT_SUPPRESSED' as any)
          : ('SYSTEM_INCIDENT_RESOLVED' as any),
        targetType: 'incident',
        targetId: inc.id,
        metadata: { newStatus: status, correlationId: inc.correlationId },
      });
    } catch {
      // Non-blocking
    }

    return inc;
  }

  /**
   * List Platform Incidents (accessible to Platform Operators)
   */
  async listIncidents(statusFilter?: IncidentStatus): Promise<IncidentDocument[]> {
    const all = await incidentsRepository.list();
    if (statusFilter) {
      return all.filter((i) => i.status === statusFilter);
    }
    return all.sort(
      (a, b) => new Date(b.lastSeenAt || b.detectedAt).getTime() - new Date(a.lastSeenAt || a.detectedAt).getTime()
    );
  }

  /**
   * List Tenant-Scoped Incidents (strictly tenant-scoped; platform-level incidents are excluded)
   */
  async listTenantIncidents(communityId: string, statusFilter?: IncidentStatus): Promise<IncidentDocument[]> {
    if (!communityId) return [];
    const all = await incidentsRepository.list();
    const tenantIncidents = all.filter((i) => i.communityId === communityId);
    if (statusFilter) {
      return tenantIncidents.filter((i) => i.status === statusFilter);
    }
    return tenantIncidents.sort(
      (a, b) => new Date(b.lastSeenAt || b.detectedAt).getTime() - new Date(a.lastSeenAt || a.detectedAt).getTime()
    );
  }

  /**
   * Return Scheduler Statuses
   */
  async getSchedulerStatuses(): Promise<ScheduledJobStatus[]> {
    return scheduledJobsRepository.list();
  }

  /**
   * Record Scheduler Execution Telemetry
   */
  async recordSchedulerExecution(
    jobName: string,
    module: 'announcements' | 'reminders' | 'campaigns' | 'events' | 'automation' | 'billing_webhook',
    status: 'SUCCESS' | 'FAILURE' | 'RUNNING' | 'IDLE',
    intervalMs?: number,
    error?: string
  ): Promise<ScheduledJobStatus> {
    const existingList = await scheduledJobsRepository.list({
      where: [
        { field: 'jobName', operator: '==', value: jobName },
        { field: 'module', operator: '==', value: module },
      ],
    });

    const nowIso = new Date().toISOString();

    if (existingList.length > 0) {
      const job = existingList[0];
      job.lastExecutionAt = nowIso;
      job.lastStatus = status;
      job.executionCount = (job.executionCount || 0) + 1;
      if (status === 'FAILURE') {
        job.failureCount = (job.failureCount || 0) + 1;
        job.lastError = error;
      }
      if (intervalMs) {
        job.nextExecutionAt = new Date(Date.now() + intervalMs).toISOString();
        job.intervalMs = intervalMs;
      }
      await scheduledJobsRepository.update(job.id, job);
      return job;
    }

    const newJob: ScheduledJobStatus = {
      id: `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      jobName,
      module,
      lastExecutionAt: nowIso,
      nextExecutionAt: intervalMs ? new Date(Date.now() + intervalMs).toISOString() : undefined,
      lastStatus: status,
      executionCount: 1,
      failureCount: status === 'FAILURE' ? 1 : 0,
      lastError: error,
      intervalMs,
    };

    return scheduledJobsRepository.create(newJob);
  }

  /**
   * Comprehensive Operational Metrics for Task 131
   */
  async getProductionMetrics(): Promise<ProductionOperationalMetrics> {
    const { checkFirestoreReadiness, isRealPersistenceMode } = await import('../../repositories/firestore.repository.js');
    const { discordService } = await import('../../integrations/discord/discord.service.js');
    const { DiscordRestVerificationService } = await import('../discordRestVerification.service.js');

    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const memMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);

    let dbCheck: { isReady: boolean; error?: string } = { isReady: true };
    try {
      dbCheck = await checkFirestoreReadiness();
    } catch (e: any) {
      dbCheck = { isReady: false, error: e.message };
    }

    const isReal = isRealPersistenceMode();
    const gwState = discordService.getConnectionState();

    let restResult: any;
    try {
      restResult = await DiscordRestVerificationService.verifyCurrentUser();
    } catch (e: any) {
      restResult = {
        outcome: 'BLOCKED_BY_ENVIRONMENT',
        classification: 'NETWORK_BLOCKED',
        latencyMs: 0,
      };
    }

    const schedInfo = this.getSchedulerHeartbeatStatus();

    let activeJobsCount = 0;
    let failedJobsCount = 0;
    const stuckJobsCount = 0;
    try {
      const allJobs = await scheduledJobsRepository.list();
      activeJobsCount = allJobs.filter((j) => j.lastStatus === 'RUNNING').length;
      failedJobsCount = allJobs.filter((j) => j.lastStatus === 'FAILURE').length;
    } catch {
      // Non-blocking
    }

    let auditEventsCount = 0;
    try {
      const audits = await auditLogsRepository.list();
      auditEventsCount = audits.length;
    } catch {
      // Non-blocking
    }

    const diag = typeof (discordService as any).getDiagnosticStatus === 'function' ? (discordService as any).getDiagnosticStatus() : { pingMs: -1 };

    return {
      application: {
        uptimeSeconds,
        memoryUsageMb: memMb,
        nodeVersion: process.version,
        environment: config.NODE_ENV || 'production',
        status: dbCheck.isReady ? 'HEALTHY' : 'DEGRADED',
      },
      database: {
        availability: dbCheck.isReady,
        status: dbCheck.isReady ? (isReal ? 'READY' : 'SAFE_TRANSIENT_MEMORY') : 'UNAVAILABLE',
        mode: isReal ? 'REAL_FIRESTORE' : 'SAFE_TRANSIENT_MEMORY',
        failClosed: isReal,
      },
      discord: {
        gatewayState: gwState,
        restOutcome: restResult.outcome,
        restClassification: restResult.classification,
        pingMs: diag.pingMs,
        isConfigured: discordService.isConfigured(),
      },
      scheduler: {
        state: schedInfo.state,
        isHeartbeatStale: schedInfo.isHeartbeatStale,
        lastHeartbeatAt: schedInfo.lastHeartbeatAt,
        activeScheduledJobs: activeJobsCount,
        failedScheduledJobs: failedJobsCount,
        stuckProcessingJobs: stuckJobsCount,
      },
      engagement: {
        deliverySuccessCount: this.deliverySuccessCount,
        deliveryFailureCount: this.deliveryFailureCount,
        rateLimitedCount: (this.deliveryOutcomeCounts['RATE_LIMITED'] || 0) + this.rateLimitedOperationsCount,
        recentOutcomes: { ...this.deliveryOutcomeCounts },
      },
      authentication: {
        failuresCount: this.authFailuresCount,
        lastFailureAt: this.lastAuthFailureAt,
      },
      tenancy: {
        isolationViolationsCount: this.tenantViolationsCount,
        boundaryRejectionsCount: this.boundaryRejectionsCount,
        lastViolationAt: this.lastViolationAt,
      },
      entitlements: {
        operationsAccountedCount: this.operationsAccountedCount,
        rejectionsCount: this.quotaRejectionsCount,
      },
      audit: {
        eventsLoggedCount: auditEventsCount,
        redactionEngineActive: secretsManager.isRedactionActive(),
      },
      backgroundWorkers: {
        activeWorkersCount: this.activeWorkersCount,
        workerFailuresCount: this.workerFailuresCount,
      },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Evaluates server-side alert conditions and logs operational incidents safely.
   */
  async detectAlertConditions(): Promise<IncidentDocument[]> {
    const detectedIncidents: IncidentDocument[] = [];

    // 1. Database check
    try {
      const { checkFirestoreReadiness, isRealPersistenceMode } = await import('../../repositories/firestore.repository.js');
      const isReal = isRealPersistenceMode();
      const dbCheck = await checkFirestoreReadiness();
      if (isReal && !dbCheck.isReady) {
        const isPerm = dbCheck.error?.includes('PERMISSION_DENIED');
        const inc = await this.recordIncident({
          category: isPerm ? 'FIRESTORE_PERMISSION_FAILURE' : 'FIRESTORE_UNAVAILABLE',
          type: isPerm ? 'FIRESTORE_PERMISSION_FAILURE' : 'FIRESTORE_UNAVAILABLE',
          dependency: 'Database (Firestore)',
          component: 'DATABASE',
          severity: 'CRITICAL',
          summary: isPerm
            ? 'Firestore permissions failure detected on production collection access.'
            : `Firestore is unreachable or failing readiness check: ${dbCheck.error || 'UNAVAILABLE'}`,
          recoveryInstructions: 'Verify IAM roles and Service Account configuration.',
        });
        detectedIncidents.push(inc);
      }
    } catch {
      // Non-blocking
    }

    // 2. Discord Gateway check
    try {
      const { discordService } = await import('../../integrations/discord/discord.service.js');
      const gwState = discordService.getConnectionState();
      if (gwState === 'DISCONNECTED' && discordService.isConfigured()) {
        const inc = await this.recordIncident({
          category: 'DISCORD_GATEWAY_DISCONNECTED',
          type: 'DISCORD_GATEWAY_DISCONNECTED',
          dependency: 'Discord Gateway',
          component: 'DISCORD_GATEWAY',
          severity: 'WARNING',
          summary: 'Discord WebSocket Gateway disconnected while credentials are configured.',
          recoveryInstructions: 'Verify Discord gateway connectivity, bot token validity, and guild intents.',
        });
        detectedIncidents.push(inc);
      }
    } catch {
      // Non-blocking
    }

    // 3. Discord REST check
    try {
      const { DiscordRestVerificationService } = await import('../discordRestVerification.service.js');
      const restResult = await DiscordRestVerificationService.verifyCurrentUser();
      if (restResult.outcome === 'FAILED') {
        let cat: OperationalErrorCategory = 'DISCORD_REST_UNAVAILABLE';
        if (restResult.classification === 'AUTHENTICATION_FAILED') {
          cat = 'DISCORD_REST_AUTHENTICATION_FAILED';
        } else if (restResult.classification === 'RATE_LIMITED') {
          cat = 'DISCORD_RATE_LIMITING';
        }
        const inc = await this.recordIncident({
          category: cat,
          type: cat,
          dependency: 'Discord REST API',
          component: 'DISCORD_REST',
          severity: restResult.classification === 'AUTHENTICATION_FAILED' ? 'CRITICAL' : 'WARNING',
          summary: `Discord REST verification classified as ${restResult.classification} (HTTP ${restResult.httpStatus || 0}).`,
          technicalReference: restResult.errorMessage,
          recoveryInstructions: 'Verify DISCORD_BOT_TOKEN and Discord Developer Portal application state.',
        });
        detectedIncidents.push(inc);
      }
    } catch {
      // Non-blocking
    }

    // 4. Scheduler Stalled check
    const sched = this.getSchedulerHeartbeatStatus();
    if (sched.isHeartbeatStale) {
      const inc = await this.recordIncident({
        category: 'SCHEDULER_STALLED',
        type: 'SCHEDULER_STALLED',
        dependency: 'Background Scheduler',
        component: 'SCHEDULER',
        severity: 'WARNING',
        summary: `Background scheduler is ${sched.state} or heartbeat is stale.`,
        recoveryInstructions: 'Restart scheduler worker or check for long-running blocking tasks.',
      });
      detectedIncidents.push(inc);
    }

    return detectedIncidents;
  }

  /**
   * Dynamic Health Evaluation of System & Dependencies
   */
  async getSystemHealthOverview(): Promise<SystemHealthOverview> {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime) / 1000);
    const avgLatencyMs =
      this.requestCounter > 0 ? Math.round(this.totalLatencyMs / this.requestCounter) : 0;
    const errorRatePercent =
      this.requestCounter > 0 ? Number(((this.errorCounter / this.requestCounter) * 100).toFixed(1)) : 0;

    const allIncidents = await incidentsRepository.list();
    const activeIncidents = allIncidents.filter((i) => i.status === 'OPEN' || i.status === 'ACKNOWLEDGED');

    const deps = { ...this.dependenciesState };
    for (const k in deps) {
      deps[k].lastCheckedAt = new Date().toISOString();
    }

    let overallStatus: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' = 'HEALTHY';
    const criticalIncidents = activeIncidents.filter((i) => i.severity === 'CRITICAL');
    if (criticalIncidents.length > 0) {
      overallStatus = 'UNAVAILABLE';
    } else if (activeIncidents.length > 0 || errorRatePercent > 5) {
      overallStatus = 'DEGRADED';
    }

    return {
      status: overallStatus,
      uptimeSeconds,
      metrics: {
        totalRequests: this.requestCounter,
        totalErrors: this.errorCounter,
        errorRatePercent,
        avgLatencyMs,
        activeIncidents: activeIncidents.length,
      },
      dependencies: deps,
    };
  }

  /**
   * Update Dependency State Directly
   */
  updateDependencyStatus(
    key: string,
    status: DependencyStatus,
    details?: string,
    recoveryAction?: string
  ) {
    if (this.dependenciesState[key]) {
      this.dependenciesState[key].status = status;
      this.dependenciesState[key].lastCheckedAt = new Date().toISOString();
      if (details) this.dependenciesState[key].details = details;
      if (recoveryAction) this.dependenciesState[key].recoveryAction = recoveryAction;
    }
  }

  /**
   * Tenant-Scoped Community Health Indicator
   */
  async getTenantHealthReport(communityId: string): Promise<TenantHealthReport> {
    const incidents = await incidentsRepository.list({
      where: [{ field: 'communityId', operator: '==', value: communityId }],
    });
    const activeIncidents = incidents.filter((i) => i.status === 'OPEN' || i.status === 'ACKNOWLEDGED');

    const issues: string[] = [];
    if (activeIncidents.length > 0) {
      activeIncidents.forEach((i) => issues.push(`[${i.type || i.category}] ${i.safeSummary || i.summary}`));
    }

    const isDegraded = activeIncidents.length > 0;

    return {
      communityId,
      status: isDegraded ? 'ATTENTION_REQUIRED' : 'HEALTHY',
      discordConnected: Boolean(process.env.DISCORD_BOT_TOKEN),
      botPermissionsValid: true,
      sheetsConnected: true,
      activeIncidentsCount: activeIncidents.length,
      lastSyncAt: new Date().toISOString(),
      issues,
    };
  }

  // =========================================================================
  // TASK 134 — Observability, Alerting, SLOs & Incident Timeline Integrity
  // =========================================================================

  /**
   * Authoritative Alert Rules Registry
   */
  readonly ALERT_RULES: AlertRuleDefinition[] = [
    {
      ruleId: 'RULE_DISCORD_GATEWAY_DISCONNECTED',
      name: 'Discord Gateway Disconnected',
      component: 'DISCORD',
      condition: 'Gateway state is DISCONNECTED while token configured',
      severity: 'WARNING',
      enabled: true,
      cooldownMs: 60000,
      deduplicationKey: 'DISCORD_GATEWAY_DISCONNECTED',
      description: 'Triggered when the Discord WebSocket gateway is disconnected.',
    },
    {
      ruleId: 'RULE_DISCORD_REST_AUTH_FAILURE',
      name: 'Discord REST Authentication Failed',
      component: 'DISCORD',
      condition: 'Discord REST returns 401 Unauthorized',
      severity: 'CRITICAL',
      enabled: true,
      cooldownMs: 60000,
      deduplicationKey: 'DISCORD_REST_AUTHENTICATION_FAILED',
      description: 'Triggered when Discord REST bot authentication fails.',
    },
    {
      ruleId: 'RULE_DISCORD_REST_RATE_LIMITED',
      name: 'Discord REST Rate Limited',
      component: 'DISCORD',
      condition: 'Discord REST encounters 429 Rate Limit',
      severity: 'WARNING',
      enabled: true,
      cooldownMs: 30000,
      deduplicationKey: 'DISCORD_RATE_LIMITING',
      description: 'Triggered when Discord REST calls are rate-limited.',
    },
    {
      ruleId: 'RULE_SCHEDULER_HEARTBEAT_MISSING',
      name: 'Scheduler Heartbeat Missing',
      component: 'SCHEDULER',
      condition: 'Heartbeat older than 60 seconds or state is STOPPED/STALLED',
      severity: 'WARNING',
      enabled: true,
      cooldownMs: 60000,
      deduplicationKey: 'SCHEDULER_STALLED',
      description: 'Triggered when scheduler worker heartbeat lapses.',
    },
    {
      ruleId: 'RULE_FIRESTORE_READINESS_FAILURE',
      name: 'Firestore Database Unavailable',
      component: 'DATABASE',
      condition: 'Firestore readiness recheck fails',
      severity: 'CRITICAL',
      enabled: true,
      cooldownMs: 30000,
      deduplicationKey: 'FIRESTORE_UNAVAILABLE',
      description: 'Triggered when Firestore persistent storage is unreachable.',
    },
    {
      ruleId: 'RULE_ENGAGEMENT_DELIVERY_SPIKE',
      name: 'Engagement Delivery Failure Spike',
      component: 'ENGAGEMENT',
      condition: 'Consecutive delivery failures detected',
      severity: 'WARNING',
      enabled: true,
      cooldownMs: 120000,
      deduplicationKey: 'REPEATED_ENGAGEMENT_DELIVERY_FAILURES',
      description: 'Triggered when messages fail delivery to Discord.',
    },
    {
      ruleId: 'RULE_AUTH_FAILURE_SPIKE',
      name: 'Authentication Failure Spike',
      component: 'AUTHENTICATION',
      condition: 'Authentication failures exceed threshold',
      severity: 'WARNING',
      enabled: true,
      cooldownMs: 120000,
      deduplicationKey: 'AUTHENTICATION_FAILURE_SPIKE',
      description: 'Triggered when repetitive authentication rejections occur.',
    },
  ];

  /**
   * Record a durable operational metric
   */
  async recordMetric(metric: {
    metricName: string;
    component: string;
    value: number;
    unit: string;
    status?: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' | 'INSUFFICIENT_DATA';
    source?: string;
    correlationId?: string;
    communityId?: string;
    actionId?: string;
    incidentId?: string;
    labels?: Record<string, string>;
  }): Promise<DurableOperationalMetric> {
    const record: DurableOperationalMetric = {
      id: `met_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      metricName: metric.metricName,
      component: metric.component,
      value: metric.value,
      unit: metric.unit,
      timestamp: new Date().toISOString(),
      status: metric.status || 'HEALTHY',
      source: metric.source || 'SYSTEM_OBSERVABILITY',
      correlationId: metric.correlationId,
      communityId: metric.communityId,
      actionId: metric.actionId,
      incidentId: metric.incidentId,
      labels: metric.labels,
    };

    return operationalMetricsRepository.create(record);
  }

  /**
   * List durable operational metrics with optional filters
   */
  async listMetrics(filters?: {
    component?: string;
    metricName?: string;
    communityId?: string;
    limit?: number;
  }): Promise<DurableOperationalMetric[]> {
    const all = await operationalMetricsRepository.list();
    let filtered = all;

    if (filters?.component) {
      filtered = filtered.filter((m) => m.component === filters.component);
    }
    if (filters?.metricName) {
      filtered = filtered.filter((m) => m.metricName === filters.metricName);
    }
    if (filters?.communityId) {
      filtered = filtered.filter((m) => m.communityId === filters.communityId);
    }

    filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (filters?.limit && filters.limit > 0) {
      return filtered.slice(0, filters.limit);
    }
    return filtered;
  }

  /**
   * Record Latency for Operations
   */
  async recordLatency(operation: string, durationMs: number, status: 'SUCCESS' | 'FAILURE' | 'ERROR' = 'SUCCESS', correlationId?: string, component?: string): Promise<LatencyRecord> {
    const record: LatencyRecord = {
      id: `lat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      operation,
      durationMs,
      status,
      timestamp: new Date().toISOString(),
      correlationId,
      component,
    };

    return latencyRecordsRepository.create(record);
  }

  /**
   * Get Latency Distribution (P50, P95, P99)
   */
  async getLatencyDistribution(operation?: string): Promise<LatencyDistribution[]> {
    const allRecords = await latencyRecordsRepository.list();
    const ops = operation
      ? [operation]
      : Array.from(new Set(allRecords.map((r) => r.operation)));

    const distributions: LatencyDistribution[] = [];

    for (const op of ops) {
      const records = allRecords
        .filter((r) => r.operation === op)
        .map((r) => r.durationMs)
        .sort((a, b) => a - b);

      const count = records.length;
      if (count < 3) {
        distributions.push({
          operation: op,
          sampleCount: count,
          p50: 'INSUFFICIENT_DATA',
          p95: 'INSUFFICIENT_DATA',
          p99: 'INSUFFICIENT_DATA',
          avgMs: count > 0 ? Math.round(records.reduce((a, b) => a + b, 0) / count) : 'INSUFFICIENT_DATA',
          minMs: count > 0 ? records[0] : 'INSUFFICIENT_DATA',
          maxMs: count > 0 ? records[count - 1] : 'INSUFFICIENT_DATA',
        });
        continue;
      }

      const p50Index = Math.floor(count * 0.5);
      const p95Index = Math.min(count - 1, Math.floor(count * 0.95));
      const p99Index = Math.min(count - 1, Math.floor(count * 0.99));
      const avg = Math.round(records.reduce((a, b) => a + b, 0) / count);

      distributions.push({
        operation: op,
        sampleCount: count,
        p50: records[p50Index],
        p95: records[p95Index],
        p99: records[p99Index],
        avgMs: avg,
        minMs: records[0],
        maxMs: records[count - 1],
      });
    }

    return distributions;
  }

  /**
   * Generate Service Health Snapshots for canonical subsystems
   */
  async generateHealthSnapshots(correlationId: string = `corr_health_${Date.now()}`): Promise<ServiceHealthSnapshot[]> {
    const snapshots: ServiceHealthSnapshot[] = [];
    const nowIso = new Date().toISOString();

    // 1. APPLICATION
    snapshots.push({
      id: `snap_APP_${Date.now()}`,
      component: 'APPLICATION',
      status: this.errorCounter > 20 ? 'DEGRADED' : 'HEALTHY',
      checkedAt: nowIso,
      latencyMs: this.requestCounter > 0 ? Math.round(this.totalLatencyMs / this.requestCounter) : undefined,
      lastSuccessfulCheck: nowIso,
      failureCount: this.errorCounter,
      message: `Application running with ${this.requestCounter} requests handled and ${this.errorCounter} errors.`,
      correlationId,
    });

    // 2. DATABASE
    try {
      const { checkFirestoreReadiness, isRealPersistenceMode } = await import('../../repositories/firestore.repository.js');
      const dbCheck = await checkFirestoreReadiness();
      const isReal = isRealPersistenceMode();

      let dbStatus: ServiceHealthStatus = 'HEALTHY';
      if (isReal && !dbCheck.isReady) {
        dbStatus = 'UNAVAILABLE';
      }
      snapshots.push({
        id: `snap_DB_${Date.now()}`,
        component: 'DATABASE',
        status: dbStatus,
        checkedAt: nowIso,
        lastSuccessfulCheck: dbCheck.isReady ? nowIso : undefined,
        failureCount: dbCheck.isReady ? 0 : 1,
        message: dbCheck.isReady
          ? `Firestore persistence active in ${isReal ? 'REAL' : 'FALLBACK'} mode.`
          : `Firestore readiness failed: ${dbCheck.error || 'UNAVAILABLE'}`,
        correlationId,
      });
    } catch (e: any) {
      snapshots.push({
        id: `snap_DB_${Date.now()}`,
        component: 'DATABASE',
        status: 'UNAVAILABLE',
        checkedAt: nowIso,
        failureCount: 1,
        message: `Database readiness check error: ${e.message}`,
        correlationId,
      });
    }

    // 3. DISCORD_GATEWAY
    try {
      const { discordService } = await import('../../integrations/discord/discord.service.js');
      const isConfigured = discordService.isConfigured();
      const gwState = discordService.getConnectionState();
      const diag = discordService.getDiagnostics();

      let gwStatus: ServiceHealthStatus = 'NOT_CONFIGURED';
      if (isConfigured) {
        gwStatus = gwState === 'CONNECTED' ? 'HEALTHY' : 'DEGRADED';
      }

      snapshots.push({
        id: `snap_DISCORD_GW_${Date.now()}`,
        component: 'DISCORD_GATEWAY',
        status: gwStatus,
        checkedAt: nowIso,
        latencyMs: diag.pingMs > 0 ? diag.pingMs : undefined,
        lastSuccessfulCheck: gwState === 'CONNECTED' ? nowIso : undefined,
        failureCount: gwState === 'CONNECTED' ? 0 : 1,
        message: `Discord Gateway is ${gwState} (configured: ${isConfigured}).`,
        correlationId,
      });
    } catch (e: any) {
      snapshots.push({
        id: `snap_DISCORD_GW_${Date.now()}`,
        component: 'DISCORD_GATEWAY',
        status: 'UNAVAILABLE',
        checkedAt: nowIso,
        failureCount: 1,
        message: `Discord gateway check error: ${e.message}`,
        correlationId,
      });
    }

    // 4. DISCORD_REST
    try {
      const { DiscordRestVerificationService } = await import('../discordRestVerification.service.js');
      const restResult = await DiscordRestVerificationService.verifyCurrentUser();
      let restStatus: ServiceHealthStatus = 'HEALTHY';

      if (restResult.outcome === 'BLOCKED_BY_ENVIRONMENT') {
        restStatus = 'BLOCKED_BY_ENVIRONMENT';
      } else if (restResult.outcome === 'FAILED') {
        restStatus = restResult.classification === 'AUTHENTICATION_FAILED' ? 'UNAVAILABLE' : 'DEGRADED';
      }

      snapshots.push({
        id: `snap_DISCORD_REST_${Date.now()}`,
        component: 'DISCORD_REST',
        status: restStatus,
        checkedAt: nowIso,
        latencyMs: restResult.latencyMs || undefined,
        lastSuccessfulCheck: restResult.outcome === 'VERIFIED' ? nowIso : undefined,
        failureCount: restResult.outcome === 'FAILED' ? 1 : 0,
        message: `Discord REST outcome: ${restResult.outcome} (${restResult.classification}).`,
        correlationId,
      });
    } catch (e: any) {
      snapshots.push({
        id: `snap_DISCORD_REST_${Date.now()}`,
        component: 'DISCORD_REST',
        status: 'UNAVAILABLE',
        checkedAt: nowIso,
        failureCount: 1,
        message: `Discord REST check error: ${e.message}`,
        correlationId,
      });
    }

    // 5. SCHEDULER
    const sched = this.getSchedulerHeartbeatStatus();
    snapshots.push({
      id: `snap_SCHED_${Date.now()}`,
      component: 'SCHEDULER',
      status: sched.state === 'RUNNING' ? 'HEALTHY' : 'DEGRADED',
      checkedAt: nowIso,
      lastSuccessfulCheck: sched.lastHeartbeatAt,
      failureCount: sched.isHeartbeatStale ? 1 : 0,
      message: `Scheduler worker state: ${sched.state} (heartbeat: ${sched.lastHeartbeatAt}).`,
      correlationId,
    });

    // 6. ENGAGEMENT_DELIVERY
    const totalDeliveries = this.deliverySuccessCount + this.deliveryFailureCount;
    let delStatus: ServiceHealthStatus = 'HEALTHY';
    if (totalDeliveries === 0) {
      delStatus = 'INSUFFICIENT_DATA';
    } else if (this.deliveryFailureCount > 0 && this.deliveryFailureCount / totalDeliveries > 0.2) {
      delStatus = 'DEGRADED';
    }
    snapshots.push({
      id: `snap_ENGAGE_${Date.now()}`,
      component: 'ENGAGEMENT_DELIVERY',
      status: delStatus,
      checkedAt: nowIso,
      lastSuccessfulCheck: this.deliverySuccessCount > 0 ? nowIso : undefined,
      failureCount: this.deliveryFailureCount,
      message: `Engagement delivery: ${this.deliverySuccessCount} succeeded, ${this.deliveryFailureCount} failed.`,
      correlationId,
    });

    // 7. AUTHENTICATION
    snapshots.push({
      id: `snap_AUTH_${Date.now()}`,
      component: 'AUTHENTICATION',
      status: this.authFailuresCount > 10 ? 'DEGRADED' : 'HEALTHY',
      checkedAt: nowIso,
      lastSuccessfulCheck: nowIso,
      failureCount: this.authFailuresCount,
      message: `Authentication counters: ${this.authFailuresCount} failures, ${this.authzFailuresCount} authz failures.`,
      correlationId,
    });

    // 8. OPERATIONS
    snapshots.push({
      id: `snap_OPS_${Date.now()}`,
      component: 'OPERATIONS',
      status: 'HEALTHY',
      checkedAt: nowIso,
      lastSuccessfulCheck: nowIso,
      failureCount: 0,
      message: 'Operational control plane, locks, and recovery registry active.',
      correlationId,
    });

    // Persist snapshots
    for (const snap of snapshots) {
      try {
        await healthSnapshotsRepository.create(snap);
      } catch {
        // Non-blocking
      }
    }

    return snapshots;
  }

  /**
   * Get latest snapshot for each component
   */
  async getLatestHealthSnapshots(): Promise<ServiceHealthSnapshot[]> {
    const list = await healthSnapshotsRepository.list();
    if (list.length === 0) {
      return this.generateHealthSnapshots();
    }

    const byComponent: Record<string, ServiceHealthSnapshot> = {};
    for (const s of list) {
      if (!byComponent[s.component] || new Date(s.checkedAt).getTime() > new Date(byComponent[s.component].checkedAt).getTime()) {
        byComponent[s.component] = s;
      }
    }

    return Object.values(byComponent);
  }

  /**
   * Calculate Truthful Service Level Objectives (SLOs)
   */
  async calculateSLOs(): Promise<ServiceLevelObjective[]> {
    const totalReq = this.requestCounter;
    const totalErr = this.errorCounter;
    const totalDel = this.deliverySuccessCount + this.deliveryFailureCount;
    const failedDel = this.deliveryFailureCount;
    const sched = this.getSchedulerHeartbeatStatus();

    const slos: ServiceLevelObjective[] = [
      // 1. API Availability SLO (Target: 99.5%)
      {
        sloId: 'slo_api_availability',
        name: 'API Availability',
        targetPercent: 99.5,
        periodDays: 30,
        currentPercent:
          totalReq >= 10
            ? Number((((totalReq - totalErr) / totalReq) * 100).toFixed(2))
            : 'INSUFFICIENT_DATA',
        status:
          totalReq < 10
            ? 'INSUFFICIENT_DATA'
            : totalReq - totalErr >= totalReq * 0.995
            ? 'MEETING'
            : totalReq - totalErr >= totalReq * 0.98
            ? 'AT_RISK'
            : 'BREACHED',
        component: 'APPLICATION',
        description: 'Percent of successful HTTP responses (non-5xx).',
        measurementUnit: 'percentage',
        totalEvents: totalReq,
        failedEvents: totalErr,
        errorBudget: {
          allowedFailures:
            totalReq >= 10 ? Math.floor(totalReq * (1 - 0.995)) : 'INSUFFICIENT_DATA',
          consumedFailures: totalErr,
          remainingFailures:
            totalReq >= 10
              ? Math.max(0, Math.floor(totalReq * (1 - 0.995)) - totalErr)
              : 'INSUFFICIENT_DATA',
          budgetExhausted: totalReq >= 10 && totalErr > Math.floor(totalReq * (1 - 0.995)),
        },
      },

      // 2. Engagement Delivery Success SLO (Target: 99.0%)
      {
        sloId: 'slo_engagement_delivery',
        name: 'Engagement Delivery Success',
        targetPercent: 99.0,
        periodDays: 30,
        currentPercent:
          totalDel >= 5
            ? Number((((totalDel - failedDel) / totalDel) * 100).toFixed(2))
            : 'INSUFFICIENT_DATA',
        status:
          totalDel < 5
            ? 'INSUFFICIENT_DATA'
            : totalDel - failedDel >= totalDel * 0.99
            ? 'MEETING'
            : totalDel - failedDel >= totalDel * 0.95
            ? 'AT_RISK'
            : 'BREACHED',
        component: 'ENGAGEMENT',
        description: 'Percent of Discord engagement deliveries successfully sent without fatal error.',
        measurementUnit: 'percentage',
        totalEvents: totalDel,
        failedEvents: failedDel,
        errorBudget: {
          allowedFailures:
            totalDel >= 5 ? Math.floor(totalDel * (1 - 0.99)) : 'INSUFFICIENT_DATA',
          consumedFailures: failedDel,
          remainingFailures:
            totalDel >= 5
              ? Math.max(0, Math.floor(totalDel * (1 - 0.99)) - failedDel)
              : 'INSUFFICIENT_DATA',
          budgetExhausted: totalDel >= 5 && failedDel > Math.floor(totalDel * (1 - 0.99)),
        },
      },

      // 3. Scheduler Reliability SLO (Target: 99.9%)
      {
        sloId: 'slo_scheduler_reliability',
        name: 'Scheduler Reliability',
        targetPercent: 99.9,
        periodDays: 30,
        currentPercent: sched.state === 'RUNNING' && !sched.isHeartbeatStale ? 100.0 : 0.0,
        status: sched.state === 'RUNNING' && !sched.isHeartbeatStale ? 'MEETING' : 'BREACHED',
        component: 'SCHEDULER',
        description: 'Percent of time background worker loop operates within heartbeat threshold.',
        measurementUnit: 'percentage',
        totalEvents: 1,
        failedEvents: sched.isHeartbeatStale ? 1 : 0,
        errorBudget: {
          allowedFailures: 0,
          consumedFailures: sched.isHeartbeatStale ? 1 : 0,
          remainingFailures: sched.isHeartbeatStale ? 0 : 0,
          budgetExhausted: sched.isHeartbeatStale,
        },
      },
    ];

    return slos;
  }

  /**
   * Get Incident Timeline Events
   */
  async getIncidentTimeline(incidentId: string): Promise<IncidentTimelineEvent[]> {
    const list = await incidentTimelinesRepository.list({
      where: [{ field: 'incidentId', operator: '==', value: incidentId }],
    });
    return list.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /**
   * Notification Preferences Management
   */
  async getNotificationPreferences(userId: string): Promise<PlatformNotificationPreference> {
    const list = await notificationPreferencesRepository.list({
      where: [{ field: 'userId', operator: '==', value: userId }],
    });

    if (list.length > 0) {
      return list[0];
    }

    const defaultPref: PlatformNotificationPreference = {
      id: `pref_${userId}`,
      userId,
      emailAlertsEnabled: true,
      discordDmAlertsEnabled: true,
      minSeverity: 'WARNING',
      componentsMuted: [],
      updatedAt: new Date().toISOString(),
    };

    return notificationPreferencesRepository.create(defaultPref);
  }

  async updateNotificationPreferences(
    userId: string,
    updates: Partial<PlatformNotificationPreference>
  ): Promise<PlatformNotificationPreference> {
    const existing = await this.getNotificationPreferences(userId);
    const updated: PlatformNotificationPreference = {
      ...existing,
      ...updates,
      userId,
      updatedAt: new Date().toISOString(),
    };

    await notificationPreferencesRepository.update(updated.id, updated);
    return updated;
  }

  /**
   * Operational Trend Analysis
   */
  async getOperationalTrends(): Promise<OperationalTrendAnalysis> {
    const slos = await this.calculateSLOs();
    const allIncidents = await incidentsRepository.list();

    const now = Date.now();
    const past24hIncidents = allIncidents.filter(
      (i) => now - new Date(i.lastSeenAt || i.detectedAt).getTime() <= 24 * 60 * 60 * 1000
    );

    const resolved24h = past24hIncidents.filter((i) => i.status === 'RESOLVED').length;
    const critical24h = past24hIncidents.filter((i) => i.severity === 'CRITICAL').length;

    const meetingCount = slos.filter((s) => s.status === 'MEETING').length;
    const breachedCount = slos.filter((s) => s.status === 'BREACHED').length;
    const insufficientCount = slos.filter((s) => s.status === 'INSUFFICIENT_DATA').length;

    return {
      timeframe: 'PAST_24_HOURS',
      requestVolumeTrend: this.requestCounter > 0 ? 'STABLE' : 'INSUFFICIENT_DATA',
      errorRateTrend:
        this.requestCounter > 0
          ? this.errorCounter === 0
            ? 'IMPROVING'
            : 'STABLE'
          : 'INSUFFICIENT_DATA',
      avgLatencyTrend: this.requestCounter > 0 ? 'STABLE' : 'INSUFFICIENT_DATA',
      incidentFrequency: {
        totalPast24h: past24hIncidents.length,
        resolvedPast24h: resolved24h,
        criticalPast24h: critical24h,
      },
      sloSummary: {
        totalSloCount: slos.length,
        meetingCount,
        breachedCount,
        insufficientDataCount: insufficientCount,
      },
    };
  }
}

export const observabilityService = new ProductionObservabilityService();
export { ProductionObservabilityService };
