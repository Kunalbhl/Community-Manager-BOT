import { Request, Response, NextFunction } from 'express';
import { analyticsService, DateRangeFilter } from '../services/analytics.service.js';
import { BadRequestError, ForbiddenError } from '../utils/errors.js';

export async function getReportsSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId =
      (req.query.communityId as string) ||
      (req.headers['x-community-id'] as string) ||
      req.user?.communityId;

    if (!communityId) {
      throw new BadRequestError('Community ID is required for analytics reporting');
    }

    // Tenant isolation verification
    if (req.user?.communityId && req.user.communityId !== communityId && req.user.role !== 'PLATFORM_OWNER') {
      throw new ForbiddenError('Cross-tenant analytics access denied');
    }

    const range = req.query.range as any;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;

    const filter: DateRangeFilter = { range, startDate, endDate };
    const analytics = await analyticsService.getCommunityAnalytics(communityId, filter);

    res.json({
      success: true,
      data: analytics,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function exportReports(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId, format = 'json', category = 'all' } = req.body;

    const targetCommunityId =
      communityId || (req.headers['x-community-id'] as string) || req.user?.communityId;

    if (!targetCommunityId) {
      throw new BadRequestError('Community ID is required for report export');
    }

    if (req.user?.communityId && req.user.communityId !== targetCommunityId && req.user.role !== 'PLATFORM_OWNER') {
      throw new ForbiddenError('Cross-tenant report export denied');
    }

    const actorUserId = req.user?.userId || 'system_user';
    const result = await analyticsService.exportCommunityReport(
      targetCommunityId,
      format === 'csv' ? 'csv' : 'json',
      category,
      actorUserId
    );

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      return res.status(200).send(result.content);
    }

    res.json({
      success: true,
      data: JSON.parse(result.content),
      filename: result.filename,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}
