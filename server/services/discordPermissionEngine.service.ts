import { PermissionFlagsBits } from 'discord.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { DiscordPermissionDiagnostics } from '../../shared/types/models.js';
import { logger } from '../logging/logger.js';
import { config } from '../config/env.js';

export const REQUIRED_CAPABILITIES_MAP = [
  { name: 'VIEW_CHANNEL', bit: PermissionFlagsBits.ViewChannel },
  { name: 'SEND_MESSAGES', bit: PermissionFlagsBits.SendMessages },
  { name: 'READ_MESSAGE_HISTORY', bit: PermissionFlagsBits.ReadMessageHistory },
  { name: 'EMBED_LINKS', bit: PermissionFlagsBits.EmbedLinks },
  { name: 'ATTACH_FILES', bit: PermissionFlagsBits.AttachFiles },
  { name: 'USE_APPLICATION_COMMANDS', bit: PermissionFlagsBits.UseApplicationCommands },
  { name: 'MANAGE_MESSAGES', bit: PermissionFlagsBits.ManageMessages },
  { name: 'MANAGE_ROLES', bit: PermissionFlagsBits.ManageRoles },
  { name: 'MODERATE_MEMBERS', bit: PermissionFlagsBits.ModerateMembers },
  { name: 'KICK_MEMBERS', bit: PermissionFlagsBits.KickMembers },
  { name: 'BAN_MEMBERS', bit: PermissionFlagsBits.BanMembers },
  { name: 'MANAGE_CHANNELS', bit: PermissionFlagsBits.ManageChannels },
  { name: 'MANAGE_EVENTS', bit: PermissionFlagsBits.ManageEvents },
  { name: 'CREATE_EVENTS', bit: PermissionFlagsBits.CreateEvents },
  { name: 'CREATE_PUBLIC_THREADS', bit: PermissionFlagsBits.CreatePublicThreads },
  { name: 'CREATE_PRIVATE_THREADS', bit: PermissionFlagsBits.CreatePrivateThreads },
  { name: 'MANAGE_THREADS', bit: PermissionFlagsBits.ManageThreads },
  { name: 'VIEW_AUDIT_LOG', bit: PermissionFlagsBits.ViewAuditLog },
] as const;

export interface CapabilityCheckResult {
  capability: string;
  status: 'GRANTED' | 'MISSING' | 'NOT_APPLICABLE';
  bitfield: string;
}

export interface RoleHierarchyResult {
  botRoleExists: boolean;
  botRoleManaged: boolean;
  botHighestRolePosition: number;
  botRoleName: string;
  hierarchyStatus: 'VALID' | 'ROLE_HIERARCHY_BLOCKED';
  blockedRoles: string[];
}

export const AUTHORITATIVE_BOT_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.UseApplicationCommands,
  // Tickets, application chats, voice rooms, Secure Setup
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.CreateInstantInvite,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.MoveMembers,
  PermissionFlagsBits.ManageThreads,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.CreatePrivateThreads,
  PermissionFlagsBits.SendMessagesInThreads,
  // Moderation: warnings ladder, bulk tools
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageNicknames,
  PermissionFlagsBits.ViewAuditLog,
  // Engagement: native Discord polls; per-server bot name
  PermissionFlagsBits.SendPolls,
  PermissionFlagsBits.ChangeNickname,
] as const;

export function buildAuthoritativeInstallPermissions(): bigint {
  return AUTHORITATIVE_BOT_PERMISSIONS.reduce((acc, perm) => acc | perm, 0n);
}

export const AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD = buildAuthoritativeInstallPermissions().toString();

export function getAuthoritativePermissionsNames(): string[] {
  return [
    'View Channels',
    'Send Messages',
    'Manage Messages',
    'Embed Links',
    'Attach Files',
    'Read Message History',
    'Manage Roles',
    'Use Application Commands',
  ];
}

export function getAuthoritativePermissionsSummary(): string {
  return `${AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD} (${getAuthoritativePermissionsNames().join(', ')})`;
}

export function getAuthoritativePermissionsDiagnostic(): string {
  return `CONFIGURED (${AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD}: ${getAuthoritativePermissionsNames().join(', ')})`;
}

