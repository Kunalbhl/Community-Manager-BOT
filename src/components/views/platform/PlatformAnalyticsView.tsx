import React, { useState, useEffect } from 'react';
import {
  Activity,
  TrendingUp,
  Users,
  FileCheck,
  Cpu,
  Table,
  Bell,
  AlertTriangle,
  Calendar,
  Filter,
  RefreshCw,
  ShieldAlert,
  Zap,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
} from 'lucide-react';

interface PlatformAnalyticsViewProps {
  platformKey: string;
}

export const PlatformAnalyticsView: React.FC<PlatformAnalyticsViewProps> = ({ platformKey }) => {
  const [range, setRange] = useState('30d');
  const [tenantFilter, setTenantFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [quotaData, setQuotaData] = useState<any>(null);
  const [groupedErrors, setGroupedErrors] = useState<any[]>([]);
  const [securityEvents, setSecurityEvents] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'metrics' | 'quotas' | 'errors' | 'security'>('metrics');

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const headers = { 'x-platform-key': platformKey || 'cr_platform_verified_claim_token' };
      let analyticsUrl = `/api/v1/platform/analytics?range=${range}`;
      if (tenantFilter) analyticsUrl += `&communityId=${tenantFilter}`;

      const [resAnalytics, resQuota, resErrors, resSec] = await Promise.all([
        fetch(analyticsUrl, { headers }),
        fetch('/api/v1/platform/quotas', { headers }),
        fetch(`/api/v1/platform/errors${tenantFilter ? `?communityId=${tenantFilter}` : ''}`, { headers }),
        fetch(`/api/v1/platform/security${tenantFilter ? `?communityId=${tenantFilter}` : ''}`, { headers }),
      ]);

      const [jsonAnalytics, jsonQuota, jsonErrors, jsonSec] = await Promise.all([
        resAnalytics.json(),
        resQuota.json(),
        resErrors.json(),
        resSec.json(),
      ]);

      if (jsonAnalytics.success) setAnalyticsData(jsonAnalytics);
      if (jsonQuota.success) setQuotaData(jsonQuota.data);
      if (jsonErrors.success) setGroupedErrors(jsonErrors.data || []);
      if (jsonSec.success) setSecurityEvents(jsonSec.data || []);
    } catch (err) {
      console.error('Failed to fetch platform telemetry data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [range, tenantFilter, platformKey]);

  const summary = analyticsData?.summary || {
    dailyActiveUsers: 0,
    weeklyActiveUsers: 0,
    monthlyActiveUsers: 0,
    totalApplicationsSubmitted: 0,
    totalApplicationsApproved: 0,
    totalApplicationsRejected: 0,
    totalApplicationsPending: 0,
    recruiterActivity: 0,
    referralsRecorded: 0,
    aiRequests: 0,
    aiQuotaUsed: 0,
    spreadsheetSyncs: 0,
    notificationOperations: 0,
    errorsEncountered: 0,
  };

  const quotas = quotaData?.quotas || {
    aiRequests: { current: 0, max: 100 },
    applications: { current: 0, max: 50 },
    sheetWrites: { current: 0, max: 200 },
    maxAiTokensPerRequest: 2048,
  };

  return (
    <div id="platform-analytics-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
              PLATFORM LEVEL
            </span>
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
              TELEMETRY & OPERATIONAL CONTROL
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Platform Analytics, Quotas & Error Center
          </h1>
          <p className="text-sm text-slate-500">
            Monitor multi-tenant traffic, free-first quota consumption, deduplicated operational errors, and security logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="today">Today</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
          <button
            onClick={fetchAllData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex border-b border-slate-200">
        {[
          { id: 'metrics', label: 'Telemetry Metrics' },
          { id: 'quotas', label: 'Free-First Quotas' },
          { id: 'errors', label: `Deduplicated Error Center (${groupedErrors.length})` },
          { id: 'security', label: `Security Center (${securityEvents.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors ${
              activeTab === tab.id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scope Badge */}
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <span>Active Scope: </span>
          <span className="font-semibold text-slate-800">
            {tenantFilter ? `Community ID [${tenantFilter}]` : 'Platform-Wide (All Tenants)'}
          </span>
        </div>
        <span>Free Tier Mode: FREE_MODE=true</span>
      </div>

      {/* TAB 1: METRICS */}
      {activeTab === 'metrics' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Active Users</span>
              <Users className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-900">{summary.dailyActiveUsers}</div>
            <p className="mt-1 text-[11px] text-slate-500">Monthly: {summary.monthlyActiveUsers}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Applications</span>
              <FileCheck className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-900">{summary.totalApplicationsSubmitted}</div>
            <p className="mt-1 text-[11px] text-slate-500">
              Approved: {summary.totalApplicationsApproved} | Rejected: {summary.totalApplicationsRejected}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">AI Requests</span>
              <Cpu className="h-4 w-4 text-purple-600" />
            </div>
            <div className="mt-3 text-2xl font-bold text-slate-900">{summary.aiRequests}</div>
            <p className="mt-1 text-[11px] text-slate-500">Advisory screening calls</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Errors Recorded</span>
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            </div>
            <div className="mt-3 text-2xl font-bold text-rose-600">{groupedErrors.length}</div>
            <p className="mt-1 text-[11px] text-slate-500">Unique deduplicated groups</p>
          </div>
        </div>
      )}

      {/* TAB 2: QUOTAS */}
      {activeTab === 'quotas' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Free-First Quota Monitor</h3>
                <p className="text-xs text-slate-500">
                  Strict free mode caps. Resets daily at Midnight UTC ({quotaData?.resetTimeUtc ? new Date(quotaData.resetTimeUtc).toUTCString() : '00:00 UTC'}).
                </p>
              </div>
              <span className={`rounded px-2.5 py-1 text-xs font-semibold ${
                quotaData?.status === 'QUOTA_EXCEEDED' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
              }`}>
                {quotaData?.status || 'NORMAL'}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* AI Requests Quota */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">AI Requests / Day</span>
                  <Zap className="h-4 w-4 text-amber-500" />
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {quotas.aiRequests.current} / {quotas.aiRequests.max}
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-amber-500"
                    style={{ width: `${Math.min(100, (quotas.aiRequests.current / quotas.aiRequests.max) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500">Max Tokens/Req: {quotas.maxAiTokensPerRequest}</p>
              </div>

              {/* Applications Quota */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Applications / Day</span>
                  <FileCheck className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {quotas.applications.current} / {quotas.applications.max}
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500"
                    style={{ width: `${Math.min(100, (quotas.applications.current / quotas.applications.max) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500">Limit: {quotas.applications.max}/day per server</p>
              </div>

              {/* Sheet Writes Quota */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Sheet Writes / Day</span>
                  <Table className="h-4 w-4 text-indigo-500" />
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {quotas.sheetWrites.current} / {quotas.sheetWrites.max}
                </div>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500"
                    style={{ width: `${Math.min(100, (quotas.sheetWrites.current / quotas.sheetWrites.max) * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-[11px] text-slate-500">Google Sheets sync limit</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DEDUPLICATED ERROR CENTER */}
      {activeTab === 'errors' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-semibold text-slate-900">Operational Error Center</h3>
            <p className="text-xs text-slate-500">
              Repeated identical failures are grouped automatically (e.g. "Google Sheets permission failure x 37").
            </p>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="p-3 font-semibold">Category</th>
                  <th className="p-3 font-semibold">Operation</th>
                  <th className="p-3 font-semibold">Safe Message</th>
                  <th className="p-3 font-semibold text-right">Occurrences</th>
                  <th className="p-3 font-semibold">Latest Time</th>
                  <th className="p-3 font-semibold">Correlation ID</th>
                  <th className="p-3 font-semibold text-right">Retryable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {groupedErrors.length > 0 ? (
                  groupedErrors.map((err) => (
                    <tr key={err.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-800">{err.category}</td>
                      <td className="p-3 font-mono text-indigo-600">{err.operation}</td>
                      <td className="p-3 text-slate-700 max-w-xs truncate">{err.safeMessage}</td>
                      <td className="p-3 text-right">
                        <span className="rounded bg-rose-50 px-2 py-0.5 font-bold text-rose-700">
                          x {err.occurrenceCount}
                        </span>
                      </td>
                      <td className="p-3 text-slate-500">{new Date(err.latestTimestamp).toLocaleString()}</td>
                      <td className="p-3 font-mono text-[10px] text-slate-500">{err.correlationId}</td>
                      <td className="p-3 text-right">
                        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                          err.retryable ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {err.retryable ? 'YES' : 'NO'}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400">
                      NO_DATA: No operational errors logged for this scope.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: SECURITY CENTER */}
      {activeTab === 'security' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-base font-semibold text-slate-900">Platform Security Center</h3>
            <p className="text-xs text-slate-500">
              Audit logs monitoring cross-tenant access attempts, guild mismatches, and authorization failures.
            </p>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <th className="p-3 font-semibold">Severity</th>
                  <th className="p-3 font-semibold">Category</th>
                  <th className="p-3 font-semibold">Actor User ID</th>
                  <th className="p-3 font-semibold">Description</th>
                  <th className="p-3 font-semibold">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {securityEvents.length > 0 ? (
                  securityEvents.map((evt) => (
                    <tr key={evt.id} className="hover:bg-slate-50/50">
                      <td className="p-3">
                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                          evt.severity === 'CRITICAL'
                            ? 'bg-red-100 text-red-800'
                            : evt.severity === 'HIGH'
                            ? 'bg-rose-100 text-rose-700'
                            : evt.severity === 'WARNING'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {evt.severity}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-slate-800">{evt.category}</td>
                      <td className="p-3 font-mono text-slate-700">{evt.actorUserId}</td>
                      <td className="p-3 text-slate-800">{evt.description}</td>
                      <td className="p-3 text-slate-500">{new Date(evt.timestamp).toLocaleString()}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">
                      NO_DATA: No security violations detected.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
