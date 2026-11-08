import { logger } from '../logging/logger.js';
import { config } from '../config/env.js';
import {
  communitiesRepository,
  platformServersRepository,
  botInstallationsRepository,
  onboardingProgressRepository,
  auditLogsRepository,
} from '../repositories/index.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { discordAuthService } from './discordAuth.service.js';
import { discordPermissionEngineService, AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD } from './discordPermissionEngine.service.js';
import { discordMemberSyncService } from './discordMemberSync.service.js';
import { discordResourceService } from './discordResource.service.js';
import { auditService } from './audit.service.js';
import { BadRequestError, ForbiddenError } from '../utils/errors.js';

export interface ResolveGuildParams {
  guildId: string;
  userId?: string;
  communityId?: string;
  source?: 'BOT_JOIN' | 'OAUTH_CALLBACK' | 'GATEWAY_BOOT' | 'MANUAL_REFRESH' | 'COMMAND' | 'ONBOARDING';
}

export interface GuildLinkResult {
  success: boolean;
  communityId: string;
  guildId: string;
  guildName: string;
  connectionStatus: 'CONNECTED' | 'BOT_NOT_INSTALLED' | 'PERMISSION_REQUIRED' | 'BOT_REMOVED' | 'SYNC_FAILED' | 'DISCORD_GUILD_ALREADY_CONNECTED';
  syncStatus: 'SYNC_PENDING' | 'SYNCING' | 'SYNCED' | 'SYNC_FAILED' | 'PERMISSION_REQUIRED';
  botInstalled: boolean;
  permissionsValid: boolean;
  missingPermissions: string[];
  syncMetrics?: {
    memberCount: number;
    channelCount: number;
    roleCount: number;
  };
  message?: string;
}

export class DiscordGuildLinkService {
  /**
   * Deterministic guild resolver following Task 65 priority order:
   * 1. Exact stored Guild ID
   * 2. Current authenticated user's authorized guilds
   * 3. Bot-installed guilds
   * 4. Current Gateway guild cache
   * 5. Discord REST confirmation
   */
  async resolveDiscordGuildForCommunity(guildId: string, userId?: string): Promise<{
    id: string;
    name: string;
    icon?: string;
    ownerId?: string;
    memberCount?: number;
    botPresent: boolean;
    permissionsBitfield?: string;
  } | null> {
    if (!guildId) return null;

    // 1. Check Gateway Client cache if connected
    let botPresent = false;
    let gatewayGuild: any = null;
    let permissionsBitfield: string | undefined = undefined;

    if (discordService.isConnected()) {
      try {
        const client = (discordService as any)['client'];
        if (client) {
          gatewayGuild = client.guilds.cache.get(guildId);
          if (!gatewayGuild) {
            try {
              gatewayGuild = await client.guilds.fetch(guildId);
            } catch (err) {
              // Guild not found in REST fetch via bot token
            }
          }
          if (gatewayGuild) {
            botPresent = true;
            try {
              const me = await gatewayGuild.members.fetchMe();
              permissionsBitfield = me?.permissions?.bitfield?.toString();
            } catch (err) {
              // Failed to fetch bot member
            }
          }
        }
      } catch (err) {
        logger.warn(`[DiscordGuildLink] Error resolving guild via Gateway client: ${(err as Error).message}`);
      }
    }

    // 2. Check stored platform server / installation records
    const storedServers = await platformServersRepository.list({
      where: [{ field: 'guildId', operator: '==', value: guildId }],
      limit: 1,
    });
    const storedServer = storedServers[0];

    // 3. Check user's authorized guilds if userId provided
    let userGuildName: string | undefined = undefined;
    let userGuildOwner: string | undefined = undefined;
    if (userId) {
      const session = await discordAuthService.getSession(userId);
      if (session?.guilds) {
        const found = session.guilds.find((g) => g.id === guildId);
        if (found) {
          userGuildName = (found as any).name;
          if (found.owner) userGuildOwner = userId;
        }
      }
    }

    const isRealMode = config.APP_RUNTIME_MODE === 'PRODUCTION' || config.APP_RUNTIME_MODE === 'REAL_DISCORD_PREVIEW';

    if (!gatewayGuild && !storedServer && !userGuildName) {
      // Dev/Fallback mock guild if token is mock or in test mode
      if (config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION') {
        return {
          id: guildId,
          name: `Discord Guild ${guildId.slice(-4)}`,
          ownerId: userId || 'usr_dev_owner',
          memberCount: 42,
          botPresent: true,
          permissionsBitfield: AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD,
        };
      }
      return null;
    }

    const finalBotPresent = isRealMode ? botPresent : (botPresent || storedServer?.botStatus === 'CONNECTED');

    return {
      id: guildId,
      name: gatewayGuild?.name || storedServer?.name || userGuildName || `Server ${guildId}`,
      icon: gatewayGuild?.iconURL() || undefined,
      ownerId: gatewayGuild?.ownerId || storedServer?.ownerUserId || userGuildOwner,
      memberCount: gatewayGuild?.memberCount || storedServer?.memberCount || 1,
      botPresent: finalBotPresent,
      permissionsBitfield,
    };
  }

