import { FirestoreRepository } from './firestore.repository.js';
import { discordSessionRepository } from './discordSession.repository.js';
import { discordOAuthStateRepository } from './discordOAuthState.repository.js';
import {
  UserDocument,
  CommunityDocument,
  RoleDocument,
  PermissionDocument,
  ApplicationDocument,
  ApplicationAnswerDocument,
  InterviewDocument,
  InterviewSessionDocument,
  InterviewIntroductionConfig,
  RecruiterDocument,
  RecruiterCodeDocument,
  ReferralDocument,
  NotificationDocument,
  CommunityConfigurationDocument,
  RewardDocument,
  AuditLogDocument,
  SystemSettingsDocument,
  PlatformServer,
  PlatformUser,
  PlatformOwnerClaim,
  BotInstallation,
  DiscordConnectionIntent,
  DiscordOAuthSession,
  PlatformUsageMetric,
  PlatformFeedback,
  PlatformSetting,
  PlatformAuditEvent,
  CommunityChannelAccess,
  RecruiterBenefit,
  ReferralLifecycleRecord,
  RecruiterNotificationHistory,
  ApplicantRestriction,
  ApplicationQuestion,
  InterviewQuestion,
  CommunityGuideline,
  GoogleSheetsConfig,
  WelcomeOnboardingConfig,
  WelcomeAuditRecord,
  RulesAcknowledgementRecord,
  OnboardingOperation,
  GoogleFormsConfig,
  GoogleCalendarConfig,
  UserCalendarConfigDocument,
  IntegrationEventRecord,
  RecruiterRecordDocument,
  RecruiterRecordConfiguration,
  DiscordMemberDocument,
  CommunityMemberAccessDocument,
  FeatureDefinition,
  FeatureEntitlement,
  CommunityPlan,
  CommunityUsage,
  Announcement,
  MessageTemplate,
  Campaign,
  Reminder,
  Poll,
  Warning,
  ModerationEvent,
  Event,
  EventRegistration,
  EventReminder,
  AutomationWorkflow,
  AutomationExecution,
  DurableLock,
  Schedule,
  ModerationWarning,
  ModerationRestriction,
  ModerationLog,
  BlacklistEntry,
  CommunityRule,
  AutoModerationRule,
  SafetyIncident,
  ModerationActionExecution,
  AiConversationDocument,
  AiUsageRecord,
  WorkspaceDocument,
  WorkspaceMemberDocument,
  WorkspaceInvitationDocument,
  SubscriptionDocument,
  InvoiceDocument,
  WebhookEventDocument,
  IncidentDocument,
  ScheduledJobStatus,
  RecruitmentScoreConfig,
  SavedRecruitmentSegment,
  RecruitmentCampaign,
  RecruitmentAlert,
  AiCandidateSummaryDoc,
  VersionedApplicationForm,
  ScreeningQuestion,
  RecruiterGoal,
  RecruitmentReward,
  MemberHandoffDocument,
  MemberOnboardingChecklistDocument,
  EarlyEngagementEventDocument,
  RecruitmentCohort,
  RetentionAlert,
  IntegrationSyncRecord,
  SecureIntegrationCredential,
} from '../../shared/types/models.js';

// --- TASK 51 REPOS: MEMBER LIFECYCLE & ONBOARDING HANDOFF ---
export const memberHandoffsRepository = new FirestoreRepository<MemberHandoffDocument>('memberHandoffs');
export const memberOnboardingChecklistsRepository = new FirestoreRepository<MemberOnboardingChecklistDocument>('memberOnboardingChecklists');
export const earlyEngagementEventsRepository = new FirestoreRepository<EarlyEngagementEventDocument>('earlyEngagementEvents');

// --- TASK 52 REPOS: RECRUITMENT RETENTION & LIFECYCLE INTELLIGENCE ---
export const recruitmentCohortsRepository = new FirestoreRepository<RecruitmentCohort>('recruitmentCohorts');
export const retentionAlertsRepository = new FirestoreRepository<RetentionAlert>('retentionAlerts');

