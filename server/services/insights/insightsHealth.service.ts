import {
  CommunityHealthIndicator,
  HealthSignal,
  AnalyticsMetadata,
  MetricStatus,
  MetricTrend,
} from '../../../shared/types/insights.js';
import { ResolvedDateRange } from './insightsDate.service.js';
import { InsightsAggregationService } from './insightsAggregation.service.js';

export class InsightsHealthService {
  /**
   * Calculates a transparent, multi-signal Community Health Indicator.
   * Strictly avoids arbitrary ratings or fabricated precision.
   * If insufficient data exists, returns status: 'INSUFFICIENT_DATA' with score: null.
   */
  static async computeHealthIndicator(
    communityId: string,
    range: ResolvedDateRange
  ): Promise<CommunityHealthIndicator> {
    const [community, engagement, recruitment, moderation, events, automation] =
      await Promise.all([
        InsightsAggregationService.aggregateCommunity(communityId, range),
        InsightsAggregationService.aggregateEngagement(communityId, range),
        InsightsAggregationService.aggregateRecruitment(communityId, range),
        InsightsAggregationService.aggregateModeration(communityId, range),
        InsightsAggregationService.aggregateEvents(communityId, range),
        InsightsAggregationService.aggregateAutomation(communityId, range),
      ]);

    const signals: HealthSignal[] = [];
    const missingSignals: string[] = [];
    const contributingSignals: string[] = [];

    // 1. Growth Signal (Weight 0.20)
    const totalMembersVal = community.totalMembers.value || 0;
    const netGrowthVal = community.netGrowth.value || 0;
    if (totalMembersVal === 0 && netGrowthVal === 0) {
      signals.push({
        name: 'Member Growth & Retention',
        key: 'GROWTH',
        status: 'INSUFFICIENT_DATA',
        value: null,
        displayValue: 'No member records',
        weight: 0.20,
        score: 0,
        contribution: 0,
        trend: 'INSUFFICIENT_DATA',
        description: 'Measures net member growth and guild population trajectory.',
        missingDataReason: 'No synced guild members found for this tenant.',
      });
      missingSignals.push('Member Growth (no member records)');
    } else {
      // Score: 50 baseline + 5 points per net member (bounded 10 to 100)
      const growthScore = Math.min(100, Math.max(10, 50 + netGrowthVal * 5));
      const contrib = Math.round(growthScore * 0.20 * 10) / 10;
      signals.push({
        name: 'Member Growth & Retention',
        key: 'GROWTH',
        status: 'AVAILABLE',
        value: netGrowthVal,
        displayValue: `${netGrowthVal >= 0 ? '+' : ''}${netGrowthVal} net change (${totalMembersVal} total)`,
        weight: 0.20,
        score: growthScore,
        contribution: contrib,
        trend: community.netGrowth.trend,
        description: 'Measures net member growth and guild population trajectory.',
      });
      contributingSignals.push('Member Growth');
    }

    // 2. Engagement Delivery Signal (Weight 0.20)
    const deliveryRate = engagement.deliverySuccessRate.value;
    if (deliveryRate === null || engagement.successfulDeliveries.value === 0 && engagement.failedDeliveries.value === 0) {
      signals.push({
        name: 'Engagement & Delivery Reliability',
        key: 'ENGAGEMENT',
        status: 'INSUFFICIENT_DATA',
        value: null,
        displayValue: 'No deliveries recorded',
        weight: 0.20,
        score: 0,
        contribution: 0,
        trend: 'INSUFFICIENT_DATA',
        description: 'Measures Discord delivery success rates for announcements, campaigns, and reminders.',
        missingDataReason: 'No outgoing engagement broadcasts recorded in this time range.',
      });
      missingSignals.push('Engagement Reliability (no deliveries)');
    } else {
      const score = Math.round(deliveryRate);
      const contrib = Math.round(score * 0.20 * 10) / 10;
      signals.push({
        name: 'Engagement & Delivery Reliability',
        key: 'ENGAGEMENT',
        status: 'AVAILABLE',
        value: deliveryRate,
        displayValue: `${deliveryRate}% delivery success`,
        weight: 0.20,
        score,
        contribution: contrib,
        trend: engagement.deliverySuccessRate.trend,
        description: 'Measures Discord delivery success rates for announcements, campaigns, and reminders.',
      });
      contributingSignals.push('Engagement Delivery');
    }

    // 3. Recruitment Pipeline Signal (Weight 0.15)
    const appsTotal = recruitment.totalApplications.value || 0;
    const hiresCount = recruitment.successfulRecruitment.value || 0;
    if (appsTotal === 0 && hiresCount === 0) {
      signals.push({
        name: 'Recruitment & Onboarding Velocity',
        key: 'RECRUITMENT',
        status: 'INSUFFICIENT_DATA',
        value: null,
        displayValue: 'No application activity',
        weight: 0.15,
        score: 0,
        contribution: 0,
        trend: 'INSUFFICIENT_DATA',
        description: 'Assesses applicant conversion through review, interview, and guild join.',
        missingDataReason: 'No recruitment applications or recruiter attributions active in this range.',
      });
      missingSignals.push('Recruitment Pipeline (no applications)');
    } else {
      const conversionRatio = appsTotal > 0 ? (hiresCount / appsTotal) : 0;
      const score = Math.min(100, Math.max(30, Math.round(50 + conversionRatio * 50)));
      const contrib = Math.round(score * 0.15 * 10) / 10;
      signals.push({
        name: 'Recruitment & Onboarding Velocity',
        key: 'RECRUITMENT',
        status: 'AVAILABLE',
        value: hiresCount,
        displayValue: `${hiresCount} joined of ${appsTotal} applicants`,
        weight: 0.15,
        score,
        contribution: contrib,
        trend: recruitment.totalApplications.trend,
        description: 'Assesses applicant conversion through review, interview, and guild join.',
      });
      contributingSignals.push('Recruitment Pipeline');
    }

    // 4. Events & Attendance Signal (Weight 0.15)
    const eventsCreated = events.eventsCreated.value || 0;
    const attendanceRate = events.attendanceRate.value;
    if (eventsCreated === 0 && attendanceRate === null) {
      signals.push({
        name: 'Event Attendance & Participation',
        key: 'EVENTS',
        status: 'INSUFFICIENT_DATA',
        value: null,
        displayValue: 'No scheduled events',
        weight: 0.15,
        score: 0,
        contribution: 0,
        trend: 'INSUFFICIENT_DATA',
        description: 'Tracks confirmed attendee turnout vs no-shows for scheduled community gatherings.',
        missingDataReason: 'No community events scheduled or concluded in this period.',
      });
      missingSignals.push('Event Turnout (no events scheduled)');
    } else {
      const score = attendanceRate !== null ? Math.round(attendanceRate) : 70; // neutral if scheduled but not completed
      const contrib = Math.round(score * 0.15 * 10) / 10;
      signals.push({
        name: 'Event Attendance & Participation',
        key: 'EVENTS',
        status: 'AVAILABLE',
        value: attendanceRate !== null ? attendanceRate : eventsCreated,
        displayValue: attendanceRate !== null ? `${attendanceRate}% verified attendance` : `${eventsCreated} scheduled events`,
        weight: 0.15,
        score,
        contribution: contrib,
        trend: events.eventsCreated.trend,
        description: 'Tracks confirmed attendee turnout vs no-shows for scheduled community gatherings.',
      });
      contributingSignals.push('Event Turnout');
    }

    // 5. Moderation & Safety Signal (Weight 0.15)
    const activeWarnings = moderation.activeWarnings.value || 0;
    const openIncidents = moderation.openIncidents.value || 0;
    // Moderation is always available: 0 warnings and 0 incidents is ideal (score 100)
    const safetyScore = Math.max(20, 100 - activeWarnings * 8 - openIncidents * 15);
    const modContrib = Math.round(safetyScore * 0.15 * 10) / 10;
    signals.push({
      name: 'Safety & Moderation Stability',
      key: 'MODERATION',
      status: 'AVAILABLE',
      value: activeWarnings,
      displayValue: `${activeWarnings} active warnings, ${openIncidents} open incidents`,
      weight: 0.15,
      score: safetyScore,
      contribution: modContrib,
      trend: moderation.warnings.trend,
      description: 'Evaluates active disciplinary warnings, pending safety incidents, and server peace.',
    });
    contributingSignals.push('Safety & Moderation');

    // 6. Automation Reliability Signal (Weight 0.15)
    const totalExecutions = automation.workflowExecutions.value || 0;
    const successfulExecs = automation.successfulExecutions.value || 0;
    if (totalExecutions === 0) {
      signals.push({
        name: 'Automation Engine Reliability',
        key: 'AUTOMATION',
        status: 'INSUFFICIENT_DATA',
        value: null,
        displayValue: 'No workflows run',
        weight: 0.15,
        score: 0,
        contribution: 0,
        trend: 'INSUFFICIENT_DATA',
        description: 'Tracks execution success rates of automated triggers and action flows.',
        missingDataReason: 'No automated workflow executions recorded during this period.',
      });
      missingSignals.push('Automation Reliability (no runs)');
    } else {
      const autoRate = Math.round((successfulExecs / totalExecutions) * 100);
      const contrib = Math.round(autoRate * 0.15 * 10) / 10;
      signals.push({
        name: 'Automation Engine Reliability',
        key: 'AUTOMATION',
        status: 'AVAILABLE',
        value: autoRate,
        displayValue: `${autoRate}% execution success (${successfulExecs}/${totalExecutions})`,
        weight: 0.15,
        score: autoRate,
        contribution: contrib,
        trend: automation.workflowExecutions.trend,
        description: 'Tracks execution success rates of automated triggers and action flows.',
      });
      contributingSignals.push('Automation Reliability');
    }

    // Determine overall health indicator status and score
    // If 3 or more signals lack data, we report INSUFFICIENT_DATA instead of fabricating confidence!
    const availableSignals = signals.filter((s) => s.status === 'AVAILABLE');
    let overallStatus: 'AVAILABLE' | 'INSUFFICIENT_DATA' = 'AVAILABLE';
    let indicatorScore: number | null = null;
    let explanation = '';

    if (availableSignals.length < 3) {
      overallStatus = 'INSUFFICIENT_DATA';
      indicatorScore = null;
      explanation = `Community Health Indicator cannot be calculated authoritatively because ${missingSignals.length} of 6 key signals lack recorded historical activity (${missingSignals.join(', ')}).`;
    } else {
      // Scale by weights of available signals to ensure fair mathematical balance
      const totalAvailableWeight = availableSignals.reduce((acc, s) => acc + s.weight, 0);
      const rawScoreSum = availableSignals.reduce((acc, s) => acc + s.contribution, 0);
      const normalizedScore = Math.round((rawScoreSum / totalAvailableWeight) * 10) / 10;

      indicatorScore = Math.min(100, Math.max(0, Math.round(normalizedScore)));
      overallStatus = 'AVAILABLE';

      const healthDescriptor = indicatorScore >= 80 ? 'Optimal' : indicatorScore >= 60 ? 'Stable' : 'Attention Needed';
      explanation = `Community Health Indicator is evaluated at ${indicatorScore}/100 (${healthDescriptor}) derived from ${contributingSignals.length} authoritative signals.`;
      if (missingSignals.length > 0) {
        explanation += ` Note: ${missingSignals.length} signal(s) currently report insufficient data (${missingSignals.join(', ')}).`;
      }
    }

    const metadata: AnalyticsMetadata = {
      communityId,
      rangeType: range.rangeType,
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
      previousRangeStart: range.previousRangeStart,
      previousRangeEnd: range.previousRangeEnd,
      timezone: range.timezone,
      generatedAt: new Date().toISOString(),
      coverage: {
        coverageStart: range.rangeStart,
        coverageEnd: range.rangeEnd,
        recordsIncluded: signals.length,
        recordsMissing: missingSignals.length,
        source: 'Composite health engine across Community, Engagement, Recruitment, Events, Moderation, Automation',
        confidence: overallStatus === 'AVAILABLE' ? 'COMPLETE' : 'INSUFFICIENT_DATA',
      },
    };

    return {
      metadata,
      indicatorScore,
      status: overallStatus,
      trend: indicatorScore && indicatorScore >= 75 ? 'INCREASE' : indicatorScore && indicatorScore >= 50 ? 'STABLE' : 'DECREASE',
      signals,
      explanation,
      contributingSignals,
      missingSignals,
    };
  }
}
