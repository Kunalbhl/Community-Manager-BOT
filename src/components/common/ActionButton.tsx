import React from 'react';
import { Loader2 } from 'lucide-react';

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'discord';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ElementType;
  iconPosition?: 'left' | 'right';
  children: React.ReactNode;
}

export const ActionButton: React.FC<ActionButtonProps> = ({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon: Icon,
  iconPosition = 'left',
  disabled,
  children,
  className = '',
  ...props
}) => {
  const getVariantClasses = () => {
    switch (variant) {
      case 'discord':
      case 'primary':
        return 'bg-[#5865F2] hover:bg-[#4752C4] text-white shadow-xs focus:ring-[#5865F2]/40 active:translate-y-px';
      case 'secondary':
        return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 focus:ring-slate-400';
      case 'danger':
        return 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs focus:ring-rose-400';
      case 'success':
        return 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs focus:ring-emerald-400';
      case 'ghost':
        return 'bg-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60';
      default:
        return 'bg-[#5865F2] hover:bg-[#4752C4] text-white shadow-xs';
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'px-2.5 py-1 text-xs rounded-md gap-1.5';
      case 'lg':
        return 'px-5 py-2.5 text-base rounded-xl gap-2.5';
      default:
        return 'px-3.5 py-2 text-xs font-bold rounded-lg gap-2';
    }
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center font-semibold transition-all duration-150 focus:outline-hidden focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${getVariantClasses()} ${getSizeClasses()} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <>
          {Icon && iconPosition === 'left' && <Icon className="w-4 h-4 shrink-0" />}
          <span>{children}</span>
          {Icon && iconPosition === 'right' && <Icon className="w-4 h-4 shrink-0" />}
        </>
      )}
    </button>
  );
};
