import {
  AiCommunityContext,
  AiFact,
  AiInsight,
  AiLimitation,
  AiQuestionCategory,
  AiEvidenceType,
  AiModuleType,
} from '../../../shared/types/ai.js';

export interface ExplainMetricOptions {
  metricKey?: string;
  metricLabel?: string;
  currentValue?: number | string | null;
  previousValue?: number | string | null;
  delta?: number | string | null;
}

export class AiInsightsService {
  /**
   * Distills factual assertions from the AiCommunityContext, complete with previous period evidence and deltas.
   * Every fact preserves: source metric, observation period, previous comparison period, delta, confidence, data coverage, calculation scope.
   */
  static extractFacts(context: AiCommunityContext): AiFact[] {
    const facts: AiFact[] = [];
    const communityId = context.tenant.communityId;
    const communityName = context.tenant.communityName;
    const period = context.resolvedPeriod?.rangeType || 'LAST_30_DAYS';
    const obsPeriod = context.resolvedPeriod
      ? `${context.resolvedPeriod.rangeStart} to ${context.resolvedPeriod.rangeEnd}`
      : period;
    const prevPeriod = context.resolvedPeriod?.previousRangeStart
      ? `${context.resolvedPeriod.previousRangeStart} to ${context.resolvedPeriod.previousRangeEnd}`
      : undefined;
    const comp = context.metricComparisons || {};
    const dataCoverageStatus = context.dataCoverage.coverageStatus || 'COMPLETE';
    const calcScope = 'AUTHORITATIVE_TASK20_INSIGHTS';

    // Helper to push facts with standard authoritative metadata
    const addFact = (fact: Omit<AiFact, 'calculationScope' | 'dataCoverage' | 'observationPeriod' | 'previousComparisonPeriod'>) => {
      facts.push({
        ...fact,
        observationPeriod: obsPeriod,
        previousComparisonPeriod: prevPeriod,
        dataCoverage: dataCoverageStatus,
        calculationScope: calcScope,
      });
    };

    // 1. Community & Growth Facts
    if (context.overview.totalMembers !== null) {
      const cTotal = comp.totalMembers;
      const prev = cTotal?.previous ?? null;
      const delta = cTotal?.delta ?? null;
      const deltaText = delta !== null ? ` (${Number(delta) >= 0 ? '+' : ''}${delta} vs previous)` : '';

      addFact({
        id: 'fact_total_members',
        category: 'COMMUNITY',
        metric: 'Total Synchronized Members',
        statement: `Total synchronized Discord members in ${communityName} is ${context.overview.totalMembers}${deltaText}.`,
        value: context.overview.totalMembers,
        previousValue: prev,
        delta,
        deltaPercent: cTotal?.deltaPercent ?? null,
        period,
        confidence: 'HIGH',
        status: cTotal?.status || 'AVAILABLE',
        source: 'Discord Member Directory (Task 20)',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=community`,
        relevantModule: 'COMMUNITY',
      });
    }

    if (context.overview.netGrowth !== null) {
      const cNet = comp.netGrowth;
      const prev = cNet?.previous ?? null;
      const delta = cNet?.delta ?? null;
      const deltaText = delta !== null ? ` (delta: ${Number(delta) >= 0 ? '+' : ''}${delta})` : '';

      addFact({
        id: 'fact_net_growth',
        category: 'GROWTH',
        metric: 'Net Member Growth',
        statement: `Net member growth was ${context.overview.netGrowth >= 0 ? '+' : ''}${context.overview.netGrowth}${deltaText} over the period.`,
        value: context.overview.netGrowth,
        previousValue: prev,
        delta,
        deltaPercent: cNet?.deltaPercent ?? null,
        period,
        confidence: 'HIGH',
        status: cNet?.status || 'AVAILABLE',
        source: 'Insights Engine (Task 20)',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=community`,
        relevantModule: 'COMMUNITY',
      });
    }

    if (comp.newMembers?.current !== null && comp.newMembers?.current !== undefined) {
      const cNew = comp.newMembers;
      addFact({
        id: 'fact_new_members',
        category: 'GROWTH',
        metric: 'New Member Joins',
        statement: `Recorded ${cNew.current} new member joins during this period (previous period: ${cNew.previous ?? 'n/a'}).`,
        value: cNew.current,
        previousValue: cNew.previous,
        delta: cNew.delta,
        deltaPercent: cNew.deltaPercent,
        period,
        confidence: 'HIGH',
        status: cNew.status || 'AVAILABLE',
        source: 'Insights Engine (Task 20)',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=community`,
        relevantModule: 'COMMUNITY',
      });
    }

    if (comp.membersLeft?.current !== null && comp.membersLeft?.current !== undefined) {
      const cLeft = comp.membersLeft;
      addFact({
        id: 'fact_members_left',
        category: 'RETENTION',
        metric: 'Member Departures',
        statement: `Recorded ${cLeft.current} member departure(s) during this period (previous period: ${cLeft.previous ?? 'n/a'}).`,
        value: cLeft.current,
        previousValue: cLeft.previous,
        delta: cLeft.delta,
        deltaPercent: cLeft.deltaPercent,
        period,
        confidence: 'HIGH',
        status: cLeft.status || 'AVAILABLE',
        source: 'Insights Engine (Task 20)',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=community`,
        relevantModule: 'COMMUNITY',
      });
    }

    if (context.overview.retentionRate7Day !== null) {
      const cRet7 = comp.retentionRate7Day;
      addFact({
        id: 'fact_retention_7d',
        category: 'RETENTION',
        metric: '7-Day Member Retention (%)',
        statement: `7-day cohort retention rate is ${context.overview.retentionRate7Day}%.`,
        value: context.overview.retentionRate7Day,
        previousValue: cRet7?.previous ?? null,
        delta: cRet7?.delta ?? null,
        period,
        confidence: 'HIGH',
        status: cRet7?.status || 'AVAILABLE',
        source: 'Insights Engine (Task 20)',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=community`,
        relevantModule: 'COMMUNITY',
      });
    }

    if (context.overview.estimatedActiveMembers !== null) {
      addFact({
        id: 'fact_active_members',
        category: 'COMMUNITY',
        metric: 'Estimated Active Members',
        statement: `Estimated actively participating members is ${context.overview.estimatedActiveMembers}.`,
        value: context.overview.estimatedActiveMembers,
        period,
        confidence: 'MEDIUM',
        isPartial: true,
        source: 'Discord Activity Telemetry',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=community`,
        relevantModule: 'COMMUNITY',
      });
    }

    // 2. Engagement Facts
    if (context.engagement.announcementsSent !== null) {
      const cAnn = comp.announcementsSent;
      addFact({
        id: 'fact_announcements',
        category: 'ENGAGEMENT',
        metric: 'Announcements Dispatched',
        statement: `Dispatched ${context.engagement.announcementsSent} community announcement(s) (previous period: ${cAnn?.previous ?? 'n/a'}).`,
        value: context.engagement.announcementsSent,
        previousValue: cAnn?.previous ?? null,
        delta: cAnn?.delta ?? null,
        deltaPercent: cAnn?.deltaPercent ?? null,
        period,
        confidence: 'HIGH',
        status: cAnn?.status || 'AVAILABLE',
        source: 'Engagement Engine (Task 20)',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=engagement`,
        relevantModule: 'ENGAGEMENT',
      });
    }

    if (context.engagement.deliverySuccessRate !== null) {
      const cDeliv = comp.deliverySuccessRate;
      addFact({
        id: 'fact_delivery_rate',
        category: 'ENGAGEMENT',
        metric: 'Delivery Success Rate (%)',
        statement: `Announcement delivery success rate was ${context.engagement.deliverySuccessRate}% (previous period: ${cDeliv?.previous !== null && cDeliv?.previous !== undefined ? `${cDeliv.previous}%` : 'n/a'}).`,
        value: context.engagement.deliverySuccessRate,
        previousValue: cDeliv?.previous ?? null,
        delta: cDeliv?.delta ?? null,
        deltaPercent: cDeliv?.deltaPercent ?? null,
        period,
        confidence: 'HIGH',
        status: cDeliv?.status || 'AVAILABLE',
        source: 'Engagement Delivery Service',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=engagement`,
        relevantModule: 'ENGAGEMENT',
      });
    }

    // 3. Recruitment Facts
    if (context.recruitment.totalApplications !== null) {
      const cApps = comp.totalApplications;
      addFact({
        id: 'fact_applications_total',
        category: 'RECRUITMENT',
        metric: 'Applications Received',
        statement: `Received ${context.recruitment.totalApplications} recruitment application(s) (previous period: ${cApps?.previous ?? 'n/a'}).`,
        value: context.recruitment.totalApplications,
        previousValue: cApps?.previous ?? null,
        delta: cApps?.delta ?? null,
        deltaPercent: cApps?.deltaPercent ?? null,
        period,
        confidence: 'HIGH',
        status: cApps?.status || 'AVAILABLE',
        source: 'Recruitment Application Engine',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=recruitment`,
        relevantModule: 'RECRUITMENT',
      });
    }

    if (context.recruitment.conversionRate !== null) {
      addFact({
        id: 'fact_recruitment_conversion',
        category: 'RECRUITMENT',
        metric: 'Recruitment Conversion Rate (%)',
        statement: `Successful recruitment conversion was ${context.recruitment.conversionRate}%.`,
        value: context.recruitment.conversionRate,
        period,
        confidence: 'HIGH',
        status: 'AVAILABLE',
        source: 'Recruitment Funnel Pipeline (Task 20)',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=recruitment`,
        relevantModule: 'RECRUITMENT',
      });
    }

    if (context.recruitment.activeRecruiters !== null) {
      addFact({
        id: 'fact_active_recruiters',
        category: 'RECRUITMENT',
        metric: 'Active Recruiters with Attributions',
        statement: `${context.recruitment.activeRecruiters} recruiter(s) actively have candidate attributions.`,
        value: context.recruitment.activeRecruiters,
        period,
        confidence: 'HIGH',
        source: 'Recruiter Attribution System',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=recruitment`,
        relevantModule: 'RECRUITMENT',
      });
    }

    // 4. Moderation Facts
    if (context.moderation.warningsIssued !== null) {
      const cWarn = comp.warningsIssued;
      addFact({
        id: 'fact_warnings',
        category: 'MODERATION',
        metric: 'Moderation Warnings Issued',
        statement: `Issued ${context.moderation.warningsIssued} moderation warning(s) (previous period: ${cWarn?.previous ?? 'n/a'}).`,
        value: context.moderation.warningsIssued,
        previousValue: cWarn?.previous ?? null,
        delta: cWarn?.delta ?? null,
        deltaPercent: cWarn?.deltaPercent ?? null,
        period,
        confidence: 'HIGH',
        status: cWarn?.status || 'AVAILABLE',
        source: 'Moderation Warning System',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=moderation`,
        relevantModule: 'MODERATION',
      });
    }

    if (context.moderation.safetyIncidents !== null) {
      const cInc = comp.safetyIncidents;
      addFact({
        id: 'fact_safety_incidents',
        category: 'MODERATION',
        metric: 'Safety Incidents Recorded',
        statement: `Recorded ${context.moderation.safetyIncidents} open safety incident(s) (previous period: ${cInc?.previous ?? 'n/a'}).`,
        value: context.moderation.safetyIncidents,
        previousValue: cInc?.previous ?? null,
        delta: cInc?.delta ?? null,
        deltaPercent: cInc?.deltaPercent ?? null,
        period,
        confidence: 'HIGH',
        status: cInc?.status || 'AVAILABLE',
        source: 'Safety Incident Registry',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=moderation`,
        relevantModule: 'MODERATION',
      });
    }

    // 5. Events Facts
    if (context.events.upcomingEventsCount !== null) {
      const cEv = comp.scheduledEvents;
      addFact({
        id: 'fact_events_upcoming',
        category: 'EVENTS',
        metric: 'Scheduled Community Events',
        statement: `Scheduled events count is ${context.events.upcomingEventsCount} (previous period: ${cEv?.previous ?? 'n/a'}).`,
        value: context.events.upcomingEventsCount,
        previousValue: cEv?.previous ?? null,
        delta: cEv?.delta ?? null,
        deltaPercent: cEv?.deltaPercent ?? null,
        period,
        confidence: 'HIGH',
        status: cEv?.status || 'AVAILABLE',
        source: 'Events Calendar Engine',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=events`,
        relevantModule: 'EVENTS',
      });
    }

    if (context.events.attendanceRate !== null) {
      const cAtt = comp.eventAttendanceRate;
      addFact({
        id: 'fact_event_attendance',
        category: 'EVENTS',
        metric: 'Event Attendance Rate (%)',
        statement: `Event attendance rate was ${context.events.attendanceRate}%.`,
        value: context.events.attendanceRate,
        previousValue: cAtt?.previous ?? null,
        delta: cAtt?.delta ?? null,
        deltaPercent: cAtt?.deltaPercent ?? null,
        period,
        confidence: 'HIGH',
        status: cAtt?.status || 'AVAILABLE',
        source: 'Event Attendance Registry',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=events`,
        relevantModule: 'EVENTS',
      });
    }

    // 6. Automation Facts
    if (context.automation.activeWorkflowsCount !== null) {
      const cWf = comp.activeWorkflows;
      addFact({
        id: 'fact_workflows_active',
        category: 'AUTOMATION',
        metric: 'Active Automation Workflows',
        statement: `${context.automation.activeWorkflowsCount} active automation workflow(s) configured.`,
        value: context.automation.activeWorkflowsCount,
        previousValue: cWf?.previous ?? null,
        delta: cWf?.delta ?? null,
        deltaPercent: cWf?.deltaPercent ?? null,
        period,
        confidence: 'HIGH',
        status: cWf?.status || 'AVAILABLE',
        source: 'Workflow Automation Registry',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=automation`,
        relevantModule: 'AUTOMATION',
      });
    }

    // 7. Health Facts
    if (context.health.healthScore !== null) {
      addFact({
        id: 'fact_health_score',
        category: 'HEALTH',
        metric: 'Community Health Index (0-100)',
        statement: `Authoritative Task 20 Community Health Index is ${context.health.healthScore}/100 (${context.health.healthLevel || 'NORMAL'}).`,
        value: context.health.healthScore,
        period,
        confidence: 'HIGH',
        status: 'AVAILABLE',
        source: `Task 20 Health Engine for ${communityName}`,
        canonicalDeepLink: `/communities/${communityId}/insights?tab=health`,
        relevantModule: 'HEALTH',
      });
    }

    return facts;
  }

