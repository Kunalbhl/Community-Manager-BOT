import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  XCircle,
  Video,
  HelpCircle,
  ShieldAlert,
  ArrowUpRight,
  BookOpen,
  FileCheck,
  CheckCheck,
} from 'lucide-react';

export type StatusVariant =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'SCREENING'
  | 'CONSENT_REQUIRED'
  | 'ONBOARDING_QUIZ'
  | 'ONBOARDING_VERIFIED'
  | 'ONBOARDING_REVIEW_REQUIRED'
  | 'UNDER_REVIEW'
  | 'ADDITIONAL_INFORMATION_REQUIRED'
  | 'INTERVIEW_REQUIRED'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEW_IN_PROGRESS'
  | 'INTERVIEW_COMPLETED'
  | 'ESCALATED'
  | 'APPROVED'
  | 'RECRUITMENT_SUCCESSFUL'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'BLACKLISTED'
  | 'RESTRICTED'
  | 'JOIN_PENDING'
  | 'JOINED'
  | 'MEMBER_ACTIVATED'
  | 'ONBOARDED'
  | 'FIRST_ENGAGEMENT'
  | '7_DAY_ACTIVE'
  | '30_DAY_ACTIVE'
  | '90_DAY_ACTIVE'
  | 'CLOSED'
  | 'ACTIVE'
  | 'PENDING'
  | 'WARNING'
  | 'CRITICAL'
  | 'SUCCESS'
  | 'HEALTHY'
  | 'DEGRADED'
  | 'UNHEALTHY'
  | 'NOT_CONFIGURED'
  | 'INSUFFICIENT_DATA';

interface StatusBadgeProps {
  status: StatusVariant | string;
  size?: 'sm' | 'md';
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showIcon = true,
}) => {
  const getBadgeConfig = (st?: string | StatusVariant | null) => {
    const safeStr = typeof st === 'string' && st ? st : 'UNKNOWN';
    const formatted = safeStr.replace(/_/g, ' ');
    switch (safeStr.toUpperCase()) {
      case 'APPROVED':
      case 'RECRUITMENT_SUCCESSFUL':
      case 'ONBOARDING_VERIFIED':
      case 'JOINED':
      case 'ACTIVE':
      case 'SUCCESS':
      case 'HEALTHY':
      case 'MEMBER_ACTIVATED':
      case 'ONBOARDED':
      case 'FIRST_ENGAGEMENT':
      case '7_DAY_ACTIVE':
      case '30_DAY_ACTIVE':
      case '90_DAY_ACTIVE':
        return {
          label: formatted,
          bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/15',
          dot: 'bg-emerald-500',
          icon: CheckCircle2,
          tooltip: 'Active / Verified state',
        };
      case 'INTERVIEW_SCHEDULED':
      case 'INTERVIEW_IN_PROGRESS':
      case 'INTERVIEW_COMPLETED':
      case 'INTERVIEW_REQUIRED':
        return {
          label: formatted,
          bg: 'bg-[#5865F2]/10 text-[#5865F2] dark:text-[#7983F5] border-[#5865F2]/20 hover:bg-[#5865F2]/15',
          dot: 'bg-[#5865F2]',
          icon: Video,
          tooltip: 'Interview coordination in progress',
        };
      case 'ESCALATED':
        return {
          label: formatted,
          bg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 hover:bg-purple-500/15',
          dot: 'bg-purple-500',
          icon: ArrowUpRight,
          tooltip: 'Escalated for senior reviewer / owner action',
        };
      case 'CONSENT_REQUIRED':
        return {
          label: formatted,
          bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/15',
          dot: 'bg-amber-500',
          icon: BookOpen,
          tooltip: 'Mandatory server rules & guide consent required',
        };
      case 'ONBOARDING_QUIZ':
        return {
          label: formatted,
          bg: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20 hover:bg-cyan-500/15',
          dot: 'bg-cyan-500',
          icon: FileCheck,
          tooltip: 'Rule verification knowledge questions in progress',
        };
      case 'ONBOARDING_REVIEW_REQUIRED':
      case 'ADDITIONAL_INFORMATION_REQUIRED':
      case 'WARNING':
      case 'DEGRADED':
      case 'DRAFT':
        return {
          label: formatted,
          bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/15',
          dot: 'bg-amber-500',
          icon: AlertTriangle,
          tooltip: 'Requires candidate or reviewer action',
        };
      case 'UNDER_REVIEW':
      case 'SUBMITTED':
      case 'SCREENING':
      case 'JOIN_PENDING':
      case 'PENDING':
        return {
          label: formatted,
          bg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/15',
          dot: 'bg-blue-500',
          icon: Clock,
          tooltip: 'Awaiting evaluation / processing',
        };
      case 'BLACKLISTED':
      case 'RESTRICTED':
        return {
          label: formatted,
          bg: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/20',
          dot: 'bg-rose-600',
          icon: ShieldAlert,
          tooltip: 'Blocked by recruitment restriction list',
        };
      case 'REJECTED':
      case 'WITHDRAWN':
      case 'CLOSED':
      case 'CRITICAL':
      case 'UNHEALTHY':
        return {
          label: formatted,
          bg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 hover:bg-rose-500/15',
          dot: 'bg-rose-500',
          icon: XCircle,
          tooltip: 'Rejected or closed entry',
        };
      case 'NOT_CONFIGURED':
      case 'INSUFFICIENT_DATA':
      default:
        return {
          label: formatted,
          bg: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20 hover:bg-slate-500/15',
          dot: 'bg-slate-400',
          icon: HelpCircle,
          tooltip: 'Pending state or configuration',
        };
    }
  };

  const config = getBadgeConfig(status);
  const Icon = config.icon;
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5';

  return (
    <span
      title={config.tooltip}
      aria-label={`${config.label} - ${config.tooltip}`}
      className={`inline-flex items-center gap-1.5 rounded-full border font-bold tracking-tight transition cursor-default ${sizeClass} ${config.bg}`}
    >
      {showIcon ? <Icon className={`${iconSize} shrink-0`} /> : <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />}
      <span className="capitalize">{config.label.toLowerCase()}</span>
    </span>
  );
};

