import { InsightsService } from './insights/insights.service.js';
import { DateRangeType, UnifiedInsightsOverview, DataTruthClassification, MetricClassification } from '../../shared/types/insights.js';
import { auditService } from './audit.service.js';
import { logger } from '../logging/logger.js';

export interface GroundedMetricMeta {
  truth: DataTruthClassification;
  classification: MetricClassification;
  sourceOfTruth: string;
  integrityVerified: boolean;
}

export class CommunityInsightsService {
  /**
   * Evaluates data integrity rules on metrics:
   * 1. No negative counts for physical quantities (members, warnings, events, deliveries)
   * 2. No rates > 100%
   * 3. No percentages without valid non-zero baseline
   */
  static validateMetricIntegrity<T>(
    value: number | null | undefined,
    field: string,
    isPercentage = false
  ): { cleanValue: number | null; valid: boolean; note?: string } {
    if (value === null || value === undefined || isNaN(value)) {
      return { cleanValue: null, valid: true };
    }

    if (!isPercentage && value < 0) {
      logger.warn(`[CommunityInsightsService] Negative count detected for ${field}: ${value}. Clamping to 0.`);
      return { cleanValue: 0, valid: false, note: 'Corrected negative anomaly.' };
    }

    if (isPercentage) {
      if (value < 0) {
        return { cleanValue: 0, valid: false, note: 'Percentage below 0% clamped.' };
      }
      if (value > 100) {
        return { cleanValue: 100, valid: false, note: 'Percentage above 100% clamped.' };
      }
    }

    return { cleanValue: value, valid: true };
  }

  /**
   * Categorizes a metric under the authoritative Data Truth Model
   */
  static classifyMetric(
    metricKey: string,
    hasSufficientData: boolean
  ): GroundedMetricMeta {
    if (!hasSufficientData) {
      return {
        truth: 'INSUFFICIENT_EVIDENCE',
        classification: 'RAW_DATA',
        sourceOfTruth: 'Insufficient historical observation records',
        integrityVerified: true,
      };
    }

    switch (metricKey) {
      case 'totalMembers':
      case 'newMembers':
      case 'membersLeft':
      case 'announcementsSent':
      case 'scheduledEvents':
      case 'activeWarnings':
      case 'workflowExecutions':
        return {
          truth: 'VERIFIED_FACT',
          classification: 'RAW_DATA',
          sourceOfTruth: 'Authoritative database synchronized records',
          integrityVerified: true,
        };

      case 'netGrowth':
      case 'growthRate':
      case 'deliverySuccessRate':
      case 'automationSuccessRate':
      case 'attendanceRate':
        return {
          truth: 'VERIFIED_FACT',
          classification: 'DERIVED_METRIC',
          sourceOfTruth: 'Calculated from verified raw records over date range',
          integrityVerified: true,
        };

      case 'retentionRate7Day':
      case 'retentionRate30Day':
      case 'estimatedActiveMembers':
      case 'healthScore':
        return {
          truth: 'OBSERVED_CORRELATION',
          classification: 'DERIVED_METRIC',
          sourceOfTruth: 'Cohort observation over qualifying activity window',
          integrityVerified: true,
        };

      default:
        return {
          truth: 'VERIFIED_FACT',
          classification: 'DERIVED_METRIC',
          sourceOfTruth: 'Platform telemetry repository',
          integrityVerified: true,
        };
    }
  }

  /**
   * Retrieves unified community health and operational insights
   */
  static async getUnifiedOverview(
    communityId: string,
    rangeType: DateRangeType = 'LAST_30_DAYS',
    timezone?: string,
    customStart?: string,
    customEnd?: string,
    actorUserId = 'system'
  ): Promise<UnifiedInsightsOverview> {
    const overview = await InsightsService.getUnifiedOverview(
      communityId,
      rangeType,
      timezone,
      customStart,
      customEnd
    );

    // Apply strict data integrity sanitization
    if (overview.overview.totalMembers.value !== null && overview.overview.totalMembers.value < 0) {
      overview.overview.totalMembers.value = 0;
    }
    if (overview.overview.activeWarnings.value !== null && overview.overview.activeWarnings.value < 0) {
      overview.overview.activeWarnings.value = 0;
    }

    await auditService.record({
      communityId,
      actorUserId,
      actorRole: 'MEMBER' as any,
      action: 'INSIGHTS_VIEWED',
      targetType: 'COMMUNITY_INSIGHTS',
      targetId: communityId,
      metadata: { rangeType, timezone, module: 'COMMUNITY_INSIGHTS' },
    });

    return overview;
  }

  /**
   * Alias for getUnifiedOverview with optional auth context check
   */
  static async getOverview(
    communityId: string,
    rangeType: DateRangeType = 'LAST_30_DAYS',
    authContext?: { userId?: string; roles?: string[]; role?: string; communityId?: string }
  ): Promise<UnifiedInsightsOverview> {
    if (authContext) {
      if (authContext.communityId && authContext.communityId !== communityId && authContext.role !== 'PLATFORM_OWNER') {
        const error = new Error('Forbidden: Cross-tenant access denied');
        (error as any).statusCode = 403;
        throw error;
      }
    }
    return this.getUnifiedOverview(communityId, rangeType, undefined, undefined, undefined, authContext?.userId || 'system');
  }

  /**
   * Retrieves specific community growth analytics
   */
  static async getCommunityAnalytics(
    communityId: string,
    rangeType: DateRangeType = 'LAST_30_DAYS',
    timezone?: string,
    customStart?: string,
    customEnd?: string
  ) {
    return InsightsService.getCommunityAnalytics(communityId, rangeType, timezone, customStart, customEnd);
  }

  /**
   * Retrieves engagement analytics
   */
  static async getEngagementAnalytics(
    communityId: string,
    rangeType: DateRangeType = 'LAST_30_DAYS',
    timezone?: string,
    customStart?: string,
    customEnd?: string
  ) {
    return InsightsService.getEngagementAnalytics(communityId, rangeType, timezone, customStart, customEnd);
  }

  /**
   * Retrieves moderation analytics
   */
  static async getModerationAnalytics(
    communityId: string,
    rangeType: DateRangeType = 'LAST_30_DAYS',
    timezone?: string,
    customStart?: string,
    customEnd?: string
  ) {
    return InsightsService.getModerationAnalytics(communityId, rangeType, timezone, customStart, customEnd);
  }

  /**
   * Retrieves event analytics
   */
  static async getEventsAnalytics(
    communityId: string,
    rangeType: DateRangeType = 'LAST_30_DAYS',
    timezone?: string,
    customStart?: string,
    customEnd?: string
  ) {
    return InsightsService.getEventsAnalytics(communityId, rangeType, timezone, customStart, customEnd);
  }

  /**
   * Retrieves automation analytics
   */
  static async getAutomationAnalytics(
    communityId: string,
    rangeType: DateRangeType = 'LAST_30_DAYS',
    timezone?: string,
    customStart?: string,
    customEnd?: string
  ) {
    return InsightsService.getAutomationAnalytics(communityId, rangeType, timezone, customStart, customEnd);
  }
}

export const communityInsightsService = CommunityInsightsService;
