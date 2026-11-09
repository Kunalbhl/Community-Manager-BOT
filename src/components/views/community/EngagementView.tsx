import React, { useCallback, useEffect, useState } from 'react';
import { Megaphone, Repeat, Clock, BarChart3, FileText, Trash2, Pause, Play, Pencil, Copy, Info, Send, CheckCircle2 } from 'lucide-react';
import { ChannelSelect, RoleSelect, MemberSelect, MultiMemberSelect, useDiscordResources } from '../../common/DiscordPickers.js';
import { MessageComposer } from '../../common/MessageComposer.js';

interface EngagementViewProps { communityId: string; initialTab?: Tab; only?: Tab }
export type Tab = 'announcements' | 'campaigns' | 'reminders' | 'polls' | 'templates';

const card = 'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm';
const label = 'block text-xs font-bold uppercase tracking-wide text-slate-600';
const input = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20';
const primary = 'inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:from-indigo-600 hover:to-indigo-700 disabled:opacity-50';
const chip = (on: boolean) => `rounded-lg border px-3 py-2 text-sm font-semibold transition ${on ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600 hover:border-indigo-300'}`;

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const STATUS: Record<string, string> = {
  SENT: 'bg-emerald-50 text-emerald-700', COMPLETED: 'bg-emerald-50 text-emerald-700', ACTIVE: 'bg-sky-50 text-sky-700',
  SCHEDULED: 'bg-amber-50 text-amber-700', PENDING: 'bg-amber-50 text-amber-700', PROCESSING: 'bg-sky-50 text-sky-700',
  PAUSED: 'bg-slate-100 text-slate-600', CLOSED: 'bg-slate-100 text-slate-600', FAILED: 'bg-rose-50 text-rose-700', CANCELLED: 'bg-slate-100 text-slate-600',
};
const Badge = ({ s }: { s: string }) => <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS[s] || 'bg-slate-100 text-slate-600'}`}>{s.charAt(0) + s.slice(1).toLowerCase()}</span>;

export const EngagementView: React.FC<EngagementViewProps> = ({ communityId, initialTab = 'announcements', only }) => {
  const [tab, setTab] = useState<Tab>(only || initialTab);
  const [data, setData] = useState<{ announcements: any[]; campaigns: any[]; reminders: any[]; polls: any[]; templates: any[] }>({ announcements: [], campaigns: [], reminders: [], polls: [], templates: [] });
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const res: any = useDiscordResources(communityId);
  const chanName = (id: string) => res?.textChannels?.find((c: any) => c.id === id)?.name;
  const roleName = (id: string) => res?.roles?.find((r: any) => r.id === id)?.name;

  const api = useCallback(async (path: string, method = 'GET', body?: any) => {
    const r = await fetch(`/api/v1/engagement/${path}${path.includes('?') ? '&' : '?'}communityId=${encodeURIComponent(communityId)}`, {
      method, credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-community-id': communityId }, body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) throw new Error(j?.message || j?.error?.message || 'Something went wrong.');
    return j;
  }, [communityId]);

  const load = useCallback(async () => {
    const keys = ['announcements', 'campaigns', 'reminders', 'polls', 'templates'] as const;
    const out: any = {};
    await Promise.all(keys.map((k) => api(k).then((j) => { out[k] = j[k] || []; }).catch(() => { out[k] = []; })));
    setData(out);
  }, [api]);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const run = async (fn: () => Promise<any>, okText: string, after?: () => void) => {
    setBusy(true);
    try { await fn(); setToast({ ok: true, text: okText }); after?.(); load(); } catch (e: any) { setToast({ ok: false, text: e.message }); }
    finally { setBusy(false); setTimeout(() => setToast(null), 5000); }
  };

  const TABS: { id: Tab; label: string; icon: any; tone: string }[] = [
    { id: 'announcements', label: 'Announcements', icon: Megaphone, tone: 'text-orange-500' },
    { id: 'campaigns', label: 'Campaigns', icon: Repeat, tone: 'text-pink-500' },
    { id: 'reminders', label: 'Reminders', icon: Clock, tone: 'text-teal-500' },
    { id: 'polls', label: 'Polls', icon: BarChart3, tone: 'text-violet-500' },
    { id: 'templates', label: 'Message templates', icon: FileText, tone: 'text-sky-500' },
  ];

  return (
    <div className="mx-auto max-w-[min(100%,2000px)] space-y-6">
      <div className={only ? 'hidden' : ''}>
        <h1 className="text-3xl font-extrabold text-slate-900">Engagement</h1>
        <p className="mt-1 text-slate-600">Announcements, repeating campaigns, reminders and native Discord polls. Everything is posted by the bot in your server.</p>
      </div>

      <div className={`${only ? 'hidden' : 'flex'} flex-wrap gap-1 border-b border-slate-200`}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            <t.icon className={`h-4 w-4 ${t.tone}`} />{t.label}
          </button>
        ))}
      </div>

      {toast && (
        <div role="status" className={`rounded-xl border px-4 py-3 text-sm font-semibold ${toast.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{toast.text}</div>
      )}

      {tab === 'announcements' && <Announcements {...{ communityId, data: data.announcements, run, api, busy, chanName }} />}
      {tab === 'campaigns' && <Campaigns {...{ communityId, data: data.campaigns, run, api, busy, chanName, roleName }} />}
      {tab === 'reminders' && <Reminders {...{ communityId, data: data.reminders, run, api, busy, chanName }} />}
      {tab === 'polls' && <Polls {...{ communityId, data: data.polls, run, api, busy, chanName }} />}
      {tab === 'templates' && <Templates {...{ communityId, data: data.templates, run, api, busy }} />}
    </div>
  );
};

