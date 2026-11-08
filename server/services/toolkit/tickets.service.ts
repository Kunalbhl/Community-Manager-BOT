/**
 * Ticketing: members open a private ticket channel by type (report, help, appeal, bug, business...).
 *
 * Flow:  /ticket panel  -> panel with a type picker  -> member picks a type -> short form (subject + details)
 *        -> private channel visible to the member + staff  -> Claim / Close buttons
 *        -> Close saves a text transcript, DMs the member, and deletes the channel.
 */
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, PermissionFlagsBits,
  StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} from 'discord.js';
import { FirestoreRepository } from '../../repositories/firestore.repository.js';
import { logger } from '../../logging/logger.js';
import { getToolkit, saveToolkit, isSnowflake, TicketType } from './toolkitConfig.js';

export interface TicketDoc {
  id: string;
  communityId: string;
  guildId: string;
  number: number;
  type: string;
  typeLabel: string;
  subject: string;
  details: string;
  openerId: string;
  openerName: string;
  channelId: string;
  status: 'OPEN' | 'CLAIMED' | 'CLOSED';
  claimedBy?: string;
  claimedByName?: string;
  closedBy?: string;
  closeReason?: string;
  transcript?: string;
  createdAt: string;
  closedAt?: string;
}

export const ticketsRepository = new FirestoreRepository<TicketDoc>('tickets');

const MAX_OPEN_PER_MEMBER = 3;

