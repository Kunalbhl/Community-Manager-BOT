import {
  discordMembersRepository,
  announcementsRepository,
  campaignsRepository,
  pollsRepository,
  remindersRepository,
  applicationsRepository,
  interviewsRepository,
  recruiterRecordsRepository,
  recruitersRepository,
  warningsRepository,
  moderationWarningsRepository,
  blacklistEntriesRepository,
  moderationActionExecutionsRepository,
  moderationLogsRepository,
  safetyIncidentsRepository,
  eventsRepository,
  eventRegistrationsRepository,
  eventRemindersRepository,
  automationWorkflowsRepository,
  automationExecutionsRepository,
  communityConfigurationRepository,
  recruiterCodesRepository,
} from '../../repositories/index.js';
import { ResolvedDateRange, InsightsDateService } from './insightsDate.service.js';
import { InsightsMetricService } from './insightsMetric.service.js';
import { InsightsTrendService } from './insightsTrend.service.js';
import { InsightsFunnelService } from './insightsFunnel.service.js';
import {
  CommunityOverviewAnalytics,
  EngagementAnalytics,
  RecruitmentAnalytics,
  ModerationAnalytics,
  EventsAnalytics,
  AutomationAnalytics,
  DataCoverage,
  AnalyticsMetadata,
  MemberGrowthPoint,
  RecruiterAttributionStats,
  EngagementBreakdownItem,
  EventComparisonItem,
  AutomationWorkflowMetric,
} from '../../../shared/types/insights.js';

export class InsightsAggregationService {
  /**
   * Helper to build default metadata object
   */
  static buildMetadata(
    communityId: string,
    resolvedRange: ResolvedDateRange,
    coverage: DataCoverage
  ): AnalyticsMetadata {
    return {
      communityId,
      rangeType: resolvedRange.rangeType,
      rangeStart: resolvedRange.rangeStart,
      rangeEnd: resolvedRange.rangeEnd,
      previousRangeStart: resolvedRange.previousRangeStart,
      previousRangeEnd: resolvedRange.previousRangeEnd,
      timezone: resolvedRange.timezone,
      generatedAt: new Date().toISOString(),
      coverage,
    };
  }

