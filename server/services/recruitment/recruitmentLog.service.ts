/**
 * Recruitment log channel + recruiter notifications.
 * Every application, screening result, decision and recruiter credit is posted in the owner's
 * chosen channel, and the recruiter whose code was used gets a DM.
 */
import { discordService } from '../../integrations/discord/discord.service.js';
import { getToolkit, guildFor, isSnowflake } from '../toolkit/toolkitConfig.js';

export const recruitmentLog = {
  async post(communityId: string, text: string, alertOwner = false) {
    const cfg = (await getToolkit(communityId)).recruitment;
    const guild = await guildFor(communityId);
    if (!guild) return;
    const ch: any = cfg.logChannelId ? guild.channels.cache.get(cfg.logChannelId) : null;
    if (ch) await ch.send({ content: text.slice(0, 1900), allowedMentions: { parse: [] } }).catch(() => undefined);
    if (alertOwner && guild.ownerId) await discordService.sendDM(guild.ownerId, `[${guild.name}] ${text}`.slice(0, 1900)).catch(() => undefined);
  },

  async recruiter(communityId: string, app: any, event: 'APPLIED' | 'APPROVED' | 'REJECTED') {
    const cfg = (await getToolkit(communityId)).recruitment;
    const rid = String(app?.recruiterDiscordUserId || '').replace(/^usr_/, '');
    if (!cfg.notifyRecruiter || !isSnowflake(rid) || !app.recruiterCodeUsed) return;
    const guild = await guildFor(communityId);
    const name = app.applicantDisplayNameSnapshot || app.applicantUsername || 'Someone';
    const text = event === 'APPLIED'
      ? `📨 **${name}** applied to **${guild?.name || 'the server'}** with your recruiter code **${app.recruiterCodeUsed}**. You will hear when it is decided.`
      : event === 'APPROVED'
        ? `🎉 **${name}**, whom you referred with code **${app.recruiterCodeUsed}**, was **approved** in **${guild?.name || 'the server'}**. This counts toward your recruiter benefits.`
        : `ℹ️ **${name}**, whom you referred with code **${app.recruiterCodeUsed}**, was not approved this time in **${guild?.name || 'the server'}**.`;
    await discordService.sendDM(rid, text).catch(() => undefined);
  },
};
