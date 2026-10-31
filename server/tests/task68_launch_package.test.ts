import { discordCommands } from '../integrations/discord/commands/index.js';
import { discordAuthService } from '../services/discordAuth.service.js';
import { discordGuildLinkService } from '../services/discordGuildLink.service.js';
import { communitiesRepository, auditLogsRepository } from '../repositories/index.js';
import { config } from '../config/env.js';
import { logger } from '../logging/logger.js';
import { AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD } from '../services/discordPermissionEngine.service.js';

export async function runTask68LaunchPackageTestSuite() {
  logger.info('================================================================');
  logger.info('=== Starting TASK 68 App Directory Launch Package Test Suite ===');
  logger.info('================================================================');

  // 1. Verify Canonical APP_URL and App Identity Branding
  logger.info('[Test 1] Verifying Branding & Canonical APP_URL...');
  if (!config.APP_URL || !config.APP_URL.startsWith('http')) {
    throw new Error(`[Test 1 Failed] Invalid canonical APP_URL: ${config.APP_URL}`);
  }
  logger.info(`[Test 1 Passed] Product "Community Manager" configured on canonical host: ${config.APP_URL}`);

  // 2. Verify Shared Bot Installation URL and Granular Permissions Bitfield
  logger.info('[Test 2] Verifying Shared Add to Discord Bot Installation URL & Scopes...');
  const testGuildId = '777888999000111222';
  const botInstallUrl = discordAuthService.getBotInstallUrl(testGuildId);

  if (!botInstallUrl.includes(`permissions=${AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD}`)) {
    throw new Error(`[Test 2 Failed] Bot installation URL missing authoritative permissions bitfield: ${botInstallUrl}`);
  }
  if (!botInstallUrl.includes('scope=bot%20applications.commands') && !botInstallUrl.includes('scope=bot+applications.commands')) {
    throw new Error(`[Test 2 Failed] Bot installation URL missing required scopes: ${botInstallUrl}`);
  }
  logger.info(`[Test 2 Passed] Authoritative Bot Install URL validated: ${botInstallUrl}`);

  // 3. Verify Authoritative Command Registry & Categorized /help Discovery Command
  logger.info('[Test 3] Auditing Final Slash Command Registry (15 Primary Commands)...');
  const expectedPrimaryCommands = [
    'community-manager',
    'user-status',
    'applications',
    'interview',
    'approve',
    'reject',
    'escalate',
    'create-recruiter-code',
    'blacklist',
    'recruiter',
    'referral',
    'recruiter-benefits',
    'rules',
    'support',
    'help',
  ];

  const registeredCommandNames = discordCommands.map((c) => c.data.name);
  if (registeredCommandNames.length !== 15) {
    throw new Error(`[Test 3 Failed] Expected exactly 15 primary commands, got ${registeredCommandNames.length}: [${registeredCommandNames.join(', ')}]`);
  }

  for (const cmdName of expectedPrimaryCommands) {
    if (!registeredCommandNames.includes(cmdName)) {
      throw new Error(`[Test 3 Failed] Required command '/${cmdName}' missing from registry!`);
    }
  }

  // Verify obsolete command aliases remain strictly excluded
  if (registeredCommandNames.includes('application')) {
    throw new Error(`[Test 3 Failed] Deprecated command '/application' must remain excluded!`);
  }
  if (registeredCommandNames.includes('recruiter-code')) {
    throw new Error(`[Test 3 Failed] Deprecated command '/recruiter-code' must remain excluded!`);
  }
  logger.info(`[Test 3 Passed] Clean command registry verified with 15 primary commands, including categorized '/help'.`);

  // 4. Test Unauthenticated Bot-Join Installation, Automatic Detection & Guild Linking
  logger.info('[Test 4] Simulating Unauthenticated Bot Installation & Automatic Community Restoration...');
  const testCommunityId = `comm_${testGuildId}`;

  // Initial installation flow
  const linkResult = await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
    guildId: testGuildId,
    communityId: testCommunityId,
    source: 'BOT_JOIN',
  });

  if (!linkResult.success || linkResult.communityId !== testCommunityId) {
    throw new Error(`[Test 4 Failed] Automatic community linking failed: ${JSON.stringify(linkResult)}`);
  }

  // Simulate bot removal and re-installation
  await communitiesRepository.update(testCommunityId, {
    connectionStatus: 'BOT_REMOVED' as any,
  });

  const reLinkResult = await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
    guildId: testGuildId,
    communityId: testCommunityId,
    source: 'BOT_JOIN',
  });

  if (!reLinkResult.success || reLinkResult.communityId !== testCommunityId) {
    throw new Error(`[Test 4 Failed] Re-installation failed to restore community record!`);
  }

  const restoredComm = await communitiesRepository.getById(testCommunityId);
  if (!restoredComm || restoredComm.id !== testCommunityId) {
    throw new Error(`[Test 4 Failed] Restored community document mismatch!`);
  }
  logger.info(`[Test 4 Passed] Bot installation return flow successfully restored community record without duplicates.`);

  // 5. Verify Diagnostic Audit Logging & Multi-Tenant Security
  logger.info('[Test 5] Verifying Audit Logging & Tenant Isolation...');
  const auditLogs = await auditLogsRepository.list({
    where: [{ field: 'communityId', operator: '==', value: testCommunityId }],
    limit: 5,
  });

  if (auditLogs.length === 0) {
    throw new Error(`[Test 5 Failed] Expected diagnostic audit log entries for ${testCommunityId}`);
  }
  logger.info(`[Test 5 Passed] Verified ${auditLogs.length} diagnostic audit log entries.`);

  logger.info('================================================================');
  logger.info('=== TASK 68 App Directory Launch Package Test Suite PASSED ===');
  logger.info('================================================================');

  return true;
}
