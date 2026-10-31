import type { UserAuthContext } from '../../../shared/types/rbac.js';
import { canAccessTenant, hasPermission } from '../../security/rbac.js';
import { ForbiddenError, BadRequestError } from '../../utils/errors.js';
import { communityInsightsService } from '../communityInsights.service.js';
import { recruitmentAnalyticsService } from '../recruitmentAnalytics.service.js';
import { safetyIncidentService } from '../moderation.service.js';
import { integrationCenterService } from '../integrationCenter.service.js';
import { retentionIntelligenceService } from '../retentionIntelligence.service.js';
import { DateRangeType } from '../../../shared/types/insights.js';

export type ReportType =
  | 'WEEKLY_COMMUNITY'
  | 'RECRUITMENT'
  | 'MODERATION'
  | 'ENGAGEMENT'
  | 'EVENTS'
  | 'AUTOMATION'
  | 'INTEGRATION_HEALTH'
  | 'RETENTION';

export interface GeneratedReport {
  reportId: string;
  communityId: string;
  reportType: ReportType;
  title: string;
  period: string;
  generatedAt: string;
  generatedBy: string;
  summary: string;
  metrics: Record<string, { label: string; value: any; trend?: string }>;
  observedChanges: string[];
  possibleExplanations: string[];
  recommendedActions: string[];
  dataQualityNotes: string[];
  aiInterpretation: string;
}

export class ReportGeneratorService {
  /**
   * Generates a factual community report grounded in real platform data.
   */
  static async generateReport(
    communityId: string,
    userContext: UserAuthContext,
    reportType: ReportType,
    dateRange: DateRangeType = 'LAST_30_DAYS'
  ): Promise<GeneratedReport> {
    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError(`Cross-tenant report generation denied for tenant ${communityId}`);
    }

    if (!hasPermission(userContext, 'reports.view')) {
      throw new ForbiddenError('Permission reports.view required to generate reports');
    }

    const nowIso = new Date().toISOString();
    const overview = await communityInsightsService.getOverview(communityId, dateRange);

    const metrics: Record<string, { label: string; value: any; trend?: string }> = {};
    const observedChanges: string[] = [];
    const possibleExplanations: string[] = [];
    const recommendedActions: string[] = [];
    const dataQualityNotes: string[] = [];

    let title = 'Community Performance Report';
    let summary = '';
    let aiInterpretation = '';

    if (reportType === 'RECRUITMENT') {
      title = 'Recruitment & Candidate Pipeline Report';
      const funnel = await recruitmentAnalyticsService.getRecruitmentFunnel(communityId);
      metrics['totalApplications'] = { label: 'Total Applications', value: funnel.totalObserved };
      metrics['stagesCount'] = { label: 'Active Funnel Stages', value: funnel.stages.length };

      summary = `During ${dateRange}, a total of ${funnel.totalObserved} candidate applications were observed across ${funnel.stages.length} recruitment pipeline stages.`;
      if (funnel.totalObserved === 0) {
        dataQualityNotes.push('No new candidate applications submitted in selected observation window.');
      } else {
        recommendedActions.push('Review interviewer evaluation turnaround times in Recruitment module.');
      }
      aiInterpretation = 'Candidate pipeline metrics reflect real database submissions. No synthetic values applied.';
    } else if (reportType === 'MODERATION') {
      title = 'Moderation & Community Safety Report';
      const modStats = await safetyIncidentService.getIncidents(communityId);
      const activeCount = modStats.filter((i: any) => i.status === 'ACTIVE' || i.status === 'OPEN').length;
      metrics['activeWarnings'] = { label: 'Active Member Warnings', value: activeCount };
      metrics['totalIncidents'] = { label: 'Total Incidents Recorded', value: modStats.length };

      summary = `Community safety status shows ${activeCount} active incidents and ${modStats.length} total incidents recorded.`;
      if (activeCount > 0) {
        observedChanges.push(`${activeCount} active safety incidents currently recorded.`);
        recommendedActions.push('Check active sanction expiration dates in Safety & Moderation tab.');
      }
      aiInterpretation = 'Safety report compiled from authoritative moderation incident logs.';
    } else if (reportType === 'INTEGRATION_HEALTH') {
      title = 'Integration Connectivity & Gateway Report';
      const report = await integrationCenterService.getUnifiedStatus(communityId);
      metrics['overallHealth'] = { label: 'Overall Health Status', value: report.overallHealth };

      summary = `Integration Center overall health status is currently ${report.overallHealth}.`;
      if (report.overallHealth !== 'HEALTHY') {
        observedChanges.push(`Integration service reporting status: ${report.overallHealth}`);
        recommendedActions.push('Re-authorize degraded services in Integration Center.');
      }
      aiInterpretation = 'Integration health calculated directly from active API status checks.';
    } else if (reportType === 'RETENTION') {
      title = 'Member Retention & Cohort Quality Report';
      const onboarding = await retentionIntelligenceService.getOnboardingQuality(communityId);
      const rateText = typeof onboarding.overallCompletionRate === 'number' ? `${(onboarding.overallCompletionRate * 100).toFixed(1)}%` : 'Insufficient Data';
      metrics['onboardingRate'] = { label: 'Onboarding Completion Rate', value: rateText };

      summary = `Member onboarding quality completion rate is currently ${rateText}.`;
      aiInterpretation = 'Retention metrics calculated from historical member join and activity timestamps.';
    } else {
      // WEEKLY_COMMUNITY, ENGAGEMENT, EVENTS, AUTOMATION
      title = 'Weekly Community Operational Summary';
      metrics['totalMembers'] = { label: 'Total Members', value: overview.overview.totalMembers.value };
      metrics['netGrowth'] = { label: 'Net Growth', value: overview.overview.netGrowth.value };
      metrics['deliverySuccessRate'] = { label: 'Delivery Success Rate', value: `${overview.overview.deliverySuccessRate.value}%` };
      metrics['healthScore'] = { label: 'Health Score Index', value: overview.health.indicatorScore };

      summary = `Community currently has ${overview.overview.totalMembers.value} members with net growth of ${overview.overview.netGrowth.value} in ${dateRange}. Health score is ${overview.health.indicatorScore}/100.`;
      observedChanges.push(`Health score evaluated at ${overview.health.indicatorScore}/100.`);
      recommendedActions.push('Maintain active event schedule and regular community announcements.');
      aiInterpretation = 'Operational summary grounded in verified platform analytics overview.';
    }

    return {
      reportId: `rep_${Date.now()}`,
      communityId,
      reportType,
      title,
      period: dateRange,
      generatedAt: nowIso,
      generatedBy: userContext.userId,
      summary,
      metrics,
      observedChanges,
      possibleExplanations,
      recommendedActions,
      dataQualityNotes,
      aiInterpretation,
    };
  }
}
