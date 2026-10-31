/**
 * Authoritative Types & Contracts for Task 20: Community Insights & Analytics Intelligence Engine
 */

export type DateRangeType = 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'CUSTOM';

export type MetricStatus =
  | 'AVAILABLE'
  | 'INSUFFICIENT_DATA'
  | 'NOT_CONFIGURED'
  | 'PERMISSION_REQUIRED'
  | 'DISCORD_LIMITATION'
  | 'FAILED';

export type MetricTrend = 'INCREASE' | 'DECREASE' | 'STABLE' | 'INSUFFICIENT_DATA';

export interface MetricValue<T = number> {
  value: T | null;
  previousValue: T | null;
  delta: number | null;
  deltaPercent: number | null;
  trend: MetricTrend;
  status: MetricStatus;
  note?: string;
}

export type CoverageStatus = 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT_DATA' | 'DISCORD_LIMITATION';

export interface DataCoverage {
  coverageStart: string;
  coverageEnd: string;
  recordsIncluded: number;
  recordsMissing: number;
  source: string;
  confidence: CoverageStatus;
  notes?: string;
}

export interface AnalyticsMetadata {
  communityId: string;
  rangeType: DateRangeType;
  rangeStart: string;
  rangeEnd: string;
  previousRangeStart: string;
  previousRangeEnd: string;
  timezone: string;
  generatedAt: string;
  coverage: DataCoverage;
}

// 1. Community Overview & Growth
export interface MemberGrowthPoint {
  date: string;
  newMembers: number;
  departures: number;
  netChange: number;
  totalMembers: number;
}

export interface CommunityOverviewAnalytics {
  metadata: AnalyticsMetadata;
  totalMembers: MetricValue<number>;
  newMembers: MetricValue<number>;
  membersLeft: MetricValue<number>;
  netGrowth: MetricValue<number>;
  growthRate: MetricValue<number>;
  discordKnownMembers: number;
  communityManagerRecords: number;
  estimatedActiveMembers: MetricValue<number>;
  retentionRate7Day: MetricValue<number>;
  retentionRate30Day: MetricValue<number>;
  growthTrend: MemberGrowthPoint[];
}

// 2. Engagement Analytics
export interface EngagementBreakdownItem {
  key: string;
  label: string;
  sent: number;
  failed: number;
  successRate: number | null;
}

export interface EngagementAnalytics {
  metadata: AnalyticsMetadata;
  announcementsSent: MetricValue<number>;
  successfulDeliveries: MetricValue<number>;
  failedDeliveries: MetricValue<number>;
  scheduledMessages: MetricValue<number>;
  campaignsCount: MetricValue<number>;
  campaignExecutions: MetricValue<number>;
  pollsCount: MetricValue<number>;
  pollParticipation: MetricValue<number>;
  remindersSent: MetricValue<number>;
  deliverySuccessRate: MetricValue<number>;
  byFeature: EngagementBreakdownItem[];
  byChannel: EngagementBreakdownItem[];
  trend: Array<{
    date: string;
    delivered: number;
    failed: number;
    votes: number;
  }>;
}

// 3. Recruitment & Recruiter Analytics
export interface FunnelStageResult {
  stage: string;
  label: string;
  count: number;
  conversionFromPrevious: number | null; // % or null if denominator 0
  overallConversion: number | null; // % from stage 0
  dropOff: number;
}

export interface RecruiterAttributionStats {
  recruiterId: string;
  discordUserId: string;
  username: string;
  code: string;
  applicationsAttributed: number;
  approvedApplicants: number;
  joinedApplicants: number;
  successfulRecruitments: number;
  conversionRate: number | null; // percentage
  attributionBreakdown: {
    manual: number;
    historical: number;
    discordConfirmed: number;
  };
}

export interface RecruitmentAnalytics {
  metadata: AnalyticsMetadata;
  totalApplications: MetricValue<number>;
  submitted: MetricValue<number>;
  underReview: MetricValue<number>;
  interviewRequired: MetricValue<number>;
  interviewsCompleted: MetricValue<number>;
  approved: MetricValue<number>;
  joined: MetricValue<number>;
  successfulRecruitment: MetricValue<number>;
  funnelStages: FunnelStageResult[];
  topRecruiters: RecruiterAttributionStats[];
}

// 4. Moderation Analytics
export interface ModerationActionBreakdown {
  action: string;
  count: number;
  activeCount?: number;
  revokedCount?: number;
}

export interface ModerationAnalytics {
  metadata: AnalyticsMetadata;
  warnings: MetricValue<number>;
  activeWarnings: MetricValue<number>;
  revokedWarnings: MetricValue<number>;
  blacklistedMembers: MetricValue<number>;
  blacklistRemovals: MetricValue<number>;
  timeouts: MetricValue<number>;
  kicks: MetricValue<number>;
  bans: MetricValue<number>;
  automodTriggers: MetricValue<number>;
  automodActions: MetricValue<number>;
  openIncidents: MetricValue<number>;
  resolvedIncidents: MetricValue<number>;
  failedModerationActions: MetricValue<number>;
  byAction: ModerationActionBreakdown[];
  bySeverity: Record<string, number>;
  trend: Array<{
    date: string;
    warnings: number;
    automod: number;
    actions: number;
  }>;
}

// 5. Events Analytics
export interface EventComparisonItem {
  id: string;
  title: string;
  startAt: string;
  status: string;
  registrations: number;
  attendance: number;
  attendanceRate: number | null;
}

