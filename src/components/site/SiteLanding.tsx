import React, { useState } from 'react';
import {
  ArrowRight, Plus, LogIn, ClipboardList, Mic, PartyPopper, Sparkles, HeartHandshake, Radar, ShieldCheck,
  Lock, KeyRound, Users, BarChart3, Zap, Check, X, Minus, Gamepad2, Palette, GraduationCap, Trophy, Swords,
  Workflow, BellRing, Ticket, TrendingUp, MousePointerClick, CalendarDays, Gift, Brain, Bot, Layers, Menu,
} from 'lucide-react';
import { getAddToDiscordUrl, getDiscordLoginUrl } from '../../lib/discordUrls.js';
import { SiteHeader, SiteFooter, WRAP, useSignedIn, MadeInIndia } from './SiteChrome.js';

/* ------------------------------------------------------------------ */
/* Public website at "/"                                               */
/* ------------------------------------------------------------------ */
export function SiteLanding() {
  const signedIn = useSignedIn();


  const loginHref = signedIn ? '/servers' : getDiscordLoginUrl();
  const addHref = getAddToDiscordUrl();

  return (
    <div className="cm-site cm-grain">
      {/* ---------- Nav ---------- */}
      <SiteHeader />

      <main>
        {/* ---------- Hero ---------- */}
        <section className="relative overflow-hidden">
          <div className="cm-aurora" aria-hidden />
          <div className={`relative ${WRAP} grid items-center gap-14 pb-24 pt-16 lg:grid-cols-[1fr_1.05fr] lg:pt-24`}>
            <div>
              <div className="flex flex-wrap gap-2"><span className="cm-eyebrow"><span className="cm-live" /> Online 24/7 · Free to get started</span><span className="cm-eyebrow"><MadeInIndia /></span></div>
              <h1 className="mt-6 text-[clamp(2.8rem,6.4vw,5.2rem)] font-extrabold">
                The command center for <span className="cm-gradient-text">serious Discord communities.</span>
              </h1>
              <p className="mt-6 max-w-[36rem] text-lg text-[var(--site-muted)] sm:text-xl">
                Recruit, interview, welcome, engage and protect your members with one bot and one dashboard.
                Replace the stack of single-purpose bots, spreadsheets and Google Forms your team juggles today.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href={addHref} className="cm-btn-primary text-[17px]"><Plus className="h-5 w-5" aria-hidden /> Add to Discord</a>
                <a href={loginHref} className="cm-btn-ghost text-[17px]">{signedIn ? 'Open my servers' : 'Open the dashboard'} <ArrowRight className="h-4 w-4" aria-hidden /></a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-[var(--site-muted)]">
                {['Free to get started', 'Setup in about 5 minutes', 'Works inside Discord'].map((t) => (
                  <li key={t} className="flex items-center gap-2"><Check className="h-4 w-4 text-[var(--site-mint)]" aria-hidden /> {t}</li>
                ))}
              </ul>
            </div>
            <CommandCenterMock />
          </div>
        </section>

        {/* ---------- Problem: bot sprawl ---------- */}
        <section className="border-y border-[var(--site-line)] bg-[var(--site-deep)]">
          <div className={`${WRAP} grid gap-12 py-24 lg:grid-cols-2 lg:items-center`}>
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
        <Catalog />

        {/* ---------- Team roles ---------- */}
        <section className={`${WRAP} py-24`}>
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
          <div className={`relative ${WRAP} grid gap-12 py-24 lg:grid-cols-2 lg:items-center`}>
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
        <section id="compare" className={`${WRAP} py-24`}>
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
          <div className={`${WRAP} py-24`}>
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
        <section className={`${WRAP} py-24`}>
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
        <section className={`${WRAP} pb-24`}>
          <div className="flex flex-col gap-6 rounded-3xl border border-[var(--site-line)] bg-gradient-to-r from-[var(--site-panel)] to-[var(--site-deep)] p-8 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <BellRing className="mt-1 h-8 w-8 shrink-0 text-[var(--site-signal)]" aria-hidden />
              <div>
                <h3 className="text-2xl font-bold">Share your social media in Discord</h3>
                <p className="mt-2 max-w-xl text-[var(--site-muted)]">SocialCord Notifier is The Social Media Alert Bot for Discord: new posts from your social media accounts are announced in your Discord channels automatically. Switch it on from your dashboard.</p>
              </div>
            </div>
            <a href={loginHref} className="cm-btn-ghost shrink-0 self-start md:self-auto">Turn it on <ArrowRight className="h-4 w-4" aria-hidden /></a>
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section id="faq" className="border-t border-[var(--site-line)] bg-[var(--site-deep)]">
          <div className={`${WRAP} grid gap-12 py-24 lg:grid-cols-[1fr_1.6fr]`}>
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
          <div className="relative mx-auto max-w-5xl px-5 py-28 text-center sm:px-8">
            <h2 className="text-[clamp(2.4rem,5vw,4rem)] font-extrabold">Build the community <span className="cm-gradient-text">people apply to join.</span></h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-[var(--site-muted)]">Add the bot, pick your server, and run your first application today.</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <a href={addHref} className="cm-btn-primary text-[17px]"><Plus className="h-5 w-5" aria-hidden /> Add to Discord</a>
              <a href={loginHref} className="cm-btn-ghost text-[17px]">{signedIn ? 'My servers' : 'Log in with Discord'}</a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */
export const CATALOG: { icon: any; title: string; items: string[] }[] = [
  { icon: ClipboardList, title: 'Recruitment', items: ['Custom application forms', '/apply inside Discord', 'Review queue', 'Approve or reject in one click', 'Escalate and flag', 'Reviewer notes', 'Applicant status checks', 'Requirement checks', 'Blacklist screening', 'Applicant portal', 'Role rules on approval', 'Private application chat per applicant', 'Consent to your rules before the interview', 'Rules quiz with a pass mark (score seen by staff only)', 'Automatic or manual screening and interview', 'Secure Setup: newcomers see nothing until approved', 'Recruitment log channel', 'Live Google Sheets record, staff-only /sheet link'] },
  { icon: Radar, title: 'Recruiters & referrals', items: ['Personal recruiter codes', 'Referral tracking', 'Recruiter benefits', 'Recruiter leaderboard', 'Recruiter portal', 'Recruiter performance records', 'Shareable portal links'] },
  { icon: Mic, title: 'Interviews', items: ['Interview scheduling', 'DM reminders 60 and 10 min before', 'Interview sessions inside Discord', 'Recorded answers and outcomes', 'Interview notes', 'Private review room per application', 'Temporary interview voice rooms', 'Escalation by reviewer rank', 'Private staff thread per application', 'AI interview summary for staff', 'Optional Google Calendar sync'] },
  { icon: PartyPopper, title: 'Onboarding', items: ['Roles given on approval', 'Welcome messages', 'Welcome DMs', 'Server rules command', 'Guided setup wizard', 'Setup checklist for admins', 'One-time welcome that thanks whoever added the bot', 'Automatic channel setup (reuses what you have)', 'Server rules imported from your Discord channel'] },
  { icon: Users, title: 'Members', items: ['Member directory sync', 'Member 360 timeline', 'Lifecycle stages', 'Member status lookups', 'Cohorts', 'Search across everything'] },
  { icon: ShieldCheck, title: 'Moderation & safety', items: ['Points-based warning system', 'Automatic timeout, kick or ban', 'Warnings and cases', 'Blacklists', 'Auto-moderation rules', 'Escalation queue', 'Staff audit trail', 'Security audit log'] },
  { icon: CalendarDays, title: 'Events & engagement', items: ['Events with sign-ups', 'Register / Can’t go buttons right in Discord', 'Members-only, everyone or private events', 'Event reminders', 'Announcements', 'Polls', 'Engagement campaigns', 'Re-engagement campaigns', 'Rewards and recognition'] },
  { icon: Workflow, title: 'Automation', items: ['Workflow triggers', 'Scheduled jobs', 'New-application DMs', 'Daily reviewer digests', 'Follow-ups and nudges', 'Notification routing'] },
  { icon: BarChart3, title: 'Insights & AI', items: ['Application funnel', 'Drop-off analysis', 'Retention by cohort', 'Recruiter quality scores', 'Exportable reports', 'Community Brain suggestions', 'Lifecycle intelligence'] },
  { icon: Ticket, title: 'Tickets', items: ['Ticket panel with types', '/ticket command', 'Private ticket channels', 'Staff teams per type', 'Claim and close', 'Transcripts and log channel'] },
  { icon: TrendingUp, title: 'Levels & fun', items: ['Levels and XP', 'Level reward roles', '/rank and /leaderboard', 'Giveaways with entry requirements', 'Starboard highlights', 'Birthday celebrations', 'Custom text commands'] },
  { icon: MousePointerClick, title: 'Roles & entry', items: ['Button self-roles', 'Pick-one or pick-any panels', 'Verification gate', 'Quick-sum check against bots', 'Server activity logs', 'Deleted and edited message logs'] },
  { icon: Zap, title: 'Bulk tools', items: ['Bulk role give / remove', 'Bulk DMs', 'Message many channels', 'Bulk message delete', 'Bulk nickname reset', 'Bulk kick with confirmation', 'Live progress'] },
  { icon: Layers, title: 'Team & platform', items: ['Staff roles and permissions', 'Several Discord roles per staff role', 'Role changes sync to Discord', 'Light, dark or system theme', 'Multi-server workspaces', 'Per-user notification settings', 'Discord diagnostics', 'SocialCord: The Social Media Alert Bot', 'Support command', '24/7 hosting with failover'] },
];

const ROADMAP = ['Multi-language', 'Scheduled messages', 'Server backups', 'Import settings from other bots'];

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
  ['How much does it cost?', 'It is free to get started today, and no credit card is needed to add the bot.'],
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
  { key: 'Interview', icon: Mic, title: 'Interviews that actually happen', text: 'Book a slot, and both sides get reminders 60 and 10 minutes before. Notes and outcomes stay on the record.', bullets: ['Scheduling inside Discord', 'DM reminders, optional Calendar', 'Answers, notes and outcomes'] },
  { key: 'Welcome', icon: PartyPopper, title: 'Day one, handled', text: 'Approval gives roles, posts the welcome and DMs the new member their first steps, automatically.', bullets: ['Automatic roles', 'Welcome message and DM', 'Guided first steps'] },
  { key: 'Engage', icon: Zap, title: 'Keep the energy up', text: 'Events, polls, announcements and rewards that keep members showing up week after week.', bullets: ['Events with sign-ups', 'Polls and announcements', 'Rewards and recognition'] },
  { key: 'Retain', icon: Gift, title: 'Catch members before they drift', text: 'See who is going quiet and bring them back with a campaign, before they leave for good.', bullets: ['Inactivity signals', 'Re-engagement campaigns', 'Retention by cohort'] },
];

function Lifecycle() {
  const [i, setI] = useState(0);
  const s = STAGES[i];
  return (
    <section id="lifecycle" className={`${WRAP} py-24`}>
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
    { c: 'var(--site-signal)', t: <>New application from <b>Rishabh</b></>, s: 'just now' },
    { c: 'var(--site-mint)', t: <>Approved by <b>Kunal</b>, roles given</>, s: '2m' },
    { c: 'var(--site-rose)', t: <>Interview with <b>Sufiyan</b> in 10 minutes</>, s: '8m' },
    { c: '#FFC46B', t: <><b>12 members</b> signed up for Sunday BGMI Scrims</>, s: '21m' },
  ];
  const bars = [30, 42, 38, 55, 48, 70, 64, 82, 76, 94];
  return (
    <figure className="relative">
      <div className="absolute -inset-6 rounded-[36px] bg-[var(--site-signal)]/10 blur-3xl" aria-hidden />
      <div className="relative overflow-hidden rounded-[26px] border border-[var(--site-line)] bg-[var(--site-panel)] shadow-[0_40px_120px_-40px_rgba(124,140,255,.6)]">
        <div className="flex items-center justify-between border-b border-[var(--site-line)] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--site-rose)] text-sm font-bold text-[#1A0610]">B</div>
            <span className="font-semibold">Bharat Esports</span>
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
          ['Retention', '6 members from the March cohort have been quiet for 10 days.', 'Send a check-in DM'],
          ['Recruitment', '3 applications have waited more than 24 hours.', 'Notify reviewers'],
          ['Recruiters', 'Code ASHISH brings members who stay 2× longer.', 'View report'],
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

function Catalog() {
  const total = CATALOG.reduce((n, c) => n + c.items.length, 0);
  const [open, setOpen] = useState(0);
  return (
    <section id="features" className="border-t border-[var(--site-line)] bg-[var(--site-deep)]">
      <div className={`${WRAP} py-24`}>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="cm-kicker">Everything included</p>
            <h2 className="mt-3 max-w-4xl text-[clamp(2rem,4vw,3.4rem)] font-bold">{total}+ capabilities across {CATALOG.length} areas. <span className="cm-gradient-text">One bot.</span></h2>
          </div>
          <p className="max-w-md text-[var(--site-muted)]">Pick an area to see everything inside it. Everything listed here is live today.</p>
        </div>
        <div className="mt-12 grid gap-6 xl:grid-cols-[360px_1fr]">
          <div className="flex gap-2 overflow-x-auto pb-1 xl:flex-col xl:overflow-visible">
            {CATALOG.map((c, n) => (
              <button key={c.title} onClick={() => setOpen(n)}
                className={`flex shrink-0 items-center gap-3 rounded-2xl border px-5 py-3.5 text-left transition ${n === open ? 'border-[var(--site-signal)] bg-[var(--site-panel)]' : 'border-[var(--site-line)] text-[var(--site-muted)] hover:text-[var(--site-text)]'}`}>
                <c.icon className={`h-5 w-5 ${n === open ? 'text-[var(--site-rose)]' : ''}`} aria-hidden />
                <span className="font-semibold">{c.title}</span>
                <span className="ml-auto hidden rounded-full bg-[var(--site-night)] px-2.5 py-0.5 text-[13px] xl:inline">{c.items.length}</span>
              </button>
            ))}
          </div>
          <div key={open} className="cm-fade rounded-3xl border border-[var(--site-line)] bg-[var(--site-night)] p-8 sm:p-10">
            {React.createElement(CATALOG[open].icon, { className: 'h-10 w-10 text-[var(--site-signal)]', 'aria-hidden': true })}
            <h3 className="mt-5 text-3xl font-bold">{CATALOG[open].title}</h3>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {CATALOG[open].items.map((it) => (
                <li key={it} className="flex items-center gap-3 rounded-xl border border-[var(--site-line)] bg-[var(--site-panel)]/50 px-5 py-4"><Check className="h-5 w-5 shrink-0 text-[var(--site-mint)]" aria-hidden />{it}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-14 rounded-3xl border border-dashed border-[var(--site-line)] p-8">
          <div className="flex flex-wrap items-center gap-3">
            <Zap className="h-5 w-5 text-[#FFC46B]" aria-hidden />
            <h3 className="text-xl font-bold">Coming next</h3>
            <span className="text-[15px] text-[var(--site-muted)]">On the roadmap, shaped by our Development Area & Feedback. Not live yet.</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {ROADMAP.map((r) => <span key={r} className="rounded-full border border-[var(--site-line)] px-4 py-2 text-[15px] text-[var(--site-muted)]">{r}</span>)}
          </div>
          <a href="/contact" className="mt-6 inline-flex items-center gap-2 font-semibold text-[var(--site-signal)] hover:underline">Suggest a feature <ArrowRight className="h-4 w-4" aria-hidden /></a>
        </div>
      </div>
    </section>
  );
}
