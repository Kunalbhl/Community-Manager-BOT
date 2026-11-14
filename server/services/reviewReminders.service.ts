/**
 * Discord DM reminders for reviewers and interviews (free, no Google account needed).
 *
 *  - New application  -> DM every reviewer of that community right away.
 *  - Waiting > 24h    -> one daily summary DM per community listing applications still waiting.
 *  - Interviews       -> DM interviewer + applicant 60 and 10 minutes before the start.
 *
 * Every reminder is sent once (tracked on the record), respects each user's notification settings
 * (Recruitment -> Discord), and runs only on the active bot instance (started by leadership).
 */
import { logger } from '../logging/logger.js';
import { discordService } from '../integrations/discord/discord.service.js';
import {
  applicationsRepository,
  interviewsRepository,
  communityMemberAccessRepository,
  communitiesRepository,
} from '../repositories/index.js';
import { moderationSchedulerService } from './moderation.service.js';
import { NotificationPreferenceService } from './notificationPreference.service.js';

const REVIEWER_ROLES = new Set(['OWNER', 'CONTROLLER', 'RECRUITER', 'INTERVIEWER', 'PLATFORM_OWNER']);
const MAX_DMS_PER_EVENT = 15;
const DAY = 24 * 60 * 60 * 1000;

const dashboardUrl = () => `${(process.env.APP_URL || 'https://community-manager-bot-720940628402.asia-southeast1.run.app').replace(/\/$/, '')}/dashboard`;

async function wantsDiscord(discordUserId: string, communityId: string): Promise<boolean> {
  try {
    const prefs: any = await NotificationPreferenceService.getUserPreferences(`usr_${discordUserId}`, communityId);
    if (prefs?.discordDmEnabled === false) return false;
    const cat = prefs?.categories?.RECRUITMENT;
    if (cat && (cat.enabled === false || (Array.isArray(cat.channels) && !cat.channels.includes('DISCORD')))) return false;
  } catch {
    /* no preferences saved yet -> defaults (Discord on) */
  }
  return true;
}

async function reviewersOf(communityId: string): Promise<string[]> {
  const access = await communityMemberAccessRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] });
  const ids = new Set<string>();
  for (const a of access) if (REVIEWER_ROLES.has(String(a.role)) && a.discordUserId && /^\d{15,21}$/.test(a.discordUserId)) ids.add(a.discordUserId);
  const community: any = await communitiesRepository.getById(communityId).catch(() => null);
  const ownerDiscordId = String(community?.ownerDiscordUserId || community?.ownerUserId || '').replace(/^usr_/, '');
  if (/^\d{15,21}$/.test(ownerDiscordId)) ids.add(ownerDiscordId);
  return Array.from(ids).slice(0, MAX_DMS_PER_EVENT);
}

async function dm(discordUserId: string, text: string): Promise<boolean> {
  if (!discordService.isConnected()) return false;
  try {
    const r = await discordService.sendDM(discordUserId, text);
    return Boolean(r?.success);
  } catch (err: any) {
    logger.warn(`[Reminders] DM to ${discordUserId} failed: ${err?.message}`);
    return false;
  }
}

export const reviewReminders = {
  /** Called right after a new application is submitted. */
  async notifyNewApplication(params: { communityId: string; applicationId: string; applicantName: string }) {
    const reviewers = await reviewersOf(params.communityId);
    let sent = 0;
    for (const id of reviewers) {
      if (!(await wantsDiscord(id, params.communityId))) continue;
      if (await dm(id, `📥 **New application** from **${params.applicantName}** is waiting for review.\nReview it: ${dashboardUrl()}`)) sent++;
    }
    logger.info(`[Reminders] New application ${params.applicationId}: DM sent to ${sent} reviewer(s).`);
    return { sent };
  },

  /** Daily summary of applications that have been waiting more than a day. */
  async sendWaitingDigests() {
    const waiting = await applicationsRepository.list({ where: [{ field: 'status', operator: 'in', value: ['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED'] }] });
    const now = Date.now();
    const byCommunity = new Map<string, any[]>();
    for (const a of waiting as any[]) {
      const at = Date.parse(a.submittedAt || a.createdAt || '');
      if (!at || now - at < DAY) continue;
      if (!byCommunity.has(a.communityId)) byCommunity.set(a.communityId, []);
      byCommunity.get(a.communityId)!.push(a);
    }
    for (const [communityId, apps] of byCommunity) {
      const community: any = await communitiesRepository.getById(communityId).catch(() => null);
      if (!community) continue;
      const last = Date.parse(community.lastReviewDigestAt || '');
      if (last && now - last < DAY) continue;
      const names = apps.slice(0, 8).map((a) => `• ${a.applicantDisplayNameSnapshot || a.applicantUsername || 'Applicant'}`).join('\n');
      const more = apps.length > 8 ? `\n…and ${apps.length - 8} more` : '';
      let sent = 0;
      for (const id of await reviewersOf(communityId)) {
        if (!(await wantsDiscord(id, communityId))) continue;
        if (await dm(id, `⏰ **${apps.length} application(s) have been waiting more than a day** in ${community.name || 'your server'}:\n${names}${more}\nReview them: ${dashboardUrl()}`)) sent++;
      }
      await communitiesRepository.update(communityId, { lastReviewDigestAt: new Date().toISOString() } as any).catch(() => undefined);
      logger.info(`[Reminders] Waiting digest for ${communityId}: ${apps.length} app(s), ${sent} DM(s).`);
    }
  },

  /** DM interviewer and applicant 60 and 10 minutes before each scheduled interview. */
  async sendInterviewReminders() {
    const now = Date.now();
    const upcoming = await interviewsRepository.list({ where: [{ field: 'status', operator: '==', value: 'SCHEDULED' }] });
    for (const iv of upcoming as any[]) {
      const start = Date.parse(iv.scheduledAt || '');
      if (!start || start < now) continue;
      const minutesLeft = (start - now) / 60000;
      const due = minutesLeft <= 10 ? '10' : minutesLeft <= 60 ? '60' : null;
      if (!due) continue;
      const flag = `reminder${due}SentAt`;
      if (iv[flag]) continue;
      // Mark first so a crash/restart can never send the same reminder twice.
      await interviewsRepository.update(iv.id, { [flag]: new Date().toISOString() } as any);
      const when = `<t:${Math.floor(start / 1000)}:t> (<t:${Math.floor(start / 1000)}:R>)`;
      const interviewer = String(iv.interviewerDiscordUserId || iv.interviewerUserId || '').replace(/^usr_/, '');
      const applicant = String(iv.applicantDiscordUserId || iv.applicantDiscordId || '').replace(/^usr_/, '');
      if (/^\d{15,21}$/.test(interviewer) && (await wantsDiscord(interviewer, iv.communityId))) {
        await dm(interviewer, `🎙️ **Interview reminder:** you are interviewing **${iv.applicantUsername || 'an applicant'}** at ${when}.`);
      }
      if (/^\d{15,21}$/.test(applicant)) {
        await dm(applicant, `🎙️ **Interview reminder:** your interview starts at ${when}. Good luck!`);
      }
    }
  },
};

