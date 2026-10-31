import { Request, Response, NextFunction } from 'express';
import { welcomeOnboardingService } from '../services/welcomeOnboarding.service.js';
import { onboardingOperationsService } from '../services/onboardingOperations.service.js';
import { welcomeAuditRecordsRepository } from '../repositories/index.js';
import { ForbiddenError, BadRequestError } from '../utils/errors.js';
import { isPlatformOwner } from '../security/rbac.js';

export async function getWelcomeConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const targetCommunityId = (req.query.communityId as string) || user.communityId;
    if (!targetCommunityId && !isPlatformOwner(user)) {
      throw new BadRequestError('Community ID is required');
    }

    if (!isPlatformOwner(user) && user.communityId && targetCommunityId !== user.communityId) {
      throw new ForbiddenError('Cross-community access is prohibited');
    }

    const config = await welcomeOnboardingService.getWelcomeConfig(targetCommunityId);
    res.json({
      success: true,
      data: config,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateWelcomeConfig(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const targetCommunityId = (req.query.communityId as string) || req.body.communityId || user.communityId;
    if (!targetCommunityId && !isPlatformOwner(user)) {
      throw new BadRequestError('Community ID is required');
    }

    if (!isPlatformOwner(user) && user.communityId && targetCommunityId !== user.communityId) {
      throw new ForbiddenError('Cross-community access is prohibited');
    }

    const updated = await welcomeOnboardingService.updateWelcomeConfig(
      targetCommunityId,
      req.body,
      user.userId,
      user.role,
      req.id
    );

    res.json({
      success: true,
      data: updated,
      message: 'Welcome & Onboarding settings updated successfully',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getWelcomeAuditHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const targetCommunityId = (req.query.communityId as string) || user.communityId;
    if (!targetCommunityId && !isPlatformOwner(user)) {
      throw new BadRequestError('Community ID is required');
    }

    if (!isPlatformOwner(user) && user.communityId && targetCommunityId !== user.communityId) {
      throw new ForbiddenError('Cross-community access is prohibited');
    }

    const audits = await welcomeAuditRecordsRepository.list({
      where: [{ field: 'communityId', operator: '==', value: targetCommunityId }],
    });

    res.json({
      success: true,
      data: audits,
      count: audits.length,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function previewWelcomeMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const targetCommunityId = (req.query.communityId as string) || user.communityId;
    const { personalTemplate, serverTemplate, sampleMemberName, sampleRecruiterName, sampleRecruiterCode } = req.body;

    const config = await welcomeOnboardingService.getWelcomeConfig(targetCommunityId || 'default');

    const pTemplate = personalTemplate || config.personalWelcomeMessage;
    const sTemplate = serverTemplate || config.serverWelcomeMessage;

    const sampleVars = {
      memberName: sampleMemberName || 'SampleMember',
      communityName: 'Our Discord Community',
      recruiterName: sampleRecruiterName || 'ActiveRecruiter',
      recruiterCode: sampleRecruiterCode || 'JOIN123',
    };

    const renderedPersonal = welcomeOnboardingService.resolveTemplate(pTemplate, sampleVars);
    const renderedServer = welcomeOnboardingService.resolveTemplate(sTemplate, sampleVars);

    res.json({
      success: true,
      data: {
        renderedPersonalDm: renderedPersonal,
        renderedServerWelcome: renderedServer,
        sampleVariables: sampleVars,
      },
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSetupStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const targetCommunityId = (req.query.communityId as string) || user.communityId;
    if (!targetCommunityId && !isPlatformOwner(user)) {
      throw new BadRequestError('Community ID is required');
    }

    const setupStatus = await welcomeOnboardingService.calculateSetupCompletion(targetCommunityId);

    res.json({
      success: true,
      data: setupStatus,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCommunityRules(req: Request, res: Response, next: NextFunction) {
  try {
    const targetCommunityId = (req.query.communityId as string) || req.user?.communityId;
    if (!targetCommunityId) {
      throw new BadRequestError('communityId is required');
    }

    const discordUserId = req.query.discordUserId as string | undefined;
    const rules = await welcomeOnboardingService.getCommunityRules(targetCommunityId, discordUserId);

    res.json({
      success: true,
      data: rules,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function acknowledgeRules(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId, discordUserId, rulesVersion } = req.body;
    const targetCommunityId = communityId || req.user?.communityId;
    const targetDiscordUserId = discordUserId || req.user?.userId;

    if (!targetCommunityId) {
      throw new BadRequestError('communityId is required');
    }
    if (!targetDiscordUserId) {
      throw new BadRequestError('discordUserId is required');
    }

    const result = await welcomeOnboardingService.acknowledgeRules(
      targetCommunityId,
      targetDiscordUserId,
      rulesVersion,
      req.id
    );

    res.json({
      success: true,
      data: result,
      message: 'Rules acknowledged successfully',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMemberJourneyStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const targetCommunityId = (req.query.communityId as string) || req.user?.communityId;
    const targetDiscordUserId = (req.query.discordUserId as string) || req.user?.userId;

    if (!targetCommunityId) {
      throw new BadRequestError('communityId is required');
    }
    if (!targetDiscordUserId) {
      throw new BadRequestError('discordUserId is required');
    }

    const journey = await welcomeOnboardingService.getMemberJourneyStatus(
      targetCommunityId,
      targetDiscordUserId
    );

    res.json({
      success: true,
      data: journey,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function retryOnboardingOperations(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const targetCommunityId = (req.query.communityId as string) || req.body.communityId || user.communityId;
    const targetDiscordUserId = (req.query.discordUserId as string) || req.body.discordUserId;

    if (!targetCommunityId && !isPlatformOwner(user)) {
      throw new BadRequestError('Community ID is required');
    }

    const result = await onboardingOperationsService.retryFailedOperations(
      targetCommunityId,
      targetDiscordUserId
    );

    res.json({
      success: true,
      data: result,
      message: `Retried ${result.retriedCount} onboarding operation(s). Succeeded: ${result.succeededCount}, Failed: ${result.failedCount}`,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

