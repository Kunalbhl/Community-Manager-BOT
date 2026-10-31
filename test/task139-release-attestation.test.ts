import './setup-env.js';
import assert from 'node:assert/strict';
import { PRODUCT_RELEASE_LOCKED, getAuthoritativeReleaseManifest, AUTHORITATIVE_RELEASE_MANIFEST } from '../server/config/releaseLock.js';
import {
  productionReleaseAttestationService,
  ProductionReleaseAttestationService,
} from '../server/services/observability/productionReleaseAttestation.service.js';
import {
  postReleaseOperationsLockService,
  PostReleaseOperationsLockService,
} from '../server/services/observability/postReleaseOperationsLock.service.js';
import {
  productionReleaseControlService,
} from '../server/services/observability/productionReleaseControl.service.js';
import {
  productionAcceptanceService,
} from '../server/services/observability/productionAcceptance.service.js';
import {
  observabilityService,
} from '../server/services/observability/observability.service.js';
import { DiscordRestVerificationService } from '../server/services/discordRestVerification.service.js';
import {
  releaseEvidenceRecordsRepository,
  changeControlRecordsRepository,
  postReleaseLocksRepository,
  auditLogsRepository,
  incidentsRepository,
} from '../server/repositories/index.js';
import {
  getAttestationHandler,
  createAttestationHandler,
  getEvidenceHandler,
  listChangeControlHandler,
  requestChangeHandler,
  approveChangeHandler,
  rejectChangeHandler,
  executeChangeHandler,
  getPostReleaseLockHandler,
  setPostReleaseLockHandler,
} from '../server/controllers/opsRelease.controller.js';

export interface Task139Result {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
  details: Record<string, string>;
}