  // =========================================================================
  // 1. COMMUNITY OVERVIEW & GROWTH AGGREGATION
  // =========================================================================
  static async aggregateCommunity(
    communityId: string,
    range: ResolvedDateRange
  ): Promise<CommunityOverviewAnalytics> {
    const allMembers = await discordMembersRepository.listForTenant(communityId);

    // Current range metrics
    const currentJoined = allMembers.filter((m) =>
      InsightsDateService.isDateInRange(m.joinedAt, range.rangeStart, range.rangeEnd)
    );
    const currentLeft = allMembers.filter(
      (m) =>
        (m.membershipStatus === 'LEFT' || m.membershipStatus === 'BANNED') &&
        InsightsDateService.isDateInRange(m.syncedAt, range.rangeStart, range.rangeEnd)
    );

    // Previous range metrics for comparison
    const previousJoined = allMembers.filter((m) =>
      InsightsDateService.isDateInRange(m.joinedAt, range.previousRangeStart, range.previousRangeEnd)
    );
    const previousLeft = allMembers.filter(
      (m) =>
        (m.membershipStatus === 'LEFT' || m.membershipStatus === 'BANNED') &&
        InsightsDateService.isDateInRange(m.syncedAt, range.previousRangeStart, range.previousRangeEnd)
    );

    const activeMembers = allMembers.filter((m) => m.membershipStatus === 'ACTIVE');
    const totalMembersCount = activeMembers.length;
    const newMembersCount = currentJoined.length;
    const membersLeftCount = currentLeft.length;
    const netGrowthCount = newMembersCount - membersLeftCount;

    const prevNewCount = previousJoined.length;
    const prevLeftCount = previousLeft.length;
    const prevNetCount = prevNewCount - prevLeftCount;

    // Discord-known vs Community Manager records
    const discordKnownCount = allMembers.filter(
      (m) => m.source === 'DISCORD_SYNC' && m.membershipStatus === 'ACTIVE'
    ).length;
    const totalRecordsCount = allMembers.length;

    // Active members estimation (from recent events/polls/apps participation)
    const recentEvents = await eventRegistrationsRepository.listForTenant(communityId);
    const recentPolls = await pollsRepository.listForTenant(communityId);
    const recentApps = await applicationsRepository.listForTenant(communityId);

    const activeUserIds = new Set<string>();
    recentEvents.forEach((r) => {
      if (InsightsDateService.isDateInRange(r.registeredAt, range.rangeStart, range.rangeEnd)) {
        activeUserIds.add(r.discordUserId);
      }
    });
    recentPolls.forEach((p) => {
      if (InsightsDateService.isDateInRange(p.createdAt, range.rangeStart, range.rangeEnd)) {
        (p.votedUserIds || []).forEach((u) => activeUserIds.add(u));
      }
    });
    recentApps.forEach((a) => {
      const applicantDiscordId = a.applicantDiscordUserId || a.applicantDiscordId || a.applicantUserId;
      if (InsightsDateService.isDateInRange(a.createdAt, range.rangeStart, range.rangeEnd) && applicantDiscordId) {
        activeUserIds.add(applicantDiscordId);
      }
    });

    const estimatedActive = activeUserIds.size;

    // Growth rate calculation
    const baseForRate = Math.max(1, totalMembersCount - netGrowthCount);
    const growthRatePercent = Math.round(((netGrowthCount / baseForRate) * 100) * 10) / 10;
    const prevBase = Math.max(1, totalMembersCount - netGrowthCount - prevNetCount);
    const prevGrowthRatePercent = Math.round(((prevNetCount / prevBase) * 100) * 10) / 10;

    // Retention calculations (7-day and 30-day cohorts)
    const nowMs = new Date().getTime();
    const ms7d = 7 * 24 * 60 * 60 * 1000;
    const ms30d = 30 * 24 * 60 * 60 * 1000;

    const cohort7d = allMembers.filter((m) => {
      if (!m.joinedAt) return false;
      const joinedMs = new Date(m.joinedAt).getTime();
      return !isNaN(joinedMs) && nowMs - joinedMs >= ms7d;
    });
    const retained7d = cohort7d.filter((m) => m.membershipStatus === 'ACTIVE').length;
    const retention7dRate = cohort7d.length > 0
      ? Math.round((retained7d / cohort7d.length) * 1000) / 10
      : null;

    const cohort30d = allMembers.filter((m) => {
      if (!m.joinedAt) return false;
      const joinedMs = new Date(m.joinedAt).getTime();
      return !isNaN(joinedMs) && nowMs - joinedMs >= ms30d;
    });
    const retained30d = cohort30d.filter((m) => m.membershipStatus === 'ACTIVE').length;
    const retention30dRate = cohort30d.length > 0
      ? Math.round((retained30d / cohort30d.length) * 1000) / 10
      : null;

    // Daily growth time-series
    const joinedByDate: Record<string, number> = {};
    const leftByDate: Record<string, number> = {};
    currentJoined.forEach((m) => {
      if (m.joinedAt) {
        const d = InsightsDateService.formatDateInTimezone(new Date(m.joinedAt), range.timezone);
        joinedByDate[d] = (joinedByDate[d] || 0) + 1;
      }
    });
    currentLeft.forEach((m) => {
      const d = InsightsDateService.formatDateInTimezone(new Date(m.syncedAt), range.timezone);
      leftByDate[d] = (leftByDate[d] || 0) + 1;
    });

    const startingTotal = Math.max(0, totalMembersCount - netGrowthCount);
    const growthTrend: MemberGrowthPoint[] = InsightsTrendService.buildGrowthTimeSeries(
      range.dailyBuckets,
      joinedByDate,
      leftByDate,
      startingTotal
    );

    const coverage: DataCoverage = {
      coverageStart: range.rangeStart,
      coverageEnd: range.rangeEnd,
      recordsIncluded: allMembers.length,
      recordsMissing: 0,
      source: 'discordMembersRepository',
      confidence: allMembers.length > 0 ? 'COMPLETE' : 'INSUFFICIENT_DATA',
    };

    return {
      metadata: this.buildMetadata(communityId, range, coverage),
      totalMembers: InsightsMetricService.buildMetric(totalMembersCount, totalMembersCount - netGrowthCount),
      newMembers: InsightsMetricService.buildMetric(newMembersCount, prevNewCount),
      membersLeft: InsightsMetricService.buildMetric(membersLeftCount, prevLeftCount),
      netGrowth: InsightsMetricService.buildMetric(netGrowthCount, prevNetCount),
      growthRate: InsightsMetricService.buildMetric(growthRatePercent, prevGrowthRatePercent),
      discordKnownMembers: discordKnownCount,
      communityManagerRecords: totalRecordsCount,
      estimatedActiveMembers: InsightsMetricService.buildMetric(
        estimatedActive,
        null,
        estimatedActive === 0 ? 'DISCORD_LIMITATION' : 'AVAILABLE',
        'Activity derived from observed bot interactions (events, polls, applications). Discord chat message observation requires Gateway intents.'
      ),
      retentionRate7Day: retention7dRate !== null
        ? InsightsMetricService.buildMetric(retention7dRate, null, 'AVAILABLE', `Calculated on cohort of ${cohort7d.length} members joined >= 7 days ago.`)
        : InsightsMetricService.buildMetric(null, null, 'INSUFFICIENT_DATA', 'Insufficient historical membership duration to evaluate 7-day cohort.'),
      retentionRate30Day: retention30dRate !== null
        ? InsightsMetricService.buildMetric(retention30dRate, null, 'AVAILABLE', `Calculated on cohort of ${cohort30d.length} members joined >= 30 days ago.`)
        : InsightsMetricService.buildMetric(null, null, 'INSUFFICIENT_DATA', 'Insufficient historical membership duration to evaluate 30-day cohort.'),
      growthTrend,
    };
  }

