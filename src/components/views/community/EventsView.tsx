import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, Users, Plus, Play, CheckCircle, XCircle, Copy, Send, Megaphone, Clock, BarChart3, Gift, ChevronDown, ChevronRight, ExternalLink, RefreshCw } from 'lucide-react';
import { ChannelSelect, MemberName } from '../../common/DiscordPickers.js';
import { LinkedPanel } from '../../common/Linked.js';
import { MessageComposer } from '../../common/MessageComposer.js';
import { useRemembered } from '../../common/useRemembered.js';

/**
 * Events: create, publish to Discord (post with Register buttons + Discord's own Events list),
 * a private registrations channel, and everything around the event in one place:
 * announcements, reminders, polls and giveaways.
 */
const input = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100';
const label = 'block text-xs font-bold uppercase tracking-wide text-slate-500';
const primary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50';
const ghost = 'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : 'UTC';
const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft · not posted', cls: 'bg-slate-100 text-slate-600' },
  SCHEDULED: { label: 'Posted · upcoming', cls: 'bg-indigo-50 text-indigo-700' },
  LIVE: { label: 'Happening now', cls: 'bg-emerald-50 text-emerald-700' },
  COMPLETED: { label: 'Finished', cls: 'bg-slate-100 text-slate-500' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-rose-50 text-rose-700' },
  ARCHIVED: { label: 'Archived', cls: 'bg-slate-100 text-slate-400' },
};

