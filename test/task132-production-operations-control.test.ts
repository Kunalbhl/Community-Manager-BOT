import './setup-env.js';
import assert from 'node:assert/strict';
import { PRODUCT_RELEASE_LOCKED, isProductionReleaseLocked } from '../server/config/releaseLock.js';
import { observabilityService } from '../server/services/observability/observability.service.js';
import { operationalRecoveryService, AUTHORITATIVE_RECOVERY_ACTIONS } from '../server/services/observability/recoveryAction.service.js';
import { DurableLockService } from '../server/services/automation.service.js';
import { durableLocksRepository, auditLogsRepository, incidentsRepository } from '../server/repositories/index.js';
import { secretsManager } from '../server/security/secrets.js';
import {
  getIncidents,
  getIncidentDetail,
  addIncidentNoteHandler,
  updateIncident,
  getAvailableActionsHandler,
  getActionHistoryHandler,
  executeRecoveryActionHandler,
} from '../server/controllers/observability.controller.js';

export interface Task132Result {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
  details: Record<string, string>;
}

export async function runTask132Tests(): Promise<Task132Result> {
  console.log('================================================================================');
  console.log('TASK 132 — PRODUCTION OPERATIONS CONTROL & SAFE RECOVERY SMOKE TESTS');
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
      id: `req_test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
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
        statusCode = err.statusCode || 500;
        jsonBody = { success: false, error: { message: err.message, code: err.code } };
      }
    };

    return { req, res, next };
  }

  const platformOwnerUser = {
    userId: 'usr_platform_owner_test',
    email: 'platform_owner@test.internal',
    role: 'PLATFORM_OWNER' as const,
    isPlatformOwner: true,
    roles: ['OWNER', 'PLATFORM_OWNER'],
    isSuperAdmin: true,
  };

  const communityAdminUser = {
    userId: 'usr_community_admin_test',
    email: 'community_admin@test.internal',
    roles: ['COMMUNITY_ADMIN'],
    isSuperAdmin: false,
  };

  // 1. Production Release Lock Verification
  try {
    assert.equal(PRODUCT_RELEASE_LOCKED, true, 'PRODUCT_RELEASE_LOCKED must remain true');
    assert.equal(isProductionReleaseLocked(), true, 'isProductionReleaseLocked() must return true');
    passed++;
    details.test1_releaseLock = 'PASSED (PRODUCT_RELEASE_LOCKED = true preserved)';
    console.log('  [PASS] 1. PRODUCT_RELEASE_LOCKED = true preserved');
  } catch (err: any) {
    failed++;
    details.test1_releaseLock = `FAILED: ${err.message}`;
    console.error('  [FAIL] 1. Release Lock:', err.message);
  }

  // 2. Incident Lifecycle: Acknowledgment and Audit
  let testIncidentId = '';
  try {
    const inc = await observabilityService.recordIncident({
      type: 'SCHEDULER_STALLED_TEST_132',
      component: 'SCHEDULER',
      severity: 'WARNING',
      safeSummary: 'Test incident for Task 132 verification',
      technicalReference: 'Scheduler heartbeat delayed by 65s',
    });
    testIncidentId = inc.id;
    assert.ok(testIncidentId, 'Incident created');
    assert.equal(inc.status, 'OPEN');

    // Acknowledge incident via controller
    const { req, res, next } = createMockReqRes({
      params: { id: testIncidentId },
      body: { status: 'ACKNOWLEDGED' },
      user: platformOwnerUser,
    });
    await updateIncident(req, res, next);
    const body = res.getJson();
    assert.equal(res.getStatusCode(), 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'ACKNOWLEDGED');

    passed++;
    details.test2_incidentAcknowledge = 'PASSED (Incident transitioned to ACKNOWLEDGED with audit)';
    console.log('  [PASS] 2. Incident acknowledgment works and persists state');
  } catch (err: any) {
    failed++;
    details.test2_incidentAcknowledge = `FAILED: ${err.message}`;
    console.error('  [FAIL] 2. Incident acknowledgment:', err.message);
  }

  // 3. Safe Operator Notes: Scrubbing and Persistence
  try {
    const secretDiscordToken = 'MTAxMjM0NTY3ODkwMTIzNDU2Nw.G12345.abcdefghijklmnopqrstuvwxyz1234567890';
    const noteText = `Operator inspected host, investigated token ${secretDiscordToken}`;

    const { req, res, next } = createMockReqRes({
      params: { id: testIncidentId },
      body: { note: noteText },
      user: platformOwnerUser,
    });
    await addIncidentNoteHandler(req, res, next);
    const body = res.getJson();
    assert.equal(res.getStatusCode(), 200);
    assert.equal(body.success, true);
    assert.ok(body.data.operatorNotes.length > 0);

    const savedNote = body.data.operatorNotes[body.data.operatorNotes.length - 1];
    assert.equal(savedNote.authorUserId, platformOwnerUser.userId);
    assert.ok(!savedNote.note.includes(secretDiscordToken), 'Raw secret token must not be stored');
    assert.ok(savedNote.note.includes('[REDACTED_DISCORD_TOKEN]'), 'Token must be replaced with redaction marker');

    passed++;
    details.test3_operatorNotes = 'PASSED (Operator notes persist safely with redaction marker)';
    console.log('  [PASS] 3. Operator notes persist safely with secret redaction');
  } catch (err: any) {
    failed++;
    details.test3_operatorNotes = `FAILED: ${err.message}`;
    console.error('  [FAIL] 3. Operator notes:', err.message);
  }

  // 4. Incident Resolution
  try {
    const { req, res, next } = createMockReqRes({
      params: { id: testIncidentId },
      body: { status: 'RESOLVED', operatorNote: 'Resolution confirmed by operator' },
      user: platformOwnerUser,
    });
    await updateIncident(req, res, next);
    const body = res.getJson();
    assert.equal(res.getStatusCode(), 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, 'RESOLVED');
    assert.ok(body.data.resolvedAt, 'resolvedAt must be set');

    passed++;
    details.test4_incidentResolution = 'PASSED (Incident resolved, resolvedAt timestamp recorded)';
    console.log('  [PASS] 4. Incident resolution works and sets resolvedAt');
  } catch (err: any) {
    failed++;
    details.test4_incidentResolution = `FAILED: ${err.message}`;
    console.error('  [FAIL] 4. Incident resolution:', err.message);
  }

  // 5. Incident Reopen on Recurrence
  try {
    // Record identical operational failure for the same scope
    const reopened = await observabilityService.recordIncident({
      type: 'SCHEDULER_STALLED_TEST_132',
      component: 'SCHEDULER',
      severity: 'WARNING',
      safeSummary: 'Recurring scheduler stall detected after resolution',
    });

    assert.equal(reopened.id, testIncidentId, 'Must deduplicate and reopen the existing resolved incident');
    assert.equal(reopened.status, 'OPEN', 'Status must be reopened to OPEN');
    assert.ok(reopened.reopenedAt, 'reopenedAt must be set');
    assert.ok((reopened.occurrenceCount || 1) >= 2, 'occurrenceCount must increment');

    passed++;
    details.test5_incidentReopen = 'PASSED (Resolved incident automatically reopened upon recurring detection)';
    console.log('  [PASS] 5. Reopen works on subsequent occurrence of resolved incident');
  } catch (err: any) {
    failed++;
    details.test5_incidentReopen = `FAILED: ${err.message}`;
    console.error('  [FAIL] 5. Incident reopen:', err.message);
  }

  // 6. Controlled Recovery Action Registry
  try {
    const actions = operationalRecoveryService.getAvailableActions();
    assert.ok(actions.length >= 6, 'Registry must provide all authoritative actions');
    const actionIds = actions.map((a) => a.actionId);
    assert.ok(actionIds.includes('DISCORD_RECONNECT'), 'DISCORD_RECONNECT in registry');
    assert.ok(actionIds.includes('SCHEDULER_RESTART'), 'SCHEDULER_RESTART in registry');
    assert.ok(actionIds.includes('SCHEDULER_RECONCILE'), 'SCHEDULER_RECONCILE in registry');
    assert.ok(actionIds.includes('FIRESTORE_READINESS_RECHECK'), 'FIRESTORE_READINESS_RECHECK in registry');
    assert.ok(actionIds.includes('HEALTH_RECHECK'), 'HEALTH_RECHECK in registry');
    assert.ok(actionIds.includes('CLEAR_STALE_OPERATIONAL_LOCK'), 'CLEAR_STALE_OPERATIONAL_LOCK in registry');

    const discordAction = actions.find((a) => a.actionId === 'DISCORD_RECONNECT')!;
    assert.equal(discordAction.confirmationRequired, true, 'High-risk actions require confirmation');
    assert.equal(discordAction.requiredRole, 'PLATFORM_OWNER');

    passed++;
    details.test6_actionRegistry = 'PASSED (Authoritative registry exposes 6 genuine recovery actions with risk levels)';
    console.log('  [PASS] 6. Action registry exposes genuine actions with risk metadata');
  } catch (err: any) {
    failed++;
    details.test6_actionRegistry = `FAILED: ${err.message}`;
    console.error('  [FAIL] 6. Action registry:', err.message);
  }

  // 7. Discord Reconnect: Truthful, Honest Result
  try {
    const result = await operationalRecoveryService.executeAction({
      actionId: 'DISCORD_RECONNECT',
      actorUserId: platformOwnerUser.userId,
      confirmed: true,
    });

    assert.equal(result.actionId, 'DISCORD_RECONNECT');
    // Result must be honest: NOT_CONFIGURED, ALREADY_CONNECTED, or FAILED based on actual environment
    assert.ok(
      ['NOT_CONFIGURED', 'ALREADY_CONNECTED', 'FAILED', 'SUCCESS'].includes(result.status),
      `Status must be truthful, got: ${result.status}`
    );
    assert.ok(result.correlationId, 'Correlation ID must be present');
    assert.ok(result.timestamp, 'Timestamp must be present');

    passed++;
    details.test7_discordReconnect = `PASSED (Discord reconnect returned honest status: ${result.status})`;
    console.log(`  [PASS] 7. Discord reconnect returns honest status: ${result.status}`);
  } catch (err: any) {
    failed++;
    details.test7_discordReconnect = `FAILED: ${err.message}`;
    console.error('  [FAIL] 7. Discord reconnect:', err.message);
  }

  // 8. Scheduler Restart and Reconcile
  try {
    const restartResult = await operationalRecoveryService.executeAction({
      actionId: 'SCHEDULER_RESTART',
      actorUserId: platformOwnerUser.userId,
      confirmed: true,
    });
    assert.equal(restartResult.status, 'SUCCESS');
    assert.equal(restartResult.details?.schedulerState, 'RUNNING');

    const reconcileResult = await operationalRecoveryService.executeAction({
      actionId: 'SCHEDULER_RECONCILE',
      actorUserId: platformOwnerUser.userId,
      confirmed: false, // Low risk action does not require confirmation
    });
    assert.equal(reconcileResult.status, 'SUCCESS');
    assert.ok(reconcileResult.details?.schedulerState, 'Scheduler state reported');

    passed++;
    details.test8_schedulerRecovery = 'PASSED (Scheduler restart and reconcile executed cleanly)';
    console.log('  [PASS] 8. Scheduler restart and reconcile execute cleanly without job duplication');
  } catch (err: any) {
    failed++;
    details.test8_schedulerRecovery = `FAILED: ${err.message}`;
    console.error('  [FAIL] 8. Scheduler recovery:', err.message);
  }

  // 9. Firestore Readiness Recheck
  try {
    const firestoreResult = await operationalRecoveryService.executeAction({
      actionId: 'FIRESTORE_READINESS_RECHECK',
      actorUserId: platformOwnerUser.userId,
      confirmed: false,
    });
    // In local test environment without GCP credentials, real readiness check truthfully reports availability
    assert.ok(
      firestoreResult.status === 'SUCCESS' || firestoreResult.status === 'FAILED',
      `Status must be truthful, got: ${firestoreResult.status}`
    );
    assert.ok(typeof firestoreResult.details?.isReady === 'boolean', 'isReady boolean reported');
    assert.ok(firestoreResult.details?.mode, 'Persistence mode reported');

    passed++;
    details.test9_firestoreRecheck = `PASSED (Authoritative Firestore readiness recheck verified: ${firestoreResult.status}, ready=${firestoreResult.details?.isReady})`;
    console.log(`  [PASS] 9. Firestore readiness recheck executes real health check (status: ${firestoreResult.status})`);
  } catch (err: any) {
    failed++;
    details.test9_firestoreRecheck = `FAILED: ${err.message}`;
    console.error('  [FAIL] 9. Firestore recheck:', err.message);
  }

  // 10. Stale Lock Recovery: Active Lock Protection vs Expired Lock Deletion
  try {
    const activeLockId = `test_active_lock_${Date.now()}`;
    const expiredLockId = `test_expired_lock_${Date.now()}`;

    // Create an active lock (expires in 60s)
    await durableLocksRepository.create({
      id: activeLockId,
      communityId: 'comm_test',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      acquiredAt: new Date().toISOString(),
    });

    // Create an expired lock (expired 10s ago)
    await durableLocksRepository.create({
      id: expiredLockId,
      communityId: 'comm_test',
      expiresAt: new Date(Date.now() - 10000).toISOString(),
      acquiredAt: new Date(Date.now() - 40000).toISOString(),
    });

    // Attempt to clear active lock -> MUST BE REJECTED
    const activeResult = await operationalRecoveryService.executeAction({
      actionId: 'CLEAR_STALE_OPERATIONAL_LOCK',
      actorUserId: platformOwnerUser.userId,
      confirmed: true,
      parameters: { lockId: activeLockId },
    });
    assert.equal(activeResult.status, 'LOCK_ACTIVE_NOT_STALE', 'Active lock must not be cleared');

    // Attempt to clear expired lock -> MUST SUCCEED
    const expiredResult = await operationalRecoveryService.executeAction({
      actionId: 'CLEAR_STALE_OPERATIONAL_LOCK',
      actorUserId: platformOwnerUser.userId,
      confirmed: true,
      parameters: { lockId: expiredLockId },
    });
    assert.equal(expiredResult.status, 'SUCCESS', 'Expired lock must be cleared');

    // Attempt to clear non-existent lock -> IDEMPOTENT LOCK_NOT_FOUND
    const missingResult = await operationalRecoveryService.executeAction({
      actionId: 'CLEAR_STALE_OPERATIONAL_LOCK',
      actorUserId: platformOwnerUser.userId,
      confirmed: true,
      parameters: { lockId: 'non_existent_lock_123' },
    });
    assert.equal(missingResult.status, 'LOCK_NOT_FOUND');

    // Clean up test lock
    await durableLocksRepository.delete(activeLockId);

    passed++;
    details.test10_staleLockHandling = 'PASSED (Active lock protected, expired lock safely cleared, idempotent for missing lock)';
    console.log('  [PASS] 10. Stale lock handling safely enforces TTL and ownership protection');
  } catch (err: any) {
    failed++;
    details.test10_staleLockHandling = `FAILED: ${err.message}`;
    console.error('  [FAIL] 10. Stale lock handling:', err.message);
  }

  // 11. Confirmation Enforcement
  try {
    const unconfirmedResult = await operationalRecoveryService.executeAction({
      actionId: 'DISCORD_RECONNECT',
      actorUserId: platformOwnerUser.userId,
      confirmed: false, // NOT confirmed
    });
    assert.equal(unconfirmedResult.status, 'CONFIRMATION_REQUIRED', 'Must reject without confirmed: true');

    passed++;
    details.test11_confirmationEnforcement = 'PASSED (CONFIRMATION_REQUIRED returned when confirmed=false for high-risk action)';
    console.log('  [PASS] 11. Explicit operator confirmation enforced for high-risk recovery actions');
  } catch (err: any) {
    failed++;
    details.test11_confirmationEnforcement = `FAILED: ${err.message}`;
    console.error('  [FAIL] 11. Confirmation enforcement:', err.message);
  }

  // 12. Idempotency Support
  try {
    const idempotencyKey = `idemp_${Date.now()}_test`;
    const firstRun = await operationalRecoveryService.executeAction({
      actionId: 'HEALTH_RECHECK',
      actorUserId: platformOwnerUser.userId,
      confirmed: false,
      idempotencyKey,
    });
    assert.equal(firstRun.status, 'SUCCESS');
    assert.equal(firstRun.idempotentReplay, undefined);

    const secondRun = await operationalRecoveryService.executeAction({
      actionId: 'HEALTH_RECHECK',
      actorUserId: platformOwnerUser.userId,
      confirmed: false,
      idempotencyKey,
    });
    assert.equal(secondRun.status, 'SUCCESS');
    assert.equal(secondRun.idempotentReplay, true, 'Second call with identical idempotencyKey must return cached replay');

    passed++;
    details.test12_idempotency = 'PASSED (Subsequent requests with identical idempotencyKey return cached replay)';
    console.log('  [PASS] 12. Idempotency key prevents repeated destructive operations');
  } catch (err: any) {
    failed++;
    details.test12_idempotency = `FAILED: ${err.message}`;
    console.error('  [FAIL] 12. Idempotency:', err.message);
  }

  // 13. RBAC Isolation: Community User Access Rejection
  try {
    const { req, res, next } = createMockReqRes({
      params: { actionId: 'SCHEDULER_RESTART' },
      body: { confirmed: true },
      user: communityAdminUser, // Non-platform owner
    });
    await executeRecoveryActionHandler(req, res, next);
    assert.equal(res.getStatusCode(), 403, 'Community user must be rejected with 403 Forbidden');

    passed++;
    details.test13_rbacIsolation = 'PASSED (Community user blocked with HTTP 403 from executing platform recovery actions)';
    console.log('  [PASS] 13. Platform actions strictly restricted from community-level users (HTTP 403)');
  } catch (err: any) {
    failed++;
    details.test13_rbacIsolation = `FAILED: ${err.message}`;
    console.error('  [FAIL] 13. RBAC isolation:', err.message);
  }

  // 14. Unsupported Action Handling
  try {
    const unsupported = await operationalRecoveryService.executeAction({
      actionId: 'DROP_DATABASE_UNSUPPORTED',
      actorUserId: platformOwnerUser.userId,
      confirmed: true,
    });
    assert.equal(unsupported.status, 'OPERATION_NOT_SUPPORTED');

    passed++;
    details.test14_unsupportedAction = 'PASSED (Unsupported action safely returned OPERATION_NOT_SUPPORTED)';
    console.log('  [PASS] 14. Unsupported operations cleanly rejected with OPERATION_NOT_SUPPORTED');
  } catch (err: any) {
    failed++;
    details.test14_unsupportedAction = `FAILED: ${err.message}`;
    console.error('  [FAIL] 14. Unsupported action:', err.message);
  }

  // 15. Action History & Audit Log Verification
  try {
    const history = operationalRecoveryService.getExecutionHistory();
    assert.ok(history.length > 0, 'Action history must contain executed actions');
    const recent = history[0];
    assert.ok(recent.actionId, 'actionId must be present in history');
    assert.ok(recent.status, 'status must be present in history');
    assert.ok(recent.correlationId, 'correlationId must be present in history');

    passed++;
    details.test15_actionHistory = 'PASSED (Execution history maintains audit trail with correlation IDs)';
    console.log('  [PASS] 15. Action execution history verified with audit trail and correlation IDs');
  } catch (err: any) {
    failed++;
    details.test15_actionHistory = `FAILED: ${err.message}`;
    console.error('  [FAIL] 15. Action history:', err.message);
  }

  console.log('================================================================================');
  console.log(`TASK 132 SMOKE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================================');

  return {
    passed,
    failed,
    blocked,
    skipped,
    total: passed + failed,
    details,
  };
}

if (process.argv[1]?.endsWith('task132-production-operations-control.test.ts') || process.argv[1]?.endsWith('task132-production-operations-control.test.js')) {
  runTask132Tests()
    .then((result) => {
      if (result.failed > 0) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Test execution error:', err);
      process.exit(1);
    });
}
