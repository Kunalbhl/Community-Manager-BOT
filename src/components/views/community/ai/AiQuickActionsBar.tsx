import React from 'react';
import {
  Sparkles,
  TrendingUp,
  ShieldAlert,
  Users,
  Calendar,
  Zap,
} from 'lucide-react';

interface AiQuickActionsBarProps {
  onSelectPrompt: (prompt: string) => void;
  disabled: boolean;
}

const QUICK_PROMPTS = [
  { label: 'Analyze Health', prompt: 'Analyze community health, active members, and retention trends.' },
  { label: 'Explain Engagement', prompt: 'Explain recent changes in message activity and channel engagement.' },
  { label: 'Recruiter Performance', prompt: 'Review applicant funnel conversion and recruiter performance.' },
  { label: 'Moderation Safety', prompt: 'Review moderation incidents, warnings, and automod triggers.' },
  { label: 'Event Attendance', prompt: 'Analyze event turnouts, RSVPs, and reminder impact.' },
];

export const AiQuickActionsBar: React.FC<AiQuickActionsBarProps> = ({
  onSelectPrompt,
  disabled,
}) => {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-1 scrollbar-none text-xs">
      <span className="text-[11px] text-zinc-600 font-medium whitespace-nowrap pl-1">Quick:</span>
      {QUICK_PROMPTS.map((item, idx) => (
        <button
          key={idx}
          onClick={() => onSelectPrompt(item.prompt)}
          disabled={disabled}
          className="whitespace-nowrap px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 active:bg-zinc-300 text-zinc-700 rounded-full text-xs font-medium transition disabled:opacity-50 shrink-0"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
};
