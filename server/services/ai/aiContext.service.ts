import {
  communitiesRepository,
  announcementsRepository,
  eventsRepository,
  automationWorkflowsRepository,
  safetyIncidentsRepository,
  communityConfigurationRepository,
} from '../../repositories/index.js';
import { EntitlementService } from '../entitlement.service.js';
import { InsightsService } from '../insights/insights.service.js';
import { AiCommunityContext } from '../../../shared/types/ai.js';
import { DateRangeType } from '../../../shared/types/insights.js';
import { NotFoundError } from '../../utils/errors.js';
import { AiSafetyService } from './aiSafety.service.js';

export interface BuildContextOptions {
  rangeType?: DateRangeType;
  timezone?: string;
  customStart?: string;
  customEnd?: string;
}

export class AiContextService {
  /**
   * Safe context builder supporting userContext or options parameter overloads
   */
  static async buildSafeContext(
    communityId: string,
    userContextOrOptions?: any,
    options?: BuildContextOptions
  ): Promise<AiCommunityContext> {
    const opts = options || (userContextOrOptions && typeof userContextOrOptions === 'object' && !userContextOrOptions.userId ? userContextOrOptions : undefined);
    return this.buildContext(communityId, opts);
  }

  /**
   * Assembles an authoritative, tenant-authorized, secret-redacted AiCommunityContext.
   * Grounded strictly in Task 20 Insights and verified repository state.
   */
  static async buildContext(
    communityId: string,
    options?: BuildContextOptions
  ): Promise<AiCommunityContext> {
    // 1. Resolve community tenant
    const community = await communitiesRepository.getById(communityId);
    if (!community) {
      throw new NotFoundError(`Community not found: ${communityId}`);
    }

    // 2. Resolve plan and timezone
    const [planDoc, configDocs] = await Promise.all([
      EntitlementService.getPlan(communityId),
      communityConfigurationRepository.listForTenant(communityId),
    ]);

    const timezone =
      options?.timezone ||
      (configDocs.length > 0 && configDocs[0].timezone ? configDocs[0].timezone : 'UTC');
    const rangeType = options?.rangeType || 'LAST_30_DAYS';

    // 3. Pull authoritative Task 20 Unified Insights Overview
    const unifiedInsights = await InsightsService.getUnifiedOverview(
      communityId,
      rangeType,
      timezone,
      options?.customStart,
      options?.customEnd
    );

    const { community: c, engagement: e, recruitment: r, moderation: m, events: ev, automation: a, health: h } =
      unifiedInsights;

    // 4. Query recent operational records
    const [recentAnnouncements, upcomingEvents, activeWorkflows, recentIncidents] = await Promise.all([
      announcementsRepository
        .listForTenant(communityId)
        .then((items) =>
          items
            .sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())
            .slice(0, 5)
            .map((item) => ({
              title: item.title,
              targetChannel: item.channelId,
              status: item.status,
              date: item.scheduledAt || item.createdAt,
            }))
        )
        .catch(() => []),

      eventsRepository
        .listForTenant(communityId)
        .then((items) =>
          items
            .sort((x, y) => new Date(y.startAt).getTime() - new Date(x.startAt).getTime())
            .slice(0, 5)
            .map((item) => ({
              title: item.title,
              scheduledStartTime: item.startAt,
              status: item.status,
              rsvpCount: 0,
            }))
        )
        .catch(() => []),

      automationWorkflowsRepository
        .listForTenant(communityId)
        .then((items) =>
          items
            .filter((wf) => wf.status === 'ACTIVE')
            .slice(0, 5)
            .map((wf) => ({
              name: wf.name,
              triggerType: wf.trigger.type,
              status: wf.status,
            }))
        )
        .catch(() => []),

      safetyIncidentsRepository
        .listForTenant(communityId)
        .then((items) =>
          items
            .sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())
            .slice(0, 5)
            .map((inc) => ({
              title: inc.title || inc.description?.substring(0, 60) || 'Safety Incident',
              severity: inc.severity,
              status: inc.status,
            }))
        )
        .catch(() => []),
    ]);

    // 5. Track limitations & missing data explicitly (NEVER convert missing data to 0)
    const limitations: string[] = [];
    const missingMetrics: string[] = [];

    if (c.estimatedActiveMembers?.status !== 'AVAILABLE' || c.estimatedActiveMembers?.value === null) {
      limitations.push('Estimated active members is currently limited due to Discord telemetry restrictions.');
      missingMetrics.push('estimatedActiveMembers');
    }
    if (c.retentionRate7Day?.status !== 'AVAILABLE' || c.retentionRate7Day?.value === null) {
      limitations.push('7-day retention rate requires a longer member observation window.');
      missingMetrics.push('retentionRate7Day');
    }

    const finalStage = r.funnelStages && r.funnelStages.length > 0
      ? r.funnelStages[r.funnelStages.length - 1]
      : null;
    const conversionRate = finalStage && finalStage.overallConversion !== null
      ? finalStage.overallConversion
      : (
        r.totalApplications?.value && r.totalApplications.value > 0
          ? Math.round(((r.successfulRecruitment?.value || 0) / r.totalApplications.value) * 100)
          : null
      );

    if (conversionRate === null) {
      limitations.push('Recruitment funnel conversion rate lacks sufficient completed application sample size.');
      missingMetrics.push('recruitmentConversionRate');
    }
    if (ev.attendanceRate?.status !== 'AVAILABLE' || ev.attendanceRate?.value === null) {
      limitations.push('Event attendance rate does not have completed checked-in event records in this date window.');
      missingMetrics.push('eventAttendanceRate');
    }
    if (a.workflowExecutions?.status !== 'AVAILABLE' || a.workflowExecutions?.value === null) {
      limitations.push('Automation workflow execution telemetry has insufficient history.');
      missingMetrics.push('automationExecutions');
    }

    // 6. Build the raw context object
    const rawContext: AiCommunityContext = {
      tenant: {
        communityId: community.id,
        communityName: community.name,
        guildId: community.guildId,
        plan: planDoc.plan,
        timezone,
        botConnected: Boolean(community.guildId),
      },
      overview: {
        totalMembers: c.totalMembers?.value ?? null,
        newMembers: c.newMembers?.value ?? null,
        netGrowth: c.netGrowth?.value ?? null,
        growthRate: c.growthRate?.value ?? null,
        estimatedActiveMembers: c.estimatedActiveMembers?.value ?? null,
        retentionRate7Day: c.retentionRate7Day?.value ?? null,
        retentionRate30Day: c.retentionRate30Day?.value ?? null,
      },
      engagement: {
        announcementsSent: e.announcementsSent?.value ?? null,
        activeCampaigns: e.campaignsCount?.value ?? null,
        pollsCount: e.pollsCount?.value ?? null,
        deliverySuccessRate: e.deliverySuccessRate?.value ?? null,
      },
      recruitment: {
        totalApplications: r.totalApplications?.value ?? null,
        accepted: r.approved?.value ?? null,
        rejected: null,
        pending: r.underReview?.value ?? null,
        interviewStage: r.interviewRequired?.value ?? null,
        conversionRate,
        activeRecruiters: r.topRecruiters ? r.topRecruiters.length : null,
      },
      moderation: {
        warningsIssued: m.warnings?.value ?? null,
        blacklistedUsers: m.blacklistedMembers?.value ?? null,
        safetyIncidents: m.openIncidents?.value ?? null,
        automodTriggers: m.automodActions?.value ?? null,
      },
      events: {
        upcomingEventsCount: ev.scheduled?.value ?? null,
        totalRegistrations: ev.registrations?.value ?? null,
        attendanceRate: ev.attendanceRate?.value ?? null,
      },
      automation: {
        activeWorkflowsCount: a.activeWorkflows?.value ?? null,
        recentExecutions: a.workflowExecutions?.value ?? null,
        executionSuccessRate:
          a.workflowExecutions?.value && a.workflowExecutions.value > 0
            ? Math.round(((a.successfulExecutions?.value || 0) / a.workflowExecutions.value) * 100)
            : null,
      },
      health: {
        healthScore: h?.indicatorScore ?? null,
        healthLevel: h?.status ?? null,
        positiveSignals: h?.signals ? h.signals.filter((s) => s.score > 50).map((s) => s.name) : [],
        riskSignals: h?.signals ? h.signals.filter((s) => s.score < 50).map((s) => s.name) : [],
      },
      operationalSummaries: {
        recentAnnouncements,
        upcomingEvents,
        activeWorkflows,
        recentIncidents,
      },
      limitations,
      dataCoverage: {
        coverageStatus: c.metadata.coverage.confidence,
        notes: c.metadata.coverage.notes,
        missingMetrics,
      },
      resolvedPeriod: {
        rangeType: unifiedInsights.metadata.rangeType,
        rangeStart: unifiedInsights.metadata.rangeStart,
        rangeEnd: unifiedInsights.metadata.rangeEnd,
        previousRangeStart: unifiedInsights.metadata.previousRangeStart,
        previousRangeEnd: unifiedInsights.metadata.previousRangeEnd,
        timezone: unifiedInsights.metadata.timezone,
        daysDiff: Math.max(
          1,
          Math.round(
            (new Date(unifiedInsights.metadata.rangeEnd).getTime() -
              new Date(unifiedInsights.metadata.rangeStart).getTime()) /
              (24 * 60 * 60 * 1000)
          )
        ),
      },
      metricComparisons: {
        totalMembers: {
          current: c.totalMembers?.value ?? null,
          previous: c.totalMembers?.previousValue ?? null,
          delta: c.totalMembers?.delta ?? null,
          deltaPercent: c.totalMembers?.deltaPercent ?? null,
          trend: c.totalMembers?.trend ?? 'STABLE',
          status: c.totalMembers?.status ?? 'INSUFFICIENT_DATA',
        },
        netGrowth: {
          current: c.netGrowth?.value ?? null,
          previous: c.netGrowth?.previousValue ?? null,
          delta: c.netGrowth?.delta ?? null,
          deltaPercent: c.netGrowth?.deltaPercent ?? null,
          trend: c.netGrowth?.trend ?? 'STABLE',
          status: c.netGrowth?.status ?? 'INSUFFICIENT_DATA',
        },
        newMembers: {
          current: c.newMembers?.value ?? null,
          previous: c.newMembers?.previousValue ?? null,
          delta: c.newMembers?.delta ?? null,
          deltaPercent: c.newMembers?.deltaPercent ?? null,
          trend: c.newMembers?.trend ?? 'STABLE',
          status: c.newMembers?.status ?? 'INSUFFICIENT_DATA',
        },
        membersLeft: {
          current: c.membersLeft?.value ?? null,
          previous: c.membersLeft?.previousValue ?? null,
          delta: c.membersLeft?.delta ?? null,
          deltaPercent: c.membersLeft?.deltaPercent ?? null,
          trend: c.membersLeft?.trend ?? 'STABLE',
          status: c.membersLeft?.status ?? 'INSUFFICIENT_DATA',
        },
        announcementsSent: {
          current: e.announcementsSent?.value ?? null,
          previous: e.announcementsSent?.previousValue ?? null,
          delta: e.announcementsSent?.delta ?? null,
          deltaPercent: e.announcementsSent?.deltaPercent ?? null,
          trend: e.announcementsSent?.trend ?? 'STABLE',
          status: e.announcementsSent?.status ?? 'INSUFFICIENT_DATA',
        },
        deliverySuccessRate: {
          current: e.deliverySuccessRate?.value ?? null,
          previous: e.deliverySuccessRate?.previousValue ?? null,
          delta: e.deliverySuccessRate?.delta ?? null,
          deltaPercent: e.deliverySuccessRate?.deltaPercent ?? null,
          trend: e.deliverySuccessRate?.trend ?? 'STABLE',
          status: e.deliverySuccessRate?.status ?? 'INSUFFICIENT_DATA',
        },
        totalApplications: {
          current: r.totalApplications?.value ?? null,
          previous: r.totalApplications?.previousValue ?? null,
          delta: r.totalApplications?.delta ?? null,
          deltaPercent: r.totalApplications?.deltaPercent ?? null,
          trend: r.totalApplications?.trend ?? 'STABLE',
          status: r.totalApplications?.status ?? 'INSUFFICIENT_DATA',
        },
        successfulRecruitment: {
          current: r.successfulRecruitment?.value ?? null,
          previous: r.successfulRecruitment?.previousValue ?? null,
          delta: r.successfulRecruitment?.delta ?? null,
          deltaPercent: r.successfulRecruitment?.deltaPercent ?? null,
          trend: r.successfulRecruitment?.trend ?? 'STABLE',
          status: r.successfulRecruitment?.status ?? 'INSUFFICIENT_DATA',
        },
        conversionRate: {
          current: conversionRate,
          previous: null,
          delta: null,
          deltaPercent: null,
          trend: 'STABLE',
          status: conversionRate !== null ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
        },
        warningsIssued: {
          current: m.warnings?.value ?? null,
          previous: m.warnings?.previousValue ?? null,
          delta: m.warnings?.delta ?? null,
          deltaPercent: m.warnings?.deltaPercent ?? null,
          trend: m.warnings?.trend ?? 'STABLE',
          status: m.warnings?.status ?? 'INSUFFICIENT_DATA',
        },
        safetyIncidents: {
          current: m.openIncidents?.value ?? null,
          previous: m.openIncidents?.previousValue ?? null,
          delta: m.openIncidents?.delta ?? null,
          deltaPercent: m.openIncidents?.deltaPercent ?? null,
          trend: m.openIncidents?.trend ?? 'STABLE',
          status: m.openIncidents?.status ?? 'INSUFFICIENT_DATA',
        },
        scheduledEvents: {
          current: ev.scheduled?.value ?? null,
          previous: ev.scheduled?.previousValue ?? null,
          delta: ev.scheduled?.delta ?? null,
          deltaPercent: ev.scheduled?.deltaPercent ?? null,
          trend: ev.scheduled?.trend ?? 'STABLE',
          status: ev.scheduled?.status ?? 'INSUFFICIENT_DATA',
        },
        eventAttendanceRate: {
          current: ev.attendanceRate?.value ?? null,
          previous: ev.attendanceRate?.previousValue ?? null,
          delta: ev.attendanceRate?.delta ?? null,
          deltaPercent: ev.attendanceRate?.deltaPercent ?? null,
          trend: ev.attendanceRate?.trend ?? 'STABLE',
          status: ev.attendanceRate?.status ?? 'INSUFFICIENT_DATA',
        },
        activeWorkflows: {
          current: a.activeWorkflows?.value ?? null,
          previous: a.activeWorkflows?.previousValue ?? null,
          delta: a.activeWorkflows?.delta ?? null,
          deltaPercent: a.activeWorkflows?.deltaPercent ?? null,
          trend: a.activeWorkflows?.trend ?? 'STABLE',
          status: a.activeWorkflows?.status ?? 'INSUFFICIENT_DATA',
        },
        workflowExecutions: {
          current: a.workflowExecutions?.value ?? null,
          previous: a.workflowExecutions?.previousValue ?? null,
          delta: a.workflowExecutions?.delta ?? null,
          deltaPercent: a.workflowExecutions?.deltaPercent ?? null,
          trend: a.workflowExecutions?.trend ?? 'STABLE',
          status: a.workflowExecutions?.status ?? 'INSUFFICIENT_DATA',
        },
        healthScore: {
          current: h?.indicatorScore ?? null,
          previous: null,
          delta: null,
          deltaPercent: null,
          trend: h?.trend ?? 'STABLE',
          status: h?.status ?? 'INSUFFICIENT_DATA',
        },
      },
      funnelStages: r.funnelStages
        ? r.funnelStages.map((s) => ({
            stage: s.stage,
            label: s.label,
            count: s.count,
            conversionFromPrevious: s.conversionFromPrevious,
            overallConversion: s.overallConversion,
            dropOff: s.dropOff,
          }))
        : [],
      healthSignals: h?.signals
        ? h.signals.map((s) => ({
            name: s.name,
            key: s.key,
            status: s.status,
            value: s.value,
            displayValue: s.displayValue,
            score: s.score,
            trend: s.trend,
            description: s.description,
          }))
        : [],
      generatedAt: new Date().toISOString(),
    };

    // 7. Sanitize completely against secret leakage
    const { sanitized } = AiSafetyService.redactSecrets<AiCommunityContext>(rawContext);
    return sanitized;
  }
}