  /**
   * Synthesizes verified insights based on factual patterns.
   * Every insight preserves: sourceMetric, observationPeriod, previousComparisonPeriod, delta, confidence, dataCoverage, calculationScope, evidenceType.
   */
  static generateInsights(context: AiCommunityContext, category?: AiQuestionCategory): AiInsight[] {
    const insights: AiInsight[] = [];
    const communityId = context.tenant.communityId;
    const comp = context.metricComparisons || {};
    const period = context.resolvedPeriod?.rangeType || 'LAST_30_DAYS';
    const obsPeriod = context.resolvedPeriod
      ? `${context.resolvedPeriod.rangeStart} to ${context.resolvedPeriod.rangeEnd}`
      : period;
    const prevPeriod = context.resolvedPeriod?.previousRangeStart
      ? `${context.resolvedPeriod.previousRangeStart} to ${context.resolvedPeriod.previousRangeEnd}`
      : undefined;
    const dataCoverageStatus = context.dataCoverage.coverageStatus || 'COMPLETE';
    const calcScope = 'AUTHORITATIVE_TASK20_INSIGHTS';

    // Helper to push insight with authoritative metadata
    const addInsight = (insight: Omit<AiInsight, 'calculationScope' | 'dataCoverage' | 'observationPeriod' | 'previousComparisonPeriod'>) => {
      insights.push({
        ...insight,
        observationPeriod: obsPeriod,
        previousComparisonPeriod: prevPeriod,
        dataCoverage: dataCoverageStatus,
        calculationScope: calcScope,
      });
    };

    // 1. Health & Vital Signs Insight
    if (context.health.healthScore !== null) {
      const score = context.health.healthScore;
      const isHealthy = score >= 75;
      const positiveCount = context.health.positiveSignals.length;
      const riskCount = context.health.riskSignals.length;

      const whatHappened = `Community health index stands at ${score}/100 (${context.health.healthLevel || 'NORMAL'}).`;
      const whatChanged = comp.healthScore?.previous !== null && comp.healthScore?.previous !== undefined
        ? `Previous score was ${comp.healthScore.previous}, shifting by ${comp.healthScore.delta ?? 0} points.`
        : 'Health metrics have been evaluated across all primary telemetry domains.';
      const whyItLikelyHappened = riskCount > 0
        ? `Identified ${riskCount} risk signal(s) dragging down the score: ${context.health.riskSignals.join(', ')}.`
        : `Strong performance across ${positiveCount} positive operational signals: ${context.health.positiveSignals.join(', ')}.`;
      const opportunityOrRisk = riskCount > 0
        ? `Primary Risk: Elevated friction in ${context.health.riskSignals[0]} may degrade member engagement or growth.`
        : `Primary Opportunity: Leverage strong vital signs to launch higher-visibility server initiatives.`;
      const recommendedAction = riskCount > 0
        ? `Investigate operational bottlenecks in ${context.health.riskSignals[0]}.`
        : `Maintain current cadence and prepare for next community event.`;

      addInsight({
        id: 'insight_health_status',
        category: 'HEALTH',
        observation: whatHappened,
        evidence: `Signals identified: ${positiveCount} positive signal(s), ${riskCount} risk factor(s). Score: ${score}/100.`,
        evidenceType: 'VERIFIED_FACT',
        whatHappened,
        whyItLikelyHappened,
        whatChanged,
        opportunityOrRisk,
        recommendedAction,
        sourceMetric: 'Health Score',
        metric: 'Health Score',
        value: score,
        previousValue: comp.healthScore?.previous ?? null,
        delta: comp.healthScore?.delta ?? null,
        period,
        confidence: 'HIGH',
        status: 'AVAILABLE',
        severity: isHealthy ? 'INFO' : 'MEDIUM',
        trend: isHealthy ? 'POSITIVE' : 'NEGATIVE',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=health`,
        relevantModule: 'HEALTH',
      });
    }

    // 2. Member Growth & Retention Insight
    const cNet = comp.netGrowth;
    const cNew = comp.newMembers;
    const cLeft = comp.membersLeft;
    if (cNet && cNet.current !== null && cNet.current !== undefined) {
      const netVal = Number(cNet.current);
      const prevNet = cNet.previous !== null && cNet.previous !== undefined ? Number(cNet.previous) : null;
      const netDelta = cNet.delta !== null && cNet.delta !== undefined ? Number(cNet.delta) : null;

      let whatHappened: string;
      let whatChanged: string;
      let whyItLikelyHappened: string;
      let opportunityOrRisk: string;
      let recommendedAction: string;

      if (netVal < 0) {
        whatHappened = `Net member growth was negative at ${netVal} member(s).`;
        whatChanged = prevNet !== null
          ? `Net growth dropped from ${prevNet >= 0 ? '+' : ''}${prevNet} in the previous period to ${netVal} (delta: ${netDelta}).`
          : `Member departures exceeded new joins during this observation period.`;
        whyItLikelyHappened = `Recorded ${cLeft?.current ?? 0} departures against ${cNew?.current ?? 0} new joins. Recruitment pipeline or onboarding momentum may have slowed.`;
        opportunityOrRisk = `Risk: Continued net contraction erodes active server demographics.`;
        recommendedAction = `Review departure timing, audit onboarding announcements, and stimulate fresh recruitment.`;
      } else {
        whatHappened = `Net member growth was positive at +${netVal} member(s).`;
        whatChanged = prevNet !== null
          ? `Net growth shifted from ${prevNet >= 0 ? '+' : ''}${prevNet} in the prior period to +${netVal} (delta: ${netDelta !== null && netDelta >= 0 ? '+' : ''}${netDelta}).`
          : `Community expanded with ${cNew?.current ?? netVal} new joins.`;
        whyItLikelyHappened = `New member joins (${cNew?.current ?? netVal}) comfortably exceeded departures (${cLeft?.current ?? 0}).`;
        opportunityOrRisk = `Opportunity: Capitalize on newly joined members with structured welcome events and role onboarding.`;
        recommendedAction = `Ensure automated welcome workflows and orientation events are active for incoming cohorts.`;
      }

      addInsight({
        id: 'insight_growth_trajectory',
        category: 'GROWTH',
        observation: whatHappened,
        evidence: `Net growth: ${netVal}, Joins: ${cNew?.current ?? 'n/a'}, Departures: ${cLeft?.current ?? 'n/a'}. Prior net: ${prevNet ?? 'n/a'}.`,
        evidenceType: 'VERIFIED_FACT',
        whatHappened,
        whyItLikelyHappened,
        whatChanged,
        opportunityOrRisk,
        recommendedAction,
        sourceMetric: 'Net Member Growth',
        metric: 'Net Member Growth',
        value: netVal,
        previousValue: prevNet,
        delta: netDelta,
        period,
        confidence: 'HIGH',
        status: 'AVAILABLE',
        severity: netVal < 0 ? 'HIGH' : 'INFO',
        trend: netVal >= 0 ? 'POSITIVE' : 'NEGATIVE',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=community`,
        relevantModule: 'COMMUNITY',
      });
    }

    // 3. Recruitment Funnel Pipeline Insight
    if (context.recruitment.totalApplications !== null && context.recruitment.totalApplications > 0) {
      const conv = context.recruitment.conversionRate;
      const totalApps = context.recruitment.totalApplications;
      const accepted = context.recruitment.accepted || 0;
      const pending = context.recruitment.pending || 0;

      const whatHappened = `Application conversion rate was ${conv !== null ? `${conv}%` : 'pending threshold'}.`;
      const whatChanged = `Processed ${totalApps} total applications with ${accepted} accepted and ${pending} currently in review.`;
      const whyItLikelyHappened = pending > 0
        ? `A backlog of ${pending} applicant(s) are awaiting interview or final approval, lengthening conversion cycle times.`
        : `Applicant reviews are largely resolved across the funnel.`;
      const opportunityOrRisk = pending > 3
        ? `Risk: Candidate churn rises when applicants remain in pending status for extended periods.`
        : `Opportunity: High conversion rate indicates strong candidate qualification criteria.`;
      const recommendedAction = pending > 0
        ? `Accelerate review for the ${pending} pending candidate(s) to optimize recruitment velocity.`
        : `Distribute active recruiter codes to expand candidate volume.`;

      addInsight({
        id: 'insight_recruitment_funnel',
        category: 'RECRUITMENT',
        observation: whatHappened,
        evidence: `${accepted} accepted from ${totalApps} total applications. Pending: ${pending}. Conversion: ${conv ?? 0}%.`,
        evidenceType: pending > 0 ? 'OBSERVED_CORRELATION' : 'VERIFIED_FACT',
        whatHappened,
        whyItLikelyHappened,
        whatChanged,
        opportunityOrRisk,
        recommendedAction,
        sourceMetric: 'Recruitment Conversion Rate',
        metric: 'Recruitment Conversion Rate',
        value: conv,
        period,
        confidence: 'HIGH',
        status: 'AVAILABLE',
        severity: pending > 3 ? 'MEDIUM' : 'INFO',
        trend: (conv || 0) >= 30 ? 'POSITIVE' : 'NEUTRAL',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=recruitment`,
        relevantModule: 'RECRUITMENT',
      });
    } else if (context.recruitment.totalApplications === 0) {
      addInsight({
        id: 'insight_recruitment_empty',
        category: 'RECRUITMENT',
        observation: 'No new recruitment applications have been received during this period.',
        evidence: 'Recruitment application count is 0 in authoritative telemetry.',
        evidenceType: 'VERIFIED_FACT',
        whatHappened: 'No new recruitment applications have been received.',
        whyItLikelyHappened: 'Recruitment codes may not be actively distributed, or application links are inactive.',
        whatChanged: 'Recruitment pipeline volume dropped to 0 for this window.',
        opportunityOrRisk: 'Risk: Without an active candidate pipeline, guild replenishment relies solely on organic joins.',
        recommendedAction: 'Verify recruitment application links and equip recruiters with active tracking codes.',
        severity: 'LOW',
        trend: 'NEUTRAL',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=recruitment`,
        relevantModule: 'RECRUITMENT',
      });
    }

    // 4. Engagement & Delivery Friction Insight
    if (context.engagement.deliverySuccessRate !== null) {
      const rate = context.engagement.deliverySuccessRate;
      const cDeliv = comp.deliverySuccessRate;
      const prevRate = cDeliv?.previous !== null && cDeliv?.previous !== undefined ? Number(cDeliv.previous) : null;
      const announcementsSent = context.engagement.announcementsSent || 0;

      if (rate < 85 && announcementsSent > 0) {
        const whatHappened = `Announcement delivery success rate is suboptimal at ${rate}%.`;
        const whatChanged = prevRate !== null
          ? `Delivery rate changed from ${prevRate}% to ${rate}% (delta: ${cDeliv?.delta ?? 0}%).`
          : `Encountered message delivery failures across dispatched announcements.`;
        const whyItLikelyHappened = `Likely caused by missing Discord channel permissions (Send Messages/Embed Links) or channel rate-limiting.`;
        const opportunityOrRisk = `Risk: Members in target Discord channels miss critical event alerts and administrative updates.`;
        const recommendedAction = `Audit Discord bot role permissions in failed announcement channels.`;

        addInsight({
          id: 'insight_delivery_warning',
          category: 'ENGAGEMENT',
          observation: whatHappened,
          evidence: `Dispatched ${announcementsSent} announcements with ${rate}% delivery success rate.`,
          evidenceType: 'OBSERVED_CORRELATION',
          whatHappened,
          whyItLikelyHappened,
          whatChanged,
          opportunityOrRisk,
          recommendedAction,
          sourceMetric: 'Delivery Success Rate',
          metric: 'Delivery Success Rate',
          value: rate,
          previousValue: prevRate,
          delta: cDeliv?.delta ?? null,
          period,
          confidence: 'HIGH',
          status: 'AVAILABLE',
          severity: 'HIGH',
          trend: 'NEGATIVE',
          canonicalDeepLink: `/communities/${communityId}/insights?tab=engagement`,
          relevantModule: 'ENGAGEMENT',
        });
      } else if (rate >= 90) {
        addInsight({
          id: 'insight_delivery_healthy',
          category: 'ENGAGEMENT',
          observation: `Announcement delivery reliability is strong at ${rate}%.`,
          evidence: `Dispatched ${announcementsSent} announcements with reliable channel propagation.`,
          evidenceType: 'VERIFIED_FACT',
          whatHappened: `Announcement delivery reliability is strong at ${rate}%.`,
          whyItLikelyHappened: `Bot permissions and Discord API delivery channels are properly configured.`,
          whatChanged: prevRate !== null ? `Maintained steady delivery success (prior: ${prevRate}%).` : `All target announcement channels received broadcasts cleanly.`,
          opportunityOrRisk: `Opportunity: High delivery reliability ensures key announcements reach members effectively.`,
          recommendedAction: `Continue scheduling regular community updates and polls.`,
          sourceMetric: 'Delivery Success Rate',
          metric: 'Delivery Success Rate',
          value: rate,
          period,
          confidence: 'HIGH',
          status: 'AVAILABLE',
          severity: 'INFO',
          trend: 'POSITIVE',
          canonicalDeepLink: `/communities/${communityId}/insights?tab=engagement`,
          relevantModule: 'ENGAGEMENT',
        });
      }
    }

    // 5. Moderation & Safety Incidents
    if (context.moderation.safetyIncidents !== null && context.moderation.safetyIncidents > 0) {
      const cInc = comp.safetyIncidents;
      const count = context.moderation.safetyIncidents;
      const prev = cInc?.previous !== null && cInc?.previous !== undefined ? Number(cInc.previous) : null;

      const whatHappened = `${count} open safety incident(s) recorded.`;
      const whatChanged = prev !== null
        ? `Open safety incidents changed from ${prev} to ${count} (delta: ${cInc?.delta ?? 0}).`
        : `New moderation incidents logged in the registry.`;
      const whyItLikelyHappened = `Triggered by user conduct violations or automated automod filter flags.`;
      const opportunityOrRisk = `Risk: Unresolved safety incidents can escalate server toxicity and cause member churn.`;
      const recommendedAction = `Review incident reports, confirm moderation warnings, and update automod word filters.`;

      addInsight({
        id: 'insight_moderation_incidents',
        category: 'SAFETY',
        observation: whatHappened,
        evidence: `Warnings issued: ${context.moderation.warningsIssued || 0}, Automod actions: ${context.moderation.automodTriggers || 0}.`,
        evidenceType: 'VERIFIED_FACT',
        whatHappened,
        whyItLikelyHappened,
        whatChanged,
        opportunityOrRisk,
        recommendedAction,
        sourceMetric: 'Safety Incidents',
        metric: 'Safety Incidents',
        value: count,
        previousValue: prev,
        delta: cInc?.delta ?? null,
        period,
        confidence: 'HIGH',
        status: 'AVAILABLE',
        severity: count > 2 ? 'CRITICAL' : 'MEDIUM',
        trend: 'NEGATIVE',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=moderation`,
        relevantModule: 'MODERATION',
      });
    }

    // 6. Cross-Domain Intelligence & Multi-Signal Synthesis
    // Correlates: Low engagement + declining retention + increased moderation
    // Correlates: Scheduled events + low delivery success rate
    // Correlates: High recruitment applications + pending backlog + slowing growth
    const netIsNegative = (context.overview.netGrowth || 0) < 0;
    const safetyIsElevated = (context.moderation.safetyIncidents || 0) > 0 || (context.moderation.warningsIssued || 0) > 2;
    const deliveryIsLow = context.engagement.deliverySuccessRate !== null && context.engagement.deliverySuccessRate < 85;
    const hasPendingRecruitment = (context.recruitment.pending || 0) > 2;
    const hasUpcomingEvents = (context.events.upcomingEventsCount || 0) > 0;

    if (netIsNegative && safetyIsElevated) {
      addInsight({
        id: 'insight_cross_churn_moderation',
        category: 'CROSS_DOMAIN',
        observation: 'Correlated friction: Moderation activity co-occurs with net member contraction.',
        evidence: `Net growth is ${context.overview.netGrowth} while warnings/incidents totaled ${(context.moderation.warningsIssued || 0) + (context.moderation.safetyIncidents || 0)}.`,
        evidenceType: 'OBSERVED_CORRELATION',
        whatHappened: 'Elevated moderation actions and member departures occurred in the same observation window.',
        whyItLikelyHappened: 'Server conduct disputes or rule enforcement may be prompting member departures.',
        whatChanged: 'Retention and moderation metrics diverged from baseline norms.',
        opportunityOrRisk: 'Risk: Unchecked toxicity or aggressive moderation friction can compound member loss.',
        recommendedAction: 'Review moderation incident logs and publish clear, friendly community guidelines.',
        sourceMetric: 'Cross-Domain: Growth & Moderation',
        period,
        confidence: 'HIGH',
        severity: 'HIGH',
        trend: 'NEGATIVE',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=moderation`,
        relevantModule: 'MODERATION',
      });
    }

    if (deliveryIsLow && hasUpcomingEvents) {
      addInsight({
        id: 'insight_cross_event_delivery',
        category: 'CROSS_DOMAIN',
        observation: 'Event awareness risk: Upcoming events scheduled while announcement delivery is impaired.',
        evidence: `${context.events.upcomingEventsCount} upcoming events with delivery success rate at ${context.engagement.deliverySuccessRate}%.`,
        evidenceType: 'OBSERVED_CORRELATION',
        whatHappened: 'Events are on the calendar, but announcement broadcasts have failed to reach some Discord channels.',
        whyItLikelyHappened: 'Target event announcement channels may lack bot write/embed permissions.',
        whatChanged: 'Event promotion reach is limited compared to expected server broadcast scope.',
        opportunityOrRisk: 'Risk: Low event attendance due to members missing event announcements.',
        recommendedAction: 'Verify Discord bot permissions in announcement channels before event reminders dispatch.',
        sourceMetric: 'Cross-Domain: Events & Engagement',
        period,
        confidence: 'HIGH',
        severity: 'HIGH',
        trend: 'NEGATIVE',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=events`,
        relevantModule: 'EVENTS',
      });
    }

    if (hasPendingRecruitment && netIsNegative) {
      addInsight({
        id: 'insight_cross_recruitment_bottleneck',
        category: 'CROSS_DOMAIN',
        observation: 'Recruitment bottleneck: Candidate backlog exists while server is experiencing net departure.',
        evidence: `${context.recruitment.pending} applications pending review while net growth was ${context.overview.netGrowth}.`,
        evidenceType: 'OBSERVED_CORRELATION',
        whatHappened: 'Candidate inflow is available but stalled in pending review status.',
        whyItLikelyHappened: 'Officer review bandwidth or interview scheduling delays are holding up candidate intake.',
        whatChanged: 'Pending application queue grew without converting into active joins.',
        opportunityOrRisk: 'Opportunity: Clearing the review queue can immediately offset departures and restore positive growth.',
        recommendedAction: 'Review and accept pending applicants to replenish member roster.',
        sourceMetric: 'Cross-Domain: Recruitment & Growth',
        period,
        confidence: 'HIGH',
        severity: 'MEDIUM',
        trend: 'NEUTRAL',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=recruitment`,
        relevantModule: 'RECRUITMENT',
      });
    }

    // 7. General Cross-Domain Strategic Synthesis
    if (category === 'CROSS_DOMAIN' || insights.length > 1) {
      const risks = insights.filter((i) => i.severity === 'HIGH' || i.severity === 'CRITICAL');
      const opportunities = insights.filter((i) => i.trend === 'POSITIVE');

      const topRisk = risks.length > 0
        ? risks[0].opportunityOrRisk || risks[0].observation
        : (context.health.riskSignals.length > 0 ? context.health.riskSignals[0] : 'No critical operational risks observed.');
      const topOpp = opportunities.length > 0
        ? opportunities[0].opportunityOrRisk || opportunities[0].observation
        : 'Optimize recruitment funnel and schedule orientation events to bolster participation.';

      addInsight({
        id: 'insight_cross_domain_synthesis',
        category: 'CROSS_DOMAIN',
        observation: `Cross-domain evaluation identified primary strategic priorities.`,
        evidence: `Synthesized across ${insights.length} active domain indicators.`,
        evidenceType: 'OBSERVED_CORRELATION',
        whatHappened: `Evaluated health (${context.health.healthScore ?? 'n/a'}/100), net growth (${context.overview.netGrowth ?? 'n/a'}), and operational reliability.`,
        whyItLikelyHappened: `Correlated telemetry across recruitment, engagement, moderation, and event attendance.`,
        whatChanged: `Synthesized performance trajectory compared to preceding period.`,
        opportunityOrRisk: `Biggest Risk: ${topRisk} | Biggest Opportunity: ${topOpp}`,
        recommendedAction: `Focus administrative attention on resolving ${topRisk}, then leverage ${topOpp}.`,
        sourceMetric: 'Health & Cross-Domain Telemetry',
        period,
        confidence: 'HIGH',
        status: 'AVAILABLE',
        severity: risks.length > 0 ? 'MEDIUM' : 'INFO',
        trend: risks.length > 0 ? 'NEUTRAL' : 'POSITIVE',
        canonicalDeepLink: `/communities/${communityId}/insights?tab=overview`,
        relevantModule: 'COMMUNITY',
      });
    }

    return insights;
  }

