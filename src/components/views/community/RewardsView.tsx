import { EmojiField } from '../../common/EmojiField.js';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, Wallet, CheckCircle2, Clock, Gift, Pencil, Plus, RefreshCw, Trash2, Trophy, Undo2, X, XCircle } from 'lucide-react';
import { ChannelSelect, MemberName, MemberSelect, RoleSelect, useDiscordResources } from '../../common/DiscordPickers.js';
import { TemplateField, TemplateVar } from '../../common/TemplateField.js';
import { Card, useApi } from './ServerToolsView.js';
import { RewardWallet } from './RewardWallet.js';

/** Variables reward messages understand. */
const REWARD_VARS: TemplateVar[] = [
  { token: 'recruiter', label: '@Recruiter', sample: '@Kunal' },
  { token: 'recruiterName', label: 'Recruiter name', sample: 'Kunal' },
  { token: 'reward', label: 'Reward', sample: '🥈 Silver Recruiter' },
  { token: 'count', label: 'Invite count', sample: '5' },
  { token: 'reason', label: 'Why', sample: 'Reached 5 invites' },
  { token: 'server', label: 'Server name', sample: 'Bharat Esports' },
  { token: 'manualReward', label: 'Hand-out reward', sample: 'Discord Nitro (1 month)' },
  { token: 'recruit', label: '@New member', sample: '@Rahul' },
  { token: 'recruitName', label: 'New member name', sample: 'Rahul' },
  { token: 'code', label: 'Code used', sample: 'KUN-007' },
  { token: 'balance', label: 'Balance', sample: '3' },
];

type Trigger = 'EACH_INVITE' | 'MILESTONE' | 'EVERY' | 'IN_PERIOD' | 'TOP_RECRUITER';
const TRIGGERS: { id: Trigger; title: string; hint: string; icon: string }[] = [
  { id: 'EACH_INVITE', title: 'Every member they bring', hint: 'Each recruit earns it, e.g. 1 Modded Heist per member. Best with a wallet item, so it adds up and can be used later.', icon: '➕' },
  { id: 'MILESTONE', title: 'Milestone', hint: 'Once, when a recruiter reaches a total. Good for rank roles like Bronze, Silver, Gold.', icon: '🏅' },
  { id: 'EVERY', title: 'Every N invites', hint: 'Repeats: every 3rd, 6th, 9th invite and so on. Good for XP or small perks.', icon: '🔁' },
  { id: 'IN_PERIOD', title: 'Streak in a week or month', hint: 'N invites inside one week or month. Rewards bursts of activity; resets each period.', icon: '🔥' },
  { id: 'TOP_RECRUITER', title: 'Top recruiter', hint: 'Given after each week or month ends to whoever brought the most members. Ties get nothing.', icon: '👑' },
];

const BLANK = {
  name: '', emoji: '🎁', description: '', enabled: true,
  trigger: { type: 'MILESTONE' as Trigger, count: 5, period: 'MONTH' },
  countWhen: { mode: 'STAYED', stayDays: 7 },
  actions: { addRoleIds: [] as string[], removeRoleIds: [] as string[], roleDays: 0, xp: 0, expireDays: 0, dmMessage: '', announceChannelId: '', announceMessage: '', manualReward: '', credit: { itemId: '', amount: 1 } },
  approval: 'AUTO', onLeave: 'REVOKE', maxPerRecruiter: 0,
};

