import { communitiesRepository } from '../repositories/index.js';
import { discordResourceService } from './discordResource.service.js';
import { SettingsService, SettingsAuditService } from './settings.service.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import { UserRole } from '../../shared/types/rbac.js';
import { AutomationEventBusService } from './automation.service.js';
import { logger } from '../logging/logger.js';

export interface CommunityDiscordSettings {
  communityId: string;
  guildId: string | null;
  guildName: string | null;
  isLive: boolean;
  botConnected: boolean;
  state: 'READY' | 'NO_GUILD_LINKED' | 'DISCONNECTED' | 'CONFIGURATION_REQUIRED' | 'PERMISSION_REQUIRED' | 'ROLE_HIERARCHY_BLOCKED';
  version: number;
  welcomeChannelId?: string;
  welcomeChannelName?: string;
  welcomeMessageEnabled?: boolean;
  rulesChannelId?: string;
  rulesChannelName?: string;
  recruiterRecordChannelId?: string;
  recruiterRecordChannelName?: string;
  recruiterRecordEnabled?: boolean;
  moderationLogChannelId?: string;
  moderationLogChannelName?: string;
  announcementChannelId?: string;
  announcementChannelName?: string;
  defaultMemberRoleId?: string;
  defaultMemberRoleName?: string;
  recruiterRoleId?: string;
  recruiterRoleName?: string;
  interviewerRoleId?: string;
  interviewerRoleName?: string;
  controllerRoleId?: string;
  controllerRoleName?: string;
  diagnostics: Array<{
    category: string;
    settingKey: string;
    status: string;
    message: string;
    remediation?: string;
  }>;
  updatedAt: string;
  updatedBy: string;
}

export class DiscordSettingsService {
  /**
   * Retrieves the live Discord configuration settings for a community.
   */
  static async getDiscordSettings(communityId: string): Promise<CommunityDiscordSettings> {
    if (!communityId) {
      throw new BadRequestError('communityId is required');
    }

    const community = await communitiesRepository.getById(communityId);
    if (!community) {
      throw new NotFoundError(`Community ${communityId} not found`);
    }

    const guildId = community.guildId || community.discordGuildId || null;
    const botConnected = discordService.isConnected();
    const consolidated = await SettingsService.getConsolidatedSettings(communityId);

    const welcomeChannelId = consolidated.community.welcomeChannelId;
    const welcomeChannelName = consolidated.community.welcomeChannelName;
    const rulesChannelId = consolidated.community.rulesChannelId;
    const rulesChannelName = consolidated.community.rulesChannelName;
    const recruiterRecordChannelId = consolidated.recruitment.recordChannelId;
    const recruiterRecordChannelName = consolidated.recruitment.recordChannelName;
    const moderationLogChannelName = consolidated.security.moderationLogChannel;
    
    // Role Mappings
    const memberRole = consolidated.permissions.roleMappings.MEMBER;
    const recruiterRole = consolidated.permissions.roleMappings.RECRUITER;
    const interviewerRole = consolidated.permissions.roleMappings.INTERVIEWER;
    const controllerRole = consolidated.permissions.roleMappings.CONTROLLER;

    const diagnostics: Array<{
      category: string;
      settingKey: string;
      status: string;
      message: string;
      remediation?: string;
    }> = [];

    if (!guildId) {
      return {
        communityId,
        guildId: null,
        guildName: null,
        isLive: false,
        botConnected,
        state: 'NO_GUILD_LINKED',
        version: consolidated.version,
        diagnostics: [{
          category: 'DISCORD',
          settingKey: 'guild',
          status: 'CONFIGURATION_REQUIRED',
          message: 'No Discord server is linked to this community.',
          remediation: 'Connect a Discord server using the Discord Connection Center.',
        }],
        updatedAt: consolidated.updatedAt,
        updatedBy: consolidated.updatedBy,
      };
    }

    let isLive = botConnected;
    let state: CommunityDiscordSettings['state'] = botConnected ? 'READY' : 'DISCONNECTED';

    if (!botConnected) {
      diagnostics.push({
        category: 'DISCORD',
        settingKey: 'bot',
        status: 'DISCONNECTED',
        message: 'Discord bot is not currently connected to the Gateway.',
        remediation: 'Verify bot status or re-install bot via Connection Center.',
      });
    }

    return {
      communityId,
      guildId,
      guildName: community.name || (community as any).discordGuildName || 'Discord Guild',
      isLive,
      botConnected,
      state,
      version: consolidated.version,
      welcomeChannelId,
      welcomeChannelName,
      welcomeMessageEnabled: consolidated.community.welcomeMessageEnabled,
      rulesChannelId,
      rulesChannelName,
      recruiterRecordChannelId,
      recruiterRecordChannelName,
      recruiterRecordEnabled: consolidated.recruitment.recordEnabled,
      moderationLogChannelName,
      defaultMemberRoleId: memberRole?.discordRoleId,
      defaultMemberRoleName: memberRole?.discordRoleName,
      recruiterRoleId: recruiterRole?.discordRoleId,
      recruiterRoleName: recruiterRole?.discordRoleName,
      interviewerRoleId: interviewerRole?.discordRoleId,
      interviewerRoleName: interviewerRole?.discordRoleName,
      controllerRoleId: controllerRole?.discordRoleId,
      controllerRoleName: controllerRole?.discordRoleName,
      diagnostics,
      updatedAt: consolidated.updatedAt,
      updatedBy: consolidated.updatedBy,
    };
  }

