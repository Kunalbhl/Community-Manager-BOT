import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Copy, Download, Trash2, Users, Play, Square, ExternalLink, Trophy, Megaphone, RefreshCw } from 'lucide-react';
import { LinksButton } from '../../common/Linked.js';
import { ChannelSelect } from '../../common/DiscordPickers.js';

type Q = { id: string; label: string; type: string; required: boolean; options?: string[] };
const card = 'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm';
const input = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900';
const label = 'block text-xs font-bold uppercase tracking-wide text-slate-600';
const ghost = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const primary = 'inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50';
const TYPES = [['text', 'Short answer'], ['longtext', 'Long answer'], ['phone', 'Mobile number'], ['email', 'Email'], ['choice', 'Pick one']];
const blank = () => ({ title: '', description: '', questions: [{ id: 'q1', label: 'Full name', type: 'text', required: true }, { id: 'q2', label: 'Mobile number', type: 'phone', required: false }, { id: 'q3', label: 'Delivery address', type: 'longtext', required: false }] as Q[], opensAt: '', closesAt: '', requireGuildMember: false, allowDiscord: true, allowGoogle: true, sheetUrl: '' });
const toLocal = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };


function DrawPanel({ communityId, form, call, onBack }: { communityId: string; form: any; call: (p: string, m?: string, b?: any) => Promise<any>; onBack: () => void }) {
  const [rep, setRep] = useState<any | null>(null);
  const [name, setName] = useState('');
  const [count, setCount] = useState(1);
  const [repeat, setRepeat] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => call(`/giveaway-forms/${form.id}/report`).then((j) => setRep(j.report)).catch((e) => setMsg(e.message)), [call, form.id]);
  useEffect(() => { load(); }, [load]);
  const run = async (fn: () => Promise<any>, ok?: string) => { setBusy(true); setMsg(''); try { const r = await fn(); if (ok) setMsg(ok); if (r?.report) setRep(r.report); else await load(); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); } };
  const undrawn = (rep?.prizes || []).filter((p: any) => !p.drawnAt);
  const t = rep?.totals;
  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-lg font-bold text-slate-900">🏆 {form.title}: prizes and draw</h3><button className={ghost} onClick={onBack}>Back</button></div>
        {t && <p className="mt-2 text-sm text-slate-600">{t.entries} entries · {t.valid} valid · {t.disqualified} disqualified · {t.winners} winners · {t.discord} Discord / {t.google} Google</p>}
        {msg && <p className="mt-2 text-sm text-slate-700">{msg}</p>}
      </div>
      <div className={card}>
        <div className="text-sm font-bold text-slate-900">Add a prize</div>
        <p className="text-xs text-slate-500">Add as many prizes as you like and draw them together or one by one. Nobody wins twice, even across prizes, unless you tick “allow past winners”.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className="min-w-[12rem] flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" placeholder="Prize name" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="flex items-center gap-1 text-xs text-slate-600">Winners<input type="number" min={1} max={500} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" value={count} onChange={(e) => setCount(Number(e.target.value) || 1)} /></label>
          <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} />Allow past winners</label>
          <button className={primary} disabled={busy || !name.trim()} onClick={() => run(async () => { await call(`/giveaway-forms/${form.id}/prizes`, 'POST', { name, count, allowRepeat: repeat }); setName(''); setCount(1); }, 'Prize added.')}>Add</button>
        </div>
      </div>
      {undrawn.length > 0 && (
        <div className={card}>
          <div className="text-sm font-bold text-slate-900">Ready to draw</div>
          <ul className="mt-2 space-y-1">{undrawn.map((p: any) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={sel.includes(p.id)} onChange={(e) => setSel(e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id))} />
              <span className="flex-1">{p.name} · {p.count} winner{p.count > 1 ? 's' : ''}{p.allowRepeat ? ' · past winners allowed' : ''}</span>
              <button aria-label="Delete prize" className="text-slate-400 hover:text-rose-600" onClick={() => run(() => call(`/giveaway-forms/${form.id}/prizes/${p.id}`, 'DELETE'))}><Trash2 className="h-4 w-4" /></button>
            </li>))}</ul>
          <div className="mt-3 flex gap-2">
            <button className={primary} disabled={busy || !sel.length} onClick={() => window.confirm(`Draw ${sel.length} prize(s) now? This cannot be undone, but you can replace individual winners afterwards.`) && run(() => call(`/giveaway-forms/${form.id}/draw`, 'POST', { prizeIds: sel }).then((r) => { setSel([]); return r; }), 'Drawn.')}><Trophy className="h-4 w-4" />Draw selected</button>
            <button className={ghost} onClick={() => setSel(undrawn.map((p: any) => p.id))}>Select all</button>
          </div>
        </div>
      )}
      {(rep?.prizes || []).filter((p: any) => p.drawnAt).map((p: any) => (
        <div key={p.id} className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-bold text-slate-900">🎁 {p.name}</div><div className="text-xs text-slate-500">drawn {new Date(p.drawnAt).toLocaleString()}</div></div>
          <ul className="mt-2 divide-y divide-slate-100">{p.winnerEntries.map((e: any) => (
            <li key={e.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <span className="font-semibold text-slate-900">{e.name}</span><span className="text-xs text-slate-500">{e.provider}{e.email ? ` · ${e.email}` : ''}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{rep.form.questions.map((q: any) => (e.answers[q.id] ? `${q.label}: ${e.answers[q.id]}` : '')).filter(Boolean).join(' · ')}</span>
              <button className={ghost} disabled={busy} onClick={() => window.confirm(`Replace ${e.name}? A new person who has not won is picked. Also disqualify them?\n\nOK = replace and disqualify, Cancel = stop.`) && run(() => call(`/giveaway-forms/prizes/${p.id}/replace`, 'POST', { entryId: e.id, disqualify: true }), 'Replaced.')}><RefreshCw className="h-3.5 w-3.5" />Replace</button>
            </li>))}
            {!p.winnerEntries.length && <li className="py-2 text-sm text-slate-500">No eligible entries were left for this prize.</li>}
          </ul>
        </div>
      ))}
      {(rep?.prizes || []).some((p: any) => p.drawnAt) && (
        <div className={`${card} flex flex-wrap items-center gap-2`}>
          <button className={primary} disabled={busy} onClick={() => run(() => call(`/giveaway-forms/${form.id}/announce`, 'POST'), 'Posted in Discord and winners messaged where Discord allows.')}><Megaphone className="h-4 w-4" />Announce winners in Discord</button>
          <a className={ghost} href={`/api/v1/giveaway-forms/${form.id}/entries.csv`}><Download className="h-3.5 w-3.5" />Full CSV</a>
          <span className="text-xs text-slate-500">The announcement shows names only. Phone and address stay here and in your CSV.</span>
        </div>
      )}
    </div>
  );
}