type P = { communityId: string; data: any[]; run: (fn: () => Promise<any>, ok: string, after?: () => void) => void; api: any; busy: boolean; chanName?: (id: string) => string | undefined; roleName?: (id: string) => string | undefined };

function Layout({ form, list, listTitle, listDesc }: { form: React.ReactNode; list: React.ReactNode; listTitle: string; listDesc: string }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className={card}>{form}</div>
      <div className={card}>
        <h2 className="text-lg font-bold text-slate-900">{listTitle}</h2>
        <p className="text-sm text-slate-500">{listDesc}</p>
        <div className="mt-4 space-y-3">{list}</div>
      </div>
    </div>
  );
}
const Empty = ({ text }: { text: string }) => <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">{text}</div>;
const Head = ({ icon: Icon, tone, title, desc }: any) => (
  <div className="mb-5 flex items-start gap-3">
    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
    <div><h2 className="text-lg font-bold text-slate-900">{title}</h2><p className="text-sm text-slate-500">{desc}</p></div>
  </div>
);

/* ---------------- Announcements ---------------- */
function Announcements({ communityId, data, run, api, busy, chanName }: P) {
  const [title, setTitle] = useState('');
  const [channelId, setChannelId] = useState('');
  const [content, setContent] = useState('');
  const [at, setAt] = useState('');
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => api('announcements', 'POST', { title, content, channelId, scheduledAt: at ? new Date(at).toISOString() : undefined }),
      at ? 'Announcement scheduled.' : 'Announcement sent to Discord.', () => { setTitle(''); setContent(''); setAt(''); });
  };
  return (
    <Layout listTitle="Announcement log" listDesc="Sent and scheduled announcements."
      form={<form onSubmit={submit} className="space-y-4">
        <Head icon={Megaphone} tone="bg-orange-50 text-orange-600" title="Send an announcement" desc="The bot posts this message in the channel you pick." />
        <label className={label}>Title (for your log)<input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Server update" required /></label>
        <label className={label}>Channel<div className="mt-1"><ChannelSelect communityId={communityId} value={channelId} onChange={setChannelId} /></div></label>
        <div><span className={label}>Message</span><div className="mt-1"><MessageComposer communityId={communityId} value={content} onChange={setContent} placeholder="Write your announcement…" defaultCategory="Announcement" /></div></div>
        <label className={label}>Send later (optional)<input type="datetime-local" className={input} value={at} onChange={(e) => setAt(e.target.value)} /><span className="mt-1 block text-xs font-normal normal-case text-slate-500">Leave empty to send now.</span></label>
        <button className={primary} disabled={busy || !channelId || !content.trim()}><Send className="h-4 w-4" />{at ? 'Schedule announcement' : 'Send to Discord now'}</button>
      </form>}
      list={!data.length ? <Empty text="No announcements yet." /> : data.map((a) => (
        <div key={a.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-2"><span className="font-bold text-slate-900">{a.title}</span><Badge s={a.status} /></div>
          <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-slate-600">{a.content}</p>
          <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>#{chanName?.(a.channelId) || 'channel'}</span><span>{a.status === 'SCHEDULED' ? `Sends ${when(a.scheduledAt)}` : when(a.createdAt)}</span></div>
          {a.status === 'SCHEDULED' && <button className="mt-2 text-xs font-semibold text-rose-600 hover:underline" onClick={() => run(() => api(`announcements/${a.id}/cancel`, 'POST'), 'Announcement cancelled.')}>Cancel</button>}
        </div>
      ))} />
  );
}

