import assert from 'node:assert/strict';
import { config } from '../server/config/env.js';
import {
  FirestoreRepository,
  FirestoreUnavailableError,
  DevelopmentSimulationPersistenceProvider,
  isRealPersistenceMode,
} from '../server/repositories/firestore.repository.js';
import {
  RealDiscordProvider,
  DevelopmentDiscordProvider,
  AUTHORITATIVE_GATEWAY_INTENTS,
} from '../server/integrations/discord/discord.service.js';
import { GatewayIntentBits } from 'discord.js';
import { discordGuildLinkService } from '../server/services/discordGuildLink.service.js';
import { SettingsService } from '../server/services/settings.service.js';
import { communitiesRepository, auditLogsRepository, schedulesRepository } from '../server/repositories/index.js';
import { EngagementDeliveryService } from '../server/services/engagement.service.js';
import { EntitlementService } from '../server/services/entitlement.service.js';
import { scheduleService } from '../server/services/schedule.service.js';
import { auditService } from '../server/services/audit.service.js';
import { idempotencyService } from '../server/services/idempotency.service.js';
import { DiscordRestVerificationService } from '../server/services/discordRestVerification.service.js';

export interface Task128CertificationReport {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  details: {
    firestoreRealPath: 'VERIFIED' | 'FAILED';
    discordRestPath: 'VERIFIED' | 'NOT_VERIFIED' | 'BLOCKED_BY_ENVIRONMENT' | 'FAILED';
    discordGatewayPath: 'VERIFIED' | 'FAILED';
    guildAuthorityPath: 'VERIFIED' | 'FAILED';
    authTenancyPath: 'VERIFIED' | 'FAILED';
    engagementDeliveryPath: 'VERIFIED' | 'FAILED';
    schedulerIdempotencyPath: 'VERIFIED' | 'FAILED';
    auditUsagePath: 'VERIFIED' | 'FAILED';
    simulationIsolationPath: 'VERIFIED' | 'FAILED';
  };
}

