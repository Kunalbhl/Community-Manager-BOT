import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Download, Upload, Search, Pencil, Trash2, History, Send, X, CheckCircle2, AlertTriangle, Hash } from 'lucide-react';
import { MemberSelect } from '../../common/DiscordPickers.js';
import { Card, useApi } from './ServerToolsView.js';

/**
 * Recruiter codes in one place: naming series, create (optionally DM the code), import / export
 * with Excel, edit, activate / deactivate, delete, and each code's history.
 */
interface Code { id: string; code: string; recruiterDiscordId?: string; recruiterUserId?: string; recruiterName?: string; status?: string; isActive?: boolean; totalUses?: number; usesRemaining?: number; expiresAt?: string; notes?: string; createdAt?: string; source?: string }

const COLUMNS = [
  { key: 'code', title: 'Code', hint: 'Required. Letters, numbers, - and _' },
  { key: 'recruiterDiscordId', title: 'Recruiter Discord ID', hint: 'Discord ID or the username column' },
  { key: 'recruiterUsername', title: 'Recruiter username', hint: 'Exact Discord username, if no ID' },
  { key: 'recruiterName', title: 'Recruiter name', hint: 'Optional display name' },
  { key: 'status', title: 'Status', hint: 'ACTIVE or INACTIVE' },
  { key: 'maxUses', title: 'Max uses', hint: 'Optional number' },
  { key: 'expiresAt', title: 'Expires on', hint: 'Optional date, YYYY-MM-DD' },
  { key: 'totalUses', title: 'Uses so far', hint: 'Optional number' },
  { key: 'notes', title: 'Notes', hint: 'Optional' },
] as const;

const btn = 'inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-400 hover:text-indigo-700 disabled:opacity-50';
const primary = 'inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50';
const input = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const owner = (c: Code) => c.recruiterName || c.recruiterDiscordId || c.recruiterUserId || '—';

