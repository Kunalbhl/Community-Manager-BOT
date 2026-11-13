/**
 * Apply on the website, join after approval.
 *
 * 1. The applicant opens /join/<communityId>?code=XYZ and signs in with Discord (scopes: identify,
 *    guilds.join). We keep their Discord login only for this one purpose, until a decision is made.
 * 2. They read the rules, pass the rules quiz and fill in the form on one page. The application goes
 *    through the normal workflow (recruiter code, blacklist, review in Discord and the dashboard).
 * 3. When staff approve, the bot adds them to the server itself (guilds.join) with the member role.
 *    If their login has expired, the page shows an invite link instead. Rejected or decided: the
 *    stored login is deleted.
 */
import crypto from 'crypto';
import { FirestoreRepository } from '../../repositories/firestore.repository.js';
import { applicationsRepository } from '../../repositories/index.js';
import { config } from '../../config/env.js';
import { getToolkit, guildFor } from '../toolkit/toolkitConfig.js';
import { logger } from '../../logging/logger.js';

export interface WebApplyLogin {
  id: string; // random session token (also the cookie value)
  communityId: string;
  discordUserId: string;
  username: string;
  globalName?: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt: number;
  recruiterCode?: string;
  quizPassed?: boolean;
  applicationId?: string;
  inviteUrl?: string;
  createdAt: string;
  updatedAt: string;
}
export const webApplyRepository = new FirestoreRepository<WebApplyLogin>('webApplyLogins');
const statesRepository = new FirestoreRepository<{ id: string; communityId: string; code?: string; expiresAt: number }>('webApplyStates');

export const COOKIE = 'cm_join';
const ttlMs = 14 * 86_400_000;
const nowIso = () => new Date().toISOString();
const clientId = () => config.DISCORD_CLIENT_ID || (config as any).DISCORD_APPLICATION_ID;

function redirectUri() {
  // Same callback the dashboard sign-in already uses, so no new redirect needs registering with Discord.
  const c = (config as any).DISCORD_OAUTH_CALLBACK_URL;
  if (c && c.startsWith('http') && !c.includes('discord.com')) return c;
  return 'https://community-manager-bot-720940628402.asia-southeast1.run.app/api/v1/auth/callback';
}

