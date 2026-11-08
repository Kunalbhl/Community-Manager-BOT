import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';
import { applicationsRepository } from '../../../repositories/index.js';
import { auditService } from '../../../services/audit.service.js';

export const approveCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('approve')
    .setDescription('Approve an application (Requires Controller or Administrator authority)')
    .addStringOption((opt) =>
      opt.setName('application_id').setDescription('ID of application to approve').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('notes').setDescription('Optional reviewer notes').setRequired(false)
    ),
  category: 'INTERVIEWS_REVIEW',
  minimumRole: 'INTERVIEWER',
  requiredPermission: 'applications.approve',
  status: 'ACTIVE',

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const { communityId, guildId, discordUserId, effectiveRole } = context;

    if (!['PLATFORM_OWNER', 'OWNER', 'CONTROLLER'].includes(effectiveRole)) {
      await interaction.reply({
        content: `⛔ **PERMISSION_REQUIRED**: Only Controllers and Administrators have authority to approve applications.`,
        ephemeral: true,
      });
      return;
    }

    const applicationId = interaction.options.getString('application_id', true);
    const notes = interaction.options.getString('notes') || 'Approved via Discord bot';

    const app = await applicationsRepository.getById(applicationId);
    if (!app || app.communityId !== communityId) {
      await interaction.reply({
        content: `❌ Application \`${applicationId}\` not found in this community.`,
        ephemeral: true,
      });
      return;
    }

    const { applicationWorkflowService } = await import('../../../services/applicationWorkflow.service.js');
    await applicationWorkflowService.reviewApplication({
      applicationId, communityId, status: 'APPROVED', reviewerNotes: notes,
      actorUserId: `usr_${discordUserId}`, actorRole: effectiveRole, actorDiscordUserId: discordUserId,
    } as any);

    await interaction.reply({
      content: `✅ **Application Approved**\n\n• **ID:** \`${applicationId}\`\n• **Applicant:** <@${app.applicantDiscordId}>\n• **Decided by:** <@${discordUserId}> (${effectiveRole})\n• **Notes:** ${notes}`,
      ephemeral: false,
    });
  },
};

export const rejectCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('reject')
    .setDescription('Reject an application (Requires Controller or Administrator authority)')
    .addStringOption((opt) =>
      opt.setName('application_id').setDescription('ID of application to reject').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for rejection').setRequired(true)
    ),
  category: 'INTERVIEWS_REVIEW',
  minimumRole: 'INTERVIEWER',
  requiredPermission: 'applications.reject',
  status: 'ACTIVE',

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const { communityId, guildId, discordUserId, effectiveRole } = context;

    if (!['PLATFORM_OWNER', 'OWNER', 'CONTROLLER'].includes(effectiveRole)) {
      await interaction.reply({
        content: `⛔ **PERMISSION_REQUIRED**: Only Controllers and Administrators have authority to reject applications.`,
        ephemeral: true,
      });
      return;
    }

    const applicationId = interaction.options.getString('application_id', true);
    const reason = interaction.options.getString('reason', true);

    const app = await applicationsRepository.getById(applicationId);
    if (!app || app.communityId !== communityId) {
      await interaction.reply({
        content: `❌ Application \`${applicationId}\` not found in this community.`,
        ephemeral: true,
      });
      return;
    }

    const { applicationWorkflowService } = await import('../../../services/applicationWorkflow.service.js');
    await applicationWorkflowService.reviewApplication({
      applicationId, communityId, status: 'REJECTED', reviewerNotes: reason, rejectionReason: reason,
      actorUserId: `usr_${discordUserId}`, actorRole: effectiveRole, actorDiscordUserId: discordUserId,
    } as any);

    await interaction.reply({
      content: `🚫 **Application Rejected**\n\n• **ID:** \`${applicationId}\`\n• **Applicant:** <@${app.applicantDiscordId}>\n• **Decided by:** <@${discordUserId}> (${effectiveRole})\n• **Reason:** ${reason}`,
      ephemeral: true,
    });
  },
};

export const escalateCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('escalate')
    .setDescription('Escalate an application or interview to higher authority (Requires Interviewer or higher)')
    .addStringOption((opt) =>
      opt.setName('application_id').setDescription('ID of application to escalate').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Reason for escalation').setRequired(true)
    ),
  category: 'INTERVIEWS_REVIEW',
  minimumRole: 'INTERVIEWER',
  requiredPermission: 'applications.review',
  status: 'ACTIVE',

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const { communityId, guildId, discordUserId, effectiveRole } = context;

    if (!['PLATFORM_OWNER', 'OWNER', 'CONTROLLER', 'INTERVIEWER'].includes(effectiveRole)) {
      await interaction.reply({
        content: `⛔ **PERMISSION_REQUIRED**: Only Interviewers, Controllers, and Administrators can escalate cases.`,
        ephemeral: true,
      });
      return;
    }

    const applicationId = interaction.options.getString('application_id', true);
    const reason = interaction.options.getString('reason', true);

    const app = await applicationsRepository.getById(applicationId);
    if (!app || app.communityId !== communityId) {
      await interaction.reply({
        content: `❌ Application \`${applicationId}\` not found in this community.`,
        ephemeral: true,
      });
      return;
    }

    const now = new Date().toISOString();
    await applicationsRepository.update(applicationId, {
      status: 'ESCALATED',
      reviewerNotes: `[ESCALATED by ${effectiveRole}]: ${reason}`,
      updatedAt: now,
    });

    await auditService.record({
      communityId,
      guildId,
      actorUserId: `usr_${discordUserId}`,
      discordUserId,
      actorRole: effectiveRole,
      effectiveRole,
      action: 'APPLICATION_ESCALATED',
      targetType: 'application',
      targetId: applicationId,
      metadata: { reason, escalatedBy: discordUserId },
      source: 'DISCORD_BOT_COMMAND',
    });

    await interaction.reply({
      content: `⚡ **Application Escalated**\n\n• **ID:** \`${applicationId}\`\n• **Applicant:** <@${app.applicantDiscordId}>\n• **Escalated by:** <@${discordUserId}> (${effectiveRole})\n• **Reason:** ${reason}\n\n*Senior Controllers and Owners have been notified for review.*`,
      ephemeral: false,
    });
  },
};
