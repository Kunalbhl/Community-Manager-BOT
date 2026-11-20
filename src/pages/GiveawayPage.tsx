import React, { useEffect, useState } from 'react';

/** Public giveaway entry page: /g/<slug>. Sign in with Discord or Google, fill the form, enter once. */
type Q = { id: string; label: string; type: string; required: boolean; options?: string[] };
type Info = { title: string; description: string; serverName: string; open: boolean; status: string; opensAt?: string; closesAt?: string; allowDiscord: boolean; allowGoogle: boolean; questions: Q[]; me: null | { provider: string; name: string; avatarUrl: string }; entered: boolean };

const card = 'rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur sm:p-8';
const btn = 'inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold transition disabled:opacity-50';
const field = 'w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white placeholder-white/40 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30';

export default function GiveawayPage() {
  const slug = window.location.pathname.split('/')[2] || '';
  const [info, setInfo] = useState<Info | null>(null);
  const [err, setErr] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const qErr = new URLSearchParams(window.location.search).get('error');

  const load = () => fetch(`/api/v1/public/giveaway/${encodeURIComponent(slug)}`, { credentials: 'include' }).then(async (r) => {
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.success) throw new Error(j.error?.message || 'This giveaway was not found.');
    setInfo(j.data); if (j.data.entered) setDone(true);
  }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = await fetch(`/api/v1/public/giveaway/${encodeURIComponent(slug)}/submit`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.success) throw new Error(j.error?.message || 'Could not save your entry.');
      setDone(true);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const signOut = async () => { await fetch(`/api/v1/public/giveaway/${encodeURIComponent(slug)}/logout`, { method: 'POST', credentials: 'include' }); load(); };

  return (
    <div className="min-h-screen bg-[#0b0d17] text-white">
      <main className="mx-auto max-w-xl px-4 py-10 sm:py-16">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-indigo-300">🎁 Giveaway{info?.serverName ? ` · ${info.serverName}` : ''}</p>
        {!info && !err && <div className="mt-8 h-48 animate-pulse rounded-3xl bg-white/5" />}
        {!info && err && <div className={`${card} mt-8 text-center`}><p className="text-lg font-bold">Giveaway not found</p><p className="mt-2 text-sm text-white/60">{err}</p></div>}
        {info && (
          <div className={`${card} mt-6`}>
            <h1 className="text-3xl font-extrabold">{info.title}</h1>
            {info.description && <p className="mt-3 whitespace-pre-wrap text-sm text-white/70">{info.description}</p>}
            {info.closesAt && <p className="mt-3 text-xs text-white/50">{info.open ? 'Closes' : 'Closed'} {new Date(info.closesAt).toLocaleString()}</p>}

            {done ? (
              <div className="mt-8 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-5 text-center"><p className="text-lg font-bold">🎉 You are in!</p><p className="mt-1 text-sm text-white/70">Your entry is saved. Winners are announced by the server team.</p></div>
            ) : !info.open ? (
              <div className="mt-8 rounded-2xl border border-white/15 p-5 text-center text-sm text-white/70">{info.status === 'OPEN' && info.opensAt && Date.parse(info.opensAt) > Date.now() ? `Entries open ${new Date(info.opensAt).toLocaleString()}.` : 'This giveaway is not accepting entries.'}</div>
            ) : !info.me ? (
              <div className="mt-8 space-y-3">
                {qErr && <p className="rounded-xl bg-rose-500/15 p-3 text-sm text-rose-200">Sign-in did not work. Please try again.</p>}
                <p className="text-sm text-white/70">Sign in to enter. We only get your name{info.allowGoogle ? ' and email' : ''}, never your password.</p>
                {info.allowDiscord && <a className={`${btn} bg-[#5865F2] text-white hover:brightness-110`} href={`/api/v1/public/giveaway/${slug}/login/discord`}>Continue with Discord</a>}
                {info.allowGoogle && <a className={`${btn} bg-white text-slate-900 hover:bg-slate-100`} href={`/api/v1/public/giveaway/${slug}/login/google`}>Continue with Google</a>}
              </div>
            ) : (
              <form onSubmit={submit} className="mt-8 space-y-4">
                <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3 text-sm">
                  {info.me.avatarUrl && <img src={info.me.avatarUrl} alt="" className="h-9 w-9 rounded-full" />}
                  <span className="min-w-0 flex-1 truncate">Entering as <b>{info.me.name}</b> ({info.me.provider})</span>
                  <button type="button" className="text-xs text-white/60 underline" onClick={signOut}>Not you?</button>
                </div>
                {info.questions.map((q) => (
                  <label key={q.id} className="block text-sm font-semibold">{q.label}{q.required && <span className="text-rose-300"> *</span>}
                    {q.type === 'longtext' ? <textarea className={`${field} mt-1 min-h-[96px]`} maxLength={1500} required={q.required} value={answers[q.id] || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
                      : q.type === 'choice' ? <select className={`${field} mt-1`} required={q.required} value={answers[q.id] || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}><option value="">Choose…</option>{(q.options || []).map((o) => <option key={o} value={o} className="text-slate-900">{o}</option>)}</select>
                      : <input className={`${field} mt-1`} type={q.type === 'email' ? 'email' : q.type === 'phone' ? 'tel' : 'text'} maxLength={300} required={q.required} value={answers[q.id] || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />}
                  </label>
                ))}
                {err && <p className="rounded-xl bg-rose-500/15 p-3 text-sm text-rose-200">{err}</p>}
                <button className={`${btn} bg-indigo-500 text-white hover:bg-indigo-400`} disabled={busy}>{busy ? 'Saving…' : 'Enter the giveaway'}</button>
                <p className="text-center text-[11px] text-white/45">What you type here is seen only by the server team and used only for this giveaway. One entry per person.</p>
              </form>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
