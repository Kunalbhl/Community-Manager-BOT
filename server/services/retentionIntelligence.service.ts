import { recruitmentRetentionService } from './recruitmentRetention.service.js';
import {
  recruitmentCohortsRepository,
  memberHandoffsRepository,
  earlyEngagementEventsRepository,
  eventRegistrationsRepository,
  memberOnboardingChecklistsRepository,
  applicationsRepository,
} from '../repositories/index.js';
import {
  CohortMatrixRow,
  CohortMatrixCell,
  DataTruthClassification,
} from '../../shared/types/insights.js';
import {
  RetentionAlert,
  OnboardingQualityAnalysis,
  ModerationQualityCrossover,
  EventQualityCrossover,
  AutomationQualityCrossover,
  RecruitmentCohort,
} from '../../shared/types/models.js';
import { auditService } from './audit.service.js';
import { logger } from '../logging/logger.js';

export class RetentionIntelligenceService {
  /**
   * Evaluates retention rate and returns a cell strictly respecting the elapsed observation window.
   */
  private static evaluateWindowCell(
    eligibleCount: number,
    activeCount: number,
    windowElapsed: boolean,
    windowDays: number
  ): CohortMatrixCell {
    if (!windowElapsed || eligibleCount === 0) {
      return {
        active: activeCount,
        eligible: eligibleCount,
        rate: null,
        status: 'INSUFFICIENT_DATA',
        note: !windowElapsed
          ? `Observation window (< ${windowDays}d) incomplete`
          : 'Zero eligible members in cohort',
      };
    }

    const rate = Math.round((activeCount / eligibleCount) * 1000) / 10;
    return {
      active: activeCount,
      eligible: eligibleCount,
      rate: Math.min(100, Math.max(0, rate)),
      status: 'AVAILABLE',
      note: `${activeCount} active of ${eligibleCount} eligible`,
    };
  }