  /**
   * Authoritative server-side service: Single Source of Truth for Guild Linking.
   * Invoked by OAuth callback, Gateway guildCreate, Bot install return, Gateway startup, manual refresh, onboarding wizard.
   */
  async resolveAndSyncDiscordGuildConnection(params: ResolveGuildParams): Promise<GuildLinkResult> {
    const { guildId, userId, source = 'MANUAL_REFRESH' } = params;
    logger.info(`[DiscordGuildLink] Executing resolveAndSyncDiscordGuildConnection for Guild ID: ${guildId} (Source: ${source})`);

    if (!guildId || typeof guildId !== 'string') {
      throw new BadRequestError('Valid Guild ID is required for community resolution');
    }

    // 1. Resolve guild metadata via priority order
    const resolvedGuild = await this.resolveDiscordGuildForCommunity(guildId, userId);
    if (!resolvedGuild) {
      throw new BadRequestError(`Guild ID ${guildId} could not be resolved or Bot is not installed in server`);
    }

    let targetCommunityId = params.communityId || `comm_${guildId}`;

    // 2. Collision Check: Enforce unique active guild-community binding
    const existingCommunities = await communitiesRepository.list();
    const existingConflict = existingCommunities.find(
      (c) =>
        (c.guildId === guildId || c.discordGuildId === guildId) &&
        c.id !== targetCommunityId
    );

    if (existingConflict) {
      const isExplicitDifferentCommunity = Boolean(params.communityId && params.communityId !== existingConflict.id);

      if (!isExplicitDifferentCommunity) {
        targetCommunityId = existingConflict.id;
      } else {
        logger.warn(`[DiscordGuildLink] Collision detected: Guild ${guildId} is already linked to community ${existingConflict.id}`);
        await auditService.record({
          communityId: existingConflict.id,
          actorUserId: params.userId || 'system',
          actorRole: 'OWNER',
          action: 'DISCORD_GUILD_LINK_REJECTED',
          targetType: 'discord_guild',
          targetId: guildId,
          metadata: {
            reason: 'DISCORD_GUILD_ALREADY_CONNECTED',
            existingCommunityId: existingConflict.id,
            requestedCommunityId: targetCommunityId,
          },
        });
        return {
          success: false,
          communityId: existingConflict.id,
          guildId,
          guildName: resolvedGuild.name,
          connectionStatus: 'DISCORD_GUILD_ALREADY_CONNECTED',
          syncStatus: 'SYNC_FAILED',
          botInstalled: resolvedGuild.botPresent,
          permissionsValid: false,
          missingPermissions: [],
          message: `DISCORD_GUILD_ALREADY_CONNECTED: Discord server '${resolvedGuild.name}' is already connected to another Community workspace (${existingConflict.name}).`,
        };
      }
    }

    // 3. Permission Validation in Guild
    const diagnostics = await discordPermissionEngineService.getGuildDiagnostics(guildId);
    const permissionsValid = diagnostics.botInstalled && diagnostics.missingPermissions.length === 0;

    let connectionStatus: GuildLinkResult['connectionStatus'] = 'BOT_NOT_INSTALLED';
    let syncStatus: GuildLinkResult['syncStatus'] = 'SYNC_PENDING';

    if (resolvedGuild.botPresent) {
      if (permissionsValid) {
        connectionStatus = 'CONNECTED';
        syncStatus = 'SYNCED';
      } else {
        connectionStatus = 'PERMISSION_REQUIRED';
        syncStatus = 'PERMISSION_REQUIRED';
      }
    }

    const nowStr = new Date().toISOString();

    // 4. Create or update Community record
    let community = await communitiesRepository.getById(targetCommunityId);
    if (!community) {
      community = await communitiesRepository.create({
        id: targetCommunityId,
        guildId,
        discordGuildId: guildId,
        name: resolvedGuild.name,
        iconUrl: resolvedGuild.icon,
        ownerUserId: resolvedGuild.ownerId || userId || (config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION' ? 'usr_dev_owner' : userId || ''),
        isActive: true,
        setupStatus: 'COMPLETED',
        connectionStatus: connectionStatus as any,
        connectedAt: nowStr,
        lastVerifiedAt: nowStr,
        createdAt: nowStr,
        updatedAt: nowStr,
      } as any);
    } else {
      community = await communitiesRepository.update(targetCommunityId, {
        guildId,
        discordGuildId: guildId,
        name: resolvedGuild.name || community.name,
        iconUrl: resolvedGuild.icon || community.iconUrl,
        ownerUserId: resolvedGuild.ownerId || userId || community.ownerUserId,
        connectionStatus: connectionStatus as any,
        setupStatus: 'COMPLETED',
        lastVerifiedAt: nowStr,
        updatedAt: nowStr,
      } as any);
    }

    // 5. Update Platform Server record
    const existingPlatformServers = await platformServersRepository.list({
      where: [{ field: 'guildId', operator: '==', value: guildId }],
      limit: 1,
    });
    if (existingPlatformServers.length > 0) {
      await platformServersRepository.update(existingPlatformServers[0].id, {
        name: resolvedGuild.name,
        ownerUserId: resolvedGuild.ownerId || userId || (config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION' ? 'usr_dev_owner' : ''),
        memberCount: resolvedGuild.memberCount || 1,
        lastActivityAt: nowStr,
        status: 'ACTIVE',
        botStatus: connectionStatus === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED',
      });
    } else {
      await platformServersRepository.create({
        id: targetCommunityId,
        guildId,
        name: resolvedGuild.name,
        ownerUserId: resolvedGuild.ownerId || userId || (config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION' ? 'usr_dev_owner' : ''),
        installedAt: nowStr,
        lastActivityAt: nowStr,
        memberCount: resolvedGuild.memberCount || 1,
        applicationCount: 0,
        recruiterCount: 0,
        status: 'ACTIVE',
        botStatus: connectionStatus === 'CONNECTED' ? 'CONNECTED' : 'DISCONNECTED',
        configurationStatus: 'CONFIGURED',
      });
    }

    // 6. Record Bot Installation State
    const installations = await botInstallationsRepository.list({
      where: [{ field: 'guildId', operator: '==', value: guildId }],
      limit: 1,
    });
    if (installations.length > 0) {
      await botInstallationsRepository.update(installations[0].id, {
        status: resolvedGuild.botPresent ? 'INSTALLED' : 'INVITED',
        permissionsBitfield: resolvedGuild.permissionsBitfield || AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD,
      });
    } else {
      await botInstallationsRepository.create({
        communityId: targetCommunityId,
        guildId,
        installedAt: nowStr,
        permissionsBitfield: resolvedGuild.permissionsBitfield || AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD,
        status: resolvedGuild.botPresent ? 'INSTALLED' : 'INVITED',
      });
    }

    // 7. Advance Onboarding State for Guild & Bot verification
    try {
      let progress = await onboardingProgressRepository.getById(targetCommunityId);
      if (!progress) {
        progress = await onboardingProgressRepository.create({
          id: targetCommunityId,
          communityId: targetCommunityId,
          guildId,
          status: 'IN_PROGRESS',
          currentStep: 'ROLE_MAP',
          completedSteps: ['WELCOME', 'GUILD_SELECT', 'BOT_VERIFY'],
          botInstalled: resolvedGuild.botPresent,
          guildSelected: true,
          rolesMapped: false,
          rulesPublished: false,
          recruitmentConfigured: false,
          updatedAt: nowStr,
        });
      } else {
        const completed = new Set(progress.completedSteps || []);
        completed.add('WELCOME');
        completed.add('GUILD_SELECT');
        completed.add('BOT_VERIFY');

        await onboardingProgressRepository.update(targetCommunityId, {
          guildId,
          botInstalled: resolvedGuild.botPresent,
          guildSelected: true,
          completedSteps: Array.from(completed),
          currentStep: progress.rolesMapped ? progress.currentStep : 'ROLE_MAP',
          updatedAt: nowStr,
        });
      }
    } catch (err) {
      logger.warn(`[DiscordGuildLink] Notice updating onboarding progress: ${(err as Error).message}`);
    }

    // 8. Auto-trigger Member / Role Sync in background if connected
    if (connectionStatus === 'CONNECTED') {
      try {
        discordMemberSyncService.syncGuildMembers(targetCommunityId, guildId).catch((err) => {
          logger.warn(`[DiscordGuildLink] Background member sync notice: ${(err as Error).message}`);
        });
        // Send installation notification if new connection / join
        if (source === 'BOT_JOIN' || source === 'ONBOARDING') {
          this.sendInstallationWelcomeMessage(guildId, targetCommunityId).catch((err) => {
            logger.warn(`[DiscordGuildLink] Welcome message notice: ${(err as Error).message}`);
          });
        }
        if (source === 'BOT_JOIN') {
          import('./serverWorkspace.service.js')
            .then(({ workspace }) => workspace.provision(targetCommunityId))
            .catch((err) => logger.warn(`[DiscordGuildLink] Workspace setup notice: ${err?.message}`));
        }
      } catch (err) {
        // Ignored
      }
    }

    // 9. Audit Event Logging
    await auditLogsRepository.create({
      id: `audit_guild_link_${Date.now()}`,
      communityId: targetCommunityId,
      actorUserId: userId || 'system_discord_guild_link',
      actorRole: 'OWNER' as any,
      action: 'COMMUNITY_SETTINGS_CHANGED',
      targetType: 'discord_guild_connection',
      targetId: guildId,
      metadata: {
        guildId,
        guildName: resolvedGuild.name,
        source,
        connectionStatus,
        syncStatus,
        events: [
          'DISCORD_APP_INSTALL_COMPLETED',
          'DISCORD_GUILD_DISCOVERED',
          'DISCORD_GUILD_VALIDATED',
          'DISCORD_GUILD_LINKED',
          'DISCORD_GUILD_SYNC_STARTED',
        ],
        action: 'DISCORD_GUILD_LINKED_AND_SYNCHRONIZED',
      },
      timestamp: nowStr,
    });

    return {
      success: true,
      communityId: targetCommunityId,
      guildId,
      guildName: resolvedGuild.name,
      connectionStatus,
      syncStatus,
      botInstalled: resolvedGuild.botPresent,
      permissionsValid,
      missingPermissions: diagnostics.missingPermissions,
      syncMetrics: {
        memberCount: resolvedGuild.memberCount || 1,
        channelCount: (diagnostics as any).channelCount || 0,
        roleCount: (diagnostics as any).roleCount || 0,
      },
      message: `Successfully linked Discord server '${resolvedGuild.name}' to Community Manager.`,
    };
  }

  /**
   * Sends first installation welcome notification to server system/text channel or owner
   */
  async sendInstallationWelcomeMessage(guildId: string, communityId: string) {
    if (!discordService.isConnected()) return;
    try {
      const client = (discordService as any)['client'];
      const guild = client ? await client.guilds.fetch(guildId).catch(() => null) : null;
      if (!guild) return;

      // Once per server, and only in Discord's own system channel (where "X added Community Manager" appears).
      const community: any = await communitiesRepository.getById(communityId).catch(() => null);
      if (community?.welcomePostedAt) return;
      const channel: any = guild.systemChannel;
      if (!channel || !channel.permissionsFor(guild.members.me)?.has('SendMessages')) return;
      await communitiesRepository.update(communityId, { welcomePostedAt: new Date().toISOString() } as any).catch(() => undefined);

      // Who invited the bot (needs View Audit Log; falls back to the owner).
      let inviterId: string = guild.ownerId;
      try {
        const { AuditLogEvent } = await import('discord.js');
        const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 });
        const entry = logs.entries.find((e: any) => e.target?.id === client.user.id);
        if (entry?.executor?.id) inviterId = entry.executor.id;
      } catch { /* no audit log access */ }

      const appUrl = (config.APP_URL || 'https://community-manager-bot-720940628402.asia-southeast1.run.app').replace(/\/$/, '');
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
      const row = new ActionRowBuilder<any>().addComponents(
        new ButtonBuilder().setLabel('Complete setup').setStyle(ButtonStyle.Link).setURL(`${appUrl}/servers?installed=${guildId}`),
        new ButtonBuilder().setLabel('About Community Manager').setStyle(ButtonStyle.Link).setURL(`${appUrl}/`),
      );
      await channel.send({
        content: `Thank you for the invite, <@${inviterId}>.`,
        allowedMentions: { users: [inviterId] },
        embeds: [{
          color: 0x7c8cff,
          title: 'Community Manager is now active',
          description: `From first application to long-term member, **${guild.name}** now runs on one system — recruitment, screening, interviews, moderation, tickets and engagement, around the clock.`,
          fields: [
            { name: '📋 Recruitment', value: 'Applications, screening, interviews', inline: true },
            { name: '🛡️ Safety', value: 'Warnings, auto-moderation, logs', inline: true },
            { name: '⚙️ Operations', value: 'Roles, tickets, automation', inline: true },
          ],
          footer: { text: 'Your workspace is being prepared. Complete setup in about two minutes.' },
        }],
        components: [row],
      });
      logger.info(`[DiscordGuildLink] Welcome posted in system channel of ${guildId}`);
    } catch (err) {
      logger.warn(`[DiscordGuildLink] Welcome message notice: ${(err as Error).message}`);
    }
  }

  /**
   * Automated Reconciliation Engine: Scans installed bot guilds across Gateway cache & stored records
   * to guarantee zero missed installations during network disconnects, container restarts or deployments.
   */
  async reconcileInstalledGuilds(): Promise<{
    evaluated: number;
    reconciled: number;
    failed: number;
    guilds: string[];
  }> {
    logger.info('[DiscordGuildLink] Executing automated guild reconciliation scan...');
    const knownGuildIds = new Set<string>();

    // 1. Gather guild IDs from Gateway cache
    if (discordService.isConnected()) {
      try {
        const client = (discordService as any)['client'];
        if (client?.guilds?.cache) {
          for (const [gId] of client.guilds.cache) {
            knownGuildIds.add(gId);
          }
        }
      } catch (err) {
        logger.warn(`[DiscordGuildLink] Gateway guild gather notice: ${(err as Error).message}`);
      }
    }

    // 2. Gather guild IDs from stored platform servers
    const storedServers = await platformServersRepository.list();
    for (const server of storedServers) {
      if (server.guildId) {
        knownGuildIds.add(server.guildId);
      }
    }

    // 3. Gather guild IDs from bot installations
    const installations = await botInstallationsRepository.list();
    for (const inst of installations) {
      if (inst.guildId) {
        knownGuildIds.add(inst.guildId);
      }
    }

    let reconciled = 0;
    let failed = 0;
    const processedGuilds: string[] = [];

    for (const guildId of knownGuildIds) {
      try {
        const res = await this.resolveAndSyncDiscordGuildConnection({
          guildId,
          source: 'GATEWAY_BOOT',
        });
        if (res.success) {
          reconciled++;
          processedGuilds.push(guildId);
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
        logger.warn(`[DiscordGuildLink] Reconciliation failed for guild ${guildId}: ${(err as Error).message}`);
      }
    }

    logger.info(`[DiscordGuildLink] Guild reconciliation finished. Evaluated: ${knownGuildIds.size}, Reconciled: ${reconciled}, Failed: ${failed}`);
    return {
      evaluated: knownGuildIds.size,
      reconciled,
      failed,
      guilds: processedGuilds,
    };
  }

  /**
   * Retrieves authoritative guild link details for a community.
   */
  async getGuildLink(communityId: string): Promise<{
    communityId: string;
    guildId: string;
    guildName: string;
    iconUrl?: string;
    approximateMemberCount?: number;
    cachedRoles?: Array<{ id: string; name: string; colorHex?: string; position: number; managed?: boolean }>;
    cachedChannels?: Array<{ id: string; name: string; type?: string; parentId?: string }>;
    updatedAt?: string;
  } | null> {
    const community = await communitiesRepository.getById(communityId);
    if (!community) return null;

    const guildId = community.guildId || community.discordGuildId || (community as any).discordId;
    if (!guildId) return null;

    const servers = await platformServersRepository.list({
      where: [{ field: 'guildId', operator: '==', value: guildId }],
      limit: 1,
    });
    const srv = servers[0];

    let roles = (srv as any)?.cachedRoles || [];
    let channels = (srv as any)?.cachedChannels || [];

    // Attempt live discovery if bot is connected and cache is empty
    if (roles.length === 0 && discordService.isConnected()) {
      const liveRoles = await discordResourceService.getRoles(guildId).catch(() => null);
      if (liveRoles?.success && liveRoles.items.length > 0) {
        roles = liveRoles.items;
      }
    }

    if (channels.length === 0 && discordService.isConnected()) {
      const liveChannels = await discordResourceService.getChannels(guildId).catch(() => null);
      if (liveChannels?.success && liveChannels.items.length > 0) {
        channels = liveChannels.items;
      }
    }

    return {
      communityId,
      guildId,
      guildName: srv?.name || community.name || `Discord Guild (${guildId})`,
      iconUrl: (srv as any)?.iconUrl || undefined,
      approximateMemberCount: srv?.memberCount || 0,
      cachedRoles: roles,
      cachedChannels: channels,
      updatedAt: community.updatedAt || new Date().toISOString(),
    };
  }

  /**
   * Updates cached roles for a guild.
   */
  async updateCachedRoles(guildId: string, roles: any[]): Promise<void> {
    const servers = await platformServersRepository.list({
      where: [{ field: 'guildId', operator: '==', value: guildId }],
      limit: 1,
    });
    if (servers[0]) {
      await platformServersRepository.update(servers[0].id, { cachedRoles: roles } as any);
    }
  }

  /**
   * Updates cached channels for a guild.
   */
  async updateCachedChannels(guildId: string, channels: any[]): Promise<void> {
    const servers = await platformServersRepository.list({
      where: [{ field: 'guildId', operator: '==', value: guildId }],
      limit: 1,
    });
    if (servers[0]) {
      await platformServersRepository.update(servers[0].id, { cachedChannels: channels } as any);
    }
  }

  /**
   * Explicitly links a guild to a community for testing / setup.
   */
  async linkGuild(communityId: string, guildId: string, guildName: string, userId: string): Promise<GuildLinkResult> {
    await communitiesRepository.update(communityId, { guildId, discordGuildId: guildId } as any);
    return this.resolveAndSyncDiscordGuildConnection({
      communityId,
      guildId,
      userId,
      source: 'MANUAL_REFRESH',
    });
  }
}

export const discordGuildLinkService = new DiscordGuildLinkService();
