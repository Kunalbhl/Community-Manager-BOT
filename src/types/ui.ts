import { UserRole, Permission, CommunityPermission, PlatformPermission } from '../../shared/types/rbac.js';

export type PortalMode =
  | 'platform'
  | 'community'
  | 'applicant'
  | 'recruiter'
  | 'PLATFORM_ADMIN'
  | 'COMMUNITY_DASHBOARD'
  | 'APPLICANT_PORTAL'
  | 'RECRUITER_PORTAL'
  | 'PUBLIC_LANDING'
  | 'SERVER_SELECTION';

export type PlatformSection =
  | 'overview'
  | 'servers'
  | 'users'
  | 'analytics'
  | 'feedback'
  | 'health'
  | 'settings'
  | 'audit';

export type PrimaryModuleSection =
  | 'home'
  | 'members'
  | 'community'
  | 'engagement'
  | 'recruitment'
  | 'moderation'
  | 'events-automation'
  | 'insights-ai'
  | 'integrations'
  | 'settings';

export type CommunitySection =
  | PrimaryModuleSection
  | 'server-tools'
  | 'setup-guide'
  | 'team-access'
  | 'community-features'
  | 'capabilities'
  | 'overview'
  | 'dashboard'
  | 'applications'
  | 'interviews'
  | 'recruiters'
  | 'recruiter-codes'
  | 'members'
  | 'users'
  | 'community-config'
  | 'notifications'
  | 'rewards'
  | 'spreadsheet'
  | 'ai'
  | 'reports'
  | 'permissions'
  | 'audit-logs'
  | 'applicant-portal'
  | 'recruitment-trust'
  | 'referrals'
  | 'blacklist'
  | 'channels'
  | 'welcome-onboarding'
  | 'recruiter-records'
  | 'announcements'
  | 'campaigns'
  | 'polls'
  | 'templates'
  | 'warnings'
  | 'incidents'
  | 'automod'
  | 'restrictions'
  | 'security-audit'
  | 'events'
  | 'automation'
  | 'insights-dashboard'
  | 'google-calendar'
  | 'discord-gateway'
  | 'campaign-workspace'
  | 'pricing-trust'
  | 'lifecycle-intelligence'
  | 'recruitment-command-center'
  | 'candidates'
  | 'onboarding-interview'
  | 'recruitment-settings'
  | 'discord-ops'
  | 'server-hygiene';

export type DashboardSection = CommunitySection;

export interface NavItemConfig {
  id: string;
  label: string;
  requiredPermission?: Permission;
  allowedRoles?: UserRole[];
  badge?: string;
  iconName?: string;
}
