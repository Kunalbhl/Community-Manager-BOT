import { discordMemberSyncService } from './discordMemberSync.service.js';
import { DiscordResourceService } from './discordResource.service.js';
import { logger } from '../logging/logger.js';

export class DiscordSyncService {
  async syncCommunity(communityId: string, discordGuildId: string): Promise<{
    channelsSynced: number;
    rolesSynced: number;
    membersSynced: number;
    syncedAt: string;
  }> {
    logger.info(`[DiscordSyncService] Starting real synchronization for community ${communityId} (guild ${discordGuildId})`);
    
    const channelsResult = await DiscordResourceService.getChannels(discordGuildId);
    const rolesResult = await DiscordResourceService.getRoles(discordGuildId);
    const memberSyncResult = await discordMemberSyncService.syncGuildMembers(communityId, discordGuildId);

    return {
      channelsSynced: channelsResult.items?.length || 0,
      rolesSynced: rolesResult.items?.length || 0,
      membersSynced: memberSyncResult.syncedCount || 0,
      syncedAt: new Date().toISOString(),
    };
  }
}

export const discordSyncService = new DiscordSyncService();
