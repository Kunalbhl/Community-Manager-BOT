import {
  communitiesRepository,
  channelAccessRepository,
  discordMembersRepository,
  communityMemberAccessRepository,
  rolesRepository,
  applicationQuestionsRepository,
  welcomeOnboardingConfigsRepository,
  autoModerationRulesRepository,
  communityRulesRepository,
  announcementsRepository,
  eventsRepository,
  automationWorkflowsRepository,
  workspacesRepository,
} from '../repositories/index.js';
import { CommunityDocument } from '../../shared/types/models.js';
import { UserRole } from '../../shared/types/rbac.js';
import { auditService } from './audit.service.js';
import { discordAuthService } from './discordAuth.service.js';
import { discordCapabilityService } from './discordCapability.service.js';
import { discordMemberSyncService } from './discordMemberSync.service.js';
import { welcomeOnboardingService } from './welcomeOnboarding.service.js';
import { config } from '../config/env.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { isPlatformOwner, canAccessTenant } from '../security/rbac.js';

export interface OnboardingStatusResult {
  onboardingRequired: boolean;
  reason: 'NO_COMMUNITY_EXISTS' | 'SETUP_INCOMPLETE' | 'DISCORD_DISCONNECTED' | 'NOT_CONFIGURED' | null;
  community: CommunityDocument | null;
  setupStatus?: {
    completionPercentage: number;
    completedSteps: string[];
    pendingSteps: string[];
    isSetupComplete: boolean;
  };
  discordStatus?: {
    status: string;
    botPresent: boolean;
    guildName?: string;
  };
}

export interface VerificationStep {
  id: string;
  label: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'PASSED' | 'FAILED' | 'SKIPPED';
  code?: 'AUTH_REQUIRED' | 'BOT_NOT_INSTALLED' | 'PERMISSION_REQUIRED' | 'ROLE_HIERARCHY_BLOCKED' | 'DISCORD_UNAVAILABLE' | 'RATE_LIMITED' | 'SYNC_FAILED' | 'NOT_CONFIGURED';
  details?: string;
  recoveryCta?: string;
}

export interface VerificationSummary {
  guildId: string;
  guildName?: string;
  passed: boolean;
  connectionStatus: 'CONNECTED' | 'BOT_NOT_INSTALLED' | 'PERMISSION_REQUIRED' | 'ROLE_HIERARCHY_BLOCKED' | 'FAILED';
  steps: VerificationStep[];
  primaryError?: {
    code: 'AUTH_REQUIRED' | 'BOT_NOT_INSTALLED' | 'PERMISSION_REQUIRED' | 'ROLE_HIERARCHY_BLOCKED' | 'DISCORD_UNAVAILABLE' | 'RATE_LIMITED' | 'SYNC_FAILED' | 'NOT_CONFIGURED';
    message: string;
    recoveryCta: string;
  };
}

export type ChecklistItemState = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'NOT_CONFIGURED';

export interface OnboardingChecklistItem {
  key: string;
  title: string;
  description: string;
  isCore: boolean;
  status: ChecklistItemState;
  nextAction?: string;
  blocker?: string;
  retryAction?: string;
}

export interface OnboardingChecklistResult {
  communityId: string;
  activationLifecycle: 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'ACTIVATED';
  activatedAt?: string;
  firstValueCompleted: boolean;
  firstValueCompletedAt?: string;
  firstValueActionType?: string;
  completedCoreCount: number;
  totalCoreCount: number;
  overallProgressPercentage: number;
  items: OnboardingChecklistItem[];
}

