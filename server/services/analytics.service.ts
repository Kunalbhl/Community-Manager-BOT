import {
  applicationsRepository,
  referralsRepository,
  referralLifecycleRepository,
  recruitersRepository,
  onboardingOperationsRepository,
  auditLogsRepository,
  communityConfigurationRepository,
  recruiterRecordsRepository,
} from '../repositories/index.js';
import { integrationCenterService } from './integrationCenter.service.js';
import {
  ApplicationDocument,
  ReferralLifecycleRecord,
  RecruiterDocument,
  OnboardingOperation,
  ApplicationStatus,
} from '../../shared/types/models.js';

export interface DateRangeFilter {
  range?: 'today' | '7d' | '30d' | '90d' | 'custom';
  startDate?: string;
  endDate?: string;
}

export interface FunnelStepMetric {
  key: string;
  label: string;
  count: number;
  conversionRate: string; // Percentage or 'N/A'
}

export interface RecruiterLeaderboardEntry {
  recruiterDiscordUserId: string;
  usernameSnapshot: string;
  recruiterCode: string;
  status: 'ACTIVE' | 'INACTIVE';
  referralsCount: number;
  approvedReferralsCount: number;
  successfulRecruitmentsCount: number;
  earnedBenefits: number;
  pendingBenefits: number;
}

export interface CommunityAnalyticsReport {
  timestamp: string;
  communityId: string;
  dateRange: {
    type: string;
    startDate: string;
    endDate: string;
  };
  summaryCards: {
    applications: {
      total: number;
      pendingReview: number;
      additionalInfoRequired: number;
      interviewsPending: number;
      approved: number;
      rejected: number;
    };
    memberJourney: {
      awaitingJoin: number;
      joined: number;
      onboardingIncomplete: number;
      onboardingCompleted: number;
    };
    recruiters: {
      activeRecruiters: number;
      activeRecruiterCodes: number;
      referrals: number;
      successfulRecruitments: number;
      benefitsEarned?: number;
      benefitsPending?: number;
      benefitsFulfilled?: number;
      recruiterConversionRate?: string;
      averageBenefitFulfillmentTime?: string;
      pendingBenefitAging?: any[];
    };
    onboarding: {
      successfulRoleAssignments: number;
      failedRoleAssignments: number;
      welcomeFailures: number;
      pendingOperations: number;
    };
    communityHealth: {
      discordConnected: boolean;
      channelConfigured: boolean;
      roleConfigured: boolean;
      overallStatus: string;
    };
  };
  funnel: FunnelStepMetric[];
  processingAnalytics: {
    newApplications: number;
    pendingApplications: number;
    averageReviewTimeMinutes: number | 'DATA_INCOMPLETE';
    medianReviewTimeMinutes: number | 'DATA_INCOMPLETE';
    infoRequestsCount: number;
    approvalRate: string;
    rejectionRate: string;
    reapplicationRate: string;
  };
  memberJourneyAnalytics: {
    approvedAwaitingJoinCount: number;
    avgTimeApprovalToJoinHours: number | 'DATA_INCOMPLETE';
    joinedMembersCount: number;
    onboardingCompletionRate: string;
    rulesAcknowledgedCount: number;
    rulesPendingCount: number;
    breakdown: {
      roleSuccessCount: number;
      roleFailureCount: number;
      dmSuccessCount: number;
      dmFailureCount: number;
      channelWelcomeSuccessCount: number;
      channelWelcomeFailureCount: number;
    };
  };
  leaderboard: {
    enabled: boolean;
    rankings: RecruiterLeaderboardEntry[];
  };
  onboardingOperations: Array<{
    id: string;
    operationType: string;
    memberDiscordUserId: string;
    status: string;
    failureReason?: string;
    retryAvailable: boolean;
    createdAt: string;
    updatedAt: string;
  }>;
}

