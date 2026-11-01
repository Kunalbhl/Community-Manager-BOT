/**
 * SocialCord Notifier add-on.
 *
 * SocialCord is a separate bot with its own code, database and dashboard. Community Manager only:
 *   - remembers whether the add-on is switched on for a community,
 *   - checks whether the SocialCord bot is already in the server,
 *   - hands people the invite link and the SocialCord dashboard link.
 */
import { Request, Response, NextFunction } from 'express';
import { communitiesRepository } from '../repositories/index.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { auditService } from '../services/audit.service.js';
import { logger } from '../logging/logger.js';

export const SOCIALCORD_APP_ID = process.env.SOCIALCORD_APP_ID || '1563337103541010453';
export const SOCIALCORD_DASHBOARD_URL = (process.env.SOCIALCORD_DASHBOARD_URL || 'https://socialcord-notifier-517676359142.us-east1.run.app').replace(/\/$/, '');
const SOCIALCORD_PERMISSIONS = '277025770560';

function inviteUrl(guildId?: string) {
  let url = `https://discord.com/oauth2/authorize?client_id=${SOCIALCORD_APP_ID}&permissions=${SOCIALCORD_PERMISSIONS}&scope=${encodeURIComponent('bot applications.commands')}`;
  if (guildId) url += `&guild_id=${guildId}&disable_guild_select=true`;
  return url;
}

async function isSocialCordInGuild(guildId?: string): Promise<boolean | null> {
  if (!guildId || !discordService.isConnected()) return null; // unknown
  try {
    const guild: any = discordService.getGuild(guildId);
    if (!guild) return null;
    const member = await guild.members.fetch(SOCIALCORD_APP_ID).catch(() => null);
    return Boolean(member);
  } catch (err: any) {
    logger.warn(`[SocialCord] Presence check failed for guild ${guildId}: ${err?.message}`);
    return null;
  }
}

async function load(communityId: string) {
  const community: any = await communitiesRepository.getById(communityId);
  if (!community) {
    const e: any = new Error('Community not found');
    e.status = 404;
    throw e;
  }
  return community;
}

function view(community: any, botInstalled: boolean | null) {
  const guildId = community.guildId || community.discordGuildId;
  return {
    enabled: Boolean(community.socialcordEnabled),
    botInstalled,
    inviteUrl: inviteUrl(guildId),
    dashboardUrl: SOCIALCORD_DASHBOARD_URL,
    enabledAt: community.socialcordEnabledAt || null,
  };
}

export async function getSocialCordStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const community = await load(req.params.communityId);
    const installed = await isSocialCordInGuild(community.guildId || community.discordGuildId);
    res.json({ success: true, data: view(community, installed) });
  } catch (err: any) {
    if (err?.status === 404) return res.status(404).json({ success: false, code: 'COMMUNITY_NOT_FOUND', message: err.message });
    next(err);
  }
}

export async function setSocialCordEnabled(req: Request, res: Response, next: NextFunction) {
  try {
    const enabled = Boolean(req.body?.enabled);
    const community = await load(req.params.communityId);
    const now = new Date().toISOString();
    const updated = await communitiesRepository.update(community.id, {
      socialcordEnabled: enabled,
      socialcordEnabledAt: enabled ? now : null,
      updatedAt: now,
    } as any);
    await auditService.record({
      communityId: community.id,
      guildId: community.guildId,
      actorUserId: req.user?.userId || 'unknown',
      actorRole: req.user?.role,
      action: enabled ? 'SOCIALCORD_ENABLED' : 'SOCIALCORD_DISABLED',
      targetType: 'integration',
      targetId: 'socialcord',
      metadata: {},
    } as any).catch(() => undefined);
    const installed = await isSocialCordInGuild(community.guildId || community.discordGuildId);
    res.json({ success: true, data: view(updated, installed) });
  } catch (err: any) {
    if (err?.status === 404) return res.status(404).json({ success: false, code: 'COMMUNITY_NOT_FOUND', message: err.message });
    next(err);
  }
}
