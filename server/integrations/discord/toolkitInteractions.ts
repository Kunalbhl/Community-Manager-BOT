/**
 * Buttons, menus and forms for tickets and review rooms. Custom ids start with "cm:".
 * Modals must be shown immediately (before any database work) to beat Discord's 3-second limit.
 */
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { ticketService } from '../../services/toolkit/tickets.service.js';
import { reviewRooms, reviewRoomsRepository } from '../../services/toolkit/reviewRooms.service.js';
import { communityForGuild, getToolkit } from '../../services/toolkit/toolkitConfig.js';
import { warnAutocomplete } from './commands/toolkit.command.js';
import { verification, buttonRoles, giveaways } from '../../services/features/community.service.js';

export async function handleToolkitInteraction(interaction: any): Promise<boolean> {
  if (interaction.isAutocomplete?.()) {
    if (interaction.commandName === 'warn') {
      await warnAutocomplete(interaction, await communityForGuild(interaction.guildId));
      return true;
    }
    return false;
  }

  const id: string = interaction.customId || '';
  if (!id.startsWith('cm:')) return false;
  const [, area, action, arg] = id.split(':');

  // ---------- tickets ----------
  if (area === 'ticket' && action === 'pick' && interaction.isStringSelectMenu()) {
    const typeKey = interaction.values[0];
    const label = interaction.component?.options?.find((o: any) => o.value === typeKey)?.label || 'Open a ticket';
    await interaction.showModal(ticketService.modal(typeKey, label));
    return true;
  }
  if (area === 'ticket' && action === 'form' && interaction.isModalSubmit()) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const communityId = await communityForGuild(interaction.guildId);
      const t = await ticketService.open({
        communityId, guild: interaction.guild, member: interaction.member, typeKey: arg,
        subject: interaction.fields.getTextInputValue('subject'), details: interaction.fields.getTextInputValue('details'),
      });
      await interaction.editReply({ content: `✅ Your ticket is open: <#${t.channelId}>` });
    } catch (err: any) {
      await interaction.editReply({ content: `⚠️ ${err?.message || 'Could not open the ticket.'}` });
    }
    return true;
  }
  if (area === 'ticket' && action === 'claim') {
    try {
      const t = await ticketService.claim(arg, interaction.member);
      await interaction.reply({ content: `✋ <@${interaction.user.id}> claimed this ticket and will help you.`, allowedMentions: { parse: [] } });
      void t;
    } catch (err: any) {
      await interaction.reply({ content: `⚠️ ${err?.message}`, ephemeral: true });
    }
    return true;
  }
  if (area === 'ticket' && action === 'close') {
    await interaction.showModal(new ModalBuilder().setCustomId(`cm:ticket:closeform:${arg}`).setTitle('Close ticket').addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Short).setValue('Solved').setMaxLength(200).setRequired(true)),
    ));
    return true;
  }
  if (area === 'ticket' && action === 'closeform' && interaction.isModalSubmit()) {
    await interaction.reply({ content: '🔒 Closing this ticket. The channel will be deleted in a few seconds.' });
    await ticketService.close(arg, { id: interaction.user.id, username: interaction.user.username }, interaction.fields.getTextInputValue('reason'), interaction.guild);
    return true;
  }

  // ---------- verification ----------
  if (area === 'verify' && action === 'start') {
    const communityId = await communityForGuild(interaction.guildId);
    const r = await verification.start(communityId, interaction.member);
    if (r.modal) await interaction.showModal(r.modal);
    else await interaction.reply({ content: r.text, ephemeral: true });
    return true;
  }
  if (area === 'verify' && action === 'answer' && interaction.isModalSubmit()) {
    const communityId = await communityForGuild(interaction.guildId);
    await interaction.reply({ content: await verification.answer(communityId, interaction.member, interaction.fields.getTextInputValue('answer')), ephemeral: true });
    return true;
  }

  // ---------- button roles: cm:br:<panelId>:<roleId> ----------
  if (area === 'br') {
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({ content: await buttonRoles.press(action, arg, interaction.member), allowedMentions: { parse: [] } });
    return true;
  }

  // ---------- giveaways ----------
  if (area === 'gw' && action === 'enter') {
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({ content: await giveaways.enter(arg, interaction.member), allowedMentions: { parse: [] } });
    const g = await (await import('../../services/features/community.service.js')).giveawaysRepository.getById(arg).catch(() => null);
    if (g) await interaction.message?.edit(giveaways.view(g)).catch(() => undefined);
    return true;
  }

  // ---------- review rooms ----------
  if (area === 'room' && action === 'reject') {
    await interaction.showModal(new ModalBuilder().setCustomId(`cm:room:rejectform:${arg}`).setTitle('Reject application').addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Reason (sent to the applicant)').setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(true)),
    ));
    return true;
  }
  if (area === 'room' && (action === 'voice' || action === 'escalate')) {
    try {
      const msg = action === 'voice' ? await reviewRooms.toggleVoice(arg, interaction.member) : await reviewRooms.escalate(arg, interaction.member);
      await interaction.reply({ content: msg, ephemeral: action === 'escalate' });
    } catch (err: any) {
      await interaction.reply({ content: `⚠️ ${err?.message}`, ephemeral: true });
    }
    return true;
  }
  if (area === 'room' && (action === 'approve' || action === 'rejectform')) {
    const room = await reviewRoomsRepository.getById(arg);
    if (!room || room.status !== 'OPEN') { await interaction.reply({ content: '⚠️ This application was already decided.', ephemeral: true }); return true; }
    const tier = await reviewRooms.memberTier(room.communityId, interaction.member);
    if (tier < room.tier) {
      const cfg = (await getToolkit(room.communityId)).reviewRooms;
      await interaction.reply({ content: `⛔ This application is with **${cfg.tiers[room.tier]?.name}**. Only that rank or higher can decide.`, ephemeral: true });
      return true;
    }
    const { applicationWorkflowService } = await import('../../services/applicationWorkflow.service.js');
    const approve = action === 'approve';
    const reason = approve ? undefined : interaction.fields.getTextInputValue('reason');
    try {
      await applicationWorkflowService.reviewApplication({
        applicationId: room.applicationId,
        communityId: room.communityId,
        status: approve ? 'APPROVED' : 'REJECTED',
        reviewerNotes: approve ? `Approved in review room by ${interaction.user.username}` : reason,
        rejectionReason: reason,
        actorUserId: `usr_${interaction.user.id}`,
        actorRole: interaction.member?.permissions?.has?.('ManageGuild') ? 'CONTROLLER' : 'RECRUITER',
        actorDiscordUserId: interaction.user.id,
      } as any);
      await interaction.reply({ content: approve ? '✅ Approved. Roles and welcome are handled automatically.' : '❌ Rejected. The applicant has been told.', ephemeral: true });
    } catch (err: any) {
      await interaction.reply({ content: `⚠️ ${err?.message}`, ephemeral: true });
    }
    return true;
  }
  return false;
}
