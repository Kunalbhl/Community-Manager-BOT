/**
 * Real Google OAuth + Calendar API client (no extra dependencies; uses fetch).
 *
 * - OAuth "state" is HMAC-signed and expires, so nobody can forge a callback for another user.
 * - Refresh tokens are encrypted at rest (AES-256-GCM, key derived from SESSION_SECRET).
 * - Access tokens are refreshed automatically.
 */
import crypto from 'crypto';
import { config } from '../../config/env.js';
import { logger } from '../../logging/logger.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const CAL = 'https://www.googleapis.com/calendar/v3';
export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.readonly'];

export const googleClientId = () => (process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || '').trim();
const googleClientSecret = () => (process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
export const googleOAuthConfigured = () => Boolean(googleClientId() && googleClientSecret());

export function googleRedirectUri(): string {
  const base = (config.APP_URL || 'https://community-manager-bot-720940628402.asia-southeast1.run.app').replace(/\/$/, '');
  return `${base}/api/v1/calendar/oauth/callback`;
}

function secretKey(): Buffer {
  return crypto.createHash('sha256').update(String(config.SESSION_SECRET || 'cm-dev-secret')).digest();
}

// ---------- signed state ----------
export interface OAuthStatePayload { userId: string; communityId: string; role: string; exp: number; nonce: string }

export function signState(p: Omit<OAuthStatePayload, 'exp' | 'nonce'>): string {
  const payload: OAuthStatePayload = { ...p, exp: Date.now() + 10 * 60 * 1000, nonce: crypto.randomBytes(8).toString('hex') };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secretKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyState(state: string): OAuthStatePayload {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) throw new Error('INVALID_STATE');
  const expected = crypto.createHmac('sha256', secretKey()).update(body).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new Error('INVALID_STATE');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthStatePayload;
  if (!payload.exp || payload.exp < Date.now()) throw new Error('STATE_EXPIRED');
  return payload;
}

// ---------- token encryption ----------
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv.toString('base64url'), c.getAuthTag().toString('base64url'), enc.toString('base64url')].join('.');
}

export function decrypt(blob: string): string {
  const [iv, tag, enc] = blob.split('.');
  const d = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
}

// ---------- OAuth ----------
export function buildAuthorizeUrl(state: string): string {
  const q = new URLSearchParams({
    client_id: googleClientId(),
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_URL}?${q.toString()}`;
}

export interface GoogleTokens { accessToken: string; expiresAt: number; refreshToken?: string; email?: string }

async function tokenRequest(body: Record<string, string>): Promise<any> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: googleClientId(), client_secret: googleClientSecret(), ...body }).toString(),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(`GOOGLE_TOKEN_ERROR: ${json.error || res.status} ${json.error_description || ''}`.trim());
    err.googleError = json.error;
    throw err;
  }
  return json;
}

export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const j = await tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: googleRedirectUri() });
  let email: string | undefined;
  if (j.id_token) {
    try { email = JSON.parse(Buffer.from(String(j.id_token).split('.')[1], 'base64url').toString('utf8')).email; } catch { /* optional */ }
  }
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000, email };
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const j = await tokenRequest({ refresh_token: refreshToken, grant_type: 'refresh_token' });
  return { accessToken: j.access_token, expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
}

export async function revokeToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => undefined);
}

// ---------- Calendar ----------
async function cal(accessToken: string, method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${CAL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(`GOOGLE_CALENDAR_ERROR: ${res.status} ${json?.error?.message || ''}`.trim());
    err.status = res.status;
    throw err;
  }
  return json;
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  timeZone?: string;
  reminderMinutes?: number[];
  sourceUrl?: string;
}

function eventBody(e: CalendarEventInput) {
  return {
    summary: e.summary,
    description: e.description,
    start: { dateTime: e.start.toISOString(), timeZone: e.timeZone || 'UTC' },
    end: { dateTime: e.end.toISOString(), timeZone: e.timeZone || 'UTC' },
    reminders: { useDefault: false, overrides: (e.reminderMinutes || [10]).map((m) => ({ method: 'popup', minutes: m })) },
    ...(e.sourceUrl ? { source: { title: 'Community Manager', url: e.sourceUrl } } : {}),
  };
}

export const calendarApi = {
  insertEvent: (token: string, calendarId: string, e: CalendarEventInput) =>
    cal(token, 'POST', `/calendars/${encodeURIComponent(calendarId)}/events`, eventBody(e)) as Promise<{ id: string; htmlLink: string }>,
  patchEvent: (token: string, calendarId: string, eventId: string, e: CalendarEventInput) =>
    cal(token, 'PATCH', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, eventBody(e)) as Promise<{ id: string; htmlLink: string }>,
  deleteEvent: (token: string, calendarId: string, eventId: string) =>
    cal(token, 'DELETE', `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`).catch((err: any) => {
      if (err.status === 404 || err.status === 410) return null; // already gone
      throw err;
    }),
  listCalendars: async (token: string) => {
    const j = await cal(token, 'GET', '/users/me/calendarList?minAccessRole=writer');
    return (j.items || []).map((c: any) => ({ id: c.id, summary: c.summaryOverride || c.summary, isPrimary: Boolean(c.primary), timeZone: c.timeZone, accessRole: c.accessRole }));
  },
};

export function logGoogleError(where: string, err: any) {
  logger.warn(`[GoogleCalendar] ${where} failed: ${err?.message || err}`);
}