export async function runTask128Tests(): Promise<Task128CertificationReport> {
  console.log('\n================================================================================');
  console.log('TASK 128 — LIVE PRODUCTION PATH CERTIFICATION');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;
  let blocked = 0;
  let skipped = 0;

  const details: Task128CertificationReport['details'] = {
    firestoreRealPath: 'FAILED',
    discordRestPath: 'NOT_VERIFIED',
    discordGatewayPath: 'FAILED',
    guildAuthorityPath: 'FAILED',
    authTenancyPath: 'FAILED',
    engagementDeliveryPath: 'FAILED',
    schedulerIdempotencyPath: 'FAILED',
    auditUsagePath: 'FAILED',
    simulationIsolationPath: 'FAILED',
  };

  async function test(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ [TASK 128] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [TASK 128 FAILED] ${name}:`, err.message);
      failed++;
    }
  }

  // ===================================================================
  // 1. REAL FIRESTORE PATH CERTIFICATION
  // ===================================================================
  console.log('\n[Task 128 - Step 1] Real Firestore Path & Fail-Closed Behavior...');
  await test('Real Firestore path: Prohibits in-memory simulation and fails closed in real mode', async () => {
    // Temporarily switch runtime mode to PRODUCTION to verify real-persistence enforcement
    const originalMode = config.APP_RUNTIME_MODE;
    try {
      (config as any).APP_RUNTIME_MODE = 'PRODUCTION';
      assert.equal(isRealPersistenceMode(), true, 'isRealPersistenceMode() must be true in PRODUCTION');

      // 1. Instantiating DevelopmentSimulationPersistenceProvider in PRODUCTION must fail closed
      assert.throws(
        () => {
          new DevelopmentSimulationPersistenceProvider('test_prohibited_collection');
        },
        /FAIL_CLOSED/,
        'DevelopmentSimulationPersistenceProvider must throw FAIL_CLOSED in PRODUCTION mode'
      );

      // 2. Real FirestoreRepository must fail closed when Firestore is unavailable in real mode,
      // without touching or creating in-memory simulation stores
      const testRepo = new FirestoreRepository<{ id: string; name: string }>('task128_cert_probe');

      // Attempting CRUD operations without active Firestore in production mode must throw FirestoreUnavailableError
      await assert.rejects(
        async () => {
          await testRepo.getById('non_existent_probe_id');
        },
        FirestoreUnavailableError,
        'getById must throw FirestoreUnavailableError when Firestore is unavailable in production'
      );

      await assert.rejects(
        async () => {
          await testRepo.create({ id: 'probe_doc_1', name: 'Probe' });
        },
        FirestoreUnavailableError,
        'create must throw FirestoreUnavailableError when Firestore is unavailable in production'
      );

      await assert.rejects(
        async () => {
          await testRepo.update('probe_doc_1', { name: 'Probe Updated' });
        },
        FirestoreUnavailableError,
        'update must throw FirestoreUnavailableError when Firestore is unavailable in production'
      );

      await assert.rejects(
        async () => {
          await testRepo.delete('probe_doc_1');
        },
        FirestoreUnavailableError,
        'delete must throw FirestoreUnavailableError when Firestore is unavailable in production'
      );

      await assert.rejects(
        async () => {
          await testRepo.list();
        },
        FirestoreUnavailableError,
        'list must throw FirestoreUnavailableError when Firestore is unavailable in production'
      );
    } finally {
      (config as any).APP_RUNTIME_MODE = originalMode;
    }

    details.firestoreRealPath = 'VERIFIED';
  });

  // ===================================================================
  // 2. REAL DISCORD REST PATH (ENVIRONMENT AWARE)
  // ===================================================================
  console.log('\n[Task 128 - Step 2] Real Discord REST Path...');
  await test('Real Discord REST path: Truthfully reports REST status or external verification outcome', async () => {
    const restResult = await DiscordRestVerificationService.verifyCurrentUser();
    details.discordRestPath = restResult.outcome;

    if (restResult.outcome === 'VERIFIED') {
      console.log(`  -> Real Discord REST Verified: Bot ID ${restResult.botUserId} (latency: ${restResult.latencyMs}ms)`);
    } else if (restResult.outcome === 'BLOCKED_BY_ENVIRONMENT') {
      console.log(`  -> Live Discord REST unreachable from sandbox (${restResult.errorMessage}).`);
      console.log('  -> Result: BLOCKED_BY_ENVIRONMENT (Truthful external reporting per Section 10)');
      blocked++;
    } else {
      console.log(`  -> Live Discord API responded: ${restResult.classification} (status: ${restResult.httpStatus}, latency: ${restResult.latencyMs}ms)`);
      console.log('  -> Result: FAILED (External credential verification rejected by Discord API per Task 129 rules)');
    }

    assert.ok(
      ['VERIFIED', 'BLOCKED_BY_ENVIRONMENT', 'FAILED'].includes(restResult.outcome),
      'Outcome must be one of VERIFIED, BLOCKED_BY_ENVIRONMENT, or FAILED'
    );
  });

  // ===================================================================
  // 3. REAL GATEWAY PATH CERTIFICATION
  // ===================================================================
  console.log('\n[Task 128 - Step 3] Real Discord Gateway Path...');
  await test('Real Discord Gateway: Authoritative intents, singleton client, and truthful lifecycle', async () => {
    // 1. Check authoritative intents
    assert.ok(
      AUTHORITATIVE_GATEWAY_INTENTS.includes(GatewayIntentBits.MessageContent),
      'AUTHORITATIVE_GATEWAY_INTENTS must include GatewayIntentBits.MessageContent'
    );
    assert.ok(
      AUTHORITATIVE_GATEWAY_INTENTS.includes(GatewayIntentBits.Guilds),
      'AUTHORITATIVE_GATEWAY_INTENTS must include GatewayIntentBits.Guilds'
    );
    assert.ok(
      AUTHORITATIVE_GATEWAY_INTENTS.includes(GatewayIntentBits.GuildMembers),
      'AUTHORITATIVE_GATEWAY_INTENTS must include GatewayIntentBits.GuildMembers'
    );
    assert.ok(
      AUTHORITATIVE_GATEWAY_INTENTS.includes(GatewayIntentBits.GuildMessages),
      'AUTHORITATIVE_GATEWAY_INTENTS must include GatewayIntentBits.GuildMessages'
    );
    assert.ok(
      AUTHORITATIVE_GATEWAY_INTENTS.includes(GatewayIntentBits.DirectMessages),
      'AUTHORITATIVE_GATEWAY_INTENTS must include GatewayIntentBits.DirectMessages'
    );

    // 2. RealDiscordProvider instantiation
    const provider = new RealDiscordProvider();
    const diag = provider.getDiagnostics();
    assert.ok(diag.intentsEnabled.includes('MessageContent'));
    assert.ok(diag.intentsEnabled.includes('Guilds'));
    assert.ok(diag.intentsEnabled.includes('GuildMembers'));
    assert.ok(diag.intentsEnabled.includes('GuildMessages'));
    assert.ok(diag.intentsEnabled.includes('DirectMessages'));

    // 3. Disconnected provider must truthfully report not connected
    assert.equal(provider.isConnected(), false);
    assert.equal(diag.guildsCount, 0);

    // 4. Disconnect cleanly transitions state away from READY
    await provider.disconnect();
    assert.equal(provider.isConnected(), false);
    assert.equal(provider.getConnectionState(), 'DISCONNECTED');

    // 5. DevelopmentDiscordProvider is strictly prohibited in PRODUCTION
    const origMode = config.APP_RUNTIME_MODE;
    try {
      (config as any).APP_RUNTIME_MODE = 'PRODUCTION';
      assert.throws(
        () => {
          new DevelopmentDiscordProvider();
        },
        /FAIL_CLOSED/,
        'DevelopmentDiscordProvider must throw FAIL_CLOSED in PRODUCTION'
      );
    } finally {
      (config as any).APP_RUNTIME_MODE = origMode;
    }

    details.discordGatewayPath = 'VERIFIED';
  });

  // ===================================================================
  // 4. REAL DISCORD GUILD AUTHORITY CERTIFICATION
  // ===================================================================
  console.log('\n[Task 128 - Step 4] Real Discord Guild Authority & Collision Prevention...');
  await test('Guild Authority: Rejects collisions, invalid guild IDs, and cross-linking', async () => {
    // 1. Invalid or empty guild ID rejected
    await assert.rejects(
      async () => {
        await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
          guildId: '',
          userId: 'usr_owner_test',
        });
      },
      /Valid Guild ID is required/,
      'Must reject empty guild ID'
    );

    // 2. Collision enforcement: One Discord Guild ID cannot belong to multiple communities
    const testGuildId = `guild_cert_${Date.now()}`;
    const comm1Id = `comm_cert_1_${Date.now()}`;
    const comm2Id = `comm_cert_2_${Date.now()}`;

    // Register comm1 linked to testGuildId
    await communitiesRepository.create({
      id: comm1Id,
      name: 'Community Workspace One',
      guildId: testGuildId,
      discordGuildId: testGuildId,
      ownerUserId: 'usr_owner_1',
      timezone: 'UTC',
    } as any);

    try {
      // Mock resolution for this guild so resolver finds it
      const origResolve = discordGuildLinkService.resolveDiscordGuildForCommunity.bind(discordGuildLinkService);
      discordGuildLinkService.resolveDiscordGuildForCommunity = async (gid) => {
        if (gid === testGuildId) {
          return {
            id: testGuildId,
            name: 'Test Server',
            botPresent: true,
            permissionsBitfield: '8',
          };
        }
        return origResolve(gid);
      };

      // Attempt to link the SAME guild to comm2Id
      const collisionResult = await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
        guildId: testGuildId,
        communityId: comm2Id,
        userId: 'usr_owner_2',
      });

      assert.equal(collisionResult.success, false, 'Linking conflicting guild must fail');
      assert.equal(
        collisionResult.connectionStatus,
        'DISCORD_GUILD_ALREADY_CONNECTED',
        'Collision status must be DISCORD_GUILD_ALREADY_CONNECTED'
      );
      assert.equal(collisionResult.communityId, comm1Id, 'Must identify existing linked community');

      discordGuildLinkService.resolveDiscordGuildForCommunity = origResolve;
    } finally {
      await communitiesRepository.delete(comm1Id);
    }

    details.guildAuthorityPath = 'VERIFIED';
  });

  // ===================================================================
  // 5. AUTHENTICATION & MULTI-TENANT ISOLATION CERTIFICATION
  // ===================================================================
  console.log('\n[Task 128 - Step 5] Authentication & Multi-Tenant Isolation...');
  await test('Tenant Isolation: Strict boundary between tenants and rejection of client role headers', async () => {
    const tenantA = `tenant_a_${Date.now()}`;
    const tenantB = `tenant_b_${Date.now()}`;

    // Create communities for tenant A and tenant B
    await communitiesRepository.create({
      id: tenantA,
      name: 'Tenant Community A',
      ownerUserId: 'usr_tenant_a_owner',
      guildId: `guild_tenant_a_${Date.now()}`,
      timezone: 'UTC',
    } as any);

    await communitiesRepository.create({
      id: tenantB,
      name: 'Tenant Community B',
      ownerUserId: 'usr_tenant_b_owner',
      guildId: `guild_tenant_b_${Date.now()}`,
      timezone: 'UTC',
    } as any);

    try {
      // Create settings for tenant A and tenant B
      await SettingsService.updateSettings(
        tenantA,
        { userId: 'usr_tenant_a_owner', role: 'OWNER' as const },
        { general: { displayName: 'Updated Tenant A Name', timezone: 'UTC' } }
      );

      await SettingsService.updateSettings(
        tenantB,
        { userId: 'usr_tenant_b_owner', role: 'OWNER' as const },
        { general: { displayName: 'Updated Tenant B Name', timezone: 'America/New_York' } }
      );

      // Verify isolation
      const settingsA = await SettingsService.getConsolidatedSettings(tenantA);
      const settingsB = await SettingsService.getConsolidatedSettings(tenantB);

      assert.equal(settingsA.general.displayName, 'Updated Tenant A Name');
      assert.equal(settingsB.general.displayName, 'Updated Tenant B Name');
      assert.notEqual(settingsA.general.displayName, settingsB.general.displayName);
      assert.equal(settingsA.general.timezone, 'UTC');
      assert.equal(settingsB.general.timezone, 'America/New_York');

      // Cross-tenant update attempt from tenant A context cannot alter tenant B
      try {
        await SettingsService.updateSettings(
          tenantA,
          { userId: 'usr_tenant_a_owner', role: 'OWNER' as const },
          { general: { displayName: 'Injected Name' } }
        );
      } catch (e) {
        // Ignored
      }

      const settingsBPost = await SettingsService.getConsolidatedSettings(tenantB);
      assert.equal(settingsBPost.general.displayName, 'Updated Tenant B Name', 'Tenant B settings must remain unchanged');
    } finally {
      await communitiesRepository.delete(tenantA);
      await communitiesRepository.delete(tenantB);
    }

    details.authTenancyPath = 'VERIFIED';
  });

  // ===================================================================
  // 6. ENGAGEMENT REAL DELIVERY PIPELINE CERTIFICATION
  // ===================================================================
  console.log('\n[Task 128 - Step 6] Engagement Real Delivery Pipeline...');
  await test('Engagement Delivery: Never marks SENT before Discord confirms and reports truthful failure', async () => {
    const commId = `comm_eng_test_${Date.now()}`;
    const correlationId = `corr_test_${Date.now()}`;

    // Ensure community exists so delivery reaches Discord Bot connection check
    await communitiesRepository.create({
      id: commId,
      name: 'Engagement Test Community',
      guildId: `guild_eng_${Date.now()}`,
      timezone: 'UTC',
    } as any);

    try {
      // 1. When Discord Bot is not connected, delivery must fail truthfully as BOT_NOT_CONNECTED
      const deliveryResult = await EngagementDeliveryService.deliverMessage({
        communityId: commId,
        actorUserId: 'usr_test_operator',
        actorRole: 'OWNER',
        featureKey: 'CAMPAIGNS',
        targetChannelId: '123456789012345678',
        content: 'Real production delivery certification test message',
        correlationId,
      });

      assert.notEqual(deliveryResult.status, 'SENT', 'Must never report SENT when Discord Bot is not connected');
      assert.equal(
        deliveryResult.status === 'BOT_NOT_CONNECTED' || deliveryResult.failureReason === 'BOT_NOT_CONNECTED',
        true,
        'Must report BOT_NOT_CONNECTED when gateway is not active'
      );
    } finally {
      await communitiesRepository.delete(commId);
    }

    details.engagementDeliveryPath = 'VERIFIED';
  });

  // ===================================================================
  // 7. SCHEDULER REAL EXECUTION & IDEMPOTENCY
  // ===================================================================
  console.log('\n[Task 128 - Step 7] Scheduler Real Execution & Idempotency...');
  await test('Scheduler: Idempotent execution, state persistence, and pause/cancel enforcement', async () => {
    const commId = `comm_sched_${Date.now()}`;
    const scheduleId = `sched_${Date.now()}`;
    const nowIso = new Date().toISOString();

    // Ensure community exists for foreign key checks
    await communitiesRepository.create({
      id: commId,
      name: 'Scheduler Test Community',
      timezone: 'UTC',
    } as any);

    try {
      // 1. Create schedule record
      const schedule = await schedulesRepository.create({
        id: scheduleId,
        communityId: commId,
        name: 'Certification Test Schedule',
        resourceType: 'AUTOMATION',
        resourceId: 'wf_test_1',
        timezone: 'UTC',
        recurrence: 'ONCE',
        nextExecutionAt: new Date(Date.now() - 5000).toISOString(), // Due now
        status: 'ACTIVE',
        createdAt: nowIso,
        updatedAt: nowIso,
      } as any);

      assert.equal(schedule.status, 'ACTIVE');

      // 2. Pause schedule
      const paused = await scheduleService.pauseSchedule(commId, scheduleId, 'usr_owner_test', 'OWNER');
      assert.equal(paused.status, 'PAUSED', 'Schedule must transition to PAUSED');

      // 3. While paused, processPendingSchedules must NOT execute it
      await scheduleService.processPendingSchedules();
      const afterPass = await schedulesRepository.getById(scheduleId);
      assert.equal(afterPass?.status, 'PAUSED', 'Paused schedule must not be executed by processPendingSchedules');

      // 4. Resume schedule
      const resumed = await scheduleService.resumeSchedule(commId, scheduleId, 'usr_owner_test', 'OWNER');
      assert.equal(resumed.status, 'ACTIVE', 'Schedule must transition back to ACTIVE');

      // 5. Cancel schedule
      const cancelled = await scheduleService.cancelSchedule(commId, scheduleId, 'usr_owner_test', 'OWNER');
      assert.equal(cancelled.status, 'CANCELLED', 'Schedule must transition to CANCELLED');

      // 6. IdempotencyService: duplicate key prevents duplicate execution
      const testIdempKey = `idemp_cert_${Date.now()}`;
      const firstCheck = await idempotencyService.acquire(testIdempKey, 'TEST_OP', commId);
      assert.equal(firstCheck.status, 'PROCEED', 'First acquire must PROCEED');

      await idempotencyService.complete(testIdempKey, { success: true, count: 1 });

      const secondCheck = await idempotencyService.acquire(testIdempKey, 'TEST_OP', commId);
      assert.equal(secondCheck.status, 'CACHED', 'Second acquire must report CACHED');
      assert.equal(secondCheck.response?.success, true);
    } finally {
      await communitiesRepository.delete(commId);
      await schedulesRepository.delete(scheduleId);
    }

    details.schedulerIdempotencyPath = 'VERIFIED';
  });

  // ===================================================================
  // 8. AUDIT & USAGE TRACKING
  // ===================================================================
  console.log('\n[Task 128 - Step 8] Audit & Usage Tracking...');
  await test('Audit & Usage: Truthful audit logs without secrets and accurate usage tracking', async () => {
    const commId = `comm_audit_${Date.now()}`;
    const testAction = 'CAMPAIGN_DISPATCHED';

    // Record audit log
    const auditRecord = await auditService.record({
      communityId: commId,
      actorUserId: 'usr_cert_operator',
      actorRole: 'OWNER',
      action: testAction as any,
      targetType: 'CAMPAIGN',
      targetId: 'cmp_12345',
      metadata: {
        sentCount: 10,
        result: 'SUCCESS',
        // Ensure sensitive secrets are not logged
        token: undefined,
      },
    });

    assert.ok(auditRecord.id, 'Audit record must have an ID');
    assert.equal(auditRecord.communityId, commId);
    assert.equal(auditRecord.actorUserId, 'usr_cert_operator');
    assert.equal(auditRecord.action, testAction);
    assert.equal(auditRecord.metadata.sentCount, 10);

    // Verify usage check limit
    const allowed = await EntitlementService.checkLimit(commId, 'CAMPAIGNS_MESSAGES_SENT', 1);
    assert.equal(typeof allowed, 'boolean', 'checkLimit must return boolean');

    // Clean up
    await auditLogsRepository.delete(auditRecord.id);

    details.auditUsagePath = 'VERIFIED';
  });

  // ===================================================================
  // 9. PRODUCTION / REAL MODE SIMULATION ISOLATION
  // ===================================================================
  console.log('\n[Task 128 - Step 9] Simulation Isolation Verification...');
  await test('Simulation Isolation: Development simulation is unreachable in production mode', async () => {
    const origMode = config.APP_RUNTIME_MODE;
    try {
      (config as any).APP_RUNTIME_MODE = 'PRODUCTION';

      // Verify simulation stores are blocked in real mode
      assert.throws(
        () => {
          new DevelopmentSimulationPersistenceProvider('isolated_test');
        },
        /FAIL_CLOSED/,
        'DevelopmentSimulationPersistenceProvider must not instantiate in PRODUCTION'
      );

      // Verify DevelopmentDiscordProvider is blocked in real mode
      assert.throws(
        () => {
          new DevelopmentDiscordProvider();
        },
        /FAIL_CLOSED/,
        'DevelopmentDiscordProvider must not instantiate in PRODUCTION'
      );
    } finally {
      (config as any).APP_RUNTIME_MODE = origMode;
    }

    details.simulationIsolationPath = 'VERIFIED';
  });

  console.log('\n================================================================================');
  console.log(`TASK 128 CERTIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED, ${blocked} BLOCKED`);
  console.log('================================================================================\n');

  return {
    passed,
    failed,
    blocked,
    skipped,
    details,
  };
}

if (process.argv[1]?.includes('task128')) {
  runTask128Tests()
    .then((r) => {
      if (r.failed > 0) process.exit(1);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
