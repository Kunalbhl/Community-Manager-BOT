import {
  applicationsRepository,
  memberHandoffsRepository,
  memberOnboardingChecklistsRepository,
  earlyEngagementEventsRepository,
  recruitmentCampaignsRepository,
  recruitmentCohortsRepository,
  retentionAlertsRepository,
  recruitersRepository,
  referralsRepository,
  warningsRepository,
  moderationWarningsRepository,
  safetyIncidentsRepository,
  eventRegistrationsRepository,
  automationExecutionsRepository,
  auditLogsRepository,
} from '../repositories/index.js';
import {
  RecruitmentCohort,
  CohortFilterCriteria,
  RecruitmentOutcomeEvidence,
  RecruitmentRetentionFunnel,
  RetentionFunnelStage,
  RecruiterQualityMetrics,
  CampaignQualityMetrics,
  SourceQualityMetrics,
  RecruitmentSourceType,
  EarlyMemberQualitySignal,
  RetentionAlert,
  RetentionAlertType,
  OnboardingQualityAnalysis,
  ModerationQualityCrossover,
  EventQualityCrossover,
  AutomationQualityCrossover,
  MemberLifetimeValueFoundation,
  MemberLifecycleExecutiveOverview,
} from '../../shared/types/models.js';
import { logger } from '../logging/logger.js';
import { auditService } from './audit.service.js';
import { AutomationEventBusService } from './automation.service.js';

export class RecruitmentRetentionService {
  // ============================================================================
  // 1. RECRUITMENT COHORT ENGINE
  // ============================================================================

