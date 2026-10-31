import { discordGuildLinkService } from '../services/discordGuildLink.service.js';
import { communitiesRepository } from '../repositories/index.js';
import { logger } from '../logging/logger.js';

export async function testTask65GuildLink() {
  logger.info('=== Starting Task 65 Guild Link Verification Test ===');

  const mockGuildId = '123456789012345678';
  const targetCommunityId = `comm_${mockGuildId}`;

  // 1. Test Guild Resolution & Synchronization
  const result = await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
    guildId: mockGuildId,
    communityId: targetCommunityId,
    source: 'BOT_JOIN',
  });

  logger.info(`Link Result Success: ${result.success}`);
  logger.info(`Community ID: ${result.communityId}`);
  logger.info(`Connection Status: ${result.connectionStatus}`);
  logger.info(`Guild Name: ${result.guildName}`);

  if (!result.success) {
    throw new Error(`Task 65 Guild Link failed: ${result.message}`);
  }

  // 2. Verify stored community record
  const comm = await communitiesRepository.getById(targetCommunityId);
  if (!comm || comm.guildId !== mockGuildId) {
    throw new Error('Community record not properly persisted with guildId!');
  }

  // 3. Test duplicate collision protection
  const collisionResult = await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
    guildId: mockGuildId,
    communityId: 'comm_other_community',
    source: 'ONBOARDING',
  });

  logger.info(`Collision Protection Test Result: ${collisionResult.connectionStatus}`);
  if (collisionResult.connectionStatus !== 'DISCORD_GUILD_ALREADY_CONNECTED') {
    throw new Error('Collision protection failed! Allowed duplicate guild binding.');
  }

  logger.info('=== Task 65 Guild Link Verification Test Passed Successfully! ===');
  return true;
}
