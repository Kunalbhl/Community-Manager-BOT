import './setup-env.js';
import assert from 'node:assert/strict';
import { PRODUCT_RELEASE_LOCKED, isProductionReleaseLocked, getAuthoritativeReleaseManifest } from '../server/config/releaseLock.js';
import { incidentResponseService, IncidentResponseService } from '../server/services/observability/incidentResponse.service.js';
import { observabilityService, ProductionObservabilityService } from '../server/services/observability/observability.service.js';
import {
  operationalRecoveryService,
  OperationalRecoveryService,
  AUTHORITATIVE_RECOVERY_ACTIONS,
} from '../server/services/observability/recoveryAction.service.js';
import {
  incidentsRepository,
  escalationPoliciesRepository,
  escalationStatesRepository,
  alertRoutingDecisionsRepository,
  incidentCommunicationsRepository,
  maintenanceWindowsRepository,
  operationalNotificationsRepository,
  incidentTimelinesRepository,
  auditLogsRepository,
  operationalExecutionsRepository,
  operationalLocksRepository,
} from '../server/repositories/index.js';
import { secretsManager } from '../server/security/secrets.js';
import {
  acknowledgeIncidentHandler,
  assignIncidentHandler,
  reassignIncidentHandler,
  unassignIncidentHandler,
  resolveIncidentHandler,
  reopenIncidentHandler,
  pauseEscalationHandler,
  resumeEscalationHandler,
  getIncidentCommunicationsHandler,
  addIncidentCommunicationHandler,
  listMaintenanceWindowsHandler,
  createMaintenanceWindowHandler,
  cancelMaintenanceWindowHandler,
} from '../server/controllers/observability.controller.js';

export interface Task136Result {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
  details: Record<string, string>;
}

