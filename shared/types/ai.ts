/**
 * Authoritative Types & Contracts for Task 21.1: AI Community Manager Architecture & Context Foundation
 */

import { DateRangeType } from './insights.js';

export enum AiFailureCategory {
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  AUTHORIZATION_FAILED = 'AUTHORIZATION_FAILED',
  TENANT_CONTEXT_FAILED = 'TENANT_CONTEXT_FAILED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  RATE_LIMITED = 'RATE_LIMITED',
  SECURITY_BLOCKED = 'SECURITY_BLOCKED',
  INVALID_INPUT = 'INVALID_INPUT',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  CONTEXT_LIMIT = 'CONTEXT_LIMIT',
  AI_PROCESSING_FAILED = 'AI_PROCESSING_FAILED',
  OUTPUT_VALIDATION_FAILED = 'OUTPUT_VALIDATION_FAILED',
  ACTION_FAILED = 'ACTION_FAILED',
  EXPORT_FAILED = 'EXPORT_FAILED',
  TIMEOUT = 'TIMEOUT',
  DEPENDENCY_UNAVAILABLE = 'DEPENDENCY_UNAVAILABLE',
}

export type AiOperationalUiState =
  | 'processing'
  | 'retry_available'
  | 'temporarily_unavailable'
  | 'blocked'
  | 'insufficient_data'
  | 'completed'
  | 'failed';

export interface AiOperationalError {
  code: string;
  category: AiFailureCategory;
  userMessage: string;
  uiState: AiOperationalUiState;
  retryable: boolean;
  correlationId: string;
  timestamp: string;
  communityId?: string;
  details?: Record<string, unknown>;
}

export type AiScope = 'ALL' | 'OVERVIEW' | 'ENGAGEMENT' | 'RECRUITMENT' | 'MODERATION' | 'EVENTS' | 'AUTOMATION';

export type AiQuestionCategory =
  | 'COMMUNITY'
  | 'ENGAGEMENT'
  | 'RECRUITMENT'
  | 'MODERATION'
  | 'EVENTS'
  | 'AUTOMATION'
  | 'HEALTH'
  | 'GROWTH'
  | 'RETENTION'
  | 'CROSS_DOMAIN'
  | 'GENERAL';

export type AiEvidenceType =
  | 'VERIFIED_FACT'
  | 'OBSERVED_CORRELATION'
  | 'POSSIBLE_EXPLANATION'
  | 'INSUFFICIENT_EVIDENCE';

export interface AiFact {
  id: string;
  category: 'COMMUNITY' | 'ENGAGEMENT' | 'RECRUITMENT' | 'MODERATION' | 'EVENTS' | 'AUTOMATION' | 'HEALTH' | 'GROWTH' | 'RETENTION' | 'CROSS_DOMAIN';
  metric: string;
  statement?: string;
  value: string | number | boolean;
  previousValue?: string | number | boolean | null;
  delta?: number | string | null;
  deltaPercent?: number | null;
  source: string;
  period?: string;
  observationPeriod?: string;
  previousComparisonPeriod?: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  dataCoverage?: string;
  calculationScope?: string;
  canonicalDeepLink?: string;
  relevantModule?: AiModuleType;
  status?: string;
  isPartial?: boolean;
}

export interface AiInsight {
  id: string;
  category: 'GROWTH' | 'ENGAGEMENT' | 'RECRUITMENT' | 'SAFETY' | 'OPERATIONS' | 'HEALTH' | 'RETENTION' | 'COMMUNITY' | 'CROSS_DOMAIN';
  observation: string;
  evidence: string;
  evidenceType?: AiEvidenceType;
  whatHappened?: string;
  whyItLikelyHappened?: string;
  whatChanged?: string;
  opportunityOrRisk?: string;
  recommendedAction?: string;
  sourceMetric?: string;
  observationPeriod?: string;
  previousComparisonPeriod?: string;
  delta?: number | string | null;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  dataCoverage?: string;
  calculationScope?: string;
  canonicalDeepLink?: string;
  relevantModule?: AiModuleType;
  metric?: string;
  value?: string | number | boolean | null;
  previousValue?: string | number | boolean | null;
  period?: string;
  status?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'INFO';
  trend?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
}

