import {
  ApplicationDocument,
  ApplicationStatus,
  ApplicationAnswerDocument,
  QuestionInputType,
} from '../../shared/types/models.js';
import { UserRole } from '../../shared/types/rbac.js';
import {
  applicationsRepository,
  applicationAnswersRepository,
  recruiterCodesRepository,
  recruitersRepository,
  referralLifecycleRepository,
  usersRepository,
} from '../repositories/index.js';
import { communityQuestionsService } from './communityQuestions.service.js';
import { applicantRestrictionService } from './applicantRestriction.service.js';
import { referralLifecycleService } from './referralLifecycle.service.js';
import { welcomeOnboardingService } from './welcomeOnboarding.service.js';
import { notificationService } from './notification.service.js';
import { auditService } from './audit.service.js';
import { quotaService } from './quota.service.js';
import { logger } from '../logging/logger.js';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '../utils/errors.js';

export interface SubmitApplicationInput {
  communityId: string;
  applicantDiscordUserId: string;
  applicantUsername: string;
  applicantDisplayName?: string;
  recruiterCode?: string;
  campaignId?: string;
  formId?: string;
  formVersion?: string;
  source?: string;
  /** "How did you find us?" picked by the applicant (admin-managed list). */
  applicationSource?: { id: string; name: string; emoji?: string; detail?: string; tag?: string };
  answers: Array<{
    questionId: string;
    answerText: string;
    answerValues?: string[];
  }>;
}

export interface ReviewApplicationInput {
  applicationId: string;
  communityId: string;
  status: ApplicationStatus;
  reviewerNotes?: string;
  rejectionReason?: string;
  actorUserId: string;
  actorRole: UserRole;
  actorDiscordUserId?: string;
}

