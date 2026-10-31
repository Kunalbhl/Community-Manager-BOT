import React from 'react';
import { ShieldCheck, TrendingUp, HelpCircle, AlertCircle } from 'lucide-react';
import { DataTruthClassification } from '../../../../../shared/types/insights.js';

interface DataTruthBadgeProps {
  classification: DataTruthClassification;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

export const DataTruthBadge: React.FC<DataTruthBadgeProps> = ({
  classification,
  showIcon = true,
  size = 'sm',
}) => {
  const sizeClasses = size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1';

  switch (classification) {
    case 'VERIFIED_FACT':
      return (
        <span
          title="Directly derived from synchronized database records"
          className={`inline-flex items-center gap-1 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60 ${sizeClasses}`}
        >
          {showIcon && <ShieldCheck className="h-3 w-3 text-emerald-600" />}
          VERIFIED FACT
        </span>
      );

    case 'OBSERVED_CORRELATION':
      return (
        <span
          title="Observed relationship across community metrics over qualifying window"
          className={`inline-flex items-center gap-1 rounded-full font-semibold bg-sky-50 text-sky-700 border border-sky-200/60 ${sizeClasses}`}
        >
          {showIcon && <TrendingUp className="h-3 w-3 text-sky-600" />}
          OBSERVED CORRELATION
        </span>
      );

    case 'POSSIBLE_EXPLANATION':
      return (
        <span
          title="Hypothesis or plausible contributing factor"
          className={`inline-flex items-center gap-1 rounded-full font-semibold bg-amber-50 text-amber-700 border border-amber-200/60 ${sizeClasses}`}
        >
          {showIcon && <HelpCircle className="h-3 w-3 text-amber-600" />}
          POSSIBLE EXPLANATION
        </span>
      );

    case 'INSUFFICIENT_EVIDENCE':
    default:
      return (
        <span
          title="Insufficient baseline records or incomplete observation window"
          className={`inline-flex items-center gap-1 rounded-full font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200 ${sizeClasses}`}
        >
          {showIcon && <AlertCircle className="h-3 w-3 text-zinc-400" />}
          INSUFFICIENT EVIDENCE
        </span>
      );
  }
};
