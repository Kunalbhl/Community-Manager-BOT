import { config } from '../config/env.js';
import { logger } from '../logging/logger.js';
import { discordAuthService } from './discordAuth.service.js';
import { discordService } from '../integrations/discord/discord.service.js';
import {
  communitiesRepository,
  platformServersRepository,
  botInstallationsRepository,
  connectionIntentsRepository,
} from '../repositories/index.js';
import { discordPermissionEngineService } from './discordPermissionEngine.service.js';

export type DiscordCanonicalStatus =
  | 'NOT_CONFIGURED'
  | 'AUTHENTICATED'
  | 'GUILD_SELECTED'
  | 'INSTALL_REQUIRED'
  | 'INSTALL_PENDING'
  | 'BOT_NOT_CONNECTED'
  | 'BOT_DETECTED'
  | 'VERIFYING'
  | 'CONNECTED'
  | 'DEGRADED'
  | 'DISCONNECTED'
  | 'REAUTH_REQUIRED'
  | 'PERMISSION_REQUIRED'
  | 'FAILED';

export interface DiscordStatusResolutionOptions {
  communityId?: string;
  guildId?: string;
  sessionToken?: string;
  discordUserId?: string;
}

export interface DiscordStatusResult {
  status: DiscordCanonicalStatus;
  guildId?: string;
  guildName?: string;
  communityId?: string;
  botInstalled: boolean;
  botGatewayConnected: boolean;
  permissionsValid: boolean;
  missingPermissions: string[];
  userAuthenticated: boolean;
  reauthRequired: boolean;
  message: string;
}

