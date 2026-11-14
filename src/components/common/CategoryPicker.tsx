import React, { useState } from 'react';

const BASE = ['General', 'Announcement', 'Recruitment', 'Promotion', 'Event', 'Reminder', 'Moderation'];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Pick an existing category, or "Add new" to type one. A new name that matches an existing one is merged into it. */
export function CategoryPicker({ value, onChange, existing = [], className = '' }: { value: string; onChange: (v: string) => void; existing?: string[]; className?: string }) {
  const all = [...BASE, ...existing].filter((v, i, a) => v && a.findIndex((x) => norm(x) === norm(v)) === i);
  const known = all.some((c) => c === value);
  const [adding, setAdding] = useState(!known && !!value);
  const [draft, setDraft] = useState(known ? '' : value);
  if (adding) {
    const match = all.find((c) => norm(c) === norm(draft));
    return (
      <div className={className}>
        <div className="flex gap-1">
          <input autoFocus className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" placeholder="New category name" maxLength={40} value={draft}
            onChange={(e) => { setDraft(e.target.value); onChange(all.find((c) => norm(c) === norm(e.target.value)) || e.target.value.trim()); }} />
          <button type="button" className="rounded-lg px-2 text-xs font-semibold text-slate-500 hover:bg-slate-100" onClick={() => { setAdding(false); setDraft(''); onChange(all[0]); }}>Cancel</button>
        </div>
        {match && draft && match !== draft.trim() && <p className="mt-1 text-[11px] text-indigo-600">Already exists: will be saved under “{match}”.</p>}
      </div>
    );
  }
  return (
    <select className={`w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm ${className}`} value={known ? value : ''}
      onChange={(e) => { if (e.target.value === '__new') { setAdding(true); setDraft(''); onChange(''); } else onChange(e.target.value); }}>
      {all.map((c) => <option key={c} value={c}>{c}</option>)}
      <option value="__new">+ Add new category…</option>
    </select>
  );
}
