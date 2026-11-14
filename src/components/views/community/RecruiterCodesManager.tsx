import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Download, Upload, Search, Pencil, Trash2, History, Send, X, CheckCircle2, AlertTriangle, Hash } from 'lucide-react';
import { MemberSelect, MemberName, RoleSelect, ChannelSelect, useDiscordResources } from '../../common/DiscordPickers.js';
import { Card, useApi } from './ServerToolsView.js';
import { buildCode, nameWords } from '../../../../shared/utils/nameWords.js';

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

      {data && <SeriesCard communityId={communityId} api={api} rules={(data as any).rules || []} series={data.series} dmOnCreate={data.dmOnCreate} codeForNewMembers={(data as any).codeForNewMembers} codeChannelId={(data as any).codeChannelId || ''} rewardBoardChannelId={(data as any).rewardBoardChannelId || ''} onSaved={(t) => { flash(true, t); load(); }} onError={(t) => flash(false, t)} />}

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
                      <td className="px-4 py-3 text-slate-700"><MemberName id={c.recruiterDiscordId || c.recruiterUserId} communityId={communityId} fallback={c.recruiterName} /></td>
                      <td className="px-4 py-3">
                        <button title={active ? 'Click to deactivate' : 'Click to activate'} onClick={() => api(`/codes/${c.id}`, 'PUT', { status: active ? 'INACTIVE' : 'ACTIVE' }).then(() => { flash(true, `${c.code} ${active ? 'deactivated' : 'activated'}.`); load(); }).catch((e: any) => flash(false, e.message))}
                          className={`rounded-full px-2.5 py-1 text-xs font-bold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{active ? 'Active' : 'Inactive'}</button>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{c.totalUses || 0}{c.usesRemaining ? ` / ${c.usesRemaining}` : ''}</td>
                      <td className="px-4 py-3 text-slate-600">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : 'Never'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button title="History" aria-label="History" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={() => api(`/codes/${c.id}/history`).then((items: any[]) => setHistory({ code: c, items }))}><History className="h-4 w-4" /></button>
                          <button title="Send the code to its owner by DM" aria-label="Send by DM" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-700" onClick={() => api(`/codes/${c.id}`, 'PUT', { dm: true }).then(() => flash(true, `Sent ${c.code} to the recruiter by DM (if their DMs are open).`)).catch((e: any) => flash(false, e.message))}><Send className="h-4 w-4" /></button>
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

/** Same rules as the server (toolkit.controller seriesCode) so the preview matches real codes. */
function previewSeries(s: any, name: string) { return buildCode(s, Number(s.next) || 1, name); }

const MODES = [
  { v: 'FIXED', l: 'Fixed text', d: 'Same text for everyone, then a number.' },
  { v: 'INITIALS', l: 'Initials', d: 'First letter of each word. Understands MrTechnicalGamer, dots, underscores and styled letters; ignores numbers and symbols.' },
  { v: 'FIRST', l: 'First letters', d: 'The first few letters of the name.' },
  { v: 'FIRST_LAST', l: 'First + last letters', d: 'Some letters from the start and some from the end.' },
];

function SeriesCard({ communityId, api, rules: rules0, series, dmOnCreate, codeForNewMembers, codeChannelId, rewardBoardChannelId, onSaved, onError }: { codeChannelId: string; rewardBoardChannelId: string; communityId: string; api: any; rules: any[]; series: any; dmOnCreate: boolean; codeForNewMembers: boolean; onSaved: (t: string) => void; onError: (t: string) => void }) {
  const [s, setS] = useState({ mode: 'FIXED', separator: '-', firstN: 3, lastM: 2, ...series });
  const [dm, setDm] = useState(dmOnCreate);
  const [auto, setAuto] = useState(codeForNewMembers);
  const [codeCh, setCodeCh] = useState(codeChannelId);
  const [boardCh, setBoardCh] = useState(rewardBoardChannelId);
  const [chMsg, setChMsg] = useState('');
  const saveCh = (patch: any) => { setChMsg('Saving…'); api('/codes/channels', 'PUT', patch).then((r: any) => setChMsg(`✓ Saved${r.posted ? `. ${r.posted} codes posted.` : '.'}`)).catch((e: any) => setChMsg(e.message)); };
  const [rules, setRules] = useState<any[]>(rules0);
  const res: any = useDiscordResources(communityId);
  return (
    <Card title="Code naming and delivery" desc="How codes are named, and whether every approved member automatically gets their own code."
      right={<button className={primary} onClick={() => api('/codes/settings', 'PUT', { series: s, rules, dmOnCreate: dm, codeForNewMembers: auto, codeChannelId: codeCh, rewardBoardChannelId: boardCh }).then(() => onSaved('Code settings saved.')).catch((e: any) => onError(e.message))}>Save</button>}>
      <label className="flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-slate-800"><input type="checkbox" className="mt-0.5" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
        <span><b>Give every approved member their own recruiter code</b><br /><span className="text-xs text-slate-600">When an application is approved and the member is in the server, the bot creates their code with the pattern below and sends it to them by DM. Members can see their own code any time with <code>/mycode</code> (only they see the reply).</span></span>
      </label>
      <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={!!s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} />Use a naming pattern for new codes</label>
      <div className={`mt-3 ${s.enabled ? '' : 'pointer-events-none opacity-50'}`}><SeriesEditor s={s} setS={setS} /></div>

      <div className="mt-6 border-t border-slate-100 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><div className="text-sm font-black text-slate-900">Different series by role</div><p className="text-xs text-slate-500">e.g. members with @Crew Leader get <b>CL-001</b>, members with @VIP get <b>VIP-001</b>. The bot checks these from top to bottom and uses the first one whose role the member has; everyone else gets the pattern above. Each series counts its own numbers.</p></div>
          <button type="button" className={`${primary} shrink-0`} onClick={() => setRules([...rules, { id: `r${Date.now().toString(36)}`, name: '', enabled: true, roleIds: [], series: { mode: 'FIXED', prefix: '', separator: '-', firstN: 3, lastM: 2, padding: 3, next: 1, suffix: '' } }])}><Plus className="h-4 w-4" />Add role series</button>
        </div>
        <div className="mt-3 space-y-3">
          {rules.map((r, i) => {
            const up = (patch: any) => setRules(rules.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            const move = (d: number) => { const n = [...rules]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); setRules(n); };
            return (
              <div key={r.id} className={`rounded-xl border p-4 ${r.enabled ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{i + 1}</span>
                  <input className={`${input} max-w-xs`} value={r.name} onChange={(e) => up({ name: e.target.value })} placeholder="Name, e.g. Crew leaders" />
                  <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={r.enabled} onChange={(e) => up({ enabled: e.target.checked })} />On</label>
                  <div className="ml-auto flex gap-1">
                    <button type="button" className="rounded-lg px-2 py-1 text-sm hover:bg-slate-100 disabled:opacity-30" disabled={i === 0} onClick={() => move(-1)} aria-label="Move up">↑</button>
                    <button type="button" className="rounded-lg px-2 py-1 text-sm hover:bg-slate-100 disabled:opacity-30" disabled={i === rules.length - 1} onClick={() => move(1)} aria-label="Move down">↓</button>
                    <button type="button" className="rounded-lg px-2 py-1 text-rose-600 hover:bg-rose-50" onClick={() => setRules(rules.filter((_, j) => j !== i))} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <div className="mt-3 text-xs font-semibold text-slate-600">Members with any of these roles</div>
                <div className="mt-1 flex flex-wrap gap-1.5">{r.roleIds.map((id: string) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">@{res?.roles?.find((x: any) => x.id === id)?.name || 'role'}<button type="button" onClick={() => up({ roleIds: r.roleIds.filter((x: string) => x !== id) })}>×</button></span>)}</div>
                <div className="mt-1 max-w-sm"><RoleSelect communityId={communityId} value="" exclude={r.roleIds} onChange={(id) => id && up({ roleIds: [...r.roleIds, id] })} placeholder="Add a role" /></div>
                {!r.roleIds.length && <p className="mt-1 text-xs text-amber-700">Add at least one role, or this series is never used.</p>}
                <div className="mt-3"><SeriesEditor s={r.series} setS={(v: any) => up({ series: v })} /></div>
              </div>
            );
          })}
        </div>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={dm} onChange={(e) => setDm(e.target.checked)} />When staff create a code here, also send it to its owner by DM</label>
      <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-2">
        <div className="text-sm font-semibold text-slate-700">Post codes in a channel
          <p className="text-xs font-normal text-slate-500">Every code gets one message here: owner, status, uses and expiry. When a code is renamed, paused, used or deleted, that same message is updated, not a new one. Picking a channel posts all existing codes once.</p>
          <div className="mt-1"><ChannelSelect communityId={communityId} value={codeCh} onChange={(v: any) => { setCodeCh(v || ''); saveCh({ codeChannelId: v || '' }); }} placeholder="Don't post codes" /></div>
        </div>
        <div className="text-sm font-semibold text-slate-700">Recruiter reward board
          <p className="text-xs font-normal text-slate-500">One message per recruiter with their invites, reward roles, latest rewards and wallet balance. The first reward posts it; every later reward, use or correction updates the same message. Empty = the announcement channel of the reward rule.</p>
          <div className="mt-1"><ChannelSelect communityId={communityId} value={boardCh} onChange={(v: any) => { setBoardCh(v || ''); saveCh({ rewardBoardChannelId: v || '' }); }} placeholder="Use the reward rule's channel" /></div>
        </div>
        <p className="text-xs text-indigo-700 md:col-span-2">{chMsg || 'These two save on their own as soon as you pick a channel. The other settings in this box save with the Save button at the top.'}</p>
        <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
          <div><div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">How a code message looks</div>
            <div className="rounded-lg border-l-4 border-emerald-400 bg-[#2b2d31] p-3 text-[13px] text-slate-200">
              <div className="font-bold text-white">🎟️ KUN-007</div>
              <div>Owner: <span className="rounded bg-indigo-500/30 px-1 text-indigo-200">@Kunal</span> (Kunal)</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs"><div><b className="text-white">Status</b><br />🟢 Active</div><div><b className="text-white">Used</b><br />4</div><div><b className="text-white">Expires</b><br />Never</div><div><b className="text-white">Created</b><br />2 days ago</div><div><b className="text-white">Updated</b><br />just now</div></div>
            </div></div>
          <div><div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">How a reward board message looks</div>
            <div className="rounded-lg border-l-4 border-indigo-400 bg-[#2b2d31] p-3 text-[13px] text-slate-200">
              <div className="mb-1 text-slate-300">Your reward announcement text (if you wrote one)</div>
              <div className="font-bold text-white">🏆 Kunal</div>
              <div><span className="rounded bg-indigo-500/30 px-1 text-indigo-200">@Kunal</span> · code <b>KUN-007</b></div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs"><div><b className="text-white">👥 Invites</b><br />5 in the server · 1 left</div><div><b className="text-white">🏷️ Reward roles</b><br /><span className="text-indigo-200">@Silver Recruiter</span></div></div>
              <div className="mt-2 text-xs"><b className="text-white">💰 Balance</b><br />🎮 Modded Heist: 3 available · earned 5 · used 2</div>
              <div className="mt-2 text-xs"><b className="text-white">🎁 Latest rewards</b><br />✅ ➕ Reward per recruit · 1 hour ago</div>
            </div></div>
        </div>
