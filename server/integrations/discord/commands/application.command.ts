import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';
import { applicationsRepository } from '../../../repositories/index.js';
import { communityConfigurationService } from '../../../services/communityConfiguration.service.js';

export const applicationsCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('applications')
    .setDescription('Review incoming applications (Staff) or check your application status (Applicant)')
    .addStringOption((option) =>
      option
        .setName('status_filter')
        .setDescription('Filter applications by status (Staff only)')
        .setRequired(false)
        .addChoices(
          { name: 'Pending Review', value: 'PENDING_REVIEW' },
          { name: 'Interview Scheduled', value: 'INTERVIEW_SCHEDULED' },
          { name: 'Approved', value: 'APPROVED' },
          { name: 'Escalated', value: 'ESCALATED' }
        )
    ),
  category: 'RECRUITMENT_REFERRALS',
  minimumRole: 'RECRUITER',
  requiredPermission: 'applications.view',
  status: 'ACTIVE',

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    return handleApplicationCommand(interaction, context);
  },
};

export const applicationCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('application')
    .setDescription('Review incoming applications (Staff) or check your application status (Applicant)')
    .addStringOption((option) =>
      option
        .setName('status_filter')
        .setDescription('Filter applications by status (Staff only)')
        .setRequired(false)
        .addChoices(
          { name: 'Pending Review', value: 'PENDING_REVIEW' },
          { name: 'Interview Scheduled', value: 'INTERVIEW_SCHEDULED' },
          { name: 'Approved', value: 'APPROVED' },
          { name: 'Escalated', value: 'ESCALATED' }
        )
    ),
  category: 'RECRUITMENT_REFERRALS',
  minimumRole: 'RECRUITER',
  requiredPermission: 'applications.view',
  status: 'ALIAS',

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    return handleApplicationCommand(interaction, context);
  },
};

async function handleApplicationCommand(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
  const { communityId, discordUserId, effectiveRole } = context;
  const isStaff = ['PLATFORM_OWNER', 'OWNER', 'CONTROLLER', 'INTERVIEWER', 'RECRUITER'].includes(effectiveRole);
  const statusFilter = interaction.options.getString('status_filter');

  if (isStaff) {
    const whereFilters: any[] = [{ field: 'communityId', operator: '==', value: communityId }];
    if (statusFilter) {
      whereFilters.push({ field: 'status', operator: '==', value: statusFilter });
    }

    const apps = await applicationsRepository.list({
      where: whereFilters,
      limit: 10,
    });

    if (apps.length === 0) {
      await interaction.reply({
        content: `📂 **Community Applications**: No applications found matching criteria.`,
        ephemeral: true,
      });
      return;
    }

    const listStr = apps
      .map(
        (a) =>
          `• **\`${a.id}\`** — <@${a.applicantDiscordId}> | Status: \`${a.status}\` | Submitted: ${new Date(a.submittedAt).toLocaleDateString()}`
      )
      .join('\n');

    await interaction.reply({
      content: `📋 **Applications Queue** (${apps.length} records)\n\n${listStr}\n\n*Use \`/interview\` to evaluate candidates or \`/approve\` / \`/reject\` to process decisions.*`,
      ephemeral: true,
    });
    return;
  }

  // Applicant check
  const apps = await applicationsRepository.list({
    where: [
      { field: 'communityId', operator: '==', value: communityId },
      { field: 'applicantDiscordId', operator: '==', value: discordUserId },
    ],
  });

  if (apps.length === 0) {
    const persona = await communityConfigurationService.getCommunityRecruiterIdentity(communityId);
    await interaction.reply({
      content: `ℹ️ No active application found for your Discord account.\n\n${persona.recruiterWelcomeGreeting}\n\n*Apply via the community recruitment channel or web portal.*`,
      ephemeral: true,
    });
    return;
  }

  const latestApp = apps.sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  )[0];

  await interaction.reply({
    content:
      `📄 **Your Application Status**\n\n` +
      `• **Application ID:** \`${latestApp.id}\`\n` +
      `• **Status:** \`${latestApp.status}\`\n` +
      `• **Submitted:** ${new Date(latestApp.submittedAt).toLocaleDateString()}\n` +
      (latestApp.recruiterCodeUsed ? `• **Recruiter Code:** \`${latestApp.recruiterCodeUsed}\`\n` : '') +
      `\n*You will receive automatic notifications via Discord DM when updates occur.*`,
    ephemeral: true,
  });
}
