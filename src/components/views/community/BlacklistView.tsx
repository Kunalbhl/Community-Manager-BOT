import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Ban, CheckCircle2, Gamepad2, Hash, Loader2, Pencil, Plus, RotateCcw, Search, Settings2, ShieldBan, Trash2, User, X, XCircle } from 'lucide-react';
import { ChannelSelect, RoleSelect, useDiscordResources } from '../../common/DiscordPickers.js';
import { Card, useApi } from './ServerToolsView.js';

const input = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200';
const btn = 'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition disabled:opacity-50';
const primary = `${btn} bg-rose-600 text-white hover:bg-rose-700`;
const ghost = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;

/** Same normalising as the bot, so the dashboard search finds what the bot would match. */
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };
const norm = (s: unknown) => String(s ?? '').normalize('NFKD').toLowerCase().replace(/[013457@$!]/g, (c) => LEET[c] || c).replace(/[^a-z0-9]/g, '');
const label = (e: any) => e.displayName || e.discordUsername || e.gameNames?.[0] || e.aliases?.[0] || e.discordUserId || 'Unknown';

type How = 'ID' | 'NAME' | 'GAME';
const DURATIONS = [{ v: 0, l: 'Permanent' }, { v: 7, l: '7 days' }, { v: 30, l: '30 days' }, { v: 90, l: '90 days' }, { v: 365, l: '1 year' }];
const STATUS: Record<string, string> = { ACTIVE: 'bg-rose-50 text-rose-700 border-rose-200', REMOVED: 'bg-slate-100 text-slate-600 border-slate-200', EXPIRED: 'bg-amber-50 text-amber-700 border-amber-200' };

