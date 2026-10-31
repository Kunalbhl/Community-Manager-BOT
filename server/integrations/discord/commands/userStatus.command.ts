import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';

export const userStatusCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('user-status')
    .setDescription('Check your authoritative Discord identity, resolved Community role, and permissions'),
  category: 'COMMUNITY_MEMBER',
  minimumRole: 'APPLICANT',
  status: 'ACTIVE',

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const { communityId, guildId, discordUserId, discordUsername, effectiveRole, permissions } = context;

    const keyPerms = permissions.slice(0, 8).join(', ') + (permissions.length > 8 ? ` (+${permissions.length - 8} more)` : '');

    await interaction.reply({
      content:
        `🛡️ **Authoritative Discord Identity & Role Status**\n\n` +
        `• **Discord User ID:** \`${discordUserId}\`\n` +
        `• **Username:** \`${discordUsername}\`\n` +
        `• **Guild ID:** \`${guildId}\`\n` +
        `• **Community ID:** \`${communityId}\`\n` +
        `• **Effective Role:** **\`${effectiveRole}\`**\n` +
        `• **Granted Permissions:** \`${keyPerms || 'Standard Applicant'}\`\n\n` +
        `*Your role is deterministically resolved server-side from your Discord credentials and server role mappings.*`,
      ephemeral: true,
    });
  },
};
