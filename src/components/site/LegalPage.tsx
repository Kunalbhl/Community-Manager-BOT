import React from 'react';
import { ShieldCheck, FileText, Trash2, Building2, Mail } from 'lucide-react';
import { SiteHeader, SiteFooter, WRAP } from './SiteChrome.js';

/** Public legal pages (/privacy, /terms, /data-deletion) in the site theme. */

const UPDATED = '16 November 2026';
const EMAIL = 'support@chaloone.com';
const COMPANY_URL = 'https://k-tech.chaloone.com';

type Kind = 'privacy' | 'terms' | 'deletion';
type Section = { h: string; body: React.ReactNode };

const Mail_ = () => <a href={`mailto:${EMAIL}`}>{EMAIL}</a>;

const PRIVACY: Section[] = [
  { h: 'Who we are', body: <p>Community Manager is a Discord bot and web dashboard built and operated by <b>K. Tech Services</b>, India (“we”, “us”), owned by Kunal Pareek. We only use data needed to run the features a server turns on. We never see your Discord password, never sell your data and never use it for advertising.</p> },
  { h: 'Information we collect', body: (
    <div className="cm-legal-table">
      {[
        ['Discord login (dashboard)', 'Discord user ID, username, avatar and the servers you belong to or manage (identify, guilds)', 'To sign you in and show the servers you can manage'],
        ['Servers using the bot', 'Server ID and name, channels, roles, member IDs and usernames, join and leave times, and the settings admins choose', 'To run onboarding, roles, stats counters, growth reports and other features'],
        ['Applications and interviews', 'Answers you submit, how you found the server, recruiter code used, status, interview times, reviewer notes and decisions', 'To process applications and let staff review them'],
        ['Recruiter codes and rewards', 'Codes, who joined with them, points, rewards claimed and approvals', 'To credit recruiters and run reward programmes'],
        ['Messages the bot handles', 'Messages sent to the bot or in channels it manages for a feature (application rooms, quizzes, reminders)', 'Only to run that feature; general server chat is not read or stored'],
        ['Technical', 'Logs, errors, basic request data (IP address, browser) and a session cookie', 'To keep the service secure and working'],
      ].map(([a, b, c]) => (
        <div key={a} className="cm-legal-row"><div className="font-semibold text-[var(--site-text)]">{a}</div><div>{b}</div><div className="text-[var(--site-muted)]">{c}</div></div>
      ))}
      <p className="mt-4">If a server turns on optional AI-assisted features, the relevant text (for example an application answer) may be processed by Google’s Gemini API only to produce that result.</p>
    </div>
  ) },
  { h: 'How we use it', body: <p>Only to provide Community Manager’s features to the servers that use it, show information to that server’s staff in the dashboard, send the messages and DMs those features need, prevent abuse and answer support requests.</p> },
  { h: 'Who can see it', body: <p>Server data is visible to that server’s staff according to the roles admins set. We share data only with the services needed to run Community Manager: Discord, and our hosting and database providers (Google Cloud, Cloudflare, Supabase, Oracle Cloud), which process it on our behalf. We may disclose information if required by law.</p> },
  { h: 'Storage and security', body: <p>Data is stored in a managed PostgreSQL database. All traffic uses HTTPS, secrets are stored encrypted, and access is limited to the service and its operator.</p> },
  { h: 'Retention', body: <p>We keep a server’s data while the bot is in that server. Admins can delete records from the dashboard. When the bot is removed or you ask us, we delete the server’s data within 30 days. Security logs are kept for up to 90 days.</p> },
  { h: 'Your choices and rights', body: (
    <>
      <ul>
        <li><b>Members:</b> ask the server’s staff, or us, to see, correct or delete your applications and records.</li>
        <li><b>Admins:</b> remove the bot at any time and ask us to delete the server’s data.</li>
        <li><b>Dashboard access:</b> Discord → User Settings → Authorized Apps → remove Community Manager.</li>
      </ul>
      <p>We follow India’s Digital Personal Data Protection Act, 2023 and, where applicable, laws such as the GDPR. We respond within 30 days. See <a href="/data-deletion">Data deletion</a>.</p>
    </>
  ) },
  { h: 'Children', body: <p>Community Manager follows Discord’s age requirements and is not intended for anyone under 13 (or the minimum age in their country).</p> },
  { h: 'Changes and contact', body: <p>We will update this page if our practices change and show the new date at the top. Questions: <Mail_ />.</p> },
];

