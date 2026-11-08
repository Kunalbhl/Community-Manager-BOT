import React, { useCallback, useEffect, useState } from 'react';
import { Crown, ShieldCheck, Mic, Radar, Plus, RotateCcw, Save, Link2, Sparkles, Info } from 'lucide-react';
import { RoleSelect, MemberSelect } from '../../common/DiscordPickers.js';

const ICON: Record<string, any> = { OWNER: Crown, CONTROLLER: ShieldCheck, INTERVIEWER: Mic, RECRUITER: Radar };
const ABOUT: Record<string, string> = {
  OWNER: 'Full access to everything. Discord roles with Administrator are included automatically.',
  CONTROLLER: 'Runs day-to-day operations: reviews, settings, staff and moderation.',
  INTERVIEWER: 'Holds interviews and records outcomes. Sees applications they work on.',
  RECRUITER: 'Brings people in with their code and follows their referrals.',
};

/** Human labels for permissions, grouped by area. */
const GROUPS: [string, [string, string][]][] = [
  ['Overview', [['community.view', 'Open the dashboard'], ['community.manage', 'Manage the server workspace'], ['reports.view', 'See reports'], ['reports.export', 'Export reports'], ['auditLogs.view', 'See the audit log']]],
  ['Applications', [['applications.view', 'See applications'], ['applications.review', 'Review and comment'], ['applications.approve', 'Approve'], ['applications.reject', 'Reject']]],
  ['Interviews', [['interviews.view', 'See interviews'], ['interviews.manage', 'Schedule and run interviews']]],
  ['Recruiters', [['recruiters.view', 'See recruiters'], ['recruiters.manage', 'Manage recruiters'], ['recruiterCodes.view', 'See codes'], ['recruiterCodes.create', 'Create codes'], ['recruiterCodes.revoke', 'Revoke codes'], ['rewards.view', 'See rewards'], ['rewards.manage', 'Manage rewards']]],
  ['Members & team', [['users.view', 'See members'], ['users.manage', 'Manage members']]],
  ['Settings & AI', [['settings.view', 'See settings'], ['settings.manage', 'Change settings'], ['notifications.view', 'See notifications'], ['notifications.manage', 'Manage notifications'], ['ai.view', 'Use Community Brain'], ['ai.manage', 'Manage Community Brain']]],
];

const card = 'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm';
const btn = 'inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50';
const ghost = 'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

export function TeamAccessView({ communityId, canEdit }: { communityId: string; canEdit: boolean }) {
  const [d, setD] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const api = useCallback(async (path: string, method = 'GET', body?: unknown) => {
    const r = await fetch(`/api/v1/communities/${encodeURIComponent(communityId)}/team${path}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-community-id': communityId }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) throw new Error(j?.error?.message || 'Something went wrong.');
    return j.data;
  }, [communityId]);
  const load = useCallback(() => api('').then(setD).catch((e) => setMsg(e.message)), [api]);
  useEffect(() => { load(); }, [load]);
  const act = async (fn: () => Promise<any>, ok: string) => { setMsg(''); try { await fn(); setMsg(ok); await load(); } catch (e: any) { setMsg(e.message); } };

  if (!d) return <div className="h-96 animate-pulse rounded-3xl bg-slate-100">{msg && <p className="p-6 text-rose-600">{msg}</p>}</div>;
  const count = (role: string) => d.people.filter((p: any) => p.role === role).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Team & access</h1>
        <p className="mt-1 text-slate-500">Who can use the dashboard, and what each role can see and do. Changes sync with Discord roles.</p>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm text-slate-700">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
        <div>
          <b>Server owner and Discord Administrators</b> always have full access. <b>Members and applicants never need to log in</b>: applicants use Discord only, and their temporary applicant role ends when they are approved.
          Link each dashboard role to a Discord role; anyone with that Discord role gets the dashboard role automatically.
        </div>
      </div>
      {msg && <p className="text-sm font-medium text-slate-700">{msg}</p>}
      {!d.botCanManageRoles && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">The bot needs <b>Manage Roles</b> to create roles and keep them in sync.</p>}

      <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-4">
        {d.roles.map((r: any) => <RoleCard key={r.role} r={r} people={count(r.role)} canEdit={canEdit} api={api} act={act} />)}
      </div>

      <TeamList d={d} canEdit={canEdit} communityId={communityId} act={act} api={api} />
    </div>
  );
}

function RoleCard({ r, people, canEdit, api, act }: any) {
  const [perms, setPerms] = useState<string[]>(r.permissions);
  useEffect(() => setPerms(r.permissions), [r.permissions]);
  const I = ICON[r.role];
  const changed = perms.slice().sort().join() !== r.permissions.slice().sort().join();
  const isTemplate = r.permissions.slice().sort().join() === r.template.slice().sort().join();
  return (
    <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><I className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><h2 className="text-lg font-bold text-slate-900">{r.label}</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{people} {people === 1 ? 'person' : 'people'}</span></div>
          <p className="text-sm text-slate-500">{ABOUT[r.role]}</p>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500"><Link2 className="h-3.5 w-3.5" /> Linked Discord roles</div>
        <div className="flex flex-wrap gap-1.5">
          {r.discordRoles.map((dr: any) => (
            <span key={dr.id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
              @{dr.name}{dr.auto && <span className="rounded bg-white/70 px-1 text-[10px] text-indigo-500">auto</span>}
              {canEdit && !dr.auto && <button aria-label="Remove" onClick={() => act(() => api('/link-role', 'POST', { role: r.role, discordRoleIds: r.discordRoles.filter((x: any) => x.id !== dr.id && !x.auto).map((x: any) => x.id) }), 'Role unlinked.')}>×</button>}
            </span>
          ))}
          {!r.discordRoles.length && <span className="text-xs text-slate-400">No Discord role linked yet</span>}
        </div>
        {canEdit && (
          <div className="mt-2 flex gap-2">
            <div className="flex-1"><RoleSelect value="" placeholder="Add a Discord role" onChange={(v) => v && act(() => api('/link-role', 'POST', { role: r.role, discordRoleIds: [...r.discordRoles.filter((x: any) => !x.auto).map((x: any) => x.id), v] }), 'Role linked.')} /></div>
            {!r.fixed && !r.discordRoles.length && <button className={ghost} onClick={() => act(() => api('/link-role', 'POST', { role: r.role, discordRoleIds: [], create: true }), `Created @${r.label} in Discord and linked it.`)}><Plus className="h-4 w-4" /> Create</button>}
          </div>
        )}
        {r.linkBroken && <p className="mt-1 text-xs text-rose-600">A linked Discord role was deleted.</p>}
      </div>

      <div className="mt-5 flex-1">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Permissions · {perms.length}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.fixed ? 'bg-slate-100 text-slate-600' : isTemplate ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{r.fixed ? 'Everything' : isTemplate ? 'Template' : 'Customised'}</span>
        </div>
        <div className="max-h-80 space-y-3 overflow-auto pr-1">
          {GROUPS.map(([g, items]) => (
            <div key={g}>
              <div className="text-xs font-semibold text-slate-400">{g}</div>
              <div className="mt-1 grid gap-1">
                {items.map(([k, l]) => (
                  <label key={k} className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm ${canEdit && k !== 'community.view' ? 'cursor-pointer hover:bg-slate-50' : ''}`}>
                    <input type="checkbox" disabled={!canEdit || r.fixed || k === 'community.view'} checked={perms.includes(k)} onChange={(e) => setPerms(e.target.checked ? [...perms, k] : perms.filter((p) => p !== k))} />
                    <span className={perms.includes(k) ? 'text-slate-900' : 'text-slate-400'}>{l}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {canEdit && !r.fixed && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button className={btn} disabled={!changed} onClick={() => act(() => api('/permissions', 'POST', { role: r.role, permissions: perms }), `${r.label} permissions saved.`)}><Save className="h-4 w-4" /> Save</button>
          <button className={ghost} disabled={isTemplate && !changed} onClick={() => act(() => api('/permissions', 'POST', { role: r.role, reset: true }), `${r.label} reset to template.`)}><RotateCcw className="h-4 w-4" /> Reset to template</button>
        </div>
      )}
    </section>
  );
}

