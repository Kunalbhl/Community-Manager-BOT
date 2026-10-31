import React from 'react';

export interface MetricItem {
  id: string;
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ElementType;
  badge?: string;
  badgeType?: 'neutral' | 'success' | 'warning' | 'info' | 'danger';
  onClick?: () => void;
}

interface MetricStripProps {
  metrics: MetricItem[];
  onSelectMetric?: (metricId: string) => void;
}

export const MetricStrip: React.FC<MetricStripProps> = ({ metrics, onSelectMetric }) => {
  const getBadgeStyle = (type?: string) => {
    switch (type) {
      case 'success':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'warning':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'danger':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'info':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
      {metrics.map((m) => {
        const Icon = m.icon;
        const isClickable = Boolean(m.onClick || onSelectMetric);

        const handleClick = () => {
          if (m.onClick) {
            m.onClick();
          } else if (onSelectMetric) {
            onSelectMetric(m.id);
          }
        };

        return (
          <div
            key={m.id}
            onClick={isClickable ? handleClick : undefined}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={
              isClickable
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleClick();
                    }
                  }
                : undefined
            }
            className={`rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-all ${
              isClickable
                ? 'cursor-pointer hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0'
                : 'hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 truncate">
                {m.label}
              </span>
              {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" />}
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-2">
              <span className="text-xl font-extrabold text-slate-900 tracking-tight sm:text-2xl">
                {m.value}
              </span>
              {m.badge && (
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${getBadgeStyle(
                    m.badgeType
                  )}`}
                >
                  {m.badge}
                </span>
              )}
            </div>

            {m.subtext && <p className="mt-1 text-[11px] text-slate-400 truncate">{m.subtext}</p>}
          </div>
        );
      })}
    </div>
  );
};