export function BlacklistView({ communityId }: { communityId: string }) {
  const api = useApi(communityId);
  const [data, setData] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [kind, setKind] = useState('ALL');
  const [cat, setCat] = useState('ALL');
  const [sort, setSort] = useState('new');
  const [showSettings, setShowSettings] = useState(false);
  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 6000); };
  const load = useCallback(() => api('/blacklist').then(setData).catch((e) => { setData({ entries: [], settings: {}, categories: [] }); flash(false, e.message); }), [api]);
  useEffect(() => { load(); }, [load]);

  const entries: any[] = data?.entries || [];
  const shown = useMemo(() => {
    const nq = norm(q); const raw = q.trim();
    return entries.filter((e) => (status === 'ALL' || e.status === status) && (kind === 'ALL' || e.kind === kind) && (cat === 'ALL' || e.category === cat))
      .filter((e) => {
        if (!raw) return true;
        if (/^\d{5,}$/.test(raw) && String(e.discordUserId || '').includes(raw)) return true;
        const hay = [e.discordUsername, e.displayName, e.globalName, ...(e.gameNames || []), ...(e.aliases || []), e.reason, e.notes, e.actor].map(norm);
        return nq.length > 0 && hay.some((h) => h.includes(nq));
      })
      .sort((a, b) => sort === 'hits' ? (b.hits || 0) - (a.hits || 0) : sort === 'name' ? label(a).localeCompare(label(b)) : String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [entries, q, status, kind, cat, sort]);

  const stats = useMemo(() => {
    const act = entries.filter((e) => e.status === 'ACTIVE');
    return { active: act.length, id: act.filter((e) => e.kind === 'ID').length, name: act.filter((e) => e.kind === 'DISCORD_NAME').length, game: act.filter((e) => e.kind === 'GAME_NAME').length, hits: entries.reduce((n, e) => n + (e.hits || 0), 0) };
  }, [entries]);

  const remove = async (e: any) => {
    const note = window.prompt(`Remove ${label(e)} from the blacklist? Add a short reason (optional).`);
    if (note === null) return;
    const unban = e.discordUserId ? window.confirm('Also unban this account in Discord (if banned)?') : false;
    try { const r = await api(`/blacklist/${e.id}`, 'PUT', { status: 'REMOVED', note, unban }); flash(true, r.warning || 'Removed from the blacklist.'); load(); } catch (err: any) { flash(false, err.message); }
  };
  const restore = async (e: any) => { try { await api(`/blacklist/${e.id}`, 'PUT', { status: 'ACTIVE' }); flash(true, 'Back on the blacklist.'); load(); } catch (err: any) { flash(false, err.message); } };

  if (!data) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[{ l: 'On the list', v: stats.active, i: ShieldBan, c: 'text-rose-600 bg-rose-50' }, { l: 'Known by Discord ID', v: stats.id, i: Hash, c: 'text-indigo-600 bg-indigo-50' }, { l: 'Discord name only', v: stats.name, i: User, c: 'text-sky-600 bg-sky-50' }, { l: 'Game name only', v: stats.game, i: Gamepad2, c: 'text-violet-600 bg-violet-50' }, { l: 'Times caught', v: stats.hits, i: AlertTriangle, c: 'text-amber-600 bg-amber-50' }].map((s) => (
          <div key={s.l} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4"><span className={`rounded-xl p-2 ${s.c}`}><s.i className="h-5 w-5" /></span><div><div className="text-2xl font-black text-slate-900">{s.v}</div><div className="text-xs font-semibold text-slate-500">{s.l}</div></div></div>
        ))}
      </div>

      <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-sm text-rose-900">
        <b>How the bot keeps them out:</b> anyone on the list can’t apply. If their <b>Discord account</b> joins, the bot {data.settings.onIdJoin === 'KICK' ? 'kicks' : data.settings.onIdJoin === 'ALERT' ? 'alerts staff about' : 'bans'} them at once. If only a <b>name or game name</b> matches (their Discord name, or a game name typed in the application), staff get an alert with <b>Ban / Kick / Not them</b>. Names are compared ignoring fancy fonts, spaces, symbols and look-alike digits. Staff can search from Discord with <code className="rounded bg-white px-1">/blacklist check</code>.
      </div>

      {msg && <p className={`flex items-center gap-2 text-sm font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{msg.text}</p>}

      <Card title="Blacklist" desc="Everyone the community has decided to keep out."
        right={<div className="flex gap-2"><button className={ghost} onClick={() => setShowSettings((v) => !v)}><Settings2 className="h-4 w-4" />Alerts & /blacklist</button><button className={primary} onClick={() => setEditing({})}><Plus className="h-4 w-4" />Add person</button></div>}>
        {showSettings && <SettingsBox communityId={communityId} settings={data.settings} api={api} onSaved={() => { flash(true, 'Saved.'); load(); }} />}
        <div className="mb-4 grid gap-2 md:grid-cols-[1fr_auto_auto_auto_auto]">
          <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input className={`${input} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Discord name, game name, ID, reason…" /></div>
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}><option value="ACTIVE">Active</option><option value="EXPIRED">Ended</option><option value="REMOVED">Removed</option><option value="ALL">All</option></select>
          <select className={input} value={kind} onChange={(e) => setKind(e.target.value)}><option value="ALL">Any type</option><option value="ID">Discord ID</option><option value="DISCORD_NAME">Discord name only</option><option value="GAME_NAME">Game name only</option></select>
          <select className={input} value={cat} onChange={(e) => setCat(e.target.value)}><option value="ALL">Any reason type</option>{(data.categories || []).map((c: string) => <option key={c}>{c}</option>)}</select>
          <select className={input} value={sort} onChange={(e) => setSort(e.target.value)}><option value="new">Newest</option><option value="hits">Most caught</option><option value="name">Name A–Z</option></select>
        </div>
        {!shown.length ? <p className="py-8 text-center text-sm text-slate-500">{entries.length ? 'Nobody matches these filters.' : 'Nobody on the blacklist yet.'}</p> : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">{shown.length} of {entries.length}</p>
            {shown.map((e) => (
              <div key={e.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50/60">
                {e.avatarUrl ? <img src={e.avatarUrl} alt="" className="h-10 w-10 rounded-full" /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">{e.kind === 'GAME_NAME' ? <Gamepad2 className="h-5 w-5" /> : <User className="h-5 w-5" />}</span>}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">{label(e)}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS[e.status] || ''}`}>{e.status === 'ACTIVE' ? 'Active' : e.status === 'EXPIRED' ? 'Ended' : 'Removed'}</span>
                    {e.category && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{e.category}</span>}
                    {e.hits > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">caught {e.hits}×</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    {e.discordUserId && <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 font-mono text-indigo-700">ID {e.discordUserId}</span>}
                    {e.discordUsername && <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-sky-700">@{e.discordUsername}</span>}
                    {(e.gameNames || []).map((g: string) => <span key={g} className="rounded-md bg-violet-50 px-1.5 py-0.5 text-violet-700">🎮 {g}</span>)}
                    {(e.aliases || []).map((g: string) => <span key={g} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-600">aka {g}</span>)}
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{e.reason}</p>
                  <p className="text-xs text-slate-400">Added by {e.actor || 'staff'} · {e.createdAt ? new Date(e.createdAt).toLocaleDateString() : ''}{e.expiresAt ? ` · until ${new Date(e.expiresAt).toLocaleDateString()}` : ' · permanent'}{e.lastMatchAt ? ` · last caught ${new Date(e.lastMatchAt).toLocaleDateString()}` : ''}</p>
                </div>
                <div className="flex gap-1.5">
                  <button className={ghost} onClick={() => setEditing(e)}><Pencil className="h-4 w-4" />Edit</button>
                  {e.status === 'ACTIVE' ? <button className={`${btn} text-rose-600 hover:bg-rose-50`} onClick={() => remove(e)}><Trash2 className="h-4 w-4" />Remove</button> : <button className={ghost} onClick={() => restore(e)}><RotateCcw className="h-4 w-4" />Restore</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      {editing && <EntryEditor communityId={communityId} api={api} entry={editing} categories={data.categories} onClose={() => setEditing(null)} onSaved={(w: string) => { setEditing(null); flash(!w, w || 'Saved to the blacklist.'); load(); }} />}
    </div>
  );
}

function SettingsBox({ communityId, settings, api, onSaved }: any) {
  const [s, setS] = useState<any>({ lookupChannelIds: [], lookupRoleIds: [], onIdJoin: 'BAN', alertChannelId: '', ...settings });
  const res: any = useDiscordResources(communityId);
  const chip = (txt: string, onX: () => void) => <span key={txt} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{txt}<button type="button" onClick={onX} aria-label="Remove"><X className="h-3 w-3" /></button></span>;
  return (
    <div className="mb-5 grid gap-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 md:grid-cols-2">
      <label className="text-sm font-semibold text-slate-700">Alert channel <span className="font-normal text-slate-500">· where match alerts go (staff only)</span><div className="mt-1"><ChannelSelect communityId={communityId} value={s.alertChannelId} onChange={(id) => setS({ ...s, alertChannelId: id })} placeholder="Recruitment log channel" /></div></label>
      <label className="text-sm font-semibold text-slate-700">When their Discord account joins<select className={`${input} mt-1`} value={s.onIdJoin} onChange={(e) => setS({ ...s, onIdJoin: e.target.value })}><option value="BAN">Ban them at once (recommended)</option><option value="KICK">Kick them</option><option value="ALERT">Only alert staff</option></select></label>
      <div className="text-sm font-semibold text-slate-700">Lookup channels <span className="font-normal text-slate-500">· /blacklist check posts its answer here for the team; elsewhere only the asker sees it</span>
        <div className="mt-1 flex flex-wrap gap-1.5">{s.lookupChannelIds.map((id: string) => chip(`#${res?.textChannels?.find((c: any) => c.id === id)?.name || 'channel'}`, () => setS({ ...s, lookupChannelIds: s.lookupChannelIds.filter((x: string) => x !== id) })))}</div>
        <div className="mt-1"><ChannelSelect communityId={communityId} value="" exclude={s.lookupChannelIds} onChange={(id) => id && setS({ ...s, lookupChannelIds: [...s.lookupChannelIds, id] })} placeholder="Add a channel" /></div></div>
      <div className="text-sm font-semibold text-slate-700">Who can search <span className="font-normal text-slate-500">· besides people with Ban Members or Manage Server</span>
        <div className="mt-1 flex flex-wrap gap-1.5">{s.lookupRoleIds.map((id: string) => chip(`@${res?.roles?.find((r: any) => r.id === id)?.name || 'role'}`, () => setS({ ...s, lookupRoleIds: s.lookupRoleIds.filter((x: string) => x !== id) })))}</div>
        <div className="mt-1"><RoleSelect communityId={communityId} value="" exclude={s.lookupRoleIds} onChange={(id) => id && setS({ ...s, lookupRoleIds: [...s.lookupRoleIds, id] })} placeholder="Add a role" /></div></div>
      <div className="md:col-span-2 flex justify-end"><button className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700`} onClick={() => api('/blacklist/settings', 'PUT', s).then(onSaved)}>Save settings</button></div>
    </div>
  );
}

function EntryEditor({ communityId, api, entry, categories, onClose, onSaved }: any) {
  const editing = !!entry.id;
  const [how, setHow] = useState<How>(entry.discordUserId ? 'ID' : entry.discordUsername ? 'NAME' : entry.id ? 'GAME' : 'ID');
  const [f, setF] = useState<any>({ discordUserId: '', discordUsername: '', displayName: '', globalName: '', avatarUrl: '', category: 'Other', reason: '', notes: '', ...entry, gameNames: (entry.gameNames || []).join(', '), aliases: (entry.aliases || []).join(', '), evidence: (entry.evidence || []).join('\n') });
  const [q, setQ] = useState(entry.discordUserId || '');
  const [found, setFound] = useState<any[]>([]);
  const [looking, setLooking] = useState(false);
  const [lookErr, setLookErr] = useState('');
  const [days, setDays] = useState<number | null>(editing ? null : 0);
  const [ban, setBan] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const pick = (u: any) => setF((x: any) => ({ ...x, discordUserId: u.id, discordUsername: u.username, displayName: u.displayName, globalName: u.globalName, avatarUrl: u.avatarUrl }));
  const lookup = useCallback(async (text: string) => {
    setLooking(true); setLookErr(''); setFound([]);
    try { const r = await api(`/blacklist/lookup?q=${encodeURIComponent(text)}`); setFound(r); if (/^\d{15,22}$/.test(text.trim()) && r[0]) pick(r[0]); if (!r.length) setLookErr('Nobody with that name is in the server or its ban list. You can still save the name.'); }
    catch (e: any) { setLookErr(e.message); } finally { setLooking(false); }
  }, [api]);
  useEffect(() => { if (how === 'ID' && /^\d{17,22}$/.test(q.trim()) && q.trim() !== f.discordUserId) lookup(q); }, [q, how]); // eslint-disable-line

  const save = async () => {
    setSaving(true); setErr('');
    const body: any = { ...f, gameNames: f.gameNames, aliases: f.aliases, evidence: f.evidence, banInDiscord: ban };
    if (how === 'GAME' && !editing) { body.discordUserId = ''; body.discordUsername = ''; body.displayName = ''; }
    if (how === 'NAME' && !f.discordUserId) body.discordUsername = f.discordUsername || q.trim();
    if (days !== null) body.expiresDays = days;
    try { const r = await (editing ? api(`/blacklist/${entry.id}`, 'PUT', body) : api('/blacklist', 'POST', body)); onSaved(r.warning || ''); } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  const Profile = ({ u, on }: { u: any; on?: () => void }) => (
    <button type="button" onClick={on} className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition ${f.discordUserId === u.id ? 'border-rose-400 bg-rose-50 ring-2 ring-rose-100' : 'border-slate-200 hover:bg-slate-50'}`}>
      {u.avatarUrl ? <img src={u.avatarUrl} alt="" className="h-9 w-9 rounded-full" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100"><User className="h-4 w-4 text-slate-500" /></span>}
      <div className="min-w-0 flex-1"><div className="font-bold text-slate-900">{u.displayName || u.username}{u.bot && <span className="ml-1 rounded bg-indigo-100 px-1 text-[10px] text-indigo-700">BOT</span>}</div><div className="text-xs text-slate-500">@{u.username} · {u.id}{u.createdAt ? ` · account from ${new Date(u.createdAt).toLocaleDateString()}` : ''}</div></div>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${u.where === 'In this server' ? 'bg-amber-50 text-amber-700' : u.where === 'Already banned here' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>{u.where}</span>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-6 w-full max-w-2xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4"><h3 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Ban className="h-5 w-5 text-rose-600" />{editing ? `Edit ${label(entry)}` : 'Add to blacklist'}</h3><button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
        <div className="space-y-5 px-6 py-5">
          <div>
            <div className="text-sm font-bold text-slate-900">What do you know about them?</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {([['ID', Hash, 'Discord user ID', 'Best: matches the exact account'], ['NAME', User, 'Discord name', 'Find them in the server or ban list'], ['GAME', Gamepad2, 'Game name only', 'No Discord details at all']] as const).map(([k, I, t, h]) => (
                <button key={k} type="button" onClick={() => { setHow(k); setFound([]); setLookErr(''); }} className={`rounded-xl border p-3 text-left transition ${how === k ? 'border-rose-400 bg-rose-50 ring-2 ring-rose-100' : 'border-slate-200 hover:bg-slate-50'}`}><div className="flex items-center gap-1.5 font-bold text-slate-900"><I className="h-4 w-4" />{t}</div><p className="text-xs text-slate-500">{h}</p></button>
              ))}
            </div>
          </div>

          {how === 'ID' && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Discord user ID <span className="font-normal text-slate-500">· right-click the user → Copy User ID (turn on Developer Mode)</span>
                <div className="mt-1 flex gap-2"><input className={`${input} font-mono`} value={q} inputMode="numeric" onChange={(e) => setQ(e.target.value.replace(/\D/g, ''))} placeholder="123456789012345678" /><button type="button" className={ghost} disabled={!q || looking} onClick={() => lookup(q)}>{looking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Look up'}</button></div></label>
              {found.map((u) => <Profile key={u.id} u={u} />)}
              {lookErr && <p className="text-sm text-rose-700">{lookErr}</p>}
            </div>
          )}
          {how === 'NAME' && (
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Discord name <span className="font-normal text-slate-500">· username or display name</span>
                <div className="mt-1 flex gap-2"><input className={input} value={q} onChange={(e) => { setQ(e.target.value); setF((x: any) => ({ ...x, discordUserId: '', discordUsername: e.target.value.replace(/^@/, '').trim(), displayName: '', avatarUrl: '' })); }} onKeyDown={(e) => e.key === 'Enter' && lookup(q)} placeholder="e.g. shadowx or ShadowX 🔥" /><button type="button" className={ghost} disabled={q.trim().length < 2 || looking} onClick={() => lookup(q)}>{looking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Find'}</button></div></label>
              {found.length > 0 && <p className="text-xs text-slate-500">Pick the right account to save their Discord ID too (strongest), or leave none picked to save just the name.</p>}
              {found.map((u) => <Profile key={u.id} u={u} on={() => (f.discordUserId === u.id ? setF((x: any) => ({ ...x, discordUserId: '', avatarUrl: '' })) : pick(u))} />)}
              {lookErr && <p className="text-sm text-slate-600">{lookErr}</p>}
            </div>
          )}

          <label className="block text-sm font-semibold text-slate-700">{how === 'GAME' ? 'In-game name(s)' : 'In-game name(s)'} <span className="font-normal text-slate-500">· comma separated. Checked against Discord names and application answers.</span>
            <input className={`${input} mt-1`} value={f.gameNames} onChange={(e) => setF({ ...f, gameNames: e.target.value })} placeholder="e.g. ShadowX, Shad0w_X" /></label>
          <label className="block text-sm font-semibold text-slate-700">Other names they use <span className="font-normal text-slate-500">· old names, alt accounts, clan tags</span>
            <input className={`${input} mt-1`} value={f.aliases} onChange={(e) => setF({ ...f, aliases: e.target.value })} placeholder="optional" /></label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700">Type<select className={`${input} mt-1`} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{categories.map((c: string) => <option key={c}>{c}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">How long<select className={`${input} mt-1`} value={days === null ? '' : days} onChange={(e) => setDays(e.target.value === '' ? null : Number(e.target.value))}>{editing && <option value="">Keep current ({entry.expiresAt ? `until ${new Date(entry.expiresAt).toLocaleDateString()}` : 'permanent'})</option>}{DURATIONS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}</select></label>
          </div>
          <label className="block text-sm font-semibold text-slate-700">Reason <span className="font-normal text-slate-500">· the team sees this in alerts and /blacklist check</span>
            <textarea rows={2} className={`${input} mt-1`} value={f.reason} maxLength={1000} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Scammed two members in trades, March 2026" /></label>
          <label className="block text-sm font-semibold text-slate-700">Private notes & proof links <span className="font-normal text-slate-500">· optional, one link per line</span>
            <div className="mt-1 grid gap-2 sm:grid-cols-2"><textarea rows={2} className={input} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Notes for staff" /><textarea rows={2} className={input} value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })} placeholder="https://… screenshot or message link" /></div></label>
          {f.discordUserId && <label className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-sm text-rose-900"><input type="checkbox" className="mt-0.5" checked={ban} onChange={(e) => setBan(e.target.checked)} /><span><b>Also ban this account in Discord now.</b> Discord then blocks them from joining at all, even with an invite link.</span></label>}
          {(entry.history || []).length > 0 && <details className="text-xs text-slate-500"><summary className="cursor-pointer font-semibold">History</summary><ul className="mt-1 space-y-0.5">{entry.history.map((h: any, i: number) => <li key={i}>{new Date(h.at).toLocaleString()} · {h.by} · {h.what}</li>)}</ul></details>}
          {err && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4"><button className={ghost} onClick={onClose}>Cancel</button><button className={primary} disabled={saving} onClick={save}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add to blacklist'}</button></div>
      </div>
    </div>
  );
}
