import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, ChevronRight, RefreshCw, Server, Lock, ClipboardList, Mic, ShieldCheck, Ticket, PartyPopper, Plug } from 'lucide-react';

const ICONS: Record<string, any> = { server: Server, secure: Lock, recruitment: ClipboardList, interviews: Mic, moderation: ShieldCheck, tickets: Ticket, community: PartyPopper, integrations: Plug };

interface Step { label: string; done: boolean; section: string; tab?: string; hint?: string }
interface Module { key: string; title: string; description: string; steps: Step[] }

/** Opens a dashboard section (and a tab inside it). */
export function openSection(onNavigate: (s: string) => void, section: string, tab?: string) {
  try { if (tab) sessionStorage.setItem('cm_open_tab', tab); } catch { /* ignore */ }
  onNavigate(section);
}

/** Read once by tabbed screens to open the tab the guide pointed to. */
export function takeOpenTab<T extends string>(allowed: readonly T[], fallback: T): T {
  try {
    const t = sessionStorage.getItem('cm_open_tab') as T | null;
    if (t && allowed.includes(t)) { sessionStorage.removeItem('cm_open_tab'); return t; }
  } catch { /* ignore */ }
  return fallback;
}

export function SetupGuideView({ communityId, onNavigate }: { communityId: string; onNavigate: (s: string) => void }) {
  const [d, setD] = useState<{ modules: Module[]; done: number; total: number } | null>(null);
  const [err, setErr] = useState('');
  const load = () => fetch(`/api/v1/communities/${encodeURIComponent(communityId)}/setup-guide`, { credentials: 'include', headers: { 'x-community-id': communityId } })
    .then((r) => r.json()).then((j) => (j.success ? setD(j.data) : setErr(j.error?.message || 'Could not load the setup guide.'))).catch(() => setErr('Could not load the setup guide.'));
  useEffect(() => { if (communityId) load(); }, [communityId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) return <p className="text-rose-600">{err}</p>;
  if (!d) return <div className="h-96 animate-pulse rounded-3xl bg-slate-100" />;
  const pct = Math.round((d.done / Math.max(1, d.total)) * 100);
  const next = d.modules.flatMap((m) => m.steps.map((s) => ({ ...s, module: m.title }))).find((s) => !s.done);

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-slate-900 p-7 text-white sm:p-9">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_60%_at_15%_20%,rgba(124,140,255,.35),transparent_70%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-sm text-indigo-200">Setup guide</p>
            <h1 className="text-3xl font-extrabold">{pct === 100 ? 'Everything is set up' : `${d.done} of ${d.total} steps done`}</h1>
            <div className="mt-4 h-2 w-72 max-w-full overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-pink-400" style={{ width: `${pct}%` }} /></div>
          </div>
          {next && (
            <button onClick={() => openSection(onNavigate, next.section, next.tab)} className="rounded-2xl bg-white px-5 py-4 text-left text-slate-900 shadow-lg transition hover:-translate-y-0.5">
              <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Next step · {next.module}</div>
              <div className="mt-1 flex items-center gap-2 font-bold">{next.label}<ChevronRight className="h-4 w-4" /></div>
            </button>
          )}
        </div>
      </div>

      <div className="flex justify-end"><button onClick={load} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /> Re-check</button></div>

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-4">
        {d.modules.map((m, i) => {
          const I = ICONS[m.key] || Circle;
          const done = m.steps.filter((s) => s.done).length;
          const complete = done === m.steps.length;
          return (
            <section key={m.key} className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm ${complete ? 'border-emerald-200' : 'border-slate-200'}`}>
              <div className="flex items-start gap-3">
                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${complete ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}><I className="h-5 w-5" /></div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-400">Module {i + 1} · {done}/{m.steps.length}</div>
                  <h2 className="text-lg font-bold text-slate-900">{m.title}</h2>
                  <p className="text-sm text-slate-500">{m.description}</p>
                </div>
              </div>
              <ol className="mt-4 space-y-1">
                {m.steps.map((s) => (
                  <li key={s.label}>
                    <button onClick={() => openSection(onNavigate, s.section, s.tab)} className="group flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-50">
                      {s.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}
                      <span className="min-w-0 flex-1">
                        <span className={s.done ? 'text-slate-500' : 'font-medium text-slate-900'}>{s.label}</span>
                        {s.hint && !s.done && <span className="block text-xs text-slate-400">{s.hint}</span>}
                      </span>
                      <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 group-hover:text-indigo-500" />
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