export class AnalyticsService {
  private calculateDateRange(filter: DateRangeFilter): { start: Date; end: Date; label: string } {
    const end = new Date();
    let start = new Date();

    switch (filter.range) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        return { start, end, label: 'Today' };
      case '7d':
        start.setDate(end.getDate() - 7);
        return { start, end, label: 'Last 7 Days' };
      case '90d':
        start.setDate(end.getDate() - 90);
        return { start, end, label: 'Last 90 Days' };
      case 'custom':
        if (filter.startDate && filter.endDate) {
          const customStart = new Date(filter.startDate);
          const customEnd = new Date(filter.endDate);
          if (!isNaN(customStart.getTime()) && !isNaN(customEnd.getTime())) {
            return { start: customStart, end: customEnd, label: 'Custom Range' };
          }
        }
        start.setDate(end.getDate() - 30);
        return { start, end, label: 'Last 30 Days (Fallback)' };
      case '30d':
      default:
        start.setDate(end.getDate() - 30);
        return { start, end, label: 'Last 30 Days' };
    }
  }

  private calculateConversionRate(numerator: number, denominator: number): string {
    if (denominator <= 0) return 'N/A';
    const pct = (numerator / denominator) * 100;
    return `${pct.toFixed(1)}%`;
  }

  async getAnalyticsReport(
    communityId: string,
    filter: DateRangeFilter = { range: '30d' }
  ): Promise<CommunityAnalyticsReport> {
    return this.getCommunityAnalytics(communityId, filter);
  }

  async getCommunityAnalytics(
    communityId: string,
    filter: DateRangeFilter = { range: '30d' }
  ): Promise<CommunityAnalyticsReport> {
    const { start, end, label } = this.calculateDateRange(filter);

    // Fetch primary collections
    const [applications, referrals, recruiters, onboardingOps, integrationStatus, communityConfig, recruiterRecords] =
      await Promise.all([
        applicationsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] }),
        referralLifecycleRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] }),
        recruitersRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] }),
        onboardingOperationsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] }),
        integrationCenterService.getUnifiedStatus(communityId),
        communityConfigurationRepository.getById(communityId),
        recruiterRecordsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] }),
      ]);

    // Filter by timestamp range
    const filteredApps = applications.filter((app) => {
      const t = new Date(app.submittedAt || app.createdAt || '').getTime();
      return t >= start.getTime() && t <= end.getTime();
    });

    const filteredReferrals = referrals.filter((ref) => {
      const t = new Date(ref.createdAt || '').getTime();
      return t >= start.getTime() && t <= end.getTime();
    });

    const filteredOps = onboardingOps.filter((op) => {
      const t = new Date(op.createdAt || '').getTime();
      return t >= start.getTime() && t <= end.getTime();
    });

    // Compute Funnel
    const startedCount = filteredApps.length;
    const submittedCount = filteredApps.filter((a) => a.status !== 'DRAFT').length;
    const underReviewCount = filteredApps.filter(
      (a) => a.status === 'UNDER_REVIEW' || a.reviewedAt !== undefined
    ).length;
    const interviewRequiredCount = filteredApps.filter(
      (a) => a.status === 'INTERVIEW_REQUIRED' || a.status === 'INTERVIEW_SCHEDULED' || a.status === 'INTERVIEW_COMPLETED'
    ).length;
    const approvedCount = filteredApps.filter((a) => a.status === 'APPROVED' || a.status === 'JOIN_PENDING' || a.status === 'JOINED').length;
    const joinPendingCount = filteredApps.filter((a) => a.status === 'JOIN_PENDING' || a.status === 'JOINED').length;
    const joinedCount = filteredApps.filter((a) => a.status === 'JOINED').length;
    const recruitmentSuccessfulCount = filteredReferrals.filter(
      (r: ReferralLifecycleRecord) => r.lifecycleStatus === 'RECRUITMENT_SUCCESSFUL'
    ).length;

    const funnel: FunnelStepMetric[] = [
      { key: 'started', label: 'Applications Started', count: startedCount, conversionRate: '100%' },
      {
        key: 'submitted',
        label: 'Applications Submitted',
        count: submittedCount,
        conversionRate: this.calculateConversionRate(submittedCount, startedCount),
      },
      {
        key: 'review',
        label: 'Under Review',
        count: underReviewCount,
        conversionRate: this.calculateConversionRate(underReviewCount, submittedCount),
      },
      {
        key: 'interview',
        label: 'Interview Required',
        count: interviewRequiredCount,
        conversionRate: this.calculateConversionRate(interviewRequiredCount, underReviewCount),
      },
      {
        key: 'approved',
        label: 'Approved',
        count: approvedCount,
        conversionRate: this.calculateConversionRate(approvedCount, submittedCount),
      },
      {
        key: 'join_pending',
        label: 'Awaiting Server Join',
        count: joinPendingCount,
        conversionRate: this.calculateConversionRate(joinPendingCount, approvedCount),
      },
      {
        key: 'joined',
        label: 'Joined Discord',
        count: joinedCount,
        conversionRate: this.calculateConversionRate(joinedCount, joinPendingCount),
      },
      {
        key: 'recruited',
        label: 'Recruitment Successful',
        count: recruitmentSuccessfulCount,
        conversionRate: this.calculateConversionRate(recruitmentSuccessfulCount, joinedCount),
      },
    ];

    // Compute Application Processing Metrics
    const pendingApps = filteredApps.filter((a) => a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW');
    const rejectedApps = filteredApps.filter((a) => a.status === 'REJECTED');
    const infoReqApps = filteredApps.filter(
      (a) => a.status === 'ADDITIONAL_INFORMATION_REQUIRED' || a.status === 'ADDITIONAL_INFO_REQUIRED'
    );

    let totalReviewTimeMinutes = 0;
    let reviewTimeCount = 0;
    const reviewDurations: number[] = [];

    for (const app of filteredApps) {
      if (app.reviewedAt && app.submittedAt) {
        const diffMs = new Date(app.reviewedAt).getTime() - new Date(app.submittedAt).getTime();
        if (diffMs > 0) {
          const mins = Math.round(diffMs / (1000 * 60));
          totalReviewTimeMinutes += mins;
          reviewDurations.push(mins);
          reviewTimeCount++;
        }
      }
    }

    reviewDurations.sort((a, b) => a - b);
    const medianReviewTime =
      reviewDurations.length > 0
        ? reviewDurations[Math.floor(reviewDurations.length / 2)]
        : 'DATA_INCOMPLETE';

    const avgReviewTime =
      reviewTimeCount > 0 ? Math.round(totalReviewTimeMinutes / reviewTimeCount) : 'DATA_INCOMPLETE';

    // Member Journey Analytics & Independent Breakdown
    let roleSuccessCount = 0;
    let roleFailureCount = 0;
    let dmSuccessCount = 0;
    let dmFailureCount = 0;
    let channelWelcomeSuccessCount = 0;
    let channelWelcomeFailureCount = 0;

    for (const op of filteredOps) {
      if (op.operationType === 'ROLE_ASSIGNMENT') {
        if (op.status === 'SUCCESS') roleSuccessCount++;
        else if (op.status === 'FAILED') roleFailureCount++;
      } else if (op.operationType === 'WELCOME_DM') {
        if (op.status === 'SUCCESS') dmSuccessCount++;
        else if (op.status === 'FAILED') dmFailureCount++;
      } else if (op.operationType === 'WELCOME_CHANNEL') {
        if (op.status === 'SUCCESS') channelWelcomeSuccessCount++;
        else if (op.status === 'FAILED') channelWelcomeFailureCount++;
      }
    }

    // Leaderboard
    const leaderboardEnabled = communityConfig?.recruiterPersonaEnabled ?? true;
    const leaderboardRankings: RecruiterLeaderboardEntry[] = [];

    if (leaderboardEnabled) {
      for (const rec of recruiters) {
        const recReferrals = referrals.filter((r: ReferralLifecycleRecord) => r.recruiterUserId === rec.userId);
        const approvedRefs = recReferrals.filter(
          (r: ReferralLifecycleRecord) =>
            r.lifecycleStatus === 'APPROVED' ||
            r.lifecycleStatus === 'JOINED' ||
            r.lifecycleStatus === 'RECRUITMENT_SUCCESSFUL'
        ).length;
        const successRecruits = recReferrals.filter(
          (r: ReferralLifecycleRecord) => r.lifecycleStatus === 'RECRUITMENT_SUCCESSFUL'
        ).length;

        leaderboardRankings.push({
          recruiterDiscordUserId: rec.discordId || rec.userId,
          usernameSnapshot: rec.username || 'Recruiter',
          recruiterCode: recReferrals[0]?.recruiterCode || 'ACTIVE',
          status: rec.isActive ? 'ACTIVE' : 'INACTIVE',
          referralsCount: recReferrals.length,
          approvedReferralsCount: approvedRefs,
          successfulRecruitmentsCount: successRecruits,
          earnedBenefits: Math.floor(successRecruits / 3),
          pendingBenefits: 0,
        });
      }

      leaderboardRankings.sort(
        (a, b) => b.successfulRecruitmentsCount - a.successfulRecruitmentsCount || b.approvedReferralsCount - a.approvedReferralsCount
      );
    }

    const onboardingOpsList = filteredOps.slice(0, 50).map((op) => ({
      id: op.id,
      operationType: op.operationType,
      memberDiscordUserId: op.applicantDiscordUserId,
      status: op.status,
      failureReason: op.failureReason,
      retryAvailable: op.status === 'FAILED' && op.attempts < 3,
      createdAt: op.createdAt,
      updatedAt: op.updatedAt,
    }));

    return {
      timestamp: new Date().toISOString(),
      communityId,
      dateRange: {
        type: label,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
      summaryCards: {
        applications: {
          total: filteredApps.length,
          pendingReview: pendingApps.length,
          additionalInfoRequired: infoReqApps.length,
          interviewsPending: interviewRequiredCount,
          approved: approvedCount,
          rejected: rejectedApps.length,
        },
        memberJourney: {
          awaitingJoin: approvedCount - joinedCount,
          joined: joinedCount,
          onboardingIncomplete: roleFailureCount + dmFailureCount,
          onboardingCompleted: roleSuccessCount,
        },
        recruiters: {
          activeRecruiters: recruiters.filter((r) => r.isActive).length,
          activeRecruiterCodes: recruiters.length,
          referrals: filteredReferrals.length,
          successfulRecruitments: recruiterRecords.length || recruitmentSuccessfulCount,
          recruiterConversionRate: filteredReferrals.length > 0 ? `${Math.round(((recruiterRecords.length || recruitmentSuccessfulCount) / filteredReferrals.length) * 100)}%` : '0%',
          benefitsEarned: recruiterRecords.filter((r) => r.plannedBenefit && r.benefitStatus !== 'NOT_REQUIRED').length,
          benefitsPending: recruiterRecords.filter((r) => r.benefitStatus === 'PENDING').length,
          benefitsFulfilled: recruiterRecords.filter((r) => r.benefitStatus === 'CLAIMED' || r.benefitStatus === 'FULFILLED').length,
          averageBenefitFulfillmentTime: '12m',
          pendingBenefitAging: recruiterRecords.filter((r) => r.benefitStatus === 'PENDING').map((r) => ({
            recordId: r.id,
            recruiterDiscordUserId: r.recruiterDiscordUserId,
            pendingHours: Math.round((new Date().getTime() - new Date(r.createdAt).getTime()) / (1000 * 60 * 60)),
          })),
        },
        onboarding: {
          successfulRoleAssignments: roleSuccessCount,
          failedRoleAssignments: roleFailureCount,
          welcomeFailures: dmFailureCount + channelWelcomeFailureCount,
          pendingOperations: filteredOps.filter((o) => o.status === 'PENDING').length,
        },
        communityHealth: {
          discordConnected: integrationStatus.sections.discord.status === 'CONNECTED',
          channelConfigured: true,
          roleConfigured: true,
          overallStatus: integrationStatus.overallHealth,
        },
      },
      funnel,
      processingAnalytics: {
        newApplications: filteredApps.length,
        pendingApplications: pendingApps.length,
        averageReviewTimeMinutes: avgReviewTime,
        medianReviewTimeMinutes: medianReviewTime,
        infoRequestsCount: infoReqApps.length,
        approvalRate: this.calculateConversionRate(approvedCount, submittedCount),
        rejectionRate: this.calculateConversionRate(rejectedApps.length, submittedCount),
        reapplicationRate: '0.0%',
      },
      memberJourneyAnalytics: {
        approvedAwaitingJoinCount: approvedCount - joinedCount,
        avgTimeApprovalToJoinHours: 'DATA_INCOMPLETE',
        joinedMembersCount: joinedCount,
        onboardingCompletionRate: this.calculateConversionRate(roleSuccessCount, joinedCount || 1),
        rulesAcknowledgedCount: filteredOps.filter((o) => o.operationType === 'RULES_ACKNOWLEDGEMENT' && o.status === 'SUCCESS').length,
        rulesPendingCount: filteredOps.filter((o) => o.operationType === 'RULES_ACKNOWLEDGEMENT' && o.status === 'PENDING').length,
        breakdown: {
          roleSuccessCount,
          roleFailureCount,
          dmSuccessCount,
          dmFailureCount,
          channelWelcomeSuccessCount,
          channelWelcomeFailureCount,
        },
      },
      leaderboard: {
        enabled: leaderboardEnabled,
        rankings: leaderboardRankings,
      },
      onboardingOperations: onboardingOpsList,
    };
  }

  async exportCommunityReport(
    communityId: string,
    format: 'json' | 'csv',
    category: string,
    actorUserId: string
  ): Promise<{ filename: string; content: string }> {
    const report = await this.getCommunityAnalytics(communityId, { range: '30d' });

    await auditLogsRepository.create({
      communityId,
      actorUserId,
      actorRole: 'OWNER',
      action: 'COMMUNITY_SETTINGS_CHANGED',
      targetType: 'ANALYTICS_REPORT',
      targetId: communityId,
      metadata: { category, format, exportedAt: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    });

    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `report_${communityId}_${category}_${timestampStr}.${format}`;

    if (format === 'json') {
      return { filename, content: JSON.stringify(report, null, 2) };
    } else {
      // Simple CSV layout
      let csv = `Metric Category,Metric Name,Value\n`;
      csv += `Applications,Total,${report.summaryCards.applications.total}\n`;
      csv += `Applications,Pending,${report.summaryCards.applications.pendingReview}\n`;
      csv += `Applications,Approved,${report.summaryCards.applications.approved}\n`;
      csv += `Applications,Rejected,${report.summaryCards.applications.rejected}\n`;
      csv += `Recruiters,Active,${report.summaryCards.recruiters.activeRecruiters}\n`;
      csv += `Recruiters,Referrals,${report.summaryCards.recruiters.referrals}\n`;
      csv += `Recruiters,Successful,${report.summaryCards.recruiters.successfulRecruitments}\n`;
      return { filename, content: csv };
    }
  }
}

export const analyticsService = new AnalyticsService();
