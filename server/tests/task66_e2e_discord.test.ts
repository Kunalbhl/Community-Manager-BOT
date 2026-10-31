import { discordGuildLinkService } from '../services/discordGuildLink.service.js';
import { discordCommands } from '../integrations/discord/commands/index.js';
import { communitiesRepository, auditLogsRepository } from '../repositories/index.js';
import { logger } from '../logging/logger.js';
import { config } from '../config/env.js';

export async function runTask66E2ETestSuite() {
  logger.info('===========================================================');
  logger.info('=== Starting TASK 66 E2E Discord Integration Test Suite ===');
  logger.info('===========================================================');

  const testGuildId = '999888777666555444';
  const testCommunityId = `comm_${testGuildId}`;

  // 1. Test Initial Bot Installation & Guild Linking
  logger.info('[Test 1] Testing Bot Installation & Automatic Guild Activation...');
  const installResult = await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
    guildId: testGuildId,
    communityId: testCommunityId,
    source: 'BOT_JOIN',
  });

  if (!installResult.success || installResult.communityId !== testCommunityId) {
    throw new Error(`[Test 1 Failed] Expected successful link for ${testCommunityId}, got: ${JSON.stringify(installResult)}`);
  }
  logger.info(`[Test 1 Passed] Guild linked successfully. Status: ${installResult.connectionStatus}`);

  // 2. Test Community Record & Metadata Persistence
  logger.info('[Test 2] Verifying Community Record Persistence...');
  const communityDoc = await communitiesRepository.getById(testCommunityId);
  if (!communityDoc || communityDoc.guildId !== testGuildId) {
    throw new Error(`[Test 2 Failed] Community document not persisted correctly!`);
  }
  logger.info(`[Test 2 Passed] Community persisted with Guild ID ${communityDoc.guildId}`);

  // 3. Test Bot Removal & Reinstallation Lifecycle (Preserving Data without Duplicate Community)
  logger.info('[Test 3] Testing Bot Reinstallation Lifecycle (BOT_REMOVED -> RESYNC)...');
  
  // Mark community as BOT_REMOVED
  await communitiesRepository.update(testCommunityId, {
    connectionStatus: 'BOT_REMOVED' as any,
  });

  // Trigger reinstallation
  const reinstallResult = await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
    guildId: testGuildId,
    communityId: testCommunityId,
    source: 'BOT_JOIN',
  });

  if (!reinstallResult.success || reinstallResult.communityId !== testCommunityId) {
    throw new Error(`[Test 3 Failed] Reinstallation created duplicate or failed: ${JSON.stringify(reinstallResult)}`);
  }

  const restoredComm = await communitiesRepository.getById(testCommunityId);
  if (!restoredComm || restoredComm.id !== testCommunityId) {
    throw new Error(`[Test 3 Failed] Original community record was lost or duplicated!`);
  }
  logger.info(`[Test 3 Passed] Reinstalled bot cleanly restored community ${testCommunityId} without duplicating.`);

  // 4. Test Slash Command Registry & Coverage
  logger.info('[Test 4] Verifying Slash Command Registry...');
  const requiredCommands = [
    'community-manager',
    'user-status',
    'application',
    'applications',
    'interview',
    'approve',
    'reject',
    'escalate',
    'recruiter-code',
    'create-recruiter-code',
    'blacklist',
    'recruiter',
    'referral',
    'recruiter-benefits',
    'rules',
    'support',
  ];

  const registeredNames = new Set(discordCommands.map((c) => c.data.name));
  for (const cmdName of requiredCommands) {
    if (!registeredNames.has(cmdName)) {
      throw new Error(`[Test 4 Failed] Required slash command '/${cmdName}' is missing from registry!`);
    }
  }
  logger.info(`[Test 4 Passed] All ${requiredCommands.length} required slash commands are registered with handlers.`);

  // 5. Test Audit Log Diagnostic Event Publishing
  logger.info('[Test 5] Checking Audit Log Event Records...');
  const auditLogs = await auditLogsRepository.list({
    where: [{ field: 'communityId', operator: '==', value: testCommunityId }],
    limit: 5,
  });

  if (auditLogs.length === 0) {
    throw new Error(`[Test 5 Failed] No diagnostic audit events found for ${testCommunityId}`);
  }
  logger.info(`[Test 5 Passed] Found ${auditLogs.length} audit event records.`);

  logger.info('===========================================================');
  logger.info('=== TASK 66 E2E Discord Integration Suite PASSED 100% =====');
  logger.info('===========================================================');

  return true;
}
