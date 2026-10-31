import { Client, Guild, GuildMember, Message, Interaction, Events } from 'discord.js';
import { logger } from '../../../logging/logger.js';
import {
  communitiesRepository,
  platformServersRepository,
  botInstallationsRepository,
  auditLogsRepository,
} from '../../../repositories/index.js';
import { referralLifecycleService } from '../../../services/referralLifecycle.service.js';
import { applicationWorkflowService } from '../../../services/applicationWorkflow.service.js';
import { applicantRestrictionService } from '../../../services/applicantRestriction.service.js';
import { channelAccessService } from '../../../services/channelAccess.service.js';
import { discordGuildLinkService } from '../../../services/discordGuildLink.service.js';
import { handleCommandInteraction } from '../commands/index.js';
import { registerSlashCommands } from '../registration.service.js';

/**
 * Registers all real Discord Gateway event listeners onto the Discord.js client.
 */
export function attachGatewayEventHandlers(client: Client): void {
  // 1. READY Event (Startup synchronization)
  client.on(Events.ClientReady, async (readyClient) => {
    logger.info(`[DiscordGateway] Bot connected and ready as ${readyClient.user.tag}`);
    logger.info(`[DiscordGateway] Active in ${readyClient.guilds.cache.size} guild(s)`);

    // Synchronize guild records via authoritative discordGuildLinkService
    for (const guild of readyClient.guilds.cache.values()) {
      try {
        await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
          guildId: guild.id,
          source: 'GATEWAY_BOOT',
        });
      } catch (err) {
        logger.warn(`[DiscordGateway] Startup guild sync notice for ${guild.id}: ${(err as Error).message}`);
      }
    }

    // Auto-register slash commands
    try {
      await registerSlashCommands();
    } catch (err) {
      logger.warn(`[DiscordGateway] Slash command registration notice: ${(err as Error).message}`);
    }
  });

  // 2. GUILD_CREATE Event (Bot joined server or cached on boot)
  client.on(Events.GuildCreate, async (guild: Guild) => {
    logger.info(`[DiscordGateway] Joined guild: ${guild.name} (${guild.id}) - Owner: ${guild.ownerId}, Members: ${guild.memberCount}`);
    try {
      await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
        guildId: guild.id,
        source: 'BOT_JOIN',
      });
    } catch (err) {
      logger.error(`[DiscordGateway] Error syncing guild ${guild.id} on guildCreate:`, undefined, { error: (err as Error).message });
    }
  });

  // 3. GUILD_DELETE Event (Bot left or was removed from server)
  client.on(Events.GuildDelete, async (guild: Guild) => {
    logger.info(`[DiscordGateway] Left guild: ${guild.name} (${guild.id})`);
    await handleGuildRemoval(guild);
  });

  // 4. GUILD_MEMBER_ADD Event (New member joined)
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    logger.info(`[DiscordGateway] Member joined guild ${member.guild.name}: ${member.user.tag} (${member.id})`);

    const communities = await communitiesRepository.list({
      where: [{ field: 'guildId', operator: '==', value: member.guild.id }],
      limit: 1,
    });

    if (communities.length === 0) return;
    const communityId = communities[0].id;

    // A. Check for referral lifecycle transition (APPROVED -> JOINED -> RECRUITMENT_SUCCESSFUL)
    try {
      const referralResult = await referralLifecycleService.confirmMemberJoin(communityId, member.id);
      if (referralResult) {
        logger.info(`[DiscordGateway] Referral confirmed successful for joining member ${member.user.tag} (Recruiter: ${referralResult.recruiterDiscordId})`);
      }
      await applicationWorkflowService.confirmDiscordJoin(communityId, member.id);
    } catch (err) {
      logger.error(`[DiscordGateway] Error confirming member join referral:`, undefined, { error: (err as Error).message });
    }

    // B. Check applicant restrictions (Blacklist check on join)
    try {
      const risk = await applicantRestrictionService.checkApplicantRisk(
        communityId,
        member.id,
        member.user.username
      );

      if (risk.riskStatus === 'BLACKLISTED') {
        logger.warn(`[DiscordGateway] [ALERT] Blacklisted user joined ${member.guild.name}: ${member.user.tag} (${member.id})`);
      } else if (risk.riskStatus === 'CAUTION') {
        logger.warn(`[DiscordGateway] [CAUTION] User with previous restriction alias joined ${member.guild.name}: ${member.user.tag}`);
      }
    } catch (err) {
      logger.error(`[DiscordGateway] Error checking join restriction:`, undefined, { error: (err as Error).message });
    }

    // Publish MEMBER_JOINED event to Event Bus
    try {
      const { AutomationEventBusService } = await import('../../../services/automation.service.js');
      await AutomationEventBusService.publish({
        eventType: 'MEMBER_JOINED',
        communityId,
        actorDiscordUserId: member.id,
        targetDiscordUserId: member.id,
        metadata: {
          username: member.user.username,
          displayName: member.displayName,
          roles: [...member.roles.cache.keys()],
        },
      });
    } catch (err: any) {
      logger.error(`[DiscordGateway] Error publishing MEMBER_JOINED: ${err.message}`);
    }
  });

  // 5. GUILD_MEMBER_REMOVE Event (Member left or was kicked/banned)
  client.on(Events.GuildMemberRemove, async (member) => {
    logger.info(`[DiscordGateway] Member left guild ${member.guild.name}: ${member.user?.tag || member.id}`);

    const communities = await communitiesRepository.list({
      where: [{ field: 'guildId', operator: '==', value: member.guild.id }],
      limit: 1,
    });
    if (communities.length === 0) return;
    const communityId = communities[0].id;

    try {
      const { AutomationEventBusService } = await import('../../../services/automation.service.js');
      await AutomationEventBusService.publish({
        eventType: 'MEMBER_LEFT',
        communityId,
        actorDiscordUserId: member.id,
        targetDiscordUserId: member.id,
        metadata: {
          username: member.user?.username || '',
          displayName: member.displayName,
        },
      });
    } catch (err: any) {
      logger.error(`[DiscordGateway] Error publishing MEMBER_LEFT: ${err.message}`);
    }
  });

  // 5b. GUILD_MEMBER_UPDATE Event (Role changes, etc.)
  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    const rolesChanged = !oldMember.roles.cache.equals(newMember.roles.cache);
    if (!rolesChanged) return;

    logger.info(`[DiscordGateway] Member roles updated: ${newMember.user.tag}`);
    const communities = await communitiesRepository.list({
      where: [{ field: 'guildId', operator: '==', value: newMember.guild.id }],
      limit: 1,
    });
    if (communities.length === 0) return;
    const communityId = communities[0].id;

    try {
      const { AutomationEventBusService } = await import('../../../services/automation.service.js');
      await AutomationEventBusService.publish({
        eventType: 'MEMBER_ROLE_CHANGED',
        communityId,
        actorDiscordUserId: newMember.id,
        targetDiscordUserId: newMember.id,
        metadata: {
          username: newMember.user.username,
          displayName: newMember.displayName,
          oldRoles: [...oldMember.roles.cache.keys()],
          roles: [...newMember.roles.cache.keys()],
        },
      });
    } catch (err: any) {
      logger.error(`[DiscordGateway] Error publishing MEMBER_ROLE_CHANGED: ${err.message}`);
    }
  });

  // 6. INTERACTION_CREATE Event (Slash Commands & Components)
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (interaction.isChatInputCommand()) {
      await handleCommandInteraction(interaction);
    } else if (interaction.isButton()) {
      const customId = interaction.customId;
      if (customId.startsWith('join_interview:')) {
        const interviewId = customId.split(':')[1];
        try {
          const { interviewService } = await import('../../../services/interview.service.js');
          const communities = await communitiesRepository.list({
            where: [{ field: 'guildId', operator: '==', value: interaction.guildId || '' }],
            limit: 1,
          });
          const communityId = communities[0]?.id || (interaction.guildId ? `comm_${interaction.guildId}` : '');

          const memberRoles: string[] = [];
          if (interaction.member && 'roles' in interaction.member) {
            const rolesProp = interaction.member.roles;
            if (Array.isArray(rolesProp)) memberRoles.push(...rolesProp);
            else if (rolesProp && 'cache' in rolesProp) memberRoles.push(...Array.from((rolesProp as any).cache.keys()).map((k: any) => String(k)));
          }

          const result = await interviewService.joinInterview({
            interviewId,
            communityId,
            discordUserId: interaction.user.id,
            username: interaction.user.username,
            displayName: (interaction.member as any)?.displayName || interaction.user.username,
            explicitRoleIds: memberRoles,
            requestId: `btn_${Date.now()}`,
          });

          await interaction.reply({
            content: `✅ **Joined Interview Session**\n\n${result.announcementMessage}`,
            ephemeral: false,
          });
        } catch (err) {
          await interaction.reply({
            content: `⚠️ ${(err as Error).message}`,
            ephemeral: true,
          });
        }
      } else if (customId.startsWith('leave_interview:')) {
        const interviewId = customId.split(':')[1];
        try {
          const { interviewService } = await import('../../../services/interview.service.js');
          const communities = await communitiesRepository.list({
            where: [{ field: 'guildId', operator: '==', value: interaction.guildId || '' }],
            limit: 1,
          });
          const communityId = communities[0]?.id || (interaction.guildId ? `comm_${interaction.guildId}` : '');

          const result = await interviewService.leaveInterview({
            interviewId,
            communityId,
            discordUserId: interaction.user.id,
            requestId: `btn_${Date.now()}`,
          });

          await interaction.reply({
            content: `👋 **Left Interview Session**\n\n${result.announcementMessage}`,
            ephemeral: false,
          });
        } catch (err) {
          await interaction.reply({
            content: `⚠️ ${(err as Error).message}`,
            ephemeral: true,
          });
        }
      }
    }
  });

  // 7. MESSAGE_CREATE Event (Channel message processing with allowlist)
  client.on(Events.MessageCreate, async (message: Message) => {
    // Ignore bot messages
    if (message.author.bot || !message.guild) return;

    const guildId = message.guild.id;
    const communities = await communitiesRepository.list({
      where: [{ field: 'guildId', operator: '==', value: guildId }],
      limit: 1,
    });

    if (communities.length === 0) return;
    const communityId = communities[0].id;

    // Strict channel allowlist verification
    const allowCheck = await channelAccessService.isChannelAllowedForProcessing(communityId, message.channel.id);
    if (!allowCheck.allowed) {
      // Message is in a non-allowlisted channel -> ignore
      return;
    }

    // Process message according to channel purpose
    await channelAccessService.processIncomingDiscordMessage({
      communityId,
      channelId: message.channel.id,
      authorDiscordId: message.author.id,
      content: message.content,
      messageId: message.id,
    });
  });
}

