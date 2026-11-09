import {
  announcementsRepository,
  campaignsRepository,
  remindersRepository,
  pollsRepository,
  messageTemplatesRepository,
  communitiesRepository,
  discordMembersRepository,
  auditLogsRepository,
  discordDeliveriesRepository,
} from '../repositories/index.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { EntitlementService } from './entitlement.service.js';
import { auditService } from './audit.service.js';
import { logger } from '../logging/logger.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { Announcement, Campaign, Reminder, Poll, MessageTemplate } from '../../shared/types/models.js';
import { idempotencyService } from './idempotency.service.js';
import { failedOperationService } from './failedOperation.service.js';
import { observabilityService } from './observability/observability.service.js';

// Centralised rate limit helper
export class EngagementRateLimiter {
  private static queue: (() => Promise<any>)[] = [];
  private static processing = false;

  static async enqueue<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const res = await task();
          resolve(res);
        } catch (err) {
          reject(err);
        }
      });
      this.process();
    });
  }

  private static async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    while (this.queue.length > 0) {
      const nextTask = this.queue.shift();
      if (nextTask) {
        try {
          await nextTask();
        } catch (err) {
          logger.error('[RateLimiter] Error executing queued delivery task:', undefined, err as any);
        }
        // Introduce small 200ms spacing to respect Discord limits & avoid tight loop
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    this.processing = false;
  }
}

/**
 * 9. AUDIENCE ENGINE - EngagementAudienceService
 */
export class EngagementAudienceService {
  /**
   * Resolves actual Discord recipient members with strict tenant scope
   */
  static async resolveAudience(communityId: string, targetType: string, options?: any): Promise<string[]> {
    // Force communityId tenant scoping
    const members = await discordMembersRepository.listForTenant(communityId);
    if (!members || members.length === 0) {
      return [];
    }

    let filtered = members;
    if (targetType === 'ROLE' && options?.roleId) {
      filtered = members.filter(m => m.discordRoleIds && m.discordRoleIds.includes(options.roleId));
    } else if (targetType === 'RECRUITMENT_SEGMENT') {
      // Filter based on existing attributes if present
      filtered = members.filter(m => m.discordRoleIds && m.discordRoleIds.includes('RECRUITER'));
    } else if (targetType === 'CUSTOM_MEMBER_SET' && Array.isArray(options?.memberIds)) {
      filtered = members.filter(m => options.memberIds.includes(m.discordUserId || m.id));
    }

    const recipientIds = filtered.map(m => m.discordUserId || m.id).filter(Boolean);
    return recipientIds;
  }
}

/**
 * 7. TEMPLATE ENGINE - EngagementTemplateService
 */
export class EngagementTemplateService {
  static validateTemplateVariables(content: string, allowedVariables: string[]): void {
    const matches = content.match(/\{\{([^}]+)\}\}/g);
    if (matches) {
      for (const match of matches) {
        const variableName = match.replace(/\{\{|\}\}/g, '').trim();
        if (!allowedVariables.includes(variableName)) {
          throw new BadRequestError(`Invalid template variable: {{${variableName}}}`);
        }
      }
    }
    // Prevent common dangerous template injection sequences
    if (content.includes('<script') || content.includes('javascript:')) {
      throw new BadRequestError('Unsafe script or injection detected in template body.');
    }
  }

  static renderTemplate(content: string, variables: Record<string, string>): string {
    let rendered = content;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      rendered = rendered.replace(regex, value);
    }
    return rendered;
  }
}

/**
 * 3. DELIVERY ENGINE - EngagementDeliveryService
 */