/** Ready-made rewards to start from; every field can be changed before saving. */
const PRESETS: { label: string; rule: any }[] = [
  { label: '➕ 1 wallet item per recruit (e.g. Modded Heist)', rule: { ...BLANK, name: 'Reward per recruit', emoji: '➕', trigger: { type: 'EACH_INVITE', count: 1, period: 'MONTH' }, countWhen: { mode: 'STAYED', stayDays: 3 }, onLeave: 'REVOKE', actions: { ...BLANK.actions, dmMessage: '➕ Thanks {recruiter}! {recruitName} joined, so you earned 1 more. You now have **{balance}**. Use them with /reward use.' } } },
  { label: '🙌 First invite thank-you', rule: { ...BLANK, name: 'First invite', emoji: '🙌', trigger: { type: 'MILESTONE', count: 1, period: 'MONTH' }, countWhen: { mode: 'JOINED', stayDays: 7 }, onLeave: 'KEEP', actions: { ...BLANK.actions, dmMessage: 'Thank you {recruiter}! Your first invite just joined **{server}**. Keep going, there are more rewards ahead. Type /myrewards to see them.' } } },
  { label: '🥈 Rank role at 15 invites', rule: { ...BLANK, name: 'Silver Recruiter', emoji: '🥈', trigger: { type: 'MILESTONE', count: 15, period: 'MONTH' }, actions: { ...BLANK.actions, announceMessage: '🎉 {recruiter} just earned **{reward}** for bringing {count} members to {server}!' } } },
  { label: '⭐ 250 XP every 3 invites', rule: { ...BLANK, name: 'Invite XP', emoji: '⭐', trigger: { type: 'EVERY', count: 3, period: 'MONTH' }, actions: { ...BLANK.actions, xp: 250, dmMessage: '⭐ You got 250 XP for {count} invites. Thank you!' } } },
  { label: '🔥 Hot streak: 5 in a week', rule: { ...BLANK, name: 'Hot streak', emoji: '🔥', trigger: { type: 'IN_PERIOD', count: 5, period: 'WEEK' }, onLeave: 'KEEP', actions: { ...BLANK.actions, roleDays: 7, announceMessage: '🔥 {recruiter} is on fire: {reason}!' } } },
  { label: '👑 Recruiter of the month', rule: { ...BLANK, name: 'Recruiter of the month', emoji: '👑', trigger: { type: 'TOP_RECRUITER', count: 3, period: 'MONTH' }, onLeave: 'KEEP', approval: 'STAFF', actions: { ...BLANK.actions, roleDays: 30, manualReward: 'Discord Nitro (1 month)', announceMessage: '👑 Congratulations {recruiter}, our **Recruiter of the month** with {count} invites!' } } },
];