  // =========================================================================
  // 2. ENGAGEMENT ANALYTICS AGGREGATION
  // =========================================================================
  static async aggregateEngagement(
    communityId: string,
    range: ResolvedDateRange
  ): Promise<EngagementAnalytics> {
    const allAnnouncements = await announcementsRepository.listForTenant(communityId);
    const allCampaigns = await campaignsRepository.listForTenant(communityId);
    const allPolls = await pollsRepository.listForTenant(communityId);
    const allReminders = await remindersRepository.listForTenant(communityId);

    // Filter to date range
    const inRange = (d?: string) => InsightsDateService.isDateInRange(d, range.rangeStart, range.rangeEnd);
    const inPrevRange = (d?: string) => InsightsDateService.isDateInRange(d, range.previousRangeStart, range.previousRangeEnd);

    const currAnnouncements = allAnnouncements.filter((a) => inRange(a.createdAt));
    const prevAnnouncements = allAnnouncements.filter((a) => inPrevRange(a.createdAt));

    const currCampaigns = allCampaigns.filter((c) => inRange(c.createdAt));
    const prevCampaigns = allCampaigns.filter((c) => inPrevRange(c.createdAt));

    const currPolls = allPolls.filter((p) => inRange(p.createdAt));
    const prevPolls = allPolls.filter((p) => inPrevRange(p.createdAt));

    const currReminders = allReminders.filter((r) => inRange(r.createdAt));
    const prevReminders = allReminders.filter((r) => inPrevRange(r.createdAt));

    // Deliveries
    const announcementsSent = currAnnouncements.filter((a) => a.status === 'SENT').length;
    const announcementsFailed = currAnnouncements.filter((a) => a.status === 'FAILED').length;
    const announcementsScheduled = currAnnouncements.filter((a) => a.status === 'SCHEDULED').length;

    const campaignsCompleted = currCampaigns.filter((c) => c.status === 'COMPLETED' || c.status === 'ACTIVE').length;
    const campaignsFailed = currCampaigns.filter((c) => c.status === 'FAILED').length;

    const remindersSent = currReminders.filter((r) => r.status === 'SENT').length;
    const remindersFailed = currReminders.filter((r) => r.status === 'FAILED').length;

    const totalSuccessfulDeliveries = announcementsSent + campaignsCompleted + remindersSent;
    const totalFailedDeliveries = announcementsFailed + campaignsFailed + remindersFailed;

    const totalDeliveryAttempts = totalSuccessfulDeliveries + totalFailedDeliveries;
    const deliverySuccessRate = totalDeliveryAttempts > 0
      ? Math.round((totalSuccessfulDeliveries / totalDeliveryAttempts) * 1000) / 10
      : null;

    // Previous totals for delta
    const prevAnnouncementsSent = prevAnnouncements.filter((a) => a.status === 'SENT').length;
    const prevCampaignsCompleted = prevCampaigns.filter((c) => c.status === 'COMPLETED' || c.status === 'ACTIVE').length;
    const prevRemindersSent = prevReminders.filter((r) => r.status === 'SENT').length;
    const prevSuccessDeliveries = prevAnnouncementsSent + prevCampaignsCompleted + prevRemindersSent;

    // Poll participation (total votes cast)
    const currPollVotes = currPolls.reduce((acc, p) => acc + (p.votedUserIds ? p.votedUserIds.length : 0), 0);
    const prevPollVotes = prevPolls.reduce((acc, p) => acc + (p.votedUserIds ? p.votedUserIds.length : 0), 0);

    // Feature Breakdown
    const byFeature: EngagementBreakdownItem[] = [
      {
        key: 'ANNOUNCEMENTS',
        label: 'Announcements',
        sent: announcementsSent,
        failed: announcementsFailed,
        successRate: InsightsMetricService.calculateRate(announcementsSent, announcementsSent + announcementsFailed),
      },
      {
        key: 'CAMPAIGNS',
        label: 'Engagement Campaigns',
        sent: campaignsCompleted,
        failed: campaignsFailed,
        successRate: InsightsMetricService.calculateRate(campaignsCompleted, campaignsCompleted + campaignsFailed),
      },
      {
        key: 'POLLS',
        label: 'Community Polls',
        sent: currPolls.length,
        failed: 0,
        successRate: 100.0,
      },
      {
        key: 'REMINDERS',
        label: 'Automated Reminders',
        sent: remindersSent,
        failed: remindersFailed,
        successRate: InsightsMetricService.calculateRate(remindersSent, remindersSent + remindersFailed),
      },
    ];

    // Channel Breakdown
    const channelMap: Record<string, { sent: number; failed: number }> = {};
    currAnnouncements.forEach((a) => {
      const ch = a.channelId || 'unknown';
      if (!channelMap[ch]) channelMap[ch] = { sent: 0, failed: 0 };
      if (a.status === 'SENT') channelMap[ch].sent++;
      if (a.status === 'FAILED') channelMap[ch].failed++;
    });
    currPolls.forEach((p) => {
      const ch = p.channelId || 'unknown';
      if (!channelMap[ch]) channelMap[ch] = { sent: 0, failed: 0 };
      channelMap[ch].sent++;
    });

    const byChannel: EngagementBreakdownItem[] = Object.entries(channelMap).map(([chId, stats]) => ({
      key: chId,
      label: chId === 'unknown' ? 'Default Channel' : `Channel ${chId}`,
      sent: stats.sent,
      failed: stats.failed,
      successRate: InsightsMetricService.calculateRate(stats.sent, stats.sent + stats.failed),
    }));

    // Time-series trend
    const trendMap: Record<string, { delivered: number; failed: number; votes: number }> = {};
    range.dailyBuckets.forEach((d) => {
      trendMap[d] = { delivered: 0, failed: 0, votes: 0 };
    });

    currAnnouncements.forEach((a) => {
      const d = InsightsDateService.formatDateInTimezone(new Date(a.createdAt), range.timezone);
      if (trendMap[d]) {
        if (a.status === 'SENT') trendMap[d].delivered++;
        if (a.status === 'FAILED') trendMap[d].failed++;
      }
    });
    currReminders.forEach((r) => {
      const d = InsightsDateService.formatDateInTimezone(new Date(r.createdAt), range.timezone);
      if (trendMap[d]) {
        if (r.status === 'SENT') trendMap[d].delivered++;
        if (r.status === 'FAILED') trendMap[d].failed++;
      }
    });
    currPolls.forEach((p) => {
      const d = InsightsDateService.formatDateInTimezone(new Date(p.createdAt), range.timezone);
      if (trendMap[d]) {
        trendMap[d].votes += p.votedUserIds ? p.votedUserIds.length : 0;
      }
    });

    const trend = range.dailyBuckets.map((date) => ({
      date,
      delivered: trendMap[date]?.delivered || 0,
      failed: trendMap[date]?.failed || 0,
      votes: trendMap[date]?.votes || 0,
    }));

    const totalRecords = allAnnouncements.length + allCampaigns.length + allPolls.length + allReminders.length;
    const coverage: DataCoverage = {
      coverageStart: range.rangeStart,
      coverageEnd: range.rangeEnd,
      recordsIncluded: totalRecords,
      recordsMissing: 0,
      source: 'announcements, campaigns, polls, reminders repositories',
      confidence: totalRecords > 0 ? 'COMPLETE' : 'INSUFFICIENT_DATA',
    };

    return {
      metadata: this.buildMetadata(communityId, range, coverage),
      announcementsSent: InsightsMetricService.buildMetric(announcementsSent, prevAnnouncementsSent),
      successfulDeliveries: InsightsMetricService.buildMetric(totalSuccessfulDeliveries, prevSuccessDeliveries),
      failedDeliveries: InsightsMetricService.buildMetric(totalFailedDeliveries, null),
      scheduledMessages: InsightsMetricService.buildMetric(announcementsScheduled, null),
      campaignsCount: InsightsMetricService.buildMetric(currCampaigns.length, prevCampaigns.length),
      campaignExecutions: InsightsMetricService.buildMetric(campaignsCompleted, null),
      pollsCount: InsightsMetricService.buildMetric(currPolls.length, prevPolls.length),
      pollParticipation: InsightsMetricService.buildMetric(currPollVotes, prevPollVotes),
      remindersSent: InsightsMetricService.buildMetric(remindersSent, prevRemindersSent),
      deliverySuccessRate: deliverySuccessRate !== null
        ? InsightsMetricService.buildMetric(deliverySuccessRate, null, 'AVAILABLE')
        : InsightsMetricService.buildMetric(null, null, 'INSUFFICIENT_DATA', 'No deliveries executed in period.'),
      byFeature,
      byChannel,
      trend,
    };
  }