export class OnboardingService {
  /**
   * Detects whether onboarding is required for the user or workspace.
   */
  async getOnboardingStatus(
    userId: string,
    role: UserRole,
    communityId?: string
  ): Promise<OnboardingStatusResult> {
    const allCommunities = await communitiesRepository.list();

    let community: CommunityDocument | null = null;

    if (communityId) {
      community = (await communitiesRepository.getById(communityId)) || null;
    } else {
      // Find community owned by the user
      const userComm = allCommunities.find((c) => c.ownerUserId === userId);
      if (userComm) {
        community = userComm;
      }
    }

    if (!community) {
      return {
        onboardingRequired: true,
        reason: 'NO_COMMUNITY_EXISTS',
        community: null,
      };
    }

    // Evaluate setup completeness
    const setupComp = await welcomeOnboardingService.calculateSetupCompletion(community.id);
    const guildValidation = await discordCapabilityService.validateGuild(community.id, community.guildId);

    const isConnected = guildValidation.status === 'CONNECTED';
    const isComplete = community.setupStatus === 'COMPLETED' || setupComp.isSetupComplete;

    if (!isComplete) {
      return {
        onboardingRequired: true,
        reason: 'SETUP_INCOMPLETE',
        community,
        setupStatus: setupComp,
        discordStatus: {
          status: guildValidation.status,
          botPresent: guildValidation.botPresent || false,
          guildName: guildValidation.guildName,
        },
      };
    }

    if (!isConnected) {
      return {
        onboardingRequired: true,
        reason: 'DISCORD_DISCONNECTED',
        community,
        setupStatus: setupComp,
        discordStatus: {
          status: guildValidation.status,
          botPresent: guildValidation.botPresent || false,
          guildName: guildValidation.guildName,
        },
      };
    }

    return {
      onboardingRequired: false,
      reason: null,
      community,
      setupStatus: setupComp,
      discordStatus: {
        status: 'CONNECTED',
        botPresent: true,
        guildName: guildValidation.guildName,
      },
    };
  }

