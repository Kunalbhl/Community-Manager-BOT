/** Dashboard API for invite rewards (rules, the ledger, the leaderboard and bonus credits). */
import type { Request, Response } from 'express';
import { inviteRewards, rewardRulesRepository, rewardGrantsRepository, inviteCreditsRepository, sanitizeRule, describeRule } from '../services/rewards/inviteRewards.service.js';

const ok = (res: Response, data: unknown) => res.json({ success: true, data });
const fail = (res: Response, err: any, code = 400) => res.status(code).json({ success: false, error: { message: err?.message || String(err) } });
const who = (req: Request) => (req as any).user?.username || (req as any).user?.userId || 'staff';

export async function overviewHandler(req: Request, res: Response) {
  try {
    const c = req.params.communityId;
    const [rules, records, credits, grants] = await Promise.all([inviteRewards.listRules(c), inviteRewards.records(c), inviteRewards.credits(c), inviteRewards.grants(c)]);
    const tally = inviteRewards.tally(records, credits);
    const leaderboard = Array.from(tally.values()).map((e) => ({
      recruiterId: e.id, name: e.name, joined: e.joined, left: e.left, bonus: e.bonus,
      rewards: grants.filter((g) => g.recruiterId === e.id && g.status === 'GRANTED').length,
      progress: inviteRewards.progress(rules, e, grants, e.id),
    })).sort((a, b) => b.joined + b.bonus - (a.joined + a.bonus));
    ok(res, {
      rules: rules.map((r) => ({ ...r, summary: describeRule(r) })),
      grants: grants.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 300),
      leaderboard,
      credits: credits.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100),
    });
  } catch (err) { fail(res, err); }
}

export async function createRuleHandler(req: Request, res: Response) {
  try {
    const now = new Date().toISOString();
    const rule = await rewardRulesRepository.create({ ...sanitizeRule(req.body), communityId: req.params.communityId, createdAt: now, updatedAt: now } as any);
    inviteRewards.evaluate(req.params.communityId).catch(() => undefined);
    ok(res, rule);
  } catch (err) { fail(res, err); }
}

async function ownRule(req: Request) {
  const r = await rewardRulesRepository.getById(req.params.ruleId);
  if (!r || r.communityId !== req.params.communityId) throw new Error('Reward not found.');
  return r;
}

export async function updateRuleHandler(req: Request, res: Response) {
  try {
    const cur = await ownRule(req);
    const patch = req.body && Object.keys(req.body).length === 1 && 'enabled' in req.body ? { enabled: !!req.body.enabled } : sanitizeRule(req.body, cur);
    const rule = await rewardRulesRepository.update(cur.id, { ...patch, updatedAt: new Date().toISOString() } as any);
    inviteRewards.evaluate(req.params.communityId).catch(() => undefined);
    ok(res, rule);
  } catch (err) { fail(res, err); }
}

export async function deleteRuleHandler(req: Request, res: Response) {
  try { const r = await ownRule(req); await rewardRulesRepository.delete(r.id); ok(res, { deleted: true }); } catch (err) { fail(res, err); }
}

export async function grantActionHandler(req: Request, res: Response) {
  try {
    const g = await rewardGrantsRepository.getById(req.params.grantId);
    if (!g || g.communityId !== req.params.communityId) throw new Error('Reward not found.');
    const rule = await rewardRulesRepository.getById(g.ruleId);
    const action = req.params.action;
    const note = String(req.body?.note || '').slice(0, 300);
    if (action === 'approve' || action === 'retry') {
      if (!['PENDING_APPROVAL', 'FAILED'].includes(g.status)) throw new Error('This reward was already handled.');
      await rewardGrantsRepository.update(g.id, { decidedBy: who(req), decidedAt: new Date().toISOString() } as any);
      ok(res, await inviteRewards.deliver(g, rule));
    } else if (action === 'reject') {
      if (g.status !== 'PENDING_APPROVAL' && g.status !== 'FAILED') throw new Error('Only waiting or failed rewards can be rejected.');
      ok(res, await rewardGrantsRepository.update(g.id, { status: 'REJECTED', error: note || 'Rejected by staff.', decidedBy: who(req), decidedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } as any));
    } else if (action === 'revoke') {
      if (g.status !== 'GRANTED') throw new Error('Only given rewards can be taken back.');
      ok(res, await inviteRewards.revoke(g, rule, note || 'Taken back by staff.', who(req)));
    } else throw new Error('Unknown action.');
  } catch (err) { fail(res, err); }
}

export async function creditHandler(req: Request, res: Response) {
  try {
    const recruiterId = String(req.body?.recruiterId || '');
    const delta = Math.round(Number(req.body?.delta));
    if (!/^\d{15,22}$/.test(recruiterId)) throw new Error('Pick the recruiter.');
    if (!delta || Math.abs(delta) > 1000) throw new Error('Enter how many invites to add (or a minus number to remove).');
    const note = String(req.body?.note || '').trim().slice(0, 200);
    if (!note) throw new Error('Add a short reason, so the history makes sense later.');
    const doc = await inviteCreditsRepository.create({ communityId: req.params.communityId, recruiterId, delta, note, by: who(req), createdAt: new Date().toISOString() } as any);
    await inviteRewards.evaluate(req.params.communityId, recruiterId);
    ok(res, doc);
  } catch (err) { fail(res, err); }
}

export async function evaluateHandler(req: Request, res: Response) {
  try { ok(res, await inviteRewards.evaluate(req.params.communityId)); } catch (err) { fail(res, err); }
}
