import { Request, Response, NextFunction } from 'express';
import { InsightsService } from '../services/insights/index.js';
import { EntitlementService } from '../services/entitlement.service.js';
import { auditService } from '../services/audit.service.js';
import { DateRangeType } from '../../shared/types/insights.js';
import { logger } from '../logging/logger.js';
import { RecruitmentAnalyticsService } from '../services/recruitmentAnalytics.service.js';
import { RetentionIntelligenceService } from '../services/retentionIntelligence.service.js';
import { communityBrainService } from '../services/ai/communityBrain.service.js';
import { CommunityInsightsService } from '../services/communityInsights.service.js';

interface AuthenticatedUser {
  id: string;
  role: string;
  communityId?: string;
}

function getCommunityId(req: Request): string {
  const user = (req as Request & { user?: AuthenticatedUser }).user;
  const userCommunityId = user?.communityId;
  const headerCommunityId = req.headers['x-community-id'] as string;
  const queryCommunityId = req.query.communityId as string;

  const targetId = userCommunityId || headerCommunityId || queryCommunityId;
  if (!targetId) {
    throw { statusCode: 400, message: 'Community ID required for multi-tenant analytics isolation.' };
  }

  // Tenant Boundary Check: users can only query their authorized community
  if (userCommunityId && targetId !== userCommunityId && user?.role !== 'PLATFORM_OWNER') {
    throw { statusCode: 403, message: 'Forbidden: Cross-tenant analytics access denied.' };
  }

  return targetId;
}

function parseRangeParams(req: Request): {
  rangeType: DateRangeType;
  timezone?: string;
  customStart?: string;
  customEnd?: string;
} {
  const rawRange = (req.query.range as string || req.query.rangeType as string || 'LAST_30_DAYS').toUpperCase();
  let rangeType: DateRangeType = 'LAST_30_DAYS';

  if (rawRange === 'TODAY') rangeType = 'TODAY';
  else if (rawRange === 'LAST_7_DAYS' || rawRange === '7D') rangeType = 'LAST_7_DAYS';
  else if (rawRange === 'LAST_30_DAYS' || rawRange === '30D') rangeType = 'LAST_30_DAYS';
  else if (rawRange === 'LAST_90_DAYS' || rawRange === '90D') rangeType = 'LAST_90_DAYS';
  else if (rawRange === 'CUSTOM') rangeType = 'CUSTOM';

  const timezone = (req.query.timezone as string) || (req.headers['x-timezone'] as string);
  const customStart = req.query.startDate as string || req.query.customStart as string;
  const customEnd = req.query.endDate as string || req.query.customEnd as string;

  return { rangeType, timezone, customStart, customEnd };
}

export class InsightsController {
  /**
   * GET /api/v1/insights/overview
   */
  static async getOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      const { rangeType, timezone, customStart, customEnd } = parseRangeParams(req);

      // Entitlement check for long-range analytics (90d or custom)
      if (rangeType === 'LAST_90_DAYS' || rangeType === 'CUSTOM') {
        const hasAdvanced = await EntitlementService.hasFeature(communityId, 'ADVANCED_ANALYTICS');
        if (!hasAdvanced) {
          logger.info(`[INSIGHTS] Tenant ${communityId} lacks ADVANCED_ANALYTICS entitlement for ${rangeType}, falling back to LAST_30_DAYS`);
        }
      }

      const overview = await InsightsService.getUnifiedOverview(
        communityId,
        rangeType,
        timezone,
        customStart,
        customEnd
      );

      // Audit read
      const user = (req as Request & { user?: AuthenticatedUser }).user;
      if (user) {
        await auditService.record({
          communityId,
          actorUserId: user.id,
          actorRole: user.role as any,
          action: 'INSIGHTS_VIEWED',
          targetType: 'INSIGHTS_OVERVIEW',
          targetId: communityId,
          metadata: { rangeType, timezone },
        });
      }