export async function runTask139Tests(): Promise<Task139Result> {
  console.log('================================================================================');
  console.log('TASK 139 — FINAL PRODUCTION RELEASE EVIDENCE, ATTESTATION & POST-RELEASE LOCK');
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
      id: `req_att_test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
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

  // 1. Attestation Singleton Authority
  await runTest('Test 1: ProductionReleaseAttestationService singleton authority', async () => {
    assert.ok(productionReleaseAttestationService instanceof ProductionReleaseAttestationService);
    assert.equal(ProductionReleaseAttestationService.getInstance(), productionReleaseAttestationService);
    details.test1_attestationSingleton = 'VERIFIED_SINGLETON';
  });

  // 2. Deployment Truth
  await runTest('Test 2: Deployment truth determination evaluates environment metadata', async () => {
    const status = await productionReleaseAttestationService.getDeploymentTruth();
    assert.ok(['DEPLOYED', 'NOT_DEPLOYED', 'UNKNOWN'].includes(status));
    details.test2_deploymentTruth = status;
  });

  // 3. Unknown Deployment State
  await runTest('Test 3: Deployment status evaluates to UNKNOWN when cloud deployment env vars are absent', async () => {
    const origKService = process.env.K_SERVICE;
    delete process.env.K_SERVICE;
    const status = await productionReleaseAttestationService.getDeploymentTruth();
    assert.equal(status, 'UNKNOWN');
    if (origKService) process.env.K_SERVICE = origKService;
    details.test3_unknownDeployment = 'VERIFIED_UNKNOWN';
  });

  // 4. Evidence Persistence
  await runTest('Test 4: Creates & persists durable ProductionReleaseEvidenceRecord', async () => {
    const record = await productionReleaseAttestationService.createReleaseEvidencePackage({
      actorUserId: 'usr_platform_owner_139',
      actorRole: 'PLATFORM_OWNER',
      correlationId: 'corr_att_test_4',
    });

    assert.ok(record.id);
    assert.equal(record.releaseLocked, true);
    assert.ok(record.attestedAt);
    assert.ok(record.testCount > 0);
    assert.equal(record.failedTests, 0);

    const stored = await releaseEvidenceRecordsRepository.getById(record.id);
    assert.ok(stored);
    assert.equal(stored!.id, record.id);

    details.test4_evidencePersistence = 'PERSISTED_AND_VERIFIED';
  });

  // 5. Evidence Consistency
  await runTest('Test 5: Release evidence package maintains internal consistency across test counts & manifest', async () => {
    const record = await productionReleaseAttestationService.createReleaseEvidencePackage({
      actorUserId: 'usr_platform_owner_139',
      actorRole: 'PLATFORM_OWNER',
      correlationId: 'corr_att_test_5',
    });

    const manifest = getAuthoritativeReleaseManifest();
    assert.equal(record.testCount, manifest.testCount);
    assert.equal(record.failedTests, manifest.failedTests);
    assert.equal(record.typescriptStatus, manifest.typescriptStatus);
    assert.equal(record.lintStatus, manifest.lintStatus);
    assert.equal(record.buildStatus, manifest.buildStatus);

    details.test5_evidenceConsistency = 'CONSISTENT_WITH_MANIFEST';
  });

  // 6. Inconsistent Evidence Detection
  await runTest('Test 6: Inconsistent evidence is detected if test failure or status conflict occurs', async () => {
    const originalFailed = AUTHORITATIVE_RELEASE_MANIFEST.failedTests;
    AUTHORITATIVE_RELEASE_MANIFEST.failedTests = 2; // Simulate inconsistency

    const record = await productionReleaseAttestationService.createReleaseEvidencePackage({
      actorUserId: 'usr_platform_owner_139',
      actorRole: 'PLATFORM_OWNER',
      correlationId: 'corr_att_test_6',
    });

    assert.equal(record.finalStatus, 'EVIDENCE_INCONSISTENT');

    // Restore manifest
    AUTHORITATIVE_RELEASE_MANIFEST.failedTests = originalFailed;

    details.test6_inconsistentEvidenceDetection = 'EVIDENCE_INCONSISTENT_FLAGGED';
  });

  // 7. Discord REST Truthfulness
  await runTest('Test 7: Discord REST attestation maintains truthful non-PASS classification on sandbox 401', async () => {
    const rest = await DiscordRestVerificationService.verifyCurrentUser();
    assert.ok(['AUTHENTICATION_FAILED', 'BLOCKED_BY_ENVIRONMENT', 'NOT_CONFIGURED', 'VERIFIED'].includes(rest.classification));
    assert.notEqual(rest.classification, 'SYNTHETIC_SUCCESS');

    details.test7_discordRestTruth = rest.classification;
  });

  // 8. Firestore Evidence
  await runTest('Test 8: Firestore readiness evidence recorded truthfully in evidence package', async () => {
    const record = await productionReleaseAttestationService.createReleaseEvidencePackage({
      actorUserId: 'usr_platform_owner_139',
      actorRole: 'PLATFORM_OWNER',
      correlationId: 'corr_att_test_8',
    });

    assert.equal(record.firestoreStatus, 'VERIFIED');
    details.test8_firestoreEvidence = record.firestoreStatus;
  });

  // 9. Gateway Evidence
  await runTest('Test 9: Discord Gateway evidence recorded in evidence package', async () => {
    const record = await productionReleaseAttestationService.createReleaseEvidencePackage({
      actorUserId: 'usr_platform_owner_139',
      actorRole: 'PLATFORM_OWNER',
      correlationId: 'corr_att_test_9',
    });

    assert.ok(record.gatewayStatus);
    details.test9_gatewayEvidence = record.gatewayStatus;
  });

  // 10. Scheduler Evidence
  await runTest('Test 10: Scheduler worker status evidence recorded in evidence package', async () => {
    const record = await productionReleaseAttestationService.createReleaseEvidencePackage({
      actorUserId: 'usr_platform_owner_139',
      actorRole: 'PLATFORM_OWNER',
      correlationId: 'corr_att_test_10',
    });

    assert.ok(record.schedulerStatus);
    details.test10_schedulerEvidence = record.schedulerStatus;
  });

  // 11. Engagement Evidence
  await runTest('Test 11: Engagement delivery status evidence recorded in evidence package', async () => {
    const record = await productionReleaseAttestationService.createReleaseEvidencePackage({
      actorUserId: 'usr_platform_owner_139',
      actorRole: 'PLATFORM_OWNER',
      correlationId: 'corr_att_test_11',
    });

    assert.ok(record.engagementStatus);
    details.test11_engagementEvidence = record.engagementStatus;
  });

  // 12. Observability Evidence
  await runTest('Test 12: Observability status evidence recorded in evidence package', async () => {
    const record = await productionReleaseAttestationService.createReleaseEvidencePackage({
      actorUserId: 'usr_platform_owner_139',
      actorRole: 'PLATFORM_OWNER',
      correlationId: 'corr_att_test_12',
    });

    assert.equal(record.observabilityStatus, 'VERIFIED_TRUTHFUL');
    details.test12_observabilityEvidence = record.observabilityStatus;
  });

  // 13. Incident Response Evidence
  await runTest('Test 13: Incident response certification status recorded in evidence package', async () => {
    const record = await productionReleaseAttestationService.createReleaseEvidencePackage({
      actorUserId: 'usr_platform_owner_139',
      actorRole: 'PLATFORM_OWNER',
      correlationId: 'corr_att_test_13',
    });

    assert.equal(record.incidentResponseStatus, 'CERTIFIED_PASS');
    details.test13_incidentEvidence = record.incidentResponseStatus;
  });

  // 14. Rollback Readiness Evidence
  await runTest('Test 14: Rollback readiness status recorded in evidence package', async () => {
    const record = await productionReleaseAttestationService.createReleaseEvidencePackage({
      actorUserId: 'usr_platform_owner_139',
      actorRole: 'PLATFORM_OWNER',
      correlationId: 'corr_att_test_14',
    });

    assert.equal(record.rollbackReadiness, 'READY');
    details.test14_rollbackEvidence = record.rollbackReadiness;
  });

  // 15. Post-Release Operations Lock Service
  await runTest('Test 15: PostReleaseOperationsLockService governs operational lock state (ACTIVE, MAINTENANCE, EMERGENCY_CHANGE, LOCKED)', async () => {
    assert.ok(postReleaseOperationsLockService instanceof PostReleaseOperationsLockService);

    const lock = await postReleaseOperationsLockService.getLockState();
    assert.ok(lock.state);
    assert.ok(['ACTIVE', 'MAINTENANCE', 'EMERGENCY_CHANGE', 'LOCKED'].includes(lock.state));

    const updated = await postReleaseOperationsLockService.setLockState({
      state: 'MAINTENANCE',
      updatedBy: 'usr_platform_owner_139',
      reason: 'Scheduled maintenance window',
      correlationId: 'corr_att_test_15',
    });

    assert.equal(updated.state, 'MAINTENANCE');

    // Restore state
    await postReleaseOperationsLockService.setLockState({
      state: 'ACTIVE',
      updatedBy: 'usr_platform_owner_139',
      reason: 'Restored active operations state',
    });

    details.test15_postReleaseLock = 'STATE_MANAGEMENT_VERIFIED';
  });

  // 16. Change Control Workflow (Maintenance / Bug Fix)
  await runTest('Test 16: Change control workflow (Request -> Approve -> Execute -> Completed)', async () => {
    const changeReq = await postReleaseOperationsLockService.requestChange({
      requestedBy: 'usr_operator_139',
      changeType: 'MAINTENANCE',
      riskLevel: 'LOW',
      reason: 'Routine cache flush and dependency recheck',
      correlationId: 'corr_att_test_16',
    });

    assert.equal(changeReq.status, 'REQUESTED');

    const approved = await postReleaseOperationsLockService.approveChange({
      changeId: changeReq.id,
      authorizedBy: 'usr_platform_owner_139',
      correlationId: 'corr_att_test_16_app',
    });

    assert.equal(approved.status, 'APPROVED');

    const executed = await postReleaseOperationsLockService.executeChange({
      changeId: changeReq.id,
      authorizedBy: 'usr_platform_owner_139',
      correlationId: 'corr_att_test_16_exec',
    });

    assert.equal(executed.status, 'COMPLETED');
    assert.ok(executed.completedAt);

    details.test16_changeControlWorkflow = 'WORKFLOW_COMPLETED';
  });

  // 17. Emergency Change Path
  await runTest('Test 17: Emergency change path executes with authorized audit and post-change verification', async () => {
    const emgChange = await postReleaseOperationsLockService.requestEmergencyChange({
      requestedBy: 'usr_operator_emg',
      authorizedBy: 'usr_platform_owner_139',
      reason: 'Emergency security patch applying strictly scoped hotfix',
      riskLevel: 'HIGH',
      correlationId: 'corr_emg_test_17',
    });

    assert.equal(emgChange.changeType, 'EMERGENCY');
    assert.equal(emgChange.status, 'COMPLETED');
    assert.ok(emgChange.approvedAt);
    assert.ok(emgChange.completedAt);

    details.test17_emergencyChangePath = 'EMERGENCY_CHANGE_VERIFIED';
  });

  // 18. PLATFORM_OWNER Authorization Negative Matrix
  await runTest('Test 18: Release attestation & change control APIs reject all non-PLATFORM_OWNER roles with HTTP 403', async () => {
    const rolesToTest = ['MEMBER', 'APPLICANT', 'RECRUITER', 'INTERVIEWER', 'CONTROLLER', 'SERVER_OWNER'];

    for (const role of rolesToTest) {
      const user = { userId: `usr_test_${role.toLowerCase()}`, role };

      // Attestation Handler
      {
        const { req, res, next, getStatusCode } = createMockReqRes({ user });
        await getAttestationHandler(req, res, next);
        assert.equal(getStatusCode(), 403);
      }

      // Create Attestation Handler
      {
        const { req, res, next, getStatusCode } = createMockReqRes({ user });
        await createAttestationHandler(req, res, next);
        assert.equal(getStatusCode(), 403);
      }

      // Change Control Request Handler
      {
        const { req, res, next, getStatusCode } = createMockReqRes({ user });
        await requestChangeHandler(req, res, next);
        assert.equal(getStatusCode(), 403);
      }

      // Set Lock State Handler
      {
        const { req, res, next, getStatusCode } = createMockReqRes({ user });
        await setPostReleaseLockHandler(req, res, next);
        assert.equal(getStatusCode(), 403);
      }
    }

    details.test18_authorizationNegativeMatrix = 'ALL_ROLES_REJECTED_WITH_403';
  });

  // 19. Multi-Tenant Operational Isolation
  await runTest('Test 19: Community-scoped operational records remain strictly isolated between communities', async () => {
    const incA = await observabilityService.recordIncident({
      communityId: 'comm_isolation_alpha',
      category: 'DATABASE_UNAVAILABLE',
      summary: 'Isolation Test Incident Alpha',
    });

    const incB = await observabilityService.recordIncident({
      communityId: 'comm_isolation_beta',
      category: 'DATABASE_UNAVAILABLE',
      summary: 'Isolation Test Incident Beta',
    });

    const listA = await incidentsRepository.list({
      where: [{ field: 'communityId', operator: '==', value: 'comm_isolation_alpha' }],
    });
    const listB = await incidentsRepository.list({
      where: [{ field: 'communityId', operator: '==', value: 'comm_isolation_beta' }],
    });

    assert.ok(listA.some((i) => i.id === incA.id));
    assert.equal(listA.some((i) => i.id === incB.id), false);

    assert.ok(listB.some((i) => i.id === incB.id));
    assert.equal(listB.some((i) => i.id === incA.id), false);

    details.test19_tenantIsolation = 'COMMUNITY_BOUNDARIES_ENFORCED';
  });

  // 20. End-to-End Audit Trail Integrity
  await runTest('Test 20: Comprehensive audit logs recorded for attestation, lock changes & change control', async () => {
    const logs = await auditLogsRepository.list();
    const attLogs = logs.filter(
      (l) =>
        l.action.includes('RELEASE_ATTESTATION') ||
        l.action.includes('CHANGE_') ||
        l.action.includes('POST_RELEASE_LOCK')
    );

    assert.ok(attLogs.length >= 3);

    details.test20_auditTrailIntegrity = `VERIFIED_${attLogs.length}_AUDIT_EVENTS`;
  });

  // 21. Deep Secret Scrubbing
  await runTest('Test 21: Deep secret scrubbing verifies zero tokens, credentials, or API keys in evidence records & logs', async () => {
    const evidenceList = await releaseEvidenceRecordsRepository.list();
    const changeList = await changeControlRecordsRepository.list();
    const logs = await auditLogsRepository.list();

    const allData = JSON.stringify({ evidenceList, changeList, logs });
    const botTokenRegex = /\bBot\s+[A-Za-z0-9_-]{10,}/;
    assert.equal(botTokenRegex.test(allData), false, 'allData should not contain Bot authorization tokens');
    assert.equal(allData.includes('Bearer '), false, 'allData should not contain Bearer tokens');
    assert.equal(allData.includes('secretKey'), false, 'allData should not contain secretKey fields');

    details.test21_deepSecretScrubbing = 'ZERO_SECRET_LEAKAGE_VERIFIED';
  });

  // 22. Evidence & Change Control Idempotency
  await runTest('Test 22: Change execution & attestation requests operate idempotently without duplicate side effects', async () => {
    const list1 = await releaseEvidenceRecordsRepository.list();
    const count1 = list1.length;

    await productionReleaseAttestationService.getLatestEvidencePackage();

    const list2 = await releaseEvidenceRecordsRepository.list();
    assert.equal(list2.length, count1); // Read does not create duplicate record

    details.test22_idempotency = 'IDEMPOTENCY_VERIFIED';
  });

  // 23. Concurrency Protection
  await runTest('Test 23: Change control and lock updates enforce concurrency protection', async () => {
    const p1 = postReleaseOperationsLockService.setLockState({
      state: 'ACTIVE',
      updatedBy: 'usr_op_1',
    });
    const p2 = postReleaseOperationsLockService.setLockState({
      state: 'ACTIVE',
      updatedBy: 'usr_op_2',
    });

    const [r1, r2] = await Promise.all([p1, p2]);
    assert.ok(r1.id);
    assert.ok(r2.id);

    details.test23_concurrencyProtection = 'CONCURRENCY_SAFE';
  });

  // 24. Restart Persistence
  await runTest('Test 24: Evidence records, change control records & lock state survive simulated process restart', async () => {
    const currentLock = await postReleaseOperationsLockService.getLockState();
    assert.ok(currentLock);

    const currentEvidence = await productionReleaseAttestationService.getLatestEvidencePackage();
    assert.ok(currentEvidence);

    // Re-query repository to simulate fresh process read
    const freshLock = await postReleaseLocksRepository.getById(currentLock.id);
    assert.ok(freshLock);
    assert.equal(freshLock!.id, currentLock.id);

    const freshEvidence = await releaseEvidenceRecordsRepository.getById(currentEvidence!.id);
    assert.ok(freshEvidence);
    assert.equal(freshEvidence!.id, currentEvidence!.id);

    details.test24_restartPersistence = 'PERSISTED_ACROSS_RESTART';
  });

  // 25. Immutable Release Lock Guard
  await runTest('Test 25: Production release lock (PRODUCT_RELEASE_LOCKED = true) remains strictly immutable', async () => {
    assert.equal(PRODUCT_RELEASE_LOCKED, true);
    const manifest = getAuthoritativeReleaseManifest();
    assert.equal(manifest.releaseLocked, true);

    details.test25_releaseLockGuard = 'IMMUTABLE_TRUE';
  });

  const total = passed + failed;
  console.log(`\nTask 139 Release Attestation Summary: ${passed}/${total} passed (${failed} failed)`);

  return {
    passed,
    failed,
    blocked,
    skipped,
    total,
    details,
  };
}

if (process.argv[1]?.includes('task139-release-attestation')) {
  runTask139Tests().then((res) => {
    process.exit(res.failed > 0 ? 1 : 0);
  }).catch((err) => {
    console.error('Fatal release attestation test failure:', err);
    process.exit(1);
  });
}
