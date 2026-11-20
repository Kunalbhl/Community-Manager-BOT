/** Giveaway web forms: data model (forms, entries, prizes). Logic is added in later steps. */
import { FirestoreRepository } from '../repositories/firestore.repository.js';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { guildFor } from './toolkit/toolkitConfig.js';
import { logger } from '../logging/logger.js';

export interface FormQuestion { id: string; label: string; type: 'text' | 'longtext' | 'phone' | 'email' | 'choice'; required: boolean; options?: string[]; private?: boolean }
export interface GiveawayForm {
  id: string; communityId: string; slug: string; title: string; description?: string;
  questions: FormQuestion[]; opensAt?: string; closesAt?: string; status: 'DRAFT' | 'OPEN' | 'CLOSED' | 'DRAWN';
  requireGuildMember?: boolean; requiredRoleId?: string; allowDiscord: boolean; allowGoogle: boolean;
  sheetUrl?: string; sheetId?: string; resultChannelId?: string; createdBy?: string; createdAt: string;
}
export interface GiveawayEntry {
  id: string; communityId: string; formId: string; provider: 'discord' | 'google'; userKey: string; discordId?: string;
  name: string; email?: string; answers: Record<string, string>; status: 'VALID' | 'DISQUALIFIED'; won: string[]; createdAt: string;
}
export interface GiveawayPrize { id: string; communityId: string; formId: string; name: string; count: number; allowRepeat: boolean; winners: string[]; drawnAt?: string; drawnBy?: string }

export const giveawayFormsRepository = new FirestoreRepository<GiveawayForm>('giveawayForms');
export const giveawayEntriesRepository = new FirestoreRepository<GiveawayEntry>('giveawayEntries');
export const giveawayPrizesRepository = new FirestoreRepository<GiveawayPrize>('giveawayPrizes');

/* ------------------------------------------------------------------ */
/* Logic                                                               */
/* ------------------------------------------------------------------ */

export const GW_COOKIE = 'cm_gw';
interface GwSession { id: string; slug: string; provider: 'discord' | 'google'; userKey: string; discordId?: string; name: string; email?: string; avatarUrl?: string; createdAt: string }
const sessionsRepository = new FirestoreRepository<GwSession>('giveawaySessions');
const statesRepository = new FirestoreRepository<{ id: string; slug: string; provider: 'discord' | 'google'; expiresAt: number }>('giveawayStates');

const nowIso = () => new Date().toISOString();
const base = () => String(config.APP_URL || 'https://community-manager.chaloone.com').replace(/\/$/, '');
const discordClientId = () => config.DISCORD_CLIENT_ID || (config as any).DISCORD_APPLICATION_ID;
function discordRedirect() {
  const c = (config as any).DISCORD_OAUTH_CALLBACK_URL;
  if (c && c.startsWith('http') && !c.includes('discord.com')) return c;
  return 'https://community-manager.chaloone.com/api/v1/auth/callback';
}
const googleRedirect = () => `${base()}/api/v1/giveaway-forms/google/callback`;
const clean = (v: any, n: number) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n);
const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'giveaway';

export function normalizeQuestions(input: any): FormQuestion[] {
  const types = ['text', 'longtext', 'phone', 'email', 'choice'];
  return (Array.isArray(input) ? input : []).slice(0, 25).map((q: any, i: number) => ({
    id: clean(q?.id, 20) || `q${i + 1}`,
    label: clean(q?.label, 200),
    type: (types.includes(q?.type) ? q.type : 'text') as FormQuestion['type'],
    required: !!q?.required,
    options: q?.type === 'choice' ? (Array.isArray(q.options) ? q.options : []).map((o: any) => clean(o, 100)).filter(Boolean).slice(0, 20) : undefined,
    private: !!q?.private,
  })).filter((q) => q.label);
}

