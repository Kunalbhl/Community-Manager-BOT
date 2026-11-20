/**
 * Goodbyes: when a member leaves, optionally post a short note in a channel and send them a
 * private message, the mirror of the welcome. Both are off until an admin turns them on.
 * Bots, and people a moderator kicked or banned, never get a goodbye.
 */
import { AuditLogEvent } from 'discord.js';
import { logger } from '../logging/logger.js';
import { welcomeOnboardingService } from './welcomeOnboarding.service.js';

export const DEFAULT_LEAVE_MESSAGE = '👋 {{memberName}} has left {{communityName}}. We wish them well!';
export const DEFAULT_LEAVE_DM = 'Hi {{memberName}}, we are sorry to see you leave {{communityName}}. 💙\n\nThank you for being part of the community. You are always welcome back, and your feedback helps us improve.';

/** True when a moderator kicked or banned this person just now (so no friendly goodbye). */
export async function removedByStaff(guild: any, userId: string): Promise<boolean> {
  try { if (await guild.bans.fetch(userId).catch(() => null)) return true; } catch { /* unknown */ }
  try {
    await new Promise((r) => setTimeout(r, 1500)); // the audit log entry lands a moment after the event
    for (const type of [AuditLogEvent.MemberKick, AuditLogEvent.MemberBanAdd]) {
      const logs = await guild.fetchAuditLogs({ type, limit: 5 }).catch(() => null);
      if (logs?.entries?.some((e: any) => e.target?.id === userId && Date.now() - e.createdTimestamp < 20_000)) return true;
    }
  } catch { /* no audit-log access: treat as a normal leave */ }
  return false;
}

export const leaveMessages = {
  async onMemberLeft(communityId: string, member: any) {
    if (member.user?.bot) return;
    const cfg: any = await welcomeOnboardingService.getWelcomeConfig(communityId);
    if (!cfg.enableLeaveMessage && !cfg.enableLeaveDm) return;
    const guild = member.guild;
    if (await removedByStaff(guild, member.id)) return;

    const vars = {
      memberName: `**${member.displayName || member.user?.username || 'A member'}**`,
      communityName: guild.name,
      memberCount: guild.memberCount,
    };

    if (cfg.enableLeaveMessage) {
      const channelId = cfg.leaveChannelId || cfg.welcomeChannelId;
      const channel: any = channelId ? guild.channels.cache.get(channelId) : null;
      if (channel?.send) {
        const text = welcomeOnboardingService.resolveTemplate(cfg.leaveMessage || DEFAULT_LEAVE_MESSAGE, vars);
        await channel.send({ content: text, allowedMentions: { parse: [] } })
          .catch((e: any) => logger.warn(`[Leave] could not post in #${channel.name}: ${e?.message}`));
      } else {
        logger.warn(`[Leave] ${guild.name}: goodbye message is on but no usable channel is set`);
      }
    }

    if (cfg.enableLeaveDm) {
      const text = welcomeOnboardingService.resolveTemplate(cfg.leaveDm || DEFAULT_LEAVE_DM, vars);
      // Discord often refuses DMs once the person no longer shares a server with the bot: best effort.
      await member.user?.send({ content: text }).catch((e: any) => logger.info(`[Leave] DM to ${member.id} not delivered: ${e?.code || e?.message}`));
    }
  },
};