export class DiscordStatusService {
  /**
   * Authoritative, single source of truth for resolving Discord integration status.
   */
  async resolveStatus(options: DiscordStatusResolutionOptions = {}): Promise<DiscordStatusResult> {
    const clientId = config.DISCORD_CLIENT_ID || config.DISCORD_APPLICATION_ID;
    const hasCredentials = Boolean(clientId && config.DISCORD_CLIENT_SECRET);

    if (!hasCredentials) {
      return {
        status: 'NOT_CONFIGURED',
        botInstalled: false,
        botGatewayConnected: false,
        permissionsValid: false,
        missingPermissions: [],
        userAuthenticated: false,
        reauthRequired: false,
        message: 'Discord integration credentials (client ID / secret) are unconfigured.',
      };
    }

    // 1. Resolve Auth Session
    let session: any = undefined;
    if (options.sessionToken) {
      session = await discordAuthService.getSessionByToken(options.sessionToken);
    } else if (options.discordUserId) {
      session = await discordAuthService.getSession(options.discordUserId);
    }

    const userAuthenticated = Boolean(session && session.accessToken);
    const reauthRequired = Boolean(session?.reauthRequired || (session?.expiresAt && session.expiresAt < Date.now()));

    if (session && reauthRequired) {
      return {
        status: 'REAUTH_REQUIRED',
        guildId: options.guildId,
        communityId: options.communityId,
        botInstalled: false,
        botGatewayConnected: discordService.isConnected(),
        permissionsValid: false,
        missingPermissions: [],
        userAuthenticated: true,
        reauthRequired: true,
        message: 'Discord OAuth session expired or revoked. Re-authentication required.',
      };
    }

    // 2. Resolve Target Guild ID
    let targetGuildId = options.guildId;
    let targetCommId = options.communityId;

    if (!targetGuildId && targetCommId) {
      const comm = await communitiesRepository.getById(targetCommId);
      if (comm) {
        targetGuildId = comm.guildId || comm.discordGuildId;
      }
    } else if (targetGuildId && !targetCommId) {
      const comms = await communitiesRepository.list();
      const match = comms.find((c) => c.guildId === targetGuildId || c.discordGuildId === targetGuildId);
      if (match) {
        targetCommId = match.id;
      }
    }

    if (!targetGuildId) {
      return {
        status: userAuthenticated ? 'AUTHENTICATED' : 'NOT_CONFIGURED',
        botInstalled: false,
        botGatewayConnected: discordService.isConnected(),
        permissionsValid: false,
        missingPermissions: [],
        userAuthenticated,
        reauthRequired,
        message: userAuthenticated
          ? 'User authenticated with Discord OAuth. No guild selected.'
          : 'No target guild or active session found.',
      };
    }

    // 3. Resolve Connection Intent (Pending Install)
    const intents = await connectionIntentsRepository.list({
      where: [{ field: 'guildId', operator: '==', value: targetGuildId }],
    });
    const activeIntent = intents.find(
      (i) => i.status === 'PENDING' || i.status === 'INSTALLING' || i.status === 'BOT_DETECTED' || i.status === 'VERIFYING'
    );

    if (activeIntent && activeIntent.status === 'PENDING') {
      return {
        status: 'INSTALL_PENDING',
        guildId: targetGuildId,
        communityId: targetCommId,
        botInstalled: false,
        botGatewayConnected: discordService.isConnected(),
        permissionsValid: false,
        missingPermissions: [],
        userAuthenticated,
        reauthRequired,
        message: 'Bot installation link generated. Pending user confirmation on Discord.',
      };
    }

    // 4. Resolve Real Bot Presence
    let botGatewayConnected = discordService.isConnected();
    let botPresent = false;
    let guildName: string | undefined = undefined;

    if (botGatewayConnected) {
      const gatewayGuild = discordService.getGuild(targetGuildId);
      if (gatewayGuild) {
        botPresent = true;
        guildName = gatewayGuild.name;
      }
    }

    // Check database records if gateway doesn't report it
    if (!botPresent) {
      const installations = await botInstallationsRepository.list({
        where: [{ field: 'guildId', operator: '==', value: targetGuildId }],
      });
      const installedRecord = installations.find((inst) => inst.status === 'INSTALLED');
      if (installedRecord) {
        botPresent = true;
      }
    }

    if (!botPresent) {
      return {
        status: activeIntent?.status === 'BOT_DETECTED' ? 'BOT_DETECTED' : 'INSTALL_REQUIRED',
        guildId: targetGuildId,
        communityId: targetCommId,
        botInstalled: false,
        botGatewayConnected,
        permissionsValid: false,
        missingPermissions: [],
        userAuthenticated,
        reauthRequired,
        message: 'Bot is not installed in the target server.',
      };
    }

    // 5. Evaluate Permissions & Hierarchy
    let permissionsValid = true;
    let missingPermissions: string[] = [];
    try {
      const diagnostics = await discordPermissionEngineService.getGuildDiagnostics(targetGuildId);
      permissionsValid = diagnostics.botInstalled && diagnostics.guildVerified && diagnostics.rolesReady;
      missingPermissions = diagnostics.missingPermissions || [];
    } catch (err) {
      logger.warn(`[DiscordStatusService] Diagnostic check notice for guild ${targetGuildId}: ${(err as Error).message}`);
    }

    if (!permissionsValid && missingPermissions.length > 0) {
      return {
        status: 'PERMISSION_REQUIRED',
        guildId: targetGuildId,
        guildName,
        communityId: targetCommId,
        botInstalled: true,
        botGatewayConnected,
        permissionsValid: false,
        missingPermissions,
        userAuthenticated,
        reauthRequired,
        message: `Bot missing required permissions: ${missingPermissions.join(', ')}`,
      };
    }

    // 6. Connected State
    return {
      status: 'CONNECTED',
      guildId: targetGuildId,
      guildName,
      communityId: targetCommId,
      botInstalled: true,
      botGatewayConnected,
      permissionsValid: true,
      missingPermissions: [],
      userAuthenticated,
      reauthRequired: false,
      message: 'Discord Bot and OAuth fully connected and operational.',
    };
  }
}

export const discordStatusService = new DiscordStatusService();