/* ---------------- Campaigns ---------------- */
const FREQ = [
  { v: 'ONCE', l: 'One time' }, { v: 'HOURLY', l: 'Hours' }, { v: 'DAILY', l: 'Days' }, { v: 'WEEKLY', l: 'Weeks' }, { v: 'MONTHLY', l: 'Months' },
];
function describeFreq(c: any) {
  if (!c.frequency || c.frequency === 'ONCE') return 'One time';
  const n = c.interval || 1;
  const unit = { HOURLY: 'hour', DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month' }[c.frequency as string] || '';
  return `Every ${n > 1 ? `${n} ${unit}s` : unit}`;
}
function Campaigns({ communityId, data, run, api, busy, chanName, roleName }: P) {
  const [name, setName] = useState('');
  const [where, setWhere] = useState<'CHANNEL' | 'ROLE' | 'MEMBERS' | 'ALL'>('CHANNEL');
  const [channelId, setChannelId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [freq, setFreq] = useState('ONCE');
  const [interval, setInterval] = useState(1);
  const [startAt, setStartAt] = useState('');
  const [ends, setEnds] = useState<'never' | 'date' | 'count'>('never');
  const [endAt, setEndAt] = useState('');
  const [maxRuns, setMaxRuns] = useState(4);
  const ready = name && message.trim() && (where === 'CHANNEL' ? channelId : where === 'ROLE' ? roleId : where === 'MEMBERS' ? memberIds.length : true);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => api('campaigns', 'POST', {
      name, message, targetAudience: where, channelId, roleId, memberIds, frequency: freq, interval,
      startAt: startAt ? new Date(startAt).toISOString() : undefined,
      endAt: freq !== 'ONCE' && ends === 'date' && endAt ? new Date(endAt).toISOString() : undefined,
      maxRuns: freq !== 'ONCE' && ends === 'count' ? maxRuns : undefined,
    }), startAt || freq !== 'ONCE' ? 'Campaign scheduled.' : 'Campaign is sending now.', () => { setName(''); setMessage(''); });
  };
  const target = (c: any) => c.targetAudience === 'CHANNEL' ? `Posts in #${chanName?.(c.channelId) || 'channel'}`
    : c.targetAudience === 'ROLE' ? `DMs everyone with @${roleName?.(c.roleId) || 'role'}` : c.targetAudience === 'MEMBERS' ? `DMs ${c.memberIds?.length || 0} picked members` : 'DMs every member';
  return (
    <Layout listTitle="Your campaigns" listDesc="Status, next run and delivery count. Pause, resume or delete any time."
      form={<form onSubmit={submit} className="space-y-4">
        <Head icon={Repeat} tone="bg-pink-50 text-pink-600" title="Create a campaign" desc="A message the bot sends once or on a repeat schedule, like a promotion or weekly reminder." />
        <div className="flex gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-slate-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
          <p><b>Where does it go?</b> Either the bot <b>posts in a channel</b> (best for promotions and updates), or it <b>sends a private message</b> to each member of a role or to people you pick. Members who block DMs from servers won’t receive DMs, and mass DMs can look like spam, so prefer channel posts for big audiences.</p>
        </div>
        <label className={label}>Campaign name<input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekly tournament promo" required /></label>
        <div><span className={label}>Send to</span>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([['CHANNEL', 'A channel'], ['ROLE', 'A role (DM)'], ['MEMBERS', 'Picked members (DM)'], ['ALL', 'Everyone (DM)']] as const).map(([v, l]) => <button type="button" key={v} className={chip(where === v)} onClick={() => setWhere(v)}>{l}</button>)}
          </div>
          <div className="mt-2">
            {where === 'CHANNEL' && <ChannelSelect communityId={communityId} value={channelId} onChange={setChannelId} />}
            {where === 'ROLE' && <RoleSelect communityId={communityId} value={roleId} onChange={setRoleId} />}
            {where === 'MEMBERS' && <MultiMemberSelect communityId={communityId} onChange={setMemberIds} />}
          </div>
        </div>
        <div><span className={label}>Message</span><div className="mt-1"><MessageComposer communityId={communityId} value={message} onChange={setMessage} placeholder="Write the campaign message…" defaultCategory="Promotion" /></div></div>
        <div><span className={label}>How often</span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {FREQ.map((f) => <button type="button" key={f.v} className={chip(freq === f.v)} onClick={() => setFreq(f.v)}>{f.v === 'ONCE' ? f.l : `Every … ${f.l.toLowerCase()}`}</button>)}
          </div>
          {freq !== 'ONCE' && (
            <div className="mt-2 flex items-center gap-2 text-sm text-slate-700">Every
              <input type="number" min={1} max={30} value={interval} onChange={(e) => setInterval(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              {FREQ.find((f) => f.v === freq)?.l.toLowerCase()}
            </div>
          )}
        </div>
        <label className={label}>Start{freq === 'ONCE' ? ' (optional)' : ''}<input type="datetime-local" className={input} value={startAt} onChange={(e) => setStartAt(e.target.value)} /><span className="mt-1 block text-xs font-normal normal-case text-slate-500">Leave empty to start now.</span></label>
        {freq !== 'ONCE' && (
          <div><span className={label}>Stops</span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              <button type="button" className={chip(ends === 'never')} onClick={() => setEnds('never')}>Never</button>
              <button type="button" className={chip(ends === 'date')} onClick={() => setEnds('date')}>On a date</button>
              <button type="button" className={chip(ends === 'count')} onClick={() => setEnds('count')}>After N sends</button>
            </div>
            {ends === 'date' && <input type="datetime-local" className={input} value={endAt} onChange={(e) => setEndAt(e.target.value)} />}
            {ends === 'count' && <input type="number" min={1} className={input} value={maxRuns} onChange={(e) => setMaxRuns(Math.max(1, Number(e.target.value) || 1))} />}
          </div>
        )}
        <button className={primary} disabled={busy || !ready}><Send className="h-4 w-4" />{freq === 'ONCE' && !startAt ? 'Send campaign now' : 'Schedule campaign'}</button>
      </form>}
      list={!data.length ? <Empty text="No campaigns yet." /> : data.map((c) => (
        <div key={c.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-2"><span className="font-bold text-slate-900">{c.name}</span><Badge s={c.status} /></div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>{target(c)}</span><span>{describeFreq(c)}</span>
            {['SCHEDULED', 'PAUSED'].includes(c.status) && <span>Next: {when(c.scheduledAt)}</span>}
            <span>Sent {c.runCount || 0}×</span>{c.deliveryAuditCount ? <span>{c.deliveryAuditCount} delivered</span> : null}
          </div>
          <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{c.message}</p>
          <div className="mt-3 flex gap-3 text-xs font-semibold">
            {c.status === 'SCHEDULED' && <button className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-900" onClick={() => run(() => api(`campaigns/${c.id}/state`, 'POST', { action: 'pause' }), 'Campaign paused.')}><Pause className="h-3.5 w-3.5" />Pause</button>}
            {c.status === 'PAUSED' && <button className="inline-flex items-center gap-1 text-emerald-700 hover:underline" onClick={() => run(() => api(`campaigns/${c.id}/state`, 'POST', { action: 'resume' }), 'Campaign resumed.')}><Play className="h-3.5 w-3.5" />Resume</button>}
            <button className="inline-flex items-center gap-1 text-rose-600 hover:underline" onClick={() => window.confirm(`Delete “${c.name}”? This stops any future sends.`) && run(() => api(`campaigns/${c.id}/state`, 'POST', { action: 'delete' }), 'Campaign deleted.')}><Trash2 className="h-3.5 w-3.5" />Delete</button>
          </div>
        </div>
      ))} />
  );
}

/* ---------------- Reminders ---------------- */
function Reminders({ communityId, data, run, api, busy, chanName }: P) {
  const [to, setTo] = useState<'MEMBER' | 'CHANNEL'>('MEMBER');
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');
  const [channelId, setChannelId] = useState('');
  const [at, setAt] = useState('');
  const [repeat, setRepeat] = useState('ONCE');
  const [message, setMessage] = useState('');
  const ready = at && message.trim() && (to === 'MEMBER' ? userId : channelId);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => api('reminders', 'POST', { targetType: to, targetUser: userId, targetUserName: userName, channelId, triggerAt: new Date(at).toISOString(), recurrence: repeat, message }),
      'Reminder scheduled.', () => { setMessage(''); setAt(''); });
  };
  return (
    <Layout listTitle="Scheduled reminders" listDesc="Upcoming and sent reminders."
      form={<form onSubmit={submit} className="space-y-4">
        <Head icon={Clock} tone="bg-teal-50 text-teal-600" title="Schedule a reminder" desc="The bot sends it at the time you choose, to one member (private message) or a channel." />
        <div><span className={label}>Send to</span>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <button type="button" className={chip(to === 'MEMBER')} onClick={() => setTo('MEMBER')}>A member (DM)</button>
            <button type="button" className={chip(to === 'CHANNEL')} onClick={() => setTo('CHANNEL')}>A channel</button>
          </div>
          <div className="mt-2">
            {to === 'MEMBER' ? <MemberSelect communityId={communityId} value={userId} onChange={(id, m) => { setUserId(id); setUserName(m?.name || ''); }} placeholder="Search members by name" />
              : <ChannelSelect communityId={communityId} value={channelId} onChange={setChannelId} />}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>When<input type="datetime-local" className={input} value={at} onChange={(e) => setAt(e.target.value)} required /></label>
          <label className={label}>Repeat<select className={input} value={repeat} onChange={(e) => setRepeat(e.target.value)}><option value="ONCE">Don’t repeat</option><option value="DAILY">Every day</option><option value="WEEKLY">Every week</option></select></label>
        </div>
        <div><span className={label}>Message</span><div className="mt-1"><MessageComposer communityId={communityId} value={message} onChange={setMessage} rows={4} placeholder="What should the reminder say?" defaultCategory="Reminder" /></div></div>
        <button className={primary} disabled={busy || !ready}><Clock className="h-4 w-4" />Schedule reminder</button>
      </form>}
      list={!data.length ? <Empty text="No reminders yet." /> : data.map((r) => (
        <div key={r.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-900">{r.targetType === 'CHANNEL' ? `#${chanName?.(r.channelId) || 'channel'}` : r.targetUserName ? `@${r.targetUserName}` : 'A member (DM)'}</span>
            <Badge s={r.status} />
          </div>
          <div className="mt-1 text-xs text-slate-500">{r.status === 'PENDING' ? `Sends ${when(r.triggerAt)}` : `Sent ${when(r.updatedAt)}`}{r.recurrence && r.recurrence !== 'ONCE' ? ` · repeats ${r.recurrence === 'DAILY' ? 'daily' : 'weekly'}` : ''}</div>
          <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{r.message}</p>
          <button className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:underline" onClick={() => window.confirm('Delete this reminder?') && run(() => api(`reminders/${r.id}`, 'DELETE'), 'Reminder deleted.')}><Trash2 className="h-3.5 w-3.5" />Delete</button>
        </div>
      ))} />
  );
}

/* ---------------- Polls ---------------- */
const DURATIONS = [{ h: 1, l: '1 hour' }, { h: 4, l: '4 hours' }, { h: 8, l: '8 hours' }, { h: 24, l: '1 day' }, { h: 72, l: '3 days' }, { h: 168, l: '1 week' }, { h: 336, l: '2 weeks' }];
function Polls({ communityId, data, run, api, busy, chanName }: P) {
  const [question, setQuestion] = useState('');
  const [channelId, setChannelId] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [hours, setHours] = useState(24);
  const [multi, setMulti] = useState(false);
  const [announce, setAnnounce] = useState(true);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => api('polls', 'POST', { question, channelId, options: filled, durationHours: hours, allowMultiselect: multi, afterAction: announce ? 'ANNOUNCE' : 'NONE' }),
      'Poll posted in Discord.', () => { setQuestion(''); setOptions(['', '']); });
  };
  return (
    <Layout listTitle="Polls" listDesc="Live and finished polls with their final results."
      form={<form onSubmit={submit} className="space-y-4">
        <Head icon={BarChart3} tone="bg-violet-50 text-violet-600" title="Post a Discord poll" desc="Uses Discord’s own poll feature: members vote right in the channel and Discord closes it on time." />
        <label className={label}>Question<input className={input} maxLength={300} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What time should we run the next event?" required /></label>
        <label className={label}>Channel<div className="mt-1"><ChannelSelect communityId={communityId} value={channelId} onChange={setChannelId} /></div></label>
        <div><span className={label}>Answers (2 to 10)</span>
          <div className="mt-1 space-y-2">
            {options.map((o, i) => (
              <div key={i} className="flex gap-2">
                <input className={`${input} mt-0`} maxLength={55} value={o} placeholder={`Answer ${i + 1}`} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
                {options.length > 2 && <button type="button" aria-label="Remove answer" className="text-slate-400 hover:text-rose-600" onClick={() => setOptions(options.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
            {options.length < 10 && <button type="button" className="text-sm font-semibold text-indigo-600 hover:underline" onClick={() => setOptions([...options, ''])}>+ Add answer</button>}
          </div>
        </div>
        <div><span className={label}>Closes after</span>
          <div className="mt-1 flex flex-wrap gap-2">{DURATIONS.map((d) => <button type="button" key={d.h} className={chip(hours === d.h)} onClick={() => setHours(d.h)}>{d.l}</button>)}</div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />Let members pick more than one answer</label>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />When it closes, post the winning answer in the channel</label>
        <button className={primary} disabled={busy || !channelId || !question.trim() || filled.length < 2}><BarChart3 className="h-4 w-4" />Post poll to Discord</button>
      </form>}
      list={!data.length ? <Empty text="No polls yet." /> : data.map((p) => {
        const total = (p.results || []).reduce((n: number, r: any) => n + r.votes, 0);
        return (
          <div key={p.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-2"><span className="font-bold text-slate-900">{p.question}</span><Badge s={p.status} /></div>
            <div className="mt-1 text-xs text-slate-500">#{chanName?.(p.channelId) || 'channel'} · {p.status === 'ACTIVE' ? `Closes ${when(p.endsAt)}` : `${total} vote${total === 1 ? '' : 's'}`}</div>
            {p.results ? (
              <div className="mt-3 space-y-1.5">
                {p.results.map((r: any) => {
                  const pct = total ? Math.round((r.votes / total) * 100) : 0;
                  return (
                    <div key={r.text} className="relative overflow-hidden rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                      <div className="absolute inset-y-0 left-0 bg-violet-100" style={{ width: `${pct}%` }} />
                      <div className="relative flex justify-between"><span className="text-slate-800">{r.text}</span><span className="font-semibold text-slate-600">{r.votes} · {pct}%</span></div>
                    </div>
                  );
                })}
              </div>
            ) : <ul className="mt-2 list-inside list-disc text-sm text-slate-600">{(p.options || []).map((o: string) => <li key={o}>{o}</li>)}</ul>}
            {p.status === 'ACTIVE' && p.messageId && <button className="mt-3 text-xs font-semibold text-rose-600 hover:underline" onClick={() => window.confirm('End this poll now? Discord will show the final result.') && run(() => api(`polls/${p.id}/close`, 'POST'), 'Poll ended.')}>End poll now</button>}
          </div>
        );
      })} />
  );
}

/* ---------------- Templates ---------------- */
function Templates({ communityId, data, run, api, busy }: P) {
  const [editing, setEditing] = useState<any | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('General');
  const [content, setContent] = useState('');
  const [filter, setFilter] = useState('All');
  const [copied, setCopied] = useState('');
  const cats = Array.from(new Set(data.map((t) => t.category || 'General')));
  const reset = () => { setEditing(null); setName(''); setContent(''); setCategory('General'); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => (editing ? api(`templates/${editing.id}`, 'PUT', { name, category, content }) : api('templates', 'POST', { name, category, content })),
      editing ? 'Template updated.' : 'Template saved.', reset);
  };
  const shown = data.filter((t) => filter === 'All' || (t.category || 'General') === filter);
  return (
    <Layout listTitle="Saved templates" listDesc="Use them from any message box with “Use template”."
      form={<form onSubmit={submit} className="space-y-4">
        <Head icon={FileText} tone="bg-sky-50 text-sky-600" title={editing ? `Edit “${editing.name}”` : 'Create a template'} desc="Reusable messages. Variables like {{username}} are filled in when the bot sends them." />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>Name<input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Welcome message" required /></label>
          <label className={label}>Category<input list="cm-tpl-cats" className={input} value={category} onChange={(e) => setCategory(e.target.value)} />
            <datalist id="cm-tpl-cats">{['General', 'Announcement', 'Recruitment', 'Promotion', 'Event', 'Reminder', 'Moderation', ...cats].filter((v, i, a) => a.indexOf(v) === i).map((c) => <option key={c} value={c} />)}</datalist>
          </label>
        </div>
        <div><span className={label}>Message</span><div className="mt-1"><MessageComposer communityId={communityId} value={content} onChange={setContent} allowTemplates={false} placeholder="Hello {{username}}! Welcome to {{communityName}}…" /></div></div>
        <div className="flex gap-2">
          <button className={primary} disabled={busy || !name.trim() || !content.trim()}><CheckCircle2 className="h-4 w-4" />{editing ? 'Save changes' : 'Save template'}</button>
          {editing && <button type="button" onClick={reset} className="rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600">Cancel</button>}
        </div>
      </form>}
      list={<>
        {!!cats.length && <div className="flex flex-wrap gap-1.5">{['All', ...cats].map((c) => <button key={c} onClick={() => setFilter(c)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === c ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-indigo-50'}`}>{c}{c !== 'All' ? ` · ${data.filter((t) => (t.category || 'General') === c).length}` : ''}</button>)}</div>}
        {!shown.length ? <Empty text="No templates yet." /> : (
          <div className="grid gap-3 2xl:grid-cols-2">
            {shown.map((t) => (
              <div key={t.id} className="flex flex-col rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><div className="font-bold text-slate-900">{t.name}</div><span className="mt-0.5 inline-block rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">{t.category || 'General'}</span></div>
                  <div className="flex gap-1">
                    <button title="Copy text" aria-label="Copy text" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" onClick={() => { navigator.clipboard?.writeText(t.content); setCopied(t.id); setTimeout(() => setCopied(''), 1500); }}>{copied === t.id ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}</button>
                    <button title="Edit" aria-label="Edit" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-700" onClick={() => { setEditing(t); setName(t.name); setCategory(t.category || 'General'); setContent(t.content); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil className="h-4 w-4" /></button>
                    <button title="Delete" aria-label="Delete" className="rounded-md p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" onClick={() => window.confirm(`Delete the template “${t.name}”?`) && run(() => api(`templates/${t.id}`, 'DELETE'), 'Template deleted.', () => editing?.id === t.id && reset())}><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <p className="mt-3 line-clamp-5 flex-1 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{t.content}</p>
                {!!t.variables?.length && <div className="mt-2 flex flex-wrap gap-1">{t.variables.map((v: string) => <code key={v} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] text-indigo-700">{`{{${v}}}`}</code>)}</div>}
                <div className="mt-2 text-[11px] text-slate-400">Updated {when(t.updatedAt)}</div>
              </div>
            ))}
          </div>
        )}
      </>} />
  );
}
