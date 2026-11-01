import React, { useEffect, useState } from 'react';
import { BellRing, ExternalLink, Plus, RefreshCw } from 'lucide-react';

interface SocialCordState {
  enabled: boolean;
  botInstalled: boolean | null;
  inviteUrl: string;
  dashboardUrl: string;
}

/** On/off switch for the SocialCord Notifier add-on (a separate bot with its own dashboard). */
export function SocialCordCard({ communityId }: { communityId: string }) {
  const [state, setState] = useState<SocialCordState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const url = `/api/v1/communities/${encodeURIComponent(communityId)}/integrations/socialcord`;
  const headers = { 'Content-Type': 'application/json', 'x-community-id': communityId };

  const load = async () => {
    setError('');
    try {
      const res = await fetch(url, { credentials: 'include', headers });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || json.error?.message || 'Could not load SocialCord status.');
      setState(json.data);
    } catch (e: any) {
      setError(e.message);
    }
  };

  useEffect(() => { if (communityId) load(); }, [communityId]);

  const toggle = async () => {
    if (!state) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(url, { method: 'PUT', credentials: 'include', headers, body: JSON.stringify({ enabled: !state.enabled }) });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || json.error?.message || 'Could not save.');
      setState(json.data);
      if (json.data.enabled && json.data.botInstalled === false) window.open(json.data.inviteUrl, '_blank', 'noopener');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const installedText =
    state?.botInstalled === true ? 'SocialCord bot is in this server.'
    : state?.botInstalled === false ? 'SocialCord bot is not in this server yet.'
    : 'Bot status unavailable right now.';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600">
            <BellRing className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">SocialCord Notifier</h2>
            <p className="mt-0.5 max-w-xl text-sm text-slate-600">
              Share new Instagram posts and reels in your channels. SocialCord is a separate bot with its own settings page.
            </p>
            {state && <p className="mt-2 text-sm text-slate-500">{installedText}</p>}
          </div>
        </div>

        <label className="inline-flex cursor-pointer items-center gap-3 self-start">
          <span className="text-sm font-semibold text-slate-700">{state?.enabled ? 'On' : 'Off'}</span>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(state?.enabled)}
            aria-label="Turn SocialCord Notifier on or off"
            disabled={!state || saving}
            onClick={toggle}
            className={`relative h-7 w-12 rounded-full transition disabled:opacity-50 ${state?.enabled ? 'bg-rose-500' : 'bg-slate-300'}`}
          >
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${state?.enabled ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        </label>
      </div>

      {state?.enabled && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <a href={state.dashboardUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            <ExternalLink className="h-4 w-4" aria-hidden /> Open SocialCord dashboard
          </a>
          {state.botInstalled !== true && (
            <a href={state.inviteUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Plus className="h-4 w-4" aria-hidden /> Add SocialCord bot
            </a>
          )}
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-800">
            <RefreshCw className="h-4 w-4" aria-hidden /> Check again
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
    </section>
  );
}
