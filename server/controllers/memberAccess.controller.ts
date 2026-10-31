import { Request, Response, NextFunction } from 'express';
import {
  communitiesRepository,
  communityMemberAccessRepository,
  auditLogsRepository,
  rolesRepository,
  channelAccessRepository,
} from '../repositories/index.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { UserRole, Permission } from '../../shared/types/rbac.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { discordResourceService } from '../services/discordResource.service.js';

/**
 * Lists all manual community member access mappings for a community.
 */
export async function getCommunityMemberAccessList(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = req.params.id;
    const allAccess = await communityMemberAccessRepository.list();
    const communityAccess = allAccess.filter((acc) => acc.communityId === communityId);

    res.json({
      success: true,
      data: communityAccess,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Creates or updates a manual permission mapping override for a user.
 */
export async function createOrUpdateCommunityMemberAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = req.params.id;
    const { discordUserId, role, permissions, source } = req.body;

    if (!discordUserId || !role) {
      throw new BadRequestError('discordUserId and role are required parameters');
    }

    const validRoles: UserRole[] = ['OWNER', 'CONTROLLER', 'INTERVIEWER', 'RECRUITER', 'MEMBER', 'APPLICANT'];
    if (!validRoles.includes(role)) {
      throw new BadRequestError(`Invalid role specified. Must be one of: ${validRoles.join(', ')}`);
    }

    const accessId = `${communityId}_${discordUserId}`;
    let existing = await communityMemberAccessRepository.getById(accessId);

    const documentData = {
      id: accessId,
      communityId,
      discordUserId,
      role,
      permissions: permissions || undefined,
      source: source || 'MANUAL_ASSIGNMENT',
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      existing = await communityMemberAccessRepository.update(accessId, documentData);
    } else {
      existing = await communityMemberAccessRepository.create(documentData);
    }

    // Audit log
    await auditLogsRepository.create({
      id: `audit_perm_${Date.now()}`,
      communityId,
      actorUserId: req.user?.userId || 'system',
      actorRole: req.user?.role || 'OWNER',
      action: 'USER_ROLE_CHANGED',
      targetType: 'user_permissions',
      targetId: discordUserId,
      metadata: { targetUserId: discordUserId, assignedRole: role, updatedPermissions: permissions },
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      data: existing,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Revokes a user's manual community role override.
 */
export async function deleteCommunityMemberAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = req.params.id;
    const { discordUserId } = req.params;

    const accessId = `${communityId}_${discordUserId}`;
    const existing = await communityMemberAccessRepository.getById(accessId);
    if (!existing) {
      throw new NotFoundError(`No custom access profile found for user ${discordUserId}`);
    }

    await communityMemberAccessRepository.delete(accessId);

    // Audit log
    await auditLogsRepository.create({
      id: `audit_perm_del_${Date.now()}`,
      communityId,
      actorUserId: req.user?.userId || 'system',
      actorRole: req.user?.role || 'OWNER',
      action: 'USER_ROLE_CHANGED',
      targetType: 'user_permissions',
      targetId: discordUserId,
      metadata: { targetUserId: discordUserId, action: 'REVOKED_CUSTOM_ACCESS' },
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: `Successfully revoked custom community access override for ${discordUserId}`,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Returns Discord guild roles for configure mapping from real guild or stored roles.
 */
export async function getCommunityDiscordRoles(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = req.params.id;
    let roles: Array<{ id: string; name: string; color?: string; position?: number }> = [];

    // 1. Try to fetch live roles from real Discord bot gateway if connected
    if (communityId) {
      const community = await communitiesRepository.getById(communityId);
      const guildId = community?.guildId || community?.discordGuildId;
      if (guildId) {
        const rolesRes = await discordResourceService.getRoles(guildId, { includeEveryone: false });
        if (rolesRes.success && rolesRes.items.length > 0) {
          roles = rolesRes.items.map((r) => ({
            id: r.id,
            name: r.name,
            color: r.color || r.hexColor,
            position: r.position,
          }));
        }
      }
    }

    // 2. If live Discord roles not currently reachable, check database roles repository
    if (roles.length === 0 && communityId) {
      const storedRoles = await rolesRepository.list({
        where: [{ field: 'communityId', operator: '==', value: communityId }],
      });
      if (storedRoles.length > 0) {
        roles = storedRoles.map((r: any) => ({
          id: r.discordRoleId || r.id,
          name: r.name,
          color: r.color,
          position: r.position,
        }));
      }
    }

    res.json({
      success: true,
      data: roles,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Configures Discord role mappings for a community.
 */
export async function updateCommunityRoleMappings(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = req.params.id;
    const { mappings } = req.body;

    if (!Array.isArray(mappings)) {
      throw new BadRequestError('mappings parameter must be an array of role mappings');
    }

    const community = await communitiesRepository.getById(communityId);
    if (!community) {
      throw new NotFoundError(`Community ${communityId} not found`);
    }

    const updated = await communitiesRepository.update(communityId, {
      ...community,
      discordRoleMappings: mappings,
      updatedAt: new Date().toISOString(),
    } as any);

    // Audit log
    await auditLogsRepository.create({
      id: `audit_mappings_${Date.now()}`,
      communityId,
      actorUserId: req.user?.userId || 'system',
      actorRole: req.user?.role || 'OWNER',
      action: 'COMMUNITY_SETTINGS_CHANGED',
      targetType: 'discord_role_mappings',
      targetId: communityId,
      metadata: { mappings },
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      data: updated,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Returns Discord guild channels for selecting target channels in settings, automation, records, etc.
 * Fetches real channels from Discord bot gateway if connected, or database stored channels, or fallback templates.
 */
export async function getCommunityDiscordChannels(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = req.params.id;
    let channels: Array<{ id: string; name: string; type?: string }> = [];

    // 1. Try to fetch live channels from real Discord bot gateway if connected
    if (communityId) {
      const community = await communitiesRepository.getById(communityId);
      const guildId = community?.guildId || community?.discordGuildId;
      if (guildId) {
        const channelsRes = await discordResourceService.getChannels(guildId);
        if (channelsRes.success && channelsRes.items.length > 0) {
          channels = channelsRes.items.map((c) => ({
            id: c.id,
            name: c.name.startsWith('#') ? c.name : `#${c.name}`,
            type: c.type === 'GUILD_ANNOUNCEMENT' ? 'ANNOUNCEMENT' : 'TEXT',
          }));
        }
      }
    }

    // 2. If live Discord channels not reachable, check database channel access repository
    if (channels.length === 0 && communityId) {
      const storedChannels = await channelAccessRepository.listForTenant(communityId);
      if (storedChannels.length > 0) {
        channels = storedChannels.map((c: any) => ({
          id: c.channelId || c.id,
          name: c.channelNameSnapshot?.startsWith('#') ? c.channelNameSnapshot : `#${c.channelNameSnapshot || 'channel'}`,
          type: 'TEXT',
        }));
      }
    }

    res.json({
      success: true,
      data: channels,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}
