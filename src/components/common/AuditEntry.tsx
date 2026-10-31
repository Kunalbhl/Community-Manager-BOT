import React from 'react';
import { Shield, Clock, User, ArrowRight } from 'lucide-react';
import { RoleBadge } from './RoleBadge.js';

interface AuditEntryProps {
  id: string;
  action: string;
  actorUserId: string;
  actorRole: string;
  targetType?: string;
  targetId?: string;
  timestamp: string;
  metadata?: Record<string, any>;
  className?: string;
}

export const AuditEntry: React.FC<AuditEntryProps> = ({
  action,
  actorUserId,
  actorRole,
  targetType,
  targetId,
  timestamp,
  metadata,
  className = '',
}) => {
  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 transition-all duration-150 hover:border-slate-300 dark:hover:border-slate-700 ${className}`}
    >
      <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5">
        <Shield className="w-4 h-4 text-slate-500 dark:text-slate-400" />
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">
            {action}
          </span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(timestamp).toLocaleDateString()} {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
          <span className="flex items-center gap-1 text-slate-900 dark:text-slate-200 font-medium">
            <User className="w-3 h-3 text-slate-400" />
            {actorUserId}
          </span>
          <RoleBadge role={actorRole} size="sm" />
          {targetType && (
            <>
              <ArrowRight className="w-3 h-3 text-slate-400" />
              <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {targetType}: {targetId || 'N/A'}
              </span>
            </>
          )}
        </div>

        {metadata && Object.keys(metadata).length > 0 && (
          <div className="mt-2 text-[11px] font-mono text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/60 p-2 rounded-lg border border-slate-200/60 dark:border-slate-800/60 overflow-x-auto">
            {JSON.stringify(metadata, null, 2)}
          </div>
        )}
      </div>
    </div>
  );
};
