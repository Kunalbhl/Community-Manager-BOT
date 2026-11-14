/**
 * Community features: server logs, starboard, birthdays, verification, custom commands,
 * button-role panels and giveaways.
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { boldBlocks } from '../../../shared/utils/discordText.js';
import { FirestoreRepository } from '../../repositories/firestore.repository.js';
import { logger } from '../../logging/logger.js';
import { getFeatures, saveFeatures, fill } from './featuresConfig.js';
import { guildFor, isSnowflake } from '../toolkit/toolkitConfig.js';

const NO_PINGS = { parse: [] as any[] };
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/* ================================================================== */
/* Server logs                                                         */
/* ================================================================== */
type LogEvent = 'memberJoin' | 'memberLeave' | 'messageDelete' | 'messageEdit' | 'roleChange' | 'nicknameChange' | 'moderation';
const LOG_COLORS: Record<LogEvent, number> = { memberJoin: 0x7fe0b0, memberLeave: 0xffc46b, messageDelete: 0xff5c8a, messageEdit: 0x7c8cff, roleChange: 0xa7b0ff, nicknameChange: 0xa7b0ff, moderation: 0xff5c8a };

export const serverLogs = {
  async send(communityId: string, guild: any, event: LogEvent, title: string, description: string, fields: { name: string; value: string; inline?: boolean }[] = []) {
    const cfg = (await getFeatures(communityId)).logs;
    if (!cfg.enabled || !cfg.channelId || !cfg.events[event]) return;
    const channel: any = guild?.channels?.cache?.get(cfg.channelId);
    if (!channel) return;
    await channel.send({
      allowedMentions: NO_PINGS,
      embeds: [{ title, description: clip(description, 3900), color: LOG_COLORS[event], fields: fields.map((f) => ({ ...f, value: clip(f.value || '—', 1000) })), timestamp: new Date().toISOString() }],
    }).catch(() => undefined);
  },
};

/* ================================================================== */
/* Starboard                                                           */
/* ================================================================== */
interface StarDoc { id: string; communityId: string; messageId: string; starMessageId: string; count: number }
const starRepository = new FirestoreRepository<StarDoc>('starboardPosts');

export const starboard = {
  async onReaction(communityId: string, reaction: any, user: any) {
    const cfg = (await getFeatures(communityId)).starboard;
    if (!cfg.enabled || !cfg.channelId) return;
    if (reaction.partial) await reaction.fetch().catch(() => undefined);
    const emoji = reaction.emoji?.id ? `<:${reaction.emoji.name}:${reaction.emoji.id}>` : reaction.emoji?.name;
    if (emoji !== cfg.emoji && reaction.emoji?.name !== cfg.emoji) return;
    const message = reaction.message.partial ? await reaction.message.fetch().catch(() => null) : reaction.message;
    if (!message || message.channel.id === cfg.channelId || message.author?.bot) return;
    let count = reaction.count || 0;
    if (!cfg.allowSelfStar) {
      const users = await reaction.users.fetch().catch(() => null);
      if (users?.has(message.author.id)) count -= 1;
    }
    void user;
    if (count < cfg.threshold) return;

    const board: any = message.guild.channels.cache.get(cfg.channelId);
    if (!board) return;
    const id = `${communityId}_${message.id}`;
    const existing = await starRepository.getById(id).catch(() => null);
    const header = `${cfg.emoji} **${count}** · <#${message.channel.id}>`;
    const image = message.attachments?.find?.((a: any) => /image/.test(a.contentType || ''))?.url;
    const embed = {
      author: { name: message.member?.displayName || message.author.username, icon_url: message.author.displayAvatarURL?.() },
      description: clip(message.content || '', 3800),
      color: 0xffc46b,
      fields: [{ name: 'Original', value: `[Jump to message](${message.url})` }],
      ...(image ? { image: { url: image } } : {}),
      timestamp: new Date(message.createdTimestamp).toISOString(),
    };
    if (existing) {
      const post = await board.messages.fetch(existing.starMessageId).catch(() => null);
      await post?.edit({ content: header, embeds: [embed], allowedMentions: NO_PINGS }).catch(() => undefined);
      await starRepository.update(id, { count } as any);
    } else {
      const post = await board.send({ content: header, embeds: [embed], allowedMentions: NO_PINGS });
      await starRepository.create(id, { id, communityId, messageId: message.id, starMessageId: post.id, count } as any);
    }
  },
};

