/**
 * Invite rewards: what recruiters earn for the members they bring in.
 *
 * A reward rule says WHEN it is earned (a milestone, every N invites, N invites in a week or month,
 * or top recruiter of the period), WHICH invites count (joined, or still in the server after some
 * days), WHAT is given (roles, a temporary role, XP, a DM, an announcement, or something staff hand
 * out by hand) and HOW it is handled (automatically or after staff approve, and whether it is taken
 * back if the recruit leaves). Every reward given is a grant in the ledger, so nothing is given twice.
 */
import { FirestoreRepository } from '../../repositories/firestore.repository.js';
import { recruiterRecordsRepository, recruiterBenefitsRepository } from '../../repositories/index.js';
import { guildFor } from '../toolkit/toolkitConfig.js';
import { logger } from '../../logging/logger.js';

export type TriggerType = 'EACH_INVITE' | 'MILESTONE' | 'EVERY' | 'IN_PERIOD' | 'TOP_RECRUITER';
export type Period = 'WEEK' | 'MONTH';

export interface RewardRule {
  id: string;
  communityId: string;
  name: string;
  emoji: string;
  description: string;
  enabled: boolean;
  trigger: { type: TriggerType; count: number; period: Period };
  countWhen: { mode: 'JOINED' | 'STAYED'; stayDays: number };
  actions: {
    addRoleIds: string[];
    removeRoleIds: string[];
    /** 0 = keep the roles; otherwise the added roles are removed after this many days. */
    roleDays: number;
    expireDays?: number;
    xp: number;
    dmMessage: string;
    announceChannelId: string;
    announceMessage: string;
    /** Something staff give by hand (Nitro, merch, a shout-out). Always needs approval. */
    manualReward: string;
    /** Countable reward added to the recruiter's wallet (e.g. 1 Modded Heist). */
    credit?: { itemId: string; amount: number };
  };
  approval: 'AUTO' | 'STAFF';
  /** Who can approve when approval is STAFF (empty = the server's staff roles). Pinged when one is waiting. */
  approverRoleIds?: string[];
  /** Where the approval request is posted (empty = announcement channel, else the recruitment log). */
  approvalChannelId?: string;
  onLeave: 'KEEP' | 'REVOKE';
  /** For repeating rewards: most times one recruiter can get it (0 = no limit). */
  maxPerRecruiter: number;
  /** Per-invite rewards: also pay for recruits from before the rule was made. */
  includePast?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type GrantStatus = 'PENDING_APPROVAL' | 'GRANTED' | 'FAILED' | 'REJECTED' | 'REVOKED' | 'EXPIRED';
export interface RewardGrant {
  id: string;
  communityId: string;
  ruleId: string;
  ruleName: string;
  emoji: string;
  recruiterId: string;
  recruiterName: string;
  /** What made it due, e.g. "Reached 5 invites" or "Top recruiter of 2026-11". */
  reason: string;
  occurrence: string;
  inviteCount: number;
  status: GrantStatus;
  error?: string;
  roleIdsGiven?: string[];
  expiresAt?: string;
  decidedBy?: string;
  decidedAt?: string;
  manualReward?: string;
  recruiterCode?: string;
  recruitId?: string;
  recruitName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditDoc { id: string; communityId: string; recruiterId: string; delta: number; note: string; by: string; createdAt: string }

export const rewardRulesRepository = new FirestoreRepository<RewardRule>('inviteRewardRules');
export const rewardGrantsRepository = new FirestoreRepository<RewardGrant>('inviteRewardGrants');
export const inviteCreditsRepository = new FirestoreRepository<CreditDoc>('inviteCredits');

const DAY = 86_400_000;
const nowIso = () => new Date().toISOString();
const clampInt = (v: unknown, min: number, max: number, def: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const snow = (v: unknown) => typeof v === 'string' && /^\d{15,22}$/.test(v);
const ids = (v: unknown) => (Array.isArray(v) ? v.filter(snow).slice(0, 10) : []) as string[];
const txt = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

export function periodKey(d: Date, p: Period): string {
  if (p === 'MONTH') return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t.getTime() - y0.getTime()) / DAY + 1) / 7)).padStart(2, '0')}`;
}
/** The server's staff roles: review-room ranks and the roles pinged for new applications. */
export async function staffRoleIds(communityId: string): Promise<string[]> {
  const { getToolkit } = await import('../toolkit/toolkitConfig.js');
  const t: any = await getToolkit(communityId).catch(() => null);
  const list = [...(t?.reviewRooms?.tiers || []).flatMap((x: any) => x.roleIds || []), ...(t?.recruitment?.pingRoleIds || [])];
  return [...new Set(list.filter((x: any) => snow(x)))] as string[];
}

/** Staff check for reward buttons: the chosen roles, else the staff roles, else Discord staff permissions. */
export async function canApprove(communityId: string, member: any, roleIds?: string[]) {
  const p = member?.permissions;
  if (p?.has?.('ManageGuild') || p?.has?.('Administrator')) return true;
  const roles = roleIds?.length ? roleIds : await staffRoleIds(communityId);
  if (roles.length) return roles.some((id) => member?.roles?.cache?.has(id));
  return !!(p?.has?.('ManageRoles') || p?.has?.('ModerateMembers'));
}

const periodLabel = (p: Period) => (p === 'WEEK' ? 'week' : 'month');

/** Cleans a rule coming from the dashboard. */
export function sanitizeRule(b: any, cur?: Partial<RewardRule>): Omit<RewardRule, 'id' | 'communityId' | 'createdAt' | 'updatedAt'> {
  const type: TriggerType = ['EACH_INVITE', 'MILESTONE', 'EVERY', 'IN_PERIOD', 'TOP_RECRUITER'].includes(b?.trigger?.type) ? b.trigger.type : 'MILESTONE';
  const a = b?.actions || {};
  const name = txt(b?.name, 80);
  if (!name) throw new Error('Give the reward a name.');
  const actions = {
    addRoleIds: ids(a.addRoleIds), removeRoleIds: ids(a.removeRoleIds), roleDays: clampInt(a.roleDays, 0, 365, 0), expireDays: clampInt(a.expireDays, 0, 365, 0), xp: clampInt(a.xp, 0, 1_000_000, 0),
    dmMessage: txt(a.dmMessage, 1500), announceChannelId: snow(a.announceChannelId) ? a.announceChannelId : '', announceMessage: txt(a.announceMessage, 1500), manualReward: txt(a.manualReward, 200),
    credit: a.credit?.itemId && Number(a.credit.amount) > 0 ? { itemId: txt(a.credit.itemId, 64), amount: clampInt(a.credit.amount, 1, 1000, 1) } : undefined,
  };
  if (!actions.addRoleIds.length && !actions.removeRoleIds.length && !actions.xp && !actions.dmMessage && !actions.announceMessage && !actions.manualReward && !actions.credit)
    throw new Error('Choose at least one thing the recruiter gets (a wallet reward, a role, XP, a message or a reward staff hand out).');
  if (actions.announceMessage && !actions.announceChannelId) throw new Error('Pick the channel for the announcement.');
  return {
    name, emoji: txt(b?.emoji, 16) || '🎁', description: txt(b?.description, 300), enabled: b?.enabled !== false,
    trigger: { type, count: clampInt(b?.trigger?.count, 1, 10_000, type === 'TOP_RECRUITER' ? 1 : 5), period: b?.trigger?.period === 'WEEK' ? 'WEEK' : 'MONTH' },
    countWhen: { mode: b?.countWhen?.mode === 'STAYED' ? 'STAYED' : 'JOINED', stayDays: clampInt(b?.countWhen?.stayDays, 1, 90, 7) },
    actions,
    approval: b?.approval === 'STAFF' || actions.manualReward ? 'STAFF' : 'AUTO',
    approverRoleIds: ids(b?.approverRoleIds),
    approvalChannelId: snow(b?.approvalChannelId) ? b.approvalChannelId : '',
    onLeave: b?.onLeave === 'REVOKE' ? 'REVOKE' : 'KEEP',
    maxPerRecruiter: clampInt(b?.maxPerRecruiter, 0, 1000, 0),
    includePast: !!b?.includePast,
    ...(cur ? {} : {}),
  };
}

/** One plain sentence describing the rule, shown on cards and in Discord. */
export function describeRule(r: Pick<RewardRule, 'trigger' | 'countWhen'>): string {
  const n = r.trigger.count;
  const inv = (k: number) => `${k} invite${k === 1 ? '' : 's'}`;
  const when = r.trigger.type === 'EACH_INVITE' ? 'For every member they bring in' : r.trigger.type === 'MILESTONE' ? `When a recruiter reaches ${inv(n)}`
    : r.trigger.type === 'EVERY' ? `Every ${inv(n)}`
      : r.trigger.type === 'IN_PERIOD' ? `${inv(n)} within one ${periodLabel(r.trigger.period)}`
        : `Top recruiter of each ${periodLabel(r.trigger.period)}${n > 1 ? ` (at least ${inv(n)})` : ''}`;
  const counts = r.countWhen.mode === 'STAYED' ? `; an invite counts once the member has stayed ${r.countWhen.stayDays} day${r.countWhen.stayDays === 1 ? '' : 's'}` : '; an invite counts when the member joins';
  return when + counts + '.';
}

type Rec = { id?: string; recruiterCode?: string; applicantDiscordUserId?: string; applicantDisplayNameSnapshot?: string; applicantUsernameSnapshot?: string; recruiterDiscordUserId: string; recruiterDisplayNameSnapshot?: string; recruiterUsernameSnapshot?: string; joinedAt?: string; recruitmentSuccessfulAt?: string; leftAt?: string };
const joinedMs = (r: Rec) => Date.parse(r.joinedAt || r.recruitmentSuccessfulAt || '') || 0;
const counts = (r: Rec, rule: RewardRule, now: number) => !r.leftAt && (rule.countWhen.mode === 'JOINED' || now - joinedMs(r) >= rule.countWhen.stayDays * DAY);

function render(t: string, v: Record<string, string>) {
  return t.replace(/\{\{?\s*(\w+)\s*\}?\}/g, (m, k) => (k in v ? v[k] : m));
}

export const inviteRewards = {
  async listRules(communityId: string): Promise<RewardRule[]> {
    let rules = await rewardRulesRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] });
    if (!rules.length) rules = await this.migrateLegacy(communityId);
    return rules.sort((a, b) => a.trigger.count - b.trigger.count || a.createdAt.localeCompare(b.createdAt));
  },

  /** Old "incentive tiers" become milestone rules once, so nothing set up earlier is lost. */
  async migrateLegacy(communityId: string): Promise<RewardRule[]> {
    const old: any[] = await recruiterBenefitsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] }).catch(() => []);
    const out: RewardRule[] = [];
    for (const b of old) {
      if ((b as any).migratedToRules) continue;
      try {
        const clean = sanitizeRule({ name: b.name || 'Recruiter reward', description: b.description, enabled: b.isActive !== false, trigger: { type: 'MILESTONE', count: b.threshold || 1 }, actions: { addRoleIds: b.discordRoleId ? [b.discordRoleId] : [], manualReward: b.discordRoleId ? '' : (b.description || b.name) }, approval: 'STAFF' });
        out.push(await rewardRulesRepository.create({ ...clean, communityId, createdAt: nowIso(), updatedAt: nowIso() } as any));
        await recruiterBenefitsRepository.update(b.id, { migratedToRules: true } as any).catch(() => undefined);
      } catch { /* skip unusable legacy rows */ }
    }
    return out;
  },

  async records(communityId: string): Promise<Rec[]> {
    return (await recruiterRecordsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] })) as any;
  },
  async credits(communityId: string): Promise<CreditDoc[]> {
    return inviteCreditsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] });
  },
  async grants(communityId: string): Promise<RewardGrant[]> {
    return rewardGrantsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] });
  },

  /** Invites per recruiter, plus bonus credits staff gave. */
  tally(records: Rec[], credits: CreditDoc[]) {
    const by = new Map<string, { id: string; name: string; joined: number; left: number; bonus: number; recs: Rec[] }>();
    const get = (id: string, name?: string) => { let e = by.get(id); if (!e) { e = { id, name: name || id, joined: 0, left: 0, bonus: 0, recs: [] }; by.set(id, e); } if (name && e.name === id) e.name = name; return e; };
    for (const r of records) {
      if (!r.recruiterDiscordUserId || !/^\d{15,22}$/.test(String(r.recruiterDiscordUserId))) continue; // unattributed recruits earn nobody a reward
      const e = get(r.recruiterDiscordUserId, r.recruiterDisplayNameSnapshot || r.recruiterUsernameSnapshot);
      e.recs.push(r); if (r.leftAt) e.left++; else e.joined++;
    }
    for (const c of credits) get(c.recruiterId).bonus += c.delta;
    return by;
  },

  /** Checks every rule for one server and gives what is due. Safe to run any time; it never gives twice. */
  async evaluate(communityId: string, onlyRecruiter?: string) {
    const rules = (await this.listRules(communityId)).filter((r) => r.enabled);
    if (!rules.length) return { granted: 0 };
    const [records, credits, grants] = await Promise.all([this.records(communityId), this.credits(communityId), this.grants(communityId)]);
    const tally = this.tally(records, credits);
    const have = new Set(grants.map((g) => `${g.ruleId}|${g.recruiterId}|${g.occurrence}`));
    const now = Date.now();
    let granted = 0;
    for (const rule of rules) {
      const due: { recruiterId: string; name: string; occurrence: string; reason: string; count: number; code?: string; recruitId?: string; recruitName?: string }[] = [];
      if (rule.trigger.type === 'TOP_RECRUITER') {
        // Decided once the period is over: look at the previous week or month.
        const prev = new Date(rule.trigger.period === 'WEEK' ? now - 7 * DAY : Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 0, 12));
        const key = periodKey(prev, rule.trigger.period);
        if (onlyRecruiter) continue;
        let best: { id: string; name: string; n: number } | null = null; let tie = false;
        for (const e of tally.values()) {
          const n = e.recs.filter((r) => counts(r, rule, now) && periodKey(new Date(joinedMs(r)), rule.trigger.period) === key).length;
          if (n < Math.max(1, rule.trigger.count)) continue;
          if (!best || n > best.n) { best = { id: e.id, name: e.name, n }; tie = false; } else if (n === best.n) tie = true;
        }
        if (best && !tie) due.push({ recruiterId: best.id, name: best.name, occurrence: `top:${key}`, reason: `Top recruiter of ${key} with ${best.n} invites`, count: best.n });
      } else {
        for (const e of tally.values()) {
          if (onlyRecruiter && e.id !== onlyRecruiter) continue;
          const valid = e.recs.filter((r) => counts(r, rule, now));
          const total = valid.length + e.bonus;
          if (rule.trigger.type === 'EACH_INVITE') {
            const from = rule.includePast ? 0 : Date.parse(rule.createdAt) - 60_000;
            for (const r of valid) {
              if (!r.id || joinedMs(r) < from) continue;
              const nm = r.applicantDisplayNameSnapshot || r.applicantUsernameSnapshot || r.applicantDiscordUserId || 'a member';
              due.push({ recruiterId: e.id, name: e.name, occurrence: `inv:${r.id}`, reason: `Recruited ${nm}${r.recruiterCode && r.recruiterCode !== 'NONE' ? ` (code ${r.recruiterCode})` : ''}`, count: total, code: r.recruiterCode && r.recruiterCode !== 'NONE' ? r.recruiterCode : undefined, recruitId: r.applicantDiscordUserId, recruitName: nm });
            }
          } else if (rule.trigger.type === 'MILESTONE') {
            if (total >= rule.trigger.count) due.push({ recruiterId: e.id, name: e.name, occurrence: 'once', reason: `Reached ${rule.trigger.count} invite${rule.trigger.count === 1 ? '' : 's'}`, count: total });
          } else if (rule.trigger.type === 'EVERY') {
            let k = Math.floor(total / rule.trigger.count);
            if (rule.maxPerRecruiter) k = Math.min(k, rule.maxPerRecruiter);
            for (let i = 1; i <= k; i++) due.push({ recruiterId: e.id, name: e.name, occurrence: `every:${i}`, reason: `Reached ${i * rule.trigger.count} invites`, count: total });
          } else if (rule.trigger.type === 'IN_PERIOD') {
            const key = periodKey(new Date(now), rule.trigger.period);
            const n = valid.filter((r) => periodKey(new Date(joinedMs(r)), rule.trigger.period) === key).length;
            const already = grants.filter((g) => g.ruleId === rule.id && g.recruiterId === e.id && g.status !== 'REJECTED').length;
            if (n >= rule.trigger.count && (!rule.maxPerRecruiter || already < rule.maxPerRecruiter)) due.push({ recruiterId: e.id, name: e.name, occurrence: `period:${key}`, reason: `${n} invites this ${periodLabel(rule.trigger.period)}`, count: n });
          }
        }
      }
      for (const d of due) {
        const k = `${rule.id}|${d.recruiterId}|${d.occurrence}`;
        if (have.has(k)) continue;
        have.add(k);
        const gid = `${communityId}_${rule.id}_${d.recruiterId}_${d.occurrence}`.replace(/[^\w:-]/g, '_');
        if (await rewardGrantsRepository.getById(gid).catch(() => null)) continue; // another pass got here first
        const g = await rewardGrantsRepository.create({
          id: gid,
          communityId, ruleId: rule.id, ruleName: rule.name, emoji: rule.emoji, recruiterId: d.recruiterId, recruiterName: d.name,
          reason: d.reason, occurrence: d.occurrence, inviteCount: d.count, manualReward: rule.actions.manualReward || undefined, recruiterCode: d.code, recruitId: d.recruitId, recruitName: d.recruitName,
          status: rule.approval === 'STAFF' ? 'PENDING_APPROVAL' : 'GRANTED', createdAt: nowIso(), updatedAt: nowIso(),
        } as any).catch(() => null);
        if (!g) continue; // created by another pass already
        granted++;
        if (rule.approval === 'AUTO') await this.deliver(g, rule);
        else await this.notifyStaffPending(g).catch(() => undefined);
      }
      if (rule.onLeave === 'REVOKE' && rule.trigger.type !== 'TOP_RECRUITER') await this.revokeIfBelow(rule, tally, grants, now);
    }
    return { granted };
  },

  /** Takes a reward back when the invites it was given for have left. */
  async revokeIfBelow(rule: RewardRule, tally: Map<string, any>, grants: RewardGrant[], now: number) {
    for (const g of grants.filter((x) => x.ruleId === rule.id && x.status === 'GRANTED')) {
      const e = tally.get(g.recruiterId);
      const total = e ? e.recs.filter((r: Rec) => counts(r, rule, now)).length + e.bonus : 0;
      let need = rule.trigger.count;
      if (g.occurrence.startsWith('every:')) need = Number(g.occurrence.slice(6)) * rule.trigger.count;
      if (g.occurrence.startsWith('period:')) continue; // a period reward was earned at the time; keep it
      if (g.occurrence.startsWith('inv:')) {
        const rec = e?.recs.find((r: Rec) => r.id === g.occurrence.slice(4));
        if (!rec || rec.leftAt) await this.revoke(g, rule, `${g.recruitName || 'The recruit'} left the server, so this reward was taken back.`, 'system');
        continue;
      }
      if (total < need) await this.revoke(g, rule, 'Recruits left the server, so this reward was taken back.', 'system');
    }
  },

  async deliver(g: RewardGrant, rule?: RewardRule | null) {
    rule = rule || (await rewardRulesRepository.getById(g.ruleId));
    if (!rule) return rewardGrantsRepository.update(g.id, { status: 'FAILED', error: 'The reward rule was deleted.', updatedAt: nowIso() } as any);
    const problems: string[] = [];
    const guild: any = await guildFor(g.communityId);
    const member: any = guild ? await guild.members.fetch(g.recruiterId).catch(() => null) : null;
    const given: string[] = [];
    let credited = false;
    if (rule.actions.credit?.itemId) {
      try {
        const { wallet } = await import('./wallet.service.js');
        await wallet.earn({ communityId: g.communityId, itemId: rule.actions.credit.itemId, amount: rule.actions.credit.amount, grantId: g.id, memberId: g.recruiterId, memberName: member?.displayName || g.recruiterName, ruleName: rule.name, recruiterCode: g.recruiterCode, recruitId: g.recruitId, recruitName: g.recruitName });
        credited = true;
      } catch (e: any) { problems.push(`could not add to the wallet (${e?.message})`); }
    }
    const needsMember = rule.actions.addRoleIds.length > 0 || rule.actions.removeRoleIds.length > 0 || rule.actions.xp > 0 || !!rule.actions.dmMessage;
    if (!guild) problems.push('the bot is not connected to the server');
    else if (!member) problems.push('the recruiter is no longer in the server');
    else {
      for (const id of rule.actions.addRoleIds) { try { await member.roles.add(id, `Invite reward: ${rule.name}`); given.push(id); } catch (e: any) { problems.push(`could not give role ${guild.roles.cache.get(id)?.name || id} (move the bot's role above it)`); } }
      for (const id of rule.actions.removeRoleIds) await member.roles.remove(id, `Invite reward: ${rule.name}`).catch(() => problems.push(`could not remove role ${guild.roles.cache.get(id)?.name || id}`));
      if (rule.actions.xp) {
        try { const { levels } = await import('../features/levels.service.js'); await levels.grant(g.communityId, member, rule.actions.xp, null, 'message'); } catch { problems.push('could not add XP'); }
      }
      const bal = credited ? await import('./wallet.service.js').then(({ wallet }) => wallet.balance(g.communityId, g.recruiterId, rule!.actions.credit!.itemId)).catch(() => null) : null;
      const vars = { balance: bal ? String(bal.available) : '', recruit: g.recruitId ? `<@${g.recruitId}>` : '', recruitName: g.recruitName || '', code: g.recruiterCode || '', recruiter: `<@${g.recruiterId}>`, recruiterName: member.displayName || g.recruiterName, reward: `${rule.emoji} ${rule.name}`, count: String(g.inviteCount), reason: g.reason, server: guild.name, manualReward: rule.actions.manualReward || '' };
      if (rule.actions.dmMessage) await member.send({ content: render(rule.actions.dmMessage, vars).slice(0, 2000) }).catch(() => problems.push('could not DM the recruiter (their DMs are closed)'));
      if (rule.actions.announceChannelId) {
        const ch: any = guild.channels.cache.get(rule.actions.announceChannelId);
        if (!ch?.send) problems.push('the announcement channel is missing');
        else {
          // One message per recruiter: posted the first time, edited for every later reward.
          await rewardGrantsRepository.update(g.id, { status: 'GRANTED' } as any).catch(() => undefined);
          const { recruiterBoards } = await import('../recruitment/recruiterBoards.service.js');
          const okBoard = await recruiterBoards.syncRecruiter(g.communityId, g.recruiterId, ch.id, rule.actions.announceMessage ? render(rule.actions.announceMessage, vars) : undefined);
          if (!okBoard) problems.push(`could not post in <#${ch.id}>`);
        }
      } else {
        void import('../recruitment/recruiterBoards.service.js').then(({ recruiterBoards }) => recruiterBoards.refreshRecruiter(g.communityId, g.recruiterId)).catch(() => undefined);
      }
    }
    const fatal = (needsMember && (!guild || !member)) || (rule.actions.addRoleIds.length > 0 && !given.length) || (!!rule.actions.credit?.itemId && !credited);
    return rewardGrantsRepository.update(g.id, {
      status: fatal ? 'FAILED' : 'GRANTED', error: problems.length ? problems.join('; ') : '', roleIdsGiven: given,
      expiresAt: (() => {
        const days = [given.length ? rule.actions.roleDays : 0, rule.actions.expireDays || 0].filter((d) => d > 0);
        return days.length ? new Date(Date.now() + Math.min(...days) * DAY).toISOString() : undefined;
      })(),
      bonusExpiresAt: rule.actions.expireDays ? new Date(Date.now() + rule.actions.expireDays * DAY).toISOString() : undefined,
      roleExpiresAt: given.length && rule.actions.roleDays ? new Date(Date.now() + rule.actions.roleDays * DAY).toISOString() : undefined,
      xpGiven: member && rule.actions.xp ? rule.actions.xp : 0,
      updatedAt: nowIso(),
    } as any);
  },

  async revoke(g: RewardGrant, rule: RewardRule | null, why: string, by: string, status: GrantStatus = 'REVOKED') {
    const guild: any = await guildFor(g.communityId);
    const member: any = guild ? await guild.members.fetch(g.recruiterId).catch(() => null) : null;
    if (status === 'REVOKED') await import('./wallet.service.js').then(({ wallet }) => wallet.reverse(g.communityId, g.id, why)).catch(() => undefined);
    if (member) for (const id of g.roleIdsGiven || []) await member.roles.remove(id, `Invite reward ${status.toLowerCase()}: ${g.ruleName}`).catch(() => undefined);
    if (member && status === 'REVOKED' && rule) await member.send({ content: `ℹ️ Your reward **${g.emoji} ${g.ruleName}** in [**${guild.name || 'the server'}**](https://discord.com/channels/${guild.id || ''}) was taken back. ${why}` }).catch(() => undefined);
    const out = await rewardGrantsRepository.update(g.id, { status, error: why, decidedBy: by, decidedAt: nowIso(), updatedAt: nowIso() } as any);
    void import('../recruitment/recruiterBoards.service.js').then(({ recruiterBoards }) => recruiterBoards.refreshRecruiter(g.communityId, g.recruiterId)).catch(() => undefined);
    return out;
  },

  async notifyStaffPending(g: RewardGrant) {
    const rule = await rewardRulesRepository.getById(g.ruleId).catch(() => null);
    const { getToolkit } = await import('../toolkit/toolkitConfig.js');
    const cfg: any = await getToolkit(g.communityId).catch(() => null);
    const chId = rule?.approvalChannelId || rule?.actions.announceChannelId || cfg?.recruitment?.logChannelId || cfg?.recruitment?.reviewChannelId;
    const guild: any = chId ? await guildFor(g.communityId) : null;
    const ch: any = guild?.channels.cache.get(chId);
    if (!ch?.send) return;
    const roles = (rule?.approverRoleIds?.length ? rule.approverRoleIds : await staffRoleIds(g.communityId)).filter((id) => guild.roles.cache.has(id));
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    const msg = await ch.send({
      content: roles.length ? `${roles.map((r) => `<@&${r}>`).join(' ')} a reward is waiting for approval` : undefined,
      embeds: [{ title: `⏳ ${g.emoji} ${g.ruleName}`, color: 0xf59e0b, description: `<@${g.recruiterId}> earned this: ${g.reason}.${g.manualReward ? `\nTo hand out: **${g.manualReward}**` : ''}\nApprove to give it, or reject it.`, timestamp: new Date().toISOString() }],
      components: [new ActionRowBuilder<any>().addComponents(
        new ButtonBuilder().setCustomId(`cm:rg:ok:${g.id}`).setLabel('Approve').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`cm:rg:no:${g.id}`).setLabel('Reject').setEmoji('✖️').setStyle(ButtonStyle.Secondary),
      )],
      allowedMentions: { roles },
    }).catch(() => null);
    if (msg) await rewardGrantsRepository.update(g.id, { approvalChannelId: ch.id, approvalMessageId: msg.id } as any).catch(() => undefined);
  },

  /** After a decision (dashboard or button): turn the approval request into the result, no new message. */
  async closeApproval(g: any, text: string) {
    if (!g?.approvalChannelId || !g?.approvalMessageId) return;
    const guild: any = await guildFor(g.communityId);
    const msg = await guild?.channels.cache.get(g.approvalChannelId)?.messages.fetch(g.approvalMessageId).catch(() => null);
    if (!msg) return;
    const e = msg.embeds?.[0]?.toJSON?.() || {};
    await msg.edit({ content: null, embeds: [{ ...e, title: String(e.title || '').replace(/^⏳/, text.startsWith('✅') ? '✅' : '✖️'), color: text.startsWith('✅') ? 0x7fe0b0 : 0x94a3b8, description: `${String(e.description || '').split('\nApprove to give it')[0]}\n\n${text}` }], components: [], allowedMentions: { parse: [] } }).catch(() => undefined);
  },

  /** Approve / Reject from Discord. */
  async decideFromDiscord(grantId: string, approve: boolean, member: any) {
    const g: any = await rewardGrantsRepository.getById(grantId).catch(() => null);
    if (!g) throw new Error('This reward no longer exists.');
    const rule = await rewardRulesRepository.getById(g.ruleId).catch(() => null);
    if (!(await canApprove(g.communityId, member, rule?.approverRoleIds))) throw new Error('Only the approvers of this reward can decide.');
    if (!['PENDING_APPROVAL', 'FAILED'].includes(g.status)) throw new Error(`Already handled${g.decidedBy ? ` by ${g.decidedBy}` : ''}.`);
    await rewardGrantsRepository.update(g.id, { decidedBy: member.displayName || member.user?.username, decidedAt: nowIso() } as any);
    if (approve) {
      const out: any = await this.deliver(g, rule);
      await this.closeApproval(g, out?.status === 'FAILED' ? `⚠️ Approved by <@${member.id}>, but: ${out.error}` : `✅ Approved by <@${member.id}>.`);
      return out?.status === 'FAILED' ? `Approved, but: ${out.error}` : 'Approved and given.';
    }
    await rewardGrantsRepository.update(g.id, { status: 'REJECTED', error: 'Rejected by staff.', updatedAt: nowIso() } as any);
    await this.closeApproval(g, `✖️ Rejected by <@${member.id}>.`);
    return 'Rejected.';
  },

  /** Removes temporary roles that have run out. */
  async expireRoles() {
    const now = Date.now();
    const all = await rewardGrantsRepository.list({ where: [{ field: 'status', operator: '==', value: 'GRANTED' }] });
    for (const g of all as any[]) {
      const roleDue = (g.roleExpiresAt ? Date.parse(g.roleExpiresAt) <= now : !g.bonusExpiresAt && g.expiresAt && Date.parse(g.expiresAt) <= now) && (g.roleIdsGiven || []).length && !g.rolesExpired;
      const bonusDue = g.bonusExpiresAt && Date.parse(g.bonusExpiresAt) <= now && !g.bonusExpired;
      if (!roleDue && !bonusDue) continue;
      const guild: any = await guildFor(g.communityId).catch(() => null);
      const member: any = guild ? await guild.members.fetch(g.recruiterId).catch(() => null) : null;
      const patch: any = { updatedAt: nowIso() };
      if (roleDue) {
        if (member) for (const id of g.roleIdsGiven || []) await member.roles.remove(id, `Invite reward ended: ${g.ruleName}`).catch(() => undefined);
        patch.rolesExpired = true;
      }
      if (bonusDue) {
        await import('./wallet.service.js').then(({ wallet }) => wallet.reverse(g.communityId, g.id, `The temporary bonus “${g.ruleName}” ended.`)).catch(() => undefined);
        if (member && g.xpGiven) await import('../features/levels.service.js').then(({ levels }) => levels.grant(g.communityId, member, -g.xpGiven, null, 'message')).catch(() => undefined);
        patch.bonusExpired = true;
      }
      const done = (patch.rolesExpired || g.rolesExpired || !(g.roleIdsGiven || []).length || !g.roleExpiresAt) && (patch.bonusExpired || g.bonusExpired || !g.bonusExpiresAt);
      if (done) patch.status = 'EXPIRED';
      await rewardGrantsRepository.update(g.id, patch).catch(() => undefined);
      void import('../recruitment/recruiterBoards.service.js').then(({ recruiterBoards }) => recruiterBoards.refreshRecruiter(g.communityId, g.recruiterId)).catch(() => undefined);
    }
  },

  /** A recruit left the server: mark it so it stops counting, then re-check that recruiter. */
  async onMemberLeft(communityId: string, userId: string) {
    const recs: any[] = await recruiterRecordsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }, { field: 'applicantDiscordUserId', operator: '==', value: userId }] });
    for (const r of recs) {
      if (r.leftAt) continue;
      await recruiterRecordsRepository.update(r.id, { leftAt: nowIso() } as any).catch(() => undefined);
      await this.evaluate(communityId, r.recruiterDiscordUserId).catch((e) => logger.warn(`[InviteRewards] leave re-check: ${e?.message}`));
    }
  },
  /** The recruit came back: they count again. */
  async onMemberJoined(communityId: string, userId: string) {
    const recs: any[] = await recruiterRecordsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }, { field: 'applicantDiscordUserId', operator: '==', value: userId }] });
    for (const r of recs.filter((x) => x.leftAt)) {
      await recruiterRecordsRepository.update(r.id, { leftAt: null } as any).catch(() => undefined);
      await this.evaluate(communityId, r.recruiterDiscordUserId).catch(() => undefined);
    }
  },

  /** Progress for one recruiter, used by the leaderboard and /myrewards. */
  progress(rules: RewardRule[], e: { recs: Rec[]; bonus: number }, grants: RewardGrant[], recruiterId: string) {
    const now = Date.now();
    return rules.filter((r) => r.enabled && r.trigger.type !== 'TOP_RECRUITER' && r.trigger.type !== 'EACH_INVITE').map((rule) => {
      const valid = e.recs.filter((r) => counts(r, rule, now));
      const waiting = e.recs.filter((r) => !r.leftAt && !counts(r, rule, now)).length;
      let have = valid.length + e.bonus;
      let target = rule.trigger.count;
      if (rule.trigger.type === 'EVERY') { const done = Math.floor(have / target); target = (done + 1) * target; }
      if (rule.trigger.type === 'IN_PERIOD') have = valid.filter((r) => periodKey(new Date(joinedMs(r)), rule.trigger.period) === periodKey(new Date(now), rule.trigger.period)).length;
      const got = grants.some((g) => g.ruleId === rule.id && g.recruiterId === recruiterId && ['GRANTED', 'PENDING_APPROVAL'].includes(g.status) && (rule.trigger.type === 'MILESTONE' || (rule.trigger.type === 'IN_PERIOD' && g.occurrence === `period:${periodKey(new Date(now), rule.trigger.period)}`)));
      return { ruleId: rule.id, name: rule.name, emoji: rule.emoji, have, target, waiting, stayDays: rule.countWhen.mode === 'STAYED' ? rule.countWhen.stayDays : 0, done: got };
    });
  },
};
