import React from 'react';

interface SectionHeaderProps {
  title: string;
  description?: string;
  badge?: string;
  badgeColor?: 'discord' | 'emerald' | 'amber' | 'rose' | 'slate';
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ElementType;
    disabled?: boolean;
    variant?: 'primary' | 'secondary' | 'ghost';
  };
  children?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  description,
  badge,
  badgeColor = 'discord',
  action,
  children,
  className = '',
}) => {
  const getBadgeClass = () => {
    switch (badgeColor) {
      case 'emerald':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'amber':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'rose':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'slate':
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
      default:
        return 'bg-[#5865F2]/10 text-[#5865F2] dark:text-[#7983F5] border-[#5865F2]/20';
    }
  };

  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between py-2 ${className}`}>
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
            {title}
          </h3>
          {badge && (
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${getBadgeClass()}`}>
              {badge}
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {action && (
          <button
            onClick={action.onClick}
            disabled={action.disabled}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed ${
              action.variant === 'secondary'
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                : action.variant === 'ghost'
                ? 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                : 'bg-[#5865F2] hover:bg-[#4752C4] text-white shadow-xs'
            }`}
          >
            {action.icon && React.createElement(action.icon, { className: 'w-3.5 h-3.5' })}
            {action.label}
          </button>
        )}
        {children}
      </div>
    </div>
  );
};
