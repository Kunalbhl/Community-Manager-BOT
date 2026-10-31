import { communityConfigurationRepository } from '../../repositories/index.js';
import { DateRangeType, UnifiedInsightsOverview } from '../../../shared/types/insights.js';
import { InsightsDateService, ResolvedDateRange } from './insightsDate.service.js';
import { InsightsAggregationService } from './insightsAggregation.service.js';
import { InsightsHealthService } from './insightsHealth.service.js';
import { InsightsQueryService } from './insightsQueryService.js';
import { InsightsExportService, ExportOptions } from './insightsExportService.js';

export class InsightsService {
  /**
   * Resolve timezone and date range authoritatively for a community
   */
  private static async resolveRangeForCommunity(
    communityId: string,
    rangeType: DateRangeType = 'LAST_30_DAYS',
    requestedTimezone?: string,
    customStart?: string,
    customEnd?: string
  ): Promise<ResolvedDateRange> {
    let timezone = requestedTimezone;

    if (!timezone) {
      try {
        const configs = await communityConfigurationRepository.listForTenant(communityId);
        if (configs.length > 0 && configs[0].timezone) {
          timezone = configs[0].timezone;
        }
      } catch {
        // Fallback gracefully to UTC
        timezone = 'UTC';
      }
    }

    return InsightsDateService.resolveDateRange(rangeType, timezone, customStart, customEnd);
  }

  /**
   * Unified Insights Overview
   */
  static async getUnifiedOverview(
    communityId: string,
    rangeType: DateRangeType = 'LAST_30_DAYS',
    requestedTimezone?: string,
    customStart?: string,
    customEnd?: string
  ): Promise<UnifiedInsightsOverview> {
    const range = await this.resolveRangeForCommunity(
      communityId,
      rangeType,
      requestedTimezone,
      customStart,
      customEnd
    );

    return InsightsQueryService.executeCachedQuery(
      communityId,
      'UNIFIED_OVERVIEW',
      range.rangeType,
      range.rangeStart,
      range.rangeEnd,
      range.timezone,
      async () => {
        const [community, engagement, recruitment, moderation, events, automation, health] =
          await Promise.all([
            InsightsAggregationService.aggregateCommunity(communityId, range),
            InsightsAggregationService.aggregateEngagement(communityId, range),
            InsightsAggregationService.aggregateRecruitment(communityId, range),
            InsightsAggregationService.aggregateModeration(communityId, range),
            InsightsAggregationService.aggregateEvents(communityId, range),
            InsightsAggregationService.aggregateAutomation(communityId, range),
            InsightsHealthService.computeHealthIndicator(communityId, range),
          ]);

        const automationSuccessRate = automation.workflowExecutions.value && automation.workflowExecutions.value > 0
          ? Math.round(((automation.successfulExecutions.value || 0) / automation.workflowExecutions.value) * 100)
          : null;

        return {
          metadata: community.metadata,
          health,
          overview: {
            totalMembers: community.totalMembers,
            netGrowth: community.netGrowth,
            deliverySuccessRate: engagement.deliverySuccessRate,
            successfulRecruitments: recruitment.successfulRecruitment,
            activeWarnings: moderation.activeWarnings,
            scheduledEvents: events.scheduled,
            automationSuccessRate: {
              value: automationSuccessRate,
              previousValue: null,
              delta: null,
              deltaPercent: null,
              trend: 'STABLE',
              status: automationSuccessRate !== null ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
            },
          },
          community,
          engagement,
          recruitment,
          moderation,
          events,
          automation,
        };
      }
    );
  }

  /**
   * Community Growth Analytics
   */
  static async getCommunityAnalytics(
    communityId: string,
    rangeType: DateRangeType = 'LAST_30_DAYS',
    requestedTimezone?: string,
    customStart?: string,
    customEnd?: string
  ) {
    const range = await this.resolveRangeForCommunity(
      communityId,
      rangeType,
      requestedTimezone,
      customStart,
      customEnd
    );

    return InsightsQueryService.executeCachedQuery(
      communityId,
      'COMMUNITY',
      range.rangeType,
      range.rangeStart,
      range.rangeEnd,
      range.timezone,
      () => InsightsAggregationService.aggregateCommunity(communityId, range)
    );
  }

