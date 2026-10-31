import { Request, Response, NextFunction } from 'express';
import { quotaService } from '../services/quota.service.js';
import { SettingsService, SettingsValidationService } from '../services/settings.service.js';
import { canAccessTenant, hasPermission } from '../security/rbac.js';
import { ForbiddenError, BadRequestError } from '../utils/errors.js';
import { UserRole } from '../../shared/types/rbac.js';

export async function getConsolidatedSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.params.communityId || req.query.communityId as string || user.communityId;
    if (!communityId) throw new BadRequestError('communityId is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError(`Access denied to community ${communityId}`);
    }

    if (!hasPermission(user, 'settings.view') && user.role !== 'OWNER' && user.role !== 'CONTROLLER') {
      throw new ForbiddenError('Insufficient permissions to view settings');
    }

    const data = await SettingsService.getConsolidatedSettings(communityId);
    res.json({
      success: true,
      data,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCommunitySettings(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.params.communityId || req.body.communityId || user.communityId;
    if (!communityId) throw new BadRequestError('communityId is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError(`Access denied to community ${communityId}`);
    }

    if (!hasPermission(user, 'settings.manage') && user.role !== 'OWNER' && user.role !== 'CONTROLLER') {
      throw new ForbiddenError('Insufficient permissions to modify settings');
    }

    const actor = {
      userId: user.userId || 'usr_unknown',
      role: user.role as UserRole,
    };

    const data = await SettingsService.updateSettings(communityId, actor, req.body);
    res.json({
      success: true,
      message: 'Community settings updated successfully.',
      data,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSettingsDiagnostics(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.params.communityId || req.query.communityId as string || user.communityId;
    if (!communityId) throw new BadRequestError('communityId is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError(`Access denied to community ${communityId}`);
    }

    const data = await SettingsService.getDiagnostics(communityId);
    res.json({
      success: true,
      data,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function validateCommunitySettings(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.params.communityId || req.body.communityId || user.communityId;
    if (!communityId) throw new BadRequestError('communityId is required');

    const generalVal = req.body.general ? SettingsValidationService.validateGeneral(req.body.general) : { valid: true, errors: [] };
    const commVal = req.body.community ? SettingsValidationService.validateCommunity(req.body.community) : { valid: true, errors: [] };
    const permVal = req.body.permissions ? SettingsValidationService.validatePermissions(req.body.permissions, user.role as UserRole) : { valid: true, errors: [] };
    const recVal = req.body.recruitment ? SettingsValidationService.validateRecruitment(req.body.recruitment) : { valid: true, errors: [] };
    const notifVal = req.body.notifications ? SettingsValidationService.validateNotifications(req.body.notifications) : { valid: true, errors: [] };
    const secVal = req.body.security ? SettingsValidationService.validateSecurity(req.body.security, user.role as UserRole) : { valid: true, errors: [] };

    const errors = [
      ...generalVal.errors,
      ...commVal.errors,
      ...permVal.errors,
      ...recVal.errors,
      ...notifVal.errors,
      ...secVal.errors,
    ];

    res.json({
      success: true,
      valid: errors.length === 0,
      errors,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getPermissionsSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.params.communityId || req.query.communityId as string || user.communityId;
    if (!communityId) throw new BadRequestError('communityId is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError(`Access denied to community ${communityId}`);
    }

    const settings = await SettingsService.getConsolidatedSettings(communityId);
    res.json({
      success: true,
      data: settings.permissions,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function updatePermissionsSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.params.communityId || user.communityId;
    if (!communityId) throw new BadRequestError('communityId is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError(`Access denied to community ${communityId}`);
    }

    const actor = {
      userId: user.userId || 'usr_unknown',
      role: user.role as UserRole,
    };

    const updated = await SettingsService.updateSettings(communityId, actor, { permissions: req.body });
    res.json({
      success: true,
      data: updated.permissions,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getNotificationSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.params.communityId || req.query.communityId as string || user.communityId;
    if (!communityId) throw new BadRequestError('communityId is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError(`Access denied to community ${communityId}`);
    }

    const settings = await SettingsService.getConsolidatedSettings(communityId);
    res.json({
      success: true,
      data: settings.notifications,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateNotificationSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.params.communityId || user.communityId;
    if (!communityId) throw new BadRequestError('communityId is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError(`Access denied to community ${communityId}`);
    }

    const actor = {
      userId: user.userId || 'usr_unknown',
      role: user.role as UserRole,
    };

    const updated = await SettingsService.updateSettings(communityId, actor, { notifications: req.body });
    res.json({
      success: true,
      data: updated.notifications,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSecuritySettings(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.params.communityId || req.query.communityId as string || user.communityId;
    if (!communityId) throw new BadRequestError('communityId is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError(`Access denied to community ${communityId}`);
    }

    const settings = await SettingsService.getConsolidatedSettings(communityId);
    res.json({
      success: true,
      data: settings.security,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateSecuritySettings(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.params.communityId || user.communityId;
    if (!communityId) throw new BadRequestError('communityId is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError(`Access denied to community ${communityId}`);
    }

    const actor = {
      userId: user.userId || 'usr_unknown',
      role: user.role as UserRole,
    };

    const updated = await SettingsService.updateSettings(communityId, actor, { security: req.body });
    res.json({
      success: true,
      data: updated.security,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getPlansUsageSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.params.communityId || req.query.communityId as string || user.communityId;
    if (!communityId) throw new BadRequestError('communityId is required');

    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError(`Access denied to community ${communityId}`);
    }

    const settings = await SettingsService.getConsolidatedSettings(communityId);
    res.json({
      success: true,
      data: settings.plansUsage,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

// Backward-compatible endpoints
export function updateSettings(req: Request, res: Response) {
  res.json({
    success: true,
    message: 'System settings updated successfully.',
    data: req.body || {},
    requestId: req.id,
  });
}

export function getSystemSettings(req: Request, res: Response) {
  const snapshot = quotaService.getSnapshot();
  res.json({
    success: true,
    data: {
      freeMode: snapshot.freeMode,
      dailyQuotas: snapshot.quotas,
      date: snapshot.date,
      architecture: 'FREE_FIRST',
    },
    requestId: req.id,
  });
}
