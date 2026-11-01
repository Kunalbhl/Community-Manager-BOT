import React, { useEffect, useState } from 'react';
import { LogIn, Plus, Menu, MessagesSquare } from 'lucide-react';
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
            <MessagesSquare className="h-4 w-4" aria-hidden /> Development Area & Feedback
          </a>
        </div>
      </div>
      <div className={`${WRAP} flex flex-col gap-2 border-t border-[var(--site-line)] py-6 text-[14px] text-[var(--site-muted)] sm:flex-row sm:justify-between`}>
        <span>© {new Date().getFullYear()} Kunal Pareek. Community Manager is not affiliated with Discord Inc.</span>
        <span>Also by Kunal: SocialCord Notifier, the social media bot for Discord.</span>
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
