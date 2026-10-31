import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';
import { recruiterCodesRepository, recruitersRepository } from '../../../repositories/index.js';
import { generateRecruiterCode } from '../../../utils/codeGenerator.js';
import { auditService } from '../../../services/audit.service.js';

export const createRecruiterCodeCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('create-recruiter-code')
    .setDescription('Generate or view your official community recruiter code')
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('Action to perform')
        .setRequired(false)
        .addChoices(
          { name: 'View My Code', value: 'view' },
          { name: 'Generate New Code', value: 'generate' }
        )
    ),
  category: 'RECRUITMENT_REFERRALS',
  minimumRole: 'RECRUITER',
  requiredPermission: 'recruiterCodes.create',
  status: 'ACTIVE',

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    return handleRecruiterCodeCommand(interaction, context);
  },
};

export const recruiterCodeCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('recruiter-code')
    .setDescription('Generate or view your official community recruiter code')
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('Action to perform')
        .setRequired(false)
        .addChoices(
          { name: 'View My Code', value: 'view' },
          { name: 'Generate New Code', value: 'generate' }
        )
    ),
  category: 'RECRUITMENT_REFERRALS',
  minimumRole: 'RECRUITER',
  requiredPermission: 'recruiterCodes.create',
  status: 'ALIAS',

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    return handleRecruiterCodeCommand(interaction, context);
  },
};

async function handleRecruiterCodeCommand(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
  const action = interaction.options.getString('action') || 'view';
  const { communityId, guildId, discordUserId, discordUsername, effectiveRole } = context;

    // Check minimum recruiter permission
    const isAllowed = ['PLATFORM_OWNER', 'OWNER', 'CONTROLLER', 'INTERVIEWER', 'RECRUITER'].includes(effectiveRole);
    if (!isAllowed) {
      await interaction.reply({
        content: `⛔ **PERMISSION_REQUIRED**: You must have a Recruiter or staff role in this community to manage recruiter codes.`,
        ephemeral: true,
      });
      return;
    }

    // 1. Fetch or create recruiter record bound to permanent Discord ID
    let recruiterList = await recruitersRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'discordId', operator: '==', value: discordUserId },
      ],
      limit: 1,
    });

    let recruiter = recruiterList[0];
    if (!recruiter) {
      recruiter = await recruitersRepository.create({
        communityId,
        workspaceId: 'ws_default',
        discordUserId,
        displayNameSnapshot: discordUsername,
        role: 'RECRUITER',
        status: 'ACTIVE',
        joinedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: `usr_${discordUserId}`,
        discordId: discordUserId,
        username: discordUsername,
        totalReferrals: 0,
        successfulRecruits: 0,
        isActive: true,
      });
    }

    // 2. Fetch existing codes
    const existingCodes = await recruiterCodesRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'recruiterUserId', operator: '==', value: recruiter.id },
        { field: 'isActive', operator: '==', value: true },
      ],
    });

    if (action === 'view') {
      if (existingCodes.length > 0) {
        const codesList = existingCodes.map((c) => `• **${c.code}** (Uses: ${c.totalUses})`).join('\n');
        await interaction.reply({
          content: `🎯 **Your Active Recruiter Code(s):**\n${codesList}\n\n*Bound to your Discord ID: \`${discordUserId}\`*`,
          ephemeral: true,
        });
        return;
      }
    }

    // Generate new code
    const allCommunityCodes = await recruiterCodesRepository.list({
      where: [{ field: 'communityId', operator: '==', value: communityId }],
    });
    const existingCodeStrings = allCommunityCodes.map((c) => c.code);

    const newCodeString = generateRecruiterCode(discordUsername, existingCodeStrings);
    const newCode = await recruiterCodesRepository.create({
      communityId,
      recruiterUserId: recruiter.id,
      code: newCodeString,
      totalUses: 0,
      isActive: true,
      createdAt: new Date().toISOString(),
    });

    await auditService.record({
      communityId,
      guildId,
      actorUserId: recruiter.id,
      discordUserId,
      actorRole: effectiveRole,
      effectiveRole,
      action: 'RECRUITER_CODE_CREATED',
      targetType: 'recruiter_code',
      targetId: newCode.id,
      metadata: { code: newCodeString, discordUserId },
    });

    await interaction.reply({
      content: `🎉 **Recruiter Code Created:** \`${newCodeString}\`\nShare this code with applicants to track your recruits!\n*Identity locked to Discord ID: \`${discordUserId}\`*`,
      ephemeral: true,
    });
}