function TeamList({ d, canEdit, communityId, act, api }: any) {
  const [who, setWho] = useState('');
  const [role, setRole] = useState('INTERVIEWER');
  const badge: Record<string, string> = { OWNER: 'bg-amber-50 text-amber-800', CONTROLLER: 'bg-indigo-50 text-indigo-700', INTERVIEWER: 'bg-sky-50 text-sky-700', RECRUITER: 'bg-emerald-50 text-emerald-700' };
  return (
    <section className={card}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h2 className="text-lg font-bold text-slate-900">People with dashboard access · {d.people.length}</h2><p className="text-sm text-slate-500">Giving someone a role here also gives them the linked Discord role.</p></div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-64"><MemberSelect communityId={communityId} value={who} onChange={(id) => setWho(id)} placeholder="Search a member" /></div>
            <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="CONTROLLER">Controller</option><option value="INTERVIEWER">Interviewer</option><option value="RECRUITER">Recruiter</option>
            </select>
            <button className={btn} disabled={!who} onClick={() => act(() => api('/member', 'POST', { discordUserId: who, role }), 'Access given.').then(() => setWho(''))}><Sparkles className="h-4 w-4" /> Give access</button>
          </div>
        )}
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead><tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-400"><th className="py-2">Member</th><th>Role</th><th>Why they have access</th><th className="text-right">Change</th></tr></thead>
          <tbody>
            {d.people.map((p: any) => (
              <tr key={p.discordUserId} className="border-b border-slate-50">
                <td className="py-3"><div className="flex items-center gap-3">{p.avatar ? <img src={p.avatar} alt="" className="h-8 w-8 rounded-full" /> : <div className="h-8 w-8 rounded-full bg-slate-200" />}<div><div className="font-semibold text-slate-900">{p.name}</div><div className="text-xs text-slate-500">{p.username ? `@${p.username}` : p.discordUserId}{!p.inServer ? ' · not in server' : ''}</div></div></div></td>
                <td><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge[p.role]}`}>{p.role === 'OWNER' ? 'Owner' : p.role.charAt(0) + p.role.slice(1).toLowerCase()}</span></td>
                <td className="text-slate-500">{p.sources.join(' · ')}</td>
                <td className="text-right">
                  {p.role === 'OWNER' || !canEdit ? <span className="text-xs text-slate-400">{p.role === 'OWNER' ? 'Full access' : '—'}</span> : (
                    <select className="rounded-lg border border-slate-300 px-2 py-1 text-sm" value={p.role} onChange={(e) => act(() => api('/member', 'POST', { discordUserId: p.discordUserId, role: e.target.value || null }), e.target.value ? 'Role changed.' : 'Access removed.')}>
                      <option value="CONTROLLER">Controller</option><option value="INTERVIEWER">Interviewer</option><option value="RECRUITER">Recruiter</option><option value="">Remove access</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
