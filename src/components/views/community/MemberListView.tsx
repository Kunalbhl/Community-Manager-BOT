import React, { useEffect, useState } from 'react';
import { Search, Bot, Clock, Download } from 'lucide-react';
import { RoleSelect } from '../../common/DiscordPickers.js';
import { useApi } from './ServerToolsView.js';

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/** Everyone in the server, live from Discord, with their name in this server. */
export function MemberListView({ communityId }: { communityId: string }) {
  const api = useApi(communityId);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [kind, setKind] = useState<'humans' | 'bots' | 'all'>('humans');
  const [sort, setSort] = useState<'joined' | 'name'>('joined');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setErr('');
      api(`/members?q=${encodeURIComponent(q)}&role=${role}&kind=${kind}&sort=${sort}&page=${page}`).then(setData).catch((e: any) => setErr(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [api, q, role, kind, sort, page]);
  useEffect(() => setPage(1), [q, role, kind, sort]);

  const exportCsv = () => {
    const rows = [['Name in server', 'Username', 'Discord ID', 'Joined', 'Roles'], ...(data?.rows || []).map((m: any) => [m.name, m.username, m.id, m.joinedAt?.slice(0, 10) || '', m.roles.map((r: any) => r.name).join('; ')])];
    const csv = rows.map((r) => r.map((c: string) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `members-page-${page}.csv`;
    a.click();
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-60 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, username or ID" className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm" /></div>
        <div className="w-56"><RoleSelect communityId={communityId} value={role} onChange={setRole} placeholder="Any role" /></div>
        <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="humans">People</option><option value="bots">Bots</option><option value="all">Everyone</option></select>
        <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="joined">Newest first</option><option value="name">Name A–Z</option></select>
        <button onClick={exportCsv} disabled={!data?.rows?.length} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-400 disabled:opacity-50"><Download className="h-4 w-4" />Export</button>
      </div>
      {err && <p className="mt-3 text-sm font-semibold text-rose-700">{err}</p>}
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Member</th><th className="px-4 py-3">Roles</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3">Account created</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {!data ? Array.from({ length: 6 }).map((_, i) => <tr key={i}><td colSpan={4} className="px-4 py-3"><div className="h-6 animate-pulse rounded bg-slate-200/70" /></td></tr>)
              : !data.rows.length ? <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">No members match.</td></tr>
              : data.rows.map((m: any) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3"><div className="flex items-center gap-3">
                    <img src={m.avatar} alt="" className="h-8 w-8 rounded-full" loading="lazy" />
                    <div><div className="flex items-center gap-1.5 font-semibold text-slate-900">{m.name}{m.bot && <Bot className="h-3.5 w-3.5 text-indigo-500" aria-label="Bot" />}{m.timedOut && <Clock className="h-3.5 w-3.5 text-amber-500" aria-label="Timed out" />}</div><div className="text-xs text-slate-500">@{m.username}</div></div>
                  </div></td>
                  <td className="px-4 py-3"><div className="flex max-w-md flex-wrap gap-1">{m.roles.slice(0, 6).map((r: any) => <span key={r.id} className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-semibold" style={r.color !== '#000000' ? { color: r.color, borderColor: `${r.color}55` } : undefined}>{r.name}</span>)}{m.roles.length > 6 && <span className="text-[11px] text-slate-500">+{m.roles.length - 6}</span>}</div></td>
                  <td className="px-4 py-3 text-slate-600">{fmt(m.joinedAt)}</td>
                  <td className="px-4 py-3 text-slate-600">{fmt(m.createdAt)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {data && <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
        <span>{data.total.toLocaleString()} {kind === 'bots' ? 'bots' : 'members'}</span>
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-40">Previous</button>
          <span>Page {data.page} of {data.pages}</span>
          <button disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-40">Next</button>
        </div>
      </div>}
    </div>
  );
}