/* ================================================================== */
/* Birthdays                                                           */
/* ================================================================== */
export interface BirthdayDoc { id: string; communityId: string; userId: string; username: string; day: number; month: number; lastCelebratedYear?: number }
export const birthdaysRepository = new FirestoreRepository<BirthdayDoc>('memberBirthdays');
const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function nowIn(tz: string) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') };
}

export const birthdays = {
  async set(communityId: string, userId: string, username: string, day: number, month: number) {
    if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= MONTH_DAYS[month - 1])) throw new Error('That date does not exist.');
    const id = `${communityId}_${userId}`;
    const exists = await birthdaysRepository.getById(id).catch(() => null);
    if (exists) return birthdaysRepository.update(id, { day, month, username } as any);
    return birthdaysRepository.create(id, { id, communityId, userId, username, day, month } as any);
  },
  async remove(communityId: string, userId: string) {
    await birthdaysRepository.delete(`${communityId}_${userId}`).catch(() => undefined);
  },
  async list(communityId: string) {
    const all = await birthdaysRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] });
    return all.sort((a, b) => a.month - b.month || a.day - b.day);
  },

  /** Runs every minute from the scheduler; celebrates once per day at the configured hour. */
  async tick(communityId: string) {
    const cfg = (await getFeatures(communityId)).birthdays;
    if (!cfg.enabled || !cfg.channelId) return;
    const now = nowIn(cfg.timezone || 'Asia/Kolkata');
    const today = `${now.year}-${now.month}-${now.day}`;
    if (now.hour < cfg.hour || cfg.lastRunDate === today) return;
    await saveFeatures(communityId, { birthdays: { ...cfg, lastRunDate: today } });

    const guild = await guildFor(communityId);
    const channel: any = guild?.channels?.cache?.get(cfg.channelId);
    if (!guild || !channel) return;
    // 29 Feb birthdays are celebrated on 28 Feb in non-leap years.
    const leap = (now.year % 4 === 0 && now.year % 100 !== 0) || now.year % 400 === 0;
    const people = (await this.list(communityId)).filter((b) => (b.month === now.month && b.day === now.day) || (!leap && now.month === 2 && now.day === 28 && b.month === 2 && b.day === 29));
    for (const b of people) {
      if (b.lastCelebratedYear === now.year) continue;
      const member = await guild.members.fetch(b.userId).catch(() => null);
      if (!member) continue;
      await channel.send({ content: fill(cfg.message, { user: `<@${b.userId}>`, username: member.displayName, server: guild.name }), allowedMentions: { users: [b.userId] } }).catch(() => undefined);
      if (cfg.roleId) {
        await member.roles.add(cfg.roleId, 'Birthday').catch(() => undefined);
        setTimeout(() => member.roles.remove(cfg.roleId!, 'Birthday over').catch(() => undefined), 24 * 3600 * 1000);
      }
      await birthdaysRepository.update(b.id, { lastCelebratedYear: now.year } as any).catch(() => undefined);
    }
  },
};

/* ================================================================== */
/* Verification                                                        */
/* ================================================================== */
const mathAnswers = new Map<string, { answer: number; at: number }>();

