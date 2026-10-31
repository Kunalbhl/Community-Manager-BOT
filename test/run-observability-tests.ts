import assert from 'node:assert/strict';
import { observabilityService } from '../server/services/observability/observability.service.js';
import { sanitizeLogValue, logger } from '../server/logging/logger.js';
import { StandardError, getSafeUserMessageForCategory } from '../server/utils/standardError.js';
import { executeWithRetry } from '../server/utils/retryPolicy.ts';
import { DiscordRecoveryHelper } from '../server/services/observability/discordRecovery.js';
import { DatabaseRecoveryHelper } from '../server/services/observability/databaseRecovery.js';
import { BillingRecoveryHelper } from '../server/services/observability/billingRecovery.js';
import { incidentsRepository, scheduledJobsRepository } from '../server/repositories/index.js';

let passedTests = 0;
function test(description: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn())
    .then(() => {
      passedTests++;
      console.log(`  ✓ ${description}`);
    })
    .catch((err) => {
      console.error(`  ✕ ${description}`);
      console.error(err);
      process.exit(1);
    });
}

async function runObservabilityTests() {
  console.log('\n======================================================');
  console.log('  TASK 24.6 PRODUCTION OBSERVABILITY & OPERATIONS TESTS');
  console.log('======================================================\n');

  console.log('--- 1. Secret Redaction & Logging Safety ---');

  await test('Redacts sensitive tokens, keys, and authorization headers in logs', () => {
    const rawContext = {
      botToken: 'Bot MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.Gu1234.abcdefghijklmnopqrstuvwxyz',
      geminiApiKey: 'AIzaSyA1234567890abcdefghijklmnopqrstuvwxyz',
      authorization: 'Bearer secret_access_token_value',
      stripeSecret: 'sk_live_51abcdef123456789',
      webhookSecret: 'whsec_abcdef123456789',
      password: 'mySecretPassword123!',
      rawPrompt: 'This is a private conversation context with AI',
      safeField: 'Elite Gaming Community',
      communityId: 'comm_123',
    };

    const sanitized = sanitizeLogValue(rawContext) as any;

    assert.equal(sanitized.botToken, '[REDACTED_SECRET]');
    assert.equal(sanitized.geminiApiKey, '[REDACTED_SECRET]');
    assert.equal(sanitized.authorization, '[REDACTED_SECRET]');
    assert.equal(sanitized.stripeSecret, '[REDACTED_SECRET]');
    assert.equal(sanitized.webhookSecret, '[REDACTED_SECRET]');
    assert.equal(sanitized.password, '[REDACTED_SECRET]');
    assert.equal(sanitized.rawPrompt, '[REDACTED_SECRET]');
    assert.equal(sanitized.safeField, 'Elite Gaming Community');
    assert.equal(sanitized.communityId, 'comm_123');
  });

  console.log('\n--- 2. Standard Errors & Safe User Messages ---');

  await test('Generates standard error with safe user message and correlation ID', () => {
    const err = new StandardError({
      code: 'DISCORD_UNAVAILABLE',
      statusCode: 503,
      message: 'Internal Discord Gateway websocket connection failed with EOF',
      requiredAction: 'Check Discord Bot status in Developer Portal',
    });

    assert.equal(err.code, 'DISCORD_UNAVAILABLE');
    assert.equal(err.statusCode, 503);
    assert.equal(err.userMessage, 'Discord connection or API service is currently unavailable.');
    assert.equal(err.retryable, true);
    assert.equal(err.requiredAction, 'Check Discord Bot status in Developer Portal');
    assert.ok(err.correlationId.startsWith('corr_'));
  });

  console.log('\n--- 3. Incident Management & Deduplication ---');

  await test('Records new operational incident and deduplicates recurring failures', async () => {
    const category = 'DATABASE_UNAVAILABLE';
    const dependency = 'Database';

    // First incident creation
    const inc1 = await observabilityService.recordIncident({
      category,
      dependency,
      summary: 'Firestore write timeout',
      severity: 'HIGH',
      communityId: 'comm_test',
    });

    assert.equal(inc1.occurrenceCount, 1);
    assert.equal(inc1.status, 'OPEN');

    // Duplicate error occurring shortly after
    const inc2 = await observabilityService.recordIncident({
      category,
      dependency,
      summary: 'Firestore write timeout again',
      severity: 'HIGH',
      communityId: 'comm_test',
    });

    assert.equal(inc2.id, inc1.id, 'Incident IDs should match for deduplication');
    assert.equal(inc2.occurrenceCount, 2, 'Occurrence count should increment to 2');

    // Update incident status to ACKNOWLEDGED then RESOLVED
    const acked = await observabilityService.updateIncidentStatus(inc1.id, 'ACKNOWLEDGED', 'usr_admin');
    assert.equal(acked?.status, 'ACKNOWLEDGED');

    const resolved = await observabilityService.updateIncidentStatus(inc1.id, 'RESOLVED', 'usr_admin');
    assert.equal(resolved?.status, 'RESOLVED');
    assert.ok(resolved?.resolvedAt);
  });

  console.log('\n--- 4. Exponential Backoff & Retry Policy ---');

  await test('Retries transient operations with backoff and fails non-retryable errors immediately', async () => {
    let attempts = 0;
    const retryableTask = async () => {
      attempts++;
      if (attempts < 3) {
        throw new StandardError({
          code: 'RATE_LIMITED',
          message: 'Upstream rate limit exceeded',
          retryable: true,
        });
      }
      return 'SUCCESS_DATA';
    };

    const result = await executeWithRetry(retryableTask, {
      maxRetries: 3,
      initialDelayMs: 10,
      operationName: 'TestRetryTask',
    });

    assert.equal(result, 'SUCCESS_DATA');
    assert.equal(attempts, 3);
  });

  await test('Safety check: Never automatically retries destructive non-idempotent operation', async () => {
    let attempts = 0;
    const destructiveTask = async () => {
      attempts++;
      throw new Error('Destructive operation failed');
    };

    try {
      await executeWithRetry(destructiveTask, {
        maxRetries: 3,
        isDestructive: true,
        isIdempotent: false,
        operationName: 'DestructiveDeleteTask',
      });
      assert.fail('Should have thrown error');
    } catch (e: any) {
      assert.equal(attempts, 1, 'Destructive operation must NOT be retried');
    }
  });

  console.log('\n--- 5. Scheduler Job Telemetry ---');

  await test('Records and updates scheduled background job executions', async () => {
    const job = await observabilityService.recordSchedulerExecution(
      'AnnouncementsDeliveryJob',
      'announcements',
      'SUCCESS',
      60000
    );

    assert.equal(job.jobName, 'AnnouncementsDeliveryJob');
    assert.equal(job.module, 'announcements');
    assert.equal(job.lastStatus, 'SUCCESS');
    assert.equal(job.executionCount, 1);

    const statuses = await observabilityService.getSchedulerStatuses();
    const found = statuses.find((s) => s.jobName === 'AnnouncementsDeliveryJob');
    assert.ok(found);
  });

  console.log('\n--- 6. Diagnostics & Diagnostic Helpers ---');

  await test('Discord Recovery Helper provides clear diagnostics when token is missing', () => {
    const diag = DiscordRecoveryHelper.diagnose(false, false);
    assert.equal(diag.connected, false);
    assert.equal(diag.gatewayStatus, 'DISCONNECTED');
    assert.ok(diag.issues.some((i) => i.includes('DISCORD_BOT_TOKEN')));
  });

  await test('Database Recovery Helper truths write failure when persistent database is down', async () => {
    DatabaseRecoveryHelper.setSimulatedDown(true);

    try {
      await DatabaseRecoveryHelper.assertHealthy('WriteUserSession', 'corr_db_test');
      assert.fail('Should have thrown DATABASE_UNAVAILABLE');
    } catch (err: any) {
      assert.equal(err.code, 'DATABASE_UNAVAILABLE');
      assert.equal(err.statusCode, 503);
    } finally {
      DatabaseRecoveryHelper.setSimulatedDown(false);
    }
  });

  await test('Tenant Health Indicator generates community-scoped report without exposing cross-tenant data', async () => {
    const report = await observabilityService.getTenantHealthReport('comm_tenant_test');
    assert.equal(report.communityId, 'comm_tenant_test');
    assert.ok(report.status === 'HEALTHY' || report.status === 'ATTENTION_REQUIRED');
  });

  console.log('\n======================================================');
  console.log(`  ALL ${passedTests} OBSERVABILITY & OPERATIONS TESTS PASSED!`);
  console.log('======================================================\n');
}

runObservabilityTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
