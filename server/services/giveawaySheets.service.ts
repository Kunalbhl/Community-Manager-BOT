/**
 * Copies giveaway entries to a Google Sheet the staff member chose, using their own Google consent.
 * - Staff press "Connect Google" once (scope: Google Sheets). The refresh token is stored encrypted.
 * - Before syncing we check the connected Google account can actually edit the Sheet.
 * - "Entries" tab: every entry, winners highlighted. "Winners" tab: winners with the details needed to send rewards.
 */
import crypto from 'crypto';
import { FirestoreRepository } from '../repositories/firestore.repository.js';
import { signState, verifyState, encrypt, decrypt } from '../integrations/google/googleApi.js';
import { config } from '../config/env.js';
import { logger } from '../logging/logger.js';
import { giveawayFormsRepository, giveawayEntriesRepository, giveawayPrizesRepository, GiveawayForm, GiveawayEntry } from './giveawayForms.service.js';

interface SheetAuth { id: string; email: string; refreshTokenEnc: string; connectedBy?: string; connectedAt: string }
const authRepository = new FirestoreRepository<SheetAuth>('giveawaySheetAuth');
const SCOPE = 'openid email https://www.googleapis.com/auth/spreadsheets';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const base = () => String(config.APP_URL || 'https://community-manager.chaloone.com').replace(/\/$/, '');
const redirect = () => `${base()}/api/v1/giveaway-forms/google/callback`;
const cid = () => process.env.GOOGLE_SIGNIN_CLIENT_ID || '';
const csecret = () => process.env.GOOGLE_SIGNIN_CLIENT_SECRET || '';
const GOLD = { red: 1, green: 0.949, blue: 0.8 };
const WHITE = { red: 1, green: 1, blue: 1 };

export const sheetIdFromUrl = (u: string) => /\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(String(u || ''))?.[1] || '';
const col = (n: number) => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const safeCell = (v: any) => { const s = String(v ?? ''); return /^[=+\-@]/.test(s) ? `'${s}` : s; };

async function accessToken(communityId: string): Promise<{ token: string; email: string }> {
  const a = await authRepository.getById(communityId).catch(() => null);
  if (!a) throw new Error('Connect your Google account first.');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cid(), client_secret: csecret(), grant_type: 'refresh_token', refresh_token: decrypt(a.refreshTokenEnc) }) });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Google access expired. Press Connect Google again.');
  return { token: j.access_token, email: a.email };
}
async function api(token: string, path: string, method = 'GET', body?: any) {
  const r = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) { const e: any = new Error(j?.error?.message || `Google Sheets error ${r.status}`); e.status = r.status; throw e; }
  return j;
}