export type AiRecommendationType =
  | 'OPPORTUNITY'
  | 'RISK'
  | 'BOTTLENECK'
  | 'DECLINING_METRIC'
  | 'IMPROVEMENT_AREA';

export type AiModuleType =
  | 'COMMUNITY'
  | 'ENGAGEMENT'
  | 'RECRUITMENT'
  | 'MODERATION'
  | 'EVENTS'
  | 'AUTOMATION'
  | 'GROWTH'
  | 'RETENTION'
  | 'HEALTH';

export type AiPriorityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AiRecommendation {
  id: string;
  title: string;
  reason: string;
  description: string;
  rationale: string;
  supportingFacts: string[];
  affectedModule: AiModuleType;
  priority: AiPriorityLevel;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceScore?: number;
  suggestedNextStep: string;
  canonicalDeepLink: string;
  type: AiRecommendationType;
  prioritizationScore?: number; // 0 to 100
  scoreFactors?: {
    impact: number;
    evidenceStrength: number;
    confidence: number;
    dataCoverage: number;
    actionability: number;
  };
  suggestedAction?: {
    actionType: string;
    targetModule: string;
    parameters?: Record<string, unknown>;
  };
}

export type AiActionLifecycleStatus =
  | 'DRAFT'
  | 'READY_FOR_CONFIRMATION'
  | 'CONFIRMED'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED';

export type SafeAiActionType =
  | 'CREATE_ANNOUNCEMENT'
  | 'CREATE_MESSAGE_TEMPLATE'
  | 'CREATE_EVENT_DRAFT'
  | 'CREATE_CAMPAIGN_DRAFT'
  | 'CREATE_REMINDER'
  | 'CREATE_AUTOMATION_DRAFT';

export type DestructiveAiActionType =
  | 'BAN_MEMBER'
  | 'KICK_MEMBER'
  | 'BLACKLIST_MEMBER'
  | 'MASS_ROLE_REMOVAL'
  | 'CANCEL_EVENT'
  | 'DELETE_WORKFLOW'
  | 'CHANGE_OWNERSHIP'
  | 'SECURITY_CHANGES';

export interface AiActionPlanStep {
  stepNumber: number;
  title: string;
  description: string;
  actionType: string;
  targetModule: AiModuleType;
  parameters?: Record<string, unknown>;
  status: AiActionLifecycleStatus | 'DRAFT' | 'DRY_RUN';
}

export interface AiActionPlan {
  id: string;
  communityId: string;
  goal: string;
  observedIssue: string;
  recommendedSteps: string[];
  structuredSteps?: AiActionPlanStep[];
  expectedObjective: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceScore?: number;
  affectedModule: AiModuleType;
  status: AiActionLifecycleStatus | 'DRAFT' | 'DRY_RUN';
  associatedRecommendationId?: string;
  createdAt: string;
  safetyCheck: {
    passed: boolean;
    guaranteedClaimsFound: boolean;
    safetyNotes: string[];
  };
}

export interface AiLimitation {
  id: string;
  topic: string;
  reason: string;
  dataMissing: boolean;
  recommendation?: string;
}

export interface AiConfidence {
  score: number; // 0.0 to 1.0
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  rationale: string;
  factors: {
    dataCompleteness: number; // 0.0 to 1.0
    domainCoverage: number; // 0.0 to 1.0
    recency: number; // 0.0 to 1.0
  };
}

export interface AiPlannedAction {
  id: string;
  title: string;
  module: 'ENGAGEMENT' | 'EVENTS' | 'MODERATION' | 'AUTOMATION' | 'COMMUNITY';
  actionType: string;
  status: 'DRAFT' | 'REQUIRES_APPROVAL' | 'DRY_RUN';
  parameters: Record<string, unknown>;
  preview: string;
  safetyNotes?: string[];
}