</div>
      </div>
    </Card>
  );
}

function SeriesEditor({ s, setS }: { s: any; setS: (v: any) => void }) {
  const [sample, setSample] = useState('Kunal Pareek');
  const field = 'w-24 text-xs font-semibold text-slate-600';
  return (
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-4">
          {MODES.map((m) => (
            <button key={m.v} type="button" onClick={() => setS({ ...s, mode: m.v })} className={`rounded-xl border p-3 text-left transition ${s.mode === m.v ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'}`}>
              <div className="text-sm font-bold text-slate-900">{m.l}</div><div className="text-xs text-slate-500">{m.d}</div>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="w-32 text-xs font-semibold text-slate-600">{s.mode === 'FIXED' ? 'Text' : 'Text before (optional)'}<input className={input} value={s.prefix || ''} onChange={(e) => setS({ ...s, prefix: e.target.value })} placeholder={s.mode === 'FIXED' ? 'BHARAT-' : 'e.g. BE-'} /></label>
          {(s.mode === 'FIRST' || s.mode === 'FIRST_LAST') && <label className={field}>Letters from start<input type="number" min={1} max={8} className={input} value={s.firstN} onChange={(e) => setS({ ...s, firstN: Number(e.target.value) })} /></label>}
          {s.mode === 'FIRST_LAST' && <label className={field}>Letters from end<input type="number" min={1} max={8} className={input} value={s.lastM} onChange={(e) => setS({ ...s, lastM: Number(e.target.value) })} /></label>}
          {s.mode !== 'FIXED' && <label className={field}>Separator<select className={input} value={s.separator} onChange={(e) => setS({ ...s, separator: e.target.value })}><option value="-">-</option><option value="_">_</option><option value="">none</option></select></label>}
          <label className={field}>Digits<input type="number" min={1} max={8} className={input} value={s.padding || 3} onChange={(e) => setS({ ...s, padding: Number(e.target.value) })} /></label>
          <label className="w-28 text-xs font-semibold text-slate-600">Next number<input type="number" min={1} className={input} value={s.next || 1} onChange={(e) => setS({ ...s, next: Number(e.target.value) })} /></label>
          <label className="w-28 text-xs font-semibold text-slate-600">Suffix<input className={input} value={s.suffix || ''} onChange={(e) => setS({ ...s, suffix: e.target.value })} placeholder="optional" /></label>
        </div>
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm">
          {s.mode !== 'FIXED' && <label className="text-xs font-semibold text-slate-600">Try a name<input className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm" value={sample} onChange={(e) => setSample(e.target.value)} /></label>}
          {s.mode !== 'FIXED' && <span className="text-xs text-slate-500">Read as: <b className="text-slate-700">{nameWords(sample).join(' · ') || '—'}</b></span>}
          <span className="text-slate-500">Next code:</span><b className="font-mono text-lg text-indigo-700">{previewSeries(s, sample)}</b>
        </div>
      </div>
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
        <label className="block text-xs font-semibold text-slate-600">Code owner (the member who shares it and gets the credit)
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
