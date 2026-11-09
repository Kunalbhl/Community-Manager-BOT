import { UserRole, Permission } from './rbac.js';
import { CommunityConfiguration } from './community.js';

export type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ESCALATED'
  | 'ADDITIONAL_INFORMATION_REQUIRED'
  | 'ADDITIONAL_INFO_REQUIRED'
  | 'INTERVIEW_REQUIRED'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEW_COMPLETED'
  | 'APPROVED'
  | 'REJECTED'
  | 'JOIN_PENDING'
  | 'JOINED'
  | 'CLOSED'
  | 'WITHDRAWN';

export type NotificationChannel = 'DISCORD_DM' | 'DISCORD_CHANNEL' | 'WEB_DASHBOARD';

export type NotificationType =
  | 'APPLICATION_RECEIVED'
  | 'APPLICATION_STATUS_CHANGED'
  | 'APPLICATION_APPROVED'
  | 'APPLICATION_REJECTED'
  | 'APPLICATION_REVIEW_REQUIRED'
  | 'ADDITIONAL_INFORMATION_REQUIRED'
  | 'INTERVIEW_REQUIRED'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEW_COMPLETED'
  | 'JOIN_CONFIRMED'
  | 'RECRUITMENT_SUCCESSFUL'
  | 'MEMBER_ACTIVATED'
  | 'ONBOARDING_COMPLETED'
  | 'BENEFIT_EARNED'
  | 'RECRUITER_CODE_GENERATED'
  | 'RECRUITER_CODE_REVOKED'
  | 'REFERRAL_RECEIVED'
  | 'REFERRAL_APPROVED'
  | 'REWARD_EARNED'
  | 'BLACKLIST_ALERT'
  | 'SYSTEM_NOTIFICATION';

export type AuditAction =
  | 'DISCORD_GUILD_LINKED'
  | 'DISCORD_GUILD_LINK_REJECTED'
  | 'DISCORD_GUILD_ALREADY_CONNECTED'
  | 'DISCORD_GUILD_REVERIFIED'
  | 'DISCORD_GUILD_UNLINKED'
  | 'SYSTEM_AUDIT_VERIFIED'
  | 'APPLICATION_CREATED'
  | 'APPLICATION_SUBMITTED'
  | 'APPLICATION_REVIEW_STARTED'
  | 'ADDITIONAL_INFORMATION_REQUESTED'
  | 'INTERVIEW_CREATED'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEW_STARTED'
  | 'INTERVIEW_COMPLETED'
  | 'INTERVIEW_CANCELLED'
  | 'APPLICATION_APPROVED'
  | 'APPLICATION_REJECTED'
  | 'APPLICATION_STATUS_CHANGED'
  | 'JOIN_CONFIRMED'
  | 'REFERRAL_CREATED'
  | 'REFERRAL_STATUS_CHANGED'
  | 'RECRUITMENT_SUCCESSFUL'
  | 'MEMBER_HANDOFF_STARTED'
  | 'MEMBER_ACTIVATED'
  | 'MEMBER_HANDOFF_BLOCKED'
  | 'MEMBER_ONBOARDING_CHECKLIST_UPDATED'
  | 'MEMBER_ONBOARDING_COMPLETED'
  | 'EARLY_ENGAGEMENT_RECORDED'
  | 'MEMBER_HANDOFF_RETRIED'
  | 'COHORT_CREATED'
  | 'COHORT_CORRECTED'
  | 'RETENTION_CALCULATED'
  | 'QUALITY_INSIGHT_GENERATED'
  | 'MANUAL_DATA_CORRECTION'
  | 'RECRUITMENT_SOURCE_CORRECTED'
  | 'BENEFIT_EARNED'
  | 'BENEFIT_FULFILLMENT_ATTEMPTED'
  | 'BENEFIT_FULFILLED'
  | 'BENEFIT_FULFILLMENT_FAILED'
  | 'RECRUITER_BENEFIT_CONFIGURED'
  | 'RECRUITER_BENEFIT_GRANTED'
  | 'RECRUITER_CODE_CREATED'
  | 'RECRUITER_CODE_REVOKED'
  | 'PERMISSION_CHANGED'
  | 'COMMUNITY_SETTINGS_CHANGED'
  | 'RECRUITER_DISPLAY_NAME_CHANGED'
  | 'AUTH_LOGIN'
  | 'AUTH_LOGOUT'
  | 'COMMUNITY_ACCESS'
  | 'ROLE_RESOLUTION'
  | 'ROLE_MAPPING_CHANGED'
  | 'INTERVIEW_JOIN'
  | 'INTERVIEW_LEAVE'
  | 'INTERVIEW_ACTION'
  | 'APPLICATION_VIEW'
  | 'APPLICATION_ESCALATED'
  | 'BLACKLIST_CREATED'
  | 'BLACKLIST_UPDATED'
  | 'WORKFLOW_CHANGED'
  | 'DISCORD_SYNC'
  | 'PERMISSION_DENIED'
  | 'BOT_COMMAND_EXECUTED'
  | 'AUDIT_LOG_EXPIRED'
  | 'AUDIT_CLEANUP_PERFORMED'
  | 'INTERVIEW_SESSION_CREATED'
  | 'USER_ROLE_CHANGED'
  | 'REWARD_DISTRIBUTED'
  | 'BLACKLIST_MATCHED'
  | 'BLACKLIST_ENFORCEMENT_ATTEMPTED'
  | 'BLACKLIST_ENFORCED'
  | 'BLACKLIST_ENFORCEMENT_FAILED'
  | 'BLACKLIST_USER_FLAGGED'
  | 'BLACKLIST_USER_UNFLAGGED'
  | 'BLACKLIST_STATUS_CHANGED'
  | 'CHANNEL_ACCESS_CONFIGURED'
  | 'GOOGLE_SHEET_CONFIGURED'
  | 'GOOGLE_SHEET_SYNCED'
  | 'NOTIFICATION_SENT'
  | 'NOTIFICATION_FAILED'
  | 'ROLE_ASSIGNED'
  | 'MEMBER_ROLE_ASSIGNED'
  | 'MEMBER_ROLE_REMOVED'
  | 'ROLE_ASSIGNMENT_FAILED'
  | 'WELCOME_SENT'
  | 'WELCOME_FAILED'
  | 'WELCOME_CONFIG_CHANGED'
  | 'RECRUITER_CODE_ACTIVATED'
  | 'RECRUITER_CODE_DEACTIVATED'
  | 'COMMUNITY_SETUP_STARTED'
  | 'DISCORD_SERVER_SELECTED'
  | 'BOT_VERIFIED'
  | 'ROLE_MAPPING_COMPLETED'
  | 'GUIDE_PUBLISHED'
  | 'RULES_PUBLISHED'
  | 'RECRUITMENT_CONFIGURED'
  | 'INTERVIEW_CONFIGURED'
  | 'WORKFLOW_CONFIGURED'
  | 'COMMUNITY_SETUP_COMPLETED'
  | 'GOOGLE_FORM_CONNECTED'
  | 'GOOGLE_FORM_DISCONNECTED'
  | 'GOOGLE_FORM_IMPORT_STARTED'
  | 'GOOGLE_FORM_IMPORT_COMPLETED'
  | 'GOOGLE_FORM_IMPORT_FAILED'
  | 'GOOGLE_CALENDAR_CONNECTED'
  | 'GOOGLE_CALENDAR_DISCONNECTED'
  | 'CALENDAR_OAUTH_STARTED'
  | 'CALENDAR_OAUTH_SUCCESS'
  | 'CALENDAR_OAUTH_FAILED'
  | 'CALENDAR_SETUP_PROMPT_SHOWN'
  | 'CALENDAR_CONNECTED'
  | 'CALENDAR_SETUP_SKIPPED'
  | 'CALENDAR_RECONNECTED'
  | 'CALENDAR_DISCONNECTED'
  | 'CALENDAR_CHANGED'
  | 'CALENDAR_CONNECTION_FAILED'
  | 'CALENDAR_SETTING_CHANGED'
  | 'CALENDAR_EVENT_CREATED'
  | 'CALENDAR_EVENT_UPDATED'
  | 'CALENDAR_EVENT_CANCELLED'
  | 'CALENDAR_EVENT_FAILED'
  | 'CALENDAR_REAUTH_REQUIRED'
  | 'GOOGLE_SHEETS_CONNECTED'
  | 'GOOGLE_SHEETS_DISCONNECTED'
  | 'SHEETS_SYNC_STARTED'
  | 'SHEETS_SYNC_COMPLETED'
  | 'SHEETS_SYNC_FAILED'
  | 'FIREBASE_CONFIGURATION_CHANGED'
  | 'INTEGRATION_RETRY'
  | 'INTEGRATION_PERMISSION_FAILURE'
  | 'RECRUITER_RECORD_CREATED'
  | 'RECRUITER_RECORD_MESSAGE_SENT'
  | 'RECRUITER_RECORD_MESSAGE_FAILED'
  | 'RECRUITER_RECORD_MESSAGE_RETRIED'
  | 'RECRUITER_BENEFIT_EVALUATED'
  | 'RECRUITER_BENEFIT_CLAIMED'
  | 'RECRUITER_BENEFIT_FULFILLED'
  | 'RECRUITER_BENEFIT_CLAIM_FAILED'
  | 'RECRUITER_RECORD_CHANNEL_CONFIGURED'
  | 'RECRUITER_RECORD_TEMPLATE_CHANGED'
  | 'GOOGLE_SHEET_RECRUITER_RECORD_SYNCED'
  | 'GOOGLE_SHEET_RECRUITER_RECORD_SYNC_FAILED'
  | 'ENGAGEMENT_CREATED'
  | 'ENGAGEMENT_UPDATED'
  | 'ENGAGEMENT_SCHEDULED'
  | 'ENGAGEMENT_CANCELLED'
  | 'ENGAGEMENT_STARTED'
  | 'ENGAGEMENT_SENT'
  | 'ENGAGEMENT_FAILED'
  | 'ENGAGEMENT_RETRIED'
  | 'ENGAGEMENT_PAUSED'
  | 'ENGAGEMENT_RESUMED'
  | 'TEMPLATE_CREATED'
  | 'TEMPLATE_UPDATED'
  | 'TEMPLATE_ARCHIVED'
  | 'CAMPAIGN_CREATED'
  | 'CAMPAIGN_STARTED'
  | 'CAMPAIGN_COMPLETED'
  | 'POLL_CREATED'
  | 'POLL_CLOSED'
  | 'COMMUNITY_ONBOARDING_STARTED'
  | 'DISCORD_OAUTH_STARTED'
  | 'DISCORD_OAUTH_COMPLETED'
  | 'BOT_INSTALL_STARTED'
  | 'BOT_INSTALL_COMPLETED'
  | 'COMMUNITY_SELECTED'
  | 'INITIAL_SYNC_STARTED'
  | 'INITIAL_SYNC_COMPLETED'
  | 'DISCORD_GUILD_SELECTED'
  | 'DISCORD_BOT_VERIFIED'
  | 'COMMUNITY_INITIAL_SYNC_STARTED'
  | 'COMMUNITY_INITIAL_SYNC_COMPLETED'
  | 'COMMUNITY_ONBOARDING_COMPLETED'
  | 'COMMUNITY_ONBOARDING_FAILED'
  | 'COMMUNITY_ACTIVATION_STARTED'
  | 'COMMUNITY_ACTIVATED'
  | 'COMMUNITY_ACTIVATION_BLOCKED'
  | 'FIRST_VALUE_STARTED'
  | 'FIRST_VALUE_COMPLETED'
  | 'REMINDER_CREATED'
  | 'REMINDER_SENT'
  | 'EVENT_CREATED'
  | 'EVENT_PUBLISHED'
  | 'EVENT_CANCELLED'
  | 'EVENT_REGISTRATION_CREATED'
  | 'EVENT_REGISTRATION_CANCELLED'
  | 'EVENT_WAITLIST_ADDED'
  | 'EVENT_WAITLIST_PROMOTED'
  | 'EVENT_ATTENDANCE_MARKED'
  | 'EVENT_CHECKIN'
  | 'EVENT_REMINDER_SCHEDULED'
  | 'EVENT_REMINDER_SENT'
  | 'EVENT_UPDATED'
  | 'EVENT_STARTED'
  | 'EVENT_COMPLETED'
  | 'EVENT_ARCHIVED'
  | 'EVENT_ATTENDANCE_RECORDED'
  | 'SCHEDULE_CREATED'
  | 'SCHEDULE_UPDATED'
  | 'SCHEDULE_PAUSED'
  | 'SCHEDULE_RESUMED'
  | 'SCHEDULE_CANCELLED'
  | 'SCHEDULE_EXECUTED'
  | 'AUTOMATION_CREATED'
  | 'AUTOMATION_UPDATED'
  | 'AUTOMATION_ENABLED'
  | 'AUTOMATION_PAUSED'
  | 'AUTOMATION_RESUMED'
  | 'AUTOMATION_EXECUTION_STARTED'
  | 'AUTOMATION_EXECUTION_COMPLETED'
  | 'AUTOMATION_EXECUTION_FAILED'
  | 'AUTOMATION_EXECUTION_RETRIED'
  | 'AUTOMATION_LOOP_BLOCKED'
  | 'AUTOMATION_WORKFLOW_CREATED'
  | 'AUTOMATION_WORKFLOW_UPDATED'
  | 'AUTOMATION_WORKFLOW_DELETED'
  | 'AUTOMATION_EXECUTED'
  | 'INSIGHTS_VIEWED'
  | 'INSIGHTS_EXPORT_CREATED'
  | 'ADVANCED_ANALYTICS_ACCESSED'
  | 'COMMUNITY_HEALTH_VIEWED'
  | 'AI_QUERY_EXECUTED'
  | 'AI_ACTION_PLANNED'
  | 'AI_SAFETY_VIOLATION'
  | 'AI_PROMPT_INJECTION_BLOCKED'
  | 'AI_SECRET_REDACTION'
  | 'AI_UNSAFE_REQUEST_BLOCKED'
  | 'AI_CONTEXT_BOUNDARY_VIOLATION'
  | 'AI_OUTPUT_VALIDATION_FAILED'
  | 'AI_RECOMMENDATIONS_GENERATED'
  | 'AI_ACTION_PREVIEW_CREATED'
  | 'AI_ACTION_CONFIRMED'
  | 'AI_ACTION_EXECUTED'
  | 'AI_ACTION_FAILED'
  | 'AI_ACTION_BLOCKED'
  | 'AI_ACTION_PERMISSION_DENIED'
  | 'AI_QUOTA_CHECKED'
  | 'AI_QUOTA_EXCEEDED'
  | 'AI_RATE_LIMITED'
  | 'AI_FEATURE_BLOCKED'
  | 'AI_REPORT_EXPORTED'
  | 'WORKSPACE_CREATED'
  | 'WORKSPACE_UPDATED'
  | 'WORKSPACE_MEMBER_INVITED'
  | 'WORKSPACE_MEMBER_ACCEPTED'
  | 'WORKSPACE_MEMBER_ROLE_CHANGED'
  | 'WORKSPACE_MEMBER_REMOVED'
  | 'WORKSPACE_OWNER_CHANGED'
  | 'WORKSPACE_COMMUNITY_ADDED'
  | 'WORKSPACE_COMMUNITY_REMOVED'
  | 'WORKSPACE_DELETION_REQUESTED'
  | 'WORKSPACE_DELETION_SCHEDULED'
  | 'WORKSPACE_DELETION_CANCELLED'
  | 'WORKSPACE_DELETED'
  | 'SUBSCRIPTION_CREATED'
  | 'SUBSCRIPTION_UPDATED'
  | 'SUBSCRIPTION_ACTIVATED'
  | 'SUBSCRIPTION_PAST_DUE'
  | 'SUBSCRIPTION_CANCELLED'
  | 'SUBSCRIPTION_EXPIRED'
  | 'PLAN_CHANGE_REQUESTED'
  | 'PLAN_CHANGE_CONFIRMED'
  | 'PLAN_CHANGE_FAILED'
  | 'BILLING_WEBHOOK_RECEIVED'
  | 'BILLING_WEBHOOK_REJECTED'
  | 'INVOICE_CREATED'
  | 'INVOICE_PAYMENT_FAILED'
  | 'SYSTEM_INCIDENT_RECORDED'
  | 'SYSTEM_INCIDENT_RESOLVED'
  // Task 86: Integration Engine Audit Actions
  | 'INTEGRATION_CONNECTED'
  | 'INTEGRATION_DISCONNECTED'
  | 'INTEGRATION_RECONNECTED'
  | 'INTEGRATION_HEALTH_CHECKED'
  | 'INTEGRATION_REAUTH_REQUIRED'
  | 'INTEGRATION_SYNC_STARTED'
  | 'INTEGRATION_SYNC_COMPLETED'
  | 'INTEGRATION_SYNC_PARTIAL'
  | 'INTEGRATION_SYNC_FAILED'
  // Task 87: Settings & Configuration Control Plane Audit Actions
  | 'SETTING_CREATED'
  | 'SETTING_UPDATED'
  | 'SETTING_RESET'
  | 'SETTING_VALIDATION_FAILED'
  | 'COMMUNITY_SETTINGS_UPDATED'
  | 'PERMISSION_SETTINGS_UPDATED'
  | 'RECRUITMENT_SETTINGS_UPDATED'
  | 'NOTIFICATION_SETTINGS_UPDATED'
  | 'SECURITY_SETTINGS_UPDATED'
  // Task 89: Global Search & Command Center Audit Action
  | 'COMMAND_EXECUTED'
  // Task 91: Notification Center & Unified Alerts Engine Audit Actions
  | 'NOTIFICATION_CREATED'
  | 'NOTIFICATION_DELIVERY_FAILED'
  | 'NOTIFICATION_SECURITY_BLOCKED'
  | 'NOTIFICATION_PREFERENCE_UPDATED'
  // Task 137: Production Go-Live Control & Release Handoff Audit Actions
  | 'RELEASE_VALIDATION_STARTED'
  | 'RELEASE_VALIDATION_COMPLETED'
  | 'RELEASE_GATE_BLOCKED'
  | 'RELEASE_EXTERNAL_VERIFICATION_STARTED'
  | 'RELEASE_EXTERNAL_VERIFICATION_COMPLETED'
  | 'RELEASE_HANDOFF_CREATED'
  | 'POST_RELEASE_VALIDATION_STARTED'
  | 'POST_RELEASE_VALIDATION_COMPLETED'
  | 'ROLLBACK_READINESS_CHECKED'
  // Task 170: Player-Wise Recruitment Progress Board & Referral Rewards Audit Actions
  | 'PROGRESS_BOARD_CONFIG_UPDATED'
  | 'PLAYER_PROGRESS_MESSAGE_CREATED'
  | 'PLAYER_PROGRESS_MESSAGE_UPDATED'
  | 'PLAYER_PROGRESS_SYNC_FAILED'
  | 'RECRUITMENT_INVITE_CREDITED'
  | 'RECRUITMENT_INVITE_REVERSED'
  | 'RECRUITER_REWARD_ADJUSTED'
  | 'RECRUITER_REWARD_REDEEMED'
  | 'RECRUITER_REWARD_CLAIMED'
  | 'PROGRESS_BOARD_RECONCILED';

