import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Copy, Download, Trash2, Users, Play, Square, ExternalLink } from 'lucide-react';
import { LinksButton } from '../../common/Linked.js';

type Q = { id: string; label: string; type: string; required: boolean; options?: string[] };
const card = 'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm';
const input = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900';
const label = 'block text-xs font-bold uppercase tracking-wide text-slate-600';
const ghost = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const primary = 'inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50';
const TYPES = [['text', 'Short answer'], ['longtext', 'Long answer'], ['phone', 'Mobile number'], ['email', 'Email'], ['choice', 'Pick one']];
const blank = () => ({ title: '', description: '', questions: [{ id: 'q1', label: 'Full name', type: 'text', required: true }, { id: 'q2', label: 'Mobile number', type: 'phone', required: false }, { id: 'q3', label: 'Delivery address', type: 'longtext', required: false }] as Q[], opensAt: '', closesAt: '', requireGuildMember: false, allowDiscord: true, allowGoogle: true, sheetUrl: '' });
const toLocal = (iso?: string) => { if (!iso) return ''; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

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
      <label className={label}>Google Sheet link (optional, entries are copied there once Sheet sync is connected)<input className={input} value={edit.sheetUrl} onChange={(e) => setEdit({ ...edit, sheetUrl: e.target.value })} placeholder="https://docs.google.com/spreadsheets/d/…" /></label>
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
            <button className={ghost} disabled={busy} onClick={() => window.confirm('Delete this form? Only possible when it has no entries.') && run(() => call(`/giveaway-forms/${f.id}`, 'DELETE'), 'Deleted.')}><Trash2 className="h-3.5 w-3.5" />Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