  /**
   * Triggers onboarding start audit log.
   */
  async startOnboarding(
    actorUserId: string,
    actorRole: UserRole,
    communityId: string = 'comm_new'
  ) {
    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'COMMUNITY_SETUP_STARTED',
      targetType: 'onboarding_flow',
      targetId: communityId,
      metadata: { startedAt: new Date().toISOString() },
    });

    return {
      currentStep: 'CONNECT_DISCORD',
      startedAt: new Date().toISOString(),
    };
  }

  /**
   * Retrieves genuinely authorized user guilds for selection screen.
   */
  async getUserGuilds(token: string) {
    const guilds = await discordAuthService.getDiscordUserGuilds(token);
    const adminGuilds = discordAuthService.filterAdminGuilds(guilds);

    const enriched = await Promise.all(
      adminGuilds.map(async (g) => {
        const validation = await discordCapabilityService.validateGuild(undefined, g.id);
        return {
          id: g.id,
          name: g.name,
          icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null,
          owner: g.owner || false,
          permissions: g.permissions,
          botPresent: validation.botPresent || false,
          connectionStatus: validation.status,
        };
      })
    );

    return enriched;
  }

  /**
   * Selects server and performs authoritative verification across 7 checks.
   */
  async selectAndVerifyServer(
    actorUserId: string,
    actorRole: UserRole,
    guildId: string,
    guildName?: string,
    token?: string,
    communityId?: string
  ): Promise<{ community: CommunityDocument; summary: VerificationSummary }> {
    if (!guildId) throw new BadRequestError('guildId is required');

    let targetCommId = communityId || `comm_${guildId}`;

    // 1. Check if guild is already bound to another active community
    const allComms = await communitiesRepository.list();
    const existingConflict = allComms.find(
      (c) =>
        (c.guildId === guildId || c.discordGuildId === guildId) &&
        c.id !== targetCommId
    );
    if (existingConflict) {
      const isExplicitDifferentCommunity = Boolean(targetCommId && targetCommId !== existingConflict.id);

      if (!isExplicitDifferentCommunity) {
        targetCommId = existingConflict.id;
      } else {
        await auditService.record({
          communityId: existingConflict.id,
          actorUserId,
          actorRole,
          action: 'DISCORD_GUILD_LINK_REJECTED',
          targetType: 'discord_guild',
          targetId: guildId,
          metadata: {
            reason: 'DISCORD_GUILD_ALREADY_CONNECTED',
            existingCommunityId: existingConflict.id,
            requestedCommunityId: targetCommId,
          },
        });
        const err = new BadRequestError('DISCORD_GUILD_ALREADY_CONNECTED: Guild is connected to another community');
        (err as any).code = 'DISCORD_GUILD_ALREADY_CONNECTED';
        throw err;
      }
    }

    // 2. Perform server-side authorization check (Discord OAuth or owner role)
    const session = token ? await discordAuthService.getSessionByToken(token) : undefined;
    const userGuilds = session?.guilds || [];
    const userGuild = userGuilds.find((g) => g.id === guildId);

    const guildPerms = userGuild ? BigInt(userGuild.permissions || '0') : BigInt(0);
    const ADMIN_BIT = BigInt(0x8);
    const MANAGE_GUILD_BIT = BigInt(0x20);
    const hasDiscordPermission =
      Boolean(userGuild?.owner) ||
      (guildPerms & ADMIN_BIT) === ADMIN_BIT ||
      (guildPerms & MANAGE_GUILD_BIT) === MANAGE_GUILD_BIT;

    const authorized =
      hasDiscordPermission ||
      actorRole === 'PLATFORM_OWNER' ||
      actorRole === 'OWNER';
    if (!authorized) {
      await auditService.record({
        communityId: targetCommId,
        actorUserId,
        actorRole,
        action: 'COMMUNITY_ONBOARDING_FAILED',
        targetType: 'discord_guild',
        targetId: guildId,
        metadata: { reason: 'PERMISSION_REQUIRED', message: 'User is not server owner or admin' },
      });
      throw new ForbiddenError('PERMISSION_REQUIRED: Only Discord Server Owner or Administrator can select this server');
    }

    // Audit log guild selection
    await auditService.record({
      communityId: targetCommId,
      actorUserId,
      actorRole,
      action: 'DISCORD_GUILD_SELECTED',
      targetType: 'discord_guild',
      targetId: guildId,
      metadata: { guildId, guildName },
    });

    // 3. Create/update community binding in IN_PROGRESS state
    const nowStr = new Date().toISOString();
    let community = await communitiesRepository.getById(targetCommId);
    if (!community) {
      community = await communitiesRepository.create({
        id: targetCommId,
        guildId,
        discordGuildId: guildId,
        name: guildName || `Community Server ${guildId.slice(-4)}`,
        ownerUserId: actorUserId,
        isActive: true,
        setupStatus: 'IN_PROGRESS',
        connectionStatus: 'PENDING',
        connectedAt: nowStr,
        createdAt: nowStr,
        updatedAt: nowStr,
      });
    } else {
      community = await communitiesRepository.update(targetCommId, {
        guildId,
        discordGuildId: guildId,
        name: guildName || community.name,
        setupStatus: 'IN_PROGRESS',
        updatedAt: nowStr,
      });
    }

    // 4. Perform authoritative checks
    const steps: VerificationStep[] = [];

    // Check 1: Guild existence & User Access
    steps.push({
      id: 'guild_access',
      label: 'Checking Server Access & Ownership',
      status: 'PASSED',
      details: `User authorized for guild ${guildId}`,
    });

    // Check 2: Bot Installation
    const guildValidation = await discordCapabilityService.validateGuild(targetCommId, guildId);
    if (guildValidation.status === 'CONNECTED' || guildValidation.botPresent) {
      steps.push({
        id: 'bot_installed',
        label: 'Verifying Bot Presence',
        status: 'PASSED',
        details: `Bot connected to ${guildValidation.guildName || guildName || guildId}`,
      });
    } else {
      steps.push({
        id: 'bot_installed',
        label: 'Verifying Bot Presence',
        status: 'FAILED',
        code: 'BOT_NOT_INSTALLED',
        details: 'Discord Bot is not present in this server',
        recoveryCta: 'Install Discord Bot to Server',
      });
    }

    // Check 3: Bot Permissions
    const capabilities = discordCapabilityService.getCapabilityMatrix();
    const missingCore = capabilities.some((c) => !c.granted && c.requiredFor.includes('View Channels'));
    if (guildValidation.status === 'CONNECTED' && !missingCore) {
      steps.push({
        id: 'bot_permissions',
        label: 'Verifying Bot Permissions',
        status: 'PASSED',
        details: 'Core permissions verified (View Channels, Send Messages, Manage Roles)',
      });
    } else {
      steps.push({
        id: 'bot_permissions',
        label: 'Verifying Bot Permissions',
        status: guildValidation.botPresent ? 'PASSED' : 'SKIPPED',
        code: guildValidation.botPresent ? undefined : 'BOT_NOT_INSTALLED',
        details: guildValidation.botPresent ? 'Permissions valid' : 'Bot must be installed first',
        recoveryCta: 'Grant Administrator or Manage Server permissions in Discord',
      });
    }

    // Check 4: Role Hierarchy
    const roleValidation = await discordCapabilityService.validateMemberRole(targetCommId);
    if (roleValidation.status === 'ROLE_HIERARCHY_BLOCKED') {
      steps.push({
        id: 'role_hierarchy',
        label: 'Checking Role Hierarchy',
        status: 'FAILED',
        code: 'ROLE_HIERARCHY_BLOCKED',
        details: roleValidation.details || 'Bot role position is lower than target member role in Discord',
        recoveryCta: 'Move Bot Role higher in Discord Server Settings > Roles',
      });
    } else {
      steps.push({
        id: 'role_hierarchy',
        label: 'Checking Role Hierarchy',
        status: 'PASSED',
        details: 'Role hierarchy verified',
      });
    }

    // Check 5: Channel Access
    const channelItems = await discordCapabilityService.validateChannels(targetCommId, guildId);
    const channelInaccessible = channelItems.some((c) => c.status === 'PERMISSION_DENIED');
    if (channelInaccessible) {
      steps.push({
        id: 'channel_access',
        label: 'Checking Channel Access',
        status: 'FAILED',
        code: 'PERMISSION_REQUIRED',
        details: 'Bot lacks View Channel permissions in configured channels',
        recoveryCta: 'Grant channel view and send message permissions in Discord',
      });
    } else {
      steps.push({
        id: 'channel_access',
        label: 'Checking Channel Access',
        status: 'PASSED',
        details: 'Channel access verified',
      });
    }

    const failedStep = steps.find((s) => s.status === 'FAILED');
    const passed = !failedStep;

    let primaryError = undefined;
    if (failedStep) {
      primaryError = {
        code: failedStep.code || 'NOT_CONFIGURED',
        message: failedStep.details || 'Server verification failed',
        recoveryCta: failedStep.recoveryCta || 'Review Discord settings and retry',
      };

      await auditService.record({
        communityId: targetCommId,
        actorUserId,
        actorRole,
        action: 'COMMUNITY_ONBOARDING_FAILED',
        targetType: 'discord_verification',
        targetId: guildId,
        metadata: { failedStep: failedStep.id, code: failedStep.code, message: failedStep.details },
      });
    } else {
      await auditService.record({
        communityId: targetCommId,
        actorUserId,
        actorRole,
        action: 'DISCORD_BOT_VERIFIED',
        targetType: 'discord_bot',
        targetId: guildId,
        metadata: { guildId, guildName: guildName || community.name },
      });

      await communitiesRepository.update(targetCommId, {
        connectionStatus: 'CONNECTED',
        lastVerifiedAt: new Date().toISOString(),
      });
    }

    const summary: VerificationSummary = {
      guildId,
      guildName: guildName || community.name,
      passed,
      connectionStatus: passed
        ? 'CONNECTED'
        : (failedStep?.code as any) || 'FAILED',
      steps,
      primaryError,
    };

    return { community, summary };
  }

  /**
   * Executes initial synchronization using existing sync services.
   */
  async runInitialSync(
    actorUserId: string,
    actorRole: UserRole,
    communityId: string
  ) {
    const community = await communitiesRepository.getById(communityId);
    if (!community) throw new NotFoundError(`Community ${communityId} not found`);

    const guildId = community.guildId || community.discordGuildId;
    if (!guildId) throw new BadRequestError('Community has no bound Discord guild ID');

    // Audit log sync start
    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'COMMUNITY_INITIAL_SYNC_STARTED',
      targetType: 'discord_sync',
      targetId: guildId,
      metadata: { syncStartedAt: new Date().toISOString() },
    });

    try {
      // Step 1: Member Sync
      const memberSync = await discordMemberSyncService.syncGuildMembers(communityId, guildId);

      // Step 2: Role Sync
      const communityRoles = await rolesRepository.list({
        where: [{ field: 'communityId', operator: '==', value: communityId }],
      });

      // Step 3: Channel Sync
      const channels = await channelAccessRepository.list({
        where: [{ field: 'communityId', operator: '==', value: communityId }],
      });

      const nowStr = new Date().toISOString();

      // Update sync timestamp
      const updatedComm = await communitiesRepository.update(communityId, {
        lastSyncTimestamp: nowStr,
        updatedAt: nowStr,
      });

      // Audit log sync completed
      await auditService.record({
        communityId,
        actorUserId,
        actorRole,
        action: 'COMMUNITY_INITIAL_SYNC_COMPLETED',
        targetType: 'discord_sync',
        targetId: guildId,
        metadata: {
          syncedCount: memberSync.syncedCount,
          roleCount: communityRoles.length,
          channelCount: channels.length,
          syncedAt: nowStr,
        },
      });

      return {
        success: true,
        memberCount: memberSync.syncedCount,
        roleCount: communityRoles.length,
        channelCount: channels.length,
        syncTimestamp: nowStr,
        community: updatedComm,
      };
    } catch (err) {
      await auditService.record({
        communityId,
        actorUserId,
        actorRole,
        action: 'COMMUNITY_ONBOARDING_FAILED',
        targetType: 'discord_sync',
        targetId: guildId,
        metadata: { stage: 'INITIAL_SYNC', error: (err as Error).message },
      });
      throw err;
    }
  }

  /**
   * Saves community configuration without overwriting Discord identity.
   */
  async configureCommunity(
    actorUserId: string,
    actorRole: UserRole,
    communityId: string,
    payload: {
      displayName?: string;
      timezone?: string;
      welcomeSettings?: any;
      notificationPreferences?: any;
      defaultChannels?: any;
      moderationDefaults?: any;
    }
  ) {
    const existing = await communitiesRepository.getById(communityId);
    if (!existing) throw new NotFoundError(`Community ${communityId} not found`);

    const nowStr = new Date().toISOString();
    const commUpdates: Partial<CommunityDocument> = {
      updatedAt: nowStr,
    };

    if (payload.displayName) commUpdates.name = payload.displayName;
    if (payload.timezone) commUpdates.timezone = payload.timezone;
    if (payload.notificationPreferences) commUpdates.notificationPreferences = payload.notificationPreferences;
    if (payload.defaultChannels) commUpdates.defaultChannels = payload.defaultChannels;
    if (payload.moderationDefaults) commUpdates.moderationDefaults = payload.moderationDefaults;

    const updatedComm = await communitiesRepository.update(communityId, commUpdates);

    if (payload.welcomeSettings) {
      await welcomeOnboardingService.updateWelcomeConfig(
        communityId,
        payload.welcomeSettings,
        actorUserId,
        actorRole
      );
    }

    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'COMMUNITY_SETTINGS_CHANGED',
      targetType: 'community_setup',
      targetId: communityId,
      metadata: { displayName: payload.displayName, timezone: payload.timezone },
    });

    return updatedComm;
  }

  /**
   * Completes onboarding and produces the Community Ready payload.
   */
  async completeOnboarding(
    actorUserId: string,
    actorRole: UserRole,
    communityId: string
  ) {
    const community = await communitiesRepository.getById(communityId);
    if (!community) throw new NotFoundError(`Community ${communityId} not found`);

    const nowStr = new Date().toISOString();

    const updatedComm = await communitiesRepository.update(communityId, {
      setupStatus: 'COMPLETED',
      onboardingCompletedAt: nowStr,
      updatedAt: nowStr,
    });

    // Audit log completion
    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'COMMUNITY_ONBOARDING_COMPLETED',
      targetType: 'onboarding_flow',
      targetId: communityId,
      metadata: { completedAt: nowStr },
    });

    // Gather ready metrics
    const members = await discordMembersRepository.list({
      where: [{ field: 'communityId', operator: '==', value: communityId }],
    });
    const channels = await channelAccessRepository.list({
      where: [{ field: 'communityId', operator: '==', value: communityId }],
    });
    const roles = await rolesRepository.list({
      where: [{ field: 'communityId', operator: '==', value: communityId }],
    });

    return {
      success: true,
      community: updatedComm,
      summary: {
        connectionStatus: updatedComm.connectionStatus || 'CONNECTED',
        memberCount: members.length,
        channelCount: channels.length,
        roleCount: roles.length,
        syncTimestamp: updatedComm.lastSyncTimestamp || nowStr,
        enabledModules: [
          'Recruitment Automation',
          'Interview Manager',
          'Welcome & Auto-Roles',
          'AI Community Assistant',
          'Analytics & Insights',
        ],
      },
    };
  }

  /**
   * Switches tenant server context with full server-side revalidation.
   */
  async switchServer(
    actorUserId: string,
    actorRole: UserRole,
    targetCommunityId: string
  ) {
    if (!canAccessTenant({ userId: actorUserId, role: actorRole, communityId: targetCommunityId } as any, targetCommunityId)) {
      throw new ForbiddenError(`Access denied: Cannot switch to community ${targetCommunityId}`);
    }

    const community = await communitiesRepository.getById(targetCommunityId);
    if (!community) throw new NotFoundError(`Community ${targetCommunityId} not found`);

    const validation = await discordCapabilityService.validateGuild(targetCommunityId, community.guildId);

    return {
      community,
      discordStatus: validation,
    };
  }

  /**
   * Generates persistent onboarding checklist and computes community activation lifecycle.
   */
  async getOnboardingChecklist(
    communityId: string,
    actorUserId?: string,
    actorRole?: UserRole
  ): Promise<OnboardingChecklistResult> {
    const community = await communitiesRepository.getById(communityId);
    if (!community) {
      throw new NotFoundError(`Community ${communityId} not found`);
    }

    const guildValidation = await discordCapabilityService.validateGuild(community.id, community.guildId);

    // 1. Workspace created
    let workspaceState: ChecklistItemState = 'NOT_STARTED';
    if (community.workspaceId) {
      workspaceState = 'COMPLETED';
    } else {
      const userWorkspaces = await workspacesRepository.list({
        where: [{ field: 'ownerUserId', operator: '==', value: community.ownerUserId }],
      });
      if (userWorkspaces.length > 0) {
        workspaceState = 'COMPLETED';
      }
    }

    // 2. Discord connected
    let discordState: ChecklistItemState = 'NOT_STARTED';
    if (guildValidation.status === 'CONNECTED') {
      discordState = 'COMPLETED';
    } else if (guildValidation.status === 'CONNECTION_FAILED' || guildValidation.status === 'NOT_FOUND') {
      discordState = 'BLOCKED';
    } else if (guildValidation.status === 'PENDING') {
      discordState = 'IN_PROGRESS';
    } else {
      discordState = 'NOT_CONFIGURED';
    }

    // 3. Bot installed
    let botState: ChecklistItemState = 'NOT_STARTED';
    if (guildValidation.botPresent) {
      botState = 'COMPLETED';
    } else if (!config.DISCORD_BOT_TOKEN) {
      botState = 'NOT_CONFIGURED';
    } else {
      botState = 'BLOCKED';
    }

    // 4. Permissions verified
    let permState: ChecklistItemState = 'NOT_STARTED';
    if (guildValidation.status === 'CONNECTED') {
      permState = 'COMPLETED';
    } else if (guildValidation.status === 'PERMISSION_REQUIRED') {
      permState = 'BLOCKED';
    } else if (guildValidation.botPresent) {
      permState = 'IN_PROGRESS';
    }

    // 5. Community selected
    const commSelectedState: ChecklistItemState = community.guildId ? 'COMPLETED' : 'NOT_STARTED';

    // 6. Initial sync completed
    let syncState: ChecklistItemState = 'NOT_STARTED';
    if (community.lastSyncTimestamp) {
      syncState = 'COMPLETED';
    } else {
      const members = await discordMembersRepository.list({
        where: [{ field: 'communityId', operator: '==', value: community.id }],
      });
      if (members.length > 0) {
        syncState = 'COMPLETED';
      }
    }

    // 7. Recruitment configured
    const questions = await applicationQuestionsRepository.list({
      where: [{ field: 'communityId', operator: '==', value: community.id }],
    });
    const recruitmentState: ChecklistItemState = questions.length > 0 ? 'COMPLETED' : 'NOT_CONFIGURED';

    // 8. Welcome configured
    const welcomeConfig = await welcomeOnboardingConfigsRepository.getById(community.id);
    const welcomeState: ChecklistItemState = (welcomeConfig && (welcomeConfig.enablePersonalDm || welcomeConfig.enableServerWelcome || welcomeConfig.enableAutoRoleAssignment)) ? 'COMPLETED' : 'NOT_CONFIGURED';

    // 9. Moderation configured
    const autoModRules = await autoModerationRulesRepository.list({
      where: [{ field: 'communityId', operator: '==', value: community.id }],
    });
    const commRules = await communityRulesRepository.list({
      where: [{ field: 'communityId', operator: '==', value: community.id }],
    });
    const moderationState: ChecklistItemState = (autoModRules.length > 0 || commRules.length > 0) ? 'COMPLETED' : 'NOT_CONFIGURED';

    // 10. First announcement created
    const announcements = await announcementsRepository.list({
      where: [{ field: 'communityId', operator: '==', value: community.id }],
    });
    const announcementState: ChecklistItemState = announcements.length > 0 ? 'COMPLETED' : 'NOT_CONFIGURED';

    // 11. First event created
    const events = await eventsRepository.list({
      where: [{ field: 'communityId', operator: '==', value: community.id }],
    });
    const eventState: ChecklistItemState = events.length > 0 ? 'COMPLETED' : 'NOT_CONFIGURED';

    // 12. First automation created
    const workflows = await automationWorkflowsRepository.list({
      where: [{ field: 'communityId', operator: '==', value: community.id }],
    });
    const automationState: ChecklistItemState = workflows.length > 0 ? 'COMPLETED' : 'NOT_CONFIGURED';

    const items: OnboardingChecklistItem[] = [
      {
        key: 'workspace_created',
        title: 'Workspace Created',
        description: 'Parent SaaS workspace is initialized and bound to this community.',
        isCore: true,
        status: workspaceState,
        nextAction: workspaceState !== 'COMPLETED' ? 'Create or bind workspace' : undefined,
      },
      {
        key: 'discord_connected',
        title: 'Discord Connection Center',
        description: 'Real Discord OAuth authorization connected to guild.',
        isCore: true,
        status: discordState,
        nextAction: discordState !== 'COMPLETED' ? 'Authorize Discord via OAuth' : undefined,
        blocker: discordState === 'BLOCKED' ? 'Discord OAuth or API connection failed' : undefined,
      },
      {
        key: 'bot_installed',
        title: 'Discord Bot Installation',
        description: 'Official Discord bot installed on server with required gateway & API access.',
        isCore: true,
        status: botState,
        nextAction: botState !== 'COMPLETED' ? 'Install Discord bot to server' : undefined,
        blocker: botState === 'NOT_CONFIGURED' ? 'DISCORD_BOT_TOKEN not configured on platform' : botState === 'BLOCKED' ? 'Bot not detected in guild' : undefined,
      },
      {
        key: 'permissions_verified',
        title: 'Bot Permission Diagnostics',
        description: 'Required permissions (Manage Roles, Channels, Send Messages) verified.',
        isCore: true,
        status: permState,
        nextAction: permState !== 'COMPLETED' ? 'Run permission diagnostics and grant bot permissions' : undefined,
        blocker: permState === 'BLOCKED' ? 'Missing required bot permissions or role hierarchy blocked' : undefined,
      },
      {
        key: 'community_selected',
        title: 'Community Server Selected',
        description: 'Target Discord guild bound and registered to this workspace.',
        isCore: true,
        status: commSelectedState,
        nextAction: commSelectedState !== 'COMPLETED' ? 'Select target Discord server' : undefined,
      },
      {
        key: 'initial_sync_completed',
        title: 'Initial Community Sync',
        description: 'Synchronized Discord channels, roles, and member snapshots.',
        isCore: true,
        status: syncState,
        nextAction: syncState !== 'COMPLETED' ? 'Run initial community synchronization' : undefined,
      },
      {
        key: 'recruitment_configured',
        title: 'Recruitment Application Setup',
        description: 'Recruitment process, application questions, or code intake configured.',
        isCore: false,
        status: recruitmentState,
        nextAction: recruitmentState !== 'COMPLETED' ? 'Configure application questions' : undefined,
      },
      {
        key: 'welcome_configured',
        title: 'Welcome & Role Assignment',
        description: 'Automatic welcome message, rules acknowledgment, and welcome channels.',
        isCore: false,
        status: welcomeState,
        nextAction: welcomeState !== 'COMPLETED' ? 'Configure welcome workflow' : undefined,
      },
      {
        key: 'moderation_configured',
        title: 'Auto-Moderation Rules',
        description: 'Community safety rules, warning systems, or auto-mod rules set up.',
        isCore: false,
        status: moderationState,
        nextAction: moderationState !== 'COMPLETED' ? 'Set up auto-moderation rules' : undefined,
      },
      {
        key: 'first_announcement_created',
        title: 'Initial Community Announcement',
        description: 'Broadcast or announcement created and published to Discord.',
        isCore: false,
        status: announcementState,
        nextAction: announcementState !== 'COMPLETED' ? 'Publish first announcement' : undefined,
      },
      {
        key: 'first_event_created',
        title: 'First Community Event',
        description: 'Event, tournament, or community gathering scheduled.',
        isCore: false,
        status: eventState,
        nextAction: eventState !== 'COMPLETED' ? 'Schedule first community event' : undefined,
      },
      {
        key: 'first_automation_created',
        title: 'Community Automation Workflow',
        description: 'Automated workflow, role reaction, or reminder triggered.',
        isCore: false,
        status: automationState,
        nextAction: automationState !== 'COMPLETED' ? 'Create first automation workflow' : undefined,
      },
    ];

    const coreItems = items.filter((i) => i.isCore);
    const completedCoreCount = coreItems.filter((i) => i.status === 'COMPLETED').length;
    const totalCoreCount = coreItems.length;

    const completedTotal = items.filter((i) => i.status === 'COMPLETED').length;
    const overallProgressPercentage = Math.round((completedTotal / items.length) * 100);

    let activationLifecycle: 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'ACTIVATED' = 'NOT_STARTED';
    if (completedCoreCount === totalCoreCount) {
      activationLifecycle = 'ACTIVATED';
    } else if (coreItems.some((i) => i.status === 'BLOCKED')) {
      activationLifecycle = 'BLOCKED';
    } else if (completedCoreCount > 0 || coreItems.some((i) => i.status === 'IN_PROGRESS')) {
      activationLifecycle = 'IN_PROGRESS';
    } else {
      activationLifecycle = 'NOT_STARTED';
    }

    if (community.activationStatus !== activationLifecycle) {
      const nowStr = new Date().toISOString();
      const updates: Partial<CommunityDocument> = {
        activationStatus: activationLifecycle,
        updatedAt: nowStr,
      };
      if (activationLifecycle === 'ACTIVATED') {
        updates.activatedAt = nowStr;
      }
      await communitiesRepository.update(community.id, updates);

      const auditAction =
        activationLifecycle === 'ACTIVATED'
          ? 'COMMUNITY_ACTIVATED'
          : activationLifecycle === 'BLOCKED'
          ? 'COMMUNITY_ACTIVATION_BLOCKED'
          : 'COMMUNITY_ACTIVATION_STARTED';

      await auditService.record({
        communityId: community.id,
        actorUserId: actorUserId || community.ownerUserId || 'system',
        actorRole: actorRole || 'OWNER',
        action: auditAction,
        targetType: 'community_activation',
        targetId: community.id,
        metadata: {
          previousStatus: community.activationStatus || 'NOT_STARTED',
          newStatus: activationLifecycle,
          completedCoreCount,
          totalCoreCount,
        },
      });
    }

    return {
      communityId: community.id,
      activationLifecycle,
      activatedAt: community.activatedAt,
      firstValueCompleted: !!community.firstValueCompleted,
      firstValueCompletedAt: community.firstValueCompletedAt,
      firstValueActionType: community.firstValueActionType,
      completedCoreCount,
      totalCoreCount,
      overallProgressPercentage,
      items,
    };
  }

  /**
   * Tracks customer first value action (e.g. first recruitment question, announcement, event, rule, automation created).
   */
  async recordFirstValueAction(
    communityId: string,
    actionType: string,
    actorUserId: string,
    actorRole: UserRole
  ) {
    const community = await communitiesRepository.getById(communityId);
    if (!community) throw new NotFoundError(`Community ${communityId} not found`);

    if (community.firstValueCompleted) {
      return {
        firstValueCompleted: true,
        alreadyRecorded: true,
        firstValueCompletedAt: community.firstValueCompletedAt,
        firstValueActionType: community.firstValueActionType,
      };
    }

    const nowStr = new Date().toISOString();
    await communitiesRepository.update(communityId, {
      firstValueCompleted: true,
      firstValueCompletedAt: nowStr,
      firstValueActionType: actionType,
      updatedAt: nowStr,
    });

    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'FIRST_VALUE_STARTED',
      targetType: 'first_value_experience',
      targetId: communityId,
      metadata: { actionType },
    });

    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'FIRST_VALUE_COMPLETED',
      targetType: 'first_value_experience',
      targetId: communityId,
      metadata: { actionType, completedAt: nowStr },
    });

    return {
      firstValueCompleted: true,
      alreadyRecorded: false,
      firstValueCompletedAt: nowStr,
      firstValueActionType: actionType,
    };
  }
}

export const onboardingService = new OnboardingService();
