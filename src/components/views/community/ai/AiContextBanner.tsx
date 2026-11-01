import React from 'react';
import {
  Activity,
  Calendar,
  Layers,
  Database,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Zap,
  Info,
} from 'lucide-react';
import { AiCommunityContext, AiQuotaSnapshot, AiQuotaState } from '../../../../../shared/types/ai.js';
import { DateRangeType } from '../../../../../shared/types/insights.js';

interface AiContextBannerProps {
  communityId: string;
  context: AiCommunityContext | null;
  quota: AiQuotaSnapshot | null;
  selectedPeriod: DateRangeType;
  onPeriodChange: (period: DateRangeType) => void;
  loadingContext: boolean;
  onRefreshContext: () => void;
}

export const AiContextBanner: React.FC<AiContextBannerProps> = ({
  communityId,
  context,
  quota,
  selectedPeriod,
  onPeriodChange,
  loadingContext,
  onRefreshContext,
}) => {
  const isDiscordConnected = context?.tenant?.botConnected ?? false;
  const dataCoverage = context?.dataCoverage?.coverageStatus || 'NO_DATA';

  const getQuotaBadge = (state?: AiQuotaState) => {
    switch (state) {
      case 'AVAILABLE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Quota Available ({quota?.remaining ?? 0} left)
          </span>
        );
      case 'LIMIT_REACHED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            Daily Limit Reached
          </span>
        );
      case 'RATE_LIMITED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600" />
            Rate Limited
          </span>
        );
      case 'FEATURE_NOT_ENABLED':
      case 'BILLING_REQUIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 border border-zinc-200">
            <Info className="w-3 h-3 text-zinc-500" />
            Feature Inactive
          </span>
        );
      default:
        return null;
    }
  };

  const getCoverageLabel = (cov: string) => {
    switch (cov) {
      case 'FULL':
        return { text: 'Full Telemetry', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
      case 'PARTIAL':
        return { text: 'Partial Data', color: 'text-amber-700 bg-amber-50 border-amber-200' };
      case 'MINIMAL':
        return { text: 'Minimal Signals', color: 'text-orange-700 bg-orange-50 border-orange-200' };
      default:
        return { text: 'No Signals', color: 'text-zinc-700 bg-zinc-100 border-zinc-200' };
    }
  };

  const coverageMeta = getCoverageLabel(dataCoverage);

  return (
    <div className="bg-white border-b border-zinc-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 md:gap-4">
        {/* Community Scope */}
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-zinc-500" />
          <span className="font-medium text-zinc-900 truncate max-w-[160px] sm:max-w-xs">
            {context?.tenant?.communityName || communityId}
          </span>
        </div>

        <div className="h-4 w-px bg-zinc-200 hidden sm:block" />

        {/* Discord Connection Status */}
        <div className="flex items-center gap-1.5 text-xs text-zinc-600">
          {isDiscordConnected ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Discord Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-zinc-500">
              <span className="w-2 h-2 rounded-full bg-zinc-400" />
              Discord Offline
            </span>
          )}
        </div>

        <div className="h-4 w-px bg-zinc-200 hidden md:block" />

        {/* Data Coverage Badge */}
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${coverageMeta.color}`}
          >
            <Activity className="w-3 h-3" />
            {coverageMeta.text}
          </span>
        </div>

        {/* Quota Badge */}
        {quota && <div className="hidden lg:block">{getQuotaBadge(quota.remaining <= 0 ? 'LIMIT_REACHED' : 'AVAILABLE')}</div>}
      </div>

      <div className="flex items-center gap-2.5">
        {/* Time Period Filter */}
        <div className="flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-zinc-500" />
          <select
            id="ai-context-period-select"
            value={selectedPeriod}
            onChange={(e) => onPeriodChange(e.target.value as DateRangeType)}
            className="text-xs bg-zinc-50 border border-zinc-300 rounded px-2 py-1 font-medium text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value="TODAY">Today</option>
            <option value="LAST_7_DAYS">Last 7 Days</option>
            <option value="LAST_30_DAYS">Last 30 Days</option>
            <option value="LAST_90_DAYS">Last 90 Days</option>
            <option value="ALL_TIME">All Time</option>
          </select>
        </div>

        {/* Refresh Context Button */}
        <button
          id="btn-refresh-ai-context"
          onClick={onRefreshContext}
          disabled={loadingContext}
          title="Refresh verified community telemetry"
          className="p-1 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 rounded transition disabled:opacity-50"
        >
          <Layers className={`w-3.5 h-3.5 ${loadingContext ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
};
