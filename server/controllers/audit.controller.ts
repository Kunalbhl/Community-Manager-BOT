import { Request, Response, NextFunction } from 'express';
import { auditService } from '../services/audit.service.js';
import { isPlatformOwner } from '../security/rbac.js';
import { ForbiddenError, BadRequestError } from '../utils/errors.js';

export async function listCommunityAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const targetCommunityId = (req.params.communityId as string) || (req.query.communityId as string) || user.communityId;
    if (!targetCommunityId && !isPlatformOwner(user)) {
      throw new BadRequestError('Community ID is required');
    }

    if (!isPlatformOwner(user) && user.communityId && targetCommunityId !== user.communityId) {
      throw new ForbiddenError('Cross-community data access is strictly prohibited');
    }

    const limit = parseInt(req.query.limit as string) || 50;

    const logs = await auditService.getRecentLogs(targetCommunityId, limit, user.role);

    res.json({
      success: true,
      data: logs,
      count: logs.length,
      retentionPolicyDays: 30,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function cleanupExpiredAuditLogsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const isAllowed = ['PLATFORM_OWNER', 'OWNER', 'CONTROLLER'].includes(user.role);
    if (!isAllowed) {
      throw new ForbiddenError('PERMISSION_REQUIRED: Only controllers and administrators can trigger audit log retention cleanup.');
    }

    const targetCommunityId = req.params.communityId || req.body.communityId || user.communityId;

    const metrics = await auditService.cleanupExpiredLogs(targetCommunityId, 30);

    res.json({
      success: true,
      data: metrics,
      message: `Audit retention cleanup completed: ${metrics.deletedCount} expired records removed, ${metrics.retainedCount} active records retained within 30-day window.`,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}
