import { communitiesRepository } from '../repositories/index.js';
import { CommunityDocument } from '../../shared/types/models.js';
import { discordGuildLinkService } from './discordGuildLink.service.js';

export class CommunityService {
  async getCommunityById(communityId: string): Promise<CommunityDocument | null> {
    return communitiesRepository.getById(communityId);
  }

  async getCommunityByGuildId(discordGuildId: string): Promise<CommunityDocument | null> {
    const list = await communitiesRepository.list({
      where: [{ field: 'discordGuildId', operator: '==', value: discordGuildId }]
    });
    return list.length > 0 ? list[0] : null;
  }

  async linkCommunityGuild(userId: string, discordGuildId: string, communityName: string): Promise<CommunityDocument> {
    const result = await discordGuildLinkService.resolveDiscordGuildForCommunity(discordGuildId, userId);
    if (!result) {
      throw new Error('GUILD_RESOLUTION_FAILED');
    }
    const comm = await communitiesRepository.getById(discordGuildId);
    if (!comm) {
      throw new Error('FAILED_TO_CREATE_COMMUNITY');
    }
    return comm;
  }
}

export const communityService = new CommunityService();
