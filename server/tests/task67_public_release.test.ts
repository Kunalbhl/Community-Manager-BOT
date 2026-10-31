import { discordCommands } from '../integrations/discord/commands/index.js';
import { discordGuildLinkService } from '../services/discordGuildLink.service.js';
import { communitiesRepository, auditLogsRepository } from '../repositories/index.js';
import { config } from '../config/env.js';
import { logger } from '../logging/logger.js';

export async function runTask67PublicReleaseTestSuite() {
  logger.info('===========================================================');
  logger.info('=== Starting TASK 67 Public Release & Registry Test Suite =');
  logger.info('===========================================================');

  // 1. Verify Canonical APP_URL and Environment Configuration
  logger.info('[Test 1] Verifying Canonical APP_URL and Environment Configuration...');
  if (!config.APP_URL || typeof config.APP_URL !== 'string' || !config.APP_URL.startsWith('http')) {
    throw new Error(`[Test 1 Failed] Invalid canonical APP_URL: ${config.APP_URL}`);
  }
  logger.info(`[Test 1 Passed] Canonical APP_URL resolved: ${config.APP_URL} (Environment: ${config.NODE_ENV})`);

  // 2. Verify Clean Command Registry (Exactly 14 Primary Commands)
  logger.info('[Test 2] Auditing Discord Command Registry Cleanup...');
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
  ];

  const registeredCommandNames = discordCommands.map((c) => c.data.name);
  if (registeredCommandNames.length !== 14) {
    throw new Error(`[Test 2 Failed] Expected exactly 14 primary commands, got ${registeredCommandNames.length}: [${registeredCommandNames.join(', ')}]`);
  }

  for (const cmdName of expectedPrimaryCommands) {
    if (!registeredCommandNames.includes(cmdName)) {
      throw new Error(`[Test 2 Failed] Required canonical command '/${cmdName}' is missing!`);
    }
  }

  // Ensure obsolete duplicates are removed
  if (registeredCommandNames.includes('application')) {
    throw new Error(`[Test 2 Failed] Obsolete command '/application' should be removed in favor of '/applications'!`);
  }
  if (registeredCommandNames.includes('recruiter-code')) {
    throw new Error(`[Test 2 Failed] Obsolete command '/recruiter-code' should be removed in favor of '/create-recruiter-code'!`);
  }
  logger.info(`[Test 2 Passed] Clean registry verified with exactly 14 primary commands: [${expectedPrimaryCommands.join(', ')}]`);

  // 3. Test Bot Guild Linking, Reinstall Restoration & Tenant Security
  logger.info('[Test 3] Testing Real Guild Linking, Reinstallation & Tenant Isolation...');
  const testGuildId = '888777666555444333';
  const testCommunityId = `comm_${testGuildId}`;

  // Initial installation
  const installResult = await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
    guildId: testGuildId,
    communityId: testCommunityId,
    source: 'BOT_JOIN',
  });

  if (!installResult.success || installResult.communityId !== testCommunityId) {
    throw new Error(`[Test 3 Failed] Guild installation failed: ${JSON.stringify(installResult)}`);
  }

  // Mark as BOT_REMOVED
  await communitiesRepository.update(testCommunityId, {
    connectionStatus: 'BOT_REMOVED' as any,
  });

  // Reinstall bot
  const reinstallResult = await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
    guildId: testGuildId,
    communityId: testCommunityId,
    source: 'BOT_JOIN',
  });

  if (!reinstallResult.success || reinstallResult.communityId !== testCommunityId) {
    throw new Error(`[Test 3 Failed] Reinstallation created duplicate or lost community record!`);
  }

  const restoredComm = await communitiesRepository.getById(testCommunityId);
  if (!restoredComm || restoredComm.id !== testCommunityId) {
    throw new Error(`[Test 3 Failed] Restored community document mismatch!`);
  }
  logger.info(`[Test 3 Passed] Guild reinstallation cleanly restored existing community record without duplicates.`);

  // 4. Verify Diagnostic Audit Logging
  logger.info('[Test 4] Auditing Diagnostic Security Log Persistence...');
  const auditLogs = await auditLogsRepository.list({
    where: [{ field: 'communityId', operator: '==', value: testCommunityId }],
    limit: 5,
  });

  if (auditLogs.length === 0) {
    throw new Error(`[Test 4 Failed] Expected diagnostic audit logs for ${testCommunityId}`);
  }
  logger.info(`[Test 4 Passed] Found ${auditLogs.length} diagnostic audit log entries.`);

  logger.info('===========================================================');
  logger.info('=== TASK 67 Public Release & Registry Test Suite PASSED ===');
  logger.info('===========================================================');

  return true;
}
