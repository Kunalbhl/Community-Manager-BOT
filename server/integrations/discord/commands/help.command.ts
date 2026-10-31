import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';
import { config } from '../../../config/env.js';
import { getRoleAwareCommands } from './index.js';

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

export const helpCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Discover Community Manager commands grouped by purpose'),
  category: 'PORTAL_SETUP',
  minimumRole: 'APPLICANT',
  status: 'ACTIVE',

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const { communityId, effectiveRole, permissions } = context;
    const appUrl = config.APP_URL;

    const availableCommands = getRoleAwareCommands(effectiveRole, permissions || []);

    let helpMessage = `📖 **Community Manager — Command Directory (${effectiveRole})**\n\n`;

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
  },
};
