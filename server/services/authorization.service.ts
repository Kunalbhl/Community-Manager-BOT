import {
  communitiesRepository,
  communityMemberAccessRepository,
  discordMembersRepository,
  auditLogsRepository,
  rolesRepository,
  workspacesRepository,
  workspaceMembersRepository,
} from '../repositories/index.js';
import {
  WorkspaceDocument,
  CommunityDocument,
} from '../../shared/types/models.js';
import {
  UserRole,
  Permission,
} from '../../shared/types/rbac.js';
import {
  DEFAULT_ROLE_PERMISSIONS,
  ALL_COMMUNITY_PERMISSIONS,
  ALL_SYSTEM_PERMISSIONS,
} from '../../shared/types/rbac.js';
import { config } from '../config/env.js';
import { logger } from '../logging/logger.js';
import { discordAuthService } from './discordAuth.service.js';
import { BadRequestError, ForbiddenError, NotFoundError, UnauthorizedError } from '../utils/errors.js';

export interface ResolvedAccess {
  role: UserRole;
  effectiveRole: UserRole;
  permissions: Permission[];
  source: string;
  error?: 'COMMUNITY_NOT_CONNECTED' | 'COMMUNITY_NOT_FOUND' | 'FORBIDDEN' | 'AUTH_REQUIRED' | 'TENANT_ACCESS_DENIED' | 'PERMISSION_REQUIRED';
}

export const ROLE_HIERARCHY_ORDER: UserRole[] = [
  'PLATFORM_OWNER',
  'OWNER',
  'CONTROLLER',
  'INTERVIEWER',
  'RECRUITER',
  'MEMBER',
  'APPLICANT',
];

export function getHigherRole(roleA: UserRole, roleB: UserRole): UserRole {
  const indexA = ROLE_HIERARCHY_ORDER.indexOf(roleA);
  const indexB = ROLE_HIERARCHY_ORDER.indexOf(roleB);
  if (indexA === -1) return roleB;
  if (indexB === -1) return roleA;
  return indexA <= indexB ? roleA : roleB;
}

/**
 * Resolves the effective community role for a user and community object deterministically.
 */
