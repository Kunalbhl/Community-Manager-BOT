import { NotificationRecipientType } from '../../shared/types/notifications.js';
import { UserRole } from '../../shared/types/rbac.js';
import {
  platformUsersRepository,
  workspaceMembersRepository,
  communitiesRepository,
  rolesRepository,
} from '../repositories/index.js';
import { logger } from '../logging/logger.js';

export interface ResolvedRecipient {
  userId: string;
  role?: UserRole;
  discordId?: string;
  communityId?: string;
}

export class NotificationAudienceService {
  private static MAX_FANOUT_RECIPIENTS = 50;

  /**
   * Resolves explicit user IDs and authoritative role metadata for a given target audience.
   */
  static async resolveAudience(params: {
    communityId?: string;
    recipientType?: NotificationRecipientType | string;
    recipientUserId?: string;
    recipientRole?: UserRole;
    candidates?: Array<{ userId: string; role?: UserRole; discordId?: string; communityId?: string }>;
  }): Promise<ResolvedRecipient[]> {
    const { communityId, recipientType = 'USER', recipientUserId, recipientRole, candidates } = params;

    // Direct candidate list capping
    if (candidates && Array.isArray(candidates)) {
      return candidates.slice(0, this.MAX_FANOUT_RECIPIENTS).map(c => ({
        userId: c.userId,
        role: c.role || 'MEMBER',
        discordId: c.discordId,
        communityId: c.communityId || communityId,
      }));
    }

    // 1. Direct explicit user
    if (recipientType === 'USER' && recipientUserId) {
      // Look up user's discordId or role if available
      let discordId: string | undefined;
      let role: UserRole | undefined = recipientRole;

      try {
        const userDoc = await platformUsersRepository.getById(recipientUserId);
        if (userDoc) {
          discordId = userDoc.discordId;
          if (!role) role = userDoc.globalRole;
        }
      } catch {
        // Fallback safely
      }

      return [{
        userId: recipientUserId,
        role: role || 'MEMBER',
        discordId,
        communityId,
      }];
    }

    // 2. Platform owner notification
    if (recipientType === 'PLATFORM_OWNER') {
      try {
        const allUsers = await platformUsersRepository.list();
        const platformOwners = allUsers.filter(
          u => u.globalRole === 'PLATFORM_OWNER' && u.status !== 'SUSPENDED' && u.status !== 'BANNED'
        );

        if (platformOwners.length > 0) {
          return platformOwners.map(po => ({
            userId: po.id,
            role: 'PLATFORM_OWNER' as UserRole,
            discordId: po.discordId,
          }));
        }
      } catch {
        // Fallback to default
      }

      return [{
        userId: 'usr_platform_owner_t88',
        role: 'PLATFORM_OWNER' as UserRole,
      }];
    }

    // 3. Role-based resolution within a community
    if (recipientType === 'ROLE' && communityId && recipientRole) {
      try {
        const allUsers = await platformUsersRepository.list();
        const matching = allUsers
          .filter(u => {
            if (u.status === 'SUSPENDED' || u.status === 'BANNED') return false;
            // Check community affiliation
            if (u.communitiesUsed && !u.communitiesUsed.includes(communityId)) return false;
            // Check matching role or owner
            return u.globalRole === recipientRole || u.globalRole === 'OWNER';
          })
          .slice(0, this.MAX_FANOUT_RECIPIENTS);

        if (matching.length > 0) {
          return matching.map(m => ({
            userId: m.id,
            role: m.globalRole,
            discordId: m.discordId,
            communityId,
          }));
        }

        // If no users in platformUsersRepository, fallback to community owner
        const community = await communitiesRepository.getById(communityId);
        if (community && (community as any).ownerId) {
          return [{
            userId: (community as any).ownerId,
            role: 'OWNER' as UserRole,
            communityId,
          }];
        }
      } catch (err: any) {
        logger.warn(`[NotificationAudience] Failed to resolve role ${recipientRole} in ${communityId}: ${err.message}`);
      }

      // Default single tenant recipient
      return [{
        userId: `usr_owner_${communityId}`,
        role: recipientRole,
        communityId,
      }];
    }

    // 4. Community-wide fanout (bounded)
    if (recipientType === 'COMMUNITY' && communityId) {
      try {
        const allUsers = await platformUsersRepository.list();
        const communityUsers = allUsers
          .filter(u => {
            if (u.status === 'SUSPENDED' || u.status === 'BANNED') return false;
            return u.communitiesUsed && u.communitiesUsed.includes(communityId);
          })
          .slice(0, this.MAX_FANOUT_RECIPIENTS);

        if (communityUsers.length > 0) {
          return communityUsers.map(u => ({
            userId: u.id,
            role: u.globalRole,
            discordId: u.discordId,
            communityId,
          }));
        }
      } catch {
        // Fallback
      }

      return [{
        userId: `usr_owner_${communityId}`,
        role: 'OWNER' as UserRole,
        communityId,
      }];
    }

    return [];
  }
}