  /**
   * Engagement Analytics
   */
  static async getEngagementAnalytics(
    communityId: string,
    rangeType: DateRangeType = 'LAST_30_DAYS',
    requestedTimezone?: string,
    customStart?: string,
    customEnd?: string
  ) {
    const range = await this.resolveRangeForCommunity(
      communityId,
      rangeType,
      requestedTimezone,
      customStart,
      customEnd
    );

    return InsightsQueryService.executeCachedQuery(
      communityId,
      'ENGAGEMENT',
      range.rangeType,
      range.rangeStart,
      range.rangeEnd,
      range.timezone,
      () => InsightsAggregationService.aggregateEngagement(communityId, range)
    );
  }

  /**
   * Recruitment Analytics
   */
  static async getRecruitmentAnalytics(
    communityId: string,
    rangeType: DateRangeType = 'LAST_30_DAYS',
    requestedTimezone?: string,
    customStart?: string,
    customEnd?: string
  ) {
    const range = await this.resolveRangeForCommunity(
      communityId,
      rangeType,
      requestedTimezone,
      customStart,
      customEnd
    );

    return InsightsQueryService.executeCachedQuery(
      communityId,
      'RECRUITMENT',
      range.rangeType,
      range.rangeStart,
      range.rangeEnd,
      range.timezone,
      () => InsightsAggregationService.aggregateRecruitment(communityId, range)
    );
  }

  /**
   * Moderation Analytics
   */
  static async getModerationAnalytics(
    communityId: string,
    rangeType: DateRangeType = 'LAST_30_DAYS',
    requestedTimezone?: string,
    customStart?: string,
    customEnd?: string
  ) {
    const range = await this.resolveRangeForCommunity(
      communityId,
      rangeType,
      requestedTimezone,
      customStart,
      customEnd
    );

    return InsightsQueryService.executeCachedQuery(
      communityId,
      'MODERATION',
      range.rangeType,
      range.rangeStart,
      range.rangeEnd,
      range.timezone,
      () => InsightsAggregationService.aggregateModeration(communityId, range)
    );
  }

  /**
   * Events Analytics
   */
  static async getEventsAnalytics(
    communityId: string,
    rangeType: DateRangeType = 'LAST_30_DAYS',
    requestedTimezone?: string,
    customStart?: string,
    customEnd?: string
  ) {
    const range = await this.resolveRangeForCommunity(
      communityId,
      rangeType,
      requestedTimezone,
      customStart,
      customEnd
    );

    return InsightsQueryService.executeCachedQuery(
      communityId,
      'EVENTS',
      range.rangeType,
      range.rangeStart,
      range.rangeEnd,
      range.timezone,
      () => InsightsAggregationService.aggregateEvents(communityId, range)
    );
  }

  /**
   * Automation Analytics
   */
  static async getAutomationAnalytics(
    communityId: string,
    rangeType: DateRangeType = 'LAST_30_DAYS',
    requestedTimezone?: string,
    customStart?: string,
    customEnd?: string
  ) {
    const range = await this.resolveRangeForCommunity(
      communityId,
      rangeType,
      requestedTimezone,
      customStart,
      customEnd
    );

    return InsightsQueryService.executeCachedQuery(
      communityId,
      'AUTOMATION',
      range.rangeType,
      range.rangeStart,
      range.rangeEnd,
      range.timezone,
      () => InsightsAggregationService.aggregateAutomation(communityId, range)
    );
  }

  /**
   * Community Health Indicator
   */
  static async getHealthIndicator(
    communityId: string,
    rangeType: DateRangeType = 'LAST_30_DAYS',
    requestedTimezone?: string,
    customStart?: string,
    customEnd?: string
  ) {
    const range = await this.resolveRangeForCommunity(
      communityId,
      rangeType,
      requestedTimezone,
      customStart,
      customEnd
    );

    return InsightsQueryService.executeCachedQuery(
      communityId,
      'HEALTH',
      range.rangeType,
      range.rangeStart,
      range.rangeEnd,
      range.timezone,
      () => InsightsHealthService.computeHealthIndicator(communityId, range)
    );
  }

  /**
   * Export Analytics
   */
  static async exportAnalytics(options: ExportOptions) {
    return InsightsExportService.generateExport(options);
  }

  /**
   * Invalidate tenant cache
   */
  static invalidateCache(communityId: string): void {
    InsightsQueryService.invalidateTenant(communityId);
  }
}