export interface AiCommunityContext {
  tenant: {
    communityId: string;
    communityName: string;
    guildId?: string;
    plan: string;
    timezone: string;
    botConnected: boolean;
  };
  overview: {
    totalMembers: number | null;
    newMembers: number | null;
    netGrowth: number | null;
    growthRate: number | null;
    estimatedActiveMembers: number | null;
    retentionRate7Day: number | null;
    retentionRate30Day: number | null;
  };
  engagement: {
    announcementsSent: number | null;
    activeCampaigns: number | null;
    pollsCount: number | null;
    deliverySuccessRate: number | null;
  };
  recruitment: {
    totalApplications: number | null;
    accepted: number | null;
    rejected: number | null;
    pending: number | null;
    interviewStage: number | null;
    conversionRate: number | null;
    activeRecruiters: number | null;
  };
  moderation: {
    warningsIssued: number | null;
    blacklistedUsers: number | null;
    safetyIncidents: number | null;
    automodTriggers: number | null;
  };
  events: {
    upcomingEventsCount: number | null;
    totalRegistrations: number | null;
    attendanceRate: number | null;
  };
  automation: {
    activeWorkflowsCount: number | null;
    recentExecutions: number | null;
    executionSuccessRate: number | null;
  };
  health: {
    healthScore: number | null;
    healthLevel: string | null;
    positiveSignals: string[];
    riskSignals: string[];
  };
  operationalSummaries: {
    recentAnnouncements: Array<{ title: string; targetChannel?: string; status: string; date?: string }>;
    upcomingEvents: Array<{ title: string; scheduledStartTime: string; status: string; rsvpCount: number }>;
    activeWorkflows: Array<{ name: string; triggerType: string; status: string }>;
    recentIncidents: Array<{ title: string; severity: string; status: string }>;
  };
  limitations: string[];
  dataCoverage: {
    coverageStatus: string;
    notes?: string;
    missingMetrics: string[];
  };
  resolvedPeriod?: {
    rangeType: DateRangeType;
    rangeStart: string;
    rangeEnd: string;
    previousRangeStart: string;
    previousRangeEnd: string;
    timezone: string;
    daysDiff: number;
  };
  metricComparisons?: Record<
    string,
    {
      current: number | string | null;
      previous: number | string | null;
      delta: number | string | null;
      deltaPercent: number | null;
      trend: string;
      status: string;
    }
  >;
  funnelStages?: Array<{
    stage: string;
    label: string;
    count: number;
    conversionFromPrevious: number | null;
    overallConversion: number | null;
    dropOff: number;
  }>;
  healthSignals?: Array<{
    name: string;
    key: string;
    status: string;
    value: number | string | null;
    displayValue: string;
    score: number;
    trend: string;
    description: string;
  }>;
  generatedAt: string;
}

export interface AiAskRequest {
  prompt: string;
  scope?: AiScope;
  dateRange?: DateRangeType;
  customStart?: string;
  customEnd?: string;
  timezone?: string;
  includePlannedActions?: boolean;
  conversationId?: string;
}

export interface AiResponseMetadata {
  communityId: string;
  communityName: string;
  model: string;
  generatedAt: string;
  latencyMs: number;
  redactedSecretCount: number;
  safetyPassed: boolean;
  period?: string;
  rangeStart?: string;
  rangeEnd?: string;
  comparisonRangeStart?: string;
  comparisonRangeEnd?: string;
  timezone?: string;
}

export interface AiQuotaSnapshot {
  current: number;
  limit: number;
  remaining: number;
}

export interface AiContextualActionRequest {
  action:
    | 'EXPLAIN_METRIC'
    | 'EXPLAIN_CHANGE'
    | 'FIND_CAUSES'
    | 'IDENTIFY_RISKS'
    | 'FIND_OPPORTUNITIES'
    | 'RECOMMEND_ACTIONS';
  metricKey?: string;
  metricLabel?: string;
  currentValue?: number | string | null;
  previousValue?: number | string | null;
  delta?: number | string | null;
  domain?: AiModuleType | 'ALL';
  dateRange?: DateRangeType;
  customStart?: string;
  customEnd?: string;
  timezone?: string;
  conversationId?: string;
}

