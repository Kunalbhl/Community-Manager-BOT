/**
 * Blacklist guard: keeps blacklisted people out of the server.
 *
 * An entry can be known by any mix of: Discord user ID, Discord username / display name, in-game
 * names and other aliases. Matching is done on a normalised form (fancy fonts, accents, spaces,
 * symbols and common look-alike digits removed), so "𝐒𝐡𝐚𝐝𝐨𝐰_X" and "shadowx" are the same.
 *
 * - Discord ID match   → blocked from applying; on join they are banned (or kicked) right away.
 * - Name / game match  → blocked from applying and staff get an alert with Ban / Kick / Not them;
 *                        "Not them" clears that one account for that entry, so it never fires again.
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { FirestoreRepository } from '../../repositories/firestore.repository.js';
import { blacklistEntriesRepository } from '../../repositories/index.js';
import { guildFor } from '../toolkit/toolkitConfig.js';
import { logger } from '../../logging/logger.js';

export const CATEGORIES = ['Scam / fraud', 'Toxic / harassment', 'Cheating / hacking', 'Raiding / spam', 'Leaking / doxxing', 'Ban evasion', 'Other'] as const;

export interface BlacklistSettings {
  id: string;
  communityId: string;
  /** Where match alerts are posted (falls back to the recruitment log channel). */
  alertChannelId?: string;
  /** Channels where /blacklist-check posts its answer for the team. Empty = private replies anywhere. */
  lookupChannelIds: string[];
  /** Roles allowed to use /blacklist-check (Ban Members / Manage Server can always use it). */
  lookupRoleIds: string[];
  /** What happens when someone on the list by Discord ID joins. */
  onIdJoin: 'BAN' | 'KICK' | 'ALERT';
  updatedAt?: string;
}
export const blacklistSettingsRepository = new FirestoreRepository<BlacklistSettings>('blacklistSettings');

export async function getSettings(communityId: string): Promise<BlacklistSettings> {
  const s: any = await blacklistSettingsRepository.getById(communityId).catch(() => null);
  return { id: communityId, communityId, lookupChannelIds: [], lookupRoleIds: [], onIdJoin: 'BAN', ...(s || {}) };
}

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };
/** "𝐒𝐡𝐚𝐝𝐨𝐰_X" → "shadowx". */
export function norm(s: unknown): string {
  return String(s ?? '').normalize('NFKD').toLowerCase().replace(/[013457@$!]/g, (c) => LEET[c] || c).replace(/[^a-z0-9]/g, '');
}

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; }
  }
  return d[b.length];
}

export const active = (e: any) => e && e.status === 'ACTIVE' && (!e.expiresAt || Date.parse(e.expiresAt) > Date.now());
/** Every name the entry is known by, with a label for where it came from. */
export function namesOf(e: any): { kind: 'DISCORD' | 'GAME' | 'ALIAS'; value: string }[] {
  const out: { kind: 'DISCORD' | 'GAME' | 'ALIAS'; value: string }[] = [];
  for (const v of [e.discordUsername, e.displayName, e.globalName]) if (v) out.push({ kind: 'DISCORD', value: v });
  for (const v of e.gameNames || []) out.push({ kind: 'GAME', value: v });
  for (const v of e.aliases || []) out.push({ kind: 'ALIAS', value: v });
  return out.filter((x) => norm(x.value).length >= 3);
}

const cache = new Map<string, { at: number; list: any[] }>();
export function clearCache(communityId: string) { cache.delete(communityId); }
export async function entriesFor(communityId: string): Promise<any[]> {
  const hit = cache.get(communityId);
  if (hit && Date.now() - hit.at < 60_000) return hit.list;
  const list = (await blacklistEntriesRepository.listForTenant(communityId)).filter(active);
  cache.set(communityId, { at: Date.now(), list });
  return list;
}

export interface Match { entry: any; how: 'DISCORD_ID' | 'DISCORD_NAME' | 'GAME_NAME' | 'ALIAS'; matched: string; exact: boolean }

