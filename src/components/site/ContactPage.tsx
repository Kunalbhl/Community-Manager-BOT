import React, { useState } from 'react';
import { MessagesSquare, Users, Server, Bot, IndianRupee, Clock, Send, CheckCircle2, Handshake, Bug, Lightbulb, Rocket } from 'lucide-react';
import { SiteHeader, SiteFooter, WRAP, usePublicContact, MadeInIndia } from './SiteChrome.js';

const TOPICS = ['Business', 'Collaboration', 'Feedback', 'Bug report', 'Support', 'Other'];
const fmt = (n?: number | null) => (n == null ? '…' : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));

/** "/contact": the developer, the community server, achievements and a message form. */
export function ContactPage() {
  const c = usePublicContact();
  const invite = c?.invite;

  return (
    <div className="cm-site">
      <SiteHeader />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="cm-aurora" aria-hidden />
          <div className={`${WRAP} relative grid gap-12 pb-20 pt-16 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:pt-24`}>
            <div>
              <p className="cm-kicker">Contact us</p>
              <h1 className="mt-4 text-[clamp(2.6rem,5.6vw,4.6rem)] font-extrabold">
                Let’s talk. <span className="cm-gradient-text">We’re on Discord.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg text-[var(--site-muted)] sm:text-xl">
                Questions, ideas, bug reports, business or collaborations: join the Development Area & Feedback in our
                server and talk to the developer directly. The invite never expires.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href={invite || '#form'} target={invite ? '_blank' : undefined} rel="noopener noreferrer" className="cm-btn-primary text-[17px]">
                  <MessagesSquare className="h-5 w-5" aria-hidden /> Join Development Area & Feedback
                </a>
                <a href="#form" className="cm-btn-ghost text-[17px]"><Send className="h-4 w-4" aria-hidden /> Send a message</a>
              </div>
            </div>
            <ServerCard c={c} />
          </div>
        </section>

        {/* Achievements */}
        <section className="border-y border-[var(--site-line)] bg-[var(--site-deep)]">
          <div className={`${WRAP} py-16`}>
            <p className="cm-kicker">What we have built</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat icon={Bot} value="2" label="Discord bots live 24/7" sub="Community Manager and SocialCord Notifier" />
              <Stat icon={Server} value={fmt(c?.stats?.servers)} label="Servers running Community Manager" sub="Live count from the bot" />
              <Stat icon={Users} value={fmt(c?.stats?.members)} label="Members in those servers" sub="Live count from the bot" />
              <Stat icon={IndianRupee} value="₹0" label="Cost to every server" sub="All features, free forever" />
            </div>
          </div>
        </section>

        {/* Developer */}
        <section className={`${WRAP} grid gap-12 py-24 lg:grid-cols-[1fr_1.3fr] lg:items-center`}>
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute -inset-6 rounded-[40px] bg-[var(--site-rose)]/15 blur-3xl" aria-hidden />
            <div className="relative rounded-[32px] border border-[var(--site-line)] bg-[var(--site-panel)] p-8 text-center">
              {c?.owner?.avatar
                ? <img src={c.owner.avatar} alt="Kunal Pareek" className="mx-auto h-32 w-32 rounded-full ring-4 ring-[var(--site-signal)]/40" />
                : <div className="mx-auto grid h-32 w-32 place-items-center rounded-full bg-[var(--site-night)] text-4xl font-bold text-[var(--site-signal)]">KP</div>}
              <div className="cm-display mt-6 text-3xl font-extrabold">Kunal Pareek</div>
              {c?.owner && <div className="mt-1 text-[var(--site-muted)]">@{c.owner.username} on Discord</div>}
              <div className="mt-2 text-[var(--site-muted)]">Founder and developer</div>
              <MadeInIndia className="mt-5 justify-center rounded-full border border-[var(--site-line)] px-4 py-2 text-[15px] font-semibold" />
            </div>
          </div>
          <div>
            <p className="cm-kicker">About the developer</p>
            <h2 className="mt-3 text-[clamp(2rem,4vw,3.2rem)] font-bold">Built in India, for communities everywhere.</h2>
            <p className="mt-5 text-lg text-[var(--site-muted)]">
              I’m Kunal Pareek, and I build Discord bots that take the busywork out of running a community.
              Community Manager handles recruitment, interviews, onboarding, moderation and engagement in one place.
              SocialCord Notifier shares your social media posts in your Discord channels automatically.
            </p>
            <p className="mt-4 text-lg text-[var(--site-muted)]">
              Both are free, run around the clock, and grow from what server owners ask for in our Development Area & Feedback.
              If you have an idea, that is where it starts.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[[Handshake, 'Business and collaborations'], [Lightbulb, 'Feature ideas'], [Bug, 'Bug reports'], [Rocket, 'Help setting up your server']].map(([I, t]: any) => (
                <div key={t} className="flex items-center gap-3 rounded-2xl border border-[var(--site-line)] px-5 py-4"><I className="h-5 w-5 text-[var(--site-rose)]" aria-hidden />{t}</div>
              ))}
            </div>
          </div>
        </section>

        {/* Form */}
        <section id="form" className="border-t border-[var(--site-line)] bg-[var(--site-deep)]">
          <div className={`${WRAP} grid gap-12 py-24 lg:grid-cols-[1fr_1.3fr]`}>
            <div>
              <p className="cm-kicker">Send a message</p>
              <h2 className="mt-3 text-[clamp(2rem,4vw,3.2rem)] font-bold">Prefer to write it down?</h2>
              <p className="mt-5 text-lg text-[var(--site-muted)]">
                Your message is posted in the Development Area & Feedback channel of our server, where the team discusses it.
                Leave your Discord username or email so we can get back to you.
              </p>
              <div className="mt-6 flex items-center gap-3 text-[var(--site-muted)]"><Clock className="h-5 w-5" aria-hidden /> We usually reply within a day.</div>
            </div>
            <ContactForm invite={invite} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function ServerCard({ c }: { c: ReturnType<typeof usePublicContact> }) {
  const g = c?.guild;
  return (
    <div className="overflow-hidden rounded-[28px] border border-[var(--site-line)] bg-[var(--site-panel)] shadow-[0_40px_120px_-40px_rgba(124,140,255,.6)]">
      <div className="h-36 bg-gradient-to-br from-[var(--site-signal)]/50 via-[var(--site-panel)] to-[var(--site-rose)]/40" style={g?.banner ? { backgroundImage: `url(${g.banner})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined} />
      <div className="-mt-12 px-7 pb-7">
        {g?.icon ? <img src={g.icon} alt="" className="h-24 w-24 rounded-[26px] border-4 border-[var(--site-panel)]" /> : <div className="h-24 w-24 rounded-[26px] border-4 border-[var(--site-panel)] bg-[var(--site-night)]" />}
        <div className="cm-display mt-4 text-2xl font-extrabold">{g?.name || 'Our Discord server'}</div>
        {g?.description && <p className="mt-2 text-[var(--site-muted)]">{g.description}</p>}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-[var(--site-muted)]">
          <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-[var(--site-mint)]" /> {fmt(g?.memberCount)} members</span>
          {g?.createdAt && <span>Since {new Date(g.createdAt).getFullYear()}</span>}
          {!!g?.boosts && <span>{g.boosts} boosts · level {g.boostLevel}</span>}
        </div>
        <a href={c?.invite || '#form'} target={c?.invite ? '_blank' : undefined} rel="noopener noreferrer" className="cm-btn-primary mt-6 w-full justify-center">
          {c?.invite ? 'Join the server' : 'Loading invite…'}
        </a>
        {c?.inviteChannel && <p className="mt-3 text-center text-[13px] text-[var(--site-muted)]">Opens #{c.inviteChannel} directly</p>}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, value, label, sub }: { icon: any; value: string; label: string; sub: string }) {
  return (
    <div className="rounded-3xl border border-[var(--site-line)] bg-[var(--site-night)] p-7">
      <Icon className="h-6 w-6 text-[var(--site-signal)]" aria-hidden />
      <div className="cm-display mt-5 text-5xl font-extrabold">{value}</div>
      <div className="mt-2 font-semibold">{label}</div>
      <div className="mt-1 text-[14px] text-[var(--site-muted)]">{sub}</div>
    </div>
  );
}

function ContactForm({ invite }: { invite?: string | null }) {
  const [f, setF] = useState({ name: '', contact: '', topic: 'Collaboration', message: '', website: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: any) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('sending');
    try {
      const r = await fetch('/api/v1/public/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j?.error?.message || 'Could not send your message.');
      setState('sent');
    } catch (x: any) {
      setErr(x.message);
      setState('error');
    }
  };

  if (state === 'sent') {
    return (
      <div className="rounded-3xl border border-[var(--site-line)] bg-[var(--site-night)] p-10 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-[var(--site-mint)]" aria-hidden />
        <h3 className="mt-5 text-2xl font-bold">Message sent</h3>
        <p className="mt-2 text-[var(--site-muted)]">It is now in our Development Area & Feedback. Join the server to follow the discussion.</p>
        {invite && <a href={invite} target="_blank" rel="noopener noreferrer" className="cm-btn-primary mt-6">Open the discussion</a>}
      </div>
    );
  }

  const field = 'w-full rounded-xl border border-[var(--site-line)] bg-[var(--site-night)] px-4 py-3 text-[var(--site-text)] placeholder:text-[var(--site-muted)]/60 focus:border-[var(--site-signal)] focus:outline-none';
  return (
    <form onSubmit={submit} className="space-y-5 rounded-3xl border border-[var(--site-line)] bg-[var(--site-panel)]/60 p-7 sm:p-9">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block"><span className="mb-2 block text-[15px] font-semibold">Your name</span>
          <input required minLength={2} maxLength={80} value={f.name} onChange={set('name')} className={field} placeholder="Rishabh Sharma" /></label>
        <label className="block"><span className="mb-2 block text-[15px] font-semibold">Discord username or email</span>
          <input required minLength={2} maxLength={120} value={f.contact} onChange={set('contact')} className={field} placeholder="rishabh or rishabh@example.com" /></label>
      </div>
      <div>
        <span className="mb-2 block text-[15px] font-semibold">Topic</span>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t) => (
            <button type="button" key={t} onClick={() => setF({ ...f, topic: t })}
              className={`rounded-full border px-4 py-2 text-[14px] font-medium transition ${f.topic === t ? 'border-[var(--site-rose)] bg-[var(--site-rose)] text-[#1A0610]' : 'border-[var(--site-line)] text-[var(--site-muted)] hover:text-[var(--site-text)]'}`}>{t}</button>
          ))}
        </div>
      </div>
      <label className="block"><span className="mb-2 block text-[15px] font-semibold">Message</span>
        <textarea required minLength={10} maxLength={1500} rows={6} value={f.message} onChange={set('message')} className={field} placeholder="Tell us what you have in mind" /></label>
      {/* Honeypot: hidden from people, filled by spam bots */}
      <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} className="hidden" aria-hidden />
      {state === 'error' && <p className="rounded-xl border border-[var(--site-rose)]/50 px-4 py-3 text-[15px] text-[var(--site-rose)]">{err}</p>}
      <button disabled={state === 'sending'} className="cm-btn-primary w-full justify-center text-[17px] disabled:opacity-60">
        <Send className="h-4 w-4" aria-hidden /> {state === 'sending' ? 'Sending…' : 'Send to the team'}
      </button>
    </form>
  );
}
