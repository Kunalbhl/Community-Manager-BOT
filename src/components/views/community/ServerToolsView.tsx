import { useLive } from '../../../lib/live.js';
import { MessageComposer } from '../../common/MessageComposer.js';
import { takeOpenTab, goTo } from './SetupGuideView.js';
import { MemberName } from '../../common/DiscordPickers.js';
import { TicketPanelDesigner, TicketTypeExtras } from './TicketPanelDesigner.js';
import { TemplateField, RECRUIT_VARS } from '../../common/TemplateField.js';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList, Ticket, ShieldAlert, UserCheck, Mic, Layers, Plus, Trash2, Save, RefreshCw, Send, X, CheckCircle2, AlertTriangle, ArrowUp,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Types + API                                                         */
/* ------------------------------------------------------------------ */
export interface Opt { id: string; name: string; color?: string }
export interface Resources { connected: boolean; hiddenCount?: number; botIsAdmin?: boolean; fullAccessUrl?: string; roles: Opt[]; textChannels: Opt[]; categories: Opt[] }
export type Tab = 'recruit' | 'tickets' | 'warnings' | 'roles' | 'rooms' | 'bulk';

export function useApi(communityId: string) {
  const base = `/api/v1/communities/${encodeURIComponent(communityId)}/toolkit`;
  const headers = { 'Content-Type': 'application/json', 'x-community-id': communityId };
  return useCallback(async (path: string, method = 'GET', body?: unknown) => {
    const r = await fetch(`${base}${path}`, { method, credentials: 'include', headers, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) throw new Error(j?.error?.message || 'Something went wrong.');
    return j.data;
  }, [base]);
}

const TABS: { id: Tab; label: string; icon: any; hint: string }[] = [
  { id: 'recruit', label: 'Recruitment in Discord', icon: ClipboardList, hint: 'People apply inside Discord; staff review in a channel with Approve / Reject buttons; applicants get your messages.' },
  { id: 'tickets', label: 'Tickets', icon: Ticket, hint: 'Members open private tickets by type; staff claim and close them.' },
  { id: 'warnings', label: 'Warning system', icon: ShieldAlert, hint: 'Each reason gives points. Reaching a points level triggers an action automatically.' },
  { id: 'roles', label: 'Role rules', icon: UserCheck, hint: 'Which roles an approved applicant gets, and when.' },
  { id: 'rooms', label: 'Review rooms', icon: Mic, hint: 'A private channel per application, with a temporary voice room and escalation by rank.' },
  { id: 'bulk', label: 'Bulk tools', icon: Layers, hint: 'Do one thing to many members or channels at once.' },
];

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */
export function ServerToolsView({ communityId, only }: { communityId: string; only?: Tab }) {
  const api = useApi(communityId);
  const [tab, setTab] = useState<Tab>(() => only || takeOpenTab(['recruit', 'tickets', 'warnings', 'roles', 'rooms', 'bulk'] as const, 'recruit'));
  const [config, setConfig] = useState<any>(null);
  const [res, setRes] = useState<Resources | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await api('');
      setConfig(d.config);
      setRes(d.resources);
      // The bot may still be reconnecting: ask once more shortly so names fill in by themselves.
      if (!d.resources?.roles?.length) setTimeout(() => api('').then((x: any) => setRes(x.resources)).catch(() => undefined), 4000);
    } catch (e: any) { setError(e.message); }
  }, [api]);

  useEffect(() => { if (communityId) load(); }, [communityId, load]);
  // Live: channel/role/name changes made in Discord appear here without reloading (your unsaved edits are kept).
  useLive(communityId, () => { api('').then((d: any) => setRes(d.resources)).catch(() => undefined); }, ['channels', 'roles', 'emojis', 'guild']);

  const save = async (section: string, value: any) => {
    const saved = await api(`/settings/${section}`, 'PUT', value);
    setConfig(saved);
  };

  const current = TABS.find((t) => t.id === tab)!;
  return (
    <div className="space-y-6">
      {res && (!res.connected || !res.roles.length) && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>Couldn’t load your Discord roles and channels right now, so names may show as numbers. Your settings are safe.</span>
          <button className={ghost} onClick={() => load()}>Retry</button>
        </div>
      )}
      {res && !!res.hiddenCount && (
        <div className="rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <b>{res.hiddenCount} private channel{res.hiddenCount === 1 ? '' : 's'} can’t be seen by the bot.</b> Since 16 Nov 2026 Discord hides private channels from bots, so they are left out of these lists. A server admin can fix this in one click: give Community Manager <b>Administrator</b> (it never gives anything to @everyone), or <b>View Channel</b> on those channels. Nothing is changed or removed.
          {res.fullAccessUrl && <div className="mt-2 flex flex-wrap items-center gap-2"><a className={btn} href={res.fullAccessUrl} target="_blank" rel="noreferrer">Give full access (server admin)</a><button type="button" className={ghost} onClick={() => navigator.clipboard?.writeText(res.fullAccessUrl || '')}>Copy link for my admin</button></div>}
        </div>
      )}
      {!only && <div>
        <h1 className="text-3xl font-bold text-slate-900">Server tools</h1>
        <p className="mt-1 text-slate-500">Tickets, warnings, recruitment roles, review rooms and bulk actions for your Discord server.</p>
      </div>}

      <div className={`${only ? 'hidden' : 'flex'} gap-2 overflow-x-auto pb-1`}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${tab === t.id ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300'}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>
      {!only && <p className="text-sm text-slate-500">{current.hint}</p>}

      {error && <Banner tone="error">{error} <button onClick={load} className="ml-2 underline">Try again</button></Banner>}
      {res && !res.connected && <Banner tone="warn">The bot is not connected to this server right now, so roles and channels can’t be listed. Settings still save.</Banner>}
      {!config && !error && <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />}

      {config && res && (
        <>
          {tab === 'recruit' && <RecruitTab communityId={communityId} api={api} cfg={config.recruitment} rooms={config.reviewRooms} res={res} onSave={(v) => save('recruitment', v)} onSaveRooms={(v) => save('reviewRooms', v)} goRooms={() => setTab('rooms')} />}
          {tab === 'tickets' && <TicketsTab communityId={communityId} api={api} cfg={config.tickets} res={res} onSave={(v) => save('tickets', v)} />}
          {tab === 'warnings' && <WarningsTab communityId={communityId} api={api} cfg={config.warnings} onSave={(v) => save('warnings', v)} />}
          {tab === 'roles' && <RoleRulesTab cfg={config.roleRules} res={res} onSave={(v) => save('roleRules', v)} />}
          {tab === 'rooms' && <ReviewRoomsTab communityId={communityId} api={api} cfg={config.reviewRooms} res={res} onSave={(v) => save('reviewRooms', v)} />}
          {tab === 'bulk' && <BulkTab communityId={communityId} api={api} res={res} />}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */
export function Banner({ tone, children }: { tone: 'error' | 'warn' | 'ok'; children: React.ReactNode }) {
  const c = tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800';
  const I = tone === 'ok' ? CheckCircle2 : AlertTriangle;
  return <div className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${c}`}><I className="mt-0.5 h-4 w-4 shrink-0" /><div>{children}</div></div>;
}

export function Card({ title, desc, children, right }: { title: string; desc?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-bold text-slate-900">{title}</h2>{desc && <p className="mt-1 text-sm text-slate-500">{desc}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

export const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';
export const btn = 'inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50';
export const ghost = 'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50';

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-slate-700">
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`relative h-6 w-11 rounded-full transition ${on ? 'bg-indigo-600' : 'bg-slate-300'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
      {label}
    </label>
  );
}

/** Channels or roles that share a name get the end of their ID added so they can be told apart. */
export function useLabels(options: Opt[]) {
  return useMemo(() => {
    const count = new Map<string, number>();
    for (const o of options) count.set(o.name, (count.get(o.name) || 0) + 1);
    return (o: Opt) => ((count.get(o.name) || 0) > 1 ? `${o.name}  ·  …${o.id.slice(-4)}` : o.name);
  }, [options]);
}

export function Pick({ options, value, onChange, placeholder }: { options: Opt[]; value?: string; onChange: (v: string) => void; placeholder: string }) {
  const label = useLabels(options);
  return (
    <select className={input} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.id} value={o.id}>{label(o)}</option>)}
    </select>
  );
}

export function MultiPick({ options, value, onChange, placeholder, prefix = '' }: { options: Opt[]; value: string[]; onChange: (v: string[]) => void; placeholder: string; prefix?: string }) {
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const label = useLabels(options);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
            {prefix}{byId.get(id) ? label(byId.get(id)!) : (options.length ? 'deleted item' : `…${id.slice(-4)}`)}
            <button type="button" onClick={() => onChange(value.filter((v) => v !== id))} aria-label="Remove"><X className="h-3 w-3" /></button>
          </span>
        ))}
        {!value.length && <span className="text-xs text-slate-400">None selected</span>}
      </div>
      <select className={input} value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
        <option value="">{placeholder}</option>
        {options.filter((o) => !value.includes(o.id)).map((o) => <option key={o.id} value={o.id}>{prefix}{label(o)}</option>)}
      </select>
    </div>
  );
}

export function SaveBar({ onSave }: { onSave: () => Promise<void> }) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [err, setErr] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button className={btn} disabled={state === 'saving'} onClick={async () => {
        setState('saving');
        try { await onSave(); setState('saved'); setTimeout(() => setState('idle'), 2500); } catch (e: any) { setErr(e.message); setState('error'); }
      }}><Save className="h-4 w-4" /> {state === 'saving' ? 'Saving…' : 'Save changes'}</button>
      {state === 'saved' && <span className="text-sm font-medium text-emerald-600">Saved</span>}
      {state === 'error' && <span className="text-sm font-medium text-rose-600">{err}</span>}
    </div>
  );
}

