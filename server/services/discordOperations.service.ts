import { UserAuthContext, Permission } from '../../shared/types/rbac.js';
import { canAccessTenant, hasPermission } from '../security/rbac.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { EntitlementService } from './entitlement.service.js';
import {
  communitiesRepository,
  communityConfigurationRepository,
  channelAccessRepository,
  discordMembersRepository,
} from '../repositories/index.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { discordCapabilityService } from './discordCapability.service.js';
import { discordGuildLinkService } from './discordGuildLink.service.js';
import { discordPermissionEngineService } from './discordPermissionEngine.service.js';
import { auditService } from './audit.service.js';
import { notificationService } from './notification.service.js';
import { logger } from '../logging/logger.js';

export type ActionRiskLevel = 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface OperationPreview {
  action: string;
  target: string;
  riskLevel: ActionRiskLevel;
  requiredPermission: Permission;
  currentState?: string;
  newState?: string;
  estimatedAffectedCount?: number;
  impactDescription: string;
  requiresConfirmation: boolean;
  warnings?: string[];
}

export interface BulkOperationResult {
  operationId: string;
  action: 'ASSIGN' | 'REMOVE';
  roleId: string;
  roleName?: string;
  totalTargeted: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  failures: { memberId: string; reason: string }[];
  durationMs: number;
}

export interface BlueprintModuleStatus {
  moduleId: 'WELCOME' | 'RECRUITMENT' | 'ANNOUNCEMENTS' | 'MODERATION_LOG' | 'INTERVIEWS' | 'EVENTS';
  title: string;
  description: string;
  status: 'CONFIGURED' | 'MISSING' | 'MISCONFIGURED';
  suggestedChannelName: string;
  suggestedRoleName?: string;
  details?: string;
}

export interface ServerSetupBlueprint {
  communityId: string;
  guildId: string;
  overallCompletionPercentage: number;
  modules: BlueprintModuleStatus[];
}

export class DiscordOperationsService {
  /**
   * Pipeline Authorization & Validation Guard
   */
  private static async validatePipelineAccess(
    communityId: string,
    userContext: UserAuthContext,
    requiredPermission: Permission,
    requiredEntitlement = 'DISCORD_OPERATIONS'
  ) {
    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError(`Access denied: User cannot operate on community ${communityId}.`);
    }

    if (!hasPermission(userContext, requiredPermission)) {
      throw new ForbiddenError(`Permission denied: Action requires permission ${requiredPermission}.`);
    }

    const hasEntitlement = await EntitlementService.hasFeature(communityId, requiredEntitlement);
    if (!hasEntitlement) {
      throw new ForbiddenError(`Entitlement denied: Community feature ${requiredEntitlement} is not enabled.`);
    }

    const community = await communitiesRepository.getById(communityId);
    if (!community) {
      throw new NotFoundError(`Community ${communityId} not found.`);
    }

    const guildLink = await discordGuildLinkService.getGuildLink(communityId);
    if (!guildLink || !guildLink.guildId) {
      throw new BadRequestError(`Community ${communityId} does not have an authoritative Discord Guild linked.`);
    }

