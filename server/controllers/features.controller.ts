/**
 * Dashboard API for community features: levels, giveaways, button roles, verification,
 * server logs, starboard, birthdays and custom commands.
 */
import { Request, Response } from 'express';
import { getFeatures, saveFeatures, FeaturesConfig } from '../services/features/featuresConfig.js';
import { levels } from '../services/features/levels.service.js';
import { birthdays, giveaways, buttonRoles, buttonRolePanelsRepository, verification } from '../services/features/community.service.js';
import { guildFor, isSnowflake } from '../services/toolkit/toolkitConfig.js';
import { auditService } from '../services/audit.service.js';

const actor = (req: Request) => String((req as any).user?.userId || 'unknown');
const fail = (res: Response, err: any, code = 400) => res.status(code).json({ success: false, error: { message: err?.message || String(err) } });
const ok = (res: Response, data: unknown) => res.json({ success: true, data });
const ids = (v: unknown, max = 25) => (Array.isArray(v) ? v.filter(isSnowflake).slice(0, max) : []);
const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const int = (v: unknown, min: number, max: number, def: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const snow = (v: unknown) => (isSnowflake(v) ? v : undefined);
const bool = (v: unknown) => Boolean(v);

async function channel(communityId: string, channelId: unknown) {
  const guild = await guildFor(communityId);
  if (!guild) throw new Error('The bot is not connected to this server right now.');
  const ch = isSnowflake(channelId) ? guild.channels.cache.get(channelId) : null;
  if (!ch) throw new Error('Pick a channel.');
  return ch;
}

export async function getFeaturesHandler(req: Request, res: Response) {
  try { ok(res, await getFeatures(req.params.communityId, true)); } catch (err) { fail(res, err, 500); }
}

export async function saveFeatureSectionHandler(req: Request, res: Response) {
  try {
    const { communityId, section } = req.params;
    const b = req.body || {};
    const cur = await getFeatures(communityId, true);
    let patch: Partial<FeaturesConfig>;
    if (section === 'levels') {
      const minXp = int(b.minXp, 1, 500, 15);
      patch = { levels: {
        enabled: bool(b.enabled), minXp, maxXp: Math.max(minXp, int(b.maxXp, 1, 500, 25)), cooldownSeconds: int(b.cooldownSeconds, 0, 3600, 60),
        announce: ['SAME_CHANNEL', 'CHANNEL', 'DM', 'OFF'].includes(b.announce) ? b.announce : 'SAME_CHANNEL', channelId: snow(b.channelId),
        message: str(b.message, 500) || cur.levels.message, noXpChannelIds: ids(b.noXpChannelIds, 100), noXpRoleIds: ids(b.noXpRoleIds, 50),
        rewards: (Array.isArray(b.rewards) ? b.rewards : []).filter((r: any) => isSnowflake(r?.roleId)).slice(0, 50).map((r: any) => ({ level: int(r.level, 1, 500, 5), roleId: r.roleId })).sort((x: any, y: any) => x.level - y.level),
        keepOldRewards: b.keepOldRewards !== false,
      } };
    } else if (section === 'logs') {
      const e = b.events || {};
      patch = { logs: { enabled: bool(b.enabled), channelId: snow(b.channelId), events: {
        memberJoin: bool(e.memberJoin), memberLeave: bool(e.memberLeave), messageDelete: bool(e.messageDelete), messageEdit: bool(e.messageEdit),
        roleChange: bool(e.roleChange), nicknameChange: bool(e.nicknameChange), moderation: bool(e.moderation),
      } } };
    } else if (section === 'starboard') {
      patch = { starboard: { enabled: bool(b.enabled), channelId: snow(b.channelId), emoji: str(b.emoji, 64) || '⭐', threshold: int(b.threshold, 1, 100, 3), allowSelfStar: bool(b.allowSelfStar) } };
    } else if (section === 'birthdays') {
      const tz = str(b.timezone, 60) || 'Asia/Kolkata';
      try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { throw new Error('Unknown time zone.'); }
      patch = { birthdays: { ...cur.birthdays, enabled: bool(b.enabled), channelId: snow(b.channelId), roleId: snow(b.roleId), message: str(b.message, 500) || cur.birthdays.message, hour: int(b.hour, 0, 23, 9), timezone: tz } };
    } else if (section === 'verification') {
      patch = { verification: { enabled: bool(b.enabled), roleId: snow(b.roleId), removeRoleId: snow(b.removeRoleId), mode: b.mode === 'MATH' ? 'MATH' : 'BUTTON', message: str(b.message, 1000) || cur.verification.message } };
    } else if (section === 'customCommands') {
      const seen = new Set<string>();
      const commands = (Array.isArray(b.commands) ? b.commands : []).slice(0, 100).map((c: any) => ({
        name: str(c.name, 32).toLowerCase().replace(/[^a-z0-9_-]/g, ''), response: str(c.response, 2000), embed: bool(c.embed), deleteTrigger: bool(c.deleteTrigger),
      })).filter((c: any) => c.name && c.response && !seen.has(c.name) && seen.add(c.name));
      patch = { customCommands: { enabled: bool(b.enabled), prefix: str(b.prefix, 3) || '!', commands } };
    } else {
      return fail(res, 'Unknown section', 404);
    }
    const saved = await saveFeatures(communityId, patch);
    await auditService.log({ communityId, actorUserId: actor(req), actorRole: 'CONTROLLER', action: 'FEATURE_SETTINGS_UPDATED' as any, targetType: 'features', targetId: section }).catch(() => undefined);
    ok(res, saved);
  } catch (err) { fail(res, err); }
}

// ---------- levels ----------
export async function leaderboardHandler(req: Request, res: Response) {
  try { ok(res, await levels.leaderboard(req.params.communityId, 100)); } catch (err) { fail(res, err, 500); }
}
export async function setXpHandler(req: Request, res: Response) {
  try {
    if (!isSnowflake(req.body?.userId)) throw new Error('Enter a Discord user ID.');
    ok(res, await levels.setXp(req.params.communityId, req.body.userId, str(req.body.username, 80) || req.body.userId, int(req.body.xp, 0, 10_000_000, 0)));
  } catch (err) { fail(res, err); }
}

// ---------- verification ----------
export async function postVerifyPanelHandler(req: Request, res: Response) {
  try { await verification.postPanel(req.params.communityId, await channel(req.params.communityId, req.body?.channelId)); ok(res, { posted: true }); }
  catch (err) { fail(res, err); }
}

// ---------- birthdays ----------
export async function listBirthdaysHandler(req: Request, res: Response) {
  try { ok(res, await birthdays.list(req.params.communityId)); } catch (err) { fail(res, err, 500); }
}

// ---------- button roles ----------
export async function listPanelsHandler(req: Request, res: Response) {
  try { ok(res, await buttonRolePanelsRepository.list({ where: [{ field: 'communityId', operator: '==', value: req.params.communityId }] })); }
  catch (err) { fail(res, err, 500); }
}
export async function savePanelHandler(req: Request, res: Response) {
  try {
    const { communityId } = req.params;
    const b = req.body || {};
    const buttons = (Array.isArray(b.buttons) ? b.buttons : []).filter((x: any) => isSnowflake(x?.roleId)).slice(0, 25).map((x: any) => ({ roleId: x.roleId, label: str(x.label, 80) || 'Role', emoji: str(x.emoji, 64) || undefined }));
    if (!buttons.length) throw new Error('Add at least one role button.');
    const data = { communityId, title: str(b.title, 200) || 'Pick your roles', description: str(b.description, 2000), mode: b.mode === 'ONE_ONLY' ? 'ONE_ONLY' : 'TOGGLE', buttons };
    let panel: any;
    if (b.id) {
      const existing = await buttonRolePanelsRepository.getById(String(b.id)).catch(() => null);
      if (!existing || existing.communityId !== communityId) throw new Error('Panel not found.');
      panel = await buttonRolePanelsRepository.update(existing.id, data as any);
    } else {
      panel = await buttonRolePanelsRepository.create({ ...data, createdAt: new Date().toISOString() } as any);
    }
    if (isSnowflake(b.channelId)) panel = await buttonRoles.post(panel, await channel(communityId, b.channelId));
    ok(res, panel);
  } catch (err) { fail(res, err); }
}
export async function deletePanelHandler(req: Request, res: Response) {
  try {
    const p = await buttonRolePanelsRepository.getById(req.params.panelId).catch(() => null);
    if (!p || p.communityId !== req.params.communityId) throw new Error('Panel not found.');
    await buttonRolePanelsRepository.delete(p.id);
    ok(res, { deleted: true });
  } catch (err) { fail(res, err); }
}

// ---------- giveaways ----------
export async function listGiveawaysHandler(req: Request, res: Response) {
  try { ok(res, await giveaways.list(req.params.communityId)); } catch (err) { fail(res, err, 500); }
}
export async function startGiveawayHandler(req: Request, res: Response) {
  try {
    const b = req.body || {};
    ok(res, await giveaways.start({
      communityId: req.params.communityId, channel: await channel(req.params.communityId, b.channelId), prize: str(b.prize, 200), description: str(b.description, 1000) || undefined,
      winners: int(b.winners, 1, 20, 1), durationMinutes: int(b.durationMinutes, 1, 43200, 60), hostId: actor(req).replace(/^usr_/, ''), requiredRoleId: snow(b.requiredRoleId),
    }));
  } catch (err) { fail(res, err); }
}
async function ownGiveaway(req: Request) {
  const list = await giveaways.list(req.params.communityId);
  const g = list.find((x) => x.id === req.params.giveawayId);
  if (!g) throw new Error('Giveaway not found.');
  return g;
}
export async function endGiveawayHandler(req: Request, res: Response) {
  try { const g = await ownGiveaway(req); ok(res, await giveaways.end(g.id, req.query.reroll === '1')); } catch (err) { fail(res, err); }
}
export async function cancelGiveawayHandler(req: Request, res: Response) {
  try { const g = await ownGiveaway(req); ok(res, await giveaways.cancel(g.id)); } catch (err) { fail(res, err); }
}