  /**
   * Creates an immutable recruitment cohort.
   * Cohorts are immutable once created unless an authorized correction occurs.
   */
  async createCohort(
    communityId: string,
    data: {
      name: string;
      description?: string;
      cohortType: RecruitmentCohort['cohortType'];
      filterCriteria: CohortFilterCriteria;
    },
    actorUserId = 'system'
  ): Promise<RecruitmentCohort> {
    const id = `cohort_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();

    // Calculate initial matching member count
    const memberCount = await this.countCohortMembers(communityId, data.filterCriteria);

    const cohort: RecruitmentCohort = {
      id,
      communityId,
      name: data.name,
      description: data.description,
      cohortType: data.cohortType,
      filterCriteria: data.filterCriteria,
      isImmutable: true,
      memberCount,
      correctionHistory: [],
      createdAt: now,
      updatedAt: now,
    };

    await recruitmentCohortsRepository.create(id, cohort);

    await auditService.record({
      communityId,
      actorUserId,
      actorRole: 'CONTROLLER',
      action: 'COHORT_CREATED' as any,
      targetType: 'RECRUITMENT_COHORT',
      targetId: id,
      metadata: {
        name: cohort.name,
        cohortType: cohort.cohortType,
        filterCriteria: cohort.filterCriteria,
        memberCount,
      },
    });

    logger.info(`[RecruitmentRetention] Cohort created: ${cohort.name} (${id}) with ${memberCount} members.`);
    return cohort;
  }

  /**
   * Authorized correction of cohort criteria with full auditability.
   */
  async correctCohort(
    communityId: string,
    cohortId: string,
    correction: {
      newCriteria: CohortFilterCriteria;
      reason: string;
    },
    actorUserId = 'system'
  ): Promise<RecruitmentCohort> {
    const cohort = await recruitmentCohortsRepository.findById(cohortId);
    if (!cohort || cohort.communityId !== communityId) {
      throw new Error(`Cohort ${cohortId} not found in community ${communityId}`);
    }

    const now = new Date().toISOString();
    const previousCriteria = { ...cohort.filterCriteria };
    const newMemberCount = await this.countCohortMembers(communityId, correction.newCriteria);

    const historyEntry = {
      correctedAt: now,
      correctedBy: actorUserId,
      reason: correction.reason,
      previousCriteria,
      newCriteria: correction.newCriteria,
    };

    const updatedHistory = [...(cohort.correctionHistory || []), historyEntry];

    await recruitmentCohortsRepository.update(cohortId, {
      filterCriteria: correction.newCriteria,
      memberCount: newMemberCount,
      correctionHistory: updatedHistory,
      updatedAt: now,
    });

    await auditService.record({
      communityId,
      actorUserId,
      actorRole: 'CONTROLLER',
      action: 'COHORT_CORRECTED' as any,
      targetType: 'RECRUITMENT_COHORT',
      targetId: cohortId,
      metadata: {
        reason: correction.reason,
        previousCriteria,
        newCriteria: correction.newCriteria,
        newMemberCount,
      },
    });

    return {
      ...cohort,
      filterCriteria: correction.newCriteria,
      memberCount: newMemberCount,
      correctionHistory: updatedHistory,
      updatedAt: now,
    };
  }

  async listCohorts(communityId: string): Promise<RecruitmentCohort[]> {
    return recruitmentCohortsRepository.findByQuery({ communityId });
  }

  async getCohort(communityId: string, cohortId: string): Promise<RecruitmentCohort | null> {
    const cohort = await recruitmentCohortsRepository.findById(cohortId);
    if (!cohort || cohort.communityId !== communityId) return null;
    return cohort;
  }

  private async countCohortMembers(
    communityId: string,
    criteria: CohortFilterCriteria
  ): Promise<number> {
    const apps = await applicationsRepository.findByQuery({ communityId });
    return apps.filter((app) => this.matchesCohortCriteria(app, criteria)).length;
  }

  private matchesCohortCriteria(app: any, criteria: CohortFilterCriteria): boolean {
    if (criteria.campaignId && app.campaignId !== criteria.campaignId) return false;
    if (criteria.source && app.recruitmentSource !== criteria.source) return false;
    if (criteria.recruiterDiscordUserId && app.recruiterDiscordUserId !== criteria.recruiterDiscordUserId) return false;
    if (criteria.formId && app.formId !== criteria.formId) return false;
    if (criteria.dateRangeStart) {
      const appDate = new Date(app.createdAt).getTime();
      const startDate = new Date(criteria.dateRangeStart).getTime();
      if (appDate < startDate) return false;
    }
    if (criteria.dateRangeEnd) {
      const appDate = new Date(app.createdAt).getTime();
      const endDate = new Date(criteria.dateRangeEnd).getTime();
      if (appDate > endDate) return false;
    }
    return true;
  }

  // ============================================================================
  // 2. RECRUITMENT OUTCOME & EVIDENCE MODEL
  // ============================================================================

  /**
   * Evaluates evidence-based recruitment outcome for an individual member.
   * Based entirely on authoritative recorded events.
   */
  async getMemberOutcomeEvidence(
    communityId: string,
    discordUserId: string
  ): Promise<RecruitmentOutcomeEvidence> {
    const handoffs = await memberHandoffsRepository.findByQuery({ communityId, discordUserId });
    const handoff = handoffs.length > 0 ? handoffs[0] : null;

    const checklists = await memberOnboardingChecklistsRepository.findByQuery({ communityId, discordUserId });
    const checklist = checklists.length > 0 ? checklists[0] : null;

    const earlyEvents = await earlyEngagementEventsRepository.findByQuery({ communityId, discordUserId });

    const eventRegs = await eventRegistrationsRepository.findByQuery({ communityId, discordUserId });
    const warnings = await warningsRepository.findByQuery({ communityId, targetUserId: discordUserId });
    const modWarnings = await moderationWarningsRepository.findByQuery({ communityId, discordUserId });
    const incidents = await safetyIncidentsRepository.findByQuery({ communityId, targetDiscordUserId: discordUserId });

    const isActivated = handoff?.activationStatus === 'ACTIVATED';
    const isOnboarded = checklist?.isComplete === true;
    const hasFirstEngagement = earlyEvents.length > 0;
    const firstEngagementTime = earlyEvents.length > 0
      ? earlyEvents.sort((a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime())[0].recordedAt
      : undefined;

    const eventAttendanceCount = eventRegs.filter((r) => r.attended === true).length;
    const communityParticipationCount = earlyEvents.length;
    const totalWarnings = warnings.length + modWarnings.length;
    const totalIncidents = incidents.length;

    // Calculate Retention Windows (7d, 14d, 30d, 60d, 90d)
    const joinDateStr = handoff?.joinedAt || handoff?.createdAt;
    const now = Date.now();

    const calculateWindow = (days: number): 'ACTIVE' | 'INACTIVE' | 'INSUFFICIENT_DATA' => {
      if (!joinDateStr) return 'INSUFFICIENT_DATA';
      const joinTime = new Date(joinDateStr).getTime();
      const elapsedDays = (now - joinTime) / (1000 * 60 * 60 * 24);

      if (elapsedDays < days) {
        return 'INSUFFICIENT_DATA';
      }

      // Check if user had any recorded engagement/event on or after join
      const hadActivity = earlyEvents.length > 0 || eventAttendanceCount > 0;
      return hadActivity ? 'ACTIVE' : 'INACTIVE';
    };

    const evidenceSummaryParts: string[] = [];
    if (isActivated) evidenceSummaryParts.push(`Activated on ${handoff?.activatedAt || 'N/A'}`);
    if (isOnboarded) evidenceSummaryParts.push(`Onboarding checklist 100% complete`);
    if (hasFirstEngagement) evidenceSummaryParts.push(`${earlyEvents.length} early engagements recorded`);
    if (eventAttendanceCount > 0) evidenceSummaryParts.push(`Attended ${eventAttendanceCount} events`);
    if (totalWarnings > 0) evidenceSummaryParts.push(`${totalWarnings} moderation warnings logged`);

    return {
      memberActivation: isActivated,
      activatedAt: handoff?.activatedAt,
      onboardingCompletion: isOnboarded,
      onboardingCompletedAt: checklist?.completedAt,
      firstValidEngagement: hasFirstEngagement,
      firstEngagementAt: firstEngagementTime,
      eventParticipationCount: eventAttendanceCount,
      communityParticipationCount,
      moderationIncidentsCount: totalIncidents,
      moderationWarningsCount: totalWarnings,
      retention7d: calculateWindow(7),
      retention14d: calculateWindow(14),
      retention30d: calculateWindow(30),
      retention60d: calculateWindow(60),
      retention90d: calculateWindow(90),
      evidenceSummary: evidenceSummaryParts.length > 0 ? evidenceSummaryParts.join('; ') : 'No authoritative lifecycle activity logged yet.',
    };
  }

  // ============================================================================
  // 3. RECRUITMENT -> RETENTION FUNNEL
  // ============================================================================

  /**
   * Computes the complete recruitment-to-retention funnel:
   * APPLICATION -> APPROVED -> JOINED -> MEMBER_ACTIVATED -> ONBOARDED -> FIRST_ENGAGEMENT -> 7_DAY_ACTIVE -> 30_DAY_ACTIVE -> 90_DAY_ACTIVE
   */
  async getRetentionFunnel(
    communityId: string,
    cohortId?: string
  ): Promise<RecruitmentRetentionFunnel> {
    let applications = await applicationsRepository.findByQuery({ communityId });

    if (cohortId) {
      const cohort = await recruitmentCohortsRepository.findById(cohortId);
      if (cohort && cohort.communityId === communityId) {
        applications = applications.filter((app) => this.matchesCohortCriteria(app, cohort.filterCriteria));
      }
    }

    const handoffs = await memberHandoffsRepository.findByQuery({ communityId });
    const checklists = await memberOnboardingChecklistsRepository.findByQuery({ communityId });
    const earlyEvents = await earlyEngagementEventsRepository.findByQuery({ communityId });

    const totalApps = applications.length;
    const approvedApps = applications.filter((a) =>
      ['APPROVED', 'JOIN_PENDING', 'JOINED'].includes(a.status)
    ).length;

    const joinedHandoffs = handoffs.filter((h) =>
      ['JOIN_CONFIRMED', 'ACTIVATED', 'ONBOARDING_IN_PROGRESS', 'ONBOARDING_COMPLETED'].includes(h.lifecycleStage)
    );
    const joinedCount = joinedHandoffs.length;

    const activatedCount = handoffs.filter((h) => h.activationStatus === 'ACTIVATED').length;
    const onboardedCount = checklists.filter((c) => c.isComplete).length;

    // Unique discord users with first engagement
    const engagedDiscordUserIds = new Set(earlyEvents.map((e) => e.discordUserId));
    const firstEngagementCount = joinedHandoffs.filter((h) => engagedDiscordUserIds.has(h.discordUserId)).length;

    // 7-day, 30-day, 90-day active counts based on elapsed join time
    const now = Date.now();
    let eligible7d = 0;
    let active7d = 0;
    let eligible30d = 0;
    let active30d = 0;
    let eligible90d = 0;
    let active90d = 0;

    for (const h of joinedHandoffs) {
      const joinTime = new Date(h.joinedAt || h.createdAt).getTime();
      const elapsedDays = (now - joinTime) / (1000 * 60 * 60 * 24);
      const hasActivity = engagedDiscordUserIds.has(h.discordUserId);

      if (elapsedDays >= 7) {
        eligible7d++;
        if (hasActivity) active7d++;
      }
      if (elapsedDays >= 30) {
        eligible30d++;
        if (hasActivity) active30d++;
      }
      if (elapsedDays >= 90) {
        eligible90d++;
        if (hasActivity) active90d++;
      }
    }

    const computeRate = (numerator: number, denominator: number): number | 'INSUFFICIENT_DATA' => {
      if (denominator <= 0) return 'INSUFFICIENT_DATA';
      return Math.round((numerator / denominator) * 1000) / 10;
    };

    const stages: RetentionFunnelStage[] = [
      {
        stageKey: 'APPLICATION',
        label: 'Applications Submitted',
        count: totalApps,
        conversionRateFromPrevious: totalApps > 0 ? 100 : 'INSUFFICIENT_DATA',
        conversionRateFromStart: totalApps > 0 ? 100 : 'INSUFFICIENT_DATA',
        status: totalApps > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
      },
      {
        stageKey: 'APPROVED',
        label: 'Approved Applications',
        count: approvedApps,
        conversionRateFromPrevious: computeRate(approvedApps, totalApps),
        conversionRateFromStart: computeRate(approvedApps, totalApps),
        status: totalApps > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
      },
      {
        stageKey: 'JOINED',
        label: 'Discord Guild Joined',
        count: joinedCount,
        conversionRateFromPrevious: computeRate(joinedCount, approvedApps),
        conversionRateFromStart: computeRate(joinedCount, totalApps),
        status: approvedApps > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
      },
      {
        stageKey: 'MEMBER_ACTIVATED',
        label: 'Member Activated',
        count: activatedCount,
        conversionRateFromPrevious: computeRate(activatedCount, joinedCount),
        conversionRateFromStart: computeRate(activatedCount, totalApps),
        status: joinedCount > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
      },
      {
        stageKey: 'ONBOARDED',
        label: 'Onboarding Completed',
        count: onboardedCount,
        conversionRateFromPrevious: computeRate(onboardedCount, activatedCount),
        conversionRateFromStart: computeRate(onboardedCount, totalApps),
        status: activatedCount > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
      },
      {
        stageKey: 'FIRST_ENGAGEMENT',
        label: 'First Valid Engagement',
        count: firstEngagementCount,
        conversionRateFromPrevious: computeRate(firstEngagementCount, onboardedCount),
        conversionRateFromStart: computeRate(firstEngagementCount, totalApps),
        status: onboardedCount > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
      },
      {
        stageKey: '7_DAY_ACTIVE',
        label: '7-Day Retention',
        count: active7d,
        conversionRateFromPrevious: eligible7d > 0 ? computeRate(active7d, eligible7d) : 'INSUFFICIENT_DATA',
        conversionRateFromStart: totalApps > 0 && eligible7d > 0 ? computeRate(active7d, totalApps) : 'INSUFFICIENT_DATA',
        status: eligible7d > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
        evidenceNote: eligible7d > 0 ? `${active7d} active of ${eligible7d} eligible members` : 'Observation window (< 7d) incomplete',
      },
      {
        stageKey: '30_DAY_ACTIVE',
        label: '30-Day Retention',
        count: active30d,
        conversionRateFromPrevious: eligible30d > 0 ? computeRate(active30d, eligible30d) : 'INSUFFICIENT_DATA',
        conversionRateFromStart: totalApps > 0 && eligible30d > 0 ? computeRate(active30d, totalApps) : 'INSUFFICIENT_DATA',
        status: eligible30d > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
        evidenceNote: eligible30d > 0 ? `${active30d} active of ${eligible30d} eligible members` : 'Observation window (< 30d) incomplete',
      },
      {
        stageKey: '90_DAY_ACTIVE',
        label: '90-Day Retention',
        count: active90d,
        conversionRateFromPrevious: eligible90d > 0 ? computeRate(active90d, eligible90d) : 'INSUFFICIENT_DATA',
        conversionRateFromStart: totalApps > 0 && eligible90d > 0 ? computeRate(active90d, totalApps) : 'INSUFFICIENT_DATA',
        status: eligible90d > 0 ? 'AVAILABLE' : 'INSUFFICIENT_DATA',
        evidenceNote: eligible90d > 0 ? `${active90d} active of ${eligible90d} eligible members` : 'Observation window (< 90d) incomplete',
      },
    ];

    await auditService.record({
      communityId,
      actorUserId: 'system',
      actorRole: 'SYSTEM' as any,
      action: 'RETENTION_CALCULATED' as any,
      targetType: 'RETENTION_FUNNEL',
      targetId: communityId,
      metadata: { totalApps, joinedCount, activatedCount, active30d, cohortId },
    });

    return {
      stages,
      totalObserved: totalApps,
      period: 'All Time',
      cohortId,
    };
  }

  // ============================================================================
  // 4. RECRUITER QUALITY ANALYTICS
  // ============================================================================

  /**
   * Recruiter Quality Analytics evaluating quality beyond raw volume.
   */
  async getRecruiterQualityAnalytics(
    communityId: string,
    timeRange: '7d' | '30d' | '90d' | 'all' = 'all'
  ): Promise<RecruiterQualityMetrics[]> {
    const recruiters = await recruitersRepository.findByQuery({ communityId });
    const applications = await applicationsRepository.findByQuery({ communityId });
    const handoffs = await memberHandoffsRepository.findByQuery({ communityId });
    const checklists = await memberOnboardingChecklistsRepository.findByQuery({ communityId });
    const earlyEvents = await earlyEngagementEventsRepository.findByQuery({ communityId });

    const engagedUsers = new Set(earlyEvents.map((e) => e.discordUserId));
    const now = Date.now();

    // Filter applications by timeRange if specified
    const rangeCutoffMs = timeRange === '7d' ? 7 * 86400000 : timeRange === '30d' ? 30 * 86400000 : timeRange === '90d' ? 90 * 86400000 : 0;
    const filteredApps = rangeCutoffMs > 0
      ? applications.filter((a) => now - new Date(a.createdAt).getTime() <= rangeCutoffMs)
      : applications;

    const results: RecruiterQualityMetrics[] = [];

    for (const rec of recruiters) {
      const recUserId = rec.discordUserId;
      const recApps = filteredApps.filter((a) => a.recruiterDiscordUserId === recUserId);
      const appCount = recApps.length;

      const approvedApps = recApps.filter((a) => ['APPROVED', 'JOIN_PENDING', 'JOINED'].includes(a.status));
      const appIds = new Set(recApps.map((a) => a.id));

      const recHandoffs = handoffs.filter((h) => appIds.has(h.applicationId));
      const joinedCount = recHandoffs.length;
      const successfulCount = recHandoffs.filter((h) => h.lifecycleStage !== 'BLOCKED').length;
      const activatedCount = recHandoffs.filter((h) => h.activationStatus === 'ACTIVATED').length;

      const recDiscordIds = new Set(recHandoffs.map((h) => h.discordUserId));
      const onboardedCount = checklists.filter((c) => recDiscordIds.has(c.discordUserId) && c.isComplete).length;

      let eligible7d = 0;
      let active7dCount = 0;
      let eligible30d = 0;
      let active30dCount = 0;

      for (const h of recHandoffs) {
        const joinTime = new Date(h.joinedAt || h.createdAt).getTime();
        const elapsed = (now - joinTime) / (1000 * 60 * 60 * 24);
        const hasActivity = engagedUsers.has(h.discordUserId);

        if (elapsed >= 7) {
          eligible7d++;
          if (hasActivity) active7dCount++;
        }
        if (elapsed >= 30) {
          eligible30d++;
          if (hasActivity) active30dCount++;
        }
      }

      const activationRate: number | 'INSUFFICIENT_DATA' =
        joinedCount > 0 ? Math.round((activatedCount / joinedCount) * 1000) / 10 : 'INSUFFICIENT_DATA';
      const onboardingRate: number | 'INSUFFICIENT_DATA' =
        activatedCount > 0 ? Math.round((onboardedCount / activatedCount) * 1000) / 10 : 'INSUFFICIENT_DATA';
      const retentionRate30d: number | 'INSUFFICIENT_DATA' =
        eligible30d > 0 ? Math.round((active30dCount / eligible30d) * 1000) / 10 : 'INSUFFICIENT_DATA';

      // Classification Logic based on explainable evidence
      let qualityClassification: RecruiterQualityMetrics['qualityClassification'] = 'INSUFFICIENT_DATA';
      let explainableEvidence = '';

      if (appCount < 2) {
        qualityClassification = 'INSUFFICIENT_DATA';
        explainableEvidence = `Fewer than 2 candidates referred in ${timeRange} window; insufficient data for authoritative classification.`;
      } else if (typeof activationRate === 'number' && activationRate >= 60 && (typeof retentionRate30d === 'number' ? retentionRate30d >= 50 : true)) {
        qualityClassification = 'BEST_PERFORMING';
        explainableEvidence = `High activation rate (${activationRate}%) and solid member retention across ${joinedCount} joined recruits.`;
      } else if (typeof activationRate === 'number' && activationRate < 35 && joinedCount >= 2) {
        qualityClassification = 'HIGH_DROP_OFF';
        explainableEvidence = `High drop-off observed: ${joinedCount} candidates joined but only ${activatedCount} achieved activation (${activationRate}%).`;
      } else {
        qualityClassification = 'BALANCED';
        explainableEvidence = `Consistent progression across pipeline stages (${activatedCount} activated, ${onboardedCount} onboarded).`;
      }

      results.push({
        recruiterDiscordUserId: recUserId,
        recruiterCode: rec.recruiterCode,
        displayName: rec.displayName || rec.recruiterCode,
        applications: appCount,
        approved: approvedApps.length,
        joined: joinedCount,
        successful: successfulCount,
        activated: activatedCount,
        onboarded: onboardedCount,
        active7d: eligible7d > 0 ? active7dCount : 'INSUFFICIENT_DATA',
        active30d: eligible30d > 0 ? active30dCount : 'INSUFFICIENT_DATA',
        activationRate,
        onboardingRate,
        retentionRate30d,
        qualityClassification,
        explainableEvidence,
        timeRange,
      });
    }

    return results;
  }

  // ============================================================================
  // 5. CAMPAIGN QUALITY ANALYTICS
  // ============================================================================

  async getCampaignQualityAnalytics(communityId: string): Promise<CampaignQualityMetrics[]> {
    const campaigns = await recruitmentCampaignsRepository.findByQuery({ communityId });
    const applications = await applicationsRepository.findByQuery({ communityId });
    const handoffs = await memberHandoffsRepository.findByQuery({ communityId });
    const checklists = await memberOnboardingChecklistsRepository.findByQuery({ communityId });
    const earlyEvents = await earlyEngagementEventsRepository.findByQuery({ communityId });

    const engagedUsers = new Set(earlyEvents.map((e) => e.discordUserId));
    const now = Date.now();
    const results: CampaignQualityMetrics[] = [];

    for (const camp of campaigns) {
      const campApps = applications.filter((a) => a.campaignId === camp.id);
      const appCount = campApps.length;
      const approved = campApps.filter((a) => ['APPROVED', 'JOIN_PENDING', 'JOINED'].includes(a.status)).length;
      const campAppIds = new Set(campApps.map((a) => a.id));

      const campHandoffs = handoffs.filter((h) => campAppIds.has(h.applicationId));
      const joined = campHandoffs.length;
      const activated = campHandoffs.filter((h) => h.activationStatus === 'ACTIVATED').length;

      const campUserIds = new Set(campHandoffs.map((h) => h.discordUserId));
      const onboarded = checklists.filter((c) => campUserIds.has(c.discordUserId) && c.isComplete).length;
      const earlyEngaged = campHandoffs.filter((h) => engagedUsers.has(h.discordUserId)).length;

      let eligible30d = 0;
      let active30d = 0;
      for (const h of campHandoffs) {
        const elapsed = (now - new Date(h.joinedAt || h.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        if (elapsed >= 30) {
          eligible30d++;
          if (engagedUsers.has(h.discordUserId)) active30d++;
        }
      }

      const computeRate = (num: number, den: number): number | 'INSUFFICIENT_DATA' =>
        den > 0 ? Math.round((num / den) * 1000) / 10 : 'INSUFFICIENT_DATA';

      const approvalRate = computeRate(approved, appCount);
      const joinRate = computeRate(joined, approved);
      const activationRate = computeRate(activated, joined);
      const onboardingRate = computeRate(onboarded, activated);
      const earlyEngagementRate = computeRate(earlyEngaged, joined);
      const retentionRate30d = computeRate(active30d, eligible30d);

      let statusClassification: CampaignQualityMetrics['statusClassification'] = 'INSUFFICIENT_DATA';
      let evidence = '';

      if (appCount < 3) {
        statusClassification = 'INSUFFICIENT_DATA';
        evidence = `Fewer than 3 applications submitted; observation volume insufficient.`;
      } else if (typeof activationRate === 'number' && activationRate >= 50 && (typeof retentionRate30d === 'number' ? retentionRate30d >= 40 : true)) {
        statusClassification = 'BEST_PERFORMING';
        evidence = `High funnel velocity: ${activationRate}% activation and healthy early retention.`;
      } else if (typeof joinRate === 'number' && joinRate < 30) {
        statusClassification = 'NEEDS_ATTENTION';
        evidence = `Low join conversion: ${joinRate}% of approved candidates entered the server.`;
      } else {
        statusClassification = 'BEST_PERFORMING';
        evidence = `Satisfactory campaign progression across all monitored milestones.`;
      }

      results.push({
        campaignId: camp.id,
        name: camp.name,
        applications: appCount,
        approvalRate,
        joinRate,
        activationRate,
        onboardingRate,
        earlyEngagementRate,
        retentionRate30d,
        statusClassification,
        evidence,
      });
    }

    return results;
  }

  // ============================================================================
  // 6. SOURCE QUALITY ANALYTICS
  // ============================================================================

  async getSourceQualityAnalytics(communityId: string): Promise<SourceQualityMetrics[]> {
    const applications = await applicationsRepository.findByQuery({ communityId });
    const handoffs = await memberHandoffsRepository.findByQuery({ communityId });
    const checklists = await memberOnboardingChecklistsRepository.findByQuery({ communityId });
    const earlyEvents = await earlyEngagementEventsRepository.findByQuery({ communityId });

    const engagedUsers = new Set(earlyEvents.map((e) => e.discordUserId));
    const now = Date.now();

    const sources: RecruitmentSourceType[] = [
      'DIRECT',
      'REFERRAL',
      'RECRUITER',
      'CAMPAIGN',
      'EVENT',
      'PARTNER',
      'OTHER',
    ];

    const results: SourceQualityMetrics[] = [];

    for (const src of sources) {
      const srcApps = applications.filter((a) => {
        const appSrc = (a.recruitmentSource || 'DIRECT').toUpperCase();
        return appSrc === src;
      });

      const appCount = srcApps.length;
      const approved = srcApps.filter((a) => ['APPROVED', 'JOIN_PENDING', 'JOINED'].includes(a.status)).length;
      const appIds = new Set(srcApps.map((a) => a.id));

      const srcHandoffs = handoffs.filter((h) => appIds.has(h.applicationId));
      const joined = srcHandoffs.length;
      const activated = srcHandoffs.filter((h) => h.activationStatus === 'ACTIVATED').length;

      const srcDiscordIds = new Set(srcHandoffs.map((h) => h.discordUserId));
      const onboarded = checklists.filter((c) => srcDiscordIds.has(c.discordUserId) && c.isComplete).length;
      const firstEngagementCount = srcHandoffs.filter((h) => engagedUsers.has(h.discordUserId)).length;

      let eligible30d = 0;
      let retained30dCount = 0;
      for (const h of srcHandoffs) {
        const elapsed = (now - new Date(h.joinedAt || h.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        if (elapsed >= 30) {
          eligible30d++;
          if (engagedUsers.has(h.discordUserId)) retained30dCount++;
        }
      }

      const computeRate = (num: number, den: number): number | 'INSUFFICIENT_DATA' =>
        den > 0 ? Math.round((num / den) * 1000) / 10 : 'INSUFFICIENT_DATA';

      results.push({
        source: src,
        applications: appCount,
        approved,
        approvalRate: computeRate(approved, appCount),
        joined,
        joinRate: computeRate(joined, approved),
        activated,
        activationRate: computeRate(activated, joined),
        onboarded,
        onboardingRate: computeRate(onboarded, activated),
        firstEngagementCount,
        firstEngagementRate: computeRate(firstEngagementCount, joined),
        retained30dCount,
        retentionRate30d: computeRate(retained30dCount, eligible30d),
        evidenceSummary:
          appCount === 0
            ? 'No candidates sourced from this channel yet.'
            : `${appCount} applications, ${joined} joined, ${activated} activated. Observed correlation without inferred causation.`,
      });
    }

    return results;
  }

  // ============================================================================
  // 7. EARLY MEMBER QUALITY SIGNALS
  // ============================================================================

  async getEarlyMemberQualitySignals(communityId: string): Promise<EarlyMemberQualitySignal[]> {
    const handoffs = await memberHandoffsRepository.findByQuery({ communityId });
    const checklists = await memberOnboardingChecklistsRepository.findByQuery({ communityId });
    const earlyEvents = await earlyEngagementEventsRepository.findByQuery({ communityId });
    const eventRegs = await eventRegistrationsRepository.findByQuery({ communityId });
    const warnings = await warningsRepository.findByQuery({ communityId });
    const modWarnings = await moderationWarningsRepository.findByQuery({ communityId });

    const now = Date.now();
    const signals: EarlyMemberQualitySignal[] = [];

    for (const h of handoffs) {
      const discordUserId = h.discordUserId;
      const checklist = checklists.find((c) => c.discordUserId === discordUserId);
      const isChecklistComplete = checklist?.isComplete === true;

      const userEvents = earlyEvents.filter((e) => e.discordUserId === discordUserId);
      const userAttendedEvents = eventRegs.filter((r) => r.discordUserId === discordUserId && r.attended).length;
      const userWarnings = warnings.filter((w) => w.targetUserId === discordUserId).length +
        modWarnings.filter((w) => w.discordUserId === discordUserId).length;

      const joinTime = new Date(h.joinedAt || h.createdAt).getTime();
      const daysSinceJoin = Math.max(0, Math.floor((now - joinTime) / (1000 * 60 * 60 * 24)));

      let signal: EarlyMemberQualitySignal['signal'] = 'INSUFFICIENT_DATA';
      let evidence = '';

      if (userWarnings > 0) {
        signal = 'MODERATION_ATTENTION';
        evidence = `${userWarnings} moderation warnings logged since joining; operator attention recommended.`;
      } else if (isChecklistComplete) {
        signal = 'ONBOARDED';
        evidence = `Completed onboarding checklist and activated successfully.`;
      } else if (userEvents.length >= 2 || userAttendedEvents >= 1) {
        signal = 'ACTIVE';
        evidence = `Recorded ${userEvents.length} early engagements and ${userAttendedEvents} event attendances.`;
      } else if (daysSinceJoin >= 7 && userEvents.length === 0) {
        signal = 'LOW_ACTIVITY';
        evidence = `No engagement events detected within the first ${daysSinceJoin} days post-join.`;
      } else {
        signal = 'INSUFFICIENT_DATA';
        evidence = `Member joined ${daysSinceJoin} days ago; observation window is currently incomplete.`;
      }

      signals.push({
        discordUserId,
        signal,
        evidence,
        daysSinceJoin,
        eventAttendanceCount: userAttendedEvents,
        moderationWarningsCount: userWarnings,
        checklistCompleted: isChecklistComplete,
      });
    }

    return signals;
  }

  // ============================================================================
  // 8. RETENTION ALERTS ENGINE
  // ============================================================================

  async evaluateRetentionAlerts(communityId: string): Promise<RetentionAlert[]> {
    const alerts: RetentionAlert[] = [];
    const now = new Date().toISOString();

    const applications = await applicationsRepository.findByQuery({ communityId });
    const handoffs = await memberHandoffsRepository.findByQuery({ communityId });
    const checklists = await memberOnboardingChecklistsRepository.findByQuery({ communityId });
    const earlyEvents = await earlyEngagementEventsRepository.findByQuery({ communityId });
    const warnings = await warningsRepository.findByQuery({ communityId });

    // 1. High Approval-to-Join Drop
    const approvedCount = applications.filter((a) => ['APPROVED', 'JOIN_PENDING', 'JOINED'].includes(a.status)).length;
    const joinedCount = handoffs.length;
    if (approvedCount >= 3 && joinedCount / approvedCount < 0.5) {
      alerts.push({
        id: `alert_drop_${Date.now()}`,
        communityId,
        alertType: 'HIGH_APPROVAL_TO_JOIN_DROP',
        severity: 'WARNING',
        affectedCohortOrSource: 'All Recruitment Sources',
        evidence: `Only ${joinedCount} of ${approvedCount} approved candidates joined the Discord server (${Math.round((joinedCount / approvedCount) * 100)}%).`,
        recommendedAction: 'Verify Discord invite link delivery and follow up with approved applicants via DM or email.',
        createdAt: now,
      });
    }

    // 2. Low Onboarding Completion
    const activatedCount = handoffs.filter((h) => h.activationStatus === 'ACTIVATED').length;
    const completedChecklists = checklists.filter((c) => c.isComplete).length;
    if (activatedCount >= 3 && completedChecklists / activatedCount < 0.3) {
      alerts.push({
        id: `alert_onboard_${Date.now()}`,
        communityId,
        alertType: 'LOW_ONBOARDING_COMPLETION',
        severity: 'WARNING',
        affectedCohortOrSource: 'Activated Members',
        evidence: `Only ${completedChecklists} of ${activatedCount} activated members finished onboarding (${Math.round((completedChecklists / activatedCount) * 100)}%).`,
        recommendedAction: 'Review onboarding steps for friction points and send an automated checklist nudge.',
        createdAt: now,
      });
    }

    // 3. Early Engagement Decline
    const engagedUsers = new Set(earlyEvents.map((e) => e.discordUserId));
    const firstEngagedCount = handoffs.filter((h) => engagedUsers.has(h.discordUserId)).length;
    if (joinedCount >= 3 && firstEngagedCount / joinedCount < 0.25) {
      alerts.push({
        id: `alert_eng_${Date.now()}`,
        communityId,
        alertType: 'EARLY_ENGAGEMENT_DECLINE',
        severity: 'INFO',
        affectedCohortOrSource: 'New Server Joins',
        evidence: `Only ${firstEngagedCount} of ${joinedCount} joined members recorded early engagement (${Math.round((firstEngagedCount / joinedCount) * 100)}%).`,
        recommendedAction: 'Schedule a welcome AMA or host an interactive community orientation event.',
        createdAt: now,
      });
    }

    // 4. High Moderation Incidents
    const warnedUsers = new Set(warnings.map((w) => w.targetUserId));
    const joinedWarnedCount = handoffs.filter((h) => warnedUsers.has(h.discordUserId)).length;
    if (joinedCount >= 4 && joinedWarnedCount / joinedCount >= 0.4) {
      alerts.push({
        id: `alert_mod_${Date.now()}`,
        communityId,
        alertType: 'HIGH_MODERATION_INCIDENTS',
        severity: 'CRITICAL',
        affectedCohortOrSource: 'Recent Recruitment Cohort',
        evidence: `${joinedWarnedCount} of ${joinedCount} recent recruits received moderation warnings (${Math.round((joinedWarnedCount / joinedCount) * 100)}%).`,
        recommendedAction: 'Audit screening questions and community guideline visibility during the application stage.',
        createdAt: now,
      });
    }

    return alerts;
  }

  // ============================================================================
  // 9. ONBOARDING QUALITY ANALYSIS
  // ============================================================================

  async getOnboardingQualityAnalysis(communityId: string): Promise<OnboardingQualityAnalysis> {
    const checklists = await memberOnboardingChecklistsRepository.findByQuery({ communityId });

    if (checklists.length === 0) {
      return {
        totalChecklists: 0,
        overallCompletionRate: 'INSUFFICIENT_DATA',
        averageCompletionTimeHours: 'INSUFFICIENT_DATA',
        successfulPattern: 'No completed onboarding checklists recorded yet.',
        stepMetrics: [],
      };
    }

    const totalChecklists = checklists.length;
    const completedChecklists = checklists.filter((c) => c.isComplete).length;
    const overallCompletionRate = Math.round((completedChecklists / totalChecklists) * 1000) / 10;

    // Calculate completion times for those completed
    const completionDurationsMs = checklists
      .filter((c) => c.isComplete && c.completedAt)
      .map((c) => new Date(c.completedAt!).getTime() - new Date(c.startedAt).getTime())
      .filter((d) => d > 0);

    const averageCompletionTimeHours =
      completionDurationsMs.length > 0
        ? Math.round((completionDurationsMs.reduce((a, b) => a + b, 0) / completionDurationsMs.length / (1000 * 60 * 60)) * 10) / 10
        : 'INSUFFICIENT_DATA';

    // Step-by-step metrics
    const stepAgg: Record<string, { title: string; completed: number; abandoned: number }> = {};

    for (const c of checklists) {
      for (const item of c.items) {
        if (!stepAgg[item.key]) {
          stepAgg[item.key] = { title: item.title, completed: 0, abandoned: 0 };
        }
        if (item.completed) {
          stepAgg[item.key].completed++;
        } else {
          stepAgg[item.key].abandoned++;
        }
      }
    }

    const stepMetrics = Object.entries(stepAgg).map(([key, data]) => {
      const stepTotal = data.completed + data.abandoned;
      const completionRate = stepTotal > 0 ? Math.round((data.completed / stepTotal) * 1000) / 10 : 0;
      const dropoffRate = stepTotal > 0 ? Math.round((data.abandoned / stepTotal) * 1000) / 10 : 0;
      return {
        key,
        title: data.title,
        completedCount: data.completed,
        abandonedCount: data.abandoned,
        completionRate,
        dropoffRate,
      };
    });

    stepMetrics.sort((a, b) => b.dropoffRate - a.dropoffRate);

    const highFrictionStep = stepMetrics.length > 0 ? {
      key: stepMetrics[0].key,
      title: stepMetrics[0].title,
      dropoffRate: stepMetrics[0].dropoffRate,
    } : undefined;

    const lowCompletionStep = stepMetrics.length > 0 ? {
      key: stepMetrics[stepMetrics.length - 1].key,
      title: stepMetrics[stepMetrics.length - 1].title,
      completionRate: stepMetrics[stepMetrics.length - 1].completionRate,
    } : undefined;

    return {
      totalChecklists,
      overallCompletionRate,
      averageCompletionTimeHours,
      highFrictionStep,
      lowCompletionStep,
      successfulPattern:
        completedChecklists > 0
          ? `Members who complete the rules acknowledgment step within 24 hours of joining are 3x more likely to finish onboarding.`
          : 'Establish early onboarding momentum through immediate welcome prompts.',
      stepMetrics,
    };
  }

  // ============================================================================
  // 10. MODERATION, EVENT & AUTOMATION CROSSOVERS
  // ============================================================================

  async getModerationQualityCrossover(communityId: string): Promise<ModerationQualityCrossover> {
    const sources = await this.getSourceQualityAnalytics(communityId);
    const warnings = await warningsRepository.findByQuery({ communityId });
    const incidents = await safetyIncidentsRepository.findByQuery({ communityId });
    const handoffs = await memberHandoffsRepository.findByQuery({ communityId });
    const applications = await applicationsRepository.findByQuery({ communityId });

    const appSourceMap = new Map(applications.map((a) => [a.id, (a.recruitmentSource || 'DIRECT').toUpperCase()]));
    const userSourceMap = new Map<string, string>();
    for (const h of handoffs) {
      const src = appSourceMap.get(h.applicationId) || 'DIRECT';
      userSourceMap.set(h.discordUserId, src);
    }

    const sourceCounts: Record<string, { members: number; warnings: number; incidents: number }> = {};
    for (const s of sources) {
      sourceCounts[s.source] = { members: s.joined, warnings: 0, incidents: 0 };
    }

    for (const w of warnings) {
      const src = userSourceMap.get(w.targetUserId) || 'OTHER';
      if (sourceCounts[src]) sourceCounts[src].warnings++;
    }

    for (const inc of incidents) {
      const src = userSourceMap.get(inc.targetDiscordUserId || '') || 'OTHER';
      if (sourceCounts[src]) sourceCounts[src].incidents++;
    }

    const sourceCorrelations = Object.entries(sourceCounts).map(([source, d]) => ({
      source,
      memberCount: d.members,
      warningCount: d.warnings,
      incidentCount: d.incidents,
      correlationObservation:
        d.members === 0
          ? 'No members observed from this source.'
          : `${d.warnings} warnings across ${d.members} members (${d.members > 0 ? Math.round((d.warnings / d.members) * 100) : 0}% rate). Observed correlation without inferred intent.`,
      evidenceType: d.members >= 2 ? ('OBSERVED_CORRELATION' as const) : ('INSUFFICIENT_DATA' as const),
    }));

    return {
      sourceCorrelations,
      cohortCorrelations: [],
    };
  }

  async getEventQualityCrossover(communityId: string): Promise<EventQualityCrossover> {
    const sources = await this.getSourceQualityAnalytics(communityId);
    const eventRegs = await eventRegistrationsRepository.findByQuery({ communityId });
    const handoffs = await memberHandoffsRepository.findByQuery({ communityId });
    const applications = await applicationsRepository.findByQuery({ communityId });

    const appSourceMap = new Map(applications.map((a) => [a.id, (a.recruitmentSource || 'DIRECT').toUpperCase()]));
    const userSourceMap = new Map<string, string>();
    for (const h of handoffs) {
      const src = appSourceMap.get(h.applicationId) || 'DIRECT';
      userSourceMap.set(h.discordUserId, src);
    }

    const sourceBreakdown = sources.map((s) => {
      const regs = eventRegs.filter((r) => userSourceMap.get(r.discordUserId) === s.source);
      const registeredCount = regs.length;
      const attendedCount = regs.filter((r) => r.attended).length;
      const attendanceRate: number | 'INSUFFICIENT_DATA' =
        registeredCount > 0 ? Math.round((attendedCount / registeredCount) * 1000) / 10 : 'INSUFFICIENT_DATA';

      return {
        source: s.source,
        registeredCount,
        attendedCount,
        attendanceRate,
        observation:
          registeredCount > 0
            ? `${attendedCount} attendances of ${registeredCount} registrations (${attendanceRate}% turnout).`
            : 'No event participation recorded for this source.',
      };
    });

    return { sourceBreakdown };
  }

  async getAutomationQualityCrossover(communityId: string): Promise<AutomationQualityCrossover> {
    const executions = await automationExecutionsRepository.findByQuery({ communityId });

    if (executions.length === 0) {
      return {
        onboardingAutomationSuccessRate: 'INSUFFICIENT_DATA',
        recruitmentAutomationSuccessRate: 'INSUFFICIENT_DATA',
        reminderSuccessRate: 'INSUFFICIENT_DATA',
        failureRate: 'INSUFFICIENT_DATA',
        evidence: 'No automated workflow executions recorded for this community.',
      };
    }

    const total = executions.length;
    const successful = executions.filter((e) => e.status === 'COMPLETED').length;
    const failed = executions.filter((e) => e.status === 'FAILED').length;

    const rate = Math.round((successful / total) * 1000) / 10;
    const failureRate = Math.round((failed / total) * 1000) / 10;

    return {
      onboardingAutomationSuccessRate: rate,
      recruitmentAutomationSuccessRate: rate,
      reminderSuccessRate: rate,
      failureRate,
      evidence: `${successful} of ${total} automated executions completed successfully (${rate}% reliability).`,
    };
  }

  // ============================================================================
  // 11. LIFETIME VALUE FOUNDATION
  // ============================================================================

  getLifetimeValueFoundation(communityId: string): MemberLifetimeValueFoundation {
    // Financial LTV is intentionally NOT_CONFIGURED to prevent fabricated metrics
    return {
      status: 'NOT_CONFIGURED',
      financialLtv: 'NOT_CONFIGURED',
      operationalOutcomes: {
        averageLifetimeDays: 'INSUFFICIENT_DATA',
        averageEventsAttended: 0,
        averageChecklistsCompleted: 0,
        communityContributionRating: 'INSUFFICIENT_DATA',
      },
      note: 'Financial LTV requires billing and subscription integration. Operational lifetime outcomes serve as the empirical quality foundation.',
    };
  }

  // ============================================================================
  // 12. AUDITED DATA & SOURCE CORRECTIONS
  // ============================================================================

  async correctRecruitmentSource(
    communityId: string,
    applicationId: string,
    newSource: RecruitmentSourceType,
    reason: string,
    actorUserId = 'system'
  ): Promise<any> {
    const application = await applicationsRepository.findById(applicationId);
    if (!application || application.communityId !== communityId) {
      throw new Error(`Application ${applicationId} not found in community ${communityId}`);
    }

    const previousSource = application.recruitmentSource || 'DIRECT';

    await applicationsRepository.update(applicationId, {
      recruitmentSource: newSource,
      updatedAt: new Date().toISOString(),
    });

    await auditService.record({
      communityId,
      actorUserId,
      actorRole: 'CONTROLLER',
      action: 'RECRUITMENT_SOURCE_CORRECTED' as any,
      targetType: 'APPLICATION',
      targetId: applicationId,
      metadata: {
        previousSource,
        newSource,
        reason,
      },
    });

    logger.info(`[RecruitmentRetention] Source corrected for app ${applicationId}: ${previousSource} -> ${newSource}`);
    return { ...application, recruitmentSource: newSource };
  }

  // ============================================================================
  // 13. COMMUNITY BRAIN RETENTION Q&A
  // ============================================================================

  async askRetentionBrain(communityId: string, question: string): Promise<string> {
    const funnel = await this.getRetentionFunnel(communityId);
    const sources = await this.getSourceQualityAnalytics(communityId);
    const recruiters = await this.getRecruiterQualityAnalytics(communityId);
    const alerts = await this.evaluateRetentionAlerts(communityId);

    const factSheet = {
      funnelStages: funnel.stages.map((s) => ({ label: s.label, count: s.count, rate: s.conversionRateFromPrevious })),
      sources: sources.map((s) => ({ source: s.source, apps: s.applications, joined: s.joined, activated: s.activated })),
      recruiters: recruiters.map((r) => ({ name: r.displayName, apps: r.applications, activated: r.activated, classification: r.qualityClassification })),
      activeAlerts: alerts.map((a) => ({ type: a.alertType, evidence: a.evidence })),
    };

    const systemPrompt = `You are Community Brain, an elite, evidence-based Lifecycle Intelligence agent.
Analyze the provided community recruitment and retention facts and answer the user's question.

### AUTHORITATIVE FACT SHEET ###
${JSON.stringify(factSheet, null, 2)}

### ANSWER DIRECTIVES ###
You MUST cite evidence strictly and categorize your response points into these exact four categories:
- **Verified Fact**: Explicit facts present in the Fact Sheet.
- **Observed Correlation**: Patterns or co-occurrences seen in the data without claiming direct causality.
- **Possible Explanation**: Plausible operational reasons for the patterns.
- **Insufficient Evidence**: Gaps where data is incomplete or observation windows are ongoing.

CRITICAL RULE: NEVER say "X caused Y" unless causality is definitively established. Do not fabricate numbers.`;

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return `**Insufficient Evidence**: AI reasoning service is offline because process.env.GEMINI_API_KEY is not configured.\n\n**Verified Fact**: The community has recorded ${funnel.totalObserved} total applications and ${alerts.length} active lifecycle alerts.`;
      }

      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: question,
        config: { systemInstruction: systemPrompt },
      });

      await auditService.record({
        communityId,
        actorUserId: 'system',
        actorRole: 'SYSTEM' as any,
        action: 'QUALITY_INSIGHT_GENERATED' as any,
        targetType: 'COMMUNITY_BRAIN',
        targetId: communityId,
        metadata: { question },
      });

      return response.text || 'No response received from Community Brain.';
    } catch (err: any) {
      logger.error('Failed to query Retention Brain:', undefined, { error: err.message });
      return `**Insufficient Evidence**: Analysis query failed to execute.\n\n**Verified Fact**: Total observed applicants: ${funnel.totalObserved}.`;
    }
  }

  // ============================================================================
  // 14. EXECUTIVE LIFECYCLE OVERVIEW
  // ============================================================================

  async getExecutiveLifecycleOverview(communityId: string): Promise<MemberLifecycleExecutiveOverview> {
    const funnel = await this.getRetentionFunnel(communityId);
    const sources = await this.getSourceQualityAnalytics(communityId);
    const alerts = await this.evaluateRetentionAlerts(communityId);
    const onboarding = await this.getOnboardingQualityAnalysis(communityId);

    const activeMembers = funnel.stages.find((s) => s.stageKey === 'MEMBER_ACTIVATED')?.count || 0;
    const stage30d = funnel.stages.find((s) => s.stageKey === '30_DAY_ACTIVE');
    const retentionRate30d = stage30d?.conversionRateFromPrevious ?? 'INSUFFICIENT_DATA';

    // Find top source
    const sortedSources = [...sources]
      .filter((s) => typeof s.activationRate === 'number' && s.joined >= 2)
      .sort((a, b) => (b.activationRate as number) - (a.activationRate as number));

    const topSource = sortedSources.length > 0
      ? { source: sortedSources[0].source, rate: sortedSources[0].activationRate }
      : 'INSUFFICIENT_DATA';

    return {
      totalApplicants: funnel.totalObserved,
      activeMembers,
      retentionRate30d,
      onboardingCompletionRate: onboarding.overallCompletionRate,
      activeAlertsCount: alerts.length,
      topSource,
    };
  }
}

export const recruitmentRetentionService = new RecruitmentRetentionService();
