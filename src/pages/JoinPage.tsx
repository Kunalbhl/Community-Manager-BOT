import React, { useEffect, useMemo, useState } from 'react';

/**
 * Public page where new people apply before joining: sign in with Discord, read the rules,
 * take the rules quiz, answer the questions. When staff approve, the bot adds them to the server.
 */
type Info = {
  server: { name: string; icon: string; banner: string; members: number };
  open: boolean;
  rules: { title: string; description: string }[];
  consent: string;
  quiz: { id: string; question: string; options: string[] }[];
  questions: { id: string; text: string; type: string; options: string[]; required: boolean; guidance: string }[];
  askCode: boolean; codeRequired: boolean;
  session: null | {
    me: { id: string; username: string; name: string; avatarUrl: string };
    recruiterCode: string; quizPassed: boolean; inServer: boolean; inviteUrl: string;
    application: null | { id: string; status: string; submittedAt: string; reason: string };
  };
};

const card = 'rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur sm:p-8';
const btn = 'inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition disabled:opacity-50';
const field = 'w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30';

const api = async (path: string, body?: unknown) => {
  const r = await fetch(`/api/v1/public/join/${path}`, { method: body ? 'POST' : 'GET', credentials: 'include', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) throw new Error(j?.error?.message || 'Something went wrong. Please try again.');
  return j.data;
};

/** Bold, italic and line breaks from Discord-style text, escaped. */
const md = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/\n/g, '<br/>');

