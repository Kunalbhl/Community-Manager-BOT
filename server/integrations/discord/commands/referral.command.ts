import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';
import { referralLifecycleRepository, recruitersRepository } from '../../../repositories/index.js';

export const referralCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('referral')
    .setDescription('View your referrals and tracking status'),
  category: 'RECRUITMENT_REFERRALS',
  minimumRole: 'RECRUITER',
  requiredPermission: 'recruiters.view',
  status: 'ACTIVE',

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const { communityId, discordUserId } = context;

    // Fetch recruiter record
    const recruiters = await recruitersRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'discordId', operator: '==', value: discordUserId },
      ],
      limit: 1,
    });

    if (recruiters.length === 0) {
      await interaction.reply({
        content: `You do not have a recruiter account registered. Generate a code first with \`/recruiter-code\`.`,
        ephemeral: true,
      });
      return;
    }

    const records = await referralLifecycleRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'recruiterDiscordId', operator: '==', value: discordUserId },
      ],
    });

    if (records.length === 0) {
      await interaction.reply({
        content: `📈 **Referral Tracking**\nNo applicants have applied with your recruiter codes yet. Share your code to start tracking!`,
        ephemeral: true,
      });
      return;
    }

    const successful = records.filter((r) => r.lifecycleStatus === 'RECRUITMENT_SUCCESSFUL').length;
    const inReview = records.filter((r) => ['APPLICATION_SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(r.lifecycleStatus)).length;

    const listSummary = records
      .slice(0, 5)
      .map((r) => `• **${r.applicantUsernameSnapshot}** — \`${r.lifecycleStatus}\` (${r.recruiterCode})`)
      .join('\n');

    await interaction.reply({
      content: `📈 **Your Referral Lifecycle Stats**\n\n` +
        `• **Confirmed Recruits:** ${successful}\n` +
        `• **In Progress / Review:** ${inReview}\n` +
        `• **Total Tracked:** ${records.length}\n\n` +
        `**Recent Referrals:**\n${listSummary}` +
        (records.length > 5 ? `\n*+ ${records.length - 5} more records in dashboard*` : ''),
      ephemeral: true,
    });
  },
};