const TERMS: Section[] = [
  { h: 'The service', body: <p>These terms apply to Community Manager, the Discord bot and dashboard operated by <b>K. Tech Services</b>. By adding the bot, signing in to the dashboard or applying to a server through it, you agree to them. It provides recruitment, onboarding, engagement and management tools for Discord communities; features may change as we improve the service or as Discord changes its platform.</p> },
  { h: 'Server admins', body: <ul><li>You decide which features run, which questions applicants answer and which staff can see their data.</li><li>You must have a lawful reason to collect what your questions ask, tell members how you use it, and follow Discord’s Terms of Service and Community Guidelines.</li><li>Grant the bot only the permissions its features need.</li></ul> },
  { h: 'Members and applicants', body: <ul><li>Give truthful answers and don’t submit anything you don’t have the right to share.</li><li>Decisions on applications, roles and rewards are made by each server’s staff, not by K. Tech Services.</li></ul> },
  { h: 'Acceptable use', body: <p>Don’t use Community Manager to spam, harass, discriminate, collect data you aren’t entitled to, sell or trade accounts or ranks, or work around Discord’s limits.</p> },
  { h: 'Rewards and codes', body: <p>Recruiter points, rewards and codes are set up and honoured by each server. They have no cash value with K. Tech Services unless a server states otherwise.</p> },
  { h: 'Plans and limits', body: <p>Some features or higher limits may be offered on paid plans; any price is shown before you buy. Fair-use limits keep the service fast for everyone.</p> },
  { h: 'Availability and liability', body: <p>The service is provided “as is” and “as available”. Discord outages, rate limits or missing permissions can delay or stop actions. To the extent allowed by law, K. Tech Services is not liable for indirect or consequential losses, and our total liability is limited to the amount you paid us in the last 12 months (if any).</p> },
  { h: 'Suspension and ending', body: <p>You can stop at any time by removing the bot. We may suspend or end access for use that abuses the service or breaks these terms or Discord’s rules.</p> },
  { h: 'Intellectual property', body: <p>Community Manager, its name, logo, code and design belong to K. Tech Services. All rights reserved. Your server’s content stays yours. Discord is a trademark of Discord Inc.; Community Manager is not affiliated with Discord Inc.</p> },
  { h: 'Changes, law and contact', body: <p>We may update these terms and will show the new date at the top; continued use means you accept them. These terms are governed by the laws of India, and courts in Rajasthan, India have jurisdiction. Contact: <Mail_ />. Our <a href="/privacy">Privacy policy</a> explains how we handle data.</p> },
];

const DELETION: Section[] = [
  { h: 'Members and applicants', body: <ol><li>Ask the server’s staff to delete your application or records from the dashboard, or</li><li>email <Mail_ /> with your Discord user ID and the server name. We confirm and delete within 30 days.</li></ol> },
  { h: 'Server admins', body: <ol><li>Delete records from the dashboard, or remove the bot from your server.</li><li>Email <Mail_ /> with the server ID to delete all of the server’s data. We confirm and delete within 30 days.</li></ol> },
  { h: 'Dashboard sign-in', body: <p>Discord → User Settings → Authorized Apps → remove Community Manager. This ends dashboard access; ask us if you also want your profile data deleted.</p> },
];

const PAGES: Record<Kind, { title: string; kicker: string; lead: string; icon: React.ComponentType<{ className?: string }>; sections: Section[] }> = {
  privacy: { title: 'Privacy policy', kicker: 'Your data', lead: 'What Community Manager collects, why, who can see it and the choices you have.', icon: ShieldCheck, sections: PRIVACY },
  terms: { title: 'Terms of service', kicker: 'The rules', lead: 'The simple agreement between you, your server and K. Tech Services when you use Community Manager.', icon: FileText, sections: TERMS },
  deletion: { title: 'Data deletion', kicker: 'Your control', lead: 'How to have the data Community Manager holds about you or your server deleted.', icon: Trash2, sections: DELETION },
};