/** Checks one person (and optionally free text such as application answers) against the list. */
export async function findMatches(communityId: string, who: { userId?: string; names?: (string | undefined | null)[]; texts?: string[] }): Promise<Match[]> {
  const list = await entriesFor(communityId);
  const out: Match[] = [];
  const cand = new Set((who.names || []).map(norm).filter((x) => x.length >= 3));
  // Words and short word runs from free text, so "My IGN is Shadow X" matches "ShadowX".
  const textKeys = new Set<string>();
  for (const t of who.texts || []) {
    const words = String(t).split(/[\s,;:|/\\()[\]{}"'`]+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) for (let n = 1; n <= 3 && i + n <= words.length; n++) { const k = norm(words.slice(i, i + n).join('')); if (k.length >= 3) textKeys.add(k); }
  }
  for (const e of list) {
    if (who.userId && (e.discordUserId === who.userId || (e.linkedUserIds || []).includes(who.userId))) { out.push({ entry: e, how: 'DISCORD_ID', matched: who.userId, exact: true }); continue; }
    if (who.userId && (e.clearedUserIds || []).includes(who.userId)) continue;
    for (const n of namesOf(e)) {
      const k = norm(n.value);
      const how = n.kind === 'DISCORD' ? 'DISCORD_NAME' : n.kind === 'GAME' ? 'GAME_NAME' : 'ALIAS';
      if (cand.has(k) || textKeys.has(k)) { out.push({ entry: e, how, matched: n.value, exact: true }); break; }
    }
  }
  return out;
}

/** Search for the dashboard and /blacklist-check: exact, contains and close spellings. */
export async function search(communityId: string, q: string, includeInactive = false) {
  const list = includeInactive ? await blacklistEntriesRepository.listForTenant(communityId) : await entriesFor(communityId);
  const nq = norm(q);
  const raw = q.trim();
  const scored: { entry: any; score: number; matched: string }[] = [];
  for (const e of list) {
    if (/^\d{15,22}$/.test(raw)) { if (e.discordUserId === raw) scored.push({ entry: e, score: 100, matched: 'Discord ID' }); continue; }
    if (nq.length < 2) continue;
    let best = 0; let what = '';
    for (const n of namesOf(e)) {
      const k = norm(n.value);
      const s = k === nq ? 100 : (k.includes(nq) || nq.includes(k)) && Math.min(k.length, nq.length) >= 3 ? 70 : k.length >= 5 && lev(k, nq) <= (k.length >= 8 ? 2 : 1) ? 55 : 0;
      if (s > best) { best = s; what = `${n.kind === 'GAME' ? 'game name' : n.kind === 'ALIAS' ? 'alias' : 'Discord name'} “${n.value}”`; }
    }
    if (best) scored.push({ entry: e, score: best, matched: what });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 10);
}

const HOW: Record<Match['how'], string> = { DISCORD_ID: 'Discord ID', DISCORD_NAME: 'Discord name', GAME_NAME: 'game name', ALIAS: 'alias' };
export const entryLabel = (e: any) => e.displayName || e.discordUsername || (e.gameNames || [])[0] || (e.aliases || [])[0] || e.discordUserId || 'Unknown';

/** Posts a match alert for staff, with Ban / Kick / Not them buttons. */
const recentAlerts = new Map<string, number>();
export async function alertStaff(communityId: string, user: { id: string; tag: string; avatar?: string }, matches: Match[], context: string) {
  try {
    const key = `${matches[0]?.entry?.id}|${user.id}|${context}`;
    if (Date.now() - (recentAlerts.get(key) || 0) < 10 * 60_000) return; // no repeat alerts for 10 minutes
    recentAlerts.set(key, Date.now());
    const guild: any = await guildFor(communityId);
    if (!guild) return;
    const s = await getSettings(communityId);
    let chId = s.alertChannelId;
    if (!chId) { const { getToolkit } = await import('../toolkit/toolkitConfig.js'); const t: any = await getToolkit(communityId).catch(() => null); chId = t?.recruitment?.logChannelId || t?.recruitment?.reviewChannelId; }
    const ch: any = chId ? guild.channels.cache.get(chId) : null;
    if (!ch?.send) return;
    const m = matches[0];
    const embed = new EmbedBuilder().setColor(0xe11d48).setTitle('🚫 Blacklist match')
      .setDescription(`<@${user.id}> (**${user.tag}**, \`${user.id}\`) ${context}.`)
      .addFields(
        ...matches.slice(0, 3).map((x) => ({ name: `${x.exact && x.how === 'DISCORD_ID' ? '🔴 Same Discord account' : `🟠 Same ${HOW[x.how]}`}: ${x.matched}`.slice(0, 250), value: `On the list as **${entryLabel(x.entry)}**${x.entry.category ? ` · ${x.entry.category}` : ''}\nReason: ${String(x.entry.reason || '—').slice(0, 300)}` })),
      )
      .setFooter({ text: m.how === 'DISCORD_ID' ? 'Matched by Discord ID, so it is the same account.' : 'Matched by name only. Check before acting; press “Not them” if it is a different person.' });
    if (user.avatar) embed.setThumbnail(user.avatar);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`cm:bl:ban:${m.entry.id}|${user.id}`.slice(0, 100)).setLabel('Ban').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`cm:bl:kick:${m.entry.id}|${user.id}`.slice(0, 100)).setLabel('Kick').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cm:bl:clear:${m.entry.id}|${user.id}`.slice(0, 100)).setLabel('Not them').setStyle(ButtonStyle.Success),
    );
    await ch.send({ embeds: [embed], components: m.how === 'DISCORD_ID' ? [] : [row], allowedMentions: { parse: [] } });
  } catch (err: any) { logger.warn(`[Blacklist] alert failed: ${err?.message}`); }
}

async function noteHit(e: any) {
  await blacklistEntriesRepository.update(e.id, { hits: (e.hits || 0) + 1, lastMatchAt: new Date().toISOString() } as any).catch(() => undefined);
}

/** Someone joined the server. */
export async function onJoin(communityId: string, member: any) {
  if (member.user?.bot) return;
  const matches = await findMatches(communityId, { userId: member.id, names: [member.user?.username, member.user?.globalName, member.displayName] });
  if (!matches.length) return;
  const s = await getSettings(communityId);
  const idMatch = matches.find((m) => m.how === 'DISCORD_ID');
  const user = { id: member.id, tag: member.user?.username || member.id, avatar: member.user?.displayAvatarURL?.() };
  await noteHit(matches[0].entry);
  if (idMatch && s.onIdJoin !== 'ALERT') {
    const reason = `Blacklisted: ${String(idMatch.entry.reason || '').slice(0, 400)}`;
    const done = s.onIdJoin === 'BAN' ? await member.ban({ reason }).then(() => 'banned').catch(() => null) : await member.kick(reason).then(() => 'kicked').catch(() => null);
    await alertStaff(communityId, user, matches, done ? `joined and was **${done}** automatically` : 'joined, but the bot could not remove them (its role must be above theirs and it needs Ban/Kick Members)');
    return;
  }
  await alertStaff(communityId, user, matches, 'just joined the server');
}

/** Button presses on an alert. Returns a message for the staff member. */
export async function onAlertButton(interaction: any, action: string, arg: string) {
  const [entryId, userId] = arg.split('|');
  const perms = interaction.memberPermissions;
  const can = action === 'kick' ? perms?.has('KickMembers') : action === 'ban' ? perms?.has('BanMembers') : (perms?.has('BanMembers') || perms?.has('ManageGuild'));
  if (!can) return interaction.reply({ content: '⛔ You need Ban Members (or Kick Members for kick) to do this.', ephemeral: true });
  const entry: any = await blacklistEntriesRepository.getById(entryId).catch(() => null);
  const by = interaction.user.username;
  let text = '';
  if (action === 'clear') {
    if (entry) await blacklistEntriesRepository.update(entry.id, { clearedUserIds: Array.from(new Set([...(entry.clearedUserIds || []), userId])), updatedAt: new Date().toISOString() } as any);
    clearCache(entry?.communityId || '');
    text = `✅ Marked <@${userId}> as **not** this person by ${by}. They won’t be flagged for this entry again.`;
  } else {
    const reason = `Blacklisted (${by}): ${String(entry?.reason || '').slice(0, 400)}`;
    const ok = action === 'ban'
      ? await interaction.guild.bans.create(userId, { reason }).then(() => true).catch(() => false)
      : await interaction.guild.members.kick(userId, reason).then(() => true).catch(() => false);
    if (ok && entry && action === 'ban' && !entry.discordUserId) {
      // The name entry now has a confirmed account: remember it so future checks match by ID.
      await blacklistEntriesRepository.update(entry.id, { linkedUserIds: Array.from(new Set([...(entry.linkedUserIds || []), userId])) } as any).catch(() => undefined);
    }
    text = ok ? `${action === 'ban' ? '🔨 Banned' : '👢 Kicked'} <@${userId}> by ${by}.` : `⚠️ Could not ${action} <@${userId}>. Move the bot’s role above theirs and give it ${action === 'ban' ? 'Ban' : 'Kick'} Members.`;
  }
  await interaction.update({ components: [] }).catch(() => undefined);
  return interaction.followUp({ content: text, allowedMentions: { parse: [] } });
}

/** Used before someone applies. Throws a neutral message when they are on the list. */
export async function guardApplicant(communityId: string, user: { id: string; username?: string; globalName?: string; displayName?: string; avatar?: string }, answers: string[] = []) {
  const matches = await findMatches(communityId, { userId: user.id, names: [user.username, user.globalName, user.displayName], texts: answers });
  if (!matches.length) return;
  await noteHit(matches[0].entry);
  await alertStaff(communityId, { id: user.id, tag: user.username || user.id, avatar: user.avatar }, matches, answers.length ? 'tried to submit an application' : 'tried to apply');
  const e: any = new Error('You can’t apply to this server right now. If you think this is a mistake, please contact the server staff.');
  e.blacklisted = true;
  throw e;
}
