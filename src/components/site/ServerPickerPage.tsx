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
  yourRole?: string;
  details?: {
    memberCount: number; textChannels: number; voiceChannels: number; roles: number; boostTier: number; boosts: number;
    createdAt?: string; botJoinedAt?: string; botRole?: string; botRoles?: string[]; botAdmin: boolean; missingPermissions: string[];
    secureSetup: string; activeModules: string[];
  };
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
      // Just came back from adding the bot: open that server's setup straight away.
      const installed = new URLSearchParams(window.location.search).get('installed');
      if (installed) {
        window.history.replaceState(null, '', '/servers');
        const hit = list.find((x) => x.guildId === installed && x.botStatus === 'CONNECTED');
        if (hit) { open(hit, hit.setupStatus !== 'READY'); return; }
        if (installed !== '1') setTimeout(load, 2500); // bot may need a moment to register the server
      }
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
      <header className="mx-auto flex max-w-[min(94vw,2200px)] items-center justify-between px-5 py-5 sm:px-8">
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

      <main className="mx-auto max-w-[min(94vw,2200px)] px-5 pb-20 pt-6 sm:px-8">
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
            <ul className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3 min-[1900px]:grid-cols-4 min-[2500px]:grid-cols-5">
              {servers.map((s) => <ServerCard key={s.guildId} server={s} onOpen={open} />)}
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

const fmtN = (n?: number) => (n == null ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));
const since = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—');

function ServerCard({ server: s, onOpen }: { server: ServerEntry; onOpen: (s: ServerEntry, onboarding: boolean) => void }) {
  const d = s.details;
  const connected = s.botStatus === 'CONNECTED';
  const missing = d?.missingPermissions || [];
  return (
    <li className="flex flex-col rounded-2xl border border-[var(--site-line)] bg-[var(--site-panel)] p-5 transition hover:border-[var(--site-signal)]">
      <div className="flex items-center gap-4">
        <ServerIcon server={s} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold" title={s.name}>{s.name}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-[var(--site-muted)]">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold ${connected ? 'bg-[var(--site-mint)]/15 text-[var(--site-mint)]' : 'bg-white/5 text-[var(--site-muted)]'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-[var(--site-mint)]' : 'bg-[var(--site-muted)]'}`} />{connected ? 'Bot online' : 'Bot not added'}
            </span>
            {s.yourRole && <span>You: {s.yourRole}</span>}
          </div>
        </div>
      </div>

      {connected && d ? (
        <>
          <dl className="mt-5 grid grid-cols-4 gap-2 text-center">
            {[['Members', fmtN(d.memberCount)], ['Text', d.textChannels], ['Voice', d.voiceChannels], ['Roles', d.roles]].map(([l, v]) => (
              <div key={l as string} className="rounded-xl bg-[var(--site-night)] px-2 py-2.5">
                <dd className="cm-display text-xl font-bold">{v as any}</dd>
                <dt className="text-[11px] uppercase tracking-wider text-[var(--site-muted)]">{l as string}</dt>
              </div>
            ))}
          </dl>
          <div className="mt-4 space-y-2 text-[13px]">
            <Row label="Bot permissions">
              {d.botAdmin ? <span className="text-[#FFC46B]">Administrator</span>
                : missing.length ? <span className="text-[#FFC46B]" title={missing.join(', ')}>{missing.length} missing · {missing.slice(0, 2).join(', ')}{missing.length > 2 ? '…' : ''}</span>
                : <span className="text-[var(--site-mint)]">All required ✓</span>}
            </Row>
            <Row label="Secure Setup"><span className={d.secureSetup === 'Locked' ? 'text-[var(--site-mint)]' : d.secureSetup === 'Needs attention' ? 'text-[#FFC46B]' : 'text-[var(--site-muted)]'}>{d.secureSetup}</span></Row>
            <Row label="Active modules">{d.activeModules.length ? d.activeModules.join(' · ') : <span className="text-[var(--site-muted)]">None yet</span>}</Row>
            <Row label={(d.botRoles?.length || 0) > 1 ? 'Bot roles' : 'Bot role'}><span className="text-right text-[var(--site-muted)]">{(d.botRoles?.length ? d.botRoles : d.botRole ? [d.botRole] : ['—']).map((r) => `@${r}`).join(', ')}</span></Row>
            <Row label="Server since"><span className="text-[var(--site-muted)]">{since(d.createdAt)}{d.boosts ? ` · ${d.boosts} boosts (level ${d.boostTier})` : ''}</span></Row>
          </div>
        </>
      ) : (
        <p className="mt-5 text-[14px] text-[var(--site-muted)]">
          {connected ? 'Connected. Details load in a moment.' : 'Add Community Manager to see members, channels, permissions and setup status here.'}
        </p>
      )}

      <div className="mt-5 flex justify-end border-t border-[var(--site-line)] pt-4">
        <ServerAction server={s} onOpen={onOpen} />
      </div>
    </li>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-3"><span className="shrink-0 text-[var(--site-muted)]">{label}</span><span className="text-right">{children}</span></div>;
}