export function RecruiterCodesManager({ communityId }: { communityId: string }) {
  const api = useApi(communityId);
  const [data, setData] = useState<{ codes: Code[]; series: any; dmOnCreate: boolean } | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [editing, setEditing] = useState<Code | 'new' | null>(null);
  const [history, setHistory] = useState<{ code: Code; items: any[] } | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => api('/codes').then(setData).catch((e: any) => setToast({ ok: false, text: e.message })), [api]);
  useEffect(() => { load(); }, [load]);
  const flash = (ok: boolean, text: string) => { setToast({ ok, text }); setTimeout(() => setToast(null), 5000); };

  const codes = (data?.codes || []).filter((c) => (status === 'ALL' || (c.status || (c.isActive === false ? 'INACTIVE' : 'ACTIVE')) === status)
    && (!q || `${c.code} ${owner(c)} ${c.notes || ''}`.toLowerCase().includes(q.toLowerCase())));

  const exportFile = async (template: boolean) => {
    const { default: writeXlsxFile } = await import('write-excel-file');
    const rows = template ? [{ code: data?.series?.enabled ? `${data.series.prefix || ''}${String(data.series.next || 1).padStart(data.series.padding || 3, '0')}${data.series.suffix || ''}` : 'BHARAT-001', recruiterDiscordId: '123456789012345678', recruiterUsername: 'their.username', recruiterName: 'Kunal', status: 'ACTIVE', maxUses: '', expiresAt: '', totalUses: '0', notes: 'Example row, replace it' }]
      : (data?.codes || []).map((c) => ({ code: c.code, recruiterDiscordId: c.recruiterDiscordId || c.recruiterUserId || '', recruiterUsername: '', recruiterName: c.recruiterName || '', status: c.status || (c.isActive === false ? 'INACTIVE' : 'ACTIVE'), maxUses: c.usesRemaining ? String(c.usesRemaining) : '', expiresAt: c.expiresAt ? c.expiresAt.slice(0, 10) : '', totalUses: String(c.totalUses || 0), notes: c.notes || '' }));
    const header = COLUMNS.map((col) => ({ value: col.title, fontWeight: 'bold' as const }));
    const body = rows.map((r: any) => COLUMNS.map((col) => ({ type: String, value: String(r[col.key] ?? '') })));
    await writeXlsxFile([header, ...body] as any, { fileName: template ? 'recruiter-codes-template.xlsx' : `recruiter-codes-${new Date().toISOString().slice(0, 10)}.xlsx`, columns: COLUMNS.map(() => ({ width: 22 })) } as any);
  };

  return (
    <div className="space-y-6">
      {toast && <p role="status" className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${toast.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{toast.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{toast.text}</p>}

      {data && <SeriesCard api={api} series={data.series} dmOnCreate={data.dmOnCreate} onSaved={(t) => { flash(true, t); load(); }} onError={(t) => flash(false, t)} />}

      <ImportCard api={api} onDone={(t) => { flash(true, t); load(); }} onTemplate={() => exportFile(true)} />

      <Card title={`Codes (${data?.codes.length ?? 0})`} desc="Applicants enter a code when they apply, and the recruiter who owns it gets the credit."
        right={<div className="flex flex-wrap gap-2">
          <button className={btn} onClick={() => exportFile(false)} disabled={!data?.codes.length}><Download className="h-4 w-4" />Export</button>
          <button className={primary} onClick={() => setEditing('new')}><Plus className="h-4 w-4" />New code</button>
        </div>}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, recruiter or notes" className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm" /></div>
          {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((s) => <button key={s} onClick={() => setStatus(s)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${status === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-indigo-50'}`}>{s === 'ALL' ? 'All' : s === 'ACTIVE' ? 'Active' : 'Inactive'}</button>)}
        </div>
        {!data ? <div className="h-40 animate-pulse rounded-xl bg-slate-200/60" /> : !codes.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">{data.codes.length ? 'No codes match.' : 'No codes yet. Create one, or import your existing codes from Excel.'}</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Code</th><th className="px-4 py-3">Recruiter</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Uses</th><th className="px-4 py-3">Expires</th><th className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {codes.map((c) => {
                  const active = (c.status || (c.isActive === false ? 'INACTIVE' : 'ACTIVE')) === 'ACTIVE';
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">{c.code}{c.source === 'IMPORT' && <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-sky-700">imported</span>}</td>
                      <td className="px-4 py-3 text-slate-700">{owner(c)}</td>
                      <td className="px-4 py-3">
                        <button title={active ? 'Click to deactivate' : 'Click to activate'} onClick={() => api(`/codes/${c.id}`, 'PUT', { status: active ? 'INACTIVE' : 'ACTIVE' }).then(() => { flash(true, `${c.code} ${active ? 'deactivated' : 'activated'}.`); load(); }).catch((e: any) => flash(false, e.message))}
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{active ? 'Active' : 'Inactive'}</button>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{c.totalUses || 0}{c.usesRemaining ? ` / ${c.usesRemaining}` : ''}</td>
                      <td className="px-4 py-3 text-slate-600">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : 'Never'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button title="History" aria-label="History" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={() => api(`/codes/${c.id}/history`).then((items: any[]) => setHistory({ code: c, items }))}><History className="h-4 w-4" /></button>
                          <button title="Send code to recruiter by DM" aria-label="Send by DM" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-700" onClick={() => api(`/codes/${c.id}`, 'PUT', { dm: true }).then(() => flash(true, `Sent ${c.code} to the recruiter by DM (if their DMs are open).`)).catch((e: any) => flash(false, e.message))}><Send className="h-4 w-4" /></button>
                          <button title="Edit" aria-label="Edit" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-700" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></button>
                          <button title="Delete" aria-label="Delete" className="rounded-md p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" onClick={() => window.confirm(`Delete ${c.code}? Applicants can no longer use it. Past credit stays.`) && api(`/codes/${c.id}`, 'DELETE').then(() => { flash(true, `${c.code} deleted.`); load(); }).catch((e: any) => flash(false, e.message))}><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && <EditDialog api={api} communityId={communityId} code={editing === 'new' ? null : editing} series={data?.series} dmDefault={!!data?.dmOnCreate}
        onClose={() => setEditing(null)} onSaved={(t) => { setEditing(null); flash(true, t); load(); }} />}

      {history && (
        <Dialog title={`History of ${history.code.code}`} onClose={() => setHistory(null)}>
          {!history.items.length ? <p className="text-sm text-slate-500">Nothing recorded yet.</p> : (
            <ol className="max-h-96 space-y-2 overflow-y-auto">
              {history.items.map((h, i) => (
                <li key={i} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <div className="flex justify-between gap-2"><span className="font-semibold text-slate-900">{({ CREATED: 'Created', UPDATED: 'Changed', DELETED: 'Deleted', IMPORTED: 'Imported', DM_SENT: 'Sent to recruiter by DM', DM_FAILED: 'DM could not be delivered', USED: 'Used by an applicant' } as any)[h.action] || h.action}</span><span className="text-xs text-slate-500">{when(h.at)}</span></div>
                  <div className="text-xs text-slate-500">{[h.by, h.detail].filter(Boolean).join(' · ')}</div>
                </li>
              ))}
            </ol>
          )}
        </Dialog>
      )}
    </div>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-bold text-slate-900">{title}</h3><button aria-label="Close" onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

function SeriesCard({ api, series, dmOnCreate, onSaved, onError }: { api: any; series: any; dmOnCreate: boolean; onSaved: (t: string) => void; onError: (t: string) => void }) {
  const [s, setS] = useState(series);
  const [dm, setDm] = useState(dmOnCreate);
  const example = `${(s.prefix || '').toUpperCase()}${String(s.next || 1).padStart(s.padding || 3, '0')}${(s.suffix || '').toUpperCase()}`;
  return (
    <Card title="Code naming series" desc="When on, new codes are numbered automatically in this format, so every code follows the same pattern."
      right={<button className={primary} onClick={() => api('/codes/settings', 'PUT', { series: s, dmOnCreate: dm }).then(() => onSaved('Code settings saved.')).catch((e: any) => onError(e.message))}>Save</button>}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={!!s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />Use a naming series</label>
        <label className="w-32 text-xs font-semibold text-slate-600">Prefix<input className={input} value={s.prefix || ''} onChange={(e) => setS({ ...s, prefix: e.target.value })} placeholder="BHARAT-" /></label>
        <label className="w-24 text-xs font-semibold text-slate-600">Digits<input type="number" min={1} max={8} className={input} value={s.padding || 3} onChange={(e) => setS({ ...s, padding: Number(e.target.value) })} /></label>
        <label className="w-28 text-xs font-semibold text-slate-600">Next number<input type="number" min={1} className={input} value={s.next || 1} onChange={(e) => setS({ ...s, next: Number(e.target.value) })} /></label>
        <label className="w-28 text-xs font-semibold text-slate-600">Suffix<input className={input} value={s.suffix || ''} onChange={(e) => setS({ ...s, suffix: e.target.value })} placeholder="optional" /></label>
        <div className="rounded-lg bg-indigo-50 px-3 py-2 text-sm"><span className="text-slate-500">Next code: </span><b className="font-mono text-indigo-700">{example}</b></div>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={dm} onChange={(e) => setDm(e.target.checked)} />Send each new code to its recruiter by Discord DM</label>
    </Card>
  );
}

function ImportCard({ api, onDone, onTemplate }: { api: any; onDone: (t: string) => void; onTemplate: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'skip' | 'update'>('skip');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<any[] | null>(null);
  const [err, setErr] = useState('');

  const run = async (file: File) => {
    setErr(''); setResults(null);
    try {
      let rows: any[];
      if (/\.csv$/i.test(file.name)) {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        rows = lines.map((l) => l.split(',').map((x) => x.replace(/^"|"$/g, '').trim()));
      } else {
        const { default: readXlsxFile } = await import('read-excel-file');
        rows = (await readXlsxFile(file)).map((r: any[]) => r.map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? '' : String(v).trim())));
      }
      const head = (rows[0] || []).map((h: string) => String(h).toLowerCase());
      const idx = COLUMNS.map((c) => head.findIndex((h: string) => h === c.title.toLowerCase() || h === c.key.toLowerCase()));
      if (idx[0] < 0) throw new Error('The first row must have the column titles. Download the template to see them.');
      const objs = rows.slice(1).map((r: any[], i: number) => {
        const o: any = { __row: i + 2 };
        COLUMNS.forEach((c, j) => { if (idx[j] >= 0) o[c.key] = r[idx[j]]; });
        return o;
      }).filter((o: any) => o.code);
      if (!objs.length) throw new Error('No rows with a code found.');
      const all: any[] = [];
      setProgress({ done: 0, total: objs.length });
      for (let i = 0; i < objs.length; i += 50) {
        const part = await api('/codes/import', 'POST', { rows: objs.slice(i, i + 50), mode });
        all.push(...part);
        setProgress({ done: Math.min(objs.length, i + 50), total: objs.length });
      }
      setResults(all);
      const n = (k: string) => all.filter((r) => r.result === k).length;
      onDone(`Import finished: ${n('created')} created, ${n('updated')} updated, ${n('skipped')} skipped, ${n('error')} with problems.`);
    } catch (e: any) { setErr(e.message); }
    finally { setTimeout(() => setProgress(null), 1500); if (fileRef.current) fileRef.current.value = ''; }
  };

  const bad = (results || []).filter((r) => r.result === 'error');
  return (
    <Card title="Import existing codes" desc="Already have codes? Download the template, fill one row per code, then upload it. Works with .xlsx or .csv.">
      <div className="flex flex-wrap items-center gap-3">
        <button className={btn} onClick={onTemplate}><Download className="h-4 w-4" />Download template</button>
        <label className={`${primary} cursor-pointer`}><Upload className="h-4 w-4" />Upload file<input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && run(e.target.files[0])} /></label>
        <label className="flex items-center gap-2 text-sm text-slate-700">If a code already exists
          <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"><option value="skip">skip it</option><option value="update">update it</option></select>
        </label>
      </div>
      <details className="mt-3 text-sm text-slate-600"><summary className="cursor-pointer font-semibold text-indigo-600">Columns in the file</summary>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">{COLUMNS.map((c) => <li key={c.key}><b>{c.title}</b> · {c.hint}</li>)}</ul>
      </details>
      {progress && (
        <div className="mt-4" aria-live="polite">
          <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600"><span>Importing…</span><span>{progress.done} / {progress.total}</span></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></div>
        </div>
      )}
      {err && <p className="mt-3 text-sm font-semibold text-rose-700">{err}</p>}
      {!!bad.length && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <div className="font-bold text-amber-800">{bad.length} row{bad.length > 1 ? 's' : ''} need attention</div>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-amber-900">{bad.map((r) => <li key={r.row}>Row {r.row}{r.code ? ` (${r.code})` : ''}: {r.message}</li>)}</ul>
        </div>
      )}
    </Card>
  );
}

function EditDialog({ api, communityId, code, series, dmDefault, onClose, onSaved }: { api: any; communityId: string; code: Code | null; series: any; dmDefault: boolean; onClose: () => void; onSaved: (t: string) => void }) {
  const [f, setF] = useState({
    code: code?.code || '', recruiterDiscordId: code?.recruiterDiscordId || code?.recruiterUserId || '', recruiterName: code?.recruiterName || '',
    maxUses: code?.usesRemaining ? String(code.usesRemaining) : '', expiresAt: code?.expiresAt ? code.expiresAt.slice(0, 10) : '', notes: code?.notes || '',
    status: code?.status || 'ACTIVE', dm: code ? false : dmDefault,
  });
  const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    try {
      if (code) await api(`/codes/${code.id}`, 'PUT', { ...f, maxUses: f.maxUses || null, expiresAt: f.expiresAt || null });
      else await api('/codes', 'POST', { ...f, maxUses: f.maxUses || undefined, expiresAt: f.expiresAt || undefined });
      onSaved(code ? 'Code updated.' : 'Code created.');
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <Dialog title={code ? `Edit ${code.code}` : 'New recruiter code'} onClose={onClose}>
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-slate-600">Recruiter (who gets the credit)
          <div className="mt-1"><MemberSelect communityId={communityId} value={f.recruiterDiscordId} onChange={(id, m) => setF({ ...f, recruiterDiscordId: id, recruiterName: m?.name || f.recruiterName })} placeholder="Search a member" /></div>
        </label>
        <label className="block text-xs font-semibold text-slate-600"><span className="flex items-center gap-1"><Hash className="h-3.5 w-3.5" />Code</span>
          <input className={`${input} font-mono uppercase`} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder={!code && series?.enabled ? 'Leave empty for the next code in your series' : 'e.g. BHARAT-007'} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-slate-600">Max uses<input type="number" min={1} className={input} value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: e.target.value })} placeholder="No limit" /></label>
          <label className="block text-xs font-semibold text-slate-600">Expires on<input type="date" className={input} value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /></label>
        </div>
        {code && <label className="block text-xs font-semibold text-slate-600">Status<select className={input} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="ACTIVE">Active: applicants can use it</option><option value="INACTIVE">Inactive: paused</option></select></label>}
        <label className="block text-xs font-semibold text-slate-600">Notes<input className={input} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Optional, for staff" /></label>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={f.dm} onChange={(e) => setF({ ...f, dm: e.target.checked })} />Send the code to the recruiter by DM</label>
        {err && <p className="text-sm font-semibold text-rose-700">{err}</p>}
        <div className="flex justify-end gap-2 pt-2"><button className={btn} onClick={onClose}>Cancel</button><button className={primary} disabled={!f.recruiterDiscordId} onClick={save}>{code ? 'Save changes' : 'Create code'}</button></div>
      </div>
    </Dialog>
  );
}
