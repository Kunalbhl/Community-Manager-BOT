import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, Megaphone, Minus, Pencil, Plus, Search, X, XCircle } from 'lucide-react';
import { ChannelSelect, MemberName, MemberSelect, MultiMemberSelect } from '../../common/DiscordPickers.js';
import { Card } from './ServerToolsView.js';

const input = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200';
const btn = 'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold transition disabled:opacity-50';
const primary = `${btn} bg-indigo-600 text-white hover:bg-indigo-700`;
const ghost = `${btn} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`;

const KIND: Record<string, { label: string; cls: string }> = {
  EARN: { label: 'Earned', cls: 'text-emerald-700' },
  REVERSAL: { label: 'Taken back', cls: 'text-rose-700' },
  ADJUST: { label: 'Adjusted', cls: 'text-indigo-700' },
  CLAIM: { label: 'Used', cls: 'text-amber-700' },
};

/** Countable rewards: items, balances per member and code, use requests, recording use and the full ledger. */
export function RewardWallet({ communityId, api }: { communityId: string; api: (p: string, m?: string, b?: unknown) => Promise<any> }) {
  const [w, setW] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [itemEdit, setItemEdit] = useState<any>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string>('');
  const [fItem, setFItem] = useState('ALL');
  const [fKind, setFKind] = useState('ALL');
  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 6000); };
  const load = useCallback(() => api('/rewards/wallet').then(setW).catch((e) => { setW({ items: [], balances: [], txs: [], pending: [] }); flash(false, e.message); }), [api]);
  useEffect(() => { load(); }, [load]);
  const itemOf = (id: string) => w?.items.find((i: any) => i.id === id) || { name: 'Deleted item', emoji: '❔' };

  const balances = useMemo(() => (w?.balances || []).filter((b: any) => (fItem === 'ALL' || b.itemId === fItem) && (!q || String(b.memberName).toLowerCase().includes(q.toLowerCase()) || b.memberId.includes(q) || Object.keys(b.byCode).some((c) => c.toLowerCase().includes(q.toLowerCase())))), [w, q, fItem]);
  const txs = useMemo(() => (w?.txs || []).filter((t: any) => (fItem === 'ALL' || t.itemId === fItem) && (fKind === 'ALL' || t.kind === fKind) && (!q || [t.memberName, t.memberId, t.recruiterCode, t.recruitName, t.forEvent, t.note].some((x) => String(x || '').toLowerCase().includes(q.toLowerCase())))), [w, q, fItem, fKind]);

  if (!w) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />;
  return (
    <div className="space-y-5">
      {msg && <p className={`flex items-center gap-2 text-sm font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{msg.text}</p>}

      <Card title="Reward items" desc="Countable things recruiters earn and spend later, like 1 Modded Heist per recruit. Then make a reward on the Rewards tab that adds this item to their wallet."
        right={<button className={primary} onClick={() => setItemEdit({ name: '', emoji: '🎟️', description: '', claimApproval: 'AUTO', maxPerClaim: 0, active: true, logChannelId: '' })}><Plus className="h-4 w-4" />New item</button>}>
        {!w.items.length ? <p className="text-sm text-slate-500">No items yet. Example: <b>💰 Modded Heist</b>, members use them at heist planning.</p> : (
          <div className="grid gap-3 md:grid-cols-2">
            {w.items.map((i: any) => {
              const total = w.balances.filter((b: any) => b.itemId === i.id);
              return (
                <div key={i.id} className={`rounded-xl border p-4 ${i.active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
                  <div className="flex items-start justify-between gap-2"><div><div className="text-base font-bold text-slate-900">{i.emoji} {i.name}</div><p className="text-sm text-slate-500">{i.description || (i.claimApproval === 'STAFF' ? 'Staff approve each use.' : 'Used at once from the balance.')}</p></div><button className={ghost} onClick={() => setItemEdit({ ...i })}><Pencil className="h-4 w-4" /></button></div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="rounded-lg bg-emerald-50 p-2"><div className="text-lg font-black text-emerald-700">{total.reduce((n: number, b: any) => n + b.earned - b.reversed + b.adjusted, 0)}</div>given</div>
                    <div className="rounded-lg bg-amber-50 p-2"><div className="text-lg font-black text-amber-700">{total.reduce((n: number, b: any) => n + b.used, 0)}</div>used</div>
                    <div className="rounded-lg bg-indigo-50 p-2"><div className="text-lg font-black text-indigo-700">{total.reduce((n: number, b: any) => n + b.available, 0)}</div>still to use</div>
                  </div>
                  <PanelPoster communityId={communityId} onPost={async (channelId, forEvent) => { try { const r = await api(`/rewards/items/${i.id}/panel`, 'POST', { channelId, forEvent }); flash(true, `Posted in #${r.channel}. Members press Use to spend.`); } catch (e: any) { flash(false, e.message); } }} />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {w.pending.length > 0 && (
        <Card title={`Use requests (${w.pending.length})`} desc="Members asked to use rewards. Their balance is held until you decide. You can also approve from the buttons in Discord.">
          <div className="divide-y divide-slate-100">
            {w.pending.map((t: any) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <b><MemberName id={t.memberId} communityId={communityId} fallback={t.memberName} /></b><span>wants {-t.amount}× {itemOf(t.itemId).emoji} {itemOf(t.itemId).name}{t.forEvent ? ` for ${t.forEvent}` : ''}</span><span className="text-xs text-slate-400">{new Date(t.createdAt).toLocaleString()}</span>
                <div className="ml-auto flex gap-1.5">
                  <button className={`${btn} bg-emerald-600 px-2.5 py-1 text-xs text-white hover:bg-emerald-700`} onClick={async () => { try { await api(`/rewards/wallet/tx/${t.id}/approve`, 'POST'); flash(true, 'Approved.'); load(); } catch (e: any) { flash(false, e.message); } }}>Approve</button>
                  <button className={`${btn} border border-slate-300 px-2.5 py-1 text-xs`} onClick={async () => { try { await api(`/rewards/wallet/tx/${t.id}/deny`, 'POST'); flash(true, 'Declined. Nothing was taken.'); load(); } catch (e: any) { flash(false, e.message); } }}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {w.items.length > 0 && <div className="grid gap-5 lg:grid-cols-2"><RecordUse communityId={communityId} items={w.items} api={api} done={(t: string, ok = true) => { flash(ok, t); load(); }} /><Adjust communityId={communityId} items={w.items} api={api} done={(t: string, ok = true) => { flash(ok, t); load(); }} /></div>}

      <Card title="Balances" desc="Per member: what they earned (and from which recruiter code), what was taken back, used, waiting, and what they can still use. Click a row for the full history.">
        <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto]">
          <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input className={`${input} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search member, code, recruit or event…" /></div>
          <select className={input} value={fItem} onChange={(e) => setFItem(e.target.value)}><option value="ALL">All items</option>{w.items.map((i: any) => <option key={i.id} value={i.id}>{i.emoji} {i.name}</option>)}</select>
        </div>
        {!balances.length ? <p className="text-sm text-slate-500">No balances yet.</p> : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2.5" /><th className="px-3 py-2.5">Member</th><th className="px-3 py-2.5">Item</th><th className="px-3 py-2.5 text-right">Earned</th><th className="px-3 py-2.5 text-right">Taken back</th><th className="px-3 py-2.5 text-right">Adjusted</th><th className="px-3 py-2.5 text-right">Used</th><th className="px-3 py-2.5 text-right">Waiting</th><th className="px-3 py-2.5 text-right">Available</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {balances.map((b: any) => {
                  const k = `${b.itemId}|${b.memberId}`;
                  const it = itemOf(b.itemId);
                  return (
                    <React.Fragment key={k}>
                      <tr className="cursor-pointer hover:bg-slate-50/70" onClick={() => setOpen(open === k ? '' : k)}>
                        <td className="px-3 py-2.5 text-slate-400">{open === k ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                        <td className="px-3 py-2.5 font-semibold text-slate-900"><MemberName id={b.memberId} communityId={communityId} fallback={b.memberName} /></td>
                        <td className="px-3 py-2.5">{it.emoji} {it.name}</td>
                        <td className="px-3 py-2.5 text-right text-emerald-700">{b.earned}</td>
                        <td className="px-3 py-2.5 text-right text-rose-700">{b.reversed || '—'}</td>
                        <td className="px-3 py-2.5 text-right text-indigo-700">{b.adjusted ? `${b.adjusted > 0 ? '+' : ''}${b.adjusted}` : '—'}</td>
                        <td className="px-3 py-2.5 text-right text-amber-700">{b.used}</td>
                        <td className="px-3 py-2.5 text-right">{b.pending || '—'}</td>
                        <td className={`px-3 py-2.5 text-right text-base font-black ${b.available < 0 ? 'text-rose-600' : 'text-slate-900'}`}>{b.available}</td>
                      </tr>
                      {open === k && (
                        <tr><td colSpan={9} className="bg-slate-50/60 px-6 py-3">
                          {Object.keys(b.byCode).length > 0 && <div className="mb-2 flex flex-wrap gap-1.5 text-xs">{Object.entries(b.byCode).map(([c, n]: any) => <span key={c} className="rounded-full bg-white px-2 py-0.5 font-semibold text-slate-700 ring-1 ring-slate-200">🎟️ {c}: {n}</span>)}</div>}
                          <Ledger txs={w.txs.filter((t: any) => t.memberId === b.memberId && t.itemId === b.itemId)} communityId={communityId} itemOf={itemOf} compact />
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Ledger" desc="Every gain and use, newest first. Nothing is ever overwritten; corrections are new lines.">
        <div className="mb-3 flex flex-wrap gap-2"><select className={`${input} w-auto`} value={fKind} onChange={(e) => setFKind(e.target.value)}><option value="ALL">All changes</option>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
        <Ledger txs={txs.slice(0, 200)} communityId={communityId} itemOf={itemOf} />
      </Card>

      {itemEdit && <ItemEditor communityId={communityId} item={itemEdit} onClose={() => setItemEdit(null)} onSave={async (it: any) => { try { await (it.id ? api(`/rewards/items/${it.id}`, 'PUT', it) : api('/rewards/items', 'POST', it)); setItemEdit(null); flash(true, 'Item saved.'); load(); } catch (e: any) { flash(false, e.message); } }} />}
    </div>
  );
}

function Ledger({ txs, communityId, itemOf, compact }: any) {
  if (!txs.length) return <p className="text-sm text-slate-500">Nothing yet.</p>;
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {txs.map((t: any) => {
        const it = itemOf(t.itemId);
        const k = KIND[t.kind] || { label: t.kind, cls: '' };
        return (
          <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2">
            <span className={`w-14 text-right font-black ${t.amount > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{t.amount > 0 ? '+' : ''}{t.amount}</span>
            <span className={`text-xs font-bold ${k.cls}`}>{k.label}{t.status !== 'APPROVED' ? ` · ${t.status === 'PENDING' ? 'waiting' : t.status.toLowerCase()}` : ''}</span>
            {!compact && <b><MemberName id={t.memberId} communityId={communityId} fallback={t.memberName} /></b>}
            {!compact && <span>{it.emoji} {it.name}</span>}
            <span className="text-slate-600">{t.kind === 'EARN' || t.kind === 'REVERSAL' ? <>{t.recruitId ? <>recruit <MemberName id={t.recruitId} communityId={communityId} fallback={t.recruitName} /></> : t.ruleName}{t.recruiterCode ? ` · code ${t.recruiterCode}` : ''}{t.note ? ` · ${t.note}` : ''}</> : t.kind === 'CLAIM' ? (t.forEvent || 'used') : t.note}</span>
            <span className="ml-auto text-xs text-slate-400">{t.by !== 'system' ? `${t.by} · ` : ''}{new Date(t.createdAt).toLocaleString()}{t.decidedBy && t.kind === 'CLAIM' && t.decidedBy !== t.by ? ` · ${t.status === 'DENIED' ? 'declined' : 'approved'} by ${t.decidedBy}` : ''}</span>
          </li>
        );
      })}
    </ul>
  );
}

function PanelPoster({ communityId, onPost }: { communityId: string; onPost: (ch: string, ev: string) => void }) {
  const [open, setOpen] = useState(false);
  const [ch, setCh] = useState('');
  const [ev, setEv] = useState('');
  if (!open) return <button className={`${ghost} mt-3 w-full`} onClick={() => setOpen(true)}><Megaphone className="h-4 w-4" />Post “Use” buttons in Discord</button>;
  return (
    <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
      <ChannelSelect communityId={communityId} value={ch} onChange={setCh} placeholder="Channel, e.g. #heist-planning" />
      <input className={input} value={ev} maxLength={60} onChange={(e) => setEv(e.target.value)} placeholder="For which event? e.g. Heist night Friday (optional)" />
      <div className="flex gap-2"><button className={primary} disabled={!ch} onClick={() => { onPost(ch, ev); setOpen(false); }}>Post</button><button className={ghost} onClick={() => setOpen(false)}>Cancel</button></div>
    </div>
  );
}

function RecordUse({ communityId, items, api, done }: any) {
  const [itemId, setItemId] = useState(items[0]?.id || '');
  const [ids, setIds] = useState<string[]>([]);
  const [n, setN] = useState(1);
  const [ev, setEv] = useState('');
  const [key, setKey] = useState(0);
  return (
    <Card title="Record use" desc="After an event, mark who used rewards. Pick several members at once.">
      <div className="space-y-3">
        <select className={input} value={itemId} onChange={(e) => setItemId(e.target.value)}>{items.filter((i: any) => i.active).map((i: any) => <option key={i.id} value={i.id}>{i.emoji} {i.name}</option>)}</select>
        <MultiMemberSelect key={key} communityId={communityId} onChange={setIds} />
        <div className="grid grid-cols-[110px_1fr] gap-2"><input type="number" min={1} className={input} value={n} onChange={(e) => setN(Number(e.target.value))} aria-label="How many each" /><input className={input} value={ev} maxLength={60} onChange={(e) => setEv(e.target.value)} placeholder="Event, e.g. Heist night 14 Nov" /></div>
        <button className={primary} disabled={!ids.length} onClick={async () => {
          try {
            const r: any[] = await api('/rewards/wallet/use', 'POST', { itemId, memberIds: ids, amount: n, forEvent: ev });
            const bad = r.filter((x) => !x.ok);
            done(bad.length ? `Recorded ${r.length - bad.length}. Not recorded: ${bad.map((x) => x.error).join('; ')}` : `Recorded for ${r.length} member${r.length === 1 ? '' : 's'}.`, !bad.length);
            setIds([]); setKey((k) => k + 1);
          } catch (e: any) { done(e.message, false); }
        }}><Minus className="h-4 w-4" />Record use</button>
      </div>
    </Card>
  );
}

function Adjust({ communityId, items, api, done }: any) {
  const [itemId, setItemId] = useState(items[0]?.id || '');
  const [who, setWho] = useState('');
  const [n, setN] = useState(1);
  const [note, setNote] = useState('');
  return (
    <Card title="Add or correct" desc="Give extra (events, giveaways) or fix a mistake with a minus number. A reason is required.">
      <div className="space-y-3">
        <select className={input} value={itemId} onChange={(e) => setItemId(e.target.value)}>{items.map((i: any) => <option key={i.id} value={i.id}>{i.emoji} {i.name}</option>)}</select>
        <MemberSelect communityId={communityId} value={who} onChange={(id) => setWho(id)} placeholder="Search a member" />
        <div className="grid grid-cols-[110px_1fr] gap-2"><input type="number" className={input} value={n} onChange={(e) => setN(Number(e.target.value))} aria-label="Amount" /><input className={input} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Reason" /></div>
        <button className={primary} onClick={async () => { try { await api('/rewards/wallet/adjust', 'POST', { itemId, memberId: who, amount: n, note }); setNote(''); done('Saved.'); } catch (e: any) { done(e.message, false); } }}>Save</button>
      </div>
    </Card>
  );
}

function ItemEditor({ communityId, item, onClose, onSave }: any) {
  const [i, setI] = useState<any>(item);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-8 w-full max-w-lg rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4"><h3 className="text-lg font-bold">{item.id ? 'Edit item' : 'New reward item'}</h3><button onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-slate-400" /></button></div>
        <div className="space-y-4 px-6 py-5">
          <div className="flex gap-2"><input className={`${input} w-20 text-center text-lg`} value={i.emoji} maxLength={16} onChange={(e) => setI({ ...i, emoji: e.target.value })} aria-label="Emoji" /><input className={input} value={i.name} maxLength={60} onChange={(e) => setI({ ...i, name: e.target.value })} placeholder="e.g. Modded Heist" /></div>
          <input className={input} value={i.description} maxLength={300} onChange={(e) => setI({ ...i, description: e.target.value })} placeholder="What it is and how it’s used (shown on the Discord buttons)" />
          <label className="block text-sm font-semibold text-slate-700">When a member uses it<select className={`${input} mt-1`} value={i.claimApproval} onChange={(e) => setI({ ...i, claimApproval: e.target.value })}><option value="AUTO">Take it from their balance at once</option><option value="STAFF">Staff approve each use (held until then)</option></select></label>
          <label className="block text-sm font-semibold text-slate-700">Most at one time <span className="font-normal text-slate-500">· 0 = no limit (staff can always record more)</span><input type="number" min={0} className={`${input} mt-1`} value={i.maxPerClaim} onChange={(e) => setI({ ...i, maxPerClaim: Number(e.target.value) })} /></label>
          <label className="block text-sm font-semibold text-slate-700">Log channel <span className="font-normal text-slate-500">· every gain, use and approval request is posted here</span><div className="mt-1"><ChannelSelect communityId={communityId} value={i.logChannelId || ''} onChange={(id) => setI({ ...i, logChannelId: id })} placeholder="Recruitment log channel" /></div></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={i.active} onChange={(e) => setI({ ...i, active: e.target.checked })} />Members can use it now</label>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4"><button className={ghost} onClick={onClose}>Cancel</button><button className={primary} onClick={() => onSave(i)}>Save</button></div>
      </div>
    </div>
  );
}
