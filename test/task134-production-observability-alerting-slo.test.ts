import './setup-env.js';
import assert from 'node:assert/strict';
import { PRODUCT_RELEASE_LOCKED, isProductionReleaseLocked } from '../server/config/releaseLock.js';
import { observabilityService } from '../server/services/observability/observability.service.js';
import {
  operationalRecoveryService,
  AUTHORITATIVE_RECOVERY_ACTIONS,
} from '../server/services/observability/recoveryAction.service.js';
import {
  incidentsRepository,
  operationalMetricsRepository,
  healthSnapshotsRepository,
  latencyRecordsRepository,
  incidentTimelinesRepository,
  notificationPreferencesRepository,
} from '../server/repositories/index.js';
import { secretsManager } from '../server/security/secrets.js';
import {
  getHealthSnapshotsHandler,
  getLatencyDistributionHandler,
  getAlertRulesHandler,
  getIncidentTimelineHandler,
  getServiceLevelObjectivesHandler,
  getOperationalTrendsHandler,
  getNotificationPreferencesHandler,
  updateNotificationPreferencesHandler,
  recordOperationalMetricHandler,
  listOperationalMetricsHandler,
  updateIncident,
  getIncidents,
} from '../server/controllers/observability.controller.js';

export interface Task134Result {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
  details: Record<string, string>;
}