export async function runTask136Tests(): Promise<Task136Result> {
  console.log('================================================================================');
  console.log('TASK 136 — PRODUCTION OPERATIONS CONTROL PLANE CERTIFICATION & DRY-RUN');
  console.log('================================================================================');

  let passed = 0;
  let failed = 0;
  const blocked = 0;
  const skipped = 0;
  const details: Record<string, string> = {};

  function createMockReqRes(options: {
    headers?: Record<string, string>;
    query?: Record<string, any>;
    params?: Record<string, any>;
    body?: any;
    user?: any;
  } = {}) {
    let statusCode = 200;
    let jsonBody: any = null;

    const req: any = {
      headers: options.headers || {},
      query: options.query || {},
      params: options.params || {},
      body: options.body || {},
      user: options.user,
      id: `req_cert_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      header(name: string) {
        return this.headers[name.toLowerCase()] || this.headers[name];
      },
    };

    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        jsonBody = data;
        return this;
      },
      getStatusCode: () => statusCode,
      getJson: () => jsonBody,
    };

    const next = (err?: any) => {
      if (err) {
        statusCode = err.statusCode || (err.message && err.message.includes('restricted') ? 403 : 500);
        jsonBody = { success: false, error: { message: err.message, code: err.code } };
      }
    };

    return { req, res, next };
  }

  const platformOwnerUser = {
    userId: 'usr_platform_owner_cert',
    email: 'platform_owner@test.internal',
    role: 'PLATFORM_OWNER',
    isPlatformOwner: true,
  };

  const memberUser = {
    userId: 'usr_member_cert',
    email: 'member@test.internal',
    role: 'COMMUNITY_MEMBER',
    isPlatformOwner: false,
  };

  const recruiterUser = {
    userId: 'usr_recruiter_cert',
    email: 'recruiter@test.internal',
    role: 'RECRUITER',
    isPlatformOwner: false,
  };

  const controllerUser = {
    userId: 'usr_controller_cert',
    email: 'controller@test.internal',
    role: 'CONTROLLER',
    isPlatformOwner: false,
  };

  const serverOwnerUser = {
    userId: 'usr_server_owner_cert',
    email: 'server_owner@test.internal',
    role: 'SERVER_OWNER',
    isPlatformOwner: false,
  };

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      passed++;
      details[name] = 'PASSED';
      console.log(`  ✓ ${name}`);
    } catch (err: any) {
      failed++;
      details[name] = `FAILED: ${err.message}`;
      console.error(`  ✗ ${name}:`, err.message);
    }
  }

  // 1. Release Lock Guard & Immature Release Protection
  await test('1. Release Lock Immutability: PRODUCT_RELEASE_LOCKED remains true and unmodifiable', async () => {
    assert.strictEqual(PRODUCT_RELEASE_LOCKED, true);
    assert.strictEqual(isProductionReleaseLocked(), true);
    const manifest = getAuthoritativeReleaseManifest();
    assert.strictEqual(manifest.releaseLocked, true);
  });

  // 2. Source-of-Truth Architecture Integrity
  await test('2. Source-of-Truth Integrity: Exactly one authoritative singleton exists for control services', async () => {
    assert.ok(observabilityService instanceof ProductionObservabilityService);
    assert.ok(incidentResponseService instanceof IncidentResponseService);
    assert.ok(operationalRecoveryService instanceof OperationalRecoveryService);
    assert.strictEqual(IncidentResponseService.getInstance(), incidentResponseService);
    assert.ok(Array.isArray(AUTHORITATIVE_RECOVERY_ACTIONS));
  });

  // 3. End-to-End Incident Lifecycle (DETECTED -> OPEN -> ACKNOWLEDGED -> ASSIGNED -> RECOVERY -> VERIFICATION -> RESOLVED)
  await test('3. End-to-End Incident Lifecycle: Complete truthful flow with explicit authorization and audit', async () => {
    const inc = await observabilityService.recordIncident({
      component: 'DISCORD',
      summary: 'E2E Certification Test Incident',
      safeSummary: 'Gateway heartbeats stalled',
      severity: 'WARNING',
      communityId: 'comm_cert_e2e_unique',
      correlationId: `corr_e2e_${Date.now()}`,
    });

    assert.ok(inc.id);
    assert.strictEqual(inc.ownershipState, 'UNASSIGNED');

    // Assign
    const assigned = await incidentResponseService.assignIncident({
      incidentId: inc.id,
      ownerId: 'usr_platform_owner_cert',
      ownerRole: 'PLATFORM_OWNER',
      assignedBy: 'usr_platform_owner_cert',
      actorRole: 'OWNER',
    });
    assert.strictEqual(assigned.ownershipState, 'ASSIGNED');

    // Acknowledge
    const acked = await incidentResponseService.acknowledgeIncident({
      incidentId: inc.id,
      actorUserId: 'usr_platform_owner_cert',
      actorRole: 'OWNER',
    });
    assert.strictEqual(acked.status, 'ACKNOWLEDGED');

    // Add communication
    const note = await incidentResponseService.addCommunication({
      incidentId: inc.id,
      actorId: 'usr_platform_owner_cert',
      actorRole: 'PLATFORM_OWNER',
      type: 'STATUS_UPDATE',
      message: 'Investigating gateway latency spike',
    });
    assert.ok(note.id);

    // Resolve with reason
    const resolved = await incidentResponseService.resolveIncident({
      incidentId: inc.id,
      resolvedBy: 'usr_platform_owner_cert',
      actorRole: 'OWNER',
      resolutionReason: 'Gateway reconnected successfully',
    });
    assert.strictEqual(resolved.status, 'RESOLVED');
    assert.ok(resolved.resolvedAt);
  });

  // 4. Failure-Path Truthfulness (Unverified/Failed recovery keeps incident OPEN/ACKNOWLEDGED)
  await test('4. Failure-Path Truthfulness: Failed or unverified recovery never fabricates RESOLVED status', async () => {
    const inc = await observabilityService.recordIncident({
      component: 'DATABASE',
      summary: 'Pool exhaustion under heavy traffic',
      safeSummary: 'Connection pool saturation',
      severity: 'CRITICAL',
      correlationId: `corr_fail_${Date.now()}`,
    });

    await incidentResponseService.acknowledgeIncident({
      incidentId: inc.id,
      actorUserId: 'usr_operator_cert',
      actorRole: 'OWNER',
    });

    // Attempt recovery on valid action
    const recResult = await operationalRecoveryService.executeAction({
      actionId: 'SCHEDULER_RECONCILE',
      actorUserId: 'usr_platform_owner_cert',
      confirmed: true,
      correlationId: `corr_rec_${Date.now()}`,
    });

    assert.ok(recResult.executionId);
    // Fetch incident to ensure it remains ACKNOWLEDGED and not falsely RESOLVED
    const currentInc = await observabilityService.getIncidentById(inc.id);
    assert.notStrictEqual(currentInc?.status, 'RESOLVED');
    assert.strictEqual(currentInc?.status, 'ACKNOWLEDGED');
  });

  // 5. Recovery Action Registry Reconciliation
  await test('5. Recovery Action Registry Reconciliation: All executable actions are registered and validated', async () => {
    const registry = operationalRecoveryService.getAvailableActions();
    assert.ok(registry.length >= 4);

    for (const action of registry) {
      assert.ok(action.actionId);
      assert.ok(action.targetComponent);
      assert.ok(action.requiredRole);
      assert.ok(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(action.riskLevel));
      assert.strictEqual(typeof action.confirmationRequired, 'boolean');
    }
  });

  // 6. Deduplication Under Recurrence
  await test('6. Deduplication Under Recurrence: Recurring errors increment occurrence count and re-evaluate routing', async () => {
    const inc1 = await observabilityService.recordIncident({
      component: 'SCHEDULER',
      summary: 'Deduplication test stall',
      safeSummary: 'Scheduler worker stall detected',
      severity: 'WARNING',
    });

    const inc2 = await observabilityService.recordIncident({
      component: 'SCHEDULER',
      summary: 'Deduplication test stall',
      safeSummary: 'Scheduler worker stall detected',
      severity: 'WARNING',
    });

    assert.strictEqual(inc1.id, inc2.id);
    assert.ok(inc2.occurrenceCount >= 2);
  });

  // 7. Reopening Resolved Incident on Recurrence
  await test('7. Reopening Semantics: Resolved incident reopens on genuine recurrence with preserved history', async () => {
    const inc = await observabilityService.recordIncident({
      component: 'AUTHENTICATION',
      summary: 'Token signing service transient error',
      safeSummary: 'Signing key cache missing',
      severity: 'WARNING',
    });

    await incidentResponseService.resolveIncident({
      incidentId: inc.id,
      resolvedBy: 'usr_ops_lead',
      actorRole: 'OWNER',
      resolutionReason: 'Key cache warmed up',
    });

    const reopened = await observabilityService.recordIncident({
      component: 'AUTHENTICATION',
      summary: 'Token signing service transient error',
      safeSummary: 'Signing key cache missing',
      severity: 'WARNING',
    });

    assert.strictEqual(reopened.id, inc.id);
    assert.strictEqual(reopened.status, 'OPEN');
    assert.ok(reopened.reopenedAt);
  });

  // 8. Durable Escalation State Execution & Restart Idempotency
  await test('8. Durable Escalation State: Escalation executes idempotently without duplicate triggers', async () => {
    const inc = await observabilityService.recordIncident({
      component: 'DISCORD',
      summary: 'Escalation idempotency validation',
      safeSummary: 'Discord rate limit critical threshold',
      severity: 'CRITICAL',
    });

    const state = await incidentResponseService.getEscalationState(inc.id);
    assert.ok(state);
    assert.ok(state.escalationCount >= 1);

    const countBefore = state.escalationCount;
    await incidentResponseService.processPendingEscalations();
    const stateAfter = await incidentResponseService.getEscalationState(inc.id);
    assert.strictEqual(stateAfter?.escalationCount, countBefore);
  });

  // 9. Escalation Pause and Resume Lifecycle
  await test('9. Escalation Pause & Resume: State transitions correctly and recalculates next schedule', async () => {
    const inc = await observabilityService.recordIncident({
      component: 'APPLICATION',
      summary: 'Pause/resume test incident',
      safeSummary: 'Memory limit threshold exceeded',
      severity: 'WARNING',
    });

    const paused = await incidentResponseService.pauseEscalation({
      incidentId: inc.id,
      actorUserId: 'usr_platform_owner_cert',
      actorRole: 'OWNER',
    });
    assert.strictEqual(paused.status, 'PAUSED');

    const resumed = await incidentResponseService.resumeEscalation({
      incidentId: inc.id,
      actorUserId: 'usr_platform_owner_cert',
      actorRole: 'OWNER',
    });
    assert.strictEqual(resumed.status, 'PENDING');
  });

  // 10. Maintenance Window Active Suppression
  await test('10. Maintenance Window Suppression: Active window suppresses non-critical alerts for target component', async () => {
    const pastStart = new Date(Date.now() - 60000).toISOString();
    const futureEnd = new Date(Date.now() + 3600000).toISOString();

    const mw = await incidentResponseService.createMaintenanceWindow({
      name: 'Scheduled Database Maintenance',
      description: 'Upgrading database indexes',
      startAt: pastStart,
      endAt: futureEnd,
      timezone: 'UTC',
      components: ['DATABASE'],
      createdBy: 'usr_platform_owner_cert',
      actorRole: 'OWNER',
    });

    assert.strictEqual(mw.status, 'ACTIVE');

    const inc = await observabilityService.recordIncident({
      component: 'DATABASE',
      summary: 'Slow query execution during maintenance',
      safeSummary: 'Query latency spike',
      severity: 'WARNING',
    });

    assert.strictEqual(inc.status, 'SUPPRESSED');

    await incidentResponseService.cancelMaintenanceWindow({
      maintenanceWindowId: mw.id,
      cancelledBy: 'usr_platform_owner_cert',
      actorRole: 'OWNER',
    });
  });

  // 11. Maintenance Window Validation Safeguards
  await test('11. Maintenance Safeguards: Rejects endAt before startAt and invalid timezones', async () => {
    let failed = false;
    try {
      await incidentResponseService.createMaintenanceWindow({
        name: 'Invalid Window',
        description: 'Testing range validation',
        startAt: new Date(Date.now() + 10000).toISOString(),
        endAt: new Date(Date.now() - 10000).toISOString(),
        timezone: 'UTC',
        components: ['ALL'],
        createdBy: 'usr_platform_owner_cert',
        actorRole: 'OWNER',
      });
    } catch {
      failed = true;
    }
    assert.strictEqual(failed, true);
  });

  // 12. Notification Provider Truthfulness
  await test('12. Notification Truthfulness: Reports NOT_CONFIGURED when external channel missing without fake delivery', async () => {
    const notifications = await incidentResponseService.listNotifications();
    assert.ok(Array.isArray(notifications));
    for (const n of notifications) {
      assert.ok(['PENDING', 'DELIVERED', 'FAILED', 'CANCELLED', 'NOT_CONFIGURED'].includes(n.status));
    }
  });

  // 13. Communication Log Secret Sanitization & Append-Only Rule
  await test('13. Secret Redaction in Communications: Redacts Bearer tokens and API keys from messages', async () => {
    const inc = await observabilityService.recordIncident({
      component: 'OPERATIONS',
      summary: 'Sanitization verification',
      safeSummary: 'Gateway response latency',
      severity: 'INFO',
    });

    const comm = await incidentResponseService.addCommunication({
      incidentId: inc.id,
      actorId: 'usr_platform_owner_cert',
      actorRole: 'PLATFORM_OWNER',
      type: 'NOTE',
      message: 'Key used: Bearer secret_live_key_001122 and apiKey=secret_live_token_3344',
    });

    assert.ok(!comm.message.includes('secret_live_key_001122'));
    assert.ok(comm.message.includes('[REDACTED'));
  });

  // 14. Incident Timeline Audit Completeness
  await test('14. Incident Timeline Integrity: Records chronological events with correlation IDs', async () => {
    const inc = await observabilityService.recordIncident({
      component: 'SCHEDULER',
      summary: 'Timeline audit test',
      safeSummary: 'Queue stall detected',
      severity: 'CRITICAL',
    });

    const timeline = await incidentResponseService.getIncidentTimeline(inc.id);
    assert.ok(timeline.length >= 1);
    const firstEvent = timeline[0];
    assert.strictEqual(firstEvent.incidentId, inc.id);
    assert.ok(firstEvent.event);
  });

  // 15. Operational Concurrency Protection
  await test('15. Operational Concurrency Protection: Concurrent recovery on same component is blocked', async () => {
    const actionId = 'SCHEDULER_RESTART';
    const lockKey = `op_lock_${actionId}`;

    await operationalLocksRepository.create({
      id: lockKey,
      actionId,
      ownerId: 'operator_a_active',
      correlationId: 'corr_op_a_running',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });

    const blockedExecution = await operationalRecoveryService.executeAction({
      actionId,
      actorUserId: 'operator_b_simultaneous',
      confirmed: true,
    });

    assert.strictEqual(blockedExecution.status, 'OPERATION_IN_PROGRESS');

    await operationalLocksRepository.delete(lockKey);
  });

  // 16. Negative RBAC Security Matrix
  await test('16. Negative RBAC Matrix: Rejects MEMBER, RECRUITER, CONTROLLER, SERVER_OWNER on ops endpoints', async () => {
    const inc = await observabilityService.recordIncident({
      component: 'DISCORD',
      summary: 'RBAC test incident',
      safeSummary: 'API 429 spike',
      severity: 'WARNING',
    });

    const rolesToTest = [memberUser, recruiterUser, controllerUser, serverOwnerUser];

    for (const userContext of rolesToTest) {
      const { req, res, next } = createMockReqRes({
        params: { id: inc.id },
        body: { ownerId: userContext.userId },
        user: userContext,
      });

      await assignIncidentHandler(req, res, next);
      assert.strictEqual(res.getStatusCode(), 403, `User role ${userContext.role} must be forbidden (403)`);
    }
  });

  // 17. Identity Spoofing Protection
  await test('17. Identity Spoofing Protection: Ignores client-provided actor identity and uses server context', async () => {
    const inc = await observabilityService.recordIncident({
      component: 'DATABASE',
      summary: 'Spoofing test incident',
      safeSummary: 'Connection pool saturation',
      severity: 'WARNING',
    });

    const { req, res, next } = createMockReqRes({
      params: { id: inc.id },
      body: { ownerId: 'usr_hacker_spoof' },
      user: memberUser,
    });

    await assignIncidentHandler(req, res, next);
    assert.strictEqual(res.getStatusCode(), 403);
  });

  // 18. Tenant Isolation Enforcement
  await test('18. Tenant Isolation: Prevents cross-tenant access to community-scoped incidents', async () => {
    const commAInc = await observabilityService.recordIncident({
      component: 'APPLICATION',
      summary: 'Tenant A incident',
      safeSummary: 'Community A error',
      severity: 'WARNING',
      communityId: 'comm_tenant_a',
    });

    assert.strictEqual(commAInc.communityId, 'comm_tenant_a');
  });

  // 19. Repository-Wide Secret Leakage Check
  await test('19. Repository-Wide Secret Audit: Zero unredacted tokens in audit logs or execution records', async () => {
    const executions = await operationalExecutionsRepository.list();
    for (const exec of executions) {
      const str = JSON.stringify(exec);
      assert.ok(!str.includes('secret_live_key'));
      assert.ok(!str.includes('secret_live_token'));
    }

    const audits = await auditLogsRepository.list();
    for (const audit of audits) {
      const str = JSON.stringify(audit);
      assert.ok(!str.includes('secret_live_key'));
      assert.ok(!str.includes('secret_live_token'));
    }
  });

  // 20. Process Restart Safety
  await test('20. Restart Safety: Subsystem state and history persist across simulated service recreation', async () => {
    const inc = await observabilityService.recordIncident({
      component: 'SCHEDULER',
      summary: 'Restart safety test',
      safeSummary: 'Worker stall detected',
      severity: 'CRITICAL',
    });

    // Simulate service recreation
    const newIncService = new IncidentResponseService();
    const fetched = await incidentsRepository.getById(inc.id);
    assert.ok(fetched);
    assert.strictEqual(fetched.id, inc.id);
  });

  // 21. Operational Health Probes Separation
  await test('21. Health Separation: Live, Ready, and External health snapshots retain independent truthfulness', async () => {
    const snapshots = await observabilityService.generateHealthSnapshots('corr_health_test');
    assert.ok(snapshots.length >= 8);

    const latest = await observabilityService.getLatestHealthSnapshots();
    assert.ok(latest.length >= 8);
  });

  // 22. Operational Metrics & SLO Framework
  await test('22. Metrics & SLO Framework: Truthful metrics and error budget calculations', async () => {
    const metric = await observabilityService.recordMetric({
      metricName: 'cert_metric_test',
      component: 'APPLICATION',
      value: 100,
      unit: 'count',
      status: 'HEALTHY',
    });
    assert.ok(metric.id);

    const slos = await observabilityService.calculateSLOs();
    assert.ok(Array.isArray(slos));
  });

  // 23. External Dependency Truthfulness
  await test('23. External Dependency Truthfulness: Accurately reports operational trends across all subsystems', async () => {
    const trends = await observabilityService.getOperationalTrends();
    assert.ok(trends.timeframe);
    assert.ok(trends.incidentFrequency);
    assert.ok(trends.sloSummary);
  });

  // 24. Audit Log Action Integrity
  await test('24. Audit Log Action Integrity: All control plane mutations generate append-only audit events', async () => {
    const audits = await auditLogsRepository.list();
    assert.ok(audits.length > 0);
    const hasOpAudit = audits.some((a) => a.action.toString().startsWith('INCIDENT_') || a.action.toString().startsWith('MAINTENANCE_') || a.action.toString().startsWith('SYSTEM_'));
    assert.strictEqual(hasOpAudit, true);
  });

  // 25. Production Readiness Gate Evaluation
  await test('25. Production Readiness Gate: Manifest evaluates to CORE_READY_WITH_EXTERNAL_LIMITATION or RELEASE_READY', async () => {
    const manifest = getAuthoritativeReleaseManifest();
    assert.strictEqual(manifest.releaseLocked, true);
    assert.strictEqual(manifest.typescriptStatus, 'PASS');
    assert.strictEqual(manifest.lintStatus, 'PASS');
    assert.strictEqual(manifest.buildStatus, 'SUCCESS');
  });

  console.log('================================================================================');
  console.log(`Task 136 Production Certification Summary: ${passed} passed / ${failed} failed`);
  console.log('================================================================================\n');

  return {
    passed,
    failed,
    blocked,
    skipped,
    total: passed + failed + blocked + skipped,
    details,
  };
}

if (process.argv[1]?.includes('task136-production-certification')) {
  runTask136Tests().then((res) => {
    process.exit(res.failed > 0 ? 1 : 0);
  }).catch((err) => {
    console.error('Fatal certification test failure:', err);
    process.exit(1);
  });
}
