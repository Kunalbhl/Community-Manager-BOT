import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';
import { recruitersRepository, recruiterCodesRepository } from '../../../repositories/index.js';

export const recruiterCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('recruiter')
    .setDescription('View your recruiter profile, recruits count, and stats'),
  category: 'RECRUITMENT_REFERRALS',
  minimumRole: 'RECRUITER',
  requiredPermission: 'recruiters.view',
  status: 'ACTIVE',

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const { communityId, discordUserId } = context;

    const recruiters = await recruitersRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'discordId', operator: '==', value: discordUserId },
      ],
      limit: 1,
    });

    if (recruiters.length === 0) {
      await interaction.reply({
        content: `You do not have an active recruiter profile yet. Use \`/recruiter-code\` to generate your code and get started!`,
        ephemeral: true,
      });
      return;
    }

    const rec = recruiters[0];
    const codes = await recruiterCodesRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'recruiterUserId', operator: '==', value: rec.id },
      ],
    });

    const activeCodes = codes.filter((c) => c.isActive).map((c) => `\`${c.code}\``).join(', ') || 'None';

    await interaction.reply({
      content: `📊 **Recruiter Profile — ${rec.username}**\n\n` +
        `• **Discord ID:** \`${rec.discordId}\`\n` +
        `• **Confirmed Successful Recruits:** **${rec.successfulRecruits || 0}**\n` +
        `• **Total Referrals Tracked:** ${rec.totalReferrals || 0}\n` +
        `• **Active Codes:** ${activeCodes}\n` +
        `• **Status:** ${rec.isActive ? '🟢 Active' : '🔴 Inactive'}\n\n` +
        `*Use \`/myrewards\` to see your rewards and progress.*`,
      ephemeral: true,
    });
  },
};
