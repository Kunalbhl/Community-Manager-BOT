import React from 'react';
import { MessageComposer, mentionsToNames } from './MessageComposer.js';
import { useDiscordResources } from './DiscordPickers.js';

export interface TemplateVar { token: string; label: string; sample: string }

/**
 * Message editor with clickable variables. Click a variable to insert it at the cursor;
 * the live preview shows the message with example values, so admins know exactly what gets sent.
 */
export function TemplateField({ value, onChange, vars, rows = 3, label, braces = 'single' }: {
  value: string; onChange: (v: string) => void; vars: TemplateVar[]; rows?: number; label?: string; braces?: 'single' | 'double';
}) {
  const res: any = useDiscordResources();
  const wrap = (t: string) => (braces === 'double' ? `{{${t}}}` : `{${t}}`);
  let preview = mentionsToNames(value || '', res);
  for (const v of vars) preview = preview.split(wrap(v.token)).join(v.sample);
  preview = preview.replace(/\\n/g, '\n').replace(/\*\*(.+?)\*\*/g, '$1').replace(/<a?:(\w+):\d+>/g, ':$1:');
  return (
    <div>
      {label && <div className="mb-1 text-sm font-medium text-slate-700">{label}</div>}
      <MessageComposer rows={rows} value={value} onChange={onChange} maxLength={4000} vars={vars.map((v) => ({ token: v.token, label: v.label, wrap: wrap(v.token) }))} />
      <div className="mt-2 whitespace-pre-line rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"><span className="font-semibold text-slate-500">Preview with example values: </span>{preview || '—'}</div>
    </div>
  );
}

export const RECRUIT_VARS: TemplateVar[] = [
  { token: 'applicant', label: 'Applicant name', sample: 'Rishabh' },
  { token: 'mention', label: '@Applicant', sample: '@Rishabh' },
  { token: 'server', label: 'Server name', sample: 'K. Tech Services' },
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
  { token: 'communityName', label: 'Server name', sample: 'K. Tech Services' },
];
export const GREETING_VARS: TemplateVar[] = [
  { token: 'recruiterName', label: 'Bot persona name', sample: 'Community Recruiter' },
  { token: 'communityName', label: 'Server name', sample: 'K. Tech Services' },
];