export interface AiContextualActionResponse extends AiResponse {
  contextualAction:
    | 'EXPLAIN_METRIC'
    | 'EXPLAIN_CHANGE'
    | 'FIND_CAUSES'
    | 'IDENTIFY_RISKS'
    | 'FIND_OPPORTUNITIES'
    | 'RECOMMEND_ACTIONS';
  targetMetric?: string;
  targetDomain?: string;
  deepLink?: string;
}

export interface AiResponse {
  success: boolean;
  answer: string;
  facts: AiFact[];
  insights: AiInsight[];
  recommendations: AiRecommendation[];
  limitations: AiLimitation[];
  confidence: AiConfidence;
  classification?: {
    category: AiQuestionCategory;
    confidence: number;
    explanation?: string;
  };
  actionsPlanned?: AiPlannedAction[];
  actionPlans?: AiActionPlan[];
  conversationId?: string;
  metadata: AiResponseMetadata;
  quotaSnapshot?: AiQuotaSnapshot;
  contextualAction?:
    | 'EXPLAIN_METRIC'
    | 'EXPLAIN_CHANGE'
    | 'FIND_CAUSES'
    | 'IDENTIFY_RISKS'
    | 'FIND_OPPORTUNITIES'
    | 'RECOMMEND_ACTIONS';
  targetMetric?: string;
  targetDomain?: string;
  canonicalDeepLink?: string;
}

export interface AiErrorContract {
  success: false;
  error: {
    code:
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'PLAN_LIMIT_EXCEEDED'
      | 'QUOTA_EXCEEDED'
      | 'VALIDATION_FAILED'
      | 'TENANT_MISMATCH'
      | 'SAFETY_VIOLATION'
      | 'SERVICE_UNAVAILABLE'
      | 'INTERNAL_ERROR';
    message: string;
    details?: Record<string, unknown>;
  };
  requestId?: string;
}

export interface AiActionTarget {
  module: AiModuleType;
  entityType: 'channel' | 'member' | 'event' | 'workflow' | 'community' | 'template' | 'campaign' | 'reminder';
  entityId?: string;
  entityName?: string;
}

export interface AiActionSafetyStatus {
  isSafe: boolean;
  isDestructive: boolean;
  blockedReason?: string;
  passed: boolean;
  safetyNotes: string[];
}

export interface AiActionDiscordPermissionInfo {
  required: string[];
  granted: boolean;
  botConnected: boolean;
  details?: string;
  roleHierarchyValid?: boolean;
}

export interface AiActionEntitlementInfo {
  featureKey: string;
  featureName: string;
  active: boolean;
  planLimitExceeded?: boolean;
}

