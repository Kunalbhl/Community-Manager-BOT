import { Request, Response, NextFunction } from 'express';
import {
  applicationsRepository,
  applicationAnswersRepository,
  versionedApplicationFormsRepository,
  interviewsRepository,
  discordMembersRepository,
  communitiesRepository,
} from '../repositories/index.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { config } from '../config/env.js';
import { ApplicationDocument } from '../../shared/types/models.js';
import { ForbiddenError, NotFoundError, BadRequestError } from '../utils/errors.js';
import { isPlatformOwner } from '../security/rbac.js';
import { quotaService } from '../services/quota.service.js';
import { notificationService } from '../services/notification.service.js';
import { applicantRestrictionService } from '../services/applicantRestriction.service.js';
import { referralLifecycleService } from '../services/referralLifecycle.service.js';
import { aiReviewService } from '../services/aiReview.service.js';
import { applicationWorkflowService } from '../services/applicationWorkflow.service.js';
import { auditService } from '../services/audit.service.js';

export async function listApplications(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      throw new ForbiddenError('Authentication required');
    }

    // Determine target community
    const targetCommunityId = (req.query.communityId as string) || user.communityId || (req.header('x-community-id') as string);

    if (!targetCommunityId && !isPlatformOwner(user)) {
      throw new BadRequestError('Community ID is required', 'COMMUNITY_CONTEXT_REQUIRED');
    }

    // Enforce Tenant Isolation: non-platform users cannot query other communities
    if (!isPlatformOwner(user) && user.communityId && targetCommunityId !== user.communityId) {
      throw new ForbiddenError('Cross-community data access is strictly prohibited');
    }

    let applications: ApplicationDocument[] = [];

    if (targetCommunityId) {
      applications = await applicationsRepository.listForTenant(targetCommunityId);
    } else if (isPlatformOwner(user)) {
      applications = await applicationsRepository.list();
    }

    // Applicant least privilege: applicants can ONLY see their own applications
    if (user.role === 'APPLICANT') {
      applications = applications.filter((app) => app.applicantUserId === user.userId);
    }

    res.json({
      success: true,
      data: applications,
      count: applications.length,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      throw new ForbiddenError('Authentication required');
    }

    const { id } = req.params;
    const application = await applicationsRepository.getById(id);

    if (!application) {
      throw new NotFoundError(`Application ${id} not found`);
    }

    // Tenant Isolation
    if (!isPlatformOwner(user) && user.communityId && application.communityId !== user.communityId) {
      throw new ForbiddenError('Cross-community data access is strictly prohibited');
    }

    // Applicant Least Privilege
    if (user.role === 'APPLICANT' && application.applicantUserId !== user.userId) {
      throw new ForbiddenError('You can only view your own application');
    }

    // Fetch answers
    const answers = await applicationAnswersRepository.list({
      where: [{ field: 'applicationId', operator: '==', value: id }],
    });

    res.json({
      success: true,
      data: {
        ...application,
        answers,
      },
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

// Rate limiting tracker
const candidateRequestTracker = new Map<string, { count: number; windowStart: number }>();

function applyCandidateRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const tracking = candidateRequestTracker.get(key);
  if (!tracking || (now - tracking.windowStart > windowMs)) {
    candidateRequestTracker.set(key, { count: 1, windowStart: now });
    return;
  }
  if (tracking.count >= limit) {
    throw new BadRequestError('RATE_LIMIT_EXCEEDED: Too many rapid requests. Please slow down.');
  }
  tracking.count += 1;
}

export async function getPublicForm(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId } = req.params;
    if (!communityId) {
      throw new BadRequestError('communityId is required');
    }

    // Rate-limiting for public access
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown-ip';
    applyCandidateRateLimit(`form-${communityId}-${clientIp}`, 60, 60 * 1000); // 60 requests/min

    const forms = await versionedApplicationFormsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'status', operator: '==', value: 'PUBLISHED' },
      ],
      limit: 1,
    });

    if (forms.length > 0) {
      return res.json({ success: true, data: forms[0] });
    }

    // Graceful default fallback
    const defaultForm = {
      id: 'form_default',
      communityId,
      name: 'Standard Membership Application',
      description: 'Tell us about yourself and join our recruitment network!',
      version: '1.0',
      status: 'PUBLISHED',
      questions: [
        {
          id: 'q_about',
          label: 'Tell us briefly about yourself',
          type: 'SHORT_TEXT',
          required: true,
          order: 1,
        },
        {
          id: 'q_reason',
          label: 'Why do you want to join our community?',
          type: 'LONG_TEXT',
          required: true,
          order: 2,
        },
        {
          id: 'q_experience',
          label: 'Do you have experience in web3/gaming/communities?',
          type: 'YES_NO',
          required: false,
          order: 3,
        },
        {
          id: 'q_source',
          label: 'How did you hear about us?',
          type: 'SINGLE_SELECT',
          required: false,
          options: ['Discord Search', 'Twitter/X', 'A Friend', 'Other'],
          order: 4,
        },
      ],
    };

    return res.json({ success: true, data: defaultForm });
  } catch (error) {
    next(error);
  }
}