let timer: NodeJS.Timeout | null = null;
let ticks = 0;

/** Started only on the active bot (see server/runtime/leadership). */
export function startReminderScheduler() {
  if (timer) return;
  timer = setInterval(async () => {
    ticks++;
    try {
      await reviewReminders.sendInterviewReminders();
      if (ticks % 30 === 1) await reviewReminders.sendWaitingDigests(); // every ~30 min check, sends at most once a day
      if (ticks % 10 === 1) await moderationSchedulerService.processScheduledPass(); // expire warnings, blacklists, restrictions
      const { reviewRooms } = await import('./toolkit/reviewRooms.service.js');
      await reviewRooms.housekeeping(); // empty voice rooms + expired review rooms
      if (ticks % 30 === 2) { const { secureGate } = await import('./recruitment/secureGate.service.js'); await secureGate.recheckAll().catch(() => undefined); }
      const { giveaways, birthdays } = await import('./features/community.service.js');
      await giveaways.tick(); // end giveaways whose time is up
      await import('./eventExtras.service.js').then(({ eventExtras }) => eventExtras.tick()).catch(() => undefined);
      await import('./features/serverStats.service.js').then(({ serverStats }) => serverStats.tick()).catch(() => undefined);
      {
        // Voice XP: one pass per minute.
        const { discordService } = await import('../integrations/discord/discord.service.js');
        const { communityForGuild } = await import('./toolkit/toolkitConfig.js');
        const { levels } = await import('./features/levels.service.js');
        for (const g of Array.from(((discordService.client as any)?.guilds?.cache?.values?.() || []) as any[])) {
          await levels.voiceTick(await communityForGuild(g.id), g).catch(() => undefined);
        }
      }
      if (ticks % 15 === 3) {
        // Invite rewards: "stayed N days", top recruiter of the period, and temporary roles that ended.
        const { discordService } = await import('../integrations/discord/discord.service.js');
        const { communityForGuild } = await import('./toolkit/toolkitConfig.js');
        const { inviteRewards } = await import('./rewards/inviteRewards.service.js');
        await inviteRewards.expireRoles().catch(() => undefined);
        if (ticks % 360 === 3) await import('./recruitment/webApply.service.js').then(({ webApply }) => webApply.purge()).catch(() => undefined);
        for (const gid of Array.from((discordService.client as any)?.guilds?.cache?.keys?.() || []) as string[]) {
          await inviteRewards.evaluate(await communityForGuild(gid)).catch(() => undefined);
        }
      }
      if (ticks % 5 === 1) {
        const { discordService } = await import('../integrations/discord/discord.service.js');
        const { communityForGuild } = await import('./toolkit/toolkitConfig.js');
        for (const gid of Array.from((discordService.client as any)?.guilds?.cache?.keys?.() || []) as string[]) {
          await birthdays.tick(await communityForGuild(gid)).catch(() => undefined);
        }
      }
    } catch (err: any) {
      logger.warn(`[Reminders] Scheduler pass failed: ${err?.message}`);
    }
  }, 60_000);
  logger.info('[Reminders] Discord reminder scheduler started.');
}

export function stopReminderScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
