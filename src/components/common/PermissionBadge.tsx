import React from 'react';
import { Key } from 'lucide-react';
import { Permission } from '../../../shared/types/rbac.js';

interface PermissionBadgeProps {
  permission: Permission | string;
  size?: 'sm' | 'md';
  className?: string;
}

export const PermissionBadge: React.FC<PermissionBadgeProps> = ({
  permission,
  size = 'sm',
  className = '',
}) => {
  const isPlatform = permission.startsWith('platform.');
  
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono rounded-md border ${
        isPlatform
          ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
          : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
      } ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2 py-1 text-xs'
      } ${className}`}
    >
      <Key className="w-2.5 h-2.5 opacity-60" />
      <span>{permission}</span>
    </span>
  );
};
