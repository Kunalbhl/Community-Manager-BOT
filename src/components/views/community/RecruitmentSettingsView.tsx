import React, { useEffect, useState } from 'react';
import { Save, CheckCircle2, ShieldCheck } from 'lucide-react';
import { ChannelSelect } from '../../common/DiscordPickers.js';
import { TemplateField } from '../../common/TemplateField.js';
import { Card, useApi } from './ServerToolsView.js';

/** Only settings the bot really uses during recruitment. */
const RECORD_VARS = [
  { token: 'recruiterMention', label: '@Recruiter', sample: '@Kunal' },
  { token: 'recruiterName', label: 'Recruiter name', sample: 'Kunal' },
  { token: 'applicantName', label: 'New member', sample: 'Aarav' },
  { token: 'recruiterCode', label: 'Recruiter code', sample: 'BHARAT-007' },
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
