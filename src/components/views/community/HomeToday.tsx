import React, { useEffect, useState } from 'react';
import { Inbox, Mic, Ticket, ShieldAlert, Gift, CheckCircle2, Trophy, ArrowRight, Users } from 'lucide-react';

interface Summary {
  server: { name?: string; icon?: string | null; memberCount?: number; online: boolean };
  waiting: number; approved30d: number; interviewsToday: number; openTickets: number; warnings7d: number; runningGiveaways: number;
  applicationsByDay: { date: string; count: number }[];
  topMembers: { userId: string; username: string; level: number; xp: number }[];
  features: Record<string, boolean>;
}

/** Live "today" panel on the dashboard home: what needs attention, trends and what is switched on. */
export function HomeToday({ communityId, onNavigate }: { communityId: string; onNavigate: (section: string) => void }) {
  const [s, setS] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!communityId) return;
    let alive = true;
    const load = () => fetch(`/api/v1/communities/${encodeURIComponent(communityId)}/home-summary`, { credentials: 'include', headers: { 'x-community-id': communityId } })
      .then((r) => r.json()).then((j) => { if (alive) { if (j.success) setS(j.data); else setFailed(true); } }).catch(() => alive && setFailed(true));
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [communityId]);

  if (failed && !s) return null;
  if (!s) return <div className="mb-8 h-72 animate-pulse rounded-3xl bg-slate-200/60" />;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const max = Math.max(1, ...s.applicationsByDay.map((d) => d.count));
  const total14 = s.applicationsByDay.reduce((n, d) => n + d.count, 0);
  const on = Object.entries(s.features).filter(([, v]) => v);
  const off = Object.entries(s.features).filter(([, v]) => !v);

  const tiles = [
    { icon: Inbox, label: 'Applications waiting', value: s.waiting, go: 'applications', tone: s.waiting ? 'text-rose-600' : 'text-slate-900' },
    { icon: Mic, label: 'Interviews today', value: s.interviewsToday, go: 'interviews', tone: 'text-slate-900' },
    { icon: Ticket, label: 'Open tickets', value: s.openTickets, go: 'server-tools', tone: s.openTickets ? 'text-amber-600' : 'text-slate-900' },
    { icon: ShieldAlert, label: 'Warnings this week', value: s.warnings7d, go: 'server-tools', tone: 'text-slate-900' },
    { icon: CheckCircle2, label: 'Approved (30 days)', value: s.approved30d, go: 'applications', tone: 'text-emerald-600' },
    { icon: Gift, label: 'Live giveaways', value: s.runningGiveaways, go: 'community-features', tone: 'text-slate-900' },
  ];

  return (
    <section className="mb-8 space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-slate-900 p-7 text-white sm:p-9">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_60%_at_15%_20%,rgba(124,140,255,.35),transparent_70%),radial-gradient(35%_50%_at_85%_10%,rgba(255,92,138,.25),transparent_70%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            {s.server.icon ? <img src={s.server.icon} alt="" className="h-16 w-16 rounded-2xl ring-2 ring-white/15" /> : <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/10"><Users className="h-7 w-7" /></div>}
            <div>
              <p className="text-sm text-indigo-200">{greeting}</p>
              <h2 className="text-3xl font-extrabold tracking-tight">{s.server.name || 'Your server'}</h2>
              <p className="mt-1 flex items-center gap-2 text-sm text-indigo-100/80">
                <span className={`h-2 w-2 rounded-full ${s.server.online ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                {s.server.online ? `Bot online${s.server.memberCount ? ` · ${s.server.memberCount.toLocaleString()} members` : ''}` : 'Bot not connected'}
              </p>
            </div>
          </div>
          <p className="max-w-md text-indigo-100/90">
            {s.waiting ? <>You have <b className="text-white">{s.waiting} application{s.waiting > 1 ? 's' : ''}</b> waiting for review{s.openTickets ? <> and <b className="text-white">{s.openTickets} open ticket{s.openTickets > 1 ? 's' : ''}</b></> : ''}.</>
              : s.openTickets ? <>No applications waiting. <b className="text-white">{s.openTickets} ticket{s.openTickets > 1 ? 's are' : ' is'}</b> open.</>
              : <>All caught up. Nothing is waiting on you right now.</>}
          </p>
        </div>
      </div>

      <SetupNudge communityId={communityId} onNavigate={onNavigate} />

      {/* Tiles */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6">
        {tiles.map((t) => (
          <button key={t.label} onClick={() => onNavigate(t.go)} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md">
            <t.icon className="h-5 w-5 text-indigo-500" />
            <div className={`mt-3 text-3xl font-extrabold tabular-nums ${t.tone}`}>{t.value}</div>
            <div className="mt-1 flex items-center justify-between text-sm text-slate-500">{t.label}<ArrowRight className="h-4 w-4 opacity-0 transition group-hover:opacity-100" /></div>
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr_1fr]">
        {/* Chart */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-bold text-slate-900">Applications, last 14 days</h3>
            <span className="text-sm text-slate-500">{total14} total</span>
          </div>
          <div className="mt-6 flex h-40 items-end gap-1.5" role="img" aria-label={`Applications per day for the last 14 days, ${total14} in total`}>
            {s.applicationsByDay.map((d) => (
              <div key={d.date} className="group relative flex h-full flex-1 flex-col justify-end">
                <div className="rounded-t-md bg-indigo-500/80 transition group-hover:bg-indigo-600" style={{ height: `${Math.max(d.count ? 6 : 2, (d.count / max) * 100)}%`, opacity: d.count ? 1 : 0.25 }} />
                <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-xs text-white opacity-0 group-hover:opacity-100">{d.count} · {new Date(d.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-slate-400">
            <span>{new Date(s.applicationsByDay[0].date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span><span>Today</span>
          </div>
        </div>

        {/* Top members */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">Most active members</h3>
          {!s.topMembers.length ? (
            <p className="mt-4 text-sm text-slate-500">Turn on <button className="font-semibold text-indigo-600 hover:underline" onClick={() => onNavigate('community-features')}>Levels & XP</button> to see who’s most active.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {s.topMembers.map((m, i) => (
                <li key={m.userId} className="flex items-center gap-3">
                  <span className={`grid h-8 w-8 place-items-center rounded-full ${['bg-amber-100 text-amber-700', 'bg-slate-100 text-slate-600', 'bg-orange-100 text-orange-700'][i]}`}><Trophy className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">{m.username}</span>
                  <span className="text-sm text-slate-500">Lv {m.level}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Features */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">Switched on</h3>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {on.map(([k]) => <span key={k} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{k}</span>)}
            {!on.length && <span className="text-sm text-slate-500">Nothing yet.</span>}
          </div>
          {!!off.length && <>
            <h4 className="mt-5 text-sm font-semibold text-slate-500">Ready to turn on</h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {off.map(([k]) => (
                <button key={k} onClick={() => onNavigate(['Tickets', 'Warnings', 'Role rules', 'Review rooms'].includes(k) ? 'server-tools' : 'community-features')}
                  className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-700">+ {k}</button>
              ))}
            </div>
          </>}
        </div>
      </div>
    </section>
  );
}

function SetupNudge({ communityId, onNavigate }: { communityId: string; onNavigate: (s: string) => void }) {
  const [p, setP] = React.useState<{ done: number; total: number } | null>(null);
  React.useEffect(() => {
    fetch(`/api/v1/communities/${encodeURIComponent(communityId)}/setup-guide`, { credentials: 'include', headers: { 'x-community-id': communityId } })
      .then((r) => r.json()).then((j) => j.success && setP({ done: j.data.done, total: j.data.total })).catch(() => undefined);
  }, [communityId]);
  if (!p || p.done >= p.total) return null;
  const pct = Math.round((p.done / p.total) * 100);
  return (
    <button onClick={() => onNavigate('setup-guide')} className="flex w-full items-center gap-4 rounded-2xl border border-indigo-200 bg-indigo-50 px-5 py-4 text-left transition hover:border-indigo-400">
      <div className="text-2xl font-extrabold text-indigo-600">{pct}%</div>
      <div className="flex-1"><div className="font-bold text-slate-900">Finish setting up your server</div><div className="text-sm text-slate-600">{p.done} of {p.total} steps done. The setup guide walks you through each module.</div></div>
      <span className="text-sm font-semibold text-indigo-600">Open setup guide →</span>
    </button>
  );
}
