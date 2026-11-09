import { REST, Routes } from 'discord.js';
import { discordCommands } from './commands/index.js';
import { config } from '../../config/env.js';
import { logger } from '../../logging/logger.js';
import { communitiesRepository } from '../../repositories/index.js';

export interface CommandRegistrationResult {
  status:
    | 'SUCCESS'
    | 'NOT_CONFIGURED'
    | 'FAILED'
    | 'DISCORD_AUTHENTICATION_FAILED'
    | 'DISCORD_PERMISSION_REQUIRED'
    | 'DISCORD_GUILD_NOT_FOUND'
    | 'DISCORD_COMMAND_REGISTRATION_FAILED'
    | 'DISCORD_NOT_CONNECTED'
    | 'DISCORD_RATE_LIMITED';
  commandsCount: number;
  registeredNames: string[];
  scope: 'GLOBAL' | 'GUILD' | 'BOTH' | 'NONE';
  timestamp: string;
  error?: string;
  guildId?: string;
}

let lastSyncTimestamp: string | null = null;
let lastSyncResult: CommandRegistrationResult = {
  status: 'NOT_CONFIGURED',
  commandsCount: 0,
  registeredNames: [],
  scope: 'NONE',
  timestamp: new Date().toISOString(),
};

export function getLastSyncDiagnostics() {
  return {
    lastSyncTimestamp,
    lastSyncResult: lastSyncResult.status,
    lastSyncDetails: lastSyncResult,
  };
}

export function classifyRegistrationError(err: any): { status: CommandRegistrationResult['status']; error: string } {
  const msg = err?.message || String(err);
  const status = err?.status || err?.rawError?.status || err?.code;

  if (status === 401 || msg.includes('401') || msg.includes('Unauthorized') || msg.includes('TOKEN_INVALIDITY')) {
    return { status: 'DISCORD_AUTHENTICATION_FAILED', error: `DISCORD_AUTHENTICATION_FAILED: ${msg}` };
  }
  if (status === 403 || msg.includes('403') || msg.includes('Missing Access') || msg.includes('Permissions')) {
    return { status: 'DISCORD_PERMISSION_REQUIRED', error: `DISCORD_PERMISSION_REQUIRED: ${msg}` };
  }
  if (status === 404 || msg.includes('404') || msg.includes('Unknown Guild')) {
    return { status: 'DISCORD_GUILD_NOT_FOUND', error: `DISCORD_GUILD_NOT_FOUND: ${msg}` };
  }
  if (status === 429 || msg.includes('429') || msg.includes('Rate Limit') || msg.includes('rate limited')) {
    return { status: 'DISCORD_RATE_LIMITED', error: `DISCORD_RATE_LIMITED: ${msg}` };
  }
  if (msg.includes('NOT_CONNECTED') || msg.includes('ENOTFOUND') || msg.includes('fetch failed')) {
    return { status: 'DISCORD_NOT_CONNECTED', error: `DISCORD_NOT_CONNECTED: ${msg}` };
  }

  return { status: 'DISCORD_COMMAND_REGISTRATION_FAILED', error: `DISCORD_COMMAND_REGISTRATION_FAILED: ${msg}` };
}

/**
 * Registers application slash commands with the Discord REST API cleanly and idempotently.
 */