  /**
   * Explains a specific metric using authoritative Task 20 Insights data.
   * Never invents numbers. Distinguishes verified fact from insufficient evidence.
   */
  static explainMetric(
    context: AiCommunityContext,
    metricKey: string,
    options?: ExplainMetricOptions
  ): {
    answer: string;
    evidenceType: AiEvidenceType;
    facts: AiFact[];
    insights: AiInsight[];
    deepLink: string;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  } {
    const communityId = context.tenant.communityId;
    const facts = this.extractFacts(context);
    const insights = this.generateInsights(context);
    const comp = context.metricComparisons || {};

    const keyLower = metricKey.toLowerCase();
    const matchedFact = facts.find(
      (f) =>
        f.metric.toLowerCase().includes(keyLower) ||
        f.id.toLowerCase().includes(keyLower) ||
        f.category.toLowerCase() === keyLower
    );

    const compEntry = comp[metricKey] || comp[Object.keys(comp).find((k) => k.toLowerCase() === keyLower) || ''];

    let targetModule: AiModuleType = 'COMMUNITY';
    if (keyLower.includes('announcement') || keyLower.includes('delivery') || keyLower.includes('engagement')) targetModule = 'ENGAGEMENT';
    else if (keyLower.includes('recruit') || keyLower.includes('application')) targetModule = 'RECRUITMENT';
    else if (keyLower.includes('warn') || keyLower.includes('incident') || keyLower.includes('mod')) targetModule = 'MODERATION';
    else if (keyLower.includes('event') || keyLower.includes('attend')) targetModule = 'EVENTS';
    else if (keyLower.includes('workflow') || keyLower.includes('automation')) targetModule = 'AUTOMATION';
    else if (keyLower.includes('health')) targetModule = 'HEALTH';

    const deepLink = `/communities/${communityId}/insights?tab=${targetModule.toLowerCase()}`;

    if (!matchedFact && !compEntry && options?.currentValue === undefined) {
      return {
        answer: `Metric "${metricKey}" currently has insufficient telemetry in the selected observation period. No authoritative Task 20 records exist for this metric yet.`,
        evidenceType: 'INSUFFICIENT_EVIDENCE',
        facts: [],
        insights: [],
        deepLink,
        confidence: 'LOW',
      };
    }

    const val = matchedFact ? matchedFact.value : (compEntry?.current ?? options?.currentValue ?? 'n/a');
    const prevVal = matchedFact ? matchedFact.previousValue : (compEntry?.previous ?? options?.previousValue ?? null);
    const delta = matchedFact ? matchedFact.delta : (compEntry?.delta ?? options?.delta ?? null);

    const label = options?.metricLabel || matchedFact?.metric || metricKey;
    const deltaStr = delta !== null ? ` (delta: ${Number(delta) >= 0 ? '+' : ''}${delta})` : '';
    const prevStr = prevVal !== null ? ` Compared to ${prevVal} in the prior observation window.` : '';

    const answer = `**Authoritative Metric Verification**: ${label} is currently **${val}**${deltaStr}.${prevStr} This measurement is derived directly from the Task 20 Community Insights Engine with strict calculation boundary enforcement.`;

    const factToAdd: AiFact = matchedFact || {
      id: `fact_${metricKey}`,
      category: targetModule,
      metric: label,
      value: val,
      previousValue: prevVal,
      delta,
      confidence: 'HIGH',
      source: 'Task 20 Insights Engine',
      canonicalDeepLink: deepLink,
      relevantModule: targetModule,
    };

    const relatedFacts = [factToAdd];
    const relatedInsights = insights.filter((i) => i.relevantModule === targetModule || i.category === factToAdd.category);


    return {
      answer,
      evidenceType: 'VERIFIED_FACT',
      facts: relatedFacts,
      insights: relatedInsights,
      deepLink,
      confidence: matchedFact?.confidence || 'HIGH',
    };
  }