  /**
   * Generates the canonical Cohort Retention Matrix across Day 1, Day 7, Day 30, Day 90
   * strictly enforcing the elapsed observation window.
   */
  static async getCohortMatrix(
    communityId: string,
    actorUserId = 'system'
  ): Promise<{ rows: CohortMatrixRow[]; truthClassification: DataTruthClassification; activityDefinition: string }> {
    const handoffs = await memberHandoffsRepository.findByQuery({ communityId });
    const earlyEvents = await earlyEngagementEventsRepository.findByQuery({ communityId });
    const eventRegs = await eventRegistrationsRepository.findByQuery({ communityId });
    const checklists = await memberOnboardingChecklistsRepository.findByQuery({ communityId });
    const applications = await applicationsRepository.findByQuery({ communityId });
    const customCohorts = await recruitmentCohortsRepository.findByQuery({ communityId });

    // Group active interactions by user id and timestamp
    const activeEventsByUser = new Map<string, number[]>();
    const registerInteraction = (userId: string, dateStr: string) => {
      const ts = new Date(dateStr).getTime();
      if (!isNaN(ts)) {
        const list = activeEventsByUser.get(userId) || [];
        list.push(ts);
        activeEventsByUser.set(userId, list);
      }
    };

    for (const e of earlyEvents) {
      registerInteraction(e.discordUserId, e.timestamp || (e as any).createdAt);
    }
    for (const r of eventRegs) {
      registerInteraction(r.discordUserId, r.registeredAt);
    }
    for (const c of checklists) {
      if (c.updatedAt) registerInteraction(c.discordUserId, c.updatedAt);
    }

    const now = Date.now();
    const rows: CohortMatrixRow[] = [];

    // Helper to evaluate a set of members
    const computeRowForMembers = (
      cohortKey: string,
      cohortLabel: string,
      cohortType: CohortMatrixRow['cohortType'],
      cohortMembers: typeof handoffs,
      earliestJoinTs: number
    ): CohortMatrixRow => {
      const totalMembers = cohortMembers.length;
      if (totalMembers === 0) {
        return {
          cohortKey,
          cohortLabel,
          cohortType,
          cohortStartDate: new Date(earliestJoinTs).toISOString(),
          totalMembers: 0,
          day1: { active: 0, eligible: 0, rate: null, status: 'INSUFFICIENT_DATA', note: 'No members' },
          day7: { active: 0, eligible: 0, rate: null, status: 'INSUFFICIENT_DATA', note: 'No members' },
          day30: { active: 0, eligible: 0, rate: null, status: 'INSUFFICIENT_DATA', note: 'No members' },
          day90: { active: 0, eligible: 0, rate: null, status: 'INSUFFICIENT_DATA', note: 'No members' },
        };
      }

      let d1Eligible = 0, d1Active = 0;
      let d7Eligible = 0, d7Active = 0;
      let d30Eligible = 0, d30Active = 0;
      let d90Eligible = 0, d90Active = 0;

      for (const m of cohortMembers) {
        const joinTs = new Date(m.joinedAt || m.createdAt).getTime();
        const elapsedDays = (now - joinTs) / (1000 * 60 * 60 * 24);
        const interactions = activeEventsByUser.get(m.discordUserId) || [];

        // Day 1
        if (elapsedDays >= 1) {
          d1Eligible++;
          const hasD1 = interactions.some((ts) => ts >= joinTs && ts <= joinTs + 86400000 * 1);
          if (hasD1 || m.activationStatus === 'ACTIVATED') d1Active++;
        }

        // Day 7
        if (elapsedDays >= 7) {
          d7Eligible++;
          const hasD7 = interactions.some((ts) => ts >= joinTs && ts <= joinTs + 86400000 * 7);
          if (hasD7) d7Active++;
        }

        // Day 30
        if (elapsedDays >= 30) {
          d30Eligible++;
          const hasD30 = interactions.some((ts) => ts >= joinTs && ts <= joinTs + 86400000 * 30);
          if (hasD30) d30Active++;
        }

        // Day 90
        if (elapsedDays >= 90) {
          d90Eligible++;
          const hasD90 = interactions.some((ts) => ts >= joinTs && ts <= joinTs + 86400000 * 90);
          if (hasD90) d90Active++;
        }
      }

      const elapsedSinceEarliest = (now - earliestJoinTs) / (1000 * 60 * 60 * 24);

      return {
        cohortKey,
        cohortLabel,
        cohortType,
        cohortStartDate: new Date(earliestJoinTs).toISOString(),
        totalMembers,
        day1: this.evaluateWindowCell(d1Eligible, d1Active, elapsedSinceEarliest >= 1, 1),
        day7: this.evaluateWindowCell(d7Eligible, d7Active, elapsedSinceEarliest >= 7, 7),
        day30: this.evaluateWindowCell(d30Eligible, d30Active, elapsedSinceEarliest >= 30, 30),
        day90: this.evaluateWindowCell(d90Eligible, d90Active, elapsedSinceEarliest >= 90, 90),
      };
    };

    // 1. Weekly Join Cohorts (Past 8 weeks)
    const weekBuckets = new Map<string, typeof handoffs>();
    for (const h of handoffs) {
      const joinDate = new Date(h.joinedAt || h.createdAt);
      // Start of week (Sunday)
      const day = joinDate.getDay();
      const diff = joinDate.getDate() - day;
      const weekStart = new Date(joinDate.setDate(diff));
      const weekKey = weekStart.toISOString().split('T')[0];

      const list = weekBuckets.get(weekKey) || [];
      list.push(h);
      weekBuckets.set(weekKey, list);
    }

    const sortedWeeks = Array.from(weekBuckets.keys()).sort().reverse().slice(0, 6);
    for (const wKey of sortedWeeks) {
      const members = weekBuckets.get(wKey) || [];
      const joinTs = new Date(wKey).getTime();
      rows.push(computeRowForMembers(`week_${wKey}`, `Week of ${wKey}`, 'JOIN_DATE', members, joinTs));
    }

    // 2. Custom Configured Cohorts
    for (const c of customCohorts) {
      const matchingHandoffs = handoffs.filter((h) => {
        if (c.filterCriteria.campaignId && h.applicationId) {
          const app = applications.find((a) => a.id === h.applicationId);
          return app?.campaignId === c.filterCriteria.campaignId;
        }
        if (c.filterCriteria.recruiterDiscordUserId) {
          return (h as any).recruiterDiscordUserId === c.filterCriteria.recruiterDiscordUserId || h.recruiterId === c.filterCriteria.recruiterDiscordUserId;
        }
        return false;
      });

      const earliest = matchingHandoffs.length > 0
        ? Math.min(...matchingHandoffs.map((m) => new Date(m.joinedAt || m.createdAt).getTime()))
        : new Date(c.createdAt).getTime();

      rows.push(computeRowForMembers(`cohort_${c.id}`, c.name, 'CAMPAIGN', matchingHandoffs, earliest));
    }

    // Fallback baseline row if no handoffs yet
    if (rows.length === 0) {
      rows.push({
        cohortKey: 'all_members',
        cohortLabel: 'All Synchronized Members',
        cohortType: 'JOIN_DATE',
        cohortStartDate: new Date().toISOString(),
        totalMembers: handoffs.length,
        day1: { active: 0, eligible: 0, rate: null, status: 'INSUFFICIENT_DATA', note: 'No historical join records' },
        day7: { active: 0, eligible: 0, rate: null, status: 'INSUFFICIENT_DATA', note: 'No historical join records' },
        day30: { active: 0, eligible: 0, rate: null, status: 'INSUFFICIENT_DATA', note: 'No historical join records' },
        day90: { active: 0, eligible: 0, rate: null, status: 'INSUFFICIENT_DATA', note: 'No historical join records' },
      });
    }

    await auditService.record({
      communityId,
      actorUserId,
      actorRole: 'MEMBER' as any,
      action: 'RETENTION_ANALYTICS_VIEWED' as any,
      targetType: 'RETENTION_COHORT_MATRIX',
      targetId: communityId,
      metadata: { rowCount: rows.length },
    });

    return {
      rows,
      truthClassification: 'OBSERVED_CORRELATION',
      activityDefinition:
        'ACTIVE_MEMBER = Member with at least one verified engagement event, event attendance/registration, or onboarding step completed during the elapsed observation window.',
    };
  }

