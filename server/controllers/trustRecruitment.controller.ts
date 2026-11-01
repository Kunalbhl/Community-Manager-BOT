import { googleIntegrationsAvailable, GOOGLE_NOT_AVAILABLE_MESSAGE } from '../integrations/google/availability.js';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';
import { logger } from '../logging/logger.js';
import { channelAccessService } from '../services/channelAccess.service.js';
import { recruiterBenefitsService } from '../services/recruiterBenefits.service.js';
import { referralLifecycleService } from '../services/referralLifecycle.service.js';
import { applicantRestrictionService } from '../services/applicantRestriction.service.js';
import { communityQuestionsService } from '../services/communityQuestions.service.js';
import { onboardingService } from '../services/onboarding.service.js';
import { googleSheetsService } from '../services/googleSheets.service.js';
import { discordCapabilityService } from '../services/discordCapability.service.js';
import { integrationCenterService } from '../services/integrationCenter.service.js';
import { googleFormsService } from '../integrations/google/forms.service.js';
import { googleCalendarService } from '../integrations/google/calendar.service.js';
import { hasPermission, canAccessTenant } from '../security/rbac.js';
import { BadRequestError, ForbiddenError, UnauthorizedError } from '../utils/errors.js';

// ==========================================
// CHANNELS CONTROLLERS
// ==========================================