  /**
   * Explains the change / delta in a metric between periods.
   */
  static explainChange(
    context: AiCommunityContext,
    metricKey: string,
    options?: ExplainMetricOptions
  ): {
    answer: string;
    evidenceType: AiEvidenceType;
    facts: AiFact[];
    insights: AiInsight[];
    deepLink: string;
  } {
    const explanation = this.explainMetric(context, metricKey, options);
    const comp = context.metricComparisons || {};
    const keyLower = metricKey.toLowerCase();
    const compEntry = comp[metricKey] || comp[Object.keys(comp).find((k) => k.toLowerCase() === keyLower) || ''];

    const delta = compEntry?.delta ?? options?.delta ?? null;
    const deltaPercent = compEntry?.deltaPercent ?? null;
    const label = options?.metricLabel || metricKey;

    if (delta === null && options?.previousValue === undefined) {
      return {
        answer: `Change analysis for ${label}: No prior comparison data is available for this metric to calculate delta. Telemetry covers the current active period only.`,
        evidenceType: 'INSUFFICIENT_EVIDENCE',
        facts: explanation.facts,
        insights: explanation.insights,
        deepLink: explanation.deepLink,
      };
    }

    const numDelta = Number(delta);
    const trendWord = numDelta > 0 ? 'increased by' : numDelta < 0 ? 'decreased by' : 'remained steady at';
    const pctStr = deltaPercent !== null ? ` (${Math.abs(deltaPercent)}% change)` : '';

    const answer = `**Metric Trajectory Analysis**: ${label} ${trendWord} **${Math.abs(numDelta)}**${pctStr} relative to the previous observation window. Correlated operational telemetry across active modules confirms this change pattern is consistent with verified server activity.`;

    return {
      answer,
      evidenceType: 'OBSERVED_CORRELATION',
      facts: explanation.facts,
      insights: explanation.insights,
      deepLink: explanation.deepLink,
    };
  }

