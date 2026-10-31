import React from 'react';
import { Check, Clock, AlertCircle, ArrowRight, Shield } from 'lucide-react';

export type StepState = 'completed' | 'current' | 'pending' | 'rejected' | 'optional';

interface WorkflowStepProps {
  stepNumber: number;
  title: string;
  subtitle?: string;
  state: StepState;
  requiredRole?: string;
  isLast?: boolean;
  onClick?: () => void;
  timestamp?: string;
}

export const WorkflowStep: React.FC<WorkflowStepProps> = ({
  stepNumber,
  title,
  subtitle,
  state,
  requiredRole,
  isLast = false,
  onClick,
  timestamp,
}) => {
  const getIconAndColors = () => {
    switch (state) {
      case 'completed':
        return {
          icon: <Check className="w-3.5 h-3.5 text-emerald-400" />,
          circle: 'bg-emerald-500/20 border-emerald-500 text-emerald-400',
          titleColor: 'text-slate-900 dark:text-slate-100 font-bold',
          line: 'bg-emerald-500',
        };
      case 'current':
        return {
          icon: <Clock className="w-3.5 h-3.5 text-[#5865F2]" />,
          circle: 'bg-[#5865F2]/20 border-[#5865F2] text-[#5865F2] ring-4 ring-[#5865F2]/20 animate-pulse',
          titleColor: 'text-[#5865F2] dark:text-[#7983F5] font-extrabold',
          line: 'bg-slate-200 dark:bg-slate-700',
        };
      case 'rejected':
        return {
          icon: <AlertCircle className="w-3.5 h-3.5 text-rose-400" />,
          circle: 'bg-rose-500/20 border-rose-500 text-rose-400',
          titleColor: 'text-rose-600 dark:text-rose-400 font-bold',
          line: 'bg-rose-500',
        };
      case 'optional':
        return {
          icon: <span className="text-[10px] font-mono">OPT</span>,
          circle: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-400',
          titleColor: 'text-slate-500 dark:text-slate-400 font-medium',
          line: 'bg-slate-200 dark:bg-slate-700',
        };
      default:
        return {
          icon: <span className="text-xs font-mono">{stepNumber}</span>,
          circle: 'bg-slate-100 dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 text-slate-400',
          titleColor: 'text-slate-500 dark:text-slate-400 font-medium',
          line: 'bg-slate-200 dark:bg-slate-800',
        };
    }
  };

  const config = getIconAndColors();

  return (
    <div
      onClick={onClick}
      className={`relative flex items-start gap-3.5 ${onClick ? 'cursor-pointer group' : ''}`}
    >
      {/* Step Circle */}
      <div className="flex flex-col items-center">
        <div
          className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 transition-all duration-200 ${config.circle}`}
        >
          {config.icon}
        </div>
        {!isLast && (
          <div className={`w-0.5 min-h-[36px] my-1 rounded-full ${config.line}`} />
        )}
      </div>

      {/* Step Content */}
      <div className="pt-0.5 pb-4 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className={`text-xs ${config.titleColor}`}>{title}</span>
          {requiredRole && (
            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-mono">
              <Shield className="w-2.5 h-2.5" />
              {requiredRole}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
            {subtitle}
          </p>
        )}
        {timestamp && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
            {new Date(timestamp).toLocaleDateString()} {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </div>
  );
};
