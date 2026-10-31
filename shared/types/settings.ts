import { UserRole } from './rbac.js';

export type SettingScope = 'PLATFORM' | 'COMMUNITY' | 'USER';

export type ConfigurationDiagnosticStatus =
  | 'READY'
  | 'CONFIGURATION_REQUIRED'
  | 'PERMISSION_REQUIRED'
  | 'INTEGRATION_REQUIRED'
  | 'DISCORD_LIMITATION'
  | 'ERROR';

export type SettingsSectionKey =
  | 'general'
  | 'community'
  | 'permissions'
  | 'recruitment'
  | 'notifications'
  | 'plansUsage'
  | 'security';

export interface GeneralSettings {
  displayName: string;
  guildName: string;
  timezone: string;
  locale: string;
  dateTimeFormat: '12_HOUR' | '24_HOUR';
  description: string;
  defaultLandingContext: 'OVERVIEW' | 'APPLICATIONS' | 'ENGAGEMENT' | 'EVENTS';
}

export interface CommunityCustomSettings {
  welcomeMessageEnabled: boolean;
  welcomeGreeting: string;
  welcomeChannelName: string;
  welcomeChannelId?: string;
  onboardingRulesLink: string;
  codeOfConductLink: string;
  rulesChannelName: string;
  rulesChannelId?: string;
  massMentionPolicy: 'DISABLED' | 'RESTRICTED' | 'ADMIN_ONLY';
  dmNotificationsEnabled: boolean;
  rules: string[];
  guidelines: string[];
}

export interface RolePermissionConfig {
  role: UserRole;
  discordRoleId?: string;
  discordRoleName?: string;
  description: string;
  isProtected: boolean;
  permissions: string[];
  status: ConfigurationDiagnosticStatus;
}

export interface PermissionsSettings {
  roleMappings: Record<UserRole, RolePermissionConfig>;
  allowSelfAssignment: boolean;
  hierarchyEnforced: boolean;
  status: ConfigurationDiagnosticStatus;
}

export interface RecruitmentSettingsSection {
  applicationEnabled: boolean;
  interviewEnabled: boolean;
  screeningThreshold: number;
  recruiterCodeRequired: boolean;
  automaticRecruiterCodeGeneration: boolean;
  manualRecruiterCodesAllowed: boolean;
  recruiterPersonaEnabled: boolean;
  recruiterDisplayName: string;
  recruiterWelcomeGreeting: string;
  recordEnabled: boolean;
  recordChannelName: string;
  recordChannelId?: string;
  recordTemplate: string;
  blacklistEnforcementEnabled: boolean;
  calendarRequirementEnabled: boolean;
}

export interface NotificationCategoryConfig {
  category: 'recruitment' | 'engagement' | 'moderation' | 'events' | 'integrations' | 'security' | 'system';
  name: string;
  enabled: boolean;
  destination: 'DISCORD' | 'NOTIFICATION_CENTER' | 'EMAIL';
  channelName?: string;
  channelId?: string;
  minimumRole: UserRole;
  status: ConfigurationDiagnosticStatus;
}

export interface NotificationsSettingsSection {
  categories: Record<string, NotificationCategoryConfig>;
  dmDeliveryFallback: boolean;
  summaryFrequency: 'INSTANT' | 'DAILY' | 'WEEKLY';
}

export interface PlansUsageSettingsSection {
  plan: 'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
  billingStatus: 'NOT_CONFIGURED' | 'ACTIVE' | 'TRIALING' | 'PAST_DUE' | 'CANCELLED';
  currentPeriodEnd?: string;
  quotas: Record<string, { used: number; limit: number | 'UNLIMITED'; remaining: number | 'UNLIMITED' }>;
  featureAccess: Record<string, boolean>;
  isOverLimit: boolean;
}

export interface SecuritySettingsSection {
  massMentionPolicy: 'DISABLED' | 'RESTRICTED' | 'ADMIN_ONLY';
  moderationBaselineSeverity: 'LOW' | 'MEDIUM' | 'HIGH';
  moderationLogChannel: string;
  blacklistEnforcement: boolean;
  suspiciousActivityAlerts: boolean;
  auditRetentionDays: 30;
  auditRetentionPolicyNotice: string;
  securityNotificationsEnabled: boolean;
}

export interface DiagnosticItem {
  category: 'GENERAL' | 'COMMUNITY' | 'PERMISSIONS' | 'RECRUITMENT' | 'NOTIFICATIONS' | 'SECURITY' | 'INTEGRATIONS';
  settingKey: string;
  status: ConfigurationDiagnosticStatus;
  message: string;
  remediation?: string;
}

export interface CommunitySettingsDiagnostics {
  overallStatus: ConfigurationDiagnosticStatus;
  readyCount: number;
  warningCount: number;
  errorCount: number;
  items: DiagnosticItem[];
  evaluatedAt: string;
}

export interface ConsolidatedCommunitySettings {
  communityId: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
  general: GeneralSettings;
  community: CommunityCustomSettings;
  permissions: PermissionsSettings;
  recruitment: RecruitmentSettingsSection;
  notifications: NotificationsSettingsSection;
  plansUsage: PlansUsageSettingsSection;
  security: SecuritySettingsSection;
  diagnostics: CommunitySettingsDiagnostics;
}

export interface UpdateCommunitySettingsPayload {
  general?: Partial<GeneralSettings>;
  community?: Partial<CommunityCustomSettings>;
  permissions?: Partial<PermissionsSettings>;
  recruitment?: Partial<RecruitmentSettingsSection>;
  notifications?: Partial<NotificationsSettingsSection>;
  security?: Partial<SecuritySettingsSection>;
}
