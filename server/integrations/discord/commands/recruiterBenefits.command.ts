import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';
import { recruitersRepository } from '../../../repositories/index.js';
import { recruiterBenefitsService } from '../../../services/recruiterBenefits.service.js';

export const recruiterBenefitsCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('recruiter-benefits')
    .setDescription('View unlocked recruiter reward tiers and next milestones'),
  category: 'RECRUITMENT_REFERRALS',
  minimumRole: 'RECRUITER',
  requiredPermission: 'rewards.view',
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

    const recruitsCount = recruiters.length > 0 ? recruiters[0].successfulRecruits || 0 : 0;
    const evalResult = await recruiterBenefitsService.evaluateRecruiterBenefits(communityId, recruitsCount);

    if (evalResult.benefits.length === 0) {
      await interaction.reply({
        content: `🎁 **Recruiter Benefits**\nNo milestone benefit tiers have been configured for this community yet. Check back soon!`,
        ephemeral: true,
      });
      return;
    }

    const tierList = evalResult.benefits
      .map((b) => {
        const statusIcon = b.eligible ? '✅' : '🔒';
        return `${statusIcon} **${b.benefitName}** (Req: ${b.threshold} recruits) — *${b.rewardType}*\n   ${b.fulfillmentNote}`;
      })
      .join('\n\n');

    await interaction.reply({
      content: `🎁 **Community Recruiter Rewards & Benefits**\n\n` +
        `• **Your Confirmed Recruits:** **${recruitsCount}**\n` +
        (evalResult.nextThreshold ? `• **Next Unlock Milestone:** **${evalResult.nextThreshold} recruits**\n\n` : '\n') +
        `**Reward Tiers:**\n${tierList}`,
      ephemeral: true,
    });
  },
};
