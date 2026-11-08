import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';
import { getToolkit } from '../../../services/toolkit/toolkitConfig.js';

/** /sheet — private link to the recruitment Google Sheet, only for the roles the owner picked. */
export const sheetCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder().setName('sheet').setDescription('Open the recruitment Google Sheet (staff roles only)'),
  category: 'RECRUITMENT_REFERRALS',
  minimumRole: 'APPLICANT',
  status: 'ACTIVE',
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    const cfg = (await getToolkit(context.communityId)).recruitment;
    const roles: string[] = cfg.sheetRoleIds || [];
    const member: any = interaction.member;
    const isOwner = interaction.guild?.ownerId === interaction.user.id;
    const has = isOwner || roles.some((r) => member?.roles?.cache?.has?.(r) || member?.roles?.includes?.(r));
    if (!cfg.sheetViewUrl) {
      await interaction.reply({ content: 'No recruitment sheet has been linked yet.', ephemeral: true });
    } else if (!has) {
      await interaction.reply({ content: 'Only staff roles chosen by the server owner can open the recruitment sheet.', ephemeral: true });
    } else {
      await interaction.reply({ content: `📊 Recruitment sheet: ${cfg.sheetViewUrl}\nOnly people the owner shared the sheet with in Google can open it.`, ephemeral: true });
    }
  },
};
