import React, { useEffect, useState } from 'react';
import { Activity, ShieldCheck, AlertCircle, RefreshCw, Radio } from 'lucide-react';
import { TenantHealthReport } from '../../types';

export const CommunityHealthWidget: React.FC<{ communityId: string }> = ({ communityId }) => {
  const [report, setReport] = useState<TenantHealthReport | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTenantHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/ops/tenant-health?communityId=${communityId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setReport(json.data);
        }
      }
    } catch (e) {
      console.error('Failed to fetch tenant health:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (communityId) {
      fetchTenantHealth();
    }
  }, [communityId]);

  if (loading) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 flex items-center justify-between animate-pulse">
        <div className="h-4 bg-zinc-800 rounded w-1/3"></div>
        <div className="h-4 bg-zinc-800 rounded w-1/6"></div>
      </div>
    );
  }

  if (!report) return null;

  const isHealthy = report.status === 'HEALTHY';

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 text-xs space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-zinc-200">Community Health Status</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              isHealthy
                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                : 'bg-amber-950 text-amber-400 border border-amber-800/60'
            }`}
          >
            {report.status}
          </span>
          <button
            onClick={fetchTenantHealth}
            className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
            title="Refresh Health"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="bg-zinc-950/40 p-2 rounded border border-zinc-850 flex items-center justify-between">
          <span className="text-zinc-400">Discord Connection</span>
          <span className={`font-semibold ${report.discordConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
            {report.discordConnected ? 'ONLINE' : 'DISCONNECTED'}
          </span>
        </div>
        <div className="bg-zinc-950/40 p-2 rounded border border-zinc-850 flex items-center justify-between">
          <span className="text-zinc-400">Bot Permissions</span>
          <span className={`font-semibold ${report.botPermissionsValid ? 'text-emerald-400' : 'text-amber-400'}`}>
            {report.botPermissionsValid ? 'VALID' : 'ATTENTION'}
          </span>
        </div>
      </div>

      {report?.issues && Array.isArray(report.issues) && report.issues.length > 0 && (
        <div className="bg-amber-950/20 border border-amber-900/40 rounded-lg p-2.5 space-y-1">
          <div className="flex items-center gap-1.5 text-amber-300 font-medium">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Active Community Issues ({report.issues.length})</span>
          </div>
          <ul className="list-disc list-inside text-[11px] text-amber-200/80 space-y-0.5">
            {report.issues.map((issue, idx) => (
              <li key={idx} className="truncate">
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
