import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';
import { config } from '../../../config/env.js';
import { communitiesRepository } from '../../../repositories/index.js';
import { getLastSyncDiagnostics } from '../registration.service.js';
import { getRoleAwareCommands, discordCommands } from './index.js';

export const communityManagerPortalCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('community-manager')
    .setDescription('Community Manager bot portal, status, and command help')
    .addSubcommand((sub) =>
      sub
        .setName('portal')
        .setDescription('Open the Community Manager Web Portal directly for your community')
    )
    .addSubcommand((sub) =>
      sub
        .setName('help')
        .setDescription('Show available Community Manager commands and guidance')
    )
    .addSubcommand((sub) =>
      sub
        .setName('status')
        .setDescription('Show Community Manager system, bot, and community status')
    ),
  category: 'PORTAL_SETUP',
  minimumRole: 'APPLICANT',
  status: 'ACTIVE',

  async execute(interaction, ctx: CommandContext) {
    const subcommand = interaction.options.getSubcommand(false);

    if (subcommand === 'help') {
      const { communityId, effectiveRole, permissions } = ctx;
      const appUrl = config.APP_URL || 'http://localhost:3000';
      const availableCommands = getRoleAwareCommands(effectiveRole, permissions || []);

      let helpMessage = `📖 **Community Manager — Command Directory (${effectiveRole})**\n\n`;

      const CATEGORY_TITLES: Record<string, string> = {
        PORTAL_SETUP: '🌐 Portal & Setup',
        COMMUNITY_MEMBER: '👥 Community & Member',
        RECRUITMENT_REFERRALS: '📋 Recruitment & Referrals',
        INTERVIEWS_REVIEW: '🎙️ Interviews & Review (Staff)',
        SECURITY_MODERATION: '🛡️ Security & Moderation (Controller/Owner)',
      };

      const CATEGORY_ORDER = [
        'PORTAL_SETUP',
        'COMMUNITY_MEMBER',
        'RECRUITMENT_REFERRALS',
        'INTERVIEWS_REVIEW',
        'SECURITY_MODERATION',
      ];

      for (const categoryKey of CATEGORY_ORDER) {
        const catCmds = availableCommands.filter((c) => c.category === categoryKey);
        if (catCmds.length > 0) {
          helpMessage += `${CATEGORY_TITLES[categoryKey] || categoryKey}\n`;
          for (const cmd of catCmds) {
            helpMessage += `• \`${cmd.command}\` — ${cmd.description}\n`;
          }
          helpMessage += `\n`;
        }
      }

      helpMessage += `🔗 Portal: ${appUrl}/community/${communityId}`;

      await interaction.reply({
        content: helpMessage.trim(),
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'status') {
      const guildId = interaction.guildId;
      const targetCommunityId = ctx.communityId;

      let communityName = 'Community Workspace';
      let connectionStatus = 'DISCONNECTED';

      if (guildId) {
        const comms = await communitiesRepository.list({
          where: [{ field: 'guildId', operator: '==', value: guildId }],
          limit: 1,
        });
        if (comms.length > 0) {
          communityName = comms[0].name || communityName;
          connectionStatus = comms[0].connectionStatus || 'CONNECTED';
        }
      }

      const syncDiag = getLastSyncDiagnostics();
      const statusMsg =
        `📊 **Community Manager — System & Bot Status**\n\n` +
        `• **Application ID**: \`${config.DISCORD_APPLICATION_ID || '1547515985416822884'}\`\n` +
        `• **Community Workspace**: **${communityName}** (\`${targetCommunityId}\`)\n` +
        `• **Server (Guild) ID**: \`${guildId || 'N/A'}\`\n` +
        `• **Your Effective Role**: \`${ctx.effectiveRole}\`\n` +
        `• **Bot Connection**: \`${connectionStatus}\`\n` +
        `• **Registered Commands**: \`${discordCommands.length}\` canonical slash commands\n` +
        `• **Command Sync Status**: \`${syncDiag.lastSyncResult}\` (${syncDiag.lastSyncTimestamp ? new Date(syncDiag.lastSyncTimestamp).toISOString() : 'N/A'})`;

      await interaction.reply({
        content: statusMsg,
        ephemeral: true,
      });
      return;
    }

    // Default / portal subcommand
    const appUrl = config.APP_URL || 'http://localhost:3000';
    const guildId = interaction.guildId;

    let targetCommunityId = ctx.communityId;
    let isConnected = false;

    if (guildId) {
      const comms = await communitiesRepository.list({
        where: [{ field: 'guildId', operator: '==', value: guildId }],
        limit: 1,
      });

      if (comms.length > 0 && comms[0].connectionStatus === 'CONNECTED') {
        targetCommunityId = comms[0].id;
        isConnected = true;
      }
    }

    if (isConnected && targetCommunityId) {
      const portalUrl = `${appUrl}/community/${targetCommunityId}`;
      const linkButton = new ButtonBuilder()
        .setLabel('Open Community Manager')
        .setStyle(ButtonStyle.Link)
        .setURL(portalUrl);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(linkButton);

      await interaction.reply({
        content: `**Community Manager**\n\nOpen your community management dashboard to configure recruitment, moderation, automation and member management.`,
        components: [row],
        ephemeral: true,
      });
    } else if (guildId) {
      const setupUrl = `${appUrl}/onboarding?guild_id=${guildId}`;
      const setupButton = new ButtonBuilder()
        .setLabel('Set Up This Server')
        .setStyle(ButtonStyle.Link)
        .setURL(setupUrl);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(setupButton);

      await interaction.reply({
        content: `**Community Manager**\n\nSet up this server to configure recruitment, rules, candidate workflows, and interview scheduling.`,
        components: [row],
        ephemeral: true,
      });
    } else {
      const loginUrl = `${appUrl}/login`;
      const loginButton = new ButtonBuilder()
        .setLabel('Open Community Manager')
        .setStyle(ButtonStyle.Link)
        .setURL(loginUrl);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(loginButton);

      await interaction.reply({
        content: `**Community Manager**\n\nLog in with Discord to access your authorized community management workspaces.`,
        components: [row],
        ephemeral: true,
      });
    }
  },
};
