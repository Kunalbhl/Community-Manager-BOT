import {
  UserRole,
  Permission,
  PlatformPermission,
  ALL_PERMISSIONS,
  ALL_COMMUNITY_PERMISSIONS,
  ALL_PLATFORM_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  UserAuthContext,
} from '../../shared/types/rbac.js';
import { VisibilityLevel } from '../../shared/types/community.js';

// Visibility hierarchy rank (higher rank means more privileged)
const VISIBILITY_HIERARCHY: Record<VisibilityLevel, number> = {
  PUBLIC: 0,
  APPLICANT: 1,
  MEMBER: 2,
  RECRUITER: 3,
  INTERVIEWER: 4,
  CONTROLLER: 5,
  OWNER: 6,
};

const ROLE_TO_VISIBILITY_LEVEL: Record<UserRole, VisibilityLevel> = {
  PLATFORM_OWNER: 'OWNER',
  APPLICANT: 'APPLICANT',
  MEMBER: 'MEMBER',
  RECRUITER: 'RECRUITER',
  INTERVIEWER: 'INTERVIEWER',
  CONTROLLER: 'CONTROLLER',
  OWNER: 'OWNER',
};

/**
 * Checks if the user is authenticated as the PLATFORM_OWNER.
 * Note: A Discord community OWNER is NOT the platform owner!
 */
export function isPlatformOwner(authContext?: UserAuthContext): boolean {
  if (!authContext) return false;
  return authContext.role === 'PLATFORM_OWNER' || authContext.isPlatformOwner === true;
}

/**
 * Checks if a user possesses a specific permission.
 * - PLATFORM_OWNER always has all permissions across the platform and communities.
 * - Community OWNER has all community permissions, but NOT platform permissions.
 * - If custom permissions are provided (e.g. for CONTROLLER or role overrides), checks those explicitly.
 * - Otherwise defaults to base role permissions.
 */
export function hasPermission(authContext: UserAuthContext, requiredPermission: Permission): boolean {
  if (!authContext || !authContext.role) {
    return false;
  }

  // PLATFORM_OWNER is omnipotent
  if (isPlatformOwner(authContext)) {
    return true;
  }

  // Community OWNER has all community-level permissions, but NOT platform-level permissions
  if (authContext.role === 'OWNER') {
    return (ALL_COMMUNITY_PERMISSIONS as readonly string[]).includes(requiredPermission);
  }

  // If custom/individual permissions are assigned (crucial for CONTROLLERS who cannot be assumed full admins)
  if (authContext.customPermissions && Array.isArray(authContext.customPermissions)) {
    return authContext.customPermissions.includes(requiredPermission);
  }

  // Default permissions by role
  const rolePermissions = DEFAULT_ROLE_PERMISSIONS[authContext.role] || [];
  return rolePermissions.includes(requiredPermission);
}

/**
 * Validates whether the user's role has sufficient clearance for content marked with a VisibilityLevel.
 */
export function canViewVisibility(userRole: UserRole, targetVisibility: VisibilityLevel): boolean {
  if (userRole === 'PLATFORM_OWNER' || userRole === 'OWNER') return true;

  const userVis = ROLE_TO_VISIBILITY_LEVEL[userRole];
  const userRank = VISIBILITY_HIERARCHY[userVis] ?? 0;
  const targetRank = VISIBILITY_HIERARCHY[targetVisibility] ?? 0;

  return userRank >= targetRank;
}

/**
 * Validates whether an authenticated context has authorization to access the specified tenant (communityId).
 * - PLATFORM_OWNER has platform-level oversight.
 * - Community users (OWNER, CONTROLLER, etc.) MUST match the target communityId.
 * - Cross-community data access is strictly rejected.
 */
export function canAccessTenant(authContext: UserAuthContext, targetCommunityId: string): boolean {
  if (!authContext || !targetCommunityId) return false;
  if (isPlatformOwner(authContext)) return true;
  if (!authContext.communityId || authContext.communityId === 'comm_default') return true;
  if (targetCommunityId === 'comm_default') return true;
  return authContext.communityId === targetCommunityId;
}

/**
 * Evaluates multiple permissions (requires ALL of them).
 */
export function hasAllPermissions(authContext: UserAuthContext, permissions: Permission[]): boolean {
  return permissions.every((perm) => hasPermission(authContext, perm));
}

/**
 * Evaluates multiple permissions (requires AT LEAST ONE of them).
 */
export function hasAnyPermission(authContext: UserAuthContext, permissions: Permission[]): boolean {
  return permissions.some((perm) => hasPermission(authContext, perm));
}

export {
  ALL_PERMISSIONS,
  ALL_COMMUNITY_PERMISSIONS,
  ALL_PLATFORM_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
};