export const verification = {
  panel(message: string) {
    return {
      embeds: [{ title: '✅ Verification', description: message, color: 0x7fe0b0 }],
      components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('cm:verify:start').setLabel('Verify').setEmoji('✅').setStyle(ButtonStyle.Success))],
    };
  },
  async postPanel(communityId: string, channel: any) {
    const cfg = (await getFeatures(communityId)).verification;
    if (!cfg.roleId) throw new Error('Choose the role verified members get first.');
    await channel.send(this.panel(cfg.message));
  },
  /** Returns a modal for MATH mode, or null when the member is verified directly. */
  async start(communityId: string, member: any): Promise<{ modal?: any; text?: string }> {
    const cfg = (await getFeatures(communityId)).verification;
    if (!cfg.enabled || !cfg.roleId) return { text: '⚠️ Verification is not set up on this server yet.' };
    if (member.roles.cache.has(cfg.roleId)) return { text: '✅ You are already verified.' };
    if (cfg.mode === 'MATH') {
      const a = 2 + Math.floor(Math.random() * 9);
      const b = 2 + Math.floor(Math.random() * 9);
      mathAnswers.set(`${member.guild.id}_${member.id}`, { answer: a + b, at: Date.now() });
      return {
        modal: new ModalBuilder().setCustomId('cm:verify:answer').setTitle('Quick check').addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('answer').setLabel(`What is ${a} + ${b}?`).setStyle(TextInputStyle.Short).setMaxLength(3).setRequired(true)),
        ),
      };
    }
    return { text: await this.grant(communityId, member) };
  },
  async answer(communityId: string, member: any, value: string): Promise<string> {
    const key = `${member.guild.id}_${member.id}`;
    const q = mathAnswers.get(key);
    mathAnswers.delete(key);
    if (!q || Date.now() - q.at > 5 * 60_000) return '⌛ That check expired. Press **Verify** again.';
    if (Number(String(value).trim()) !== q.answer) return '❌ Not quite. Press **Verify** to try again.';
    return this.grant(communityId, member);
  },
  async grant(communityId: string, member: any): Promise<string> {
    const cfg = (await getFeatures(communityId)).verification;
    try {
      await member.roles.add(cfg.roleId, 'Verified');
      if (cfg.removeRoleId) await member.roles.remove(cfg.removeRoleId, 'Verified').catch(() => undefined);
      return '✅ You are verified. Welcome!';
    } catch {
      return '⚠️ I could not give you the role. Please tell the staff (the bot’s role must be above the verified role).';
    }
  },
};

/* ================================================================== */
/* Custom commands                                                     */
/* ================================================================== */
export const customCommands = {
  async onMessage(communityId: string, message: any): Promise<boolean> {
    const cfg = (await getFeatures(communityId)).customCommands;
    if (!cfg.enabled || !message.content?.startsWith(cfg.prefix)) return false;
    const name = message.content.slice(cfg.prefix.length).trim().split(/\s+/)[0]?.toLowerCase();
    const cmd = cfg.commands.find((c) => c.name.toLowerCase() === name);
    if (!cmd) return false;
    const text = fill(cmd.response, { user: `<@${message.author.id}>`, username: message.member?.displayName || message.author.username, server: message.guild.name });
    if (cmd.embed) await message.channel.send({ embeds: [{ description: text, color: 0x7c8cff }], allowedMentions: { users: [message.author.id] } }).catch(() => undefined);
    else await message.channel.send({ content: text, allowedMentions: { users: [message.author.id] } }).catch(() => undefined);
    if (cmd.deleteTrigger) await message.delete().catch(() => undefined);
    return true;
  },
};

/* ================================================================== */
/* Button roles                                                        */
/* ================================================================== */
export interface ButtonRolePanel {
  id: string; communityId: string; title: string; description: string;
  mode: 'TOGGLE' | 'ONE_ONLY';
  buttons: { roleId: string; label: string; emoji?: string; requiredRoleIds?: string[]; blockedRoleIds?: string[] }[];
  /** Only members with at least one of these roles can use the panel (empty = everyone). */
  requiredRoleIds?: string[];
  /** Members with any of these roles can't use it. */
  blockedRoleIds?: string[];
  channelId?: string; messageId?: string; createdAt: string;
}
export const buttonRolePanelsRepository = new FirestoreRepository<ButtonRolePanel>('buttonRolePanels');

const RED = /[🎯🎲❤🔴🍎🔥🚨⛔🍓🌹💥🩸🥊🏎🍒🌶🎈🧨📕]/u;
const GREEN = /[🟢✅🌿🍀🧪💚🐸🌲🌳🥦🍏💸💵🌱🐍♻🔋📗]/u;
const BLUE = /[🔵💙🧊💎🌊🧙🐳🚀🌀🛡🎮🔷🦋🌐📘🧩🎧]/u;
/** Button colour: the one picked for this role, else matched to its emoji, else to the role's colour. */
function styleFor(b: any, guild?: any): ButtonStyle {
  const pick = String(b.style || 'AUTO');
  if (pick === 'BLUE') return ButtonStyle.Primary;
  if (pick === 'GREEN') return ButtonStyle.Success;
  if (pick === 'RED') return ButtonStyle.Danger;
  if (pick === 'GREY') return ButtonStyle.Secondary;
  // Auto: a colour that makes the emoji stand out (a red emoji on a red button disappears).
  const e = String(b.emoji || '');
  if (RED.test(e)) return ButtonStyle.Primary;
  if (BLUE.test(e)) return ButtonStyle.Success;
  if (GREEN.test(e)) return ButtonStyle.Primary;
  if (e) return ButtonStyle.Secondary;
  const c = guild?.roles?.cache?.get(b.roleId)?.color || 0;
  if (c) {
    const r = (c >> 16) & 255, g = (c >> 8) & 255, bl = c & 255;
    if (r > g + 40 && r > bl + 20) return ButtonStyle.Danger;
    if (g > r + 30 && g >= bl) return ButtonStyle.Success;
    if (bl > r || (bl > 120 && r > 120)) return ButtonStyle.Primary;
  }
  return ButtonStyle.Secondary;
}
function roleButton(panel: any, b: any, guild?: any, short = false) {
  const btn = new ButtonBuilder().setCustomId(`cm:br:${panel.id}:${b.roleId}`).setLabel((short ? (b.buttonText || 'Choose') : b.label).slice(0, 80)).setStyle(styleFor(b, guild));
  if (b.emoji) btn.setEmoji(b.emoji);
  return btn;
}

