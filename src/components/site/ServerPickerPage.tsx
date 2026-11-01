import React, { useEffect, useState } from 'react';
import { LogOut, RefreshCw, Plus } from 'lucide-react';
import { getAddToDiscordUrl, getDiscordLoginUrl } from '../../lib/discordUrls.js';

interface ServerEntry {
  guildId: string;
  name: string;
  icon?: string;
  communityId?: string;
  botStatus: 'CONNECTED' | 'BOT_INSTALLED' | 'BOT_MISSING' | 'PERMISSION_REQUIRED';
  setupStatus: 'READY' | 'SETUP_REQUIRED' | 'INSTALL_REQUIRED' | 'PERMISSION_REQUIRED';
}

type LoadState = 'loading' | 'ready' | 'signed-out' | 'error';

/** "/servers": choose which server to manage, or add the bot to one. */
export function ServerPickerPage() {
  const [state, setState] = useState<LoadState>('loading');
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    setState('loading');
    try {
      const res = await fetch('/api/v1/discord/guilds/list', { credentials: 'include' });
      if (res.status === 401) return setState('signed-out');
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || json.message || 'Could not load your servers.');
      const list: ServerEntry[] = json.data || [];
      // Servers with the bot first, then alphabetical.
      list.sort((a, b) => Number(b.botStatus === 'CONNECTED') - Number(a.botStatus === 'CONNECTED') || a.name.localeCompare(b.name));
      setServers(list);
      setState('ready');
    } catch (e: any) {
      setError(e?.message || 'Could not load your servers.');
      setState('error');
    }
  };

  useEffect(() => { load(); }, []);

  const open = (s: ServerEntry, onboarding: boolean) => {
    const commId = s.communityId || `comm_${s.guildId}`;
    try { localStorage.setItem('selected_community_id', commId); } catch { /* private mode */ }
    window.location.href = onboarding ? '/dashboard?view=onboarding' : '/dashboard';
  };

  const logout = async () => {
    try { await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }); } catch { /* ignore */ }
    window.location.href = '/';
  };

  return (
    <div className="cm-site">
      <header className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-5 sm:px-8">
        <a href="/" className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="cm-display text-xl font-bold">Community Manager</span>
        </a>
        {state !== 'signed-out' && (
          <button onClick={logout} className="cm-btn-ghost !py-2 text-[15px]">
            <LogOut className="h-4 w-4" aria-hidden /> Log out
          </button>
        )}
      </header>

      <main className="mx-auto max-w-[1400px] px-5 pb-20 pt-6 sm:px-8">
        <h1 className="text-[clamp(2.2rem,5vw,3.2rem)] font-extrabold">Choose a server</h1>
        <p className="mt-3 text-[var(--site-muted)]">
          These are the servers where you are an owner or admin.
        </p>

        {state === 'loading' && (
          <ul className="mt-10 space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-[84px] animate-pulse rounded-2xl bg-[var(--site-panel)]" />
            ))}
          </ul>
        )}

        {state === 'signed-out' && (
          <div className="mt-10 rounded-2xl border border-[var(--site-line)] bg-[var(--site-panel)] p-7">
            <h2 className="text-2xl font-bold">Log in to see your servers</h2>
            <p className="mt-2 text-[var(--site-muted)]">Your session has ended or you have not logged in yet.</p>
            <a href={getDiscordLoginUrl()} className="cm-btn-primary mt-5">Log in with Discord</a>
          </div>
        )}

        {state === 'error' && (
          <div className="mt-10 rounded-2xl border border-[var(--site-rose)]/50 bg-[var(--site-panel)] p-7">
            <h2 className="text-2xl font-bold">Your servers did not load</h2>
            <p className="mt-2 text-[var(--site-muted)]">{error} Try again; if it keeps happening, log out and back in.</p>
            <button onClick={load} className="cm-btn-ghost mt-5"><RefreshCw className="h-4 w-4" aria-hidden /> Try again</button>
          </div>
        )}

        {state === 'ready' && servers.length === 0 && (
          <div className="mt-10 rounded-2xl border border-[var(--site-line)] bg-[var(--site-panel)] p-7">
            <h2 className="text-2xl font-bold">No servers to manage yet</h2>
            <p className="mt-2 text-[var(--site-muted)]">
              You need to be the owner or an admin of a server. Create one in Discord, then add the bot to it.
            </p>
            <a href={getAddToDiscordUrl()} className="cm-btn-primary mt-5"><Plus className="h-4 w-4" aria-hidden /> Add to Discord</a>
          </div>
        )}

        {state === 'ready' && servers.length > 0 && (
          <>
            <ul className="mt-10 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {servers.map((s) => (
                <li key={s.guildId} className="flex flex-wrap items-center gap-4 rounded-2xl border border-[var(--site-line)] bg-[var(--site-panel)] px-5 py-5 transition hover:border-[var(--site-signal)] sm:flex-nowrap">
                  <ServerIcon server={s} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-lg font-semibold">{s.name}</div>
                    <div className="text-[15px] text-[var(--site-muted)]">{statusText(s)}</div>
                  </div>
                  <ServerAction server={s} onOpen={open} />
                </li>
              ))}
            </ul>
            <button onClick={load} className="mt-5 inline-flex items-center gap-2 text-[15px] text-[var(--site-muted)] hover:text-[var(--site-text)]">
              <RefreshCw className="h-4 w-4" aria-hidden /> Refresh list (after adding the bot)
            </button>
          </>
        )}
      </main>
    </div>
  );
}

function statusText(s: ServerEntry): string {
  if (s.botStatus !== 'CONNECTED') return 'Bot not added yet';
  if (s.setupStatus === 'SETUP_REQUIRED') return 'Bot added. Setup not finished';
  return 'Ready to manage';
}

function ServerAction({ server: s, onOpen }: { server: ServerEntry; onOpen: (s: ServerEntry, onboarding: boolean) => void }) {
  if (s.botStatus !== 'CONNECTED') {
    return (
      <a href={getAddToDiscordUrl({ guildId: s.guildId })} className="cm-btn-ghost !py-2 text-[15px]">
        <Plus className="h-4 w-4" aria-hidden /> Add bot
      </a>
    );
  }
  if (s.setupStatus === 'SETUP_REQUIRED') {
    return <button onClick={() => onOpen(s, true)} className="cm-btn-primary !py-2 text-[15px]">Finish setup</button>;
  }
  return <button onClick={() => onOpen(s, false)} className="cm-btn-primary !py-2 text-[15px]">Open dashboard</button>;
}

function ServerIcon({ server: s }: { server: ServerEntry }) {
  if (s.icon) return <img src={s.icon} alt="" className="h-12 w-12 shrink-0 rounded-2xl" />;
  const initials = s.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#262E63] font-bold text-[var(--site-signal)]">
      {initials}
    </div>
  );
}
