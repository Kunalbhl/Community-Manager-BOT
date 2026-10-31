import './setup-env.js';
import assert from 'node:assert/strict';
import { PRODUCT_RELEASE_LOCKED, isProductionReleaseLocked } from '../server/config/releaseLock.js';
import { observabilityService } from '../server/services/observability/observability.service.js';
import {
  operationalRecoveryService,
  OperationalRecoveryService,
  AUTHORITATIVE_RECOVERY_ACTIONS,
} from '../server/services/observability/recoveryAction.service.js';
import {
  durableLocksRepository,
  auditLogsRepository,
  incidentsRepository,
  operationalExecutionsRepository,
  operationalLocksRepository,
} from '../server/repositories/index.js';
import { secretsManager } from '../server/security/secrets.js';
import {
  getAvailableActionsHandler,
  getActionHistoryHandler,
  executeRecoveryActionHandler,
} from '../server/controllers/observability.controller.js';

export interface Task133Result {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
  details: Record<string, string>;
}

export async function runTask133Tests(): Promise<Task133Result> {
  console.log('================================================================================');
  console.log('TASK 133 — PRODUCTION OPERATIONS DURABILITY, CONCURRENCY & RECOVERY INTEGRITY');
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
    userId: 'usr_platform_owner_t133',
    email: 'platform_owner@test.internal',
    role: 'PLATFORM_OWNER' as const,
    isPlatformOwner: true,
    roles: ['OWNER', 'PLATFORM_OWNER'],
    isSuperAdmin: true,
  };

  const communityAdminUser = {
    userId: 'usr_community_admin_t133',
    email: 'community_admin@test.internal',
    roles: ['COMMUNITY_ADMIN'],
    isSuperAdmin: false,
  };

  // 1. Release Lock Integrity
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

  // 2. Action Registry Integrity: Authoritative Single Source of Truth
  try {
    const actions = operationalRecoveryService.getAvailableActions();
    assert.ok(Array.isArray(actions) && actions.length >= 6, 'Must define all authoritative recovery actions');

    for (const a of actions) {
      assert.ok(a.actionId, 'Every action must define actionId');
      assert.ok(a.label, 'Every action must define label');
      assert.ok(a.description, 'Every action must define description');
      assert.equal(a.requiredRole, 'PLATFORM_OWNER', 'Required role must be PLATFORM_OWNER');
      assert.ok(Array.isArray(a.supportedComponents) && a.supportedComponents.length > 0, 'supportedComponents must be non-empty array');
      assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(a.riskLevel), 'riskLevel must be valid enum');
      assert.equal(typeof a.confirmationRequired, 'boolean', 'confirmationRequired must be boolean');
      assert.equal(a.supported, true, 'supported must be true');
    }

    passed++;
    details.test2_actionRegistry = 'PASSED (Authoritative registry verified with immutable definitions)';
    console.log('  [PASS] 2. Action registry integrity verified with immutable definitions');
  } catch (err: any) {
    failed++;
    details.test2_actionRegistry = `FAILED: ${err.message}`;
    console.error('  [FAIL] 2. Action registry:', err.message);
  }

  // 3. Durable Operational Execution Record Creation
  let executedRecordId = '';
  try {
    const execResult = await operationalRecoveryService.executeAction({
      actionId: 'SCHEDULER_RECONCILE',
      actorUserId: platformOwnerUser.userId,
      confirmed: true,
      parameters: { auditNote: 'Durable history verification' },
    });

    assert.equal(execResult.status, 'SUCCESS');
    assert.ok(execResult.executionId, 'Execution must assign a durable executionId');
    executedRecordId = execResult.executionId!;

    const persisted = await operationalExecutionsRepository.getById(executedRecordId);
    assert.ok(persisted, 'Execution record must be durably persisted in operationalExecutionsRepository');
    assert.equal(persisted.actionId, 'SCHEDULER_RECONCILE');
    assert.equal(persisted.actorId, platformOwnerUser.userId);
    assert.equal(persisted.actorRole, 'PLATFORM_OWNER');
    assert.equal(persisted.targetComponent, 'SCHEDULER');
    assert.equal(persisted.status, 'SUCCEEDED');
    assert.equal(persisted.resultCode, 'SUCCESS');
    assert.ok(persisted.requestedAt, 'requestedAt must be present');
    assert.ok(persisted.completedAt, 'completedAt must be present');
    assert.ok(persisted.createdAt, 'createdAt must be present');

    passed++;
    details.test3_durableRecord = 'PASSED (Canonical execution record durably persisted in repository)';
    console.log('  [PASS] 3. Canonical execution record durably persisted with full lifecycle');
  } catch (err: any) {
    failed++;
    details.test3_durableRecord = `FAILED: ${err.message}`;
    console.error('  [FAIL] 3. Durable execution record:', err.message);
  }

  // 4. Execution History Survives Process Restart
  try {
    // Instantiate fresh service to simulate application restart (empty in-memory cache)
    const freshOpsService = new OperationalRecoveryService();
    const history = await freshOpsService.getExecutionHistoryAsync();

    assert.ok(history.length > 0, 'Durable history must survive restart and return persisted records');
    const matched = history.find((h) => h.id === executedRecordId);
    assert.ok(matched, 'Fresh service must read previously persisted execution record from storage');
    assert.equal(matched?.actionId, 'SCHEDULER_RECONCILE');
    assert.equal(matched?.status, 'SUCCESS');

    // Also verify controller endpoint reads durable history
    const { req, res, next } = createMockReqRes({ user: platformOwnerUser });
    await getActionHistoryHandler(req, res, next);
    assert.equal(res.getStatusCode(), 200);
    const json = res.getJson();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data));
    assert.ok(json.data.some((e: any) => e.id === executedRecordId), 'GET /api/v1/ops/actions/history must return durable history after restart');

    passed++;
    details.test4_historySurvivesRestart = 'PASSED (Execution history survives simulated process restart)';
    console.log('  [PASS] 4. Execution history survives simulated process restart');
  } catch (err: any) {
    failed++;
    details.test4_historySurvivesRestart = `FAILED: ${err.message}`;
    console.error('  [FAIL] 4. History restart survival:', err.message);
  }

  // 5. Idempotency Survives Process Restart
  try {
    const uniqueIdempotencyKey = `idemp_restart_test_${Date.now()}`;

    // Execute first run with unique idempotency key
    const firstRun = await operationalRecoveryService.executeAction({
      actionId: 'SCHEDULER_RESTART',
      actorUserId: platformOwnerUser.userId,
      confirmed: true,
      idempotencyKey: uniqueIdempotencyKey,
    });
    assert.equal(firstRun.status, 'SUCCESS');
    assert.notEqual(firstRun.idempotentReplay, true, 'First execution is not a replay');

    // Simulate process restart with completely isolated new service instance
    const freshService = new OperationalRecoveryService();

    // Replay with identical actionId and idempotencyKey on the fresh instance
    const replayed = await freshService.executeAction({
      actionId: 'SCHEDULER_RESTART',
      actorUserId: platformOwnerUser.userId,
      confirmed: true,
      idempotencyKey: uniqueIdempotencyKey,
    });

    assert.equal(replayed.status, 'SUCCESS');
    assert.equal(replayed.idempotentReplay, true, 'Replay after restart must report idempotentReplay: true');
    assert.equal(replayed.correlationId, firstRun.correlationId, 'Replayed correlationId must match original execution');

    // Ensure idempotentReplay is false for brand new execution with different key
    const nonReplay = await freshService.executeAction({
      actionId: 'SCHEDULER_RESTART',
      actorUserId: platformOwnerUser.userId,
      confirmed: true,
      idempotencyKey: `idemp_brand_new_${Date.now()}`,
    });
    assert.notEqual(nonReplay.idempotentReplay, true, 'New execution must not fabricate replay');

    passed++;
    details.test5_idempotencyRestart = 'PASSED (Consequential recovery action idempotency survives process restart)';
    console.log('  [PASS] 5. Idempotency survives process restart with truthful replay distinction');
  } catch (err: any) {
    failed++;
    details.test5_idempotencyRestart = `FAILED: ${err.message}`;
    console.error('  [FAIL] 5. Idempotency restart:', err.message);
  }

  // 6. Concurrent Operator Protection: Block Conflicting Execution
  try {
    const actionId = 'SCHEDULER_RESTART';
    const lockKey = `op_lock_${actionId}`;

    // Acquire an active operation lock (simulating Operator A currently executing)
    await operationalLocksRepository.create({
      id: lockKey,
      actionId,
      ownerId: 'operator_a_active',
      correlationId: 'corr_op_a_running',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(), // Valid for 60s
    });

    // Operator B simultaneously executes the same action
    const blockedExecution = await operationalRecoveryService.executeAction({
      actionId,
      actorUserId: 'operator_b_simultaneous',
      confirmed: true,
    });

    assert.equal(blockedExecution.status, 'OPERATION_IN_PROGRESS', 'Must block concurrent operation with OPERATION_IN_PROGRESS');
    assert.ok(blockedExecution.details?.activeLockId, 'Must disclose active lock ID');
    assert.ok(blockedExecution.message.includes('currently in progress'), 'Must return truthful progress message');

    // Clean up lock
    await operationalLocksRepository.delete(lockKey);

    // Operator B executes again after lock release -> must succeed
    const unblockedExecution = await operationalRecoveryService.executeAction({
      actionId,
      actorUserId: 'operator_b_subsequent',
      confirmed: true,
    });
    assert.equal(unblockedExecution.status, 'SUCCESS', 'Operation succeeds once active lock is released');

    passed++;
    details.test6_concurrencyLocking = 'PASSED (Concurrent operator execution blocked with OPERATION_IN_PROGRESS)';
    console.log('  [PASS] 6. Concurrent operator protection blocks conflicting execution truthfully');
  } catch (err: any) {
    failed++;
    details.test6_concurrencyLocking = `FAILED: ${err.message}`;
    console.error('  [FAIL] 6. Concurrency locking:', err.message);
  }

  // 7. Abandoned Lock TTL Superseding
  try {
    const actionId = 'FIRESTORE_READINESS_RECHECK';
    const lockKey = `op_lock_${actionId}`;

    // Create an abandoned lock whose TTL expired in the past
    await operationalLocksRepository.create({
      id: lockKey,
      actionId,
      ownerId: 'operator_abandoned',
      correlationId: 'corr_abandoned_dead',
      status: 'ACTIVE',
      createdAt: new Date(Date.now() - 120000).toISOString(),
      expiresAt: new Date(Date.now() - 30000).toISOString(), // Expired 30 seconds ago
    });

    // Execute action -> must detect expired TTL, clear abandoned lock, and proceed
    const recoveredExecution = await operationalRecoveryService.executeAction({
      actionId,
      actorUserId: platformOwnerUser.userId,
      confirmed: true,
    });

    assert.ok(['SUCCESS', 'FAILED'].includes(recoveredExecution.status), 'Must execute past abandoned lock');
    assert.notEqual(recoveredExecution.status, 'OPERATION_IN_PROGRESS', 'Abandoned lock must not block execution');

    passed++;
    details.test7_abandonedLock = 'PASSED (Expired abandoned operation lock safely cleared via TTL)';
    console.log('  [PASS] 7. Abandoned operation locks safely cleared via TTL');
  } catch (err: any) {
    failed++;
    details.test7_abandonedLock = `FAILED: ${err.message}`;
    console.error('  [FAIL] 7. Abandoned lock TTL:', err.message);
  }

  // 8. Authoritative Server-Side Confirmation & Client Override Protection
  try {
    // Attempt high risk action without confirmed: true
    const unconfirmed = await operationalRecoveryService.executeAction({
      actionId: 'DISCORD_RECONNECT',
      actorUserId: platformOwnerUser.userId,
      confirmed: false,
    });
    assert.equal(unconfirmed.status, 'CONFIRMATION_REQUIRED');

    // Attempt client override tampering (downgrade risk / confirmation)
    const tampered = await operationalRecoveryService.executeAction({
      actionId: 'DISCORD_RECONNECT',
      actorUserId: platformOwnerUser.userId,
      confirmed: false,
      parameters: {
        riskLevel: 'LOW',
        confirmationRequired: false,
      },
    });
    assert.equal(tampered.status, 'CONFIRMATION_REQUIRED', 'Client parameters cannot bypass server-side confirmation requirement');

    passed++;
    details.test8_confirmationIntegrity = 'PASSED (Authoritative server-side confirmation enforcement prevents client overrides)';
    console.log('  [PASS] 8. Server-side confirmation enforcement prevents client override tampering');
  } catch (err: any) {
    failed++;
    details.test8_confirmationIntegrity = `FAILED: ${err.message}`;
    console.error('  [FAIL] 8. Confirmation integrity:', err.message);
  }

  // 9. Incident Correlation: Recovery Linked to Incident
  let testIncidentId = '';
  try {
    const inc = await observabilityService.recordIncident({
      type: 'SCHEDULER_STALL_T133',
      component: 'SCHEDULER',
      severity: 'WARNING',
      safeSummary: 'Scheduler stall incident for Task 133 correlation verification',
    });
    testIncidentId = inc.id;

    // Execute recovery linked to incident without auto-resolve
    const recoveryResult = await operationalRecoveryService.executeAction({
      actionId: 'SCHEDULER_RESTART',
      actorUserId: platformOwnerUser.userId,
      confirmed: true,
      incidentId: testIncidentId,
      parameters: { resolveIncident: false },
    });

    assert.equal(recoveryResult.status, 'SUCCESS');
    assert.equal(recoveryResult.incidentId, testIncidentId);

    // Verify incident timeline records attempt and remains OPEN
    const updatedInc = await observabilityService.getIncidentById(testIncidentId);
    assert.ok(updatedInc, 'Incident must exist');
    assert.equal(updatedInc.status, 'OPEN', 'Incident must remain OPEN when resolveIncident is not requested');
    assert.ok(updatedInc.history?.some((h) => h.action.includes('RECOVERY_ATTEMPT_SUCCESS')), 'Incident history must record recovery attempt');
    assert.ok(updatedInc.operatorNotes?.some((n) => n.note.includes('SCHEDULER_RESTART') || n.note.includes('Restart Scheduler Worker')), 'Operator note must record recovery action');

    passed++;
    details.test9_incidentCorrelation = 'PASSED (Recovery action linked to incident timeline without false auto-resolve)';
    console.log('  [PASS] 9. Incident correlation links recovery attempt without false auto-resolution');
  } catch (err: any) {
    failed++;
    details.test9_incidentCorrelation = `FAILED: ${err.message}`;
    console.error('  [FAIL] 9. Incident correlation:', err.message);
  }

  // 10. Incident Correlation: Explicit Verified Resolution
  try {
    assert.ok(testIncidentId, 'testIncidentId must be set');

    // Execute verified recovery with explicit resolve requested
    const resolvedResult = await operationalRecoveryService.executeAction({
      actionId: 'SCHEDULER_RECONCILE',
      actorUserId: platformOwnerUser.userId,
      confirmed: true,
      incidentId: testIncidentId,
      parameters: { resolveIncident: true },
    });

    assert.equal(resolvedResult.status, 'SUCCESS');

    // Verify incident is now resolved with resolvedAt
    const resolvedInc = await observabilityService.getIncidentById(testIncidentId);
    assert.equal(resolvedInc?.status, 'RESOLVED', 'Incident must be marked RESOLVED after verified recovery');
    assert.ok(resolvedInc?.resolvedAt, 'resolvedAt must be set');
    assert.ok(resolvedInc?.history?.some((h) => h.action === 'INCIDENT_RESOLVED'), 'Incident history must record INCIDENT_RESOLVED');

    passed++;
    details.test10_verifiedResolution = 'PASSED (Verified recovery explicitly resolves incident with audit trail)';
    console.log('  [PASS] 10. Verified recovery explicitly resolves incident with complete audit trail');
  } catch (err: any) {
    failed++;
    details.test10_verifiedResolution = `FAILED: ${err.message}`;
    console.error('  [FAIL] 10. Verified resolution:', err.message);
  }

  // 11. Incident Correlation: Failed Recovery Leaves Incident Open
  try {
    const openInc = await observabilityService.recordIncident({
      type: 'LOCK_FAILURE_T133',
      component: 'DURABLE_LOCK',
      severity: 'CRITICAL',
      safeSummary: 'Critical lock incident for failure recovery verification',
    });

    // Execute recovery that will fail (lock ID not found) with resolveIncident: true
    const failedRecovery = await operationalRecoveryService.executeAction({
      actionId: 'CLEAR_STALE_OPERATIONAL_LOCK',
      actorUserId: platformOwnerUser.userId,
      confirmed: true,
      incidentId: openInc.id,
      parameters: {
        lockId: 'non_existent_lock_t133_99999',
        resolveIncident: true, // Should be IGNORED because action failed
      },
    });

    assert.equal(failedRecovery.status, 'LOCK_NOT_FOUND');

    // Verify incident remains OPEN and was NOT falsely resolved
    const inspectInc = await observabilityService.getIncidentById(openInc.id);
    assert.equal(inspectInc?.status, 'OPEN', 'Incident must remain OPEN when recovery action does not succeed');
    assert.equal(inspectInc?.resolvedAt, undefined, 'resolvedAt must remain undefined');
    assert.ok(inspectInc?.history?.some((h) => h.action.includes('RECOVERY_ATTEMPT_LOCK_NOT_FOUND')), 'Incident history notes failed attempt');

    passed++;
    details.test11_failedRecoveryKeepsOpen = 'PASSED (Failed recovery does not resolve incident)';
    console.log('  [PASS] 11. Failed recovery preserves OPEN incident status and records failure attempt');
  } catch (err: any) {
    failed++;
    details.test11_failedRecoveryKeepsOpen = `FAILED: ${err.message}`;
    console.error('  [FAIL] 11. Failed recovery keeps open:', err.message);
  }

  // 12. Safety & Zero Secret Leakage in Persistence and Metadata
  try {
    const rawSecretToken = 'OTAxMjM0NTY3ODkwMTIzNDU2.Gabcdef.test_secret_token_133';
    const rawApiKey = 'AIzaSySecretApiKey133_VeryPrivateValue';

    const execWithSecrets = await operationalRecoveryService.executeAction({
      actionId: 'HEALTH_RECHECK',
      actorUserId: platformOwnerUser.userId,
      confirmed: true,
      parameters: {
        botToken: rawSecretToken,
        apiKey: rawApiKey,
        authorization: 'Bearer secret_auth_bearer_token_133',
        normalParam: 'safe_operational_value',
      },
    });

    assert.ok(execWithSecrets.executionId);
    const persisted = await operationalExecutionsRepository.getById(execWithSecrets.executionId);
    assert.ok(persisted);

    const serializedRecord = JSON.stringify(persisted);
    assert.ok(!serializedRecord.includes(rawSecretToken), 'Raw bot token must not appear in persisted record');
    assert.ok(!serializedRecord.includes(rawApiKey), 'Raw API key must not appear in persisted record');
    assert.ok(!serializedRecord.includes('secret_auth_bearer_token_133'), 'Raw bearer token must not appear in persisted record');
    assert.ok(serializedRecord.includes('[REDACTED]'), 'Sensitive fields must be [REDACTED]');

    passed++;
    details.test12_zeroSecretLeakage = 'PASSED (Deep scrubbing prevents secrets in durable execution records)';
    console.log('  [PASS] 12. Deep scrubbing prevents secret leakage in durable records and metadata');
  } catch (err: any) {
    failed++;
    details.test12_zeroSecretLeakage = `FAILED: ${err.message}`;
    console.error('  [FAIL] 12. Zero secret leakage:', err.message);
  }

  // 13. Platform Role Isolation (Community Users Rejected with HTTP 403)
  try {
    const { req, res, next } = createMockReqRes({
      user: communityAdminUser,
      params: { actionId: 'DISCORD_RECONNECT' },
      body: { confirmed: true },
    });

    await executeRecoveryActionHandler(req, res, next);
    assert.equal(res.getStatusCode(), 403, 'Community Admin must be rejected with HTTP 403 from executing recovery actions');

    const historyReq = createMockReqRes({ user: communityAdminUser });
    await getActionHistoryHandler(historyReq.req, historyReq.res, historyReq.next);
    assert.equal(historyReq.res.getStatusCode(), 403, 'Community Admin must be rejected with HTTP 403 from viewing operational history');

    passed++;
    details.test13_rbacIsolation = 'PASSED (Community-scoped operators strictly prohibited from platform control plane)';
    console.log('  [PASS] 13. Platform recovery endpoints strictly enforce RBAC isolation (HTTP 403)');
  } catch (err: any) {
    failed++;
    details.test13_rbacIsolation = `FAILED: ${err.message}`;
    console.error('  [FAIL] 13. RBAC isolation:', err.message);
  }

  // 14. Unsupported Action Handling and Durability
  try {
    const unsupported = await operationalRecoveryService.executeAction({
      actionId: 'UNSUPPORTED_NUCLEAR_RESET',
      actorUserId: platformOwnerUser.userId,
      confirmed: true,
    });

    assert.equal(unsupported.status, 'OPERATION_NOT_SUPPORTED');
    assert.ok(unsupported.executionId);

    const record = await operationalExecutionsRepository.getById(unsupported.executionId);
    assert.ok(record);
    assert.equal(record.status, 'NOT_SUPPORTED');
    assert.equal(record.resultCode, 'OPERATION_NOT_SUPPORTED');

    passed++;
    details.test14_unsupportedDurability = 'PASSED (Unsupported actions cleanly rejected and recorded)';
    console.log('  [PASS] 14. Unsupported operations cleanly rejected and recorded as NOT_SUPPORTED');
  } catch (err: any) {
    failed++;
    details.test14_unsupportedDurability = `FAILED: ${err.message}`;
    console.error('  [FAIL] 14. Unsupported action durability:', err.message);
  }

  // 15. Controller & HTTP Execution Integrity with Incident Correlation
  try {
    const { req, res, next } = createMockReqRes({
      user: platformOwnerUser,
      params: { actionId: 'SCHEDULER_RECONCILE' },
      body: {
        confirmed: true,
        idempotencyKey: `idemp_controller_${Date.now()}`,
        incidentId: testIncidentId,
        parameters: { auditNote: 'Controller execution test' },
      },
    });

    await executeRecoveryActionHandler(req, res, next);
    assert.equal(res.getStatusCode(), 200);
    const json = res.getJson();
    assert.equal(json.success, true);
    assert.equal(json.data.actionId, 'SCHEDULER_RECONCILE');
    assert.equal(json.data.status, 'SUCCESS');
    assert.equal(json.data.incidentId, testIncidentId);
    assert.ok(json.data.executionId);

    passed++;
    details.test15_controllerIntegrity = 'PASSED (Controller execution handles parameters, idempotency, and incidentId)';
    console.log('  [PASS] 15. Controller recovery handler verifies execution, idempotency, and incident correlation');
  } catch (err: any) {
    failed++;
    details.test15_controllerIntegrity = `FAILED: ${err.message}`;
    console.error('  [FAIL] 15. Controller integrity:', err.message);
  }

  console.log('================================================================================');
  console.log(`TASK 133 SMOKE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
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

if (process.argv[1]?.endsWith('task133-production-operations-durability.test.ts') || process.argv[1]?.endsWith('task133-production-operations-durability.test.js')) {
  runTask133Tests()
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