export class EngagementDeliveryService {
  /**
   * Authoritative message delivery pipeline implementing full validation & safety checks.
   */
  static async deliverMessage(params: {
    communityId: string;
    actorUserId: string;
    actorRole: any;
    targetChannelId?: string;
    targetUserId?: string;
    content: string;
    featureKey: string;
    allowMassMentions?: boolean;
    idempotencyKey?: string;
    correlationId?: string;
    metadata?: Record<string, any>;
  }): Promise<{ status: string; messageId?: string; failureReason?: string }> {
    const {
      communityId,
      actorUserId,
      actorRole,
      targetChannelId,
      targetUserId,
      content,
      featureKey,
      allowMassMentions = false,
      idempotencyKey,
      correlationId = `del_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      metadata = {},
    } = params;

    const nowIso = new Date().toISOString();

    // 0. Idempotency Check
    if (idempotencyKey) {
      const lock = await idempotencyService.acquire(idempotencyKey, `DELIVERY_${featureKey}`, communityId);
      if (lock.status === 'CACHED' && lock.response) {
        logger.info(`[DeliveryEngine] Returning cached delivery result for idempotencyKey: ${idempotencyKey}`);
        return lock.response;
      }
      if (lock.status === 'LOCKED') {
        return { status: 'FAILED', failureReason: 'CONCURRENT_DELIVERY_IN_PROGRESS' };
      }
    }

    // Record initial delivery record
    try {
      await discordDeliveriesRepository.upsert({
        id: correlationId,
        communityId,
        actorUserId,
        targetChannelId,
        targetUserId,
        featureKey,
        status: 'REQUESTED',
        attemptCount: 1,
        requestedAt: nowIso,
        updatedAt: nowIso,
      });
    } catch (e) {
      // Non-blocking
    }

    try {
      // 1. Resolve community
      const community = await communitiesRepository.getById(communityId);
      if (!community) {
        const failureReason = 'COMMUNITY_NOT_FOUND';
        await this.recordFailureState(correlationId, communityId, featureKey, failureReason, idempotencyKey);
        return { status: 'FAILED', failureReason };
      }

      // 2. Check feature entitlement
      const hasEntitlement = await EntitlementService.hasFeature(communityId, featureKey);
      if (!hasEntitlement) {
        const failureReason = 'ENTITLEMENT_LIMIT_REACHED';
        await this.recordFailureState(correlationId, communityId, featureKey, failureReason, idempotencyKey);
        return { status: 'FAILED', failureReason };
      }

      // 3. Mentions Safety Check
      if (content.includes('@everyone') || content.includes('@here')) {
        if (!allowMassMentions) {
          const failureReason = 'MENTION_NOT_ALLOWED';
          await this.recordFailureState(correlationId, communityId, featureKey, failureReason, idempotencyKey);
          return { status: 'PERMISSION_REQUIRED', failureReason };
        }
      }

      // 4. Check Discord Bot connection
      if (!discordService.isConnected()) {
        const failureReason = 'BOT_NOT_CONNECTED';
        await this.recordFailureState(correlationId, communityId, featureKey, failureReason, idempotencyKey);
        return { status: 'BOT_NOT_CONNECTED', failureReason };
      }

      // 5. Rate limited queued execution
      const result = await EngagementRateLimiter.enqueue(async () => {
        if (targetChannelId) {
          try {
            return await discordService.sendChannelMessage(targetChannelId, content);
          } catch (err: any) {
            return { success: false, failureReason: 'CHANNEL_NOT_FOUND', messageId: '' };
          }
        } else if (targetUserId) {
          return await discordService.sendDM(targetUserId, content);
        }
        return { success: false, failureReason: 'INVALID_DELIVERY_TARGET', messageId: '' };
      });

      if (!result.success) {
        const mappedStatus = result.failureReason?.includes('permission') || result.failureReason?.includes('50007')
          ? 'PERMISSION_REQUIRED'
          : 'FAILED';
        const failureReason = result.failureReason || 'DELIVERY_FAILED';

        await this.recordFailureState(correlationId, communityId, featureKey, failureReason, idempotencyKey);

        return {
          status: mappedStatus,
          failureReason,
        };
      }

      // Record successful delivery metric and persistent records
      await EntitlementService.checkLimit(communityId, `${featureKey}_MESSAGES_SENT`, 1);
      observabilityService.recordEngagementOutcome('SENT');

      const successResponse = {
        status: 'SENT',
        messageId: result.messageId,
      };

      try {
        await discordDeliveriesRepository.update(correlationId, {
          status: 'SENT',
          messageId: result.messageId,
          confirmedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        // Non-blocking
      }

      if (idempotencyKey) {
        await idempotencyService.complete(idempotencyKey, successResponse, result.messageId);
      }

      return successResponse;
    } catch (err: any) {
      logger.error('[DeliveryEngine] Delivery pipeline failure:', undefined, err);
      const failureReason = err.message || 'DELIVERY_FAILED';
      await this.recordFailureState(correlationId, communityId, featureKey, failureReason, idempotencyKey);
      return { status: 'FAILED', failureReason };
    }
  }

  private static async recordFailureState(
    correlationId: string,
    communityId: string,
    featureKey: string,
    failureReason: string,
    idempotencyKey?: string
  ): Promise<void> {
    try {
      observabilityService.recordEngagementOutcome(failureReason);
      await discordDeliveriesRepository.update(correlationId, {
        status: failureReason === 'PERMISSION_REQUIRED' ? 'PERMISSION_REQUIRED' : 'FAILED',
        errorCode: failureReason,
        errorMessage: failureReason,
        updatedAt: new Date().toISOString(),
      });

      await failedOperationService.recordFailure({
        operationId: correlationId,
        communityId,
        resource: 'DISCORD_MESSAGE',
        operationType: `DELIVERY_${featureKey}`,
        errorCode: failureReason,
        errorMessage: failureReason,
      });

      if (idempotencyKey) {
        await idempotencyService.fail(idempotencyKey, failureReason);
      }
    } catch (e) {
      // Non-blocking
    }
  }
}

/**
 * 5. ANNOUNCEMENTS SERVICE - EngagementCampaignService
 */
/** Next run time for a recurring campaign, or null when it should stop. */
export function nextCampaignRun(c: any, from = new Date()): string | null {
  const f = c.frequency || 'ONCE';
  if (f === 'ONCE') return null;
  const n = Math.max(1, Number(c.interval) || 1);
  const d = new Date(c.scheduledAt || from);
  do {
    if (f === 'HOURLY') d.setUTCHours(d.getUTCHours() + n);
    else if (f === 'DAILY') d.setUTCDate(d.getUTCDate() + n);
    else if (f === 'WEEKLY') d.setUTCDate(d.getUTCDate() + 7 * n);
    else if (f === 'MONTHLY') d.setUTCMonth(d.getUTCMonth() + n);
    else return null;
  } while (d <= from);
  if (c.endAt && d > new Date(c.endAt)) return null;
  if (c.maxRuns && (c.runCount || 0) + 1 >= c.maxRuns) return null;
  return d.toISOString();
}

/** Live recipients from Discord (falls back to the synced member list). */
async function campaignRecipients(c: any): Promise<string[]> {
  try {
    const community: any = await communitiesRepository.getById(c.communityId);
    const guild: any = discordService.getGuild(community?.discordGuildId || community?.guildId);
    if (guild) {
      if (c.targetAudience === 'MEMBERS' && Array.isArray(c.memberIds)) return c.memberIds;
      const members = await guild.members.fetch();
      return Array.from(members.values())
        .filter((m: any) => !m.user.bot && (c.targetAudience !== 'ROLE' || m.roles.cache.has(c.roleId)))
        .map((m: any) => m.id);
    }
  } catch (err: any) {
    logger.warn(`[CampaignService] live member list unavailable: ${err?.message}`);
  }
  return EngagementAudienceService.resolveAudience(c.communityId, c.targetAudience === 'ROLE' ? 'ROLE' : c.targetAudience === 'MEMBERS' ? 'CUSTOM_MEMBER_SET' : 'ALL', { roleId: c.roleId, memberIds: c.memberIds });
}

export class EngagementCampaignService {
  static async executeCampaign(campaignId: string, actorUserId: string, actorRole: any): Promise<void> {
    const campaign: any = await campaignsRepository.getById(campaignId);
    if (!campaign) throw new NotFoundError('Campaign not found.');
    if (campaign.status === 'PAUSED') return;
    await campaignsRepository.update(campaignId, { status: 'PROCESSING' as any, updatedAt: new Date().toISOString() });

    let sentCount = 0;
    let audience = 0;
    try {
      if (campaign.targetAudience === 'CHANNEL') {
        audience = 1;
        const d = await EngagementDeliveryService.deliverMessage({
          communityId: campaign.communityId, actorUserId, actorRole,
          targetChannelId: campaign.channelId, content: campaign.message, featureKey: 'CAMPAIGNS',
        });
        if (d.status === 'SENT') sentCount = 1;
      } else {
        const ids = await campaignRecipients(campaign);
        audience = ids.length;
        for (const userId of ids) {
          const d = await EngagementDeliveryService.deliverMessage({
            communityId: campaign.communityId, actorUserId, actorRole,
            targetUserId: userId, content: campaign.message, featureKey: 'CAMPAIGNS',
          });
          if (d.status === 'SENT') sentCount++;
        }
      }
      const next = nextCampaignRun(campaign);
      await campaignsRepository.update(campaignId, {
        status: next ? 'SCHEDULED' : 'COMPLETED',
        scheduledAt: next || campaign.scheduledAt,
        runCount: (campaign.runCount || 0) + 1,
        lastRunAt: new Date().toISOString(),
        audienceResolvedCount: audience,
        deliveryAuditCount: (campaign.deliveryAuditCount || 0) + sentCount,
        updatedAt: new Date().toISOString(),
      } as any);
      await auditService.log({
        communityId: campaign.communityId, actorUserId, actorRole,
        action: 'CAMPAIGN_COMPLETED', targetType: 'CAMPAIGN', targetId: campaignId,
        metadata: { sentCount, audience, next },
      });
    } catch (err: any) {
      await campaignsRepository.update(campaignId, { status: 'FAILED', updatedAt: new Date().toISOString() } as any);
      logger.error(`[CampaignService] Execution failed for ${campaignId}`, undefined, err);
    }
  }
}

/**
 * 11. POLLS SERVICE - EngagementPollService
 */
export class EngagementPollService {
  /** Posts a native Discord poll; Discord collects the votes and closes it after the chosen duration. */
  static async createPoll(communityId: string, pollData: any, actorUserId: string, actorRole: any): Promise<Poll> {
    const hasFeature = await EntitlementService.hasFeature(communityId, 'POLLS');
    if (!hasFeature) throw new ForbiddenError('Interactive Polls are not available on your active plan.');
    const question = String(pollData.question || '').trim().slice(0, 300);
    const options: string[] = (Array.isArray(pollData.options) ? pollData.options : []).map((o: any) => String(o).trim().slice(0, 55)).filter(Boolean).slice(0, 10);
    const channelId = String(pollData.channelId || '');
    if (!question || options.length < 2 || !channelId) throw new BadRequestError('A question, a channel and at least 2 options are required.');
    const hours = Math.min(768, Math.max(1, Math.round(Number(pollData.durationHours) || 24)));

    const ch: any = await (discordService as any).client?.channels?.fetch(channelId).catch(() => null);
    if (!ch?.send) throw new BadRequestError('The bot cannot post in that channel.');
    const msg = await ch.send({
      poll: { question: { text: question }, answers: options.map((text) => ({ text })), duration: hours, allowMultiselect: !!pollData.allowMultiselect },
    });

    const now = new Date();
    const poll = await pollsRepository.create({
      communityId, question, options, votes: {}, votedUserIds: [], channelId,
      durationMinutes: hours * 60, messageId: msg.id, endsAt: new Date(now.getTime() + hours * 3600_000).toISOString(),
      allowMultiselect: !!pollData.allowMultiselect, afterAction: pollData.afterAction === 'NONE' ? 'NONE' : 'ANNOUNCE',
      status: 'ACTIVE', createdAt: now.toISOString(), updatedAt: now.toISOString(),
    } as any);
    await auditService.log({ communityId, actorUserId, actorRole, action: 'POLL_CREATED', targetType: 'POLL', targetId: poll.id });
    return poll as Poll;
  }

  /** End early (Discord finalises the result immediately). */
  static async closePoll(communityId: string, pollId: string, actorUserId: string, actorRole: any): Promise<Poll> {
    const poll: any = await pollsRepository.getById(pollId);
    if (!poll || poll.communityId !== communityId) throw new NotFoundError('Poll not found.');
    const ch: any = await (discordService as any).client?.channels?.fetch(poll.channelId).catch(() => null);
    const msg: any = await ch?.messages?.fetch(poll.messageId).catch(() => null);
    if (msg?.poll && !msg.poll.resultsFinalized) await msg.poll.end().catch(() => undefined);
    await auditService.log({ communityId, actorUserId, actorRole, action: 'POLL_CLOSED', targetType: 'POLL', targetId: pollId });
    return (await this.finalize(poll, true)) || poll;
  }

  /** Reads Discord's final counts, stores them and (optionally) posts the result. */
  static async finalize(poll: any, force = false): Promise<Poll | null> {
    const ch: any = await (discordService as any).client?.channels?.fetch(poll.channelId).catch(() => null);
    const msg: any = await ch?.messages?.fetch({ message: poll.messageId, force: true }).catch(() => null);
    if (!msg?.poll) {
      if (poll.endsAt && Date.now() - new Date(poll.endsAt).getTime() > 6 * 3600_000) {
        return pollsRepository.update(poll.id, { status: 'CLOSED', updatedAt: new Date().toISOString() } as any) as any;
      }
      return null;
    }
    if (!msg.poll.resultsFinalized && !force) return null;
    const results = Array.from(msg.poll.answers.values()).map((a: any) => ({ text: a.text, votes: a.voteCount || 0 }));
    const updated = await pollsRepository.update(poll.id, { status: 'CLOSED', results, updatedAt: new Date().toISOString() } as any);
    if (poll.afterAction !== 'NONE') {
      const total = results.reduce((n, r) => n + r.votes, 0);
      const top = Math.max(0, ...results.map((r) => r.votes));
      const winners = results.filter((r) => r.votes === top && top > 0).map((r) => `**${r.text}**`);
      const text = !total ? `📊 Poll closed: **${poll.question}**\nNo votes were cast.`
        : `📊 Poll closed: **${poll.question}**\n${winners.length > 1 ? `Tie between ${winners.join(' and ')}` : `Winner: ${winners[0]}`} with ${top} vote${top === 1 ? '' : 's'} (${total} total).`;
      await msg.reply({ content: text, allowedMentions: { parse: [] } }).catch(() => undefined);
    }
    return updated as any;
  }
}

/**
 * 12. REMINDERS SERVICE - EngagementReminderService
 */
export class EngagementReminderService {
  static async createReminder(communityId: string, reminderData: any, actorUserId: string, actorRole: any): Promise<Reminder> {
    const hasFeature = await EntitlementService.hasFeature(communityId, 'REMINDERS');
    if (!hasFeature) {
      throw new ForbiddenError('Reminders & Notifications are not available on your active plan.');
    }

    const { triggerAt, targetUser, message, recurrence, timezone, channelId } = reminderData;
    const targetType = reminderData.targetType === 'CHANNEL' ? 'CHANNEL' : 'MEMBER';
    if (!triggerAt || !message || (targetType === 'MEMBER' ? !targetUser : !channelId)) {
      throw new BadRequestError(targetType === 'MEMBER' ? 'Pick a member, a time and a message.' : 'Pick a channel, a time and a message.');
    }

    const reminder = await remindersRepository.create({
      communityId,
      triggerAt: new Date(triggerAt).toISOString(),
      targetType,
      targetUser: targetType === 'MEMBER' ? targetUser : '',
      targetUserName: targetType === 'MEMBER' ? String(reminderData.targetUserName || '').slice(0, 64) : undefined,
      channelId: targetType === 'CHANNEL' ? channelId : undefined,
      message,
      status: 'PENDING',
      recurrence: recurrence || 'ONCE',
      timezone: timezone || 'UTC',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    await auditService.log({
      communityId,
      actorUserId,
      actorRole,
      action: 'REMINDER_CREATED',
      targetType: 'REMINDER',
      targetId: reminder.id,
    });

    return reminder as Reminder;
  }
}

/**
 * 13. SCHEDULER ENGINE - EngagementSchedulerService
 */
export class EngagementSchedulerService {
  private static executedKeys = new Set<string>();

  /**
   * Run a pass over all scheduled resources, sending them exactly once using strict idempotency.
   */
  static async processScheduledJobs(): Promise<void> {
    const nowStr = new Date().toISOString();

    // 1. Scheduled Announcements
    const announcements = await announcementsRepository.list();
    const scheduledAnn = announcements.filter(a => a.status === 'SCHEDULED' && a.scheduledAt && a.scheduledAt <= nowStr);

    for (const ann of scheduledAnn) {
      const idempotencyKey = `${ann.communityId}_ANNOUNCEMENT_${ann.id}_${ann.scheduledAt}`;
      if (this.executedKeys.has(idempotencyKey)) continue;
      this.executedKeys.add(idempotencyKey);

      await announcementsRepository.update(ann.id, { status: 'SENT', updatedAt: new Date().toISOString() });
      const deliver = await EngagementDeliveryService.deliverMessage({
        communityId: ann.communityId,
        actorUserId: ann.createdBy,
        actorRole: 'OWNER',
        targetChannelId: ann.channelId,
        content: ann.content,
        featureKey: 'ANNOUNCEMENTS',
      });

      if (deliver.status === 'SENT') {
        await auditService.log({
          communityId: ann.communityId,
          actorUserId: ann.createdBy,
          actorRole: 'OWNER',
          action: 'ENGAGEMENT_SENT',
          targetType: 'ANNOUNCEMENT',
          targetId: ann.id,
        });
      } else {
        await announcementsRepository.update(ann.id, { status: 'FAILED', errorDetails: deliver.failureReason });
        await auditService.log({
          communityId: ann.communityId,
          actorUserId: ann.createdBy,
          actorRole: 'OWNER',
          action: 'ENGAGEMENT_FAILED',
          targetType: 'ANNOUNCEMENT',
          targetId: ann.id,
          metadata: { reason: deliver.failureReason },
        });
      }
    }

    // 2. Scheduled Campaigns
    const campaigns = await campaignsRepository.list();
    const scheduledCamps = campaigns.filter(c => c.status === 'SCHEDULED' && c.scheduledAt && c.scheduledAt <= nowStr);

    for (const camp of scheduledCamps) {
      const idempotencyKey = `${camp.communityId}_CAMPAIGN_${camp.id}_${camp.scheduledAt}`;
      if (this.executedKeys.has(idempotencyKey)) continue;
      this.executedKeys.add(idempotencyKey);

      await EngagementCampaignService.executeCampaign(camp.id, 'scheduler', 'OWNER');
    }

    // 3. Pending Reminders
    const reminders = await remindersRepository.list();
    const pendingReminders = reminders.filter(r => r.status === 'PENDING' && r.triggerAt && r.triggerAt <= nowStr);

    for (const rem of pendingReminders) {
      const idempotencyKey = `${rem.communityId}_REMINDER_${rem.id}_${rem.triggerAt}`;
      if (this.executedKeys.has(idempotencyKey)) continue;
      this.executedKeys.add(idempotencyKey);

      const r: any = rem;
      const repeatDays = r.recurrence === 'DAILY' ? 1 : r.recurrence === 'WEEKLY' ? 7 : 0;
      const nextAt = repeatDays ? new Date(new Date(r.triggerAt).getTime() + repeatDays * 86400_000).toISOString() : null;
      await remindersRepository.update(rem.id, (nextAt ? { triggerAt: nextAt, lastSentAt: nowStr, updatedAt: nowStr } : { status: 'SENT', updatedAt: nowStr }) as any);
      const deliver = await EngagementDeliveryService.deliverMessage({
        communityId: rem.communityId,
        actorUserId: 'scheduler',
        actorRole: 'OWNER',
        ...(r.targetType === 'CHANNEL' ? { targetChannelId: r.channelId } : { targetUserId: rem.targetUser }),
        content: rem.message,
        featureKey: 'REMINDERS',
      });

      if (deliver.status === 'SENT') {
        await auditService.log({
          communityId: rem.communityId,
          actorUserId: 'scheduler',
          actorRole: 'OWNER',
          action: 'REMINDER_SENT',
          targetType: 'REMINDER',
          targetId: rem.id,
        });
      } else {
        await remindersRepository.update(rem.id, { status: 'FAILED', updatedAt: new Date().toISOString() });
      }
    }

    // 3b. Native polls that have ended: store results and post the outcome.
    try {
      const polls: any[] = await pollsRepository.list();
      for (const p of polls.filter((x) => x.status === 'ACTIVE' && x.messageId && x.endsAt && x.endsAt <= nowStr)) {
        await EngagementPollService.finalize(p).catch((e: any) => logger.warn(`[SchedulerService] poll ${p.id}: ${e?.message}`));
      }
    } catch (err: any) {
      logger.warn(`[SchedulerService] polls pass skipped: ${err?.message}`);
    }

    // 4. Event Reminders
    try {
      const { eventReminderService } = await import('./events.service.js');
      await eventReminderService.processRemindersPass();
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (
        err?.code === 7 ||
        errMsg.includes('PERMISSION_DENIED') ||
        errMsg.includes('Missing or insufficient permissions')
      ) {
        logger.warn('[SchedulerService] Event reminders pass skipped: Firestore database is temporarily unreachable or permissions are propagating.');
      } else {
        logger.error('[SchedulerService] Error running event reminders pass:', undefined, err as any);
      }
    }

    // 5. Schedules Engine
    try {
      const { scheduleService } = await import('./schedule.service.js');
      await scheduleService.processPendingSchedules();
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (
        err?.code === 7 ||
        errMsg.includes('PERMISSION_DENIED') ||
        errMsg.includes('Missing or insufficient permissions')
      ) {
        logger.warn('[SchedulerService] Schedules pass skipped: Firestore database is temporarily unreachable or permissions are propagating.');
      } else {
        logger.error('[SchedulerService] Error running schedules pass:', undefined, err as any);
      }
    }
  }

  private static interval: NodeJS.Timeout | null = null;
  static startScheduler() {
    if (this.interval) return;
    this.interval = setInterval(() => {
      this.processScheduledJobs().catch(err => {
        const errMsg = err?.message || String(err);
        if (
          err?.code === 7 ||
          errMsg.includes('PERMISSION_DENIED') ||
          errMsg.includes('Missing or insufficient permissions')
        ) {
          logger.warn('[SchedulerService] Scheduled pass skipped: Firestore database is temporarily unreachable or permissions are propagating.');
        } else {
          logger.error('[SchedulerService] Error executing scheduled pass:', undefined, err);
        }
      });
    }, 10000); // Check every 10s for responsive scheduler execution
  }

  static stopScheduler() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

// The scheduler is started by server/runtime/leadership.ts only on the active (leader) instance,
// so scheduled posts never run twice.
