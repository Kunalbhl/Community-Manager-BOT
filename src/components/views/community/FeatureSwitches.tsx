import React, { useEffect, useState } from 'react';

interface Mod { key: string; label: string; description: string; enabled: boolean; group: string }

/** Every feature starts off. Switching one on creates the channels it needs (reusing any that already exist). */
export function FeatureSwitches({ communityId }: { communityId: string }) {
  const [mods, setMods] = useState<Mod[] | null>(null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const url = `/api/v1/communities/${encodeURIComponent(communityId)}/modules`;
  const h = { 'Content-Type': 'application/json', 'x-community-id': communityId };

  useEffect(() => {
    fetch(url, { credentials: 'include', headers: h }).then((r) => r.json()).then((j) => setMods(j.success ? j.data : [])).catch(() => setMods([]));
  }, [communityId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (m: Mod) => {
    setBusy(m.key); setNote(null);
    try {
      const r = await fetch(`${url}/${m.key}`, { method: 'PUT', credentials: 'include', headers: h, body: JSON.stringify({ enabled: !m.enabled }) });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j?.error?.message || j?.message || 'Could not change this feature.');
      setMods(j.data.modules);
      const made: string[] = j.data.made || [];
      const errs: string[] = j.data.errors || [];
      setNote(errs.length ? { ok: false, text: errs[0] } : { ok: true, text: `${m.label} is ${m.enabled ? 'off' : 'on'}.${made.length ? ` Created: ${made.join(', ')}.` : ''}` });
    } catch (e: any) { setNote({ ok: false, text: e.message }); }
    setBusy('');
  };

  if (!mods) return <div className="h-24 animate-pulse rounded-2xl bg-slate-200/60" />;
  const groups = ['Core', 'Moderation', 'Community'];
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
      <h2 className="text-base font-bold text-slate-900">Choose your features</h2>
      <p className="mt-1 text-sm text-slate-600">Everything starts off. Switch on only what you want. Turning a feature on creates the channels it needs, and turning it off never deletes anything.</p>
      {note && <p className={`mt-3 text-sm font-semibold ${note.ok ? 'text-emerald-700' : 'text-rose-700'}`}>{note.text}</p>}
      {groups.map((g) => (
        <div key={g} className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{g}</p>
          <div className="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-100">
            {mods.filter((m) => m.group === g).map((m) => (
              <div key={m.key} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0"><p className="text-sm font-semibold text-slate-900">{m.label}</p><p className="text-xs text-slate-500">{m.description}</p></div>
                <button type="button" role="switch" aria-checked={m.enabled} aria-label={`${m.label} ${m.enabled ? 'on' : 'off'}`} disabled={busy === m.key} onClick={() => toggle(m)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition ${m.enabled ? 'bg-emerald-500' : 'bg-slate-300'} ${busy === m.key ? 'opacity-60' : ''}`}>
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${m.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