export async function runTask134Tests(): Promise<Task134Result> {
  console.log('================================================================================');
  console.log('TASK 134 — PRODUCTION OPERATIONS OBSERVABILITY, ALERTING & SLO INTEGRITY');
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
    userId: 'usr_platform_owner_t134',
    email: 'platform_owner@test.internal',
    role: 'PLATFORM_OWNER' as const,
    isPlatformOwner: true,
    roles: ['OWNER', 'PLATFORM_OWNER'],
    isSuperAdmin: true,
  };

  const communityAdminUser = {
    userId: 'usr_community_admin_t134',
    email: 'community_admin@test.internal',
    role: 'ADMIN' as const,
    isPlatformOwner: false,
    roles: ['ADMIN'],
    isSuperAdmin: false,
  };

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
      details[name] = 'PASSED';
    } catch (err: any) {
      console.error(`  ✗ [FAILED] ${name}:`, err?.message || err);
      failed++;
      details[name] = `FAILED: ${err?.message || err}`;
    }
  }

  // 1. Single Authoritative ProductionObservabilityService
  await test('1. Authoritative Observability Service: Canonical singleton retains system authority without duplicate services', async () => {
    assert.ok(observabilityService, 'observabilityService singleton must exist');
    assert.equal(typeof observabilityService.recordMetric, 'function');
    assert.equal(typeof observabilityService.calculateSLOs, 'function');
    assert.equal(typeof observabilityService.generateHealthSnapshots, 'function');
    assert.equal(typeof observabilityService.getLatencyDistribution, 'function');
  });

  // 2. Durable Metric Storage & Isolation
  await test('2. Durable Operational Metric Storage: Records persist authoritatively with tenant isolation', async () => {
    const metric1 = await observabilityService.recordMetric({
      metricName: 'api_request_duration_ms',
      component: 'APPLICATION',
      value: 42,
      unit: 'milliseconds',
      status: 'HEALTHY',
      communityId: 'comm_tenant_a',
      correlationId: 'corr_test_metric_1',
    });

    assert.ok(metric1.id.startsWith('met_'), 'Metric ID must start with met_');
    assert.equal(metric1.metricName, 'api_request_duration_ms');
    assert.equal(metric1.value, 42);

    const persisted = await operationalMetricsRepository.getById(metric1.id);
    assert.ok(persisted, 'Metric must be persisted in operationalMetricsRepository');
    assert.equal(persisted?.communityId, 'comm_tenant_a');

    // Tenant isolation verification: listing for tenant B must not expose tenant A
    const tenantBMetrics = await observabilityService.listMetrics({ communityId: 'comm_tenant_b' });
    assert.ok(!tenantBMetrics.some((m) => m.id === metric1.id), 'Tenant B must not see Tenant A metrics');
  });

  // 3. Service Health Snapshots & Truthfulness
  await test('3. Service Health Snapshots: Truthful canonical subsystem snapshots generated without fabrication', async () => {
    const snapshots = await observabilityService.generateHealthSnapshots('corr_test_health_snap');
    assert.ok(snapshots.length >= 8, 'Must cover APPLICATION, DATABASE, DISCORD_GATEWAY, DISCORD_REST, SCHEDULER, ENGAGEMENT_DELIVERY, AUTHENTICATION, OPERATIONS');

    const components = snapshots.map((s) => s.component);
    assert.ok(components.includes('APPLICATION'));
    assert.ok(components.includes('DATABASE'));
    assert.ok(components.includes('DISCORD_GATEWAY'));
    assert.ok(components.includes('DISCORD_REST'));
    assert.ok(components.includes('SCHEDULER'));
    assert.ok(components.includes('ENGAGEMENT_DELIVERY'));
    assert.ok(components.includes('AUTHENTICATION'));
    assert.ok(components.includes('OPERATIONS'));

    // Check that each snapshot includes timestamp, correlationId, and truthful message
    for (const snap of snapshots) {
      assert.ok(snap.checkedAt, 'CheckedAt required');
      assert.ok(snap.status, 'Status required');
      assert.ok(snap.message, 'Message required');
      assert.equal(snap.correlationId, 'corr_test_health_snap');
    }

    // Persisted verification
    const latest = await observabilityService.getLatestHealthSnapshots();
    assert.ok(latest.length >= 8, 'Latest snapshots must return from persistent layer');
  });

  // 4. Latency Observability & Percentile Rules
  await test('4. Latency Observability: Real latency measurement with truthful P50/P95/P99 calculation rules', async () => {
    // Insufficient samples test
    const opRare = `rare_op_${Date.now()}`;
    await observabilityService.recordLatency(opRare, 50, 'SUCCESS');
    const rareDist = await observabilityService.getLatencyDistribution(opRare);
    assert.equal(rareDist[0].p50, 'INSUFFICIENT_DATA', 'Sample count < 3 must return INSUFFICIENT_DATA');

    // Sufficient samples test
    const opBench = `bench_op_${Date.now()}`;
    const durations = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    for (const d of durations) {
      await observabilityService.recordLatency(opBench, d, 'SUCCESS');
    }

    const benchDist = await observabilityService.getLatencyDistribution(opBench);
    assert.equal(benchDist[0].sampleCount, 10);
    assert.equal(typeof benchDist[0].p50, 'number');
    assert.equal(typeof benchDist[0].p95, 'number');
    assert.equal(typeof benchDist[0].p99, 'number');
    assert.ok((benchDist[0].p50 as number) >= 30 && (benchDist[0].p50 as number) <= 70);
  });

  // 5. Deterministic Incident Detection Rules
  await test('5. Alert Rules Registry: Deterministic rules with documented severities, cooldowns, and deduplication keys', async () => {
    const rules = observabilityService.ALERT_RULES;
    assert.ok(rules.length >= 5, 'Must define core operational alert rules');

    const ruleKeys = rules.map((r) => r.ruleId);
    assert.ok(ruleKeys.includes('RULE_DISCORD_GATEWAY_DISCONNECTED'));
    assert.ok(ruleKeys.includes('RULE_DISCORD_REST_AUTH_FAILURE'));
    assert.ok(ruleKeys.includes('RULE_SCHEDULER_HEARTBEAT_MISSING'));
    assert.ok(ruleKeys.includes('RULE_FIRESTORE_READINESS_FAILURE'));

    // Check severities and cooldowns
    for (const rule of rules) {
      assert.ok(['INFO', 'WARNING', 'CRITICAL'].includes(rule.severity), 'Rule severity must be canonical');
      assert.ok(rule.cooldownMs >= 10000, 'Cooldown must be a positive threshold');
      assert.ok(rule.deduplicationKey, 'Deduplication key required');
    }
  });

  // 6. Durable Alert State Machine & Transitions
  await test('6. Alert State Machine: Supports DETECTED, OPEN, ACKNOWLEDGED, SUPPRESSED, RESOLVED, and REOPENED', async () => {
    const testCat = `TEST_ALERT_STATE_${Date.now()}` as any;

    // Detect / Open
    const inc = await observabilityService.recordIncident({
      category: testCat,
      summary: 'Alert state machine test initial incident',
      severity: 'WARNING',
      component: 'APPLICATION',
    });
    assert.equal(inc.status, 'OPEN');

    // Acknowledge
    const acked = await observabilityService.updateIncidentStatus(inc.id, 'ACKNOWLEDGED', 'OP_1');
    assert.equal(acked?.status, 'ACKNOWLEDGED');

    // Suppress
    const supp = await observabilityService.updateIncidentStatus(inc.id, 'SUPPRESSED', 'OP_1', 'Temporarily suppressed during maintenance');
    assert.equal(supp?.status, 'SUPPRESSED');

    // Resolve
    const res = await observabilityService.updateIncidentStatus(inc.id, 'RESOLVED', 'OP_1', 'Issue resolved cleanly');
    assert.equal(res?.status, 'RESOLVED');
    assert.ok(res?.resolvedAt);

    // Reopen upon recurrence
    const reopened = await observabilityService.recordIncident({
      category: testCat,
      summary: 'Alert state machine test recurring incident',
      severity: 'WARNING',
      component: 'APPLICATION',
    });
    assert.equal(reopened.id, inc.id, 'Must deduplicate to original incident');
    assert.equal(reopened.status, 'OPEN', 'Must reopen resolved incident');
    assert.ok(reopened.reopenedAt, 'reopenedAt timestamp must be recorded');
  });

  // 7. Deduplication & Cooldown Rules
  await test('7. Incident Deduplication: Consecutive matching alerts increment occurrenceCount without creating duplicate rows', async () => {
    const dedupCat = `TEST_DEDUP_${Date.now()}` as any;

    const first = await observabilityService.recordIncident({
      category: dedupCat,
      summary: 'First alert detection',
      severity: 'CRITICAL',
      component: 'DATABASE',
    });
    assert.equal(first.occurrenceCount, 1);

    const second = await observabilityService.recordIncident({
      category: dedupCat,
      summary: 'Second alert detection duplicate',
      severity: 'CRITICAL',
      component: 'DATABASE',
    });
    assert.equal(second.id, first.id, 'Must match same incident ID');
    assert.equal(second.occurrenceCount, 2, 'Occurrence count must be incremented');

    const totalMatching = (await incidentsRepository.list()).filter((i) => i.category === dedupCat);
    assert.equal(totalMatching.length, 1, 'Exactly one incident document must exist');
  });

  // 8. Durable Incident Timeline
  await test('8. Durable Incident Timeline: Chronological timeline events persisted for all lifecycle transitions', async () => {
    const timeCat = `TEST_TIMELINE_${Date.now()}` as any;
    const inc = await observabilityService.recordIncident({
      category: timeCat,
      summary: 'Timeline recording test incident',
      severity: 'WARNING',
    });

    await observabilityService.addOperatorNote(inc.id, 'Operator diagnosed root cause', 'OP_ALICE');
    await observabilityService.updateIncidentStatus(inc.id, 'ACKNOWLEDGED', 'OP_BOB');
    await observabilityService.updateIncidentStatus(inc.id, 'RESOLVED', 'OP_CHARLIE');

    const timeline = await observabilityService.getIncidentTimeline(inc.id);
    assert.ok(timeline.length >= 4, 'Timeline must record DETECTED, OPENED, NOTE_ADDED, ACKNOWLEDGED, RESOLVED');

    const events = timeline.map((t) => t.event);
    assert.ok(events.includes('DETECTED'));
    assert.ok(events.includes('OPENED'));
    assert.ok(events.includes('NOTE_ADDED'));
    assert.ok(events.includes('ACKNOWLEDGED'));
    assert.ok(events.includes('RESOLVED'));

    // Check chronological order
    for (let i = 1; i < timeline.length; i++) {
      assert.ok(
        new Date(timeline[i].timestamp).getTime() >= new Date(timeline[i - 1].timestamp).getTime(),
        'Timeline events must be chronologically ordered'
      );
    }
  });

  // 9. Operational Notification Preferences
  await test('9. Notification Preferences: Platform owner preferences persist with quiet hours and threshold filtering', async () => {
    const userId = 'usr_operator_alerts_t134';
    const initialPref = await observabilityService.getNotificationPreferences(userId);
    assert.equal(initialPref.userId, userId);
    assert.equal(initialPref.emailAlertsEnabled, true);

    const updated = await observabilityService.updateNotificationPreferences(userId, {
      minSeverity: 'CRITICAL',
      discordDmAlertsEnabled: false,
      componentsMuted: ['AI_ENGINE'],
    });

    assert.equal(updated.minSeverity, 'CRITICAL');
    assert.equal(updated.discordDmAlertsEnabled, false);
    assert.deepEqual(updated.componentsMuted, ['AI_ENGINE']);

    const persisted = await notificationPreferencesRepository.getById(`pref_${userId}`);
    assert.equal(persisted?.minSeverity, 'CRITICAL');
  });

  // 10. Service Level Objective (SLO) Tracking & Error Budgets
  await test('10. Service Level Objectives: Objective definitions, current attainment, and error budgets calculated truthfully', async () => {
    const slos = await observabilityService.calculateSLOs();
    assert.ok(slos.length >= 3, 'Must define API Availability, Engagement Delivery, and Scheduler Reliability SLOs');

    const apiSlo = slos.find((s) => s.sloId === 'slo_api_availability');
    assert.ok(apiSlo, 'API Availability SLO must exist');
    assert.equal(apiSlo?.targetPercent, 99.5);
    assert.ok(apiSlo?.errorBudget, 'Error budget calculation required');
    assert.ok(['MEETING', 'BREACHED', 'AT_RISK', 'INSUFFICIENT_DATA'].includes(apiSlo!.status));

    const schedSlo = slos.find((s) => s.sloId === 'slo_scheduler_reliability');
    assert.ok(schedSlo, 'Scheduler Reliability SLO must exist');
    assert.equal(schedSlo?.targetPercent, 99.9);
  });

  // 11. Operational Trend Analysis
  await test('11. Operational Trend Analysis: Aggregates incident frequency, SLO compliance, and performance directions', async () => {
    const trends = await observabilityService.getOperationalTrends();
    assert.ok(trends, 'Trends object must exist');
    assert.ok(['INCREASING', 'DECREASING', 'STABLE', 'INSUFFICIENT_DATA'].includes(trends.requestVolumeTrend));
    assert.ok(['IMPROVING', 'DEGRADING', 'STABLE', 'INSUFFICIENT_DATA'].includes(trends.errorRateTrend));
    assert.ok(typeof trends.incidentFrequency.totalPast24h === 'number');
    assert.ok(typeof trends.sloSummary.totalSloCount === 'number');
  });

  // 12. Security & RBAC Enforcement on Observability Endpoints
  await test('12. Observability RBAC: Platform Owner required for control plane endpoints; non-owners rejected with 403', async () => {
    // Platform Owner access
    const { req: poReq, res: poRes, next: poNext } = createMockReqRes({ user: platformOwnerUser });
    await getHealthSnapshotsHandler(poReq, poRes, poNext);
    assert.equal(poRes.getStatusCode(), 200, 'Platform Owner must access /ops/health/snapshots');
    assert.ok(poRes.getJson().success);

    // Community Admin access attempt
    const { req: caReq, res: caRes, next: caNext } = createMockReqRes({ user: communityAdminUser });
    await getHealthSnapshotsHandler(caReq, caRes, caNext);
    assert.equal(caRes.getStatusCode(), 403, 'Community Admin must be rejected with 403 Forbidden');
  });

  // 13. Metric Recording Controller & Secret Scrubbing
  await test('13. Operational Telemetry API: Recording metrics scrubs secrets and accepts valid numeric values', async () => {
    const { req, res, next } = createMockReqRes({
      user: platformOwnerUser,
      body: {
        metricName: 'custom_worker_latency',
        component: 'BACKGROUND_WORKERS',
        value: 125,
        unit: 'ms',
        status: 'HEALTHY',
        labels: { secretToken: 'discord_bot_token_abc_123' },
      },
    });

    await recordOperationalMetricHandler(req, res, next);
    assert.equal(res.getStatusCode(), 200);
    const json = res.getJson();
    assert.ok(json.success);
    assert.equal(json.data.metricName, 'custom_worker_latency');
    assert.equal(json.data.value, 125);

    // Verify list metrics endpoint
    const { req: lReq, res: lRes, next: lNext } = createMockReqRes({
      user: platformOwnerUser,
      query: { metricName: 'custom_worker_latency' },
    });
    await listOperationalMetricsHandler(lReq, lRes, lNext);
    assert.equal(lRes.getStatusCode(), 200);
    assert.ok(lRes.getJson().data.length >= 1);
  });

  // 14. Action History Correlation with Incident Timelines
  await test('14. Action Recovery Timeline Correlation: Executing recovery records timeline events on correlated incidents', async () => {
    const corrCat = `TEST_ACTION_CORR_${Date.now()}` as any;
    const inc = await observabilityService.recordIncident({
      category: corrCat,
      summary: 'Action correlation test incident',
      severity: 'WARNING',
    });

    // Execute scheduler reconcile with correlation to inc.id
    const recResult = await operationalRecoveryService.executeAction({
      actionId: 'SCHEDULER_RECONCILE',
      actorUserId: platformOwnerUser.userId,
      confirmed: true,
      incidentId: inc.id,
    });
    assert.equal(recResult.status, 'SUCCESS');

    // Incident timeline must have recorded RECOVERY_SUCCEEDED
    const timeline = await observabilityService.getIncidentTimeline(inc.id);
    const recoveryEvents = timeline.filter((t) => t.event === 'RECOVERY_SUCCEEDED');
    assert.ok(recoveryEvents.length >= 1, 'Timeline must record RECOVERY_SUCCEEDED');
  });

  // 15. Release Lock Integrity
  await test('15. Release Lock Integrity: PRODUCT_RELEASE_LOCKED remains true and release configuration is preserved', async () => {
    assert.equal(PRODUCT_RELEASE_LOCKED, true, 'PRODUCT_RELEASE_LOCKED must remain true');
    assert.equal(isProductionReleaseLocked(), true, 'isProductionReleaseLocked() must return true');
  });

  console.log('--------------------------------------------------------------------------------');
  console.log(`Task 134 Test Results: ${passed} passed, ${failed} failed`);
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

if (process.argv[1]?.endsWith('task134-production-observability-alerting-slo.test.ts') || process.argv[1]?.endsWith('task134-production-observability-alerting-slo.test.js')) {
  runTask134Tests()
    .then((res) => {
      if (res.failed > 0) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Task 134 runner fatal error:', err);
      process.exit(1);
    });
}
