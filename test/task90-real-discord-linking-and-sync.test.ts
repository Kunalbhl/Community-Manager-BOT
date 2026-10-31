import assert from 'node:assert/strict';
import { discordGuildLinkService } from '../server/services/discordGuildLink.service.js';
import { onboardingService } from '../server/services/onboarding.service.js';
import { discordAuthService } from '../server/services/discordAuth.service.js';
import { discordMemberSyncService } from '../server/services/discordMemberSync.service.js';
import { discordCapabilityService } from '../server/services/discordCapability.service.js';
import {
  communitiesRepository,
  discordMembersRepository,
  auditLogsRepository,
  platformServersRepository,
} from '../server/repositories/index.js';

export async function runTask90Tests() {
  console.log('\n======================================================================');
  console.log('TASK 90 — REAL DISCORD SERVER LINKING & LIVE DATA SYNCHRONIZATION HARDENING');
  console.log('======================================================================');

  let passed = 0;
  let failed = 0;

  const test = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  };

  console.log('--- 1. Canonical Discord Application ID & OAuth Installation URL ---');

  await test('Canonical Application ID and Bot Install URL are strictly maintained', async () => {
    const installUrl = discordAuthService.getBotInstallUrl();
    assert.ok(installUrl.includes('client_id=1547515985416822884'));
    assert.ok(installUrl.includes('scope=bot'));
  });

  console.log('--- 2. Authoritative Guild Resolution & Verification ---');

  await test('resolveAndSyncDiscordGuildConnection creates community and synchronizes records', async () => {
    const guildId = `guild_t90_${Date.now()}`;
    const userId = `usr_owner_t90_${Date.now()}`;
    const result = await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
      guildId,
      userId,
      source: 'ONBOARDING',
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.communityId);
    assert.strictEqual(result.guildId, guildId);
    assert.ok(['CONNECTED', 'PERMISSION_REQUIRED'].includes(result.connectionStatus));

    // Verify community persistence in repository
    const stored = await communitiesRepository.getById(result.communityId);
    assert.ok(stored);
    assert.strictEqual(stored.guildId, guildId);
  });

  await test('Authoritative guild resolver provides deterministic metadata for target guild', async () => {
    const guildId = `guild_meta_${Date.now()}`;
    const userId = `usr_test_${Date.now()}`;

    const resolved = await discordGuildLinkService.resolveDiscordGuildForCommunity(guildId, userId);
    assert.ok(resolved);
    assert.strictEqual(resolved.id, guildId);
    assert.strictEqual(resolved.botPresent, true);
  });

  console.log('--- 3. Onboarding Wizard Full Lifecycle End-to-End ---');

  await test('Onboarding wizard lifecycle executes seamlessly from start to completion', async () => {
    const userId = `usr_onboard_${Date.now()}`;
    const guildId = `guild_full_${Date.now()}`;

    // 1. Check onboarding status for new user
    const statusBefore = await onboardingService.getOnboardingStatus(userId, 'OWNER', undefined);
    assert.strictEqual(statusBefore.onboardingRequired, true);

    // 2. Start onboarding
    const init = await onboardingService.startOnboarding(userId, 'OWNER', 'comm_new');
    assert.strictEqual(init.currentStep, 'CONNECT_DISCORD');

    // 3. Select and verify server
    const verificationRes = await onboardingService.selectAndVerifyServer(
      userId,
      'OWNER',
      guildId,
      'Apex Legends Production Server'
    );
    assert.ok(verificationRes.community);
    const commId = verificationRes.community.id;
    assert.ok(commId);
    assert.strictEqual(verificationRes.summary.passed, true);

    // 4. Execute initial community sync
    const syncRes = await onboardingService.runInitialSync(userId, 'OWNER', commId);
    assert.ok(syncRes.syncTimestamp);
    assert.ok(syncRes.memberCount >= 0);
    assert.ok(syncRes.channelCount >= 0);

    // 5. Configure workspace
    const configRes = await onboardingService.configureCommunity(userId, 'OWNER', commId, {
      displayName: 'Apex Legends Community',
      timezone: 'America/New_York',
      welcomeSettings: {
        enablePersonalDm: true,
        enableServerWelcome: true,
        enableAutoRoleAssignment: true,
      },
      notificationPreferences: {
        alertsEnabled: true,
      },
      moderationDefaults: {
        autoModEnabled: true,
      },
    });
    assert.ok(configRes);

    // 6. Complete onboarding
    const finalRes = await onboardingService.completeOnboarding(userId, 'OWNER', commId);
    assert.strictEqual(finalRes.community.setupStatus, 'COMPLETED');

    // 7. Check status after completion
    const statusAfter = await onboardingService.getOnboardingStatus(userId, 'OWNER', commId);
    assert.strictEqual(statusAfter.onboardingRequired, false);
  });

  console.log('--- 4. Data Consistency & Gateway Hydration ---');

  await test('Discord Capability service returns real validation for linked guild', async () => {
    const guildId = `1547515985416822884`;
    const commId = `comm_${guildId}`;
    const validation = await discordCapabilityService.validateGuild(commId, guildId);
    assert.ok(validation);
    assert.strictEqual(validation.guildId, guildId);

    const channels = await discordCapabilityService.validateChannels(commId, guildId);
    assert.ok(Array.isArray(channels));

    const roleValidation = await discordCapabilityService.validateMemberRole(commId);
    assert.ok(roleValidation);
  });

  console.log('--- 5. Idempotent Re-linking & Multi-Tenant Isolation ---');

  await test('Re-linking an already configured guild updates metadata cleanly without duplicate corruption', async () => {
    const guildId = `guild_relink_${Date.now()}`;
    const userId = `usr_relink_${Date.now()}`;

    const firstLink = await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
      guildId,
      userId,
      source: 'MANUAL_REFRESH',
    });
    const commId = firstLink.communityId;

    const secondLink = await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
      guildId,
      userId,
      source: 'MANUAL_REFRESH',
    });

    assert.strictEqual(secondLink.communityId, commId);
  });

  console.log('======================================================================');
  console.log(`TASK 90 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('======================================================================\n');

  return { passed, failed };
}
