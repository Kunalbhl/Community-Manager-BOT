import React from 'react';
import { AlertTriangle, RefreshCw, Lock, Radio, Settings, CheckCircle2 } from 'lucide-react';

export interface ErrorStateProps {
  code?: string;
  title?: string;
  message: string;
  correlationId?: string;
  retryable?: boolean;
  onRetry?: () => void;
  requiredAction?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  code = 'OPERATIONAL_ERROR',
  title = 'Operation Encountered an Issue',
  message,
  correlationId,
  retryable = false,
  onRetry,
  requiredAction,
}) => {
  return (
    <div className="bg-red-950/20 border border-red-900/50 rounded-xl p-5 text-red-200 shadow-sm space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-red-300 text-sm">{title}</h4>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-900/40 text-red-300 border border-red-800/40">
              {code}
            </span>
          </div>
          <p className="text-xs text-red-300/90 mt-1 leading-relaxed">{message}</p>
          {requiredAction && (
            <div className="mt-2 text-xs bg-red-900/30 p-2 rounded border border-red-800/30 text-red-200">
              <strong className="font-medium">Required Action: </strong>
              {requiredAction}
            </div>
          )}
          {correlationId && (
            <p className="text-[10px] font-mono text-red-400/70 mt-2">
              Ref ID: {correlationId}
            </p>
          )}
        </div>
      </div>

      {retryable && onRetry && (
        <div className="pt-2 border-t border-red-900/40 flex justify-end">
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-red-900/50 hover:bg-red-800/60 text-red-200 border border-red-700/50 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry Operation
          </button>
        </div>
      )}
    </div>
  );
};

export const RetryAction: React.FC<{ onRetry: () => void; isRetrying?: boolean; label?: string }> = ({
  onRetry,
  isRetrying = false,
  label = 'Retry',
}) => {
  return (
    <button
      onClick={onRetry}
      disabled={isRetrying}
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors disabled:opacity-50"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
      {isRetrying ? 'Retrying...' : label}
    </button>
  );
};

export const ConnectionState: React.FC<{
  connected: boolean;
  serviceName: string;
  details?: string;
}> = ({ connected, serviceName, details }) => {
  return (
    <div className="flex items-center justify-between p-3 bg-zinc-900/80 border border-zinc-800 rounded-lg text-xs">
      <div className="flex items-center gap-2.5">
        <Radio className={`w-4 h-4 ${connected ? 'text-emerald-400' : 'text-amber-400'}`} />
        <div>
          <span className="font-medium text-zinc-200">{serviceName}</span>
          {details && <p className="text-[11px] text-zinc-400">{details}</p>}
        </div>
      </div>
      <span
        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
          connected ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/50' : 'bg-amber-950 text-amber-300 border border-amber-800/50'
        }`}
      >
        {connected ? 'CONNECTED' : 'DISCONNECTED'}
      </span>
    </div>
  );
};

export const PermissionState: React.FC<{
  requiredRole?: string;
  message?: string;
}> = ({ requiredRole = 'ADMIN', message = 'You lack permissions to execute this operational action.' }) => {
  return (
    <div className="flex items-center gap-3 p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl text-xs text-zinc-300">
      <Lock className="w-5 h-5 text-amber-400 shrink-0" />
      <div>
        <h5 className="font-medium text-zinc-200">Permission Boundary Restricted</h5>
        <p className="text-zinc-400 mt-0.5">{message}</p>
      </div>
    </div>
  );
};

export const NotConfiguredState: React.FC<{
  featureName: string;
  description: string;
  onConfigure?: () => void;
}> = ({ featureName, description, onConfigure }) => {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center bg-zinc-900/40 border border-dashed border-zinc-800 rounded-xl">
      <Settings className="w-8 h-8 text-zinc-500 mb-2" />
      <h4 className="text-sm font-semibold text-zinc-200">{featureName} Not Configured</h4>
      <p className="text-xs text-zinc-400 max-w-sm mt-1 mb-4">{description}</p>
      {onConfigure && (
        <button
          onClick={onConfigure}
          className="text-xs font-medium px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
        >
          Configure Integration
        </button>
      )}
    </div>
  );
};