const STATUS: Record<string, { label: string; cls: string }> = {
  PENDING_APPROVAL: { label: 'Waiting for approval', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  GRANTED: { label: 'Given', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  FAILED: { label: 'Failed', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  REJECTED: { label: 'Rejected', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  REVOKED: { label: 'Taken back', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  EXPIRED: { label: 'Role ended', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const input = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200';
const btn = 'inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition';
const primary = `${btn} bg-indigo-600 text-white hover:bg-indigo-700`;
const ghost = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;

type Sub = 'rules' | 'wallet' | 'queue' | 'board' | 'history';

export function RewardsView({ communityId }: { communityId: string }) {
  const api = useApi(communityId);
  const res: any = useDiscordResources(communityId);
  const [data, setData] = useState<any>(null);
  const [sub, setSub] = useState<Sub>('rules');
  const [editing, setEditing] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };
  const load = useCallback(() => api('/rewards').then(setData).catch((e) => { setData({ rules: [], grants: [], leaderboard: [], credits: [] }); flash(false, e.message); }), [api]);
  useEffect(() => { load(); }, [load]);

  const waiting = useMemo(() => (data?.grants || []).filter((g: any) => g.status === 'PENDING_APPROVAL' || g.status === 'FAILED'), [data]);
  const roleName = (id: string) => res?.roles?.find((r: any) => r.id === id)?.name || 'deleted role';

  const act = async (g: any, action: string) => {
    let note = '';
    if (action === 'reject' || action === 'revoke') { note = window.prompt(action === 'reject' ? 'Why is it rejected? (the recruiter is not told)' : 'Why take it back? (sent to the recruiter)') ?? ''; if (note === null) return; }
    try { await api(`/rewards/grants/${g.id}/${action}`, 'POST', { note }); flash(true, action === 'approve' ? 'Reward given.' : action === 'retry' ? 'Tried again.' : action === 'reject' ? 'Rejected.' : 'Taken back.'); load(); } catch (e: any) { flash(false, e.message); }
  };

  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />;
  const tabs: { id: Sub; label: string; icon: any; n?: number }[] = [
    { id: 'rules', label: 'Rewards', icon: Gift, n: data.rules.length },
    { id: 'wallet', label: 'Wallet & balances', icon: Wallet },
    { id: 'queue', label: 'Needs action', icon: Clock, n: waiting.length },
    { id: 'board', label: 'Leaderboard', icon: Trophy },
    { id: 'history', label: 'History', icon: Award },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setSub(t.id)} className={`${btn} ${sub === t.id ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
            <t.icon className="h-4 w-4" />{t.label}{t.n ? <span className={`rounded-full px-1.5 text-xs ${sub === t.id ? 'bg-white/20' : t.id === 'queue' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100'}`}>{t.n}</span> : null}
          </button>
        ))}
        <button className={`${ghost} ml-auto`} onClick={async () => { try { const r = await api('/rewards/evaluate', 'POST'); flash(true, `${r.credited ? `${r.credited} missed recruit${r.credited === 1 ? '' : 's'} credited. ` : ''}${r.granted ? `${r.granted} new reward${r.granted === 1 ? '' : 's'} given.` : r.credited ? '' : 'Everyone is up to date.'}`); load(); } catch (e: any) { flash(false, e.message); } }}><RefreshCw className="h-4 w-4" />Check now</button>
      </div>
      {msg && <p className={`flex items-center gap-2 text-sm font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{msg.text}</p>}

      {sub === 'rules' && (
        <Card title="Invite rewards" desc="What recruiters earn for the members they bring in. The bot checks after every join, when someone leaves, and every 15 minutes, and never gives the same reward twice. Recruiters see their progress with /myrewards."
          right={<button className={primary} onClick={() => setEditing({ ...BLANK })}><Plus className="h-4 w-4" />New reward</button>}>
          {!data.rules.length && (
            <div className="rounded-xl border border-dashed border-slate-300 p-5">
              <p className="text-sm font-semibold text-slate-700">Start from an idea, then change anything before saving:</p>
              <div className="mt-3 flex flex-wrap gap-2">{PRESETS.map((p) => <button key={p.label} className={ghost} onClick={() => setEditing(JSON.parse(JSON.stringify(p.rule)))}>{p.label}</button>)}</div>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {data.rules.map((r: any) => (
              <div key={r.id} className={`rounded-xl border p-4 ${r.enabled ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-bold text-slate-900">{r.emoji} {r.name}</div>
                    <p className="mt-0.5 text-sm text-slate-600">{r.summary}</p>
                  </div>
                  <button role="switch" aria-checked={r.enabled} aria-label="On or off" onClick={async () => { await api(`/rewards/rules/${r.id}`, 'PUT', { enabled: !r.enabled }).catch((e) => flash(false, e.message)); load(); }}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition ${r.enabled ? 'bg-indigo-600' : 'bg-slate-300'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${r.enabled ? 'left-[22px]' : 'left-0.5'}`} /></button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs font-semibold">
                  {r.actions.addRoleIds.map((id: string) => <span key={id} className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-700">+ @{roleName(id)}{r.actions.roleDays ? ` for ${r.actions.roleDays}d` : ''}</span>)}
                  {r.actions.removeRoleIds.map((id: string) => <span key={id} className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">− @{roleName(id)}</span>)}
                  {r.actions.credit?.itemId && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">+{r.actions.credit.amount} to wallet</span>}
                  {r.actions.xp > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">+{r.actions.xp} XP</span>}
                  {r.actions.dmMessage && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">DM</span>}
                  {r.actions.announceChannelId && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">Announce in #{res?.textChannels?.find((c: any) => c.id === r.actions.announceChannelId)?.name || 'channel'}</span>}
                  {r.actions.manualReward && <span className="rounded-full bg-fuchsia-50 px-2 py-0.5 text-fuchsia-700">🎁 {r.actions.manualReward}</span>}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{r.approval === 'STAFF' ? 'Staff approve' : 'Automatic'}</span>
                  {r.onLeave === 'REVOKE' && r.trigger.type !== 'TOP_RECRUITER' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">Taken back if recruits leave</span>}
                </div>
                <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <button className={ghost} onClick={() => setEditing(JSON.parse(JSON.stringify(r)))}><Pencil className="h-4 w-4" />Edit</button>
                  <button className={`${btn} text-rose-600 hover:bg-rose-50`} onClick={async () => { if (!window.confirm(`Delete "${r.name}"? Rewards already given stay in the history.`)) return; await api(`/rewards/rules/${r.id}`, 'DELETE').catch((e) => flash(false, e.message)); load(); }}><Trash2 className="h-4 w-4" />Delete</button>
                </div>
              </div>
            ))}
          </div>
          {data.rules.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">More ideas: {PRESETS.map((p) => <button key={p.label} className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => setEditing(JSON.parse(JSON.stringify(p.rule)))}>{p.label}</button>)}</div>}
        </Card>
      )}

      {sub === 'queue' && (
        <Card title="Needs action" desc="Rewards set to staff approval, and rewards the bot could not give (for example its role is below the reward role, or the recruiter's DMs are closed). The recruiter is told only when it is given.">
          {!waiting.length ? <p className="text-sm text-slate-500">Nothing waiting. 🎉</p> : <GrantTable grants={waiting} communityId={communityId} act={act} />}
        </Card>
      )}

      {sub === 'board' && <Leaderboard data={data} communityId={communityId} api={api} reload={load} flash={flash} />}

      {sub === 'wallet' && <RewardWallet communityId={communityId} api={api} />}

      {sub === 'history' && (
        <Card title="History" desc="Every reward earned, given, taken back or ended, newest first.">
          {!data.grants.length ? <p className="text-sm text-slate-500">No rewards earned yet.</p> : <GrantTable grants={data.grants} communityId={communityId} act={act} />}
        </Card>
      )}

      {editing && <RuleEditor communityId={communityId} staffRoleIds={data?.staffRoleIds || []} rule={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); flash(true, 'Reward saved. Recruiters who already qualify get it now.'); load(); }} api={api} />}
    </div>
  );
}

function GrantTable({ grants, communityId, act }: { grants: any[]; communityId: string; act: (g: any, a: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
          <tr><th className="px-4 py-3">Recruiter</th><th className="px-4 py-3">Reward</th><th className="px-4 py-3">Why</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {grants.map((g) => {
            const s = STATUS[g.status] || { label: g.status, cls: '' };
            return (
              <tr key={g.id} className="align-top hover:bg-slate-50/60">
                <td className="px-4 py-3 font-semibold text-slate-900"><MemberName id={g.recruiterId} communityId={communityId} fallback={g.recruiterName} /></td>
                <td className="px-4 py-3">{g.emoji} {g.ruleName}{g.manualReward && <div className="text-xs text-fuchsia-700">Hand out: {g.manualReward}</div>}</td>
                <td className="px-4 py-3 text-slate-600">{g.reason}<div className="text-xs text-slate-400">{new Date(g.createdAt).toLocaleString()}</div></td>
                <td className="px-4 py-3"><span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${s.cls}`}>{s.label}</span>{g.error && <div className="mt-1 max-w-xs text-xs text-slate-500">{g.error}</div>}{g.expiresAt && g.status === 'GRANTED' && <div className="mt-1 text-xs text-slate-500">Role until {new Date(g.expiresAt).toLocaleDateString()}</div>}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    {g.status === 'PENDING_APPROVAL' && <button className={`${btn} bg-emerald-600 px-2.5 py-1 text-xs text-white hover:bg-emerald-700`} onClick={() => act(g, 'approve')}>Give</button>}
                    {g.status === 'FAILED' && <button className={`${btn} bg-indigo-600 px-2.5 py-1 text-xs text-white hover:bg-indigo-700`} onClick={() => act(g, 'retry')}>Try again</button>}
                    {(g.status === 'PENDING_APPROVAL' || g.status === 'FAILED') && <button className={`${btn} border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50`} onClick={() => act(g, 'reject')}>Reject</button>}
                    {g.status === 'GRANTED' && <button className={`${btn} px-2.5 py-1 text-xs text-rose-600 hover:bg-rose-50`} onClick={() => act(g, 'revoke')}><Undo2 className="h-3.5 w-3.5" />Take back</button>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Leaderboard({ data, communityId, api, reload, flash }: any) {
  const [who, setWho] = useState('');
  const [delta, setDelta] = useState('1');
  const [note, setNote] = useState('');
  return (
    <div className="space-y-5">
      <Card title="Leaderboard" desc="Invites that are still in the server, plus bonus credit. Members who left are shown separately and no longer count.">
        {!data.leaderboard.length ? <p className="text-sm text-slate-500">No recruits yet. Recruiters get credit when someone who used their code joins.</p> : (
          <div className="space-y-2">
            {data.leaderboard.map((e: any, i: number) => (
              <div key={e.recruiterId} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-black ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-200 text-slate-700' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                  <div className="min-w-0 flex-1 font-bold text-slate-900"><MemberName id={e.recruiterId} communityId={communityId} fallback={e.name} /></div>
                  <span className="text-sm font-bold text-slate-900">{e.joined + e.bonus} invites</span>
                  {e.left > 0 && <span className="text-xs text-slate-500">{e.left} left</span>}
                  {e.bonus !== 0 && <span className="text-xs text-indigo-600">{e.bonus > 0 ? '+' : ''}{e.bonus} bonus</span>}
                  <span className="text-xs text-emerald-700" title="Rewards already given (from all reward rules)">{e.rewards} reward{e.rewards === 1 ? '' : 's'} given</span>
                </div>
                {e.progress.filter((p: any) => !p.done).length > 0 && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {e.progress.filter((p: any) => !p.done).slice(0, 3).map((p: any) => (
                      <div key={p.ruleId} className="text-xs text-slate-600">
                        <div className="flex justify-between"><span>{p.emoji} {p.name}</span><span title={p.waiting ? `${p.waiting} of their invites joined less than ${p.stayDays} days ago. They count once they have stayed ${p.stayDays} days.` : undefined}>{Math.min(p.have, p.target)}/{p.target} counted{p.waiting ? ` · ${p.waiting} waiting ${p.stayDays}-day stay` : ''}</span></div>
                        <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${Math.min(100, (p.have / Math.max(1, p.target)) * 100)}%` }} /></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Bonus credit" desc="For invites the bot could not track (someone forgot the code, an event, a partnership). Use a minus number to correct a mistake. Every change is kept below.">
        <div className="grid gap-3 md:grid-cols-[1fr_120px_1fr_auto] md:items-end">
          <label className="text-sm font-semibold text-slate-700">Recruiter<div className="mt-1"><MemberSelect communityId={communityId} value={who} onChange={(id) => setWho(id)} placeholder="Search a member" /></div></label>
          <label className="text-sm font-semibold text-slate-700">Invites<input type="number" className={`${input} mt-1`} value={delta} onChange={(e) => setDelta(e.target.value)} /></label>
          <label className="text-sm font-semibold text-slate-700">Reason<input className={`${input} mt-1`} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 3 friends joined at our tournament" /></label>
          <button className={primary} onClick={async () => { try { await api('/rewards/credits', 'POST', { recruiterId: who, delta: Number(delta), note }); flash(true, 'Credit saved and rewards re-checked.'); setNote(''); reload(); } catch (e: any) { flash(false, e.message); } }}>Save</button>
        </div>
        {data.credits.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100 text-sm">
            {data.credits.map((c: any) => <li key={c.id} className="flex flex-wrap gap-2 py-2"><span className={`font-bold ${c.delta > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{c.delta > 0 ? '+' : ''}{c.delta}</span><MemberName id={c.recruiterId} communityId={communityId} /><span className="text-slate-600">· {c.note}</span><span className="ml-auto text-xs text-slate-400">by {c.by} · {new Date(c.createdAt).toLocaleDateString()}</span></li>)}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-slate-100 pt-5 first:border-0 first:pt-0">
      <div><div className="text-sm font-black text-slate-900"><span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[11px] text-white">{n}</span>{title}</div>{hint && <p className="ml-7 text-xs text-slate-500">{hint}</p>}</div>
      <div className="ml-7 space-y-3">{children}</div>
    </section>
  );
}

function RoleChips({ communityId, ids, onChange, placeholder }: { communityId: string; ids: string[]; onChange: (l: string[]) => void; placeholder: string }) {
  const res: any = useDiscordResources(communityId);
  return (
    <div>
      {ids.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{ids.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">@{res?.roles?.find((r: any) => r.id === id)?.name || 'role'}<button type="button" aria-label="Remove" onClick={() => onChange(ids.filter((x) => x !== id))}><X className="h-3 w-3" /></button></span>)}</div>}
      <RoleSelect communityId={communityId} value="" exclude={ids} onChange={(id) => id && onChange([...ids, id])} placeholder={placeholder} />
    </div>
  );
}

function RuleEditor({ communityId, rule, onClose, onSaved, api, staffRoleIds = [] }: any) {
  const [r, setR] = useState<any>(rule);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (path: string, v: any) => setR((cur: any) => { const n = JSON.parse(JSON.stringify(cur)); const k = path.split('.'); let o = n; while (k.length > 1) o = o[k.shift()!]; o[k[0]] = v; return n; });
  const t: Trigger = r.trigger.type;
  const save = async () => {
    setSaving(true); setErr('');
    try { await (r.id ? api(`/rewards/rules/${r.id}`, 'PUT', r) : api('/rewards/rules', 'POST', r)); onSaved(); } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-6 w-full max-w-3xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-lg font-bold text-slate-900">{r.id ? 'Edit reward' : 'New reward'}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-5 px-6 py-5">
          <Section n={1} title="Name">
            <div className="flex gap-2">
              <EmojiField communityId={communityId} className="w-20 shrink-0" value={r.emoji} onChange={(v) => set('emoji', v)} />
              <input className={input} value={r.name} maxLength={80} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Silver Recruiter" />
            </div>
            <input className={input} value={r.description} maxLength={300} onChange={(e) => set('description', e.target.value)} placeholder="Short note for staff (optional)" />
          </Section>

          <Section n={2} title="When is it earned?">
            <div className="grid gap-2 sm:grid-cols-2">
              {TRIGGERS.map((x) => (
                <button key={x.id} type="button" onClick={() => set('trigger.type', x.id)} className={`rounded-xl border p-3 text-left transition ${t === x.id ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200 hover:bg-slate-50'}`}>
                  <div className="font-bold text-slate-900">{x.icon} {x.title}</div><p className="mt-0.5 text-xs text-slate-600">{x.hint}</p>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              {t === 'EACH_INVITE' && <span className="text-slate-600">Each recruit counts once. If it is taken back when they leave, the wallet shows it as a separate line.</span>}
              {t === 'MILESTONE' && <>At <input type="number" min={1} className={`${input} w-24`} value={r.trigger.count} onChange={(e) => set('trigger.count', Number(e.target.value))} /> invites in total</>}
              {t === 'EVERY' && <>Every <input type="number" min={1} className={`${input} w-24`} value={r.trigger.count} onChange={(e) => set('trigger.count', Number(e.target.value))} /> invites, at most <input type="number" min={0} className={`${input} w-24`} value={r.maxPerRecruiter} onChange={(e) => set('maxPerRecruiter', Number(e.target.value))} /> times per recruiter (0 = no limit)</>}
              {t === 'IN_PERIOD' && <><input type="number" min={1} className={`${input} w-24`} value={r.trigger.count} onChange={(e) => set('trigger.count', Number(e.target.value))} /> invites within one <PeriodPick v={r.trigger.period} on={(v) => set('trigger.period', v)} />, at most <input type="number" min={0} className={`${input} w-24`} value={r.maxPerRecruiter} onChange={(e) => set('maxPerRecruiter', Number(e.target.value))} /> times in total (0 = every period)</>}
              {t === 'TOP_RECRUITER' && <>Most invites in the last <PeriodPick v={r.trigger.period} on={(v) => set('trigger.period', v)} />, with at least <input type="number" min={1} className={`${input} w-24`} value={r.trigger.count} onChange={(e) => set('trigger.count', Number(e.target.value))} /> invites</>}
            </div>
          </Section>

          <Section n={3} title="Which invites count?" hint="Waiting a few days stops people joining only to get someone a reward and then leaving.">
            <div className="flex flex-wrap gap-2">
              <Choice on={r.countWhen.mode === 'JOINED'} onClick={() => set('countWhen.mode', 'JOINED')} title="As soon as they join" />
              <Choice on={r.countWhen.mode === 'STAYED'} onClick={() => set('countWhen.mode', 'STAYED')} title="After they stay a while" />
              {r.countWhen.mode === 'STAYED' && <span className="flex items-center gap-2 text-sm text-slate-700"><input type="number" min={1} max={90} className={`${input} w-20`} value={r.countWhen.stayDays} onChange={(e) => set('countWhen.stayDays', Number(e.target.value))} /> days</span>}
            </div>
            <p className="text-xs text-slate-500">Members who leave never count. Staff can add bonus credit on the Leaderboard tab.</p>
          </Section>

          <Section n={4} title="What does the recruiter get?" hint="Pick one or more.">
            <WalletPick api={api} credit={r.actions.credit || { itemId: '', amount: 1 }} onChange={(c: any) => set('actions.credit', c)} />
            {t === 'EACH_INVITE' && !r.id && <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={!!r.includePast} onChange={(e) => set('includePast', e.target.checked)} />Also pay for members recruited before today</label>}
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">Give roles<div className="mt-1"><RoleChips communityId={communityId} ids={r.actions.addRoleIds} onChange={(l) => set('actions.addRoleIds', l)} placeholder="Add a role" /></div></label>
              <label className="text-sm font-semibold text-slate-700">Remove roles <span className="font-normal text-slate-500">· e.g. the previous rank</span><div className="mt-1"><RoleChips communityId={communityId} ids={r.actions.removeRoleIds} onChange={(l) => set('actions.removeRoleIds', l)} placeholder="Remove a role" /></div></label>
              {r.actions.addRoleIds.length > 0 && <label className="text-sm font-semibold text-slate-700">Keep the role for<div className="mt-1 flex items-center gap-2"><input type="number" min={0} max={365} className={`${input} w-24`} value={r.actions.roleDays} onChange={(e) => set('actions.roleDays', Number(e.target.value))} /><span className="font-normal text-slate-500">days (0 = forever)</span></div></label>}
              <label className="text-sm font-semibold text-slate-700">XP<div className="mt-1 flex items-center gap-2"><input type="number" min={0} className={`${input} w-32`} value={r.actions.xp} onChange={(e) => set('actions.xp', Number(e.target.value))} /><span className="font-normal text-slate-500">added to their level</span></div></label>
              <label className="text-sm font-semibold text-slate-700">Expires after <span className="font-normal text-slate-500">· optional</span><div className="mt-1 flex items-center gap-2"><input type="number" min={0} max={365} className={`${input} w-24`} value={r.actions.expireDays || 0} onChange={(e) => set('actions.expireDays', Number(e.target.value))} /><span className="font-normal text-slate-500">days (0 = never). The wallet credit and XP from this reward are taken back after this, for a temporary bonus.</span></div></label>
              <label className="text-sm font-semibold text-slate-700 md:col-span-2">Something staff hand out <span className="font-normal text-slate-500">· Nitro, merch, in-game items. These always wait for staff approval.</span><input className={`${input} mt-1`} value={r.actions.manualReward} maxLength={200} onChange={(e) => set('actions.manualReward', e.target.value)} placeholder="e.g. Discord Nitro Basic (1 month)" /></label>
            </div>
            <TemplateField label="Private message to the recruiter (optional)" value={r.actions.dmMessage} onChange={(v) => set('actions.dmMessage', v)} vars={REWARD_VARS} rows={2} />
            <label className="block text-sm font-semibold text-slate-700">Announce in a channel (optional)<div className="mt-1 max-w-md"><ChannelSelect communityId={communityId} value={r.actions.announceChannelId} onChange={(id) => set('actions.announceChannelId', id)} placeholder="No announcement" /></div></label>
            {r.actions.announceChannelId && <TemplateField label="Announcement (optional)" value={r.actions.announceMessage} onChange={(v) => set('actions.announceMessage', v)} vars={REWARD_VARS} rows={2} />}
            {r.actions.announceChannelId && <p className="text-xs text-slate-500">Posted <b>once per recruiter</b> in this channel, together with their live status card (invites, reward roles, balance). Every later reward edits that same message instead of posting again. If you set a <b>Recruiter reward board</b> channel in Recruiters &amp; codes, that channel is used instead.</p>}
          </Section>

          <Section n={5} title="How is it handled?">
            <div className="flex flex-wrap gap-2">
              <Choice on={r.approval === 'AUTO' && !r.actions.manualReward} disabled={!!r.actions.manualReward} onClick={() => set('approval', 'AUTO')} title="Give automatically" />
              <Choice on={r.approval === 'STAFF' || !!r.actions.manualReward} onClick={() => { set('approval', 'STAFF'); if (!(r.approverRoleIds || []).length) set('approverRoleIds', staffRoleIds); }} title="Staff approve first" />
            </div>
            {(r.approval === 'STAFF' || !!r.actions.manualReward) && (
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 md:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">Who can approve <span className="font-normal text-slate-500">· pinged when one is waiting</span>
                  <div className="mt-1"><RoleChips communityId={communityId} ids={r.approverRoleIds || []} onChange={(l) => set('approverRoleIds', l)} placeholder="Add a role" /></div>
                  {!(r.approverRoleIds || []).length && <span className="text-xs font-normal text-slate-500">Empty = your staff roles (review-room ranks and application pings).</span>}
                </label>
                <label className="text-sm font-semibold text-slate-700">Approval channel <span className="font-normal text-slate-500">· Approve / Reject buttons are posted here and the same message shows the result</span>
                  <div className="mt-1"><ChannelSelect communityId={communityId} value={r.approvalChannelId || ''} onChange={(id) => set('approvalChannelId', id)} placeholder="Announcement channel, else the recruitment log" /></div>
                </label>
              </div>
            )}
            {t !== 'TOP_RECRUITER' && t !== 'IN_PERIOD' && (
              <div className="flex flex-wrap gap-2">
                <Choice on={r.onLeave === 'REVOKE'} onClick={() => set('onLeave', 'REVOKE')} title="Take it back if recruits leave and they drop below" />
                <Choice on={r.onLeave === 'KEEP'} onClick={() => set('onLeave', 'KEEP')} title="Keep it once earned" />
              </div>
            )}
          </Section>
          {err && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button className={ghost} onClick={onClose}>Cancel</button>
          <button className={primary} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save reward'}</button>
        </div>
      </div>
    </div>
  );
}

const PeriodPick = ({ v, on }: { v: string; on: (v: string) => void }) => (
  <select className={`${input} w-28`} value={v} onChange={(e) => on(e.target.value)}><option value="WEEK">week</option><option value="MONTH">month</option></select>
);
const Choice = ({ on, onClick, title, disabled }: { on: boolean; onClick: () => void; title: string; disabled?: boolean }) => (
  <button type="button" disabled={disabled} onClick={onClick} className={`rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:opacity-50 ${on ? 'border-indigo-500 bg-indigo-50 text-indigo-800 ring-2 ring-indigo-200' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{title}</button>
);

/** Pick a wallet item and how many each time; links to the Wallet tab to create one. */
function WalletPick({ api, credit, onChange }: any) {
  const [items, setItems] = useState<any[] | null>(null);
  useEffect(() => { api('/rewards/wallet').then((w: any) => setItems(w.items.filter((i: any) => i.active))).catch(() => setItems([])); }, [api]);
  if (!items) return null;
  if (!items.length) return <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">💡 For countable rewards (like 1 Modded Heist per recruit) first create an item on the <b>Wallet & balances</b> tab, then pick it here.</p>;
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
      <div className="text-sm font-semibold text-slate-700">Add to their wallet <span className="font-normal text-slate-500">· a balance they spend later; every gain and use is recorded</span></div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <input type="number" min={1} className={`${input} w-24`} value={credit.amount} onChange={(e) => onChange({ ...credit, amount: Number(e.target.value) })} aria-label="How many" />
        <span>×</span>
        <select className={`${input} w-auto`} value={credit.itemId} onChange={(e) => onChange({ ...credit, itemId: e.target.value })}><option value="">Nothing</option>{items.map((i) => <option key={i.id} value={i.id}>{i.emoji} {i.name}</option>)}</select>
      </div>
    </div>
  );
}