// --- TASK 46 REPOS ---
export const recruitmentScoreConfigsRepository = new FirestoreRepository<RecruitmentScoreConfig>('recruitmentScoreConfigs');
export const savedRecruitmentSegmentsRepository = new FirestoreRepository<SavedRecruitmentSegment>('savedRecruitmentSegments');
export const recruitmentCampaignsRepository = new FirestoreRepository<RecruitmentCampaign>('recruitmentCampaigns');
export const recruitmentAlertsRepository = new FirestoreRepository<RecruitmentAlert>('recruitmentAlerts');
export const aiCandidateSummariesRepository = new FirestoreRepository<AiCandidateSummaryDoc>('aiCandidateSummaries');
export const versionedApplicationFormsRepository = new FirestoreRepository<VersionedApplicationForm>('versionedApplicationForms');
export const recruiterGoalsRepository = new FirestoreRepository<RecruiterGoal>('recruiterGoals');
export const recruitmentRewardsRepository = new FirestoreRepository<RecruitmentReward>('recruitmentRewards');

// Community-scoped repositories (multi-tenant)
export const usersRepository = new FirestoreRepository<UserDocument>('users');
export const communitiesRepository = new FirestoreRepository<CommunityDocument>('communities');
export const rolesRepository = new FirestoreRepository<RoleDocument>('roles');
export const permissionsRepository = new FirestoreRepository<PermissionDocument>('permissions');
export const applicationsRepository = new FirestoreRepository<ApplicationDocument>('applications');
export const applicationAnswersRepository = new FirestoreRepository<ApplicationAnswerDocument>('applicationAnswers');
export const interviewsRepository = new FirestoreRepository<InterviewDocument>('interviews');
export const interviewSessionsRepository = new FirestoreRepository<InterviewSessionDocument>('interviewSessions');
export const interviewIntroductionsRepository = new FirestoreRepository<{ id: string; communityId: string; config: InterviewIntroductionConfig }>('interviewIntroductions');
export const recruitersRepository = new FirestoreRepository<RecruiterDocument>('recruiters');
export const recruiterCodesRepository = new FirestoreRepository<RecruiterCodeDocument>('recruiterCodes');
export const referralsRepository = new FirestoreRepository<ReferralDocument>('referrals');
export const notificationsRepository = new FirestoreRepository<NotificationDocument>('notifications');
export const communityConfigurationRepository = new FirestoreRepository<CommunityConfigurationDocument>('communityConfiguration');
export const rewardsRepository = new FirestoreRepository<RewardDocument>('rewards');
export const auditLogsRepository = new FirestoreRepository<AuditLogDocument>('auditLogs');
export const systemSettingsRepository = new FirestoreRepository<SystemSettingsDocument>('systemSettings');

// Task 1.7 Repositories
export const channelAccessRepository = new FirestoreRepository<CommunityChannelAccess>('communityChannelAccess');
export const recruiterBenefitsRepository = new FirestoreRepository<RecruiterBenefit>('recruiterBenefits');
export const referralLifecycleRepository = new FirestoreRepository<ReferralLifecycleRecord>('referralsLifecycle');
export const recruiterNotificationHistoryRepository = new FirestoreRepository<RecruiterNotificationHistory>('recruiterNotificationHistory');
export const applicantRestrictionsRepository = new FirestoreRepository<ApplicantRestriction>('applicantRestrictions');
export const applicationQuestionsRepository = new FirestoreRepository<ApplicationQuestion>('applicationQuestions');
export const interviewQuestionsRepository = new FirestoreRepository<InterviewQuestion>('interviewQuestions');
export const communityGuidelinesRepository = new FirestoreRepository<CommunityGuideline>('communityGuidelines');
export const googleSheetsConfigsRepository = new FirestoreRepository<GoogleSheetsConfig>('spreadsheetConfiguration');
export const welcomeOnboardingConfigsRepository = new FirestoreRepository<WelcomeOnboardingConfig>('welcomeOnboardingConfigs');
export const welcomeAuditRecordsRepository = new FirestoreRepository<WelcomeAuditRecord>('welcomeAuditRecords');
export const rulesAcknowledgementsRepository = new FirestoreRepository<RulesAcknowledgementRecord>('rulesAcknowledgements');
export const onboardingOperationsRepository = new FirestoreRepository<OnboardingOperation>('onboardingOperations');
export const googleFormsConfigsRepository = new FirestoreRepository<GoogleFormsConfig>('formsConfiguration');
export const googleCalendarConfigsRepository = new FirestoreRepository<GoogleCalendarConfig>('calendarConfiguration');
export const userCalendarConfigsRepository = new FirestoreRepository<UserCalendarConfigDocument>('userCalendarConfigurations');
export const integrationEventsRepository = new FirestoreRepository<IntegrationEventRecord>('integrationEvents');
export const integrationSyncsRepository = new FirestoreRepository<IntegrationSyncRecord>('integrationSyncs');
export const integrationCredentialsRepository = new FirestoreRepository<SecureIntegrationCredential>('integrationCredentials');
export const operationHistoryRepository = new FirestoreRepository<any>('operationHistory');

