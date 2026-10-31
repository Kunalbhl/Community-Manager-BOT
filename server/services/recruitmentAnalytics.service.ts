import { recruitmentRetentionService } from './recruitmentRetention.service.js';
import {
  RecruitmentRetentionFunnel,
  RecruiterQualityMetrics,
  CampaignQualityMetrics,
  SourceQualityMetrics,
} from '../../shared/types/models.js';
import { auditService } from './audit.service.js';
import { logger } from '../logging/logger.js';

export interface FunnelStageEnriched {
  stageKey: string;
  label: string;
  count: number;
  conversionRateFromPrevious: number | 'INSUFFICIENT_DATA';
  conversionRateFromStart: number | 'INSUFFICIENT_DATA';
  dropOffCount: number;
  dropOffPercent: number | 'INSUFFICIENT_DATA';
  status: 'AVAILABLE' | 'INSUFFICIENT_DATA';
  truthClassification: 'VERIFIED_FACT' | 'OBSERVED_CORRELATION' | 'INSUFFICIENT_EVIDENCE';
  evidenceNote?: string;
}

export interface UnifiedRecruitmentAnalytics {
  funnel: {
    stages: FunnelStageEnriched[];
    totalObserved: number;
    period: string;
    cohortId?: string;
  };
  recruiters: RecruiterQualityMetrics[];
  campaigns: CampaignQualityMetrics[];
  sources: SourceQualityMetrics[];
  sourceAttributionSummary: {
    totalApplications: number;
    campaignAttributed: number;
    recruiterAttributed: number;
    referralAttributed: number;
    unattributed: number;
  };
}

export class RecruitmentAnalyticsService {
  /**
   * Retrieves the canonical 9-stage recruitment & retention funnel:
   * APPLICATION -> APPROVED -> JOINED -> MEMBER_ACTIVATED -> ONBOARDED ->
   * FIRST_ENGAGEMENT -> 7_DAY_ACTIVE -> 30_DAY_ACTIVE -> 90_DAY_ACTIVE
   */
  static async getRecruitmentFunnel(
    communityId: string,
    cohortId?: string,
    actorUserId = 'system'
  ): Promise<{ stages: FunnelStageEnriched[]; totalObserved: number; period: string; cohortId?: string }> {
    const rawFunnel: RecruitmentRetentionFunnel = await recruitmentRetentionService.getRetentionFunnel(
      communityId,
      cohortId
    );

    let previousCount = 0;
    const enrichedStages: FunnelStageEnriched[] = rawFunnel.stages.map((stage, idx) => {
      let dropOffCount = 0;
      let dropOffPercent: number | 'INSUFFICIENT_DATA' = 'INSUFFICIENT_DATA';

      if (idx === 0) {
        previousCount = stage.count;
      } else {
        dropOffCount = Math.max(0, previousCount - stage.count);
        if (previousCount > 0) {
          dropOffPercent = Math.round((dropOffCount / previousCount) * 1000) / 10;
        }
        previousCount = stage.count;
      }

      // Assign strict Data Truth classification
      const isPostJoinObservation = ['7_DAY_ACTIVE', '30_DAY_ACTIVE', '90_DAY_ACTIVE'].includes(stage.stageKey);
      const truthClassification = stage.status === 'INSUFFICIENT_DATA'
        ? 'INSUFFICIENT_EVIDENCE'
        : isPostJoinObservation
        ? 'OBSERVED_CORRELATION'
        : 'VERIFIED_FACT';

      return {
        ...stage,
        dropOffCount,
        dropOffPercent,
        truthClassification,
      };
    });

    await auditService.record({
      communityId,
      actorUserId,
      actorRole: 'MEMBER' as any,
      action: 'RECRUITMENT_ANALYTICS_VIEWED' as any,
      targetType: 'RECRUITMENT_FUNNEL',
      targetId: communityId,
      metadata: { totalObserved: rawFunnel.totalObserved, cohortId },
    });

    return {
      stages: enrichedStages,
      totalObserved: rawFunnel.totalObserved,
      period: rawFunnel.period,
      cohortId: rawFunnel.cohortId,
    };
  }

  /**
   * Retrieves recruiter performance records based strictly on verified data
   */
  static async getRecruiterPerformance(
    communityId: string,
    range: '7d' | '30d' | '90d' | 'all' = 'all'
  ): Promise<RecruiterQualityMetrics[]> {
    return recruitmentRetentionService.getRecruiterQualityAnalytics(communityId, range);
  }

  /**
   * Retrieves campaign performance metrics
   */
  static async getCampaignPerformance(communityId: string): Promise<CampaignQualityMetrics[]> {
    return recruitmentRetentionService.getCampaignQualityAnalytics(communityId);
  }

  /**
   * Retrieves source attribution quality metrics (explicitly tracking unattributed sources)
   */
  static async getSourcePerformance(communityId: string): Promise<SourceQualityMetrics[]> {
    return recruitmentRetentionService.getSourceQualityAnalytics(communityId);
  }

  /**
   * Retrieves unified recruitment analytics bundle
   */
  static async getUnifiedRecruitmentAnalytics(
    communityId: string,
    cohortId?: string,
    actorUserId = 'system'
  ): Promise<UnifiedRecruitmentAnalytics> {
    const [funnel, recruiters, campaigns, sources] = await Promise.all([
      this.getRecruitmentFunnel(communityId, cohortId, actorUserId),
      this.getRecruiterPerformance(communityId),
      this.getCampaignPerformance(communityId),
      this.getSourcePerformance(communityId),
    ]);

    // Compute attribution breakdown
    let campaignAttributed = 0;
    let recruiterAttributed = 0;
    let referralAttributed = 0;
    let unattributed = 0;

    for (const src of sources) {
      if (src.source === 'CAMPAIGN') campaignAttributed += src.applications;
      else if (src.source === 'RECRUITER') recruiterAttributed += src.applications;
      else if (src.source === 'REFERRAL') referralAttributed += src.applications;
      else unattributed += src.applications;
    }

    return {
      funnel,
      recruiters,
      campaigns,
      sources,
      sourceAttributionSummary: {
        totalApplications: funnel.totalObserved,
        campaignAttributed,
        recruiterAttributed,
        referralAttributed,
        unattributed,
      },
    };
  }

  static async get9StageFunnel(
    communityId: string,
    authContext?: any,
    cohortId?: string
  ) {
    return this.getRecruitmentFunnel(communityId, cohortId, authContext?.userId || 'system');
  }

  static async getRecruiterLeaderboard(
    communityId: string,
    range: '7d' | '30d' | '90d' | 'all' = 'all',
    authContext?: any
  ) {
    return this.getRecruiterPerformance(communityId, range);
  }

  static async getCampaignQuality(
    communityId: string,
    authContext?: any
  ) {
    return this.getCampaignPerformance(communityId);
  }

  static async getSourceAttribution(
    communityId: string,
    authContext?: any
  ) {
    return this.getSourcePerformance(communityId);
  }
}

export const recruitmentAnalyticsService = RecruitmentAnalyticsService;
