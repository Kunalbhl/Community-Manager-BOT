/**
 * Role-Based Access Control (RBAC) definitions
 * Supporting Multi-Tenant Community Authorization and Platform Owner Authorization.
 * Following the principle of least privilege.
 */

export type PlatformRole = 'PLATFORM_OWNER';

export type CommunityRole =
  | 'OWNER'
  | 'CONTROLLER'
  | 'INTERVIEWER'
  | 'RECRUITER'
  | 'MEMBER'
  | 'APPLICANT';

export type UserRole = PlatformRole | CommunityRole;

export type CommunityPermission =
  | 'community.view'
  | 'community.manage'
  | 'applications.view'
  | 'applications.review'
  | 'applications.approve'
  | 'applications.reject'
  | 'interviews.view'
  | 'interviews.manage'
  | 'recruiters.view'
  | 'recruiters.manage'
  | 'recruiterCodes.view'
  | 'recruiterCodes.create'
  | 'recruiterCodes.revoke'
  | 'users.view'
  | 'users.manage'
  | 'rewards.view'
  | 'rewards.manage'
  | 'reports.view'
  | 'reports.export'
  | 'settings.view'
  | 'settings.manage'
  | 'ai.view'
  | 'ai.manage'
  | 'notifications.view'
  | 'notifications.manage'
  | 'applications.manage_rules'
  | 'billing.manage'
  | 'auditLogs.view';

export type PlatformPermission =
  | 'platform.view'
  | 'platform.manage'
  | 'platform.servers'
  | 'platform.servers.manage'
  | 'platform.users'
  | 'platform.users.manage'
  | 'platform.analytics'
  | 'platform.feedback'
  | 'platform.feedback.manage'
  | 'platform.health'
  | 'platform.health.view'
  | 'platform.settings'
  | 'platform.settings.manage'
  | 'platform.audit';

export type Permission = CommunityPermission | PlatformPermission;

export const ALL_COMMUNITY_PERMISSIONS: CommunityPermission[] = [
  'community.view',
  'community.manage',
  'applications.view',
  'applications.review',
  'applications.approve',
  'applications.reject',
  'interviews.view',
  'interviews.manage',
  'recruiters.view',
  'recruiters.manage',
  'recruiterCodes.view',
  'recruiterCodes.create',
  'recruiterCodes.revoke',
  'users.view',
  'users.manage',
  'rewards.view',
  'rewards.manage',
  'reports.view',
  'reports.export',
  'settings.view',
  'settings.manage',
  'ai.view',
  'ai.manage',
  'notifications.view',
  'notifications.manage',
  'auditLogs.view',
];

export const ALL_PLATFORM_PERMISSIONS: PlatformPermission[] = [
  'platform.view',
  'platform.manage',
  'platform.servers',
  'platform.servers.manage',
  'platform.users',
  'platform.users.manage',
  'platform.analytics',
  'platform.feedback',
  'platform.feedback.manage',
  'platform.health',
  'platform.health.view',
  'platform.settings',
  'platform.settings.manage',
  'platform.audit',
];

export const ALL_PERMISSIONS: CommunityPermission[] = ALL_COMMUNITY_PERMISSIONS;

export const ALL_SYSTEM_PERMISSIONS: Permission[] = [
  ...ALL_COMMUNITY_PERMISSIONS,
  ...ALL_PLATFORM_PERMISSIONS,
];

/**
 * Base default permissions by role.
 * PLATFORM_OWNER has full platform oversight.
 * Community OWNER has full community privileges within their tenant.
 * CONTROLLER permissions are individually configurable per community.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  PLATFORM_OWNER: [...ALL_SYSTEM_PERMISSIONS],
  OWNER: [...ALL_COMMUNITY_PERMISSIONS],
  CONTROLLER: [
    'community.view',
    'applications.view',
    'applications.review',
    'applications.approve',
    'applications.reject',
    'interviews.view',
    'interviews.manage',
    'recruiters.view',
    'recruiterCodes.view',
    'recruiterCodes.create',
    'users.view',
    'notifications.view',
    'reports.view',
  ],
  INTERVIEWER: [
    'community.view',
    'applications.view',
    'applications.review',
    'interviews.view',
    'interviews.manage',
    'notifications.view',
  ],
  RECRUITER: [
    'community.view',
    'applications.view',
    'recruiters.view',
    'recruiterCodes.view',
    'recruiterCodes.create',
    'rewards.view',
    'notifications.view',
  ],
  MEMBER: [
    'community.view',
    'notifications.view',
  ],
  APPLICANT: [
    'notifications.view',
  ],
};

export interface UserAuthContext {
  userId: string;
  id?: string;
  role: UserRole;
  communityId?: string;
  discordUserId?: string;
  isPlatformOwner?: boolean;
  customPermissions?: Permission[];
}
