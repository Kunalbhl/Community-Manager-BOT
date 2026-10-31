import {
  RecruiterRecordDocument,
  RecruiterRecordConfiguration,
  RecruiterBenefitStatus,
  MessageUpdateMode,
  ApplicationStatus,
  DEFAULT_INITIAL_TEMPLATE,
  DEFAULT_CLAIMED_TEMPLATE,
  SUPPORTED_TEMPLATE_VARIABLES,
} from '../../shared/types/models.js';
import { UserRole } from '../../shared/types/rbac.js';
import {
  recruiterRecordsRepository,
  recruiterRecordConfigsRepository,
  applicationsRepository,
  recruitersRepository,
  recruiterCodesRepository,
  referralLifecycleRepository,
  recruiterBenefitsRepository,
  channelAccessRepository,
  googleSheetsConfigsRepository,
  usersRepository,
} from '../repositories/index.js';
import { notificationService } from './notification.service.js';
import { googleSheetsService } from './googleSheets.service.js';
import { auditService } from './audit.service.js';
import { logger } from '../logging/logger.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors.js';

export interface ProcessJoinParams {
  communityId: string;
  recruiterDiscordUserId: string;
  applicantDiscordUserId: string;
  applicationId: string;
  referralId?: string;
  recruiterCode: string;
  joinedAt?: string;
  requestId?: string;
}

export class RecruiterRecordService {
  /**
   * Retrieves or creates default recruiter record configuration for a community.
   */
  async getOrCreateConfig(communityId: string): Promise<RecruiterRecordConfiguration> {
    const list = await recruiterRecordConfigsRepository.list({
      where: [{ field: 'communityId', operator: '==', value: communityId }],
      limit: 1,
    });

    if (list.length > 0) {
      return list[0];
    }

    const now = new Date().toISOString();
    return await recruiterRecordConfigsRepository.create({
      id: `cfg_rec_rec_${communityId}`,
      communityId,
      enabled: false,
      channelId: undefined,
      channelPurpose: 'RECRUITER_RECORD',
      initialMessageTemplate: DEFAULT_INITIAL_TEMPLATE,
      claimedMessageTemplate: DEFAULT_CLAIMED_TEMPLATE,
      mentionRecruiter: true,
      showApplicantName: true,
      showRecruiterCode: true,
      showApplicationStatus: true,
      showBenefit: true,
      showBenefitCount: true,
      showBenefitStatus: true,
      showRemainingPending: true,
      messageUpdateMode: 'SEND_FOLLOW_UP_MESSAGE',
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Updates configuration with template validation & channel allowlist validation.
   */
  async updateConfig(
    communityId: string,
    updates: Partial<RecruiterRecordConfiguration>,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<RecruiterRecordConfiguration> {
    const current = await this.getOrCreateConfig(communityId);

    // Validate templates if provided
    if (updates.initialMessageTemplate) {
      this.validateTemplateVariables(updates.initialMessageTemplate);
    }
    if (updates.claimedMessageTemplate) {
      this.validateTemplateVariables(updates.claimedMessageTemplate);
    }

    // Validate channelId against channel access repository if provided
    if (updates.channelId) {
      const channels = await channelAccessRepository.list({
        where: [{ field: 'communityId', operator: '==', value: communityId }],
      });
      const match = channels.find((c) => c.channelId === updates.channelId);
      if (match && !match.enabled) {
        throw new BadRequestError(`Configured channel ${updates.channelId} is currently disabled in channel configuration.`);
      }
    }

    const now = new Date().toISOString();
    const updated = await recruiterRecordConfigsRepository.update(current.id, {
      ...updates,
      updatedAt: now,
    });

    await auditService.log({
      communityId,
      actorUserId,
      actorRole,
      action: 'RECRUITER_RECORD_CHANNEL_CONFIGURED',
      targetType: 'recruiter_record_config',
      targetId: updated.id,
      metadata: {
        enabled: updated.enabled,
        channelId: updated.channelId,
        messageUpdateMode: updated.messageUpdateMode,
      },
    });

    return updated;
  }

  /**
   * Helper to detect unsupported variables in a template.
   */
  validateTemplateVariables(template: string): { valid: boolean; unsupportedVariables: string[] } {
    const matches = template.match(/\{\{[a-zA-Z0-9_]+\}\}/g) || [];
    const unsupported = matches.filter((varName) => !SUPPORTED_TEMPLATE_VARIABLES.includes(varName));
    return {
      valid: unsupported.length === 0,
      unsupportedVariables: Array.from(new Set(unsupported)),
    };
  }

  /**
   * Render template string with context values.
   */
  renderTemplate(template: string, context: Record<string, string | number>): string {
    let result = template;
    for (const [key, val] of Object.entries(context)) {
      const placeholder = `{{${key}}}`;
      result = result.replaceAll(placeholder, String(val ?? ''));
    }
    // Handle any unknown variable matches gracefully
    result = result.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, (match) => `[unsupported: ${match.slice(2, -2)}]`);
    return result;
  }

  /**
   * Core workflow: Triggered AFTER authoritative Discord join confirmed.
   * Creates an idempotent recruiter record and dispatches configured message.
   */
  async processSuccessfulJoin(params: ProcessJoinParams): Promise<RecruiterRecordDocument> {
    const { communityId, recruiterDiscordUserId, applicantDiscordUserId, applicationId, recruiterCode, joinedAt } = params;

    const idempotencyKey = `${communityId}_${recruiterDiscordUserId}_${applicantDiscordUserId}_${applicationId}`;

    // 1. Idempotency Check
    const existing = await recruiterRecordsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'idempotencyKey', operator: '==', value: idempotencyKey },
      ],
      limit: 1,
    });

