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
import { discordRecruitment } from '../../services/recruitment/discordRecruitment.service.js';

export async function handleToolkitInteraction(interaction: any): Promise<boolean> {
  if (interaction.isAutocomplete?.()) {
    if (interaction.commandName === 'reward') {
      const { wallet } = await import('../../services/rewards/wallet.service.js');
      const q = String(interaction.options.getFocused() || '').toLowerCase();
      const items = await wallet.items(await communityForGuild(interaction.guildId), true);
      await interaction.respond(items.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 25).map((i) => ({ name: `${i.emoji} ${i.name}`.slice(0, 100), value: i.id }))).catch(() => undefined);
      return true;
    }
    if (interaction.commandName === 'warn') {
      await warnAutocomplete(interaction, await communityForGuild(interaction.guildId));
      return true;
    }
    return false;
  }

  const id: string = interaction.customId || '';
  if (!id.startsWith('cm:')) return false;
  const [, area, action, arg] = id.split(':');

  // ---------- reward wallet: Use buttons, balance, staff approval ----------
  if (area === 'rw') {
    const { wallet } = await import('../../services/rewards/wallet.service.js');
    const communityId = await communityForGuild(interaction.guildId);
    const rest = id.split(':').slice(3).join(':');
    const [itemId, evRaw] = rest.split('|');
    const forEvent = evRaw ? decodeURIComponent(evRaw) : '';
    try {
      if (action === 'bal') {
        const lines = await wallet.describeBalances(communityId, interaction.user.id);
        await interaction.reply({ content: lines.length ? `**Your rewards**\n${lines.join('\n')}` : 'No rewards yet.', ephemeral: true });
      } else if (action === 'use1') {
        const r = await wallet.claim(communityId, { itemId, memberId: interaction.user.id, memberName: interaction.member?.displayName || interaction.user.username, amount: 1, forEvent, by: interaction.user.username, byStaff: false });
        await interaction.reply({ content: r.pending ? `⏳ Sent to staff for approval. **${r.left}** left after this.` : `✅ Used 1× ${r.item.emoji} ${r.item.name}. **${r.left}** left.`, ephemeral: true });
      } else if (action === 'usen') {
        await interaction.showModal(new ModalBuilder().setCustomId(`cm:rw:usem:${rest}`.slice(0, 100)).setTitle('Use rewards').addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('n').setLabel('How many?').setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(3).setRequired(true).setValue('2'))));
      } else if (action === 'usem' && interaction.isModalSubmit()) {
        const n = Number(interaction.fields.getTextInputValue('n'));
        const r = await wallet.claim(communityId, { itemId, memberId: interaction.user.id, memberName: interaction.member?.displayName || interaction.user.username, amount: n, forEvent, by: interaction.user.username, byStaff: false });
        await interaction.reply({ content: r.pending ? `⏳ Sent ${n} to staff for approval. **${r.left}** left after this.` : `✅ Used ${n}× ${r.item.emoji} ${r.item.name}. **${r.left}** left.`, ephemeral: true });
      } else if (action === 'ok' || action === 'no') {
        const p = interaction.memberPermissions;
        if (!(p?.has('ManageGuild') || p?.has('ManageRoles') || p?.has('ModerateMembers'))) { await interaction.reply({ content: '⛔ Only staff can approve.', ephemeral: true }); return true; }
        const r = await wallet.decide(communityId, rest, action === 'ok', interaction.user.username);
        await interaction.update({ content: `${action === 'ok' ? '✅ Approved' : '❌ Declined'} by ${interaction.user.username}. <@${r.tx.memberId}> has **${r.available}** left.`, components: [], allowedMentions: { parse: [] } });
      } else return false;
    } catch (e: any) {
      const m = { content: `⚠️ ${e.message}`, ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(m).catch(() => undefined); else await interaction.reply(m).catch(() => undefined);
    }
    return true;
  }

  // ---------- blacklist match alerts: Ban / Kick / Not them ----------
  if (area === 'bl' && ['ban', 'kick', 'clear'].includes(action)) {
    const { onAlertButton } = await import('../../services/blacklist/blacklistGuard.service.js');
    await onAlertButton(interaction, action, id.split(':').slice(3).join(':'));
    return true;
  }

  // ---------- birthday asked in DM after joining (optional for the member) ----------
  if (area === 'bday' && action === 'ask') {
    return interaction.showModal(new ModalBuilder().setCustomId(`cm:bday:save:${arg}`).setTitle('Your birthday').addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('day').setLabel('Day (1-31)').setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(2).setRequired(true)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('month').setLabel('Month (1-12)').setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(2).setRequired(true)),
    )).then(() => true);
  }
  if (area === 'bday' && action === 'skip') {
    await interaction.update({ content: 'No problem, we won’t ask again. You can add it any time with `/birthday set` in the server.', components: [] }).catch(() => undefined);
    return true;
  }
  if (area === 'bday' && action === 'save' && interaction.isModalSubmit()) {
    const day = Number(interaction.fields.getTextInputValue('day'));
    const month = Number(interaction.fields.getTextInputValue('month'));
    try {
      const { birthdays } = await import('../../services/features/community.service.js');
      await birthdays.set(await communityForGuild(arg), interaction.user.id, interaction.user.username, day, month);
      await interaction.reply({ content: `🎂 Saved: ${day}/${month}. The server will celebrate with you on the day! Change or remove it any time with \`/birthday\`.` });
    } catch (e: any) {
      await interaction.reply({ content: `⚠️ ${e.message} Press the button to try again.` });
    }
    return true;
  }

  // ---------- events: Register / Can't go ----------
  if (area === 'evt' && (action === 'join' || action === 'leave')) {
    await interaction.deferReply({ ephemeral: true });
    const communityId = await communityForGuild(interaction.guildId);
    const { eventPosts } = await import('../../services/eventPosts.service.js');
    await interaction.editReply({ content: await eventPosts.press(interaction, communityId, arg, action === 'join'), allowedMentions: { parse: [] } });
    return true;
  }

  // ---------- guided application chat ----------
  if (area === 'noop') { await interaction.deferUpdate().catch(() => undefined); return true; }
  if (area === 'flow') {
    const { applicationFlow } = await import('../../services/recruitment/applicationFlow.service.js');
    if (action === 'consent') { await applicationFlow.consent(interaction, arg); return true; }
    if (action === 'ans') { await applicationFlow.answer(interaction, arg, id.split(':')[4] || ''); return true; }
    if (action === 'understood') { await applicationFlow.understood(interaction, arg); return true; }
    // Staff-only controls.
    const roomDoc: any = await reviewRoomsRepository.getById(arg).catch(() => null);
    if (!roomDoc) { await interaction.reply({ content: 'Application chat not found.', ephemeral: true }); return true; }
    if (!(await applicationFlow.isStaff(roomDoc.communityId, interaction.member))) { await interaction.reply({ content: '⛔ Staff only.', ephemeral: true }); return true; }
    await interaction.deferReply({ ephemeral: true });
    try {
      if (action === 'quiz') { await applicationFlow.startQuiz(arg, interaction.user.id); await interaction.editReply('📝 Rules quiz sent to the applicant.'); }
      else if (action === 'istart') { await applicationFlow.startInterview(arg, interaction.member); await interaction.editReply('🎤 Interview started. I am recording the transcript.'); }
      else if (action === 'iend') { await applicationFlow.endInterview(arg, interaction.member); await interaction.editReply('🎤 Interview ended. Summary posted in this thread.'); }
      else await interaction.editReply('Unknown action.');
    } catch (err: any) {
      await interaction.editReply(`⚠️ ${err?.message || err}`);
    }
    return true;
  }

  // ---------- recruitment: apply ----------
  if (area === 'apply') {
    if (action === 'start') { await discordRecruitment.start(interaction); return true; }
    if (action === 'next') { await discordRecruitment.next(interaction, Number(arg) || 0); return true; }
    if (action === 'page' && interaction.isModalSubmit()) { await discordRecruitment.pageSubmitted(interaction, Number(arg) || 0); return true; }
  }

  // ---------- recruitment: review post buttons ----------
  if (area === 'rv') {
    if (action === 'approve') { await discordRecruitment.decide(interaction, arg, true); return true; }
    if (action === 'reject') { await interaction.showModal(discordRecruitment.rejectModal(arg)); return true; }
    if (action === 'rejectreason' && interaction.isModalSubmit()) {
      await discordRecruitment.decide(interaction, arg, false, interaction.fields.getTextInputValue('reason'));
      return true;
    }
  }

  // ---------- tickets ----------
  if (area === 'ticket' && action === 'pick' && interaction.isStringSelectMenu()) {
    const typeKey = interaction.values[0];
    const label = interaction.component?.options?.find((o: any) => o.value === typeKey)?.label || 'Open a ticket';
    await interaction.showModal(ticketService.modal(typeKey, label));
    return true;
  }
  if (area === 'ticket' && action === 'btn') {
    const label = interaction.component?.label || 'Open a ticket';
    await interaction.showModal(ticketService.modal(arg, label));
    return true;
  }
  if (area === 'ticket' && action === 'form' && interaction.isModalSubmit()) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const communityId = await communityForGuild(interaction.guildId);
      const t = await ticketService.open({
        communityId, guild: interaction.guild, member: interaction.member, typeKey: arg,
        subject: interaction.fields.getTextInputValue('subject'), details: interaction.fields.getTextInputValue('details'),
        involvedIds: (() => { try { return Array.from((interaction.fields.getSelectedUsers('members') as any)?.values?.() || []).filter((u: any) => !u.bot && !u.system && u.id !== interaction.user.id).map((u: any) => u.id) as string[]; } catch { return []; } })(),
        outsideNames: (() => { try { return interaction.fields.getTextInputValue('outside') || ''; } catch { return ''; } })(),
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
  // ---------- review room: rank done / special access ----------
  if (area === 'room' && (action === 'done' || action === 'invite' || action === 'uninvite')) {
    try {
      const { StringSelectMenuBuilder, UserSelectMenuBuilder } = await import('discord.js');
      if (action === 'done') {
        const opts = await reviewRooms.doneOptions(arg, interaction.member);
        if (!opts.length) { await interaction.reply({ content: 'No lower rank is active in this application.', ephemeral: true }); return true; }
        await interaction.reply({ ephemeral: true, content: 'Which rank has finished its part? They will stop seeing this application.', components: [new ActionRowBuilder<any>().addComponents(new StringSelectMenuBuilder().setCustomId(`cm:room:donepick:${arg}`).setPlaceholder('Pick ranks').setMinValues(1).setMaxValues(opts.length).addOptions(opts.map((o) => ({ label: o.name.slice(0, 100), value: String(o.i) }))))] });
      } else if (action === 'invite') {
        await interaction.reply({ ephemeral: true, content: 'Who should get special access to this application?', components: [new ActionRowBuilder<any>().addComponents(new UserSelectMenuBuilder().setCustomId(`cm:room:invpick:${arg}`).setPlaceholder('Pick a member').setMinValues(1).setMaxValues(1))] });
      } else {
        const room: any = await reviewRoomsRepository.getById(arg);
        const list: string[] = room?.invited || [];
        if (!list.length) { await interaction.reply({ content: 'Nobody has special access.', ephemeral: true }); return true; }
        const names = await Promise.all(list.map(async (id) => (await interaction.guild.members.fetch(id).catch(() => null))?.displayName || id));
        await interaction.reply({ ephemeral: true, content: 'Remove whose special access?', components: [new ActionRowBuilder<any>().addComponents(new StringSelectMenuBuilder().setCustomId(`cm:room:uninvpick:${arg}`).setPlaceholder('Pick a member').addOptions(list.map((id, i) => ({ label: String(names[i]).slice(0, 100), value: id }))))] });
      }
    } catch (e: any) { await interaction.reply({ content: `⚠️ ${e.message}`, ephemeral: true }).catch(() => undefined); }
    return true;
  }
  if (area === 'room' && (action === 'donepick' || action === 'invpick' || action === 'uninvpick')) {
    await interaction.deferUpdate().catch(() => undefined);
    try {
      const msg = action === 'donepick' ? await reviewRooms.markDone(arg, interaction.member, interaction.values.map(Number))
        : await reviewRooms.invite(arg, interaction.member, interaction.values[0], action === 'invpick');
      await interaction.editReply({ content: `✅ ${msg}`, components: [] });
    } catch (e: any) { await interaction.editReply({ content: `⚠️ ${e.message}`, components: [] }).catch(() => undefined); }
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