export async function registerSlashCommands(guildId?: string): Promise<CommandRegistrationResult> {
  const token = config.DISCORD_BOT_TOKEN;
  const applicationId = config.DISCORD_APPLICATION_ID || config.DISCORD_CLIENT_ID || '1547515985416822884';
  const nowStr = new Date().toISOString();

  if (!token || token.startsWith('mock_')) {
    logger.debug('[DiscordSlash] Cannot register commands: DISCORD_BOT_TOKEN unconfigured or invalid.');
    lastSyncTimestamp = nowStr;
    lastSyncResult = {
      status: 'DISCORD_AUTHENTICATION_FAILED',
      commandsCount: 0,
      registeredNames: [],
      scope: 'NONE',
      timestamp: nowStr,
      error: 'DISCORD_AUTHENTICATION_FAILED: DISCORD_BOT_TOKEN is missing or unconfigured in environment.',
    };
    return lastSyncResult;
  }

  // Idempotent duplicate-safe command deduplication
  const uniqueMap = new Map<string, any>();
  for (const c of discordCommands) {
    uniqueMap.set(c.data.name, c.data.toJSON());
  }
  const commandData = Array.from(uniqueMap.values());

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    if (guildId) {
      // Validate real guild mapping
      const comms = await communitiesRepository.list({
        where: [{ field: 'guildId', operator: '==', value: guildId }],
        limit: 1,
      });

      if (comms.length === 0 && guildId === 'DEV_GUILD_ID') {
        logger.warn(`[DiscordSlash] Rejected command registration for DEV_GUILD_ID fallback.`);
        lastSyncTimestamp = nowStr;
        lastSyncResult = {
          status: 'DISCORD_GUILD_NOT_FOUND',
          commandsCount: 0,
          registeredNames: [],
          scope: 'GUILD',
          guildId,
          timestamp: nowStr,
          error: `DISCORD_GUILD_NOT_FOUND: DEV_GUILD_ID is not a valid production Community mapping.`,
        };
        return lastSyncResult;
      }

      // Global commands already cover every server; a server copy would show each command twice.
      await rest.put(
        Routes.applicationGuildCommands(applicationId, guildId),
        { body: [] }
      );
      await rest.put(Routes.applicationCommands(applicationId), { body: commandData });

      const verifiedRemote = (await rest.get(
        Routes.applicationCommands(applicationId)
      )) as any[];

      const registeredNames = Array.isArray(verifiedRemote) ? verifiedRemote.map((cmd: any) => cmd.name) : [];
      logger.info(`[DiscordSlash] Successfully registered and verified ${registeredNames.length} guild slash commands for guild ${guildId}`);

      lastSyncTimestamp = nowStr;
      lastSyncResult = {
        status: 'SUCCESS',
        commandsCount: registeredNames.length,
        registeredNames,
        scope: 'GUILD',
        guildId,
        timestamp: nowStr,
      };
      return lastSyncResult;
    } else {
      // Global registration
      await rest.put(
        Routes.applicationCommands(applicationId),
        { body: commandData }
      );

      const verifiedRemote = (await rest.get(
        Routes.applicationCommands(applicationId)
      )) as any[];

      const registeredNames = Array.isArray(verifiedRemote) ? verifiedRemote.map((cmd: any) => cmd.name) : [];

      // Commands are global only. Older versions also registered a copy per server, which made
      // every command show twice; remove those server copies.
      try {
        const { discordService } = await import('./discord.service.js');
        const guildIds = Array.from(((discordService as any).client?.guilds?.cache?.keys?.() || []) as Iterable<string>);
        for (const gid of guildIds) {
          const existing = (await rest.get(Routes.applicationGuildCommands(applicationId, gid)).catch(() => [])) as any[];
          if (Array.isArray(existing) && existing.length) {
            await rest.put(Routes.applicationGuildCommands(applicationId, gid), { body: [] }).catch(() => undefined);
            logger.info(`[DiscordSlash] Removed ${existing.length} duplicate server-only commands in ${gid}`);
          }
        }
      } catch (gErr: any) {
        logger.warn(`[DiscordSlash] Could not clear server-only command copies: ${gErr.message}`);
      }

      logger.info(`[DiscordSlash] Successfully registered and verified ${registeredNames.length} global slash commands`);

      lastSyncTimestamp = nowStr;
      lastSyncResult = {
        status: 'SUCCESS',
        commandsCount: registeredNames.length,
        registeredNames,
        scope: 'GLOBAL',
        timestamp: nowStr,
      };
      return lastSyncResult;
    }
  } catch (err: any) {
    const classification = classifyRegistrationError(err);
    logger.error('[DiscordSlash] Failed to register slash commands:', undefined, {
      error: classification.error,
      status: classification.status,
    });

    lastSyncTimestamp = nowStr;
    lastSyncResult = {
      status: classification.status,
      commandsCount: 0,
      registeredNames: [],
      scope: guildId ? 'GUILD' : 'GLOBAL',
      guildId,
      timestamp: nowStr,
      error: classification.error,
    };
    return lastSyncResult;
  }
}