  // =========================================================================
  // 3. RECRUITMENT & RECRUITER ANALYTICS AGGREGATION
  // =========================================================================
  static async aggregateRecruitment(
    communityId: string,
    range: ResolvedDateRange
  ): Promise<RecruitmentAnalytics> {
    const allApps = await applicationsRepository.listForTenant(communityId);
    const allInterviews = await interviewsRepository.listForTenant(communityId);
    const allRecruiters = await recruitersRepository.listForTenant(communityId);
    const allCodes = await recruiterCodesRepository.listForTenant(communityId);
    const allRecords = await recruiterRecordsRepository.listForTenant(communityId);
    const allMembers = await discordMembersRepository.listForTenant(communityId);

    const inRange = (d?: string) => InsightsDateService.isDateInRange(d, range.rangeStart, range.rangeEnd);
    const inPrevRange = (d?: string) => InsightsDateService.isDateInRange(d, range.previousRangeStart, range.previousRangeEnd);

    const currApps = allApps.filter((a) => inRange(a.createdAt));
    const prevApps = allApps.filter((a) => inPrevRange(a.createdAt));

    const totalApplications = currApps.length;
    const submittedCount = currApps.filter((a) => a.status !== 'DRAFT').length;
    const underReviewCount = currApps.filter((a) => a.status === 'UNDER_REVIEW').length;
    const interviewReqCount = currApps.filter((a) => a.status === 'INTERVIEW_REQUIRED').length;
    const interviewsCompleted = allInterviews.filter(
      (i) => i.status === 'COMPLETED' && inRange(i.updatedAt || i.createdAt)
    ).length;
    const approvedCount = currApps.filter((a) => a.status === 'APPROVED' || a.status === 'JOINED').length;
    const joinedCount = currApps.filter((a) => a.status === 'JOINED').length;
    const successfulRecruitmentCount = allRecords.filter(
      (r) => inRange(r.createdAt)
    ).length;

    const prevTotalApps = prevApps.length;
    const prevApproved = prevApps.filter((a) => a.status === 'APPROVED' || a.status === 'JOINED').length;

    // Funnel stages: Submitted -> Under Review -> Interview Completed -> Approved -> Joined -> Successful
    const funnelStages = InsightsFunnelService.computeFunnel([
      { stage: 'SUBMITTED', label: 'Applications Submitted', count: submittedCount },
      { stage: 'UNDER_REVIEW', label: 'Under Review', count: Math.max(underReviewCount, approvedCount) },
      { stage: 'INTERVIEW', label: 'Interviews Completed', count: interviewsCompleted },
      { stage: 'APPROVED', label: 'Approved Candidates', count: approvedCount },
      { stage: 'JOINED', label: 'Joined Discord Guild', count: joinedCount },
      { stage: 'SUCCESSFUL', label: 'Recruitment Success', count: successfulRecruitmentCount },
    ]);

    // Recruiter leaderboard
    const recruiterStatsMap: Record<string, RecruiterAttributionStats> = {};

    allRecruiters.forEach((rec) => {
      const codeDoc = allCodes.find((c) => c.recruiterUserId === rec.userId);
      const codeStr = codeDoc?.code || `REC_${rec.id.slice(0, 6)}`;
      recruiterStatsMap[rec.id] = {
        recruiterId: rec.id,
        discordUserId: rec.discordId,
        username: rec.username || `Recruiter_${rec.id.slice(0, 5)}`,
        code: codeStr,
        applicationsAttributed: 0,
        approvedApplicants: 0,
        joinedApplicants: 0,
        successfulRecruitments: 0,
        conversionRate: null,
        attributionBreakdown: {
          manual: 0,
          historical: 0,
          discordConfirmed: 0,
        },
      };
    });

    // Attribute applications
    currApps.forEach((app) => {
      if (app.recruiterCode) {
        const found = Object.values(recruiterStatsMap).find((r) => r.code === app.recruiterCode);
        if (found) {
          found.applicationsAttributed++;
          if (app.status === 'APPROVED' || app.status === 'JOINED') {
            found.approvedApplicants++;
          }
          if (app.status === 'JOINED') {
            found.joinedApplicants++;
          }
        }
      }
    });

    // Attribute member records & distinguish attribution type
    allMembers.forEach((member) => {
      if (member.recruiterCode && inRange(member.joinedAt || member.syncedAt)) {
        const found = Object.values(recruiterStatsMap).find((r) => r.code === member.recruiterCode);
        if (found) {
          if (member.attributionType === 'MANUAL') {
            found.attributionBreakdown.manual++;
          } else if (member.attributionType === 'HISTORICAL') {
            found.attributionBreakdown.historical++;
          } else {
            found.attributionBreakdown.discordConfirmed++;
          }
          found.successfulRecruitments++;
        }
      }
    });

    // Calculate recruiter conversion rates
    const topRecruiters = Object.values(recruiterStatsMap)
      .map((rec) => {
        const rate = rec.applicationsAttributed > 0
          ? Math.round((rec.successfulRecruitments / rec.applicationsAttributed) * 1000) / 10
          : null;
        return {
          ...rec,
          conversionRate: rate,
        };
      })
      .sort((a, b) => b.successfulRecruitments - a.successfulRecruitments)
      .slice(0, 10);

    const coverage: DataCoverage = {
      coverageStart: range.rangeStart,
      coverageEnd: range.rangeEnd,
      recordsIncluded: allApps.length + allInterviews.length + allRecruiters.length,
      recordsMissing: 0,
      source: 'applications, interviews, recruiters, recruiterRecords repositories',
      confidence: allApps.length > 0 ? 'COMPLETE' : 'INSUFFICIENT_DATA',
    };

    return {
      metadata: this.buildMetadata(communityId, range, coverage),
      totalApplications: InsightsMetricService.buildMetric(totalApplications, prevTotalApps),
      submitted: InsightsMetricService.buildMetric(submittedCount, null),
      underReview: InsightsMetricService.buildMetric(underReviewCount, null),
      interviewRequired: InsightsMetricService.buildMetric(interviewReqCount, null),
      interviewsCompleted: InsightsMetricService.buildMetric(interviewsCompleted, null),
      approved: InsightsMetricService.buildMetric(approvedCount, prevApproved),
      joined: InsightsMetricService.buildMetric(joinedCount, null),
      successfulRecruitment: InsightsMetricService.buildMetric(successfulRecruitmentCount, null),
      funnelStages,
      topRecruiters,
    };
  }