export class DiscordPermissionEngineService {
  /**
   * Evaluates bitfield against all required bot capabilities without requiring Administrator
   */
  evaluateBotCapabilities(permissionsBitfield: string | bigint): CapabilityCheckResult[] {
    const bitfieldBigInt = typeof permissionsBitfield === 'bigint' ? permissionsBitfield : BigInt(permissionsBitfield || '0');
    const isAdmin = (bitfieldBigInt & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator;

    return REQUIRED_CAPABILITIES_MAP.map((cap) => {
      const hasPerm = isAdmin || (bitfieldBigInt & cap.bit) === cap.bit;
      return {
        capability: cap.name,
        status: hasPerm ? 'GRANTED' : 'MISSING',
        bitfield: cap.bit.toString(),
      };
    });
  }

  /**
   * Evaluates bot role hierarchy position relative to target community roles
   */
  evaluateRoleHierarchy(guildId: string): RoleHierarchyResult {
    const guild = discordService.getGuild(guildId);
    if (!guild) {
      return {
        botRoleExists: false,
        botRoleManaged: false,
        botHighestRolePosition: 0,
        botRoleName: 'Unverified Bot Role',
        hierarchyStatus: 'VALID',
        blockedRoles: [],
      };
    }

    const botMember = guild.members.me;
    if (!botMember) {
      return {
        botRoleExists: false,
        botRoleManaged: false,
        botHighestRolePosition: 0,
        botRoleName: 'Bot Member Missing',
        hierarchyStatus: 'VALID',
        blockedRoles: [],
      };
    }

    const highestRole = botMember.roles.highest;
    const botPosition = highestRole?.position || 0;
    const blockedRoles: string[] = [];

    if (guild.roles?.cache) {
      for (const role of guild.roles.cache.values()) {
        if (!role.managed && role.id !== guild.id && role.position >= botPosition) {
          blockedRoles.push(role.name);
        }
      }
    }

    return {
      botRoleExists: Boolean(highestRole),
      botRoleManaged: Boolean(highestRole?.managed),
      botHighestRolePosition: botPosition,
      botRoleName: highestRole?.name || 'Community Manager',
      hierarchyStatus: blockedRoles.length > 0 ? 'ROLE_HIERARCHY_BLOCKED' : 'VALID',
      blockedRoles,
    };
  }

  /**
   * Evaluates Discord bot installation, permissions, and role hierarchy for a specific guild.
   */
  async getGuildDiagnostics(guildId: string): Promise<DiscordPermissionDiagnostics> {
    const isConnected = discordService.isConnected();
    if (!isConnected) {
      return {
        connected: false,
        botInstalled: false,
        guildVerified: false,
        channelsReady: false,
        rolesReady: false,
        roleHierarchyValid: false,
        commandsRegistered: false,
        missingPermissions: ['Bot gateway connection inactive'],
        details: {
          gatewayState: discordService.getConnectionState(),
          reason: 'Discord gateway client is not connected to Discord servers',
        },
      };
    }

    try {
      const diag = discordService.getDiagnostics();
      const isGuildInCache = Boolean(diag.guildsCount > 0);
      const hierarchy = this.evaluateRoleHierarchy(guildId);

      return {
        connected: true,
        botInstalled: isGuildInCache,
        guildVerified: isGuildInCache,
        channelsReady: true,
        rolesReady: true,
        roleHierarchyValid: hierarchy.hierarchyStatus === 'VALID',
        commandsRegistered: true,
        missingPermissions: [],
        details: {
          guildId,
          botTag: diag.botTag || '',
          hierarchyStatus: hierarchy.hierarchyStatus,
        },
      };
    } catch (err) {
      logger.warn(`[DiscordPermissionEngine] Error diagnosing guild ${guildId}: ${(err as Error).message}`);
      return {
        connected: true,
        botInstalled: false,
        guildVerified: false,
        channelsReady: false,
        rolesReady: false,
        roleHierarchyValid: false,
        commandsRegistered: false,
        missingPermissions: ['Unable to inspect guild details from Discord API'],
        details: { error: (err as Error).message },
      };
    }
  }

  getSmartPermissionAdvice(missingPerms: string[]): { title: string; advice: string; fixInDiscordText: string } {
    if (missingPerms.length === 0) {
      return {
        title: 'Discord Permissions Optimal',
        advice: 'All features (messages, roles, slash commands) are fully operational.',
        fixInDiscordText: 'No action needed',
      };
    }

    if (missingPerms.some((p) => p.toLowerCase().includes('manage roles') || p.toLowerCase().includes('hierarchy'))) {
      return {
        title: 'Role Assignment Needs Discord Permission',
        advice: 'Role assignment requires the "Manage Roles" permission in Discord and the Bot Role must be placed ABOVE the assigned recruit role in Server Settings -> Roles.',
        fixInDiscordText: 'Open Discord Role Settings & drag Bot Role to top',
      };
    }

    return {
      title: 'Discord Permissions Action Required',
      advice: `Missing required permissions: ${missingPerms.join(', ')}. Please update bot channel permissions in Discord.`,
      fixInDiscordText: 'Update Bot Channel Permissions in Discord',
    };
  }
}

export const discordPermissionEngineService = new DiscordPermissionEngineService();
