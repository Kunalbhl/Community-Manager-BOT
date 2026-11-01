import React, { useEffect, useState } from 'react';
import {
  ArrowRight, Plus, LogIn, ClipboardList, Mic, PartyPopper, Sparkles, HeartHandshake, Radar, ShieldCheck,
  Lock, KeyRound, Users, BarChart3, Zap, Check, X, Minus, Gamepad2, Palette, GraduationCap, Trophy, Swords,
  Workflow, BellRing, CalendarDays, Gift, Brain, Bot, Layers, Menu,
} from 'lucide-react';
import { getAddToDiscordUrl, getDiscordLoginUrl } from '../../lib/discordUrls.js';

/* ------------------------------------------------------------------ */
/* Public website at "/"                                               */
/* ------------------------------------------------------------------ */
export function SiteLanding() {
  const [signedIn, setSignedIn] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    fetch('/api/v1/auth/session', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setSignedIn(Boolean(j?.data?.authenticated)))
      .catch(() => setSignedIn(false));
  }, []);

  const loginHref = signedIn ? '/servers' : getDiscordLoginUrl();
  const addHref = getAddToDiscordUrl();
  const nav = [
    ['Lifecycle', '#lifecycle'], ['Features', '#features'], ['Compare', '#compare'], ['Security', '#security'], ['FAQ', '#faq'],
  ];

  return (
    <div className="cm-site cm-grain">
      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-40 border-b border-[var(--site-line)]/60 bg-[var(--site-night)]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
          <a href="/" className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="h-8 w-8" />
            <span className="cm-display text-[19px] font-bold">Community Manager</span>
          </a>
          <nav className="hidden items-center gap-7 lg:flex">
            {nav.map(([l, h]) => (
              <a key={h} href={h} className="text-[15px] text-[var(--site-muted)] transition hover:text-[var(--site-text)]">{l}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <a href={loginHref} className="cm-btn-ghost hidden !py-2 text-[15px] sm:inline-flex">
              <LogIn className="h-4 w-4" aria-hidden /> {signedIn ? 'My servers' : 'Log in'}
            </a>
            <a href={addHref} className="cm-btn-primary !py-2 text-[15px]">
              <Plus className="h-4 w-4" aria-hidden /> Add to Discord
            </a>
            <button className="grid h-10 w-10 place-items-center rounded-full border border-[var(--site-line)] lg:hidden" onClick={() => setMenu(!menu)} aria-label="Menu" aria-expanded={menu}>
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
        {menu && (
          <nav className="flex flex-col gap-1 border-t border-[var(--site-line)] px-5 py-3 lg:hidden">
            {nav.map(([l, h]) => <a key={h} href={h} onClick={() => setMenu(false)} className="py-2 text-[var(--site-muted)]">{l}</a>)}
            <a href={loginHref} className="py-2 font-semibold">{signedIn ? 'My servers' : 'Log in with Discord'}</a>
          </nav>
        )}
      </header>

      <main>
        {/* ---------- Hero ---------- */}
        <section className="relative overflow-hidden">
          <div className="cm-aurora" aria-hidden />
          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:pt-24">
            <div>
              <span className="cm-eyebrow"><span className="cm-live" /> Online 24/7 · Free for every server</span>
              <h1 className="mt-6 text-[clamp(2.8rem,6.4vw,5.2rem)] font-extrabold">
                The command center for <span className="cm-gradient-text">serious Discord communities.</span>
              </h1>
              <p className="mt-6 max-w-[36rem] text-lg text-[var(--site-muted)] sm:text-xl">
                Recruit, interview, welcome, engage and protect your members with one bot and one dashboard.
                Replace the stack of single-purpose bots, spreadsheets and Google Forms your team juggles today.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href={addHref} className="cm-btn-primary text-[17px]"><Plus className="h-5 w-5" aria-hidden /> Add to Discord, free</a>
                <a href={loginHref} className="cm-btn-ghost text-[17px]">{signedIn ? 'Open my servers' : 'Open the dashboard'} <ArrowRight className="h-4 w-4" aria-hidden /></a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-[var(--site-muted)]">
                {['No credit card', 'Setup in about 5 minutes', 'Works inside Discord'].map((t) => (
                  <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 text-[var(--site-mint)]" aria-hidden /> {t}</li>
                ))}
              </ul>
            </div>
            <CommandCenterMock />
          </div>
        </section>

        {/* ---------- Problem: bot sprawl ---------- */}
        <section className="border-y border-[var(--site-line)] bg-[var(--site-deep)]">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-24 sm:px-8 lg:grid-cols-2 lg:items-center">
            <div>
              <p className="cm-kicker">The problem</p>
              <h2 className="mt-3 text-[clamp(2rem,4vw,3.2rem)] font-bold">Growing communities run on duct tape.</h2>
              <p className="mt-5 text-lg text-[var(--site-muted)]">
                A welcome bot here, a moderation bot there, applications in a Google Form, interview notes in DMs,
                and a spreadsheet nobody updates. Every tool sees one slice. Nobody sees the whole member.
              </p>
              <p className="mt-4 text-lg text-[var(--site-text)]">
                Community Manager follows each member from their first application to their hundredth event,
                so your team finally works from the same picture.
              </p>
            </div>
            <SprawlVisual />
          </div>
        </section>

        {/* ---------- Lifecycle ---------- */}
        <Lifecycle />

        {/* ---------- Feature modules ---------- */}
        <section id="features" className="border-t border-[var(--site-line)] bg-[var(--site-deep)]">
          <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
            <p className="cm-kicker">Everything included</p>
            <h2 className="mt-3 max-w-3xl text-[clamp(2rem,4vw,3.2rem)] font-bold">Eight modules. One bot. Zero paywalls.</h2>
            <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-[var(--site-line)] bg-[var(--site-line)] sm:grid-cols-2 lg:grid-cols-4">
              {MODULES.map((m) => (
                <div key={m.title} className="group bg-[var(--site-night)] p-7 transition hover:bg-[var(--site-panel)]">
                  <m.icon className="h-7 w-7 text-[var(--site-signal)] transition group-hover:scale-110" aria-hidden />
                  <h3 className="mt-5 text-xl font-bold">{m.title}</h3>
                  <ul className="mt-4 space-y-2 text-[15px] text-[var(--site-muted)]">
                    {m.points.map((p) => <li key={p} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--site-rose)]" />{p}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Team roles ---------- */}
        <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:items-center">
            <div>
              <p className="cm-kicker">Built for teams</p>
              <h2 className="mt-3 text-[clamp(2rem,4vw,3.2rem)] font-bold">Everyone gets the right keys. Nobody gets all of them.</h2>
              <p className="mt-5 text-lg text-[var(--site-muted)]">
                Give recruiters the review queue, interviewers their schedule and moderators their cases, without
                handing out Discord admin. Every action is logged with who did it and when.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {ROLES.map((r) => (
                <div key={r.name} className="rounded-2xl border border-[var(--site-line)] bg-[var(--site-panel)]/60 p-5">
                  <div className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ background: r.color }} />
                    <span className="cm-display text-lg font-bold">{r.name}</span>
                  </div>
                  <p className="mt-2 text-[15px] text-[var(--site-muted)]">{r.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- AI ---------- */}
        <section className="relative overflow-hidden border-y border-[var(--site-line)] bg-[var(--site-deep)]">
          <div className="cm-aurora cm-aurora-right" aria-hidden />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-24 sm:px-8 lg:grid-cols-2 lg:items-center">
            <AiMock />
            <div>
              <p className="cm-kicker">Community Brain</p>
              <h2 className="mt-3 text-[clamp(2rem,4vw,3.2rem)] font-bold">An analyst that never sleeps. A co-pilot that always asks first.</h2>
              <p className="mt-5 text-lg text-[var(--site-muted)]">
                Community Brain reads the signals your server already produces and tells you what needs attention:
                members going quiet, applications stuck in review, recruiters whose referrals stay.
              </p>
              <ul className="mt-6 space-y-3 text-[16px]">
                {['Summaries of each application before you review it', 'Retention risk spotted early, with a suggested next step', 'Nothing happens until a human approves it'].map((t) => (
                  <li key={t} className="flex gap-3"><Sparkles className="mt-1 h-5 w-5 shrink-0 text-[var(--site-rose)]" aria-hidden />{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ---------- Comparison ---------- */}
        <section id="compare" className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
          <p className="cm-kicker">Why choose it</p>
          <h2 className="mt-3 max-w-3xl text-[clamp(2rem,4vw,3.2rem)] font-bold">One connected system beats five disconnected tools.</h2>
          <div className="mt-12 overflow-x-auto rounded-3xl border border-[var(--site-line)]">
            <table className="w-full min-w-[720px] text-left text-[15px]">
              <thead>
                <tr className="bg-[var(--site-panel)]">
                  <th className="p-5 font-semibold text-[var(--site-muted)]">What you need</th>
                  <th className="p-5"><span className="cm-display text-lg font-bold text-[var(--site-text)]">Community Manager</span></th>
                  <th className="p-5 font-semibold text-[var(--site-muted)]">A stack of single-purpose bots</th>
                  <th className="p-5 font-semibold text-[var(--site-muted)]">Forms + spreadsheets</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map(([need, a, b, c]) => (
                  <tr key={need as string} className="border-t border-[var(--site-line)]">
                    <td className="p-5 font-medium">{need}</td>
                    <td className="bg-[var(--site-signal)]/[.06] p-5"><Mark v={a} /></td>
                    <td className="p-5"><Mark v={b} /></td>
                    <td className="p-5"><Mark v={c} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-[14px] text-[var(--site-muted)]">“Partly” means it usually needs another tool, a paid tier or manual work.</p>
        </section>

        {/* ---------- Security ---------- */}
        <section id="security" className="border-y border-[var(--site-line)] bg-[var(--site-deep)]">
          <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
            <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
              <div>
                <p className="cm-kicker">Security</p>
                <h2 className="mt-3 text-[clamp(2rem,4vw,3.2rem)] font-bold">Your community’s data stays your community’s.</h2>
                <p className="mt-5 text-lg text-[var(--site-muted)]">
                  We never ask for your Discord password and never sell data. Sign-in goes through Discord itself, and
                  the bot only requests the permissions it uses.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {SECURITY.map((s) => (
                  <div key={s.title} className="rounded-2xl border border-[var(--site-line)] bg-[var(--site-night)] p-6">
                    <s.icon className="h-6 w-6 text-[var(--site-mint)]" aria-hidden />
                    <h3 className="mt-4 text-lg font-bold">{s.title}</h3>
                    <p className="mt-2 text-[15px] text-[var(--site-muted)]">{s.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Use cases ---------- */}
        <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
          <p className="cm-kicker">Made for</p>
          <h2 className="mt-3 text-[clamp(2rem,4vw,3.2rem)] font-bold">Any community that chooses its members.</h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {USES.map((u) => (
              <div key={u.title} className="rounded-2xl border border-[var(--site-line)] p-6 transition hover:-translate-y-1 hover:border-[var(--site-signal)]">
                <u.icon className="h-7 w-7 text-[var(--site-rose)]" aria-hidden />
                <h3 className="mt-4 text-lg font-bold">{u.title}</h3>
                <p className="mt-2 text-[15px] text-[var(--site-muted)]">{u.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- SocialCord ---------- */}
        <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
          <div className="flex flex-col gap-6 rounded-3xl border border-[var(--site-line)] bg-gradient-to-r from-[var(--site-panel)] to-[var(--site-deep)] p-8 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <BellRing className="mt-1 h-8 w-8 shrink-0 text-[var(--site-signal)]" aria-hidden />
              <div>
                <h3 className="text-2xl font-bold">Also posting on Instagram?</h3>
                <p className="mt-2 max-w-xl text-[var(--site-muted)]">Switch on SocialCord Notifier from your dashboard to share new posts in your channels automatically.</p>
              </div>
            </div>
            <a href={loginHref} className="cm-btn-ghost shrink-0 self-start md:self-auto">Turn it on <ArrowRight className="h-4 w-4" aria-hidden /></a>
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section id="faq" className="border-t border-[var(--site-line)] bg-[var(--site-deep)]">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[1fr_1.6fr]">
            <div>
              <p className="cm-kicker">Questions</p>
              <h2 className="mt-3 text-[clamp(2rem,4vw,3.2rem)] font-bold">Good to know</h2>
            </div>
            <div className="divide-y divide-[var(--site-line)] border-y border-[var(--site-line)]">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                    {q}
                    <Plus className="h-5 w-5 shrink-0 text-[var(--site-signal)] transition group-open:rotate-45" aria-hidden />
                  </summary>
                  <p className="mt-3 max-w-2xl text-[var(--site-muted)]">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- Final CTA ---------- */}
        <section className="relative overflow-hidden">
          <div className="cm-aurora" aria-hidden />
          <div className="relative mx-auto max-w-4xl px-5 py-28 text-center sm:px-8">
            <h2 className="text-[clamp(2.4rem,5vw,4rem)] font-extrabold">Build the community <span className="cm-gradient-text">people apply to join.</span></h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-[var(--site-muted)]">Add the bot, pick your server, and run your first application today.</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <a href={addHref} className="cm-btn-primary text-[17px]"><Plus className="h-5 w-5" aria-hidden /> Add to Discord</a>
              <a href={loginHref} className="cm-btn-ghost text-[17px]">{signedIn ? 'My servers' : 'Log in with Discord'}</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--site-line)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 text-[15px] text-[var(--site-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="h-6 w-6" />
            <span>Community Manager for Discord. Not affiliated with Discord Inc.</span>
          </div>
          <nav className="flex gap-6">
            <a href="/support" className="hover:text-[var(--site-text)]">Support</a>
            <a href="/privacy" className="hover:text-[var(--site-text)]">Privacy</a>
            <a href="/terms" className="hover:text-[var(--site-text)]">Terms</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */
const MODULES = [
  { icon: ClipboardList, title: 'Recruitment', points: ['Custom application forms', 'Review queue with approve / reject in Discord', 'Recruiter codes and referral tracking'] },
  { icon: Mic, title: 'Interviews', points: ['Scheduling with DM reminders', 'Voice-channel interviews', 'Optional Google Calendar sync'] },
  { icon: PartyPopper, title: 'Onboarding', points: ['Roles given on approval', 'Welcome messages and DMs', 'Guided first steps for new members'] },
  { icon: ShieldCheck, title: 'Moderation', points: ['Warnings, cases and blacklists', 'Auto-moderation rules', 'Full audit trail of staff actions'] },
  { icon: CalendarDays, title: 'Events', points: ['Events with sign-ups', 'Announcements and polls', 'Reminders before start'] },
  { icon: HeartHandshake, title: 'Engagement', points: ['Win-back campaigns', 'Rewards and recognition', 'Activity streaks'] },
  { icon: Workflow, title: 'Automations', points: ['Triggers on joins, approvals, inactivity', 'Follow-ups that run while you sleep', 'Daily digests for reviewers'] },
  { icon: BarChart3, title: 'Insights', points: ['Application funnel and drop-off', 'Retention by recruiter and cohort', 'AI suggestions you approve'] },
];

const ROLES = [
  { name: 'Owner', color: '#FF5C8A', text: 'Full control of the server, its settings and who is on staff.' },
  { name: 'Controller', color: '#7C8CFF', text: 'Runs day-to-day operations, settings and staff assignments.' },
  { name: 'Recruiter', color: '#FFC46B', text: 'Reviews applications and tracks their own referral codes.' },
  { name: 'Interviewer', color: '#7FE0B0', text: 'Sees their interview schedule and records outcomes.' },
];

type MarkV = 'yes' | 'no' | 'part';
const COMPARE: [string, MarkV, MarkV, MarkV][] = [
  ['Application forms inside Discord', 'yes', 'part', 'no'],
  ['Review, approve and give roles in one click', 'yes', 'part', 'no'],
  ['Interview scheduling and reminders', 'yes', 'no', 'part'],
  ['Recruiter referral tracking', 'yes', 'no', 'part'],
  ['Moderation with a shared case history', 'yes', 'yes', 'no'],
  ['Events, polls and engagement campaigns', 'yes', 'part', 'no'],
  ['One member timeline across everything', 'yes', 'no', 'no'],
  ['Staff roles without Discord admin', 'yes', 'part', 'part'],
  ['AI insights you approve', 'yes', 'no', 'no'],
  ['Every feature free', 'yes', 'part', 'yes'],
];

const SECURITY = [
  { icon: KeyRound, title: 'Discord sign-in only', text: 'Official Discord login. We never see or store your password.' },
  { icon: Lock, title: 'Encrypted secrets', text: 'Connected-account tokens are encrypted at rest and never sent to your browser.' },
  { icon: ShieldCheck, title: 'Hardened website', text: 'Protection against cross-site attacks, clickjacking and injected scripts on every page.' },
  { icon: Layers, title: 'Least privilege', text: 'Staff only see what their role allows, and every action is recorded.' },
];

const USES = [
  { icon: Gamepad2, title: 'Gaming clans', text: 'Trials, rosters and raid sign-ups.' },
  { icon: Trophy, title: 'Esports teams', text: 'Tryouts, scouting and scrim schedules.' },
  { icon: Palette, title: 'Creator communities', text: 'Fan applications and member perks.' },
  { icon: GraduationCap, title: 'Study groups', text: 'Cohorts, sessions and check-ins.' },
  { icon: Swords, title: 'Roleplay servers', text: 'Character applications and lore staff.' },
];

const FAQ: [string, string][] = [
  ['Is it really free?', 'Yes. Every module is included for every server, with no premium tier and no credit card.'],
  ['What permissions does the bot need?', 'Only what its features use: managing roles for onboarding, sending messages and DMs, and reading the channels you point it at. You can review them on the Discord invite screen.'],
  ['Do my members need to sign up for anything?', 'No. Applicants apply with slash commands or a form inside Discord. Only your staff use the dashboard, and they log in with Discord.'],
  ['Does it replace my moderation bot?', 'For most servers, yes: warnings, cases, blacklists and auto-moderation rules are built in. You can also run it alongside your current bots while you switch.'],
  ['Is it online all the time?', 'Yes. The bot runs 24/7 with automatic failover, so applications and reminders keep working while you sleep.'],
  ['Do I need Google Calendar?', 'No. Reminders arrive as Discord DMs. Calendar sync is an optional extra for interviewers who want it.'],
];

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */
function Mark({ v }: { v: MarkV }) {
  if (v === 'yes') return <span className="inline-flex items-center gap-2 text-[var(--site-mint)]"><Check className="h-5 w-5" aria-hidden /> Yes</span>;
  if (v === 'part') return <span className="inline-flex items-center gap-2 text-[#FFC46B]"><Minus className="h-5 w-5" aria-hidden /> Partly</span>;
  return <span className="inline-flex items-center gap-2 text-[var(--site-muted)]/70"><X className="h-5 w-5" aria-hidden /> No</span>;
}

const STAGES = [
  { key: 'Attract', icon: Radar, title: 'Recruiters bring the right people', text: 'Each recruiter gets their own code. You see who brings members that stay, not just members that join.', bullets: ['Personal recruiter codes', 'Referral leaderboard', 'Portal link to share anywhere'] },
  { key: 'Apply', icon: ClipboardList, title: 'Applications that feel native', text: 'Applicants answer your questions with /apply inside Discord. Reviewers get a DM the moment it lands.', bullets: ['Custom questions and requirements', 'Instant reviewer DMs', 'Daily digest of anything waiting'] },
  { key: 'Interview', icon: Mic, title: 'Interviews that actually happen', text: 'Book a slot, and both sides get reminders 60 and 10 minutes before. Notes and outcomes stay on the record.', bullets: ['Scheduling and voice channels', 'DM reminders, optional Calendar', 'Scorecards and outcomes'] },
  { key: 'Welcome', icon: PartyPopper, title: 'Day one, handled', text: 'Approval gives roles, posts the welcome and DMs the new member their first steps, automatically.', bullets: ['Automatic roles', 'Welcome message and DM', 'Onboarding checklist'] },
  { key: 'Engage', icon: Zap, title: 'Keep the energy up', text: 'Events, polls, announcements and rewards that keep members showing up week after week.', bullets: ['Events with sign-ups', 'Polls and announcements', 'Rewards and recognition'] },
  { key: 'Retain', icon: Gift, title: 'Catch members before they drift', text: 'See who is going quiet and bring them back with a campaign, before they leave for good.', bullets: ['Inactivity signals', 'Win-back campaigns', 'Retention by cohort'] },
];

function Lifecycle() {
  const [i, setI] = useState(0);
  const s = STAGES[i];
  return (
    <section id="lifecycle" className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
      <p className="cm-kicker">The member lifecycle</p>
      <h2 className="mt-3 max-w-3xl text-[clamp(2rem,4vw,3.2rem)] font-bold">From stranger to regular, one connected journey.</h2>
      <div className="mt-12 flex gap-2 overflow-x-auto pb-2" role="tablist">
        {STAGES.map((st, n) => (
          <button key={st.key} role="tab" aria-selected={n === i} onClick={() => setI(n)}
            className={`flex shrink-0 items-center gap-2 rounded-full border px-5 py-2.5 text-[15px] font-semibold transition ${n === i ? 'border-[var(--site-rose)] bg-[var(--site-rose)] text-[#1A0610]' : 'border-[var(--site-line)] text-[var(--site-muted)] hover:text-[var(--site-text)]'}`}>
            <span className="opacity-60">{String(n + 1).padStart(2, '0')}</span> {st.key}
          </button>
        ))}
      </div>
      <div key={s.key} className="cm-fade mt-8 grid gap-10 rounded-3xl border border-[var(--site-line)] bg-[var(--site-panel)]/50 p-8 sm:p-10 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <s.icon className="h-10 w-10 text-[var(--site-signal)]" aria-hidden />
          <h3 className="mt-5 text-3xl font-bold">{s.title}</h3>
          <p className="mt-4 max-w-xl text-lg text-[var(--site-muted)]">{s.text}</p>
        </div>
        <ul className="space-y-3 self-center">
          {s.bullets.map((b) => (
            <li key={b} className="flex items-center gap-3 rounded-xl bg-[var(--site-night)] px-5 py-4 text-[16px]">
              <Check className="h-5 w-5 text-[var(--site-mint)]" aria-hidden /> {b}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CommandCenterMock() {
  const feed = [
    { c: 'var(--site-signal)', t: <>New application from <b>aria.wav</b></>, s: 'just now' },
    { c: 'var(--site-mint)', t: <>Approved by <b>Mod Kai</b>, roles given</>, s: '2m' },
    { c: 'var(--site-rose)', t: <>Interview with <b>dex</b> in 10 minutes</>, s: '8m' },
    { c: '#FFC46B', t: <><b>12 members</b> signed up for Raid Night</>, s: '21m' },
  ];
  const bars = [30, 42, 38, 55, 48, 70, 64, 82, 76, 94];
  return (
    <figure className="relative">
      <div className="absolute -inset-6 rounded-[36px] bg-[var(--site-signal)]/10 blur-3xl" aria-hidden />
      <div className="relative overflow-hidden rounded-[26px] border border-[var(--site-line)] bg-[var(--site-panel)] shadow-[0_40px_120px_-40px_rgba(124,140,255,.6)]">
        <div className="flex items-center justify-between border-b border-[var(--site-line)] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--site-rose)] text-sm font-bold text-[#1A0610]">N</div>
            <span className="font-semibold">Nova Guild</span>
            <span className="rounded-full bg-[var(--site-mint)]/15 px-2 py-0.5 text-[12px] font-semibold text-[var(--site-mint)]">Bot online</span>
          </div>
          <span className="text-[13px] text-[var(--site-muted)]">Example</span>
        </div>
        <div className="grid grid-cols-3 gap-px bg-[var(--site-line)]">
          {[['Applications', '12', 'today'], ['Interviews', '4', 'scheduled'], ['New members', '38', 'this week']].map(([l, v, s]) => (
            <div key={l} className="bg-[var(--site-panel)] px-5 py-4">
              <div className="text-[13px] text-[var(--site-muted)]">{l}</div>
              <div className="cm-display mt-1 text-3xl font-extrabold">{v}</div>
              <div className="text-[12px] text-[var(--site-muted)]">{s}</div>
            </div>
          ))}
        </div>
        <div className="grid gap-px bg-[var(--site-line)] sm:grid-cols-[1fr_1.2fr]">
          <div className="bg-[var(--site-panel)] p-5">
            <div className="text-[13px] text-[var(--site-muted)]">Member growth</div>
            <div className="mt-4 flex h-28 items-end gap-1.5">
              {bars.map((h, n) => (
                <div key={n} className="cm-bar flex-1 rounded-t-md bg-gradient-to-t from-[var(--site-signal)]/40 to-[var(--site-signal)]" style={{ height: `${h}%`, animationDelay: `${n * 60}ms` }} />
              ))}
            </div>
          </div>
          <div className="bg-[var(--site-panel)] p-5">
            <div className="text-[13px] text-[var(--site-muted)]">Live activity</div>
            <ul className="mt-3 space-y-2.5">
              {feed.map((f, n) => (
                <li key={n} className="cm-feed flex items-center gap-3 text-[14px]" style={{ animationDelay: `${300 + n * 180}ms` }}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: f.c }} />
                  <span className="min-w-0 flex-1 truncate text-[var(--site-muted)] [&_b]:font-semibold [&_b]:text-[var(--site-text)]">{f.t}</span>
                  <span className="text-[12px] text-[var(--site-muted)]/70">{f.s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">Example dashboard for a fictional server.</figcaption>
    </figure>
  );
}

function SprawlVisual() {
  const tools = ['Welcome bot', 'Mod bot', 'Google Form', 'Spreadsheet', 'Event bot', 'DM threads'];
  return (
    <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-6">
      <div className="space-y-2.5">
        {tools.map((t, n) => (
          <div key={t} className="rounded-xl border border-dashed border-[var(--site-line)] px-4 py-2.5 text-[15px] text-[var(--site-muted)]" style={{ transform: `rotate(${(n % 2 ? 1 : -1) * (n + 1) * 0.6}deg)` }}>
            {t}
          </div>
        ))}
      </div>
      <ArrowRight className="h-8 w-8 text-[var(--site-rose)]" aria-hidden />
      <div className="rounded-3xl border border-[var(--site-signal)]/60 bg-[var(--site-panel)] p-6 text-center shadow-[0_20px_60px_-25px_rgba(124,140,255,.7)]">
        <Bot className="mx-auto h-10 w-10 text-[var(--site-signal)]" aria-hidden />
        <div className="cm-display mt-3 text-xl font-bold">Community Manager</div>
        <div className="mt-1 text-[14px] text-[var(--site-muted)]">One bot. One dashboard. One member timeline.</div>
      </div>
    </div>
  );
}

function AiMock() {
  return (
    <div className="rounded-3xl border border-[var(--site-line)] bg-[var(--site-night)] p-6 shadow-[0_30px_90px_-40px_rgba(255,92,138,.5)]">
      <div className="flex items-center gap-2 text-[14px] text-[var(--site-muted)]"><Brain className="h-4 w-4 text-[var(--site-rose)]" aria-hidden /> Community Brain · Example</div>
      <div className="mt-5 space-y-3">
        {[
          ['Retention', '6 members from the March cohort have been quiet for 10 days.', 'Send win-back DM'],
          ['Recruitment', '3 applications have waited more than 24 hours.', 'Notify reviewers'],
          ['Recruiters', 'Code NOVA brings members who stay 2× longer.', 'View report'],
        ].map(([tag, text, action]) => (
          <div key={tag} className="rounded-2xl border border-[var(--site-line)] bg-[var(--site-panel)] p-4">
            <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--site-signal)]">{tag}</span>
            <p className="mt-1.5 text-[15px]">{text}</p>
            <div className="mt-3 flex gap-2">
              <span className="rounded-full bg-[var(--site-rose)] px-3 py-1 text-[13px] font-semibold text-[#1A0610]">{action}</span>
              <span className="rounded-full border border-[var(--site-line)] px-3 py-1 text-[13px] text-[var(--site-muted)]">Dismiss</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 text-[13px] text-[var(--site-muted)]"><Users className="h-4 w-4" aria-hidden /> Suggestions only. Your team approves every action.</div>
    </div>
  );
}