  /**
   * Updates community Discord settings with real Discord resource ownership validation,
   * permission/hierarchy diagnostics, and server-side persistence.
   */
  static async updateDiscordSettings(
    communityId: string,
    actor: { userId: string; role: UserRole },
    payload: Partial<{
      welcomeChannelId: string;
      welcomeChannelName: string;
      welcomeMessageEnabled: boolean;
      rulesChannelId: string;
      rulesChannelName: string;
      recruiterRecordChannelId: string;
      recruiterRecordChannelName: string;
      recruiterRecordEnabled: boolean;
      moderationLogChannelId: string;
      moderationLogChannelName: string;
      defaultMemberRoleId: string;
      defaultMemberRoleName: string;
      recruiterRoleId: string;
      recruiterRoleName: string;
      interviewerRoleId: string;
      interviewerRoleName: string;
      controllerRoleId: string;
      controllerRoleName: string;
    }>
  ): Promise<CommunityDiscordSettings> {
    if (!communityId) {
      throw new BadRequestError('communityId is required');
    }

    if (actor.role !== 'OWNER' && actor.role !== 'CONTROLLER' && actor.role !== 'PLATFORM_OWNER') {
      throw new ForbiddenError('Insufficient permissions to modify Discord settings.');
    }

    const community = await communitiesRepository.getById(communityId);
    if (!community) {
      throw new NotFoundError(`Community ${communityId} not found`);
    }

    const guildId = community.guildId || community.discordGuildId;
    if (!guildId) {
      throw new BadRequestError('NO_GUILD_LINKED: Cannot save Discord settings because no Discord server is linked to this community.');
    }

    const diagnostics: Array<{
      category: string;
      settingKey: string;
      status: string;
      message: string;
      remediation?: string;
    }> = [];

    // 1. Validate Channel Ownership & Permissions
    const channelPointers = [
      { key: 'welcomeChannelId', nameKey: 'welcomeChannelName', id: payload.welcomeChannelId, name: payload.welcomeChannelName },
      { key: 'rulesChannelId', nameKey: 'rulesChannelName', id: payload.rulesChannelId, name: payload.rulesChannelName },
      { key: 'recruiterRecordChannelId', nameKey: 'recruiterRecordChannelName', id: payload.recruiterRecordChannelId, name: payload.recruiterRecordChannelName },
      { key: 'moderationLogChannelId', nameKey: 'moderationLogChannelName', id: payload.moderationLogChannelId, name: payload.moderationLogChannelName },
    ];

    for (const ptr of channelPointers) {
      if (ptr.id && ptr.id.trim().length > 0) {
        const liveChan = await discordResourceService.getChannel(guildId, ptr.id.trim());
        if (!liveChan) {
          throw new BadRequestError(
            `RESOURCE_GUILD_MISMATCH: Channel ID "${ptr.id}" does not exist in linked Discord server (${guildId}).`
          );
        }
        if (liveChan.canBotSendMessages === false) {
          diagnostics.push({
            category: 'PERMISSIONS',
            settingKey: ptr.key,
            status: 'PERMISSION_REQUIRED',
            message: `Bot lacks permission to send messages in channel "${liveChan.name}" (${liveChan.id}).`,
            remediation: 'Grant the bot View Channel and Send Messages permissions in Discord.',
          });
        }
        // Populate channel name if missing
        if (!ptr.name && liveChan.name) {
          (payload as any)[ptr.nameKey] = liveChan.name;
        }
      }
    }

    // 2. Validate Role Ownership & Hierarchy
    const rolePointers = [
      { key: 'defaultMemberRoleId', nameKey: 'defaultMemberRoleName', roleKey: 'MEMBER', id: payload.defaultMemberRoleId, name: payload.defaultMemberRoleName },
      { key: 'recruiterRoleId', nameKey: 'recruiterRoleName', roleKey: 'RECRUITER', id: payload.recruiterRoleId, name: payload.recruiterRoleName },
      { key: 'interviewerRoleId', nameKey: 'interviewerRoleName', roleKey: 'INTERVIEWER', id: payload.interviewerRoleId, name: payload.interviewerRoleName },
      { key: 'controllerRoleId', nameKey: 'controllerRoleName', roleKey: 'CONTROLLER', id: payload.controllerRoleId, name: payload.controllerRoleName },
    ];

    for (const ptr of rolePointers) {
      if (ptr.id && ptr.id.trim().length > 0) {
        const liveRole = await discordResourceService.getRole(guildId, ptr.id.trim());
        if (!liveRole) {
          throw new BadRequestError(
            `RESOURCE_GUILD_MISMATCH: Role ID "${ptr.id}" does not exist in linked Discord server (${guildId}).`
          );
        }
        if (liveRole.botManageable === false) {
          diagnostics.push({
            category: 'HIERARCHY',
            settingKey: ptr.key,
            status: 'ROLE_HIERARCHY_BLOCKED',
            message: `Role "${liveRole.name}" (${liveRole.id}) is higher than the bot's role or is managed by an integration and cannot be assigned.`,
            remediation: "Move the bot's role above this role in Discord Server Settings > Roles.",
          });
        }
        if (!ptr.name && liveRole.name) {
          (payload as any)[ptr.nameKey] = liveRole.name;
        }
      }
    }

    // 3. Construct Settings Service Payload
    const currentConsolidated = await SettingsService.getConsolidatedSettings(communityId);

    const settingsUpdatePayload: any = {
      community: {
        welcomeMessageEnabled: payload.welcomeMessageEnabled ?? currentConsolidated.community.welcomeMessageEnabled,
        welcomeGreeting: currentConsolidated.community.welcomeGreeting || 'Welcome to our community!',
        welcomeChannelId: payload.welcomeChannelId,
        welcomeChannelName: payload.welcomeChannelName,
        rulesChannelId: payload.rulesChannelId,
        rulesChannelName: payload.rulesChannelName,
      },
      recruitment: {
        recordEnabled: payload.recruiterRecordEnabled,
        recordChannelId: payload.recruiterRecordChannelId,
        recordChannelName: payload.recruiterRecordChannelName,
      },
      security: {
        moderationLogChannel: payload.moderationLogChannelName || payload.moderationLogChannelId,
      },
    };

    // Role Mappings update
    if (payload.defaultMemberRoleId || payload.recruiterRoleId || payload.interviewerRoleId || payload.controllerRoleId) {
      const updatedMappings = { ...currentConsolidated.permissions.roleMappings };

      if (payload.defaultMemberRoleId) {
        updatedMappings.MEMBER = {
          ...updatedMappings.MEMBER,
          discordRoleId: payload.defaultMemberRoleId,
          discordRoleName: payload.defaultMemberRoleName || updatedMappings.MEMBER.discordRoleName,
        };
      }
      if (payload.recruiterRoleId) {
        updatedMappings.RECRUITER = {
          ...updatedMappings.RECRUITER,
          discordRoleId: payload.recruiterRoleId,
          discordRoleName: payload.recruiterRoleName || updatedMappings.RECRUITER.discordRoleName,
        };
      }
      if (payload.interviewerRoleId) {
        updatedMappings.INTERVIEWER = {
          ...updatedMappings.INTERVIEWER,
          discordRoleId: payload.interviewerRoleId,
          discordRoleName: payload.interviewerRoleName || updatedMappings.INTERVIEWER.discordRoleName,
        };
      }
      if (payload.controllerRoleId) {
        updatedMappings.CONTROLLER = {
          ...updatedMappings.CONTROLLER,
          discordRoleId: payload.controllerRoleId,
          discordRoleName: payload.controllerRoleName || updatedMappings.CONTROLLER.discordRoleName,
        };
      }

      settingsUpdatePayload.permissions = {
        roleMappings: updatedMappings,
      };
    }

    // Apply settings updates via SettingsService
    await SettingsService.updateSettings(communityId, actor, settingsUpdatePayload);

    logger.info(`[DISCORD_SETTINGS] Community ${communityId} Discord settings updated by ${actor.userId} (${actor.role})`);

    const result = await this.getDiscordSettings(communityId);
    if (diagnostics.length > 0) {
      result.diagnostics = [...result.diagnostics, ...diagnostics];
    }
    return result;
  }
}

export const discordSettingsService = DiscordSettingsService;