export const buttonRoles = {
  components(panel: ButtonRolePanel, guild?: any) {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    panel.buttons.slice(0, 25).forEach((b, i) => {
      if (i % 5 === 0) rows.push(new ActionRowBuilder<ButtonBuilder>());
      rows[rows.length - 1].addComponents(roleButton(panel, b, guild));
    });
    return rows;
  },
  /** Premium layout: a coloured frame with the server's picture, the text, the buttons, a big image and a footer. */
  cards(panel: ButtonRolePanel, guild?: any) {
    const p: any = panel;
    const accent = p.color ? parseInt(String(p.color).replace('#', ''), 16) : (guild?.roles.cache.get(panel.buttons[0]?.roleId)?.color || 0x7c8cff);
    const thumb = p.thumbnailUrl || guild?.iconURL?.({ size: 256 });
    const head = { type: 10, content: `${guild ? `-# ${guild.name}\n` : ''}## ${panel.title}${panel.description ? `\n${clip(boldBlocks(panel.description), 3000)}` : ''}` };
    const rows = this.components(panel, guild).map((r) => r.toJSON());
    const container: any = { type: 17, accent_color: accent, components: [
      thumb ? { type: 9, components: [head], accessory: { type: 11, media: { url: thumb } } } : head,
      { type: 14, divider: true, spacing: 2 },
      ...rows,
      ...(p.imageUrl ? [{ type: 12, items: [{ media: { url: p.imageUrl } }] }] : []),
      ...(p.footerText ? [{ type: 14, divider: false, spacing: 1 }, { type: 10, content: `-# ${clip(p.footerText, 200)}` }] : []),
    ] };
    return { flags: 1 << 15, components: [container], allowedMentions: { parse: [] as any[] } };
  },
  async post(panel: ButtonRolePanel, channel: any) {
    const guild = channel.guild;
    const color = (panel as any).color ? parseInt(String((panel as any).color).replace('#', ''), 16) : (guild?.roles.cache.get(panel.buttons[0]?.roleId)?.color || 0x7c8cff);
    const icon = guild?.iconURL?.({ size: 256 }) || undefined;
    const p: any = panel;
    const thumb = p.thumbnailUrl || icon;
    const classic = { embeds: [{
      author: guild ? { name: guild.name, icon_url: icon } : undefined, title: panel.title, description: boldBlocks(panel.description || 'Pick your roles below.'), color,
      thumbnail: thumb ? { url: thumb } : undefined, image: p.imageUrl ? { url: p.imageUrl } : undefined,
      footer: p.footerText ? { text: String(p.footerText).slice(0, 200), icon_url: p.footerIconUrl || undefined } : undefined,
    }], components: this.components(panel, guild) };
    const payload: any = (panel as any).layout === 'CARDS' ? this.cards(panel, guild) : classic;
    if (panel.messageId && panel.channelId === channel.id) {
      const existing = await channel.messages.fetch(panel.messageId).catch(() => null);
      // A message can't switch between the two layouts, so a layout change posts a new one and removes the old.
      const sameLayout = existing && Boolean(existing.flags?.has?.(1 << 15)) === ((panel as any).layout === 'CARDS');
      if (existing && sameLayout && (await existing.edit(payload).then(() => true).catch(() => false))) return panel;
      if (existing && !sameLayout) await existing.delete().catch(() => undefined);
    }
    let msg = await channel.send(payload).catch(() => null);
    if (!msg && payload !== classic) msg = await channel.send(classic); // older clients / API refusal: fall back to the classic layout
    if (!msg) throw new Error('Could not post the panel in that channel.');
    return buttonRolePanelsRepository.update(panel.id, { channelId: channel.id, messageId: msg.id } as any);
  },
  async press(panelId: string, roleId: string, member: any): Promise<string> {
    const panel = await buttonRolePanelsRepository.getById(panelId).catch(() => null);
    if (!panel || !panel.buttons.some((b) => b.roleId === roleId)) return '⚠️ This button is no longer active.';
    const req = (panel.requiredRoleIds || []).filter((id) => member.guild.roles.cache.has(id));
    if (req.length && !req.some((id) => member.roles.cache.has(id))) return `🔒 This is only for members with ${req.map((id) => `<@&${id}>`).join(' or ')}.`;
    const blocked = (panel.blockedRoleIds || []).find((id) => member.roles.cache.has(id));
    if (blocked) return `🔒 Members with <@&${blocked}> can't use this.`;
    // Per-button conditions.
    const btn = panel.buttons.find((b) => b.roleId === roleId)!;
    const breq = (btn.requiredRoleIds || []).filter((id) => member.guild.roles.cache.has(id));
    if (breq.length && !breq.some((id) => member.roles.cache.has(id)) && !member.roles.cache.has(roleId)) return `🔒 <@&${roleId}> is only for members with ${breq.map((id) => `<@&${id}>`).join(' or ')}.`;
    const bblk = (btn.blockedRoleIds || []).find((id) => member.roles.cache.has(id));
    if (bblk && !member.roles.cache.has(roleId)) return `🔒 Members with <@&${bblk}> can't take <@&${roleId}>.`;
    try {
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId, 'Button role');
        return `Removed <@&${roleId}>.`;
      }
      const removed: string[] = [];
      if (panel.mode === 'ONE_ONLY') {
        for (const b of panel.buttons) if (b.roleId !== roleId && member.roles.cache.has(b.roleId)) { const ok = await member.roles.remove(b.roleId, 'Button role (one only)').then(() => true).catch(() => false); if (ok) removed.push(b.roleId); }
      }
      await member.roles.add(roleId, 'Button role');
      return `Added <@&${roleId}>${removed.length ? ` and removed ${removed.map((id) => `<@&${id}>`).join(', ')}` : ''}.`;
    } catch {
      return '⚠️ I could not change that role. The bot’s role must be above it.';
    }
  },
};