      res.json({
        success: true,
        data: overview,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/insights/community
   */
  static async getCommunity(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      const { rangeType, timezone, customStart, customEnd } = parseRangeParams(req);

      const data = await InsightsService.getCommunityAnalytics(
        communityId,
        rangeType,
        timezone,
        customStart,
        customEnd
      );

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/insights/engagement
   */
  static async getEngagement(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      const { rangeType, timezone, customStart, customEnd } = parseRangeParams(req);

      const data = await InsightsService.getEngagementAnalytics(
        communityId,
        rangeType,
        timezone,
        customStart,
        customEnd
      );

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/insights/recruitment
   */
  static async getRecruitment(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      const { rangeType, timezone, customStart, customEnd } = parseRangeParams(req);

      const hasFeature = await EntitlementService.hasFeature(communityId, 'RECRUITMENT_ANALYTICS');
      if (!hasFeature) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ENTITLEMENT_REQUIRED',
            message: 'Recruitment Analytics feature is not enabled for your subscription plan.',
          },
        });
      }

      const data = await InsightsService.getRecruitmentAnalytics(
        communityId,
        rangeType,
        timezone,
        customStart,
        customEnd
      );

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/insights/moderation
   */
  static async getModeration(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      const { rangeType, timezone, customStart, customEnd } = parseRangeParams(req);

      const hasFeature = await EntitlementService.hasFeature(communityId, 'MODERATION_ANALYTICS');
      if (!hasFeature) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ENTITLEMENT_REQUIRED',
            message: 'Moderation Analytics feature is not enabled for your subscription plan.',
          },
        });
      }

      const data = await InsightsService.getModerationAnalytics(
        communityId,
        rangeType,
        timezone,
        customStart,
        customEnd
      );

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/insights/events
   */
  static async getEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      const { rangeType, timezone, customStart, customEnd } = parseRangeParams(req);

      const hasFeature = await EntitlementService.hasFeature(communityId, 'EVENT_ANALYTICS');
      if (!hasFeature) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ENTITLEMENT_REQUIRED',
            message: 'Event Analytics feature is not enabled for your subscription plan.',
          },
        });
      }

      const data = await InsightsService.getEventsAnalytics(
        communityId,
        rangeType,
        timezone,
        customStart,
        customEnd
      );

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/insights/automation
   */
  static async getAutomation(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      const { rangeType, timezone, customStart, customEnd } = parseRangeParams(req);

      const hasFeature = await EntitlementService.hasFeature(communityId, 'AUTOMATION_ANALYTICS');
      if (!hasFeature) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ENTITLEMENT_REQUIRED',
            message: 'Automation Analytics feature is not enabled for your subscription plan.',
          },
        });
      }

      const data = await InsightsService.getAutomationAnalytics(
        communityId,
        rangeType,
        timezone,
        customStart,
        customEnd
      );

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/insights/health
   */
  static async getHealth(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      const { rangeType, timezone, customStart, customEnd } = parseRangeParams(req);

      const data = await InsightsService.getHealthIndicator(
        communityId,
        rangeType,
        timezone,
        customStart,
        customEnd
      );

      const user = (req as Request & { user?: AuthenticatedUser }).user;
      if (user) {
        await auditService.record({
          communityId,
          actorUserId: user.id,
          actorRole: user.role as any,
          action: 'COMMUNITY_HEALTH_VIEWED',
          targetType: 'COMMUNITY_HEALTH',
          targetId: communityId,
          metadata: { score: data.indicatorScore, status: data.status },
        });
      }

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/insights/export
   */
  static async exportData(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      const user = (req as Request & { user?: AuthenticatedUser }).user;

      if (!user) {
        return res.status(401).json({ success: false, error: 'Authentication required for export.' });
      }

      const hasExportEntitlement = await EntitlementService.hasFeature(communityId, 'ANALYTICS_EXPORTS');
      if (!hasExportEntitlement) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'ENTITLEMENT_REQUIRED',
            message: 'Analytics Exports feature is not enabled for your subscription plan.',
          },
        });
      }

      const domain = (req.body.domain as string || 'OVERVIEW').toUpperCase();
      const format = (req.body.format as string || 'csv').toLowerCase() as 'csv' | 'json';
      const { rangeType, timezone, customStart, customEnd } = parseRangeParams(req);

      // Fetch appropriate domain data
      let rawData: Record<string, unknown> = {};
      if (domain === 'COMMUNITY') {
        rawData = (await InsightsService.getCommunityAnalytics(communityId, rangeType, timezone, customStart, customEnd)) as any;
      } else if (domain === 'ENGAGEMENT') {
        rawData = (await InsightsService.getEngagementAnalytics(communityId, rangeType, timezone, customStart, customEnd)) as any;
      } else if (domain === 'RECRUITMENT') {
        rawData = (await InsightsService.getRecruitmentAnalytics(communityId, rangeType, timezone, customStart, customEnd)) as any;
      } else if (domain === 'MODERATION') {
        rawData = (await InsightsService.getModerationAnalytics(communityId, rangeType, timezone, customStart, customEnd)) as any;
      } else if (domain === 'EVENTS') {
        rawData = (await InsightsService.getEventsAnalytics(communityId, rangeType, timezone, customStart, customEnd)) as any;
      } else if (domain === 'AUTOMATION') {
        rawData = (await InsightsService.getAutomationAnalytics(communityId, rangeType, timezone, customStart, customEnd)) as any;
      } else {
        rawData = (await InsightsService.getUnifiedOverview(communityId, rangeType, timezone, customStart, customEnd)) as any;
      }

      const exportResult = await InsightsService.exportAnalytics({
        communityId,
        actorUserId: user.id,
        actorRole: user.role as any,
        domain,
        format,
        data: rawData,
        rangeType,
        rangeStart: (rawData.metadata as any)?.rangeStart || new Date().toISOString(),
        rangeEnd: (rawData.metadata as any)?.rangeEnd || new Date().toISOString(),
        ipAddress: req.ip,
      });

      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
      res.setHeader('Content-Type', exportResult.contentType);
      return res.send(exportResult.content);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/insights/cache/invalidate
   */
  static async invalidateCache(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      InsightsService.invalidateCache(communityId);
      res.json({ success: true, message: `Cache invalidated for tenant ${communityId}` });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================================================
  // TASK 85: RECRUITMENT ANALYTICS ENDPOINTS
  // ==========================================================================

  /**
   * GET /api/v1/insights/recruitment/funnel
   */
  static async getRecruitmentFunnel(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      const cohortId = req.query.cohortId as string | undefined;
      const user = (req as Request & { user?: AuthenticatedUser }).user;

      const funnel = await RecruitmentAnalyticsService.getRecruitmentFunnel(
        communityId,
        cohortId,
        user?.id || 'system'
      );
      res.json({ success: true, data: funnel });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/insights/recruitment/recruiters
   */
  static async getRecruiterPerformance(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      const range = (req.query.range as any) || 'all';

      const data = await RecruitmentAnalyticsService.getRecruiterPerformance(communityId, range);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/insights/recruitment/campaigns
   */
  static async getCampaignPerformance(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      const data = await RecruitmentAnalyticsService.getCampaignPerformance(communityId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/insights/recruitment/sources
   */
  static async getSourcePerformance(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      const data = await RecruitmentAnalyticsService.getSourcePerformance(communityId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================================================
  // TASK 85: RETENTION INTELLIGENCE ENDPOINTS
  // ==========================================================================

  /**
   * GET /api/v1/insights/retention/cohorts
   */
  static async getRetentionCohorts(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      const user = (req as Request & { user?: AuthenticatedUser }).user;

      const matrix = await RetentionIntelligenceService.getCohortMatrix(
        communityId,
        user?.id || 'system'
      );
      res.json({ success: true, data: matrix });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/insights/retention/alerts
   */
  static async getRetentionAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      const alerts = await RetentionIntelligenceService.getRetentionAlerts(communityId);
      res.json({ success: true, data: alerts });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/insights/retention/onboarding
   */
  static async getRetentionOnboarding(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      const onboarding = await RetentionIntelligenceService.getOnboardingQuality(communityId);
      res.json({ success: true, data: onboarding });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/insights/retention/crossovers
   */
  static async getRetentionCrossovers(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      const crossovers = await RetentionIntelligenceService.getCrossovers(communityId);
      res.json({ success: true, data: crossovers });
    } catch (err) {
      next(err);
    }
  }

  // ==========================================================================
  // TASK 85: COMMUNITY BRAIN AI ENDPOINTS
  // ==========================================================================

  /**
   * GET /api/v1/insights/brain/status
   */
  static async getBrainStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      const status = await communityBrainService.getProviderStatus(communityId);
      res.json({ success: true, data: status });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/insights/brain/query
   */
  static async queryBrain(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = getCommunityId(req);
      const user = (req as Request & { user?: AuthenticatedUser }).user;

      if (!user) {
        return res.status(401).json({ success: false, error: 'Authentication required.' });
      }

      const userContext = {
        userId: user.id,
        role: user.role as any,
        communityId,
      };

      const response = await communityBrainService.queryBrain(
        communityId,
        userContext,
        req.body,
        { requestId: req.id }
      );

      res.json({ success: true, data: response });
    } catch (err) {
      next(err);
    }
  }
}