export default function JoinPage() {
  const communityId = decodeURIComponent(window.location.pathname.split('/')[2] || '');
  const params = new URLSearchParams(window.location.search);
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState('');
  const load = () => api(communityId).then(setInfo).catch((e) => setErr(e.message));
  useEffect(() => {
    if (['expired', 'cancelled', 'error'].includes(communityId)) { setErr(communityId === 'cancelled' ? 'Sign-in was cancelled. Open your invite link again to continue.' : 'That sign-in link expired. Open your invite link again.'); return; }
    if (params.get('code')) try { sessionStorage.setItem(`cm_join_code_${communityId}`, params.get('code')!.toUpperCase()); } catch { /* ignore */ }
    load();
    const e = params.get('error');
    if (e) setErr(e === 'scope' ? 'Please allow “Join servers for you” on the Discord screen: that is how you get in after approval.' : 'Discord sign-in did not finish. Please try again.');
  }, []); // eslint-disable-line

  const code = (() => { try { return params.get('code') || sessionStorage.getItem(`cm_join_code_${communityId}`) || ''; } catch { return params.get('code') || ''; } })();

  return (
    <div className="min-h-screen bg-[#0b0d17] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.25),transparent_60%)]" />
      <div className="relative mx-auto max-w-2xl px-4 py-10 sm:py-16">
        {info && <Header info={info} />}
        {err && <div className="mb-5 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{err}</div>}
        {!info && !err && <div className={`${card} h-64 animate-pulse`} />}
        {info && <Body info={info} communityId={communityId} code={code} reload={load} />}
        <p className="mt-10 text-center text-xs text-white/40">Your Discord sign-in is used only to add you to this server after approval, then removed. Nothing is posted as you.</p>
      </div>
    </div>
  );
}

function Header({ info }: { info: Info }) {
  return (
    <div className="mb-6 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
      {info.server.banner && <img src={info.server.banner} alt="" className="h-32 w-full object-cover sm:h-44" />}
      <div className="flex items-center gap-4 p-5">
        {info.server.icon ? <img src={info.server.icon} alt="" className="h-16 w-16 rounded-2xl ring-2 ring-white/20" /> : <div className="h-16 w-16 rounded-2xl bg-indigo-500" />}
        <div className="min-w-0"><div className="text-xs font-semibold uppercase tracking-wider text-indigo-300">Apply to join</div><h1 className="truncate text-2xl font-black">{info.server.name}</h1><div className="text-sm text-white/60">{info.server.members.toLocaleString()} members</div></div>
      </div>
    </div>
  );
}

function Steps({ at }: { at: number }) {
  const labels = ['Sign in', 'Rules', 'Quiz', 'Questions', 'Review'];
  return (
    <div className="mb-5 flex items-center gap-1.5">{labels.map((l, i) => (
      <React.Fragment key={l}>
        <div className={`flex items-center gap-1.5 text-xs font-semibold ${i <= at ? 'text-white' : 'text-white/40'}`}><span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${i < at ? 'bg-emerald-500' : i === at ? 'bg-indigo-500' : 'bg-white/10'}`}>{i < at ? '✓' : i + 1}</span><span className="hidden sm:inline">{l}</span></div>
        {i < labels.length - 1 && <div className={`h-px flex-1 ${i < at ? 'bg-emerald-500/60' : 'bg-white/10'}`} />}
      </React.Fragment>
    ))}</div>
  );
}

function Body({ info, communityId, code, reload }: { info: Info; communityId: string; code: string; reload: () => void }) {
  const s = info.session;
  const [readRules, setReadRules] = useState(false);
  if (!info.open && !s?.application) return <div className={card}><h2 className="text-xl font-bold">Applications are closed</h2><p className="mt-2 text-white/70">This server isn’t taking new members right now. Please check back later.</p></div>;

  if (!s) {
    return (
      <div className={card}>
        <Steps at={0} />
        <h2 className="text-xl font-bold">Start with your Discord account</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/70">Sign in so the team knows who is applying. On the Discord screen you’ll see <b className="text-white">“Join servers for you”</b>: that lets the bot add you to <b className="text-white">{info.server.name}</b> once you’re approved, so you don’t need an invite.</p>
        {code && <div className="mt-4 rounded-xl bg-indigo-500/15 px-4 py-2.5 text-sm text-indigo-100">🎟️ Invited with code <b className="font-mono">{code}</b></div>}
        <a href={`/api/v1/public/join/${encodeURIComponent(communityId)}/login${code ? `?code=${encodeURIComponent(code)}` : ''}`} className={`${btn} mt-6 w-full bg-[#5865F2] text-white hover:bg-[#4752c4]`}>
          Continue with Discord
        </a>
      </div>
    );
  }

  if (s.application) return <Result info={info} s={s} communityId={communityId} reload={reload} />;
  if (!readRules && !s.quizPassed) return <Rules info={info} s={s} onNext={() => setReadRules(true)} communityId={communityId} reload={reload} />;
  if (info.quiz.length && !s.quizPassed) return <Quiz info={info} communityId={communityId} onPassed={reload} />;
  return <Form info={info} s={s} code={s.recruiterCode || code} communityId={communityId} onDone={reload} />;
}

function Me({ s, communityId, reload }: any) {
  return (
    <div className="mb-5 flex items-center gap-3 rounded-2xl bg-black/20 p-3">
      {s.me.avatarUrl ? <img src={s.me.avatarUrl} alt="" className="h-10 w-10 rounded-full" /> : <div className="h-10 w-10 rounded-full bg-indigo-500" />}
      <div className="min-w-0 flex-1"><div className="truncate font-bold">{s.me.name}</div><div className="truncate text-xs text-white/50">@{s.me.username}</div></div>
      <button className="text-xs text-white/50 underline hover:text-white" onClick={() => api(`${encodeURIComponent(communityId)}/logout`, {}).then(reload)}>Not you?</button>
    </div>
  );
}

function Rules({ info, s, onNext, communityId, reload }: any) {
  const [ok, setOk] = useState(false);
  return (
    <div className={card}>
      <Steps at={1} />
      <Me s={s} communityId={communityId} reload={reload} />
      <h2 className="text-xl font-bold">Server rules</h2>
      {info.consent && <p className="mt-2 text-sm text-white/70" dangerouslySetInnerHTML={{ __html: md(info.consent) }} />}
      <ol className="mt-4 space-y-2">{info.rules.map((r: any, i: number) => (
        <li key={i} className="flex gap-3 rounded-xl bg-black/20 p-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/30 text-xs font-bold text-indigo-100">{i + 1}</span><div><div className="font-semibold">{r.title}</div>{r.description && r.description !== r.title && <div className="text-sm text-white/60">{r.description}</div>}</div></li>
      ))}</ol>
      {!info.rules.length && <p className="mt-3 text-sm text-white/60">This server hasn’t listed its rules here yet.</p>}
      <label className="mt-5 flex items-center gap-3 rounded-xl bg-white/5 p-3 text-sm"><input type="checkbox" className="h-4 w-4" checked={ok} onChange={(e) => setOk(e.target.checked)} />I have read and agree to the rules</label>
      <button disabled={!ok} onClick={onNext} className={`${btn} mt-5 w-full bg-indigo-500 text-white hover:bg-indigo-400`}>{info.quiz.length ? 'Continue to a short quiz' : 'Continue'}</button>
    </div>
  );
}

function Quiz({ info, communityId, onPassed }: any) {
  const [ans, setAns] = useState<Record<string, number>>({});
  const [res, setRes] = useState<Record<string, { correct: boolean; explain: string }>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const all = info.quiz.every((q: any) => ans[q.id] !== undefined);
  const check = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await api(`${encodeURIComponent(communityId)}/quiz`, { answers: ans });
      setRes(Object.fromEntries(r.results.map((x: any) => [x.id, x])));
      if (r.passed) onPassed(); else setMsg('Some answers aren’t right yet. Read the hint, change them, and check again.');
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <div className={card}>
      <Steps at={2} />
      <h2 className="text-xl font-bold">Quick rules check</h2>
      <p className="mt-1 text-sm text-white/60">{info.quiz.length} questions about the rules you just read. You can change answers until they’re all right.</p>
      <div className="mt-5 space-y-5">{info.quiz.map((q: any, i: number) => (
        <div key={q.id} className={`rounded-2xl border p-4 ${res[q.id] ? (res[q.id].correct ? 'border-emerald-400/40 bg-emerald-500/5' : 'border-rose-400/40 bg-rose-500/5') : 'border-white/10'}`}>
          <div className="font-semibold">{i + 1}. {q.question}</div>
          <div className="mt-3 grid gap-2">{q.options.map((o: string, j: number) => (
            <button key={j} type="button" onClick={() => { setAns({ ...ans, [q.id]: j }); setRes(({ [q.id]: _x, ...rest }) => rest); }} className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${ans[q.id] === j ? 'border-indigo-400 bg-indigo-500/20' : 'border-white/10 hover:bg-white/5'}`}>{o}</button>
          ))}</div>
          {res[q.id] && !res[q.id].correct && <p className="mt-2 text-sm text-rose-200">💡 {res[q.id].explain}</p>}
        </div>
      ))}</div>
      {msg && <p className="mt-4 text-sm text-amber-200">{msg}</p>}
      <button disabled={!all || busy} onClick={check} className={`${btn} mt-5 w-full bg-indigo-500 text-white hover:bg-indigo-400`}>{busy ? 'Checking…' : 'Check my answers'}</button>
    </div>
  );
}

function Form({ info, s, code: code0, communityId, onDone }: any) {
  const [a, setA] = useState<Record<string, string>>({});
  const [code, setCode] = useState(code0 || '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const submit = async () => {
    setBusy(true); setMsg('');
    try { await api(`${encodeURIComponent(communityId)}/submit`, { answers: a, recruiterCode: code, agree: true }); onDone(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <div className={card}>
      <Steps at={3} />
      <Me s={s} communityId={communityId} reload={onDone} />
      <h2 className="text-xl font-bold">A few questions</h2>
      <div className="mt-5 space-y-4">
        {info.questions.map((q: any) => (
          <label key={q.id} className="block">
            <div className="text-sm font-semibold">{q.text}{q.required && <span className="text-rose-300"> *</span>}</div>
            {q.guidance && <div className="text-xs text-white/50">{q.guidance}</div>}
            <div className="mt-1.5">
              {q.type === 'YES_NO' || (/SELECT|DROPDOWN|CHOICE/.test(q.type) && q.options.length) ? (
                <select className={field} value={a[q.id] || ''} onChange={(e) => setA({ ...a, [q.id]: e.target.value })}><option value="">Choose…</option>{(q.type === 'YES_NO' && !q.options.length ? ['Yes', 'No'] : q.options).map((o: string) => <option key={o}>{o}</option>)}</select>
              ) : q.type === 'LONG_TEXT' ? (
                <textarea rows={4} maxLength={2000} className={field} value={a[q.id] || ''} onChange={(e) => setA({ ...a, [q.id]: e.target.value })} />
              ) : (
                <input className={field} maxLength={300} value={a[q.id] || ''} onChange={(e) => setA({ ...a, [q.id]: e.target.value })} />
              )}
            </div>
          </label>
        ))}
        {info.askCode && (
          <label className="block">
            <div className="text-sm font-semibold">Recruiter code{info.codeRequired ? <span className="text-rose-300"> *</span> : <span className="font-normal text-white/50"> (optional)</span>}</div>
            <div className="text-xs text-white/50">The code of the person who invited you, so they get credit.</div>
            <input className={`${field} mt-1.5 font-mono uppercase`} maxLength={32} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. KP-007" />
          </label>
        )}
      </div>
      {msg && <p className="mt-4 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{msg}</p>}
      <button disabled={busy} onClick={submit} className={`${btn} mt-6 w-full bg-emerald-500 text-white hover:bg-emerald-400`}>{busy ? 'Sending…' : 'Send my application'}</button>
    </div>
  );
}

function Result({ info, s, communityId, reload }: any) {
  const st = s.application.status;
  const approved = ['APPROVED', 'JOIN_PENDING', 'JOINED'].includes(st);
  useEffect(() => { if (approved || st === 'REJECTED') return; const t = setInterval(reload, 30_000); return () => clearInterval(t); }, [st]); // eslint-disable-line
  const open = useMemo(() => `https://discord.com/channels/@me`, []);
  return (
    <div className={card}>
      <Steps at={approved ? 5 : 4} />
      <Me s={s} communityId={communityId} reload={reload} />
      {approved ? (
        <>
          <div className="text-4xl">🎉</div>
          <h2 className="mt-2 text-2xl font-black">You’re in!</h2>
          {s.inServer
            ? <p className="mt-2 text-white/70">You’ve been added to <b className="text-white">{info.server.name}</b>. Open Discord and you’ll find it in your server list.</p>
            : s.inviteUrl
              ? <p className="mt-2 text-white/70">Approved. Use your personal invite to join <b className="text-white">{info.server.name}</b> (it works once).</p>
              : <p className="mt-2 text-white/70">Approved. You’re being added to <b className="text-white">{info.server.name}</b> now. If it doesn’t appear in a minute, refresh this page.</p>}
          <a href={s.inServer ? open : s.inviteUrl || open} target="_blank" rel="noreferrer" className={`${btn} mt-6 w-full bg-[#5865F2] text-white hover:bg-[#4752c4]`}>{s.inServer ? 'Open Discord' : s.inviteUrl ? 'Join the server' : 'Open Discord'}</a>
        </>
      ) : st === 'REJECTED' ? (
        <>
          <h2 className="text-2xl font-black">Not this time</h2>
          <p className="mt-2 text-white/70">The team decided not to accept this application.{s.application.reason ? ` Reason: ${s.application.reason}` : ''}</p>
        </>
      ) : (
        <>
          <div className="text-4xl">⏳</div>
          <h2 className="mt-2 text-2xl font-black">Application sent</h2>
          <p className="mt-2 text-white/70">The team at <b className="text-white">{info.server.name}</b> will review it. You don’t need to do anything: once approved, the bot adds you to the server automatically. You can close this page or keep it open; it updates by itself.</p>
          <p className="mt-3 text-xs text-white/40">Sent {new Date(s.application.submittedAt).toLocaleString()}</p>
        </>
      )}
    </div>
  );
}
