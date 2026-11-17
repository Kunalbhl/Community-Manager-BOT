import React, { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, Search, RefreshCw } from 'lucide-react';
import { MemberSelect } from '../../common/DiscordPickers.js';
import { useLive } from '../../../lib/live.js';
import { goTo } from './SetupGuideView.js';

/**
 * Warnings: the same system as /warn in Discord. Each reason carries points; reaching a level runs
 * the automatic action from Warning rules (timeout, kick, ban). The member gets a DM and it is logged.
 */
export function WarningsPanel({ communityId }: { communityId: string }) {
  const base = `/api/v1/communities/${encodeURIComponent(communityId)}/toolkit`;
  const call = useCallback(async (path: string, method = 'GET', body?: any) => {
    const r = await fetch(base + path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-community-id': communityId }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) throw new Error(j?.error?.message || j?.message || 'Something went wrong.');
    return j.data ?? j;
  }, [base, communityId]);

  const [cfg, setCfg] = useState<any>(null);
  const [list, setList] = useState<any[] | null>(null);
  const [who, setWho] = useState('');
  const [reasonKey, setReasonKey] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'active' | 'all'>('active');

  const load = useCallback(() => {
    call('').then((d: any) => { setCfg(d.config?.warnings); setReasonKey((k) => k || d.config?.warnings?.reasons?.[0]?.key || ''); }).catch((e) => setMsg({ ok: false, text: e.message }));
    call('/warnings').then(setList).catch((e) => setMsg({ ok: false, text: e.message }));
  }, [call]);
  useEffect(() => { load(); }, [load]);
  useLive(communityId, () => { call('/warnings').then(setList).catch(() => undefined); }, ['members']);

  const reasons: any[] = cfg?.reasons || [];
  const reason = reasons.find((r) => r.key === reasonKey);
  const issue = async () => {
    if (!who) return setMsg({ ok: false, text: 'Pick the member to warn.' });
    if (!reason && !note.trim()) return setMsg({ ok: false, text: 'Pick a reason or write one.' });
    setBusy(true); setMsg(null);
    try {
      const r = await call('/warnings', 'POST', { discordUserId: who, reasonKey: reason ? reasonKey : 'custom', note: note.trim() || undefined });
      setMsg({ ok: true, text: `✓ Warned (+${r.reason?.points ?? 1}). Points: ${r.pointsBefore} → ${r.pointsAfter}.${r.actionResult ? ` ${r.actionResult}.` : ''}${cfg?.dmMember ? ' They were sent a DM.' : ''}` });
      setWho(''); setNote('');
      call('/warnings').then(setList).catch(() => undefined);
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
    setBusy(false);
  };
  const revoke = async (id: string) => {
    if (!window.confirm('Remove this warning? Its points stop counting.')) return;
    try { await call(`/warnings/${id}/revoke`, 'POST'); call('/warnings').then(setList); } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };

  const now = Date.now();
  const status = (w: any) => (w.revoked ? 'Removed' : Date.parse(w.expiresAt) <= now ? 'Expired' : 'Active');
  const shown = (list || []).filter((w) => (show === 'all' || status(w) === 'Active')
    && (!q || `${w.memberName || ''} ${w.discordUserId} ${w.reasonLabel} ${w.note || ''} ${w.moderatorName || ''}`.toLowerCase().includes(q.toLowerCase())));
  const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(320px,400px)_1fr]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="flex items-center gap-2 font-bold text-slate-900"><ShieldAlert className="h-4 w-4 text-rose-600" /> Warn a member</h3>
        <p className="mt-0.5 text-xs text-slate-500">Same as <code>/warn</code> in Discord. {cfg ? <>Warnings last {cfg.expiryDays} days{cfg.dmMember ? '; the member gets a DM' : ''}.</> : null}</p>
        {cfg && !cfg.enabled && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">The warning system is off. <button className="font-semibold underline" onClick={() => goTo('server-tools', 'warnings')}>Turn it on in Warning rules</button>.</p>}
        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-slate-700">Member<div className="mt-1"><MemberSelect communityId={communityId} value={who} onChange={(id) => setWho(id)} placeholder="Search by name" /></div></label>
          <label className="block text-sm font-medium text-slate-700">Reason
            <select className={`${input} mt-1`} value={reasonKey} onChange={(e) => setReasonKey(e.target.value)}>
              {reasons.map((r) => <option key={r.key} value={r.key}>{r.label} (+{r.points})</option>)}
              <option value="custom">Other (write below, +1)</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">Note <span className="font-normal text-slate-400">(optional, sent to the member)</span>
            <textarea className={`${input} mt-1`} rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened" />
          </label>
          {cfg?.thresholds?.length > 0 && <p className="text-xs text-slate-500">Automatic: {[...cfg.thresholds].sort((a: any, b: any) => a.points - b.points).map((t: any) => `${t.points} pts → ${t.action === 'TIMEOUT' ? `timeout ${t.durationMinutes || 60} min` : t.action.toLowerCase()}`).join(' · ')}</p>}
          <button disabled={busy} onClick={issue} className="w-full rounded-lg bg-rose-600 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60">{busy ? 'Warning…' : 'Give warning'}</button>
          {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>{msg.text}</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-slate-900">Warning history</h3>
            <p className="text-xs text-slate-500">From the dashboard and from /warn in Discord.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold">
              {(['active', 'all'] as const).map((k) => <button key={k} onClick={() => setShow(k)} className={`rounded-md px-2.5 py-1 ${show === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{k === 'active' ? 'Active' : 'All'}</button>)}
            </div>
            <div className="relative"><Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-40 rounded-lg border border-slate-300 py-1.5 pl-8 pr-2 text-sm" /></div>
            <button onClick={load} title="Refresh" className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <div className="mt-4">
          {!list ? <div className="h-24 animate-pulse rounded-xl bg-slate-100" /> : !shown.length ? <p className="py-8 text-center text-sm text-slate-400">{list.length ? 'Nothing matches.' : 'No warnings yet.'}</p> : (
            <ul className="divide-y divide-slate-100">
              {shown.map((w) => { const st = status(w); return (
                <li key={w.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{w.memberName || `Member ${w.discordUserId}`} <span className="ml-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700">+{w.points}</span></div>
                    <div className="text-slate-700">{w.reasonLabel}{w.note && w.note !== w.reasonLabel ? <span className="text-slate-500"> · {w.note}</span> : null}</div>
                    <div className="text-xs text-slate-400">by {w.moderatorName || w.moderatorId} · {new Date(w.createdAt).toLocaleString()}{st === 'Active' ? ` · expires ${new Date(w.expiresAt).toLocaleDateString()}` : ''}</div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${st === 'Active' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>{st}</span>
                    {st === 'Active' && <button onClick={() => revoke(w.id)} className="font-semibold text-rose-600 hover:underline">Remove</button>}
                  </div>
                </li>
              ); })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