// Task 9 Repositories
export const recruiterRecordsRepository = new FirestoreRepository<RecruiterRecordDocument>('recruiterRecords');
export const recruiterRecordConfigsRepository = new FirestoreRepository<RecruiterRecordConfiguration>('recruiterRecordConfigs');

// Task 11 Repositories
export const discordMembersRepository = new FirestoreRepository<DiscordMemberDocument>('discordMembers');
export const communityMemberAccessRepository = new FirestoreRepository<CommunityMemberAccessDocument>('communityMemberAccess');

// Community Manager Modular Repositories
export const featureDefinitionsRepository = new FirestoreRepository<FeatureDefinition>('featureDefinitions');
export const featureEntitlementsRepository = new FirestoreRepository<FeatureEntitlement>('featureEntitlements');
export const communityPlansRepository = new FirestoreRepository<CommunityPlan>('communityPlans');
export const communityUsagesRepository = new FirestoreRepository<CommunityUsage>('communityUsages');
export const announcementsRepository = new FirestoreRepository<Announcement>('announcements');
export const messageTemplatesRepository = new FirestoreRepository<MessageTemplate>('messageTemplates');
export const campaignsRepository = new FirestoreRepository<Campaign>('campaigns');
export const remindersRepository = new FirestoreRepository<Reminder>('reminders');
export const pollsRepository = new FirestoreRepository<Poll>('polls');
export const warningsRepository = new FirestoreRepository<Warning>('warnings');
export const moderationEventsRepository = new FirestoreRepository<ModerationEvent>('moderationEvents');
export const eventsRepository = new FirestoreRepository<Event>('events');
export const eventRegistrationsRepository = new FirestoreRepository<EventRegistration>('eventRegistrations');
export const eventRemindersRepository = new FirestoreRepository<EventReminder>('eventReminders');
export const automationWorkflowsRepository = new FirestoreRepository<AutomationWorkflow>('automationWorkflows');
export const automationExecutionsRepository = new FirestoreRepository<AutomationExecution>('automationExecutions');
export const durableLocksRepository = new FirestoreRepository<DurableLock>('durableLocks');
export const schedulesRepository = new FirestoreRepository<Schedule>('schedules');

// Task 17 Repositories
export const moderationWarningsRepository = new FirestoreRepository<ModerationWarning>('moderationWarnings');
export const moderationLogsRepository = new FirestoreRepository<ModerationLog>('moderationLogs');
export const blacklistEntriesRepository = new FirestoreRepository<BlacklistEntry>('blacklistEntries');
export const communityRulesRepository = new FirestoreRepository<CommunityRule>('communityRules');
export const autoModerationRulesRepository = new FirestoreRepository<AutoModerationRule>('autoModerationRules');
export const safetyIncidentsRepository = new FirestoreRepository<SafetyIncident>('safetyIncidents');
export const moderationActionExecutionsRepository = new FirestoreRepository<ModerationActionExecution>('moderationActionExecutions');
export const moderationRestrictionsRepository = new FirestoreRepository<ModerationRestriction>('moderationRestrictions');

// Task 21.5 Repositories: AI Conversation & Memory
export const aiConversationsRepository = new FirestoreRepository<AiConversationDocument>('aiConversations');

// Task 21.7 Repositories: AI Usage & Quota Records
export const aiUsageRecordsRepository = new FirestoreRepository<AiUsageRecord>('aiUsageRecords');


// Platform-level repositories (platform administration)
export const platformServersRepository = new FirestoreRepository<PlatformServer>('platformServers');
export const platformUsersRepository = new FirestoreRepository<PlatformUser>('platformUsers');
export const platformOwnerClaimsRepository = new FirestoreRepository<PlatformOwnerClaim>('platformOwnerClaims');
export const botInstallationsRepository = new FirestoreRepository<BotInstallation>('botInstallations');
export const connectionIntentsRepository = new FirestoreRepository<DiscordConnectionIntent>('connectionIntents');
export const sessionsRepository = new FirestoreRepository<DiscordOAuthSession & { sessionToken: string; id: string }>('discordSessions');
export interface OAuthStateRecord {
  id: string; // state token
  codeVerifier?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  redirectUri?: string;
  returnTo?: string;
  expiresAt: string;
  consumed: boolean;
  consumedAt?: string;
  createdAt?: string;
}
export const oauthStatesRepository = new FirestoreRepository<OAuthStateRecord>('oauthStates');
export const platformUsageMetricsRepository = new FirestoreRepository<PlatformUsageMetric>('platformUsageMetrics');
export const platformFeedbackRepository = new FirestoreRepository<PlatformFeedback>('platformFeedback');
export const platformSettingsRepository = new FirestoreRepository<PlatformSetting>('platformSettings');
export const platformAuditLogsRepository = new FirestoreRepository<PlatformAuditEvent>('platformAuditLogs');