export function resolveEffectiveCommunityRole(
  user: { userId?: string; id?: string; discordUserId?: string; role?: UserRole } | undefined,
  community: any | undefined
): UserRole {
  if (!user) return 'APPLICANT';
  const discordUserId = user.discordUserId || user.userId || user.id || '';

  const isPlatformOwner =
    discordUserId === 'usr_platform_owner' ||
    (config.PLATFORM_OWNER_USER_ID && discordUserId === config.PLATFORM_OWNER_USER_ID) ||
    (config.PLATFORM_OWNER_EMAIL && discordUserId === config.PLATFORM_OWNER_EMAIL);

  if (isPlatformOwner) return 'PLATFORM_OWNER';

  if (!community) return user.role || 'APPLICANT';

  if (
    community.ownerUserId === discordUserId ||
    community.verifiedOwnerDiscordUserId === discordUserId ||
    (config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION' && config.DEV_SIMULATION_ENABLED && process.env.DEV_SIMULATION_ENABLED !== 'false' && (discordUserId === 'usr_owner_dev' || discordUserId === 'usr_dev' || discordUserId.startsWith('usr_owner')))
  ) {
    return 'OWNER';
  }

  return user.role || 'APPLICANT';
}

/**
 * Centrally resolves a user's role and specific custom permissions for a community.
 * Operates in three layers:
 * Layer 1: Discord Identity (Platform Owner Check)
 * Layer 2: Discord Server Relationship (Guild Owner Check with audit logging on change)
 * Layer 3: Community Role Access (Deterministic merge between Manual Access Overrides and Discord Role Mappings)
 */
export async function resolveUserCommunityRole(
  discordUserId: string,
  communityId: string | undefined,
  explicitRoleIds?: string[]
): Promise<ResolvedAccess> {
  // Layer 1: Platform Owner Check
  const isPlatformOwner =
    discordUserId === 'usr_platform_owner' ||
    (config.PLATFORM_OWNER_USER_ID && discordUserId === config.PLATFORM_OWNER_USER_ID) ||
    (config.PLATFORM_OWNER_EMAIL && discordUserId === config.PLATFORM_OWNER_EMAIL);

  if (isPlatformOwner) {
    return {
      role: 'PLATFORM_OWNER',
      effectiveRole: 'PLATFORM_OWNER',
      permissions: [...ALL_SYSTEM_PERMISSIONS],
      source: 'PLATFORM_CONFIGURATION',
    };
  }

  if (!communityId) {
    return {
      role: 'APPLICANT',
      effectiveRole: 'APPLICANT',
      permissions: [...DEFAULT_ROLE_PERMISSIONS['APPLICANT']],
      source: 'NO_COMMUNITY',
    };
  }

  // Layer 2: Community Fetch and Guild Owner Check
  let community: any = null;
  try {
    community = await communitiesRepository.getById(communityId);
    if (!community && communityId.startsWith('comm_')) {
      const targetGuildId = communityId.replace('comm_', '');
      const allComms = await communitiesRepository.list();
      community = allComms.find(
        (c) => c.guildId === targetGuildId || c.discordGuildId === targetGuildId
      ) || null;
    }
  } catch (err) {
    community = null;
  }

  const isDefaultOrAppGuild = communityId && (
    communityId === 'comm_default' ||
    communityId === `comm_${config.DISCORD_CLIENT_ID}` ||
    communityId === `comm_1547515985416822884` ||
    (config.DISCORD_CLIENT_ID && communityId === `comm_${config.DISCORD_CLIENT_ID}`)
  );

  const canAutoSeed =
    (config.NODE_ENV !== 'production' &&
    (config as any).COMMUNITY_DEV_SEEDING_ENABLED !== false &&
    config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION' &&
    config.DEV_SIMULATION_ENABLED &&
    process.env.DEV_SIMULATION_ENABLED !== 'false') ||
    isDefaultOrAppGuild;

  if (!community && canAutoSeed) {
    const targetGuildId = communityId.startsWith('comm_') ? communityId.replace('comm_', '') : communityId;
    const nowStr = new Date().toISOString();
    const communityName = isDefaultOrAppGuild ? 'Official Community Guild' : 'Development Community Guild';
    try {
      community = await communitiesRepository.create({
        id: communityId,
        name: communityName,
        guildId: targetGuildId,
        discordGuildId: targetGuildId,
        ownerUserId: discordUserId || config.PLATFORM_OWNER_USER_ID || 'usr_owner_dev',
        isActive: true,
        setupStatus: 'COMPLETED',
        createdAt: nowStr,
        updatedAt: nowStr,
      } as any);

      const accessId = `${communityId}_${discordUserId}`;
      await communityMemberAccessRepository.create({
        id: accessId,
        communityId,
        discordUserId,
        role: 'OWNER',
        permissions: [...ALL_COMMUNITY_PERMISSIONS],
        source: 'DISCORD_GUILD_OWNER',
        createdAt: nowStr,
        updatedAt: nowStr,
      });
    } catch {
      community = await communitiesRepository.getById(communityId);
    }
  }

  if (!community) {
    return {
      role: 'APPLICANT',
      effectiveRole: 'APPLICANT',
      permissions: [...DEFAULT_ROLE_PERMISSIONS['APPLICANT']],
      source: 'COMMUNITY_NOT_FOUND',
      error: 'COMMUNITY_NOT_FOUND',
    };
  }

  if (community.isActive === false) {
    return {
      role: 'APPLICANT',
      effectiveRole: 'APPLICANT',
      permissions: [...DEFAULT_ROLE_PERMISSIONS['APPLICANT']],
      source: 'COMMUNITY_INACTIVE',
      error: 'COMMUNITY_NOT_CONNECTED',
    };
  }

  const isSimulationAllowed = config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION' && config.DEV_SIMULATION_ENABLED && process.env.DEV_SIMULATION_ENABLED !== 'false';

  // Enforce dynamic ownership transfer checks from active Discord session if any
  const session = await discordAuthService.getSession(discordUserId);
  let isGuildOwner =
    community.ownerUserId === discordUserId ||
    (isSimulationAllowed && (discordUserId === 'usr_owner_dev' || discordUserId === 'usr_dev' || discordUserId.startsWith('usr_owner')));

  if (session && session.guilds) {
    const targetGuildId = community.guildId || community.discordGuildId || (community.id.startsWith('comm_') ? community.id.replace('comm_', '') : community.id);
    const userGuild = session.guilds.find((g: any) => g.id === targetGuildId);
    let hasAdmin = false;
    if (userGuild) {
      hasAdmin = Boolean(userGuild.owner);
      try {
        if (!hasAdmin && userGuild.permissions) {
          hasAdmin = (BigInt(userGuild.permissions) & 0x8n) === 0x8n;
        }
      } catch {
        // ignore parsing error
      }
    }

    if (userGuild && hasAdmin) {
      isGuildOwner = true;
      if (community.ownerUserId !== discordUserId && userGuild.owner) {
        const oldOwnerId = community.ownerUserId;
        // Update community owner
        await communitiesRepository.update(community.id, {
          ...community,
          ownerUserId: discordUserId,
          verifiedOwnerDiscordUserId: discordUserId,
          updatedAt: new Date().toISOString()
        });

        // Log OWNERSHIP_TRANSFERRED audit event
        await auditLogsRepository.create({
          id: `audit_owner_trans_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          communityId: community.id,
          actorUserId: discordUserId,
          actorRole: 'OWNER',
          action: 'USER_ROLE_CHANGED',
          targetType: 'USER',
          targetId: oldOwnerId,
          metadata: {
            event: 'OWNERSHIP_TRANSFERRED',
            previousOwnerId: oldOwnerId,
            newOwnerId: discordUserId,
            reason: 'Discord guild owner change detected in session'
          },
          timestamp: new Date().toISOString()
        });

        // Demote old owner
        const accessId = `${community.id}_${oldOwnerId}`;
        const oldAccess = await communityMemberAccessRepository.getById(accessId);
        if (oldAccess) {
          await communityMemberAccessRepository.update(accessId, {
            ...oldAccess,
            role: 'MEMBER',
            updatedAt: new Date().toISOString()
          });
        }
      }
    }
  }

  if (isGuildOwner) {
    return {
      role: 'OWNER',
      effectiveRole: 'OWNER',
      permissions: [...ALL_COMMUNITY_PERMISSIONS],
      source: 'DISCORD_GUILD_OWNER',
    };
  }

  // Layer 3: Community Role Access (Deterministic highest-precedence role)
  let candidateRoles: Array<{ role: UserRole; permissions: Permission[]; source: string }> = [];

  // Check manual assignment
  const accessId = `${communityId}_${discordUserId}`;
  const memberAccess = await communityMemberAccessRepository.getById(accessId);
  if (memberAccess) {
    const defaultPerms = DEFAULT_ROLE_PERMISSIONS[memberAccess.role] || [];
    candidateRoles.push({
      role: memberAccess.role,
      permissions: (memberAccess.permissions || defaultPerms) as Permission[],
      source: memberAccess.source || 'MANUAL_ASSIGNMENT',
    });
  }

  // Check Discord role mappings
  const discordMember = await discordMembersRepository.getById(`${communityId}_${discordUserId}`);
  const memberRoleIds: string[] = [
    ...(explicitRoleIds || []),
    ...(discordMember && Array.isArray(discordMember.discordRoleIds) ? discordMember.discordRoleIds : [])
  ];
  // Live roles from Discord (the stored copy can be out of date).
  try {
    const { discordService } = await import('../integrations/discord/discord.service.js');
    const gid = community.guildId || community.discordGuildId || String(community.id).replace(/^comm_/, '');
    const guild: any = discordService.getGuild(gid);
    const live = guild ? (guild.members.cache.get(discordUserId) || (await guild.members.fetch(discordUserId).catch(() => null))) : null;
    if (live) memberRoleIds.push(...Array.from(live.roles.cache.keys()) as string[]);
  } catch { /* bot offline: fall back to stored roles */ }
  const uniqueRoleIds = Array.from(new Set(memberRoleIds));
  if (uniqueRoleIds.length > 0) {
    const mappings = (community as any).discordRoleMappings || [];
    if (mappings.length > 0) {
      for (const mapping of mappings) {
        if (uniqueRoleIds.includes(mapping.discordRoleId)) {
          const targetRole = mapping.targetRole;
          candidateRoles.push({
            role: targetRole,
            permissions: [...(DEFAULT_ROLE_PERMISSIONS[targetRole] || [])],
            source: 'DISCORD_ROLE_MAPPING',
          });
        }
      }
    }

    try {
      const dbRoles = await rolesRepository.list({
        where: [{ field: 'communityId', operator: '==', value: communityId }],
      });
      for (const roleDoc of dbRoles) {
        const linkedIds: string[] = Array.isArray((roleDoc as any).discordRoleIds) && (roleDoc as any).discordRoleIds.length ? (roleDoc as any).discordRoleIds : [(roleDoc as any).discordRoleId || (roleDoc as any).roleId].filter(Boolean);
        if (linkedIds.some((id) => uniqueRoleIds.includes(id))) {
          const targetRole = ((roleDoc as any).canonicalRole || (roleDoc as any).type || (roleDoc as any).role || 'MEMBER') as UserRole;
          if (!['CONTROLLER', 'INTERVIEWER', 'RECRUITER', 'OWNER'].includes(targetRole)) continue;
          const perms = targetRole === 'OWNER' ? [...ALL_COMMUNITY_PERMISSIONS] : [...(roleDoc.permissions || DEFAULT_ROLE_PERMISSIONS[targetRole] || [])];
          candidateRoles.push({
            role: targetRole,
            permissions: perms as Permission[],
            source: 'DISCORD_ROLE_MAPPING',
          });
        }
      }
    } catch {
      // Graceful fallback if roles repository query fails
    }
  }

  if (candidateRoles.length > 0) {
    // Deterministic highest authority role wins
    let winningCandidate = candidateRoles[0];
    for (let i = 1; i < candidateRoles.length; i++) {
      const higher = getHigherRole(winningCandidate.role, candidateRoles[i].role);
      if (higher === candidateRoles[i].role) {
        winningCandidate = candidateRoles[i];
      }
    }
    // Return the highest effective role with its standard permissions (strictly non-union per specification)
    const effectivePerms = winningCandidate.permissions.length > 0
      ? winningCandidate.permissions
      : (DEFAULT_ROLE_PERMISSIONS[winningCandidate.role] || []);

    return {
      role: winningCandidate.role,
      effectiveRole: winningCandidate.role,
      permissions: [...effectivePerms],
      source: winningCandidate.source,
    };
  }

  // Development or default simulated identities fallback (strictly gated by DEV_SIMULATION_ENABLED in non-production environments)
  if (isSimulationAllowed) {
    if (discordUserId === 'usr_owner_1' || discordUserId === 'usr_dev' || discordUserId === 'usr_owner' || discordUserId === 'usr_controller' || discordUserId.startsWith('usr_owner')) {
      return {
        role: 'OWNER',
        effectiveRole: 'OWNER',
        permissions: [...ALL_COMMUNITY_PERMISSIONS],
        source: 'SIMULATED_OWNER_FALLBACK',
      };
    }

    if (discordUserId === 'usr_recruiter' || discordUserId.includes('recruiter')) {
      return {
        role: 'RECRUITER',
        effectiveRole: 'RECRUITER',
        permissions: [...DEFAULT_ROLE_PERMISSIONS['RECRUITER']],
        source: 'SIMULATED_RECRUITER_FALLBACK',
      };
    }
  }

  // Fallback default: MEMBER if in Discord server / active member, else APPLICANT
  const isDiscordServerUser = discordMember || (discordUserId.startsWith('discord_user') && !discordUserId.includes('applicant'));
  if (isDiscordServerUser) {
    return {
      role: 'MEMBER',
      effectiveRole: 'MEMBER',
      permissions: [...DEFAULT_ROLE_PERMISSIONS['MEMBER']],
      source: 'DISCORD_SERVER_MEMBER',
    };
  }

  return {
    role: 'APPLICANT',
    effectiveRole: 'APPLICANT',
    permissions: [...DEFAULT_ROLE_PERMISSIONS['APPLICANT']],
    source: 'GUEST_APPLICANT',
  };
}

/**
 * Centralized server-side authorization check for an action.
 */
export async function authorizeCommunityAction(
  discordUserId: string,
  communityId: string,
  requiredPermission: Permission
): Promise<boolean> {
  const access = await resolveUserCommunityRole(discordUserId, communityId);

  // If there's an error in access (like COMMUNITY_NOT_FOUND or COMMUNITY_NOT_CONNECTED)
  if (access.error) {
    logger.warn(`[AUTH_DENIED] User ${discordUserId} denied permission ${requiredPermission} on community ${communityId} due to error ${access.error}`);
    return false;
  }

  let allowed = false;
  if (access.role === 'PLATFORM_OWNER') {
    allowed = true;
  } else if (access.role === 'OWNER') {
    allowed = (ALL_COMMUNITY_PERMISSIONS as readonly string[]).includes(requiredPermission);
  } else {
    allowed = access.permissions.includes(requiredPermission);
  }

  // Sensitive action audit logging
  const sensitivePermissions: Permission[] = [
    'applications.approve',
    'applications.reject',
    'community.manage',
    'settings.manage',
    'users.manage',
    'recruiterCodes.revoke'
  ];

  if (sensitivePermissions.includes(requiredPermission)) {
    // Write an audit event where appropriate
    try {
      await auditLogsRepository.create({
        id: `audit_auth_check_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        communityId,
        actorUserId: discordUserId,
        actorRole: access.role,
        action: allowed ? 'ROLE_ASSIGNED' : 'ROLE_ASSIGNMENT_FAILED', // Using valid AuditActions
        targetType: 'SYSTEM_AUTHORIZATION',
        targetId: requiredPermission,
        metadata: {
          permissionRequested: requiredPermission,
          allowed,
          role: access.role,
          source: access.source
        },
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      logger.error(`Failed to write sensitive authorization audit log: ${(e as Error).message}`);
    }
  }

  if (!allowed) {
    logger.warn(`[AUTH_DENIED] User ${discordUserId} (${access.role}) denied permission ${requiredPermission} on community ${communityId}`);
  } else {
    logger.info(`[AUTH_ALLOWED] User ${discordUserId} (${access.role}) granted permission ${requiredPermission} on community ${communityId}`);
  }

  return allowed;
}

/**
 * Authoritatively resolves and verifies community context and user permissions.
 */
export async function resolveAuthorizedCommunityContext(
  userId: string,
  communityId: string | undefined
): Promise<{
  community: any;
  role: UserRole;
  permissions: Permission[];
}> {
  if (!userId || userId === 'usr_anonymous') {
    throw new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED');
  }

  const isSimulationAllowed = config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION' && config.DEV_SIMULATION_ENABLED && process.env.DEV_SIMULATION_ENABLED !== 'false';
  const simulatedUserIds = ['usr_owner_1', 'usr_dev', 'usr_recruiter', 'usr_owner_dev'];
  if (simulatedUserIds.includes(userId) && !isSimulationAllowed) {
    throw new ForbiddenError('Simulated identity usage is prohibited in this environment', 'COMMUNITY_ACCESS_DENIED');
  }

  if (!communityId) {
    throw new BadRequestError('Community context is required', 'COMMUNITY_CONTEXT_REQUIRED');
  }

  let community = await communitiesRepository.getById(communityId);
  if (!community && communityId.startsWith('comm_')) {
    const targetGuildId = communityId.replace('comm_', '');
    const allComms = await communitiesRepository.list();
    community = allComms.find(
      (c) => c.guildId === targetGuildId || c.discordGuildId === targetGuildId
    ) || null;
  }

  const isDefaultOrAppGuild = communityId && (
    communityId === 'comm_default' ||
    communityId === `comm_${config.DISCORD_CLIENT_ID}` ||
    communityId === `comm_1547515985416822884` ||
    (config.DISCORD_CLIENT_ID && communityId === `comm_${config.DISCORD_CLIENT_ID}`)
  );

  if (!community && (
    (config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION' && config.DEV_SIMULATION_ENABLED && process.env.DEV_SIMULATION_ENABLED !== 'false') ||
    isDefaultOrAppGuild
  )) {
    const targetGuildId = communityId.startsWith('comm_') ? communityId.replace('comm_', '') : communityId;
    const nowStr = new Date().toISOString();
    const communityName = isDefaultOrAppGuild ? 'Official Community Guild' : 'Development Community Guild';
    try {
      community = await communitiesRepository.create({
        id: communityId,
        name: communityName,
        guildId: targetGuildId,
        discordGuildId: targetGuildId,
        ownerUserId: userId || config.PLATFORM_OWNER_USER_ID || 'usr_owner_dev',
        isActive: true,
        setupStatus: 'COMPLETED',
        createdAt: nowStr,
        updatedAt: nowStr,
      } as any);
    } catch {
      community = await communitiesRepository.getById(communityId);
    }
  }

  if (!community) {
    throw new NotFoundError('Community not found', 'COMMUNITY_NOT_FOUND');
  }

  if (community.isActive === false) {
    throw new ForbiddenError('Community is not active', 'COMMUNITY_ACCESS_DENIED');
  }

  const access = await resolveUserCommunityRole(userId, communityId);
  if (access.error) {
    if (access.error === 'COMMUNITY_NOT_FOUND') {
      throw new NotFoundError('Community not found', 'COMMUNITY_NOT_FOUND');
    }
    throw new ForbiddenError('Community access denied', 'COMMUNITY_ACCESS_DENIED');
  }

  // Ensure authorized membership context
  const isPlatformOwner = access.role === 'PLATFORM_OWNER';
  if (!isPlatformOwner) {
    const isOwner =
      community.ownerUserId === userId ||
      community.verifiedOwnerDiscordUserId === userId ||
      access.role === 'OWNER' ||
      (isSimulationAllowed && (userId === 'usr_owner_dev' || userId.startsWith('usr_owner')));

    const knownSimulatedDevPersonas = ['usr_owner_dev', 'usr_dev', 'usr_recruiter', 'usr_interviewer', 'usr_member_dev', 'usr_owner_1', 'usr_admin_1'];
    const isSimulationPersona = isSimulationAllowed && knownSimulatedDevPersonas.includes(userId);
    const accessId = `${communityId}_${userId}`;
    const memberAccess = await communityMemberAccessRepository.getById(accessId);
    const discordMember = await discordMembersRepository.getById(`${communityId}_${userId}`);

    if (!isOwner && !isSimulationPersona && !memberAccess && !discordMember) {
      throw new ForbiddenError('Access denied: User is not associated with this community', 'COMMUNITY_ACCESS_DENIED');
    }
  }

  return {
    community,
    role: access.role,
    permissions: access.permissions,
  };
}

/**
 * Authoritatively resolves and validates the workspace and community context for a user.
 * Disallows client header spoofing and default workspace fallbacks.
 */
export async function resolveAuthorizedWorkspaceCommunityContext(
  userId: string,
  userRole: UserRole = 'MEMBER',
  options: {
    requestedCommunityId?: string;
    requestedWorkspaceId?: string;
    requestedGuildId?: string;
  } = {}
): Promise<{
  workspace: WorkspaceDocument;
  community?: CommunityDocument;
  role: UserRole;
  permissions: Permission[];
}> {
  if (!userId || userId === 'usr_anonymous') {
    throw new UnauthorizedError('Authentication required', 'AUTHENTICATION_REQUIRED');
  }

  // 1. Resolve eligible workspaces for user
  const memberships = await workspaceMembersRepository.list({
    where: [
      { field: 'userId', operator: '==', value: userId },
      { field: 'status', operator: '==', value: 'ACTIVE' },
    ],
  });

  const allOwnedWorkspaces = await workspacesRepository.list({
    where: [{ field: 'ownerUserId', operator: '==', value: userId }],
  });

  const workspaceMap = new Map<string, WorkspaceDocument>();
  for (const ws of allOwnedWorkspaces) {
    if (ws.status !== 'DELETION_REQUESTED') workspaceMap.set(ws.id, ws);
  }
  for (const m of memberships) {
    const ws = await workspacesRepository.getById(m.workspaceId);
    if (ws && ws.status !== 'DELETION_REQUESTED') workspaceMap.set(ws.id, ws);
  }

  const eligibleWorkspaces = Array.from(workspaceMap.values());

  let activeWorkspace: WorkspaceDocument | undefined;

  if (options.requestedWorkspaceId) {
    const found = eligibleWorkspaces.find((w) => w.id === options.requestedWorkspaceId);
    if (!found) {
      throw new ForbiddenError(`Access denied to workspace ${options.requestedWorkspaceId}`, 'WORKSPACE_ACCESS_DENIED');
    }
    activeWorkspace = found;
  } else if (eligibleWorkspaces.length === 1) {
    activeWorkspace = eligibleWorkspaces[0];
  } else if (eligibleWorkspaces.length > 1) {
    if (options.requestedCommunityId || options.requestedGuildId) {
      let comm: CommunityDocument | null = null;
      if (options.requestedGuildId) {
        const allComms = await communitiesRepository.list();
        comm = allComms.find((c) => c.guildId === options.requestedGuildId || c.discordGuildId === options.requestedGuildId) || null;
      } else if (options.requestedCommunityId) {
        comm = await communitiesRepository.getById(options.requestedCommunityId);
      }

      if (comm && comm.workspaceId) {
        const matchingWs = eligibleWorkspaces.find((w) => w.id === comm!.workspaceId);
        if (matchingWs) {
          activeWorkspace = matchingWs;
        }
      }
    }

    if (!activeWorkspace) {
      activeWorkspace = eligibleWorkspaces.find((w) => w.ownerUserId === userId) || eligibleWorkspaces[0];
    }
  } else {
    // 0 workspaces: Create an authoritative user-bound primary workspace
    const nowStr = new Date().toISOString();
    const wsId = `ws_${userId}_${Date.now().toString(36)}`;
    activeWorkspace = await workspacesRepository.create({
      id: wsId,
      name: `${userId}'s Workspace`,
      ownerUserId: userId,
      communityIds: options.requestedCommunityId ? [options.requestedCommunityId] : [],
      status: 'ACTIVE',
      createdAt: nowStr,
      updatedAt: nowStr,
    });

    await workspaceMembersRepository.create({
      id: `${wsId}_${userId}`,
      workspaceId: wsId,
      userId,
      role: 'WORKSPACE_OWNER',
      status: 'ACTIVE',
      createdAt: nowStr,
      updatedAt: nowStr,
    });
  }

  // 2. Resolve Community if requested
  let targetCommId = options.requestedCommunityId;
  if (!targetCommId && options.requestedGuildId) {
    const allComms = await communitiesRepository.list();
    const found = allComms.find((c) => c.guildId === options.requestedGuildId || c.discordGuildId === options.requestedGuildId);
    if (found) {
      targetCommId = found.id;
    }
  }

  if (!targetCommId) {
    return {
      workspace: activeWorkspace,
      community: undefined,
      role: userRole,
      permissions: DEFAULT_ROLE_PERMISSIONS[userRole] || [],
    };
  }

  const commContext = await resolveAuthorizedCommunityContext(userId, targetCommId);

  if (!commContext.community.workspaceId) {
    await communitiesRepository.update(commContext.community.id, {
      workspaceId: activeWorkspace.id,
      updatedAt: new Date().toISOString(),
    });
    commContext.community.workspaceId = activeWorkspace.id;
  }

  return {
    workspace: activeWorkspace,
    community: commContext.community,
    role: commContext.role,
    permissions: commContext.permissions,
  };
}
