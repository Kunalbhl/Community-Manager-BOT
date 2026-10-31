import { Request, Response, NextFunction } from 'express';
import { discordSettingsService } from '../services/discordSettings.service.js';
import { canAccessTenant, hasPermission } from '../security/rbac.js';
import { ForbiddenError, BadRequestError } from '../utils/errors.js';
import { UserRole } from '../../shared/types/rbac.js';

export async function getCommunityDiscordSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.params.communityId || req.query.communityId as string || user.communityId;
    if (!communityId) throw new BadRequestError('communityId is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError(`Access denied to community ${communityId}`);
    }

    if (!hasPermission(user, 'settings.view') && user.role !== 'OWNER' && user.role !== 'CONTROLLER') {
      throw new ForbiddenError('Insufficient permissions to view Discord settings');
    }

    const data = await discordSettingsService.getDiscordSettings(communityId);
    res.json({
      success: true,
      data,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCommunityDiscordSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.params.communityId || req.body.communityId || user.communityId;
    if (!communityId) throw new BadRequestError('communityId is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError(`Access denied to community ${communityId}`);
    }

    if (!hasPermission(user, 'settings.manage') && user.role !== 'OWNER' && user.role !== 'CONTROLLER') {
      throw new ForbiddenError('Insufficient permissions to modify Discord settings');
    }

    const actor = {
      userId: user.userId || 'usr_unknown',
      role: user.role as UserRole,
    };

    const data = await discordSettingsService.updateDiscordSettings(communityId, actor, req.body);
    res.json({
      success: true,
      message: 'Community Discord settings updated successfully.',
      data,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}
