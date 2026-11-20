import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, Megaphone, Send, Clock, BarChart3, Gift, ClipboardList, MousePointerClick, Link2, X, Unlink } from 'lucide-react';

export type LinkType = 'event' | 'announcement' | 'campaign' | 'reminder' | 'poll' | 'giveaway' | 'giveawayForm' | 'rolePanel';

const KINDS: Record<LinkType, { label: string; icon: any }> = {
  event: { label: 'Event', icon: Calendar },
  announcement: { label: 'Announcement', icon: Megaphone },
  campaign: { label: 'Campaign', icon: Send },
  reminder: { label: 'Reminder', icon: Clock },
  poll: { label: 'Poll', icon: BarChart3 },
  giveaway: { label: 'Giveaway', icon: Gift },
  giveawayForm: { label: 'Giveaway form', icon: ClipboardList },
  rolePanel: { label: 'Role panel', icon: MousePointerClick },
};
const ghost = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const fmt = (v: any) => { const d = new Date(v); return isNaN(+d) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };

function useCall(communityId: string) {
  return useCallback(async (path: string, method = 'GET', body?: any) => {
    const r = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-community-id': communityId }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) throw new Error(j.error?.message || j.error || j.message || 'Something went wrong.');
    return j;
  }, [communityId]);
}

/** Everything linked to one item, from either side, with one place to add or remove links. */
export function LinkedPanel({ communityId, type, id, canEdit = true }: { communityId: string; type: LinkType; id: string; canEdit?: boolean }) {
  const call = useCall(communityId);
  const [items, setItems] = useState<any[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<LinkType>(type === 'event' ? 'giveaway' : 'event');
  const [options, setOptions] = useState<any[]>([]);
  const [pick, setPick] = useState('');
  const [err, setErr] = useState('');
  const load = useCallback(() => call(`/api/v1/links?type=${type}&id=${encodeURIComponent(id)}`).then((j) => setItems(j.items || [])).catch(() => setItems([])), [call, type, id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (adding) call(`/api/v1/links/options?type=${kind}`).then((j) => { setOptions((j.items || []).filter((o: any) => !(o.type === type && o.id === id))); setPick(''); }).catch(() => setOptions([])); }, [adding, kind, call, type, id]);
  const add = async () => {
    setErr('');
    try { await call('/api/v1/links', 'POST', { a: { type, id }, b: { type: kind, id: pick } }); setAdding(false); await load(); } catch (e: any) { setErr(e.message); }
  };
  const remove = async (linkId: string) => { try { await call(`/api/v1/links/${linkId}`, 'DELETE'); await load(); } catch (e: any) { setErr(e.message); } };
  return (
    <div>
      {items === null ? <div className="h-10 animate-pulse rounded-lg bg-slate-100" /> : items.length ? (
        <ul className="mb-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {items.map((it) => { const k = KINDS[it.type as LinkType]; const Icon = k?.icon || Link2; return (
            <li key={`${it.type}-${it.id}`} className="flex items-center gap-3 px-3 py-2 text-sm">
              <Icon className="h-4 w-4 shrink-0 text-indigo-500" />
              <span className="w-28 shrink-0 text-xs font-semibold text-slate-500">{k?.label || it.type}</span>
              <span className="min-w-0 flex-1 truncate text-slate-800">{it.title}</span>
              {it.when && <span className="shrink-0 text-xs text-slate-500">{fmt(it.when)}</span>}
              {it.status && <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{String(it.status).toLowerCase().replace(/_/g, ' ')}</span>}
              {canEdit && it.linkId && <button title="Unlink" aria-label="Unlink" className="shrink-0 text-slate-400 hover:text-rose-600" onClick={() => remove(it.linkId)}><Unlink className="h-4 w-4" /></button>}
            </li>
          ); })}
        </ul>
      ) : <p className="mb-3 text-xs text-slate-400">Nothing linked yet.</p>}
      {err && <p className="mb-2 text-xs text-rose-600">{err}</p>}
      {canEdit && (adding ? (
        <div className="flex flex-wrap items-center gap-2">
          <select className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" value={kind} onChange={(e) => setKind(e.target.value as LinkType)}>
            {(Object.keys(KINDS) as LinkType[]).map((k) => <option key={k} value={k}>{KINDS[k].label}</option>)}
          </select>
          <select className="min-w-[12rem] flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm" value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">{options.length ? 'Choose…' : `No ${KINDS[kind].label.toLowerCase()} yet`}</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
          <button className={ghost} disabled={!pick} onClick={add}><Link2 className="h-3.5 w-3.5" />Link</button>
          <button className={ghost} onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : <button className={ghost} onClick={() => setAdding(true)}><Link2 className="h-3.5 w-3.5" />+ Link something</button>)}
    </div>
  );
}

/** Small "Links" button for list rows: opens the linked items for that row in a dialog. */
export function LinksButton({ communityId, type, id }: { communityId: string; type: LinkType; id?: string }) {
  const [open, setOpen] = useState(false);
  if (!id) return null;
  return (
    <>
      <button type="button" className="ml-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700" onClick={() => setOpen(true)}><Link2 className="h-3 w-3" />Links</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label="Linked items" className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><h3 className="text-base font-bold text-slate-900">Linked to this {KINDS[type].label.toLowerCase()}</h3><button aria-label="Close" onClick={() => setOpen(false)}><X className="h-5 w-5 text-slate-500" /></button></div>
            <LinkedPanel communityId={communityId} type={type} id={id} />
          </div>
        </div>
      )}
    </>
  );
}
