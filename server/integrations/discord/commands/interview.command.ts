import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';
import { interviewsRepository, interviewSessionsRepository } from '../../../repositories/index.js';

export const interviewCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('interview')
    .setDescription('Check interview details or join a live evaluation session')
    .addStringOption((opt) =>
      opt.setName('interview_id').setDescription('Specific Interview ID (optional for staff)').setRequired(false)
    ),
  category: 'INTERVIEWS_REVIEW',
  minimumRole: 'INTERVIEWER',
  requiredPermission: 'interviews.view',
  status: 'ACTIVE',

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const { communityId, discordUserId, effectiveRole } = context;
    const isStaff = ['PLATFORM_OWNER', 'OWNER', 'CONTROLLER', 'INTERVIEWER'].includes(effectiveRole);
    const specificId = interaction.options.getString('interview_id');

    let targetInterview: any = null;

    if (specificId) {
      targetInterview = await interviewsRepository.getById(specificId);
      if (targetInterview && targetInterview.communityId !== communityId) {
        targetInterview = null;
      }
    } else if (isStaff) {
      // Find latest in-progress or scheduled interview in community
      const active = await interviewsRepository.list({
        where: [
          { field: 'communityId', operator: '==', value: communityId },
          { field: 'status', operator: '==', value: 'IN_PROGRESS' },
        ],
        limit: 1,
      });

      if (active.length > 0) {
        targetInterview = active[0];
      } else {
        const scheduled = await interviewsRepository.list({
          where: [
            { field: 'communityId', operator: '==', value: communityId },
            { field: 'status', operator: '==', value: 'SCHEDULED' },
          ],
          limit: 1,
        });
        if (scheduled.length > 0) {
          targetInterview = scheduled[0];
        }
      }
    } else {
      // Applicant check
      const interviews = await interviewsRepository.list({
        where: [
          { field: 'communityId', operator: '==', value: communityId },
          { field: 'applicantDiscordId', operator: '==', value: discordUserId },
        ],
      });
      if (interviews.length > 0) {
        targetInterview = interviews[interviews.length - 1];
      }
    }

    if (!targetInterview) {
      await interaction.reply({
        content: isStaff
          ? `ℹ️ No active or scheduled interviews found in this community. Specify an \`interview_id\` if looking for a specific record.`
          : `ℹ️ You do not have an active or scheduled interview. Check \`/application\` for your general status.`,
        ephemeral: true,
      });
      return;
    }

    // Get active session and participant list
    const session = await interviewSessionsRepository.getById(targetInterview.id);
    const activeParticipants = (session?.participants || targetInterview.participants || []).filter(
      (p: any) => p.isActive
    );

    const participantListStr =
      activeParticipants.length > 0
        ? activeParticipants.map((p: any) => `• ${p.displayName || p.username} — \`${p.role}\``).join('\n')
        : '• *No active staff in room yet*';

    let content =
      `🎙️ **Interview Session Details**\n\n` +
      `• **Interview ID:** \`${targetInterview.id}\`\n` +
      `• **Status:** \`${targetInterview.status}\`\n` +
      `• **Candidate:** <@${targetInterview.applicantDiscordId || targetInterview.applicantDiscordUserId}>\n` +
      `• **Scheduled Time:** ${targetInterview.scheduledTime || 'Immediate'}\n\n` +
      `👥 **Live Authorities in Room:**\n${participantListStr}\n`;

    if (isStaff) {
      const joinBtn = new ButtonBuilder()
        .setCustomId(`join_interview:${targetInterview.id}`)
        .setLabel('Join Live Interview')
        .setStyle(ButtonStyle.Primary);

      const leaveBtn = new ButtonBuilder()
        .setCustomId(`leave_interview:${targetInterview.id}`)
        .setLabel('Leave Interview')
        .setStyle(ButtonStyle.Secondary);

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(joinBtn, leaveBtn);

      await interaction.reply({
        content,
        components: [row],
        ephemeral: false,
      });
    } else {
      await interaction.reply({
        content,
        ephemeral: true,
      });
    }
  },
};