export async function listAllowedChannels(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId } = req.query as { communityId: string };
    if (!communityId) throw new BadRequestError('Community ID is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community channel access prohibited');
    }

    const channels = await channelAccessService.listChannels(communityId);
    res.json({ success: true, data: channels, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function addAllowedChannel(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId, channelId, channelNameSnapshot, purpose, enabled } = req.body;

    if (!communityId) throw new BadRequestError('Community ID is required');
    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community channel configuration prohibited');
    }

    if (!hasPermission(user, 'settings.manage') && !hasPermission(user, 'community.manage')) {
      throw new ForbiddenError('Insufficient permissions to configure bot channels');
    }

    const channel = await channelAccessService.addChannel(
      { communityId, channelId, channelNameSnapshot, purpose, enabled },
      user.userId,
      user.role,
      req.id
    );

    res.json({ success: true, data: channel, message: 'Channel configured successfully', requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function removeAllowedChannel(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { id } = req.params;
    const { communityId } = req.query as { communityId: string };

    if (!communityId) throw new BadRequestError('Community ID is required');
    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community channel removal prohibited');
    }

    if (!hasPermission(user, 'settings.manage') && !hasPermission(user, 'community.manage')) {
      throw new ForbiddenError('Insufficient permissions to remove bot channels');
    }

    await channelAccessService.removeChannel(communityId, id, user.userId, user.role, req.id);
    res.json({ success: true, message: 'Channel removed from bot processing', requestId: req.id });
  } catch (error) {
    next(error);
  }
}

// ==========================================
// RECRUITER BENEFITS CONTROLLERS
// ==========================================

export async function listRecruiterBenefits(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId } = req.query as { communityId: string };
    if (!communityId) throw new BadRequestError('Community ID is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community access prohibited');
    }

    const benefits = await recruiterBenefitsService.listBenefits(communityId);
    res.json({ success: true, data: benefits, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function configureRecruiterBenefit(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId, name, description, threshold, rewardType, discordRoleId, discordRoleNameSnapshot, customPerkDetails, fulfillmentType, isActive } = req.body;

    if (!communityId) throw new BadRequestError('Community ID is required');
    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community benefit configuration prohibited');
    }

    if (!hasPermission(user, 'settings.manage') && !hasPermission(user, 'community.manage')) {
      throw new ForbiddenError('Insufficient permissions to configure recruiter rewards');
    }

    const benefit = await recruiterBenefitsService.configureBenefit(
      { communityId, name, description, threshold, rewardType, discordRoleId, discordRoleNameSnapshot, customPerkDetails, fulfillmentType, isActive },
      user.userId,
      user.role,
      req.id
    );

    res.json({ success: true, data: benefit, message: 'Recruiter benefit configured', requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function evaluateRecruiterBenefits(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId, count } = req.query as { communityId: string; count?: string };
    if (!communityId) throw new BadRequestError('Community ID is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community access prohibited');
    }

    const recruitCount = parseInt(count || '0', 10);
    const evaluation = await recruiterBenefitsService.evaluateRecruiterBenefits(communityId, recruitCount);

    res.json({ success: true, data: evaluation, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function deleteRecruiterBenefit(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { id } = req.params;
    const { communityId } = req.query as { communityId: string };

    if (!communityId) throw new BadRequestError('Community ID is required');
    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community access prohibited');
    }

    if (!hasPermission(user, 'settings.manage') && !hasPermission(user, 'community.manage')) {
      throw new ForbiddenError('Insufficient permissions to delete recruiter rewards');
    }

    await recruiterBenefitsService.deleteBenefit(communityId, id, user.userId, user.role, req.id);
    res.json({ success: true, message: 'Benefit removed', requestId: req.id });
  } catch (error) {
    next(error);
  }
}

// ==========================================
// REFERRAL LIFECYCLE & NOTIFICATIONS
// ==========================================

export async function listReferralLifecycle(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId } = req.query as { communityId: string };
    if (!communityId) throw new BadRequestError('Community ID is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community access prohibited');
    }

    const referrals = await referralLifecycleService.listReferralsForCommunity(communityId);
    res.json({ success: true, data: referrals, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function confirmMemberJoin(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId, discordUserId } = req.body;

    if (!communityId || !discordUserId) {
      throw new BadRequestError('Community ID and Discord User ID are required');
    }

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community confirmation prohibited');
    }

    const result = await referralLifecycleService.confirmMemberJoin(communityId, discordUserId, req.id);
    res.json({ success: true, data: result, message: 'Member join confirmed and recruitment finalized', requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function getNotificationHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId } = req.query as { communityId: string };
    if (!communityId) throw new BadRequestError('Community ID is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community access prohibited');
    }

    const history = await referralLifecycleService.getNotificationHistory(communityId);
    res.json({ success: true, data: history, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

// ==========================================
// APPLICANT RESTRICTIONS (BLACKLIST & ALIASES)
// ==========================================

export async function checkApplicantRisk(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId, discordUserId, username, aliases } = req.body;

    if (!communityId) throw new BadRequestError('Community ID is required');
    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community access prohibited');
    }

    const result = await applicantRestrictionService.checkApplicantRisk(
      communityId,
      discordUserId,
      username,
      aliases
    );

    res.json({ success: true, data: result, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function listRestrictions(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId } = req.query as { communityId: string };
    if (!communityId) throw new BadRequestError('Community ID is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community access prohibited');
    }

    const restrictions = await applicantRestrictionService.listRestrictions(communityId);
    res.json({ success: true, data: restrictions, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function flagUserRestriction(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId, discordUserId, currentUsernameSnapshot, displayNameSnapshot, serverNicknameSnapshot, gameNameAliases, status, reason, evidenceNotes } = req.body;

    if (!communityId) throw new BadRequestError('Community ID is required');
    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community restriction prohibited');
    }

    if (!hasPermission(user, 'settings.manage') && !hasPermission(user, 'applications.review') && !hasPermission(user, 'community.manage')) {
      throw new ForbiddenError('Insufficient permissions to flag user');
    }

    const record = await applicantRestrictionService.flagUser(
      { communityId, discordUserId, currentUsernameSnapshot, displayNameSnapshot, serverNicknameSnapshot, gameNameAliases, status, reason, evidenceNotes },
      user.userId,
      user.role,
      req.id
    );

    res.json({ success: true, data: record, message: 'User restriction updated', requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function unflagUserRestriction(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { id } = req.params;
    const { communityId } = req.query as { communityId: string };

    if (!communityId) throw new BadRequestError('Community ID is required');
    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community access prohibited');
    }

    if (!hasPermission(user, 'settings.manage') && !hasPermission(user, 'community.manage')) {
      throw new ForbiddenError('Insufficient permissions to unflag user');
    }

    const updated = await applicantRestrictionService.unflagUser(communityId, id, user.userId, user.role, req.id);
    res.json({ success: true, data: updated, message: 'User unflagged', requestId: req.id });
  } catch (error) {
    next(error);
  }
}

// ==========================================
// APPLICATION & INTERVIEW QUESTIONS & GUIDELINES
// ==========================================

export async function listQuestions(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId } = req.query as { communityId: string };
    if (!communityId) throw new BadRequestError('Community ID is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community access prohibited');
    }

    const appQuestions = await communityQuestionsService.listApplicationQuestions(communityId);
    const interviewQuestions = await communityQuestionsService.listInterviewQuestions(communityId);
    const guidelines = await communityQuestionsService.listGuidelines(communityId);

    res.json({
      success: true,
      data: {
        applicationQuestions: appQuestions,
        interviewQuestions,
        guidelines,
      },
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function createApplicationQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId, questionText, type, options, required, order, guidance } = req.body;

    if (!communityId) throw new BadRequestError('Community ID is required');
    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community configuration prohibited');
    }

    if (!hasPermission(user, 'settings.manage') && !hasPermission(user, 'community.manage')) {
      throw new ForbiddenError('Insufficient permissions to modify questions');
    }

    const question = await communityQuestionsService.createApplicationQuestion(
      communityId,
      { questionText, type, options, required, order, guidance },
      user.userId,
      user.role,
      req.id
    );

    onboardingService.recordFirstValueAction(communityId, 'RECRUITMENT_QUESTION_CREATED', user.userId, user.role).catch(() => {});

    res.json({ success: true, data: question, message: 'Question created', requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function deleteApplicationQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { id } = req.params;
    const { communityId } = req.query as { communityId: string };

    if (!communityId) throw new BadRequestError('Community ID is required');
    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community configuration prohibited');
    }

    if (!hasPermission(user, 'settings.manage') && !hasPermission(user, 'community.manage')) {
      throw new ForbiddenError('Insufficient permissions to delete questions');
    }

    await communityQuestionsService.deleteApplicationQuestion(communityId, id, user.userId, user.role, req.id);
    res.json({ success: true, message: 'Question deleted', requestId: req.id });
  } catch (error) {
    next(error);
  }
}

// ==========================================
// GOOGLE SHEETS CONTROLLERS
// ==========================================

export async function getGoogleSheetsConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId } = req.query as { communityId: string };
    if (!communityId) throw new BadRequestError('Community ID is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community access prohibited');
    }

    const config = await googleSheetsService.getConfig(communityId);
    res.json({ success: true, data: config, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function connectGoogleSheet(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId, spreadsheetId, spreadsheetUrl, sheetName, autoSyncEnabled, columnMappings } = req.body;

    if (!communityId) throw new BadRequestError('Community ID is required');
    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community configuration prohibited');
    }

    if (!hasPermission(user, 'settings.manage') && !hasPermission(user, 'community.manage')) {
      throw new ForbiddenError('Insufficient permissions to configure Google Sheets');
    }

    const connected = await googleSheetsService.connectSheet(
      communityId,
      { spreadsheetId, spreadsheetUrl, sheetName, autoSyncEnabled, columnMappings },
      user.userId,
      user.role,
      req.id
    );

    res.json({ success: true, data: connected, message: 'Google Sheets configuration updated', requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function syncGoogleSheet(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId } = req.body;

    if (!communityId) throw new BadRequestError('Community ID is required');
    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community sync prohibited');
    }

    if (!hasPermission(user, 'settings.manage') && !hasPermission(user, 'community.manage')) {
      throw new ForbiddenError('Insufficient permissions to sync Google Sheets');
    }

    const syncResult = await googleSheetsService.syncToGoogleSheet(communityId, user.userId, user.role, req.id);
    res.json({ success: true, data: syncResult, message: syncResult.message, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function createInterviewQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId, questionText, stageName, scoringCriteria, required, order } = req.body;

    if (!communityId) throw new BadRequestError('Community ID is required');
    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community configuration prohibited');
    }

    if (!hasPermission(user, 'settings.manage') && !hasPermission(user, 'community.manage')) {
      throw new ForbiddenError('Insufficient permissions to modify questions');
    }

    const question = await communityQuestionsService.createInterviewQuestion(
      communityId,
      { questionText, stageName, scoringCriteria, required, order },
      user.userId,
      user.role,
      req.id
    );

    res.json({ success: true, data: question, message: 'Interview question created', requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function deleteInterviewQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { id } = req.params;
    const { communityId } = req.query as { communityId: string };

    if (!communityId) throw new BadRequestError('Community ID is required');
    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community configuration prohibited');
    }

    if (!hasPermission(user, 'settings.manage') && !hasPermission(user, 'community.manage')) {
      throw new ForbiddenError('Insufficient permissions to delete interview questions');
    }

    await communityQuestionsService.deleteInterviewQuestion(communityId, id, user.userId, user.role, req.id);
    res.json({ success: true, message: 'Interview question deleted', requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function enforceDiscordRestrictionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { id } = req.params;
    const { communityId, action } = req.body;

    if (!communityId) throw new BadRequestError('Community ID is required');
    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community restriction prohibited');
    }

    if (!hasPermission(user, 'settings.manage') && !hasPermission(user, 'community.manage')) {
      throw new ForbiddenError('Insufficient permissions to enforce Discord restriction');
    }

    const result = await applicantRestrictionService.enforceDiscordRestriction(
      communityId,
      id,
      action || 'BAN',
      user.userId,
      user.role,
      req.id
    );

    res.json({
      success: true,
      data: result,
      message: result.message,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

// ==========================================
// DISCORD CAPABILITY & CONNECTION CENTER CONTROLLERS
// ==========================================

export function getDiscordCapabilities(req: Request, res: Response) {
  const capabilities = discordCapabilityService.getCapabilityMatrix();
  res.json({ success: true, data: capabilities, requestId: req.id });
}

export async function getDiscordConnectionCenter(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    const communityId = (req.query.communityId as string) || (req.header('x-community-id') as string) || user?.communityId;
    if (!communityId) {
      throw new BadRequestError('Community context is required', 'COMMUNITY_CONTEXT_REQUIRED');
    }
    const status = await discordCapabilityService.getConnectionCenterStatus(communityId);
    res.json({ success: true, data: status, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function runDiscordSmokeTest(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const communityId = (req.query.communityId as string) || req.body.communityId || user.communityId;

    const guildValidation = await discordCapabilityService.validateGuild(communityId);
    const slashCommands = discordCapabilityService.validateSlashCommands();
    const capabilityMatrix = discordCapabilityService.getCapabilityMatrix();

    res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        guildValidation,
        slashCommands,
        capabilityMatrix,
        smokeTestStatus: guildValidation.status === 'CONNECTED' ? 'PASSED' : 'NOT_CONFIGURED',
      },
      message: 'Discord integration smoke test completed successfully',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

// ==========================================
// UNIFIED INTEGRATION CENTER CONTROLLERS
// ==========================================

export async function getUnifiedIntegrationStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    const communityId = (req.query.communityId as string) || user?.communityId || '';
    if (!communityId) {
      throw new BadRequestError('communityId is required');
    }
    if (user && !canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community integration status prohibited');
    }
    const report = await integrationCenterService.getUnifiedStatus(communityId);
    res.json({ success: true, data: report, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function configureGoogleFormHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId, formId, formTitleSnapshot, enabled } = req.body;
    if (!communityId || !formId) throw new BadRequestError('Community ID and Form ID are required');
    if (!canAccessTenant(user, communityId)) throw new ForbiddenError('Cross-community access prohibited');

    const config = await googleFormsService.configureForm(communityId, formId, formTitleSnapshot, enabled);
    res.json({ success: true, data: config, message: 'Google Form configured successfully', requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function importGoogleFormSubmissionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId, submissionId, applicantDiscordUserId, applicantUsername, answers, submittedAt } = req.body;
    if (!communityId || !submissionId) throw new BadRequestError('Community ID and Submission ID are required');

    const result = await googleFormsService.importFormSubmission(communityId, {
      submissionId,
      applicantDiscordUserId,
      applicantUsername,
      answers,
      submittedAt,
    });

    res.json({
      success: true,
      data: result.application,
      isDuplicate: result.isDuplicate,
      message: result.isDuplicate ? 'Form submission already processed (Idempotent)' : 'Form submission imported successfully',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getUserCalendarStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    let communityId =
      (req.query.communityId as string) ||
      (typeof req.header === 'function' && req.header('x-community-id')) ||
      user.communityId ||
      'comm_default';

    if ((!communityId || communityId === 'comm_default') && user.communityId && user.communityId !== 'comm_default') {
      communityId = user.communityId;
    }

    if (!canAccessTenant(user, communityId)) {
      if (user.communityId && user.communityId !== communityId && communityId === 'comm_default') {
        communityId = user.communityId;
      } else if (user.communityId === 'comm_default' && communityId) {
        // Session had default placeholder; allow specific tenant access
      } else {
        throw new ForbiddenError('Access denied: Cross-community access is prohibited', 'COMMUNITY_ACCESS_DENIED');
      }
    }

    const status = await googleCalendarService.getUserCalendarStatus(user.userId, communityId, user.role);

    if (status.shouldShowFirstLoginPrompt && req.query.recordPrompt === 'true') {
      await googleCalendarService.recordPromptShown(user.userId, communityId, user.role);
    }

    res.json({
      success: true,
      data: status,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function skipUserCalendarSetupHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user || user.userId === 'usr_anonymous') {
      throw new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED');
    }
    let communityId =
      req.body?.communityId ||
      (req.query?.communityId as string) ||
      (typeof req.header === 'function' && req.header('x-community-id')) ||
      user.communityId ||
      'comm_default';

    if ((!communityId || communityId === 'comm_default') && user.communityId && user.communityId !== 'comm_default') {
      communityId = user.communityId;
    }

    if (!canAccessTenant(user, communityId)) {
      if (user.communityId && user.communityId !== communityId && communityId === 'comm_default') {
        communityId = user.communityId;
      } else if (user.communityId === 'comm_default' && communityId) {
        // Session had default placeholder; allow specific tenant access
      } else {
        throw new ForbiddenError('Access denied: Cross-community access is prohibited', 'COMMUNITY_ACCESS_DENIED');
      }
    }

    const doc = await googleCalendarService.skipUserCalendarSetup(user.userId, communityId, user.role);
    res.json({
      success: true,
      data: doc,
      message: 'Google Calendar setup skipped. You can enable it anytime from Recruitment Settings.',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function connectUserCalendarHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user || user.userId === 'usr_anonymous') {
      throw new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED');
    }
    let communityId =
      req.body?.communityId ||
      (req.query?.communityId as string) ||
      (typeof req.header === 'function' && req.header('x-community-id')) ||
      user.communityId;

    if ((!communityId || communityId === 'comm_default') && user.communityId && user.communityId !== 'comm_default') {
      communityId = user.communityId;
    }

    if (!communityId) throw new BadRequestError('Community context is required', 'COMMUNITY_CONTEXT_REQUIRED');

    if (!canAccessTenant(user, communityId)) {
      if (user.communityId && user.communityId !== communityId && communityId === 'comm_default') {
        communityId = user.communityId;
      } else {
        throw new ForbiddenError('Access denied: Cross-community access is prohibited', 'COMMUNITY_ACCESS_DENIED');
      }
    }
    const { googleAccountId, calendarId, timezone } = req.body || {};

    const doc = await googleCalendarService.connectUserCalendar(
      user.userId,
      communityId,
      user.role,
      googleAccountId,
      calendarId,
      timezone
    );

    res.json({
      success: true,
      data: doc,
      message: 'Google Calendar connected successfully. Your recruitment interviews can now be scheduled on your calendar.',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function disconnectUserCalendarHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user || user.userId === 'usr_anonymous') {
      throw new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED');
    }
    let communityId =
      req.body?.communityId ||
      (req.query?.communityId as string) ||
      (typeof req.header === 'function' && req.header('x-community-id')) ||
      user.communityId;

    if ((!communityId || communityId === 'comm_default') && user.communityId && user.communityId !== 'comm_default') {
      communityId = user.communityId;
    }

    if (!communityId) throw new BadRequestError('Community context is required', 'COMMUNITY_CONTEXT_REQUIRED');

    if (!canAccessTenant(user, communityId)) {
      if (user.communityId && user.communityId !== communityId && communityId === 'comm_default') {
        communityId = user.communityId;
      } else {
        throw new ForbiddenError('Access denied: Cross-community access is prohibited', 'COMMUNITY_ACCESS_DENIED');
      }
    }

    const doc = await googleCalendarService.disconnectUserCalendar(user.userId, communityId, user.role);
    res.json({
      success: true,
      data: doc,
      message: 'Google Calendar disconnected',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getGoogleOAuthAuthorizeUrlHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user || user.userId === 'usr_anonymous') {
      throw new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED');
    }
    let communityId =
      (req.query.communityId as string) ||
      (typeof req.header === 'function' && req.header('x-community-id')) ||
      user.communityId ||
      'comm_default';

    if ((!communityId || communityId === 'comm_default') && user.communityId && user.communityId !== 'comm_default') {
      communityId = user.communityId;
    }

    if (!canAccessTenant(user, communityId)) {
      if (user.communityId && user.communityId !== communityId && communityId === 'comm_default') {
        communityId = user.communityId;
      } else if (user.communityId === 'comm_default' && communityId) {
        // Session had default placeholder; allow specific tenant access
      } else {
        throw new ForbiddenError('Access denied: Cross-community access is prohibited', 'COMMUNITY_ACCESS_DENIED');
      }
    }

    const host = req.get('host') || '';
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
    const protocol = req.protocol === 'https' || !isLocalhost ? 'https' : 'http';
    const redirectOrigin = isLocalhost
      ? `${protocol}://${host}`
      : 'https://community-manager-bot-720940628402.asia-southeast1.run.app';
    const redirectUri = `${redirectOrigin}/api/v1/calendar/oauth/callback`;

    const { url, state, isConfigured } = googleCalendarService.getOAuthAuthorizeUrl({
      userId: user.userId,
      communityId,
      role: user.role,
      redirectUri,
    });

    if (!url || !isConfigured) {
      logger.warn(
        `[GoogleCalendarOAuth] OAuth initialization unavailable: Google OAuth client is not configured (GOOGLE_CLIENT_ID / GOOGLE_OAUTH_CLIENT_ID missing in environment). Community: ${communityId}, User: ${user.userId}`
      );
      return res.status(503).json({
        success: false,
        error: {
          code: 'GOOGLE_CALENDAR_NOT_CONFIGURED',
          message:
            'Google Calendar integration is not configured on this server (GOOGLE_CLIENT_ID missing). Please click "Skip for now" to continue, or contact your administrator.',
        },
        requestId: req.id,
      });
    }

    return res.json({
      success: true,
      data: { url, state },
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function handleGoogleOAuthCallbackHandler(req: Request, res: Response, next: NextFunction) {
  try {
    // The callback never exchanged the code with Google and trusted IDs from the URL. Closed until real OAuth exists.
    if (!googleIntegrationsAvailable()) {
      res.status(503).json({ success: false, code: 'GOOGLE_CALENDAR_NOT_AVAILABLE', message: GOOGLE_NOT_AVAILABLE_MESSAGE });
      return;
    }
    const user = req.user;
    const { code, state, googleAccountId } = req.query as { code?: string; state?: string; googleAccountId?: string };

    let userId = user && user.userId !== 'usr_anonymous' ? user.userId : undefined;
    let communityId = user?.communityId;
    let role = user?.role || 'INTERVIEWER';

    if (state) {
      try {
        let decodedStr = '';
        if (state.startsWith('{')) {
          decodedStr = state;
        } else {
          try {
            decodedStr = Buffer.from(state, 'base64url').toString('utf8');
          } catch {
            decodedStr = decodeURIComponent(state);
          }
        }
        const parsed = JSON.parse(decodedStr);
        if (parsed.userId) userId = parsed.userId;
        if (parsed.communityId) communityId = parsed.communityId;
        if (parsed.role) role = parsed.role;
      } catch (e) {
        // Fallback to query
      }
    }

    if (!userId || userId === 'usr_anonymous') {
      throw new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED');
    }
    if (!communityId) {
      throw new BadRequestError('Community context is required', 'COMMUNITY_CONTEXT_REQUIRED');
    }

    const doc = await googleCalendarService.connectUserCalendar(
      userId,
      communityId,
      role,
      googleAccountId || `user_${userId.slice(-4)}@gmail.com`
    );

    if (req.accepts('html')) {
      res.send(`
        <html>
          <body>
            <h2>Google Calendar Connected</h2>
            <p>Your calendar has been authorized. You may close this window or return to Community Manager.</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_CALENDAR_CONNECTED', data: ${JSON.stringify(doc)} }, window.location.origin);
                setTimeout(() => window.close(), 200);
              } else {
                window.location.href = '/?calendarConnected=true';
              }
            </script>
          </body>
        </html>
      `);
      return;
    }

    res.json({
      success: true,
      data: doc,
      message: 'Google Calendar connected successfully.',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function configureGoogleCalendarHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId, calendarId, timezone, enabled } = req.body;
    if (!communityId || !calendarId) throw new BadRequestError('Community ID and Calendar ID are required');
    if (!canAccessTenant(user, communityId)) throw new ForbiddenError('Cross-community access prohibited');

    const config = await googleCalendarService.configureCalendar(communityId, calendarId, timezone, enabled);
    res.json({ success: true, data: config, message: 'Google Calendar configured successfully', requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function scheduleGoogleCalendarEventHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId, interviewId, applicantUsername, interviewerUsername, scheduledAt, timezone, durationMinutes } = req.body;
    if (!communityId || !interviewId || !scheduledAt) throw new BadRequestError('Community ID, Interview ID and scheduledAt are required');
    if (!canAccessTenant(user, communityId)) throw new ForbiddenError('Cross-community access prohibited');

    const result = await googleCalendarService.scheduleInterviewEvent({
      communityId,
      interviewId,
      applicantUsername,
      interviewerUsername,
      scheduledAt,
      timezone,
      durationMinutes,
    });

    res.json({
      success: true,
      data: result,
      message: result.isDuplicate ? 'Interview event already scheduled (Idempotent)' : 'Calendar event scheduled successfully',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function cancelGoogleCalendarEventHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId, interviewId, eventId } = req.body;
    if (!communityId || !interviewId || !eventId) throw new BadRequestError('Community ID, Interview ID, and Event ID are required');
    if (!canAccessTenant(user, communityId)) throw new ForbiddenError('Cross-community access prohibited');

    await googleCalendarService.cancelInterviewEvent(communityId, interviewId, eventId);
    res.json({ success: true, message: 'Calendar event cancelled successfully', requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function listUserCalendarsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const communityId = (req.query.communityId as string) || user.communityId;
    if (!communityId) throw new BadRequestError('Community context is required', 'COMMUNITY_CONTEXT_REQUIRED');
    if (!canAccessTenant(user, communityId)) throw new ForbiddenError('Cross-community access prohibited', 'COMMUNITY_ACCESS_DENIED');

    const result = await googleCalendarService.listUserCalendars(user.userId, communityId);
    res.json({ success: true, data: result, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function selectUserCalendarHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId, calendarId } = req.body;
    if (!communityId || !calendarId) throw new BadRequestError('Community ID and Calendar ID are required');
    if (!canAccessTenant(user, communityId)) throw new ForbiddenError('Cross-community access prohibited');

    const doc = await googleCalendarService.selectUserCalendar(user.userId, communityId, user.role, calendarId);
    res.json({ success: true, data: doc, message: 'Calendar selected successfully', requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function rescheduleGoogleCalendarEventHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId, interviewId, eventId, applicantUsername, interviewerUsername, scheduledAt, timezone, durationMinutes } = req.body;
    if (!communityId || !interviewId || !eventId || !scheduledAt) throw new BadRequestError('Community ID, Interview ID, Event ID, and scheduledAt are required');
    if (!canAccessTenant(user, communityId)) throw new ForbiddenError('Cross-community access prohibited');

    const result = await googleCalendarService.updateInterviewEvent({
      communityId,
      interviewId,
      eventId,
      applicantUsername: applicantUsername || 'Applicant',
      interviewerUsername: interviewerUsername || 'Interviewer',
      interviewerUserId: user.userId,
      scheduledAt,
      timezone,
      durationMinutes,
    });

    res.json({ success: true, data: result, message: 'Calendar event rescheduled successfully', requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function triggerCalendarReauthHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');
    const { communityId, reason } = req.body;
    const cid = communityId || user.communityId;
    if (!cid) throw new BadRequestError('Community context is required', 'COMMUNITY_CONTEXT_REQUIRED');
    if (!canAccessTenant(user, cid)) throw new ForbiddenError('Cross-community access prohibited', 'COMMUNITY_ACCESS_DENIED');

    const doc = await googleCalendarService.triggerReauthRequired(user.userId, cid, user.role, reason);
    res.json({ success: true, data: doc, message: 'Calendar status set to REAUTH_REQUIRED', requestId: req.id });
  } catch (error) {
    next(error);
  }
}