  // =========================================================================
  // 4. MODERATION & SAFETY ANALYTICS AGGREGATION
  // =========================================================================
  static async aggregateModeration(
    communityId: string,
    range: ResolvedDateRange
  ): Promise<ModerationAnalytics> {
    const allWarnings = await warningsRepository.listForTenant(communityId);
    const modWarnings = await moderationWarningsRepository.listForTenant(communityId);
    const allBlacklist = await blacklistEntriesRepository.listForTenant(communityId);
    const allIncidents = await safetyIncidentsRepository.listForTenant(communityId);
    const allActionExecs = await moderationActionExecutionsRepository.listForTenant(communityId);
    const allModLogs = await moderationLogsRepository.listForTenant(communityId);

    const inRange = (d?: string) => InsightsDateService.isDateInRange(d, range.rangeStart, range.rangeEnd);
    const inPrevRange = (d?: string) => InsightsDateService.isDateInRange(d, range.previousRangeStart, range.previousRangeEnd);

    // Combine legacy and Task 17 warnings
    const combinedWarnings = [
      ...allWarnings.map((w) => ({
        id: w.id,
        status: w.status,
        severity: w.severity,
        createdAt: w.createdAt,
      })),
      ...modWarnings.map((mw) => ({
        id: mw.id,
        status: mw.status,
        severity: mw.severity,
        createdAt: mw.createdAt,
      })),
    ];

    const currWarnings = combinedWarnings.filter((w) => inRange(w.createdAt));
    const prevWarnings = combinedWarnings.filter((w) => inPrevRange(w.createdAt));

    const totalWarnings = currWarnings.length;
    const activeWarnings = currWarnings.filter((w) => w.status === 'ACTIVE').length;
    const revokedWarnings = currWarnings.filter((w) => w.status === 'REVOKED' || w.status === 'EXPUNGED').length;

    // Blacklist
    const currBlacklist = allBlacklist.filter((b) => inRange(b.createdAt));
    const activeBlacklist = currBlacklist.filter((b) => b.status === 'ACTIVE').length;
    const removedBlacklist = currBlacklist.filter((b) => b.status === 'REMOVED').length;

    // Moderation Action Executions
    const currActionExecs = allActionExecs.filter((a) => inRange(a.createdAt));
    const timeouts = currActionExecs.filter((a) => a.actionType === 'TIMEOUT' && a.status === 'COMPLETED').length;
    const kicks = currActionExecs.filter((a) => a.actionType === 'KICK' && a.status === 'COMPLETED').length;
    const bans = currActionExecs.filter((a) => a.actionType === 'BAN' && a.status === 'COMPLETED').length;
    const failedActions = currActionExecs.filter((a) => a.status === 'FAILED').length;

    // Automod triggers & actions from logs
    const currLogs = allModLogs.filter((l) => inRange(l.createdAt || l.timestamp));
    const automodTriggers = currLogs.filter((l) => l.action === 'AUTOMOD_TRIGGERED').length;
    const automodActions = currLogs.filter((l) => l.action === 'AUTOMOD_ACTION_EXECUTED').length;

    // Incidents
    const currIncidents = allIncidents.filter((i) => inRange(i.createdAt));
    const openIncidents = currIncidents.filter((i) => i.status === 'OPEN' || i.status === 'INVESTIGATING').length;
    const resolvedIncidents = currIncidents.filter((i) => i.status === 'RESOLVED' || i.status === 'DISMISSED').length;

    // Severity breakdown
    const bySeverity: Record<string, number> = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      CRITICAL: 0,
    };
    currWarnings.forEach((w) => {
      const s = w.severity || 'LOW';
      bySeverity[s] = (bySeverity[s] || 0) + 1;
    });

