import React, { useState, useEffect } from 'react';
import {
  Server,
  Users,
  FileText,
  UserCheck,
  Share2,
  Cpu,
  Activity,
  AlertTriangle,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { PlatformOverviewResponse, PlatformOverviewMetrics } from '../../../../shared/types/api.js';

interface PlatformOverviewViewProps {
  onNavigate: (section: string) => void;
  platformKey: string;
}

export const PlatformOverviewView: React.FC<PlatformOverviewViewProps> = ({
  onNavigate,
  platformKey,
}) => {
  const [data, setData] = useState<PlatformOverviewMetrics | null>(null);
  const [recentActivity, setRecentActivity] = useState<Array<{ id: string; action: string; timestamp: string; description: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/platform/overview', {
        headers: {
          'x-platform-key': platformKey || 'cr_platform_verified_claim_token',
        },
      });
      const json: PlatformOverviewResponse = await res.json();
      if (json.success && json.data) {
        setData(json.data);
        if (json.recentActivity) {
          setRecentActivity(json.recentActivity);
        }
      } else {
        setError(json.message || 'Failed to load platform metrics');
      }
    } catch (err) {
      setError('Unable to reach server platform endpoint');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, [platformKey]);

  return (
    <div id="platform-overview-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
              PLATFORM LEVEL
            </span>
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
              FREE-FIRST ENGINE
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Platform Master Overview
          </h1>
          <p className="text-sm text-slate-500">
            Global bot telemetry, server registration, and cross-tenant health metrics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="refresh-platform-btn"
            onClick={fetchOverview}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Telemetry
          </button>
          <button
            id="inspect-health-btn"
            onClick={() => onNavigate('health')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <Activity className="h-4 w-4" />
            Inspect Health
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            Authorization / Data Notice
          </div>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Servers */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Discord Servers
            </span>
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
              <Server className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900">
            {data ? data.totalRegisteredServers : 0}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>Active: {data ? data.activeServers : 0}</span>
            <span>Inactive: {data ? data.inactiveServers : 0}</span>
          </div>
        </div>

        {/* Total Users */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Platform Users
            </span>
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900">
            {data ? data.totalRegisteredUsers : 0}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>Active: {data ? data.activeUsers : 0}</span>
            <span>Recruiters: {data ? data.totalRecruiters : 0}</span>
          </div>
        </div>

        {/* Total Applications */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Applications Intake
            </span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <FileText className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900">
            {data ? data.totalApplications : 0}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
            <span>Today: {data ? data.applicationsToday : 0}</span>
            <span>This Week: {data ? data.applicationsThisWeek : 0}</span>
          </div>
        </div>

        {/* System Health */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Platform State
            </span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xl font-bold text-emerald-700">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              Operational
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Pending Feedback: {data ? data.pendingFeedback : 0}
          </div>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-50 p-2.5 text-amber-600">
              <Share2 className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-500">Total Referrals Recorded</div>
              <div className="text-2xl font-bold text-slate-900">
                {data ? data.totalReferrals : 0}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-purple-50 p-2.5 text-purple-600">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-500">Bot Installations</div>
              <div className="text-2xl font-bold text-slate-900">
                {data ? data.botInstallations : 0}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-rose-50 p-2.5 text-rose-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-500">Security Events / Failures</div>
              <div className="text-2xl font-bold text-slate-900">
                {data ? data.failedOperations : 0}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Platform Activity & Quick Navigation */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Activity Timeline */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-semibold text-slate-900">Recent Platform Activity</h3>
            <button
              onClick={() => onNavigate('audit')}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              View Full Audit Log &rarr;
            </button>
          </div>

          {recentActivity.length === 0 ? (
            <div className="py-10 text-center text-slate-500">
              <p className="text-sm">No platform events recorded yet.</p>
              <p className="mt-1 text-xs text-slate-400">
                Administrative changes and server installations will appear in this real-time feed.
              </p>
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {recentActivity.map((act) => (
                <div key={act.id} className="py-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">{act.action}</span>
                    <span className="text-xs text-slate-400">{new Date(act.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{act.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Navigation Cards */}
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-900">Platform Management</h3>
            <p className="mt-1 text-xs text-slate-500">Direct access to platform-owner modules.</p>

            <div className="mt-4 space-y-2">
              <button
                onClick={() => onNavigate('servers')}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-indigo-600" />
                  <span>Manage Registered Servers</span>
                </div>
                <span>&rarr;</span>
              </button>

              <button
                onClick={() => onNavigate('users')}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-600" />
                  <span>Platform Users Directory</span>
                </div>
                <span>&rarr;</span>
              </button>

              <button
                onClick={() => onNavigate('analytics')}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-600" />
                  <span>Cross-Tenant Analytics</span>
                </div>
                <span>&rarr;</span>
              </button>

              <button
                onClick={() => onNavigate('feedback')}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-2.5 text-left text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-amber-600" />
                  <span>Suggestions & Bug Reports</span>
                </div>
                <span>&rarr;</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
