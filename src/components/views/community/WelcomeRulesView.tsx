import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Save } from 'lucide-react';
import { ChannelSelect, RoleSelect, useDiscordResources } from '../../common/DiscordPickers.js';
import { TemplateField } from '../../common/TemplateField.js';
import { RulesCard, useApi, Card } from './ServerToolsView.js';

/** Variables the welcome messages understand (filled in when a new member joins). */
const WELCOME_VARS = [
  { token: 'member', label: '@New member', sample: '@Aarav' },
  { token: 'memberName', label: 'Member name', sample: 'Aarav' },
  { token: 'communityName', label: 'Server name', sample: 'Bharat Esports' },
  { token: 'memberCount', label: 'Member count', sample: '1,248' },
  { token: 'recruiter', label: '@Recruiter', sample: '@Kunal' },
  { token: 'recruiterName', label: 'Recruiter name', sample: 'Kunal' },
  { token: 'recruiterCode', label: 'Recruiter code', sample: 'BHARAT-07' },
];

const Toggle = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
    className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-indigo-600' : 'bg-slate-300'}`}>
    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${on ? 'left-[22px]' : 'left-0.5'}`} />
  </button>
);

function Row({ title, hint, on, onToggle, children }: { title: string; hint: string; on: boolean; onToggle: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-4">
        <div><div className="font-bold text-slate-900">{title}</div><p className="text-sm text-slate-500">{hint}</p></div>
        <Toggle on={on} onChange={onToggle} label={title} />
      </div>
      {on && children && <div className="mt-4 space-y-3">{children}</div>}
    </div>
  );
}

/**
 * Welcome & rules: what a new member sees when they join after approval, and the one rules list
 * used by the apply flow and the rules quiz.
 */
export function WelcomeRulesView({ communityId }: { communityId: string }) {
  const toolkitApi = useApi(communityId);
  const res: any = useDiscordResources(communityId);
  const [cfg, setCfg] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const url = `/api/v1/community/welcome-config?communityId=${encodeURIComponent(communityId)}`;

  const load = useCallback(() => fetch(url, { credentials: 'include', headers: { 'x-community-id': communityId } })
    .then((r) => r.json()).then((j) => setCfg(j.data || {})).catch(() => setCfg({})), [url, communityId]);
  useEffect(() => { load(); }, [load]);

  const set = (patch: any) => setCfg((c: any) => ({ ...c, ...patch }));
  const save = async () => {
    const r = await fetch(url, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-community-id': communityId }, body: JSON.stringify({ ...cfg, communityId }) });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: j?.message || j?.error?.message || 'Could not save.' });
    setTimeout(() => setMsg(null), 4000);
  };

  if (!cfg) return <div className="h-64 animate-pulse rounded-2xl bg-slate-200/60" />;
  return (
    <div className="space-y-6">
      <Card title="Welcome new members" desc="Runs when an approved applicant joins your server. Use variables and mentions; the preview shows what they will see."
        right={<button onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"><Save className="h-4 w-4" />Save</button>}>
        {msg && <p className={`mb-3 flex items-center gap-2 text-sm font-semibold ${msg.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{msg.ok && <CheckCircle2 className="h-4 w-4" />}{msg.text}</p>}
        <div className="space-y-3">
          <Row title="Post a welcome in a channel" hint="Everyone sees it, so the server can greet the new member." on={!!cfg.enableServerWelcome} onToggle={(v) => set({ enableServerWelcome: v })}>
            <label className="block text-sm font-semibold text-slate-700">Channel <span className="font-normal text-slate-500">· where the welcome is posted, usually #welcome or #general</span>
              <div className="mt-1"><ChannelSelect communityId={communityId} value={cfg.welcomeChannelId || ''} onChange={(id) => set({ welcomeChannelId: id, welcomeChannelNameSnapshot: res?.textChannels?.find((c: any) => c.id === id)?.name })} /></div>
            </label>
            <TemplateField label="Message" value={cfg.serverWelcomeMessage || ''} onChange={(v) => set({ serverWelcomeMessage: v })} vars={WELCOME_VARS} braces="double" rows={3} />
          </Row>
          <Row title="Send a private welcome (DM)" hint="Only the new member sees it. Good for first steps and useful links." on={!!cfg.enablePersonalDm} onToggle={(v) => set({ enablePersonalDm: v })}>
            <TemplateField label="Message" value={cfg.personalWelcomeMessage || ''} onChange={(v) => set({ personalWelcomeMessage: v })} vars={WELCOME_VARS} braces="double" rows={3} />
          </Row>
          <Row title="Give a role when they join" hint="For example a Member role, so they can see the server." on={!!cfg.enableAutoRoleAssignment} onToggle={(v) => set({ enableAutoRoleAssignment: v })}>
            <label className="block text-sm font-semibold text-slate-700">Role
              <div className="mt-1"><RoleSelect communityId={communityId} value={cfg.newMemberRoleId || ''} onChange={(id) => set({ newMemberRoleId: id, newMemberRoleNameSnapshot: res?.roles?.find((r: any) => r.id === id)?.name })} /></div>
            </label>
          </Row>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="font-bold text-slate-900">Rules channel</div>
            <p className="text-sm text-slate-500">The channel where your rules are posted. Discord servers rarely have a website, so the bot links this channel instead of a web page.</p>
            <div className="mt-3 max-w-md"><ChannelSelect communityId={communityId} value={cfg.rulesChannelId || ''} onChange={(id) => set({ rulesChannelId: id })} placeholder="Choose your rules channel" /></div>
          </div>
        </div>
      </Card>
      {res && <RulesCard api={toolkitApi} res={res} />}
    </div>
  );
}