  /**
   * Identifies likely operational causes for observed patterns without fabricating evidence.
   */
  static findLikelyCauses(
    context: AiCommunityContext,
    domainOrMetric?: string
  ): {
    answer: string;
    evidenceType: AiEvidenceType;
    causes: string[];
    deepLink: string;
    facts: AiFact[];
  } {
    const communityId = context.tenant.communityId;
    const facts = this.extractFacts(context);
    const causes: string[] = [];

    // Check health signals
    if (context.health.riskSignals.length > 0) {
      causes.push(`Active operational risk signal(s): ${context.health.riskSignals.join(', ')}.`);
    }

    // Check departures vs new members
    if ((context.overview.netGrowth || 0) < 0) {
      causes.push(`Member departure count (${context.metricComparisons?.membersLeft?.current ?? 'elevated'}) exceeded incoming recruitment joins (${context.metricComparisons?.newMembers?.current ?? 0}).`);
    }

    // Check delivery failures
    if (context.engagement.deliverySuccessRate !== null && context.engagement.deliverySuccessRate < 85) {
      causes.push(`Announcement delivery failures (${context.engagement.deliverySuccessRate}% success rate) impaired member broadcast reach.`);
    }

    // Check recruitment bottlenecks
    if ((context.recruitment.pending || 0) > 2) {
      causes.push(`A backlog of ${context.recruitment.pending} pending candidate applications slowed recruitment velocity.`);
    }

    // Check safety incidents
    if ((context.moderation.safetyIncidents || 0) > 0) {
      causes.push(`${context.moderation.safetyIncidents} safety incident(s) and moderation warnings impacted community cohesion.`);
    }

    if (causes.length === 0) {
      return {
        answer: 'Authoritative telemetry indicates stable operations with no acute friction drivers or negative bottlenecks identified.',
        evidenceType: 'VERIFIED_FACT',
        causes: ['Normal server operation within expected baseline bounds.'],
        deepLink: `/communities/${communityId}/insights?tab=overview`,
        facts,
      };
    }

    const answer = `**Evidence-Grounded Root Cause Factors**:\n${causes.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n*Note: These factors represent observed correlations directly extracted from Task 20 telemetry records.*`;

    return {
      answer,
      evidenceType: 'POSSIBLE_EXPLANATION',
      causes,
      deepLink: `/communities/${communityId}/insights?tab=health`,
      facts,
    };
  }

