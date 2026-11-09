import React, { useEffect, useState } from 'react';
import { Network, FileSpreadsheet, Calendar, Sparkles, ArrowRight, RefreshCw } from 'lucide-react';
import { SocialCordCard } from './SocialCordCard.js';
import { goTo } from './SetupGuideView.js';

/** Services connected to the bot, with honest status and a working next step for each. */
export const ConnectionCenterView: React.FC<{ communityId: string }> = ({ communityId }) => {
  const [s, setS] = useState<any>(null);
  const [err, setErr] = useState('');
  const load = () => fetch(`/api/v1/communities/${encodeURIComponent(communityId)}/toolkit/integrations`, { credentials: 'include', headers: { 'x-community-id': communityId } })
    .then((r) => r.json()).then((j) => (j.success ? setS(j.data) : setErr(j?.error?.message || 'Could not load status.'))).catch(() => setErr('Could not load status.'));
  useEffect(() => { load(); }, [communityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const Pill = ({ on, onText = 'Connected', offText = 'Not connected' }: { on: boolean; onText?: string; offText?: string }) => (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${on ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{on ? onText : offText}</span>
  );
  const Tile = ({ icon: Icon, tone, title, desc, pill, children }: any) => (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span><div><h3 className="font-bold text-slate-900">{title}</h3><p className="text-sm text-slate-500">{desc}</p></div></div>
        {pill}
      </div>
      <div className="mt-4 flex-1 space-y-1.5 text-sm">{children}</div>
    </div>
  );
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex justify-between gap-3"><span className="text-slate-500">{k}</span><span className="text-right font-semibold text-slate-800">{v}</span></div>;
  const Go = ({ onClick, children }: any) => <button onClick={onClick} className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:underline">{children}<ArrowRight className="h-4 w-4" /></button>;

  return (
    <div className="space-y-6">
      <SocialCordCard communityId={communityId} />
      {err && <p className="text-sm font-semibold text-rose-700">{err}</p>}
      <div className="flex justify-end"><button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-indigo-400"><RefreshCw className="h-4 w-4" />Refresh</button></div>
      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
        <Tile icon={Network} tone="bg-indigo-50 text-indigo-600" title="Discord" desc="The bot’s live connection to this server." pill={<Pill on={!!s?.discord?.connected} />}>
          <Row k="Server" v={s?.discord?.guildName || '—'} />
          <Row k="Server ID" v={<span className="font-mono text-xs">{s?.discord?.guildId || '—'}</span>} />
          <Row k="Members" v={s?.discord?.memberCount?.toLocaleString?.() || '—'} />
          <Row k="Response time" v={s?.discord?.ping != null && s.discord.ping >= 0 ? `${s.discord.ping} ms` : '—'} />
        </Tile>
        <Tile icon={FileSpreadsheet} tone="bg-emerald-50 text-emerald-600" title="Google Sheets" desc="A live record of every application and decision." pill={<Pill on={!!s?.sheets?.connected} />}>
          <p className="text-slate-600">{s?.sheets?.connected ? 'Applications are written to your sheet as they happen.' : 'Set up takes about 2 minutes: copy our script into your sheet and paste its link back.'}</p>
          <Go onClick={() => goTo('recruitment', 'discord')}>{s?.sheets?.connected ? 'Manage sheet' : 'Connect a sheet'}</Go>
        </Tile>
        <Tile icon={Sparkles} tone="bg-violet-50 text-violet-600" title="AI (Gemini)" desc="Interview summaries, quiz drafting and insights." pill={<Pill on={!!s?.ai?.configured} onText="On" offText="Off" />}>
          <p className="text-slate-600">{s?.ai?.configured ? 'AI features are available.' : 'AI features are off because no AI key is set on the bot server.'}</p>
        </Tile>
        <Tile icon={Calendar} tone="bg-rose-50 text-rose-600" title="Google Calendar" desc="Interview invites in your calendar." pill={<Pill on={false} offText="Not available yet" />}>
          <p className="text-slate-600">Not built yet. Interviews are scheduled and announced inside Discord instead.</p>
        </Tile>
      </div>
    </div>
  );
};
export default ConnectionCenterView;