// Workspace-level repositories
export const workspacesRepository = new FirestoreRepository<WorkspaceDocument>('workspaces');
export const workspaceMembersRepository = new FirestoreRepository<WorkspaceMemberDocument>('workspaceMembers');
export const workspaceInvitationsRepository = new FirestoreRepository<WorkspaceInvitationDocument>('workspaceInvitations');

// Billing repositories
export const subscriptionsRepository = new FirestoreRepository<SubscriptionDocument>('subscriptions');
export const invoicesRepository = new FirestoreRepository<InvoiceDocument>('invoices');
export const webhookEventsRepository = new FirestoreRepository<WebhookEventDocument>('webhookEvents');

// Observability & Operations repositories
export const incidentsRepository = new FirestoreRepository<IncidentDocument>('incidents');
export const scheduledJobsRepository = new FirestoreRepository<ScheduledJobStatus>('scheduledJobs');

// Onboarding Progress Repository
export interface OnboardingProgressDocument {
  id: string;
  communityId: string;
  guildId?: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  currentStep?: string;
  completedSteps?: string[];
  botInstalled?: boolean;
  guildSelected?: boolean;
  rolesMapped?: boolean;
  rulesPublished?: boolean;
  recruitmentConfigured?: boolean;
  updatedAt: string;
}
export const onboardingProgressRepository = new FirestoreRepository<OnboardingProgressDocument>('onboardingProgress');

export interface OnboardingTelemetryEvent {
  id: string;
  communityId?: string;
  guildId?: string;
  userId?: string;
  stage: string;
  status?: string;
  errorStatus?: string;
  failureReason?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}
export const onboardingTelemetryRepository = new FirestoreRepository<OnboardingTelemetryEvent>('onboardingTelemetry');

export interface UserNotificationPreferenceDocument {
  id: string; // `${userId}_${communityId || 'global'}`
  userId: string;
  communityId?: string;
  categories: Record<string, { enabled: boolean; channels: string[] }>;
  emailNotificationsEnabled: boolean;
  discordDmEnabled: boolean;
  inAppEnabled: boolean;
  updatedAt: string;
}
export const userNotificationPreferencesRepository = new FirestoreRepository<UserNotificationPreferenceDocument>('userNotificationPreferences');

// Task 124 Hardened Release Repositories
export interface IdempotencyRecord {
  id: string; // idempotencyKey
  communityId?: string;
  operationType: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  responsePayload?: any;
  resourceId?: string;
  createdAt: string;
  expiresAt: string;
  lockedUntil?: string;
}
export const idempotencyRecordsRepository = new FirestoreRepository<IdempotencyRecord>('idempotencyRecords');

export interface FailedOperationRecord {
  id: string; // operationId
  communityId: string;
  resource: string;
  operationType: string;
  attemptCount: number;
  lastErrorCode: string;
  lastErrorMessage?: string;
  lastAttemptedAt: string;
  nextRetryAt?: string;
  finalStatus: 'PENDING_RETRY' | 'EXHAUSTED' | 'RESOLVED' | 'DEAD_LETTER';
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}
export const failedOperationsRepository = new FirestoreRepository<FailedOperationRecord>('failedOperations');

export interface DiscordDeliveryRecord {
  id: string; // deliveryId / correlationId
  communityId: string;
  actorUserId: string;
  targetChannelId?: string;
  targetUserId?: string;
  featureKey: string;
  status: 'REQUESTED' | 'AUTHORIZED' | 'VALIDATED' | 'PROCESSING' | 'DISCORD_REQUESTED' | 'DISCORD_CONFIRMED' | 'SENT' | 'FAILED' | 'RATE_LIMITED' | 'PERMISSION_REQUIRED' | 'BOT_NOT_CONNECTED' | 'CHANNEL_NOT_FOUND' | 'DISCORD_LIMITATION';
  messageId?: string;
  errorCode?: string;
  errorMessage?: string;
  attemptCount: number;
  requestedAt: string;
  confirmedAt?: string;
  updatedAt: string;
}
export const discordDeliveriesRepository = new FirestoreRepository<DiscordDeliveryRecord>('discordDeliveries');

