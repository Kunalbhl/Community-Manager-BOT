/**
 * Ticketing: members open a private ticket channel by type (report, help, appeal, bug, business...).
 *
 * Flow:  /ticket panel  -> panel with a type picker  -> member picks a type -> short form (subject + details)
 *        -> private channel visible to the member + staff  -> Claim / Close buttons
 *        -> Close saves a text transcript, DMs the member, and deletes the channel.
 */
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, PermissionFlagsBits,
  StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, LabelBuilder, UserSelectMenuBuilder,
} from 'discord.js';
import { FirestoreRepository } from '../../repositories/firestore.repository.js';
import { logger } from '../../logging/logger.js';
import { getToolkit, saveToolkit, isSnowflake, TicketType, DEFAULT_TICKET_PANEL } from './toolkitConfig.js';

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
  panelComponents(types: TicketType[], panel = DEFAULT_TICKET_PANEL) {
    const list = types.slice(0, 25);
    if (panel.style === 'BUTTONS') {
      const styles: Record<string, ButtonStyle> = { PRIMARY: ButtonStyle.Primary, SECONDARY: ButtonStyle.Secondary, SUCCESS: ButtonStyle.Success, DANGER: ButtonStyle.Danger };
      const rows: ActionRowBuilder<ButtonBuilder>[] = [];
      for (let i = 0; i < list.length; i += 5) {
        rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(list.slice(i, i + 5).map((t) => {
          const bt = new ButtonBuilder().setCustomId(`cm:ticket:btn:${t.key}`).setLabel(t.label.slice(0, 80)).setStyle(styles[t.buttonStyle || 'SECONDARY'] || ButtonStyle.Secondary);
          if (t.emoji) bt.setEmoji(t.emoji);
          return bt;
        })));
      }
      return rows;
    }
    const menu = new StringSelectMenuBuilder()
      .setCustomId('cm:ticket:pick')
      .setPlaceholder((panel.placeholder || 'Choose what you need help with').slice(0, 150))
      .addOptions(list.map((t) => ({ label: t.label.slice(0, 100), value: t.key, description: (t.description || '').slice(0, 100) || undefined, emoji: t.emoji || undefined })));
    return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)];
  },

  panelMessage(cfg: any) {
    const panel = { ...DEFAULT_TICKET_PANEL, ...(cfg.tickets.panel || {}), embed: { ...DEFAULT_TICKET_PANEL.embed, ...(cfg.tickets.panel?.embed || {}) } };
    const e = panel.embed;
    const lines = cfg.tickets.types.map((t: TicketType) => `${t.emoji} **${t.label}**${t.description ? ` · ${t.description}` : ''}`).join('\n');
    const description = [e.description, e.listTypes ? lines : ''].filter(Boolean).join('\n\n').slice(0, 4096);
    const embed: any = { color: parseInt(String(e.color || '#7c8cff').slice(1), 16) || 0x7c8cff };
    if (e.title) embed.title = e.title;
    if (description) embed.description = description;
    if (e.url && e.title) embed.url = e.url;
    if (e.authorName) embed.author = { name: e.authorName, icon_url: e.authorIcon || undefined };
    if (e.thumbnail) embed.thumbnail = { url: e.thumbnail };
    if (e.image) embed.image = { url: e.image };
    if (e.footerText) embed.footer = { text: e.footerText, icon_url: e.footerIcon || undefined };
    if (e.timestamp) embed.timestamp = new Date().toISOString();
    const hasEmbed = !!(embed.title || embed.description || embed.image || embed.author);
    return {
      content: panel.content || undefined,
      embeds: hasEmbed ? [embed] : [],
      components: this.panelComponents(cfg.tickets.types, panel),
      allowedMentions: { parse: ['roles', 'users', 'everyone'] as any },
    };
  },

  /** Posts the panel, or updates the one already posted in that channel (unless forceNew). */
  async postPanel(communityId: string, channel: any, forceNew = false) {
    const cfg = await getToolkit(communityId);
    if (!cfg.tickets.types.length) throw new Error('Add at least one ticket type first.');
    const msg = this.panelMessage(cfg);
    const p: any = cfg.tickets.panel || {};
    let sent: any = null; let updated = false;
    if (!forceNew && p.messageId && p.channelId === channel.id) {
      const old = await channel.messages.fetch(p.messageId).catch(() => null);
      if (old) { sent = await old.edit({ ...msg, allowedMentions: { parse: [] } }); updated = true; }
    }
    if (!sent) {
      sent = await channel.send(msg);
      // Only one panel: remove the previous one (also when it was in another channel), unless asked to keep a copy.
      if (!forceNew && p.messageId && p.channelId) {
        const oldCh: any = channel.guild.channels.cache.get(p.channelId);
        await oldCh?.messages?.fetch(p.messageId).then((m: any) => m.delete()).catch(() => undefined);
      }
    }
    await saveToolkit(communityId, { tickets: { ...cfg.tickets, panel: { ...DEFAULT_TICKET_PANEL, ...p, channelId: channel.id, messageId: sent.id }, panelPostedAt: new Date().toISOString() } as any });
    return { updated, url: sent.url, channelId: channel.id, messageId: sent.id };
  },

  modal(typeKey: string, label: string) {
    return new ModalBuilder()
      .setCustomId(`cm:ticket:form:${typeKey}`)
      .setTitle(label.slice(0, 45))
      .addLabelComponents(
        new LabelBuilder().setLabel('Subject').setTextInputComponent(
          new TextInputBuilder().setCustomId('subject').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true)),
        new LabelBuilder().setLabel('Member(s) involved').setDescription('Pick members (optional). Bots and apps are ignored. Only staff see this.').setUserSelectMenuComponent(
          new UserSelectMenuBuilder().setCustomId('members').setPlaceholder('Search a member').setMinValues(0).setMaxValues(5).setRequired(false)),
        new LabelBuilder().setLabel('Not in this server?').setDescription('Any name you know: Discord name, game name, or both (optional)').setTextInputComponent(
          new TextInputBuilder().setCustomId('outside').setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(false).setPlaceholder('e.g. ShadowX (in game), @shadow_x')),
        new LabelBuilder().setLabel('Details').setDescription('What happened, where and when. Add message links or screenshots.').setTextInputComponent(
          new TextInputBuilder().setCustomId('details').setStyle(TextInputStyle.Paragraph).setMaxLength(1500).setRequired(true)),
      );
  },

  /** Creates the private ticket channel. */
  async open(params: { communityId: string; guild: any; member: any; typeKey: string; subject: string; details: string; involvedIds?: string[]; outsideNames?: string }): Promise<TicketDoc> {
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
      subject: params.subject, details: params.details, involvedIds: params.involvedIds || [], outsideNames: params.outsideNames || '', openerId: member.id, openerName: member.user?.username || member.id,
      channelId: channel.id, status: 'OPEN', createdAt: new Date().toISOString(),
    } as any);

    // Tell staff at once if anyone named is already on the blacklist.
    let blacklistNote = '';
    try {
      const g = await import('../blacklist/blacklistGuard.service.js');
      const notes: string[] = [];
      for (const id of params.involvedIds || []) {
        const m = await g.findMatches(communityId, { userId: id });
        if (m.length) notes.push(`<@${id}> is on the blacklist: ${String(m[0].entry.reason || '').slice(0, 120)}`);
      }
      for (const name of (params.outsideNames || '').split(/[,/|]| and /).map((x) => x.trim().replace(/^@/, '')).filter((x) => x.length >= 3)) {
        const hits = await g.search(communityId, name);
        if (hits[0]?.score >= 70) notes.push(`“${name}” matches **${g.entryLabel(hits[0].entry)}**: ${String(hits[0].entry.reason || '').slice(0, 120)}`);
      }
      blacklistNote = notes.join('\n');
    } catch { /* blacklist check is optional */ }

    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`cm:ticket:claim:${ticket.id}`).setLabel('Claim').setEmoji('✋').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`cm:ticket:close:${ticket.id}`).setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Danger),
    );
    const panelCfg: any = cfg.tickets.panel || {};
    const pingRoles = [...new Set([...(panelCfg.pingStaff === false ? [] : staff), ...(type.pingRoleIds || []).filter((id) => guild.roles.cache.has(id))])];
    const pingUsers = [...new Set([member.id, ...(type.pingUserIds || [])])];
    // People pinged on this type must be able to see the ticket.
    for (const uid of type.pingUserIds || []) await channel.permissionOverwrites.edit(uid, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => undefined);
    for (const rid of type.pingRoleIds || []) if (!staff.includes(rid)) await channel.permissionOverwrites.edit(rid, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => undefined);
    const num = String(number).padStart(4, '0');
    const fill = (t: string) => t.replace(/\{\{?\s*(member|type|number|subject|server)\s*\}?\}/g, (_m, k) => ({ member: `<@${member.id}>`, type: type.label, number: `#${num}`, subject: params.subject, server: guild.name } as any)[k]);
    await channel.send({
      content: [pingUsers.map((id) => `<@${id}>`).join(' '), pingRoles.map((id) => `<@&${id}>`).join(' ')].filter(Boolean).join(' '),
      allowedMentions: { users: pingUsers, roles: pingRoles },
      embeds: [{
        title: type.welcomeTitle ? fill(type.welcomeTitle).slice(0, 256) : `${type.emoji} ${type.label} · #${num}`,
        ...(type.welcomeMessage ? { description: fill(type.welcomeMessage).slice(0, 4000) } : {}),
        color: 0xff5c8a,
        fields: [
          { name: 'Subject', value: params.subject.slice(0, 1024) },
          ...(params.involvedIds?.length ? [{ name: 'Members involved', value: params.involvedIds.map((id) => `<@${id}> · \`${id}\``).join('\n').slice(0, 1024) }] : []),
          ...(params.outsideNames ? [{ name: 'Not in the server', value: params.outsideNames.slice(0, 1024) }] : []),
          ...(blacklistNote ? [{ name: '🚫 Blacklist', value: blacklistNote.slice(0, 1024) }] : []),
          { name: 'Details', value: params.details.slice(0, 1024) },
        ],
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
