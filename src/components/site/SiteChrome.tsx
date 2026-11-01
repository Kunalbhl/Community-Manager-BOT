import React, { useEffect, useState } from 'react';
import { LogIn, Plus, Menu } from 'lucide-react';
import { getAddToDiscordUrl, getDiscordLoginUrl } from '../../lib/discordUrls.js';

/** Fluid page width: uses the whole screen on large and HD displays instead of a narrow centre column. */
export const WRAP = 'mx-auto w-full max-w-[1760px] px-5 sm:px-10 2xl:px-16';

export interface PublicContact {
  guild: null | { name: string; icon: string | null; banner: string | null; description: string | null; memberCount: number | null; createdAt: string | null; boostLevel: number; boosts: number };
  invite: string | null;
  inviteChannel?: string;
  owner: null | { id: string; username: string; displayName: string; avatar: string | null };
  stats: null | { servers: number; members: number };
}

let contactPromise: Promise<PublicContact | null> | null = null;
export function usePublicContact(): PublicContact | null {
  const [data, setData] = useState<PublicContact | null>(null);
  useEffect(() => {
    contactPromise ||= fetch('/api/v1/public/contact').then((r) => r.json()).then((j) => j?.data || null).catch(() => null);
    contactPromise.then(setData);
  }, []);
  return data;
}

export function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    fetch('/api/v1/auth/session', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setSignedIn(Boolean(j?.data?.authenticated)))
      .catch(() => setSignedIn(false));
  }, []);
  return signedIn;
}

export function MadeInIndia({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="cm-flag" aria-hidden><i /><i /><i /></span>
      Made in India with pride
    </span>
  );
}

const NAV: [string, string][] = [
  ['Features', '/#features'], ['Lifecycle', '/#lifecycle'], ['Compare', '/#compare'], ['Security', '/#security'], ['Contact', '/contact'],
];

export function SiteHeader() {
  const signedIn = useSignedIn();
  const [menu, setMenu] = useState(false);
  const loginHref = signedIn ? '/servers' : getDiscordLoginUrl();
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--site-line)]/60 bg-[var(--site-night)]/80 backdrop-blur-xl">
      <div className={`${WRAP} flex items-center justify-between py-3.5`}>
        <a href="/" className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-9 w-9" />
          <span className="cm-display text-[20px] font-bold">Community Manager</span>
        </a>
        <nav className="hidden items-center gap-8 lg:flex">
          {NAV.map(([l, h]) => <a key={h} href={h} className="text-[15px] text-[var(--site-muted)] transition hover:text-[var(--site-text)]">{l}</a>)}
        </nav>
        <div className="flex items-center gap-2">
          <a href={loginHref} className="cm-btn-ghost hidden !py-2 text-[15px] sm:inline-flex">
            <LogIn className="h-4 w-4" aria-hidden /> {signedIn ? 'My servers' : 'Log in'}
          </a>
          <a href={getAddToDiscordUrl()} className="cm-btn-primary !py-2 text-[15px]"><Plus className="h-4 w-4" aria-hidden /> Add to Discord</a>
          <button className="grid h-10 w-10 place-items-center rounded-full border border-[var(--site-line)] lg:hidden" onClick={() => setMenu(!menu)} aria-label="Menu" aria-expanded={menu}>
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>
      {menu && (
        <nav className="flex flex-col gap-1 border-t border-[var(--site-line)] px-5 py-3 lg:hidden">
          {NAV.map(([l, h]) => <a key={h} href={h} onClick={() => setMenu(false)} className="py-2 text-[var(--site-muted)]">{l}</a>)}
          <a href={loginHref} className="py-2 font-semibold">{signedIn ? 'My servers' : 'Log in with Discord'}</a>
        </nav>
      )}
    </header>
  );
}

export function SiteFooter() {
  const c = usePublicContact();
  const invite = c?.invite || '/contact';
  return (
    <footer className="border-t border-[var(--site-line)] bg-[var(--site-deep)]">
      <div className={`${WRAP} grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]`}>
        <div>
          <a href="/" className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="h-8 w-8" />
            <span className="cm-display text-xl font-bold">Community Manager</span>
          </a>
          <p className="mt-4 max-w-sm text-[15px] text-[var(--site-muted)]">The all-in-one bot and dashboard for Discord communities that recruit, grow and look after their members.</p>
          <MadeInIndia className="mt-5 text-[15px] font-semibold" />
        </div>
        <FooterCol title="Product" links={[['Features', '/#features'], ['Compare', '/#compare'], ['Security', '/#security'], ['Dashboard', '/servers']]} />
        <FooterCol title="Help" links={[['Contact us', '/contact'], ['Support', '/support'], ['Privacy', '/privacy'], ['Terms', '/terms']]} />
        <div>
          <h4 className="text-[13px] font-semibold uppercase tracking-[.14em] text-[var(--site-muted)]">Talk to the developer</h4>
          <div className="mt-4 flex items-center gap-3">
            {c?.owner?.avatar ? <img src={c.owner.avatar} alt="" className="h-11 w-11 rounded-full" /> : <div className="h-11 w-11 rounded-full bg-[var(--site-panel)]" />}
            <div className="leading-tight">
              <div className="font-semibold">Kunal Pareek</div>
              {c?.owner && <div className="text-[14px] text-[var(--site-muted)]">@{c.owner.username} on Discord</div>}
            </div>
          </div>
          <a href={invite} target={c?.invite ? '_blank' : undefined} rel="noopener noreferrer" className="cm-btn-ghost mt-5 !py-2 text-[15px]">
            <DiscordLogo className="h-5 w-5 text-[#8EA1FF]" /> Kunal Pareek
          </a>
        </div>
      </div>
      <div className={`${WRAP} flex flex-col gap-2 border-t border-[var(--site-line)] py-6 text-[14px] text-[var(--site-muted)] sm:flex-row sm:justify-between`}>
        <span>© {new Date().getFullYear()} Kunal Pareek. Community Manager is not affiliated with Discord Inc.</span>
        <span>Also by Kunal: SocialCord Notifier, The Social Media Alert Bot for Discord.</span>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h4 className="text-[13px] font-semibold uppercase tracking-[.14em] text-[var(--site-muted)]">{title}</h4>
      <ul className="mt-4 space-y-2.5 text-[15px]">
        {links.map(([l, h]) => <li key={h}><a href={h} className="text-[var(--site-text)]/85 hover:text-[var(--site-text)]">{l}</a></li>)}
      </ul>
    </div>
  );
}

/** Discord logo mark (used only to link to our Discord server). */
export function DiscordLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 127.14 96.36" className={className} fill="currentColor" aria-label="Discord" role="img">
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.11 0A72.37 72.37 0 0 0 45.64 0a105.89 105.89 0 0 0-26.25 8.09C2.79 32.65-1.71 56.6.54 80.21a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.11 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2a75.57 75.57 0 0 0 64.32 0c.87.71 1.76 1.39 2.66 2a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.1 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.51-51.11-18.9-72.15ZM42.45 65.69C36.18 65.69 31 60 31 53s5-12.74 11.43-12.74S54 46 53.89 53s-5.05 12.69-11.44 12.69Zm42.24 0C78.41 65.69 73.25 60 73.25 53s5-12.74 11.44-12.74S96.23 46 96.12 53s-5.04 12.69-11.43 12.69Z"/>
    </svg>
  );
}
