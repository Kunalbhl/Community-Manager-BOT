import React, { useState, useEffect } from 'react';
import {
  Calendar,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Layers,
  Sparkles,
  Shield,
  Clock,
  ArrowRight,
  Info,
} from 'lucide-react';
import { DataTruthBadge } from './DataTruthBadge.js';
import { CohortMatrixRow } from '../../../../../shared/types/insights.js';
import {
  RetentionAlert,
  OnboardingQualityAnalysis,
  ModerationQualityCrossover,
  EventQualityCrossover,
  AutomationQualityCrossover,
} from '../../../../../shared/types/models.js';

interface RetentionIntelligenceSectionProps {
  communityId: string;
  onAskBrain?: (prompt: string) => void;
}

export const RetentionIntelligenceSection: React.FC<RetentionIntelligenceSectionProps> = ({
  communityId,
  onAskBrain,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [matrixRows, setMatrixRows] = useState<CohortMatrixRow[]>([]);
  const [activityDef, setActivityDef] = useState<string>('');
  const [alerts, setAlerts] = useState<RetentionAlert[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingQualityAnalysis | null>(null);
  const [crossovers, setCrossovers] = useState<{
    moderation: ModerationQualityCrossover;
    events: EventQualityCrossover;
    automation: AutomationQualityCrossover;
  } | null>(null);

  const fetchData = async () => {
    if (!communityId) return;
    setLoading(true);
    setError(null);

    try {
      const [cohortsRes, alertsRes, onboardingRes, crossoversRes] = await Promise.all([
        fetch('/api/v1/insights/retention/cohorts', {
          headers: { 'x-community-id': communityId },
        }),
        fetch('/api/v1/insights/retention/alerts', {
          headers: { 'x-community-id': communityId },
        }),
        fetch('/api/v1/insights/retention/onboarding', {
          headers: { 'x-community-id': communityId },
        }),
        fetch('/api/v1/insights/retention/crossovers', {
          headers: { 'x-community-id': communityId },
        }),
      ]);

      const [cohortsJson, alertsJson, onboardingJson, crossoversJson] = await Promise.all([
        cohortsRes.json().catch(() => ({})),
        alertsRes.json().catch(() => ({})),
        onboardingRes.json().catch(() => ({})),
        crossoversRes.json().catch(() => ({})),
      ]);

      if (cohortsJson.success && cohortsJson.data) {
        setMatrixRows(cohortsJson.data.rows || []);
        setActivityDef(cohortsJson.data.activityDefinition || '');
      }
      if (alertsJson.success) setAlerts(alertsJson.data || []);
      if (onboardingJson.success) setOnboarding(onboardingJson.data);
      if (crossoversJson.success) setCrossovers(crossoversJson.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load retention intelligence');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [communityId]);

  const renderCell = (cell: CohortMatrixRow['day1']) => {
    if (cell.status === 'INSUFFICIENT_DATA') {
      return (
        <span
          title={cell.note || 'Observation window not yet elapsed'}
          className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-500 font-mono"
        >
          <Clock className="h-3 w-3 text-zinc-400" />
          Pending
        </span>
      );
    }

    const rate = cell.rate ?? 0;
    const colorClass =
      rate >= 70
        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
        : rate >= 40
        ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
        : 'text-amber-700 bg-amber-50 border-amber-200';

    return (
      <div className={`inline-flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs font-semibold ${colorClass}`}>
        <span>{rate}%</span>
        <span className="text-[10px] font-normal opacity-80 font-mono">
          ({cell.active}/{cell.eligible})
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">Retention Intelligence & Cohorts</h2>
            <DataTruthBadge classification="OBSERVED_CORRELATION" size="sm" />
          </div>
          <p className="mt-1 text-xs text-slate-500 max-w-2xl">
            Cohort retention tracking across Day 1, Day 7, Day 30, and Day 90 milestones. Cells strictly require elapsed observation windows before computing retention rates.
          </p>
        </div>

        {onAskBrain && (
          <button
            onClick={() => onAskBrain('What are the primary factors driving member retention in our 30-day cohort?')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 border border-indigo-200/60 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
            Investigate Retention
          </button>
        )}
      </div>

      {/* Authoritative Definition Banner */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs flex items-start gap-3">
        <Info className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold text-indigo-950">Authoritative Definition of Active Member: </span>
          <span className="text-indigo-900">
            {activityDef ||
              'A member with at least one qualifying authoritative community action during the observation window (early engagement event, event registration, onboarding completion, interview participation, or moderation confirmation).'}
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
          {error}
        </div>
      )}

      {/* Cohort Matrix Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Cohort Retention Matrix</h3>
            <p className="text-xs text-slate-500">
              Rates reflect verified active tenure within each elapsed window.
            </p>
          </div>
          <DataTruthBadge classification="OBSERVED_CORRELATION" size="sm" />
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading cohort matrix...</div>
        ) : matrixRows.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No member cohort records available yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Cohort</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Cohort Size</th>
                  <th className="py-2.5 px-3">Day 1 (24h)</th>
                  <th className="py-2.5 px-3">Day 7 (1w)</th>
                  <th className="py-2.5 px-3">Day 30 (1m)</th>
                  <th className="py-2.5 px-3">Day 90 (1q)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {matrixRows.map((row) => (
                  <tr key={row.cohortKey} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      {row.cohortLabel}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono">
                        {row.cohortType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-800">
                      {row.totalMembers}
                    </td>
                    <td className="py-2.5 px-3">{renderCell(row.day1)}</td>
                    <td className="py-2.5 px-3">{renderCell(row.day7)}</td>
                    <td className="py-2.5 px-3">{renderCell(row.day30)}</td>
                    <td className="py-2.5 px-3">{renderCell(row.day90)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Retention Alerts */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">Active Retention Alerts</h3>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {alerts.length} Alert{alerts.length === 1 ? '' : 's'}
          </span>
        </div>

        {alerts.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            No retention anomalies or high-drop-off alerts currently triggered.
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert, idx) => (
              <div
                key={alert.id || idx}
                className={`rounded-lg border p-4 text-xs ${
                  alert.severity === 'CRITICAL' ? 'border-rose-200 bg-rose-50/50' : 'border-amber-200 bg-amber-50/50'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-bold text-slate-900">
                    {String(alert.alertType).replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}
                    {alert.affectedCohortOrSource ? ` (${alert.affectedCohortOrSource})` : ''}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      alert.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {alert.severity}
                  </span>
                </div>
                <p className="text-slate-600 mb-2">{alert.evidence}</p>
                {alert.recommendedAction && (
                  <div className="border-t border-slate-200/60 pt-2 mt-2 text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-700">Recommended: </span>
                    {alert.recommendedAction}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Onboarding Quality & Cross-System Crossovers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Onboarding Quality */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">Onboarding Quality Analysis</h3>
            <DataTruthBadge classification="VERIFIED_FACT" size="sm" />
          </div>

          {!onboarding ? (
            <div className="py-6 text-center text-xs text-slate-400">
              No onboarding checklist data recorded.
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Checklists assigned:</span>
                <span className="font-bold text-slate-800">{onboarding.totalChecklists}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Completion rate:</span>
                <span className="font-bold text-emerald-600">{typeof onboarding.overallCompletionRate === 'number' ? `${onboarding.overallCompletionRate}%` : 'Not enough data'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Average completion time:</span>
                <span className="text-slate-700">
                  {typeof onboarding.averageCompletionTimeHours === 'number' ? `${onboarding.averageCompletionTimeHours}h` : 'Not enough data'}
                </span>
              </div>
              {onboarding.highFrictionStep && (
                <div className="py-1">
                  <span className="text-slate-500 block mb-1">Step where most people stop:</span>
                  <span className="font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                    {onboarding.highFrictionStep.title} ({onboarding.highFrictionStep.dropoffRate}% stop here)
                  </span>
                </div>
              )}
              {onboarding.successfulPattern && <p className="text-[11px] text-slate-500">{onboarding.successfulPattern}</p>}
            </div>
          )}
        </div>

        {/* Cross-System Crossovers */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
            <Layers className="h-4 w-4 text-purple-600" />
            <h3 className="text-sm font-bold text-slate-900">Cross-System Crossovers</h3>
            <DataTruthBadge classification="OBSERVED_CORRELATION" size="sm" />
          </div>

          {!crossovers ? (
            <div className="py-6 text-center text-xs text-slate-400">
              Loading cross-system correlation metrics...
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <span className="font-semibold text-slate-900 block mb-1">Moderation by member source</span>
                {crossovers.moderation.sourceCorrelations.length === 0 ? (
                  <p className="text-slate-500 text-[11px]">Not enough data yet.</p>
                ) : (
                  <ul className="space-y-1 text-[11px] text-slate-600">
                    {crossovers.moderation.sourceCorrelations.slice(0, 4).map((c) => (
                      <li key={c.source}><span className="font-semibold text-slate-800">{c.source}</span>: {c.warningCount} warnings, {c.incidentCount} incidents across {c.memberCount} members</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <span className="font-semibold text-slate-900 block mb-1">Event attendance by member source</span>
                {crossovers.events.sourceBreakdown.length === 0 ? (
                  <p className="text-slate-500 text-[11px]">Not enough data yet.</p>
                ) : (
                  <ul className="space-y-1 text-[11px] text-slate-600">
                    {crossovers.events.sourceBreakdown.slice(0, 4).map((e) => (
                      <li key={e.source}><span className="font-semibold text-slate-800">{e.source}</span>: {e.attendedCount}/{e.registeredCount} attended ({typeof e.attendanceRate === 'number' ? `${e.attendanceRate}%` : 'Not enough data'})</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/50 p-2.5">
                <span className="font-semibold text-slate-900 block mb-1">Automation success</span>
                <p className="text-slate-600 text-[11px]">
                  Onboarding {typeof crossovers.automation.onboardingAutomationSuccessRate === 'number' ? `${crossovers.automation.onboardingAutomationSuccessRate}%` : 'Not enough data'}, recruitment {typeof crossovers.automation.recruitmentAutomationSuccessRate === 'number' ? `${crossovers.automation.recruitmentAutomationSuccessRate}%` : 'Not enough data'}, reminders {typeof crossovers.automation.reminderSuccessRate === 'number' ? `${crossovers.automation.reminderSuccessRate}%` : 'Not enough data'}.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
