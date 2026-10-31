import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Download,
  Calendar,
  RefreshCw,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Award,
  ChevronRight,
  ShieldAlert,
  ArrowRight,
  UserCheck,
  FileText,
  Activity,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { UserRole } from '../../../../shared/types/rbac.js';

interface ReportsViewProps {
  communityId: string;
  currentRole: UserRole;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ communityId, currentRole }) => {
  const [range, setRange] = useState<'today' | '7d' | '30d' | '90d' | 'custom'>('30d');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<boolean>(false);
  const [exportCategory, setExportCategory] = useState<string>('all');
  const [exportFormat, setExportFormat] = useState<'json' | 'csv'>('json');
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [retryOpId, setRetryOpId] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      let url = `/api/v1/reports?communityId=${communityId}&range=${range}`;
      if (range === 'custom' && startDate && endDate) {
        url += `&startDate=${startDate}&endDate=${endDate}`;
      }

      const res = await fetch(url, {
        headers: {
          'x-community-id': communityId,
          'x-role': currentRole || 'OWNER',
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to load analytics report (${res.status})`);
      }

      const json = await res.json();
      if (json.success) {
        setReportData(json.data);
      } else {
        throw new Error(json.message || 'Analytics error');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch analytics data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [communityId, range, startDate, endDate]);

  const handleExport = async () => {
    try {
      setExporting(true);
      const res = await fetch('/api/v1/reports/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
          'x-role': currentRole || 'OWNER',
        },
        body: JSON.stringify({
          communityId,
          format: exportFormat,
          category: exportCategory,
        }),
      });

      if (!res.ok) {
        throw new Error(`Export failed with HTTP ${res.status}`);
      }

      if (exportFormat === 'csv') {
        const text = await res.text();
        const blob = new Blob([text], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recruitment_report_${communityId}_${exportCategory}_${Date.now()}.csv`;
        a.click();
      } else {
        const json = await res.json();
        const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = json.filename || `recruitment_report_${communityId}_${exportCategory}_${Date.now()}.json`;
        a.click();
      }
      setShowExportModal(false);
    } catch (err: any) {
      alert(`Export Error: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleRetryOperation = async (operationId: string) => {
    try {
      setRetryOpId(operationId);
      const res = await fetch('/api/v1/community/welcome-config/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
          'x-role': currentRole || 'OWNER',
        },
        body: JSON.stringify({ operationId }),
      });

      if (!res.ok) {
        throw new Error(`Retry failed (${res.status})`);
      }
      await fetchAnalytics();
    } catch (err: any) {
      alert(`Retry error: ${err.message}`);
    } finally {
      setRetryOpId(null);
    }
  };

  const cards = reportData?.summaryCards;
  const funnel = reportData?.funnel || [];
  const proc = reportData?.processingAnalytics;
  const journey = reportData?.memberJourneyAnalytics;
  const leaderboard = reportData?.leaderboard;
  const onboardingOps = reportData?.onboardingOperations || [];

  return (
    <div id="reports-view" className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              COMMUNITY OPERATIONAL CONTROL
            </span>
            <span className="rounded bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              TASK 8 ANALYTICS
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Community Analytics & Operational Control
          </h1>
          <p className="text-sm text-slate-500">
            Real recruitment velocity, member journey conversion, recruiter activity, and integration health metrics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Date Filter Dropdown */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            {(['today', '7d', '30d', '90d', 'custom'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  range === r
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {r === 'today'
                  ? 'Today'
                  : r === '7d'
                  ? '7 Days'
                  : r === '30d'
                  ? '30 Days'
                  : r === '90d'
                  ? '90 Days'
                  : 'Custom'}
              </button>
            ))}
          </div>

          <button
            onClick={fetchAnalytics}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            Refresh
          </button>

          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700"
          >
            <Download className="h-3.5 w-3.5" />
            Export Report
          </button>
        </div>
      </div>

      {/* Custom Date Inputs if Custom selected */}
      {range === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-xs">
          <label className="font-semibold text-slate-700">Custom Date Range:</label>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">From:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-800"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">To:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-800"
            />
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {loading && !reportData ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">
          <RefreshCw className="mx-auto h-8 w-8 animate-spin text-indigo-600" />
          <p className="mt-3 text-sm font-medium text-slate-700">Calculating real server analytics...</p>
        </div>
      ) : (
        <>
          {/* Summary Cards Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Applications */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Applications
                </span>
                <FileText className="h-4 w-4 text-indigo-600" />
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Pending Review:</span>
                  <span className="font-bold text-amber-600">{cards?.applications?.pendingReview ?? 0}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Info Required:</span>
                  <span className="font-bold text-sky-600">{cards?.applications?.additionalInfoRequired ?? 0}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Interviews Pending:</span>
                  <span className="font-bold text-indigo-600">{cards?.applications?.interviewsPending ?? 0}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Approved / Rejected:</span>
                  <span className="font-bold text-slate-800">
                    {cards?.applications?.approved ?? 0} / {cards?.applications?.rejected ?? 0}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Member Journey */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Member Journey
                </span>
                <Users className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Awaiting Join:</span>
                  <span className="font-bold text-amber-600">{cards?.memberJourney?.awaitingJoin ?? 0}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Joined Members:</span>
                  <span className="font-bold text-emerald-600">{cards?.memberJourney?.joined ?? 0}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Onboarding Incomplete:</span>
                  <span className="font-bold text-rose-600">{cards?.memberJourney?.onboardingIncomplete ?? 0}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Onboarding Completed:</span>
                  <span className="font-bold text-emerald-700">{cards?.memberJourney?.onboardingCompleted ?? 0}</span>
                </div>
              </div>
            </div>

            {/* 3. Recruiters */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Recruiters
                </span>
                <Award className="h-4 w-4 text-purple-600" />
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Active Recruiters:</span>
                  <span className="font-bold text-purple-600">{cards?.recruiters?.activeRecruiters ?? 0}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Active Codes:</span>
                  <span className="font-bold text-slate-800">{cards?.recruiters?.activeRecruiterCodes ?? 0}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Referrals Recorded:</span>
                  <span className="font-bold text-slate-800">{cards?.recruiters?.referrals ?? 0}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Successful Recruitments:</span>
                  <span className="font-bold text-emerald-600">{cards?.recruiters?.successfulRecruitments ?? 0}</span>
                </div>
              </div>
            </div>

            {/* 4. Onboarding Status */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Onboarding Health
                </span>
                <Activity className="h-4 w-4 text-sky-600" />
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Successful Roles:</span>
                  <span className="font-bold text-emerald-600">{cards?.onboarding?.successfulRoleAssignments ?? 0}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Failed Roles:</span>
                  <span className="font-bold text-rose-600">{cards?.onboarding?.failedRoleAssignments ?? 0}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Welcome DM Failures:</span>
                  <span className="font-bold text-rose-600">{cards?.onboarding?.welcomeFailures ?? 0}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Pending Retries:</span>
                  <span className="font-bold text-amber-600">{cards?.onboarding?.pendingOperations ?? 0}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Recruitment Funnel Section */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Truthful Recruitment Funnel</h3>
                <p className="text-xs text-slate-500">
                  Step-by-step conversion from application start to successful server recruitment.
                </p>
              </div>
              <span className="rounded bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
                Range: {reportData?.dateRange?.type}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
              {funnel.map((step: any, idx: number) => (
                <div
                  key={step.key}
                  className="relative flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-center"
                >
                  <div className="text-[11px] font-semibold tracking-tight text-slate-500 uppercase">
                    {step.label}
                  </div>
                  <div className="my-2 text-xl font-bold text-slate-900">{step.count}</div>
                  <div className="mt-1 border-t border-slate-200 pt-1.5 text-[11px]">
                    <span className="text-slate-500">Conv: </span>
                    <span
                      className={`font-semibold ${
                        step.conversionRate === 'N/A'
                          ? 'text-slate-400'
                          : step.conversionRate.startsWith('100')
                          ? 'text-emerald-600'
                          : 'text-indigo-600'
                      }`}
                    >
                      {step.conversionRate}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed Analytics Grid: Processing & Member Journey */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Application Processing Analytics */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
              <h3 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-3">
                Application Processing Metrics
              </h3>
              <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
                <div className="rounded-lg bg-slate-50 p-3">
                  <span className="text-slate-500">New Applications</span>
                  <div className="mt-1 text-lg font-bold text-slate-900">{proc?.newApplications ?? 0}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <span className="text-slate-500">Pending Review</span>
                  <div className="mt-1 text-lg font-bold text-amber-600">{proc?.pendingApplications ?? 0}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <span className="text-slate-500">Avg Review Time</span>
                  <div className="mt-1 text-lg font-bold text-indigo-600">
                    {proc?.averageReviewTimeMinutes === 'DATA_INCOMPLETE'
                      ? 'DATA_INCOMPLETE'
                      : `${proc?.averageReviewTimeMinutes} mins`}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <span className="text-slate-500">Median Review Time</span>
                  <div className="mt-1 text-lg font-bold text-indigo-600">
                    {proc?.medianReviewTimeMinutes === 'DATA_INCOMPLETE'
                      ? 'DATA_INCOMPLETE'
                      : `${proc?.medianReviewTimeMinutes} mins`}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <span className="text-slate-500">Approval Rate</span>
                  <div className="mt-1 text-lg font-bold text-emerald-600">{proc?.approvalRate ?? 'N/A'}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <span className="text-slate-500">Rejection Rate</span>
                  <div className="mt-1 text-lg font-bold text-rose-600">{proc?.rejectionRate ?? 'N/A'}</div>
                </div>
              </div>
            </div>

            {/* Member Journey Analytics */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
              <h3 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-3">
                Member Journey & Onboarding Breakdown
              </h3>
              <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
                <div className="rounded-lg bg-slate-50 p-3">
                  <span className="text-slate-500">Approved Awaiting Join</span>
                  <div className="mt-1 text-lg font-bold text-amber-600">
                    {journey?.approvedAwaitingJoinCount ?? 0}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <span className="text-slate-500">Avg Time to Join</span>
                  <div className="mt-1 text-lg font-bold text-indigo-600">
                    {journey?.avgTimeApprovalToJoinHours === 'DATA_INCOMPLETE'
                      ? 'DATA_INCOMPLETE'
                      : `${journey?.avgTimeApprovalToJoinHours} hrs`}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <span className="text-slate-500">Rules Acknowledged</span>
                  <div className="mt-1 text-lg font-bold text-emerald-600">
                    {journey?.rulesAcknowledgedCount ?? 0}
                  </div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <span className="text-slate-500">Rules Pending</span>
                  <div className="mt-1 text-lg font-bold text-slate-600">
                    {journey?.rulesPendingCount ?? 0}
                  </div>
                </div>
              </div>

              {/* Independent Operational Breakdown */}
              <div className="mt-4 border-t border-slate-100 pt-3">
                <span className="text-xs font-semibold text-slate-700">Independent Dispatch Breakdown:</span>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded bg-emerald-50 p-2 text-emerald-800">
                    <span className="font-semibold">Role Success:</span> {journey?.breakdown?.roleSuccessCount ?? 0}
                  </div>
                  <div className="rounded bg-rose-50 p-2 text-rose-800">
                    <span className="font-semibold">Role Failure:</span> {journey?.breakdown?.roleFailureCount ?? 0}
                  </div>
                  <div className="rounded bg-emerald-50 p-2 text-emerald-800">
                    <span className="font-semibold">DM Success:</span> {journey?.breakdown?.dmSuccessCount ?? 0}
                  </div>
                  <div className="rounded bg-rose-50 p-2 text-rose-800">
                    <span className="font-semibold">DM Failure:</span> {journey?.breakdown?.dmFailureCount ?? 0}
                  </div>
                  <div className="rounded bg-emerald-50 p-2 text-emerald-800">
                    <span className="font-semibold">Channel Success:</span> {journey?.breakdown?.channelWelcomeSuccessCount ?? 0}
                  </div>
                  <div className="rounded bg-rose-50 p-2 text-rose-800">
                    <span className="font-semibold">Channel Failure:</span> {journey?.breakdown?.channelWelcomeFailureCount ?? 0}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recruiter Leaderboard */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Recruiter Leaderboard</h3>
                <p className="text-xs text-slate-500">
                  Ranked by successful recruitments and approved referrals. (Private applicant answers are protected).
                </p>
              </div>
              <span className={`rounded px-2.5 py-1 text-xs font-semibold ${
                leaderboard?.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
              }`}>
                {leaderboard?.enabled ? 'LEADERBOARD ENABLED' : 'LEADERBOARD DISABLED'}
              </span>
            </div>

            {leaderboard?.enabled ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <th className="p-3 font-semibold">Rank</th>
                      <th className="p-3 font-semibold">Recruiter Discord User ID</th>
                      <th className="p-3 font-semibold">Code</th>
                      <th className="p-3 font-semibold">Status</th>
                      <th className="p-3 font-semibold text-right">Referrals</th>
                      <th className="p-3 font-semibold text-right">Approved</th>
                      <th className="p-3 font-semibold text-right">Successful Recruitments</th>
                      <th className="p-3 font-semibold text-right">Benefits Earned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leaderboard?.rankings?.length > 0 ? (
                      leaderboard.rankings.map((rec: any, index: number) => (
                        <tr key={rec.recruiterDiscordUserId} className="hover:bg-slate-50/50">
                          <td className="p-3 font-bold text-slate-700">#{index + 1}</td>
                          <td className="p-3">
                            <div className="font-medium text-slate-900">{rec.usernameSnapshot}</div>
                            <div className="text-[10px] text-slate-400">ID: {rec.recruiterDiscordUserId}</div>
                          </td>
                          <td className="p-3 font-mono font-semibold text-indigo-600">{rec.recruiterCode}</td>
                          <td className="p-3">
                            <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                              rec.status === 'ACTIVE'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}>
                              {rec.status}
                            </span>
                          </td>
                          <td className="p-3 text-right font-semibold text-slate-800">{rec.referralsCount}</td>
                          <td className="p-3 text-right font-semibold text-amber-600">{rec.approvedReferralsCount}</td>
                          <td className="p-3 text-right font-bold text-emerald-600">{rec.successfulRecruitmentsCount}</td>
                          <td className="p-3 text-right text-slate-700">{rec.earnedBenefits} unlocked</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-slate-400">
                          NO_DATA: No active recruiters recorded yet for this timeframe.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-4 rounded-lg bg-slate-50 p-6 text-center text-xs text-slate-500">
                Leaderboard feature is disabled by Community Settings.
              </div>
            )}
          </div>

          {/* Onboarding Operations Monitor */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Onboarding Operations Monitor</h3>
                <p className="text-xs text-slate-500">
                  Real-time status of role assignments, welcome DMs, and rules acknowledgements with safe retry triggers.
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="p-3 font-semibold">Operation ID</th>
                    <th className="p-3 font-semibold">Type</th>
                    <th className="p-3 font-semibold">Member Discord User ID</th>
                    <th className="p-3 font-semibold">Status</th>
                    <th className="p-3 font-semibold">Failure Reason / Details</th>
                    <th className="p-3 font-semibold">Timestamp</th>
                    <th className="p-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {onboardingOps.length > 0 ? (
                    onboardingOps.map((op: any) => (
                      <tr key={op.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-mono text-[11px] text-slate-600">{op.id}</td>
                        <td className="p-3 font-semibold text-slate-800">{op.operationType}</td>
                        <td className="p-3 font-mono text-slate-700">{op.memberDiscordUserId}</td>
                        <td className="p-3">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                              op.status === 'SUCCESS'
                                ? 'bg-emerald-50 text-emerald-700'
                                : op.status === 'FAILED'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {op.status}
                          </span>
                        </td>
                        <td className="p-3 text-slate-500 max-w-xs truncate">
                          {op.failureReason || 'N/A'}
                        </td>
                        <td className="p-3 text-slate-500">{new Date(op.createdAt).toLocaleString()}</td>
                        <td className="p-3 text-right">
                          {op.retryAvailable ? (
                            <button
                              onClick={() => handleRetryOperation(op.id)}
                              disabled={retryOpId === op.id}
                              className="flex items-center gap-1 ml-auto rounded bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                            >
                              <RotateCcw className={`h-3 w-3 ${retryOpId === op.id ? 'animate-spin' : ''}`} />
                              Retry
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400">Completed / No Retry</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-400">
                        NO_DATA: No onboarding operations recorded for this range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Export Report Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Export Community Recruitment Report</h3>
            <p className="mt-1 text-xs text-slate-500">
              Select category and format. Export is strictly scoped to community <span className="font-mono font-semibold">{communityId}</span>.
            </p>

            <div className="mt-4 space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700">Category:</label>
                <select
                  value={exportCategory}
                  onChange={(e) => setExportCategory(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-slate-800"
                >
                  <option value="all">All Modules & Analytics</option>
                  <option value="recruiters">Recruiters & Referral Leaderboard</option>
                  <option value="funnel">Recruitment Funnel Conversion</option>
                  <option value="onboarding">Onboarding Operations</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700">Format:</label>
                <div className="mt-1 flex gap-4">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="format"
                      value="json"
                      checked={exportFormat === 'json'}
                      onChange={() => setExportFormat('json')}
                    />
                    Structured JSON
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="format"
                      value="csv"
                      checked={exportFormat === 'csv'}
                      onChange={() => setExportFormat('csv')}
                    />
                    CSV Document
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowExportModal(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {exporting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                Download Export
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
