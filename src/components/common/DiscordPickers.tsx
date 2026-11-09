import React, { useEffect, useState } from 'react';
import { MemberPick, MemberOpt } from '../views/community/ServerToolsView.js';

/**
 * Pick channels, roles and members straight from the Discord server (no typing names or IDs).
 * Resources are loaded once per server and shared by every picker on the page.
 */
interface Opt { id: string; name: string }
interface Res { roles: Opt[]; textChannels: Opt[]; categories: Opt[]; voiceChannels?: Opt[]; emojis?: { id: string; name: string; animated: boolean; url: string }[]; botNickname?: string; botName?: string }

const cache = new Map<string, Promise<Res>>();

export function currentCommunityId(): string {
  try { return localStorage.getItem('selected_community_id') || ''; } catch { return ''; }
}

export function useDiscordResources(communityId?: string): Res | null {
  const id = communityId || currentCommunityId();
  const [res, setRes] = useState<Res | null>(null);
  useEffect(() => {
    if (!id) return;
    if (!cache.has(id)) {
      cache.set(id, fetch(`/api/v1/communities/${encodeURIComponent(id)}/toolkit`, { credentials: 'include', headers: { 'x-community-id': id } })
        .then((r) => r.json()).then((j) => j?.data?.resources || { roles: [], textChannels: [], categories: [] })
        .catch(() => { cache.delete(id); return { roles: [], textChannels: [], categories: [] }; }));
    }
    let alive = true;
    cache.get(id)!.then((r) => alive && setRes(r));
    return () => { alive = false; };
  }, [id]);
  return res;
}

/** Compare names the way people read them: ignore emojis, separators, case and a leading # or @. */
export function normName(n: string): string {
  return String(n || '').toLowerCase().replace(/^[#@]/, '').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');
}

/** If a stored name/ID isn't an exact match, find the channel/role it obviously means and switch to it. */
function useAutoMatch<T extends Opt>(list: T[], cur: string, toVal: (o: T) => string, onChange: (v: string) => void, loaded: boolean) {
  const exact = list.some((o) => toVal(o) === cur);
  const match = !exact && cur ? list.find((o) => o.id === cur) || list.find((o) => normName(o.name) === normName(cur)) : undefined;
  useEffect(() => { if (loaded && match) onChange(toVal(match)); }, [loaded, match?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return exact || !!match;
}

const base = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

/** Value can be the channel ID (default) or its name ("#name" / "name"), for older settings that store names. */
export function ChannelSelect({ value, onChange, valueType = 'id', placeholder = 'Choose a channel', communityId, className = '', kind = 'text', exclude = [] }: {
  value?: string; onChange: (v: string) => void; valueType?: 'id' | 'name' | 'hashName'; placeholder?: string; communityId?: string; className?: string; kind?: 'text' | 'category'; exclude?: string[];
}) {
  const res = useDiscordResources(communityId);
  const list = ((kind === 'category' ? res?.categories : res?.textChannels) || []).filter((c) => !exclude.includes(c.id));
  const toVal = (o: Opt) => (valueType === 'id' ? o.id : valueType === 'hashName' ? `#${o.name}` : o.name);
  const cur = String(value || '');
  const known = useAutoMatch(list, cur, toVal, onChange, !!res);
  return (
    <select className={`${base} ${className}`} value={cur} onChange={(e) => onChange(e.target.value)}>
      <option value="">{res ? placeholder : 'Loading channels…'}</option>
      {cur && !known && res && <option value={cur}>{/^\d+$/.test(cur) ? 'A deleted channel' : cur} (no longer in the server, pick another)</option>}
      {list.map((o) => <option key={o.id} value={toVal(o)}>{kind === 'category' ? '' : '#'}{o.name}</option>)}
    </select>
  );
}

export function RoleSelect({ value, onChange, valueType = 'id', placeholder = 'Choose a role', communityId, className = '', exclude = [] }: {
  value?: string; onChange: (v: string) => void; valueType?: 'id' | 'name' | 'atName'; placeholder?: string; communityId?: string; className?: string; exclude?: string[];
}) {
  const res = useDiscordResources(communityId);
  const list = (res?.roles || []).filter((r) => !exclude.includes(r.id) || r.id === value);
  const toVal = (o: Opt) => (valueType === 'id' ? o.id : valueType === 'atName' ? `@${o.name}` : o.name);
  const cur = String(value || '');
  const known = useAutoMatch(list, cur, toVal, onChange, !!res);
  return (
    <select className={`${base} ${className}`} value={cur} onChange={(e) => onChange(e.target.value)}>
      <option value="">{res ? placeholder : 'Loading roles…'}</option>
      {cur && !known && res && <option value={cur}>{/^\d+$/.test(cur) ? 'A deleted role' : cur} (no longer in the server, pick another)</option>}
      {list.map((o) => <option key={o.id} value={toVal(o)}>@{o.name}</option>)}
    </select>
  );
}

/** Member search; returns the Discord user ID (and optional username). */
export function MemberSelect({ value, onChange, communityId, placeholder }: { value?: string; onChange: (id: string, m?: MemberOpt | null) => void; communityId?: string; placeholder?: string }) {
  const id = communityId || currentCommunityId();
  const [picked, setPicked] = useState<MemberOpt | null>(null);
  useEffect(() => {
    if (!value) { setPicked(null); return; }
    if (picked?.id === value || !/^\d{15,21}$/.test(value) || !id) return;
    fetch(`/api/v1/communities/${encodeURIComponent(id)}/discord/member-search?q=${value}`, { credentials: 'include', headers: { 'x-community-id': id } })
      .then((r) => r.json()).then((j) => { if (j?.data?.[0]) setPicked(j.data[0]); }).catch(() => undefined);
  }, [value, id]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = picked && picked.id === value ? picked : value ? { id: value, name: value, username: value } : null;
  return <MemberPick communityId={id} value={shown} placeholder={placeholder} onChange={(m) => { setPicked(m); onChange(m?.id || '', m); }} />;
}

/** Several members; returns their Discord user IDs. */
export function MultiMemberSelect({ onChange, communityId }: { onChange: (ids: string[]) => void; communityId?: string }) {
  const [list, setList] = useState<MemberOpt[]>([]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {list.map((m) => (
          <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
            {m.name}
            <button type="button" aria-label="Remove" onClick={() => { const n = list.filter((x) => x.id !== m.id); setList(n); onChange(n.map((x) => x.id)); }}>×</button>
          </span>
        ))}
        {!list.length && <span className="text-xs text-slate-400">No members picked</span>}
      </div>
      <MemberPick communityId={communityId || currentCommunityId()} value={null} placeholder="Search and add members"
        onChange={(m) => { if (m && !list.some((x) => x.id === m.id)) { const n = [...list, m]; setList(n); onChange(n.map((x) => x.id)); } }} />
    </div>
  );
}