// Task 133 Production Operations Control Repositories
import type {
  OperationalExecutionRecord,
  OperationalLockRecord,
  DurableOperationalMetric,
  ServiceHealthSnapshot,
  LatencyRecord,
  IncidentTimelineEvent,
  PlatformNotificationPreference,
  EscalationPolicy,
  EscalationState,
  AlertRoutingDecision,
  IncidentCommunicationRecord,
  MaintenanceWindow,
  OperationalNotificationRecord,
  ReleaseValidationRecord,
  ReleaseHandoffRecord,
  ProductionAcceptanceRecord,
  ProductionReleaseEvidenceRecord,
  ChangeControlRecord,
  PostReleaseLockRecord,
} from '../../shared/types/observability.js';
export type {
  OperationalExecutionRecord,
  OperationalLockRecord,
  DurableOperationalMetric,
  ServiceHealthSnapshot,
  LatencyRecord,
  IncidentTimelineEvent,
  PlatformNotificationPreference,
  EscalationPolicy,
  EscalationState,
  AlertRoutingDecision,
  IncidentCommunicationRecord,
  MaintenanceWindow,
  OperationalNotificationRecord,
  ReleaseValidationRecord,
  ReleaseHandoffRecord,
  ProductionAcceptanceRecord,
  ProductionReleaseEvidenceRecord,
  ChangeControlRecord,
  PostReleaseLockRecord,
};
export const operationalExecutionsRepository = new FirestoreRepository<OperationalExecutionRecord>('operationalExecutions');
export const operationalLocksRepository = new FirestoreRepository<OperationalLockRecord>('operationalLocks');

// Task 134 Observability Repositories
export const operationalMetricsRepository = new FirestoreRepository<DurableOperationalMetric>('operationalMetrics');
export const healthSnapshotsRepository = new FirestoreRepository<ServiceHealthSnapshot>('healthSnapshots');
export const latencyRecordsRepository = new FirestoreRepository<LatencyRecord>('latencyRecords');
export const incidentTimelinesRepository = new FirestoreRepository<IncidentTimelineEvent>('incidentTimelines');
export const notificationPreferencesRepository = new FirestoreRepository<PlatformNotificationPreference>('notificationPreferences');

// Task 135 Incident Response & Alert Routing Repositories
export const escalationPoliciesRepository = new FirestoreRepository<EscalationPolicy>('escalationPolicies');
export const escalationStatesRepository = new FirestoreRepository<EscalationState>('escalationStates');
export const alertRoutingDecisionsRepository = new FirestoreRepository<AlertRoutingDecision>('alertRoutingDecisions');
export const incidentCommunicationsRepository = new FirestoreRepository<IncidentCommunicationRecord>('incidentCommunications');
export const maintenanceWindowsRepository = new FirestoreRepository<MaintenanceWindow>('maintenanceWindows');
export const operationalNotificationsRepository = new FirestoreRepository<OperationalNotificationRecord>('operationalNotifications');

// Task 137 Release Control & Handoff Repositories
export const releaseValidationRecordsRepository = new FirestoreRepository<ReleaseValidationRecord>('releaseValidationRecords');
export const releaseHandoffRecordsRepository = new FirestoreRepository<ReleaseHandoffRecord>('releaseHandoffRecords');

// Task 138 Production Acceptance Repositories
export const productionAcceptanceRecordsRepository = new FirestoreRepository<ProductionAcceptanceRecord>('productionAcceptanceRecords');

// Task 139 Release Attestation, Evidence, Change Control & Lock Repositories
export const releaseEvidenceRecordsRepository = new FirestoreRepository<ProductionReleaseEvidenceRecord>('releaseEvidenceRecords');
export const changeControlRecordsRepository = new FirestoreRepository<ChangeControlRecord>('changeControlRecords');
export const postReleaseLocksRepository = new FirestoreRepository<PostReleaseLockRecord>('postReleaseLocks');

export {
  FirestoreRepository,
  discordSessionRepository,
  discordOAuthStateRepository,
};
