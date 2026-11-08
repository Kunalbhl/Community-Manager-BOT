import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, AutocompleteInteraction } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';
import { ticketService } from '../../../services/toolkit/tickets.service.js';
import { warningPolicy } from '../../../services/toolkit/warningPolicy.service.js';
import { getToolkit } from '../../../services/toolkit/toolkitConfig.js';

/** /ticket panel | /ticket open */
export const ticketCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Support tickets')
    .addSubcommand((s) => s.setName('open').setDescription('Open a private ticket with the staff team'))
    .addSubcommand((s) => s.setName('panel').setDescription('Post the ticket panel in this channel (staff)')),
  category: 'COMMUNITY_MEMBER',
  minimumRole: 'APPLICANT',
  status: 'ACTIVE',

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const sub = interaction.options.getSubcommand();
    if (sub === 'panel') {
      const perms: any = interaction.memberPermissions;
      if (!perms?.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: '⛔ Only staff with **Manage Server** can post the ticket panel.', ephemeral: true });
        return;
      }
      await ticketService.postPanel(context.communityId, interaction.channel);
      await interaction.reply({ content: '✅ Ticket panel posted. Members can now open tickets from it.', ephemeral: true });
      return;
    }
    const cfg = await getToolkit(context.communityId);
    await interaction.reply({ content: 'What do you need help with?', components: ticketService.panelComponents(cfg.tickets.types), ephemeral: true });
  },
};

/** /warn member reason [note] */
export const warnCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member. Warning points can trigger an automatic timeout, kick or ban.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('member').setDescription('Member to warn').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason (sets the points)').setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName('note').setDescription('Extra detail shown to the member').setRequired(false).setMaxLength(300)),
  category: 'SECURITY_MODERATION',
  minimumRole: 'MEMBER',
  status: 'ACTIVE',

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
      await interaction.reply({ content: '⛔ You need the **Timeout Members** permission to warn.', ephemeral: true });
      return;
    }
    const user = interaction.options.getUser('member', true);
    if (user.bot || user.id === interaction.user.id) {
      await interaction.reply({ content: '⚠️ You cannot warn that member.', ephemeral: true });
      return;
    }
    const r = await warningPolicy.warn({
      communityId: context.communityId,
      discordUserId: user.id,
      reasonKey: interaction.options.getString('reason', true),
      note: interaction.options.getString('note') || undefined,
      moderatorId: interaction.user.id,
    });
    await interaction.reply({
      content: `⚠️ Warned <@${user.id}> for **${r.reason.label}** (+${r.reason.points}). Active points: **${r.pointsAfter}**.${r.actionResult ? `\n${r.actionResult}` : ''}`,
      allowedMentions: { parse: [] },
    });
  },
};

/** /warnings member */
export const warningsCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Show a member’s active warnings and points')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('member').setDescription('Member').setRequired(true)),
  category: 'SECURITY_MODERATION',
  minimumRole: 'MEMBER',
  status: 'ACTIVE',

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const user = interaction.options.getUser('member', true);
    const { points, strikes } = await warningPolicy.activePoints(context.communityId, user.id);
    const lines = strikes.slice(0, 10).map((s) => `• **${s.reasonLabel}** (+${s.points}) <t:${Math.floor(Date.parse(s.createdAt) / 1000)}:R> by <@${s.moderatorId}>`);
    await interaction.reply({
      content: `**${user.username}** has **${points}** active warning point(s).\n${lines.join('\n') || 'No active warnings.'}`,
      allowedMentions: { parse: [] },
      ephemeral: true,
    });
  },
};

/** Autocomplete for /warn reason. */
export async function warnAutocomplete(interaction: AutocompleteInteraction, communityId: string) {
  const cfg = await getToolkit(communityId);
  const q = String(interaction.options.getFocused() || '').toLowerCase();
  await interaction.respond(
    cfg.warnings.reasons.filter((r) => r.label.toLowerCase().includes(q)).slice(0, 25).map((r) => ({ name: `${r.label} (+${r.points})`, value: r.key })),
  );
}
