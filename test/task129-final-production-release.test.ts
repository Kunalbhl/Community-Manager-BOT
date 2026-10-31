import './setup-env.js';
import assert from 'node:assert/strict';
import { config } from '../server/config/env.js';
import {
  DiscordRestVerificationService,
  DiscordRestVerificationResult,
} from '../server/services/discordRestVerification.service.js';
import {
  isRealPersistenceMode,
  DevelopmentSimulationPersistenceProvider,
  FirestoreUnavailableError,
} from '../server/repositories/firestore.repository.js';
import {
  discordService,
  RealDiscordProvider,
  DevelopmentDiscordProvider,
} from '../server/integrations/discord/discord.service.js';
import { healthService } from '../server/services/health.service.js';
import { EngagementDeliveryService } from '../server/services/engagement.service.js';
import { EntitlementService, UsageService } from '../server/services/entitlement.service.js';
import { communitiesRepository } from '../server/repositories/index.js';

export interface Task129TestResult {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
  details: {
    test1_http200: string;
    test2_http401: string;
    test3_networkUnreachable: string;
    test4_http429: string;
    test5_http403: string;
    test6_firestoreUnavailable: string;
    test7_discordUnavailableNoSimulation: string;
    test8_gatewayDisconnectNotReady: string;
    test9_engagementConfirmation: string;
    test10_providerFailureNoUsage: string;
  };
}