export const ticketService = {
  panelComponents(types: TicketType[]) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('cm:ticket:pick')
      .setPlaceholder('Choose what you need help with')
      .addOptions(types.slice(0, 25).map((t) => ({ label: t.label.slice(0, 100), value: t.key, description: t.description.slice(0, 100), emoji: t.emoji || undefined })));
    return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)];
  },

  async postPanel(communityId: string, channel: any) {
    const cfg = await getToolkit(communityId);
    const lines = cfg.tickets.types.map((t) => `${t.emoji} **${t.label}** · ${t.description}`).join('\n');
    return channel.send({
      embeds: [{ title: '🎫 Need help? Open a ticket', description: `Pick a type below and a private channel opens for you and our staff.\n\n${lines}`, color: 0x7c8cff }],
      components: this.panelComponents(cfg.tickets.types),
    });
  },

  modal(typeKey: string, label: string) {
    return new ModalBuilder()
      .setCustomId(`cm:ticket:form:${typeKey}`)
      .setTitle(label.slice(0, 45))
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('subject').setLabel('Subject').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true),
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder().setCustomId('details').setLabel('Details (who, what, where, links)').setStyle(TextInputStyle.Paragraph).setMaxLength(1500).setRequired(true),
        ),
      );
  },

  /** Creates the private ticket channel. */
  async open(params: { communityId: string; guild: any; member: any; typeKey: string; subject: string; details: string }): Promise<TicketDoc> {
    const { communityId, guild, member, typeKey } = params;
    const cfg = await getToolkit(communityId);
    if (!cfg.tickets.enabled) throw new Error('Tickets are turned off on this server.');
    const type = cfg.tickets.types.find((t) => t.key === typeKey);
    if (!type) throw new Error('That ticket type no longer exists.');

    const open = (await ticketsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }, { field: 'openerId', operator: '==', value: member.id }] }))
      .filter((t) => t.status !== 'CLOSED');
    if (open.length >= MAX_OPEN_PER_MEMBER) throw new Error(`You already have ${open.length} open tickets. Please finish those first.`);

    // Category: configured one, or create "Tickets" once.
    let categoryId = cfg.tickets.categoryId;
    if (!categoryId || !guild.channels.cache.get(categoryId)) {
      const cat = await guild.channels.create({ name: 'Tickets', type: ChannelType.GuildCategory, permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }] });
      categoryId = cat.id;
    }
    const number = (cfg.tickets.counter || 0) + 1;
    await saveToolkit(communityId, { tickets: { ...cfg.tickets, categoryId, counter: number } });

    const staff = [...new Set([...cfg.tickets.staffRoleIds, ...type.staffRoleIds])].filter((id) => isSnowflake(id) && guild.roles.cache.has(id));
    const allow = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
    const channel = await guild.channels.create({
      name: `ticket-${String(number).padStart(4, '0')}-${(member.user?.username || 'member').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16)}`,
      type: ChannelType.GuildText,
      parent: categoryId,
      topic: `${type.label} · opened by ${member.user?.username}`,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: member.id, allow },
        { id: guild.members.me.id, allow: [...allow, PermissionFlagsBits.ManageChannels] },
        ...staff.map((id) => ({ id, allow: [...allow, PermissionFlagsBits.ManageMessages] })),
      ],
    });

    const ticket = await ticketsRepository.create({
      communityId, guildId: guild.id, number, type: type.key, typeLabel: type.label,
      subject: params.subject, details: params.details, openerId: member.id, openerName: member.user?.username || member.id,
      channelId: channel.id, status: 'OPEN', createdAt: new Date().toISOString(),
    } as any);

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`cm:ticket:claim:${ticket.id}`).setLabel('Claim').setEmoji('✋').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`cm:ticket:close:${ticket.id}`).setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    );
    await channel.send({
      content: `<@${member.id}> ${staff.map((id) => `<@&${id}>`).join(' ')}`.trim(),
      allowedMentions: { users: [member.id], roles: staff },
      embeds: [{
        title: `${type.emoji} ${type.label} · #${String(number).padStart(4, '0')}`,
        color: 0xff5c8a,
        fields: [{ name: 'Subject', value: params.subject.slice(0, 1024) }, { name: 'Details', value: params.details.slice(0, 1024) }],
        footer: { text: 'Staff: press Claim to take this ticket. Anyone here can close it when it is solved.' },
      }],
      components: [buttons],
    });
    await this.log(communityId, guild, `🎫 Ticket #${number} opened by <@${member.id}> · ${type.label} · <#${channel.id}>`);
    return ticket;
  },

  async claim(ticketId: string, staffMember: any): Promise<TicketDoc> {
    const t = await ticketsRepository.getById(ticketId);
    if (!t || t.status === 'CLOSED') throw new Error('This ticket is already closed.');
    const cfg = await getToolkit(t.communityId);
    const type = cfg.tickets.types.find((x) => x.key === t.type);
    const staffRoles = [...cfg.tickets.staffRoleIds, ...(type?.staffRoleIds || [])];
    const isStaff = staffMember.permissions?.has?.(PermissionFlagsBits.ManageChannels) || staffRoles.some((r) => staffMember.roles?.cache?.has(r));
    if (!isStaff) throw new Error('Only staff can claim tickets.');
    return ticketsRepository.update(ticketId, { status: 'CLAIMED', claimedBy: staffMember.id, claimedByName: staffMember.user?.username } as any);
  },

  async close(ticketId: string, closer: { id: string; username: string }, reason = 'Solved', guild?: any): Promise<TicketDoc> {
    const t = await ticketsRepository.getById(ticketId);
    if (!t) throw new Error('Ticket not found.');
    if (t.status === 'CLOSED') return t;
    let transcript = '';
    const channel: any = guild?.channels?.cache?.get(t.channelId);
    if (channel) {
      try {
        const msgs = await channel.messages.fetch({ limit: 100 });
        transcript = Array.from(msgs.values()).reverse()
          .map((m: any) => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author?.username}: ${m.content || (m.embeds?.[0]?.title ? `[embed] ${m.embeds[0].title}` : '')}`)
          .join('\n').slice(0, 90_000);
      } catch { /* missing access */ }
    }
    const closed = await ticketsRepository.update(ticketId, { status: 'CLOSED', closedBy: closer.id, closeReason: reason, transcript, closedAt: new Date().toISOString() } as any);
    if (guild) {
      const opener = await guild.client.users.fetch(t.openerId).catch(() => null);
      await opener?.send(`🔒 Your ticket **#${String(t.number).padStart(4, '0')} · ${t.typeLabel}** in **${guild.name}** was closed by ${closer.username}. Reason: ${reason}`).catch(() => undefined);
      await this.log(t.communityId, guild, `🔒 Ticket #${t.number} closed by <@${closer.id}> · ${reason}`);
      if (channel) setTimeout(() => channel.delete('Ticket closed').catch(() => undefined), 5000);
    }
    return closed;
  },

  async log(communityId: string, guild: any, text: string) {
    try {
      const cfg = await getToolkit(communityId);
      const ch = cfg.tickets.logChannelId ? guild.channels.cache.get(cfg.tickets.logChannelId) : null;
      await ch?.send({ content: text, allowedMentions: { parse: [] } });
    } catch (err: any) {
      logger.warn(`[Tickets] log failed: ${err?.message}`);
    }
  },

  async list(communityId: string, status?: string) {
    const all = await ticketsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] });
    return all.filter((t) => !status || t.status === status).sort((a, b) => b.number - a.number).map(({ transcript, ...rest }) => ({ ...rest, hasTranscript: Boolean(transcript) }));
  },
};