    // Action breakdown
    const byAction = [
      { action: 'WARNINGS', count: totalWarnings, activeCount: activeWarnings, revokedCount: revokedWarnings },
      { action: 'TIMEOUTS', count: timeouts },
      { action: 'KICKS', count: kicks },
      { action: 'BANS', count: bans },
      { action: 'AUTOMOD_TRIGGERS', count: automodTriggers },
      { action: 'BLACKLIST_ADDITIONS', count: currBlacklist.length, activeCount: activeBlacklist, revokedCount: removedBlacklist },
    ];

    // Trend time-series
    const trendMap: Record<string, { warnings: number; automod: number; actions: number }> = {};
    range.dailyBuckets.forEach((d) => {
      trendMap[d] = { warnings: 0, automod: 0, actions: 0 };
    });

    currWarnings.forEach((w) => {
      const d = InsightsDateService.formatDateInTimezone(new Date(w.createdAt), range.timezone);
      if (trendMap[d]) trendMap[d].warnings++;
    });
    currLogs.forEach((l) => {
      const d = InsightsDateService.formatDateInTimezone(new Date(l.createdAt || l.timestamp), range.timezone);
      if (trendMap[d]) {
        if (l.action === 'AUTOMOD_TRIGGERED') trendMap[d].automod++;
        else trendMap[d].actions++;
      }
    });

    const trend = range.dailyBuckets.map((date) => ({
      date,
      warnings: trendMap[date]?.warnings || 0,
      automod: trendMap[date]?.automod || 0,
      actions: trendMap[date]?.actions || 0,
    }));

    const totalRecords = combinedWarnings.length + allBlacklist.length + allIncidents.length + allActionExecs.length;
    const coverage: DataCoverage = {
      coverageStart: range.rangeStart,
      coverageEnd: range.rangeEnd,
      recordsIncluded: totalRecords,
      recordsMissing: 0,
      source: 'moderationWarnings, blacklist, incidents, actionExecutions repositories',
      confidence: totalRecords > 0 ? 'COMPLETE' : 'INSUFFICIENT_DATA',
    };

