import React, { useEffect, useState } from 'react';
import {
  ClipboardList, MessagesSquare, ShieldCheck, CalendarDays, Workflow, LineChart, BellRing, LogIn, Plus,
} from 'lucide-react';
import { getAddToDiscordUrl, getDiscordLoginUrl } from '../../lib/discordUrls.js';

/** Public website at "/". Logged-in visitors get a direct way back to their servers. */
export function SiteLanding() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    fetch('/api/v1/auth/session', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setSignedIn(Boolean(j?.data?.authenticated)))
      .catch(() => setSignedIn(false));
  }, []);

  const loginHref = signedIn ? '/servers' : getDiscordLoginUrl();
  const addHref = getAddToDiscordUrl();

  return (
    <div className="cm-site">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="/" className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="cm-display text-xl font-bold">Community Manager</span>
        </a>
        <nav className="flex items-center gap-2 sm:gap-6">
          <a href="#features" className="hidden text-[15px] text-[var(--site-muted)] hover:text-[var(--site-text)] sm:inline">Features</a>
          <a href="#start" className="hidden text-[15px] text-[var(--site-muted)] hover:text-[var(--site-text)] sm:inline">Get started</a>
          <a href={loginHref} className="cm-btn-ghost !py-2 text-[15px]">
            <LogIn className="h-4 w-4" aria-hidden />
            {signedIn ? 'My servers' : 'Log in'}
          </a>
        </nav>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
          <div>
            <h1 className="text-[clamp(2.6rem,6vw,4.4rem)] font-extrabold">
              Run your Discord community from one place.
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg text-[var(--site-muted)]">
              Take applications, hold interviews, welcome new members, keep chat safe and see what is
              working. Everything happens inside Discord, with a dashboard to manage it all.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href={addHref} className="cm-btn-primary">
                <Plus className="h-4 w-4" aria-hidden />
                Add to Discord
              </a>
              <a href={loginHref} className="cm-btn-ghost">
                {signedIn ? 'Open my servers' : 'Log in with Discord'}
              </a>
            </div>
            <p className="mt-5 text-[15px] text-[var(--site-muted)]">Free. No credit card. Online 24/7.</p>
          </div>

          <RecruitmentBoard />
        </section>

        {/* Features */}
        <section id="features" className="border-t border-[var(--site-line)] bg-[var(--site-panel)]/40">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <h2 className="max-w-2xl text-[clamp(2rem,4vw,2.9rem)] font-bold">
              Built for communities that grow on purpose
            </h2>
            <div className="mt-12 grid gap-x-14 gap-y-10 md:grid-cols-2">
              <Feature icon={ClipboardList} title="Recruitment">
                Custom application forms, review queues with approve and reject from Discord, recruiter codes
                and referral tracking.
              </Feature>
              <Feature icon={MessagesSquare} title="Interviews and onboarding">
                Schedule interviews, run them in voice channels, then give roles and a welcome message
                automatically.
              </Feature>
              <Feature icon={ShieldCheck} title="Moderation and safety">
                Warnings, blacklists, auto-moderation rules and a full record of every action your team takes.
              </Feature>
              <Feature icon={CalendarDays} title="Events and engagement">
                Announcements, polls, events with sign-ups and reminders, and campaigns to bring members back.
              </Feature>
              <Feature icon={Workflow} title="Automations">
                Set it once: role changes, follow-ups and reminders run on their own, even while you sleep.
              </Feature>
              <Feature icon={LineChart} title="Insights">
                See where applicants drop off, who stays, and which recruiters bring active members.
              </Feature>
            </div>
          </div>
        </section>

        {/* Getting started — a real sequence */}
        <section id="start" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="text-[clamp(2rem,4vw,2.9rem)] font-bold">Up and running in three steps</h2>
          <ol className="mt-12 grid gap-10 md:grid-cols-3">
            <Step n={1} title="Add the bot">Invite Community Manager to your server. It only asks for the permissions it uses.</Step>
            <Step n={2} title="Pick your server">Log in with Discord and choose the server you want to manage.</Step>
            <Step n={3} title="Turn on what you need">Follow the short setup: application form, roles, welcome channel. Change anything later.</Step>
          </ol>
        </section>

        {/* SocialCord */}
        <section className="border-y border-[var(--site-line)]">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-14 sm:px-8 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <BellRing className="mt-1 h-7 w-7 shrink-0 text-[var(--site-signal)]" aria-hidden />
              <div>
                <h3 className="text-2xl font-bold">Also posting from Instagram or YouTube?</h3>
                <p className="mt-2 max-w-xl text-[var(--site-muted)]">
                  Switch on SocialCord Notifier from your dashboard to share new posts in your channels. It has
                  its own settings page, one click away.
                </p>
              </div>
            </div>
            <a href={loginHref} className="cm-btn-ghost self-start md:self-auto">Manage in dashboard</a>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 text-[15px] text-[var(--site-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <span>Community Manager for Discord</span>
        <nav className="flex gap-6">
          <a href="/support" className="hover:text-[var(--site-text)]">Support</a>
          <a href="/privacy" className="hover:text-[var(--site-text)]">Privacy</a>
          <a href="/terms" className="hover:text-[var(--site-text)]">Terms</a>
        </nav>
      </footer>
    </div>
  );
}

function Feature({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <Icon className="mt-1 h-6 w-6 shrink-0 text-[var(--site-signal)]" aria-hidden />
      <div>
        <h3 className="text-xl font-bold">{title}</h3>
        <p className="mt-2 max-w-[30rem] text-[var(--site-muted)]">{children}</p>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="border-l-2 border-[var(--site-rose)] pl-5">
      <span className="cm-display text-4xl font-extrabold text-[var(--site-rose)]">{n}</span>
      <h3 className="mt-3 text-xl font-bold">{title}</h3>
      <p className="mt-2 text-[var(--site-muted)]">{children}</p>
    </li>
  );
}

/** Hero illustration: one applicant moving through a recruitment pipeline. Clearly an example. */
function RecruitmentBoard() {
  const stages = ['Applied', 'Interview', 'Member'];
  return (
    <figure className="rounded-[22px] border border-[var(--site-line)] bg-[var(--site-panel)] p-5 shadow-[0_30px_80px_-30px_rgba(124,140,255,.45)] sm:p-7">
      <div className="flex items-center justify-between text-[15px]">
        <span className="font-semibold">#recruitment</span>
        <span className="text-[var(--site-muted)]">Example</span>
      </div>

      <div className="relative mt-6">
        <div className="grid grid-cols-3 text-center text-[14px] text-[var(--site-muted)]">
          {stages.map((s) => <span key={s}>{s}</span>)}
        </div>
        <div className="relative mt-3 h-[76px] rounded-2xl bg-[var(--site-night)]">
          <div className="cm-advance absolute inset-y-0 left-0 flex w-1/3 items-center justify-center p-2">
            <div className="flex w-full items-center gap-2.5 rounded-xl bg-[#262E63] px-3 py-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--site-signal)] font-bold text-[#121735]">A</div>
              <div className="min-w-0 text-left leading-tight">
                <div className="truncate text-[14px] font-semibold">aria.wav</div>
                <div className="truncate text-[12px] text-[var(--site-muted)]">via code NOVA</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3 text-[15px]">
        <BoardLine color="var(--site-signal)">Application approved by <b>Mod Kai</b></BoardLine>
        <BoardLine color="var(--site-rose)">Interview booked for Friday, 8:00 PM</BoardLine>
        <BoardLine color="#7FE0B0">Roles given: <Chip>Member</Chip> <Chip>Raider</Chip></BoardLine>
      </div>
      <figcaption className="sr-only">Example of an applicant moving from application to member.</figcaption>
    </figure>
  );
}

function BoardLine({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="text-[var(--site-muted)] [&_b]:font-semibold [&_b]:text-[var(--site-text)]">{children}</span>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="ml-1 rounded-md bg-[#262E63] px-2 py-0.5 text-[13px] text-[var(--site-text)]">{children}</span>;
}
