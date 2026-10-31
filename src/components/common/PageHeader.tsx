import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: string;
  badgeType?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';
  primaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ElementType;
    disabled?: boolean;
  };
  secondaryActions?: Array<{
    label: string;
    onClick: () => void;
    icon?: React.ElementType;
    variant?: 'outline' | 'ghost' | 'danger';
  }>;
  children?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  badge,
  badgeType = 'indigo',
  primaryAction,
  secondaryActions = [],
  children,
}) => {
  const getBadgeStyle = () => {
    switch (badgeType) {
      case 'emerald':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'amber':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'rose':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'slate':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      default:
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition-all sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
              {title}
            </h1>
            {badge && (
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getBadgeStyle()}`}
              >
                {badge}
              </span>
            )}
          </div>
          {description && (
            <p className="text-xs text-slate-500 sm:text-sm max-w-3xl leading-relaxed">
              {description}
            </p>
          )}
        </div>

        {(primaryAction || secondaryActions.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {secondaryActions.map((action, idx) => {
              const Icon = action.icon;
              const isDanger = action.variant === 'danger';
              return (
                <button
                  key={idx}
                  onClick={action.onClick}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    isDanger
                      ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  <span>{action.label}</span>
                </button>
              );
            })}

            {primaryAction && (
              <button
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 focus:outline-hidden disabled:opacity-50 transition"
              >
                {primaryAction.icon && <primaryAction.icon className="h-4 w-4" />}
                <span>{primaryAction.label}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {children && <div className="mt-4 pt-4 border-t border-slate-100">{children}</div>}
    </div>
  );
};