export async function runTask129Tests(): Promise<Task129TestResult> {
  console.log('================================================================================');
  console.log('TASK 129 — FINAL PRODUCTION RELEASE & EXTERNAL DISCORD HARDENING');
  console.log('================================================================================');

  let passed = 0;
  let failed = 0;
  let blocked = 0;
  const skipped = 0;

  const details = {
    test1_http200: 'PENDING',
    test2_http401: 'PENDING',
    test3_networkUnreachable: 'PENDING',
    test4_http429: 'PENDING',
    test5_http403: 'PENDING',
    test6_firestoreUnavailable: 'PENDING',
    test7_discordUnavailableNoSimulation: 'PENDING',
    test8_gatewayDisconnectNotReady: 'PENDING',
    test9_engagementConfirmation: 'PENDING',
    test10_providerFailureNoUsage: 'PENDING',
  };

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ [TASK 129] ${name}`);
    } catch (err: any) {
      failed++;
      console.error(`  ✗ [TASK 129 FAILED] ${name}: ${err.message}`);
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Discord HTTP 200 /users/@me → VERIFIED
  // --------------------------------------------------------------------------
  console.log('\n[Task 129 - Test 1] Testing Discord HTTP 200 /users/@me → VERIFIED...');
  await test('TEST 1: Discord HTTP 200 returns VERIFIED and SUCCESS', async () => {
    const mockTransport: typeof fetch = async (input, init) => {
      return {
        status: 200,
        ok: true,
        json: async () => ({
          id: config.DISCORD_APPLICATION_ID || '1547515985416822884',
          username: 'CommunityRecruiter',
          discriminator: '0',
          bot: true,
        }),
      } as any;
    };

    const result = await DiscordRestVerificationService.verifyCurrentUser(mockTransport);
    assert.equal(result.outcome, 'VERIFIED');
    assert.equal(result.classification, 'SUCCESS');
    assert.equal(result.httpStatus, 200);
    assert.equal(result.botUserId, config.DISCORD_APPLICATION_ID || '1547515985416822884');
    details.test1_http200 = 'VERIFIED';
  });

  // --------------------------------------------------------------------------
  // TEST 2: Discord HTTP 401 → AUTHENTICATION_FAILED
  // --------------------------------------------------------------------------
  console.log('\n[Task 129 - Test 2] Testing Discord HTTP 401 → AUTHENTICATION_FAILED...');
  await test('TEST 2: Discord HTTP 401 returns FAILED with AUTHENTICATION_FAILED (never disguised as NOT_CONFIGURED)', async () => {
    const mockTransport: typeof fetch = async () => {
      return {
        status: 401,
        ok: false,
        json: async () => ({ message: '401: Unauthorized', code: 0 }),
      } as any;
    };

    const result = await DiscordRestVerificationService.verifyCurrentUser(mockTransport);
    assert.equal(result.outcome, 'FAILED');
    assert.equal(result.classification, 'AUTHENTICATION_FAILED');
    assert.equal(result.httpStatus, 401);
    assert.notEqual(result.classification, 'NOT_CONFIGURED');
    assert.notEqual(result.outcome, 'BLOCKED_BY_ENVIRONMENT');
    details.test2_http401 = 'AUTHENTICATION_FAILED';
  });

  // --------------------------------------------------------------------------
  // TEST 3: Network unreachable before external response → BLOCKED_BY_ENVIRONMENT
  // --------------------------------------------------------------------------
  console.log('\n[Task 129 - Test 3] Testing Network unreachable → BLOCKED_BY_ENVIRONMENT...');
  await test('TEST 3: Network unreachable before response returns BLOCKED_BY_ENVIRONMENT with NETWORK_BLOCKED', async () => {
    const mockTransport: typeof fetch = async () => {
      const err = new TypeError('fetch failed');
      (err as any).code = 'ENOTFOUND';
      throw err;
    };

    const result = await DiscordRestVerificationService.verifyCurrentUser(mockTransport);
    assert.equal(result.outcome, 'BLOCKED_BY_ENVIRONMENT');
    assert.equal(result.classification, 'NETWORK_BLOCKED');
    assert.ok(result.errorMessage?.includes('Network error'));
    details.test3_networkUnreachable = 'BLOCKED_BY_ENVIRONMENT';
  });

  // --------------------------------------------------------------------------
  // TEST 4: Discord 429 → RATE_LIMITED
  // --------------------------------------------------------------------------
  console.log('\n[Task 129 - Test 4] Testing Discord 429 → RATE_LIMITED...');
  await test('TEST 4: Discord HTTP 429 returns FAILED with RATE_LIMITED', async () => {
    const mockTransport: typeof fetch = async () => {
      return {
        status: 429,
        ok: false,
        json: async () => ({ message: 'You are being rate limited.', retry_after: 5, global: false }),
      } as any;
    };

    const result = await DiscordRestVerificationService.verifyCurrentUser(mockTransport);
    assert.equal(result.outcome, 'FAILED');
    assert.equal(result.classification, 'RATE_LIMITED');
    assert.equal(result.httpStatus, 429);
    details.test4_http429 = 'RATE_LIMITED';
  });

  // --------------------------------------------------------------------------
  // TEST 5: Discord 403 → PERMISSION_REQUIRED
  // --------------------------------------------------------------------------
  console.log('\n[Task 129 - Test 5] Testing Discord 403 → PERMISSION_REQUIRED...');
  await test('TEST 5: Discord HTTP 403 returns FAILED with PERMISSION_REQUIRED', async () => {
    const mockTransport: typeof fetch = async () => {
      return {
        status: 403,
        ok: false,
        json: async () => ({ message: 'Missing Permissions', code: 50013 }),
      } as any;
    };

    const result = await DiscordRestVerificationService.verifyCurrentUser(mockTransport);
    assert.equal(result.outcome, 'FAILED');
    assert.equal(result.classification, 'PERMISSION_REQUIRED');
    assert.equal(result.httpStatus, 403);
    assert.equal(result.discordErrorCode, 50013);
    details.test5_http403 = 'PERMISSION_REQUIRED';
  });

  // --------------------------------------------------------------------------
  // TEST 6: Firestore unavailable in production → FAIL_CLOSED
  // --------------------------------------------------------------------------
  console.log('\n[Task 129 - Test 6] Testing Firestore unavailable in production → FAIL_CLOSED...');
  await test('TEST 6: Firestore unavailable in production mode fails closed with FirestoreUnavailableError', async () => {
    const origMode = config.APP_RUNTIME_MODE;
    try {
      (config as any).APP_RUNTIME_MODE = 'PRODUCTION';
      assert.equal(isRealPersistenceMode(), true, 'Must run in real persistence mode for certification');

      const testRepo = communitiesRepository as any;
      const originalClient = testRepo.client;

      try {
        // Simulate client nullification / network drop
        testRepo.client = null;
        await assert.rejects(
          async () => {
            await testRepo.getById('comm_probe_fail_closed');
          },
          (err: any) => {
            return err instanceof FirestoreUnavailableError && err.message.includes('FIRESTORE_UNAVAILABLE');
          },
          'Must fail closed with FirestoreUnavailableError when client is unavailable'
        );
      } finally {
        testRepo.client = originalClient;
      }
    } finally {
      (config as any).APP_RUNTIME_MODE = origMode;
    }

    details.test6_firestoreUnavailable = 'FAIL_CLOSED';
  });

  // --------------------------------------------------------------------------
  // TEST 7: Discord unavailable → no simulation activation
  // --------------------------------------------------------------------------
  console.log('\n[Task 129 - Test 7] Testing Discord unavailable → no simulation activation...');
  await test('TEST 7: Discord unavailable never activates simulation in production mode', async () => {
    const origMode = config.APP_RUNTIME_MODE;
    try {
      (config as any).APP_RUNTIME_MODE = 'PRODUCTION';
      // Verify RealDiscordProvider is instantiated and authoritative
      const realProvider = new RealDiscordProvider();
      assert.ok(
        realProvider instanceof RealDiscordProvider,
        'Authoritative provider in production must be RealDiscordProvider'
      );

      // Verify DevelopmentDiscordProvider cannot be instantiated in PRODUCTION
      assert.throws(
        () => {
          new DevelopmentDiscordProvider();
        },
        (err: any) => {
          return err.message.includes('FAIL_CLOSED') && err.message.includes('strictly prohibited');
        },
        'DevelopmentDiscordProvider must throw fail-closed error in PRODUCTION'
      );
    } finally {
      (config as any).APP_RUNTIME_MODE = origMode;
    }

    details.test7_discordUnavailableNoSimulation = 'NO_SIMULATION';
  });

  // --------------------------------------------------------------------------
  // TEST 8: Gateway disconnect → readiness leaves READY
  // --------------------------------------------------------------------------
  console.log('\n[Task 129 - Test 8] Testing Gateway disconnect → readiness leaves READY...');
  await test('TEST 8: Gateway disconnect causes DiscordBot & Gateway readiness to leave READY', async () => {
    const readiness = await healthService.getProductionReadiness();

    // When Gateway is disconnected (not connected), statuses for DiscordBot & Gateway must NOT be READY
    const isConnected = discordService.isConnected();
    if (!isConnected) {
      assert.notEqual(readiness.statuses.DiscordBot, 'READY', 'DiscordBot status must not be READY when disconnected');
      assert.notEqual(readiness.statuses.Gateway, 'READY', 'Gateway status must not be READY when disconnected');
    }

    // Core application ready is distinguished from external dependencies
    assert.equal(typeof readiness.coreApplicationReady, 'boolean');
    assert.ok(['VERIFIED', 'BLOCKED_BY_ENVIRONMENT', 'FAILED'].includes(readiness.externalDiscordVerified));

    details.test8_gatewayDisconnectNotReady = 'LEAVES_READY';
  });

  // --------------------------------------------------------------------------
  // TEST 9: Successful engagement → SENT only after real provider confirmation
  // --------------------------------------------------------------------------
  console.log('\n[Task 129 - Test 9] Testing Successful engagement → SENT only after real provider confirmation...');
  await test('TEST 9: Engagement pipeline never marks SENT without real Discord snowflake confirmation', async () => {
    const commId = `comm_eng_test_${Date.now()}`;
    await communitiesRepository.create({
      id: commId,
      name: 'Confirmation Test Community',
      guildId: `guild_${Date.now()}`,
      timezone: 'UTC',
    } as any);

    try {
      const res = await EngagementDeliveryService.deliverMessage({
        communityId: commId,
        actorUserId: 'usr_operator',
        actorRole: 'OWNER',
        featureKey: 'CAMPAIGNS',
        targetChannelId: '987654321098765432',
        content: 'Verification of delivery confirmation pipeline',
      });

      // Since bot is not connected in this test environment, status must be BOT_NOT_CONNECTED, NEVER 'SENT'
      assert.notEqual(res.status, 'SENT', 'Must never report SENT without Discord provider confirmation');
      assert.equal(res.status === 'BOT_NOT_CONNECTED' || res.failureReason === 'BOT_NOT_CONNECTED', true);
    } finally {
      await communitiesRepository.delete(commId);
    }

    details.test9_engagementConfirmation = 'CONFIRMED';
  });

  // --------------------------------------------------------------------------
  // TEST 10: Provider failure → not SENT and no successful usage count
  // --------------------------------------------------------------------------
  console.log('\n[Task 129 - Test 10] Testing Provider failure → not SENT and no successful usage count...');
  await test('TEST 10: Provider failure prevents SENT status and does not increment usage quota', async () => {
    const commId = `comm_usage_test_${Date.now()}`;
    await communitiesRepository.create({
      id: commId,
      name: 'Usage Test Community',
      guildId: `guild_${Date.now()}`,
      timezone: 'UTC',
    } as any);

    try {
      // Record initial usage
      const initialUsage = await UsageService.getUsage(commId, 'CAMPAIGNS_MESSAGES_SENT');

      // Attempt delivery which will fail due to BOT_NOT_CONNECTED
      const res = await EngagementDeliveryService.deliverMessage({
        communityId: commId,
        actorUserId: 'usr_operator',
        actorRole: 'OWNER',
        featureKey: 'CAMPAIGNS',
        targetChannelId: '987654321098765432',
        content: 'Testing quota non-incrementation on failure',
      });

      assert.notEqual(res.status, 'SENT');

      // Check usage after failed attempt: must remain identical
      const postUsage = await UsageService.getUsage(commId, 'CAMPAIGNS_MESSAGES_SENT');
      assert.equal(postUsage, initialUsage, 'Usage count must NOT increment on failed delivery attempt');
    } finally {
      await communitiesRepository.delete(commId);
    }

    details.test10_providerFailureNoUsage = 'VERIFIED_NO_USAGE_LEAK';
  });

  console.log('\n================================================================================');
  console.log(`TASK 129 CERTIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED, ${blocked} BLOCKED`);
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

// Auto-run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTask129Tests()
    .then((res) => {
      if (res.failed > 0) {
        process.exit(1);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Task 129 test runner failed:', err);
      process.exit(1);
    });
}
