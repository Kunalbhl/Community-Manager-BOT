import {
  CommunityChannelAccess,
  ChannelPurpose,
  DiscordCapabilityStatus,
} from '../../shared/types/models.js';
import { UserRole } from '../../shared/types/rbac.js';
import { channelAccessRepository } from '../repositories/index.js';
import { auditService } from './audit.service.js';
import { logger } from '../logging/logger.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors.js';

export interface AddChannelParams {
  communityId: string;
  channelId: string;
  channelNameSnapshot: string;
  purpose: ChannelPurpose;
  enabled?: boolean;
}

export class ChannelAccessService {
  /**
   * Retrieves all configured channels for a community.
   */
  async listChannels(communityId: string): Promise<CommunityChannelAccess[]> {
    return channelAccessRepository.listForTenant(communityId);
  }

  /**
   * Configures a new allowed channel for bot message processing.
   */
  async addChannel(
    params: AddChannelParams,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<CommunityChannelAccess> {
    if (!params.channelId || !params.channelId.trim()) {
      throw new BadRequestError('Authoritative Discord Channel ID is required');
    }
    if (!params.communityId) {
      throw new BadRequestError('Community ID is required');
    }

    const existing = await channelAccessRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: params.communityId },
        { field: 'channelId', operator: '==', value: params.channelId.trim() },
      ],
      limit: 1,
    });

    const now = new Date().toISOString();
    let record: CommunityChannelAccess;

    if (existing.length > 0) {
      record = await channelAccessRepository.update(existing[0].id, {
        channelNameSnapshot: params.channelNameSnapshot.trim() || existing[0].channelNameSnapshot,
        purpose: params.purpose,
        enabled: params.enabled !== undefined ? params.enabled : true,
        updatedAt: now,
      });
    } else {
      record = await channelAccessRepository.create({
        communityId: params.communityId,
        channelId: params.channelId.trim(),
        channelNameSnapshot: params.channelNameSnapshot.trim() || `channel-${params.channelId}`,
        purpose: params.purpose,
        enabled: params.enabled !== undefined ? params.enabled : true,
        createdAt: now,
        updatedAt: now,
      });
    }

    await auditService.record({
      communityId: params.communityId,
      actorUserId,
      actorRole,
      action: 'CHANNEL_ACCESS_CONFIGURED',
      targetType: 'community_channel_access',
      targetId: record.id,
      metadata: {
        channelId: record.channelId,
        channelNameSnapshot: record.channelNameSnapshot,
        purpose: record.purpose,
        enabled: record.enabled,
      },
      requestId,
    });

    logger.info(
      `[CHANNEL_ACCESS] Channel ${record.channelId} (${record.purpose}) configured for community ${params.communityId}`
    );

    return record;
  }

  /**
   * Removes or disables a channel from bot processing.
   */
  async removeChannel(
    communityId: string,
    channelId: string,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<void> {
    const existing = await channelAccessRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'channelId', operator: '==', value: channelId },
      ],
      limit: 1,
    });

    if (existing.length === 0) {
      throw new NotFoundError(`Channel ${channelId} not found in community channel configuration`);
    }

    await channelAccessRepository.delete(existing[0].id);

    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'CHANNEL_ACCESS_CONFIGURED',
      targetType: 'community_channel_access',
      targetId: existing[0].id,
      metadata: {
        channelId,
        action: 'REMOVED',
      },
      requestId,
    });
  }

  /**
   * Authoritative gate check: verifies whether the bot is authorized to process messages in this channel.
   * Prevents unauthorized reading of non-allowlisted channels.
   */
  async isChannelAllowedForProcessing(
    communityId: string,
    channelId: string
  ): Promise<{ allowed: boolean; purpose?: ChannelPurpose; reason?: string }> {
    const channels = await channelAccessRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'channelId', operator: '==', value: channelId },
      ],
      limit: 1,
    });

    if (channels.length === 0) {
      return {
        allowed: false,
        reason: 'Channel is not in community authorized allowlist',
      };
    }

    const config = channels[0];
    if (!config.enabled) {
      return {
        allowed: false,
        reason: 'Channel processing is disabled by community owner',
      };
    }

    return {
      allowed: true,
      purpose: config.purpose,
    };
  }

  /**
   * Safe message ingestion handler enforcing allowlist boundaries.
   */
  async processIncomingDiscordMessage(params: {
    communityId: string;
    channelId: string;
    authorDiscordId: string;
    content: string;
    messageId: string;
  }): Promise<{ status: DiscordCapabilityStatus; details: string }> {
    const check = await this.isChannelAllowedForProcessing(params.communityId, params.channelId);

    if (!check.allowed) {
      logger.warn(
        `[CHANNEL_SECURITY] Blocked unauthorized message processing attempt in channel ${params.channelId} (Community: ${params.communityId}). Reason: ${check.reason}`
      );
      return {
        status: 'PERMISSION_REQUIRED',
        details: check.reason || 'Channel not authorized for bot reading',
      };
    }

    logger.info(
      `[CHANNEL_PROCESSING] Processing authorized message ${params.messageId} in #${check.purpose} channel (${params.channelId})`
    );

    return {
      status: 'AVAILABLE',
      details: `Successfully processed in authorized ${check.purpose} channel`,
    };
  }
}

export const channelAccessService = new ChannelAccessService();
