import {
  ReferralLifecycleRecord,
  ReferralLifecycleStatus,
  RecruiterNotificationHistory,
  DiscordCapabilityStatus,
  NotificationType,
} from '../../shared/types/models.js';
import { UserRole } from '../../shared/types/rbac.js';
import {
  referralLifecycleRepository,
  recruiterNotificationHistoryRepository,
  recruitersRepository,
  recruiterCodesRepository,
  communityConfigurationRepository,
} from '../repositories/index.js';
import { recruiterBenefitsService } from './recruiterBenefits.service.js';
import { welcomeOnboardingService } from './welcomeOnboarding.service.js';
import { recruiterRecordService } from './recruiterRecord.service.js';
import { notificationService } from './notification.service.js';
import { auditService } from './audit.service.js';
import { logger } from '../logging/logger.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

export interface CreateReferralParams {
  communityId: string;
  recruiterCode: string;
  applicantUserId: string;
  applicantDiscordId: string;
  applicantUsername: string;
  applicationId: string;
}

export class ReferralLifecycleService {
  /**
   * Creates a referral record linked by authoritative Discord User ID.
   */
  async recordReferralSubmission(
    params: CreateReferralParams,
    requestId?: string
  ): Promise<ReferralLifecycleRecord> {
    // 1. Resolve recruiter code
    const codes = await recruiterCodesRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: params.communityId },
        { field: 'code', operator: '==', value: params.recruiterCode.toUpperCase().trim() },
      ],
      limit: 1,
    });

    let recruiterUserId = 'usr_unattributed';
    let recruiterDiscordId = 'disc_unattributed';

    if (codes.length > 0) {
      recruiterUserId = codes[0].recruiterUserId;
      const recruiter = await recruitersRepository.getById(codes[0].recruiterUserId);
      if (recruiter?.discordId) {
        recruiterDiscordId = recruiter.discordId;
      } else {
        // Codes made in the dashboard store the owner's Discord ID directly.
        const c: any = codes[0];
        const direct = c.recruiterDiscordId || (/^\d{15,22}$/.test(String(c.recruiterUserId || '')) ? c.recruiterUserId : '');
        if (direct) recruiterDiscordId = direct;
      }
    }

    const now = new Date().toISOString();
    const record = await referralLifecycleRepository.create({
      communityId: params.communityId,
      recruiterUserId,
      recruiterDiscordId,
      recruiterCode: params.recruiterCode.toUpperCase().trim(),
      applicantUserId: params.applicantUserId,
      applicantDiscordId: params.applicantDiscordId,
      applicantUsernameSnapshot: params.applicantUsername,
      applicationId: params.applicationId,
      lifecycleStatus: 'APPLICATION_SUBMITTED',
      benefitsEvaluated: false,
      benefitsGranted: [],
      benefitFulfillmentStatus: 'NOT_CONFIGURED',
      createdAt: now,
      updatedAt: now,
    });

    // 2. Dispatch real Discord DM notifications to Applicant & Recruiter
    await this.dispatchLifecycleNotification({
      communityId: params.communityId,
      referralId: record.id,
      recipientUserId: params.applicantUserId,
      recipientDiscordId: params.applicantDiscordId,
      type: 'APPLICATION_RECEIVED',
      title: 'Application Received',
      body: `Your application has been received.\n\nRecruiter Code: ${record.recruiterCode}\nStatus: Under Review`,
    });

    if (recruiterDiscordId !== 'disc_unattributed') {
      await this.dispatchLifecycleNotification({
        communityId: params.communityId,
        referralId: record.id,
        recipientUserId: recruiterUserId,
        recipientDiscordId: recruiterDiscordId,
        type: 'REFERRAL_RECEIVED',
        title: 'New Referral Application',
        body: `Your referral has been received.\n\nApplicant: ${params.applicantUsername} (${params.applicantDiscordId})\nApplication ID: ${params.applicationId}\nStatus: Under Review`,
      });
    }

    return record;
  }

  /**
   * Updates application status (e.g. APPROVED, REJECTED).
   * Note: An approval does NOT complete successful recruitment until actual Discord join occurs.
   */
  async updateApplicationStatus(
    applicationId: string,
    newStatus: 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW' | 'ADDITIONAL_INFO_REQUIRED',
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<ReferralLifecycleRecord | null> {
    const existingList = await referralLifecycleRepository.list({
      where: [{ field: 'applicationId', operator: '==', value: applicationId }],
      limit: 1,
    });

    if (existingList.length === 0) {
      return null;
    }

    const record = existingList[0];
    const now = new Date().toISOString();

    let lifecycleStatus: ReferralLifecycleStatus = 'UNDER_REVIEW';
    if (newStatus === 'APPROVED') lifecycleStatus = 'APPROVED';
    else if (newStatus === 'REJECTED') lifecycleStatus = 'REJECTED';
    else if (newStatus === 'ADDITIONAL_INFO_REQUIRED') lifecycleStatus = 'ADDITIONAL_INFO_REQUIRED';

    const updated = await referralLifecycleRepository.update(record.id, {
      lifecycleStatus,
      approvedAt: newStatus === 'APPROVED' ? now : record.approvedAt,
      updatedAt: now,
    });

    // Send status update DMs
    if (newStatus === 'APPROVED') {
      await this.dispatchLifecycleNotification({
        communityId: record.communityId,
        referralId: record.id,
        recipientUserId: record.applicantUserId,
        recipientDiscordId: record.applicantDiscordId,
        type: 'APPLICATION_APPROVED',
        title: 'Application Approved!',
        body: `Congratulations! Your application has been approved. Welcome to the community!`,
      });

      if (record.recruiterDiscordId !== 'disc_unattributed') {
        await this.dispatchLifecycleNotification({
          communityId: record.communityId,
          referralId: record.id,
          recipientUserId: record.recruiterUserId,
          recipientDiscordId: record.recruiterDiscordId,
          type: 'REFERRAL_APPROVED',
          title: 'Referral Approved',
          body: `Your referral for ${record.applicantUsernameSnapshot} has been approved! Once they join the server, your recruitment will be confirmed.`,
        });
      }
    }

    return updated;
  }

  /**
   * Authoritative confirmation of member join.
   * Only after actual join confirmation is successful recruitment credited!
   */
  async confirmMemberJoin(
    communityId: string,
    discordUserId: string,
    requestId?: string
  ): Promise<ReferralLifecycleRecord | null> {
    const list = await referralLifecycleRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'applicantDiscordId', operator: '==', value: discordUserId },
      ],
      limit: 5,
    });

    if (list.length === 0) {
      return null;
    }

    // Find the eligible referral
    const record = list.find(
      (r) => r.lifecycleStatus === 'APPROVED' || r.lifecycleStatus === 'APPLICATION_SUBMITTED'
    );

    if (!record) {
      // If already recruitment successful, return to preserve replay idempotency
      const alreadySuccess = list.find((r) => r.lifecycleStatus === 'RECRUITMENT_SUCCESSFUL');
      if (alreadySuccess) {
        return alreadySuccess;
      }
      return null;
    }

    const now = new Date().toISOString();

    // 1. Update referral record to RECRUITMENT_SUCCESSFUL
    const updated = await referralLifecycleRepository.update(record.id, {
      lifecycleStatus: 'RECRUITMENT_SUCCESSFUL',
      joinedAt: now,
      successfulRecruitmentConfirmedAt: now,
      updatedAt: now,
    });

    // 2. Increment recruiter's actual successful recruits
    let recruiterRecruitCount = 1;
    const recruiter = await recruitersRepository.getById(record.recruiterUserId);
    if (recruiter) {
      recruiterRecruitCount = (recruiter.successfulRecruits || 0) + 1;
      await recruitersRepository.update(recruiter.id, {
        successfulRecruits: recruiterRecruitCount,
      });
    }

    // 3. Welcome, Automatic Role Assignment & Channel Welcome Execution
    try {
      await welcomeOnboardingService.executeWelcomeAndOnboarding({
        communityId,
        applicantDiscordUserId: discordUserId,
        applicantUsername: record.applicantUsernameSnapshot,
        recruiterDiscordUserId: record.recruiterDiscordId,
        recruiterCode: record.recruiterCode,
        referralId: record.id,
        applicationId: record.applicationId,
        requestId,
      });
    } catch (err) {
      logger.error('[ReferralLifecycle] Error executing welcome/onboarding:', undefined, {
        error: (err as Error).message,
      });
    }

    // 4. Fulfill benefits idempotently
    if (record.recruiterUserId !== 'usr_unattributed') {
      try {
        await recruiterBenefitsService.fulfillMilestoneBenefits(
          communityId,
          record.recruiterUserId,
          record.recruiterDiscordId,
          recruiterRecruitCount,
          record.id,
          requestId
        );
      } catch (err) {
        logger.error('[ReferralLifecycle] Error fulfilling milestone benefits:', undefined, {
          error: (err as Error).message,
        });
      }
    }

    // 5. Task 9 Recruiter Record Creation & Message Dispatch
    try {
      await recruiterRecordService.processSuccessfulJoin({
        communityId,
        recruiterDiscordUserId: record.recruiterDiscordId,
        applicantDiscordUserId: discordUserId,
        applicationId: record.applicationId,
        referralId: record.id,
        recruiterCode: record.recruiterCode,
        joinedAt: now,
        requestId,
      });
    } catch (err) {
      logger.error('[ReferralLifecycle] Error processing recruiter record:', undefined, {
        error: (err as Error).message,
      });
    }

    // 5. Record Audit Logs
    await auditService.record({
      communityId,
      actorUserId: `disc_${discordUserId}`,
      actorRole: 'MEMBER',
      action: 'JOIN_CONFIRMED',
      targetType: 'referral_lifecycle',
      targetId: record.id,
      metadata: {
        applicantDiscordId: discordUserId,
        recruiterUserId: record.recruiterUserId,
      },
      requestId,
    });

    await auditService.record({
      communityId,
      actorUserId: record.recruiterUserId,
      actorRole: 'RECRUITER',
      action: 'RECRUITMENT_SUCCESSFUL',
      targetType: 'referral_lifecycle',
      targetId: record.id,
      metadata: {
        applicantDiscordId: discordUserId,
        recruiterCode: record.recruiterCode,
        newRecruitsCount: recruiterRecruitCount,
      },
      requestId,
    });

    // 5. Send Confirmation DMs
    await this.dispatchLifecycleNotification({
      communityId,
      referralId: record.id,
      recipientUserId: record.applicantUserId,
      recipientDiscordId: record.applicantDiscordId,
      type: 'JOIN_CONFIRMED',
      title: 'Welcome to the Server!',
      body: `Welcome! Your recruitment has been successfully completed.`,
    });

    if (record.recruiterDiscordId !== 'disc_unattributed') {
      await this.dispatchLifecycleNotification({
        communityId,
        referralId: record.id,
        recipientUserId: record.recruiterUserId,
        recipientDiscordId: record.recruiterDiscordId,
        type: 'RECRUITMENT_SUCCESSFUL',
        title: 'Recruitment Successfully Confirmed!',
        body: `Your recruit ${record.applicantUsernameSnapshot} has joined the community. (Total recruits: ${recruiterRecruitCount})`,
      });
    }

    return updated;
  }

  /**
   * Helper to dispatch and transparently record notification delivery state.
   */
  async dispatchLifecycleNotification(params: {
    communityId: string;
    referralId?: string;
    recipientUserId: string;
    recipientDiscordId: string;
    type: NotificationType;
    title: string;
    body: string;
  }): Promise<RecruiterNotificationHistory> {
    const now = new Date().toISOString();

    // Call real Discord notification dispatcher
    const result = await notificationService.sendDiscordDM({
      communityId: params.communityId,
      recipientDiscordId: params.recipientDiscordId,
      title: params.title,
      body: params.body,
    });

    const status = result.delivered ? 'DELIVERED' : 'FAILED';
    const failureReason = result.delivered ? undefined : result.error || 'Discord DM delivery failed';

    return recruiterNotificationHistoryRepository.create({
      communityId: params.communityId,
      recipientUserId: params.recipientUserId,
      recipientDiscordId: params.recipientDiscordId,
      relatedReferralId: params.referralId,
      type: params.type,
      channel: 'DISCORD_DM',
      title: params.title,
      body: params.body,
      status,
      deliveredAt: result.delivered ? now : undefined,
      failureReason,
      createdAt: now,
    });
  }

  /**
   * List referrals for a specific recruiter or community.
   */
  async listReferralsForRecruiter(
    communityId: string,
    recruiterUserId: string
  ): Promise<ReferralLifecycleRecord[]> {
    return referralLifecycleRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'recruiterUserId', operator: '==', value: recruiterUserId },
      ],
    });
  }

  async listReferralsForCommunity(communityId: string): Promise<ReferralLifecycleRecord[]> {
    return referralLifecycleRepository.listForTenant(communityId);
  }

  async getNotificationHistory(communityId: string): Promise<RecruiterNotificationHistory[]> {
    return recruiterNotificationHistoryRepository.listForTenant(communityId);
  }
}

export const referralLifecycleService = new ReferralLifecycleService();
