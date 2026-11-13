/**
 * Dashboard API for the server toolkit: tickets, warning policy, recruitment role rules,
 * review rooms (temporary voice + escalation) and bulk tools.
 */
import { Request, Response } from 'express';
import { getToolkit, saveToolkit, guildFor, isSnowflake, ToolkitConfig } from '../services/toolkit/toolkitConfig.js';
import { buildCode } from '../../shared/utils/nameWords.js';
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
const url = (v: unknown) => { const x = str(v, 500); return /^https:\/\/\S+$/i.test(x) ? x : ''; };
function cleanPanel(p: any, cur: any): any {
  const e = p?.embed || {};
  return {
    style: p?.style === 'BUTTONS' ? 'BUTTONS' : 'DROPDOWN',
    placeholder: str(p?.placeholder, 100) || 'Choose what you need help with',
    content: str(p?.content, 2000),
    pingStaff: p?.pingStaff !== false,
    embed: {
      title: str(e.title, 256), description: str(e.description, 4000), color: /^#[0-9a-f]{6}$/i.test(e.color || '') ? e.color : '#7c8cff', url: url(e.url),
      authorName: str(e.authorName, 256), authorIcon: url(e.authorIcon), thumbnail: url(e.thumbnail), image: url(e.image),
      footerText: str(e.footerText, 2048), footerIcon: url(e.footerIcon), timestamp: !!e.timestamp, listTypes: e.listTypes !== false,
    },
    channelId: cur?.channelId, messageId: cur?.messageId,
  };
}
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
    voiceChannels: chans.filter((c) => c.type === 2 || c.type === 13).sort((a, b) => a.rawPosition - b.rawPosition).map((c) => ({ id: c.id, name: c.name })),
    emojis: (() => { try { return Array.from(guild.emojis.cache.values()).filter((e: any) => e.available !== false).map((e: any) => ({ id: e.id, name: e.name, animated: !!e.animated, url: e.imageURL({ size: 64 }) })); } catch { return []; } })(),
    botNickname: guild.members.me?.nickname || '',
    botName: guild.members.me?.user?.username || '',
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
          key: key(t.key || t.label), label: str(t.label, 80) || 'Ticket', emoji: str(t.emoji, 32) || '🎫',
          description: str(t.description, 100), staffRoleIds: ids(t.staffRoleIds),
          buttonStyle: ['PRIMARY', 'SECONDARY', 'SUCCESS', 'DANGER'].includes(t.buttonStyle) ? t.buttonStyle : 'SECONDARY',
          pingRoleIds: ids(t.pingRoleIds), pingUserIds: ids(t.pingUserIds),
          welcomeTitle: str(t.welcomeTitle, 256), welcomeMessage: str(t.welcomeMessage, 2000),
        })),
        panel: cleanPanel(b.panel, current.tickets.panel),
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
      patch = { reviewRooms: { enabled: Boolean(b.enabled), categoryId: isSnowflake(b.categoryId) ? b.categoryId : undefined, applicantCanSee: Boolean(b.applicantCanSee), tiers, deleteAfterHours: int(b.deleteAfterHours, 1, 720, 24), specialMemberIds: ids(b.specialMemberIds, 25) } };
    } else if (section === 'recruitment') {
      const m = b.messages || {};
      const cur = current.recruitment;
      patch = { recruitment: {
        ...cur, // keep settings this form doesn't edit (code series, sheet access, etc.)
        applyEnabled: Boolean(b.applyEnabled), askRecruiterCode: Boolean(b.askRecruiterCode), dmOnReceived: Boolean(b.dmOnReceived),
        codeRequired: b.codeRequired !== undefined ? Boolean(b.codeRequired) : (cur as any).codeRequired,
        reviewChannelId: isSnowflake(b.reviewChannelId) ? b.reviewChannelId : undefined,
        announceChannelId: isSnowflake(b.announceChannelId) ? b.announceChannelId : undefined,
        pingRoleIds: ids(b.pingRoleIds), reviewerRoleIds: ids(b.reviewerRoleIds),
        logChannelId: isSnowflake(b.logChannelId) ? b.logChannelId : undefined,
        notifyRecruiter: b.notifyRecruiter !== false,
        sheetWebhookUrl: cur.sheetWebhookUrl, sheetToken: cur.sheetToken, sheetLastSync: cur.sheetLastSync, panelPostedAt: (cur as any).panelPostedAt,
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
    const r = await ticketService.postPanel(communityId, channel, req.body?.mode === 'NEW');
    ok(res, { posted: true, ...r });
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
    if (!rules.length) throw new Error('Add your server rules first (Server tools → Recruitment → Server rules, just above the quiz), then try again.');
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
  } catch (err: any) {
    const m = String(err?.message || err);
    if (/402|429|RESOURCE_EXHAUSTED|prepay|credits|quota|billing/i.test(m)) return fail(res, new Error('AI drafting is unavailable right now: the Google AI key on the bot server has no credit or quota left. You can still add questions yourself with "Add question".'));
    if (/api key|not configured|API_KEY_INVALID|permission/i.test(m)) return fail(res, new Error('AI drafting is not set up on the bot server. You can still add questions yourself with "Add question".'));
    fail(res, err);
  }
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
    {
      const { getGate } = await import('../services/recruitment/secureGate.service.js');
      const g0: any = await getGate(req.params.communityId);
      if (b.memberRoleId && b.memberRoleId === g0.applicantRoleId) throw new Error('The Member role must be different from the Applicant role (Applicant is what newcomers get before approval).');
      const t0: any = await getToolkit(req.params.communityId);
      const staff = [t0.recruitment.reviewChannelId, t0.recruitment.logChannelId].filter(Boolean);
      if (ids(b.publicChannelIds, 10).some((id: string) => staff.includes(id))) throw new Error('Staff channels (applications, recruitment log) can’t be public.');
    }
    await secureGate.lock(req.params.communityId, { memberRoleId: isSnowflake(b.memberRoleId) ? b.memberRoleId : undefined, createMemberRole: Boolean(b.createMemberRole), publicChannelIds: ids(b.publicChannelIds, 10), actorId: actor(req) });
    await auditService.log({ communityId: req.params.communityId, actorUserId: actor(req), actorRole: 'OWNER', action: 'SECURE_SETUP_LOCK' as any, targetType: 'guild', targetId: req.params.communityId }).catch(() => undefined);
    ok(res, { started: true });
  } catch (err) { fail(res, err); }
}
export async function gateDiagnoseHandler(req: Request, res: Response) {
  try { const { secureGate } = await import('../services/recruitment/secureGate.service.js'); ok(res, await secureGate.diagnose(req.params.communityId)); } catch (err) { fail(res, err); }
}
export async function gateRepairHandler(req: Request, res: Response) {
  try {
    if (!isSnowflake(req.body?.memberRoleId)) throw new Error('Choose the role approved members get.');
    const { secureGate } = await import('../services/recruitment/secureGate.service.js');
    const r = await secureGate.repairRoles(req.params.communityId, { memberRoleId: req.body.memberRoleId, actorId: actor(req) });
    await auditService.log({ communityId: req.params.communityId, actorUserId: actor(req), actorRole: 'OWNER', action: 'SECURE_SETUP_REPAIR' as any, targetType: 'guild', targetId: req.params.communityId }).catch(() => undefined);
    ok(res, r);
  } catch (err) { fail(res, err); }
}
export async function gateRolesHandler(req: Request, res: Response) {
  try {
    const b = req.body || {};
    const { secureGate } = await import('../services/recruitment/secureGate.service.js');
    const g: any = await secureGate.setRoles(req.params.communityId, { applicantRoleId: String(b.applicantRoleId || ''), memberRoleId: String(b.memberRoleId || ''), approvedExtraRoleIds: ids(b.approvedExtraRoleIds, 10) });
    ok(res, { applicantRoleId: g.applicantRoleId, memberRoleId: g.memberRoleId, approvedExtraRoleIds: g.approvedExtraRoleIds || [] });
  } catch (err) { fail(res, err); }
}
export async function gateAccessHandler(req: Request, res: Response) {
  try { const { secureGate } = await import('../services/recruitment/secureGate.service.js'); ok(res, await secureGate.access(req.params.communityId, isSnowflake(req.query.roleId) ? String(req.query.roleId) : undefined)); } catch (err) { fail(res, err); }
}
export async function gateGameAccessHandler(req: Request, res: Response) {
  try { const { secureGate } = await import('../services/recruitment/secureGate.service.js'); ok(res, await secureGate.gameAccess(req.params.communityId, req.body?.apply !== true)); } catch (err) { fail(res, err); }
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
    ok(res, { script: sheetsSync.script(token), url: t.recruitment.sheetWebhookUrl || '', viewUrl: t.recruitment.sheetViewUrl || '', roleIds: t.recruitment.sheetRoleIds || [], lastSync: t.recruitment.sheetLastSync || null });
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

/** Server rules used for the consent step and the rules quiz. */
export async function listRulesHandler(req: Request, res: Response) {
  try {
    const { communityQuestionsService } = await import('../services/communityQuestions.service.js');
    ok(res, await communityQuestionsService.listGuidelines(req.params.communityId));
  } catch (err) { fail(res, err, 500); }
}
export async function addRuleHandler(req: Request, res: Response) {
  try {
    const { communityQuestionsService } = await import('../services/communityQuestions.service.js');
    const list = await communityQuestionsService.listGuidelines(req.params.communityId);
    ok(res, await communityQuestionsService.addGuideline(req.params.communityId, {
      title: str(req.body?.title, 120), description: str(req.body?.description, 1000), category: 'RULE', order: list.length + 1,
    }));
  } catch (err) { fail(res, err); }
}
export async function deleteRuleHandler(req: Request, res: Response) {
  try {
    const { communityGuidelinesRepository } = await import('../repositories/index.js');
    const g: any = await communityGuidelinesRepository.findById(req.params.ruleId);
    if (!g || g.communityId !== req.params.communityId) throw new Error('Rule not found.');
    await communityGuidelinesRepository.delete(g.id);
    ok(res, { deleted: true });
  } catch (err) { fail(res, err); }
}
/** Import rules from the server's Discord rules channel (or a picked channel): one rule per line/message. */
export async function importRulesHandler(req: Request, res: Response) {
  try {
    const communityId = req.params.communityId;
    const guild: any = await guildFor(communityId);
    if (!guild) throw new Error('The bot is not connected to this server.');
    const wanted: string[] = (Array.isArray(req.body?.channelIds) ? req.body.channelIds : [req.body?.channelId]).filter(isSnowflake).slice(0, 10);
    const chans: any[] = wanted.length ? wanted.map((id) => guild.channels.cache.get(id)).filter(Boolean) : [guild.rulesChannel].filter(Boolean);
    if (!chans.length) throw new Error('No rules channel found. Pick the channel that has your rules.');
    const compText = (c: any): string[] => [c?.content, c?.data?.content, ...((c?.components || []).flatMap(compText))].filter((x) => typeof x === 'string');
    const lines: string[] = []; let msgCount = 0; const problems: string[] = [];
    for (const ch of chans) {
      if (!ch?.messages) { problems.push(`#${ch?.name} is not a text channel`); continue; }
      let msgs: any[] = [];
      try { msgs = Array.from((await ch.messages.fetch({ limit: 50 })).values()).reverse() as any[]; }
      catch { problems.push(`the bot can't read #${ch.name} (give it View Channel and Read Message History there)`); continue; }
      msgCount += msgs.length;
      const text = msgs.map((m) => [m.content, ...m.embeds.map((e: any) => [e.title, e.description, ...(e.fields || []).map((f: any) => `${f.name}: ${f.value}`)].filter(Boolean).join('\n')), ...(m.components || []).flatMap(compText)].filter(Boolean).join('\n')).join('\n');
      for (const raw of text.split('\n')) {
        const l = raw.replace(/<a?:\w+:\d+>/g, '').replace(/^[\s>*_#`~|•\-–\d.)]+/, '').replace(/[*_`~]/g, '').trim();
        if (l.length < 6) continue;
        if (l.length <= 300) lines.push(l);
        else lines.push(...(l.match(/[^.!?]+[.!?]?/g) || []).map((x) => x.trim()).filter((x) => x.length >= 6 && x.length <= 300));
      }
    }
    const names = chans.map((c) => '#' + c.name).join(', ');
    if (!lines.length) throw new Error(problems.length ? `Couldn't import: ${problems.join('; ')}.` : msgCount ? `${names} has ${msgCount} message${msgCount === 1 ? '' : 's'} but no readable text (rules posted as images can't be read). Type them in the box instead.` : `${names} has no messages yet.`);
    const { communityQuestionsService } = await import('../services/communityQuestions.service.js');
    const existing = new Set((await communityQuestionsService.listGuidelines(communityId)).map((g: any) => g.title.toLowerCase()));
    let n = 0;
    for (const l of lines.slice(0, 40)) {
      const title = l.slice(0, 120);
      if (existing.has(title.toLowerCase())) continue;
      existing.add(title.toLowerCase());
      await communityQuestionsService.addGuideline(communityId, { title, description: l.length > 120 ? l : '', category: 'RULE', order: existing.size + ++n });
    }
    ok(res, { added: n, channel: names.replace(/^#/, ''), skipped: problems });
  } catch (err) { fail(res, err); }
}

/** Who may open the sheet from Discord (/sheet). */
export async function sheetAccessHandler(req: Request, res: Response) {
  try {
    const viewUrl = String(req.body?.viewUrl || '').trim();
    if (viewUrl && !/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+/.test(viewUrl)) throw new Error('Paste the sheet link from your browser. It looks like https://docs.google.com/spreadsheets/d/…');
    const roleIds = (Array.isArray(req.body?.roleIds) ? req.body.roleIds : []).filter(isSnowflake).slice(0, 25);
    const t = await getToolkit(req.params.communityId);
    await saveToolkit(req.params.communityId, { recruitment: { ...t.recruitment, sheetViewUrl: viewUrl || undefined, sheetRoleIds: roleIds } });
    ok(res, { saved: true });
  } catch (err) { fail(res, err); }
}

/** The bot's display name in THIS server only (Discord nickname). Other servers and the bot's account are unchanged. */
export async function botNicknameHandler(req: Request, res: Response) {
  try {
    const guild: any = await guildFor(req.params.communityId);
    if (!guild?.members?.me) throw new Error('The bot is not connected to this server.');
    const nick = String(req.body?.nickname || '').trim().slice(0, 32);
    await guild.members.me.setNickname(nick || null, 'Changed from the Community Manager dashboard');
    ok(res, { nickname: guild.members.me.nickname || '', botName: guild.members.me.user.username });
  } catch (err: any) {
    fail(res, /Missing Permissions/i.test(err?.message || '') ? new Error('The bot needs the “Change Nickname” permission in this server.') : err);
  }
}

/* ------------------------------------------------------------------ */
/* Recruiter codes: naming series, import/export, edit, status, history */
/* ------------------------------------------------------------------ */
async function codeRepos() {
  const repos = await import('../repositories/index.js');
  return { codes: repos.recruiterCodesRepository as any, apps: (repos as any).applicationsRepository, flags: new (await import('../repositories/firestore.repository.js')).FirestoreRepository<any>('recruiterCodeLogs') };
}
const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{1,31}$/;
const nowIso = () => new Date().toISOString();

async function codeLog(communityId: string, codeId: string, code: string, action: string, by: string, detail?: string) {
  const { flags } = await codeRepos();
  await flags.create({ communityId, codeId, code, action, by, detail, at: nowIso() }).catch(() => undefined);
}

/**
 * Code pattern. Modes:
 *  FIXED       prefix + number              e.g. BHARAT-007
 *  INITIALS    initials of the member's name e.g. Kunal Pareek -> KP-007
 *  FIRST       first N letters               e.g. KUN-007
 *  FIRST_LAST  first N + last M letters      e.g. KU + EK -> KUEK-007
 * An optional fixed text can go before the name part, and a suffix after the number.
 */
function seriesCode(s: any, n: number, name = '') { return buildCode(s, n, name); }

/** Picks the series for a member: the first role-based series whose roles they have, else the default. */
async function pickSeries(t: any, communityId: string, discordId?: string): Promise<{ series: any; ruleId: string | null }> {
  const rules: any[] = (t.recruitment as any).codeRules || [];
  if (discordId && rules.some((r) => r.enabled !== false && r.roleIds?.length)) {
    const guild: any = await guildFor(communityId);
    const member: any = guild ? await guild.members.fetch(discordId).catch(() => null) : null;
    const has = (id: string) => !!member?.roles?.cache?.has(id);
    const rule = rules.find((r) => r.enabled !== false && (r.roleIds || []).some(has));
    if (rule) return { series: { ...rule.series, enabled: true }, ruleId: rule.id };
  }
  return { series: (t.recruitment as any).codeSeries || {}, ruleId: null };
}

async function nextSeriesCode(communityId: string, name = '', discordId?: string) {
  const t = await getToolkit(communityId);
  const { series: s, ruleId } = await pickSeries(t, communityId, discordId);
  if (!s.enabled) return null;
  const { codes } = await codeRepos();
  const existing = new Set((await codes.listForTenant(communityId)).map((c: any) => c.code));
  let n = Math.max(1, Number(s.next) || 1);
  while (existing.has(seriesCode(s, n, name))) n++;
  const rec: any = t.recruitment;
  if (ruleId) await saveToolkit(communityId, { recruitment: { ...rec, codeRules: (rec.codeRules || []).map((r: any) => (r.id === ruleId ? { ...r, series: { ...r.series, next: n + 1 } } : r)) } as any });
  else await saveToolkit(communityId, { recruitment: { ...rec, codeSeries: { ...s, next: n + 1 } } as any });
  return seriesCode(s, n, name);
}

/**
 * Give a newly approved member their own recruiter code (once), using the naming series, and DM it.
 * Called when an application is approved and the member is in the server.
 */
export async function issueMemberCode(communityId: string, discordId: string, name: string): Promise<string | null> {
  const t: any = await getToolkit(communityId);
  if (!t.recruitment.codeForNewMembers) return null;
  const { codes } = await codeRepos();
  const mine = (await codes.listForTenant(communityId)).find((c: any) => (c.recruiterDiscordId || c.recruiterUserId) === discordId);
  if (mine) return mine.code;
  let code = await nextSeriesCode(communityId, name, discordId);
  if (!code) code = seriesCode({ mode: 'FIRST', firstN: 4, padding: 3, prefix: '' }, Math.floor(100 + Math.random() * 900), name);
  const doc = await codes.create({
    communityId, code, recruiterUserId: discordId, recruiterDiscordId: discordId, recruiterName: String(name).slice(0, 64),
    status: 'ACTIVE', isActive: true, totalUses: 0, source: 'AUTO_ON_APPROVAL', createdAt: nowIso(), updatedAt: nowIso(),
  });
  await codeLog(communityId, doc.id, code, 'CREATED', 'bot', 'Given automatically when the member was approved');
  const sent = await dmCode(communityId, discordId, code);
  await codeLog(communityId, doc.id, code, sent ? 'DM_SENT' : 'DM_FAILED', 'bot', sent ? 'Code sent to the member by DM' : 'The member has DMs closed');
  return code;
}

async function dmCode(communityId: string, discordId: string, code: string) {
  try {
    const guild: any = await guildFor(communityId);
    const user = await guild?.client?.users?.fetch(discordId);
    await user?.send(`🎟️ Your recruiter code for **${guild?.name || 'the server'}** is **${code}**.\nShare it with people you invite: they enter it when they apply, and you get credit when they join. Use \`/mycode\` in the server any time to see it again (only you can see the reply).`);
    return true;
  } catch { return false; }
}

export async function listCodesHandler(req: Request, res: Response) {
  try {
    const { communityId } = req.params;
    const { codes } = await codeRepos();
    const t = await getToolkit(communityId);
    const list = (await codes.listForTenant(communityId)).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)));
    ok(res, { codes: list, rules: (t.recruitment as any).codeRules || [], series: (t.recruitment as any).codeSeries || { enabled: false, mode: 'FIXED', prefix: 'REC-', padding: 3, next: 1, suffix: '', separator: '-', firstN: 3, lastM: 2 }, dmOnCreate: !!(t.recruitment as any).codeDmOnCreate, codeForNewMembers: !!(t.recruitment as any).codeForNewMembers });
  } catch (err) { fail(res, err, 500); }
}

function cleanSeries(x: any) {
  return {
    mode: ['FIXED', 'INITIALS', 'FIRST', 'FIRST_LAST'].includes(x?.mode) ? x.mode : 'FIXED',
    prefix: String(x?.prefix || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16),
    suffix: String(x?.suffix || '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 8),
    separator: ['-', '_', ''].includes(x?.separator) ? x.separator : '-',
    firstN: Math.max(1, Math.min(8, Number(x?.firstN) || 3)), lastM: Math.max(1, Math.min(8, Number(x?.lastM) || 2)),
    padding: Math.max(1, Math.min(8, Number(x?.padding) || 3)), next: Math.max(1, Number(x?.next) || 1),
  };
}

export async function codeSettingsHandler(req: Request, res: Response) {
  try {
    const { communityId } = req.params;
    const b = req.body || {};
    const series = { ...cleanSeries(b.series), enabled: !!b.series?.enabled };
    const rules = (Array.isArray(b.rules) ? b.rules : []).slice(0, 20).map((r: any, i: number) => ({
      id: String(r.id || `r${Date.now().toString(36)}${i}`).replace(/[^\w-]/g, '').slice(0, 32),
      name: String(r.name || '').trim().slice(0, 60) || `Series ${i + 1}`,
      enabled: r.enabled !== false,
      roleIds: (Array.isArray(r.roleIds) ? r.roleIds : []).filter(isSnowflake).slice(0, 10),
      series: cleanSeries(r.series),
    }));
    const t = await getToolkit(communityId);
    await saveToolkit(communityId, { recruitment: { ...t.recruitment, codeSeries: series, codeRules: rules, codeDmOnCreate: !!b.dmOnCreate, codeForNewMembers: !!b.codeForNewMembers } as any });
    ok(res, { series, rules, dmOnCreate: !!b.dmOnCreate, codeForNewMembers: !!b.codeForNewMembers, example: seriesCode(series, series.next, 'Kunal Pareek') });
  } catch (err) { fail(res, err); }
}

/** Create one code. Without a code, the next one in the naming series is used. */
export async function createCodeHandler(req: Request, res: Response) {
  try {
    const { communityId } = req.params;
    const b = req.body || {};
    const { codes } = await codeRepos();
    if (!isSnowflake(b.recruiterDiscordId)) throw new Error('Pick the recruiter (Discord member) who owns this code.');
    let code = String(b.code || '').trim().toUpperCase();
    if (!code) code = (await nextSeriesCode(communityId, String(b.recruiterName || ''), b.recruiterDiscordId)) || '';
    if (!code) throw new Error('Type a code, or turn on a naming series to create codes automatically.');
    if (!CODE_RE.test(code)) throw new Error('Codes can use letters, numbers, - and _ (2–32 characters).');
    const all = await codes.listForTenant(communityId);
    if (all.some((c: any) => c.code === code)) throw new Error(`The code ${code} already exists.`);
    const doc = await codes.create({
      communityId, code, recruiterUserId: b.recruiterDiscordId, recruiterDiscordId: b.recruiterDiscordId, recruiterName: String(b.recruiterName || '').slice(0, 64),
      status: 'ACTIVE', isActive: true, totalUses: 0, usesRemaining: b.maxUses ? Math.max(1, Number(b.maxUses)) : undefined,
      expiresAt: b.expiresAt ? new Date(b.expiresAt).toISOString() : undefined, notes: String(b.notes || '').slice(0, 300),
      source: 'DASHBOARD', createdAt: nowIso(), updatedAt: nowIso(),
    });
    await codeLog(communityId, doc.id, code, 'CREATED', (req as any).user?.username || (req as any).user?.userId || 'staff');
    const t = await getToolkit(communityId);
    let dmSent = false;
    if (b.dm ?? (t.recruitment as any).codeDmOnCreate) {
      dmSent = await dmCode(communityId, b.recruiterDiscordId, code);
      await codeLog(communityId, doc.id, code, dmSent ? 'DM_SENT' : 'DM_FAILED', 'bot', dmSent ? 'Code sent to the recruiter by DM' : 'The recruiter has DMs closed');
    }
    ok(res, { code: doc, dmSent });
  } catch (err) { fail(res, err); }
}

export async function updateCodeHandler(req: Request, res: Response) {
  try {
    const { communityId, codeId } = req.params;
    const b = req.body || {};
    const { codes } = await codeRepos();
    const c: any = await codes.getById(codeId);
    if (!c || c.communityId !== communityId) throw new Error('Code not found.');
    const patch: any = { updatedAt: nowIso() };
    const changes: string[] = [];
    if (b.code !== undefined) {
      const code = String(b.code).trim().toUpperCase();
      if (!CODE_RE.test(code)) throw new Error('Codes can use letters, numbers, - and _ (2–32 characters).');
      if (code !== c.code) {
        if ((await codes.listForTenant(communityId)).some((x: any) => x.code === code)) throw new Error(`The code ${code} already exists.`);
        patch.code = code; changes.push(`code ${c.code} → ${code}`);
      }
    }
    if (b.recruiterDiscordId !== undefined && b.recruiterDiscordId !== c.recruiterDiscordId) {
      if (!isSnowflake(b.recruiterDiscordId)) throw new Error('Pick a recruiter.');
      patch.recruiterDiscordId = b.recruiterDiscordId; patch.recruiterUserId = b.recruiterDiscordId; patch.recruiterName = String(b.recruiterName || '').slice(0, 64);
      changes.push(`recruiter → ${patch.recruiterName || b.recruiterDiscordId}`);
    }
    if (b.status && ['ACTIVE', 'INACTIVE'].includes(b.status) && b.status !== c.status) {
      patch.status = b.status; patch.isActive = b.status === 'ACTIVE'; changes.push(b.status === 'ACTIVE' ? 'activated' : 'deactivated');
    }
    if (b.maxUses !== undefined) { patch.usesRemaining = b.maxUses ? Math.max(1, Number(b.maxUses)) : null; changes.push(`limit ${b.maxUses || 'none'}`); }
    if (b.expiresAt !== undefined) { patch.expiresAt = b.expiresAt ? new Date(b.expiresAt).toISOString() : null; changes.push(`expires ${b.expiresAt ? new Date(b.expiresAt).toDateString() : 'never'}`); }
    if (b.notes !== undefined) patch.notes = String(b.notes).slice(0, 300);
    const updated = await codes.update(codeId, patch);
    if (changes.length) await codeLog(communityId, codeId, patch.code || c.code, 'UPDATED', (req as any).user?.username || 'staff', changes.join(', '));
    if (b.dm) {
      const sent = await dmCode(communityId, patch.recruiterDiscordId || c.recruiterDiscordId || c.recruiterUserId, patch.code || c.code);
      await codeLog(communityId, codeId, patch.code || c.code, sent ? 'DM_SENT' : 'DM_FAILED', 'bot');
    }
    ok(res, updated);
  } catch (err) { fail(res, err); }
}

export async function deleteCodeHandler(req: Request, res: Response) {
  try {
    const { communityId, codeId } = req.params;
    const { codes } = await codeRepos();
    const c: any = await codes.getById(codeId);
    if (!c || c.communityId !== communityId) throw new Error('Code not found.');
    await codes.delete(codeId);
    await codeLog(communityId, codeId, c.code, 'DELETED', (req as any).user?.username || 'staff');
    ok(res, { deleted: true });
  } catch (err) { fail(res, err); }
}

/** History of one code: changes plus the applications that used it. */
export async function codeHistoryHandler(req: Request, res: Response) {
  try {
    const { communityId, codeId } = req.params;
    const { codes, apps, flags } = await codeRepos();
    const c: any = await codes.getById(codeId);
    if (!c || c.communityId !== communityId) throw new Error('Code not found.');
    const logs = (await flags.listForTenant(communityId)).filter((l: any) => l.codeId === codeId);
    const used = apps ? (await apps.listForTenant(communityId)).filter((a: any) => String(a.recruiterCode || '').toUpperCase() === c.code)
      .map((a: any) => ({ at: a.createdAt, action: 'USED', by: a.applicantUsername || a.applicantName || 'applicant', detail: `Application ${String(a.status || '').toLowerCase()}` })) : [];
    ok(res, [...logs, ...used].sort((a: any, b: any) => String(b.at).localeCompare(String(a.at))).slice(0, 200));
  } catch (err) { fail(res, err); }
}

/** Import up to 200 rows per call; the dashboard sends batches and shows progress. */
export async function importCodesHandler(req: Request, res: Response) {
  try {
    const { communityId } = req.params;
    const rows: any[] = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 200) : [];
    const mode = req.body?.mode === 'update' ? 'update' : 'skip';
    const { codes } = await codeRepos();
    const all: any[] = await codes.listForTenant(communityId);
    const byCode = new Map(all.map((c) => [c.code, c]));
    const guild: any = await guildFor(communityId);
    const results: { row: number; code: string; result: 'created' | 'updated' | 'skipped' | 'error'; message?: string }[] = [];
    for (const [i, r] of rows.entries()) {
      const rowNo = Number(r.__row) || i + 2;
      const code = String(r.code || '').trim().toUpperCase();
      try {
        if (!CODE_RE.test(code)) throw new Error('Invalid code (letters, numbers, - and _, 2–32 characters).');
        let discordId = String(r.recruiterDiscordId || '').trim();
        if (!isSnowflake(discordId) && r.recruiterUsername && guild) {
          const q = String(r.recruiterUsername).replace(/^@/, '').toLowerCase();
          const found = (await guild.members.fetch({ query: q, limit: 5 }).catch(() => null))?.find((m: any) => m.user.username.toLowerCase() === q || m.displayName.toLowerCase() === q);
          if (found) discordId = found.id;
        }
        if (!isSnowflake(discordId)) throw new Error('Recruiter not found: add their Discord ID or exact username.');
        const status = String(r.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';
        const data: any = {
          recruiterUserId: discordId, recruiterDiscordId: discordId, recruiterName: String(r.recruiterName || r.recruiterUsername || '').slice(0, 64),
          status, isActive: status === 'ACTIVE', usesRemaining: r.maxUses ? Math.max(1, Number(r.maxUses)) : undefined,
          expiresAt: r.expiresAt && !isNaN(new Date(r.expiresAt).getTime()) ? new Date(r.expiresAt).toISOString() : undefined,
          notes: String(r.notes || '').slice(0, 300), updatedAt: nowIso(),
        };
        const existing = byCode.get(code);
        if (existing) {
          if (mode === 'skip') { results.push({ row: rowNo, code, result: 'skipped', message: 'Already exists' }); continue; }
          await codes.update(existing.id, data);
          await codeLog(communityId, existing.id, code, 'IMPORTED', 'import', 'Updated from file');
          results.push({ row: rowNo, code, result: 'updated' });
        } else {
          const doc = await codes.create({ communityId, code, totalUses: Math.max(0, Number(r.totalUses) || 0), source: 'IMPORT', createdAt: nowIso(), ...data });
          byCode.set(code, doc);
          await codeLog(communityId, doc.id, code, 'IMPORTED', 'import', 'Created from file');
          results.push({ row: rowNo, code, result: 'created' });
        }
      } catch (e: any) {
        results.push({ row: rowNo, code, result: 'error', message: e.message });
      }
    }
    ok(res, results);
  } catch (err) { fail(res, err); }
}

/** Real status of what this server is connected to (no storage internals). */
export async function integrationsStatusHandler(req: Request, res: Response) {
  try {
    const { communityId } = req.params;
    const guild: any = await guildFor(communityId);
    const t = await getToolkit(communityId);
    ok(res, {
      discord: { connected: !!guild, guildId: guild?.id || '', guildName: guild?.name || '', memberCount: guild?.memberCount || 0, ping: guild?.client?.ws?.ping ?? null },
      sheets: { connected: !!t.recruitment.sheetWebhookUrl, viewUrl: (t.recruitment as any).sheetViewUrl || '' },
      ai: { configured: Boolean(process.env.GEMINI_API_KEY) },
    });
  } catch (err) { fail(res, err, 500); }
}

/** The basic recruitment switches (used by Recruitment → Settings). */
export async function recruitmentBasicsHandler(req: Request, res: Response) {
  try {
    const t = await getToolkit(req.params.communityId);
    const b = req.body || {};
    const rec: any = { ...t.recruitment };
    if (b.applyEnabled !== undefined) rec.applyEnabled = Boolean(b.applyEnabled);
    if (b.askRecruiterCode !== undefined) rec.askRecruiterCode = Boolean(b.askRecruiterCode);
    if (b.codeRequired !== undefined) rec.codeRequired = Boolean(b.codeRequired);
    await saveToolkit(req.params.communityId, { recruitment: rec });
    ok(res, { applyEnabled: rec.applyEnabled, askRecruiterCode: rec.askRecruiterCode, codeRequired: !!rec.codeRequired });
  } catch (err) { fail(res, err); }
}

/** Live member list from Discord: server nickname, username, roles, join date. Paged and searchable. */
export async function membersListHandler(req: Request, res: Response) {
  try {
    const guild: any = await guildFor(req.params.communityId);
    if (!guild) throw new Error('The bot is not connected to this server.');
    if (guild.members.cache.size < guild.memberCount) await guild.members.fetch().catch(() => undefined);
    const q = str(req.query.q, 50).toLowerCase();
    const role = String(req.query.role || '');
    const kind = String(req.query.kind || 'humans');
    const sort = req.query.sort === 'name' ? 'name' : 'joined';
    const page = Math.max(1, Number(req.query.page) || 1);
    let list = Array.from(guild.members.cache.values()) as any[];
    if (kind === 'humans') list = list.filter((m) => !m.user.bot); else if (kind === 'bots') list = list.filter((m) => m.user.bot);
    if (role) list = list.filter((m) => m.roles.cache.has(role));
    if (q) list = list.filter((m) => m.displayName.toLowerCase().includes(q) || m.user.username.toLowerCase().includes(q) || m.id === q);
    list.sort((a, b) => (sort === 'name' ? a.displayName.localeCompare(b.displayName) : (b.joinedTimestamp || 0) - (a.joinedTimestamp || 0)));
    const total = list.length;
    const rows = list.slice((page - 1) * 50, page * 50).map((m) => ({
      id: m.id, name: m.displayName, username: m.user.username, avatar: m.user.displayAvatarURL({ size: 64 }), bot: m.user.bot,
      joinedAt: m.joinedAt?.toISOString(), createdAt: m.user.createdAt?.toISOString(), timedOut: !!m.communicationDisabledUntilTimestamp && m.communicationDisabledUntilTimestamp > Date.now(),
      roles: m.roles.cache.filter((r: any) => r.id !== guild.id).sort((a: any, b: any) => b.position - a.position).map((r: any) => ({ id: r.id, name: r.name, color: r.hexColor })),
    }));
    ok(res, { total, page, pages: Math.max(1, Math.ceil(total / 50)), rows });
  } catch (err) { fail(res, err); }
}

/** Preview a code pattern for a sample name (dashboard live preview). */
export function previewCode(series: any, name: string) { return seriesCode(series, Number(series?.next) || 1, name); }

/** Bots that join get this role automatically (Members & onboarding). */
export async function botRoleHandler(req: Request, res: Response) {
  try {
    const t: any = await getToolkit(req.params.communityId);
    const botRoleId = isSnowflake(req.body?.botRoleId) ? req.body.botRoleId : undefined;
    await saveToolkit(req.params.communityId, { roleRules: { ...t.roleRules, botRoleId } } as any);
    ok(res, { botRoleId: botRoleId || '' });
  } catch (err) { fail(res, err); }
}

/** Remove one member's special access from an open review room (dashboard). */
export async function roomUninviteHandler(req: Request, res: Response) {
  try {
    const { reviewRooms } = await import('../services/toolkit/reviewRooms.service.js');
    ok(res, await reviewRooms.removeAccessFromDashboard(req.params.communityId, req.params.roomId, req.params.userId, (req as any).user?.userId));
  } catch (err) { fail(res, err); }
}