export const fmtDate = (s?: string) => (s ? new Date(s).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

/* ------------------------------------------------------------------ */
/* Tickets                                                             */
/* ------------------------------------------------------------------ */
/** Which role newcomers get, and which roles approved members get (changeable any time, no re-lock). */
function GateRoles({ api, res, g, onSaved }: any) {
  const [a, setA] = useState(g.applicantRoleId || '');
  const [m, setM] = useState(g.memberRoleId || '');
  const [extra, setExtra] = useState<string[]>(g.approvedExtraRoleIds || []);
  const [err, setErr] = useState('');
  const sel = 'mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm';
  const opts = (exclude: string[]) => res.roles.filter((r: any) => !exclude.includes(r.id)).map((r: any) => <option key={r.id} value={r.id}>@{r.name}</option>);
  return (
    <div className="mt-5 rounded-xl border border-indigo-200 bg-white p-4">
      <div className="text-sm font-bold text-slate-900">Roles on join and on approval</div>
      <p className="mt-0.5 text-xs text-slate-500">Set per server. Change them any time; it doesn’t re-lock anything.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">When someone joins, give<select className={sel} value={a} onChange={(e) => setA(e.target.value)}><option value="">Choose a role</option>{opts([])}</select><span className="text-xs text-slate-500">They see only public channels and the private apply channel.</span></label>
        <label className="text-sm font-medium text-slate-700">When approved, replace it with<select className={sel} value={m} onChange={(e) => setM(e.target.value)}><option value="">Choose a role</option>{opts([a])}</select><span className="text-xs text-slate-500">The newcomer role is removed at the same time.</span></label>
        <div className="text-sm font-medium text-slate-700">Also give on approval <span className="font-normal text-slate-500">(optional)</span>
          <div className="mt-1 flex flex-wrap gap-1.5">{extra.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">@{res.roles.find((r: any) => r.id === id)?.name || 'role'}<button type="button" onClick={() => setExtra(extra.filter((x) => x !== id))}>×</button></span>)}</div>
          <select className={sel} value="" onChange={(e) => e.target.value && setExtra([...extra, e.target.value])}><option value="">Add a role</option>{opts([a, m, ...extra])}</select>
        </div>
      </div>
      {err && <p className="mt-2 text-sm font-semibold text-rose-700">{err}</p>}
      <button className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700" onClick={async () => { setErr(''); try { await api('/gate/roles', 'PUT', { applicantRoleId: a, memberRoleId: m, approvedExtraRoleIds: extra }); onSaved('Roles saved.'); } catch (e: any) { setErr(e.message); } }}>Save roles</button>
    </div>
  );
}

function TicketsTab({ communityId, api, cfg, res, onSave }: { communityId: string; api: any; cfg: any; res: Resources; onSave: (v: any) => Promise<void> }) {
  const [c, setC] = useState(cfg);
  const [openType, setOpenType] = useState<number | null>(null);
  const [tickets, setTickets] = useState<any[] | null>(null);
  const roles = res.roles.map((r) => ({ ...r }));

  const loadTickets = useCallback(() => api('/tickets').then(setTickets).catch(() => setTickets([])), [api]);
  useEffect(() => { loadTickets(); }, [loadTickets]);

  const setType = (i: number, patch: any) => setC({ ...c, types: c.types.map((t: any, n: number) => (n === i ? { ...t, ...patch } : t)) });

  return (
    <div className="space-y-6">
      <Card title="Ticket panel" desc="What members see in Discord: dropdown or buttons, your own embed with images and colours, and who gets notified. The preview updates as you type.">
        <TicketPanelDesigner communityId={communityId} c={c} setC={setC} api={api} />
      </Card>
    <div className="grid gap-6 2xl:grid-cols-[1.3fr_1fr]">
      <div className="space-y-6">
        <Card title="Ticket settings" right={<Toggle on={c.enabled} onChange={(v) => setC({ ...c, enabled: v })} label={c.enabled ? 'On' : 'Off'} />}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Category for ticket channels<div className="mt-1"><Pick options={res.categories} value={c.categoryId} onChange={(v) => setC({ ...c, categoryId: v })} placeholder="Create “Tickets” automatically" /></div></label>
            <label className="text-sm font-medium text-slate-700">Log channel (opened / closed tickets)<div className="mt-1"><Pick options={res.textChannels} value={c.logChannelId} onChange={(v) => setC({ ...c, logChannelId: v })} placeholder="No log channel" /></div></label>
            <div className="text-sm font-medium text-slate-700 md:col-span-2">Staff roles that see every ticket<div className="mt-1"><MultiPick options={roles} value={c.staffRoleIds} onChange={(v) => setC({ ...c, staffRoleIds: v })} placeholder="Add a staff role" prefix="@" /></div></div>
          </div>
        </Card>

        <Card title="Ticket types" desc="Members pick one of these. Each type can add its own team on top of the staff roles."
          right={<button className={ghost} onClick={() => setC({ ...c, types: [...c.types, { key: '', label: 'New type', emoji: '🎫', description: '', staffRoleIds: [] }] })}><Plus className="h-4 w-4" /> Add type</button>}>
          <div className="space-y-3">
            {c.types.map((t: any, i: number) => (
              <div key={i} className="rounded-xl border border-slate-200 p-4"><div className="grid gap-3 lg:grid-cols-[70px_1fr_1.4fr_1.2fr_auto_auto] lg:items-start">
                <input className={input} value={t.emoji} onChange={(e) => setType(i, { emoji: e.target.value })} aria-label="Emoji" />
                <input className={input} value={t.label} onChange={(e) => setType(i, { label: e.target.value })} placeholder="Label" />
                <input className={input} value={t.description} onChange={(e) => setType(i, { description: e.target.value })} placeholder="Short description" />
                <MultiPick options={roles} value={t.staffRoleIds || []} onChange={(v) => setType(i, { staffRoleIds: v })} placeholder="Extra team" prefix="@" />
                <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setC({ ...c, types: c.types.filter((_: any, n: number) => n !== i) })} aria-label="Delete type"><Trash2 className="h-4 w-4" /></button>
                <button className="rounded-lg px-2 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50" onClick={() => setOpenType(openType === i ? null : i)}>{openType === i ? 'Less' : 'More'}</button>
              </div>
              {openType === i && <TicketTypeExtras communityId={communityId} t={t} set={(patch) => setType(i, patch)} />}
              </div>
            ))}
          </div>
          <div className="mt-5"><SaveBar onSave={() => onSave(c)} /></div>
        </Card>


      </div>

      <Card title="Recent tickets" right={<button className={ghost} onClick={loadTickets}><RefreshCw className="h-4 w-4" /> Refresh</button>}>
        {!tickets ? <div className="h-40 animate-pulse rounded-xl bg-slate-100" /> : !tickets.length ? <p className="text-sm text-slate-500">No tickets yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {tickets.slice(0, 40).map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">#{t.number} · {t.subject}</div>
                  <div className="text-xs text-slate-500">{t.typeLabel} · by {t.openerName} · {fmtDate(t.createdAt)}{t.claimedByName ? ` · claimed by ${t.claimedByName}` : ''}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${t.status === 'OPEN' ? 'bg-emerald-50 text-emerald-700' : t.status === 'CLAIMED' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{t.status}</span>
                  {t.status !== 'CLOSED' && <button className="text-xs font-semibold text-rose-600 hover:underline" onClick={async () => { await api(`/tickets/${t.id}/close`, 'POST', { reason: 'Closed from dashboard' }).catch(() => undefined); loadTickets(); }}>Close</button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Warnings                                                            */
/* ------------------------------------------------------------------ */
function WarningsTab({ api, cfg, onSave, communityId }: { api: any; cfg: any; onSave: (v: any) => Promise<void>; communityId: string }) {
  const [c, setC] = useState(cfg);
  const [member, setMember] = useState<MemberOpt | null>(null);
  const [list, setList] = useState<any[] | null>(null);
  const [form, setForm] = useState({ discordUserId: '', reasonKey: cfg.reasons[0]?.key || '', note: '' });
  const [result, setResult] = useState('');

  const loadList = useCallback(() => api('/warnings').then(setList).catch(() => setList([])), [api]);
  useEffect(() => { loadList(); }, [loadList]);

  const setReason = (i: number, p: any) => setC({ ...c, reasons: c.reasons.map((r: any, n: number) => (n === i ? { ...r, ...p } : r)) });
  const setStep = (i: number, p: any) => setC({ ...c, thresholds: c.thresholds.map((r: any, n: number) => (n === i ? { ...r, ...p } : r)) });

  return (
    <div className="grid gap-6 2xl:grid-cols-[1.3fr_1fr]">
      <div className="space-y-6">
        <Card title="How warnings work" right={<Toggle on={c.enabled} onChange={(v) => setC({ ...c, enabled: v })} label={c.enabled ? 'On' : 'Off'} />}>
          <ol className="grid gap-3 md:grid-cols-3">
            {[['1', 'A moderator warns', 'With /warn or from here, choosing a reason.'], ['2', 'Points add up', 'Each reason has points. Points expire after the time below.'], ['3', 'Actions trigger', 'Crossing a points level times out, kicks or bans automatically.']].map(([n, t, d]) => (
              <li key={n} className="rounded-xl bg-slate-50 p-4"><div className="text-2xl font-extrabold text-indigo-600">{n}</div><div className="mt-1 font-semibold text-slate-900">{t}</div><div className="text-sm text-slate-500">{d}</div></li>
            ))}
          </ol>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">Points expire after (days)<input type="number" min={1} max={365} className={`${input} mt-1`} value={c.expiryDays} onChange={(e) => setC({ ...c, expiryDays: Number(e.target.value) })} /></label>
            <div className="flex items-end"><Toggle on={c.dmMember} onChange={(v) => setC({ ...c, dmMember: v })} label="DM the member when warned" /></div>
          </div>
        </Card>

        <Card title="Reasons and points" right={<button className={ghost} onClick={() => setC({ ...c, reasons: [...c.reasons, { key: '', label: 'New reason', points: 1 }] })}><Plus className="h-4 w-4" /> Add reason</button>}>
          <div className="space-y-2">
            {c.reasons.map((r: any, i: number) => (
              <div key={i} className="grid grid-cols-[1fr_110px_auto] items-center gap-3">
                <input className={input} value={r.label} onChange={(e) => setReason(i, { label: e.target.value })} />
                <div className="flex items-center gap-2"><input type="number" min={1} max={20} className={input} value={r.points} onChange={(e) => setReason(i, { points: Number(e.target.value) })} /><span className="text-xs text-slate-500">pts</span></div>
                <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setC({ ...c, reasons: c.reasons.filter((_: any, n: number) => n !== i) })} aria-label="Delete reason"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Automatic actions" desc="When a member’s active points reach a level, the action runs once."
          right={<button className={ghost} onClick={() => setC({ ...c, thresholds: [...c.thresholds, { points: 5, action: 'TIMEOUT', durationMinutes: 60 }] })}><Plus className="h-4 w-4" /> Add step</button>}>
          <div className="space-y-2">
            {c.thresholds.map((t: any, i: number) => (
              <div key={i} className="grid grid-cols-[auto_110px_auto_150px_1fr_auto] items-center gap-3 text-sm">
                <span className="text-slate-500">At</span>
                <input type="number" min={1} className={input} value={t.points} onChange={(e) => setStep(i, { points: Number(e.target.value) })} />
                <span className="text-slate-500">points →</span>
                <select className={input} value={t.action} onChange={(e) => setStep(i, { action: e.target.value })}>
                  <option value="TIMEOUT">Timeout</option><option value="KICK">Kick</option><option value="BAN">Ban</option>
                </select>
                {t.action === 'TIMEOUT' ? (
                  <select className={input} value={t.durationMinutes} onChange={(e) => setStep(i, { durationMinutes: Number(e.target.value) })}>
                    {[[10, '10 minutes'], [60, '1 hour'], [360, '6 hours'], [1440, '1 day'], [4320, '3 days'], [10080, '1 week'], [40320, '28 days']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : <span />}
                <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setC({ ...c, thresholds: c.thresholds.filter((_: any, n: number) => n !== i) })} aria-label="Delete step"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <div className="mt-5"><SaveBar onSave={() => onSave(c)} /></div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card title="Warn a member">
          <div className="space-y-3">
            <MemberPick communityId={communityId} value={member} onChange={(m) => { setMember(m); setForm({ ...form, discordUserId: m?.id || '' }); }} />
            <select className={input} value={form.reasonKey} onChange={(e) => setForm({ ...form, reasonKey: e.target.value })}>
              {c.reasons.map((r: any) => <option key={r.key || r.label} value={r.key}>{r.label} ({r.points} pts)</option>)}
            </select>
            <input className={input} placeholder="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <button className={btn} onClick={async () => {
              setResult('');
              try {
                const r = await api('/warnings', 'POST', form);
                setResult(`Warned: ${r.reason.label}. Points ${r.pointsBefore} → ${r.pointsAfter}.${r.threshold ? ` Action: ${r.threshold.action}${r.actionResult ? ` (${r.actionResult})` : ''}.` : ''}`);
                loadList();
              } catch (e: any) { setResult(e.message); }
            }}><ShieldAlert className="h-4 w-4" /> Issue warning</button>
            {result && <p className="text-sm text-slate-600">{result}</p>}
          </div>
        </Card>
        <Card title="Recent warnings" right={<button className={ghost} onClick={loadList}><RefreshCw className="h-4 w-4" /></button>}>
          {!list ? <div className="h-32 animate-pulse rounded-xl bg-slate-100" /> : !list.length ? <p className="text-sm text-slate-500">No warnings yet.</p> : (
            <ul className="divide-y divide-slate-100">
              {list.slice(0, 30).map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div><div className="font-semibold text-slate-900">{s.reasonLabel} · {s.points} pts</div><div className="text-xs text-slate-500">{s.memberName || s.discordUserId}{s.moderatorName ? ` · by ${s.moderatorName}` : ''} · {fmtDate(s.createdAt)}{s.revoked ? ' · revoked' : ''}</div></div>
                  {!s.revoked && <button className="text-xs font-semibold text-slate-500 hover:text-rose-600" onClick={async () => { await api(`/warnings/${s.id}/revoke`, 'POST').catch(() => undefined); loadList(); }}>Revoke</button>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Role rules                                                          */
/* ------------------------------------------------------------------ */
const CONDITIONS: [string, string][] = [
  ['ALWAYS', 'Every approved applicant'],
  ['ANSWER_CONTAINS', 'An answer contains…'],
  ['RECRUITER_CODE', 'Used a specific recruiter code'],
  ['ANY_RECRUITER_CODE', 'Used any recruiter code'],
  ['SOURCE', 'Came from a source'],
];

function RoleRulesTab({ cfg, res, onSave }: { cfg: any; res: Resources; onSave: (v: any) => Promise<void> }) {
  const [c, setC] = useState(cfg);
  const setRule = (i: number, p: any) => setC({ ...c, rules: c.rules.map((r: any, n: number) => (n === i ? { ...r, ...p } : r)) });
  return (
    <Card title="Role rules on approval" desc="When an application is approved, every enabled rule that matches runs. If the person hasn’t joined yet, rules run when they join."
      right={<div className="flex items-center gap-3"><Toggle on={c.enabled} onChange={(v) => setC({ ...c, enabled: v })} label={c.enabled ? 'On' : 'Off'} />
        <button className={ghost} onClick={() => setC({ ...c, rules: [...c.rules, { id: '', name: 'New rule', enabled: true, condition: { type: 'ALWAYS' }, addRoleIds: [], removeRoleIds: [] }] })}><Plus className="h-4 w-4" /> Add rule</button></div>}>
      {!c.rules.length && <p className="mb-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No rules yet. Example: “Every approved applicant” → add <b>@Member</b>, remove <b>@Applicant</b>.</p>}
      <div className="space-y-4">
        {c.rules.map((r: any, i: number) => (
          <div key={i} className="rounded-xl border border-slate-200 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <input className={`${input} max-w-xs font-semibold`} value={r.name} onChange={(e) => setRule(i, { name: e.target.value })} />
              <Toggle on={r.enabled} onChange={(v) => setRule(i, { enabled: v })} label={r.enabled ? 'Enabled' : 'Disabled'} />
              <button className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setC({ ...c, rules: c.rules.filter((_: any, n: number) => n !== i) })} aria-label="Delete rule"><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <div className="space-y-2 text-sm font-medium text-slate-700">
                When
                <select className={input} value={r.condition.type} onChange={(e) => setRule(i, { condition: { type: e.target.value } })}>
                  {CONDITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {r.condition.type === 'ANSWER_CONTAINS' && (<>
                  <input className={input} placeholder="Question contains (optional)" value={r.condition.question || ''} onChange={(e) => setRule(i, { condition: { ...r.condition, question: e.target.value } })} />
                  <input className={input} placeholder="Answer contains" value={r.condition.value || ''} onChange={(e) => setRule(i, { condition: { ...r.condition, value: e.target.value } })} />
                </>)}
                {r.condition.type === 'RECRUITER_CODE' && <input className={input} placeholder="Recruiter code" value={r.condition.code || ''} onChange={(e) => setRule(i, { condition: { ...r.condition, code: e.target.value } })} />}
                {r.condition.type === 'SOURCE' && <input className={input} placeholder="Source, e.g. website" value={r.condition.source || ''} onChange={(e) => setRule(i, { condition: { ...r.condition, source: e.target.value } })} />}
              </div>
              <div className="text-sm font-medium text-slate-700">Give roles<div className="mt-2"><MultiPick options={res.roles} value={r.addRoleIds} onChange={(v) => setRule(i, { addRoleIds: v })} placeholder="Add a role" prefix="@" /></div></div>
              <div className="text-sm font-medium text-slate-700">Remove roles<div className="mt-2"><MultiPick options={res.roles} value={r.removeRoleIds} onChange={(v) => setRule(i, { removeRoleIds: v })} placeholder="Add a role" prefix="@" /></div></div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-500">The bot’s own role must be above every role it gives or removes (Server Settings → Roles).</p>
      <div className="mt-5"><SaveBar onSave={() => onSave(c)} /></div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Review rooms                                                        */
/* ------------------------------------------------------------------ */
function ReviewRoomsTab({ communityId, api, cfg, res, onSave }: { communityId: string; api: any; cfg: any; res: Resources; onSave: (v: any) => Promise<void> }) {
  const [c, setC] = useState<any>({ ...cfg, specialMembers: (cfg.specialMemberIds || []).map((id: string) => ({ id, name: '…', username: '' })) });
  const [rooms, setRooms] = useState<any[] | null>(null);
  const reloadRooms = useCallback(() => api('/review-rooms').then(setRooms).catch(() => setRooms([])), [api]);
  useEffect(() => { reloadRooms(); }, [reloadRooms]);
  // Show names for saved special-access members.
  useEffect(() => {
    (cfg.specialMemberIds || []).forEach((id: string) => fetch(`/api/v1/communities/${encodeURIComponent(communityId)}/discord/member-search?q=${id}`, { credentials: 'include', headers: { 'x-community-id': communityId } })
      .then((r) => r.json()).then((j) => { const m = j?.data?.[0]; if (m) setC((cur: any) => ({ ...cur, specialMembers: (cur.specialMembers || []).map((x: any) => (x.id === id ? m : x)) })); }).catch(() => undefined));
  }, [communityId]); // eslint-disable-line react-hooks/exhaustive-deps
  const setTier = (i: number, p: any) => setC({ ...c, tiers: c.tiers.map((t: any, n: number) => (n === i ? { ...t, ...p } : t)) });

  return (
    <div className="grid gap-6 2xl:grid-cols-[1.3fr_1fr]">
      <div className="space-y-6">
        <Card title="Review rooms" right={<Toggle on={c.enabled} onChange={(v) => setC({ ...c, enabled: v })} label={c.enabled ? 'On' : 'Off'} />}
          desc="Every new application gets a private channel. Inside it, reviewers can start a temporary voice room for the interview, escalate to a higher rank, and approve or reject.">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">Category<div className="mt-1"><Pick options={res.categories} value={c.categoryId} onChange={(v) => setC({ ...c, categoryId: v })} placeholder="Create “Applications”" /></div></label>
            <label className="text-sm font-medium text-slate-700">Delete closed rooms after (hours)<input type="number" min={1} max={720} className={`${input} mt-1`} value={c.deleteAfterHours} onChange={(e) => setC({ ...c, deleteAfterHours: Number(e.target.value) })} /></label>
            <div className="flex items-end"><Toggle on={c.applicantCanSee} onChange={(v) => setC({ ...c, applicantCanSee: v })} label="Applicant can join the room" /></div>
          </div>
        </Card>
        <Card title="Reviewer ranks" desc="Rooms start with the first rank. “Escalate” opens the room to the next rank and pings them. Only the current rank or higher can decide."
          right={<button className={ghost} onClick={() => setC({ ...c, tiers: [...c.tiers, { name: 'New rank', roleIds: [] }] })}><Plus className="h-4 w-4" /> Add rank</button>}>
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Drag a rank by its handle to change the order (top = first to review, bottom = highest). Higher ranks can mark a lower rank’s part as done, and any reviewer can give one member special access, from the staff thread in Discord.</p>
            {c.tiers.map((t: any, i: number) => (
              <div key={i}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-indigo-400'); }}
                onDragLeave={(e) => e.currentTarget.classList.remove('ring-2', 'ring-indigo-400')}
                onDrop={(e) => {
                  e.preventDefault(); e.currentTarget.classList.remove('ring-2', 'ring-indigo-400');
                  const from = Number(e.dataTransfer.getData('text/plain'));
                  if (Number.isNaN(from) || from === i) return;
                  const next = [...c.tiers]; const [moved] = next.splice(from, 1); next.splice(i, 0, moved);
                  setC({ ...c, tiers: next });
                }}
                className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 transition md:grid-cols-[56px_220px_1fr_auto] md:items-start">
                <div className="flex items-center gap-1">
                  <span className="cursor-grab select-none text-lg leading-none text-slate-400 active:cursor-grabbing" title="Drag to reorder" aria-hidden>⠿</span>
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-indigo-50 font-bold text-indigo-700">{i + 1}</div>
                </div>
                <input className={input} value={t.name} onChange={(e) => setTier(i, { name: e.target.value })} />
                <MultiPick options={res.roles} value={t.roleIds} onChange={(v) => setTier(i, { roleIds: v })} placeholder="Add a role for this rank" prefix="@" />
                <div className="flex items-center gap-0.5">
                  <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" disabled={i === 0} aria-label="Move up" onClick={() => { const n = [...c.tiers]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setC({ ...c, tiers: n }); }}><ArrowUp className="h-4 w-4" /></button>
                  <button className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30" disabled={i === c.tiers.length - 1} aria-label="Move down" onClick={() => { const n = [...c.tiers]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setC({ ...c, tiers: n }); }}><ArrowUp className="h-4 w-4 rotate-180" /></button>
                  <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setC({ ...c, tiers: c.tiers.filter((_: any, n: number) => n !== i) })} aria-label="Delete rank"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="font-semibold text-slate-900">Special access members</div>
            <p className="text-xs text-slate-600">People outside the ranks who join every application chat and staff thread, for example an advisor. Reviewers can also invite someone to one application from Discord (➕ Invite member), and higher ranks can remove them.</p>
            <div className="mt-2"><MembersPick communityId={communityId} value={(c.specialMembers || [])} onChange={(v) => setC({ ...c, specialMembers: v, specialMemberIds: v.map((m: any) => m.id) })} /></div>
          </div>
          <div className="mt-5"><SaveBar onSave={() => { const { specialMembers, ...rest } = c; return onSave(rest); }} /></div>
        </Card>
      </div>
      <Card title="Open rooms">
        {!rooms ? <div className="h-32 animate-pulse rounded-xl bg-slate-100" /> : !rooms.length ? <p className="text-sm text-slate-500">No review rooms yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {rooms.slice(0, 30).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div><div className="font-semibold text-slate-900">{r.applicantName}</div><div className="text-xs text-slate-500">{fmtDate(r.createdAt)}{r.voiceChannelId ? ' · voice room open' : ''}</div></div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700"><ArrowUp className="h-3 w-3" />{c.tiers[r.tier]?.name || `Rank ${r.tier + 1}`}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.status === 'OPEN' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{r.decision || r.status}</span>
                </div>
                {r.status === 'OPEN' && !!(r.invited || []).length && (
                  <div className="basis-full">
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="font-semibold text-slate-500">Special access:</span>
                      {(r.invited || []).map((id: string) => (
                        <span key={id} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                          <MemberName id={id} communityId={communityId} />
                          <button aria-label="Remove access" title="Remove access" onClick={() => api(`/rooms/${r.id}/access/${id}`, 'DELETE').then(reloadRooms)}>×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bulk tools                                                          */
/* ------------------------------------------------------------------ */
const ACTIONS: { id: string; label: string; desc: string; audience: boolean }[] = [
  { id: 'ADD_ROLE', label: 'Give a role', desc: 'Add a role to every matching member.', audience: true },
  { id: 'REMOVE_ROLE', label: 'Remove a role', desc: 'Take a role from every matching member.', audience: true },
  { id: 'DM_MEMBERS', label: 'DM members', desc: 'Send a direct message (up to 1,000 per run).', audience: true },
  { id: 'CHANNEL_MESSAGE', label: 'Message channels', desc: 'Post the same message in several channels.', audience: false },
  { id: 'NICKNAME_RESET', label: 'Reset nicknames', desc: 'Clear nicknames of matching members.', audience: true },
  { id: 'PURGE_MESSAGES', label: 'Delete messages', desc: 'Delete recent messages (under 14 days old) in channels.', audience: false },
  { id: 'KICK_MEMBERS', label: 'Kick members', desc: 'Remove matching members from the server.', audience: true },
];

function BulkTab({ api, res, communityId }: { api: any; res: Resources; communityId: string }) {
  const [picked, setPicked] = useState<MemberOpt[]>([]);
  const [fromMember, setFromMember] = useState<MemberOpt | null>(null);
  const [action, setAction] = useState('ADD_ROLE');
  const [aud, setAud] = useState<any>({ mode: 'ALL', days: 7, includeBots: false });
  const [p, setP] = useState<any>({ roleId: '', message: '', channelIds: [], count: 50, fromUserId: '', confirm: '' });
  const [preview, setPreview] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [jobs, setJobs] = useState<any[]>([]);
  const a = ACTIONS.find((x) => x.id === action)!;

  const loadJobs = useCallback(() => api('/bulk').then(setJobs).catch(() => undefined), [api]);
  useEffect(() => { loadJobs(); const t = setInterval(loadJobs, 4000); return () => clearInterval(t); }, [loadJobs]);

  return (
    <div className="grid gap-6 2xl:grid-cols-[1.3fr_1fr]">
      <Card title="New bulk action">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {ACTIONS.map((x) => (
            <button key={x.id} onClick={() => { setAction(x.id); setPreview(null); setMsg(''); }}
              className={`rounded-xl border p-3 text-left transition ${action === x.id ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}>
              <div className={`text-sm font-bold ${x.id === 'KICK_MEMBERS' ? 'text-rose-700' : 'text-slate-900'}`}>{x.label}</div>
              <div className="mt-0.5 text-xs text-slate-500">{x.desc}</div>
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {(action === 'ADD_ROLE' || action === 'REMOVE_ROLE') && <label className="text-sm font-medium text-slate-700">Role<div className="mt-1"><Pick options={res.roles} value={p.roleId} onChange={(v) => setP({ ...p, roleId: v })} placeholder="Choose a role" /></div></label>}
          {(action === 'DM_MEMBERS' || action === 'CHANNEL_MESSAGE') && (
            <label className="text-sm font-medium text-slate-700 lg:col-span-2">Message<textarea rows={4} maxLength={2000} className={`${input} mt-1`} value={p.message} onChange={(e) => setP({ ...p, message: e.target.value })} placeholder="Use {user} to mention each member in DMs" /></label>
          )}
          {(action === 'CHANNEL_MESSAGE' || action === 'PURGE_MESSAGES') && <div className="text-sm font-medium text-slate-700 lg:col-span-2">Channels<div className="mt-1"><MultiPick options={res.textChannels} value={p.channelIds} onChange={(v) => setP({ ...p, channelIds: v })} placeholder="Add a channel" prefix="#" /></div></div>}
          {action === 'PURGE_MESSAGES' && (<>
            <label className="text-sm font-medium text-slate-700">Messages per channel (max 100)<input type="number" min={1} max={100} className={`${input} mt-1`} value={p.count} onChange={(e) => setP({ ...p, count: Number(e.target.value) })} /></label>
            <div className="text-sm font-medium text-slate-700">Only from member (optional)<div className="mt-1"><MemberPick communityId={communityId} value={fromMember} onChange={(m) => { setFromMember(m); setP({ ...p, fromUserId: m?.id || '' }); }} /></div></div>
          </>)}
        </div>

        {a.audience && (
          <div className="mt-6 rounded-xl bg-slate-50 p-4">
            <div className="text-sm font-bold text-slate-900">Who</div>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <select className={input} value={aud.mode} onChange={(e) => { setAud({ ...aud, mode: e.target.value }); setPreview(null); }}>
                <option value="ALL">All members</option><option value="HAS_ROLE">Members with a role</option><option value="MISSING_ROLE">Members without a role</option>
                <option value="JOINED_WITHIN_DAYS">Joined in the last N days</option><option value="JOINED_BEFORE_DAYS">Joined more than N days ago</option><option value="USER_IDS">Specific members</option>
              </select>
              {(aud.mode === 'HAS_ROLE' || aud.mode === 'MISSING_ROLE') && <Pick options={res.roles} value={aud.roleId} onChange={(v) => { setAud({ ...aud, roleId: v }); setPreview(null); }} placeholder="Choose a role" />}
              {(aud.mode === 'JOINED_WITHIN_DAYS' || aud.mode === 'JOINED_BEFORE_DAYS') && <input type="number" min={1} className={input} value={aud.days} onChange={(e) => { setAud({ ...aud, days: Number(e.target.value) }); setPreview(null); }} />}
              {aud.mode === 'USER_IDS' && <div className="lg:col-span-2"><MembersPick communityId={communityId} value={picked} onChange={(v) => { setPicked(v); setAud({ ...aud, userIds: v.map((m) => m.id) }); setPreview(null); }} /></div>}
              <Toggle on={aud.includeBots} onChange={(v) => { setAud({ ...aud, includeBots: v }); setPreview(null); }} label="Include bots" />
            </div>
            <button className={`${ghost} mt-3`} onClick={async () => { setMsg(''); try { setPreview(await api('/bulk/preview', 'POST', { audience: aud })); } catch (e: any) { setMsg(e.message); } }}><RefreshCw className="h-4 w-4" /> Count matching members</button>
            {preview && <p className="mt-2 text-sm text-slate-700"><b>{preview.count}</b> members match{preview.sample?.length ? `, e.g. ${preview.sample.map((s: any) => s.name).join(', ')}` : ''}.</p>}
          </div>
        )}

        {action === 'KICK_MEMBERS' && <label className="mt-4 block text-sm font-medium text-rose-700">Type KICK to confirm<input className={`${input} mt-1`} value={p.confirm} onChange={(e) => setP({ ...p, confirm: e.target.value })} /></label>}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button className={`${btn} ${action === 'KICK_MEMBERS' ? '!bg-rose-600 hover:!bg-rose-700' : ''}`} onClick={async () => {
            setMsg('');
            try { await api('/bulk', 'POST', { action, ...p, audience: aud }); setMsg('Started. Progress is shown on the right.'); loadJobs(); } catch (e: any) { setMsg(e.message); }
          }}><Layers className="h-4 w-4" /> Run</button>
          {msg && <span className="text-sm text-slate-600">{msg}</span>}
        </div>
      </Card>

      <Card title="Runs">
        {!jobs.length ? <p className="text-sm text-slate-500">No bulk runs yet.</p> : (
          <ul className="space-y-3">
            {jobs.slice(0, 15).map((j) => {
              const pct = j.total ? Math.round(((j.done + j.failed) / j.total) * 100) : j.status === 'DONE' ? 100 : 0;
              return (
                <li key={j.id} className="rounded-xl border border-slate-200 p-4 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{ACTIONS.find((x) => x.id === j.action)?.label || j.action}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${j.status === 'DONE' ? 'bg-emerald-50 text-emerald-700' : j.status === 'FAILED' ? 'bg-rose-50 text-rose-700' : 'bg-indigo-50 text-indigo-700'}`}>{j.status}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${pct}%` }} /></div>
                  <div className="mt-1 flex justify-between text-xs text-slate-500"><span>{j.done} done{j.failed ? ` · ${j.failed} failed` : ''} of {j.total}</span><span>{fmtDate(j.createdAt)}</span></div>
                  {(j.status === 'RUNNING' || j.status === 'QUEUED') && <button className="mt-2 text-xs font-semibold text-rose-600 hover:underline" onClick={() => api(`/bulk/${j.id}/cancel`, 'POST').then(loadJobs)}>Cancel</button>}
                  {!!j.errors?.length && <p className="mt-2 text-xs text-rose-600">{j.errors[0]}</p>}
                  {j.status !== 'RUNNING' && j.status !== 'QUEUED' && (
                    <div className="mt-2 flex gap-3 text-xs font-semibold">
                      {(j.status !== 'DONE' || j.failed > 0) && <button className="text-indigo-600 hover:underline" onClick={() => api(`/bulk/${j.id}/retry`, 'POST').then(loadJobs).catch((e: any) => setMsg(e.message))}>Retry</button>}
                      <button className="text-slate-500 hover:text-rose-600 hover:underline" onClick={() => api(`/bulk/${j.id}`, 'DELETE').then(loadJobs).catch((e: any) => setMsg(e.message))}>Delete</button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Member picker: search the Discord server by name                    */
/* ------------------------------------------------------------------ */
export interface MemberOpt { id: string; name: string; username: string; avatar?: string }

export function MemberPick({ communityId, value, onChange, placeholder = 'Search members by name' }: { communityId: string; value: MemberOpt | null; onChange: (m: MemberOpt | null) => void; placeholder?: string }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<MemberOpt[]>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      fetch(`/api/v1/communities/${encodeURIComponent(communityId)}/discord/member-search?q=${encodeURIComponent(q)}`, { credentials: 'include', headers: { 'x-community-id': communityId } })
        .then((r) => r.json()).then((j) => setList(j.success ? j.data : [])).catch(() => setList([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, open, communityId]);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
        {value.avatar && <img src={value.avatar} alt="" className="h-6 w-6 rounded-full" />}
        <span className="text-sm font-semibold text-slate-900">{value.name}</span>
        <span className="text-xs text-slate-500">@{value.username}</span>
        <button type="button" className="ml-auto text-slate-400 hover:text-rose-600" onClick={() => onChange(null)} aria-label="Clear"><X className="h-4 w-4" /></button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input className={input} value={q} placeholder={placeholder} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 200)} onChange={(e) => setQ(e.target.value)} />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {!list.length && <li className="px-3 py-2 text-sm text-slate-400">{q ? 'No members found' : 'Type a name…'}</li>}
          {list.map((m) => (
            <li key={m.id}>
              <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-indigo-50" onMouseDown={() => { onChange(m); setQ(''); }}>
                {m.avatar && <img src={m.avatar} alt="" className="h-6 w-6 rounded-full" />}
                <span className="font-semibold text-slate-900">{m.name}</span><span className="text-xs text-slate-500">@{m.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Several members (chips). */
export function MembersPick({ communityId, value, onChange }: { communityId: string; value: MemberOpt[]; onChange: (v: MemberOpt[]) => void }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((m) => (
          <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
            {m.name}<button type="button" onClick={() => onChange(value.filter((x) => x.id !== m.id))} aria-label="Remove"><X className="h-3 w-3" /></button>
          </span>
        ))}
        {!value.length && <span className="text-xs text-slate-400">No members picked</span>}
      </div>
      <MemberPick communityId={communityId} value={null} onChange={(m) => m && !value.some((x) => x.id === m.id) && onChange([...value, m])} placeholder="Search and add members" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Recruitment in Discord                                              */
/* ------------------------------------------------------------------ */
function RecruitTab({ api, cfg, rooms, res, onSave, onSaveRooms, goRooms, communityId }: { communityId: string; api: any; cfg: any; rooms: any; res: Resources; onSave: (v: any) => Promise<void>; onSaveRooms: (v: any) => Promise<void>; goRooms: () => void }) {
  const [c, setC] = useState(cfg);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [drafting, setDrafting] = useState('');
  useEffect(() => { api('/recruitment/threshold').then((d: any) => setThreshold(d.threshold)).catch(() => undefined); }, [api]);
  const sc = c.screening;
  const setSc = (p: any) => setC({ ...c, screening: { ...c.screening, ...p } });
  const setQ = (i: number, p: any) => setSc({ questions: sc.questions.map((q: any, n: number) => (n === i ? { ...q, ...p } : q)) });
  const [panelCh, setPanelCh] = useState<string>(cfg?.panelChannelId || '');
  const [msg, setMsg] = useState('');
  const setM = (k: string, v: string) => setC({ ...c, messages: { ...c.messages, [k]: v } });
  const steps = [
    ['Apply', 'Members press Apply (or type /apply) and answer your questions in Discord.'],
    ['Review', 'The application is posted in your review channel with every answer and Approve / Reject buttons.'],
    ['Decide', 'Decide in Discord or the dashboard. The post updates, the applicant gets your message and role rules run.'],
  ];
  return (
    <div className="space-y-6">
      <SecureSetupCard api={api} res={res} />
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map(([t, d], i) => (
          <li key={t} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-2xl font-extrabold text-indigo-600">{i + 1}</div><div className="mt-1 font-bold text-slate-900">{t}</div><div className="text-sm text-slate-500">{d}</div></li>
        ))}
      </ol>

      <Card title="Private application chat" desc="Each applicant gets their own private chat with the bot and your authority roles. Inside it, a private staff thread (the applicant can’t see it) holds scores, summaries, escalations and staff discussion."
        right={<Toggle on={rooms.enabled} onChange={(v) => onSaveRooms({ ...rooms, enabled: v })} label={rooms.enabled ? 'On' : 'Off'} />}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="text-sm font-bold text-slate-900">Rules screening is run by</div>
            <div className="mt-3 space-y-2 text-sm">
              {[['AUTO', 'Community Manager (automatic)', 'Starts right after the applicant agrees to the rules.'], ['MANUAL', 'Interviewer (manual)', 'Staff press “Send rules quiz” when ready; the bot observes and records.']].map(([v, l, d]) => (
                <label key={v} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${sc.mode === v ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`}>
                  <input type="radio" checked={sc.mode === v} onChange={() => setSc({ mode: v })} className="mt-1" /><span><b className="text-slate-900">{l}</b><br /><span className="text-slate-500">{d}</span></span>
                </label>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="text-sm font-bold text-slate-900">Interview is run by</div>
            <div className="mt-3 space-y-2 text-sm">
              {[['AUTO', 'Community Manager (automatic)', 'The bot asks your interview questions and posts the answers and a summary for staff.'], ['MANUAL', 'Interviewer (manual)', 'An interviewer presses “Start interview”; the bot keeps the transcript and summarises it.']].map(([v, l, d]) => (
                <label key={v} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${c.interview.mode === v ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`}>
                  <input type="radio" checked={c.interview.mode === v} onChange={() => setC({ ...c, interview: { mode: v } })} className="mt-1" /><span><b className="text-slate-900">{l}</b><br /><span className="text-slate-500">{d}</span></span>
                </label>
              ))}
            </div>
            <InterviewQuestions communityId={communityId} auto={c.interview.mode === 'AUTO'} />
          </div>
          <div className="rounded-xl border border-slate-200 p-4 text-sm">
            <div className="font-bold text-slate-900">Screening threshold</div>
            <div className="mt-2 text-4xl font-extrabold text-indigo-600">{threshold ?? '…'}%</div>
            <p className="mt-1 text-slate-500">Set in <button type="button" className="font-semibold text-indigo-600 hover:underline" onClick={() => goTo('settings', 'recruitment')}>Settings → Recruitment ↗</button>. The score is shown to staff only.</p>
            <div className="mt-4 font-bold text-slate-900">Below the threshold</div>
            <select className={`${input} mt-2`} value={sc.onFail} onChange={(e) => setSc({ onFail: e.target.value })}>
              <option value="GUIDE_AND_CONTINUE">Explain the missed rules, then continue to the interview</option>
              <option value="GUIDE_AND_HOLD">Explain the missed rules, then wait for staff to decide</option>
            </select>
            <button className="mt-4 text-sm font-semibold text-indigo-600 hover:underline" onClick={goRooms}>Set reviewer ranks and escalation →</button>
          </div>
        </div>
        <label className="mt-5 block text-sm font-medium text-slate-700">Consent message (shown above your rules and guide)<textarea rows={2} className={`${input} mt-1`} value={sc.consentText} onChange={(e) => setSc({ consentText: e.target.value })} /></label>
      </Card>

      <RulesCard api={api} res={res} />

      <Card title={`Rules quiz (${sc.questions.length})`} desc="Each question has 4 answers; mark the correct one. The explanation is shown to applicants who get it wrong."
        right={<div className="flex gap-2">
          <button className={ghost} disabled={!!drafting} onClick={async () => {
            setDrafting('Drafting from your rules…');
            try { const qs = await api('/recruitment/draft-quiz', 'POST', { count: 6 }); setSc({ questions: [...sc.questions, ...qs] }); setDrafting(`Added ${qs.length} draft questions. Check them, then save.`); } catch (e: any) { setDrafting(e.message); }
          }}>🧠 Draft from my rules</button>
          <button className={ghost} onClick={() => setSc({ questions: [...sc.questions, { id: '', question: '', options: ['', '', '', ''], correct: 0, explain: '' }] })}><Plus className="h-4 w-4" /> Add question</button>
        </div>}>
        {drafting && <p className="mb-4 text-sm text-slate-600">{drafting}{/server rules/i.test(drafting) && <> <button type="button" className="font-semibold text-indigo-600 hover:underline" onClick={() => document.getElementById('server-rules')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>Go to Server rules ↑</button></>}</p>}
        {!sc.questions.length && <p className="text-sm text-slate-500">No rules questions yet. Without them, the applicant goes straight from consent to the interview.</p>}
        <div className="space-y-4">
          {sc.questions.map((q: any, i: number) => (
            <div key={i} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-2 text-sm font-bold text-slate-400">{i + 1}.</span>
                <input className={`${input} font-semibold`} placeholder="Question" value={q.question} onChange={(e) => setQ(i, { question: e.target.value })} />
                <button className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => setSc({ questions: sc.questions.filter((_: any, n: number) => n !== i) })} aria-label="Delete question"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="mt-3 grid gap-2 pl-6 md:grid-cols-2">
                {[0, 1, 2, 3].map((k) => (
                  <label key={k} className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${q.correct === k ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200'}`}>
                    <input type="radio" name={`correct-${i}`} checked={q.correct === k} onChange={() => setQ(i, { correct: k })} title="Correct answer" />
                    <span className="text-sm font-bold text-slate-500">{'ABCD'[k]}</span>
                    <input className="w-full bg-transparent text-sm focus:outline-none" placeholder={`Answer ${'ABCD'[k]}`} value={q.options[k] || ''} onChange={(e) => setQ(i, { options: q.options.map((o: string, n: number) => (n === k ? e.target.value : o)) })} />
                  </label>
                ))}
              </div>
              <input className={`${input} mt-2 ml-6 w-[calc(100%-1.5rem)]`} placeholder="Explanation shown if they get it wrong" value={q.explain} onChange={(e) => setQ(i, { explain: e.target.value })} />
            </div>
          ))}
        </div>
        <div className="mt-5"><SaveBar onSave={() => onSave(c)} /></div>
      </Card>

      <div className="grid gap-6 2xl:grid-cols-2">
        <Card title="Where things happen">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-6">
              <Toggle on={c.applyEnabled} onChange={(v) => setC({ ...c, applyEnabled: v })} label="Applications open" />
              <Toggle on={c.askRecruiterCode} onChange={(v) => setC({ ...c, askRecruiterCode: v })} label="Ask for a recruiter code" />
              <Toggle on={c.dmOnReceived} onChange={(v) => setC({ ...c, dmOnReceived: v })} label="DM applicant when received" />
            </div>
            {(!c.reviewChannelId || !c.logChannelId) && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
                <p className="font-semibold">Missing a channel? Let the bot create it.</p>
                <p className="mt-0.5 text-xs">It reuses a channel that already exists, otherwise it creates the Applications, Recruitment log and Apply to join channels under the Community Manager category with the right permissions. Needs the bot to have <b>Manage Channels</b> and <b>Manage Roles</b>.</p>
                <button type="button" className="mt-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700" onClick={async () => { setMsg(''); try { const r: any = await api('/provision', 'POST', { kind: 'recruitment' }); setMsg(r.errors?.length ? r.errors[0] : `Done. ${r.made?.length ? 'Created: ' + r.made.join(', ') + '.' : 'Everything already exists.'} Reload to see the new channels.`); } catch (e: any) { setMsg(e.message); } }}>Create it for me</button>
              </div>
            )}
            <label className="block text-sm font-medium text-slate-700">Staff review channel<div className="mt-1"><Pick options={res.textChannels} value={c.reviewChannelId} onChange={(v) => setC({ ...c, reviewChannelId: v })} placeholder="Choose a staff-only channel" /></div></label>
            <div className="text-sm font-medium text-slate-700">Ping these roles for each new application<div className="mt-1"><MultiPick options={res.roles} value={c.pingRoleIds} onChange={(v) => setC({ ...c, pingRoleIds: v })} placeholder="Add a role" prefix="@" /></div></div>
            <div className="text-sm font-medium text-slate-700">Roles allowed to Approve / Reject in Discord<div className="mt-1"><MultiPick options={res.roles} value={c.reviewerRoleIds} onChange={(v) => setC({ ...c, reviewerRoleIds: v })} placeholder="Add a role" prefix="@" /></div><p className="mt-1 text-xs font-normal text-slate-500">Members with Manage Server can always decide.</p></div>
            <label className="block text-sm font-medium text-slate-700">Recruitment log channel (every application, score, decision and recruiter credit)<div className="mt-1"><Pick options={res.textChannels} value={c.logChannelId} onChange={(v) => setC({ ...c, logChannelId: v })} placeholder="Choose a staff channel" /></div></label>
            <Toggle on={c.notifyRecruiter !== false} onChange={(v) => setC({ ...c, notifyRecruiter: v })} label="DM the recruiter when their code is used and when it is decided" />
            <label className="block text-sm font-medium text-slate-700">Approval announcement channel (optional)<div className="mt-1"><Pick options={res.textChannels} value={c.announceChannelId} onChange={(v) => setC({ ...c, announceChannelId: v })} placeholder="Don’t announce" /></div>
              <p className="mt-1 text-xs font-normal text-slate-500">Where the bot welcomes someone once their application is approved. The welcome for every new member who joins is separate: set it in Members → Welcome &amp; rules.</p></label>
          </div>
        </Card>

        <Card title="Your messages" desc="Click a variable to insert it. The preview shows exactly what applicants receive.">
          <div className="space-y-4">
            {[['received', 'Application received (DM)'], ['approved', 'Approved (DM)'], ['rejected', 'Rejected (DM)'], ['announce', 'Approval announcement (public)']].map(([k, l]) => (
              <TemplateField key={k} label={l} value={c.messages[k]} onChange={(v) => setM(k, v)} vars={RECRUIT_VARS.filter((v) => k === 'rejected' || v.token !== 'reason')} />
            ))}
          </div>
        </Card>
      </div>

      <SheetsCard api={api} res={res} />

      <AppQuestions api={api} />
      <div className="grid gap-6 2xl:grid-cols-2">
        <Card title="Apply panel" desc="Post it in a public channel like #apply or #join-us.">
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">Title<input className={`${input} mt-1`} value={c.messages.panelTitle} onChange={(e) => setM('panelTitle', e.target.value)} /></label>
            <div className="block text-sm font-medium text-slate-700">Text<div className="mt-1"><MessageComposer communityId={communityId} value={c.messages.panelText} onChange={(v: string) => setM('panelText', v)} rows={12} maxLength={2000} /></div><p className="mt-1 text-xs font-normal text-slate-500">Use the buttons to add @members, @roles, #channels and emojis. {"{server}"} becomes your server name. Saving updates the panel already posted.</p></div>
            <div className="rounded-xl border-l-4 border-indigo-500 bg-slate-50 p-4">
              <div className="font-bold text-slate-900">{c.messages.panelTitle}</div>
              <div className="mt-1 whitespace-pre-line text-sm text-slate-600">{c.messages.panelText.replace(/\*\*/g, "").replace(/\{server\}/g, "your server")}</div>
              <span className="mt-3 inline-block rounded bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">📋 Apply</span>
            </div>
          </div>
        </Card>
        <Card title="Save and publish">
          <SaveBar onSave={() => onSave(c)} />
          <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-5">
            <div className="min-w-[240px] flex-1"><Pick options={res.textChannels} value={panelCh} onChange={setPanelCh} placeholder="Channel for the Apply panel" />{cfg?.panelChannelId && cfg.panelChannelId === panelCh && <p className="mt-1 text-xs text-emerald-700">✓ The panel is already posted here. Pressing the button updates it.</p>}</div>
            <button className={btn} disabled={!panelCh} onClick={async () => {
              setMsg('');
              try { await onSave(c); const r = await api('/recruitment/panel', 'POST', { channelId: panelCh }); setMsg(r?.updated ? 'Saved. The Apply panel already in that channel was updated.' : 'Saved and Apply panel posted.'); } catch (e: any) { setMsg(e.message); }
            }}><Send className="h-4 w-4" /> Save & post panel</button>
          </div>
          {msg && <p className="mt-3 text-sm text-slate-600">{msg}</p>}
          <p className="mt-4 text-xs text-slate-500">Questions come from Recruitment → Questions. Role rules (Server tools → Role rules) decide which roles approved applicants get.</p>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Secure Setup                                                        */
/* ------------------------------------------------------------------ */
function SecureSetupCard({ api, res }: { api: any; res: Resources }) {
  const [s, setS] = useState<any>(null);
  const [memberRoleId, setMemberRoleId] = useState('');
  const [publicIds, setPublicIds] = useState<string[]>([]);
  const [applyOff, setApplyOff] = useState(false);
  const [typed, setTyped] = useState('');
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    try {
      const d = await api('/gate');
      setS(d);
      if (d.gate?.memberRoleId) setMemberRoleId((v) => v || d.gate.memberRoleId);
      if (d.gate?.publicChannelIds?.length) setPublicIds((v) => (v.length ? v : d.gate.publicChannelIds));
    } catch (e: any) { setMsg(e.message); }
  }, [api]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (s?.gate?.job?.status !== 'RUNNING') return; const t = setInterval(load, 3000); return () => clearInterval(t); }, [s?.gate?.job?.status, load]);
  if (!s) return <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />;
  const g = s.gate || {};
  const job = g.job;
  const verified = g.verified;
  const run = async (fn: () => Promise<any>, ok: string) => { setMsg(''); try { await fn(); if (ok) setMsg(ok); await load(); } catch (e: any) { setMsg(e.message); } };

  return (
    <section className={`rounded-2xl border-2 p-6 shadow-sm ${verified ? 'border-emerald-300 bg-emerald-50/40' : 'border-amber-300 bg-amber-50/40'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{verified ? '🔒 Secure Setup complete' : '🔓 Secure Setup required before recruitment'}</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            {verified
              ? `Newcomers only see your public channels until they are approved. Checked ${g.lastCheck ? new Date(g.lastCheck.at).toLocaleString() : 'recently'}. The lock is plain Discord permissions, so it stays closed even if the bot is offline.`
              : 'Discord does not let bots control its own “Apply to Join”, so Community Manager locks your server instead: newcomers see only the channels you choose until they are approved. Recruitment, the Apply panel and application chats stay off until this is done.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className={ghost} onClick={() => run(async () => { const r = await api('/workspace', 'POST'); setMsg(`Workspace ready: ${r.used.map((u: any) => `${u.purpose} → #${u.channel}${u.created ? ' (new)' : ''}`).join(' · ')}. Staff roles: ${r.staffRoles.join(', ') || 'none found'}.`); }, '')}>⚙️ Auto-configure workspace</button>
          <button className={ghost} onClick={load}><RefreshCw className="h-4 w-4" /> Re-check</button>
        </div>
      </div>

      {!!s.problems?.length && <div className="mt-4"><Banner tone="error">{s.problems.map((p: string) => <div key={p}>{p.replace(/\*\*/g, '')}</div>)}</Banner></div>}

      {verified && <GateRoles api={api} res={res} g={g} onSaved={(t: string) => { setMsg(t); load(); }} />}

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-bold text-slate-900">1 · What a new joiner can see now</div>
          <p className="mt-1 text-xs text-slate-500">{s.visible?.length || 0} channel(s) visible to someone who just joined.</p>
          <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-sm">
            {(s.visible || []).map((c: any) => (
              <li key={c.id} className={`flex items-center justify-between rounded px-2 py-1 ${g.publicChannelIds?.includes(c.id) ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                <span>#{c.name}</span><span className="text-xs">{g.publicChannelIds?.includes(c.id) ? 'public' : 'exposed'}</span>
              </li>
            ))}
            {!s.visible?.length && <li className="text-slate-500">Nothing is visible to newcomers.</li>}
          </ul>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-bold text-slate-900">2 · Lock the server</div>
          <div className="mt-3 space-y-3 text-sm">
            <label className="block font-medium text-slate-700">Member role (approved members)
              <select className={`${input} mt-1`} value={memberRoleId} onChange={(e) => setMemberRoleId(e.target.value)}>
                <option value="">Create a new “Member” role</option>
                {res.roles.map((r) => <option key={r.id} value={r.id}>@{r.name}</option>)}
              </select>
            </label>
            <div className="font-medium text-slate-700">Public channels (welcome, rules, apply)<div className="mt-1"><MultiPick options={res.textChannels} value={publicIds} onChange={setPublicIds} placeholder="Add a public channel" prefix="#" /></div></div>
            <p className="text-xs text-slate-500">All {s.memberCount ?? ''} current members get the Member role first, so nobody loses access. Your current permissions are saved and can be restored with Undo.</p>
            <div className="flex flex-wrap gap-2">
              <button className={btn} disabled={job?.status === 'RUNNING' || !publicIds.length} onClick={() => run(() => api('/gate/lock', 'POST', { memberRoleId: memberRoleId || undefined, createMemberRole: !memberRoleId, publicChannelIds: publicIds }), 'Locking started…')}>🔒 Lock the server</button>
              {g.hasSnapshot && <button className={ghost} disabled={job?.status === 'RUNNING'} onClick={() => window.confirm('Restore every channel permission to how it was before Secure Setup? Recruitment will be switched off.') && run(() => api('/gate/undo', 'POST'), 'Permissions restored.')}>↩ Undo</button>}
            </div>
            {job && (
              <div className="rounded-lg bg-slate-50 p-3 text-xs">
                <div className="flex justify-between font-semibold"><span>{job.step}</span><span>{job.status}</span></div>
                {job.total > 0 && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-indigo-600" style={{ width: `${Math.round((job.done / job.total) * 100)}%` }} /></div>}
                {job.error && <div className="mt-1 text-rose-600">{job.error}</div>}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-sm font-bold text-slate-900">3 · Confirm</div>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>In Discord: <b>Server Settings → Access</b>.</li>
            <li>Set the server so people can <b>join without applying</b> (turn off “Apply to Join”).</li>
            <li>Save, then confirm here.</li>
          </ol>
          <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={applyOff} onChange={(e) => setApplyOff(e.target.checked)} className="mt-1" /> I have turned off Discord’s Apply to Join</label>
          <input className={`${input} mt-3`} placeholder="Type LOCKED to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <button className={`${btn} mt-3`} disabled={!applyOff || typed.trim().toUpperCase() !== 'LOCKED' || job?.status === 'RUNNING'} onClick={() => run(() => api('/gate/confirm', 'POST', { nativeApplyOff: applyOff, confirmText: typed }), 'Secure Setup complete. Recruitment can start.')}>✅ Confirm and enable recruitment</button>
        </div>
      </div>
      {msg && <p className="mt-4 text-sm font-medium text-slate-700">{msg}</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Google Sheets                                                       */
/* ------------------------------------------------------------------ */
function SheetsCard({ api, res }: { api: any; res: Resources }) {
  const [d, setD] = useState<any>(null);
  const [viewUrl, setViewUrl] = useState('');
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/sheets').then((x: any) => { setD(x); setUrl(x.url || ''); setViewUrl(x.viewUrl || ''); setRoleIds(x.roleIds || []); }).catch((e: any) => setMsg(e.message)); }, [api]);
  const steps = [
    'Create a Google Sheet (sheets.new).',
    'Open Extensions → Apps Script, delete what is there, paste the script below and save.',
    'Click Deploy → New deployment → type “Web app”. Execute as: Me. Who has access: Anyone. Deploy and allow access.',
    'Copy the Web app URL and paste it here.',
  ];
  return (
    <Card title="📊 Google Sheets (live record)" desc="One row per applicant: every question as a column, plus status, screening score, recruiter code, interview summary and Discord link. Updated on every change."
      right={d?.lastSync && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${d.lastSync.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{d.lastSync.ok ? 'Synced' : 'Sync failed'} · {new Date(d.lastSync.at).toLocaleString()}</span>}>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">{steps.map((x) => <li key={x}>{x}</li>)}</ol>
      {d?.script && (
        <div className="mt-4">
          <div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">Script (contains your private token, keep it to yourself)</span>
            <button className="text-xs font-semibold text-indigo-600 hover:underline" onClick={() => { navigator.clipboard?.writeText(d.script); setMsg('Script copied.'); }}>Copy script</button></div>
          <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">{d.script}</pre>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <input className={`${input} min-w-[280px] flex-1`} placeholder="https://script.google.com/macros/s/…/exec" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className={btn} disabled={busy} onClick={async () => { setBusy(true); setMsg(''); try { const r = await api('/sheets/connect', 'POST', { url }); setMsg(r.connected ? `Connected. ${r.rows} application(s) written to your sheet.` : 'Disconnected.'); } catch (e: any) { setMsg(e.message); } setBusy(false); }}>Connect & sync</button>
        {d?.url && <button className={ghost} disabled={busy} onClick={async () => { setBusy(true); setMsg(''); try { const r = await api('/sheets/resync', 'POST'); setMsg(`Synced ${r.rows} application(s).`); } catch (e: any) { setMsg(e.message); } setBusy(false); }}><RefreshCw className="h-4 w-4" /> Sync now</button>}
      </div>
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="font-bold text-slate-900">🔒 Who can see the sheet</div>
        <p className="mt-1 text-sm text-slate-600">The bot never posts the sheet in your server. Members and applicants can’t see it. In Google, keep the sheet’s Share setting on <b>Restricted</b> and add only your staff’s Google emails. Pick the roles below to let them get the link privately with <code>/sheet</code> in Discord.</p>
        <input className={`${input} mt-3`} placeholder="https://docs.google.com/spreadsheets/d/…" value={viewUrl} onChange={(e) => setViewUrl(e.target.value)} />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {roleIds.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">@{res.roles.find((r) => r.id === id)?.name || id}<button type="button" aria-label="Remove role" onClick={() => setRoleIds(roleIds.filter((x) => x !== id))}>×</button></span>)}
        </div>
        <div className="mt-2"><Pick options={res.roles.filter((r) => !roleIds.includes(r.id))} value="" onChange={(v) => v && setRoleIds([...roleIds, v])} placeholder="Add a role that can use /sheet" /></div>
        <button className={`${btn} mt-3`} onClick={async () => { try { await api('/sheets/access', 'POST', { viewUrl, roleIds }); setMsg('Sheet access saved.'); } catch (e: any) { setMsg(e.message); } }}>Save access</button>
      </div>
      {msg && <p className="mt-3 text-sm text-slate-600">{msg}</p>}
    </Card>
  );
}

/** The server's rules: shown with the consent message and used to draft the rules quiz. */
const RULE_SUGGESTIONS = [
  'Be respectful to everyone',
  'No hate speech, racism or harassment',
  'No spam, flooding or unsolicited DMs',
  'No advertising or self-promotion without staff permission',
  'Keep content safe for work',
  'Use the right channel for each topic',
  'Do not share personal information',
  'No cheating, hacking or exploit talk',
  'Follow staff and moderator instructions',
  'Follow Discord’s Terms of Service and Community Guidelines',
];

export function RulesCard({ api, res }: { api: any; res: Resources }) {
  const [rules, setRules] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const load = useCallback(() => api('/recruitment/rules').then(setRules).catch((e: any) => setMsg(e.message)), [api]);
  useEffect(() => { load(); }, [load]);
  const [src, setSrc] = useState<any>(null);
  const [srcMsg, setSrcMsg] = useState('');
  useEffect(() => { api('/recruitment/rules/source').then(setSrc).catch(() => undefined); }, [api]);
  // Picking a rules channel saves it and copies its rules into the list straight away (no separate import step).
  const saveSrc = (patch: any) => {
    const next = { ...src, ...patch }; setSrc(next); setSrcMsg('Saving…');
    api('/recruitment/rules/source', 'PUT', { source: next.source, channelIds: next.channelIds })
      .then(async (r: any) => {
        setSrc(r);
        const ids: string[] = (r.channelIds?.length ? r.channelIds : r.welcomeChannelIds) || [];
        if (r.source === 'CHANNELS' && ids.length && patch.channelIds) {
          setSrcMsg('Saved. Fetching the rules…');
          const imp = await api('/recruitment/rules/import', 'POST', { channelIds: ids });
          setSrcMsg(`✓ Saved · ${imp.added ? `${imp.added} rule${imp.added === 1 ? '' : 's'} fetched from #${imp.channel}` : 'rules are up to date'}`); load();
        } else setSrcMsg('✓ Saved');
      }).catch((e: any) => setSrcMsg(e.message));
  };
  const chName = (id: string) => res.textChannels.find((c: any) => c.id === id)?.name || 'channel';
  const add = async () => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    try { for (const l of lines) await api('/recruitment/rules', 'POST', { title: l }); setText(''); setMsg(''); load(); } catch (e: any) { setMsg(e.message); }
  };
  return (
    <div id="server-rules">
      <Card title="Server rules" desc="What applicants read before they agree, and what the rules quiz is written from.">
        {src && (
          <div className="mb-5 rounded-xl border border-slate-200 p-4">
            <div className="text-sm font-semibold text-slate-700">What applicants are shown</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => saveSrc({ source: 'CHANNELS' })} className={`rounded-xl border px-3 py-2 text-left text-sm ${src.source === 'CHANNELS' ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200'}`}><b>Automatic: from my rules channels</b><br /><span className="text-xs text-slate-500">The bot copies the messages from the channels with their formatting, so applicants read exactly what members read.</span></button>
              <button type="button" onClick={() => saveSrc({ source: 'LIST' })} className={`rounded-xl border px-3 py-2 text-left text-sm ${src.source === 'LIST' ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200' : 'border-slate-200'}`}><b>Manual: the list below</b><br /><span className="text-xs text-slate-500">You type or import each rule yourself.</span></button>
            </div>
            {src.source === 'CHANNELS' && (
              <div className="mt-3">
                <div className="flex flex-wrap gap-1.5">
                  {(src.channelIds.length ? src.channelIds : src.welcomeChannelIds).map((id: string) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">#{chName(id)}{src.channelIds.length > 0 && <button type="button" aria-label="Remove" onClick={() => saveSrc({ channelIds: src.channelIds.filter((x: string) => x !== id) })}>×</button>}</span>)}
                  {!src.channelIds.length && !src.welcomeChannelIds.length && <span className="text-xs text-amber-700">No rules channel picked yet. Add one below.</span>}
                </div>
                {!src.channelIds.length && src.welcomeChannelIds.length > 0 && <p className="mt-1 text-xs text-slate-500">Using the rules channels from Members → Welcome &amp; rules, so there is one place to manage them. Add channels here only if applicants should read different ones.</p>}
                <div className="mt-2 max-w-sm"><Pick options={res.textChannels.filter((c: any) => !src.channelIds.includes(c.id))} value="" onChange={(id: string) => id && saveSrc({ channelIds: [...src.channelIds, id] })} placeholder="Add a rules channel" /></div>
              </div>
            )}
            {srcMsg && <p className="mt-2 text-xs text-indigo-700">{srcMsg}</p>}
          </div>
        )}
        <div className="mb-2 text-sm font-semibold text-slate-700">Rules list ({rules.length}) <span className="font-normal text-slate-500">· {src?.source === 'CHANNELS' ? 'used for the rules quiz' : 'shown to applicants and used for the rules quiz'}</span></div>
        {!!rules.length && <ol className="mb-4 space-y-2">
          {rules.map((r, i) => (
            <li key={r.id} className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <span className="font-bold text-slate-400">{i + 1}.</span>
              <span className="flex-1 text-slate-800">{r.title}{r.description && r.description !== r.title ? <span className="block text-slate-500">{r.description}</span> : null}</span>
              <button type="button" aria-label="Remove rule" className="text-slate-400 hover:text-rose-600" onClick={() => api(`/recruitment/rules/${r.id}`, 'DELETE').then(load).catch((e: any) => setMsg(e.message))}><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ol>}
        {RULE_SUGGESTIONS.some((t) => !rules.some((r) => r.title.toLowerCase() === t.toLowerCase())) && (
          <div className="mb-4">
            <div className="text-sm font-semibold text-slate-700">Suggestions <span className="font-normal text-slate-500">· click to add</span></div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {RULE_SUGGESTIONS.filter((t) => !rules.some((r) => r.title.toLowerCase() === t.toLowerCase())).map((t) => (
                <button key={t} type="button" onClick={() => api('/recruitment/rules', 'POST', { title: t }).then(load).catch((e: any) => setMsg(e.message))}
                  className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:border-indigo-400 hover:text-indigo-700">+ {t}</button>
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="text-sm font-semibold text-slate-700">Add your own rules</div>
          <p className="mt-1 text-xs text-slate-500">One rule per line. These sit alongside any rules fetched from your channels.</p>
          <textarea rows={3} className={`${input} mt-2`} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Be respectful to everyone\nNo advertising without permission'} />
          <button type="button" className={`${ghost} mt-2`} disabled={!text.trim()} onClick={add}><Plus className="h-4 w-4" /> Add rules</button>
        </div>
        {msg && <p className="mt-3 text-sm text-slate-600">{msg}</p>}
      </Card>
    </div>
  );
}

/** The questions the bot asks in an automatic interview (also a guide for manual interviewers). */
function InterviewQuestions({ communityId, auto }: { communityId: string; auto: boolean }) {
  const [list, setList] = useState<any[] | null>(null);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const h = { 'Content-Type': 'application/json', 'x-community-id': communityId };
  const load = useCallback(() => fetch(`/api/v1/community/questions?communityId=${encodeURIComponent(communityId)}`, { credentials: 'include', headers: h })
    .then((r) => r.json()).then((j) => setList((j?.data?.interviewQuestions || j?.interviewQuestions || []).filter((q: any) => q.enabled !== false))).catch(() => setList([])), [communityId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    setMsg('Saving…');
    for (const l of lines) {
      const r = await fetch('/api/v1/community/interview-questions', { method: 'POST', credentials: 'include', headers: h, body: JSON.stringify({ communityId, questionText: l.slice(0, 300), category: 'GENERAL' }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setMsg(j?.error?.message || j?.message || 'Could not save the question.'); return; }
    }
    setText(''); setMsg('✓ Saved'); load();
  };
  const del = async (id: string) => {
    await fetch(`/api/v1/community/interview-questions/${id}?communityId=${encodeURIComponent(communityId)}`, { method: 'DELETE', credentials: 'include', headers: h });
    load();
  };
  return (
    <div className={`mt-4 rounded-lg border p-3 ${auto ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200'}`}>
      <div className="text-sm font-bold text-slate-900">Interview questions ({list?.length ?? '…'})</div>
      <p className="text-xs text-slate-500">{auto ? 'The bot asks these one by one in the applicant’s chat and waits for each answer. Answers and a summary go to the staff thread.' : 'Shown to interviewers as a guide. If you switch to automatic, the bot asks these.'}</p>
      {auto && list && !list.length && <p className="mt-2 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">Add at least one question, or the automatic interview waits for a staff member.</p>}
      {!!list?.length && <ol className="mt-2 space-y-1.5">{list.map((q, i) => (
        <li key={q.id} className="flex items-start gap-2 rounded-md bg-white px-2 py-1.5 text-sm ring-1 ring-slate-200"><span className="font-bold text-slate-400">{i + 1}.</span><span className="flex-1">{q.questionText}</span><button type="button" aria-label="Delete" className="text-slate-400 hover:text-rose-600" onClick={() => del(q.id)}><Trash2 className="h-4 w-4" /></button></li>
      ))}</ol>}
      <textarea rows={2} className={`${input} mt-2`} value={text} onChange={(e) => setText(e.target.value)} placeholder={'One question per line, e.g.\nWhy do you want to join us?\nHow many hours do you play each week?'} />
      <div className="mt-2 flex items-center gap-3"><button type="button" className={ghost} disabled={!text.trim()} onClick={add}><Plus className="h-4 w-4" /> Add questions</button>{msg && <span className="text-xs text-indigo-700">{msg}</span>}</div>
    </div>
  );
}

/** The Apply form: questions, order, and which answers are used for the recruiter code name / source. */
const QTYPE_LABEL: Record<string, string> = { SHORT_TEXT: 'Short answer', LONG_TEXT: 'Long answer', YES_NO: 'Yes / No', SINGLE_SELECT: 'Pick one (options)', NUMBER: 'Number' };
function AppQuestions({ api }: { api: any }) {
  const [d, setD] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [edit, setEdit] = useState<any>(null);
  const run = (p: Promise<any>, ok: string) => { setMsg('Saving…'); p.then((r: any) => { setD(r); setMsg(ok); setEdit(null); }).catch((e: any) => setMsg(e.message)); };
  useEffect(() => { api('/recruitment/questions').then(setD).catch((e: any) => setMsg(e.message)); }, [api]);
  if (!d) return <Card title="Application questions"><div className="h-20 animate-pulse rounded-xl bg-slate-100" /></Card>;
  const qs: any[] = d.questions;
  const move = (i: number, by: number) => { const ids = qs.map((q) => q.id); const [x] = ids.splice(i, 1); ids.splice(i + by, 0, x); run(api('/recruitment/questions', 'PUT', { order: ids }), '✓ Order saved'); };
  const srcQ = d.sourceQuestionId === 'NONE' ? '' : d.sourceQuestionId || d.autoSourceQuestionId || '';
  return (
    <Card title={`Application questions (${qs.length})`} desc="What people answer when they press Apply, in Discord and on the apply website. Up to 5 show per page in Discord."
      right={<button className={btn} onClick={() => setEdit({ questionText: '', guidance: '', type: 'SHORT_TEXT', options: '', required: true, enabled: true })}><Plus className="h-4 w-4" /> Add question</button>}>
      <ol className="space-y-2">
        {qs.map((q, i) => (
          <li key={q.id} className={`rounded-xl border p-3 ${q.enabled === false ? 'border-slate-200 opacity-60' : 'border-slate-200'}`}>
            <div className="flex items-start gap-3">
              <span className="font-bold text-slate-400">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900">{q.questionText}{q.required && <span className="text-rose-500"> *</span>}</div>
                <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{QTYPE_LABEL[q.type] || q.type}</span>
                  {q.enabled === false && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">hidden</span>}
                  {d.codeNameQuestionId === q.id && <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">🎟️ used for recruiter code name</span>}
                  {d.sourcesOn && srcQ === q.id && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">🧭 answered by “How did you find us?” · not asked again</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1 text-xs">
                <button className="rounded px-1.5 py-1 hover:bg-slate-100 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Up">↑</button>
                <button className="rounded px-1.5 py-1 hover:bg-slate-100 disabled:opacity-30" disabled={i === qs.length - 1} onClick={() => move(i, 1)} aria-label="Down">↓</button>
                <button className="rounded px-2 py-1 font-semibold text-indigo-600 hover:bg-indigo-50" onClick={() => setEdit({ ...q, options: (q.options || []).join(', ') })}>Edit</button>
                <button className="rounded p-1 text-slate-400 hover:text-rose-600" aria-label="Delete" onClick={() => window.confirm('Delete this question?') && run(api(`/recruitment/questions/${q.id}`, 'DELETE'), '✓ Deleted')}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </li>
        ))}
        {!qs.length && <li className="text-sm text-slate-500">No questions yet. Add at least one so people can apply.</li>}
      </ol>
      {edit && (
        <div className="mt-4 space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
          <label className="block text-sm font-medium text-slate-700">Question<input className={`${input} mt-1`} maxLength={300} value={edit.questionText} onChange={(e) => setEdit({ ...edit, questionText: e.target.value })} placeholder="e.g. What is your in-game name?" /></label>
          <label className="block text-sm font-medium text-slate-700">Hint shown in the box <span className="font-normal text-slate-500">(optional)</span><input className={`${input} mt-1`} maxLength={300} value={edit.guidance || ''} onChange={(e) => setEdit({ ...edit, guidance: e.target.value })} placeholder="e.g. The name other players see" /></label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm font-medium text-slate-700">Answer type<select className={`${input} mt-1`} value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}>{Object.entries(QTYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            {(edit.type === 'SINGLE_SELECT') && <label className="block text-sm font-medium text-slate-700">Options <span className="font-normal text-slate-500">(comma separated)</span><input className={`${input} mt-1`} value={edit.options} onChange={(e) => setEdit({ ...edit, options: e.target.value })} placeholder="GTA V, Minecraft, Both" /></label>}
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={edit.required !== false} onChange={(e) => setEdit({ ...edit, required: e.target.checked })} />Must answer</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={edit.enabled !== false} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} />Show it</label>
          </div>
          <div className="flex gap-2">
            <button className={btn} onClick={() => run(edit.id ? api(`/recruitment/questions/${edit.id}`, 'PUT', edit) : api('/recruitment/questions', 'POST', edit), '✓ Saved')}><Save className="h-4 w-4" /> Save question</button>
            <button className={ghost} onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </div>
      )}
      <div className="mt-5 grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">Name for their recruiter code comes from
          <select className={`${input} mt-1`} value={d.codeNameQuestionId || ''} onChange={(e) => run(api('/recruitment/questions', 'PUT', { codeNameQuestionId: e.target.value }), '✓ Saved')}>
            <option value="">Their Discord name</option>
            {qs.map((q) => <option key={q.id} value={q.id}>Answer to: {q.questionText}</option>)}
          </select>
          <span className="mt-1 block text-xs font-normal text-slate-500">e.g. pick “What is your in-game name?” so codes look like their game name, not their Discord name.</span>
        </label>
        <label className="block text-sm font-medium text-slate-700">“How did you find us?” answers this question
          <select className={`${input} mt-1`} value={d.sourceQuestionId || ''} onChange={(e) => run(api('/recruitment/questions', 'PUT', { sourceQuestionId: e.target.value }), '✓ Saved')}>
            <option value="">Find it automatically{d.autoSourceQuestionId ? ` (now: ${qs.find((q) => q.id === d.autoSourceQuestionId)?.questionText || ''})` : ''}</option>
            <option value="NONE">None, always ask every question</option>
            {qs.map((q) => <option key={q.id} value={q.id}>{q.questionText}</option>)}
          </select>
          <span className="mt-1 block text-xs font-normal text-slate-500">When “How did you find us?” is on (Recruitment → Settings), this question is skipped in the form and filled with their choice, so nobody answers it twice.</span>
        </label>
      </div>
      {msg && <p className="mt-3 text-xs text-indigo-700">{msg}</p>}
    </Card>
  );
}
