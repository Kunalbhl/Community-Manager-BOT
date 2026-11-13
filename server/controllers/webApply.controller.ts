/** Public endpoints for applying on the website (no dashboard account needed). */
import type { Request, Response } from 'express';
import { webApply, COOKIE } from '../services/recruitment/webApply.service.js';

const ok = (res: Response, data: unknown) => res.json({ success: true, data });
const fail = (res: Response, err: any, code = 400) => res.status(code).json({ success: false, error: { message: String(err?.message || err).replace(/^[A-Z_]+:\s*/, '') } });
const cid = (req: Request) => { const c = String(req.params.communityId || ''); if (!/^[\w-]{3,64}$/.test(c)) throw new Error('Unknown server.'); return c; };
function cookie(req: Request, name: string) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) { const [k, ...v] = part.trim().split('='); if (k === name) return decodeURIComponent(v.join('=')); }
  return undefined;
}

export async function infoHandler(req: Request, res: Response) {
  try {
    const c = cid(req);
    const info = await webApply.info(c);
    const s = await webApply.session(cookie(req, COOKIE), c);
    ok(res, { ...info, session: s ? await webApply.status(s) : null });
  } catch (err) { fail(res, err); }
}

export async function loginHandler(req: Request, res: Response) {
  try { res.redirect(await webApply.loginUrl(cid(req), String(req.query.code || ''))); } catch (err) { fail(res, err); }
}

/** Called from the shared OAuth callback when the state belongs to a website applicant. */
export async function joinCallback(req: Request, res: Response) {
  try {
    if (req.query.error) return res.redirect('/join/cancelled');
    const r = await webApply.callback(String(req.query.code || ''), String(req.query.state || ''));
    if (r.token) res.cookie(COOKIE, r.token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 14 * 86_400_000, path: '/' });
    res.redirect(r.to);
  } catch { res.redirect('/join/error'); }
}

async function needSession(req: Request) {
  const s = await webApply.session(cookie(req, COOKIE), cid(req));
  if (!s) { const e: any = new Error('Please sign in with Discord again.'); e.status = 401; throw e; }
  return s;
}

export async function quizHandler(req: Request, res: Response) {
  try { ok(res, await webApply.checkQuiz(await needSession(req), req.body?.answers || {})); } catch (err: any) { fail(res, err, err.status || 400); }
}
export async function submitHandler(req: Request, res: Response) {
  try { const s = await needSession(req); await webApply.submit(s, req.body); ok(res, await webApply.status((await webApply.session(s.id, s.communityId))!)); } catch (err: any) { fail(res, err, err.status || 400); }
}
export async function logoutHandler(req: Request, res: Response) {
  res.clearCookie(COOKIE, { path: '/' });
  ok(res, { signedOut: true });
}