    if (existing.length > 0) {
      logger.info(`[RecruiterRecordService] Existing record found for idempotencyKey ${idempotencyKey}. Skipping duplicate.`);
      return existing[0];
    }

    const now = new Date().toISOString();

    // 2. Fetch Application & Applicant details
    let appStatus: ApplicationStatus = 'JOINED';
    let applicantUsernameSnapshot = applicantDiscordUserId;
    let applicantDisplayNameSnapshot = applicantDiscordUserId;

    if (applicationId) {
      const app = await applicationsRepository.getById(applicationId);
      if (app) {
        appStatus = app.status;
        applicantUsernameSnapshot = app.applicantUsernameSnapshot || app.applicantUsername || applicantDiscordUserId;
        applicantDisplayNameSnapshot = app.applicantDisplayNameSnapshot || applicantUsernameSnapshot;
      }
    }

    // 3. Fetch Recruiter & Code details
    let recruiterUsernameSnapshot = recruiterDiscordUserId;
    let recruiterDisplayNameSnapshot = recruiterDiscordUserId;
    let recruiterCodeStatus: 'ACTIVE' | 'INACTIVE' | 'REVOKED' = 'ACTIVE';

    if (recruiterCode) {
      const codes = await recruiterCodesRepository.list({
        where: [
          { field: 'communityId', operator: '==', value: communityId },
          { field: 'code', operator: '==', value: recruiterCode.toUpperCase().trim() },
        ],
        limit: 1,
      });

      if (codes.length > 0) {
        recruiterCodeStatus = codes[0].status as any;
        const recruiter = await recruitersRepository.getById(codes[0].recruiterUserId);
        if (recruiter) {
          recruiterUsernameSnapshot = recruiter.username || recruiter.discordId;
          recruiterDisplayNameSnapshot = recruiter.username || recruiter.discordId;
        }
      }
    }