export interface EventsAnalytics {
  metadata: AnalyticsMetadata;
  eventsCreated: MetricValue<number>;
  scheduled: MetricValue<number>;
  completed: MetricValue<number>;
  cancelled: MetricValue<number>;
  registrations: MetricValue<number>;
  waitlist: MetricValue<number>;
  attendance: MetricValue<number>;
  noShows: MetricValue<number>;
  attendanceRate: MetricValue<number>;
  reminderDeliveries: MetricValue<number>;
  eventComparison: EventComparisonItem[];
  trend: Array<{
    date: string;
    events: number;
    registrations: number;
    attendance: number;
  }>;
}

// 6. Automation Analytics
export interface AutomationWorkflowMetric {
  id: string;
  name: string;
  triggerType: string;
  executionsCount: number;
  successCount: number;
  failureCount: number;
  successRate: number | null;
  failureRate: number | null;
}

export interface AutomationAnalytics {
  metadata: AnalyticsMetadata;
  activeWorkflows: MetricValue<number>;
  workflowExecutions: MetricValue<number>;
  successfulExecutions: MetricValue<number>;
  partialExecutions: MetricValue<number>;
  failedExecutions: MetricValue<number>;
  skippedExecutions: MetricValue<number>;
  retryCount: MetricValue<number>;
  actionsExecuted: MetricValue<number>;
  automationErrors: MetricValue<number>;
  topWorkflows: AutomationWorkflowMetric[];
  triggerFrequency: Record<string, number>;
}

// 7. Community Health Indicator
export interface HealthSignal {
  name: string;
  key: 'GROWTH' | 'ENGAGEMENT' | 'RECRUITMENT' | 'EVENTS' | 'MODERATION' | 'AUTOMATION';
  status: MetricStatus;
  value: number | string | null;
  displayValue: string;
  weight: number; // 0 to 1, sum across signals = 1.0
  score: number; // 0 to 100
  contribution: number; // weight * score
  trend: MetricTrend;
  description: string;
  missingDataReason?: string;
}

export interface CommunityHealthIndicator {
  metadata: AnalyticsMetadata;
  indicatorScore: number | null; // 0-100 or null if insufficient data
  status: 'AVAILABLE' | 'INSUFFICIENT_DATA';
  trend: MetricTrend;
  signals: HealthSignal[];
  explanation: string;
  contributingSignals: string[];
  missingSignals: string[];
}

// 8. Unified Summary (Index)
export interface UnifiedInsightsOverview {
  metadata: AnalyticsMetadata;
  health: CommunityHealthIndicator;
  overview: {
    totalMembers: MetricValue<number>;
    netGrowth: MetricValue<number>;
    deliverySuccessRate: MetricValue<number>;
    successfulRecruitments: MetricValue<number>;
    activeWarnings: MetricValue<number>;
    scheduledEvents: MetricValue<number>;
    automationSuccessRate: MetricValue<number>;
  };
  community: CommunityOverviewAnalytics;
  engagement: EngagementAnalytics;
  recruitment: RecruitmentAnalytics;
  moderation?: ModerationAnalytics;
  events: EventsAnalytics;
  automation: AutomationAnalytics;
}

// ============================================================================
// TASK 85: INSIGHTS & AI INTELLIGENCE ENGINE EXTENSIONS
// ============================================================================

export type DataTruthClassification =
  | 'VERIFIED_FACT'
  | 'OBSERVED_CORRELATION'
  | 'POSSIBLE_EXPLANATION'
  | 'INSUFFICIENT_EVIDENCE';

export type MetricClassification =
  | 'RAW_DATA'
  | 'DERIVED_METRIC'
  | 'OBSERVED_CORRELATION'
  | 'AI_INTERPRETATION';

export type AIProviderStatus =
  | 'READY'
  | 'NOT_CONFIGURED'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'QUOTA_EXCEEDED'
  | 'ERROR';

export interface CohortMatrixCell {
  active: number;
  eligible: number;
  rate: number | null;
  status: 'AVAILABLE' | 'INSUFFICIENT_DATA';
  note?: string;
}

export interface CohortMatrixRow {
  cohortKey: string;
  cohortLabel: string;
  cohortType: 'JOIN_DATE' | 'CAMPAIGN' | 'RECRUITER' | 'SOURCE' | 'ONBOARDING' | 'EVENT';
  cohortStartDate: string;
  totalMembers: number;
  day1: CohortMatrixCell;
  day7: CohortMatrixCell;
  day30: CohortMatrixCell;
  day90: CohortMatrixCell;
}

export interface CommunityBrainStatusResponse {
  status: AIProviderStatus;
  providerName: string;
  model: string;
  isConfigured: boolean;
  quota: {
    allowed: boolean;
    currentUsage: number;
    dailyLimit: number;
    remaining: number;
    resetAt?: string;
  };
  reason?: string;
}

export interface CommunityBrainQueryRequest {
  prompt: string;
  rangeType?: DateRangeType;
  timezone?: string;
  includePlannedActions?: boolean;
}

export interface CommunityBrainEvidenceItem {
  id: string;
  classification: DataTruthClassification;
  metricLabel: string;
  source: string;
  statement: string;
  value?: any;
  period?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';
}

export interface CommunityBrainQueryResponse {
  status: AIProviderStatus;
  answer: string;
  advisoryNotice: string;
  evidenceClassification: {
    observedData: CommunityBrainEvidenceItem[];
    analysis: CommunityBrainEvidenceItem[];
    possibleExplanations: CommunityBrainEvidenceItem[];
    recommendedInvestigations: string[];
    insufficientEvidenceNotes: string[];
  };
  platformAnalytics?: Record<string, any>;
  quotaSnapshot: {
    current: number;
    limit: number;
    remaining: number;
  };
  metadata: {
    communityId: string;
    model: string;
    latencyMs: number;
    generatedAt: string;
    isAdvisoryOnly: true;
  };
}
