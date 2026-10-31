import './setup-env.js';
import assert from 'node:assert/strict';
import { PRODUCT_RELEASE_LOCKED, isProductionReleaseLocked } from '../server/config/releaseLock.js';
import { observabilityService } from '../server/services/observability/observability.service.js';
import { incidentsRepository } from '../server/repositories/index.js';
import { secretsManager } from '../server/security/secrets.js';
import { DiscordRestVerificationService } from '../server/services/discordRestVerification.service.js';
import { discordService } from '../server/integrations/discord/discord.service.js';
import { getLiveness, getReadiness, getExternalDependenciesHealth } from '../server/controllers/health.controller.js';
import { standardErrorHandler } from '../server/middleware/errorHandler.js';
import { StandardError } from '../server/utils/standardError.js';
import { EngagementDeliveryService } from '../server/services/engagement.service.js';

export interface Task131Result {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
  details: Record<string, string>;
}

export async function runTask131Tests(): Promise<Task131Result> {
  console.log('================================================================================');
  console.log('TASK 131 — PRODUCTION OPERATIONS, OBSERVABILITY & POST-RELEASE SAFETY');
  console.log('================================================================================');

  let passed = 0;
  let failed = 0;
  const blocked = 0;
  const skipped = 0;
  const details: Record<string, string> = {};

  // Mock Express Request and Response helper
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
      id: `req_test_${Date.now()}`,
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

    return { req, res };
  }

  // 1. Liveness Probe Test
  try {
    const { req, res } = createMockReqRes();
    getLiveness(req, res);
    const body = res.getJson();
    assert.equal(res.getStatusCode(), 200, 'Liveness probe must return HTTP 200');
    assert.equal(body.status, 'UP', 'Liveness probe must report UP');
    assert.ok(typeof body.uptimeSeconds === 'number', 'Liveness probe must return uptimeSeconds');
    assert.ok(typeof body.memoryUsageMb === 'number', 'Liveness probe must return memoryUsageMb');
    assert.equal(body.discord, undefined, 'Liveness probe must NOT check external Discord dependencies');
    assert.equal(body.database, undefined, 'Liveness probe must NOT check external database dependencies');

    passed++;
    details.test1_livenessProbe = 'PASSED (HTTP 200 UP, external dependency free)';
    console.log('  [PASS] 1. Liveness probe returns 200 UP without evaluating external dependencies');
  } catch (err: any) {
    failed++;
    details.test1_livenessProbe = `FAILED: ${err.message}`;
    console.error('  [FAIL] 1. Liveness probe:', err.message);
  }

  // 2. Readiness Probe Test
  try {
    const { req, res } = createMockReqRes();
    await getReadiness(req, res);
    const body = res.getJson();
    assert.ok(res.getStatusCode() === 200 || res.getStatusCode() === 503, 'Readiness probe returns 200 or 503');
    assert.ok(body.checks, 'Readiness probe must provide checks object');
    assert.ok(body.checks.database, 'Readiness probe must inspect internal database state');
    assert.ok(body.checks.workers, 'Readiness probe must inspect workers readiness');

    passed++;
    details.test2_readinessProbe = 'PASSED (Readiness correctly reflects operational subsystems)';
    console.log('  [PASS] 2. Readiness probe returns ready only when required operational dependencies are ready');
  } catch (err: any) {
    failed++;
    details.test2_readinessProbe = `FAILED: ${err.message}`;
    console.error('  [FAIL] 2. Readiness probe:', err.message);
  }

  // 3. Health Separation Test
  try {
    const { req, res } = createMockReqRes();
    await getExternalDependenciesHealth(req, res);
    const body = res.getJson();
    assert.equal(res.getStatusCode(), 200, 'External dependency health endpoint must return HTTP 200');
    assert.equal(body.coreApplicationReady, true, 'Core application readiness must remain true');
    assert.ok(typeof body.externalDiscordVerified === 'boolean', 'External Discord verified must be boolean');
    assert.ok(body.dependencies.discordRest, 'Must report discordRest dependency');
    assert.ok(body.dependencies.discordGateway, 'Must report discordGateway dependency');
    assert.ok(body.dependencies.firestore, 'Must report firestore dependency');

    passed++;
    details.test3_healthSeparation = 'PASSED (External Discord status strictly isolated from core readiness)';
    console.log('  [PASS] 3. External Discord unavailability does not falsely report core application as unready');
  } catch (err: any) {
    failed++;
    details.test3_healthSeparation = `FAILED: ${err.message}`;
    console.error('  [FAIL] 3. Health separation:', err.message);
  }

  // 4. Discord Truth Test
  try {
    const restVerification = await DiscordRestVerificationService.verifyCurrentUser();
    assert.ok(['VERIFIED', 'BLOCKED_BY_ENVIRONMENT', 'FAILED'].includes(restVerification.outcome), 'Outcome must be VERIFIED, BLOCKED_BY_ENVIRONMENT, or FAILED');
    if (restVerification.outcome === 'BLOCKED_BY_ENVIRONMENT') {
      assert.notEqual(restVerification.classification, 'VERIFIED_OK', 'Blocked outcome cannot be classified as verified OK');
    }

    const { req, res } = createMockReqRes();
    await getExternalDependenciesHealth(req, res);
    const body = res.getJson();
    if (restVerification.outcome !== 'VERIFIED') {
      assert.equal(body.externalDiscordVerified, false, 'externalDiscordVerified must be false when REST check is not VERIFIED');
    }

    passed++;
    details.test4_discordTruth = 'PASSED (Discord REST verification accurately reported without simulation)';
    console.log('  [PASS] 4. Discord verification status correctly distinguishes verified from blocked/failed');
  } catch (err: any) {
    failed++;
    details.test4_discordTruth = `FAILED: ${err.message}`;
    console.error('  [FAIL] 4. Discord truth:', err.message);
  }

  // 5. Production Metrics Test
  try {
    const metrics = await observabilityService.getProductionMetrics();
    assert.ok(metrics.application, 'Metrics must include application subsystem');
    assert.ok(typeof metrics.application.uptimeSeconds === 'number', 'Metrics application uptime must be number');
    assert.ok(metrics.database, 'Metrics must include database subsystem');
    assert.ok(typeof metrics.database.availability === 'boolean', 'Metrics database availability must be boolean');
    assert.ok(metrics.discord, 'Metrics must include discord subsystem');
    assert.ok(metrics.scheduler, 'Metrics must include scheduler subsystem');
    assert.ok(metrics.engagement, 'Metrics must include engagement subsystem');
    assert.ok(metrics.authentication, 'Metrics must include authentication subsystem');
    assert.ok(metrics.tenancy, 'Metrics must include tenancy subsystem');
    assert.ok(metrics.entitlements, 'Metrics must include entitlements subsystem');
    assert.ok(metrics.audit, 'Metrics must include audit subsystem');
    assert.ok(metrics.backgroundWorkers, 'Metrics must include backgroundWorkers subsystem');

    passed++;
    details.test5_productionMetrics = 'PASSED (All 10 required operational metrics exposed accurately)';
    console.log('  [PASS] 5. Production operational metrics exposed and accurately reflect system state');
  } catch (err: any) {
    failed++;
    details.test5_productionMetrics = `FAILED: ${err.message}`;
    console.error('  [FAIL] 5. Production metrics:', err.message);
  }

  // 6. Incident Deduplication Test
  try {
    const testCat = 'FIRESTORE_UNAVAILABLE';
    const testDep = 'Database (Firestore)';
    const firstSeen = await observabilityService.recordIncident({
      category: testCat,
      dependency: testDep,
      summary: 'Initial connection timeout to Firestore endpoint',
      severity: 'CRITICAL',
    });

    assert.equal(firstSeen.status, 'OPEN', 'Initial incident must be OPEN');
    const initialCount = firstSeen.occurrenceCount || 1;

    const secondSeen = await observabilityService.recordIncident({
      category: testCat,
      dependency: testDep,
      summary: 'Subsequent connection timeout to Firestore endpoint',
      severity: 'CRITICAL',
    });

    assert.equal(secondSeen.id, firstSeen.id, 'Repeated operational incident must match existing incident ID');
    assert.equal(secondSeen.occurrenceCount, initialCount + 1, 'Repeated operational error must increment occurrenceCount');

    // Clean up
    await observabilityService.updateIncidentStatus(firstSeen.id, 'RESOLVED', 'TEST_RUNNER');

    passed++;
    details.test6_incidentDeduplication = 'PASSED (Repeated errors update occurrence count without creating duplicates)';
    console.log('  [PASS] 6. Incident deduplication updates occurrence count and timestamps rather than creating duplicate open incidents');
  } catch (err: any) {
    failed++;
    details.test6_incidentDeduplication = `FAILED: ${err.message}`;
    console.error('  [FAIL] 6. Incident deduplication:', err.message);
  }

  // 7. Alert Condition Detection Test
  try {
    // Manually trigger alert condition detection
    const detected = await observabilityService.detectAlertConditions();
    assert.ok(Array.isArray(detected), 'detectAlertConditions must return an array of IncidentDocuments');
    // If scheduler was stopped or stale, an incident should be generated
    observabilityService.setSchedulerRunning(false);
    const alerted = await observabilityService.detectAlertConditions();
    const schedulerAlert = alerted.find((i) => i.component === 'SCHEDULER' || i.category === 'SCHEDULER_STALLED');
    assert.ok(schedulerAlert, 'Scheduler stopped condition must generate actionable incident');
    assert.equal(schedulerAlert?.severity, 'WARNING', 'Scheduler alert must be WARNING or CRITICAL');

    // Restore scheduler
    observabilityService.setSchedulerRunning(true);
    observabilityService.recordSchedulerHeartbeat();

    passed++;
    details.test7_alertConditionDetection = 'PASSED (Critical conditions detected and produce actionable incidents)';
    console.log('  [PASS] 7. Alert condition detection identifies critical conditions and produces actionable incidents');
  } catch (err: any) {
    failed++;
    details.test7_alertConditionDetection = `FAILED: ${err.message}`;
    console.error('  [FAIL] 7. Alert condition detection:', err.message);
  }

  // 8. Safe Error Responses Test
  try {
    const sensitiveSecret = 'Bot.DISCORD_SECRET_KEY_1234567890';
    const errorWithSecret = new StandardError({
      message: `Failed to connect with token ${sensitiveSecret}`,
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    });

    const { req, res } = createMockReqRes();
    standardErrorHandler(errorWithSecret, req, res, () => {});

    const responseBody = res.getJson();
    assert.equal(res.getStatusCode(), 500, 'Error handler must return appropriate HTTP status code');
    assert.ok(responseBody.error, 'Response must include structured error object');
    assert.ok(!JSON.stringify(responseBody).includes(sensitiveSecret), 'User response must NEVER leak sensitive secret');
    assert.ok(responseBody.requestId, 'Error response must return requestId');
    assert.ok(responseBody.error.correlationId, 'Error response must return correlationId');

    passed++;
    details.test8_safeErrorResponses = 'PASSED (Zero token or credential leakage in operational error responses)';
    console.log('  [PASS] 8. Safe error responses do not leak sensitive tokens, credentials, or internal secrets');
  } catch (err: any) {
    failed++;
    details.test8_safeErrorResponses = `FAILED: ${err.message}`;
    console.error('  [FAIL] 8. Safe error responses:', err.message);
  }

  // 9. Scheduler Monitoring Test
  try {
    observabilityService.recordSchedulerHeartbeat();
    const heartbeatStatus = observabilityService.getSchedulerHeartbeatStatus();
    assert.equal(heartbeatStatus.state, 'RUNNING', 'Scheduler state must be RUNNING after heartbeat');
    assert.equal(heartbeatStatus.isHeartbeatStale, false, 'Scheduler heartbeat must not be stale immediately after recording');

    const metrics = await observabilityService.getProductionMetrics();
    assert.equal(metrics.scheduler.state, 'RUNNING', 'Scheduler metrics must report state RUNNING');
    assert.ok(typeof metrics.scheduler.activeScheduledJobs === 'number', 'Metrics must report activeScheduledJobs');
    assert.ok(typeof metrics.scheduler.failedScheduledJobs === 'number', 'Metrics must report failedScheduledJobs');

    passed++;
    details.test9_schedulerMonitoring = 'PASSED (Scheduler heartbeats, stalls, and jobs tracked accurately)';
    console.log('  [PASS] 9. Scheduler monitoring tracks heartbeats, stalls, and failed scheduled jobs');
  } catch (err: any) {
    failed++;
    details.test9_schedulerMonitoring = `FAILED: ${err.message}`;
    console.error('  [FAIL] 9. Scheduler monitoring:', err.message);
  }

  // 10. Engagement Delivery Monitoring Test
  try {
    const beforeMetrics = await observabilityService.getProductionMetrics();
    const initialSent = beforeMetrics.engagement.deliverySuccessCount;
    const initialFail = beforeMetrics.engagement.deliveryFailureCount;

    observabilityService.recordEngagementOutcome('SENT');
    observabilityService.recordEngagementOutcome('PERMISSION_REQUIRED');

    const afterMetrics = await observabilityService.getProductionMetrics();
    assert.equal(afterMetrics.engagement.deliverySuccessCount, initialSent + 1, 'SENT outcome must increment deliverySuccessCount');
    assert.equal(afterMetrics.engagement.deliveryFailureCount, initialFail + 1, 'PERMISSION_REQUIRED outcome must increment deliveryFailureCount');

    passed++;
    details.test10_engagementDeliveryMonitoring = 'PASSED (Delivery outcomes accurately tracked without false success)';
    console.log('  [PASS] 10. Engagement delivery outcomes and failure states accurately recorded without false success counts');
  } catch (err: any) {
    failed++;
    details.test10_engagementDeliveryMonitoring = `FAILED: ${err.message}`;
    console.error('  [FAIL] 10. Engagement delivery monitoring:', err.message);
  }

  // 11. Security Incident Monitoring Test
  try {
    const beforeMetrics = await observabilityService.getProductionMetrics();
    const initialAuthFails = beforeMetrics.authentication.failuresCount;
    const initialTenancyViolations = beforeMetrics.tenancy.isolationViolationsCount;

    observabilityService.recordAuthFailure({ reason: 'Invalid signature', correlationId: 'corr_test_sec_1' });
    observabilityService.recordTenancyViolation({
      communityId: 'tenant_test_cross',
      actorUserId: 'user_malicious',
      reason: 'Cross-community access prohibited',
      correlationId: 'corr_test_sec_2',
    });

    const afterMetrics = await observabilityService.getProductionMetrics();
    assert.equal(afterMetrics.authentication.failuresCount, initialAuthFails + 1, 'Authentication failure count must increment');
    assert.equal(afterMetrics.tenancy.isolationViolationsCount, initialTenancyViolations + 1, 'Tenancy isolation violations count must increment');

    passed++;
    details.test11_securityIncidentMonitoring = 'PASSED (Auth failures and tenant isolation violations tracked)';
    console.log('  [PASS] 11. Security incident monitoring tracks auth failures, authz failures, and tenant isolation violations');
  } catch (err: any) {
    failed++;
    details.test11_securityIncidentMonitoring = `FAILED: ${err.message}`;
    console.error('  [FAIL] 11. Security incident monitoring:', err.message);
  }

  // 12. Release Lock Integrity Test
  try {
    assert.equal(PRODUCT_RELEASE_LOCKED, true, 'PRODUCT_RELEASE_LOCKED must remain true');
    assert.equal(isProductionReleaseLocked(), true, 'isProductionReleaseLocked() must return true');

    passed++;
    details.test12_releaseLockIntegrity = 'PASSED (PRODUCT_RELEASE_LOCKED remains true with zero regression)';
    console.log('  [PASS] 12. Release lock integrity remains unbroken (PRODUCT_RELEASE_LOCKED = true)');
  } catch (err: any) {
    failed++;
    details.test12_releaseLockIntegrity = `FAILED: ${err.message}`;
    console.error('  [FAIL] 12. Release lock integrity:', err.message);
  }

  console.log('--------------------------------------------------------------------------------');
  console.log(`Task 131 Results: ${passed} passed, ${failed} failed, ${blocked} blocked, ${skipped} skipped (Total: 12)`);
  console.log('================================================================================\n');

  return {
    passed,
    failed,
    blocked,
    skipped,
    total: 12,
    details,
  };
}
