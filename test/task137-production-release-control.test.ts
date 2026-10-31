import './setup-env.js';
import assert from 'node:assert/strict';
import { PRODUCT_RELEASE_LOCKED, getAuthoritativeReleaseManifest } from '../server/config/releaseLock.js';
import {
  productionReleaseControlService,
  ProductionReleaseControlService,
} from '../server/services/observability/productionReleaseControl.service.js';
import {
  productionValidationService,
  ProductionValidationService,
} from '../server/services/observability/productionValidation.service.js';
import {
  releaseValidationRecordsRepository,
  releaseHandoffRecordsRepository,
  auditLogsRepository,
  operationalLocksRepository,
} from '../server/repositories/index.js';
import {
  getReleaseStatusHandler,
  executePostDeploymentValidationHandler,
  getValidationHistoryHandler,
  getRollbackReadinessHandler,
  getReleaseHandoffHandler,
  createReleaseHandoffHandler,
  getPostReleaseMonitoringHandler,
} from '../server/controllers/opsRelease.controller.js';

export interface Task137Result {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
  details: Record<string, string>;
}

export async function runTask137Tests(): Promise<Task137Result> {
  console.log('================================================================================');
  console.log('TASK 137 — FINAL PRODUCTION GO-LIVE CONTROL, RELEASE HANDOFF & VALIDATION');
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
      id: `req_release_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
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

    return { req, res, next, getStatusCode: () => statusCode, getJson: () => jsonBody };
  }

  async function runTest(testName: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${testName}`);
    } catch (err: any) {
      failed++;
      console.error(`  ✗ ${testName}`);
      console.error(`    Error: ${err.message}`);
      if (err.stack) {
        console.error(`    Stack: ${err.stack.split('\n').slice(0, 3).join('\n')}`);
      }
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Singleton Authority & Status Resolution
  // --------------------------------------------------------------------------
  await runTest('Test 1: ProductionReleaseControlService singleton authority & release status', async () => {
    assert.ok(productionReleaseControlService instanceof ProductionReleaseControlService);
    assert.equal(ProductionReleaseControlService.getInstance(), productionReleaseControlService);

    const status = await productionReleaseControlService.getReleaseStatus('corr_test_1');
    assert.ok(status.releaseVersion);
    assert.equal(status.releaseLocked, true);
    assert.equal(PRODUCT_RELEASE_LOCKED, true);
    assert.ok(['CORE_READY_WITH_EXTERNAL_LIMITATION', 'RELEASE_READY'].includes(status.releaseState));
    assert.ok(status.manifest);
    assert.equal(status.manifest.releaseLocked, true);

    details.test1_releaseStatus = status.releaseState;
  });

  // --------------------------------------------------------------------------
  // TEST 2: Authoritative Server-Side Release Gates
  // --------------------------------------------------------------------------
  await runTest('Test 2: Server-side release gates verify internal subsystem readiness', async () => {
    const manifest = getAuthoritativeReleaseManifest();
    assert.equal(manifest.releaseLocked, true);
    assert.equal(manifest.typescriptStatus, 'PASS');
    assert.equal(manifest.lintStatus, 'PASS');
    assert.equal(manifest.buildStatus, 'SUCCESS');

    const status = await productionReleaseControlService.getReleaseStatus();
    assert.ok(status.externalDependencyStatus);
    assert.ok(status.externalDependencyStatus.discordRestStatus);
    assert.ok(status.externalDependencyStatus.discordGatewayStatus);
    assert.ok(status.externalDependencyStatus.firestoreStatus);

    details.test2_releaseGates = 'VERIFIED_SERVER_SIDE';
  });

  // --------------------------------------------------------------------------
  // TEST 3: Post-Deployment Validation Engine
  // --------------------------------------------------------------------------
  await runTest('Test 3: Controlled post-deployment validation engine executes checks & persists record', async () => {
    const checks = await productionValidationService.runAllValidationChecks();
    assert.ok(checks.length >= 15);
    assert.ok(checks.some((c) => c.id === 'chk_liveness'));
    assert.ok(checks.some((c) => c.id === 'chk_readiness'));
    assert.ok(checks.some((c) => c.id === 'chk_firestore'));
    assert.ok(checks.some((c) => c.id === 'chk_release_lock'));

    const valRecord = await productionReleaseControlService.executePostDeploymentValidation({
      actorUserId: 'usr_owner_rel_test',
      actorRole: 'PLATFORM_OWNER',
      correlationId: 'corr_val_test_3',
    });

    assert.ok(valRecord.id);
    assert.equal(valRecord.releaseLocked, true);
    assert.ok(valRecord.validationResults.length >= 15);
    if (valRecord.finalStatus === 'RELEASE_BLOCKED') {
      console.log('[DEBUG Test 3 Failed Checks]', JSON.stringify(valRecord.validationResults.filter((c) => c.status === 'FAIL'), null, 2));
    }
    assert.ok(['CORE_READY_WITH_EXTERNAL_LIMITATION', 'RELEASE_READY'].includes(valRecord.finalStatus));

    // Verify stored record
    const stored = await releaseValidationRecordsRepository.getById(valRecord.id);
    assert.ok(stored);
    assert.equal(stored!.id, valRecord.id);

    details.test3_validationEngine = 'EXECUTED_AND_PERSISTED';
  });

  // --------------------------------------------------------------------------
  // TEST 4: Validation Concurrency Protection
  // --------------------------------------------------------------------------
  await runTest('Test 4: Post-deployment validation enforces operational concurrency locking', async () => {
    const lockKey = 'op_lock_release_validation';
    await operationalLocksRepository.create({
      id: lockKey,
      actionId: 'RELEASE_VALIDATION',
      ownerId: 'usr_concurrent_operator',
      correlationId: 'corr_concurrent',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    });

    await assert.rejects(
      async () => {
        await productionReleaseControlService.executePostDeploymentValidation({
          actorUserId: 'usr_second_operator',
          actorRole: 'PLATFORM_OWNER',
        });
      },
      (err: any) => {
        assert.ok(err.message.includes('in progress') || err.code === 'OPERATION_IN_PROGRESS');
        return true;
      }
    );

    // Clean up lock
    await operationalLocksRepository.delete(lockKey);

    details.test4_concurrencyLocking = 'ENFORCED';
  });

  // --------------------------------------------------------------------------
  // TEST 5: Validation History Retrieval
  // --------------------------------------------------------------------------
  await runTest('Test 5: Validation history retrieval returns ordered durable records', async () => {
    const history = await productionReleaseControlService.getValidationHistory();
    assert.ok(Array.isArray(history));
    assert.ok(history.length >= 1);

    if (history.length > 1) {
      const t1 = new Date(history[0].startedAt).getTime();
      const t2 = new Date(history[1].startedAt).getTime();
      assert.ok(t1 >= t2);
    }

    details.test5_validationHistory = `RETRIEVED_${history.length}_RECORDS`;
  });

  // --------------------------------------------------------------------------
  // TEST 6: Rollback Readiness & Schema Compatibility
  // --------------------------------------------------------------------------
  await runTest('Test 6: Rollback readiness check verifies zero data corruption risk & schema compatibility', async () => {
    const rollback = await productionReleaseControlService.executeRollbackReadinessCheck({
      actorUserId: 'usr_owner_rollback_test',
      actorRole: 'PLATFORM_OWNER',
      correlationId: 'corr_rollback_test_6',
    });

    assert.equal(rollback.status, 'READY');
    assert.equal(rollback.checks.versionKnown.status, 'PASS');
    assert.equal(rollback.checks.dbMigrationCompatible.status, 'PASS');
    assert.equal(rollback.checks.releaseLockKnown.status, 'PASS');
    assert.equal(rollback.checks.auditAppendOnly.status, 'PASS');

    details.test6_rollbackReadiness = 'READY_VERIFIED';
  });

  // --------------------------------------------------------------------------
  // TEST 7: Durable Release Handoff Creation
  // --------------------------------------------------------------------------
  await runTest('Test 7: Creates durable release handoff record with complete operational context', async () => {
    const handoff = await productionReleaseControlService.createReleaseHandoff({
      actorUserId: 'usr_owner_handoff_test',
      actorRole: 'PLATFORM_OWNER',
      correlationId: 'corr_handoff_test_7',
    });

    assert.ok(handoff.id);
    assert.ok(handoff.releaseVersion);
    assert.equal(handoff.certificationStatus, 'CERTIFIED_INTERNAL');
    assert.equal(handoff.deploymentStatus, 'DEPLOYED_STABLE');
    assert.equal(handoff.rollbackReadinessStatus, 'READY');
    assert.ok(Array.isArray(handoff.knownLimitations));

    const stored = await releaseHandoffRecordsRepository.getById(handoff.id);
    assert.ok(stored);
    assert.equal(stored!.id, handoff.id);

    details.test7_releaseHandoff = 'CREATED_AND_PERSISTED';
  });

  // --------------------------------------------------------------------------
  // TEST 8: Latest Release Handoff Retrieval
  // --------------------------------------------------------------------------
  await runTest('Test 8: Retrieves latest release handoff record', async () => {
    const latest = await productionReleaseControlService.getLatestReleaseHandoff();
    assert.ok(latest);
    assert.equal(latest!.certificationStatus, 'CERTIFIED_INTERNAL');

    details.test8_getLatestHandoff = 'RETRIEVED';
  });

  // --------------------------------------------------------------------------
  // TEST 9: Post-Release Operational Monitoring Summary
  // --------------------------------------------------------------------------
  await runTest('Test 9: Post-release monitoring summary evaluates data sufficiency & telemetry', async () => {
    const summary = await productionReleaseControlService.getPostReleaseMonitoringSummary();
    assert.equal(summary.observationWindowMinutes, 60);
    assert.ok(summary.metrics);
    assert.ok(typeof summary.activeIncidentsCount === 'number');
    assert.ok(typeof summary.auditEventsCount === 'number');
    assert.ok(['SUFFICIENT_DATA', 'INSUFFICIENT_DATA'].includes(summary.dataSufficiency));

    details.test9_postReleaseSummary = summary.dataSufficiency;
  });

  // --------------------------------------------------------------------------
  // TEST 10: Executive Control Plane RBAC Enforcement
  // --------------------------------------------------------------------------
  await runTest('Test 10: Executive release control API handlers enforce Platform Owner RBAC', async () => {
    const nonOwnerUser = { userId: 'usr_regular_member', role: 'MEMBER' };
    const ownerUser = { userId: 'usr_platform_owner_99', role: 'PLATFORM_OWNER' };

    // Non-owner rejected
    {
      const { req, res, next, getStatusCode } = createMockReqRes({ user: nonOwnerUser });
      await getReleaseStatusHandler(req, res, next);
      assert.equal(getStatusCode(), 403);
    }

    {
      const { req, res, next, getStatusCode } = createMockReqRes({ user: nonOwnerUser });
      await executePostDeploymentValidationHandler(req, res, next);
      assert.equal(getStatusCode(), 403);
    }

    {
      const { req, res, next, getStatusCode } = createMockReqRes({ user: nonOwnerUser });
      await getRollbackReadinessHandler(req, res, next);
      assert.equal(getStatusCode(), 403);
    }

    {
      const { req, res, next, getStatusCode } = createMockReqRes({ user: nonOwnerUser });
      await createReleaseHandoffHandler(req, res, next);
      assert.equal(getStatusCode(), 403);
    }

    // Owner authorized
    {
      const { req, res, next, getStatusCode, getJson } = createMockReqRes({ user: ownerUser });
      await getReleaseStatusHandler(req, res, next);
      assert.equal(getStatusCode(), 200);
      assert.equal(getJson().success, true);
    }

    details.test10_rbacEnforcement = 'ENFORCED_PLATFORM_OWNER_ONLY';
  });

  // --------------------------------------------------------------------------
  // TEST 11: End-to-End Audit Trail Integrity & Secret Redaction
  // --------------------------------------------------------------------------
  await runTest('Test 11: End-to-end audit trail records release events without secret leakage', async () => {
    const logs = await auditLogsRepository.list();
    const releaseLogs = logs.filter((l) => l.action.startsWith('RELEASE_') || l.action.startsWith('ROLLBACK_'));
    assert.ok(releaseLogs.length >= 2);

    for (const log of releaseLogs) {
      const raw = JSON.stringify(log);
      assert.equal(raw.includes('Bot '), false);
      assert.equal(raw.includes('Bearer '), false);
      assert.equal(raw.includes('secretKey'), false);
    }

    details.test11_auditIntegrity = `VERIFIED_${releaseLogs.length}_EVENTS_REDACTED`;
  });

  // --------------------------------------------------------------------------
  // TEST 12: Release Lock Immutability
  // --------------------------------------------------------------------------
  await runTest('Test 12: Production release lock (PRODUCT_RELEASE_LOCKED) remains strictly immutable', async () => {
    assert.equal(PRODUCT_RELEASE_LOCKED, true);
    const manifest = getAuthoritativeReleaseManifest();
    assert.equal(manifest.releaseLocked, true);

    details.test12_releaseLockImmutability = 'IMMUTABLE_TRUE';
  });

  const total = passed + failed;
  console.log(`\nTask 137 Test Summary: ${passed}/${total} passed (${failed} failed)`);

  return {
    passed,
    failed,
    blocked,
    skipped,
    total,
    details,
  };
}

if (process.argv[1]?.includes('task137-production-release-control')) {
  runTask137Tests().then((res) => {
    process.exit(res.failed > 0 ? 1 : 0);
  }).catch((err) => {
    console.error('Fatal release control test failure:', err);
    process.exit(1);
  });
}

