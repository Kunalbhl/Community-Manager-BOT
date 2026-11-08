import React from 'react';
import { CATALOG } from '../../site/SiteLanding.js';
import { Check } from 'lucide-react';

/** Everything the bot can do, the same list as the website, so owners see its full range. */
export function CapabilitiesView() {
  const total = CATALOG.reduce((n, c) => n + c.items.length, 0);
  return (
    <div className="mx-auto max-w-[min(100%,2200px)] space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900">What Community Manager can do</h1>
        <p className="mt-1 text-slate-600">{total} live capabilities across {CATALOG.length} areas. This is the same list shown on our website, and everything on it works today.</p>
      </div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 min-[1900px]:grid-cols-4">
        {CATALOG.map((c) => (
          <section key={c.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><c.icon className="h-5 w-5" /></span>
              <h2 className="text-lg font-bold text-slate-900">{c.title}</h2>
              <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{c.items.length}</span>
            </div>
            <ul className="mt-4 space-y-1.5">
              {c.items.map((i) => <li key={i} className="flex gap-2 text-sm text-slate-700"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{i}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
