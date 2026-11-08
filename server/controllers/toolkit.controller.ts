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
    const safe = { ...config, recruitment: { ...config.recruitment, sheetToken: undefined } };
    ok(res, { config: safe, resources });
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
    } else if (section === 'recruitment') {
      const m = b.messages || {};
      const cur = current.recruitment;
      patch = { recruitment: {
        applyEnabled: Boolean(b.applyEnabled), askRecruiterCode: Boolean(b.askRecruiterCode), dmOnReceived: Boolean(b.dmOnReceived),
        reviewChannelId: isSnowflake(b.reviewChannelId) ? b.reviewChannelId : undefined,
        announceChannelId: isSnowflake(b.announceChannelId) ? b.announceChannelId : undefined,
        pingRoleIds: ids(b.pingRoleIds), reviewerRoleIds: ids(b.reviewerRoleIds),
        logChannelId: isSnowflake(b.logChannelId) ? b.logChannelId : undefined,
        notifyRecruiter: b.notifyRecruiter !== false,
        sheetWebhookUrl: cur.sheetWebhookUrl, sheetToken: cur.sheetToken, sheetLastSync: cur.sheetLastSync,
        screening: {
          mode: b.screening?.mode === 'MANUAL' ? 'MANUAL' : 'AUTO',
          onFail: b.screening?.onFail === 'GUIDE_AND_HOLD' ? 'GUIDE_AND_HOLD' : 'GUIDE_AND_CONTINUE',
          consentText: str(b.screening?.consentText, 2000) || cur.screening.consentText,
          questions: (Array.isArray(b.screening?.questions) ? b.screening.questions : []).slice(0, 25).map((q: any) => {
            const options = (Array.isArray(q.options) ? q.options : []).slice(0, 4).map((o: any) => str(o, 80));
            return { id: key(q.id || q.question), question: str(q.question, 250), options, correct: int(q.correct, 0, 3, 0), explain: str(q.explain, 500) };
          }).filter((q: any) => q.question && q.options.length === 4 && q.options.every(Boolean)),
        },
        interview: { mode: b.interview?.mode === 'AUTO' ? 'AUTO' : 'MANUAL' },
        messages: {
          received: str(m.received, 1500) || cur.messages.received, approved: str(m.approved, 1500) || cur.messages.approved,
          rejected: str(m.rejected, 1500) || cur.messages.rejected, announce: str(m.announce, 1000) || cur.messages.announce,
          panelTitle: str(m.panelTitle, 200) || cur.messages.panelTitle, panelText: str(m.panelText, 2000) || cur.messages.panelText,
        },
      } };
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
  try {
    const list: any[] = await warningPolicy.recent(req.params.communityId);
    const guild = await guildFor(req.params.communityId);
    ok(res, list.map((w) => ({ ...w, memberName: guild?.members?.cache?.get(w.discordUserId)?.displayName || null, moderatorName: guild?.members?.cache?.get(w.moderatorId)?.displayName || null })));
  }
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

// ---------- recruitment in Discord ----------
export async function postApplyPanelHandler(req: Request, res: Response) {
  try {
    const { communityId } = req.params;
    const guild = await guildFor(communityId);
    if (!guild) throw new Error('The bot is not connected to this server right now.');
    const channel = isSnowflake(req.body?.channelId) ? guild.channels.cache.get(req.body.channelId) : null;
    if (!channel) throw new Error('Pick a channel for the Apply panel.');
    const { discordRecruitment } = await import('../services/recruitment/discordRecruitment.service.js');
    await discordRecruitment.postPanel(communityId, channel);
    ok(res, { posted: true });
  } catch (err) { fail(res, err); }
}

/** Search server members by name for pickers (no typing IDs). */
export async function searchMembersHandler(req: Request, res: Response) {
  try {
    const guild = await guildFor(req.params.communityId);
    if (!guild) return ok(res, []);
    const q = str(req.query.q, 50);
    let members: any[] = [];
    if (isSnowflake(q)) {
      const m = await guild.members.fetch(q).catch(() => null);
      members = m ? [m] : [];
    } else if (q) {
      members = Array.from((await guild.members.search({ query: q, limit: 20 }).catch(() => new Map())).values());
    } else {
      members = Array.from(guild.members.cache.values()).slice(0, 20);
    }
    ok(res, members.filter((m: any) => !m.user.bot || req.query.bots === '1').map((m: any) => ({
      id: m.id, name: m.displayName, username: m.user.username, avatar: m.user.displayAvatarURL({ size: 64 }),
    })));
  } catch (err) { fail(res, err, 500); }
}

/** Draft rules-quiz questions from the server's rules and guide (Community Brain). Not saved until the owner saves. */
export async function draftQuizHandler(req: Request, res: Response) {
  try {
    const { communityQuestionsService } = await import('../services/communityQuestions.service.js');
    const rules = (await communityQuestionsService.listGuidelines(req.params.communityId)).filter((g: any) => g.enabled !== false);
    if (!rules.length) throw new Error('Add your rules and guide first (Recruitment → Rules & guidelines), then try again.');
    const { GeminiAIProvider } = await import('../services/ai/geminiProvider.js');
    const ai = new GeminiAIProvider();
    if (!ai.isConfigured()) throw new Error('Community Brain (AI) is not configured.');
    const count = int(req.body?.count, 3, 15, 6);
    const prompt = `Write ${count} multiple-choice questions that check whether a new applicant has read and understood these Discord community rules. Each question must have exactly 4 short options, one correct. Add a one-sentence friendly explanation of the rule. Reply with JSON only: [{"question":"","options":["","","",""],"correct":0,"explain":""}]\n\nRULES:\n${rules.map((g: any) => `- ${g.title}: ${g.description}`).join('\n').slice(0, 8000)}`;
    const out = await ai.generateText(prompt, { temperature: 0.4, maxTokens: 2000 });
    const json = String(out.text || '').replace(/^[^\[]*/, '').replace(/[^\]]*$/, '');
    const arr = JSON.parse(json);
    const questions = (Array.isArray(arr) ? arr : []).slice(0, count).map((q: any, i: number) => ({
      id: `ai${Date.now().toString(36)}${i}`, question: str(q.question, 250), options: (q.options || []).slice(0, 4).map((o: any) => str(o, 80)), correct: int(q.correct, 0, 3, 0), explain: str(q.explain, 500),
    })).filter((q: any) => q.question && q.options.length === 4);
    if (!questions.length) throw new Error('Could not draft questions this time. Please try again.');
    ok(res, questions);
  } catch (err) { fail(res, err); }
}

export async function screeningThresholdHandler(req: Request, res: Response) {
  try {
    const { settingsService } = await import('../services/settings.service.js');
    const s: any = await settingsService.getConsolidatedSettings(req.params.communityId);
    ok(res, { threshold: Number(s?.recruitment?.screeningThreshold ?? 75) });
  } catch (err) { fail(res, err, 500); }
}

// ---------- Secure Setup ----------
export async function gateStatusHandler(req: Request, res: Response) {
  try {
    const { secureGate } = await import('../services/recruitment/secureGate.service.js');
    const s: any = await secureGate.status(req.params.communityId);
    const { snapshot, ...gate } = s.gate || {};
    ok(res, { ...s, gate: { ...gate, hasSnapshot: Boolean(snapshot?.length) } });
  } catch (err) { fail(res, err, 500); }
}
export async function gateLockHandler(req: Request, res: Response) {
  try {
    const { secureGate } = await import('../services/recruitment/secureGate.service.js');
    const b = req.body || {};
    await secureGate.lock(req.params.communityId, { memberRoleId: isSnowflake(b.memberRoleId) ? b.memberRoleId : undefined, createMemberRole: Boolean(b.createMemberRole), publicChannelIds: ids(b.publicChannelIds, 10), actorId: actor(req) });
    await auditService.log({ communityId: req.params.communityId, actorUserId: actor(req), actorRole: 'OWNER', action: 'SECURE_SETUP_LOCK' as any, targetType: 'guild', targetId: req.params.communityId }).catch(() => undefined);
    ok(res, { started: true });
  } catch (err) { fail(res, err); }
}
export async function gateUndoHandler(req: Request, res: Response) {
  try {
    const { secureGate } = await import('../services/recruitment/secureGate.service.js');
    const n = await secureGate.undo(req.params.communityId);
    await auditService.log({ communityId: req.params.communityId, actorUserId: actor(req), actorRole: 'OWNER', action: 'SECURE_SETUP_UNDO' as any, targetType: 'guild', targetId: req.params.communityId }).catch(() => undefined);
    ok(res, { restored: n });
  } catch (err) { fail(res, err); }
}
export async function gateConfirmHandler(req: Request, res: Response) {
  try {
    if (String(req.body?.confirmText || '').trim().toUpperCase() !== 'LOCKED') throw new Error('Type LOCKED to confirm.');
    const { secureGate } = await import('../services/recruitment/secureGate.service.js');
    await secureGate.confirm(req.params.communityId, actor(req), Boolean(req.body?.nativeApplyOff));
    ok(res, { verified: true });
  } catch (err) { fail(res, err); }
}

// ---------- Google Sheets ----------
export async function sheetScriptHandler(req: Request, res: Response) {
  try {
    const { sheetsSync, newSheetToken } = await import('../services/recruitment/sheetsSync.service.js');
    const t = await getToolkit(req.params.communityId);
    let token = t.recruitment.sheetToken;
    if (!token) { token = newSheetToken(); await saveToolkit(req.params.communityId, { recruitment: { ...t.recruitment, sheetToken: token } }); }
    ok(res, { script: sheetsSync.script(token), url: t.recruitment.sheetWebhookUrl || '', lastSync: t.recruitment.sheetLastSync || null });
  } catch (err) { fail(res, err, 500); }
}
export async function sheetConnectHandler(req: Request, res: Response) {
  try {
    const { sheetsSync, isSheetUrl } = await import('../services/recruitment/sheetsSync.service.js');
    const url = String(req.body?.url || '').trim();
    if (url && !isSheetUrl(url)) throw new Error('Paste the Web app URL from Apps Script. It looks like https://script.google.com/macros/s/…/exec');
    const t = await getToolkit(req.params.communityId);
    await saveToolkit(req.params.communityId, { recruitment: { ...t.recruitment, sheetWebhookUrl: url || undefined } });
    if (!url) return ok(res, { connected: false });
    const rows = await sheetsSync.resync(req.params.communityId);
    ok(res, { connected: true, rows });
  } catch (err) { fail(res, err); }
}
export async function sheetResyncHandler(req: Request, res: Response) {
  try {
    const { sheetsSync } = await import('../services/recruitment/sheetsSync.service.js');
    ok(res, { rows: await sheetsSync.resync(req.params.communityId) });
  } catch (err) { fail(res, err); }
}

export async function provisionWorkspaceHandler(req: Request, res: Response) {
  try {
    const { workspace } = await import('../services/serverWorkspace.service.js');
    ok(res, await workspace.provision(req.params.communityId));
  } catch (err) { fail(res, err); }
}