export class ApplicationWorkflowService {
  /**
   * Submits a real recruitment application adhering strictly to community questions,
   * blacklist validation, and recruiter code attribution.
   */
  async submitApplication(
    input: SubmitApplicationInput,
    requestId?: string
  ): Promise<{
    application: ApplicationDocument;
    referralCreated: boolean;
    referralId?: string;
    recruiterAttributed?: string;
    missingInformation?: string[];
  }> {
    const { communityId, applicantDiscordUserId, applicantUsername, recruiterCode, campaignId, formId, formVersion, source, answers } = input;

    if (!communityId) {
      throw new BadRequestError('communityId is required');
    }
    if (!applicantDiscordUserId || !applicantDiscordUserId.trim()) {
      throw new BadRequestError('applicantDiscordUserId (Authoritative Discord User ID) is required');
    }

    // 1. Quota check (Free-First)
    const quotaCheck = quotaService.checkQuota('applications', communityId);
    if (!quotaCheck.allowed) {
      throw new BadRequestError(quotaCheck.message || 'Application quota reached for today');
    }

    // 2. Blacklist validation
    const riskCheck = await applicantRestrictionService.checkApplicantRisk(
      communityId,
      applicantDiscordUserId,
      applicantUsername
    );

    if (riskCheck.riskStatus === 'BLACKLISTED' || riskCheck.riskStatus === 'DO_NOT_REAPPLY') {
      await auditService.record({
        communityId,
        actorUserId: applicantDiscordUserId,
        actorRole: 'APPLICANT',
        action: 'BLACKLIST_MATCHED',
        targetType: 'applicant_restriction',
        targetId: applicantDiscordUserId,
        metadata: {
          discordUserId: applicantDiscordUserId,
          riskStatus: riskCheck.riskStatus,
          alert: riskCheck.alertBanner,
        },
        requestId,
      });

      throw new ForbiddenError(
        'You can’t apply to this server right now. If you think this is a mistake, please contact the server staff.'
      );
    }

    // 2b. Blacklist by name or in-game name (also checks the answers, where people give their game name).
    {
      const { guardApplicant } = await import('./blacklist/blacklistGuard.service.js');
      try {
        await guardApplicant(communityId, { id: applicantDiscordUserId, username: applicantUsername, displayName: (input as any).applicantDisplayName }, ((answers as any[]) || []).map((a: any) => String(a?.answerText ?? a?.answer ?? '')));
      } catch (e: any) { if (e?.blacklisted) throw new ForbiddenError(e.message); throw e; }
    }

    // 3. Question validation
    const configuredQuestions = await communityQuestionsService.listApplicationQuestions(communityId);
    if (configuredQuestions.length === 0) {
      throw new BadRequestError('APPLICATION_QUESTIONS_NOT_CONFIGURED: This community has not yet configured recruitment questions.');
    }

    const missingInformation: string[] = [];
    const processedAnswers: Array<{
      questionId: string;
      questionText: string;
      answerText: string;
      answerValues?: string[];
    }> = [];

    for (const q of configuredQuestions) {
      const submittedAns = (answers || []).find((a) => a.questionId === q.id);
      const answerText = submittedAns?.answerText?.trim() || '';

      if (q.required && !answerText) {
        missingInformation.push(`Required question unanswered: "${q.questionText}"`);
      }

      processedAnswers.push({
        questionId: q.id,
        questionText: q.questionText,
        answerText: answerText || 'N/A',
        answerValues: submittedAns?.answerValues,
      });
    }

    // If required questions are missing, reject submission
    if (missingInformation.length > 0) {
      throw new BadRequestError(
        `Incomplete application: ${missingInformation.join('; ')}`
      );
    }

    // 4. Validate Recruiter Code (if provided)
    let validatedRecruiterCode: string | undefined = undefined;
    let recruiterDiscordUserId: string | undefined = undefined;
    let referralId: string | undefined = undefined;

    if (recruiterCode && recruiterCode.trim()) {
      const codeClean = recruiterCode.toUpperCase().trim();

      // Check existence across database
      const allMatchingCodes = await recruiterCodesRepository.list({
        where: [{ field: 'code', operator: '==', value: codeClean }],
        limit: 5,
      });

      if (allMatchingCodes.length === 0) {
        throw new BadRequestError(`INVALID_RECRUITER_CODE: Recruiter code "${codeClean}" does not exist.`);
      }

      const codeDoc = allMatchingCodes.find((c) => c.communityId === communityId);
      if (!codeDoc) {
        throw new BadRequestError(`WRONG_COMMUNITY: Recruiter code "${codeClean}" belongs to a different community.`);
      }

      if (codeDoc.status === 'REVOKED') {
        throw new BadRequestError(`REVOKED_CODE: Recruiter code "${codeClean}" has been revoked.`);
      }

      if (codeDoc.status === 'INACTIVE' || codeDoc.isActive === false) {
        throw new BadRequestError(`INACTIVE_CODE: Recruiter code "${codeClean}" is currently inactive.`);
      }

      let recruiterDiscordUserIdResolved = '';
      const recruiter = await recruitersRepository.getById(codeDoc.recruiterUserId);
      if (recruiter) {
        if (recruiter.isActive === false) {
          throw new BadRequestError('RECRUITER_INACTIVE: The recruiter associated with this code is currently inactive.');
        }
        recruiterDiscordUserIdResolved = recruiter.discordId;
      } else {
        const user = await usersRepository.getById(codeDoc.recruiterUserId);
        if (user) {
          recruiterDiscordUserIdResolved = user.discordId || '';
        }
      }

      // Prevent switching recruiters if referral is already established
      const existingReferrals = await referralLifecycleRepository.list({
        where: [
          { field: 'communityId', operator: '==', value: communityId },
          { field: 'applicantDiscordId', operator: '==', value: applicantDiscordUserId },
        ],
        limit: 1,
      });

      if (existingReferrals.length > 0) {
        const existingRef = existingReferrals[0];
        if (existingRef.recruiterCode && existingRef.recruiterCode !== codeClean) {
          throw new BadRequestError('REFERRAL_IMMUTABLE: Applicant is already attributed to an existing recruiter referral.');
        }
      }

      // Update code usage stats
      const now = new Date().toISOString();
      await recruiterCodesRepository.update(codeDoc.id, {
        totalUses: (codeDoc.totalUses || 0) + 1,
        lastUsedAt: now,
        updatedAt: now,
      });
      void import('./recruitment/recruiterBoards.service.js').then(({ recruiterBoards }) => recruiterBoards.syncCode(codeDoc.communityId, codeDoc.id)).catch(() => undefined);

      validatedRecruiterCode = codeClean;
      recruiterDiscordUserId = recruiterDiscordUserIdResolved || codeDoc.recruiterUserId;
    }

    // 5. Check for active application or reapplication cooldown
    const existingApps = await applicationsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'applicantDiscordId', operator: '==', value: applicantDiscordUserId },
      ],
      limit: 10,
    });

    const activeApp = existingApps.find((a) =>
      [
        'SUBMITTED',
        'UNDER_REVIEW',
        'INTERVIEW_SCHEDULED',
        'INTERVIEW_IN_PROGRESS',
        'INTERVIEW_COMPLETED',
        'ADDITIONAL_INFO_REQUIRED',
        'APPROVED',
        'JOIN_PENDING',
      ].includes(a.status)
    );

    if (activeApp) {
      throw new BadRequestError(
        'ACTIVE_APPLICATION_EXISTS: An active application is already in progress for this community.'
      );
    }

    const joinedApp = existingApps.find((a) => a.status === 'JOINED');
    if (joinedApp) {
      throw new BadRequestError('ALREADY_MEMBER: Applicant has already joined this community.');
    }

    const welcomeConfig = await welcomeOnboardingService.getWelcomeConfig(communityId);
    if (welcomeConfig.reapplicationCooldownHours && welcomeConfig.reapplicationCooldownHours > 0) {
      const rejectedApps = existingApps
        .filter((a) => a.status === 'REJECTED')
        .sort(
          (a, b) =>
            new Date(b.reviewedAt || b.updatedAt || 0).getTime() -
            new Date(a.reviewedAt || a.updatedAt || 0).getTime()
        );

      if (rejectedApps.length > 0) {
        const latestRejected = rejectedApps[0];
        const lastDecisionTime = new Date(latestRejected.reviewedAt || latestRejected.updatedAt).getTime();
        const elapsedHours = (Date.now() - lastDecisionTime) / (3600 * 1000);
        if (elapsedHours < welcomeConfig.reapplicationCooldownHours) {
          const hoursRemaining = Math.ceil(welcomeConfig.reapplicationCooldownHours - elapsedHours);
          throw new BadRequestError(
            `REAPPLICATION_COOLDOWN_ACTIVE: You must wait ${hoursRemaining} hour(s) before reapplying.`
          );
        }
      }
    }

    const now = new Date().toISOString();

    // 6. Create authoritative Application document
    const createdApp = await applicationsRepository.create({
      communityId,
      applicantUserId: `usr_${applicantDiscordUserId}`,
      applicantDiscordUserId,
      applicantDiscordId: applicantDiscordUserId,
      applicantUsernameSnapshot: applicantUsername || 'DiscordApplicant',
      applicantUsername: applicantUsername || 'DiscordApplicant',
      applicantDisplayNameSnapshot: input.applicantDisplayName,
      recruiterCode: validatedRecruiterCode,
      recruiterCodeUsed: validatedRecruiterCode,
      recruiterDiscordUserId,
      campaignId,
      formId,
      formVersion,
      source,
      applicationSource: input.applicationSource,
      applicationSourceId: input.applicationSource?.id,
      tags: input.applicationSource?.tag ? [input.applicationSource.tag] : undefined,
      status: 'SUBMITTED',
      questions: configuredQuestions.map((q) => ({
        questionId: q.id,
        questionText: q.questionText,
        questionType: q.type,
        isRequired: q.required,
        options: q.options,
      })),
      answers: processedAnswers,
      missingInformation: missingInformation.length > 0 ? missingInformation : undefined,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Post to the staff review channel and send the applicant the "received" message.
    import('./recruitment/discordRecruitment.service.js')
      .then(({ discordRecruitment }) => discordRecruitment.onSubmitted(createdApp.id))
      .catch((err) => logger.warn(`[Recruitment] onSubmitted failed: ${err?.message}`));

    // Private review room in Discord (when enabled in Recruitment > Review rooms).
    import('./toolkit/reviewRooms.service.js')
      .then(({ reviewRooms }) => reviewRooms.openForApplication(createdApp.id))
      .catch((err) => logger.warn(`[ReviewRooms] open failed: ${err?.message}`));

    // Tell reviewers on Discord right away (free, always on).
    import('./reviewReminders.service.js')
      .then(({ reviewReminders }) =>
        reviewReminders.notifyNewApplication({
          communityId,
          applicationId: createdApp.id,
          applicantName: input.applicantDisplayName || applicantUsername || 'New applicant',
        })
      )
      .catch(() => undefined);

    // Optional extra: "review this application" event on connected reviewers' Google Calendars.
    import('../integrations/google/calendar.service.js')
      .then(({ googleCalendarService }) =>
        googleCalendarService.notifyNewApplication({
          communityId,
          applicationId: createdApp.id,
          applicantName: input.applicantDisplayName || applicantUsername || 'New applicant',
          dashboardUrl: `${(process.env.APP_URL || 'https://community-manager-bot-720940628402.asia-southeast1.run.app').replace(/\/$/, '')}/dashboard`,
        })
      )
      .catch(() => undefined);

    // Save individual answers
    for (const ans of processedAnswers) {
      await applicationAnswersRepository.create({
        applicationId: createdApp.id,
        questionId: ans.questionId,
        questionText: ans.questionText,
        answerText: ans.answerText,
        answerValues: ans.answerValues,
        submittedAt: now,
      });
    }

    // 6. Create referral record if recruiter code was valid
    if (validatedRecruiterCode) {
      try {
        const referral = await referralLifecycleService.recordReferralSubmission(
          {
            communityId,
            recruiterCode: validatedRecruiterCode,
            applicantUserId: createdApp.applicantUserId,
            applicantDiscordId: applicantDiscordUserId,
            applicantUsername: createdApp.applicantUsername,
            applicationId: createdApp.id,
          },
          requestId
        );
        referralId = referral.id;
        await applicationsRepository.update(createdApp.id, { referralId: referral.id });
      } catch (err) {
        logger.error('[ApplicationWorkflow] Error linking referral:', undefined, {
          error: (err as Error).message,
        });
      }
    }

    quotaService.consumeQuota('applications', communityId);

    // 7. Write Audit Log
    await auditService.record({
      communityId,
      actorUserId: createdApp.applicantUserId,
      actorRole: 'APPLICANT',
      action: 'APPLICATION_SUBMITTED',
      targetType: 'application',
      targetId: createdApp.id,
      metadata: {
        applicantDiscordUserId,
        recruiterCode: validatedRecruiterCode,
        answersCount: processedAnswers.length,
      },
      requestId,
    });

    // 8. Event-driven Notification dispatch
    try {
      const { AutomationEventBusService } = await import('./automation.service.js');
      AutomationEventBusService.publish({
        eventType: 'APPLICATION_SUBMITTED',
        communityId,
        actorDiscordUserId: applicantDiscordUserId,
        targetDiscordUserId: applicantDiscordUserId,
        resourceType: 'APPLICATION',
        resourceId: createdApp.id,
        metadata: {
          applicantUsername: createdApp.applicantUsername,
          applicantDisplayName: input.applicantDisplayName,
          status: createdApp.status,
          recruiterCode: createdApp.recruiterCode,
        },
      }).catch((err: any) => logger.warn(`[ApplicationWorkflow] automation publish failed: ${err?.message}`));
    } catch (err: any) {
      logger.error(`[ApplicationWorkflow] Error publishing APPLICATION_SUBMITTED: ${err.message}`);
    }

    await notificationService.send({
      communityId,
      recipientUserId: createdApp.applicantUserId,
      recipientDiscordId: applicantDiscordUserId,
      type: 'APPLICATION_RECEIVED',
      channel: 'IN_APP',
      title: 'Application Received by {{recruiterName}}',
      body: 'Hi {{applicantName}},\n\n{{recruiterName}} has received your recruitment application (ID: {{applicationId}}).\nStatus: SUBMITTED.',
      templateVariables: {
        applicantName: createdApp.applicantUsername,
        applicationId: createdApp.id,
        recruiterCode: validatedRecruiterCode || 'None',
        communityName: communityId,
        applicationStatus: 'SUBMITTED',
      },
    });

    return {
      application: { ...createdApp, referralId },
      referralCreated: !!validatedRecruiterCode,
      referralId,
      recruiterAttributed: recruiterDiscordUserId,
    };
  }

  /**
   * Reviews an application with human authorization.
   * APPROVE -> Sets status to JOIN_PENDING (or APPROVED).
   * Note: JOINED is ONLY set when real GUILD_MEMBER_ADD event occurs!
   */
  async reviewApplication(
    input: ReviewApplicationInput,
    requestId?: string
  ): Promise<ApplicationDocument> {
    const {
      applicationId,
      communityId,
      status,
      reviewerNotes,
      rejectionReason,
      actorUserId,
      actorRole,
    } = input;

    const app = await applicationsRepository.getById(applicationId);
    if (!app || app.communityId !== communityId) {
      throw new NotFoundError(`APPLICATION_NOT_FOUND: Application ${applicationId} not found in this community.`);
    }

    if (app.status === 'APPROVED' || app.status === 'JOIN_PENDING' || app.status === 'JOINED') {
      if (status === 'APPROVED') {
        throw new BadRequestError('APPLICATION_ALREADY_REVIEWED: Application is already approved.');
      }
    }

    const now = new Date().toISOString();

    // Determine final status
    let finalStatus: ApplicationStatus = status;
    let approvalTimestamp: string | undefined = undefined;

    if (status === 'APPROVED') {
      finalStatus = 'JOIN_PENDING';
      approvalTimestamp = now;
    }

    const updated = await applicationsRepository.update(applicationId, {
      status: finalStatus,
      reviewerNotes: reviewerNotes || app.reviewerNotes,
      notesSummary: reviewerNotes || app.notesSummary,
      rejectionReason: status === 'REJECTED' ? (rejectionReason || 'Application does not meet community criteria') : undefined,
      approvalTimestamp,
      reviewedAt: now,
      reviewedBy: actorUserId,
      reviewedByUserId: actorUserId,
      updatedAt: now,
    });

    // Propagate to referral lifecycle
    try {
      if (['APPROVED', 'REJECTED', 'UNDER_REVIEW', 'ADDITIONAL_INFORMATION_REQUIRED', 'ADDITIONAL_INFO_REQUIRED'].includes(status)) {
        const referralStatus = status === 'APPROVED' ? 'APPROVED' : status === 'REJECTED' ? 'REJECTED' : 'UNDER_REVIEW';
        await referralLifecycleService.updateApplicationStatus(
          applicationId,
          referralStatus as any,
          actorUserId,
          actorRole,
          requestId
        );
      }
    } catch {
      // Non-blocking fallback
    }

    // Write Audit Log
    const auditAction = status === 'APPROVED' ? 'APPLICATION_APPROVED' : status === 'REJECTED' ? 'APPLICATION_REJECTED' : 'APPLICATION_STATUS_CHANGED';
    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: auditAction,
      targetType: 'application',
      targetId: applicationId,
      metadata: {
        newStatus: finalStatus,
        reviewerNotes,
        rejectionReason,
      },
      requestId,
    });

    // Update the Discord review post, message the applicant with the server's own text, announce.
    if (status === 'APPROVED' || status === 'REJECTED') {
      import('./recruitment/discordRecruitment.service.js')
        .then(({ discordRecruitment }) => discordRecruitment.onDecided(applicationId, status, input.actorDiscordUserId || String(actorUserId || '').replace(/^usr_/, ''), rejectionReason))
        .catch((err) => logger.warn(`[Recruitment] onDecided failed: ${err?.message}`));
    }

    // Send notifications
    if (status === 'APPROVED') {
      await notificationService.send({
        communityId,
        recipientUserId: app.applicantUserId,
        recipientDiscordId: app.applicantDiscordUserId || app.applicantDiscordId,
        type: 'APPLICATION_APPROVED',
        channel: 'IN_APP',
        title: 'Application Approved! (Join Pending)',
        body: 'Hi {{applicantName}},\n\nYour application has been approved by {{recruiterName}}! Please join our Discord server to complete your onboarding verification.',
        templateVariables: {
          applicantName: app.applicantUsernameSnapshot || app.applicantUsername,
          applicationId: app.id,
          applicationStatus: 'JOIN_PENDING',
        },
      });
    } else if (status === 'REJECTED') {
      await notificationService.send({
        communityId,
        recipientUserId: app.applicantUserId,
        recipientDiscordId: app.applicantDiscordUserId || app.applicantDiscordId,
        type: 'APPLICATION_REJECTED',
        channel: 'IN_APP',
        title: 'Application Status Update',
        body: `Hi {{applicantName}},\n\nThank you for applying. At this time, your application was not approved.\nReason: ${rejectionReason || 'Criteria not met.'}`,
        templateVariables: {
          applicantName: app.applicantUsernameSnapshot || app.applicantUsername,
          applicationId: app.id,
          applicationStatus: 'REJECTED',
        },
      });
    }

    // Role rules + close the review room.
    if (status === 'APPROVED' || status === 'REJECTED') {
      import('./toolkit/reviewRooms.service.js')
        .then(({ reviewRooms }) => reviewRooms.closeForApplication(app.id, status as any, String(input.actorDiscordUserId || actorUserId).replace(/^usr_/, '')))
        .catch((err) => logger.warn(`[ReviewRooms] close failed: ${err?.message}`));
    }
    if (status === 'APPROVED') {
      import('./toolkit/roleRules.service.js')
        .then(({ roleRules }) => roleRules.applyForApplication(app.id))
        .catch((err) => logger.warn(`[RoleRules] apply failed: ${err?.message}`));
    }

    try {
      if (status === 'APPROVED' || status === 'REJECTED') {
        const { AutomationEventBusService } = await import('./automation.service.js');
        AutomationEventBusService.publish({
          eventType: status === 'APPROVED' ? 'APPLICATION_APPROVED' : 'APPLICATION_REJECTED',
          communityId,
          actorDiscordUserId: app.applicantDiscordUserId || app.applicantDiscordId,
          targetDiscordUserId: app.applicantDiscordUserId || app.applicantDiscordId,
          resourceType: 'APPLICATION',
          resourceId: app.id,
          metadata: {
            applicantUsername: app.applicantUsernameSnapshot || app.applicantUsername,
            status: finalStatus,
            rejectionReason: status === 'REJECTED' ? rejectionReason : undefined,
            reviewedBy: actorUserId,
          },
        }).catch((err: any) => logger.warn(`[ApplicationWorkflow] automation publish failed: ${err?.message}`));
      }
    } catch (err: any) {
      logger.error(`[ApplicationWorkflow] Error publishing application review event: ${err.message}`);
    }

    return updated;
  }

  /**
   * Confirms actual Discord Guild Membership and transitions application to JOINED.
   * Called strictly upon real GUILD_MEMBER_ADD event!
   */
  async confirmDiscordJoin(
    communityId: string,
    discordUserId: string,
    requestId?: string
  ): Promise<ApplicationDocument | null> {
    const list = await applicationsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'applicantDiscordId', operator: '==', value: discordUserId },
      ],
      limit: 5,
    });

    // Find application in approved / join_pending state or already joined
    const targetApp = list.find(
      (a) => a.status === 'JOIN_PENDING' || a.status === 'APPROVED' || a.status === 'SUBMITTED' || a.status === 'JOINED'
    );

    if (!targetApp) {
      return null;
    }

    // Idempotency: if already JOINED, return as-is
    if (targetApp.status === 'JOINED') {
      return targetApp;
    }

    const now = new Date().toISOString();
    const updated = await applicationsRepository.update(targetApp.id, {
      status: 'JOINED',
      joinConfirmedAt: now,
      successfulAt: now,
      updatedAt: now,
    });

    await auditService.record({
      communityId,
      actorUserId: `disc_${discordUserId}`,
      actorRole: 'MEMBER',
      action: 'JOIN_CONFIRMED',
      targetType: 'application',
      targetId: targetApp.id,
      metadata: {
        applicantDiscordUserId: discordUserId,
        confirmedAt: now,
      },
      requestId,
    });

    // TASK 51: Execute Durable Recruitment-to-Member Handoff
    try {
      const { memberLifecycleService } = await import('./memberLifecycle.service.js');
      const handoffResult = await memberLifecycleService.executeHandoff({
        communityId,
        applicationId: targetApp.id,
        discordUserId,
        requestId,
      });
      if (handoffResult?.handoff?.id) {
        await applicationsRepository.update(targetApp.id, {
          handoffId: handoffResult.handoff.id,
        });
        updated.handoffId = handoffResult.handoff.id;
      }
    } catch (err: any) {
      logger.error('[ApplicationWorkflow] Error executing member lifecycle handoff:', undefined, {
        error: err.message,
      });
    }

    try {
      const { AutomationEventBusService } = await import('./automation.service.js');
      AutomationEventBusService.publish({
        eventType: 'RECRUITMENT_SUCCESSFUL',
        communityId,
        actorDiscordUserId: discordUserId,
        targetDiscordUserId: discordUserId,
        resourceType: 'APPLICATION',
        resourceId: targetApp.id,
        metadata: {
          applicantUsername: targetApp.applicantUsername || targetApp.applicantUsernameSnapshot || '',
          recruiterCode: targetApp.recruiterCode,
          recruiterDiscordUserId: targetApp.recruiterDiscordUserId,
          status: 'JOINED',
        },
      }).catch((err: any) => logger.warn(`[ApplicationWorkflow] automation publish failed: ${err?.message}`));
    } catch (err: any) {
      logger.error(`[ApplicationWorkflow] Error publishing RECRUITMENT_SUCCESSFUL: ${err.message}`);
    }

    return updated;
  }
}

export const applicationWorkflowService = new ApplicationWorkflowService();