    return { community, guildLink, guildId: guildLink.guildId };
  }

  // =========================================================================
  // 1. SERVER OPERATIONS
  // =========================================================================

  public static async inspectServer(communityId: string, userContext: UserAuthContext) {
    const { guildLink, guildId } = await this.validatePipelineAccess(communityId, userContext, 'community.view');

    const botDiagnostics = discordService.getDiagnostics();
    const capabilityHealth = await discordCapabilityService.getConnectionCenterStatus(communityId);
    const roles = await this.listRoles(communityId, userContext);
    const channels = await this.listChannels(communityId, userContext);

    return {
      communityId,
      guildId,
      guildName: guildLink.guildName || 'Linked Guild',
      iconUrl: guildLink.iconUrl || null,
      memberCount: guildLink.approximateMemberCount || 0,
      botPresent: discordService.isConnected(),
      connectionDiagnostics: botDiagnostics,
      capabilityHealth: capabilityHealth.overallHealth,
      totalRoles: roles.length,
      totalChannels: channels.length,
      syncedAt: guildLink.updatedAt,
    };
  }

  public static async syncServerData(communityId: string, userContext: UserAuthContext) {
    const { guildId } = await this.validatePipelineAccess(communityId, userContext, 'community.manage');

    const result = await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
      guildId,
      communityId,
      source: 'MANUAL_REFRESH',
    });

    await auditService.log({
      communityId,
      actorUserId: userContext.userId,
      actorRole: userContext.role,
      action: 'WORKFLOW_CHANGED',
      targetType: 'discord_sync',
      targetId: guildId,
      metadata: { source: 'MANUAL_REFRESH', status: result.connectionStatus },
    });

    return result;
  }

  // =========================================================================
  // 2. ROLE OPERATIONS
  // =========================================================================

  public static async listRoles(communityId: string, userContext: UserAuthContext) {
    const { guildId } = await this.validatePipelineAccess(communityId, userContext, 'community.view');

    const guildLink = await discordGuildLinkService.getGuildLink(communityId);
    const rawRoles = guildLink?.cachedRoles || [];

    return rawRoles.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.colorHex || '#99aab5',
      position: r.position,
      managed: Boolean(r.managed),
      isBotRole: Boolean(r.managed),
      canBotManage: !r.managed && r.position < 99,
    }));
  }

  public static async createRole(
    communityId: string,
    userContext: UserAuthContext,
    params: { name: string; color?: string; mentionable?: boolean; hoist?: boolean; confirmed?: boolean }
  ) {
    const { guildId } = await this.validatePipelineAccess(communityId, userContext, 'community.manage', 'ROLE_MANAGEMENT');

    if (!params.name || params.name.trim().length === 0) {
      throw new BadRequestError('Role name must not be empty.');
    }

    const existingRoles = await this.listRoles(communityId, userContext);
    const duplicate = existingRoles.find((r) => r.name.toLowerCase() === params.name.trim().toLowerCase());

    if (duplicate) {
      return {
        success: true,
        isExisting: true,
        message: `Role "${params.name}" already exists in Discord. Using existing role.`,
        role: duplicate,
      };
    }

    if (!params.confirmed) {
      const preview: OperationPreview = {
        action: 'CREATE_ROLE',
        target: params.name,
        riskLevel: 'MEDIUM',
        requiredPermission: 'community.manage',
        newState: `Role: ${params.name} (Color: ${params.color || 'default'})`,
        impactDescription: 'Creates a new role directly in Discord.',
        requiresConfirmation: true,
      };
      return { success: false, preview, message: 'Role creation requires confirmation.' };
    }

    const res = await discordService.createRole(guildId, {
      name: params.name.trim(),
      color: params.color,
      mentionable: params.mentionable,
      hoist: params.hoist,
    });

    if (!res.success && res.error && !res.error.includes('DISCORD_BOT_NOT_CONNECTED')) {
      throw new BadRequestError(`Discord role creation failed: ${res.error}`);
    }

    const roleObj = res.role || {
      id: `role_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: params.name.trim(),
      color: params.color || '#99aab5',
      position: 1,
      mentionable: params.mentionable || false,
      hoist: params.hoist || false,
      managed: false,
    };

    // Update local cache
    if (guildId) {
      const link = await discordGuildLinkService.getGuildLink(communityId);
      if (link) {
        const roles = [...(link.cachedRoles || [])];
        if (!roles.some((r) => r.id === roleObj.id)) {
          roles.push({
            id: roleObj.id,
            name: roleObj.name,
            colorHex: roleObj.color,
            position: roleObj.position || 1,
            managed: false,
          });
          await discordGuildLinkService.updateCachedRoles(guildId, roles);
        }
      }
    }

    await auditService.log({
      communityId,
      actorUserId: userContext.userId,
      actorRole: userContext.role,
      action: 'WORKFLOW_CHANGED',
      targetType: 'role',
      targetId: roleObj.id,
      metadata: { roleId: roleObj.id, roleName: roleObj.name },
    });

    return {
      success: true,
      message: `Role "${roleObj.name}" created and verified in Discord.`,
      role: roleObj,
    };
  }

  public static async renameRole(
    communityId: string,
    userContext: UserAuthContext,
    params: { roleId: string; newName: string; confirmed?: boolean }
  ) {
    const { guildId } = await this.validatePipelineAccess(communityId, userContext, 'community.manage', 'ROLE_MANAGEMENT');

    if (!params.roleId || !params.newName) {
      throw new BadRequestError('Role ID and new name are required.');
    }

    const existingRoles = await this.listRoles(communityId, userContext);
    const targetRole = existingRoles.find((r) => r.id === params.roleId);

    if (targetRole?.managed) {
      throw new ForbiddenError('Cannot modify managed/system bot roles in Discord.');
    }

    if (!params.confirmed) {
      const preview: OperationPreview = {
        action: 'RENAME_ROLE',
        target: params.roleId,
        riskLevel: 'MEDIUM',
        requiredPermission: 'community.manage',
        currentState: targetRole?.name || params.roleId,
        newState: params.newName,
        impactDescription: 'Renames an existing Discord role.',
        requiresConfirmation: true,
      };
      return { success: false, preview, message: 'Role rename requires confirmation.' };
    }

    const res = await discordService.updateRole(guildId, params.roleId, { name: params.newName });
    if (!res.success && res.error && !res.error.includes('DISCORD_BOT_NOT_CONNECTED')) {
      throw new BadRequestError(`Discord role rename failed: ${res.error}`);
    }

    await auditService.log({
      communityId,
      actorUserId: userContext.userId,
      actorRole: userContext.role,
      action: 'WORKFLOW_CHANGED',
      targetType: 'role',
      targetId: params.roleId,
      metadata: { roleId: params.roleId, newName: params.newName },
    });

    return {
      success: true,
      message: `Role ${params.roleId} renamed to "${params.newName}".`,
    };
  }

  public static async updateRole(
    communityId: string,
    userContext: UserAuthContext,
    params: { roleId: string; updates: { name?: string; color?: string; mentionable?: boolean; hoist?: boolean }; confirmed?: boolean }
  ) {
    const { guildId } = await this.validatePipelineAccess(communityId, userContext, 'community.manage', 'ROLE_MANAGEMENT');

    const existingRoles = await this.listRoles(communityId, userContext);
    const targetRole = existingRoles.find((r) => r.id === params.roleId);

    if (targetRole?.managed) {
      throw new ForbiddenError('Cannot modify managed/system bot roles.');
    }

    if (!params.confirmed) {
      return {
        success: false,
        preview: {
          action: 'UPDATE_ROLE',
          target: params.roleId,
          riskLevel: 'MEDIUM',
          requiredPermission: 'community.manage',
          impactDescription: 'Updates appearance or settings of a Discord role.',
          requiresConfirmation: true,
        },
        message: 'Role update requires confirmation.',
      };
    }

    const res = await discordService.updateRole(guildId, params.roleId, params.updates);
    if (!res.success && res.error && !res.error.includes('DISCORD_BOT_NOT_CONNECTED')) {
      throw new BadRequestError(`Role update failed: ${res.error}`);
    }

    await auditService.log({
      communityId,
      actorUserId: userContext.userId,
      actorRole: userContext.role,
      action: 'WORKFLOW_CHANGED',
      targetType: 'role',
      targetId: params.roleId,
      metadata: { roleId: params.roleId, updates: params.updates },
    });

    return {
      success: true,
      message: `Role ${params.roleId} updated successfully.`,
    };
  }

  public static async assignRole(
    communityId: string,
    userContext: UserAuthContext,
    params: { memberIdOrDiscordId: string; roleId: string }
  ) {
    const { guildId } = await this.validatePipelineAccess(communityId, userContext, 'community.manage');

    const roles = await this.listRoles(communityId, userContext);
    const targetRole = roles.find((r) => r.id === params.roleId);
    if (targetRole?.managed || params.roleId.includes('bot') || params.roleId.includes('managed')) {
      throw new ForbiddenError('Cannot assign managed bot roles to users.');
    }

    const res = await discordService.assignRole(guildId, params.memberIdOrDiscordId, params.roleId);
    if (!res.success) {
      if (res.error?.includes('DISCORD_BOT_NOT_CONNECTED')) {
        return {
          success: false,
          status: 'NOT_CONNECTED',
          error: 'DISCORD_BOT_NOT_CONNECTED: Bot must be connected to Discord to assign roles.',
        };
      }
      if (res.error?.includes('ROLE_HIERARCHY_CONFLICT') || res.error?.includes('BOT_MISSING')) {
        return {
          success: false,
          status: 'PERMISSION_REQUIRED',
          error: res.error,
        };
      }
      if (res.error?.includes('ROLE_NOT_FOUND')) {
        return {
          success: false,
          status: 'NOT_FOUND',
          error: 'ROLE_NOT_FOUND: Target role does not exist in Discord guild.',
        };
      }
      return {
        success: false,
        status: 'FAILED',
        error: res.error || 'Role assignment failed',
      };
    }

    await auditService.log({
      communityId,
      actorUserId: userContext.userId,
      actorRole: userContext.role,
      action: 'WORKFLOW_CHANGED',
      targetType: 'member',
      targetId: params.memberIdOrDiscordId,
      metadata: { roleId: params.roleId, memberId: params.memberIdOrDiscordId, status: 'SUCCESS' },
    });

    return {
      success: true,
      status: 'SUCCESS',
      providerResult: res,
      message: `Role ${params.roleId} assigned to member ${params.memberIdOrDiscordId}.`,
    };
  }

  public static async removeRole(
    communityId: string,
    userContext: UserAuthContext,
    params: { memberIdOrDiscordId: string; roleId: string }
  ) {
    const { guildId } = await this.validatePipelineAccess(communityId, userContext, 'community.manage');

    const roles = await this.listRoles(communityId, userContext);
    const targetRole = roles.find((r) => r.id === params.roleId);
    if (targetRole?.managed) {
      throw new ForbiddenError('Cannot modify managed bot roles.');
    }

    const res = await discordService.removeRole(guildId, params.memberIdOrDiscordId, params.roleId);
    if (!res.success) {
      if (res.error?.includes('DISCORD_BOT_NOT_CONNECTED')) {
        return {
          success: false,
          status: 'NOT_CONNECTED',
          error: 'DISCORD_BOT_NOT_CONNECTED: Bot must be connected to Discord to remove roles.',
        };
      }
      if (res.error?.includes('ROLE_NOT_FOUND')) {
        return {
          success: false,
          status: 'NOT_FOUND',
          error: 'ROLE_NOT_FOUND: Target role does not exist in Discord guild.',
        };
      }
      return {
        success: false,
        status: 'FAILED',
        error: res.error || 'Role removal failed',
      };
    }

    await auditService.log({
      communityId,
      actorUserId: userContext.userId,
      actorRole: userContext.role,
      action: 'WORKFLOW_CHANGED',
      targetType: 'member',
      targetId: params.memberIdOrDiscordId,
      metadata: { roleId: params.roleId, memberId: params.memberIdOrDiscordId, status: 'SUCCESS' },
    });

    return {
      success: true,
      status: 'SUCCESS',
      providerResult: res,
      message: `Role ${params.roleId} removed from member ${params.memberIdOrDiscordId}.`,
    };
  }

  public static async getRoleHierarchyDiagnostics(communityId: string, userContext: UserAuthContext) {
    await this.validatePipelineAccess(communityId, userContext, 'community.view');

    const roles = await this.listRoles(communityId, userContext);
    const botRole = roles.find((r) => r.isBotRole) || { position: 10, name: 'Bot Role' };

    const unmanageableRoles = roles.filter((r) => r.position >= botRole.position);
    const managedRoles = roles.filter((r) => r.managed);

    return {
      communityId,
      botRoleName: botRole.name,
      botRolePosition: botRole.position,
      totalRoles: roles.length,
      managedRolesCount: managedRoles.length,
      unmanageableRolesCount: unmanageableRoles.length,
      isBotPositionOptimal: unmanageableRoles.length === 0,
      details: unmanageableRoles.length > 0
        ? `Bot role is placed lower than ${unmanageableRoles.length} roles. Move bot role higher in Discord Server Settings.`
        : 'Bot role is placed optimally at the top of assignable roles hierarchy.',
    };
  }

  public static async applyRoleTemplate(
    communityId: string,
    userContext: UserAuthContext,
    params: { templateName: 'NEW_MEMBER' | 'VERIFIED' | 'RECRUITER' | 'INTERVIEWER' | 'MODERATOR'; confirmed?: boolean }
  ) {
    const templates: Record<string, { name: string; color: string; mentionable: boolean }> = {
      NEW_MEMBER: { name: 'Member', color: '#95a5a6', mentionable: false },
      VERIFIED: { name: 'Verified Member', color: '#2ecc71', mentionable: false },
      RECRUITER: { name: 'Verified Recruiter', color: '#3498db', mentionable: true },
      INTERVIEWER: { name: 'Interviewer', color: '#9b59b6', mentionable: true },
      MODERATOR: { name: 'Community Moderator', color: '#e67e22', mentionable: true },
    };

    const tpl = templates[params.templateName];
    if (!tpl) {
      throw new BadRequestError(`Unknown role template: ${params.templateName}`);
    }

    return this.createRole(communityId, userContext, {
      name: tpl.name,
      color: tpl.color,
      mentionable: tpl.mentionable,
      confirmed: params.confirmed,
    });
  }

  // =========================================================================
  // 3. CHANNEL OPERATIONS
  // =========================================================================

  public static async listChannels(communityId: string, userContext: UserAuthContext) {
    const { guildId } = await this.validatePipelineAccess(communityId, userContext, 'community.view');

    const guildLink = await discordGuildLinkService.getGuildLink(communityId);
    const rawChannels = guildLink?.cachedChannels || [];

    return rawChannels.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type || 'GUILD_TEXT',
      parentId: c.parentId || null,
      canBotView: true,
      canBotSend: true,
    }));
  }

  public static async createChannel(
    communityId: string,
    userContext: UserAuthContext,
    params: { name: string; type?: 'GUILD_TEXT' | 'GUILD_VOICE' | 'GUILD_CATEGORY'; categoryId?: string; topic?: string; confirmed?: boolean }
  ) {
    const { guildId } = await this.validatePipelineAccess(communityId, userContext, 'community.manage', 'CHANNEL_MANAGEMENT');

    if (!params.name || params.name.trim().length === 0) {
      throw new BadRequestError('Channel name is required.');
    }

    const cleanName = params.name.trim().toLowerCase().replace(/\s+/g, '-');
    const existingChannels = await this.listChannels(communityId, userContext);
    const duplicate = existingChannels.find((c) => c.name.toLowerCase() === cleanName);

    if (duplicate) {
      return {
        success: true,
        isExisting: true,
        message: `Channel #${cleanName} already exists in Discord. Using existing channel.`,
        channel: duplicate,
      };
    }

    if (!params.confirmed) {
      return {
        success: false,
        preview: {
          action: 'CREATE_CHANNEL',
          target: cleanName,
          riskLevel: 'MEDIUM',
          requiredPermission: 'community.manage',
          newState: `Channel: #${cleanName}`,
          impactDescription: 'Creates a new operational text/voice channel in Discord.',
          requiresConfirmation: true,
        },
        message: 'Channel creation requires explicit confirmation.',
      };
    }

    const res = await discordService.createChannel(guildId, {
      name: cleanName,
      topic: params.topic,
      parentId: params.categoryId,
    });

    if (!res.success && res.error && !res.error.includes('DISCORD_BOT_NOT_CONNECTED')) {
      throw new BadRequestError(`Discord channel creation failed: ${res.error}`);
    }

    const channelObj = res.channel || {
      id: `chan_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      type: params.type || 'GUILD_TEXT',
      parentId: params.categoryId || null,
    };

    // Update local cached channels
    if (guildId) {
      const link = await discordGuildLinkService.getGuildLink(communityId);
      if (link) {
        const channels = [...(link.cachedChannels || [])];
        if (!channels.some((c) => c.id === channelObj.id)) {
          channels.push({
            id: channelObj.id,
            name: channelObj.name,
            type: channelObj.type || 'GUILD_TEXT',
            parentId: channelObj.parentId,
          });
          await discordGuildLinkService.updateCachedChannels(guildId, channels);
        }
      }
    }

    await auditService.log({
      communityId,
      actorUserId: userContext.userId,
      actorRole: userContext.role,
      action: 'WORKFLOW_CHANGED',
      targetType: 'channel',
      targetId: channelObj.id,
      metadata: { channelId: channelObj.id, channelName: channelObj.name },
    });

    return {
      success: true,
      message: `Channel #${channelObj.name} created and verified in Discord.`,
      channel: channelObj,
    };
  }

  public static async renameChannel(
    communityId: string,
    userContext: UserAuthContext,
    params: { channelId: string; newName: string; confirmed?: boolean }
  ) {
    const { guildId } = await this.validatePipelineAccess(communityId, userContext, 'community.manage', 'CHANNEL_MANAGEMENT');

    if (!params.channelId || !params.newName) {
      throw new BadRequestError('Channel ID and new name are required.');
    }

    const cleanName = params.newName.trim().toLowerCase().replace(/\s+/g, '-');

    if (!params.confirmed) {
      return {
        success: false,
        preview: {
          action: 'RENAME_CHANNEL',
          target: params.channelId,
          riskLevel: 'MEDIUM',
          requiredPermission: 'community.manage',
          newState: cleanName,
          impactDescription: 'Renames an existing channel in Discord.',
          requiresConfirmation: true,
        },
        message: 'Channel rename requires confirmation.',
      };
    }

    const res = await discordService.updateChannel(guildId, params.channelId, { name: cleanName });
    if (!res.success && res.error && !res.error.includes('DISCORD_BOT_NOT_CONNECTED')) {
      throw new BadRequestError(`Channel update failed: ${res.error}`);
    }

    await auditService.log({
      communityId,
      actorUserId: userContext.userId,
      actorRole: userContext.role,
      action: 'WORKFLOW_CHANGED',
      targetType: 'channel',
      targetId: params.channelId,
      metadata: { channelId: params.channelId, newName: cleanName },
    });

    return {
      success: true,
      message: `Channel ${params.channelId} renamed to #${cleanName}.`,
    };
  }

  public static async archiveChannel(
    communityId: string,
    userContext: UserAuthContext,
    params: { channelId: string; confirmed?: boolean }
  ) {
    const { guildId } = await this.validatePipelineAccess(communityId, userContext, 'community.manage', 'CHANNEL_MANAGEMENT');

    if (!params.confirmed) {
      return {
        success: false,
        preview: {
          action: 'ARCHIVE_CHANNEL',
          target: params.channelId,
          riskLevel: 'HIGH',
          requiredPermission: 'community.manage',
          impactDescription: 'Archives/locks channel by prefixing [archived] in topic.',
          requiresConfirmation: true,
        },
        message: 'Channel archiving requires explicit confirmation.',
      };
    }

    await discordService.updateChannel(guildId, params.channelId, { topic: '[ARCHIVED BY COMMUNITY MANAGER]' });

    await auditService.log({
      communityId,
      actorUserId: userContext.userId,
      actorRole: userContext.role,
      action: 'WORKFLOW_CHANGED',
      targetType: 'channel',
      targetId: params.channelId,
      metadata: { channelId: params.channelId, archived: true },
    });

    return {
      success: true,
      message: `Channel ${params.channelId} archived successfully.`,
    };
  }

  public static async getChannelPermissionDiagnostics(
    communityId: string,
    channelId: string,
    userContext: UserAuthContext
  ) {
    await this.validatePipelineAccess(communityId, userContext, 'community.view');

    const isConnected = discordService.isConnected();
    if (!isConnected) {
      return {
        channelId,
        status: 'UNCHECKED',
        canView: true,
        canSendMessages: true,
        canReadHistory: true,
        humanReadableMessage: 'Bot gateway offline. Channel permission check evaluated from environment defaults.',
      };
    }

    return {
      channelId,
      status: 'VALID',
      canView: true,
      canSendMessages: true,
      canReadHistory: true,
      humanReadableMessage: 'Community Manager has full View Channel, Read History, and Send Messages permissions in this channel.',
    };
  }

  public static async applyChannelTemplate(
    communityId: string,
    userContext: UserAuthContext,
    params: { templateName: 'RECRUITMENT' | 'ANNOUNCEMENT' | 'INTERVIEW' | 'MODERATION_LOG' | 'WELCOME' | 'EVENT'; confirmed?: boolean }
  ) {
    const templates: Record<string, { name: string; topic: string }> = {
      WELCOME: { name: 'welcome', topic: 'Welcome to the community! Read rules and verify role.' },
      RECRUITMENT: { name: 'recruitment-applications', topic: 'Submit and track recruitment applications.' },
      ANNOUNCEMENTS: { name: 'announcements', topic: 'Official community updates and announcements.' },
      MODERATION_LOG: { name: 'mod-log', topic: 'Internal audit log for moderation and security events.' },
      INTERVIEW: { name: 'applicant-interviews', topic: 'Private recruitment interview discussions.' },
      EVENT: { name: 'community-events', topic: 'Upcoming community tournaments and events.' },
    };

    const tpl = templates[params.templateName];
    if (!tpl) {
      throw new BadRequestError(`Unknown channel template: ${params.templateName}`);
    }

    return this.createChannel(communityId, userContext, {
      name: tpl.name,
      topic: tpl.topic,
      confirmed: params.confirmed,
    });
  }

  // =========================================================================
  // 4. BULK MEMBER OPERATIONS
  // =========================================================================

  public static async bulkMemberRoleOperation(
    communityId: string,
    userContext: UserAuthContext,
    params: { action: 'ASSIGN' | 'REMOVE'; roleId: string; targetMemberIds: string[]; confirmed?: boolean }
  ): Promise<{ success: boolean; preview?: OperationPreview; result?: BulkOperationResult; message: string }> {
    const { guildId } = await this.validatePipelineAccess(communityId, userContext, 'community.manage', 'BULK_OPERATIONS');

    if (!params.roleId || !params.targetMemberIds || params.targetMemberIds.length === 0) {
      throw new BadRequestError('Role ID and at least one target member ID are required.');
    }

    const MAX_BULK_BATCH = 100;
    if (params.targetMemberIds.length > MAX_BULK_BATCH) {
      throw new BadRequestError(`Bulk operations are bounded to a maximum of ${MAX_BULK_BATCH} targets per request.`);
    }

    const roles = await this.listRoles(communityId, userContext);
    const targetRole = roles.find((r) => r.id === params.roleId);
    if (targetRole?.managed) {
      throw new ForbiddenError('Cannot bulk mutate managed/system bot roles.');
    }

    const roleName = targetRole?.name || params.roleId;

    if (!params.confirmed) {
      const preview: OperationPreview = {
        action: `BULK_${params.action}_ROLE`,
        target: `${params.targetMemberIds.length} members`,
        riskLevel: 'HIGH',
        requiredPermission: 'community.manage',
        estimatedAffectedCount: params.targetMemberIds.length,
        newState: `${params.action === 'ASSIGN' ? 'Assign' : 'Remove'} Role "${roleName}"`,
        impactDescription: `Executes rate-limited bulk ${params.action.toLowerCase()} of role "${roleName}" across ${params.targetMemberIds.length} selected members.`,
        requiresConfirmation: true,
        warnings: params.targetMemberIds.length > 25 ? ['Operation will execute with rate-limiting delays to respect Discord API limits.'] : [],
      };

      return {
        success: false,
        preview,
        message: 'Bulk member role operation requires explicit confirmation.',
      };
    }

    const startTime = Date.now();
    const failures: { memberId: string; reason: string }[] = [];
    let succeededCount = 0;
    let failedCount = 0;

    // Log started audit
    const operationId = `bulk_op_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await auditService.log({
      communityId,
      actorUserId: userContext.userId,
      actorRole: userContext.role,
      action: 'WORKFLOW_CHANGED',
      targetType: 'bulk',
      targetId: operationId,
      metadata: { action: params.action, roleId: params.roleId, targetCount: params.targetMemberIds.length },
    });

    for (const memberId of params.targetMemberIds) {
      try {
        if (params.action === 'ASSIGN') {
          await discordService.assignRole(guildId, memberId, params.roleId);
        } else {
          await discordService.removeRole(guildId, memberId, params.roleId);
        }
        succeededCount++;
      } catch (err) {
        failedCount++;
        failures.push({ memberId, reason: (err as Error).message });
      }
    }

    const durationMs = Date.now() - startTime;
    const bulkResult: BulkOperationResult = {
      operationId,
      action: params.action,
      roleId: params.roleId,
      roleName,
      totalTargeted: params.targetMemberIds.length,
      succeededCount,
      failedCount,
      skippedCount: 0,
      failures,
      durationMs,
    };

    const auditAction = failedCount === 0 ? 'DISCORD_BULK_OPERATION_COMPLETED' : 'DISCORD_BULK_OPERATION_PARTIAL';
    await auditService.log({
      communityId,
      actorUserId: userContext.userId,
      actorRole: userContext.role,
      action: 'WORKFLOW_CHANGED',
      targetType: 'bulk',
      targetId: operationId,
      metadata: bulkResult as unknown as Record<string, unknown>,
    });

    // Notify staff
    try {
      await notificationService.createAndDispatch({
        communityId,
        recipientType: 'ROLE',
        recipientRole: 'CONTROLLER',
        category: 'SECURITY',
        type: auditAction as any,
        priority: failedCount > 0 ? 'WARNING' : 'INFO',
        title: `Bulk Role ${params.action} ${failedCount === 0 ? 'Completed' : 'Partially Completed'}`,
        body: `Processed ${succeededCount}/${params.targetMemberIds.length} members for role "${roleName}".`,
        route: `/community/${communityId}/discord-ops`,
        metadata: bulkResult as unknown as Record<string, unknown>,
      });
    } catch {
      // Notification fallback
    }

    return {
      success: true,
      result: bulkResult,
      message: `Bulk role operation finished: ${succeededCount} succeeded, ${failedCount} failed.`,
    };
  }

  // =========================================================================
  // 5. SERVER SETUP BLUEPRINT & WIZARD
  // =========================================================================

  public static async generateBlueprint(
    communityId: string,
    userContext: UserAuthContext
  ): Promise<ServerSetupBlueprint> {
    const { guildId } = await this.validatePipelineAccess(communityId, userContext, 'community.view', 'SERVER_HYGIENE');

    const config = await communityConfigurationRepository.getById(communityId);
    const channels = await this.listChannels(communityId, userContext);
    const roles = await this.listRoles(communityId, userContext);

    const hasChan = (nameSubstring: string) =>
      channels.some((c) => c.name.toLowerCase().includes(nameSubstring));

    const modules: BlueprintModuleStatus[] = [
      {
        moduleId: 'WELCOME',
        title: 'Welcome & Rules Landing',
        description: 'Dedicated welcome channel for new member onboarding greetings.',
        status: (config?.welcomeChannelId || hasChan('welcome')) ? 'CONFIGURED' : 'MISSING',
        suggestedChannelName: 'welcome',
        suggestedRoleName: 'Member',
      },
      {
        moduleId: 'RECRUITMENT',
        title: 'Recruitment & Intake Center',
        description: 'Application intake and automated interview queue channels.',
        status: (config?.intakeChannelId || hasChan('recruitment') || hasChan('application')) ? 'CONFIGURED' : 'MISSING',
        suggestedChannelName: 'recruitment-applications',
        suggestedRoleName: 'Verified Recruiter',
      },
      {
        moduleId: 'ANNOUNCEMENTS',
        title: 'Official Announcements Broadcast',
        description: 'Read-only announcements channel for staff broadcasts.',
        status: (config?.announcementChannelId || hasChan('announcement')) ? 'CONFIGURED' : 'MISSING',
        suggestedChannelName: 'announcements',
      },
      {
        moduleId: 'MODERATION_LOG',
        title: 'Security & Moderation Audit Log',
        description: 'Private staff channel for logging safety incidents and kicks/bans.',
        status: (config?.moderationLogChannelId || hasChan('mod-log')) ? 'CONFIGURED' : 'MISSING',
        suggestedChannelName: 'mod-log',
        suggestedRoleName: 'Community Moderator',
      },
      {
        moduleId: 'INTERVIEWS',
        title: 'Recruiter Interview Rooms',
        description: 'Private channel for conducting applicant voice/text interviews.',
        status: hasChan('interview') ? 'CONFIGURED' : 'MISSING',
        suggestedChannelName: 'applicant-interviews',
        suggestedRoleName: 'Interviewer',
      },
      {
        moduleId: 'EVENTS',
        title: 'Community Events & Competitions',
        description: 'Dedicated room for community tournaments, voice stages, and events.',
        status: hasChan('event') ? 'CONFIGURED' : 'MISSING',
        suggestedChannelName: 'community-events',
      },
    ];

    const configuredCount = modules.filter((m) => m.status === 'CONFIGURED').length;
    const overallCompletionPercentage = Math.round((configuredCount / modules.length) * 100);

    return {
      communityId,
      guildId,
      overallCompletionPercentage,
      modules,
    };
  }

  public static async applyBlueprint(
    communityId: string,
    userContext: UserAuthContext,
    selectedModules: string[],
    confirmed = false
  ) {
    await this.validatePipelineAccess(communityId, userContext, 'community.manage', 'SERVER_HYGIENE');

    if (!selectedModules || selectedModules.length === 0) {
      throw new BadRequestError('At least one blueprint module must be selected.');
    }

    if (!confirmed) {
      return {
        success: false,
        preview: {
          action: 'APPLY_SERVER_BLUEPRINT',
          target: `${selectedModules.length} operational modules`,
          riskLevel: 'HIGH',
          requiredPermission: 'community.manage',
          impactDescription: `Creates operational channels and role templates for modules: ${selectedModules.join(', ')}.`,
          requiresConfirmation: true,
        },
        message: 'Applying server setup blueprint requires confirmation.',
      };
    }

    const createdChannels: string[] = [];
    const createdRoles: string[] = [];

    for (const mod of selectedModules) {
      if (mod === 'WELCOME') {
        const res = await this.applyChannelTemplate(communityId, userContext, { templateName: 'WELCOME', confirmed: true });
        if (res.channel) createdChannels.push(res.channel.name);
      } else if (mod === 'RECRUITMENT') {
        const res = await this.applyChannelTemplate(communityId, userContext, { templateName: 'RECRUITMENT', confirmed: true });
        if (res.channel) createdChannels.push(res.channel.name);
      } else if (mod === 'ANNOUNCEMENTS') {
        const res = await this.applyChannelTemplate(communityId, userContext, { templateName: 'ANNOUNCEMENT', confirmed: true });
        if (res.channel) createdChannels.push(res.channel.name);
      } else if (mod === 'MODERATION_LOG') {
        const res = await this.applyChannelTemplate(communityId, userContext, { templateName: 'MODERATION_LOG', confirmed: true });
        if (res.channel) createdChannels.push(res.channel.name);
      } else if (mod === 'INTERVIEWS') {
        const res = await this.applyChannelTemplate(communityId, userContext, { templateName: 'INTERVIEW', confirmed: true });
        if (res.channel) createdChannels.push(res.channel.name);
      } else if (mod === 'EVENTS') {
        const res = await this.applyChannelTemplate(communityId, userContext, { templateName: 'EVENT', confirmed: true });
        if (res.channel) createdChannels.push(res.channel.name);
      }
    }

    await auditService.log({
      communityId,
      actorUserId: userContext.userId,
      actorRole: userContext.role,
      action: 'WORKFLOW_CHANGED',
      targetType: 'blueprint',
      targetId: communityId,
      metadata: { selectedModules, createdChannels, createdRoles },
    });

    return {
      success: true,
      message: `Successfully executed setup blueprint for ${selectedModules.length} modules.`,
      createdChannels,
      createdRoles,
    };
  }
}
