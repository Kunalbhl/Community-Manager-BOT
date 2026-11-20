import type { Request, Response, NextFunction } from 'express';
import { giveawayForms, GW_COOKIE } from '../services/giveawayForms.service.js';
import { BadRequestError } from '../utils/errors.js';

const ok = (res: Response, data: unknown) => res.json({ success: true, data });
const fail = (res: Response, err: any, code = 400) => res.status(code).json({ success: false, error: { message: String(err?.message || err).replace(/^[A-Z_]+:\s*/, '') } });
function cookie(req: Request, name: string) {
  for (const part of (req.headers.cookie || '').split(';')) { const [k, ...v] = part.trim().split('='); if (k === name) return decodeURIComponent(v.join('=')); }
  return undefined;
}
function cid(req: Request): string {
  const c = req.header('x-community-id') || req.user?.communityId;
  if (!c) throw new BadRequestError('Community tenant context is missing.');
  return c;
}
const wrap = (fn: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response, next: NextFunction) => {
  try { await fn(req, res); } catch (e: any) { next(e instanceof BadRequestError ? e : new BadRequestError(e?.message || 'Something went wrong.')); }
};

/* ---------------- staff ---------------- */
export const listForms = wrap(async (req, res) => { res.json({ success: true, forms: await giveawayForms.list(cid(req)) }); });
export const saveForm = wrap(async (req, res) => { res.json({ success: true, form: await giveawayForms.save(cid(req), req.body || {}, (req.user as any)?.id, req.params.formId) }); });
export const setFormStatus = wrap(async (req, res) => {
  const s = String(req.body?.status || '');
  if (!['DRAFT', 'OPEN', 'CLOSED'].includes(s)) throw new BadRequestError('Unknown status.');
  res.json({ success: true, form: await giveawayForms.setStatus(cid(req), req.params.formId, s as any) });
});
export const deleteForm = wrap(async (req, res) => { await giveawayForms.remove(cid(req), req.params.formId); res.json({ success: true }); });
export const formEntries = wrap(async (req, res) => { res.json({ success: true, ...(await giveawayForms.entries(cid(req), req.params.formId)) }); });
export const formCsv = wrap(async (req, res) => {
  const csv = await giveawayForms.csv(cid(req), req.params.formId);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="giveaway-entries.csv"'); res.send('﻿' + csv);
});

/* ---------------- public ---------------- */
export async function publicInfo(req: Request, res: Response) {
  try { const slug = req.params.slug; ok(res, await giveawayForms.publicInfo(slug, await giveawayForms.session(cookie(req, GW_COOKIE), slug))); } catch (e) { fail(res, e, 404); }
}
export async function publicLogin(req: Request, res: Response) {
  try { const p = req.params.provider === 'google' ? 'google' : 'discord'; res.redirect(await giveawayForms.loginUrl(req.params.slug, p)); } catch (e) { fail(res, e); }
}
/** Shared by the Discord callback (via auth.controller) and the Google callback route. */
export async function signInCallback(req: Request, res: Response) {
  try {
    if (req.query.error) return res.redirect('/');
    if (String(req.query.state || '').startsWith('gws_')) { const { giveawaySheets } = await import('../services/giveawaySheets.service.js'); return res.redirect(await giveawaySheets.callback(String(req.query.code || ''), String(req.query.state))); }
    const r = await giveawayForms.callback(String(req.query.code || ''), String(req.query.state || ''));
    if (r.token) res.cookie(GW_COOKIE, r.token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 24 * 3600_000, path: '/' });
    res.redirect(r.to);
  } catch { res.redirect('/'); }
}
export async function publicSubmit(req: Request, res: Response) {
  try {
    const slug = req.params.slug;
    const s = await giveawayForms.session(cookie(req, GW_COOKIE), slug);
    if (!s) return fail(res, new Error('Please sign in again.'), 401);
    await giveawayForms.submit(slug, s, req.body?.answers || {});
    res.clearCookie(GW_COOKIE, { path: '/' });
    ok(res, { entered: true });
  } catch (e) { fail(res, e); }
}
export async function publicLogout(req: Request, res: Response) { res.clearCookie(GW_COOKIE, { path: '/' }); ok(res, { signedOut: true }); }

/* ---------------- prizes and draws (staff) ---------------- */
import { giveawayDraw } from '../services/giveawayDraw.service.js';
export const listPrizes = wrap(async (req, res) => { res.json({ success: true, prizes: await giveawayDraw.prizes(cid(req), req.params.formId) }); });
export const savePrize = wrap(async (req, res) => { res.json({ success: true, prize: await giveawayDraw.savePrize(cid(req), req.params.formId, req.body || {}, req.params.prizeId) }); });
export const deletePrize = wrap(async (req, res) => { await giveawayDraw.deletePrize(cid(req), req.params.prizeId); res.json({ success: true }); });
export const drawPrizes = wrap(async (req, res) => {
  const ids = Array.isArray(req.body?.prizeIds) ? req.body.prizeIds.map(String).slice(0, 100) : [];
  res.json({ success: true, report: await giveawayDraw.draw(cid(req), req.params.formId, ids, (req.user as any)?.id) });
});
export const replaceWinner = wrap(async (req, res) => { res.json({ success: true, report: await giveawayDraw.replaceWinner(cid(req), req.params.prizeId, String(req.body?.entryId || ''), !!req.body?.disqualify) }); });
export const entryStatus = wrap(async (req, res) => {
  const s = String(req.body?.status || '');
  if (!['VALID', 'DISQUALIFIED'].includes(s)) throw new BadRequestError('Unknown status.');
  await giveawayDraw.setEntryStatus(cid(req), req.params.entryId, s as any); res.json({ success: true });
});
export const formReport = wrap(async (req, res) => { res.json({ success: true, report: await giveawayDraw.report(cid(req), req.params.formId) }); });
export const announceResult = wrap(async (req, res) => { res.json({ success: true, ...(await giveawayDraw.announce(cid(req), req.params.formId)) }); });

/* ---------------- Google Sheet connection (staff) ---------------- */
import { giveawaySheets } from '../services/giveawaySheets.service.js';
export const sheetStatus = wrap(async (req, res) => { res.json({ success: true, ...(await giveawaySheets.status(cid(req))) }); });
export const sheetConnect = wrap(async (req, res) => { res.json({ success: true, url: giveawaySheets.connectUrl(cid(req), String((req.user as any)?.id || ''), String((req.user as any)?.role || '')) }); });
export const sheetDisconnect = wrap(async (req, res) => { await giveawaySheets.disconnect(cid(req)); res.json({ success: true }); });
export const sheetSync = wrap(async (req, res) => { res.json({ success: true, ...(await giveawaySheets.syncAll(cid(req), req.params.formId)) }); });
