import React from 'react';
import {
  LucideIcon,
  Inbox,
  AlertTriangle,
  Lock,
  Settings,
  HelpCircle,
  Zap,
  RefreshCw,
} from 'lucide-react';

export type EmptyStateVariant =
  | 'no-data'
  | 'not-configured'
  | 'permission-required'
  | 'error'
  | 'limit-reached'
  | 'insufficient-data';

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  icon?: LucideIcon;
  title: string;
  description: string;
  reason?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  variant = 'no-data',
  icon,
  title,
  description,
  reason,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}) => {
  const getDefaultIcon = () => {
    switch (variant) {
      case 'not-configured':
        return Settings;
      case 'permission-required':
        return Lock;
      case 'error':
        return AlertTriangle;
      case 'limit-reached':
        return Zap;
      case 'insufficient-data':
        return HelpCircle;
      case 'no-data':
      default:
        return Inbox;
    }
  };

  const Icon = icon || getDefaultIcon();

  const getVariantStyles = () => {
    switch (variant) {
      case 'error':
        return {
          iconBg: 'bg-rose-100 text-rose-600',
          badge: 'bg-rose-50 text-rose-700 border-rose-200',
          badgeText: 'System Alert',
        };
      case 'not-configured':
        return {
          iconBg: 'bg-amber-100 text-amber-700',
          badge: 'bg-amber-50 text-amber-800 border-amber-200',
          badgeText: 'Setup Required',
        };
      case 'permission-required':
        return {
          iconBg: 'bg-purple-100 text-purple-700',
          badge: 'bg-purple-50 text-purple-800 border-purple-200',
          badgeText: 'Access Restricted',
        };
      case 'limit-reached':
        return {
          iconBg: 'bg-indigo-100 text-indigo-700',
          badge: 'bg-indigo-50 text-indigo-800 border-indigo-200',
          badgeText: 'Quota Limit Reached',
        };
      case 'insufficient-data':
        return {
          iconBg: 'bg-slate-100 text-slate-600',
          badge: 'bg-slate-100 text-slate-700 border-slate-200',
          badgeText: 'Zero Fake Data Mode',
        };
      case 'no-data':
      default:
        return {
          iconBg: 'bg-slate-100 text-slate-500',
          badge: 'bg-slate-100 text-slate-600 border-slate-200',
          badgeText: 'No Records',
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center sm:p-12 transition-all">
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl shadow-2xs mb-3 ${styles.iconBg}`}>
        <Icon className="h-6 w-6" />
      </div>

      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold mb-2 uppercase ${styles.badge}`}>
        {styles.badgeText}
      </span>

      <h3 className="text-base font-bold text-slate-900 tracking-tight">{title}</h3>
      <p className="mt-1 max-w-md text-xs text-slate-500 leading-relaxed">{description}</p>

      {reason && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-600 max-w-md">
          <strong className="text-slate-800">Why: </strong>
          {reason}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {actionLabel && onAction && (
          <button
            onClick={onAction}
            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all"
          >
            {actionLabel}
          </button>
        )}

        {secondaryActionLabel && onSecondaryAction && (
          <button
            onClick={onSecondaryAction}
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-all"
          >
            {secondaryActionLabel}
          </button>
        )}
      </div>
    </div>
  );
};