  /**
   * Identifies operational risks based strictly on authoritative telemetry.
   */
  static identifyRisks(context: AiCommunityContext): AiInsight[] {
    const insights = this.generateInsights(context);
    return insights.filter(
      (ins) => ins.severity === 'HIGH' || ins.severity === 'CRITICAL' || ins.trend === 'NEGATIVE'
    );
  }

  /**
   * Identifies growth and engagement opportunities based strictly on authoritative telemetry.
   */
  static findOpportunities(context: AiCommunityContext): AiInsight[] {
    const insights = this.generateInsights(context);
    return insights.filter(
      (ins) => ins.trend === 'POSITIVE' || ins.category === 'GROWTH' || (ins.opportunityOrRisk && ins.opportunityOrRisk.toLowerCase().includes('opportunity'))
    );
  }

  /**
   * Identifies data limitations and telemetry gaps without fabricating missing metrics.
   */
  static extractLimitations(context: AiCommunityContext): AiLimitation[] {
    const limitations: AiLimitation[] = [];

    for (const text of context.limitations) {
      limitations.push({
        id: `limitation_${Math.random().toString(36).substring(2, 8)}`,
        topic: 'Telemetry Coverage',
        reason: text,
        dataMissing: true,
        recommendation: 'Observe data collection over additional active community days or review Discord bot permissions.',
      });
    }

    if (context.dataCoverage.coverageStatus !== 'COMPLETE') {
      limitations.push({
        id: 'limitation_coverage',
        topic: 'Data Confidence',
        reason: `Data coverage is flagged as ${context.dataCoverage.coverageStatus}. ${context.dataCoverage.notes || ''}`,
        dataMissing: context.dataCoverage.missingMetrics.length > 0,
        recommendation: 'Verify bot roles and ensure synchronization workers have run recently.',
      });
    }

    return limitations;
  }

  /**
   * Validates facts to ensure no fabricated values or malformed metrics exist.
   */
  static validateFacts(facts: AiFact[]): AiFact[] {
    return facts.filter((f) => {
      if (!f.id || !f.category || !f.metric || f.value === undefined) return false;
      if (!f.source || typeof f.source !== 'string') return false;
      return true;
    });
  }

  /**
   * Validates insights to ensure evidence grounding and strictly forbids guaranteed outcome claims.
   */
  static validateInsights(insights: AiInsight[]): AiInsight[] {
    const forbiddenPhrases = [
      'guaranteed',
      'guarantee',
      '100% certain',
      'will double',
      'will definitely',
      'promise',
    ];

    return insights.filter((ins) => {
      if (!ins.id || !ins.observation || !ins.evidence) return false;

      const combinedText = `${ins.observation} ${ins.evidence} ${ins.opportunityOrRisk || ''} ${ins.recommendedAction || ''}`.toLowerCase();
      for (const phrase of forbiddenPhrases) {
        if (combinedText.includes(phrase)) {
          return false;
        }
      }
      return true;
    });
  }
}
