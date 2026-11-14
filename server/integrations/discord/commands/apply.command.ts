import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';
import { getToolkit } from '../../../services/toolkit/toolkitConfig.js';
import { discordRecruitment } from '../../../services/recruitment/discordRecruitment.service.js';

/** /apply — shows the Apply button privately (the form opens from the button). */
export const applyCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder().setName('apply').setDescription('Apply to join this community’s team'),
  category: 'RECRUITMENT_REFERRALS',
  minimumRole: 'APPLICANT',
  status: 'ACTIVE',
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    const cfg = (await getToolkit(context.communityId)).recruitment;
    if (!cfg.applyEnabled) {
      await interaction.reply({ content: 'Applications are closed in this server right now.', ephemeral: true });
      return;
    }
    await interaction.reply({ ...discordRecruitment.panel(cfg, interaction.guild?.name), ephemeral: true });
  },
};
