/** Dashboard API for the blacklist: entries by Discord ID, Discord name or game name, lookup, search and settings. */
import type { Request, Response } from 'express';
import { blacklistEntriesRepository } from '../repositories/index.js';
import { guildFor } from '../services/toolkit/toolkitConfig.js';
import { CATEGORIES, blacklistSettingsRepository, clearCache, getSettings, search, active } from '../services/blacklist/blacklistGuard.service.js';
import { discordService } from '../integrations/discord/discord.service.js';

const ok = (res: Response, data: unknown) => res.json({ success: true, data });
const fail = (res: Response, err: any, code = 400) => res.status(code).json({ success: false, error: { message: err?.message || String(err) } });
const snow = (v: unknown) => typeof v === 'string' && /^\d{15,22}$/.test(v.trim());
const list = (v: unknown, max = 10) => (Array.isArray(v) ? v : String(v || '').split(/[\n,]/)).map((x: any) => String(x).trim().slice(0, 64)).filter(Boolean).slice(0, max);
const who = (req: Request) => (req as any).user?.username || (req as any).user?.userId || 'staff';

function view(e: any) {
  const status = e.status === 'ACTIVE' && e.expiresAt && Date.parse(e.expiresAt) <= Date.now() ? 'EXPIRED' : e.status;
  return { ...e, status, kind: e.discordUserId ? 'ID' : (e.discordUsername || e.displayName) ? 'DISCORD_NAME' : 'GAME_NAME' };
}

/** Real Discord profile for an ID, or members/bans whose name matches. */
async function lookup(communityId: string, q: string) {
  const client: any = discordService.client;
  const guild: any = await guildFor(communityId);
  const out: any[] = [];
  const add = (u: any, where: string, m?: any) => {
    if (!u || out.some((x) => x.id === u.id)) return;
    out.push({ id: u.id, username: u.username, globalName: u.globalName || '', displayName: m?.displayName || u.globalName || u.username, avatarUrl: u.displayAvatarURL?.({ size: 64 }) || '', bot: !!u.bot, where, createdAt: u.createdTimestamp ? new Date(u.createdTimestamp).toISOString() : '' });
  };
  if (snow(q)) {
    const u = await client?.users?.fetch(q.trim()).catch(() => null);
    if (!u) throw new Error('No Discord account has this ID. Check the number (right-click the user → Copy User ID).');
    const m = guild ? await guild.members.fetch(u.id).catch(() => null) : null;
    const ban = guild && !m ? await guild.bans.fetch(u.id).catch(() => null) : null;
    add(u, m ? 'In this server' : ban ? 'Already banned here' : 'Not in this server', m);
    return out;
  }
  if (!guild || q.trim().length < 2) return out;
  const members = await guild.members.search({ query: q.trim().replace(/^@/, ''), limit: 8 }).catch(() => null);
  for (const m of (members?.values?.() || [])) add(m.user, 'In this server', m);
  const bans = await guild.bans.fetch({ limit: 1000 }).catch(() => null);
  const nq = q.trim().toLowerCase().replace(/^@/, '');
  for (const b of (bans?.values?.() || [])) if (out.length < 12 && (b.user.username?.toLowerCase().includes(nq) || b.user.globalName?.toLowerCase().includes(nq))) add(b.user, 'Already banned here');
  return out;
}

export async function listHandler(req: Request, res: Response) {
  try {
    const c = req.params.communityId;
    const [entries, settings] = await Promise.all([blacklistEntriesRepository.listForTenant(c), getSettings(c)]);
    ok(res, { entries: entries.map(view).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt))), settings, categories: CATEGORIES });
  } catch (err) { fail(res, err); }
}

export async function lookupHandler(req: Request, res: Response) {
  try { ok(res, await lookup(req.params.communityId, String(req.query.q || ''))); } catch (err) { fail(res, err); }
}

export async function searchHandler(req: Request, res: Response) {
  try {
    const q = String(req.query.q || '');
    ok(res, (await search(req.params.communityId, q, true)).map((r) => ({ ...r, entry: view(r.entry) })));
  } catch (err) { fail(res, err); }
}

