import {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
} from 'discord.js';
import {
  DiscordProvider,
  DiscordMessageResult,
  DiscordGatewayState,
  DiscordGatewayDiagnostics,
} from './discord.interface.js';
import { attachGatewayEventHandlers } from './events/index.js';
import { config } from '../../config/env.js';
import { logger } from '../../logging/logger.js';
import { secretsManager } from '../../security/secrets.js';

export const AUTHORITATIVE_GATEWAY_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.DirectMessages,
  GatewayIntentBits.GuildVoiceStates, // voice XP and interview voice rooms
  // GuildPresences removed: privileged, unused, and heavy on memory/bandwidth.
] as const;

export class RealDiscordProvider implements DiscordProvider {
  client: Client | null = null;
  private state: DiscordGatewayState = 'NOT_CONFIGURED';
  private connectedAt?: string;
  private lastHeartbeatAt?: string;
  private disconnectReason?: string;
  private heartbeatInterval?: NodeJS.Timeout;
  private connectionPromise: Promise<boolean> | null = null;
  private messageContentIntentActive: boolean = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.updateInitialState();
  }

  private updateInitialState() {
    if (!config.DISCORD_BOT_TOKEN || config.DISCORD_BOT_TOKEN.startsWith('mock_')) {
      this.state = 'NOT_CONFIGURED';
    } else {
      this.state = 'DISCONNECTED';
    }
  }

  isConfigured(): boolean {
    return Boolean(config.DISCORD_BOT_TOKEN && !config.DISCORD_BOT_TOKEN.startsWith('mock_'));
  }

  isConnected(): boolean {
    return this.state === 'CONNECTED' && Boolean(this.client?.isReady());
  }

  isReady(): boolean {
    return this.state === 'CONNECTED' && Boolean(this.client?.isReady());
  }

  getGuild(guildId: string): any {
    return this.client?.isReady() ? this.client.guilds.cache.get(guildId) || null : null;
  }

  getConnectionState(): DiscordGatewayState {
    return this.state;
  }

  getDiagnostics(): DiscordGatewayDiagnostics {
    const isReady = Boolean(this.client?.isReady());
    const intents: string[] = [
      'Guilds',
      'GuildMembers',
      'GuildMessages',
      'GuildMessageReactions',
      'MessageContent',
      'DirectMessages',
    ];

    const effectiveState = (!config.DISCORD_BOT_TOKEN || config.DISCORD_BOT_TOKEN.startsWith('mock_'))
      ? 'NOT_CONFIGURED'
      : this.state;

    return {
      state: effectiveState,
      botTag: isReady ? this.client?.user?.tag : undefined,
      botUserId: isReady ? this.client?.user?.id : undefined,
      guildsCount: isReady ? (this.client?.guilds.cache.size || 0) : 0,
      pingMs: isReady ? (this.client?.ws.ping || 0) : -1,
      connectedAt: this.connectedAt,
      lastHeartbeatAt: this.lastHeartbeatAt,
      disconnectReason: this.disconnectReason,
      intentsEnabled: intents,
      messageContentIntentActive: isReady && this.messageContentIntentActive,
    };
  }

  async connect(): Promise<boolean> {
    if (this.connectionPromise) {
      logger.info('[DiscordGateway] Bot connection in progress. Returning existing connection promise.');
      return this.connectionPromise;
    }

    if (this.client) {
      logger.info('[DiscordGateway] Bot is already connected. Skipping duplicate connection.');
      return true;
    }

    this.connectionPromise = (async () => {
      const rawToken = config.DISCORD_BOT_TOKEN ? config.DISCORD_BOT_TOKEN.trim() : '';
      if (!rawToken || rawToken.startsWith('mock_')) {
        this.state = 'NOT_CONFIGURED';
        logger.info('[DiscordGateway] DISCORD_BOT_TOKEN not provided or unconfigured placeholder in environment. Gateway remains NOT_CONFIGURED.');
        this.connectionPromise = null;
        return false;
      }

      try {
        this.state = 'CONNECTING';
        logger.info('[DiscordGateway] Initializing Discord Gateway client...');

        this.client = new Client({
          intents: [...AUTHORITATIVE_GATEWAY_INTENTS],
          partials: [Partials.Channel, Partials.Message, Partials.User, Partials.Reaction, Partials.GuildMember],
        });

        // Hot standby: a waiting instance stays logged in to Discord but ignores events until it becomes
        // the active bot, so a handoff takes about two seconds instead of a full login.
        {
          const pass = new Set(['ready', 'clientReady', 'error', 'warn', 'debug', 'invalidated', 'shardReady', 'shardResume', 'shardDisconnect', 'shardReconnecting', 'shardError']);
          const c: any = this.client;
          const orig = c.emit.bind(c);
          c.emit = (event: string, ...args: any[]) => ((globalThis as any).__cmBotActive === false && !pass.has(event) ? false : orig(event, ...args));
        }

        // Attach all real Gateway event listeners
        attachGatewayEventHandlers(this.client);

        // Setup connection lifecycle listeners
        this.client.once('ready', (readyClient: any) => {
          this.state = 'CONNECTED';
          this.connectedAt = new Date().toISOString();
          this.lastHeartbeatAt = new Date().toISOString();
          this.disconnectReason = undefined;
          this.messageContentIntentActive = true;
          this.reconnectAttempts = 0;
          logger.info(`[DiscordGateway] Bot logged in and ready as ${readyClient?.user?.tag} (${readyClient?.user?.id}). Confirmed Guilds: ${readyClient?.guilds?.cache?.size || 0}`);
        });

        this.client.on('shardReady', (shardId) => {
          this.state = 'CONNECTED';
          this.connectedAt = new Date().toISOString();
          this.lastHeartbeatAt = new Date().toISOString();
          this.disconnectReason = undefined;
          this.messageContentIntentActive = true;
          this.reconnectAttempts = 0;
          logger.info(`[DiscordGateway] Shard ${shardId} connected successfully.`);
        });

        this.client.on('shardDisconnect', (event, shardId) => {
          this.state = 'DISCONNECTED';
          this.disconnectReason = `Shard ${shardId} disconnected: ${event.reason || 'Code ' + event.code}`;
          logger.warn(`[DiscordGateway] ${this.disconnectReason}`);
        });

        // A resumed session is fully connected again (discord.js does not re-fire shardReady on resume).
        this.client.on('shardResume', (shardId, replayed) => {
          this.state = 'CONNECTED';
          this.lastHeartbeatAt = new Date().toISOString();
          this.disconnectReason = undefined;
          this.reconnectAttempts = 0;
          logger.info(`[DiscordGateway] Shard ${shardId} resumed (${replayed} events replayed).`);
        });

        this.client.on('shardReconnecting', (shardId) => {
          this.state = 'RECONNECTING';
          logger.info(`[DiscordGateway] Shard ${shardId} reconnecting...`);
        });

        this.client.on('shardError', (error, shardId) => {
          // discord.js keeps retrying the shard itself; mark degraded rather than failed.
          this.state = 'RECONNECTING';
          this.disconnectReason = `Shard ${shardId} error: ${error.message}`;
          logger.error(`[DiscordGateway] Shard ${shardId} error:`, undefined, {
            error: error.message,
          });
        });

        // Track regular heartbeats
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
        }
        this.heartbeatInterval = setInterval(() => {
          if (this.client?.isReady()) {
            this.lastHeartbeatAt = new Date().toISOString();
            // Self-heal: gateway is up (status 0 = READY) but a missed lifecycle event left the flag behind.
            if (this.state !== 'CONNECTED' && (this.client as any).ws?.status === 0) {
              this.state = 'CONNECTED';
              this.disconnectReason = undefined;
              logger.info('[DiscordGateway] Gateway is ready again; status restored to CONNECTED.');
            }
            return;
          }
          // Watchdog: if the gateway has been down for 10 minutes, rebuild the client from scratch.
          const last = this.lastHeartbeatAt ? Date.parse(this.lastHeartbeatAt) : 0;
          if (last && Date.now() - last > 10 * 60 * 1000 && this.state !== 'CONNECTING') {
            logger.warn('[DiscordGateway] Watchdog: gateway not ready for 10 minutes. Rebuilding client.');
            this.disconnect()
              .then(() => this.connect())
              .catch((err) => logger.error(`[DiscordGateway] Watchdog reconnect failed: ${err?.message}`));
          }
        }, 30000);

        await this.client.login(rawToken);
        this.state = 'CONNECTED';
        this.connectedAt = new Date().toISOString();
        this.lastHeartbeatAt = new Date().toISOString();
        this.messageContentIntentActive = true;
        this.reconnectAttempts = 0;
        return true;
      } catch (err) {
        const errMsg = (err as Error).message;
        if (errMsg.includes('TOKEN_INVALID') || errMsg.toLowerCase().includes('invalid token') || (err as any)?.code === 'TokenInvalid' || errMsg.includes('401') || errMsg.includes('Disallowed')) {
          this.state = 'AUTHENTICATION_REQUIRED';
          this.disconnectReason = secretsManager.redactString(errMsg);
          logger.error('[DiscordGateway] Authentication failed (token invalid or disallowed intents):', undefined, {
            state: this.state,
            error: this.disconnectReason,
          });
        } else {
          this.state = 'FAILED';
          this.disconnectReason = secretsManager.redactString(errMsg);
          logger.error('[DiscordGateway] Login failed with transient/network error:', undefined, {
            state: this.state,
            error: this.disconnectReason,
          });
        }
        this.messageContentIntentActive = false;
        try { await this.client?.destroy(); } catch { /* ignore */ }
        this.client = null;
        this.connectionPromise = null;
        if (this.state === 'FAILED') this.scheduleReconnect();
        return false;
      }
    })();

    return this.connectionPromise;
  }

  private scheduleReconnect(): void {
    if (this.state === 'AUTHENTICATION_REQUIRED' || this.state === 'CONNECTED' || this.state === 'CONNECTING') {
      return;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // Never give up: a 24/7 bot must recover from any outage on its own.
    // Backoff grows to a 5-minute ceiling after MAX_RECONNECT_ATTEMPTS fast retries.
    this.reconnectAttempts++;
    const baseDelay = this.reconnectAttempts > this.MAX_RECONNECT_ATTEMPTS
      ? 300000
      : Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempts));
    const jitter = Math.floor(Math.random() * 1000);
    const delayMs = baseDelay + jitter;
    logger.info(`[DiscordGateway] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} in ${delayMs}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        logger.error(`[DiscordGateway] Reconnection attempt failed: ${err.message}`);
      });
    }, delayMs);
  }

  async disconnect(): Promise<void> {
    this.messageContentIntentActive = false;
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    if (this.client) {
      try {
        await this.client.destroy();
      } catch (err: any) {
        logger.warn(`[DiscordGateway] Error destroying client on disconnect: ${err.message}`);
      }
      this.client = null;
      this.connectionPromise = null;
      this.state = 'DISCONNECTED';
      this.disconnectReason = 'Manual disconnect requested';
      logger.info('[DiscordGateway] Bot disconnected cleanly.');
    }
  }

  async sendDM(discordUserId: string, content: string): Promise<DiscordMessageResult> {
    if (!this.isConnected() || !this.client) {
      throw new Error('DISCORD_BOT_NOT_CONNECTED: Cannot send DM because the bot is not connected to Discord Gateway.');
    }

    try {
      const user = await this.client.users.fetch(discordUserId).catch((fetchErr: any) => {
        if (fetchErr.code === 10013 || fetchErr.status === 404) {
          throw new Error('USER_NOT_FOUND');
        }
        throw fetchErr;
      });
      const msg = await user.send(content);
      return {
        messageId: msg.id,
        channelId: msg.channelId,
        sentAt: msg.createdAt ? msg.createdAt.toISOString() : new Date().toISOString(),
        success: true,
      };
    } catch (err: unknown) {
      const errMsg = (err as Error)?.message || String(err);
      let failureReason = 'DELIVERY_FAILED';
      if ((err as any)?.code === 50007 || errMsg.includes('Cannot send messages to this user')) {
        failureReason = 'DISCORD_PERMISSION_REQUIRED: Direct messages disabled or blocked';
      } else if (errMsg.includes('USER_NOT_FOUND') || (err as any)?.code === 10013) {
        failureReason = 'USER_NOT_FOUND';
      } else if ((err as any)?.status === 429) {
        failureReason = 'RATE_LIMITED';
      } else {
        failureReason = `DISCORD_API_ERROR: ${secretsManager.redactString(errMsg)}`;
      }

      logger.error(`[DiscordGateway] Failed to send DM to ${discordUserId}: ${failureReason}`);
      return {
        messageId: '',
        channelId: `dm_${discordUserId}`,
        sentAt: new Date().toISOString(),
        success: false,
        failureReason,
      };
    }
  }

  async sendChannelMessage(channelId: string, content: string, options?: { guildId?: string }): Promise<DiscordMessageResult> {
    if (!this.isConnected() || !this.client) {
      throw new Error('DISCORD_BOT_NOT_CONNECTED: Cannot send channel message because the bot is not connected to Discord Gateway.');
    }

    try {
      const channel = await this.client.channels.fetch(channelId).catch((fetchErr: any) => {
        if (fetchErr.code === 10003 || fetchErr.status === 404) {
          throw new Error('CHANNEL_NOT_FOUND');
        }
        if (fetchErr.code === 50013 || fetchErr.status === 403) {
          throw new Error('DISCORD_PERMISSION_REQUIRED');
        }
        throw fetchErr;
      });

      if (!channel || !channel.isTextBased() || !('send' in channel)) {
        return {
          messageId: '',
          channelId,
          sentAt: new Date().toISOString(),
          success: false,
          failureReason: 'CHANNEL_NOT_FOUND: Channel is not text-based or cannot receive messages',
        };
      }

      if (options?.guildId && 'guildId' in channel && (channel as any).guildId !== options.guildId) {
        return {
          messageId: '',
          channelId,
          sentAt: new Date().toISOString(),
          success: false,
          failureReason: 'CHANNEL_GUILD_MISMATCH: Channel does not belong to specified guild',
        };
      }

      // Respect the server's settings: only give the bot itself what it is missing (never @everyone).
      {
        const { ensureSelfAccess } = await import('./selfAccess.js');
        const problem = await ensureSelfAccess(channel, content);
        if (problem) return { messageId: '', channelId, sentAt: new Date().toISOString(), success: false, failureReason: `DISCORD_PERMISSION_REQUIRED: ${problem}` };
      }
      const msg = await (channel as unknown as { send: (c: string) => Promise<{ id: string; channelId: string; createdAt: Date }> }).send(content);
      return {
        messageId: msg.id,
        channelId: msg.channelId,
        sentAt: msg.createdAt ? msg.createdAt.toISOString() : new Date().toISOString(),
        success: true,
      };
    } catch (err: unknown) {
      const errMsg = (err as Error)?.message || String(err);
      let failureReason = 'DELIVERY_FAILED';
      if (errMsg.includes('CHANNEL_NOT_FOUND') || (err as any)?.code === 10003) {
        failureReason = 'CHANNEL_NOT_FOUND';
      } else if (errMsg.includes('PERMISSION') || (err as any)?.code === 50013 || (err as any)?.code === 50001) {
        failureReason = 'DISCORD_PERMISSION_REQUIRED: Bot lacks permission to send messages in channel';
      } else if ((err as any)?.status === 429) {
        failureReason = 'RATE_LIMITED';
      } else {
        failureReason = `DISCORD_API_ERROR: ${secretsManager.redactString(errMsg)}`;
      }

      logger.error(`[DiscordGateway] Failed to send channel message to ${channelId}: ${failureReason}`);
      return {
        messageId: '',
        channelId,
        sentAt: new Date().toISOString(),
        success: false,
        failureReason,
      };
    }
  }

  async editChannelMessage(
    channelId: string,
    messageId: string,
    content: string,
    options?: { guildId?: string; allowedMentions?: any }
  ): Promise<DiscordMessageResult> {
    if (!this.isConnected() || !this.client) {
      throw new Error('DISCORD_BOT_NOT_CONNECTED: Cannot edit channel message because the bot is not connected to Discord Gateway.');
    }

    try {
      const channel = await this.client.channels.fetch(channelId).catch((fetchErr: any) => {
        if (fetchErr.code === 10003 || fetchErr.status === 404) {
          throw new Error('CHANNEL_NOT_FOUND');
        }
        if (fetchErr.code === 50013 || fetchErr.status === 403) {
          throw new Error('DISCORD_PERMISSION_REQUIRED');
        }
        throw fetchErr;
      });

      if (!channel || !channel.isTextBased()) {
        return {
          messageId,
          channelId,
          sentAt: new Date().toISOString(),
          success: false,
          failureReason: 'CHANNEL_NOT_FOUND: Channel is not text-based or cannot receive messages',
        };
      }

      if (options?.guildId && 'guildId' in channel && (channel as any).guildId !== options.guildId) {
        return {
          messageId,
          channelId,
          sentAt: new Date().toISOString(),
          success: false,
          failureReason: 'CHANNEL_GUILD_MISMATCH: Channel does not belong to specified guild',
        };
      }

      const message = await (channel as any).messages.fetch(messageId).catch((fetchErr: any) => {
        if (fetchErr.code === 10008 || fetchErr.status === 404) {
          throw new Error('MESSAGE_NOT_FOUND');
        }
        throw fetchErr;
      });

      if (!message) {
        return {
          messageId,
          channelId,
          sentAt: new Date().toISOString(),
          success: false,
          failureReason: 'MESSAGE_NOT_FOUND: Target Discord message not found in channel',
        };
      }

      const editOptions: any = { content };
      if (options?.allowedMentions) {
        editOptions.allowedMentions = options.allowedMentions;
      }

      const editedMsg = await message.edit(editOptions);
      return {
        messageId: editedMsg.id,
        channelId: editedMsg.channelId || channelId,
        sentAt: editedMsg.editedAt ? editedMsg.editedAt.toISOString() : new Date().toISOString(),
        success: true,
      };
    } catch (err: unknown) {
      const errMsg = (err as Error)?.message || String(err);
      let failureReason = 'DELIVERY_FAILED';
      if (errMsg.includes('MESSAGE_NOT_FOUND') || (err as any)?.code === 10008) {
        failureReason = 'MESSAGE_NOT_FOUND: Target Discord message not found in channel';
      } else if (errMsg.includes('CHANNEL_NOT_FOUND') || (err as any)?.code === 10003) {
        failureReason = 'CHANNEL_NOT_FOUND';
      } else if (errMsg.includes('PERMISSION') || (err as any)?.code === 50013 || (err as any)?.code === 50001) {
        failureReason = 'DISCORD_PERMISSION_REQUIRED: Bot lacks permission to edit messages in channel';
      } else if ((err as any)?.status === 429) {
        failureReason = 'RATE_LIMITED';
      } else {
        failureReason = `DISCORD_API_ERROR: ${secretsManager.redactString(errMsg)}`;
      }

      logger.error(`[DiscordGateway] Failed to edit channel message ${messageId} in ${channelId}: ${failureReason}`);
      return {
        messageId,
        channelId,
        sentAt: new Date().toISOString(),
        success: false,
        failureReason,
      };
    }
  }

  async fetchChannelMessage(
    channelId: string,
    messageId: string,
    _options?: { guildId?: string }
  ): Promise<{ success: boolean; messageId?: string; content?: string; error?: string }> {
    if (!this.isConnected() || !this.client) {
      return { success: false, error: 'DISCORD_BOT_NOT_CONNECTED' };
    }
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        return { success: false, error: 'CHANNEL_NOT_FOUND' };
      }
      const message = await (channel as any).messages.fetch(messageId);
      if (!message) {
        return { success: false, error: 'MESSAGE_NOT_FOUND' };
      }
      return { success: true, messageId: message.id, content: message.content };
    } catch (err: any) {
      if (err?.code === 10008 || err?.status === 404) {
        return { success: false, error: 'MESSAGE_NOT_FOUND' };
      }
      return { success: false, error: err?.message || 'FETCH_FAILED' };
    }
  }

  async assignRole(guildId: string, discordUserId: string, roleId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isConnected() || !this.client) {
      return { success: false, error: 'DISCORD_BOT_NOT_CONNECTED' };
    }

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const botMember = await guild.members.fetchMe();

      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return { success: false, error: 'BOT_MISSING_MANAGE_ROLES_PERMISSION' };
      }

      const role = await guild.roles.fetch(roleId);
      if (!role) {
        return { success: false, error: 'ROLE_NOT_FOUND' };
      }

      if (botMember.roles.highest.position <= role.position) {
        return { success: false, error: 'ROLE_HIERARCHY_CONFLICT: Bot role must be higher than assigned role' };
      }

      const member = await guild.members.fetch(discordUserId);
      await member.roles.add(roleId);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async removeRole(guildId: string, discordUserId: string, roleId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.isConnected() || !this.client) {
      return { success: false, error: 'DISCORD_BOT_NOT_CONNECTED' };
    }

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const member = await guild.members.fetch(discordUserId);
      await member.roles.remove(roleId);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async createRole(guildId: string, options: { name: string; color?: string; mentionable?: boolean; hoist?: boolean }): Promise<{ success: boolean; role?: any; error?: string }> {
    if (!this.isConnected() || !this.client) {
      return { success: false, error: 'DISCORD_BOT_NOT_CONNECTED' };
    }

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const botMember = await guild.members.fetchMe();
      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return { success: false, error: 'BOT_MISSING_MANAGE_ROLES_PERMISSION' };
      }

      const createdRole = await guild.roles.create({
        name: options.name,
        color: options.color as any,
        mentionable: options.mentionable ?? false,
        hoist: options.hoist ?? false,
        reason: 'Created via Community Manager Discord Operations',
      });

      return {
        success: true,
        role: {
          id: createdRole.id,
          name: createdRole.name,
          color: createdRole.hexColor,
          position: createdRole.position,
          mentionable: createdRole.mentionable,
          hoist: createdRole.hoist,
          managed: createdRole.managed,
        },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async updateRole(guildId: string, roleId: string, updates: { name?: string; color?: string; mentionable?: boolean; hoist?: boolean }): Promise<{ success: boolean; role?: any; error?: string }> {
    if (!this.isConnected() || !this.client) {
      return { success: false, error: 'DISCORD_BOT_NOT_CONNECTED' };
    }

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const botMember = await guild.members.fetchMe();
      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return { success: false, error: 'BOT_MISSING_MANAGE_ROLES_PERMISSION' };
      }

      const role = await guild.roles.fetch(roleId);
      if (!role) {
        return { success: false, error: 'ROLE_NOT_FOUND' };
      }

      if (role.managed) {
        return { success: false, error: 'CANNOT_MODIFY_MANAGED_BOT_ROLE' };
      }

      if (botMember.roles.highest.position <= role.position) {
        return { success: false, error: 'ROLE_HIERARCHY_CONFLICT: Bot role must be higher than target role' };
      }

      const updated = await role.edit({
        name: updates.name ?? role.name,
        color: updates.color as any ?? role.color,
        mentionable: updates.mentionable ?? role.mentionable,
        hoist: updates.hoist ?? role.hoist,
        reason: 'Updated via Community Manager Discord Operations',
      });

      return {
        success: true,
        role: {
          id: updated.id,
          name: updated.name,
          color: updated.hexColor,
          position: updated.position,
          mentionable: updated.mentionable,
          hoist: updated.hoist,
          managed: updated.managed,
        },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async createChannel(guildId: string, options: { name: string; type?: number | string; parentId?: string; topic?: string }): Promise<{ success: boolean; channel?: any; error?: string }> {
    if (!this.isConnected() || !this.client) {
      return { success: false, error: 'DISCORD_BOT_NOT_CONNECTED' };
    }

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const botMember = await guild.members.fetchMe();
      if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return { success: false, error: 'BOT_MISSING_MANAGE_CHANNELS_PERMISSION' };
      }

      const channel = await guild.channels.create({
        name: options.name,
        topic: options.topic,
        parent: options.parentId,
        reason: 'Created via Community Manager Discord Operations',
      });

      return {
        success: true,
        channel: {
          id: channel.id,
          name: channel.name,
          type: channel.type,
          parentId: channel.parentId,
        },
      };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }

  async updateChannel(guildId: string, channelId: string, updates: { name?: string; topic?: string }): Promise<{ success: boolean; channel?: any; error?: string }> {
    if (!this.isConnected() || !this.client) {
      return { success: false, error: 'DISCORD_BOT_NOT_CONNECTED' };
    }

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const botMember = await guild.members.fetchMe();
      if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return { success: false, error: 'BOT_MISSING_MANAGE_CHANNELS_PERMISSION' };
      }

      const channel = await guild.channels.fetch(channelId);
      if (!channel) {
        return { success: false, error: 'CHANNEL_NOT_FOUND' };
      }

      if ('edit' in channel && typeof channel.edit === 'function') {
        const updated = await (channel as any).edit({
          name: updates.name ?? (channel as any).name,
          topic: updates.topic ?? (channel as any).topic,
          reason: 'Updated via Community Manager Discord Operations',
        });
        return {
          success: true,
          channel: {
            id: updated.id,
            name: updated.name,
            type: updated.type,
          },
        };
      }

      return { success: false, error: 'CHANNEL_CANNOT_BE_EDITED' };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

export const discordService: DiscordProvider = new RealDiscordProvider();

export { RealDiscordProvider as DiscordService };
