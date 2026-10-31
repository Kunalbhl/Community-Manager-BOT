import { Request, Response, NextFunction } from 'express';
import { integrationCenterService } from '../services/integrationCenter.service.js';
import { ForbiddenError, UnauthorizedError, BadRequestError } from '../utils/errors.js';
import { canAccessTenant, isPlatformOwner } from '../security/rbac.js';
import { IntegrationKey } from '../../shared/types/integrations.js';

export async function getUnifiedIntegrationStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    const communityId = (req.query.communityId as string) || user?.communityId || '';
    if (!communityId) {
      throw new BadRequestError('communityId parameter is required');
    }
    if (user && !canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community integration status prohibited');
    }
    const report = await integrationCenterService.getUnifiedStatus(communityId, user?.userId);
    res.json({ success: true, data: report, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function configureIntegrationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');

    if (!isPlatformOwner(user) && user.role !== 'OWNER') {
      throw new ForbiddenError('Only platform owners or community owners can configure integrations');
    }

    const { provider, payload } = req.body;
    if (!provider || !payload) {
      throw new BadRequestError('provider and payload are required');
    }

    const result = await integrationCenterService.configureIntegration(provider, payload, user);
    res.json({ success: true, data: result, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function verifyIntegrationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');

    const provider = (req.body.provider || req.query.provider) as
      | 'DISCORD'
      | 'AI_ENGINE'
      | 'BILLING'
      | 'GOOGLE_SHEETS';
    const communityId = (req.body.communityId || req.query.communityId) as string || user?.communityId || '';
    if (!communityId) {
      throw new BadRequestError('communityId parameter is required');
    }

    if (!provider) {
      throw new BadRequestError('provider parameter is required');
    }

    const result = await integrationCenterService.verifyIntegration(provider, communityId);
    res.json({ success: true, data: result, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

// --- CANONICAL ENGINE HANDLERS (Task 86) ---

export async function getIntegrationRegistryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const registry = integrationCenterService.getCanonicalRegistry();
    res.json({ success: true, data: registry, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function getCanonicalIntegrationsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    const communityId = (req.query.communityId as string) || user?.communityId || '';
    if (!communityId) {
      throw new BadRequestError('communityId parameter is required');
    }
    if (user && !canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community access prohibited');
    }

    const list = await integrationCenterService.getCanonicalDetails(communityId, user?.userId);
    res.json({ success: true, data: list, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function getCanonicalIntegrationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    const communityId = (req.query.communityId as string) || user?.communityId || '';
    if (!communityId) {
      throw new BadRequestError('communityId parameter is required');
    }
    if (user && !canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community access prohibited');
    }

    const key = req.params.key as IntegrationKey;
    const detail = await integrationCenterService.getCanonicalIntegration(communityId, key, user?.userId);
    res.json({ success: true, data: detail, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function connectCanonicalIntegrationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');

    const communityId = (req.body.communityId || req.query.communityId) as string || user.communityId || '';
    if (!communityId) {
      throw new BadRequestError('communityId parameter is required');
    }
    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community access prohibited');
    }

    const key = req.params.key as IntegrationKey;
    const { accessToken, refreshToken, expiresInSeconds, scopes, configPayload, userId } = req.body;

    const result = await integrationCenterService.connectIntegration({
      communityId,
      integrationKey: key,
      userId: userId || (key === 'GOOGLE_CALENDAR' ? user.userId : undefined),
      actorUserId: user.userId,
      actorRole: user.role,
      accessToken,
      refreshToken,
      expiresInSeconds,
      scopes,
      configPayload,
    });

    res.json({ success: true, data: result, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function disconnectCanonicalIntegrationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');

    const communityId = (req.body.communityId || req.query.communityId) as string || user.communityId || '';
    if (!communityId) {
      throw new BadRequestError('communityId parameter is required');
    }
    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community access prohibited');
    }

    const key = req.params.key as IntegrationKey;
    const userId = req.body.userId || (key === 'GOOGLE_CALENDAR' ? user.userId : undefined);

    const result = await integrationCenterService.disconnectIntegration({
      communityId,
      integrationKey: key,
      userId,
      actorUserId: user.userId,
      actorRole: user.role,
    });

    res.json({ success: true, data: result, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function testCanonicalIntegrationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');

    const communityId = (req.body.communityId || req.query.communityId) as string || user.communityId || '';
    if (!communityId) {
      throw new BadRequestError('communityId parameter is required');
    }
    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community access prohibited');
    }

    const key = req.params.key as IntegrationKey;
    const userId = req.body.userId || (key === 'GOOGLE_CALENDAR' ? user.userId : undefined);

    const health = await integrationCenterService.testIntegration(
      communityId,
      key,
      user.userId,
      user.role,
      userId
    );

    res.json({ success: true, data: health, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function syncCanonicalIntegrationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new UnauthorizedError('Authentication required');

    const communityId = (req.body.communityId || req.query.communityId) as string || user.communityId || '';
    if (!communityId) {
      throw new BadRequestError('communityId parameter is required');
    }
    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community access prohibited');
    }

    const key = req.params.key as IntegrationKey;
    const resource = req.body.resource;

    const result = await integrationCenterService.triggerSync({
      communityId,
      integrationKey: key,
      resource,
      actorUserId: user.userId,
      actorRole: user.role,
    });

    res.json({ success: true, data: result, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function getCanonicalSyncHistoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    const communityId = (req.query.communityId as string) || user?.communityId || '';
    if (!communityId) {
      throw new BadRequestError('communityId parameter is required');
    }
    if (user && !canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community access prohibited');
    }

    const key = req.params.key as IntegrationKey;
    const history = await integrationCenterService.getSyncHistory(communityId, key);
    res.json({ success: true, data: history, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function getOverallIntegrationsHealthHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    const communityId = (req.query.communityId as string) || user?.communityId || '';
    if (!communityId) {
      throw new BadRequestError('communityId parameter is required');
    }
    if (user && !canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Cross-community access prohibited');
    }

    const report = await integrationCenterService.getOverallHealth(communityId, user?.userId);
    res.json({ success: true, data: report, requestId: req.id });
  } catch (error) {
    next(error);
  }
}