export const giveawayForms = {
  /* ---------- staff side ---------- */
  async list(communityId: string) {
    const forms = await giveawayFormsRepository.listForTenant(communityId).catch(() => [] as GiveawayForm[]);
    const entries = await giveawayEntriesRepository.listForTenant(communityId).catch(() => [] as GiveawayEntry[]);
    return forms.map((f) => ({ ...f, url: `${base()}/g/${f.slug}`, entryCount: entries.filter((e) => e.formId === f.id).length })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async save(communityId: string, body: any, by?: string, id?: string) {
    const title = clean(body.title, 120);
    if (!title) throw new Error('Give the giveaway a title.');
    const data: any = {
      title, description: clean(body.description, 2000), questions: normalizeQuestions(body.questions),
      opensAt: body.opensAt ? new Date(body.opensAt).toISOString() : undefined, closesAt: body.closesAt ? new Date(body.closesAt).toISOString() : undefined,
      requireGuildMember: !!body.requireGuildMember, requiredRoleId: clean(body.requiredRoleId, 30) || undefined,
      allowDiscord: body.allowDiscord !== false, allowGoogle: body.allowGoogle !== false, resultChannelId: clean(body.resultChannelId, 30) || undefined,
      sheetUrl: clean(body.sheetUrl, 300) || undefined,
    };
    if (!data.allowDiscord && !data.allowGoogle) throw new Error('Allow at least one way to sign in.');
    if (id) {
      const f = await giveawayFormsRepository.getById(id);
      if (!f || f.communityId !== communityId) throw new Error('Form not found.');
      return giveawayFormsRepository.update(id, data);
    }
    const all = await giveawayFormsRepository.list().catch(() => [] as GiveawayForm[]);
    let slug = slugify(title); const taken = new Set(all.map((f) => f.slug));
    if (taken.has(slug)) slug = `${slug}-${crypto.randomBytes(3).toString('hex')}`;
    return giveawayFormsRepository.create({ ...data, communityId, slug, status: 'DRAFT', createdBy: by, createdAt: nowIso() } as any);
  },
  async setStatus(communityId: string, id: string, status: GiveawayForm['status']) {
    const f = await giveawayFormsRepository.getById(id);
    if (!f || f.communityId !== communityId) throw new Error('Form not found.');
    return giveawayFormsRepository.update(id, { status } as any);
  },
  async remove(communityId: string, id: string) {
    const f = await giveawayFormsRepository.getById(id);
    if (!f || f.communityId !== communityId) throw new Error('Form not found.');
    const entries = (await giveawayEntriesRepository.listForTenant(communityId)).filter((e) => e.formId === id);
    if (entries.length) throw new Error(`This form has ${entries.length} entries. Close it instead of deleting so the records stay.`);
    await giveawayFormsRepository.delete(id);
  },
  async entries(communityId: string, formId: string) {
    const f = await giveawayFormsRepository.getById(formId);
    if (!f || f.communityId !== communityId) throw new Error('Form not found.');
    const all = (await giveawayEntriesRepository.listForTenant(communityId)).filter((e) => e.formId === formId);
    return { form: f, entries: all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) };
  },
  async csv(communityId: string, formId: string) {
    const { form, entries } = await this.entries(communityId, formId);
    const esc = (v: any) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
    const head = ['Entered', 'Sign-in', 'Name', 'Email', 'Discord ID', 'Status', 'Won', ...form.questions.map((q) => q.label)];
    const rows = entries.map((e) => [e.createdAt, e.provider, e.name, e.email || '', e.discordId || '', e.status, (e.won || []).length ? 'yes' : '', ...form.questions.map((q) => e.answers[q.id] || '')]);
    return [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  },

  /* ---------- public side ---------- */
  async bySlug(slug: string) {
    if (!/^[a-z0-9-]{1,60}$/.test(slug)) throw new Error('This giveaway was not found.');
    const f = (await giveawayFormsRepository.list({ where: [{ field: 'slug', operator: '==', value: slug }] } as any).catch(() => [] as GiveawayForm[]))[0];
    if (!f || f.status === 'DRAFT') throw new Error('This giveaway was not found.');
    return f;
  },
  isOpen(f: GiveawayForm) {
    const now = Date.now();
    return f.status === 'OPEN' && (!f.opensAt || Date.parse(f.opensAt) <= now) && (!f.closesAt || Date.parse(f.closesAt) > now);
  },
  async publicInfo(slug: string, session: GwSession | null) {
    const f = await this.bySlug(slug);
    const guild: any = await guildFor(f.communityId).catch(() => null);
    const mine = session ? (await giveawayEntriesRepository.listForTenant(f.communityId)).find((e) => e.formId === f.id && e.userKey === session.userKey) : null;
    return {
      title: f.title, description: f.description || '', serverName: guild?.name || '', open: this.isOpen(f), status: f.status,
      opensAt: f.opensAt, closesAt: f.closesAt, allowDiscord: f.allowDiscord, allowGoogle: f.allowGoogle && !!process.env.GOOGLE_SIGNIN_CLIENT_ID,
      questions: f.questions.map((q) => ({ id: q.id, label: q.label, type: q.type, required: q.required, options: q.options })),
      me: session ? { provider: session.provider, name: session.name, avatarUrl: session.avatarUrl || '' } : null,
      entered: !!mine,
    };
  },
  async loginUrl(slug: string, provider: 'discord' | 'google') {
    const f = await this.bySlug(slug);
    if (provider === 'discord' ? !f.allowDiscord : !f.allowGoogle) throw new Error('That sign-in is not available for this giveaway.');
    const id = `gw_${crypto.randomBytes(24).toString('hex')}`;
    await statesRepository.create({ id, slug, provider, expiresAt: Date.now() + 15 * 60_000 } as any);
    if (provider === 'discord') {
      if (!discordClientId()) throw new Error('Discord sign-in is not configured.');
      const u = new URL('https://discord.com/oauth2/authorize');
      u.searchParams.set('client_id', discordClientId()!); u.searchParams.set('redirect_uri', discordRedirect());
      u.searchParams.set('response_type', 'code'); u.searchParams.set('scope', 'identify'); u.searchParams.set('state', id);
      return u.toString();
    }
    if (!process.env.GOOGLE_SIGNIN_CLIENT_ID) throw new Error('Google sign-in is not configured yet.');
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.searchParams.set('client_id', process.env.GOOGLE_SIGNIN_CLIENT_ID); u.searchParams.set('redirect_uri', googleRedirect());
    u.searchParams.set('response_type', 'code'); u.searchParams.set('scope', 'openid email profile'); u.searchParams.set('state', id);
    u.searchParams.set('prompt', 'select_account');
    return u.toString();
  },
  isState(state: unknown) { return typeof state === 'string' && state.startsWith('gw_'); },

  /** Handles both providers. Returns where to send the browser and the session token. */
  async callback(code: string, state: string): Promise<{ to: string; token?: string }> {
    const st: any = await statesRepository.getById(state).catch(() => null);
    if (!st || st.expiresAt < Date.now()) return { to: '/' };
    await statesRepository.delete(state).catch(() => undefined);
    const back = (q = '') => `/g/${st.slug}${q}`;
    try {
      let s: Omit<GwSession, 'id' | 'createdAt'>;
      if (st.provider === 'discord') {
        const body = new URLSearchParams({ client_id: discordClientId()!, client_secret: config.DISCORD_CLIENT_SECRET || '', grant_type: 'authorization_code', code, redirect_uri: discordRedirect() });
        const tok: any = await fetch('https://discord.com/api/v10/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }).then((r) => r.json());
        if (!tok.access_token) return { to: back('?error=signin') };
        const me: any = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${tok.access_token}` } }).then((r) => r.json());
        if (!me?.id) return { to: back('?error=signin') };
        s = { slug: st.slug, provider: 'discord', userKey: `discord:${me.id}`, discordId: me.id, name: me.global_name || me.username, avatarUrl: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64` : '' };
      } else {
        const body = new URLSearchParams({ client_id: process.env.GOOGLE_SIGNIN_CLIENT_ID || '', client_secret: process.env.GOOGLE_SIGNIN_CLIENT_SECRET || '', grant_type: 'authorization_code', code, redirect_uri: googleRedirect() });
        const tok: any = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }).then((r) => r.json());
        if (!tok.id_token) return { to: back('?error=signin') };
        const claims = JSON.parse(Buffer.from(String(tok.id_token).split('.')[1], 'base64url').toString('utf8'));
        if (!claims.sub) return { to: back('?error=signin') };
        s = { slug: st.slug, provider: 'google', userKey: `google:${claims.sub}`, name: claims.name || claims.email || 'Google user', email: claims.email_verified === false ? undefined : claims.email, avatarUrl: claims.picture || '' };
      }
      const token = crypto.randomBytes(32).toString('hex');
      await sessionsRepository.create({ id: token, ...s, createdAt: nowIso() } as any);
      return { to: back(), token };
    } catch (err: any) {
      logger.warn(`[GiveawayForms] sign-in failed: ${err?.message}`);
      return { to: back('?error=signin') };
    }
  },
  async session(token: string | undefined, slug: string): Promise<GwSession | null> {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const s = await sessionsRepository.getById(token).catch(() => null);
    if (!s || s.slug !== slug || Date.now() - Date.parse(s.createdAt) > 24 * 3600_000) return null;
    return s;
  },

  async submit(slug: string, session: GwSession, answersIn: Record<string, any>) {
    const f = await this.bySlug(slug);
    if (!this.isOpen(f)) throw new Error('This giveaway is not accepting entries right now.');
    const existing = (await giveawayEntriesRepository.listForTenant(f.communityId)).filter((e) => e.formId === f.id);
    if (existing.some((e) => e.userKey === session.userKey || (session.discordId && e.discordId === session.discordId))) throw new Error('You have already entered. One entry per person.');
    if (session.provider === 'google' && session.email && existing.some((e) => e.email && e.email.toLowerCase() === session.email!.toLowerCase())) throw new Error('This email has already entered.');
    if (f.requireGuildMember || f.requiredRoleId) {
      if (!session.discordId) throw new Error('This giveaway needs you to sign in with Discord so we can check you are in the server.');
      const guild: any = await guildFor(f.communityId);
      const m = await guild?.members.fetch(session.discordId).catch(() => null);
      if (!m) throw new Error('You need to be a member of the Discord server to enter.');
      if (f.requiredRoleId && !m.roles.cache.has(f.requiredRoleId)) throw new Error('You need a specific role in the server to enter.');
    }
    const answers: Record<string, string> = {};
    for (const q of f.questions) {
      const v = clean(answersIn?.[q.id], q.type === 'longtext' ? 1500 : 300);
      if (q.required && !v) throw new Error(`Please answer: ${q.label}`);
      if (v && q.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new Error(`Enter a valid email for: ${q.label}`);
      if (v && q.type === 'phone' && !/^[+()\d\s-]{6,20}$/.test(v)) throw new Error(`Enter a valid phone number for: ${q.label}`);
      if (v && q.type === 'choice' && !(q.options || []).includes(v)) throw new Error(`Pick one of the options for: ${q.label}`);
      if (v) answers[q.id] = v;
    }
    const entry = await giveawayEntriesRepository.create({
      communityId: f.communityId, formId: f.id, provider: session.provider, userKey: session.userKey, discordId: session.discordId,
      name: session.name, email: session.email, answers, status: 'VALID', won: [], createdAt: nowIso(),
    } as any);
    sessionsRepository.delete(session.id).catch(() => undefined);
    import('./giveawaySheets.service.js').then((m) => m.giveawaySheets.appendEntry(f, entry)).catch(() => undefined);
    return entry;
  },
};