export const giveawaySheets = {
  configured: () => Boolean(cid() && csecret()),
  async status(communityId: string) { const a = await authRepository.getById(communityId).catch(() => null); return { configured: this.configured(), connected: !!a, email: a?.email || '' }; },
  connectUrl(communityId: string, userId: string, role: string) {
    if (!this.configured()) throw new Error('Google sign-in is not configured on the server yet.');
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.searchParams.set('client_id', cid()); u.searchParams.set('redirect_uri', redirect()); u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', SCOPE); u.searchParams.set('access_type', 'offline'); u.searchParams.set('prompt', 'consent');
    u.searchParams.set('state', `gws_${signState({ userId, communityId, role })}`);
    return u.toString();
  },
  /** Google redirects here after consent. */
  async callback(code: string, state: string): Promise<string> {
    try {
      const st = verifyState(String(state).replace(/^gws_/, ''));
      const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cid(), client_secret: csecret(), grant_type: 'authorization_code', code, redirect_uri: redirect() }) });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok || !j.refresh_token) return '/dashboard?sheets=failed';
      const email = JSON.parse(Buffer.from(String(j.id_token || '..').split('.')[1] || 'e30', 'base64url').toString('utf8')).email || '';
      await authRepository.upsert(st.communityId, { id: st.communityId, email, refreshTokenEnc: encrypt(j.refresh_token), connectedBy: st.userId, connectedAt: new Date().toISOString() } as any);
      return '/dashboard?sheets=connected';
    } catch (e: any) { logger.warn(`[GiveawaySheets] connect failed: ${e?.message}`); return '/dashboard?sheets=failed'; }
  },
  async disconnect(communityId: string) { await authRepository.delete(communityId).catch(() => undefined); },

  /** Checks the connected account can edit the Sheet. */
  async verify(communityId: string, sheetUrl: string) {
    const id = sheetIdFromUrl(sheetUrl);
    if (!id) throw new Error('That does not look like a Google Sheet link.');
    const { token, email } = await accessToken(communityId);
    try {
      const j = await api(token, `/${id}?fields=properties.title,sheets.properties`);
      return { id, token, email, title: j.properties?.title || '', tabs: (j.sheets || []).map((s: any) => s.properties) as { sheetId: number; title: string }[] };
    } catch (e: any) {
      if (e.status === 403 || e.status === 404) throw new Error(`The connected Google account (${email}) cannot open this Sheet. Share the Sheet with that account as Editor, or connect a different account.`);
      throw e;
    }
  },

  async ensureTabs(token: string, id: string, tabs: { sheetId: number; title: string }[], names: string[]) {
    const missing = names.filter((n) => !tabs.some((t) => t.title === n));
    if (missing.length) await api(token, `/${id}:batchUpdate`, 'POST', { requests: missing.map((title) => ({ addSheet: { properties: { title } } })) });
    const j = await api(token, `/${id}?fields=sheets.properties`);
    return (j.sheets || []).map((s: any) => s.properties) as { sheetId: number; title: string }[];
  },

  /** Rewrites both tabs from the database. Winners are highlighted; the Winners tab lists everything needed to send rewards. */
  async syncAll(communityId: string, formId: string) {
    const form = await giveawayFormsRepository.getById(formId);
    if (!form || form.communityId !== communityId) throw new Error('Form not found.');
    if (!form.sheetUrl) throw new Error('Paste a Google Sheet link in the form settings first.');
    const v = await this.verify(communityId, form.sheetUrl);
    const tabs = await this.ensureTabs(v.token, v.id, v.tabs, ['Entries', 'Winners']);
    const entries = (await giveawayEntriesRepository.listForTenant(communityId)).filter((e) => e.formId === formId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const prizes = (await giveawayPrizesRepository.listForTenant(communityId)).filter((p) => p.formId === formId);
    const prizeName = new Map(prizes.map((p) => [p.id, p.name]));
    const qs = form.questions;
    const head = ['Entered', 'Sign-in', 'Name', 'Email', 'Discord ID', 'Status', 'Won', ...qs.map((q) => q.label)];
    const row = (e: GiveawayEntry) => [e.createdAt, e.provider, e.name, e.email || '', e.discordId || '', e.status, (e.won || []).map((w) => prizeName.get(w) || '').filter(Boolean).join(', '), ...qs.map((q) => e.answers[q.id] || '')].map(safeCell);
    const wHead = ['Prize', 'Name', 'Sign-in', 'Email', 'Discord ID', ...qs.map((q) => q.label), 'Reward sent']; 
    const wRows: string[][] = [];
    for (const p of prizes.filter((p) => p.drawnAt)) for (const id of p.winners) { const e = entries.find((x) => x.id === id); if (e) wRows.push([p.name, e.name, e.provider, e.email || '', e.discordId || '', ...qs.map((q) => e.answers[q.id] || ''), ''].map(safeCell)); }
    const entriesTab = tabs.find((t) => t.title === 'Entries')!, winnersTab = tabs.find((t) => t.title === 'Winners')!;
    await api(v.token, `/${v.id}/values:batchClear`, 'POST', { ranges: ['Entries', 'Winners'] });
    await api(v.token, `/${v.id}/values:batchUpdate`, 'POST', { valueInputOption: 'RAW', data: [{ range: 'Entries!A1', values: [head, ...entries.map(row)] }, { range: 'Winners!A1', values: [wHead, ...wRows] }] });
    const requests: any[] = [
      { repeatCell: { range: { sheetId: entriesTab.sheetId, startRowIndex: 1 }, cell: { userEnteredFormat: { backgroundColor: WHITE } }, fields: 'userEnteredFormat.backgroundColor' } },
      ...entries.map((e, i) => (e.won?.length ? { repeatCell: { range: { sheetId: entriesTab.sheetId, startRowIndex: i + 1, endRowIndex: i + 2, endColumnIndex: head.length }, cell: { userEnteredFormat: { backgroundColor: GOLD } }, fields: 'userEnteredFormat.backgroundColor' } } : null)).filter(Boolean),
      ...[entriesTab, winnersTab].map((t) => ({ repeatCell: { range: { sheetId: t.sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat.bold' } })),
      ...[entriesTab, winnersTab].map((t) => ({ updateSheetProperties: { properties: { sheetId: t.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } })),
    ];
    await api(v.token, `/${v.id}:batchUpdate`, 'POST', { requests });
    return { url: `https://docs.google.com/spreadsheets/d/${v.id}`, entries: entries.length, winners: wRows.length, account: v.email };
  },

  /** Best effort, right after someone enters. Never blocks or fails the entry. */
  async appendEntry(form: GiveawayForm, e: GiveawayEntry) {
    if (!form.sheetUrl) return;
    try {
      const v = await this.verify(form.communityId, form.sheetUrl);
      const tabs = await this.ensureTabs(v.token, v.id, v.tabs, ['Entries', 'Winners']);
      void tabs;
      const first = await api(v.token, `/${v.id}/values/Entries!A1:A1`);
      const qs = form.questions;
      if (!first.values?.length) await api(v.token, `/${v.id}/values/Entries!A1?valueInputOption=RAW`, 'PUT', { values: [['Entered', 'Sign-in', 'Name', 'Email', 'Discord ID', 'Status', 'Won', ...qs.map((q) => q.label)]] });
      await api(v.token, `/${v.id}/values/Entries!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, 'POST', { values: [[e.createdAt, e.provider, e.name, e.email || '', e.discordId || '', e.status, '', ...qs.map((q) => e.answers[q.id] || '')].map(safeCell)] });
    } catch (err: any) { logger.warn(`[GiveawaySheets] append failed: ${err?.message}`); }
  },
};
void crypto; void col;