  /**
   * Retrieves active retention alerts
   */
  static async getRetentionAlerts(communityId: string, authContext?: any): Promise<RetentionAlert[]> {
    return recruitmentRetentionService.evaluateRetentionAlerts(communityId);
  }

  /**
   * Retrieves onboarding funnel quality analysis
   */
  static async getOnboardingQuality(communityId: string): Promise<OnboardingQualityAnalysis> {
    return recruitmentRetentionService.getOnboardingQualityAnalysis(communityId);
  }

  /**
   * Retrieves cross-system retention correlations
   */
  static async getCrossovers(communityId: string): Promise<{
    moderation: ModerationQualityCrossover;
    events: EventQualityCrossover;
    automation: AutomationQualityCrossover;
  }> {
    const [moderation, events, automation] = await Promise.all([
      recruitmentRetentionService.getModerationQualityCrossover(communityId),
      recruitmentRetentionService.getEventQualityCrossover(communityId),
      recruitmentRetentionService.getAutomationQualityCrossover(communityId),
    ]);

    return { moderation, events, automation };
  }

  static async getCrossSystemCrossovers(communityId: string, authContext?: any) {
    return this.getCrossovers(communityId);
  }

  /**
   * Alias for getCohortMatrix with optional authContext
   */
  static async getCohortRetentionMatrix(
    communityId: string,
    authContext?: any
  ) {
    return this.getCohortMatrix(communityId, authContext?.userId || 'system');
  }

  /**
   * Lists cohorts
   */
  static async listCohorts(communityId: string): Promise<RecruitmentCohort[]> {
    return recruitmentRetentionService.listCohorts(communityId);
  }

  /**
   * Creates a new cohort
   */
  static async createCohort(
    communityId: string,
    data: { name: string; description?: string; cohortType: RecruitmentCohort['cohortType']; filterCriteria: any },
    actorUserId = 'system'
  ): Promise<RecruitmentCohort> {
    return recruitmentRetentionService.createCohort(communityId, data, actorUserId);
  }
}

export const retentionIntelligenceService = RetentionIntelligenceService;