export function LegalPage({ kind }: { kind: Kind }) {
  const p = PAGES[kind];
  const Icon = p.icon;
  return (
    <div className="cm-site">
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden">
          <div className="cm-aurora" aria-hidden />
          <div className={`${WRAP} relative pb-14 pt-16 lg:pt-24`}>
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[var(--site-line)] bg-[var(--site-panel)] text-[var(--site-signal)]"><Icon className="h-7 w-7" /></div>
              <p className="cm-kicker">{p.kicker}</p>
            </div>
            <h1 className="mt-5 text-[clamp(2.4rem,5vw,4rem)] font-extrabold">{p.title.split(' ')[0]} <span className="cm-gradient-text">{p.title.split(' ').slice(1).join(' ')}</span></h1>
            <p className="mt-5 max-w-2xl text-lg text-[var(--site-muted)]">{p.lead}</p>
            <p className="mt-4 text-[14px] text-[var(--site-muted)]">Last updated {UPDATED} · Community Manager by <a className="underline decoration-[var(--site-signal)]/50 underline-offset-4 hover:text-[var(--site-text)]" href={COMPANY_URL} target="_blank" rel="noopener noreferrer">K. Tech Services</a></p>
            <nav className="mt-8 flex flex-wrap gap-2 text-[15px]">
              {([['privacy', '/privacy', 'Privacy'], ['terms', '/terms', 'Terms'], ['deletion', '/data-deletion', 'Data deletion']] as const).map(([k, href, label]) => (
                <a key={k} href={href} className={k === kind ? 'cm-btn-primary !py-2 !px-4' : 'cm-btn-ghost !py-2 !px-4'}>{label}</a>
              ))}
            </nav>
          </div>
        </section>

        <section className={`${WRAP} grid gap-10 pb-24 lg:grid-cols-[1fr_300px]`}>
          <div className="space-y-5">
            {p.sections.map((s, i) => (
              <article key={s.h} className="cm-legal-card">
                <h2 className="cm-display text-xl font-bold text-[var(--site-text)]"><span className="mr-2 text-[var(--site-signal)]">{String(i + 1).padStart(2, '0')}</span>{s.h}</h2>
                <div className="cm-legal-body mt-3">{s.body}</div>
              </article>
            ))}
          </div>
          <aside className="lg:sticky lg:top-24 h-fit space-y-4">
            <CompanyCard />
            <div className="cm-legal-card">
              <div className="flex items-center gap-2 font-semibold text-[var(--site-text)]"><Mail className="h-4 w-4 text-[var(--site-signal)]" /> Questions?</div>
              <p className="mt-2 text-[15px] text-[var(--site-muted)]">Email <Mail_ /> or reach the developer through our Discord server on the <a href="/contact">contact page</a>.</p>
            </div>
          </aside>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

/** Compact company facts, shared by the legal and contact pages. */
export function CompanyCard() {
  return (
    <div className="cm-legal-card">
      <div className="flex items-center gap-3">
        <img src="/ktech-logo.svg" alt="K. Tech Services logo" className="h-10 w-10 rounded-xl" />
        <div className="leading-tight">
          <div className="cm-display font-bold text-[var(--site-text)]">K. Tech Services</div>
          <div className="text-[13px] text-[var(--site-muted)]">Maker of Community Manager</div>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-[14px]">
        <dt className="text-[var(--site-muted)]">Owner</dt><dd>Kunal Pareek</dd>
        <dt className="text-[var(--site-muted)]">Company</dt><dd>Udyam-registered MSME, Rajasthan, India</dd>
        <dt className="text-[var(--site-muted)]">Products</dt><dd>Community Manager, SocialCord Notifier, Chalo One, Sanatan Sadhak</dd>
        <dt className="text-[var(--site-muted)]">Contact</dt><dd><Mail_ /></dd>
      </dl>
      <p className="mt-4 flex items-center gap-1.5 text-[12px] text-[var(--site-muted)]"><Building2 className="h-3.5 w-3.5" /> © K. Tech Services. All rights reserved. · <a href={COMPANY_URL} target="_blank" rel="noopener noreferrer">Company site</a></p>
    </div>
  );
}