/* ================================================================== */
/* Giveaways                                                           */
/* ================================================================== */
export interface GiveawayDoc {
  id: string; communityId: string; guildId: string; channelId: string; messageId?: string;
  prize: string; description?: string; winners: number; endsAt: number; hostId: string;
  requiredRoleId?: string; entrants: string[]; status: 'RUNNING' | 'ENDED' | 'CANCELLED';
  winnerIds: string[]; createdAt: string;
}
export const giveawaysRepository = new FirestoreRepository<GiveawayDoc>('giveaways');

function pick<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

export const giveaways = {
  view(g: GiveawayDoc) {
    const ended = g.status !== 'RUNNING';
    const lines = [
      g.description || '',
      ended ? (g.winnerIds.length ? `🏆 Winner${g.winnerIds.length > 1 ? 's' : ''}: ${g.winnerIds.map((w) => `<@${w}>`).join(', ')}` : '😕 No valid entries.') : `Ends <t:${Math.floor(g.endsAt / 1000)}:R>`,
      `Hosted by <@${g.hostId}> · ${g.winners} winner${g.winners > 1 ? 's' : ''} · ${g.entrants.length} entr${g.entrants.length === 1 ? 'y' : 'ies'}`,
      g.requiredRoleId ? `Requires <@&${g.requiredRoleId}>` : '',
    ].filter(Boolean);
    return {
      embeds: [{ title: `🎁 ${g.prize}`, description: lines.join('\n'), color: ended ? 0x9aa3d9 : 0xff5c8a, timestamp: new Date(g.endsAt).toISOString() }],
      components: ended ? [] : [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`cm:gw:enter:${g.id}`).setLabel('Enter').setEmoji('🎉').setStyle(ButtonStyle.Primary))],
      allowedMentions: NO_PINGS,
    };
  },

  async start(params: { communityId: string; channel: any; prize: string; description?: string; winners: number; durationMinutes: number; hostId: string; requiredRoleId?: string }) {
    if (!params.prize.trim()) throw new Error('Enter a prize.');
    const minutes = Math.min(60 * 24 * 30, Math.max(1, Math.round(params.durationMinutes)));
    const g = await giveawaysRepository.create({
      communityId: params.communityId, guildId: params.channel.guild.id, channelId: params.channel.id,
      prize: params.prize.slice(0, 200), description: params.description?.slice(0, 1000), winners: Math.min(20, Math.max(1, Math.round(params.winners))),
      endsAt: Date.now() + minutes * 60_000, hostId: params.hostId, requiredRoleId: isSnowflake(params.requiredRoleId) ? params.requiredRoleId : undefined,
      entrants: [], status: 'RUNNING', winnerIds: [], createdAt: new Date().toISOString(),
    } as any);
    const msg = await params.channel.send(this.view(g));
    return giveawaysRepository.update(g.id, { messageId: msg.id } as any);
  },

  async enter(id: string, member: any): Promise<string> {
    const g = await giveawaysRepository.getById(id).catch(() => null);
    if (!g || g.status !== 'RUNNING' || g.endsAt < Date.now()) return '⌛ This giveaway has ended.';
    if (g.requiredRoleId && !member.roles.cache.has(g.requiredRoleId)) return `⛔ You need <@&${g.requiredRoleId}> to enter.`;
    if (g.entrants.includes(member.id)) {
      await giveawaysRepository.update(id, { entrants: g.entrants.filter((e) => e !== member.id) } as any);
      return '👋 You left the giveaway.';
    }
    await giveawaysRepository.update(id, { entrants: [...g.entrants, member.id] } as any);
    return '🎉 You are in! Good luck.';
  },

  async end(id: string, reroll = false): Promise<GiveawayDoc> {
    const g = await giveawaysRepository.getById(id);
    if (!g) throw new Error('Giveaway not found.');
    if (g.status === 'CANCELLED') throw new Error('This giveaway was cancelled.');
    if (g.status === 'ENDED' && !reroll) return g;
    const pool = reroll ? g.entrants.filter((e) => !g.winnerIds.includes(e)) : g.entrants;
    const winnerIds = pick(pool, g.winners);
    const updated = await giveawaysRepository.update(id, { status: 'ENDED', winnerIds, endsAt: Math.min(g.endsAt, Date.now()) } as any);
    const guild = await guildFor(g.communityId);
    const channel: any = guild?.channels?.cache?.get(g.channelId);
    if (channel) {
      const msg = g.messageId ? await channel.messages.fetch(g.messageId).catch(() => null) : null;
      await msg?.edit(this.view(updated)).catch(() => undefined);
      await channel.send({
        content: winnerIds.length ? `🎉 Congratulations ${winnerIds.map((w) => `<@${w}>`).join(', ')}! You won **${g.prize}**.${reroll ? ' (reroll)' : ''}` : `No valid entries for **${g.prize}**.`,
        allowedMentions: { users: winnerIds },
      }).catch(() => undefined);
    }
    return updated;
  },

  async cancel(id: string) {
    const g = await giveawaysRepository.getById(id);
    if (!g) throw new Error('Giveaway not found.');
    const updated = await giveawaysRepository.update(id, { status: 'CANCELLED' } as any);
    const guild = await guildFor(g.communityId);
    const channel: any = guild?.channels?.cache?.get(g.channelId);
    const msg = channel && g.messageId ? await channel.messages.fetch(g.messageId).catch(() => null) : null;
    await msg?.edit({ embeds: [{ title: `🎁 ${g.prize}`, description: 'This giveaway was cancelled.', color: 0x9aa3d9 }], components: [] }).catch(() => undefined);
    return updated;
  },

  async list(communityId: string) {
    const all = await giveawaysRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] });
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /** Ends giveaways whose time is up. Runs every minute on the active bot. */
  async tick() {
    const running = await giveawaysRepository.list({ where: [{ field: 'status', operator: '==', value: 'RUNNING' }] });
    for (const g of running) {
      if (g.endsAt <= Date.now()) await this.end(g.id).catch((err) => logger.warn(`[Giveaways] end ${g.id} failed: ${err?.message}`));
    }
  },
};