export function GiveawayFormsView({ communityId }: { communityId: string }) {
  const headers = { 'Content-Type': 'application/json', 'x-community-id': communityId };
  const call = useCallback(async (path: string, method = 'GET', body?: any) => {
    const r = await fetch(`/api/v1${path}`, { method, credentials: 'include', headers, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) throw new Error(j.error?.message || j.message || 'Something went wrong.');
    return j;
  }, [communityId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [forms, setForms] = useState<any[] | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const [view, setView] = useState<{ form: any; entries: any[] } | null>(null);
  const [sheet, setSheet] = useState<{ configured: boolean; connected: boolean; email: string } | null>(null);
  useEffect(() => { call('/giveaway-forms/sheets/status').then(setSheet).catch(() => undefined); }, [call]);
  const [draw, setDraw] = useState<any | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => call('/giveaway-forms').then((j) => setForms(j.forms || [])).catch((e) => { setForms([]); setMsg(e.message); }), [call]);
  useEffect(() => { load(); }, [load]);
  const run = async (fn: () => Promise<any>, ok?: string) => { setBusy(true); setMsg(''); try { await fn(); if (ok) setMsg(ok); await load(); } catch (e: any) { setMsg(e.message); } finally { setBusy(false); } };

  const save = () => run(async () => {
    const b = { ...edit, opensAt: edit.opensAt ? new Date(edit.opensAt).toISOString() : '', closesAt: edit.closesAt ? new Date(edit.closesAt).toISOString() : '' };
    await call(edit.id ? `/giveaway-forms/${edit.id}` : '/giveaway-forms', edit.id ? 'PUT' : 'POST', b); setEdit(null);
  }, 'Saved. Press Open to start taking entries.');
  const setQ = (i: number, patch: Partial<Q>) => setEdit({ ...edit, questions: edit.questions.map((q: Q, n: number) => (n === i ? { ...q, ...patch } : q)) });

  if (draw) return <DrawPanel communityId={communityId} form={draw} call={call} onBack={() => { setDraw(null); load(); }} />;

  if (edit) return (
    <div className={`${card} space-y-4`}>
      <h3 className="text-lg font-bold text-slate-900">{edit.id ? 'Edit giveaway form' : 'New giveaway form'}</h3>
      <label className={label}>Title<input className={input} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="December giveaway" /></label>
      <label className={label}>What is it about<textarea className={`${input} min-h-[80px]`} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} placeholder="Prizes, rules, who can enter…" /></label>
      <div>
        <div className={label}>Questions people answer</div>
        <p className="text-xs text-slate-500">Mobile number and address are only seen by staff, so you can send the reward. Ask only what you need.</p>
        <ul className="mt-2 space-y-2">
          {edit.questions.map((q: Q, i: number) => (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-2">
              <input className="min-w-[10rem] flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" value={q.label} onChange={(e) => setQ(i, { label: e.target.value })} />
              <select className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" value={q.type} onChange={(e) => setQ(i, { type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              {q.type === 'choice' && <input className="min-w-[10rem] flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" placeholder="Options, separated by commas" value={(q.options || []).join(', ')} onChange={(e) => setQ(i, { options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) })} />}
              <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={q.required} onChange={(e) => setQ(i, { required: e.target.checked })} />Required</label>
              <button aria-label="Remove question" className="text-slate-400 hover:text-rose-600" onClick={() => setEdit({ ...edit, questions: edit.questions.filter((_: any, n: number) => n !== i) })}><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
        <button className={`${ghost} mt-2`} onClick={() => setEdit({ ...edit, questions: [...edit.questions, { id: `q${Date.now().toString(36)}`, label: '', type: 'text', required: false }] })}><Plus className="h-3.5 w-3.5" />Add question</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>Opens (optional)<input type="datetime-local" className={input} value={edit.opensAt} onChange={(e) => setEdit({ ...edit, opensAt: e.target.value })} /></label>
        <label className={label}>Closes (optional)<input type="datetime-local" className={input} value={edit.closesAt} onChange={(e) => setEdit({ ...edit, closesAt: e.target.value })} /></label>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-700">
        <label className="flex items-center gap-2"><input type="checkbox" checked={edit.allowDiscord} onChange={(e) => setEdit({ ...edit, allowDiscord: e.target.checked })} />Sign in with Discord</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={edit.allowGoogle} onChange={(e) => setEdit({ ...edit, allowGoogle: e.target.checked })} />Sign in with Google</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={edit.requireGuildMember} onChange={(e) => setEdit({ ...edit, requireGuildMember: e.target.checked, allowGoogle: e.target.checked ? false : edit.allowGoogle })} />Only people in this Discord server (Discord sign-in)</label>
      </div>
      <div><span className={label}>Post the winners in this channel</span><div className="mt-1"><ChannelSelect communityId={communityId} value={edit.resultChannelId || ''} onChange={(v: string) => setEdit({ ...edit, resultChannelId: v })} placeholder="Result channel" /></div></div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
        <div className="font-semibold text-slate-900">Google Sheet copy</div>
        {sheet?.connected ? <p className="mt-1">Connected as <b>{sheet.email}</b>. Make sure that Google account can edit the Sheet you paste below. <button className="ml-1 underline" onClick={() => call('/giveaway-forms/sheets/disconnect', 'POST').then(() => setSheet({ ...sheet, connected: false, email: '' }))}>Disconnect</button></p>
          : <p className="mt-1">Let the bot write to your Sheet with your Google permission. <button className={`${ghost} ml-1`} disabled={!sheet?.configured} onClick={() => call('/giveaway-forms/sheets/connect-url').then((j) => { window.location.href = j.url; }).catch((e) => setMsg(e.message))}>Connect Google</button>{sheet && !sheet.configured && <span className="ml-2 text-xs text-rose-600">Google sign-in is not set up on the server.</span>}</p>}
      </div>
      <label className={label}>Google Sheet link (entries and winners are copied there)<input className={input} value={edit.sheetUrl} onChange={(e) => setEdit({ ...edit, sheetUrl: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/…" /></label>
      {msg && <p className="text-sm text-rose-600">{msg}</p>}
      <div className="flex gap-2"><button className={primary} disabled={busy || !edit.title.trim()} onClick={save}>Save</button><button className={ghost} onClick={() => { setEdit(null); setMsg(''); }}>Cancel</button></div>
    </div>
  );

  if (view) {
    const { form, entries } = view;
    return (
      <div className={`${card} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-bold text-slate-900">{form.title}: {entries.length} entries</h3>
          <div className="flex gap-2"><a className={ghost} href={`/api/v1/giveaway-forms/${form.id}/entries.csv`}><Download className="h-3.5 w-3.5" />Download CSV</a><button className={ghost} onClick={() => setView(null)}>Back</button></div>
        </div>
        {!entries.length ? <p className="text-sm text-slate-500">No entries yet.</p> : (
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm">
            <thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="py-2 pr-4">Name</th><th className="pr-4">Sign-in</th><th className="pr-4">Email</th>{form.questions.map((q: Q) => <th key={q.id} className="pr-4">{q.label}</th>)}<th>Entered</th></tr></thead>
            <tbody>{entries.map((e) => (
              <tr key={e.id} className={`border-b border-slate-100 ${e.won?.length ? 'bg-amber-50' : ''}`}>
                <td className="py-2 pr-4 font-semibold text-slate-900">{e.name}{e.won?.length ? ' 🏆' : ''}</td><td className="pr-4">{e.provider}</td><td className="pr-4">{e.email || ''}</td>
                {form.questions.map((q: Q) => <td key={q.id} className="max-w-[14rem] truncate pr-4" title={e.answers[q.id]}>{e.answers[q.id] || ''}</td>)}
                <td className="whitespace-nowrap text-xs text-slate-500">{new Date(e.createdAt).toLocaleString()}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="text-lg font-bold text-slate-900">Web form giveaways</h3><p className="text-sm text-slate-500">Share one link. People sign in with Discord or Google, fill your form, and are entered once. You see every answer here.</p></div>
          <button className={primary} onClick={() => setEdit(blank())}><Plus className="h-4 w-4" />New form</button>
        </div>
        {msg && <p className="mt-3 text-sm text-slate-700">{msg}</p>}
      </div>
      {!forms ? <div className="h-32 animate-pulse rounded-2xl bg-slate-100" /> : !forms.length ? <p className="text-sm text-slate-500">No forms yet. Press “New form”.</p> : forms.map((f) => (
        <div key={f.id} className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-bold text-slate-900">🎁 {f.title}<LinksButton communityId={communityId} type="giveawayForm" id={f.id} /> <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{String(f.status).toLowerCase()}</span></div>
            <div className="text-xs text-slate-500"><Users className="mr-1 inline h-3.5 w-3.5" />{f.entryCount} entries</div>
          </div>
          <div className="mt-1 break-all text-xs text-slate-500">{f.url}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {f.status !== 'OPEN' ? <button className={ghost} disabled={busy} onClick={() => run(() => call(`/giveaway-forms/${f.id}/status`, 'POST', { status: 'OPEN' }), 'Open. Anyone with the link can enter.')}><Play className="h-3.5 w-3.5" />Open entries</button>
              : <button className={ghost} disabled={busy} onClick={() => run(() => call(`/giveaway-forms/${f.id}/status`, 'POST', { status: 'CLOSED' }), 'Closed.')}><Square className="h-3.5 w-3.5" />Close entries</button>}
            <button className={ghost} onClick={() => { navigator.clipboard?.writeText(f.url); setMsg('Link copied.'); }}><Copy className="h-3.5 w-3.5" />Copy link</button>
            <a className={ghost} href={f.url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />Open page</a>
            <button className={ghost} onClick={() => call(`/giveaway-forms/${f.id}/entries`).then((j) => setView({ form: j.form, entries: j.entries })).catch((e) => setMsg(e.message))}><Users className="h-3.5 w-3.5" />See entries</button>
            <button className={ghost} onClick={() => setEdit({ ...f, opensAt: toLocal(f.opensAt), closesAt: toLocal(f.closesAt), sheetUrl: f.sheetUrl || '' })}>Edit</button>
            {f.sheetUrl && <button className={ghost} disabled={busy} onClick={() => run(() => call(`/giveaway-forms/${f.id}/sheets/sync`, 'POST').then((r) => { setMsg(`Sheet updated: ${r.entries} entries, ${r.winners} winners. ${r.url}`); }))}><RefreshCw className="h-3.5 w-3.5" />Sync to Sheet</button>}
            <button className={ghost} onClick={() => setDraw(f)}><Trophy className="h-3.5 w-3.5" />Prizes & draw</button>
            <button className={ghost} disabled={busy} onClick={() => window.confirm('Delete this form? Only possible when it has no entries.') && run(() => call(`/giveaway-forms/${f.id}`, 'DELETE'), 'Deleted.')}><Trash2 className="h-3.5 w-3.5" />Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