export const webApply = {
  isState(state: unknown) { return typeof state === 'string' && state.startsWith('join_'); },

  async loginUrl(communityId: string, code?: string) {
    if (!clientId()) throw new Error('Discord sign-in is not configured.');
    const id = `join_${crypto.randomBytes(24).toString('hex')}`;
    await statesRepository.create({ id, communityId, code: (code || '').toUpperCase().slice(0, 32), expiresAt: Date.now() + 15 * 60_000 } as any);
    const u = new URL('https://discord.com/oauth2/authorize');
    u.searchParams.set('client_id', clientId()!);
    u.searchParams.set('redirect_uri', redirectUri());
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', 'identify guilds.join');
    u.searchParams.set('state', id);
    u.searchParams.set('prompt', 'consent');
    return u.toString();
  },

  /** OAuth callback for applicants. Returns where to send the browser and the session token. */
  async callback(code: string, state: string): Promise<{ to: string; token?: string }> {
    const st: any = await statesRepository.getById(state).catch(() => null);
    if (!st || st.expiresAt < Date.now()) return { to: '/join/expired' };
    await statesRepository.delete(state).catch(() => undefined);
    const body = new URLSearchParams({ client_id: clientId()!, client_secret: config.DISCORD_CLIENT_SECRET || '', grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
    const tr = await fetch('https://discord.com/api/v10/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const tok: any = await tr.json().catch(() => ({}));
    if (!tr.ok || !tok.access_token) { logger.warn(`[WebApply] token exchange failed: ${tr.status}`); return { to: `/join/${st.communityId}?error=signin` }; }
    if (!String(tok.scope || '').includes('guilds.join')) return { to: `/join/${st.communityId}?error=scope` };
    const me: any = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json());
    if (!me?.id) return { to: `/join/${st.communityId}?error=signin` };
    const token = crypto.randomBytes(32).toString('hex');
    await webApplyRepository.create({
      id: token, communityId: st.communityId, discordUserId: me.id, username: me.username, globalName: me.global_name || '',
      avatarUrl: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128` : '',
      accessToken: tok.access_token, refreshToken: tok.refresh_token, tokenExpiresAt: Date.now() + (Number(tok.expires_in) || 604800) * 1000,
      recruiterCode: st.code || '', createdAt: nowIso(), updatedAt: nowIso(),
    } as any);
    return { to: `/join/${st.communityId}`, token };
  },

  async session(token: string | undefined, communityId: string) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const s = await webApplyRepository.getById(token).catch(() => null);
    if (!s || s.communityId !== communityId || Date.now() - Date.parse(s.createdAt) > ttlMs) return null;
    return s;
  },

  /** Public info for the page: server, rules, quiz (without answers), questions. */
  async info(communityId: string) {
    const [cfg, guild] = await Promise.all([getToolkit(communityId), guildFor(communityId)]);
    if (!guild) throw new Error('This server is not available right now.');
    const { communityQuestionsService } = await import('../communityQuestions.service.js');
    const [questions, rules] = await Promise.all([
      communityQuestionsService.listApplicationQuestions(communityId).then((qs: any[]) => qs.filter((q) => q.enabled !== false).sort((a, b) => (a.order || 0) - (b.order || 0))),
      communityQuestionsService.listGuidelines(communityId).catch(() => [] as any[]),
    ]);
    const rc: any = cfg.recruitment;
    return {
      server: { name: guild.name, icon: guild.iconURL?.({ size: 128 }) || '', banner: guild.bannerURL?.({ size: 1024 }) || '', members: guild.memberCount },
      open: !!rc.applyEnabled,
      rules: rules.map((r: any) => ({ title: r.title, description: r.description || '' })),
      consent: rc.screening?.consentText || '',
      quiz: (rc.screening?.questions || []).map((q: any) => ({ id: q.id, question: q.question, options: q.options })),
      questions: questions.map((q: any) => ({ id: q.id, text: q.questionText, type: q.type, options: q.options || [], required: !!q.required, guidance: q.guidance || '' })),
      askCode: !!rc.askRecruiterCode, codeRequired: !!rc.codeRequired,
    };
  },

  /** Checks the quiz. Wrong answers come back with the explanation so they can try again. */
  async checkQuiz(s: WebApplyLogin, answers: Record<string, number>) {
    const cfg: any = await getToolkit(s.communityId);
    const qs: any[] = cfg.recruitment.screening?.questions || [];
    const results = qs.map((q) => ({ id: q.id, correct: Number(answers?.[q.id]) === q.correct, explain: Number(answers?.[q.id]) === q.correct ? '' : q.explain || 'Read the rules again and pick another answer.' }));
    const passed = results.every((r) => r.correct);
    if (passed) await webApplyRepository.update(s.id, { quizPassed: true, updatedAt: nowIso() } as any);
    return { passed, results };
  },

  async status(s: WebApplyLogin) {
    const apps: any[] = await applicationsRepository.list({ where: [{ field: 'communityId', operator: '==', value: s.communityId }, { field: 'applicantDiscordUserId', operator: '==', value: s.discordUserId }] } as any).catch(() => []);
    const app = apps.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    const guild: any = await guildFor(s.communityId);
    const inServer = guild ? !!(await guild.members.fetch(s.discordUserId).catch(() => null)) : false;
    return {
      me: { id: s.discordUserId, username: s.username, name: s.globalName || s.username, avatarUrl: s.avatarUrl },
      recruiterCode: s.recruiterCode || '', quizPassed: !!s.quizPassed, inServer,
      application: app ? { id: app.id, status: app.status, submittedAt: app.submittedAt || app.createdAt, reason: app.status === 'REJECTED' ? (app.rejectionReason || app.decisionReason || '') : '' } : null,
      inviteUrl: s.inviteUrl || '',
    };
  },

  async submit(s: WebApplyLogin, body: any) {
    const info = await this.info(s.communityId);
    if (!info.open) throw new Error('Applications are closed right now.');
    if (info.quiz.length && !s.quizPassed) throw new Error('Please finish the rules quiz first.');
    if (!body?.agree) throw new Error('Please confirm you have read and agree to the rules.');
    const answers: Record<string, string> = body?.answers || {};
    for (const q of info.questions) if (q.required && !String(answers[q.id] || '').trim()) throw new Error(`Please answer: ${q.text}`);
    const code = String(body?.recruiterCode ?? s.recruiterCode ?? '').trim().toUpperCase();
    if (info.askCode && info.codeRequired && !code) throw new Error('A recruiter code is required. Ask the person who invited you.');
    const { guardApplicant } = await import('../blacklist/blacklistGuard.service.js');
    await guardApplicant(s.communityId, { id: s.discordUserId, username: s.username, globalName: s.globalName, avatar: s.avatarUrl }, Object.values(answers).map(String));
    const { applicationWorkflowService } = await import('../applicationWorkflow.service.js');
    const r = await applicationWorkflowService.submitApplication({
      communityId: s.communityId, applicantDiscordUserId: s.discordUserId, applicantUsername: s.username,
      applicantDisplayName: s.globalName || s.username, recruiterCode: info.askCode ? code || undefined : undefined, source: 'WEB' as any,
      answers: info.questions.map((q: any) => ({ questionId: q.id, answerText: String(answers[q.id] || '').slice(0, 2000) })),
    } as any);
    await webApplyRepository.update(s.id, { applicationId: r.application.id, recruiterCode: code, updatedAt: nowIso() } as any);
    return { applicationId: r.application.id };
  },

  async freshToken(s: WebApplyLogin): Promise<string | null> {
    if (s.tokenExpiresAt - Date.now() > 60_000) return s.accessToken;
    if (!s.refreshToken) return null;
    const body = new URLSearchParams({ client_id: clientId()!, client_secret: config.DISCORD_CLIENT_SECRET || '', grant_type: 'refresh_token', refresh_token: s.refreshToken });
    const r = await fetch('https://discord.com/api/v10/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const t: any = await r.json().catch(() => ({}));
    if (!r.ok || !t.access_token) return null;
    await webApplyRepository.update(s.id, { accessToken: t.access_token, refreshToken: t.refresh_token, tokenExpiresAt: Date.now() + (Number(t.expires_in) || 604800) * 1000 } as any);
    return t.access_token;
  },

  /**
   * Called when an application is decided. Approved: add them to the server (or keep an invite for
   * the page). Either way, the stored Discord login is then deleted.
   */
  async onDecided(communityId: string, discordUserId: string, approved: boolean) {
    const logins = (await webApplyRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }, { field: 'discordUserId', operator: '==', value: discordUserId }] })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!logins.length) return false;
    let added = false;
    if (approved) {
      const guild: any = await guildFor(communityId);
      const already = guild ? await guild.members.fetch(discordUserId).catch(() => null) : null;
      if (guild && !already) {
        const { getGate } = await import('./secureGate.service.js');
        const gate: any = await getGate(communityId).catch(() => ({}));
        const roles = [gate.memberRoleId, ...(gate.approvedExtraRoleIds || [])].filter(Boolean);
        for (const s of logins) {
          const at = await this.freshToken(s).catch(() => null);
          if (!at) continue;
          try { await guild.members.add(discordUserId, { accessToken: at, roles: roles.length ? roles : undefined }); added = true; break; }
          catch (e: any) { logger.warn(`[WebApply] add to server failed: ${e?.message}`); }
        }
        if (!added) {
          // Fallback: a one-use invite shown on their page.
          const ch: any = guild.systemChannel || guild.channels.cache.find((c: any) => c.isTextBased?.() && c.permissionsFor?.(guild.members.me)?.has('CreateInstantInvite'));
          const inv = await ch?.createInvite({ maxUses: 1, maxAge: 7 * 86400, unique: true, reason: 'Approved website applicant' }).catch(() => null);
          if (inv) for (const s of logins) await webApplyRepository.update(s.id, { inviteUrl: inv.url } as any).catch(() => undefined);
        }
      }
    }
    // The login was only for joining: remove the tokens now (keep the page session so they can see the result).
    for (const s of logins) await webApplyRepository.update(s.id, { accessToken: '', refreshToken: '', tokenExpiresAt: 0, updatedAt: nowIso() } as any).catch(() => undefined);
    return added;
  },

  /** Deletes old sessions (and any login tokens left in them). */
  async purge() {
    const old = (await webApplyRepository.list({})).filter((s) => Date.now() - Date.parse(s.createdAt) > ttlMs);
    for (const s of old) await webApplyRepository.delete(s.id).catch(() => undefined);
  },
};
