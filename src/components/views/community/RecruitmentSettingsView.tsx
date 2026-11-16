import React, { useEffect, useState } from 'react';
import { Save, CheckCircle2, ShieldCheck } from 'lucide-react';
import { ChannelSelect, RoleSelect, useDiscordResources } from '../../common/DiscordPickers.js';
import { EmojiField } from '../../common/EmojiField.js';
import { Plus, Trash2 } from 'lucide-react';
import { TemplateField } from '../../common/TemplateField.js';
import { Card, useApi } from './ServerToolsView.js';

/** Only settings the bot really uses during recruitment. */
const RECORD_VARS = [
  { token: 'recruiterMention', label: '@Recruiter', sample: '@Kunal' },
  { token: 'recruiterName', label: 'Recruiter name', sample: 'Kunal' },
  { token: 'applicantName', label: 'New member', sample: 'Aarav' },
  { token: 'recruiterCode', label: 'Recruiter code', sample: 'KTECH-007' },
  { token: 'successfulRecruitmentCount', label: 'Recruiter’s total', sample: '12' },
];
const chip = (on: boolean) => `rounded-lg border px-3 py-2 text-sm font-semibold transition ${on ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-indigo-300'}`;

export function RecruitmentSettingsView({ communityId }: { communityId: string }) {
  const api = useApi(communityId);
  const headers = { 'Content-Type': 'application/json', 'x-community-id': communityId };
  const [basics, setBasics] = useState<{ applyEnabled: boolean; askRecruiterCode: boolean; codeRequired: boolean } | null>(null);
  const [rec, setRec] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000); };

  useEffect(() => {
    api('').then((d: any) => setBasics({ applyEnabled: !!d.config.recruitment.applyEnabled, askRecruiterCode: !!d.config.recruitment.askRecruiterCode, codeRequired: !!d.config.recruitment.codeRequired })).catch(() => undefined);
    fetch(`/api/v1/communities/${encodeURIComponent(communityId)}/settings`, { credentials: 'include', headers }).then((r) => r.json()).then((j) => setRec(j?.data?.recruitment || {})).catch(() => setRec({}));
  }, [communityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveBasics = (patch: any) => {
    const next = { ...basics!, ...patch };
    setBasics(next);
    api('/recruitment/basics', 'PUT', next).then(() => flash(true, 'Saved.')).catch((e: any) => flash(false, e.message));
  };
  const saveRec = async (patch: any) => {
    const r = await fetch(`/api/v1/communities/${encodeURIComponent(communityId)}/settings`, { method: 'PATCH', credentials: 'include', headers, body: JSON.stringify({ recruitment: patch }) });
    const j = await r.json().catch(() => ({}));
    flash(r.ok && j.success !== false, r.ok ? 'Saved.' : j?.message || 'Could not save.');
  };

  const codeMode = !basics ? 'off' : !basics.askRecruiterCode ? 'off' : basics.codeRequired ? 'required' : 'optional';
  return (
    <div className="space-y-6">
      {msg && <p role="status" className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{msg.ok && <CheckCircle2 className="h-4 w-4" />}{msg.text}</p>}

      <Card title="Apply link (website)" desc="The easiest way in: new people open this link, sign in with Discord, read the rules, take the quiz and answer your questions. When you approve, the bot adds them to the server by itself. No invite or waiting room needed.">
        <ApplyLink communityId={communityId} />
      </Card>

      <Card title="Applications" desc="Whether people can apply right now, and whether they enter a recruiter code.">
        {!basics ? <div className="h-24 animate-pulse rounded-xl bg-slate-200/60" /> : <div className="space-y-5">
          <div>
            <div className="text-sm font-semibold text-slate-700">Accepting applications</div>
            <div className="mt-2 grid max-w-md grid-cols-2 gap-2">
              <button className={chip(basics.applyEnabled)} onClick={() => saveBasics({ applyEnabled: true })}>Open</button>
              <button className={chip(!basics.applyEnabled)} onClick={() => saveBasics({ applyEnabled: false })}>Closed</button>
            </div>
            <p className="mt-1 text-xs text-slate-500">When closed, the Apply button and /apply tell people applications are closed.</p>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-700">Recruiter code on the form</div>
            <div className="mt-2 grid max-w-xl grid-cols-3 gap-2">
              <button className={chip(codeMode === 'off')} onClick={() => saveBasics({ askRecruiterCode: false, codeRequired: false })}>Don’t ask</button>
              <button className={chip(codeMode === 'optional')} onClick={() => saveBasics({ askRecruiterCode: true, codeRequired: false })}>Optional</button>
              <button className={chip(codeMode === 'required')} onClick={() => saveBasics({ askRecruiterCode: true, codeRequired: true })}>Required</button>
            </div>
            <p className="mt-1 text-xs text-slate-500">Required means nobody can apply without a valid, active code. Manage codes in “Recruiters & codes”.</p>
          </div>
        </div>}
      </Card>

      <SourcesCard communityId={communityId} api={api} />

      <Card title="Rules quiz pass mark" desc="The score an applicant needs in the rules quiz. Only staff see the score.">
        {!rec ? <div className="h-16 animate-pulse rounded-xl bg-slate-200/60" /> : (
          <div className="flex max-w-xl items-center gap-4">
            <input type="range" min={0} max={100} step={5} value={rec.screeningThreshold ?? 75} onChange={(e) => setRec({ ...rec, screeningThreshold: Number(e.target.value) })} className="flex-1 accent-indigo-600" aria-label="Pass mark" />
            <span className="w-14 text-right text-lg font-extrabold tabular-nums text-slate-900">{rec.screeningThreshold ?? 75}%</span>
            <button onClick={() => saveRec({ screeningThreshold: rec.screeningThreshold ?? 75 })} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"><Save className="h-4 w-4" />Save</button>
          </div>
        )}
      </Card>

      <Card title="Recruiter credit announcement" desc="When a new member joins with a recruiter’s code, the bot thanks the recruiter in a channel everyone can see."
        right={rec && <button onClick={() => saveRec({ recordEnabled: rec.recordEnabled !== false, recordChannelId: rec.recordChannelId || '', recordTemplate: rec.recordTemplate || '' })} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"><Save className="h-4 w-4" />Save</button>}>
        {!rec ? <div className="h-24 animate-pulse rounded-xl bg-slate-200/60" /> : <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={rec.recordEnabled !== false} onChange={(e) => setRec({ ...rec, recordEnabled: e.target.checked })} />Post the announcement</label>
          {rec.recordEnabled !== false && <>
            <label className="block max-w-md text-sm font-semibold text-slate-700">Channel <span className="font-normal text-slate-500">· a public channel, e.g. #recruiter-records</span>
              <div className="mt-1"><ChannelSelect communityId={communityId} value={rec.recordChannelId || ''} onChange={(id) => setRec({ ...rec, recordChannelId: id })} /></div>
            </label>
            <TemplateField label="Message" value={rec.recordTemplate || ''} onChange={(v) => setRec({ ...rec, recordTemplate: v })} vars={RECORD_VARS} braces="double" rows={3} />
          </>}
        </div>}
      </Card>

      <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <p><b>Always on:</b> every application is checked against your Blacklist (Moderation → Blacklist), and people with an application already in review can’t apply twice.</p>
      </div>
    </div>
  );
}

/** The public apply link, with an optional recruiter code built in. */
function ApplyLink({ communityId }: { communityId: string }) {
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/join/${encodeURIComponent(communityId)}${code ? `?code=${encodeURIComponent(code.toUpperCase())}` : ''}`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input readOnly value={url} className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-700" onFocus={(e) => e.currentTarget.select()} />
        <button className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? 'Copied ✓' : 'Copy'}</button>
        <a href={url} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Open</a>
      </div>
      <label className="flex flex-wrap items-center gap-2 text-sm text-slate-600">Build a link for a recruiter code: <input value={code} onChange={(e) => setCode(e.target.value.replace(/[^\w-]/g, '').slice(0, 32))} placeholder="e.g. KP-007" className="w-40 rounded-lg border border-slate-300 px-2 py-1 font-mono uppercase" /></label>
      <p className="text-xs text-slate-500">Recruiters can also share their own link: <code>/mycode</code> shows it. Turn off Discord’s own “Apply to Join” so people aren’t asked twice.</p>
    </div>
  );
}

/** "How did you find us?": the list applicants pick from, and what each choice changes. */
const SOURCE_PRESETS = [
  { name: 'A friend / recruiter', emoji: '🤝', description: 'Someone in the server invited me', codeMode: 'REQUIRED', detailLabel: '', tag: 'Referral' },
  { name: 'Instagram', emoji: '📸', description: 'I saw a post or reel', codeMode: 'NONE', detailLabel: 'Which post or account?', tag: 'Instagram' },
  { name: 'YouTube', emoji: '▶️', description: 'From a video or stream', codeMode: 'NONE', detailLabel: 'Which channel or video?', tag: 'YouTube' },
  { name: 'In game', emoji: '🎮', description: 'I met you while playing', codeMode: 'OPTIONAL', detailLabel: 'Your in-game name', tag: 'In game' },
  { name: 'Discord server list', emoji: '🔎', description: 'Disboard, top.gg and similar', codeMode: 'NONE', detailLabel: '', tag: 'Server list' },
  { name: 'Other', emoji: '✨', description: '', codeMode: 'OPTIONAL', detailLabel: 'Tell us where', tag: '' },
];
const CODE_MODES = [['INHERIT', 'Use the setting above'], ['NONE', 'Don’t ask'], ['OPTIONAL', 'Optional'], ['REQUIRED', 'Required']];

function SourcesCard({ communityId, api }: { communityId: string; api: any }) {
  const [ask, setAsk] = useState(false);
  const [list, setList] = useState<any[] | null>(null);
  const [msg, setMsg] = useState('');
  const res: any = useDiscordResources(communityId);
  useEffect(() => { api('').then((d: any) => { setAsk(!!d.config.recruitment.askSource); setList(d.config.recruitment.sources || []); }).catch(() => setList([])); }, [api]);
  const up = (i: number, p: any) => setList(list!.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const save = (nextAsk = ask, nextList = list) => { setMsg('Saving…'); api('/recruitment/sources', 'PUT', { askSource: nextAsk, sources: nextList }).then((r: any) => { setList(r.sources); setAsk(r.askSource); setMsg('✓ Saved'); }).catch((e: any) => setMsg(e.message)); };
  if (!list) return <Card title="Where applicants come from"><div className="h-16 animate-pulse rounded-xl bg-slate-200/60" /></Card>;
  return (
    <Card title="Where applicants come from" desc="Ask “How did you find us?” before the form. Each answer can change the form: whether a recruiter code is asked, an extra question, which roles get pinged, and a tag on the application."
      right={<button onClick={() => save()} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"><Save className="h-4 w-4" />Save</button>}>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={ask} onChange={(e) => { setAsk(e.target.checked); save(e.target.checked, list); }} />Ask applicants how they found us (Discord and the apply website)</label>
      {msg && <p className="mt-1 text-xs text-indigo-700">{msg}</p>}
      <div className="mt-4 space-y-3">
        {list.map((x, i) => (
          <div key={x.id || i} className={`rounded-xl border p-3 ${x.enabled === false ? 'border-slate-200 opacity-60' : 'border-slate-200'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <EmojiField communityId={communityId} className="w-16 shrink-0" value={x.emoji || ''} onChange={(v) => up(i, { emoji: v })} />
              <input className="min-w-[160px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Name, e.g. Instagram" value={x.name} maxLength={80} onChange={(e) => up(i, { name: e.target.value })} />
              <input className="min-w-[200px] flex-[2] rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Short hint shown under it (optional)" value={x.description || ''} maxLength={100} onChange={(e) => up(i, { description: e.target.value })} />
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={x.enabled !== false} onChange={(e) => up(i, { enabled: e.target.checked })} />On</label>
              <button type="button" aria-label="Delete" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" onClick={() => setList(list.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-semibold text-slate-600">Recruiter code<select className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" value={x.codeMode || 'INHERIT'} onChange={(e) => up(i, { codeMode: e.target.value })}>{CODE_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label className="text-xs font-semibold text-slate-600">Extra question <span className="font-normal">(optional)</span><input className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" maxLength={45} placeholder="e.g. Which video?" value={x.detailLabel || ''} onChange={(e) => up(i, { detailLabel: e.target.value })} />
                {x.detailLabel && <span className="mt-1 flex items-center gap-1 font-normal"><input type="checkbox" checked={!!x.detailRequired} onChange={(e) => up(i, { detailRequired: e.target.checked })} />Must answer</span>}</label>
              <label className="text-xs font-semibold text-slate-600">Tag on the application<input className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" maxLength={40} placeholder="e.g. Instagram" value={x.tag || ''} onChange={(e) => up(i, { tag: e.target.value })} /></label>
              <div className="text-xs font-semibold text-slate-600">Also ping
                <div className="mt-1 flex flex-wrap gap-1">{(x.pingRoleIds || []).map((id: string) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700">@{res?.roles?.find((r: any) => r.id === id)?.name || 'role'}<button type="button" onClick={() => up(i, { pingRoleIds: x.pingRoleIds.filter((r: string) => r !== id) })}>×</button></span>)}</div>
                <div className="mt-1"><RoleSelect communityId={communityId} value="" exclude={x.pingRoleIds || []} onChange={(id: string) => id && up(i, { pingRoleIds: [...(x.pingRoleIds || []), id] })} placeholder="Add a role" /></div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:bg-slate-50" onClick={() => setList([...list, { name: '', emoji: '', description: '', enabled: true, codeMode: 'INHERIT', detailLabel: '', pingRoleIds: [], tag: '' }])}><Plus className="h-4 w-4" />Add a source</button>
        {SOURCE_PRESETS.filter((p) => !list.some((x) => x.name.toLowerCase() === p.name.toLowerCase())).map((p) => (
          <button key={p.name} type="button" className="rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-600 hover:border-indigo-400" onClick={() => setList([...list, { ...p, enabled: true, pingRoleIds: [] }])}>+ {p.emoji} {p.name}</button>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">In Discord, pressing Apply first shows a menu with these choices, then the form. Changes here apply after you press <b>Save</b> (the checkbox at the top saves at once). The choice shows on the review post and in the application.</p>
    </Card>
  );
}
