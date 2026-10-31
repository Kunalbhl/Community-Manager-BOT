import { Request, Response, NextFunction } from 'express';
import { UserRole, Permission, UserAuthContext, ALL_SYSTEM_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS } from '../../shared/types/rbac.js';
import { hasPermission, isPlatformOwner, canAccessTenant } from '../security/rbac.js';
import { ForbiddenError, UnauthorizedError, BadRequestError, NotFoundError } from '../utils/errors.js';
import { config } from '../config/env.js';
import { logger } from '../logging/logger.js';
import { resolveUserCommunityRole } from '../services/authorization.service.js';
import { discordAuthService } from '../services/discordAuth.service.js';
import { auditLogsRepository, communitiesRepository } from '../repositories/index.js';
import { EntitlementService } from '../services/entitlement.service.js';
import { workspaceService } from '../services/workspace.service.js';
import { securityEventService } from '../services/securityEvent.service.js';
import { observabilityService } from '../services/observability/observability.service.js';

declare global {
  namespace Express {
    interface Request {
      user?: UserAuthContext;
    }
  }
}

/**
 * Standard platform claim verification check.
 * Checks whether the incoming request carries valid platform administrator credentials.
 * In production/staging, client-provided headers can NEVER establish platform owner identity.
 */
export function verifyPlatformClaim(req: Request, resolvedUserId?: string): boolean {
  const isProductionOrStaging =
    config.NODE_ENV === 'production' ||
    config.NODE_ENV === 'staging' ||
    process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'staging';

  const platformKeyHeader = req.header('x-platform-key');
  const authHeader = req.header('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
  const candidateKey = platformKeyHeader || token;

  // Never accept dev tokens in production or staging
  if (isProductionOrStaging && (candidateKey === 'cr_platform_verified_claim_token' || candidateKey === 'community-admin-key-default')) {
    return false;
  }

  // 1. If configured in environment with a secure key, verify against configured PLATFORM_ADMIN_KEY
  if (config.PLATFORM_ADMIN_KEY && candidateKey && candidateKey === config.PLATFORM_ADMIN_KEY) {
    if (isProductionOrStaging && (config.PLATFORM_ADMIN_KEY === 'community-admin-key-default' || candidateKey === 'cr_platform_verified_claim_token')) {
      return false; // Reject default placeholder keys in production
    }
    return true;
  }

  // 2. If configured in environment, verify if userId matches configured PLATFORM_OWNER_USER_ID
  // In production, MUST strictly come from authenticated session (resolvedUserId)
  if (config.PLATFORM_OWNER_USER_ID && resolvedUserId && resolvedUserId === config.PLATFORM_OWNER_USER_ID) {
    return true;
  }

  // 3. In non-production testing/development environment, allow verified email header against owner email
  if (!isProductionOrStaging) {
    const userEmailHeader = req.header('x-user-email');
    if (
      userEmailHeader &&
      config.PLATFORM_OWNER_EMAIL &&
      userEmailHeader.trim().toLowerCase() === config.PLATFORM_OWNER_EMAIL.trim().toLowerCase()
    ) {
      return true;
    }
  }

  // 4. In non-production development/testing environment only, allow local test claim token
  if (!isProductionOrStaging && candidateKey === 'cr_platform_verified_claim_token') {
    return true;
  }

  return false;
}

/**
 * Authentication context resolver.
 * Server-side authorization boundary enforcing tenant isolation and platform role verification.
 */
/**
 * Helper to log security audit events.
 */
export async function logSecurityEvent(
  action: 'AUTHORITY_FALLBACK_BLOCKED' | 'SIMULATED_IDENTITY_BLOCKED' | 'ROLE_HEADER_AUTH_BLOCKED' | 'UNSCOPED_TENANT_ACCESS_BLOCKED' | 'COMMUNITY_CONTEXT_MISSING',
  req: Request,
  reason: string,
  actorUserId?: string
) {
  try {
    const rawPath = req.originalUrl || req.path || '';
    logger.warn(`[SECURITY_AUDIT] ${action}: Route ${rawPath}, actor: ${actorUserId || 'unknown'}, reason: ${reason}`);

    await auditLogsRepository.create({
      id: `sec_audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      communityId: (req.header('x-community-id') || req.query.communityId || 'platform') as string,
      actorUserId: actorUserId || 'anonymous',
      actorRole: 'MEMBER',
      action: 'USER_ROLE_CHANGED',
      targetType: 'SYSTEM',
      targetId: 'security',
      metadata: {
        securityAction: action,
        route: rawPath,
        reason,
        environment: config.NODE_ENV,
        requestId: req.id,
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    // ignore to prevent breaking standard user flow
  }
}

function getCookieFromHeaders(req: Request, name: string): string | undefined {
  const cookieHeader = req.headers?.cookie || (typeof req.header === 'function' ? req.header('cookie') : undefined);
  if (!cookieHeader) return undefined;
  const cookies = cookieHeader.split(';').reduce((acc, current) => {
    const [key, ...val] = current.trim().split('=');
    acc[key] = val.join('=');
    return acc;
  }, {} as Record<string, string>);
  return cookies[name];
}

/**
 * Authentication context resolver.
 * Server-side authorization boundary enforcing tenant isolation and platform role verification.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    // Reject any client attempts to switch data sources or runtime mode via query or header params
    const providerParam = req.query?.provider || (typeof req.header === 'function' ? (req.header('provider') || req.header('x-provider')) : undefined);
    const runtimeParam = req.query?.runtimeMode || (typeof req.header === 'function' ? (req.header('x-runtime-mode') || req.header('runtime-mode')) : undefined);

    if (typeof providerParam === 'string') {
      const p = providerParam.toLowerCase();
      if (p === 'mock' || p === 'simulation' || p === 'fake') {
        await securityEventService.recordEvent({
          type: 'PRODUCTION_SIMULATION_ATTEMPT',
          route: req.originalUrl || req.path,
          reason: `Client attempted to switch provider to '${providerParam}'`,
          communityId: req.header('x-community-id') || 'platform',
        });
        return next(new ForbiddenError('Runtime provider switching is strictly prohibited', 'PROVIDER_SWITCH_BLOCKED'));
      }
    }

    if (typeof runtimeParam === 'string' && runtimeParam !== config.APP_RUNTIME_MODE) {
      await securityEventService.recordEvent({
        type: 'RUNTIME_MODE_OVERRIDE_ATTEMPT',
        route: req.originalUrl || req.path,
        reason: `Client attempted to override runtime mode to '${runtimeParam}'`,
        communityId: req.header('x-community-id') || 'platform',
      });
      return next(new ForbiddenError('Runtime mode is server-authoritative and immutable', 'RUNTIME_MODE_OVERRIDE_BLOCKED'));
    }

    const isProductionOrStaging = config.NODE_ENV === 'production' || config.NODE_ENV === 'staging' || config.APP_RUNTIME_MODE !== 'DEVELOPMENT_SIMULATION';
    const queryCommunityId = typeof req.query?.communityId === 'string' ? req.query.communityId : undefined;
    const headerCommunityId = typeof req.header === 'function' ? (req.header('x-community-id') || undefined) : undefined;
    const bodyCommunityId = (req.body && typeof req.body.communityId === 'string') ? req.body.communityId : undefined;
    const resolvedCommunityId = queryCommunityId || headerCommunityId || bodyCommunityId || undefined;

    // 3. AUTHENTICATION RESOLUTION ORDER: cookie -> Firestore -> validated Discord session -> req.user
    // In production, we strictly derive identity from the secure session cookie, falling back to Bearer token
    let token = (req as any).cookies?.['discord_session_token'] || getCookieFromHeaders(req, 'discord_session_token');
    if (!token) {
      const authHeader = typeof req.header === 'function' ? req.header('authorization') : undefined;
      token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
    }

    // Strictly reject header-based identity spoofing in production/staging environments
    if (isProductionOrStaging && req.headers) {
      delete req.headers['x-user-id'];
      delete req.headers['x-uid'];
      delete req.headers['x-role'];
      delete req.headers['x-user-role'];
    }

    let resolvedUserId = 'usr_anonymous';
    let sessionType: 'REAL_DISCORD_SESSION' | 'UNAUTHENTICATED' = 'UNAUTHENTICATED';

    if (token) {
      try {
        const session = await discordAuthService.getSessionByToken(token);
        if (session) {
          resolvedUserId = session.discordUserId;
          sessionType = 'REAL_DISCORD_SESSION';
        }
      } catch (sessionErr) {
        logger.warn(`[Authenticate] Error loading session: ${(sessionErr as Error).message}`);
      }
    }

    // Verify Platform Claims securely (only passed authenticated session identity in production)
    const isVerifiedPlatform = verifyPlatformClaim(req, sessionType === 'REAL_DISCORD_SESSION' ? resolvedUserId : undefined);

    let resolvedRole: UserRole = 'APPLICANT';
    let resolvedPermissions: Permission[] = [];

    let access: any = { role: 'APPLICANT' as UserRole, permissions: [...DEFAULT_ROLE_PERMISSIONS['APPLICANT']] };
    try {
      access = await resolveUserCommunityRole(resolvedUserId, resolvedCommunityId);
    } catch (accessErr) {
      logger.warn(`[Authenticate] Error resolving community role: ${(accessErr as Error).message}`);
    }

    const rawPath = req.originalUrl || req.path || req.url || '';
    const cleanPath = rawPath.split('?')[0].replace(/^(\/api)?(\/v[0-9]+)?/, '') || '/';

    const isBypassNotFoundCheck =
      cleanPath.startsWith('/onboarding') ||
      cleanPath.startsWith('/auth') ||
      cleanPath.startsWith('/discord') ||
      cleanPath === '/community' ||
      cleanPath.startsWith('/workspaces') ||
      cleanPath.startsWith('/telemetry') ||
      cleanPath.startsWith('/health') ||
      cleanPath === '/production-readiness' ||
      cleanPath.startsWith('/recruitment/public-codes') ||
      cleanPath.includes('/public-codes') ||
      cleanPath.includes('/forms/public') ||
      cleanPath.includes('/recruiter-identity') ||
      cleanPath.startsWith('/calendar') ||
      !resolvedCommunityId ||
      resolvedCommunityId === 'comm_new' ||
      resolvedCommunityId === 'comm_default';

    // If they supplied a token but it's not a real/valid session, and the route is not bypassed, fail with 401
    if (token && sessionType === 'UNAUTHENTICATED' && !isBypassNotFoundCheck) {
      return next(new UnauthorizedError('Your session has expired or is invalid. Please log in again.', 'SESSION_EXPIRED'));
    }

    if (access.error && !isBypassNotFoundCheck) {
      if (access.error === 'COMMUNITY_NOT_FOUND') {
        return next(new NotFoundError('Community not found', 'COMMUNITY_NOT_FOUND'));
      }
      if (access.error === 'COMMUNITY_NOT_CONNECTED') {
        return next(new ForbiddenError('Community is not connected or inactive', 'COMMUNITY_ACCESS_DENIED'));
      }
    }

    if (isVerifiedPlatform) {
      resolvedRole = 'PLATFORM_OWNER';
      resolvedPermissions = [...ALL_SYSTEM_PERMISSIONS];
    } else {
      resolvedRole = access.role;
      resolvedPermissions = access.permissions;
    }

    req.user = {
      id: resolvedUserId,
      userId: resolvedUserId,
      discordUserId: resolvedUserId,
      role: resolvedRole,
      communityId: resolvedCommunityId,
      isPlatformOwner: isVerifiedPlatform || resolvedRole === 'PLATFORM_OWNER',
      customPermissions: resolvedPermissions,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Guard requiring platform owner authorization.
 * A community OWNER is strictly prevented from accessing platform admin routes.
 */
export function requirePlatformOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED'));
  }

  if (!isPlatformOwner(req.user)) {
    return next(
      new ForbiddenError('Access denied: Platform Administrator authorization required', 'PLATFORM_OWNER_REQUIRED')
    );
  }

  next();
}

/**
 * Guard requiring a specific permission.
 */
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required to perform this action', 'AUTHENTICATION_REQUIRED'));
    }

    if (!hasPermission(req.user, permission)) {
      return next(
        new ForbiddenError(`Missing required permission: ${permission}`, 'PERMISSION_REQUIRED')
      );
    }

    next();
  };
}

/**
 * Guard requiring a specific permission, or allowing APPLICANT role bypass (for self-service endpoints).
 */
export function requirePermissionOrApplicant(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required to perform this action', 'AUTHENTICATION_REQUIRED'));
    }

    if (req.user.role === 'APPLICANT') {
      return next();
    }

    if (!hasPermission(req.user, permission)) {
      return next(
        new ForbiddenError(`Missing required permission: ${permission}`, 'PERMISSION_REQUIRED')
      );
    }

    next();
  };
}

/**
 * Guard requiring any of the specified roles.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED'));
    }

    if (isPlatformOwner(req.user) || req.user.role === 'OWNER') {
      return next(); // Platform owner or Community Owner passes community role checks
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(`Role ${req.user.role} is not authorized for this resource`, 'ROLE_RESOLUTION_FAILED')
      );
    }

    next();
  };
}

/**
 * Guard enforcing multi-tenant isolation.
 * Verifies that the authenticated context matches the tenant specified in route parameters or query.
 */
export function requireTenantAccess(paramName = 'communityId') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED'));
      }

      // Platform owner has oversight across tenants
      if (isPlatformOwner(req.user)) {
        return next();
      }

      const targetCommunityId = (
        req.params[paramName] ||
        req.query[paramName] ||
        req.body?.[paramName] ||
        req.header('x-community-id')
      ) as string | undefined;

      if (!targetCommunityId) {
        await logSecurityEvent('COMMUNITY_CONTEXT_MISSING', req, 'Community context is missing on community-scoped route.');
        return next(new BadRequestError('Community context is required', 'COMMUNITY_CONTEXT_REQUIRED'));
      }

      if (!canAccessTenant(req.user, targetCommunityId)) {
        observabilityService.recordTenancyViolation({
          communityId: targetCommunityId,
          actorUserId: req.user.userId,
          reason: 'Cross-community access prohibited',
          correlationId: req.headers['x-correlation-id'] as string,
        });
        await logSecurityEvent('UNSCOPED_TENANT_ACCESS_BLOCKED', req, `Attempted cross-tenant access to tenant ${targetCommunityId}`, req.user.userId);
        return next(
          new ForbiddenError(`Access denied: Cross-community access to tenant ${targetCommunityId} is prohibited`, 'COMMUNITY_ACCESS_DENIED')
        );
      }

      const access = await workspaceService.validateCommunityAccess(req.user.userId, req.user.role, targetCommunityId);
      if (!access.authorized) {
        return next(
          new ForbiddenError(`Dual Authorization Check Failed: ${access.reason || 'Workspace & Community access required'}`, 'COMMUNITY_ACCESS_DENIED')
        );
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Guard enforcing server-side entitlement & feature availability.
 */
export function requireEntitlement(featureKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const communityId = (req.header('x-community-id') ||
        req.user?.communityId ||
        req.params.communityId ||
        req.query.communityId) as string | undefined;

      if (!communityId) {
        return next(new BadRequestError('Community tenant identifier required for entitlement evaluation'));
      }

      const check = await EntitlementService.checkEntitlement(communityId, featureKey);
      if (!check.allowed) {
        if (check.status === 'BILLING_REQUIRED') {
          return res.status(403).json({
            error: 'BILLING_REQUIRED',
            message: check.reason || `Feature [${featureKey}] requires ${check.requiredPlan || 'PRO'} plan upgrade.`,
            status: 'BILLING_REQUIRED',
            featureKey,
            requiredPlan: check.requiredPlan || 'PRO',
          });
        }
        if (check.status === 'LIMIT_REACHED') {
          return res.status(403).json({
            error: 'LIMIT_REACHED',
            message: check.reason || `Usage quota reached for ${featureKey}.`,
            status: 'LIMIT_REACHED',
            featureKey,
          });
        }
        return res.status(403).json({
          error: 'FEATURE_NOT_ENABLED',
          message: check.reason || `Feature [${featureKey}] is not enabled for this community.`,
          status: 'FEATURE_NOT_ENABLED',
          featureKey,
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
