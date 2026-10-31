import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env.js';
import { onboardingService } from '../services/onboarding.service.js';
import { discordAuthService } from '../services/discordAuth.service.js';
import { DiscordResourceService } from '../services/discordResource.service.js';
import { ForbiddenError, BadRequestError } from '../utils/errors.js';

function getCookie(req: Request, name: string): string | undefined {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;
  const cookies = cookieHeader.split(';').reduce((acc, current) => {
    const [key, ...val] = current.trim().split('=');
    acc[key] = val.join('=');
    return acc;
  }, {} as Record<string, string>);
  return cookies[name];
}

export async function getOnboardingStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = (req.query.communityId as string) || (req.headers['x-community-id'] as string) || user.communityId;

    const result = await onboardingService.getOnboardingStatus(user.userId, user.role, communityId);

    res.json({
      success: true,
      data: result,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function startOnboarding(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.body.communityId || user.communityId || 'comm_new';

    const result = await onboardingService.startOnboarding(user.userId, user.role, communityId);

    res.json({
      success: true,
      data: result,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getUserGuilds(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    const authHeader = req.header('authorization');
    let token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

    if (!token) {
      token = (req as any).cookies?.['discord_session_token'] || getCookie(req, 'discord_session_token');
    }

    if (!token && user?.id) {
      const session = await discordAuthService.getSession(user.id);
      if (session) {
        token = session.sessionToken;
      }
    }

    if (!token) {
      res.status(401).json({
        success: false,
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message: 'No Discord OAuth session found. Please authorize with Discord.',
        },
        requestId: req.id,
      });
      return;
    }

    try {
      const guilds = await onboardingService.getUserGuilds(token);
      res.json({
        success: true,
        data: guilds,
        count: guilds.length,
        requestId: req.id,
      });
    } catch (err: any) {
      res.status(401).json({
        success: false,
        error: {
          code: 'DISCORD_REAUTH_REQUIRED',
          message: err?.message || 'Discord session expired or invalid. Please re-authenticate.',
        },
        requestId: req.id,
      });
      return;
    }
  } catch (error) {
    next(error);
  }
}

export async function selectAndVerifyServer(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { guildId, guildName, communityId } = req.body;
    if (!guildId) throw new BadRequestError('guildId is required');

    const authHeader = req.header('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
    const effectiveCommunityId = communityId || req.header('x-community-id') || undefined;

    const result = await onboardingService.selectAndVerifyServer(
      user.userId,
      user.role,
      guildId,
      guildName,
      token,
      effectiveCommunityId
    );

    res.json({
      success: true,
      data: result,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function runInitialSync(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.body.communityId || (req.headers['x-community-id'] as string) || user.communityId;
    if (!communityId) throw new BadRequestError('communityId is required');

    const result = await onboardingService.runInitialSync(user.userId, user.role, communityId);

    res.json({
      success: true,
      data: result,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function configureCommunity(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.body.communityId || (req.headers['x-community-id'] as string) || user.communityId;
    if (!communityId) throw new BadRequestError('communityId is required');

    const result = await onboardingService.configureCommunity(
      user.userId,
      user.role,
      communityId,
      req.body
    );

    res.json({
      success: true,
      data: result,
      message: 'Community configuration saved',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function completeOnboarding(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.body.communityId || (req.headers['x-community-id'] as string) || user.communityId;
    if (!communityId) throw new BadRequestError('communityId is required');

    const result = await onboardingService.completeOnboarding(user.userId, user.role, communityId);

    res.json({
      success: true,
      data: result,
      message: 'Community onboarding completed successfully',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function switchServer(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { targetCommunityId } = req.body;
    if (!targetCommunityId) throw new BadRequestError('targetCommunityId is required');

    const result = await onboardingService.switchServer(user.userId, user.role, targetCommunityId);

    res.json({
      success: true,
      data: result,
      message: `Switched server context to ${targetCommunityId}`,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getOnboardingChecklist(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = (req.query.communityId as string) || (req.headers['x-community-id'] as string) || user.communityId;
    if (!communityId) {
      throw new BadRequestError('Community context is required', 'COMMUNITY_CONTEXT_REQUIRED');
    }
    const result = await onboardingService.getOnboardingChecklist(communityId, user.userId, user.role);

    res.json({
      success: true,
      data: result,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function recordFirstValueAction(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.body.communityId || (req.headers['x-community-id'] as string) || user.communityId;
    if (!communityId) throw new BadRequestError('communityId is required');

    const actionType = req.body.actionType || 'GENERIC_FIRST_VALUE';

    const result = await onboardingService.recordFirstValueAction(communityId, actionType, user.userId, user.role);

    res.json({
      success: true,
      data: result,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}