    return {
      metadata: this.buildMetadata(communityId, range, coverage),
      warnings: InsightsMetricService.buildMetric(totalWarnings, prevWarnings.length),
      activeWarnings: InsightsMetricService.buildMetric(activeWarnings, null),
      revokedWarnings: InsightsMetricService.buildMetric(revokedWarnings, null),
      blacklistedMembers: InsightsMetricService.buildMetric(activeBlacklist, null),
      blacklistRemovals: InsightsMetricService.buildMetric(removedBlacklist, null),
      timeouts: InsightsMetricService.buildMetric(timeouts, null),
      kicks: InsightsMetricService.buildMetric(kicks, null),
      bans: InsightsMetricService.buildMetric(bans, null),
      automodTriggers: InsightsMetricService.buildMetric(automodTriggers, null),
      automodActions: InsightsMetricService.buildMetric(automodActions, null),
      openIncidents: InsightsMetricService.buildMetric(openIncidents, null),
      resolvedIncidents: InsightsMetricService.buildMetric(resolvedIncidents, null),
      failedModerationActions: InsightsMetricService.buildMetric(failedActions, null),
      byAction,
      bySeverity,
      trend,
    };
  }

  // =========================================================================
  // 5. EVENTS & ATTENDANCE ANALYTICS AGGREGATION
  // =========================================================================
  static async aggregateEvents(
    communityId: string,
    range: ResolvedDateRange
  ): Promise<EventsAnalytics> {
    const allEvents = await eventsRepository.listForTenant(communityId);
    const allRegistrations = await eventRegistrationsRepository.listForTenant(communityId);
    const allReminders = await eventRemindersRepository.listForTenant(communityId);

    const inRange = (d?: string) => InsightsDateService.isDateInRange(d, range.rangeStart, range.rangeEnd);
    const inPrevRange = (d?: string) => InsightsDateService.isDateInRange(d, range.previousRangeStart, range.previousRangeEnd);

    const currEvents = allEvents.filter((e) => inRange(e.startAt || e.createdAt));
    const prevEvents = allEvents.filter((e) => inPrevRange(e.startAt || e.createdAt));

    const eventsCreated = currEvents.length;
    const scheduledEvents = currEvents.filter((e) => e.status === 'SCHEDULED').length;
    const completedEvents = currEvents.filter((e) => e.status === 'COMPLETED').length;
    const cancelledEvents = currEvents.filter((e) => e.status === 'CANCELLED').length;

    // Registrations for events in range
    const eventIds = new Set(currEvents.map((e) => e.id));
    const currRegistrations = allRegistrations.filter((r) => eventIds.has(r.eventId));

    const totalRegistrations = currRegistrations.filter((r) => r.status !== 'CANCELLED').length;
    const waitlistCount = currRegistrations.filter((r) => r.status === 'WAITLISTED').length;

    // Authoritative attendance: NEVER infer from registration!
    const attendedCount = currRegistrations.filter(
      (r) => r.attendanceStatus === 'ATTENDED' || r.status === 'ATTENDED'
    ).length;
    const noShowsCount = currRegistrations.filter(
      (r) => r.attendanceStatus === 'NO_SHOW' || r.status === 'NO_SHOW'
    ).length;

    // Attendance rate
    const evaluatedAttendanceTotal = attendedCount + noShowsCount;
    const attendanceRate = evaluatedAttendanceTotal > 0
      ? Math.round((attendedCount / evaluatedAttendanceTotal) * 1000) / 10
      : null;

    // Reminders delivered
    const reminderDeliveries = allReminders.filter(
      (rem) => inRange(rem.triggerAt || rem.createdAt) && rem.status === 'SENT'
    ).length;

    // Event comparison list
    const eventComparison: EventComparisonItem[] = currEvents.slice(0, 10).map((ev) => {
      const regs = allRegistrations.filter((r) => r.eventId === ev.id && r.status !== 'CANCELLED');
      const attended = regs.filter((r) => r.attendanceStatus === 'ATTENDED' || r.status === 'ATTENDED').length;
      const rate = regs.length > 0 ? Math.round((attended / regs.length) * 1000) / 10 : null;
      return {
        id: ev.id,
        title: ev.title,
        startAt: ev.startAt,
        status: ev.status,
        registrations: regs.length,
        attendance: attended,
        attendanceRate: rate,
      };
    });

    // Trend
    const trendMap: Record<string, { events: number; registrations: number; attendance: number }> = {};
    range.dailyBuckets.forEach((d) => {
      trendMap[d] = { events: 0, registrations: 0, attendance: 0 };
    });

    currEvents.forEach((e) => {
      const d = InsightsDateService.formatDateInTimezone(new Date(e.startAt || e.createdAt), range.timezone);
      if (trendMap[d]) trendMap[d].events++;
    });
    currRegistrations.forEach((r) => {
      const d = InsightsDateService.formatDateInTimezone(new Date(r.registeredAt), range.timezone);
      if (trendMap[d]) {
        trendMap[d].registrations++;
        if (r.attendanceStatus === 'ATTENDED' || r.status === 'ATTENDED') {
          trendMap[d].attendance++;
        }
      }
    });

    const trend = range.dailyBuckets.map((date) => ({
      date,
      events: trendMap[date]?.events || 0,
      registrations: trendMap[date]?.registrations || 0,
      attendance: trendMap[date]?.attendance || 0,
    }));

    const totalRecords = allEvents.length + allRegistrations.length;
    const coverage: DataCoverage = {
      coverageStart: range.rangeStart,
      coverageEnd: range.rangeEnd,
      recordsIncluded: totalRecords,
      recordsMissing: 0,
      source: 'events, eventRegistrations repositories',
      confidence: totalRecords > 0 ? 'COMPLETE' : 'INSUFFICIENT_DATA',
    };

    return {
      metadata: this.buildMetadata(communityId, range, coverage),
      eventsCreated: InsightsMetricService.buildMetric(eventsCreated, prevEvents.length),
      scheduled: InsightsMetricService.buildMetric(scheduledEvents, null),
      completed: InsightsMetricService.buildMetric(completedEvents, null),
      cancelled: InsightsMetricService.buildMetric(cancelledEvents, null),
      registrations: InsightsMetricService.buildMetric(totalRegistrations, null),
      waitlist: InsightsMetricService.buildMetric(waitlistCount, null),
      attendance: InsightsMetricService.buildMetric(attendedCount, null),
      noShows: InsightsMetricService.buildMetric(noShowsCount, null),
      attendanceRate: attendanceRate !== null
        ? InsightsMetricService.buildMetric(attendanceRate, null, 'AVAILABLE')
        : InsightsMetricService.buildMetric(null, null, 'INSUFFICIENT_DATA', 'No completed events with recorded attendance in period.'),
      reminderDeliveries: InsightsMetricService.buildMetric(reminderDeliveries, null),
      eventComparison,
      trend,
    };
  }

  // =========================================================================
  // 6. AUTOMATION ANALYTICS AGGREGATION
  // =========================================================================
  static async aggregateAutomation(
    communityId: string,
    range: ResolvedDateRange
  ): Promise<AutomationAnalytics> {
    const allWorkflows = await automationWorkflowsRepository.listForTenant(communityId);
    const allExecutions = await automationExecutionsRepository.listForTenant(communityId);

    const inRange = (d?: string) => InsightsDateService.isDateInRange(d, range.rangeStart, range.rangeEnd);
    const inPrevRange = (d?: string) => InsightsDateService.isDateInRange(d, range.previousRangeStart, range.previousRangeEnd);

    const activeWorkflows = allWorkflows.filter((w) => w.status === 'ACTIVE').length;

    const currExecutions = allExecutions.filter((e) => inRange(e.executedAt || e.createdAt));
    const prevExecutions = allExecutions.filter((e) => inPrevRange(e.executedAt || e.createdAt));

    const totalExecutions = currExecutions.length;
    const successfulExecutions = currExecutions.filter((e) => e.status === 'COMPLETED').length;
    const partialExecutions = currExecutions.filter((e) => e.status === 'PARTIAL').length;
    const failedExecutions = currExecutions.filter((e) => e.status === 'FAILED').length;
    const skippedExecutions = currExecutions.filter((e) => e.status === 'SKIPPED').length;
    const retryCount = currExecutions.filter((e) => e.status === 'RETRYABLE').length;

    // Actions executed across all executions
    let actionsExecuted = 0;
    let automationErrors = 0;
    currExecutions.forEach((exec) => {
      if (exec.actions && Array.isArray(exec.actions)) {
        actionsExecuted += exec.actions.filter((a) => a.status === 'COMPLETED').length;
        automationErrors += exec.actions.filter((a) => a.status === 'FAILED').length;
      }
      if (exec.status === 'FAILED') {
        automationErrors++;
      }
    });

    // Top Workflows breakdown
    const workflowStatsMap: Record<string, { executions: number; successes: number; failures: number }> = {};
    const triggerFrequency: Record<string, number> = {};

    currExecutions.forEach((exec) => {
      const wId = exec.workflowId || 'unknown';
      if (!workflowStatsMap[wId]) {
        workflowStatsMap[wId] = { executions: 0, successes: 0, failures: 0 };
      }
      workflowStatsMap[wId].executions++;
      if (exec.status === 'COMPLETED') workflowStatsMap[wId].successes++;
      if (exec.status === 'FAILED') workflowStatsMap[wId].failures++;

      const tType = exec.triggerType || 'UNKNOWN';
      triggerFrequency[tType] = (triggerFrequency[tType] || 0) + 1;
    });

    const topWorkflows: AutomationWorkflowMetric[] = Object.entries(workflowStatsMap)
      .map(([wId, stats]) => {
        const wf = allWorkflows.find((w) => w.id === wId);
        const successRate = stats.executions > 0
          ? Math.round((stats.successes / stats.executions) * 1000) / 10
          : null;
        const failureRate = stats.executions > 0
          ? Math.round((stats.failures / stats.executions) * 1000) / 10
          : null;

        return {
          id: wId,
          name: wf ? wf.name : `Workflow_${wId}`,
          triggerType: wf ? wf.triggerType : 'UNKNOWN',
          executionsCount: stats.executions,
          successCount: stats.successes,
          failureCount: stats.failures,
          successRate,
          failureRate,
        };
      })
      .sort((a, b) => b.executionsCount - a.executionsCount)
      .slice(0, 10);

    const totalRecords = allWorkflows.length + allExecutions.length;
    const coverage: DataCoverage = {
      coverageStart: range.rangeStart,
      coverageEnd: range.rangeEnd,
      recordsIncluded: totalRecords,
      recordsMissing: 0,
      source: 'automationWorkflows, automationExecutions repositories',
      confidence: allWorkflows.length > 0 ? 'COMPLETE' : 'INSUFFICIENT_DATA',
    };

    return {
      metadata: this.buildMetadata(communityId, range, coverage),
      activeWorkflows: InsightsMetricService.buildMetric(activeWorkflows, null),
      workflowExecutions: InsightsMetricService.buildMetric(totalExecutions, prevExecutions.length),
      successfulExecutions: InsightsMetricService.buildMetric(successfulExecutions, null),
      partialExecutions: InsightsMetricService.buildMetric(partialExecutions, null),
      failedExecutions: InsightsMetricService.buildMetric(failedExecutions, null),
      skippedExecutions: InsightsMetricService.buildMetric(skippedExecutions, null),
      retryCount: InsightsMetricService.buildMetric(retryCount, null),
      actionsExecuted: InsightsMetricService.buildMetric(actionsExecuted, null),
      automationErrors: InsightsMetricService.buildMetric(automationErrors, null),
      topWorkflows,
      triggerFrequency,
    };
  }
}