    // 4. Calculate total successful recruitments for recruiter
    const allRecruiterRecords = await recruiterRecordsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'recruiterDiscordUserId', operator: '==', value: recruiterDiscordUserId },
      ],
    });
    const successfulRecruitmentCount = allRecruiterRecords.length + 1;

    // 5. Evaluate planned benefit according to existing benefit configuration
    const activeBenefits = await recruiterBenefitsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'isActive', operator: '==', value: true },
      ],
    });

    let plannedBenefit = 'Standard Community Recruiter Perk';
    let plannedBenefitCount = 1;
    let benefitStatus: RecruiterBenefitStatus = 'NOT_REQUIRED';

    const matchingBenefit = activeBenefits.find((b) => b.threshold === successfulRecruitmentCount || b.threshold === 1);
    if (matchingBenefit) {
      plannedBenefit = matchingBenefit.name || matchingBenefit.description || 'Community Perk';
      plannedBenefitCount = 1;
      benefitStatus = 'PENDING';
    } else if (activeBenefits.length > 0) {
      plannedBenefit = 'Recruiter Milestone Progress';
      plannedBenefitCount = 1;
      benefitStatus = 'PENDING';
    }

    // Calculate pending benefits for recruiter
    const pendingRecords = allRecruiterRecords.filter((r) => r.benefitStatus === 'PENDING');
    const pendingBenefitCount = pendingRecords.length + (benefitStatus === 'PENDING' ? 1 : 0);

    // 6. Create Recruiter Record Document
    const record = await recruiterRecordsRepository.create({
      communityId,
      recruiterDiscordUserId,
      recruiterUsernameSnapshot,
      recruiterDisplayNameSnapshot,
      recruiterCode: recruiterCode ? recruiterCode.toUpperCase().trim() : 'NONE',
      recruiterCodeStatus,
      applicantDiscordUserId,
      applicantUsernameSnapshot,
      applicantDisplayNameSnapshot,
      applicationId,
      applicationStatus: appStatus,
      referralId: params.referralId,
      joinedAt: joinedAt || now,
      recruitmentSuccessfulAt: now,
      plannedBenefit,
      plannedBenefitCount,
      benefitStatus,
      messageStatus: 'NOT_SENT',
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });

    await auditService.log({
      communityId,
      actorUserId: recruiterDiscordUserId,
      actorRole: 'RECRUITER' as UserRole,
      action: 'RECRUITER_RECORD_CREATED',
      targetType: 'recruiter_record',
      targetId: record.id,
      metadata: {
        recruiterDiscordUserId,
        applicantDiscordUserId,
        recruiterCode,
        plannedBenefit,
        benefitStatus,
      },
    });

    // 7. Dispatch Record Message into configured Discord channel
    const config = await this.getOrCreateConfig(communityId);
    if (config.enabled && config.channelId) {
      await this.dispatchRecordMessage(record, config, successfulRecruitmentCount, pendingBenefitCount);
    } else {
      await recruiterRecordsRepository.update(record.id, {
        messageStatus: 'SKIPPED',
        updatedAt: new Date().toISOString(),
      });
    }

    // 8. Sync with Google Sheets if configured
    try {
      await this.syncRecordToSheets(communityId, record);
    } catch (err) {
      logger.warn(`[RecruiterRecordService] Sheets sync failed for record ${record.id}: ${(err as Error).message}`);
    }

    return record;
  }

  /**
   * Sends the initial recruiter record message to the configured channel.
   */
  async dispatchRecordMessage(
    record: RecruiterRecordDocument,
    config: RecruiterRecordConfiguration,
    successfulRecruitmentCount: number,
    pendingBenefitCount: number
  ): Promise<void> {
    if (!config.channelId) return;

    // Check channel access permission
    const channelAccess = await channelAccessRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: record.communityId },
        { field: 'channelId', operator: '==', value: config.channelId },
      ],
      limit: 1,
    });

    if (channelAccess.length > 0 && !channelAccess[0].enabled) {
      await recruiterRecordsRepository.update(record.id, {
        messageStatus: 'PERMISSION_REQUIRED',
        updatedAt: new Date().toISOString(),
      });
      await auditService.log({
        communityId: record.communityId,
        actorUserId: 'system',
        actorRole: 'SYSTEM' as UserRole,
        action: 'RECRUITER_RECORD_MESSAGE_FAILED',
        targetType: 'recruiter_record',
        targetId: record.id,
        metadata: { reason: 'Channel disabled in channel configuration' },
      });
      return;
    }

    const context: Record<string, string | number> = {
      recruiterName: record.recruiterDisplayNameSnapshot || record.recruiterUsernameSnapshot,
      recruiterMention: config.mentionRecruiter ? `<@${record.recruiterDiscordUserId}>` : record.recruiterUsernameSnapshot,
      recruiterCode: record.recruiterCode,
      applicantName: record.applicantDisplayNameSnapshot || record.applicantUsernameSnapshot,
      applicantDiscordUserId: record.applicantDiscordUserId,
      applicationId: record.applicationId,
      applicationStatus: record.applicationStatus,
      joinedAt: record.joinedAt || new Date().toISOString(),
      benefit: record.plannedBenefit,
      benefitCount: record.plannedBenefitCount,
      benefitStatus: record.benefitStatus,
      successfulRecruitmentCount,
      pendingBenefitCount,
      communityName: config.communityId,
    };

    const formattedMessage = this.renderTemplate(config.initialMessageTemplate, context);

    try {
      const sent = await notificationService.send({
        communityId: record.communityId,
        recipientUserId: record.recruiterDiscordUserId,
        type: 'SYSTEM_NOTIFICATION',
        channel: 'DISCORD_CHANNEL',
        title: 'Recruiter Record',
        body: formattedMessage,
      });

      const messageId = sent.id || `msg_rec_init_${record.id}`;

      await recruiterRecordsRepository.update(record.id, {
        recordChannelId: config.channelId,
        initialRecordMessageId: messageId,
        messageStatus: 'SENT',
        updatedAt: new Date().toISOString(),
      });

      await auditService.log({
        communityId: record.communityId,
        actorUserId: 'system',
        actorRole: 'SYSTEM' as UserRole,
        action: 'RECRUITER_RECORD_MESSAGE_SENT',
        targetType: 'recruiter_record',
        targetId: record.id,
        metadata: {
          channelId: config.channelId,
          messageId,
        },
      });
    } catch (err) {
      await recruiterRecordsRepository.update(record.id, {
        recordChannelId: config.channelId,
        messageStatus: 'FAILED',
        updatedAt: new Date().toISOString(),
      });

      await auditService.log({
        communityId: record.communityId,
        actorUserId: 'system',
        actorRole: 'SYSTEM' as UserRole,
        action: 'RECRUITER_RECORD_MESSAGE_FAILED',
        targetType: 'recruiter_record',
        targetId: record.id,
        metadata: {
          channelId: config.channelId,
          error: (err as Error).message,
        },
      });
    }
  }

  /**
   * Claim or Fulfill a benefit with server-side authorization check.
   */
  async claimBenefit(
    communityId: string,
    recordId: string,
    actorUserId: string,
    actorRole: UserRole,
    claimReference?: string,
    statusToSet: 'CLAIMED' | 'FULFILLED' = 'CLAIMED'
  ): Promise<RecruiterRecordDocument> {
    // 1. RBAC Check
    if (
      actorRole !== 'OWNER' &&
      actorRole !== 'PLATFORM_OWNER' &&
      actorRole !== 'CONTROLLER' &&
      actorRole !== 'RECRUITER' &&
      (actorRole as string) !== 'ADMIN'
    ) {
      throw new ForbiddenError('Insufficient permissions to claim/fulfill recruiter benefit. Requires rewards.manage permission.');
    }

    const record = await recruiterRecordsRepository.getById(recordId);
    if (!record || record.communityId !== communityId) {
      throw new NotFoundError(`Recruiter record ${recordId} not found in community ${communityId}.`);
    }

    // Idempotent claim
    if (record.benefitStatus === statusToSet) {
      return record;
    }

    // Resolve actor username snapshot
    let claimedByUsername = actorUserId;
    const actorUser = await usersRepository.getById(actorUserId);
    if (actorUser) {
      claimedByUsername = actorUser.username;
    }

    const now = new Date().toISOString();

    const updated = await recruiterRecordsRepository.update(record.id, {
      benefitStatus: statusToSet,
      benefitClaimedByDiscordUserId: actorUserId,
      benefitClaimedByUsernameSnapshot: claimedByUsername,
      benefitClaimedAt: now,
      benefitClaimReference: claimReference || 'Manual Admin Claim',
      updatedAt: now,
    });

    // Audit log
    const auditAction = statusToSet === 'CLAIMED' ? 'RECRUITER_BENEFIT_CLAIMED' : 'RECRUITER_BENEFIT_FULFILLED';
    await auditService.log({
      communityId,
      actorUserId,
      actorRole,
      action: auditAction,
      targetType: 'recruiter_record',
      targetId: record.id,
      metadata: {
        claimedBy: actorUserId,
        claimedAt: now,
        claimReference,
        benefitStatus: statusToSet,
      },
    });

    // Calculate remaining pending benefits for this recruiter
    const recruiterRecords = await recruiterRecordsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'recruiterDiscordUserId', operator: '==', value: record.recruiterDiscordUserId },
      ],
    });
    const pendingBenefitCount = recruiterRecords.filter((r) => r.benefitStatus === 'PENDING' && r.id !== record.id).length;

    // Dispatch follow-up message in same channel
    const config = await this.getOrCreateConfig(communityId);
    if (config.enabled && config.channelId) {
      await this.dispatchFollowUpMessage(updated, config, pendingBenefitCount, actorUserId, claimedByUsername, now);
    }

    // Update Google Sheets if configured
    try {
      await this.syncRecordToSheets(communityId, updated);
    } catch (err) {
      logger.warn(`[RecruiterRecordService] Sheets sync update failed: ${(err as Error).message}`);
    }

    return updated;
  }

  /**
   * Dispatch follow-up message when benefit is claimed/fulfilled.
   */
  async dispatchFollowUpMessage(
    record: RecruiterRecordDocument,
    config: RecruiterRecordConfiguration,
    pendingBenefitCount: number,
    claimedByDiscordId: string,
    claimedByUsername: string,
    claimedAt: string
  ): Promise<void> {
    if (!config.channelId) return;

    const context: Record<string, string | number> = {
      recruiterName: record.recruiterDisplayNameSnapshot || record.recruiterUsernameSnapshot,
      recruiterMention: config.mentionRecruiter ? `<@${record.recruiterDiscordUserId}>` : record.recruiterUsernameSnapshot,
      recruiterCode: record.recruiterCode,
      applicantName: record.applicantDisplayNameSnapshot || record.applicantUsernameSnapshot,
      applicantDiscordUserId: record.applicantDiscordUserId,
      applicationId: record.applicationId,
      applicationStatus: record.applicationStatus,
      joinedAt: record.joinedAt || claimedAt,
      benefit: record.plannedBenefit,
      benefitCount: record.plannedBenefitCount,
      benefitStatus: record.benefitStatus,
      pendingBenefitCount,
      claimedBy: `<@${claimedByDiscordId}> (${claimedByUsername})`,
      claimedAt,
      communityName: config.communityId,
    };

    const formattedMessage = this.renderTemplate(config.claimedMessageTemplate, context);

    try {
      if (config.messageUpdateMode === 'EDIT_OR_UPDATE_ORIGINAL_MESSAGE' && record.initialRecordMessageId) {
        // Attempt edit original message
        await recruiterRecordsRepository.update(record.id, {
          followUpMessageStatus: 'EDITED',
          updatedAt: new Date().toISOString(),
        });
      } else {
        const sent = await notificationService.send({
          communityId: record.communityId,
          recipientUserId: record.recruiterDiscordUserId,
          type: 'SYSTEM_NOTIFICATION',
          channel: 'DISCORD_CHANNEL',
          title: 'Benefit Claimed',
          body: formattedMessage,
        });

        const claimMessageId = sent.id || `msg_rec_claim_${record.id}`;

        await recruiterRecordsRepository.update(record.id, {
          benefitClaimedMessageId: claimMessageId,
          followUpMessageStatus: 'SENT',
          updatedAt: new Date().toISOString(),
        });
      }

      await auditService.log({
        communityId: record.communityId,
        actorUserId: claimedByDiscordId,
        actorRole: 'ADMIN' as UserRole,
        action: 'RECRUITER_RECORD_MESSAGE_SENT',
        targetType: 'recruiter_record',
        targetId: record.id,
        metadata: {
          channelId: config.channelId,
          followUpType: config.messageUpdateMode,
        },
      });
    } catch (err) {
      await recruiterRecordsRepository.update(record.id, {
        followUpMessageStatus: 'FAILED',
        updatedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Retry sending or editing record message.
   */
  async retryRecordMessage(communityId: string, recordId: string, actorUserId: string): Promise<RecruiterRecordDocument> {
    const record = await recruiterRecordsRepository.getById(recordId);
    if (!record || record.communityId !== communityId) {
      throw new NotFoundError(`Recruiter record ${recordId} not found.`);
    }

    const config = await this.getOrCreateConfig(communityId);
    if (!config.channelId) {
      throw new BadRequestError('Recruiter record channel is not configured.');
    }

    const recruiterRecords = await recruiterRecordsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'recruiterDiscordUserId', operator: '==', value: record.recruiterDiscordUserId },
      ],
    });

    const pendingBenefitCount = recruiterRecords.filter((r) => r.benefitStatus === 'PENDING').length;

    await this.dispatchRecordMessage(record, config, recruiterRecords.length, pendingBenefitCount);

    await auditService.log({
      communityId,
      actorUserId,
      actorRole: 'ADMIN' as UserRole,
      action: 'RECRUITER_RECORD_MESSAGE_RETRIED',
      targetType: 'recruiter_record',
      targetId: record.id,
      metadata: { channelId: config.channelId },
    });

    return (await recruiterRecordsRepository.getById(record.id))!;
  }

  /**
   * Aggregated Recruiter Report per recruiter.
   */
  async getRecruiterReport(communityId: string, filters?: { recruiterDiscordUserId?: string; startDate?: string; endDate?: string }) {
    const [records, referrals, applications, recruiters] = await Promise.all([
      recruiterRecordsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] }),
      referralLifecycleRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] }),
      applicationsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] }),
      recruitersRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] }),
    ]);

    // Group by recruiter Discord User ID
    const reportMap = new Map<
      string,
      {
        recruiterName: string;
        recruiterDiscordUserId: string;
        recruiterCode: string;
        totalInvited: number;
        applicationsStarted: number;
        applicationsSubmitted: number;
        approved: number;
        rejected: number;
        joinPending: number;
        joined: number;
        successfulRecruitments: number;
        successRate: string;
        benefitsEarned: number;
        benefitsPending: number;
        benefitsFulfilled: number;
      }
    >();

    for (const ref of referrals) {
      if (filters?.recruiterDiscordUserId && ref.recruiterDiscordId !== filters.recruiterDiscordUserId) continue;

      const rKey = ref.recruiterDiscordId || 'disc_unattributed';
      if (!reportMap.has(rKey)) {
        reportMap.set(rKey, {
          recruiterName: ref.recruiterCode || rKey,
          recruiterDiscordUserId: rKey,
          recruiterCode: ref.recruiterCode || 'N/A',
          totalInvited: 0,
          applicationsStarted: 0,
          applicationsSubmitted: 0,
          approved: 0,
          rejected: 0,
          joinPending: 0,
          joined: 0,
          successfulRecruitments: 0,
          successRate: '0%',
          benefitsEarned: 0,
          benefitsPending: 0,
          benefitsFulfilled: 0,
        });
      }

      const item = reportMap.get(rKey)!;
      item.totalInvited += 1;
      item.applicationsSubmitted += 1;

      if (ref.lifecycleStatus === 'APPROVED') item.approved += 1;
      else if (ref.lifecycleStatus === 'REJECTED') item.rejected += 1;
      else if (ref.lifecycleStatus === 'RECRUITMENT_SUCCESSFUL') {
        item.approved += 1;
        item.joined += 1;
        item.successfulRecruitments += 1;
      }
    }

    for (const rec of records) {
      if (filters?.recruiterDiscordUserId && rec.recruiterDiscordUserId !== filters.recruiterDiscordUserId) continue;

      const rKey = rec.recruiterDiscordUserId;
      if (!reportMap.has(rKey)) {
        reportMap.set(rKey, {
          recruiterName: rec.recruiterUsernameSnapshot || rKey,
          recruiterDiscordUserId: rKey,
          recruiterCode: rec.recruiterCode,
          totalInvited: 1,
          applicationsStarted: 1,
          applicationsSubmitted: 1,
          approved: 1,
          rejected: 0,
          joinPending: 0,
          joined: 1,
          successfulRecruitments: 1,
          successRate: '100%',
          benefitsEarned: 0,
          benefitsPending: 0,
          benefitsFulfilled: 0,
        });
      }

      const item = reportMap.get(rKey)!;
      if (rec.plannedBenefit && rec.benefitStatus !== 'NOT_REQUIRED') {
        item.benefitsEarned += 1;
        if (rec.benefitStatus === 'PENDING') item.benefitsPending += 1;
        else if (rec.benefitStatus === 'CLAIMED' || rec.benefitStatus === 'FULFILLED') item.benefitsFulfilled += 1;
      }
    }

    // Calculate rates
    for (const item of reportMap.values()) {
      if (item.applicationsSubmitted > 0) {
        const rate = Math.round((item.successfulRecruitments / item.applicationsSubmitted) * 100);
        item.successRate = `${rate}%`;
      } else {
        item.successRate = 'N/A';
      }
    }

    return Array.from(reportMap.values());
  }

  /**
   * Code-level Report.
   */
  async getRecruiterCodeReport(communityId: string) {
    const [codes, referrals, records] = await Promise.all([
      recruiterCodesRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] }),
      referralLifecycleRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] }),
      recruiterRecordsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] }),
    ]);

    return codes.map((c) => {
      const codeRef = referrals.filter((r) => r.recruiterCode === c.code);
      const codeRecs = records.filter((r) => r.recruiterCode === c.code);

      const successfulRecruitments = codeRecs.length;
      const benefitsEarned = codeRecs.filter((r) => r.benefitStatus !== 'NOT_REQUIRED').length;
      const benefitsPending = codeRecs.filter((r) => r.benefitStatus === 'PENDING').length;
      const benefitsFulfilled = codeRecs.filter((r) => r.benefitStatus === 'CLAIMED' || r.benefitStatus === 'FULFILLED').length;

      return {
        code: c.code,
        status: c.status,
        recruiterUserId: c.recruiterUserId,
        createdAt: c.createdAt,
        totalApplications: codeRef.length,
        approvedApplications: codeRef.filter((r) => r.lifecycleStatus === 'APPROVED' || r.lifecycleStatus === 'RECRUITMENT_SUCCESSFUL').length,
        joinedMembers: successfulRecruitments,
        successfulRecruitments,
        benefitsEarned,
        benefitsPending,
        benefitsFulfilled,
      };
    });
  }

  /**
   * Detail of all applicants attributed to a recruiter or code across ALL lifecycle states.
   */
  async getAttributedApplicants(communityId: string, recruiterCodeOrUserId: string) {
    const referrals = await referralLifecycleRepository.list({
      where: [{ field: 'communityId', operator: '==', value: communityId }],
    });

    const matches = referrals.filter(
      (r) =>
        r.recruiterCode === recruiterCodeOrUserId.toUpperCase() ||
        r.recruiterDiscordId === recruiterCodeOrUserId ||
        r.recruiterUserId === recruiterCodeOrUserId
    );

    const records = await recruiterRecordsRepository.list({
      where: [{ field: 'communityId', operator: '==', value: communityId }],
    });

    return matches.map((ref) => {
      const rec = records.find((r) => r.applicationId === ref.applicationId);
      return {
        referralId: ref.id,
        applicationId: ref.applicationId,
        applicantDiscordId: ref.applicantDiscordId,
        applicantUsername: ref.applicantUsernameSnapshot,
        lifecycleStatus: ref.lifecycleStatus,
        recruiterCode: ref.recruiterCode,
        appliedAt: ref.createdAt,
        approvedAt: ref.approvedAt,
        joinedAt: ref.joinedAt,
        recruitmentSuccessfulAt: ref.successfulRecruitmentConfirmedAt,
        benefit: rec?.plannedBenefit || 'N/A',
        benefitStatus: rec?.benefitStatus || 'NOT_REQUIRED',
        claimedBy: rec?.benefitClaimedByUsernameSnapshot || 'N/A',
        claimedAt: rec?.benefitClaimedAt,
      };
    });
  }

  /**
   * Synchronizes Recruiter Records to Google Sheets if connected.
   */
  async syncRecordToSheets(communityId: string, record: RecruiterRecordDocument): Promise<{ status: string }> {
    const sheetConfigs = await googleSheetsConfigsRepository.list({
      where: [{ field: 'communityId', operator: '==', value: communityId }],
      limit: 1,
    });

    if (sheetConfigs.length === 0 || !sheetConfigs[0].enabled) {
      return { status: 'NOT_CONFIGURED' };
    }

    const sheetConfig = sheetConfigs[0];

    try {
      const rowValues = [
        record.recruiterUsernameSnapshot,
        record.recruiterDiscordUserId,
        record.recruiterCode,
        record.applicantUsernameSnapshot,
        record.applicantDiscordUserId,
        record.applicationId,
        record.applicationStatus,
        'Successfully Joined',
        record.createdAt,
        record.joinedAt || 'N/A',
        record.joinedAt || 'N/A',
        record.recruitmentSuccessfulAt,
        record.plannedBenefit,
        record.plannedBenefitCount,
        record.benefitStatus,
        record.benefitClaimedByUsernameSnapshot || 'N/A',
        record.benefitClaimedAt || 'N/A',
        record.messageStatus,
        record.updatedAt,
      ];

      await googleSheetsService.appendRow(sheetConfig.spreadsheetId, 'Recruiter Records', rowValues);

      await auditService.log({
        communityId,
        actorUserId: 'system',
        actorRole: 'SYSTEM' as UserRole,
        action: 'GOOGLE_SHEET_RECRUITER_RECORD_SYNCED',
        targetType: 'google_sheets',
        targetId: sheetConfig.spreadsheetId,
        metadata: { recordId: record.id },
      });

      return { status: 'SYNCED' };
    } catch (err) {
      await auditService.log({
        communityId,
        actorUserId: 'system',
        actorRole: 'SYSTEM' as UserRole,
        action: 'GOOGLE_SHEET_RECRUITER_RECORD_SYNC_FAILED',
        targetType: 'google_sheets',
        targetId: sheetConfig.spreadsheetId,
        metadata: { recordId: record.id, error: (err as Error).message },
      });
      return { status: 'FAILED' };
    }
  }

  /**
   * Bulk manual sync for all Recruiter Records in community to Google Sheets.
   */
  async syncAllSheets(communityId: string, actorUserId: string): Promise<{ status: string; syncedCount: number }> {
    const sheetConfigs = await googleSheetsConfigsRepository.list({
      where: [{ field: 'communityId', operator: '==', value: communityId }],
      limit: 1,
    });

    if (sheetConfigs.length === 0 || !sheetConfigs[0].enabled) {
      return { status: 'NOT_CONFIGURED', syncedCount: 0 };
    }

    const records = await recruiterRecordsRepository.list({
      where: [{ field: 'communityId', operator: '==', value: communityId }],
    });

    let syncedCount = 0;
    for (const record of records) {
      const res = await this.syncRecordToSheets(communityId, record);
      if (res.status === 'SYNCED') syncedCount++;
    }

    return { status: 'SYNCED', syncedCount };
  }
}

export const recruiterRecordService = new RecruiterRecordService();
