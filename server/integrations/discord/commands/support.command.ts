import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';
import { channelAccessService } from '../../../services/channelAccess.service.js';

export const supportCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('support')
    .setDescription('Get help and contact community moderators or administrators'),
  category: 'PORTAL_SETUP',
  minimumRole: 'APPLICANT',
  status: 'ACTIVE',

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const { communityId } = context;

    const channels = await channelAccessService.listChannels(communityId);
    const supportChannels = channels.filter((c) => c.purpose === 'SUPPORT' && c.enabled);

    let channelText = 'Contact an administrator directly or post in the public support channel.';
    if (supportChannels.length > 0) {
      channelText = `Please visit the authorized support channel: <#${supportChannels[0].channelId}>`;
    }

    await interaction.reply({
      content: `💡 **Community Support & Assistance**\n\n${channelText}\n\n` +
        `• For recruitment questions, ask a verified Recruiter.\n` +
        `• For application issues, use \`/application\`.\n` +
        `• For appeals, contact server controllers.`,
      ephemeral: true,
    });
  },
};