export const EventsView: React.FC<{ communityId: string }> = ({ communityId }) => {
  const headers = { 'Content-Type': 'application/json', 'x-community-id': communityId };
  const call = useCallback(async (url: string, method = 'GET', body?: any) => {
    const r = await fetch(url, { method, credentials: 'include', headers, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.success === false) throw new Error(String(j?.error?.message || j?.message || 'Something went wrong.').replace(/^[A-Z_]+:\s*/, ''));
    return j;
  }, [communityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [events, setEvents] = useState<any[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };
  const load = useCallback(() => call('/api/v1/events').then((j) => setEvents((j.events || []).sort((a: any, b: any) => String(b.startAt).localeCompare(String(a.startAt))))).catch(() => setEvents([])), [call]);
  useEffect(() => { load(); }, [load]);

  // Form
  const blank = () => { const s = new Date(Date.now() + 86400000); s.setMinutes(0, 0, 0); const e = new Date(s.getTime() + 2 * 3600000); return { title: '', description: '', startAt: toLocalInput(s), endAt: toLocalInput(e), capacity: '50', registrationEnabled: true, visibility: 'COMMUNITY', publish: true }; };
  const [f, setF] = useState<any>(blank);
  const [channelId, setChannelId] = useRemembered(`event:${communityId}`);
  const [busy, setBusy] = useState(false);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim() || !f.startAt || !f.endAt) return;
    setBusy(true);
    try {
      const j = await call('/api/v1/events', 'POST', {
        title: f.title, description: f.description || f.title, startAt: new Date(f.startAt).toISOString(), endAt: new Date(f.endAt).toISOString(), timezone: tz,
        channelId: channelId || undefined, capacity: parseInt(f.capacity, 10) || 0, registrationEnabled: f.registrationEnabled, visibility: f.visibility,
      });
      if (f.publish) {
        if (!channelId) throw new Error('Saved as a draft. Pick a channel to post it in Discord.');
        await call(`/api/v1/events/${j.event.id}/publish`, 'POST', { syncDiscord: true });
        flash(true, 'Event posted in Discord and added to the server’s Events list.' + (f.registrationEnabled ? ' A private registrations channel was created for staff.' : ''));
      } else flash(true, 'Saved as a draft. Press Post when you’re ready.');
      setF(blank()); load();
    } catch (err: any) { flash(false, err.message); load(); }
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      {msg && <p role="status" className={`rounded-xl border px-4 py-3 text-sm font-semibold ${msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{msg.text}</p>}
      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <form onSubmit={create} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3"><span className="rounded-xl bg-indigo-50 p-2 text-indigo-600"><Plus className="h-5 w-5" /></span><div><h3 className="font-bold text-slate-900">New event</h3><p className="text-xs text-slate-500">Members register with buttons in Discord.</p></div></div>
          <label className={label}>Title<input className={`${input} mt-1`} value={f.title} maxLength={100} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Moto GP race night" required /></label>
          <div><span className={label}>Description</span><div className="mt-1"><MessageComposer communityId={communityId} value={f.description} onChange={(v: string) => setF({ ...f, description: v })} rows={4} maxLength={1000} placeholder="What happens, rules, prizes…" /></div></div>
          <div><span className={label}>Post in channel</span><div className="mt-1"><ChannelSelect communityId={communityId} value={channelId} onChange={setChannelId} placeholder="Channel for the event post" /></div></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>Starts<input type="datetime-local" className={`${input} mt-1`} value={f.startAt} onChange={(e) => setF({ ...f, startAt: e.target.value })} required /></label>
            <label className={label}>Ends<input type="datetime-local" className={`${input} mt-1`} value={f.endAt} onChange={(e) => setF({ ...f, endAt: e.target.value })} required /></label>
          </div>
          <p className="-mt-2 text-xs text-slate-500">You’re entering times in your time zone ({tz}). In Discord every member sees the time in their own time zone.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>Places<input type="number" min={0} className={`${input} mt-1`} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} /><span className="mt-0.5 block text-[11px] font-normal normal-case text-slate-500">0 = no limit</span></label>
            <label className={label}>Who can register<select className={`${input} mt-1`} value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })}><option value="COMMUNITY">Members only</option><option value="PUBLIC">Everyone in the server</option></select></label>
          </div>
          <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" className="mt-1" checked={f.registrationEnabled} onChange={(e) => setF({ ...f, registrationEnabled: e.target.checked })} /><span><b>Registration</b><span className="block text-xs text-slate-500">Register / Can’t go buttons, reminders 24h, 1h and 15 min before, and one private channel for staff with the live list of who registered. That channel is removed when the event finishes.</span></span></label>
          <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" className="mt-1" checked={f.publish} onChange={(e) => setF({ ...f, publish: e.target.checked })} /><span><b>Post it now</b><span className="block text-xs text-slate-500">Posts in the channel and adds it to the server’s Events list in Discord. Untick to keep it as a draft.</span></span></label>
          <button className={`${primary} w-full`} disabled={busy || !f.title.trim()}><Send className="h-4 w-4" />{busy ? 'Saving…' : f.publish ? 'Create and post' : 'Save draft'}</button>
        </form>

        <div className="space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-bold text-slate-900">Your events</h3><button className={ghost} onClick={load}><RefreshCw className="h-3.5 w-3.5" />Refresh</button></div>
          {!events ? <div className="h-40 animate-pulse rounded-2xl bg-slate-100" /> : !events.length ? <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No events yet. Create your first one on the left.</p>
            : events.filter((e) => e.status !== 'ARCHIVED').map((e) => <EventCard key={e.id} e={e} communityId={communityId} call={call} reload={load} flash={flash} />)}
        </div>
      </div>
    </div>
  );
};

function EventCard({ e, communityId, call, reload, flash }: any) {
  const [open, setOpen] = useState(false);
  const [regs, setRegs] = useState<any[] | null>(null);
  const st = STATUS[e.status] || { label: e.status, cls: 'bg-slate-100 text-slate-600' };
  const act = async (action: string, ok: string, body?: any) => {
    try { await call(`/api/v1/events/${e.id}/${action}`, 'POST', body); flash(true, ok); reload(); } catch (err: any) { flash(false, err.message); }
  };
  const loadRegs = () => call(`/api/v1/events/${e.id}/registrations`).then((j: any) => setRegs(j.registrations || [])).catch(() => setRegs([]));
  useEffect(() => { if (open && !regs) loadRegs(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const going = (regs || []).filter((r) => r.status === 'REGISTERED' || r.status === 'ATTENDED');
  const upcoming = e.status === 'SCHEDULED' || e.status === 'LIVE';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button className="flex w-full items-start gap-3 p-4 text-left" onClick={() => setOpen(!open)}>
        <span className="rounded-xl bg-indigo-50 p-2 text-indigo-600"><Calendar className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="font-bold text-slate-900">{e.title}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span></div>
          <div className="mt-0.5 text-xs text-slate-500">{fmt(e.startAt)} – {new Date(e.endAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}{e.capacity ? ` · ${e.capacity} places` : ''}{e.registrationEnabled ? ' · registration on' : ''}</div>
        </div>
        {open ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}
      </button>
      {open && (
        <div className="space-y-4 border-t border-slate-100 p-4">
          <div className="flex flex-wrap gap-2">
            {e.status === 'DRAFT' && <button className={ghost} disabled={!e.channelId} title={!e.channelId ? 'Pick a channel first' : ''} onClick={() => act('publish', 'Posted in Discord and added to the Events list.', { syncDiscord: true })}><Send className="h-3.5 w-3.5" />Post in Discord</button>}
            {e.status === 'SCHEDULED' && <button className={ghost} onClick={() => act('start', 'Marked as started.')}><Play className="h-3.5 w-3.5" />Start now</button>}
            {e.status === 'LIVE' && <button className={ghost} onClick={() => act('complete', 'Event finished. The registrations channel was removed and the list saved.')}><CheckCircle className="h-3.5 w-3.5" />Finish</button>}
            {(e.status === 'DRAFT' || upcoming) && <button className={ghost} onClick={() => window.confirm('Cancel this event? Registered members are told in the channel.') && act('cancel', 'Event cancelled.')}><XCircle className="h-3.5 w-3.5" />Cancel event</button>}
            <button className={ghost} onClick={() => act('duplicate', 'Copied as a new draft.')}><Copy className="h-3.5 w-3.5" />Duplicate</button>
            {e.discordEventUrl && <a className={ghost} href={e.discordEventUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" />Discord Events</a>}
          </div>
          <p className="text-xs text-slate-500">It starts and finishes by itself at the set times. When it finishes, the private registrations channel is removed and the final list is kept here.</p>

          <Linked e={e} call={call} communityId={communityId} />
          <div>
            <div className="mb-2 flex items-center justify-between"><span className="text-sm font-bold text-slate-900"><Users className="mr-1 inline h-4 w-4" />Registered ({regs ? going.length : '…'}{e.capacity ? ` / ${e.capacity}` : ''})</span>{e.rosterChannelId && <span className="text-xs text-slate-500">Also live in the private registrations channel</span>}</div>
            {(e.finalRoster || regs) && (
              <ol className="max-h-56 space-y-1 overflow-auto text-sm">
                {(regs && regs.length ? going : (e.finalRoster || []).filter((r: any) => r.status !== 'CANCELLED')).map((r: any, i: number) => (
                  <li key={r.discordUserId || i} className="flex items-center gap-2"><span className="w-6 text-right text-xs text-slate-400">{i + 1}.</span><MemberName id={r.discordUserId} communityId={communityId} fallback={r.username} />{r.status === 'ATTENDED' && <span className="text-xs text-emerald-600">attended</span>}</li>
                ))}
                {regs && !going.length && !(e.finalRoster || []).length && <li className="text-xs text-slate-500">Nobody yet.</li>}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


const KINDS: { type: string; tab: string; label: string; icon: any }[] = [
  { type: 'announcement', tab: 'announcements', label: 'Announcement', icon: Megaphone },
  { type: 'campaign', tab: 'campaigns', label: 'Campaign', icon: Send },
  { type: 'reminder', tab: 'reminders', label: 'Reminder', icon: Clock },
  { type: 'poll', tab: 'polls', label: 'Poll', icon: BarChart3 },
  { type: 'giveaway', tab: 'giveaways', label: 'Giveaway', icon: Gift },
];

/** The event's package: everything linked to it from the other Engagement features, with live status. */
function Linked({ e, call, communityId }: any) {
  const open = (tab: string) => {
    try { sessionStorage.setItem('cm_event_for', e.id); sessionStorage.setItem('cm_open_tab', tab); } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('cm:navigate', { detail: 'engagement' }));
  };
  return (
    <div>
      <div className="mb-1 text-sm font-bold text-slate-900">Event package</div>
      <p className="mb-2 text-xs text-slate-500">Everything linked to this event, and anything else you link to it, shows here and on the other side too. Create a new one below, or pick this event in “Part of an event” on any of those pages.</p>
      <div className="mb-3"><LinkedPanel communityId={communityId} type="event" id={e.id} /></div>
      <div className="flex flex-wrap gap-2">{KINDS.map((k) => <button key={k.type} className={ghost} onClick={() => open(k.tab)}><k.icon className="h-3.5 w-3.5" />+ {k.label}</button>)}</div>
    </div>
  );
}
