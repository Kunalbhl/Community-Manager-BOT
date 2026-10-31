import React from 'react';
import { Shield, ShieldAlert, Crown, UserCheck, Users, User } from 'lucide-react';
import { CommunityRole, UserRole } from '../../../shared/types/rbac.js';

interface RoleBadgeProps {
  role: UserRole | string;
  size?: 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({
  role,
  size = 'md',
  showIcon = true,
  className = '',
}) => {
  const getRoleConfig = (r: string) => {
    switch (r.toUpperCase()) {
      case 'PLATFORM_OWNER':
        return {
          label: 'Platform Owner',
          icon: ShieldAlert,
          classes: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
        };
      case 'OWNER':
      case 'SERVER_OWNER':
        return {
          label: 'Server Owner',
          icon: Crown,
          classes: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        };
      case 'CONTROLLER':
        return {
          label: 'Controller',
          icon: Shield,
          classes: 'bg-[#5865F2]/10 text-[#5865F2] dark:text-[#7983F5] border-[#5865F2]/20',
        };
      case 'INTERVIEWER':
        return {
          label: 'Interviewer',
          icon: UserCheck,
          classes: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
        };
      case 'RECRUITER':
        return {
          label: 'Recruiter',
          icon: Users,
          classes: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
        };
      case 'MEMBER':
        return {
          label: 'Member',
          icon: User,
          classes: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
        };
      case 'APPLICANT':
        return {
          label: 'Applicant',
          icon: User,
          classes: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
        };
      default:
        return {
          label: r,
          icon: Shield,
          classes: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
        };
    }
  };

  const config = getRoleConfig(role);
  const Icon = config.icon;

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wide ${config.classes} ${sizeClasses} ${className}`}
    >
      {showIcon && <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />}
      <span>{config.label}</span>
    </span>
  );
};
