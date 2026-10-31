import { Request, Response, NextFunction } from 'express';
import { discordMembersRepository, communityMemberAccessRepository } from '../repositories/index.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { logger } from '../logging/logger.js';

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = req.user?.communityId || (req.query.communityId as string);
    if (!communityId) {
      return res.status(400).json({ success: false, code: 'MISSING_COMMUNITY', message: 'communityId is required', requestId: req.id });
    }

    const members = await discordMembersRepository.listForTenant(communityId, {
      orderBy: 'joinedAt',
      orderDirection: 'desc',
      limit: typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 100,
      offset: typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : 0,
    });

    const accessRecords = await communityMemberAccessRepository.list({
      where: [{ field: 'communityId', operator: '==', value: communityId }],
    });
    const accessMap = new Map(accessRecords.map((a) => [a.discordUserId, a]));

    const data = members.map((m) => {
      const access = accessMap.get(m.discordUserId);
      return {
        id: m.discordUserId,
        communityId: m.communityId,
        discordUserId: m.discordUserId,
        username: m.usernameSnapshot,
        displayName: m.displayNameSnapshot,
        avatarUrl: m.avatarSnapshot,
        role: access?.role || 'MEMBER',
        permissions: access?.permissions || [],
        discordRoleIds: m.discordRoleIds,
        joinedAt: m.joinedAt,
        syncedAt: m.syncedAt,
        membershipStatus: m.membershipStatus,
        syncState: m.syncState,
      };
    });

    res.json({ success: true, data, total: data.length, requestId: req.id });
  } catch (err) {
    next(err);
  }
}

export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const communityId = req.user?.communityId || (req.query.communityId as string);
    if (!communityId) {
      return res.status(400).json({ success: false, code: 'MISSING_COMMUNITY', message: 'communityId is required', requestId: req.id });
    }

    const memberId = `${communityId}_${id}`;
    const member = await discordMembersRepository.getById(memberId);
    if (!member) {
      return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', message: `User ${id} not found in community`, requestId: req.id });
    }

    const accessRecord = await communityMemberAccessRepository.getById(`${communityId}_${id}`);

    // Enrich with live Discord presence if bot is connected
    let discordPresence: any = null;
    if (discordService.isConnected() && member.discordGuildId) {
      try {
        const client = (discordService as any).client;
        const guild = client?.guilds?.cache?.get(member.discordGuildId);
        if (guild) {
          const guildMember = await guild.members.fetch(id).catch(() => null);
          if (guildMember) {
            discordPresence = {
              nickname: guildMember.nickname,
              premiumSince: guildMember.premiumSince,
              communicationDisabledUntil: guildMember.communicationDisabledUntil,
              liveRoleIds: [...guildMember.roles.cache.keys()],
            };
          }
        }
      } catch (err) {
        logger.warn(`[UsersController] Could not fetch live Discord presence for ${id}: ${(err as Error).message}`);
      }
    }

    res.json({
      success: true,
      data: {
        id: member.discordUserId,
        communityId: member.communityId,
        discordUserId: member.discordUserId,
        username: member.usernameSnapshot,
        displayName: member.displayNameSnapshot,
        avatarUrl: member.avatarSnapshot,
        role: accessRecord?.role || 'MEMBER',
        permissions: accessRecord?.permissions || [],
        discordRoleIds: member.discordRoleIds,
        joinedAt: member.joinedAt,
        syncedAt: member.syncedAt,
        membershipStatus: member.membershipStatus,
        syncState: member.syncState,
        livePresence: discordPresence,
      },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateUserRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const communityId = req.user?.communityId || (req.body.communityId as string);

    if (!communityId) {
      return res.status(400).json({ success: false, code: 'MISSING_COMMUNITY', message: 'communityId is required', requestId: req.id });
    }
    if (!role) {
      return res.status(400).json({ success: false, code: 'MISSING_ROLE', message: 'role is required', requestId: req.id });
    }

    const accessId = `${communityId}_${id}`;
    const now = new Date().toISOString();
    const existing = await communityMemberAccessRepository.getById(accessId);

    if (existing) {
      await communityMemberAccessRepository.update(accessId, { role, updatedAt: now });
    } else {
      await communityMemberAccessRepository.create({
        id: accessId,
        communityId,
        discordUserId: id,
        role,
        permissions: [],
        source: 'MANUAL_ASSIGNMENT',
        createdAt: now,
        updatedAt: now,
      });
    }

    res.json({
      success: true,
      message: `User ${id} role updated to ${role}.`,
      data: { id, communityId, role },
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}