/**
 * Persists or updates real Discord guild registration.
 */
async function recordGuildRegistration(guild: Guild, status: 'INSTALLED' | 'INVITED' | 'REMOVED'): Promise<void> {
  const existingComms = await communitiesRepository.list({
    where: [{ field: 'guildId', operator: '==', value: guild.id }],
    limit: 1,
  });

  let commId: string;
  if (existingComms.length > 0) {
    commId = existingComms[0].id;
    await communitiesRepository.update(commId, {
      name: guild.name,
      iconUrl: guild.iconURL() || undefined,
      ownerUserId: guild.ownerId,
      isActive: true,
      updatedAt: new Date().toISOString(),
    });
  } else {
    const newComm = await communitiesRepository.create({
      guildId: guild.id,
      name: guild.name,
      iconUrl: guild.iconURL() || undefined,
      ownerUserId: guild.ownerId,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    commId = newComm.id;
  }

  // Update Platform Server record
  const existingPlatformServers = await platformServersRepository.list({
    where: [{ field: 'guildId', operator: '==', value: guild.id }],
    limit: 1,
  });

  const now = new Date().toISOString();
  if (existingPlatformServers.length > 0) {
    await platformServersRepository.update(existingPlatformServers[0].id, {
      name: guild.name,
      ownerUserId: guild.ownerId,
      memberCount: guild.memberCount,
      lastActivityAt: now,
      status: 'ACTIVE',
      botStatus: 'CONNECTED',
    });
  } else {
    await platformServersRepository.create({
      id: commId,
      guildId: guild.id,
      name: guild.name,
      ownerUserId: guild.ownerId,
      installedAt: now,
      lastActivityAt: now,
      memberCount: guild.memberCount,
      applicationCount: 0,
      recruiterCount: 0,
      status: 'ACTIVE',
      botStatus: 'CONNECTED',
      configurationStatus: 'CONFIGURED',
    });
  }

  // Record Bot Installation
  const installations = await botInstallationsRepository.list({
    where: [{ field: 'guildId', operator: '==', value: guild.id }],
    limit: 1,
  });

  if (installations.length > 0) {
    await botInstallationsRepository.update(installations[0].id, {
      status,
      permissionsBitfield: guild.members.me?.permissions.bitfield.toString(),
    });
  } else {
    await botInstallationsRepository.create({
      communityId: commId,
      guildId: guild.id,
      installedAt: now,
      permissionsBitfield: guild.members.me?.permissions.bitfield.toString(),
      status,
    });
  }
}

/**
 * Handles guild removal / bot kick from server.
 */
async function handleGuildRemoval(guild: Guild): Promise<void> {
  const guildId = guild?.id || '';
  if (!guildId) {
    logger.warn('[DiscordGateway] handleGuildRemoval invoked with undefined guild or guildId');
    return;
  }
  const existingComms = await communitiesRepository.list({
    where: [{ field: 'guildId', operator: '==', value: guildId }],
    limit: 1,
  });

  const nowStr = new Date().toISOString();

  if (existingComms.length > 0) {
    const communityId = existingComms[0].id;
    await communitiesRepository.update(communityId, {
      connectionStatus: 'DISCONNECTED',
      updatedAt: nowStr,
    });

    await auditLogsRepository.create({
      id: `audit_guild_del_${Date.now()}`,
      communityId,
      actorUserId: 'system_discord_gateway',
      actorRole: 'SYSTEM' as any,
      action: 'DISCORD_SYNC',
      targetType: 'discord_connection',
      targetId: guildId,
      metadata: { 
        guildId: guildId || guild?.id || '', 
        event: 'GUILD_DELETE', 
        status: 'DISCONNECTED',
        action: 'DISCORD_BOT_REMOVED'
      },
      timestamp: nowStr,
    });
  }

  const existingPlatformServers = await platformServersRepository.list({
    where: [{ field: 'guildId', operator: '==', value: guildId }],
    limit: 1,
  });

  if (existingPlatformServers.length > 0) {
    await platformServersRepository.update(existingPlatformServers[0].id, {
      status: 'INACTIVE',
      botStatus: 'DISCONNECTED',
      lastActivityAt: nowStr,
    });
  }
}
