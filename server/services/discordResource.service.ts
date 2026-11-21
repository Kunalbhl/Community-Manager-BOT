import { discordService } from '../integrations/discord/discord.service.js';
import { isObfuscated } from '../integrations/discord/channelAccess.js';
import { logger } from '../logging/logger.js';
import {
  DiscordGuildResource,
  DiscordChannelResource,
  DiscordRoleResource,
  DiscordMemberResource,
  DiscordChannelType,
  DiscordDiscoveryState,
  DiscordResourceDiscoveryResult,
} from '../../shared/types/discord.js';

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

export class DiscordResourceService {
  private static cache = new Map<string, CacheEntry<any>>();
  private static CACHE_TTL_MS = 15000; // 15 seconds transient cache

  private static getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > this.CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private static setCached<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      cachedAt: Date.now(),
    });
  }

  /**
   * Invalidate cached resources for a specific guild or all.
   */
  static invalidateCache(guildId?: string): void {
    if (guildId) {
      for (const key of this.cache.keys()) {
        if (key.includes(guildId)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  /**
   * Discovers all Discord guilds accessible to the authenticated bot.
   */
  static async getGuilds(): Promise<DiscordResourceDiscoveryResult<DiscordGuildResource>> {
    const now = new Date().toISOString();

    if (!discordService.isConnected()) {
      const state: DiscordDiscoveryState = discordService.isConfigured() ? 'DISCONNECTED' : 'NOT_CONFIGURED';
      return {
        success: false,
        state,
        isLive: false,
        items: [],
        totalCount: 0,
        discoveredAt: now,
        error: 'Discord bot gateway is not connected',
      };
    }

    try {
      const client = (discordService as any).client;
      if (!client || !client.guilds) {
        return {
          success: false,
          state: 'DISCONNECTED',
          isLive: false,
          items: [],
          totalCount: 0,
          discoveredAt: now,
          error: 'Discord client unavailable',
        };
      }

      const guilds: DiscordGuildResource[] = [];
      const cacheEntries = client.guilds.cache;

      if (cacheEntries && typeof cacheEntries[Symbol.iterator] === 'function') {
        for (const [id, g] of cacheEntries) {
          guilds.push({
            id: g.id || id,
            name: g.name || `Guild ${id}`,
            iconURL: typeof g.iconURL === 'function' ? g.iconURL() : g.iconURL || null,
            memberCount: g.memberCount || 0,
            ownerId: g.ownerId,
            permissions: g.permissions?.bitfield?.toString(),
            isAvailable: g.available !== false,
          });
        }
      }

      return {
        success: true,
        state: 'CONNECTED',
        isLive: true,
        items: guilds,
        totalCount: guilds.length,
        discoveredAt: now,
      };
    } catch (err: any) {
      logger.error(`[DiscordResourceService] getGuilds error: ${err.message}`);
      return {
        success: false,
        state: 'ERROR',
        isLive: false,
        items: [],
        totalCount: 0,
        discoveredAt: now,
        error: err.message,
      };
    }
  }

  /**
   * Discovers a specific Discord guild.
   */
  static async getGuild(guildId: string): Promise<DiscordGuildResource | null> {
    if (!guildId || !discordService.isConnected()) return null;

    try {
      const client = (discordService as any).client;
      if (!client?.guilds) return null;

      let g = client.guilds.cache?.get(guildId);
      if (!g && typeof client.guilds.fetch === 'function') {
        g = await client.guilds.fetch(guildId).catch(() => null);
      }

      if (!g) return null;

      return {
        id: g.id,
        name: g.name,
        iconURL: typeof g.iconURL === 'function' ? g.iconURL() : g.iconURL || null,
        memberCount: g.memberCount || 0,
        ownerId: g.ownerId,
        permissions: g.permissions?.bitfield?.toString(),
        isAvailable: g.available !== false,
      };
    } catch (err: any) {
      logger.warn(`[DiscordResourceService] getGuild(${guildId}) error: ${err.message}`);
      return null;
    }
  }

  /**
   * Helper to map raw Discord channel type integer to canonical string
   */
  private static mapChannelType(type: number | string): DiscordChannelType {
    if (typeof type === 'string') {
      const upper = type.toUpperCase();
      if (upper === 'GUILD_TEXT' || upper === 'TEXT') return 'GUILD_TEXT';
      if (upper === 'GUILD_VOICE' || upper === 'VOICE') return 'GUILD_VOICE';
      if (upper === 'GUILD_CATEGORY' || upper === 'CATEGORY') return 'GUILD_CATEGORY';
      if (upper === 'GUILD_ANNOUNCEMENT' || upper === 'ANNOUNCEMENT') return 'GUILD_ANNOUNCEMENT';
      if (upper === 'GUILD_FORUM' || upper === 'FORUM') return 'GUILD_FORUM';
      if (upper === 'GUILD_STAGE_VOICE' || upper === 'STAGE') return 'GUILD_STAGE_VOICE';
      return 'UNKNOWN';
    }

    switch (type) {
      case 0:
        return 'GUILD_TEXT';
      case 1:
        return 'DM';
      case 2:
        return 'GUILD_VOICE';
      case 3:
        return 'GROUP_DM';
      case 4:
        return 'GUILD_CATEGORY';
      case 5:
        return 'GUILD_ANNOUNCEMENT';
      case 10:
        return 'ANNOUNCEMENT_THREAD';
      case 11:
        return 'PUBLIC_THREAD';
      case 12:
        return 'PRIVATE_THREAD';
      case 13:
        return 'GUILD_STAGE_VOICE';
      case 14:
        return 'GUILD_DIRECTORY';
      case 15:
        return 'GUILD_FORUM';
      case 16:
        return 'GUILD_MEDIA';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Discovers all channels for a guild directly from live Discord gateway.
   * Never returns fake or synthetic fallback channels.
   */
  static async getChannels(
    guildId: string,
    options?: { types?: DiscordChannelType[]; textOnly?: boolean }
  ): Promise<DiscordResourceDiscoveryResult<DiscordChannelResource>> {
    const now = new Date().toISOString();

    if (!guildId) {
      return {
        success: false,
        state: 'GUILD_NOT_FOUND',
        isLive: false,
        items: [],
        totalCount: 0,
        discoveredAt: now,
        error: 'Guild ID is required',
      };
    }

    const cacheKey = `channels_${guildId}_${options?.textOnly ? 'text' : 'all'}`;
    const cached = this.getCached<DiscordChannelResource[]>(cacheKey);
    if (cached) {
      return {
        success: true,
        state: 'CONNECTED',
        isLive: true,
        guildId,
        items: cached,
        totalCount: cached.length,
        cached: true,
        discoveredAt: now,
      };
    }

    if (!discordService.isConnected()) {
      const state: DiscordDiscoveryState = discordService.isConfigured() ? 'DISCONNECTED' : 'NOT_CONFIGURED';
      return {
        success: false,
        state,
        isLive: false,
        guildId,
        items: [],
        totalCount: 0,
        discoveredAt: now,
        error: 'Discord bot is not connected to gateway',
      };
    }

    try {
      const client = (discordService as any).client;
      let guild = client?.guilds?.cache?.get(guildId);
      if (!guild && typeof client?.guilds?.fetch === 'function') {
        guild = await client.guilds.fetch(guildId).catch(() => null);
      }

      if (!guild) {
        return {
          success: false,
          state: 'GUILD_NOT_FOUND',
          isLive: false,
          guildId,
          items: [],
          totalCount: 0,
          discoveredAt: now,
          error: `Discord guild ${guildId} not found or bot lacks access`,
        };
      }

      let fetchedChannels: any[] = [];
      if (typeof guild.channels?.fetch === 'function') {
        const chanMap = await guild.channels.fetch();
        fetchedChannels = Array.from(chanMap.values()).filter(Boolean);
      } else if (guild.channels?.cache) {
        fetchedChannels = Array.from(guild.channels.cache.values()).filter(Boolean);
      }

      fetchedChannels = fetchedChannels.filter((c: any) => !isObfuscated(c));
      const parentMap = new Map<string, string>();
      for (const c of fetchedChannels) {
        if (c.type === 4 || c.type === 'GUILD_CATEGORY' || c.type === 'CATEGORY') {
          parentMap.set(c.id, c.name);
        }
      }

      // Get the bot member in this guild to resolve actual channel permissions
      const botMember = guild.members?.me || (guild.client?.user?.id ? guild.members?.cache?.get(guild.client.user.id) : null);

      let channels: DiscordChannelResource[] = fetchedChannels.map((c: any) => {
        const mappedType = this.mapChannelType(c.type);
        const isTextBased =
          mappedType === 'GUILD_TEXT' ||
          mappedType === 'GUILD_ANNOUNCEMENT' ||
          mappedType === 'GUILD_FORUM' ||
          (typeof c.isTextBased === 'function' ? c.isTextBased() : false);
        const isVoiceBased =
          mappedType === 'GUILD_VOICE' ||
          mappedType === 'GUILD_STAGE_VOICE' ||
          (typeof c.isVoiceBased === 'function' ? c.isVoiceBased() : false);

        // Resolve actual bot permissions for this channel
        let canBotView = true;
        let canBotSendMessages = isTextBased;
        let canBotEmbed = isTextBased;
        let canBotReadHistory = isTextBased;
        let canBotManageMessages = false;
        let canBotAddReactions = isTextBased;
        let canBotAttachFiles = isTextBased;

        if (botMember && typeof c.permissionsFor === 'function') {
          try {
            const perms = c.permissionsFor(botMember);
            if (perms) {
              canBotView = typeof perms.has === 'function' ? perms.has('ViewChannel') || perms.has(1024n) : true;
              canBotSendMessages = typeof perms.has === 'function' ? perms.has('SendMessages') || perms.has(2048n) : isTextBased;
              canBotEmbed = typeof perms.has === 'function' ? perms.has('EmbedLinks') || perms.has(16384n) : isTextBased;
              canBotReadHistory = typeof perms.has === 'function' ? perms.has('ReadMessageHistory') || perms.has(65536n) : isTextBased;
              canBotManageMessages = typeof perms.has === 'function' ? perms.has('ManageMessages') || perms.has(8192n) : false;
              canBotAddReactions = typeof perms.has === 'function' ? perms.has('AddReactions') || perms.has(64n) : isTextBased;
              canBotAttachFiles = typeof perms.has === 'function' ? perms.has('AttachFiles') || perms.has(32768n) : isTextBased;
            }
          } catch {
            // Fallback safely
          }
        }

        return {
          id: c.id,
          name: c.name?.startsWith('#') ? c.name : `#${c.name || 'channel'}`,
          type: mappedType,
          rawType: c.type,
          position: c.position ?? 0,
          parentId: c.parentId || c.parent_id || null,
          parentName: c.parentId ? parentMap.get(c.parentId) : undefined,
          topic: c.topic || null,
          isTextBased,
          isVoiceBased,
          canBotSendMessages: canBotSendMessages && canBotView,
          canBotView,
          canBotEmbed,
          canBotReadHistory,
          canBotManageMessages,
          canBotAddReactions,
          canBotAttachFiles,
          permissionsSummary: {
            view: canBotView,
            send: canBotSendMessages,
            embed: canBotEmbed,
            history: canBotReadHistory,
            manageMessages: canBotManageMessages,
            addReactions: canBotAddReactions,
            attachFiles: canBotAttachFiles,
          },
        };
      });

      if (options?.textOnly) {
        channels = channels.filter(
          (c) => c.type === 'GUILD_TEXT' || c.type === 'GUILD_ANNOUNCEMENT' || c.isTextBased
        );
      }

      if (options?.types && options.types.length > 0) {
        channels = channels.filter((c) => options.types!.includes(c.type));
      }

      // Sort text/announcement channels alphabetically
      channels.sort((a, b) => a.name.localeCompare(b.name));

      this.setCached(cacheKey, channels);

      return {
        success: true,
        state: 'CONNECTED',
        isLive: true,
        guildId,
        guildName: guild.name,
        items: channels,
        totalCount: channels.length,
        discoveredAt: now,
      };
    } catch (err: any) {
      logger.error(`[DiscordResourceService] getChannels(${guildId}) error: ${err.message}`);
      return {
        success: false,
        state: 'ERROR',
        isLive: false,
        guildId,
        items: [],
        totalCount: 0,
        discoveredAt: now,
        error: err.message,
      };
    }
  }

  /**
   * Discovers all roles for a guild directly from live Discord gateway.
   * Never returns fake or synthetic fallback roles.
   */
  static async getRoles(
    guildId: string,
    options?: { includeEveryone?: boolean; unmanagedOnly?: boolean }
  ): Promise<DiscordResourceDiscoveryResult<DiscordRoleResource>> {
    const now = new Date().toISOString();

    if (!guildId) {
      return {
        success: false,
        state: 'GUILD_NOT_FOUND',
        isLive: false,
        items: [],
        totalCount: 0,
        discoveredAt: now,
        error: 'Guild ID is required',
      };
    }

    const cacheKey = `roles_${guildId}_${options?.includeEveryone ? 'all' : 'no_everyone'}`;
    const cached = this.getCached<DiscordRoleResource[]>(cacheKey);
    if (cached) {
      return {
        success: true,
        state: 'CONNECTED',
        isLive: true,
        guildId,
        items: cached,
        totalCount: cached.length,
        cached: true,
        discoveredAt: now,
      };
    }

    if (!discordService.isConnected()) {
      const state: DiscordDiscoveryState = discordService.isConfigured() ? 'DISCONNECTED' : 'NOT_CONFIGURED';
      return {
        success: false,
        state,
        isLive: false,
        guildId,
        items: [],
        totalCount: 0,
        discoveredAt: now,
        error: 'Discord bot is not connected to gateway',
      };
    }

    try {
      const client = (discordService as any).client;
      let guild = client?.guilds?.cache?.get(guildId);
      if (!guild && typeof client?.guilds?.fetch === 'function') {
        guild = await client.guilds.fetch(guildId).catch(() => null);
      }

      if (!guild) {
        return {
          success: false,
          state: 'GUILD_NOT_FOUND',
          isLive: false,
          guildId,
          items: [],
          totalCount: 0,
          discoveredAt: now,
          error: `Discord guild ${guildId} not found or bot lacks access`,
        };
      }

      let fetchedRoles: any[] = [];
      if (typeof guild.roles?.fetch === 'function') {
        const roleMap = await guild.roles.fetch();
        fetchedRoles = Array.from(roleMap.values()).filter(Boolean);
      } else if (guild.roles?.cache) {
        fetchedRoles = Array.from(guild.roles.cache.values()).filter(Boolean);
      }

      const botMember = guild.members?.me || (guild.client?.user?.id ? guild.members?.cache?.get(guild.client.user.id) : null);
      let botHighestPosition = 0;
      if (botMember?.roles?.highest?.position !== undefined) {
        botHighestPosition = botMember.roles.highest.position;
      } else if (botMember?.roles?.cache) {
        botHighestPosition = Math.max(...Array.from(botMember.roles.cache.values()).map((r: any) => r.position || 0), 0);
      }

      const botHasManageRoles = botMember?.permissions?.has
        ? Boolean(botMember.permissions.has('ManageRoles') || botMember.permissions.has(268435456n))
        : true;

      let roles: DiscordRoleResource[] = fetchedRoles.map((r: any) => {
        const isSystemRole = Boolean(r.managed || r.name === '@everyone');
        const isHigherThanBot = botHighestPosition > 0 ? r.position >= botHighestPosition : false;
        const botManageable = !isSystemRole && !isHigherThanBot && botHasManageRoles;

        return {
          id: r.id,
          name: r.name,
          color: r.hexColor && r.hexColor !== '#000000' ? r.hexColor : undefined,
          hexColor: r.hexColor || '#000000',
          position: r.position ?? 0,
          managed: Boolean(r.managed),
          mentionable: Boolean(r.mentionable),
          hoist: Boolean(r.hoist),
          permissions: Array.isArray(r.permissions?.toArray)
            ? r.permissions.toArray()
            : typeof r.permissions === 'object' && r.permissions !== null
            ? Object.keys(r.permissions)
            : [],
          permissionsBitfield: r.permissions?.bitfield?.toString(),
          isSystemRole,
          isBotRole: Boolean(r.tags?.botId || r.managed),
          botManageable,
          isHigherThanBot,
        };
      });

      if (!options?.includeEveryone) {
        roles = roles.filter((r) => r.name !== '@everyone');
      }

      if (options?.unmanagedOnly) {
        roles = roles.filter((r) => !r.managed);
      }

      // Sort by position descending (highest role in hierarchy first)
      roles.sort((a, b) => b.position - a.position);

      this.setCached(cacheKey, roles);

      return {
        success: true,
        state: 'CONNECTED',
        isLive: true,
        guildId,
        guildName: guild.name,
        items: roles,
        totalCount: roles.length,
        discoveredAt: now,
      };
    } catch (err: any) {
      logger.error(`[DiscordResourceService] getRoles(${guildId}) error: ${err.message}`);
      return {
        success: false,
        state: 'ERROR',
        isLive: false,
        guildId,
        items: [],
        totalCount: 0,
        discoveredAt: now,
        error: err.message,
      };
    }
  }

  /**
   * Discovers guild members directly from live Discord gateway.
   */
  static async getMembers(
    guildId: string,
    options?: { limit?: number; query?: string; after?: string }
  ): Promise<DiscordResourceDiscoveryResult<DiscordMemberResource>> {
    const now = new Date().toISOString();

    if (!guildId) {
      return {
        success: false,
        state: 'GUILD_NOT_FOUND',
        isLive: false,
        items: [],
        totalCount: 0,
        discoveredAt: now,
        error: 'Guild ID is required',
      };
    }

    if (!discordService.isConnected()) {
      const state: DiscordDiscoveryState = discordService.isConfigured() ? 'DISCONNECTED' : 'NOT_CONFIGURED';
      return {
        success: false,
        state,
        isLive: false,
        guildId,
        items: [],
        totalCount: 0,
        discoveredAt: now,
        error: 'Discord bot is not connected to gateway',
      };
    }

    try {
      const client = (discordService as any).client;
      let guild = client?.guilds?.cache?.get(guildId);
      if (!guild && typeof client?.guilds?.fetch === 'function') {
        guild = await client.guilds.fetch(guildId).catch(() => null);
      }

      if (!guild) {
        return {
          success: false,
          state: 'GUILD_NOT_FOUND',
          isLive: false,
          guildId,
          items: [],
          totalCount: 0,
          discoveredAt: now,
          error: `Discord guild ${guildId} not found`,
        };
      }

      let fetchedMembers: any[] = [];
      const fetchLimit = Math.min(options?.limit || 100, 1000);

      if (typeof guild.members?.fetch === 'function') {
        if (options?.query) {
          const searchRes = await guild.members.fetch({ query: options.query, limit: fetchLimit });
          fetchedMembers = Array.from(searchRes.values()).filter(Boolean);
        } else {
          const fetchRes = await guild.members.fetch({ limit: fetchLimit, after: options?.after });
          fetchedMembers = Array.from(fetchRes.values()).filter(Boolean);
        }
      } else if (guild.members?.cache) {
        fetchedMembers = Array.from(guild.members.cache.values()).filter(Boolean);
      }

      const members: DiscordMemberResource[] = fetchedMembers.map((m: any) => {
        const user = m.user || m;
        const roleIds: string[] = [];

        if (m.roles?.cache) {
          for (const [rId] of m.roles.cache) {
            if (rId !== guild.id) roleIds.push(rId);
          }
        } else if (Array.isArray(m.roles)) {
          roleIds.push(...m.roles);
        }

        return {
          id: user.id || m.id,
          discordUserId: user.id || m.id,
          username: user.username || user.tag || `user_${m.id}`,
          discriminator: user.discriminator !== '0' ? user.discriminator : undefined,
          globalName: user.globalName || null,
          displayName: m.displayName || user.displayName || user.username || `User ${m.id}`,
          nickname: m.nickname || null,
          avatarUrl: typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL() : user.avatarURL || null,
          roleIds,
          joinedAt: m.joinedAt ? new Date(m.joinedAt).toISOString() : null,
          isBot: Boolean(user.bot),
          isOwner: guild.ownerId === (user.id || m.id),
        };
      });

      return {
        success: true,
        state: 'CONNECTED',
        isLive: true,
        guildId,
        guildName: guild.name,
        items: members,
        totalCount: members.length,
        discoveredAt: now,
      };
    } catch (err: any) {
      logger.error(`[DiscordResourceService] getMembers(${guildId}) error: ${err.message}`);
      return {
        success: false,
        state: 'ERROR',
        isLive: false,
        guildId,
        items: [],
        totalCount: 0,
        discoveredAt: now,
        error: err.message,
      };
    }
  }

  /**
   * Fetches single Discord member by ID.
   */
  static async getMember(guildId: string, discordUserId: string): Promise<DiscordMemberResource | null> {
    if (!guildId || !discordUserId || !discordService.isConnected()) return null;

    try {
      const client = (discordService as any).client;
      let guild = client?.guilds?.cache?.get(guildId);
      if (!guild && typeof client?.guilds?.fetch === 'function') {
        guild = await client.guilds.fetch(guildId).catch(() => null);
      }
      if (!guild) return null;

      let m: any = null;
      if (typeof guild.members?.fetch === 'function') {
        m = await guild.members.fetch(discordUserId).catch(() => null);
      } else if (guild.members?.cache) {
        m = guild.members.cache.get(discordUserId);
      }

      if (!m) return null;

      const user = m.user || m;
      const roleIds: string[] = [];

      if (m.roles?.cache) {
        for (const [rId] of m.roles.cache) {
          if (rId !== guild.id) roleIds.push(rId);
        }
      } else if (Array.isArray(m.roles)) {
        roleIds.push(...m.roles);
      }

      return {
        id: user.id || m.id,
        discordUserId: user.id || m.id,
        username: user.username || user.tag || `user_${m.id}`,
        discriminator: user.discriminator !== '0' ? user.discriminator : undefined,
        globalName: user.globalName || null,
        displayName: m.displayName || user.displayName || user.username || `User ${m.id}`,
        nickname: m.nickname || null,
        avatarUrl: typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL() : user.avatarURL || null,
        roleIds,
        joinedAt: m.joinedAt ? new Date(m.joinedAt).toISOString() : null,
        isBot: Boolean(user.bot),
        isOwner: guild.ownerId === (user.id || m.id),
      };
    } catch (err: any) {
      logger.warn(`[DiscordResourceService] getMember(${guildId}, ${discordUserId}) error: ${err.message}`);
      return null;
    }
  }

  /**
   * Fetches single Discord channel by ID from transient cache or live Gateway.
   */
  static async getChannel(guildId: string, channelId: string): Promise<DiscordChannelResource | null> {
    if (!channelId || !guildId) return null;

    const cacheKeyText = `channels_${guildId}_text`;
    const cacheKeyAll = `channels_${guildId}_all`;
    const cachedText = this.getCached<DiscordChannelResource[]>(cacheKeyText);
    const cachedAll = this.getCached<DiscordChannelResource[]>(cacheKeyAll);
    const cachedList = cachedAll || cachedText;

    if (cachedList) {
      const match = cachedList.find((c) => c.id === channelId);
      if (match) return match;
    }

    if (!discordService.isConnected()) return null;

    try {
      const channelsRes = await this.getChannels(guildId);
      if (!channelsRes.success) return null;
      return channelsRes.items.find((c) => c.id === channelId) || null;
    } catch {
      return null;
    }
  }

  /**
   * Fetches single Discord role by ID from transient cache or live Gateway.
   */
  static async getRole(guildId: string, roleId: string): Promise<DiscordRoleResource | null> {
    if (!roleId || !guildId) return null;

    const cacheKeyAll = `roles_${guildId}_all`;
    const cacheKeyNoEveryone = `roles_${guildId}_no_everyone`;
    const cachedAll = this.getCached<DiscordRoleResource[]>(cacheKeyAll);
    const cachedNoEveryone = this.getCached<DiscordRoleResource[]>(cacheKeyNoEveryone);
    const cachedList = cachedAll || cachedNoEveryone;

    if (cachedList) {
      const match = cachedList.find((r) => r.id === roleId);
      if (match) return match;
    }

    if (!discordService.isConnected()) return null;

    try {
      const rolesRes = await this.getRoles(guildId, { includeEveryone: true });
      if (!rolesRes.success) return null;
      return rolesRes.items.find((r) => r.id === roleId) || null;
    } catch {
      return null;
    }
  }
}

export const discordResourceService = DiscordResourceService;
