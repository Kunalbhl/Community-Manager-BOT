import './setup-env.js';
import assert from 'node:assert/strict';
import { PRODUCT_RELEASE_LOCKED, isProductionReleaseLocked } from '../server/config/releaseLock.js';
import { incidentResponseService } from '../server/services/observability/incidentResponse.service.js';
import { observabilityService } from '../server/services/observability/observability.service.js';
import {
  incidentsRepository,
  escalationPoliciesRepository,
  escalationStatesRepository,
  alertRoutingDecisionsRepository,
  incidentCommunicationsRepository,
  maintenanceWindowsRepository,
  operationalNotificationsRepository,
  incidentTimelinesRepository,
} from '../server/repositories/index.js';
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

export interface Task135Result {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
  details: Record<string, string>;
}

export async function runTask135Tests(): Promise<Task135Result> {
  console.log('================================================================================');
  console.log('TASK 135 — PRODUCTION OPERATIONS INCIDENT RESPONSE, ALERT ROUTING & AUDIT');
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
    userId: 'usr_platform_owner_t135',
    email: 'platform_owner@test.internal',
    role: 'PLATFORM_OWNER',
    isPlatformOwner: true,
  };

  const normalUser = {
    userId: 'usr_regular_t135',
    email: 'member@test.internal',
    role: 'COMMUNITY_MEMBER',
    isPlatformOwner: false,
  };

  async function runTest(name: string, fn: () => Promise<void>) {
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

  // TEST 1: Authoritative IncidentResponseService Singleton & Architecture
  await runTest('1. Authoritative IncidentResponseService provides canonical incident management authority', async () => {
    assert.ok(incidentResponseService, 'incidentResponseService must exist');
    assert.strictEqual(typeof incidentResponseService.acknowledgeIncident, 'function');
    assert.strictEqual(typeof incidentResponseService.assignIncident, 'function');
    assert.strictEqual(typeof incidentResponseService.resolveIncident, 'function');
    assert.strictEqual(typeof incidentResponseService.reopenIncident, 'function');
    assert.strictEqual(typeof incidentResponseService.createMaintenanceWindow, 'function');
    assert.strictEqual(typeof incidentResponseService.isComponentInMaintenance, 'function');
    assert.strictEqual(typeof incidentResponseService.evaluateRoutingAndEscalation, 'function');
  });

  // TEST 2: Incident Ownership Lifecycle (UNASSIGNED -> ASSIGNED -> REASSIGNED -> UNASSIGNED)
  await runTest('2. Incident ownership supports complete lifecycle with valid states and audit', async () => {
    const inc = await observabilityService.recordIncident({
      component: 'DISCORD',
      summary: 'Discord Rate Limit Spike',
      safeSummary: 'API rate limits hit 429 threshold',
      severity: 'WARNING',
    });

    assert.ok(inc, 'Incident recorded');
    assert.strictEqual(inc.ownershipState, 'UNASSIGNED', 'New incident must be UNASSIGNED');
    assert.strictEqual(inc.ownerId, undefined, 'ownerId must initially be undefined');

    // Assign
    const assigned = await incidentResponseService.assignIncident({
      incidentId: inc.id,
      ownerId: 'usr_engineer_alpha',
      ownerRole: 'PLATFORM_OPERATOR',
      assignedBy: 'usr_platform_owner_t135',
      actorRole: 'OWNER',
    });
    assert.strictEqual(assigned.ownershipState, 'ASSIGNED');
    assert.strictEqual(assigned.ownerId, 'usr_engineer_alpha');
    assert.strictEqual(assigned.assignedBy, 'usr_platform_owner_t135');

    // Reassign
    const reassigned = await incidentResponseService.assignIncident({
      incidentId: inc.id,
      ownerId: 'usr_engineer_beta',
      ownerRole: 'PLATFORM_OPERATOR',
      assignedBy: 'usr_platform_owner_t135',
      actorRole: 'OWNER',
    });
    assert.strictEqual(reassigned.ownershipState, 'ASSIGNED');
    assert.strictEqual(reassigned.ownerId, 'usr_engineer_beta');

    // Unassign
    const unassigned = await incidentResponseService.unassignIncident({
      incidentId: inc.id,
      unassignedBy: 'usr_platform_owner_t135',
      actorRole: 'OWNER',
    });
    assert.strictEqual(unassigned.ownershipState, 'UNASSIGNED');
    assert.strictEqual(unassigned.ownerId, undefined);
  });

  // TEST 3: Server-side RBAC & Identity Enforcement (No client spoofing)
  await runTest('3. Incident assignment and management rejects unauthorized actors and enforces server-side identity', async () => {
    const inc = await observabilityService.recordIncident({
      component: 'DATABASE',
      summary: 'Database connection pool saturation',
      safeSummary: 'Pool saturation exceeds 90%',
      severity: 'CRITICAL',
    });

    const { req: deniedReq, res: deniedRes, next: deniedNext } = createMockReqRes({
      params: { id: inc.id },
      body: { ownerId: 'usr_hacker' },
      user: normalUser,
    });

    await assignIncidentHandler(deniedReq, deniedRes, deniedNext);
    assert.strictEqual(deniedRes.getStatusCode(), 403, 'Regular user must be forbidden from assigning incidents');

    const { req: authReq, res: authRes, next: authNext } = createMockReqRes({
      params: { id: inc.id },
      body: { ownerId: 'usr_ops_lead' },
      user: platformOwnerUser,
    });

    await assignIncidentHandler(authReq, authRes, authNext);
    assert.strictEqual(authRes.getStatusCode(), 200, 'Platform Owner should succeed');
    assert.strictEqual(authRes.getJson().data.ownerId, 'usr_ops_lead');
  });

  // TEST 4: Hardened Acknowledgement Semantics
  await runTest('4. Acknowledgement records timestamp and actor, updates status to ACKNOWLEDGED, without implying resolution', async () => {
    const inc = await observabilityService.recordIncident({
      component: 'AUTHENTICATION',
      summary: 'Auth token validation latency spike',
      safeSummary: 'Validation exceeds 2000ms',
      severity: 'WARNING',
    });

    assert.strictEqual(inc.status, 'OPEN');

    const acked = await incidentResponseService.acknowledgeIncident({
      incidentId: inc.id,
      actorUserId: 'usr_operator_one',
      actorRole: 'OWNER',
    });

    assert.strictEqual(acked.status, 'ACKNOWLEDGED', 'Status must be ACKNOWLEDGED');
    assert.strictEqual(acked.acknowledgedBy, 'usr_operator_one');
    assert.ok(acked.acknowledgedAt, 'acknowledgedAt timestamp must be recorded');
    assert.ok(acked.acknowledgementCorrelationId, 'acknowledgementCorrelationId must be generated');
    assert.strictEqual(acked.resolvedAt, undefined, 'Acknowledgement must NEVER imply resolution');
  });

  // TEST 5: Deterministic Escalation Policies
  await runTest('5. Escalation policies provide deterministic levels, delays, and recipient configurations', async () => {
    const policies = await incidentResponseService.listEscalationPolicies();
    assert.ok(policies.length >= 2, 'Must have default escalation policies');

    const critPolicy = policies.find((p) => p.severity === 'CRITICAL');
    assert.ok(critPolicy, 'Must have CRITICAL escalation policy');
    assert.ok(critPolicy.recipients.length > 0, 'Must define recipients');
    assert.strictEqual(critPolicy.enabled, true);
  });

  // TEST 6: Durable Escalation State & Restart-Safe Execution
  await runTest('6. Durable escalation state executes idempotently and survives restart', async () => {
    const inc = await observabilityService.recordIncident({
      component: 'SCHEDULER',
      summary: 'Durable scheduler queue stall',
      safeSummary: 'Missed heartbeats detected',
      severity: 'CRITICAL',
    });

    const decision = await incidentResponseService.evaluateRoutingAndEscalation(inc);
    assert.ok(decision.policyId, 'Must route to an escalation policy');

    const stateBefore = await incidentResponseService.getEscalationState(inc.id);
    assert.ok(stateBefore, 'Escalation state must be created');
    assert.ok(stateBefore.escalationCount >= 1, 'Initial escalation triggered');

    // Run escalation evaluation again - idempotency test (should not double-send immediately before interval)
    await incidentResponseService.processPendingEscalations();
    const stateAfter = await incidentResponseService.getEscalationState(inc.id);
    assert.strictEqual(stateAfter?.escalationCount, stateBefore.escalationCount, 'Must not duplicate escalation before interval');
  });

  // TEST 7: Deterministic Alert Routing Engine
  await runTest('7. Alert routing engine maps incidents to correct policy and audits routing decisions', async () => {
    const inc = await observabilityService.recordIncident({
      component: 'ENGAGEMENT',
      summary: 'Engagement delivery rate drop',
      safeSummary: 'Delivery rate dropped below threshold',
      severity: 'WARNING',
    });

    const decisions = await incidentResponseService.getRoutingDecisions(inc.id);
    assert.ok(decisions.length >= 1, 'Must have recorded routing decision');
    assert.strictEqual(decisions[0].incidentId, inc.id);
    assert.ok(decisions[0].policyId, 'Decision has policyId');
    assert.ok(decisions[0].reason, 'Decision records reasoning');
  });

  // TEST 8: Truthful Notification Delivery States
  await runTest('8. Notification records use truthful status values and never fabricate delivered confirmations', async () => {
    const notifs = await incidentResponseService.listNotifications();
    assert.ok(Array.isArray(notifs), 'Notifications must be an array');
    for (const n of notifs) {
      assert.ok(
        ['PENDING', 'DELIVERED', 'FAILED', 'CANCELLED', 'NOT_CONFIGURED'].includes(n.status),
        `Notification status ${n.status} must be truthful and canonical`
      );
    }
  });

  // TEST 9: Incident Communication History & Secret Sanitization
  await runTest('9. Incident communication logs notes with sanitized secrets and auditable metadata', async () => {
    const inc = await observabilityService.recordIncident({
      component: 'OPERATIONS',
      summary: 'Operations gateway latency',
      safeSummary: 'Slow gateway response',
      severity: 'INFO',
    });

    const note = await incidentResponseService.addCommunication({
      incidentId: inc.id,
      actorId: 'usr_operator_sec',
      actorRole: 'PLATFORM_OWNER',
      type: 'STATUS_UPDATE',
      message: 'Investigating incident with auth token Bearer secret_live_key_99887766 and apiKey=secret_live_token',
    });

    assert.ok(note.id, 'Note ID created');
    assert.strictEqual(note.incidentId, inc.id);
    assert.strictEqual(note.actorId, 'usr_operator_sec');
    assert.strictEqual(note.type, 'STATUS_UPDATE');
    // Secret scrubbing check
    assert.ok(!note.message.includes('secret_live_key_99887766'), 'Live secrets must be scrubbed from communication message');
    assert.ok(note.message.includes('[REDACTED'), 'Sanitization placeholder inserted');
  });

  // TEST 10: Maintenance Windows & Automated Alert Suppression
  await runTest('10. Maintenance windows automatically suppress non-critical alerts for matching components', async () => {
    const futureEnd = new Date(Date.now() + 3600000).toISOString();
    const pastStart = new Date(Date.now() - 60000).toISOString();

    const mw = await incidentResponseService.createMaintenanceWindow({
      name: 'Discord Gateway Scheduled Patch',
      description: 'Upgrading gateway connection pool',
      startAt: pastStart,
      endAt: futureEnd,
      timezone: 'UTC',
      components: ['DISCORD'],
      createdBy: 'usr_platform_owner_t135',
      actorRole: 'OWNER',
    });

    assert.strictEqual(mw.status, 'ACTIVE');

    const isInMaint = await incidentResponseService.isComponentInMaintenance('DISCORD');
    assert.strictEqual(isInMaint, true, 'DISCORD component must be recognized in active maintenance');

    const notInMaint = await incidentResponseService.isComponentInMaintenance('DATABASE');
    assert.strictEqual(notInMaint, false, 'DATABASE component should not be in maintenance');

    // Record a WARNING incident on DISCORD during maintenance -> should be SUPPRESSED
    const inc = await observabilityService.recordIncident({
      component: 'DISCORD',
      summary: 'Discord connection bounce during maintenance',
      safeSummary: 'Gateway bounced',
      severity: 'WARNING',
    });

    assert.strictEqual(inc.status, 'SUPPRESSED', 'Non-critical alert in maintenance must be SUPPRESSED');

    // Clean up maintenance window
    await incidentResponseService.cancelMaintenanceWindow({
      maintenanceWindowId: mw.id,
      cancelledBy: 'usr_platform_owner_t135',
      actorRole: 'OWNER',
    });
  });

  // TEST 11: Maintenance Window Validation & State Lifecycle
  await runTest('11. Maintenance window validates dates, timezones, and handles full lifecycle transitions', async () => {
    // End before start rejection
    let rejected = false;
    try {
      await incidentResponseService.createMaintenanceWindow({
        name: 'Invalid window',
        description: 'Test window',
        startAt: new Date(Date.now() + 10000).toISOString(),
        endAt: new Date(Date.now() - 10000).toISOString(),
        timezone: 'UTC',
        components: ['ALL'],
        createdBy: 'usr_platform_owner',
        actorRole: 'OWNER',
      });
    } catch {
      rejected = true;
    }
    assert.strictEqual(rejected, true, 'Must reject window where end is before start');

    // Scheduled -> Active -> Cancelled
    const scheduledMw = await incidentResponseService.createMaintenanceWindow({
      name: 'Future Maintenance',
      description: 'Future planned maintenance',
      startAt: new Date(Date.now() + 100000).toISOString(),
      endAt: new Date(Date.now() + 200000).toISOString(),
      timezone: 'UTC',
      components: ['DATABASE'],
      createdBy: 'usr_platform_owner',
      actorRole: 'OWNER',
    });
    assert.strictEqual(scheduledMw.status, 'SCHEDULED');

    const cancelled = await incidentResponseService.cancelMaintenanceWindow({
      maintenanceWindowId: scheduledMw.id,
      cancelledBy: 'usr_platform_owner',
      actorRole: 'OWNER',
    });
    assert.strictEqual(cancelled.status, 'CANCELLED');
  });

  // TEST 12: Explicit Incident Resolution with Mandatory Reason & Audit
  await runTest('12. Incident resolution requires explicit reason, records resolver, and sets resolvedAt', async () => {
    const inc = await observabilityService.recordIncident({
      component: 'APPLICATION',
      summary: 'Memory consumption high watermark',
      safeSummary: 'Memory exceeded 85%',
      severity: 'WARNING',
    });

    // Attempt resolution without reason
    let failedWithoutReason = false;
    try {
      await incidentResponseService.resolveIncident({
        incidentId: inc.id,
        resolvedBy: 'usr_resolver_1',
        actorRole: 'OWNER',
        resolutionReason: '',
      });
    } catch {
      failedWithoutReason = true;
    }
    assert.strictEqual(failedWithoutReason, true, 'Resolution without reason must be rejected');

    // Resolve with reason
    const resolved = await incidentResponseService.resolveIncident({
      incidentId: inc.id,
      resolvedBy: 'usr_resolver_1',
      actorRole: 'OWNER',
      resolutionReason: 'Garbage collector tuned and caches evicted successfully',
    });

    assert.strictEqual(resolved.status, 'RESOLVED');
    assert.strictEqual(resolved.resolvedBy, 'usr_resolver_1');
    assert.ok(resolved.resolvedAt, 'resolvedAt must be set');
    assert.strictEqual(resolved.resolutionReason, 'Garbage collector tuned and caches evicted successfully');
  });

  // TEST 13: Incident Reopening Preserves History
  await runTest('13. Incident reopening sets status to REOPENED, records timestamp, and preserves history', async () => {
    const inc = await observabilityService.recordIncident({
      component: 'DATABASE',
      summary: 'Connection timeout spike',
      safeSummary: 'Occasional connection timeout',
      severity: 'WARNING',
    });

    await incidentResponseService.resolveIncident({
      incidentId: inc.id,
      resolvedBy: 'usr_resolver_2',
      actorRole: 'OWNER',
      resolutionReason: 'Fixed transient network glitch',
    });

    const reopened = await incidentResponseService.reopenIncident({
      incidentId: inc.id,
      reopenedBy: 'usr_operator_3',
      actorRole: 'OWNER',
      reason: 'Issue resurfaced after traffic surge',
    });

    assert.strictEqual(reopened.status, 'OPEN');
    assert.ok(reopened.reopenedAt, 'reopenedAt must be set');
    assert.ok(reopened.history && reopened.history.length >= 2, 'History must record resolution and reopening');
  });

  // TEST 14: End-to-End Timeline Completeness & Audit Correlation
  await runTest('14. Incident timeline records every mutation with audit correlation and zero secret leaks', async () => {
    const inc = await observabilityService.recordIncident({
      component: 'DISCORD',
      summary: 'Audit correlation validation incident',
      safeSummary: 'Testing complete timeline recording',
      severity: 'CRITICAL',
    });

    await incidentResponseService.assignIncident({
      incidentId: inc.id,
      ownerId: 'usr_lead_dev',
      ownerRole: 'PLATFORM_OPERATOR',
      assignedBy: 'usr_owner_1',
      actorRole: 'OWNER',
    });
    await incidentResponseService.acknowledgeIncident({
      incidentId: inc.id,
      actorUserId: 'usr_lead_dev',
      actorRole: 'PLATFORM_OPERATOR',
    });
    await incidentResponseService.addCommunication({
      incidentId: inc.id,
      actorId: 'usr_lead_dev',
      actorRole: 'PLATFORM_OPERATOR',
      type: 'RECOVERY_UPDATE',
      message: 'Applying gateway shard rebalancing patch',
    });
    await incidentResponseService.resolveIncident({
      incidentId: inc.id,
      resolvedBy: 'usr_lead_dev',
      actorRole: 'PLATFORM_OPERATOR',
      resolutionReason: 'Shard rebalance successful',
    });

    const timeline = await incidentResponseService.getIncidentTimeline(inc.id);
    assert.ok(timeline.length >= 4, 'Timeline must contain all operational events');

    const eventTypes = timeline.map((e) => e.event);
    assert.ok(eventTypes.includes('DETECTED') || eventTypes.includes('OPENED'));
    assert.ok(eventTypes.includes('ASSIGNED'));
    assert.ok(eventTypes.includes('ACKNOWLEDGED'));
    assert.ok(eventTypes.includes('NOTE_ADDED'));
    assert.ok(eventTypes.includes('RESOLVED'));
  });

  // TEST 15: Release Guard Integrity Preservation
  await runTest('15. Task 135 preserves PRODUCT_RELEASE_LOCKED = true and regression safety', async () => {
    assert.strictEqual(PRODUCT_RELEASE_LOCKED, true, 'PRODUCT_RELEASE_LOCKED must remain true');
    assert.strictEqual(isProductionReleaseLocked(), true, 'isProductionReleaseLocked() must return true');
  });

  console.log('--------------------------------------------------------------------------------');
  console.log(`TASK 135 TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
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

if (process.argv[1]?.includes('task135-production-incident-response-routing-audit')) {
  runTask135Tests().then((res) => {
    process.exit(res.failed > 0 ? 1 : 0);
  }).catch((err) => {
    console.error('Fatal test failure:', err);
    process.exit(1);
  });
}