export * from './recruitmentProgress.js';

export type SubscriptionStatus =
  | 'NOT_CONFIGURED'
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'PAUSED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'PAYMENT_FAILED';

export type BillingStatus =
  | 'NOT_CONFIGURED'
  | 'PENDING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'REFUNDED';

export type PlanChangeStatus = 'REQUESTED' | 'PROVIDER_PENDING' | 'CONFIRMED' | 'APPLIED';

export interface PendingPlanChange {
  targetPlan: 'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
  status: PlanChangeStatus;
  requestedAt: string;
  confirmedAt?: string;
  appliedAt?: string;
}

export interface SubscriptionDocument {
  id: string;
  workspaceId: string;
  plan: 'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
  status: SubscriptionStatus;
  billingProvider: string;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  trialEndsAt?: string;
  gracePeriodEndsAt?: string;
  pendingPlanChange?: PendingPlanChange;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceDocument {
  id: string;
  workspaceId: string;
  subscriptionId: string;
  providerInvoiceId?: string;
  amount: number;
  currency: string;
  status: BillingStatus;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

export interface WebhookEventDocument {
  id: string;
  providerEventId: string;
  provider: string;
  eventType: string;
  payload: Record<string, any>;
  status: 'PROCESSED' | 'FAILED' | 'REJECTED';
  errorMessage?: string;
  processedAt?: string;
  createdAt: string;
}

export type WorkspaceRole = 'WORKSPACE_OWNER' | 'WORKSPACE_ADMIN' | 'WORKSPACE_MEMBER';

export type WorkspaceStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETION_REQUESTED' | 'SCHEDULED_FOR_DELETION';

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

export interface WorkspaceDocument {
  id: string;
  name: string;
  ownerUserId: string;
  communityIds: string[];
  status: WorkspaceStatus;
  deletionScheduledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceMemberDocument {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  allowedCommunityIds?: string[];
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceInvitationDocument {
  id: string;
  workspaceId: string;
  invitedEmail: string;
  invitedIdentity?: string;
  role: WorkspaceRole;
  allowedCommunityIds?: string[];
  status: InvitationStatus;
  expiresAt: string;
  createdBy: string;
  createdAt: string;
  acceptedAt?: string;
  revokedAt?: string;
}

// 1. User
export interface UserDocument {
  id: string;
  discordId?: string;
  username: string;
  discriminator?: string;
  avatarUrl?: string;
  email?: string;
  globalRole: UserRole;
  createdAt: string;
  lastLoginAt: string;
}

// 2. Community
export interface CommunityDocument {
  id: string;
  workspaceId?: string;
  guildId: string; // Discord Guild ID
  discordGuildId?: string;
  tier?: string;
  workflowEnabled?: boolean;
  rules?: any;
  guide?: any;
  connectionStatus?: string;
  connectedAt?: string;
  verifiedOwnerDiscordUserId?: string;
  lastVerifiedAt?: string;
  name: string;
  iconUrl?: string;
  ownerUserId: string;
  isActive: boolean;
  setupStatus?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'INCOMPLETE';
  activationStatus?: 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'ACTIVATED';
  activatedAt?: string;
  firstValueCompleted?: boolean;
  firstValueCompletedAt?: string;
  firstValueActionType?: string;
  timezone?: string;
  onboardingCompletedAt?: string;
  lastSyncTimestamp?: string;
  notificationPreferences?: {
    alertsEnabled?: boolean;
    defaultChannelId?: string;
  };
  defaultChannels?: {
    applicationChannelId?: string;
    recruitmentChannelId?: string;
    announcementsChannelId?: string;
  };
  moderationDefaults?: {
    autoModEnabled?: boolean;
    maxWarningsBeforeBan?: number;
  };
  createdAt: string;
  updatedAt: string;
}

// 3. Role Definition
export interface RoleDocument {
  id: string;
  communityId: string;
  name: string;
  type?: UserRole;
  description?: string;
  isCustom?: boolean;
  discordRoleId?: string;
  roleId?: string;
  canonicalRole?: UserRole | string;
  position?: number;
  permissions?: Permission[];
  createdAt?: string;
}

// 4. Permission Assignment
export interface PermissionDocument {
  id: string;
  communityId: string;
  targetUserId: string;
  role: UserRole;
  grantedPermissions: Permission[];
  revokedPermissions: Permission[];
  assignedByUserId: string;
  updatedAt: string;
}

// 5. Application
export interface ApplicationDocument {
  id: string;
  applicationId?: string;
  communityId: string;
  applicantUserId: string;
  applicantDiscordUserId: string;
  applicantDiscordId: string;
  applicantUsernameSnapshot: string;
  applicantUsername: string;
  applicantDisplayNameSnapshot?: string;
  source?: string;
  recruitmentSource?: string;
  sourceId?: string;
  attributionCreatedAt?: string;
  campaignId?: string;
  formId?: string;
  formVersion?: string;
  successfulAt?: string;
  recruiterCode?: string;
  recruiterCodeUsed?: string;
  recruiterDiscordUserId?: string;
  referralId?: string;
  status: ApplicationStatus;
  questions?: Array<{
    questionId: string;
    questionText: string;
    questionType?: QuestionInputType;
    isRequired?: boolean;
    options?: string[];
  }>;
  answers?:
    | Array<{
        questionId: string;
        questionText: string;
        answerText: string;
        answerValues?: string[];
      }>
    | Record<string, any>
    | any;
  missingInformation?: string[];
  aiAnalysis?: {
    confidenceScore?: number;
    recommendation?: 'APPROVE' | 'INTERVIEW' | 'REJECT' | 'MANUAL_REVIEW_REQUIRED';
    cautionSignals?: string[];
    summary?: string;
    missingItems?: string[];
    label: 'AI_ANALYSIS';
  };
  notesSummary?: string;
  reviewerNotes?: string;
  rejectionReason?: string;
  approvalTimestamp?: string;
  joinConfirmedAt?: string;
  aiScreeningScore?: number;
  submittedAt: string;
  createdAt?: string;
  updatedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedByUserId?: string;
  // --- TASK 46: RECRUITMENT INTELLIGENCE & TALENT OPERATIONS ---
  talentPool?: TalentPoolCategory;
  tags?: string[];
  assignedReviewerId?: string;
  assignedReviewerUsername?: string;
  slaTargetMinutes?: number;
  recruitmentScore?: number;
  recruitmentScoreBreakdown?: RecruitmentScoreBreakdown;
  slaStatus?: 'ON_TIME' | 'OVERDUE';
  slaAgeMinutes?: number;
  // --- TASK 51: RECRUITMENT-TO-MEMBER LIFECYCLE & ONBOARDING HANDOFF ---
  handoffId?: string;
  memberActivatedAt?: string;
  firstEngagementAt?: string;
  lifecycleStatus?: 'PENDING' | 'ACTIVATED' | 'ONBOARDING' | 'ENGAGED';
  consentCaptured?: boolean;
  verificationPassed?: boolean;
  approvedBy?: string;
  applicantDiscordUsername?: string;
}

// 6. Application Answer
export interface ApplicationAnswerDocument {
  id: string;
  applicationId: string;
  questionId: string;
  questionText: string;
  answerText: string;
  answerValues?: string[];
  submittedAt: string;
}

// 7. Interview
export type InterviewStatus =
  | 'NOT_REQUIRED'
  | 'REQUIRED'
  | 'PENDING'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export interface InterviewDocument {
  id: string;
  interviewId?: string;
  communityId: string;
  applicationId: string;
  applicantDiscordUserId?: string;
  applicantDiscordId: string;
  candidateDiscordId?: string;
  candidateName?: string;
  interviewerUserId: string;
  interviewerDiscordUserId?: string;
  googleCalendarEventId?: string;
  googleCalendarEventLink?: string;
  scheduledTime?: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  status: InterviewStatus;
  questions?: Array<{
    questionId: string;
    questionText: string;
    questionType: QuestionInputType;
  }>;
  answers?: Array<{
    questionId: string;
    questionText: string;
    answerText: string;
  }>;
  notes?: string;
  transcriptSummary?: string;
  sentimentNotes?: string;
  discordChannelId?: string;
  discordThreadId?: string;
  participants?: InterviewParticipant[];
  sessionId?: string;
  introductionConfig?: InterviewIntroductionConfig;
  createdAt?: string;
  updatedAt?: string;
}

export type InterviewSessionStatus =
  | 'WAITING'
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'ESCALATED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CLOSED';

export interface InterviewParticipant {
  userId: string;
  discordUserId: string;
  username: string;
  displayName?: string;
  role: UserRole;
  joinedAt: string;
  isActive: boolean;
  leftAt?: string;
  introductionMessage?: string;
  introductionSent?: boolean;
}

export interface InterviewIntroductionConfig {
  communityDefault?: string;
  communityDefaultTemplate?: string;
  roleDefaults?: Partial<Record<UserRole, string>>;
  userSpecific?: Record<string, string>; // discordUserId -> intro message
}

export interface InterviewSessionDocument {
  id: string;
  sessionId?: string;
  interviewId?: string;
  applicationId: string;
  candidateId: string; // applicant Discord User ID
  communityId: string;
  guildId: string;
  channelId?: string;
  threadId?: string;
  status: InterviewSessionStatus;
  startedAt: string;
  participants: InterviewParticipant[];
  workflowStage?: string;
  consentStatus?: string;
  onboardingStatus?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// 8. Recruiter
export type RecruiterStatus = 'ACTIVE' | 'PAUSED' | 'SUSPENDED' | 'INACTIVE';
export type RecruiterRole = 'RECRUITER' | 'SENIOR_RECRUITER' | 'REVIEWER' | 'INTERVIEWER' | 'RECRUITMENT_MANAGER';

export interface RecruiterDocument {
  id: string;
  workspaceId?: string;
  communityId: string;
  name?: string;
  discordUserId?: string;
  displayNameSnapshot?: string;
  displayName?: string;
  status?: RecruiterStatus;
  role?: RecruiterRole;
  recruiterCode?: string;
  joinedAt: string;
  lastActiveAt?: string;
  createdAt?: string;
  updatedAt?: string;

  // Legacy fields preserved for backward compatibility
  userId?: string;
  discordId?: string;
  username?: string;
  totalReferrals?: number;
  successfulRecruits?: number;
  isActive?: boolean;
}

// 9. Recruiter Code
export type RecruiterCodeStatus = 'ACTIVE' | 'INACTIVE' | 'REVOKED';

export interface RecruiterCodeDocument {
  id: string;
  communityId: string;
  recruiterUserId: string;
  code: string;
  status?: RecruiterCodeStatus;
  usesRemaining?: number;
  totalUses: number;
  isActive: boolean;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt?: string;
}

// 10. Referral
export type ReferralStatus = 'ACTIVE' | 'PAUSED' | 'EXPIRED' | 'REVOKED' | 'PENDING' | 'CONVERTED';

export interface ReferralDocument {
  id: string;
  workspaceId: string;
  communityId: string;
  recruiterId: string;
  code: string;
  source: string;
  campaignId?: string;
  createdAt: string;
  expiresAt?: string;
  status: ReferralStatus;

  // Legacy fields preserved for backward compatibility
  recruiterCodeId?: string;
  recruiterUserId?: string;
  referredUserId?: string;
  applicationId?: string;
  convertedAt?: string;
}

export type RewardType = 'ROLE' | 'BENEFIT' | 'POINTS' | 'BONUS';

export interface RecruitmentReward {
  id: string;
  workspaceId: string;
  communityId: string;
  source: string;
  reason: string;
  candidateId?: string;
  applicationId: string;
  recruiterId: string;
  status: 'PENDING' | 'ISSUED' | 'FAILED';
  rewardType: RewardType;
  createdAt: string;
  updatedAt?: string;
}

export type GoalStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'REACHED' | 'EXPIRED';
export type GoalTargetType = 'APPLICATIONS' | 'INTERVIEWS' | 'JOINS' | 'RECRUITMENT_SUCCESS';

export interface RecruiterGoal {
  id: string;
  workspaceId: string;
  communityId: string;
  recruiterId: string;
  targetType: GoalTargetType;
  targetValue: number;
  currentValue: number;
  status: GoalStatus;
  startAt: string;
  endAt: string;
  createdAt: string;
  updatedAt?: string;
}

// 11. Notification
export interface NotificationDocument {
  id: string;
  communityId: string;
  recipientUserId: string;
  recipientDiscordId?: string;
  recipientType?: 'USER' | 'ROLE' | 'COMMUNITY' | 'PLATFORM_OWNER';
  recipientRole?: string;
  category?: 'RECRUITMENT' | 'ENGAGEMENT' | 'MODERATION' | 'EVENTS' | 'AUTOMATION' | 'INTEGRATIONS' | 'SECURITY' | 'SYSTEM' | 'INSIGHTS' | 'PLATFORM';
  type: NotificationType | string;
  priority?: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';
  policy?: 'REQUIRED' | 'OPTIONAL';
  channel: NotificationChannel | string;
  deliveryStatus?: 'PENDING' | 'PROCESSING' | 'DELIVERED' | 'FAILED' | 'RETRYABLE' | 'CANCELLED' | 'NOT_CONFIGURED' | 'PERMISSION_REQUIRED' | 'RATE_LIMITED';
  deliveryError?: string;
  title: string;
  body: string;
  resourceType?: string;
  resourceId?: string;
  route?: string;
  read: boolean;
  status?: 'UNREAD' | 'READ' | 'ARCHIVED' | 'EXPIRED';
  readAt?: string;
  archivedAt?: string;
  expiresAt?: string;
  communityName?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string;
}

// 12. Community Configuration Document
export type CommunityConfigurationDocument = CommunityConfiguration;

// 13. Reward
export interface RewardDocument {
  id: string;
  communityId: string;
  recruiterUserId: string;
  tierName: string;
  pointsEarned: number;
  description: string;
  claimed: boolean;
  createdAt: string;
}

// 14. Audit Log
export interface AuditLogDocument {
  id: string;
  auditId?: string;
  communityId: string;
  guildId?: string;
  actorUserId: string;
  discordUserId?: string;
  actorRole: UserRole;
  effectiveRole?: UserRole;
  action: AuditAction;
  targetType: string;
  targetId: string;
  previousState?: any;
  newState?: any;
  source?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  ipAddressIfAvailable?: string;
  expiresAt?: string;
}

// 15. System Settings
export interface SystemSettingsDocument {
  id: string;
  freeModeEnabled: boolean;
  maxAiRequestsPerDay: number;
  maxApplicationsPerDay: number;
  maxSheetWritesPerDay: number;
  maxAiTokensPerRequest: number;
  maintenanceMode: boolean;
  updatedAt: string;
}

// ==========================================
// PLATFORM LEVEL MODELS (TASK 1.5)
// ==========================================

export type PlatformServerStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'SUSPENDED'
  | 'CONFIGURATION_REQUIRED'
  | 'ERROR';

export type PlatformBotStatus = 'CONNECTED' | 'DISCONNECTED' | 'UNCONFIGURED';

export type PlatformConfigStatus = 'CONFIGURED' | 'INCOMPLETE' | 'PENDING';

export type PlatformFeedbackCategory =
  | 'FEEDBACK'
  | 'FEATURE_SUGGESTION'
  | 'BUG_REPORT'
  | 'IMPROVEMENT_REQUEST'
  | 'PROBLEM_REPORT';

export type FeedbackCategory = PlatformFeedbackCategory;

export type PlatformFeedbackStatus =
  | 'NEW'
  | 'UNDER_REVIEW'
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'RESOLVED'
  | 'CLOSED'
  | 'DECLINED';

export type FeedbackStatus = PlatformFeedbackStatus;

export type PlatformFeedbackPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type FeedbackPriority = PlatformFeedbackPriority;

export type PlatformAuditAction =
  | 'SERVER_INSTALLED'
  | 'SERVER_REMOVED'
  | 'SERVER_SUSPENDED'
  | 'SERVER_ACTIVATED'
  | 'PLATFORM_SETTINGS_CHANGED'
  | 'PLATFORM_AUTH_EVENT'
  | 'PERMISSION_CHANGED'
  | 'SECURITY_EVENT'
  | 'INTEGRATION_CONFIG_CHANGED'
  | 'ADMIN_ACTION';

// 16. Platform Server
export interface PlatformServer {
  id: string; // communityId
  guildId: string;
  name: string;
  ownerUserId: string;
  ownerDiscordTag?: string;
  installedAt: string;
  lastActivityAt: string;
  memberCount?: number;
  applicationCount: number;
  recruiterCount: number;
  status: PlatformServerStatus;
  botStatus: PlatformBotStatus;
  configurationStatus: PlatformConfigStatus;
}

// 17. Platform User
export interface PlatformUser {
  id: string; // userId
  discordId: string;
  username: string;
  globalRole: UserRole;
  firstSeenAt: string;
  lastActiveAt: string;
  communitiesUsed: string[];
  applicationCount: number;
  isRecruiter: boolean;
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
}

// 18. Platform Owner Claim
export interface PlatformOwnerClaim {
  id: string;
  claimedUserId: string;
  claimMethod: 'SETUP_KEY' | 'CONFIG' | 'SESSION';
  verifiedAt: string;
  isRevoked: boolean;
}

// 19. Bot Installation
export interface BotInstallation {
  id: string;
  communityId: string;
  guildId: string;
  installedAt: string;
  permissionsBitfield?: string;
  status: 'INSTALLED' | 'INVITED' | 'REMOVED';
}

// 20. Platform Usage Metric
export interface PlatformUsageMetric {
  id: string;
  communityId?: string; // Optional: empty if aggregated platform-wide
  date: string;
  dailyActiveUsers: number;
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  applicationsSubmitted: number;
  applicationsApproved: number;
  applicationsRejected: number;
  applicationsPending: number;
  recruiterActivityCount: number;
  referralCount: number;
  aiRequestsCount: number;
  aiQuotaUsed: number;
  spreadsheetSyncCount: number;
  notificationCount: number;
  errorCount: number;
}

// 21. Platform Feedback
export interface PlatformFeedback {
  id: string;
  userId: string;
  submittedByUserId?: string;
  communityId?: string;
  workspaceId?: string;
  category: PlatformFeedbackCategory;
  title: string;
  description: string;
  message?: string;
  priority: PlatformFeedbackPriority;
  status: PlatformFeedbackStatus;
  correlationId?: string;
  createdAt: string;
  updatedAt: string;
  adminNotes?: string;
}

// 22. Platform Setting
export interface PlatformSetting {
  id: string;
  freeModeEnabled: boolean;
  maxAiRequestsPerDay: number;
  maxApplicationsPerDay: number;
  maxSheetWritesPerDay: number;
  maxAiTokensPerRequest: number;
  maintenanceMode: boolean;
  featureFlags: Record<string, boolean>;
  platformNotificationWebhook?: string;
  updatedAt: string;
}

// 23. Platform Audit Event
export interface PlatformAuditEvent {
  id: string;
  actorUserId: string;
  actorRole: UserRole;
  action: PlatformAuditAction;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  ipAddressIfAvailable?: string;
}

// ==========================================
// TASK 1.7 - TRUST, RECRUITMENT, BLACKLIST & DISCORD-NATIVE MODELS
// ==========================================

export type DiscordCapabilityStatus =
  | 'AVAILABLE'
  | 'CONNECTED'
  | 'NOT_CONFIGURED'
  | 'PERMISSION_REQUIRED'
  | 'DISCORD_LIMITATION'
  | 'AUTHENTICATION_REQUIRED'
  | 'FAILED'
  | 'MANUAL_ACTION_REQUIRED';

// 24. Community Channel Access
export type ChannelPurpose =
  | 'APPLICATION'
  | 'RECRUITMENT'
  | 'INTERVIEW'
  | 'SUPPORT'
  | 'BLACKLIST'
  | 'ANNOUNCEMENTS'
  | 'RECRUITER_RECORD'
  | 'OTHER';

// Task 9 - Recruiter Record & Benefit Claim Lifecycle Models
export type RecruiterBenefitStatus =
  | 'NOT_REQUIRED'
  | 'PENDING'
  | 'CLAIMABLE'
  | 'CLAIMED'
  | 'FULFILLED'
  | 'FAILED'
  | 'PERMISSION_REQUIRED'
  | 'NOT_CONFIGURED';

export type MessageUpdateMode = 'SEND_FOLLOW_UP_MESSAGE' | 'EDIT_OR_UPDATE_ORIGINAL_MESSAGE';

export interface RecruiterRecordDocument {
  id: string; // recruiterRecordId
  communityId: string;

  recruiterDiscordUserId: string;
  recruiterUsernameSnapshot: string;
  recruiterDisplayNameSnapshot?: string;

  recruiterCode: string;
  recruiterCodeStatus?: 'ACTIVE' | 'INACTIVE' | 'REVOKED';

  applicantDiscordUserId: string;
  applicantUsernameSnapshot: string;
  applicantDisplayNameSnapshot?: string;

  applicationId: string;
  applicationStatus: ApplicationStatus;

  referralId?: string;
  joinedAt?: string;
  recruitmentSuccessfulAt: string;

  benefitConfigurationSnapshot?: Record<string, unknown>;
  plannedBenefit: string;
  plannedBenefitCount: number;
  benefitStatus: RecruiterBenefitStatus;

  benefitClaimedByDiscordUserId?: string;
  benefitClaimedByUsernameSnapshot?: string;
  benefitClaimedAt?: string;
  benefitClaimReference?: string;

  recordChannelId?: string;
  initialRecordMessageId?: string;
  benefitClaimedMessageId?: string;

  messageStatus: 'NOT_SENT' | 'SENT' | 'EDITED' | 'FAILED' | 'SKIPPED' | 'PERMISSION_REQUIRED';
  followUpMessageStatus?: 'NOT_SENT' | 'SENT' | 'EDITED' | 'FAILED' | 'SKIPPED' | 'PERMISSION_REQUIRED';

  idempotencyKey?: string;

  createdAt: string;
  updatedAt: string;
}

export interface RecruiterRecordConfiguration {
  id: string;
  communityId: string;
  enabled: boolean;
  channelId?: string;
  channelName?: string;
  channelPurpose?: ChannelPurpose;
  initialMessageTemplate: string;
  claimedMessageTemplate: string;
  mentionRecruiter: boolean;
  showApplicantName: boolean;
  showRecruiterCode: boolean;
  showApplicationStatus: boolean;
  showBenefit: boolean;
  showBenefitCount: boolean;
  showBenefitStatus: boolean;
  showRemainingPending: boolean;
  messageUpdateMode: MessageUpdateMode;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityChannelAccess {
  id: string;
  communityId: string;
  channelId: string;
  channelNameSnapshot: string;
  purpose: ChannelPurpose;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// 25. Recruiter Benefits & Rewards
export type RecruiterRewardType =
  | 'DISCORD_ROLE'
  | 'POINTS'
  | 'XP'
  | 'RECOGNITION'
  | 'CUSTOM_PERK'
  | 'SPECIAL_CHANNEL'
  | 'GIVEAWAY_ENTRY'
  | 'CUSTOM_TEXT';

export type FulfillmentType = 'AUTOMATIC' | 'MANUAL';

export interface RecruiterBenefit {
  id: string;
  communityId: string;
  name: string;
  description: string;
  threshold: number;
  rewardType: RecruiterRewardType;
  discordRoleId?: string;
  discordRoleNameSnapshot?: string;
  customPerkDetails?: string;
  fulfillmentType: FulfillmentType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// 26. Referral Lifecycle Tracking
export type ReferralLifecycleStatus =
  | 'REFERRED'
  | 'APPLICATION_SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ADDITIONAL_INFO_REQUIRED'
  | 'INTERVIEW_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'JOINED'
  | 'RECRUITMENT_SUCCESSFUL'
  | 'RESTRICTED'
  | 'CANCELLED';

export interface ReferralLifecycleRecord {
  id: string;
  communityId: string;
  recruiterUserId: string;
  recruiterDiscordId: string;
  recruiterCode: string;
  applicantUserId: string;
  applicantDiscordId: string;
  applicantUsernameSnapshot: string;
  applicationId: string;
  lifecycleStatus: ReferralLifecycleStatus;
  approvedAt?: string;
  joinedAt?: string;
  successfulRecruitmentConfirmedAt?: string;
  benefitsEvaluated: boolean;
  benefitsGranted: string[];
  benefitFulfillmentStatus: DiscordCapabilityStatus;
  createdAt: string;
  updatedAt: string;
}

// 27. Recruiter Notification History
export type NotificationDeliveryStatus = 'PENDING' | 'DELIVERED' | 'FAILED' | 'SKIPPED';

export interface RecruiterNotificationHistory {
  id: string;
  communityId: string;
  recipientUserId: string;
  recipientDiscordId: string;
  relatedReferralId?: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  status: NotificationDeliveryStatus;
  deliveredAt?: string;
  failureReason?: string;
  createdAt: string;
}

// 28. Applicant Restriction (Blacklist & Aliases)
export type RestrictionStatus = 'CLEAR' | 'CAUTION' | 'BLACKLISTED' | 'DO_NOT_REAPPLY';

export interface ApplicantRestriction {
  id: string;
  communityId: string;
  discordUserId: string; // Authoritative primary ID
  currentUsernameSnapshot: string;
  displayNameSnapshot?: string;
  serverNicknameSnapshot?: string;
  gameNameAliases: string[];
  status: RestrictionStatus;
  reason: string;
  evidenceNotes?: string;
  enforcedInDiscord: boolean;
  discordEnforcementStatus: DiscordCapabilityStatus;
  discordEnforcementError?: string;
  addedBy?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

// 29. Configurable Application & Interview Questions
export type QuestionInputType =
  | 'SHORT_TEXT'
  | 'LONG_TEXT'
  | 'SINGLE_SELECT'
  | 'MULTI_SELECT'
  | 'YES_NO';

export interface ApplicationQuestion {
  id: string;
  communityId: string;
  questionText: string;
  type: QuestionInputType;
  options?: string[];
  required: boolean;
  order: number;
  enabled: boolean;
  guidance?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewQuestion {
  id: string;
  communityId: string;
  stageName: string;
  questionText: string;
  scoringCriteria?: string;
  required: boolean;
  order: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityGuideline {
  id: string;
  communityId: string;
  title: string;
  category: 'RULE' | 'REQUIREMENT' | 'STANDARDS' | 'DISQUALIFYING' | 'ONBOARDING';
  description: string;
  order: number;
  enabled: boolean;
}

// 30. Google Sheets Sync State & Config
export interface GoogleSheetsConfig {
  id: string;
  communityId: string;
  enabled: boolean;
  configured: boolean;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  sheetName?: string;
  autoSyncEnabled: boolean;
  columnMappings: {
    discordUserIdCol: string;
    applicationIdCol: string;
    recruiterCodeCol: string;
    recruiterUserIdCol: string;
    statusCol: string;
    createdAtCol: string;
  };
  lastSyncStatus: IntegrationStatus | DiscordCapabilityStatus;
  lastSyncTime?: string;
  recordsProcessed?: number;
  recordsSucceeded?: number;
  recordsFailed?: number;
  lastSyncError?: string;
}

// 31. Discord Capability & Permission Check
export interface DiscordBotPermissionCheck {
  permissionName: string;
  requiredFor: string;
  granted: boolean;
  status: DiscordCapabilityStatus;
  resolutionGuidance: string;
}

// ==========================================
// TASK 4 - WELCOME, ONBOARDING & ROLE ASSIGNMENT
// ==========================================

export type InterviewMode = 'NO_INTERVIEW' | 'OPTIONAL_INTERVIEW' | 'REQUIRED_INTERVIEW';

export type WelcomeMessageType = 'PERSONAL_DM' | 'SERVER_WELCOME';

export type WelcomeDeliveryStatus =
  | 'PENDING'
  | 'SENT'
  | 'FAILED'
  | 'SKIPPED'
  | 'NOT_CONFIGURED'
  | 'PERMISSION_REQUIRED';

export type RoleAssignmentStatus =
  | 'ROLE_ASSIGNED'
  | 'ROLE_ASSIGNMENT_FAILED'
  | 'ROLE_NOT_FOUND'
  | 'ROLE_HIERARCHY_BLOCKED'
  | 'PERMISSION_REQUIRED'
  | 'SKIPPED'
  | 'NOT_CONFIGURED';

export interface WelcomeOnboardingConfig {
  id: string;
  communityId: string;
  personalWelcomeMessage: string;
  serverWelcomeMessage: string;
  welcomeChannelId?: string;
  welcomeChannelNameSnapshot?: string;
  /** Where the server's rules are posted (shown to new members and linked in messages). */
  rulesChannelId?: string;
  newMemberRoleId?: string;
  newMemberRoleNameSnapshot?: string;
  enablePersonalDm: boolean;
  enableServerWelcome: boolean;
  enableAutoRoleAssignment: boolean;
  interviewMode: InterviewMode;
  rulesAcknowledgementEnabled?: boolean;
  communityRulesText?: string;
  rulesVersion?: string;
  reapplicationCooldownHours?: number;
  onboardingInstructions?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WelcomeAuditRecord {
  id: string;
  welcomeEventId: string;
  communityId: string;
  memberDiscordUserId: string;
  channelId?: string;
  roleId?: string;
  messageType: WelcomeMessageType | 'ROLE_ASSIGNMENT';
  status: WelcomeDeliveryStatus | RoleAssignmentStatus;
  failureReason?: string;
  createdAt: string;
}

export interface RulesAcknowledgementRecord {
  id: string;
  communityId: string;
  discordUserId: string;
  rulesVersion?: string;
  acknowledgedAt: string;
  createdAt: string;
}

export interface MemberJourneyStatus {
  communityId: string;
  discordUserId: string;
  isMember: boolean;
  applicationStatus?: ApplicationStatus;
  applicationId?: string;
  roleAssignmentStatus: RoleAssignmentStatus;
  roleId?: string;
  personalDmStatus: WelcomeDeliveryStatus;
  serverWelcomeStatus: WelcomeDeliveryStatus;
  rulesAcknowledgementStatus: 'ACKNOWLEDGED' | 'NOT_REQUIRED' | 'PENDING';
  rulesAcknowledgedAt?: string;
  recruiterAttribution?: {
    recruiterCode?: string;
    recruiterDiscordId?: string;
    recruiterName?: string;
    referralStatus?: ReferralLifecycleStatus;
  };
  journeyState: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'REJECTED';
}

export type OnboardingOperationType = 'ROLE_ASSIGNMENT' | 'WELCOME_DM' | 'WELCOME_CHANNEL' | 'RULES_ACKNOWLEDGEMENT';
export type OnboardingOperationStatus = 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'NOT_CONFIGURED' | 'PERMISSION_REQUIRED';

export interface OnboardingOperation {
  id: string;
  communityId: string;
  applicantDiscordUserId: string;
  applicationId?: string;
  operationType: OnboardingOperationType;
  status: OnboardingOperationStatus;
  attempts: number;
  lastAttemptAt?: string;
  failureReason?: string;
  resultDetails?: string;
  createdAt: string;
  updatedAt: string;
}

// Task 7 Integration Models
export type IntegrationProvider = 'GOOGLE_FORMS' | 'GOOGLE_CALENDAR' | 'GOOGLE_SHEETS' | 'DISCORD' | 'FIREBASE';

export type IntegrationStatus =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED'
  | 'CONNECTED'
  | 'SYNCING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'PERMISSION_REQUIRED'
  | 'DISCONNECTED';

export type GoogleOAuthState =
  | 'NOT_CONNECTED'
  | 'AUTHORIZATION_REQUIRED'
  | 'CONNECTED'
  | 'TOKEN_EXPIRED'
  | 'REAUTH_REQUIRED'
  | 'FAILED';

export interface GoogleFormsConfig {
  id: string;
  communityId: string;
  formId: string;
  formTitleSnapshot?: string;
  enabled: boolean;
  mappingVersion?: string;
  lastSyncAt?: string;
  lastSyncStatus?: IntegrationStatus;
  lastSyncError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoogleCalendarConfig {
  id: string;
  communityId: string;
  calendarId: string;
  calendarTitleSnapshot?: string;
  timezone?: string;
  enabled: boolean;
  status?: IntegrationStatus;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export type CalendarSetupPreference = 'NEVER_CONFIGURED' | 'SKIPPED' | 'CONNECTED';
export type CalendarConnectionStatus =
  | 'NEVER_CONFIGURED'
  | 'SKIPPED'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'REAUTH_REQUIRED'
  | 'ERROR';

export interface UserCalendarConfigDocument {
  id: string; // e.g., `cal_usr_${userId}`
  userId: string;
  communityId?: string;
  googleAccountId?: string;
  calendarId: string;
  calendarTitleSnapshot?: string;
  timezone?: string;
  preference: CalendarSetupPreference;
  status: CalendarConnectionStatus;
  connectedAt?: string;
  lastSyncAt?: string;
  lastError?: string;
  preferenceVersion?: number;
  role?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationEventRecord {
  id: string;
  eventId: string;
  provider: IntegrationProvider;
  eventType: string;
  communityId: string;
  externalResourceId?: string;
  externalEventId?: string;
  status: 'RECEIVED' | 'PROCESSED' | 'FAILED' | 'DUPLICATE_SKIPPED' | 'RETRYING';
  receivedAt: string;
  processedAt?: string;
  failureReason?: string;
  retryCount: number;
  correlationId?: string;
}

// Task 11 Models (Discord Authorization, Bot Diagnostics, Member Sync, Member Access)
export type MemberSyncState =
  | 'SYNCING'
  | 'SYNCED'
  | 'PARTIAL'
  | 'FAILED'
  | 'PERMISSION_REQUIRED'
  | 'DISCORD_LIMITATION'
  | 'RETRYABLE'
  | 'SYNC_REQUIRED'
  | 'STALE'
  | 'DISCONNECTED';

export type AttributionType = 'DIRECT' | 'MANUAL' | 'HISTORICAL';

export interface DiscordMemberDocument {
  id: string;
  communityId: string;
  discordGuildId: string;
  discordUserId: string;
  usernameSnapshot: string;
  displayNameSnapshot: string;
  nicknameSnapshot?: string;
  avatarSnapshot?: string;
  discordRoleIds: string[];
  joinedAt?: string;
  syncedAt: string;
  source: 'DISCORD_SYNC' | 'MANUAL_ADD' | 'BULK_IMPORT';
  recruiterCode?: string;
  recruiterUserId?: string;
  attributionType?: AttributionType;
  membershipStatus: 'ACTIVE' | 'LEFT' | 'BANNED' | 'UNKNOWN';
  syncState: MemberSyncState;
}

export interface CommunityMemberAccessDocument {
  id: string;
  communityId: string;
  discordUserId: string;
  role: UserRole;
  permissions?: Permission[];
  source: 'DISCORD_GUILD_OWNER' | 'DISCORD_ADMIN' | 'MANUAL_ASSIGNMENT' | 'MANUAL_OVERRIDE' | string;
  discordRoleIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DiscordOAuthSession {
  id: string;
  sessionId?: string;
  discordUserId: string;
  username: string;
  globalName?: string;
  avatar?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scopes: string[];
  authenticatedAt: string;
  createdAt?: string;
  updatedAt?: string;
  revokedAt?: string;
  guilds?: Array<{ id: string; owner: boolean; permissions: string }>;
  reauthRequired?: boolean;
}

export interface DiscordConnectionIntent {
  id: string; // connectionIntentId
  connectionIntentId: string;
  authenticatedDiscordUserId: string;
  guildId: string;
  communityId?: string;
  createdAt: string;
  expiresAt: string;
  status: 'PENDING' | 'INSTALLING' | 'BOT_DETECTED' | 'VERIFYING' | 'CONNECTED' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
  failureReason?: string;
  updatedAt: string;
}

export interface DiscordPermissionDiagnostics {
  connected: boolean;
  botInstalled: boolean;
  guildVerified: boolean;
  channelsReady: boolean;
  rolesReady: boolean;
  roleHierarchyValid: boolean;
  commandsRegistered: boolean;
  missingPermissions: string[];
  details?: Record<string, boolean | string>;
}

export const DEFAULT_INITIAL_TEMPLATE = `🎉 **Recruiter Record**

**Recruiter**: {{recruiterMention}}
**Recruiter Code**: {{recruiterCode}}

**New Member Joined**:
{{applicantName}}

**Application**: {{applicationId}}
**Status**: {{applicationStatus}}
**Join Status**: Successfully Joined

**Recruiter Benefit**:
{{benefit}}

**Benefit Status**:
{{benefitStatus}}

**Recruitment Count**:
{{successfulRecruitmentCount}}

**Pending Benefits**:
{{pendingBenefitCount}}

Keep promoting the community and inviting new members! 🚀`;

export const DEFAULT_CLAIMED_TEMPLATE = `✅ **Recruiter Benefit Completed**

**Recruiter**: {{recruiterMention}}
**Recruiter Code**: {{recruiterCode}}

**Recruitment**: {{applicantName}}

**Benefit**:
{{benefit}}

**Status**:
{{benefitStatus}}

**Claimed By**:
{{claimedBy}}

**Claimed At**:
{{claimedAt}}

**Pending Benefits**:
{{pendingBenefitCount}}

Nothing is pending for this recruitment record. ✅`;

export const SUPPORTED_TEMPLATE_VARIABLES = [
  '{{recruiterName}}',
  '{{recruiterMention}}',
  '{{recruiterCode}}',
  '{{applicantName}}',
  '{{applicantMention}}',
  '{{applicationId}}',
  '{{applicationStatus}}',
  '{{benefit}}',
  '{{benefitStatus}}',
  '{{claimedBy}}',
  '{{claimedAt}}',
  '{{successfulRecruitmentCount}}',
  '{{pendingBenefitCount}}',
  '{{joinedAt}}',
  '{{sheetsRowNumber}}',
];

// --- COMMUNITY MANAGER MODULAR MODELS ---

export interface FeatureDefinition {
  id: string;
  key: string;
  module: string;
  displayName: string;
  description: string;
  enabled: boolean;
  defaultAvailability: 'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
  requiredPermissions: string[];
  dependencies?: string[];
  usageMetric?: string;
}

export interface FeatureEntitlement {
  id: string;
  communityId: string;
  featureKey: string;
  enabled: boolean;
  customLimit?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityPlan {
  id: string;
  communityId: string;
  plan: 'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
  subscriptionStatus: 'NOT_CONFIGURED' | 'ACTIVE' | 'PAUSED' | 'CANCELLED';
  billingStatus: 'NOT_CONFIGURED' | 'PAID' | 'UNPAID' | 'TRIAL';
  createdAt: string;
  updatedAt: string;
}

export interface CommunityUsage {
  id: string;
  communityId: string;
  metricKey: string;
  amount: number;
  date: string; // YYYY-MM-DD
  updatedAt: string;
}

export interface Announcement {
  id: string;
  communityId: string;
  title: string;
  content: string;
  channelId: string;
  scheduledAt?: string;
  status: 'DRAFT' | 'SCHEDULED' | 'SENT' | 'FAILED';
  errorDetails?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplate {
  id: string;
  communityId: string;
  name: string;
  content: string;
  variables: string[];
  /** Free-form grouping, e.g. Announcement, Recruitment, Promotion. */
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export type CampaignFrequency = 'ONCE' | 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface Campaign {
  id: string;
  communityId: string;
  name: string;
  /** CHANNEL = post in a channel; ALL / ROLE / MEMBERS = private messages. */
  targetAudience: 'ALL' | 'MEMBERS' | 'RECRUITERS' | 'APPLICANTS' | 'CHANNEL' | 'ROLE';
  channelId?: string;
  roleId?: string;
  memberIds?: string[];
  message: string;
  scheduledAt?: string;
  frequency?: CampaignFrequency;
  /** Every N units of the frequency (e.g. every 2 days). */
  interval?: number;
  endAt?: string;
  maxRuns?: number;
  runCount?: number;
  lastRunAt?: string;
  status: 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'PROCESSING' | 'PAUSED' | 'COMPLETED' | 'FAILED';
  deliveryAuditCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Reminder {
  id: string;
  communityId: string;
  triggerAt: string;
  /** MEMBER = private message to targetUser; CHANNEL = post in channelId. */
  targetType?: 'MEMBER' | 'CHANNEL';
  targetUser: string;
  channelId?: string;
  recurrence?: 'ONCE' | 'DAILY' | 'WEEKLY';
  message: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  createdAt: string;
  updatedAt: string;
}

export interface Poll {
  id: string;
  communityId: string;
  question: string;
  options: string[];
  votes: Record<string, number>;
  votedUserIds: string[];
  channelId: string;
  durationMinutes: number;
  /** Native Discord poll message. */
  messageId?: string;
  endsAt?: string;
  allowMultiselect?: boolean;
  /** What happens when it ends: post the result in the channel, or nothing. */
  afterAction?: 'ANNOUNCE' | 'NONE';
  results?: { text: string; votes: number }[];
  status: 'ACTIVE' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
}

export interface Warning {
  id: string;
  communityId: string;
  discordUserId: string;
  targetUserId?: string;
  reason: string;
  moderatorId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  status: 'ACTIVE' | 'RESOLVED' | 'EXPUNGED';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModerationEvent {
  id: string;
  communityId: string;
  discordUserId: string;
  action: 'WARNING' | 'KICK' | 'BAN' | 'MUTE' | 'AUTO_MOD_BLOCKED';
  reason: string;
  moderatorId: string;
  details?: Record<string, any>;
  createdAt: string;
}

export interface Event {
  id: string;
  communityId: string;
  title: string;
  description: string;
  channelId?: string;
  startAt: string;
  endAt: string;
  timezone: string;
  organizer: string;
  createdBy?: string;
  capacity?: number;
  maxParticipants?: number;
  registrationEnabled: boolean;
  status: 'DRAFT' | 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED' | 'FAILED';
  visibility?: 'COMMUNITY' | 'ROLE_RESTRICTED' | 'PRIVATE';
  googleEventId?: string;
  discordEventId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventRegistration {
  id: string;
  communityId: string;
  eventId: string;
  discordUserId: string;
  username: string;
  status?: 'REGISTERED' | 'WAITLISTED' | 'CANCELLED' | 'ATTENDED' | 'NO_SHOW';
  attended?: boolean;
  attendanceStatus: 'UNKNOWN' | 'ATTENDED' | 'NO_SHOW' | 'PENDING' | 'REGISTERED' | 'CONFIRMED' | 'ABSENT' | 'CANCELLED';
  registeredAt: string;
  cancelledAt?: string;
  source?: string;
  markedBy?: string;
  markedAt?: string;
  updatedAt: string;
}

export interface EventReminder {
  id: string;
  communityId: string;
  eventId: string;
  scheduledExecutionId: string;
  recipientScope: 'ALL_REGISTERED' | 'WAITLISTED' | 'CHANNEL' | 'ROLE';
  channel?: string;
  template: string;
  triggerAt: string;
  reminderType: '24H' | '1H' | '15M' | 'CUSTOM';
  status: 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED' | 'CANCELLED';
  createdAt: string;
  updatedAt: string;
}

export interface AutomationWorkflow {
  id: string;
  communityId: string;
  name: string;
  description?: string;
  enabled: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  trigger: {
    type: string;
    config?: Record<string, any>;
  };
  triggerType: string;
  conditions: Array<{ field: string; operator: string; value: any }>;
  conditionGroup?: 'ALL' | 'ANY';
  actions: Array<{ type: string; config: Record<string, any> }>;
  version: number;
  lastExecutionAt?: string;
  nextExecutionAt?: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'DISABLED' | 'FAILED';
}

export interface AutomationExecution {
  id: string;
  communityId: string;
  workflowId: string;
  workflowVersion: number;
  triggerType: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'SKIPPED' | 'CANCELLED' | 'RETRYABLE';
  errorDetails?: string;
  auditTrail: string[];
  sourceEventId?: string;
  executedAt: string;
  durationMs: number;
  actions: Array<{
    type: string;
    status: 'COMPLETED' | 'FAILED' | 'SKIPPED';
    startedAt: string;
    completedAt: string;
    result?: string;
    error?: string;
  }>;
  createdAt: string;
}

export interface DurableLock {
  id: string;
  communityId: string;
  expiresAt: string;
  acquiredAt: string;
}

export interface Schedule {
  id: string;
  communityId: string;
  name: string;
  resourceType: 'EVENT' | 'CAMPAIGN' | 'AUTOMATION' | 'REMINDER' | 'CUSTOM';
  resourceId: string;
  timezone: string;
  recurrence: 'ONCE' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM_RECURRENCE';
  nextExecutionAt: string;
  lastExecutionAt?: string;
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'FAILED';
  metadata?: Record<string, any>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModerationWarning {
  id: string;
  communityId: string;
  discordUserId: string;
  reason: string;
  moderatorId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  notes?: string;
  expiresAt?: string;
  revokedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModerationRestriction {
  id: string;
  communityId: string;
  targetDiscordUserId: string;
  restrictionType: 'CHANNEL_ACCESS' | 'TIMEOUT' | 'ROLE_REMOVAL' | 'FEATURE_RESTRICTION';
  reason: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  createdBy: string;
  expiresAt?: string;
  revokedBy?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModerationLog {
  id: string;
  communityId: string;
  targetDiscordUserId: string;
  actorDiscordUserId: string;
  action:
    | 'WARNING_CREATED'
    | 'WARNING_REVOKED'
    | 'TIMEOUT_APPLIED'
    | 'TIMEOUT_REMOVED'
    | 'KICK_EXECUTED'
    | 'BAN_EXECUTED'
    | 'BAN_REMOVED'
    | 'MEMBER_BLACKLISTED'
    | 'MEMBER_UNBLACKLISTED'
    | 'RULE_UPDATED'
    | 'AUTOMOD_TRIGGERED'
    | 'AUTOMOD_ACTION_EXECUTED'
    | 'INCIDENT_CREATED'
    | 'INCIDENT_RESOLVED';
  reason: string;
  status: string;
  timestamp: string;
  discordResult?: string;
  auditReference?: string;
  createdAt: string;
}

export interface BlacklistEntry {
  id: string;
  communityId: string;
  discordUserId: string;
  reason: string;
  actor: string;
  timestamp: string;
  expiresAt?: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REMOVED';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommunityRule {
  id: string;
  communityId: string;
  title: string;
  content: string;
  version: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  order: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface AutoModerationRule {
  id: string;
  communityId: string;
  name: string;
  ruleType: 'MESSAGE_CONTENT' | 'SPAM_FREQUENCY' | 'REPEATED_MESSAGE' | 'LINK_PATTERN' | 'MENTION_PATTERN' | 'KEYWORD_PATTERN';
  enabled: boolean;
  priority: number;
  cooldownSeconds: number;
  conditions: {
    keywords?: string[];
    maxMessagesPerWindow?: number;
    windowSeconds?: number;
    maxMentions?: number;
    allowLinks?: boolean;
  };
  action: 'LOG' | 'WARN' | 'DELETE_MESSAGE' | 'TIMEOUT' | 'NOTIFY_MODERATORS';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SafetyIncident {
  id: string;
  communityId: string;
  title: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  affectedMembers: string[]; // discordUserIds
  targetDiscordUserId?: string;
  relatedActions: string[]; // moderationLogIds
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';
  assignedModerator?: string;
  notes?: string;
  resolution?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModerationActionExecution {
  id: string;
  communityId: string;
  actionType: 'TIMEOUT' | 'REMOVE_TIMEOUT' | 'KICK' | 'BAN' | 'UNBAN';
  targetDiscordUserId: string;
  actorDiscordUserId: string;
  reason: string;
  requestId?: string; // for idempotency
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'RETRYABLE' | 'PERMISSION_REQUIRED' | 'ROLE_HIERARCHY_BLOCKED' | 'BOT_NOT_CONNECTED' | 'MEMBER_NOT_FOUND' | 'CHANNEL_NOT_FOUND' | 'DISCORD_LIMITATION' | 'NOT_CONFIGURED' | 'CANCELLED';
  failureReason?: string;
  discordResult?: string;
  createdAt: string;
  updatedAt: string;
}

export type { AiConversation as AiConversationDocument, AiUsageRecord } from './ai.js';
export * from './observability.js';

// --- TASK 46: RECRUITMENT INTELLIGENCE & TALENT OPERATIONS ---

export type TalentPoolCategory =
  | 'ACTIVE'
  | 'PROMISING'
  | 'ON_HOLD'
  | 'FUTURE_FIT'
  | 'REJECTED'
  | 'JOINED';

export interface ScoreSignal {
  type: 'positive' | 'negative' | 'missing' | 'review';
  message: string;
  dimension: string;
  source: string;
  impact: number;
}

export interface RecruitmentScoreBreakdown {
  score: number;
  confidence: number;
  signals: ScoreSignal[];
  dimensions: {
    applicationQuality: number;
    completeness: number;
    interviewPerformance: number;
    recruiterConfidence: number;
    referralSignal: number;
    discordVerification: number;
    engagementEvidence: number;
    communityFit: number;
  };
}

export interface RecruitmentScoreConfig {
  id: string; // communityId
  communityId: string;
  weights: {
    applicationQuality: number;
    completeness: number;
    interviewPerformance: number;
    recruiterConfidence: number;
    referralSignal: number;
    discordVerification: number;
    engagementEvidence: number;
    communityFit: number;
  };
  updatedAt: string;
  updatedBy: string;
}

export interface SavedRecruitmentSegment {
  id: string;
  communityId: string;
  name: string;
  description: string;
  filters: {
    minScore?: number;
    maxScore?: number;
    tags?: string[];
    talentPool?: TalentPoolCategory[];
    stages?: ApplicationStatus[];
    recruiterUserId?: string;
    hasReferral?: boolean;
    hasInterview?: boolean;
    discordStatus?: 'JOINED' | 'PENDING' | 'NOT_MEMBER';
    slaStatus?: 'ON_TIME' | 'OVERDUE';
  };
  createdAt: string;
}

export interface ScreeningQuestion {
  id: string;
  label: string;
  type: 'SHORT_TEXT' | 'LONG_TEXT' | 'SINGLE_SELECT' | 'MULTI_SELECT' | 'YES_NO' | 'NUMBER';
  required: boolean;
  options?: string[];
  order: number;
}

export interface VersionedApplicationForm {
  id: string;
  communityId: string;
  name: string;
  description?: string;
  version: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  questions: ScreeningQuestion[];
  createdAt: string;
  updatedAt: string;
}

export interface RecruitmentCampaign {
  id: string;
  workspaceId: string;
  communityId: string;
  name: string;
  description: string;
  goal: 'APPLICATIONS' | 'INTERVIEWS' | 'APPROVALS' | 'JOINS' | 'RECRUITMENT_SUCCESS';
  source: string;
  applicationFormId?: string;
  recruiterGroup?: string;
  startAt: string;
  endAt: string;
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  campaignCost?: number;
  rewardCost?: number;
  benefitCost?: number;
  recruiterRewardCost?: number;
}

export interface RecruitmentAlert {
  id: string;
  communityId: string;
  candidateId: string;
  candidateName: string;
  type: 'NEW_HIGH_PRIORITY' | 'REVIEW_OVERDUE' | 'INTERVIEW_APPROACHING' | 'DISCORD_VERIFICATION_PENDING' | 'RECRUITMENT_SUCCESS' | 'BENEFIT_AGING';
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  createdAt: string;
  resolved: boolean;
}

export interface AiCandidateSummaryDoc {
  id: string; // candidateId/applicationId
  communityId: string;
  profile: string;
  strengths: string[];
  concerns: string[];
  missingInfo: string[];
  recommendedNextStep: string;
  evidenceLinks: Array<{ text: string; recordType: string; recordId: string }>;
  createdAt: string;
}

// ==========================================
// TASK 51: RECRUITMENT-TO-MEMBER LIFECYCLE & ONBOARDING HANDOFF
// ==========================================

export type MemberHandoffStatus = 'PENDING' | 'VERIFYING' | 'ACTIVATED' | 'BLOCKED' | 'FAILED';

export type MemberRoleStatus =
  | 'NOT_REQUIRED'
  | 'PENDING'
  | 'ASSIGNING'
  | 'ASSIGNED'
  | 'FAILED'
  | 'ROLE_HIERARCHY_BLOCKED'
  | 'PERMISSION_REQUIRED';

export type MemberOnboardingStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'NOT_CONFIGURED';

export interface MemberHandoffDocument {
  id: string; // handoff_${communityId}_${discordUserId}
  workspaceId: string;
  communityId: string;
  applicationId: string;
  candidateId: string;
  discordUserId: string;
  recruiterId?: string;
  campaignId?: string;
  source?: string;
  recruitmentSuccessfulAt: string;
  memberActivatedAt?: string;
  status: MemberHandoffStatus;
  roleStatus: MemberRoleStatus;
  roleId?: string;
  welcomeStatus: WelcomeDeliveryStatus;
  onboardingStatus: MemberOnboardingStatus;
  failureReason?: string;
  retryCount?: number;
  lastRetriedAt?: string;
  createdAt: string;
  updatedAt: string;

  // Compatibility aliases
  activationStatus?: string;
  lifecycleStage?: string;
  joinedAt?: string;
  activatedAt?: string;
}

export type ChecklistItemKey =
  | 'READ_RULES'
  | 'COMPLETE_PROFILE'
  | 'INTRODUCE_YOURSELF'
  | 'VISIT_RECOMMENDED_CHANNEL'
  | 'REVIEW_UPCOMING_EVENTS'
  | 'COMPLETE_REQUIRED_SETUP';

export type ChecklistItemStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'NOT_CONFIGURED';

export interface MemberChecklistItem {
  key: ChecklistItemKey;
  title: string;
  description: string;
  status: ChecklistItemStatus;
  completedAt?: string;
  completed?: boolean;
  configured: boolean;
  actionUrl?: string;
  actionLabel?: string;
}

export interface MemberOnboardingChecklistDocument {
  id: string; // checklist_${communityId}_${discordUserId}
  communityId: string;
  discordUserId: string;
  applicationId?: string;
  items: MemberChecklistItem[];
  overallStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'NOT_CONFIGURED';
  isComplete?: boolean;
  completedCount: number;
  totalConfiguredCount: number;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type EarlyEngagementEventType =
  | 'MEMBER_ACTIVATED'
  | 'WELCOME_SENT'
  | 'RULES_VIEWED'
  | 'PROFILE_COMPLETED'
  | 'FIRST_COMMUNITY_ACTION'
  | 'FIRST_EVENT_PARTICIPATION'
  | 'FIRST_VALID_ENGAGEMENT';

export interface EarlyEngagementEventDocument {
  id: string;
  communityId: string;
  discordUserId: string;
  applicationId?: string;
  eventType: EarlyEngagementEventType;
  metadata?: Record<string, any>;
  timestamp: string;
  recordedAt?: string;
}

export type MemberHealthSignal = 'ONBOARDING_COMPLETE' | 'ACTIVE' | 'LOW_ACTIVITY' | 'AT_RISK' | 'INSUFFICIENT_DATA';

export type MemberLifecycleStage = 'NEW_MEMBER' | 'RECENTLY_ACTIVATED' | 'ONBOARDING_INCOMPLETE' | 'ACTIVE';

export interface UnifiedFunnelMetrics {
  period: string;
  stages: {
    applications: number;
    approved: number;
    joined: number;
    recruitmentSuccessful: number;
    memberActivated: number;
    firstEngagement: number;
  };
  conversionRates: {
    applicationToApproval: number | 'INSUFFICIENT_DATA';
    approvalToJoin: number | 'INSUFFICIENT_DATA';
    joinToSuccess: number | 'INSUFFICIENT_DATA';
    successToActivation: number | 'INSUFFICIENT_DATA';
    activationToEngagement: number | 'INSUFFICIENT_DATA';
    endToEndFunnelRate: number | 'INSUFFICIENT_DATA';
  };
  sourceBreakdown: Array<{
    source: string;
    applications: number;
    activated: number;
    firstEngagement: number;
    conversionRate: number | 'INSUFFICIENT_DATA';
  }>;
  checklistAbandonment: Array<{
    key: ChecklistItemKey;
    title: string;
    totalConfigured: number;
    completed: number;
    dropoffRate: number;
  }>;
}

// ============================================================================
// TASK 52: RECRUITMENT RETENTION, MEMBER QUALITY & LIFECYCLE INTELLIGENCE
// ============================================================================

export type LifecycleMilestone =
  | 'RECRUITMENT_SUCCESSFUL'
  | 'MEMBER_ACTIVATED'
  | 'ONBOARDING_COMPLETED'
  | 'FIRST_VALID_ENGAGEMENT'
  | 'RETENTION_7D'
  | 'RETENTION_30D'
  | 'RETENTION_90D';

export type CohortType =
  | 'DATE_RANGE'
  | 'CAMPAIGN'
  | 'SOURCE'
  | 'RECRUITER'
  | 'REFERRAL'
  | 'FORM'
  | 'COMMUNITY'
  | 'PLAN'
  | 'CUSTOM';

export interface CohortFilterCriteria {
  dateRangeStart?: string;
  dateRangeEnd?: string;
  campaignId?: string;
  source?: string;
  recruiterDiscordUserId?: string;
  referralId?: string;
  formId?: string;
  plan?: string;
  [key: string]: unknown;
}

export interface CohortCorrectionRecord {
  correctedAt: string;
  correctedBy: string;
  reason: string;
  previousCriteria: Record<string, unknown>;
  newCriteria: Record<string, unknown>;
}

export interface RecruitmentCohort {
  id: string;
  communityId: string;
  name: string;
  description?: string;
  cohortType: CohortType;
  filterCriteria: CohortFilterCriteria;
  isImmutable: boolean;
  memberCount: number;
  correctionHistory?: CohortCorrectionRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface RecruitmentOutcomeEvidence {
  memberActivation: boolean;
  activatedAt?: string;
  onboardingCompletion: boolean;
  onboardingCompletedAt?: string;
  firstValidEngagement: boolean;
  firstEngagementAt?: string;
  eventParticipationCount: number;
  communityParticipationCount: number;
  moderationIncidentsCount: number;
  moderationWarningsCount: number;
  retention7d: 'ACTIVE' | 'INACTIVE' | 'INSUFFICIENT_DATA';
  retention14d: 'ACTIVE' | 'INACTIVE' | 'INSUFFICIENT_DATA';
  retention30d: 'ACTIVE' | 'INACTIVE' | 'INSUFFICIENT_DATA';
  retention60d: 'ACTIVE' | 'INACTIVE' | 'INSUFFICIENT_DATA';
  retention90d: 'ACTIVE' | 'INACTIVE' | 'INSUFFICIENT_DATA';
  evidenceSummary: string;
}

export type FunnelStageKey =
  | 'APPLICATION'
  | 'APPROVED'
  | 'JOINED'
  | 'MEMBER_ACTIVATED'
  | 'ONBOARDED'
  | 'FIRST_ENGAGEMENT'
  | '7_DAY_ACTIVE'
  | '30_DAY_ACTIVE'
  | '90_DAY_ACTIVE';

export interface RetentionFunnelStage {
  stageKey: FunnelStageKey;
  label: string;
  count: number;
  conversionRateFromPrevious: number | 'INSUFFICIENT_DATA';
  conversionRateFromStart: number | 'INSUFFICIENT_DATA';
  status: 'AVAILABLE' | 'INSUFFICIENT_DATA';
  evidenceNote?: string;
}

export interface RecruitmentRetentionFunnel {
  stages: RetentionFunnelStage[];
  totalObserved: number;
  period: string;
  cohortId?: string;
}

export interface RecruiterQualityMetrics {
  recruiterDiscordUserId: string;
  recruiterCode?: string;
  displayName?: string;
  applications: number;
  approved: number;
  joined: number;
  successful: number;
  activated: number;
  onboarded: number;
  active7d: number | 'INSUFFICIENT_DATA';
  active30d: number | 'INSUFFICIENT_DATA';
  activationRate: number | 'INSUFFICIENT_DATA';
  onboardingRate: number | 'INSUFFICIENT_DATA';
  retentionRate30d: number | 'INSUFFICIENT_DATA';
  qualityClassification: 'BEST_PERFORMING' | 'BALANCED' | 'HIGH_DROP_OFF' | 'INSUFFICIENT_DATA';
  explainableEvidence: string;
  timeRange: '7d' | '30d' | '90d' | 'all';
}

export interface CampaignQualityMetrics {
  campaignId: string;
  name: string;
  applications: number;
  approvalRate: number | 'INSUFFICIENT_DATA';
  joinRate: number | 'INSUFFICIENT_DATA';
  activationRate: number | 'INSUFFICIENT_DATA';
  onboardingRate: number | 'INSUFFICIENT_DATA';
  earlyEngagementRate: number | 'INSUFFICIENT_DATA';
  retentionRate30d: number | 'INSUFFICIENT_DATA';
  statusClassification: 'BEST_PERFORMING' | 'NEEDS_ATTENTION' | 'INSUFFICIENT_DATA';
  evidence: string;
}

export type RecruitmentSourceType =
  | 'DIRECT'
  | 'REFERRAL'
  | 'RECRUITER'
  | 'CAMPAIGN'
  | 'EVENT'
  | 'PARTNER'
  | 'OTHER';

export interface SourceQualityMetrics {
  source: RecruitmentSourceType;
  applications: number;
  approved: number;
  approvalRate: number | 'INSUFFICIENT_DATA';
  joined: number;
  joinRate: number | 'INSUFFICIENT_DATA';
  activated: number;
  activationRate: number | 'INSUFFICIENT_DATA';
  onboarded: number;
  onboardingRate: number | 'INSUFFICIENT_DATA';
  firstEngagementCount: number;
  firstEngagementRate: number | 'INSUFFICIENT_DATA';
  retained30dCount: number;
  retentionRate30d: number | 'INSUFFICIENT_DATA';
  evidenceSummary: string;
}

export type EarlyMemberQualitySignalType =
  | 'ONBOARDED'
  | 'ACTIVE'
  | 'LOW_ACTIVITY'
  | 'MODERATION_ATTENTION'
  | 'INSUFFICIENT_DATA';

export interface EarlyMemberQualitySignal {
  discordUserId: string;
  signal: EarlyMemberQualitySignalType;
  evidence: string;
  daysSinceJoin: number;
  eventAttendanceCount: number;
  moderationWarningsCount: number;
  checklistCompleted: boolean;
}

export type RetentionAlertType =
  | 'HIGH_APPROVAL_TO_JOIN_DROP'
  | 'LOW_ONBOARDING_COMPLETION'
  | 'EARLY_ENGAGEMENT_DECLINE'
  | 'RECRUITER_COHORT_DEGRADATION'
  | 'CAMPAIGN_COHORT_DEGRADATION'
  | 'HIGH_MODERATION_INCIDENTS';

export interface RetentionAlert {
  id: string;
  communityId: string;
  alertType: RetentionAlertType;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  affectedCohortOrSource: string;
  evidence: string;
  recommendedAction: string;
  createdAt: string;
  resolved?: boolean;
}

export interface OnboardingQualityAnalysis {
  totalChecklists: number;
  overallCompletionRate: number | 'INSUFFICIENT_DATA';
  averageCompletionTimeHours: number | 'INSUFFICIENT_DATA';
  highFrictionStep?: { key: string; title: string; dropoffRate: number };
  lowCompletionStep?: { key: string; title: string; completionRate: number };
  successfulPattern: string;
  stepMetrics: Array<{
    key: string;
    title: string;
    completedCount: number;
    abandonedCount: number;
    completionRate: number;
    dropoffRate: number;
  }>;
}

export interface ModerationQualityCrossover {
  sourceCorrelations: Array<{
    source: string;
    memberCount: number;
    warningCount: number;
    incidentCount: number;
    correlationObservation: string;
    evidenceType: 'OBSERVED_CORRELATION' | 'INSUFFICIENT_DATA';
  }>;
  cohortCorrelations: Array<{
    cohortId: string;
    cohortName: string;
    memberCount: number;
    warningCount: number;
    incidentCount: number;
    observation: string;
    evidenceType: 'OBSERVED_CORRELATION' | 'INSUFFICIENT_DATA';
  }>;
}

export interface EventQualityCrossover {
  sourceBreakdown: Array<{
    source: string;
    registeredCount: number;
    attendedCount: number;
    attendanceRate: number | 'INSUFFICIENT_DATA';
    observation: string;
  }>;
}

export interface AutomationQualityCrossover {
  onboardingAutomationSuccessRate: number | 'INSUFFICIENT_DATA';
  recruitmentAutomationSuccessRate: number | 'INSUFFICIENT_DATA';
  reminderSuccessRate: number | 'INSUFFICIENT_DATA';
  failureRate: number | 'INSUFFICIENT_DATA';
  evidence: string;
}

export interface MemberLifetimeValueFoundation {
  status: 'NOT_CONFIGURED';
  financialLtv: 'NOT_CONFIGURED';
  operationalOutcomes: {
    averageLifetimeDays: number | 'INSUFFICIENT_DATA';
    averageEventsAttended: number;
    averageChecklistsCompleted: number;
    communityContributionRating: 'ACTIVE_CONTRIBUTOR' | 'MODERATE_PARTICIPANT' | 'LOW_ACTIVITY' | 'INSUFFICIENT_DATA';
  };
  note: string;
}

export interface MemberLifecycleExecutiveOverview {
  totalApplicants: number;
  activeMembers: number;
  retentionRate30d: number | 'INSUFFICIENT_DATA';
  onboardingCompletionRate: number | 'INSUFFICIENT_DATA';
  activeAlertsCount: number;
  topSource: { source: string; rate: number | 'INSUFFICIENT_DATA' } | 'INSUFFICIENT_DATA';
}

export * from './integrations.js';
export * from './settings.js';
export * from './observability.js';








