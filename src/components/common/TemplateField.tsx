import React, { useRef } from 'react';

export interface TemplateVar { token: string; label: string; sample: string }

/**
 * Message editor with clickable variables. Click a variable to insert it at the cursor;
 * the live preview shows the message with example values, so admins know exactly what gets sent.
 */
export function TemplateField({ value, onChange, vars, rows = 3, label, braces = 'single' }: {
  value: string; onChange: (v: string) => void; vars: TemplateVar[]; rows?: number; label?: string; braces?: 'single' | 'double';
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wrap = (t: string) => (braces === 'double' ? `{{${t}}}` : `{${t}}`);
  const insert = (t: string) => {
    const el = ref.current;
    const text = wrap(t);
    if (!el) return onChange(`${value}${text}`);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + text.length, start + text.length); });
  };
  let preview = value || '';
  for (const v of vars) preview = preview.split(wrap(v.token)).join(v.sample);
  preview = preview.replace(/\\n/g, '\n').replace(/\*\*(.+?)\*\*/g, '$1');
  return (
    <div>
      {label && <div className="mb-1 text-sm font-medium text-slate-700">{label}</div>}
      <textarea ref={ref} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-500">Insert:</span>
        {vars.map((v) => (
          <button key={v.token} type="button" onClick={() => insert(v.token)} title={`Example: ${v.sample}`}
            className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100">{v.label}</button>
        ))}
      </div>
      <div className="mt-2 whitespace-pre-line rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"><span className="font-semibold text-slate-500">Preview: </span>{preview || '—'}</div>
    </div>
  );
}

export const RECRUIT_VARS: TemplateVar[] = [
  { token: 'applicant', label: 'Applicant name', sample: 'Rishabh' },
  { token: 'mention', label: '@Applicant', sample: '@Rishabh' },
  { token: 'server', label: 'Server name', sample: 'Bharat Esports' },
  { token: 'reviewer', label: 'Reviewer', sample: 'Kunal' },
  { token: 'reason', label: 'Rejection reason', sample: 'Not active enough yet' },
];
export const RECORD_VARS: TemplateVar[] = [
  { token: 'recruiterMention', label: '@Recruiter', sample: '@Ashish' },
  { token: 'recruiterName', label: 'Recruiter name', sample: 'Ashish Anubhav' },
  { token: 'recruiterCode', label: 'Recruiter code', sample: 'ASHISH' },
  { token: 'applicantName', label: 'New member', sample: 'Sufiyan' },
  { token: 'successfulRecruitmentCount', label: 'Total recruits', sample: '12' },
  { token: 'benefit', label: 'Benefit', sample: 'Elite Recruiter role' },
  { token: 'communityName', label: 'Server name', sample: 'Bharat Esports' },
];
export const GREETING_VARS: TemplateVar[] = [
  { token: 'recruiterName', label: 'Bot persona name', sample: 'Community Recruiter' },
  { token: 'communityName', label: 'Server name', sample: 'Bharat Esports' },
];
