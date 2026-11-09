import React, { useEffect, useMemo, useState } from 'react';
import { Save, CheckCircle2, Bot, Globe2 } from 'lucide-react';
import { Card } from './ServerToolsView.js';

/** "(UTC+05:30) Asia/Kolkata" style labels, sorted by offset. */
function timezoneOptions() {
  const zones: string[] = (Intl as any).supportedValuesOf ? (Intl as any).supportedValuesOf('timeZone') : ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York'];
  const now = new Date();
  const offsetMin = (tz: string) => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(now);
      const m = (parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT').match(/GMT([+-])(\d{2}):?(\d{2})?/);
      return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 0;
    } catch { return 0; }
  };
  return zones.map((z) => {
    const o = offsetMin(z);
    const sign = o < 0 ? '-' : '+';
    const a = Math.abs(o);
    return { id: z, offset: o, label: `(UTC${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}) ${z.replace(/_/g, ' ')}` };
  }).sort((x, y) => x.offset - y.offset || x.id.localeCompare(y.id));
}

/** Server-level settings that actually change how the bot behaves in this server. */
export function ServerSettingsView({ communityId }: { communityId: string }) {
  const headers = { 'Content-Type': 'application/json', 'x-community-id': communityId };
  const [nick, setNick] = useState('');
  const [botName, setBotName] = useState('');
  const [serverName, setServerName] = useState('');
  const [tz, setTz] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const zones = useMemo(timezoneOptions, []);

  useEffect(() => {
    fetch(`/api/v1/communities/${encodeURIComponent(communityId)}/toolkit`, { credentials: 'include', headers })
      .then((r) => r.json()).then((j) => { setNick(j?.data?.resources?.botNickname || ''); setBotName(j?.data?.resources?.botName || ''); }).catch(() => undefined);
    fetch(`/api/v1/communities/${encodeURIComponent(communityId)}/settings`, { credentials: 'include', headers })
      .then((r) => r.json()).then((j) => { setTz(j?.data?.general?.timezone || 'UTC'); setServerName(j?.data?.general?.discordGuildName || j?.data?.general?.displayName || ''); }).catch(() => undefined);
  }, [communityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = (ok: boolean, text: string) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000); };
  const saveNick = async () => {
    const r = await fetch(`/api/v1/communities/${encodeURIComponent(communityId)}/toolkit/bot-nickname`, { method: 'POST', credentials: 'include', headers, body: JSON.stringify({ nickname: nick }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.success) { setNick(j.data.nickname || ''); flash(true, 'Bot name updated in this server.'); } else flash(false, j?.error?.message || 'Could not change the bot name.');
  };
  const saveTz = async () => {
    const r = await fetch(`/api/v1/communities/${encodeURIComponent(communityId)}/settings`, { method: 'PATCH', credentials: 'include', headers, body: JSON.stringify({ general: { timezone: tz } }) });
    const j = await r.json().catch(() => ({}));
    flash(r.ok && j.success !== false, r.ok ? 'Time zone saved.' : j?.message || 'Could not save the time zone.');
  };

  return (
    <div className="space-y-6">
      {msg && <p role="status" className={`flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${msg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{msg.ok && <CheckCircle2 className="h-4 w-4" />}{msg.text}</p>}
      <Card title="Bot name in this server" desc="How the bot is named in this server only (its Discord nickname). Other servers and the bot’s own name stay the same.">
        <div className="flex max-w-xl flex-wrap items-end gap-3">
          <label className="min-w-60 flex-1 text-sm font-semibold text-slate-700"><span className="flex items-center gap-1.5"><Bot className="h-4 w-4 text-indigo-500" />Name</span>
            <input value={nick} maxLength={32} placeholder={botName || 'Community Manager'} onChange={(e) => setNick(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
          </label>
          <button onClick={saveNick} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"><Save className="h-4 w-4" />Save</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Leave empty to use “{botName || 'Community Manager'}”. Needs the bot’s “Change Nickname” permission.{serverName ? ` Server: ${serverName}.` : ''}</p>
      </Card>
      <Card title="Server time zone" desc="Used for daily jobs such as birthday greetings and for times shown on this dashboard. Times the bot posts in Discord automatically show in each member’s own time zone.">
        <div className="flex max-w-xl flex-wrap items-end gap-3">
          <label className="min-w-60 flex-1 text-sm font-semibold text-slate-700"><span className="flex items-center gap-1.5"><Globe2 className="h-4 w-4 text-indigo-500" />Time zone</span>
            <select value={tz} onChange={(e) => setTz(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              {!zones.some((z) => z.id === tz) && tz && <option value={tz}>{tz}</option>}
              {zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
            </select>
          </label>
          <button onClick={saveTz} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700"><Save className="h-4 w-4" />Save</button>
        </div>
      </Card>
    </div>
  );
}
