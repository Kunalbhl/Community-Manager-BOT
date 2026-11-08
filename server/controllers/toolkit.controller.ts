/**
 * Dashboard API for the server toolkit: tickets, warning policy, recruitment role rules,
 * review rooms (temporary voice + escalation) and bulk tools.
 */
import { Request, Response } from 'express';
import { getToolkit, saveToolkit, guildFor, isSnowflake, ToolkitConfig } from '../services/toolkit/toolkitConfig.js';
import { ticketService } from '../services/toolkit/tickets.service.js';
import { warningPolicy } from '../services/toolkit/warningPolicy.service.js';
import { bulkTools, BulkAction } from '../services/toolkit/bulk.service.js';
import { reviewRooms } from '../services/toolkit/reviewRooms.service.js';
import { auditService } from '../services/audit.service.js';

const actor = (req: Request) => String((req as any).user?.userId || 'unknown');
const fail = (res: Response, err: any, code = 400) => res.status(code).json({ success: false, error: { message: err?.message || String(err) } });
const ok = (res: Response, data: unknown) => res.json({ success: true, data });

const ids = (v: unknown, max = 25) => (Array.isArray(v) ? v.filter(isSnowflake).slice(0, max) : []);
const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const int = (v: unknown, min: number, max: number, def: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const key = (v: unknown) => str(v, 32).toLowerCase().replace(/[^a-z0-9_-]/g, '') || `k${Math.random().toString(36).slice(2, 7)}`;

/** Server roles + channels for the pickers. */
async function guildResources(communityId: string) {
  const guild = await guildFor(communityId);
  if (!guild) return { connected: false, roles: [], textChannels: [], categories: [] };
  const roles = Array.from(guild.roles.cache.values())
    .filter((r: any) => r.id !== guild.id && !r.managed)
    .sort((a: any, b: any) => b.position - a.position)
    .map((r: any) => ({ id: r.id, name: r.name, color: r.hexColor }));
  const chans = Array.from(guild.channels.cache.values()) as any[];
  return {
    connected: true,
    roles,
    textChannels: chans.filter((c) => c.type === 0 || c.type === 5).sort((a, b) => a.rawPosition - b.rawPosition).map((c) => ({ id: c.id, name: c.name })),
    categories: chans.filter((c) => c.type === 4).sort((a, b) => a.rawPosition - b.rawPosition).map((c) => ({ id: c.id, name: c.name })),
  };
}

export async function getToolkitHandler(req: Request, res: Response) {
  try {
    const { communityId } = req.params;
    const [config, resources] = await Promise.all([getToolkit(communityId), guildResources(communityId)]);
    ok(res, { config, resources });
  } catch (err) { fail(res, err, 500); }
}

/** Validates and saves one section of the toolkit settings. */
export async function saveToolkitSectionHandler(req: Request, res: Response) {
  try {
    const { communityId, section } = req.params;
    const b = req.body || {};
    const current = await getToolkit(communityId);
    let patch: Partial<ToolkitConfig>;

    if (section === 'tickets') {
      patch = { tickets: {
        ...current.tickets,
        enabled: Boolean(b.enabled),
        categoryId: isSnowflake(b.categoryId) ? b.categoryId : undefined,
        logChannelId: isSnowflake(b.logChannelId) ? b.logChannelId : undefined,
        staffRoleIds: ids(b.staffRoleIds),
        types: (Array.isArray(b.types) ? b.types : []).slice(0, 25).map((t: any) => ({
          key: key(t.key || t.label), label: str(t.label, 80) || 'Ticket', emoji: str(t.emoji, 8) || '🎫',
          description: str(t.description, 100), staffRoleIds: ids(t.staffRoleIds),
        })),
      } };
      if (!patch.tickets!.types.length) throw new Error('Add at least one ticket type.');
    } else if (section === 'warnings') {
      const reasons = (Array.isArray(b.reasons) ? b.reasons : []).slice(0, 25).map((r: any) => ({ key: key(r.key || r.label), label: str(r.label, 80) || 'Rule violation', points: int(r.points, 1, 20, 1) }));
      const thresholds = (Array.isArray(b.thresholds) ? b.thresholds : []).slice(0, 10).map((t: any) => {
        const action = ['TIMEOUT', 'KICK', 'BAN'].includes(t.action) ? t.action : 'TIMEOUT';
        return { points: int(t.points, 1, 100, 3), action, ...(action === 'TIMEOUT' ? { durationMinutes: int(t.durationMinutes, 1, 40320, 60) } : {}) };
      }).sort((x: any, y: any) => x.points - y.points);
      if (!reasons.length) throw new Error('Add at least one warning reason.');
      patch = { warnings: { enabled: Boolean(b.enabled), expiryDays: int(b.expiryDays, 1, 365, 30), dmMember: Boolean(b.dmMember), reasons, thresholds } };
    } else if (section === 'roleRules') {
      const types = ['ALWAYS', 'ANSWER_CONTAINS', 'RECRUITER_CODE', 'ANY_RECRUITER_CODE', 'SOURCE'];
      const rules = (Array.isArray(b.rules) ? b.rules : []).slice(0, 50).map((r: any) => {
        const t = types.includes(r?.condition?.type) ? r.condition.type : 'ALWAYS';
        const condition: any = { type: t };
        if (t === 'ANSWER_CONTAINS') { condition.question = str(r.condition.question, 120); condition.value = str(r.condition.value, 120); }
        if (t === 'RECRUITER_CODE') condition.code = str(r.condition.code, 40);
        if (t === 'SOURCE') condition.source = str(r.condition.source, 40);
        return { id: key(r.id || r.name), name: str(r.name, 80) || 'Rule', enabled: r.enabled !== false, condition, addRoleIds: ids(r.addRoleIds), removeRoleIds: ids(r.removeRoleIds) };
      });
      patch = { roleRules: { enabled: Boolean(b.enabled), rules } };
    } else if (section === 'reviewRooms') {
      const tiers = (Array.isArray(b.tiers) ? b.tiers : []).slice(0, 6).map((t: any) => ({ name: str(t.name, 40) || 'Reviewers', roleIds: ids(t.roleIds) }));
      if (!tiers.length) throw new Error('Add at least one reviewer rank.');
      patch = { reviewRooms: { enabled: Boolean(b.enabled), categoryId: isSnowflake(b.categoryId) ? b.categoryId : undefined, applicantCanSee: Boolean(b.applicantCanSee), tiers, deleteAfterHours: int(b.deleteAfterHours, 1, 720, 24) } };
    } else {
      return fail(res, 'Unknown section', 404);
    }

    const saved = await saveToolkit(communityId, patch);
    await auditService.log({ communityId, actorUserId: actor(req), actorRole: 'CONTROLLER', action: 'TOOLKIT_SETTINGS_UPDATED' as any, targetType: 'toolkit', targetId: section }).catch(() => undefined);
    ok(res, saved);
  } catch (err) { fail(res, err); }
}

// ---------- tickets ----------
export async function postTicketPanelHandler(req: Request, res: Response) {
  try {
    const { communityId } = req.params;
    const guild = await guildFor(communityId);
    if (!guild) throw new Error('The bot is not connected to this server right now.');
    const channel = isSnowflake(req.body?.channelId) ? guild.channels.cache.get(req.body.channelId) : null;
    if (!channel) throw new Error('Pick a channel for the ticket panel.');
    await ticketService.postPanel(communityId, channel);
    ok(res, { posted: true });
  } catch (err) { fail(res, err); }
}

export async function listTicketsHandler(req: Request, res: Response) {
  try { ok(res, await ticketService.list(req.params.communityId, req.query.status ? String(req.query.status) : undefined)); }
  catch (err) { fail(res, err, 500); }
}

export async function closeTicketHandler(req: Request, res: Response) {
  try {
    const guild = await guildFor(req.params.communityId);
    const t = await ticketService.close(req.params.ticketId, { id: actor(req).replace(/^usr_/, ''), username: 'dashboard' }, str(req.body?.reason, 200) || 'Closed from dashboard', guild);
    ok(res, t);
  } catch (err) { fail(res, err); }
}

// ---------- warnings ----------
export async function listWarningsHandler(req: Request, res: Response) {
  try { ok(res, await warningPolicy.recent(req.params.communityId)); }
  catch (err) { fail(res, err, 500); }
}

export async function issueWarningHandler(req: Request, res: Response) {
  try {
    const b = req.body || {};
    if (!isSnowflake(b.discordUserId)) throw new Error('Enter the member’s Discord user ID.');
    const result = await warningPolicy.warn({ communityId: req.params.communityId, discordUserId: b.discordUserId, reasonKey: str(b.reasonKey, 32), note: str(b.note, 300) || undefined, moderatorId: actor(req).replace(/^usr_/, '') });
    ok(res, result);
  } catch (err) { fail(res, err); }
}

export async function revokeWarningHandler(req: Request, res: Response) {
  try { ok(res, await warningPolicy.revoke(req.params.communityId, req.params.strikeId)); }
  catch (err) { fail(res, err); }
}

// ---------- review rooms ----------
export async function listReviewRoomsHandler(req: Request, res: Response) {
  try { ok(res, await reviewRooms.list(req.params.communityId)); }
  catch (err) { fail(res, err, 500); }
}

// ---------- bulk ----------
const BULK: BulkAction[] = ['ADD_ROLE', 'REMOVE_ROLE', 'DM_MEMBERS', 'CHANNEL_MESSAGE', 'NICKNAME_RESET', 'PURGE_MESSAGES', 'KICK_MEMBERS'];

function audienceOf(b: any) {
  const a = b?.audience || {};
  const modes = ['ALL', 'HAS_ROLE', 'MISSING_ROLE', 'JOINED_WITHIN_DAYS', 'JOINED_BEFORE_DAYS', 'USER_IDS'];
  return {
    mode: modes.includes(a.mode) ? a.mode : 'ALL',
    roleId: isSnowflake(a.roleId) ? a.roleId : undefined,
    days: int(a.days, 1, 3650, 7),
    userIds: ids(a.userIds, 1000),
    includeBots: Boolean(a.includeBots),
  };
}

export async function bulkPreviewHandler(req: Request, res: Response) {
  try { ok(res, await bulkTools.preview(req.params.communityId, audienceOf(req.body) as any)); }
  catch (err) { fail(res, err); }
}

export async function bulkStartHandler(req: Request, res: Response) {
  try {
    const b = req.body || {};
    const action = BULK.includes(b.action) ? (b.action as BulkAction) : null;
    if (!action) throw new Error('Pick an action.');
    if (action === 'KICK_MEMBERS' && b.confirm !== 'KICK') throw new Error('Type KICK to confirm.');
    const params = {
      roleId: isSnowflake(b.roleId) ? b.roleId : undefined,
      message: b.message ? str(b.message, 2000) : undefined,
      channelIds: ids(b.channelIds),
      count: int(b.count, 1, 100, 50),
      fromUserId: isSnowflake(b.fromUserId) ? b.fromUserId : undefined,
      reason: str(b.reason, 200) || undefined,
    };
    const needsAudience = !['CHANNEL_MESSAGE', 'PURGE_MESSAGES'].includes(action);
    ok(res, await bulkTools.start(req.params.communityId, actor(req), action, params, needsAudience ? (audienceOf(b) as any) : undefined));
  } catch (err) { fail(res, err); }
}

export async function bulkListHandler(req: Request, res: Response) {
  try { ok(res, await bulkTools.list(req.params.communityId)); }
  catch (err) { fail(res, err, 500); }
}

export async function bulkCancelHandler(req: Request, res: Response) {
  try { bulkTools.cancel(req.params.jobId); ok(res, { cancelled: true }); }
  catch (err) { fail(res, err); }
}
