import {
  AiCommunityContext,
  AiRecommendation,
  AiFact,
  AiInsight,
  AiModuleType,
  AiPriorityLevel,
  AiRecommendationType,
} from '../../../shared/types/ai.js';
import { AiSafetyService } from './aiSafety.service.js';
import { AiInsightsService } from './aiInsights.service.js';

export class AiRecommendationService {
  /**
   * Generates prioritized, evidence-based recommendations grounded in authoritative Task 20 Insights & Task 21.2 facts.
   *
   * Detects:
   * - OPPORTUNITY
   * - RISK
   * - BOTTLENECK
   * - DECLINING_METRIC
   * - IMPROVEMENT_AREA
   *
   * Prioritizes using: impact, evidence strength, confidence, data coverage, actionability.
   */
  static generateRecommendations(
    context: AiCommunityContext,
    providedFacts?: AiFact[],
    _providedInsights?: AiInsight[]
  ): AiRecommendation[] {
    // 1. Guard against insufficient data: Never recommend actions based solely on missing data
    if (context.dataCoverage.coverageStatus === 'INSUFFICIENT') {
      return [];
    }

    const facts = providedFacts || AiInsightsService.extractFacts(context);
    const candidateRecs: AiRecommendation[] = [];
    const tenantId = context.tenant.communityId;

    // Helper to find relevant facts
    const getFactsByCategory = (category: string): string[] => {
      return facts
        .filter((f) => f.category === category || f.category === 'COMMUNITY')
        .slice(0, 3)
        .map((f) => f.statement || `${f.metric}: ${f.value}`);
    };

    // Helper to calculate prioritization score (0 to 100)
    const calculateScore = (factors: {
      impact: number; // 1-5
      evidenceCount: number;
      confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
      coverageStatus: string;
      hasAction: boolean;
    }): { score: number; scoreFactors: NonNullable<AiRecommendation['scoreFactors']> } => {
      const impact = factors.impact;
      const evidenceStrength = Math.min(5, Math.max(1, factors.evidenceCount >= 3 ? 5 : factors.evidenceCount * 2));
      const confidence = factors.confidenceLevel === 'HIGH' ? 5 : factors.confidenceLevel === 'MEDIUM' ? 3 : 2;
      const dataCoverage = factors.coverageStatus === 'COMPLETE' ? 5 : factors.coverageStatus === 'PARTIAL' ? 3 : 1;
      const actionability = factors.hasAction ? 5 : 3;

      const score = Math.round(
        (impact * 0.35 +
          evidenceStrength * 0.20 +
          confidence * 0.15 +
          dataCoverage * 0.15 +
          actionability * 0.15) *
          20
      );

      return {
        score,
        scoreFactors: {
          impact,
          evidenceStrength,
          confidence,
          dataCoverage,
          actionability,
        },
      };
    };

    // ==========================================
    // 1. RISKS
    // ==========================================

    // Risk 1: Community Health Signal Risk
    if (context.health.riskSignals.length > 0 || (context.health.healthScore !== null && context.health.healthScore < 60)) {
      const healthFacts = getFactsByCategory('HEALTH');
      if (healthFacts.length === 0 && context.health.healthScore !== null) {
        healthFacts.push(`Community Health Score: ${context.health.healthScore}/100`);
      }
      if (context.health.riskSignals.length > 0) {
        healthFacts.push(`Active Risk Signals: ${context.health.riskSignals.join(', ')}`);
      }

      if (healthFacts.length > 0) {
        const impact = (context.health.healthScore ?? 100) < 45 ? 5 : 4;
        const confidenceLevel = context.health.healthScore !== null ? 'HIGH' : 'MEDIUM';
        const { score, scoreFactors } = calculateScore({
          impact,
          evidenceCount: healthFacts.length,
          confidenceLevel,
          coverageStatus: context.dataCoverage.coverageStatus,
          hasAction: true,
        });

        candidateRecs.push({
          id: 'rec_health_risks',
          title: `Address Community Health Risk Factors`,
          reason: `Community health index stands at ${context.health.healthScore ?? 'unknown'}/100 with active risk signal(s): ${context.health.riskSignals.join(', ') || 'underperforming operational signals'}.`,
          description: `Operational health indicators are flagging risks. Immediate leadership review is recommended to stabilize key member activity and retention drivers.`,
          rationale: `Community health index is currently ${context.health.healthScore ?? 'unknown'}/100. Addressing early warning signals preserves server stability.`,
          supportingFacts: healthFacts,
          affectedModule: 'HEALTH',
          priority: score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : 'MEDIUM',
          confidence: confidenceLevel,
          confidenceScore: confidenceLevel === 'HIGH' ? 0.9 : 0.75,
          suggestedNextStep: 'Inspect low-performing operational metrics and review member activity drops in the Health Analytics view.',
          canonicalDeepLink: `/communities/${tenantId}/insights?tab=health`,
          type: 'RISK',
          prioritizationScore: score,
          scoreFactors,
          suggestedAction: {
            actionType: 'NAVIGATE_HEALTH_ANALYTICS',
            targetModule: 'COMMUNITY',
          },
        });
      }
    }

    // Risk 2: Safety & Moderation Incidents
    if (context.moderation.safetyIncidents !== null && context.moderation.safetyIncidents > 0) {
      const modFacts = getFactsByCategory('MODERATION');
      if (modFacts.length === 0) {
        modFacts.push(`Safety Incidents Recorded: ${context.moderation.safetyIncidents}`);
      }
      if (context.moderation.automodTriggers !== null) {
        modFacts.push(`Automod Triggers: ${context.moderation.automodTriggers}`);
      }

      const impact = 5; // Safety is top priority
      const { score, scoreFactors } = calculateScore({
        impact,
        evidenceCount: modFacts.length,
        confidenceLevel: 'HIGH',
        coverageStatus: context.dataCoverage.coverageStatus,
        hasAction: true,
      });

      candidateRecs.push({
        id: 'rec_audit_moderation_rules',
        title: 'Review Automod Triggers & Safety Incidents',
        reason: `${context.moderation.safetyIncidents} safety incident(s) and ${context.moderation.automodTriggers ?? 0} automod triggers were recorded in this period.`,
        description: `${context.moderation.safetyIncidents} safety incident(s) were logged. Review automod rule thresholds and blacklist entries.`,
        rationale: 'Active moderation audits prevent recurring violations and preserve server safety.',
        supportingFacts: modFacts,
        affectedModule: 'MODERATION',
        priority: 'HIGH',
        confidence: 'HIGH',
        confidenceScore: 0.95,
        suggestedNextStep: 'Examine recent automod violation transcripts and review member blacklist rules.',
        canonicalDeepLink: `/communities/${tenantId}/moderation`,
        type: 'RISK',
        prioritizationScore: score,
        scoreFactors,
        suggestedAction: {
          actionType: 'AUDIT_MODERATION',
          targetModule: 'MODERATION',
        },
      });
    }

    // Risk 3: Broadcast Delivery Failures
    if (
      context.engagement.deliverySuccessRate !== null &&
      context.engagement.deliverySuccessRate < 85 &&
      (context.engagement.announcementsSent || 0) > 0
    ) {
      const engFacts = getFactsByCategory('ENGAGEMENT');
      engFacts.push(`Delivery Success Rate: ${context.engagement.deliverySuccessRate}%`);
      engFacts.push(`Announcements Sent: ${context.engagement.announcementsSent}`);

      const impact = 4;
      const { score, scoreFactors } = calculateScore({
        impact,
        evidenceCount: engFacts.length,
        confidenceLevel: 'HIGH',
        coverageStatus: context.dataCoverage.coverageStatus,
        hasAction: true,
      });

      candidateRecs.push({
        id: 'rec_fix_channel_permissions',
        title: 'Audit Announcement Channel Permissions',
        reason: `Announcement delivery success is currently at ${context.engagement.deliverySuccessRate}%, indicating Discord channel permission or role misconfigurations.`,
        description: `Announcement delivery success is currently at ${context.engagement.deliverySuccessRate}%. Verify that the Discord bot has Send Messages and Embed Links permissions in all target channels.`,
        rationale: 'Failed message deliveries prevent community members from receiving vital updates and event alerts.',
        supportingFacts: engFacts,
        affectedModule: 'ENGAGEMENT',
        priority: 'HIGH',
        confidence: 'HIGH',
        confidenceScore: 0.9,
        suggestedNextStep: 'Verify Discord bot permissions (Send Messages, Embed Links) across all broadcast target channels.',
        canonicalDeepLink: `/communities/${tenantId}/engagement`,
        type: 'RISK',
        prioritizationScore: score,
        scoreFactors,
        suggestedAction: {
          actionType: 'RUN_DISCORD_PERMISSIONS_CHECK',
          targetModule: 'ENGAGEMENT',
        },
      });
    }

    // ==========================================
    // 2. BOTTLENECKS
    // ==========================================

    // Bottleneck 1: Recruitment Application Backlog
    if (context.recruitment.pending !== null && context.recruitment.pending > 0) {
      const recFacts = getFactsByCategory('RECRUITMENT');
      recFacts.push(`Pending Applications: ${context.recruitment.pending}`);
      if (context.recruitment.totalApplications !== null) {
        recFacts.push(`Total Applications: ${context.recruitment.totalApplications}`);
      }

      const impact = context.recruitment.pending >= 5 ? 4 : 3;
      const { score, scoreFactors } = calculateScore({
        impact,
        evidenceCount: recFacts.length,
        confidenceLevel: 'HIGH',
        coverageStatus: context.dataCoverage.coverageStatus,
        hasAction: true,
      });

      candidateRecs.push({
        id: 'rec_review_pending_apps',
        title: 'Review Pending Applications',
        reason: `There are currently ${context.recruitment.pending} pending recruitment applications awaiting interviewer evaluation and decision.`,
        description: `There are currently ${context.recruitment.pending} pending recruitment applications awaiting interviewer decision.`,
        rationale: 'Faster application turnaround increases applicant acceptance velocity and community joining likelihood.',
        supportingFacts: recFacts,
        affectedModule: 'RECRUITMENT',
        priority: context.recruitment.pending >= 5 ? 'HIGH' : 'MEDIUM',
        confidence: 'HIGH',
        confidenceScore: 0.9,
        suggestedNextStep: 'Assign pending applications to designated reviewers or batch-evaluate unassigned candidates.',
        canonicalDeepLink: `/communities/${tenantId}/recruitment`,
        type: 'BOTTLENECK',
        prioritizationScore: score,
        scoreFactors,
        suggestedAction: {
          actionType: 'NAVIGATE_APPLICATIONS',
          targetModule: 'RECRUITMENT',
          parameters: { status: 'PENDING' },
        },
      });
    }

    // Bottleneck 2: Interview Stage Stoppage
    if (context.recruitment.interviewStage !== null && context.recruitment.interviewStage >= 3) {
      const interviewFacts = getFactsByCategory('RECRUITMENT');
      interviewFacts.push(`Candidates in Interview Stage: ${context.recruitment.interviewStage}`);

      const impact = 3;
      const { score, scoreFactors } = calculateScore({
        impact,
        evidenceCount: interviewFacts.length,
        confidenceLevel: 'MEDIUM',
        coverageStatus: context.dataCoverage.coverageStatus,
        hasAction: true,
      });

      candidateRecs.push({
        id: 'rec_streamline_interviews',
        title: 'Streamline Interview Scheduling Turnaround',
        reason: `${context.recruitment.interviewStage} candidates are currently staged in interview review, creating an onboarding bottleneck.`,
        description: `${context.recruitment.interviewStage} candidates are awaiting interview completion before acceptance decisions can proceed.`,
        rationale: 'Reducing interview staging time directly accelerates pipeline throughput.',
        supportingFacts: interviewFacts,
        affectedModule: 'RECRUITMENT',
        priority: 'MEDIUM',
        confidence: 'MEDIUM',
        confidenceScore: 0.8,
        suggestedNextStep: 'Confirm interviewer calendar availability and dispatch scheduling reminders to staged applicants.',
        canonicalDeepLink: `/communities/${tenantId}/recruitment`,
        type: 'BOTTLENECK',
        prioritizationScore: score,
        scoreFactors,
        suggestedAction: {
          actionType: 'SCHEDULE_INTERVIEWS',
          targetModule: 'RECRUITMENT',
        },
      });
    }

    // ==========================================
    // 3. DECLINING METRICS
    // ==========================================

    // Declining Metric 1: Net Member Growth Contraction
    if (context.overview.netGrowth !== null && context.overview.netGrowth < 0) {
      const growthFacts = getFactsByCategory('GROWTH');
      growthFacts.push(`Net Growth: ${context.overview.netGrowth}`);
      if (context.overview.totalMembers !== null) {
        growthFacts.push(`Total Members: ${context.overview.totalMembers}`);
      }

      const impact = 4;
      const { score, scoreFactors } = calculateScore({
        impact,
        evidenceCount: growthFacts.length,
        confidenceLevel: 'HIGH',
        coverageStatus: context.dataCoverage.coverageStatus,
        hasAction: true,
      });

      candidateRecs.push({
        id: 'rec_stabilize_net_growth',
        title: 'Stabilize Member Acquisition & Retention Channels',
        reason: `Community experienced a net contraction of ${context.overview.netGrowth} members over the observed window.`,
        description: `Member departures exceeded new joiners during this period. Review community entrance channels and engagement drops.`,
        rationale: 'Stabilizing acquisition and retention reverses negative community member trends.',
        supportingFacts: growthFacts,
        affectedModule: 'GROWTH',
        priority: 'HIGH',
        confidence: 'HIGH',
        confidenceScore: 0.85,
        suggestedNextStep: 'Analyze departure logs and evaluate discovery channel referral trends in Community Insights.',
        canonicalDeepLink: `/communities/${tenantId}/insights?tab=overview`,
        type: 'DECLINING_METRIC',
        prioritizationScore: score,
        scoreFactors,
        suggestedAction: {
          actionType: 'NAVIGATE_INSIGHTS_OVERVIEW',
          targetModule: 'COMMUNITY',
        },
      });
    }

    // Declining Metric 2: 7-Day New Member Retention Fall
    if (context.overview.retentionRate7Day !== null && context.overview.retentionRate7Day < 40) {
      const retFacts = getFactsByCategory('RETENTION');
      retFacts.push(`7-Day Retention Rate: ${context.overview.retentionRate7Day}%`);
      if (context.overview.newMembers !== null) {
        retFacts.push(`New Members: ${context.overview.newMembers}`);
      }

      const impact = 4;
      const { score, scoreFactors } = calculateScore({
        impact,
        evidenceCount: retFacts.length,
        confidenceLevel: 'HIGH',
        coverageStatus: context.dataCoverage.coverageStatus,
        hasAction: true,
      });

      candidateRecs.push({
        id: 'rec_improve_7day_retention',
        title: 'Improve 7-Day New Member Onboarding Retention',
        reason: `7-day retention rate is currently at ${context.overview.retentionRate7Day}%, indicating that new joiners drop out after their first week.`,
        description: `New member activation rate requires attention. Enhance early welcome touches to boost member longevity.`,
        rationale: 'Engaging new members in the first 7 days strongly correlates with long-term retention.',
        supportingFacts: retFacts,
        affectedModule: 'RETENTION',
        priority: 'HIGH',
        confidence: 'HIGH',
        confidenceScore: 0.85,
        suggestedNextStep: 'Review new member welcome workflows and introduce an introductory community check-in prompt.',
        canonicalDeepLink: `/communities/${tenantId}/insights?tab=overview`,
        type: 'DECLINING_METRIC',
        prioritizationScore: score,
        scoreFactors,
        suggestedAction: {
          actionType: 'NAVIGATE_RETENTION_ANALYTICS',
          targetModule: 'COMMUNITY',
        },
      });
    }

    // ==========================================
    // 4. OPPORTUNITIES
    // ==========================================

    // Opportunity 1: Capitalize on High Event Registration
    if (context.events.totalRegistrations !== null && context.events.totalRegistrations > 10) {
      const eventFacts = getFactsByCategory('EVENTS');
      eventFacts.push(`Total Event Registrations: ${context.events.totalRegistrations}`);
      if (context.events.attendanceRate !== null) {
        eventFacts.push(`Attendance Rate: ${context.events.attendanceRate}%`);
      }

      const impact = 3;
      const { score, scoreFactors } = calculateScore({
        impact,
        evidenceCount: eventFacts.length,
        confidenceLevel: 'HIGH',
        coverageStatus: context.dataCoverage.coverageStatus,
        hasAction: true,
      });

      candidateRecs.push({
        id: 'rec_capitalize_event_interest',
        title: 'Capitalize on High Event Registration Interest',
        reason: `${context.events.totalRegistrations} member registrations were logged, demonstrating solid member engagement potential.`,
        description: `Strong attendee interest indicates high responsiveness to shared community events.`,
        rationale: 'Active event participation deepens member loyalty and creates viral community discussions.',
        supportingFacts: eventFacts,
        affectedModule: 'EVENTS',
        priority: 'MEDIUM',
        confidence: 'HIGH',
        confidenceScore: 0.9,
        suggestedNextStep: 'Host an interactive follow-up workshop or community roundtable to maintain momentum.',
        canonicalDeepLink: `/communities/${tenantId}/events`,
        type: 'OPPORTUNITY',
        prioritizationScore: score,
        scoreFactors,
        suggestedAction: {
          actionType: 'DRAFT_EVENT',
          targetModule: 'EVENTS',
          parameters: { eventType: 'ROUNDTABLE' },
        },
      });
    }

    // Opportunity 2: Deploy Welcome & Role Automation Workflows
    if (context.automation.activeWorkflowsCount !== null && context.automation.activeWorkflowsCount === 0) {
      const autoFacts = getFactsByCategory('AUTOMATION');
      autoFacts.push(`Active Automation Workflows: ${context.automation.activeWorkflowsCount}`);

      const impact = 3;
      const { score, scoreFactors } = calculateScore({
        impact,
        evidenceCount: autoFacts.length,
        confidenceLevel: 'HIGH',
        coverageStatus: context.dataCoverage.coverageStatus,
        hasAction: true,
      });

      candidateRecs.push({
        id: 'rec_deploy_automations',
        title: 'Deploy Automated Welcome & Role Workflows',
        reason: `No automated workflows are currently active. Automating welcome messages and default roles eliminates manual administrative overhead.`,
        description: `Setting up basic workflow triggers reduces manual management workload and ensures immediate member onboarding.`,
        rationale: 'Automated welcome workflows boost day-1 new member engagement and role assignment consistency.',
        supportingFacts: autoFacts,
        affectedModule: 'AUTOMATION',
        priority: 'MEDIUM',
        confidence: 'HIGH',
        confidenceScore: 0.9,
        suggestedNextStep: 'Enable the pre-configured Welcome Message and Default Role Assignment workflow.',
        canonicalDeepLink: `/communities/${tenantId}/automations`,
        type: 'OPPORTUNITY',
        prioritizationScore: score,
        scoreFactors,
        suggestedAction: {
          actionType: 'SUGGEST_WORKFLOW',
          targetModule: 'AUTOMATION',
        },
      });
    }

    // ==========================================
    // 5. IMPROVEMENT AREAS
    // ==========================================

    // Improvement Area 1: Empty Event Calendar
    if (context.events.upcomingEventsCount !== null && context.events.upcomingEventsCount === 0) {
      const eventFacts = getFactsByCategory('EVENTS');
      eventFacts.push('Upcoming Events: 0 scheduled');

      const impact = 2;
      const { score, scoreFactors } = calculateScore({
        impact,
        evidenceCount: eventFacts.length,
        confidenceLevel: 'HIGH',
        coverageStatus: context.dataCoverage.coverageStatus,
        hasAction: true,
      });

      candidateRecs.push({
        id: 'rec_schedule_community_event',
        title: 'Schedule an Upcoming Community Event',
        reason: 'No active or upcoming events are currently scheduled on the community calendar.',
        description: 'No active or upcoming events are currently scheduled on the calendar.',
        rationale: 'Regular scheduled activities maintain community cohesion and stimulate member participation.',
        supportingFacts: eventFacts,
        affectedModule: 'EVENTS',
        priority: 'LOW',
        confidence: 'HIGH',
        confidenceScore: 0.85,
        suggestedNextStep: 'Draft and schedule a community session or Q&A in the Events Calendar.',
        canonicalDeepLink: `/communities/${tenantId}/events`,
        type: 'IMPROVEMENT_AREA',
        prioritizationScore: score,
        scoreFactors,
        suggestedAction: {
          actionType: 'DRAFT_EVENT',
          targetModule: 'EVENTS',
          parameters: { eventType: 'COMMUNITY_MEETUP' },
        },
      });
    }

    // Improvement Area 2: Broadcast Communication Cadence
    if (context.engagement.announcementsSent !== null && context.engagement.announcementsSent === 0) {
      const engFacts = getFactsByCategory('ENGAGEMENT');
      engFacts.push('Announcements Sent: 0 in observed window');

      const impact = 2;
      const { score, scoreFactors } = calculateScore({
        impact,
        evidenceCount: engFacts.length,
        confidenceLevel: 'HIGH',
        coverageStatus: context.dataCoverage.coverageStatus,
        hasAction: true,
      });

      candidateRecs.push({
        id: 'rec_draft_weekly_announcement',
        title: 'Establish Regular Community Announcement Cadence',
        reason: 'Zero announcements were published during the observed window.',
        description: 'Consistent communication keeps community members informed of developments and highlights.',
        rationale: 'Weekly or bi-weekly broadcasts maintain top-of-mind awareness among inactive members.',
        supportingFacts: engFacts,
        affectedModule: 'ENGAGEMENT',
        priority: 'LOW',
        confidence: 'HIGH',
        confidenceScore: 0.85,
        suggestedNextStep: 'Draft a weekly community highlights broadcast in the Engagement tab.',
        canonicalDeepLink: `/communities/${tenantId}/engagement`,
        type: 'IMPROVEMENT_AREA',
        prioritizationScore: score,
        scoreFactors,
        suggestedAction: {
          actionType: 'DRAFT_ANNOUNCEMENT',
          targetModule: 'ENGAGEMENT',
        },
      });
    }

    // 6. PRIORITIZATION: Sort descending by prioritization score
    candidateRecs.sort((a, b) => (b.prioritizationScore || 0) - (a.prioritizationScore || 0));

    // 7. Validation: Filter out any containing forbidden guaranteed claims
    return this.validateRecommendations(candidateRecs);
  }

  /**
   * Validates that recommendations contain no ungrounded or prohibited guaranteed outcome claims
   * and adhere strictly to factual evidence.
   */
  static validateRecommendations(recs: AiRecommendation[]): AiRecommendation[] {
    return recs.filter((rec) => {
      // Must contain essential fields
      if (!rec.id || !rec.title || !rec.reason || !rec.affectedModule || !rec.suggestedNextStep) {
        return false;
      }

      // Supporting facts must be present and non-empty
      if (!Array.isArray(rec.supportingFacts) || rec.supportingFacts.length === 0) {
        return false;
      }

      // Prohibit guaranteed outcome claims
      const hasGuaranteedClaim =
        AiSafetyService.checkForGuaranteedClaims(rec.title) ||
        AiSafetyService.checkForGuaranteedClaims(rec.reason) ||
        AiSafetyService.checkForGuaranteedClaims(rec.description) ||
        AiSafetyService.checkForGuaranteedClaims(rec.rationale) ||
        AiSafetyService.checkForGuaranteedClaims(rec.suggestedNextStep);

      if (hasGuaranteedClaim) {
        return false;
      }

      return true;
    });
  }
}