export interface AiActionPreview {
  actionId: string;
  action: string;
  actionType: string;
  community: {
    id: string;
    name: string;
    guildId?: string;
  };
  target: AiActionTarget;
  targetResource: string; // Specific channel / member / event / workflow string
  exactChanges: Record<string, unknown>;
  requiredPermission: string;
  entitlement: AiActionEntitlementInfo;
  discordPermission: AiActionDiscordPermissionInfo;
  safetyStatus: AiActionSafetyStatus;
  lifecycleStatus: AiActionLifecycleStatus;
  confirmationToken?: string;
  requiresConfirmation: boolean;
  confirmedBy?: {
    userId: string;
    confirmedAt: string;
  };
  idempotencyKey?: string;
  executionResult?: {
    success: boolean;
    executedAt: string;
    resourceId?: string;
    resourceType?: string;
    details?: Record<string, unknown>;
    error?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AiActionPreviewRequest {
  actionType: string;
  targetModule?: AiModuleType;
  parameters: Record<string, unknown>;
  targetResource?: string;
  recommendationId?: string;
  planId?: string;
  stepNumber?: number;
}

export interface AiActionConfirmRequest {
  actionId: string;
  confirmationToken: string;
  confirmed: boolean;
}

export interface AiActionExecuteRequest {
  actionId: string;
  confirmationToken: string;
  idempotencyKey?: string;
}

export interface AiActionExecutionResponse {
  success: boolean;
  actionId: string;
  lifecycleStatus: AiActionLifecycleStatus;
  result?: {
    resourceId?: string;
    resourceType?: string;
    details?: Record<string, unknown>;
  };
  error?: string;
  executedAt?: string;
}

/**
 * Task 21.5: AI Conversation & Memory Contracts
 */
export interface AiConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  model?: string;
  category?: AiQuestionCategory;
  facts?: AiFact[];
  insights?: AiInsight[];
  recommendations?: AiRecommendation[];
  actionsPlanned?: AiPlannedAction[];
  actionPlans?: AiActionPlan[];
  confidence?: AiConfidence;
  redactedSecretCount?: number;
}

export interface AiConversationSummary {
  summary: string;
  keyTopics: string[];
  lastSummarizedMessageId?: string;
  updatedAt: string;
}

export interface AiConversation {
  id: string; // conversationId
  communityId: string;
  userId: string;
  title: string;
  messages: AiConversationMessage[];
  contextSummary?: string;
  summaryData?: AiConversationSummary;
  relevantInsights?: string[];
  metadata?: {
    totalMessages: number;
    lastMessageAt?: string;
    model?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export type AiConversationDocument = AiConversation;

export interface AiConversationCreateRequest {
  title?: string;
  initialPrompt?: string;
}

export interface AiConversationRenameRequest {
  title: string;
}

/**
 * Task 21.7: AI Usage, Quotas & Entitlements Types
 */
export type AiQuotaState =
  | 'AVAILABLE'
  | 'LIMIT_REACHED'
  | 'RATE_LIMITED'
  | 'FEATURE_NOT_ENABLED'
  | 'BILLING_REQUIRED'
  | 'INSUFFICIENT_DATA'
  | 'TEMPORARILY_UNAVAILABLE';

export type AiUsageCapability =
  | 'ASK_QUERY'
  | 'CONVERSATION'
  | 'RECOMMENDATIONS'
  | 'ACTION_PLAN'
  | 'ACTION_PREVIEW'
  | 'ACTION_EXECUTION'
  | 'CONTEXT'
  | 'AI_REPORT_EXPORT'
  | 'LEGACY_CONSULT';

export interface AiUsageRecord {
  id: string; // `ai_usage_${communityId}_${date}`
  communityId: string;
  date: string; // YYYY-MM-DD
  requestsTotal: number;
  requestsSuccessful: number;
  requestsBlocked: number;
  requestsFailed: number;
  inputTokensEstimated: number;
  outputTokensEstimated: number;
  totalTokensEstimated: number;
  actionPlansCreated: number;
  actionExecutions: number;
  conversationMessages: number;
  usageByCapability: Record<string, number>;
  blockedReasons: Record<string, number>;
  failedReasons: Record<string, number>;
  lastRequestAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiUsageSnapshot {
  communityId: string;
  state: AiQuotaState;
  plan: string;
  current: {
    requestsTotal: number;
    requestsSuccessful: number;
    requestsBlocked: number;
    requestsFailed: number;
    tokensEstimated: number;
    actionPlans: number;
    actionExecutions: number;
    conversationMessages: number;
  };
  limits: {
    dailyRequests: number;
    rateLimitPerMinute: number;
    maxConcurrent: number;
    maxTokensPerRequest: number;
    maxActionPlansPerDay: number;
    maxActionExecutionsPerDay: number;
    maxContextLengthChars: number;
  };
  remaining: {
    requests: number;
    actionPlans: number;
    actionExecutions: number;
  };
  resetPeriod: 'DAILY';
  resetsAt: string;
  blockedSummary: {
    total: number;
    reasons: Record<string, number>;
  };
  usageByCapability: Record<string, number>;
}

export interface PlatformAiUsageOverview {
  totalAiRequests: number;
  successfulRequests: number;
  blockedRequests: number;
  failedRequests: number;
  totalTokensEstimated: number;
  activeAiCommunitiesCount: number;
  topUsageCommunities: Array<{
    communityId: string;
    communityName: string;
    requestsTotal: number;
    tokensEstimated: number;
    state: AiQuotaState;
    plan: string;
  }>;
  usageByCapability: Record<string, number>;
  blockedReasonsBreakdown: Record<string, number>;
  health: {
    avgLatencyMs: number;
    errorRatePercent: number;
    rateLimitedPercent: number;
    status: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  };
  generatedAt: string;
}

/**
 * Task 21.10: AI Export & Reporting Contracts
 */
export type AiReportFormat = 'pdf' | 'csv' | 'json';

export type AiReportSourceType =
  | 'CONVERSATION'
  | 'INSIGHT_ANALYSIS'
  | 'RECOMMENDATION_ANALYSIS'
  | 'ACTION_PLAN'
  | 'QUERY_RESPONSE'
  | 'CUSTOM';

export type AiReportGenerationState =
  | 'GENERATING'
  | 'COMPLETED'
  | 'FAILED'
  | 'INSUFFICIENT_DATA'
  | 'PERMISSION_REQUIRED'
  | 'FEATURE_NOT_ENABLED';

export interface AiReportTraceability {
  metric?: string;
  domain?: string;
  dateRange?: string;
  rangeStart?: string;
  rangeEnd?: string;
  comparisonPeriod?: string;
  comparisonRangeStart?: string;
  comparisonRangeEnd?: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceScore?: number;
  dataCoverage?: string;
  calculationScope?: string;
  model?: string;
}

export interface AiReportMetadata {
  communityId: string;
  communityName: string;
  observationPeriod: string;
  rangeStart?: string;
  rangeEnd?: string;
  comparisonPeriod?: string;
  comparisonRangeStart?: string;
  comparisonRangeEnd?: string;
  dataScope: string;
  generatedAt: string;
  generatedByUserId: string;
  generatedByRole: string;
  sourceType: AiReportSourceType;
  sourceId?: string;
  traceability: AiReportTraceability;
  redactedSecretCount: number;
  isPartialData?: boolean;
}

export interface AiReportCorrelationItem {
  id?: string;
  observation: string;
  evidence: string;
  domain?: string;
  evidenceType?: AiEvidenceType;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface AiReportExplanationItem {
  id?: string;
  cause: string;
  explanation: string;
  probability?: 'HIGH' | 'MEDIUM' | 'LOW' | string;
}

export interface AiReportRiskItem {
  id?: string;
  title: string;
  description: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  recommendation?: string;
}

export interface AiReportOpportunityItem {
  id?: string;
  title: string;
  description: string;
  expectedImpact?: string;
  suggestedAction?: string;
}

export interface AiReportData {
  reportId: string;
  title: string;
  analysisQuestion?: string;
  summaryAnswer?: string;
  metadata: AiReportMetadata;
  facts: AiFact[];
  insights: AiInsight[];
  correlations?: AiReportCorrelationItem[];
  explanations?: AiReportExplanationItem[];
  risks?: AiReportRiskItem[];
  opportunities?: AiReportOpportunityItem[];
  recommendations: AiRecommendation[];
  actionPlans?: AiActionPlan[];
  conversationMessages?: Array<{
    id?: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
  }>;
  dataLimitations: AiLimitation[] | string[];
  generationState: AiReportGenerationState;
  stateExplanation?: string;
}

export interface AiReportExportRequest {
  format: AiReportFormat;
  sourceType: AiReportSourceType;
  conversationId?: string;
  contextualActionRequest?: AiContextualActionRequest;
  aiResponse?: AiResponse;
  recommendationId?: string;
  dateRange?: DateRangeType;
  customStart?: string;
  customEnd?: string;
  domain?: string;
  title?: string;
  question?: string;
}

export interface AiReportExportResult {
  reportId: string;
  filename: string;
  contentType: string;
  content: string | Buffer;
  generationState: AiReportGenerationState;
  metadata: AiReportMetadata;
}


