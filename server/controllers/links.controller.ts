import { Request, Response, NextFunction } from 'express';
import { links, isKind } from '../services/links.service.js';
import { BadRequestError } from '../utils/errors.js';

function cid(req: Request): string {
  const c = req.header('x-community-id') || req.user?.communityId;
  if (!c) throw new BadRequestError('Community tenant context is missing.');
  return c;
}
const ref = (v: any) => {
  if (!isKind(v?.type) || !v?.id) throw new BadRequestError('Pick what to link.');
  return { type: v.type, id: String(v.id).slice(0, 120) };
};

export async function listLinks(req: Request, res: Response, next: NextFunction) {
  try {
    const t = req.query.type, id = String(req.query.id || '');
    if (!isKind(t) || !id) throw new BadRequestError('Missing item.');
    res.json({ success: true, items: await links.list(cid(req), t, id) });
  } catch (e) { next(e); }
}
export async function linkOptions(req: Request, res: Response, next: NextFunction) {
  try {
    const t = req.query.type;
    if (!isKind(t)) throw new BadRequestError('Unknown type.');
    res.json({ success: true, items: await links.options(cid(req), t) });
  } catch (e) { next(e); }
}
export async function createLink(req: Request, res: Response, next: NextFunction) {
  try {
    const l = await links.link(cid(req), ref(req.body?.a), ref(req.body?.b), (req.user as any)?.id);
    res.json({ success: true, link: l });
  } catch (e: any) { next(e instanceof BadRequestError ? e : new BadRequestError(e?.message || 'Could not link.')); }
}
export async function deleteLink(req: Request, res: Response, next: NextFunction) {
  try {
    await links.unlink(cid(req), req.params.linkId);
    res.json({ success: true });
  } catch (e: any) { next(new BadRequestError(e?.message || 'Could not unlink.')); }
}
