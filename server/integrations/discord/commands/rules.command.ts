import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';
import { communityConfigurationRepository, communityGuidelinesRepository } from '../../../repositories/index.js';
import { welcomeOnboardingService } from '../../../services/welcomeOnboarding.service.js';

export const rulesCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('rules')
    .setDescription('View recruitment guidelines, standards, and community rules'),
  category: 'COMMUNITY_MEMBER',
  minimumRole: 'APPLICANT',
  status: 'ACTIVE',

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const { communityId, discordUserId } = context;

    const rulesInfo = await welcomeOnboardingService.getCommunityRules(communityId, discordUserId);
    const guidelines = await communityGuidelinesRepository.list({
      where: [{ field: 'communityId', operator: '==', value: communityId }],
    });

    let extraGuidelines = '';
    if (guidelines.length > 0) {
      extraGuidelines = '\n\n**Recruitment Standards:**\n' + guidelines.map((g) => `• **${g.title}**: ${g.description}`).join('\n');
    }

    const ackStatus = rulesInfo.rulesAcknowledgementEnabled
      ? (rulesInfo.acknowledged ? `\n\n✅ *You have acknowledged the community rules (${rulesInfo.rulesVersion}).*` : `\n\n⚠️ *Rules acknowledgement required (${rulesInfo.rulesVersion}).*`)
      : '';

    await interaction.reply({
      content: `📜 **Community Rules & Guidelines (${rulesInfo.rulesVersion})**\n\n${rulesInfo.rulesText}${extraGuidelines}${ackStatus}`,
      ephemeral: true,
    });
  },
};