export async function getDraftApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId, applicantDiscordId } = req.query as { communityId: string; applicantDiscordId: string };
    if (!communityId || !applicantDiscordId) {
      throw new BadRequestError('communityId and applicantDiscordId are required');
    }

    // Ownership check (applicant can only see their own drafts)
    const user = req.user;
    if (user && user.role === 'APPLICANT' && user.userId !== applicantDiscordId) {
      throw new ForbiddenError('You can only view your own drafts');
    }

    const drafts = await applicationsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'applicantDiscordId', operator: '==', value: applicantDiscordId },
        { field: 'status', operator: '==', value: 'DRAFT' },
      ],
      limit: 1,
    });

    if (drafts.length === 0) {
      return res.json({ success: true, data: null });
    }

    res.json({ success: true, data: drafts[0] });
  } catch (error) {
    next(error);
  }
}

export async function saveDraftApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const {
      communityId,
      applicantDiscordId,
      applicantUsername,
      answers,
      campaignId,
      formId,
      formVersion,
      recruiterCodeUsed,
      source,
    } = req.body;

    if (!communityId || !applicantDiscordId) {
      throw new BadRequestError('communityId and applicantDiscordId are required to save draft');
    }

    // Rate-limiting for autosave (to protect DB from endless spam)
    applyCandidateRateLimit(`draft-${communityId}-${applicantDiscordId}`, 100, 60 * 1000); // 100 per min

    // Validate if there is an active application that is NOT a draft
    const existing = await applicationsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'applicantDiscordId', operator: '==', value: applicantDiscordId },
      ],
    });

    const activeApp = existing.find((a) => a.status !== 'DRAFT' && a.status !== 'REJECTED' && a.status !== 'WITHDRAWN' && a.status !== 'CLOSED');
    if (activeApp) {
      throw new BadRequestError('ACTIVE_APPLICATION_EXISTS: You already have a submitted or active application in progress.');
    }

    // Find if we have a draft already
    const existingDraft = existing.find((a) => a.status === 'DRAFT');
    const now = new Date().toISOString();

    let draftDoc;
    if (existingDraft) {
      draftDoc = await applicationsRepository.update(existingDraft.id, {
        answers,
        campaignId,
        formId,
        formVersion,
        recruiterCodeUsed,
        source,
        updatedAt: now,
      });
    } else {
      draftDoc = await applicationsRepository.create({
        communityId,
        applicantDiscordId,
        applicantDiscordUserId: applicantDiscordId,
        applicantUserId: `usr_${applicantDiscordId}`,
        applicantUsername: applicantUsername || 'DiscordApplicant',
        applicantUsernameSnapshot: applicantUsername || 'DiscordApplicant',
        status: 'DRAFT',
        answers,
        campaignId,
        formId,
        formVersion,
        recruiterCodeUsed,
        source,
        submittedAt: '',
        createdAt: now,
        updatedAt: now,
      });

      await auditService.record({
        communityId,
        actorUserId: `usr_${applicantDiscordId}`,
        actorRole: 'APPLICANT',
        action: 'APPLICATION_DRAFT_CREATED' as any,
        targetType: 'application',
        targetId: draftDoc.id,
        metadata: { applicantDiscordId },
        requestId: req.id,
      });
    }

    res.json({ success: true, data: draftDoc, message: 'Draft saved successfully' });
  } catch (error) {
    next(error);
  }
}

