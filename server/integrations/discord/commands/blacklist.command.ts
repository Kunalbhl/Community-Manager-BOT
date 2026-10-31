import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';
import { applicantRestrictionService } from '../../../services/applicantRestriction.service.js';
import { auditService } from '../../../services/audit.service.js';

export const blacklistCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Check or flag a restricted applicant (Requires Controller or Administrator authority)')
    .addSubcommand((sub) =>
      sub
        .setName('check')
        .setDescription('Check restriction status for a Discord User ID or username')
        .addStringOption((opt) =>
          opt.setName('target').setDescription('Discord User ID or username to check').setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('flag')
        .setDescription('Flag an applicant restriction (Requires Controller or Administrator authority)')
        .addStringOption((opt) =>
          opt.setName('user_id').setDescription('Permanent Discord User ID').setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName('username').setDescription('Current Discord Username').setRequired(true)
        )
        .addStringOption((opt) =>
          opt
            .setName('status')
            .setDescription('Restriction level')
            .setRequired(true)
            .addChoices(
              { name: 'Blacklisted (Permanent Ban)', value: 'BLACKLISTED' },
              { name: 'Caution (Flag for review)', value: 'CAUTION' },
              { name: 'Do Not Reapply', value: 'DO_NOT_REAPPLY' }
            )
        )
        .addStringOption((opt) =>
          opt.setName('reason').setDescription('Reason for restriction').setRequired(true)
        )
    ),
  category: 'SECURITY_MODERATION',
  minimumRole: 'CONTROLLER',
  requiredPermission: 'community.manage',
  status: 'ACTIVE',

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const { communityId, guildId, discordUserId, effectiveRole } = context;
    const subcommand = interaction.options.getSubcommand();

    const isAuthorized = ['PLATFORM_OWNER', 'OWNER', 'CONTROLLER'].includes(effectiveRole);

    if (!isAuthorized && !interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
      await interaction.reply({
        content: `⛔ **PERMISSION_REQUIRED**: Only Controllers and Administrators have authority to access or modify the restriction database.`,
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'check') {
      const target = interaction.options.getString('target', true);
      const isId = /^\d{17,20}$/.test(target);
      const discordId = isId ? target : 'unknown';
      const username = isId ? undefined : target;

      const risk = await applicantRestrictionService.checkApplicantRisk(communityId, discordId, username);

      if (risk.riskStatus === 'CLEAR') {
        await interaction.reply({
          content: `✅ **Restriction Check:** \`CLEAR\`\nNo active restrictions found for \`${target}\`.`,
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content:
          `⚠️ **Restriction Alert:** \`${risk.riskStatus}\`\n` +
          `• **Match Type:** \`${risk.matchType}\`\n` +
          `• **Reason:** ${risk.restriction?.reason || 'Flagged by moderation team'}\n` +
          `• **Permanent Discord ID Matched:** \`${risk.restriction?.discordUserId || 'N/A'}\`\n` +
          `• **Discord Enforcement:** \`${risk.restriction?.discordEnforcementStatus || 'MANUAL_ACTION_REQUIRED'}\``,
        ephemeral: true,
      });
      return;
    }

    if (subcommand === 'flag') {
      const targetUserId = interaction.options.getString('user_id', true);
      const targetUsername = interaction.options.getString('username', true);
      const status = interaction.options.getString('status', true) as 'BLACKLISTED' | 'CAUTION' | 'DO_NOT_REAPPLY';
      const reason = interaction.options.getString('reason', true);

      const record = await applicantRestrictionService.flagUser(
        {
          communityId,
          discordUserId: targetUserId,
          currentUsernameSnapshot: targetUsername,
          gameNameAliases: [],
          status,
          reason,
        },
        `usr_${discordUserId}`,
        effectiveRole
      );

      await auditService.record({
        communityId,
        guildId,
        actorUserId: `usr_${discordUserId}`,
        discordUserId,
        actorRole: effectiveRole,
        effectiveRole,
        action: 'BLACKLIST_CREATED',
        targetType: 'applicant_restriction',
        targetId: record.id,
        metadata: {
          targetDiscordUserId: targetUserId,
          targetUsername,
          status,
          reason,
        },
        source: 'DISCORD_BOT_COMMAND',
      });

      await interaction.reply({
        content:
          `🛡️ **Applicant Restriction Registered**\n` +
          `• **Target Discord ID:** \`${record.discordUserId}\`\n` +
          `• **Username Snapshot:** \`${record.currentUsernameSnapshot}\`\n` +
          `• **Status:** \`${record.status}\`\n` +
          `• **Enforcement Status:** \`${record.discordEnforcementStatus}\`\n` +
          `• **Reason:** ${record.reason}`,
        ephemeral: true,
      });
    }
  },
};