function clean(b: any) {
  const data: any = {
    discordUserId: snow(b.discordUserId) ? String(b.discordUserId).trim() : '',
    discordUsername: String(b.discordUsername || '').trim().replace(/^@/, '').slice(0, 64),
    displayName: String(b.displayName || '').trim().slice(0, 64),
    globalName: String(b.globalName || '').trim().slice(0, 64),
    avatarUrl: /^https:\/\/cdn\.discordapp\.com\//.test(b.avatarUrl || '') ? b.avatarUrl : '',
    gameNames: list(b.gameNames), aliases: list(b.aliases),
    category: CATEGORIES.includes(b.category) ? b.category : 'Other',
    reason: String(b.reason || '').trim().slice(0, 1000),
    notes: String(b.notes || '').trim().slice(0, 2000),
    evidence: list(b.evidence, 5).filter((x) => /^https?:\/\//.test(x)),
    expiresAt: Number(b.expiresDays) > 0 ? new Date(Date.now() + Number(b.expiresDays) * 86_400_000).toISOString() : (b.keepExpiry && b.expiresAt) || null,
  };
  if (!data.discordUserId && !data.discordUsername && !data.displayName && !data.gameNames.length && !data.aliases.length) throw new Error('Add at least one way to recognise them: a Discord ID, a Discord name or a game name.');
  if (!data.reason) throw new Error('Add the reason, so the team knows why they are on the list.');
  return data;
}

async function banInDiscord(communityId: string, userId: string, reason: string) {
  const guild: any = await guildFor(communityId);
  if (!guild) return 'The bot is not connected, so the Discord ban was not done.';
  return guild.bans.create(userId, { reason: `Blacklisted: ${reason}`.slice(0, 500) }).then(() => '').catch(() => 'Saved, but the Discord ban failed: give the bot Ban Members and put its role above theirs.');
}

export async function createHandler(req: Request, res: Response) {
  try {
    const c = req.params.communityId;
    const data = clean(req.body);
    const now = new Date().toISOString();
    const id = data.discordUserId ? `${c}_${data.discordUserId}` : `${c}_n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    if (data.discordUserId) {
      const cur: any = await blacklistEntriesRepository.getById(id).catch(() => null);
      if (cur && active(cur)) throw new Error('This Discord account is already on the blacklist. Edit that entry instead.');
    }
    const entry = await blacklistEntriesRepository.create({ id, communityId: c, ...data, status: 'ACTIVE', actor: who(req), timestamp: now, createdAt: now, updatedAt: now, history: [{ at: now, by: who(req), what: 'Added' }] } as any);
    clearCache(c);
    const warn = req.body?.banInDiscord && data.discordUserId ? await banInDiscord(c, data.discordUserId, data.reason) : '';
    ok(res, { entry: view(entry), warning: warn });
  } catch (err) { fail(res, err); }
}

export async function updateHandler(req: Request, res: Response) {
  try {
    const c = req.params.communityId;
    const cur: any = await blacklistEntriesRepository.getById(req.params.entryId);
    if (!cur || cur.communityId !== c) throw new Error('Entry not found.');
    const now = new Date().toISOString();
    if (req.body?.status === 'REMOVED' || req.body?.status === 'ACTIVE') {
      const e = await blacklistEntriesRepository.update(cur.id, { status: req.body.status, updatedAt: now, history: [...(cur.history || []), { at: now, by: who(req), what: req.body.status === 'REMOVED' ? `Removed${req.body.note ? `: ${String(req.body.note).slice(0, 200)}` : ''}` : 'Restored' }] } as any);
      clearCache(c);
      let warn = '';
      if (req.body.status === 'REMOVED' && req.body.unban && cur.discordUserId) { const g: any = await guildFor(c); warn = g ? await g.bans.remove(cur.discordUserId).then(() => '').catch(() => 'Removed from the list; they were not banned in Discord (or the bot could not unban).') : ''; }
      return ok(res, { entry: view(e), warning: warn });
    }
    const data = clean({ ...req.body, keepExpiry: !('expiresDays' in (req.body || {})), expiresAt: cur.expiresAt });
    const hist = [...(cur.history || []), { at: now, by: who(req), what: 'Edited' }];
    let entry: any;
    if (data.discordUserId && data.discordUserId !== cur.discordUserId) {
      // Now known by ID: move to the ID key so every check finds it.
      const nid = `${c}_${data.discordUserId}`;
      entry = await blacklistEntriesRepository.create({ ...cur, ...data, id: nid, history: [...hist, { at: now, by: who(req), what: 'Discord ID added' }], updatedAt: now } as any);
      if (nid !== cur.id) await blacklistEntriesRepository.delete(cur.id);
    } else entry = await blacklistEntriesRepository.update(cur.id, { ...data, history: hist, updatedAt: now } as any);
    clearCache(c);
    const warn = req.body?.banInDiscord && entry.discordUserId ? await banInDiscord(c, entry.discordUserId, entry.reason) : '';
    ok(res, { entry: view(entry), warning: warn });
  } catch (err) { fail(res, err); }
}

export async function settingsHandler(req: Request, res: Response) {
  try {
    const c = req.params.communityId;
    const b = req.body || {};
    const ids = (v: unknown) => (Array.isArray(v) ? v.filter(snow) : []).slice(0, 10);
    const s = await blacklistSettingsRepository.upsert(c, { id: c, communityId: c, alertChannelId: snow(b.alertChannelId) ? b.alertChannelId : '', lookupChannelIds: ids(b.lookupChannelIds), lookupRoleIds: ids(b.lookupRoleIds), onIdJoin: ['BAN', 'KICK', 'ALERT'].includes(b.onIdJoin) ? b.onIdJoin : 'BAN', updatedAt: new Date().toISOString() } as any);
    ok(res, s);
  } catch (err) { fail(res, err); }
}