export async function submitApplication(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    const {
      communityId,
      applicantDiscordId,
      applicantUsername,
      recruiterCodeUsed,
      campaignId,
      formId,
      formVersion,
      source,
      answers,
    } = req.body;

    const targetCommunityId = communityId || user?.communityId;
    const targetDiscordId = applicantDiscordId || user?.userId;
    const targetUsername = applicantUsername || (user as any)?.username || 'Anonymous Applicant';

    if (!targetCommunityId) {
      throw new BadRequestError('Target communityId is required');
    }
    if (!targetDiscordId) {
      throw new BadRequestError('applicantDiscordId is required');
    }

    // Rate-limiting for submission
    applyCandidateRateLimit(`submit-${targetCommunityId}-${targetDiscordId}`, 10, 60 * 1000); // 10 per min

    // If an existing draft exists, let's delete it so we do not have stale drafts lying around
    const existing = await applicationsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: targetCommunityId },
        { field: 'applicantDiscordId', operator: '==', value: targetDiscordId },
      ],
    });

    const draft = existing.find((a) => a.status === 'DRAFT');

    // Run applicationWorkflowService to submit authoritatively
    const submissionResult = await applicationWorkflowService.submitApplication({
      communityId: targetCommunityId,
      applicantDiscordUserId: targetDiscordId,
      applicantUsername: targetUsername,
      recruiterCode: recruiterCodeUsed,
      campaignId,
      formId,
      formVersion,
      source,
      answers,
    }, req.id);

    // Delete the temporary draft if it exists
    if (draft) {
      try {
        await applicationsRepository.delete(draft.id);
      } catch {
        // Safe fallback
      }
    }

    res.status(201).json({
      success: true,
      data: submissionResult.application,
      message: 'Application submitted successfully',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCandidateInterviews(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params; // Application ID
    const application = await applicationsRepository.getById(id);
    if (!application) {
      throw new NotFoundError(`Application ${id} not found`);
    }

    // Ownership check (candidate or recruiter/admin with community permission)
    const user = req.user;
    if (user && user.role === 'APPLICANT' && application.applicantDiscordId !== user.userId) {
      throw new ForbiddenError('You can only view interviews for your own application');
    }

    const interviews = await interviewsRepository.list({
      where: [{ field: 'applicationId', operator: '==', value: id }],
    });

    // Security: Redact private recruiter/admin notes, transcript summaries, and internal metrics before serving to applicant
    const sanitizedInterviews = interviews.map((iv) => {
      const { notes, transcriptSummary, sentimentNotes, ...rest } = iv as any;
      return rest;
    });

    res.json({ success: true, data: sanitizedInterviews });
  } catch (error) {
    next(error);
  }
}

export async function submitAdditionalInfo(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { answers } = req.body; // Array of key-value additional info

    if (!answers || !Array.isArray(answers)) {
      throw new BadRequestError('answers array is required');
    }

    const application = await applicationsRepository.getById(id);
    if (!application) {
      throw new NotFoundError(`Application ${id} not found`);
    }

    // Ownership check
    const user = req.user;
    if (user && user.role === 'APPLICANT' && application.applicantDiscordId !== user.userId) {
      throw new ForbiddenError('You can only update additional info on your own application');
    }

    // Ensure state permits updating (e.g. ADDITIONAL_INFORMATION_REQUIRED or ADDITIONAL_INFO_REQUIRED)
    if (!['ADDITIONAL_INFORMATION_REQUIRED', 'ADDITIONAL_INFO_REQUIRED', 'SUBMITTED', 'UNDER_REVIEW'].includes(application.status)) {
      throw new BadRequestError(`Cannot submit additional info. Current application status is ${application.status}`);
    }

    // Save answers
    const mergedAnswers = [...(application.answers || [])];
    for (const addAns of answers) {
      const existingIdx = mergedAnswers.findIndex((a) => a.questionId === addAns.questionId);
      if (existingIdx !== -1) {
        mergedAnswers[existingIdx].answerText = addAns.answerText;
      } else {
        mergedAnswers.push({
          questionId: addAns.questionId || `add_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          questionText: addAns.questionText || 'Additional Information',
          answerText: addAns.answerText || '',
        });
      }
    }

    // Transition status back to SUBMITTED or UNDER_REVIEW so recruiters are notified
    const updatedStatus = 'SUBMITTED';
    const now = new Date().toISOString();

    const updated = await applicationsRepository.update(id, {
      answers: mergedAnswers,
      status: updatedStatus,
      updatedAt: now,
    });

    // Record audit log
    await auditService.record({
      communityId: application.communityId,
      actorUserId: user?.userId || application.applicantUserId,
      actorRole: 'APPLICANT',
      action: 'CANDIDATE_ADDITIONAL_INFO_SUBMITTED' as any,
      targetType: 'application',
      targetId: id,
      metadata: { answersCount: answers.length },
      requestId: req.id,
    });

    res.json({
      success: true,
      data: updated,
      message: 'Additional information submitted successfully',
    });
  } catch (error) {
    next(error);
  }
}

export async function simulateDiscordJoin(req: Request, res: Response, next: NextFunction) {
  try {
    if (config.APP_RUNTIME_MODE !== 'DEVELOPMENT_SIMULATION') {
      throw new ForbiddenError('Simulation endpoints are strictly disabled in production and non-simulation runtime modes.', 'SIMULATION_DISABLED');
    }

    const { id } = req.params;
    const application = await applicationsRepository.getById(id);
    if (!application) {
      throw new NotFoundError(`Application ${id} not found`);
    }

    // Ensure approved / pending state
    if (!['APPROVED', 'JOIN_PENDING', 'JOIN_VERIFICATION_PENDING'].includes(application.status)) {
      throw new BadRequestError(`Discord join verification requires an approved application. Current status is: ${application.status}`);
    }

    const communityId = application.communityId;
    const discordUserId = application.applicantDiscordId;

    if (!discordUserId) {
      throw new BadRequestError('Applicant has no Discord ID associated with their application');
    }

    // Perform authoritative, non-simulated check
    let hasJoined = false;
    let verificationMethod = '';
    let discordError = '';

    // 1. Try to fetch from real Discord service if connected
    if (discordService.isConnected()) {
      try {
        const community = await communitiesRepository.getById(communityId);
        const guildId = community?.guildId || community?.discordGuildId;
        if (guildId) {
          const client = discordService['client'];
          const guild = await client?.guilds.fetch(guildId);
          if (guild) {
            try {
              const member = await guild.members.fetch(discordUserId);
              if (member) {
                hasJoined = true;
                verificationMethod = 'DISCORD_REAL_API';
              }
            } catch (err: any) {
              if (err.code === 10007) { // Unknown Member
                hasJoined = false;
              } else {
                discordError = err.message;
              }
            }
          } else {
            discordError = 'BOT_NOT_IN_GUILD';
          }
        } else {
          discordError = 'COMMUNITY_GUILD_NOT_LINKED';
        }
      } catch (err: any) {
        discordError = err.message;
      }
    }

    // 2. Update application and process successful join IF joined
    if (hasJoined) {
      const result = await applicationWorkflowService.confirmDiscordJoin(communityId, discordUserId, req.id);
      res.json({
        success: true,
        joined: true,
        verificationMethod,
        data: result,
        message: 'Successfully verified Discord server join and initiated onboarding',
      });
    } else {
      let warningState = 'USER_NOT_IN_GUILD';
      let details = 'The user has not joined the Discord server yet.';

      if (!discordService.isConnected()) {
        const isMockToken = !config.DISCORD_BOT_TOKEN || config.DISCORD_BOT_TOKEN.startsWith('mock_');
        if (isMockToken) {
          warningState = 'DISCORD_NOT_CONNECTED';
          details = 'Discord bot is not configured on this server.';
        } else {
          warningState = 'DISCORD_LIMITATION';
          details = 'Discord bot gateway is disconnected.';
        }
      } else {
        const community = await communitiesRepository.getById(communityId);
        const guildId = community?.guildId || community?.discordGuildId;
        if (!guildId) {
          warningState = 'DISCORD_NOT_CONNECTED';
          details = 'Community has no linked Discord Guild ID.';
        }
      }

      res.status(200).json({
        success: true,
        joined: false,
        warningState,
        message: details,
      });
    }
  } catch (error) {
    next(error);
  }
}

/**
 * Authoritative production Discord join verification.
 * Strictly queries the live Discord API via connected bot client.
 */
export async function verifyDiscordJoin(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const application = await applicationsRepository.getById(id);
    if (!application) {
      throw new NotFoundError(`Application ${id} not found`);
    }

    if (!['APPROVED', 'JOIN_PENDING', 'JOIN_VERIFICATION_PENDING'].includes(application.status)) {
      throw new BadRequestError(`Discord join verification requires an approved application. Current status is: ${application.status}`);
    }

    const communityId = application.communityId;
    const discordUserId = application.applicantDiscordId;

    if (!discordUserId) {
      throw new BadRequestError('Applicant has no Discord ID associated with their application');
    }

    if (!discordService.isConnected()) {
      return res.status(200).json({
        success: false,
        joined: false,
        warningState: 'DISCORD_NOT_CONNECTED',
        message: 'Discord bot is not connected to gateway. Verification cannot proceed.',
      });
    }

    const community = await communitiesRepository.getById(communityId);
    const guildId = community?.guildId || community?.discordGuildId;
    if (!guildId) {
      return res.status(200).json({
        success: false,
        joined: false,
        warningState: 'COMMUNITY_GUILD_NOT_LINKED',
        message: 'Community has no linked Discord Guild ID.',
      });
    }

    const client = discordService['client'];
    const guild = await client?.guilds.fetch(guildId);
    if (!guild) {
      return res.status(200).json({
        success: false,
        joined: false,
        warningState: 'BOT_NOT_IN_GUILD',
        message: 'Bot is not in the community Discord server.',
      });
    }

    let member = null;
    try {
      member = await guild.members.fetch(discordUserId);
    } catch (err: any) {
      if (err.code === 10007) {
        return res.status(200).json({
          success: true,
          joined: false,
          warningState: 'USER_NOT_IN_GUILD',
          message: 'The applicant has not joined the Discord server yet.',
        });
      }
      throw err;
    }

    if (member) {
      const result = await applicationWorkflowService.confirmDiscordJoin(communityId, discordUserId, req.id);
      return res.json({
        success: true,
        joined: true,
        verificationMethod: 'DISCORD_REAL_API',
        data: result,
        message: 'Successfully verified Discord server join and initiated onboarding',
      });
    }

    return res.status(200).json({
      success: true,
      joined: false,
      warningState: 'USER_NOT_IN_GUILD',
      message: 'The applicant has not joined the Discord server yet.',
    });
  } catch (error) {
    next(error);
  }
}

export async function updateApplicationStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    const { id } = req.params;
    const { status, notesSummary } = req.body;

    const application = await applicationsRepository.getById(id);
    if (!application) {
      throw new NotFoundError(`Application ${id} not found`);
    }

    // Tenant Isolation
    if (!isPlatformOwner(user) && user?.communityId && application.communityId !== user.communityId) {
      throw new ForbiddenError('Cross-community modification is strictly prohibited');
    }

    const updated = await applicationsRepository.update(id, {
      status,
      notesSummary,
      reviewedAt: new Date().toISOString(),
      reviewedByUserId: user?.userId,
    });

    // Task 1.7: Propagate status change to Referral Lifecycle record
    try {
      if (['APPROVED', 'REJECTED', 'UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED'].includes(status)) {
        await referralLifecycleService.updateApplicationStatus(
          id,
          status as any,
          user?.userId || 'usr_system',
          user?.role || 'CONTROLLER',
          req.id
        );
      }
    } catch {
      // Non-blocking fallback
    }

    // Send status update notification to applicant resolving the community's recruiter persona
    try {
      if (status === 'APPROVED') {
        await notificationService.send({
          communityId: application.communityId,
          recipientUserId: application.applicantUserId,
          recipientDiscordId: application.applicantDiscordId,
          type: 'APPLICATION_APPROVED',
          channel: 'DISCORD_DM',
          title: 'Application Approved by {{recruiterName}}',
          body: 'Hi {{applicantName}},\n\nGreat news! {{recruiterName}} has approved your application (ID: {{applicationId}}).\nWelcome to the community! Please check your server roles.',
          templateVariables: {
            applicantName: application.applicantUsername,
            applicationId: application.id,
          },
        });
      } else if (status === 'ADDITIONAL_INFO_REQUIRED') {
        await notificationService.send({
          communityId: application.communityId,
          recipientUserId: application.applicantUserId,
          recipientDiscordId: application.applicantDiscordId,
          type: 'ADDITIONAL_INFORMATION_REQUIRED',
          channel: 'DISCORD_DM',
          title: '{{recruiterName}} requires additional information',
          body: 'Hi {{applicantName}},\n\n{{recruiterName}} needs some additional information regarding your application {{applicationId}}.\n\nNotes: {{notesSummary}}',
          templateVariables: {
            applicantName: application.applicantUsername,
            applicationId: application.id,
            notesSummary: notesSummary || 'Please review your application answers.',
          },
        });
      } else if (status === 'REJECTED') {
        await notificationService.send({
          communityId: application.communityId,
          recipientUserId: application.applicantUserId,
          recipientDiscordId: application.applicantDiscordId,
          type: 'APPLICATION_REJECTED',
          channel: 'DISCORD_DM',
          title: 'Application Update from {{recruiterName}}',
          body: 'Hi {{applicantName}},\n\n{{recruiterName}} has reviewed your application (ID: {{applicationId}}). At this time we are unable to approve your application.',
          templateVariables: {
            applicantName: application.applicantUsername,
            applicationId: application.id,
          },
        });
      }
    } catch {
      // Safe fallback - notification delivery failure does not disrupt status update
    }

    res.json({
      success: true,
      data: updated,
      message: `Application status updated to ${status}`,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function analyzeApplicationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id } = req.params;
    const application = await applicationsRepository.getById(id);
    if (!application) {
      throw new NotFoundError(`Application ${id} not found`);
    }

    if (!isPlatformOwner(user) && user.communityId && application.communityId !== user.communityId) {
      throw new ForbiddenError('Cross-community data access is strictly prohibited');
    }

    const analysis = await aiReviewService.analyzeApplication(
      application.communityId,
      id,
      user.userId,
      user.role,
      req.id
    );

    res.json({
      success: true,
      data: analysis,
      message: 'AI screening analysis completed (advisory insights only)',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

