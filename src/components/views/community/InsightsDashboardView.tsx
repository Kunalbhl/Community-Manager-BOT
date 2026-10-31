import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Sparkles,
  TrendingUp,
  Activity,
  UserPlus,
  Heart,
  RefreshCw,
  Download,
  Calendar,
  ShieldAlert,
  CalendarDays,
  Bot,
  AlertTriangle,
  Info,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import {
  DateRangeType,
  UnifiedInsightsOverview,
  MetricValue,
  MetricStatus,
  MetricTrend,
} from '../../../../shared/types/insights.js';
import { AiContextualActionRequest } from '../../../../shared/types/ai.js';
import { AiContextualActionDrawer } from './ai/AiContextualActionDrawer.js';
import { RecruitmentAnalyticsSection } from './insights/RecruitmentAnalyticsSection.js';
import { RetentionIntelligenceSection } from './insights/RetentionIntelligenceSection.js';
import { CommunityBrainSection } from './insights/CommunityBrainSection.js';
import { DataTruthBadge } from './insights/DataTruthBadge.js';

interface InsightsDashboardViewProps {
  communityId: string;
  onNavigate?: (
    section: string,
    meta?: { prompt?: string; contextAction?: AiContextualActionRequest }
  ) => void;
}

type TabType =
  | 'OVERVIEW'
  | 'RECRUITMENT'
  | 'RETENTION'
  | 'BRAIN'
  | 'COMMUNITY'
  | 'ENGAGEMENT'
  | 'MODERATION'
  | 'EVENTS'
  | 'AUTOMATION';

export const InsightsDashboardView: React.FC<InsightsDashboardViewProps> = ({
  communityId,
  onNavigate,
}) => {
  const [data, setData] = useState<UnifiedInsightsOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Range and Tab State
  const [rangeType, setRangeType] = useState<DateRangeType>('LAST_30_DAYS');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabType>('OVERVIEW');
  const [exporting, setExporting] = useState(false);
  const [brainPrompt, setBrainPrompt] = useState<string>('');

  // AI Contextual Action State (Task 21.9)
  const [drawerRequest, setDrawerRequest] = useState<AiContextualActionRequest | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const openAiAction = (
    action: AiContextualActionRequest['action'],
    metricKey: string,
    metricLabel?: string,
    currentValue?: any,
    previousValue?: any,
    delta?: any
  ) => {
    setDrawerRequest({
      action,
      metricKey,
      metricLabel: metricLabel || metricKey,
      currentValue,
      previousValue,
      delta,
      domain: activeTab,
      dateRange: rangeType,
      customStart: rangeType === 'CUSTOM' ? customStart : undefined,
      customEnd: rangeType === 'CUSTOM' ? customEnd : undefined,
    });
    setIsDrawerOpen(true);
  };

  const fetchInsights = async () => {
    if (!communityId) return;
    setLoading(true);
    setError(null);

    try {
      let url = `/api/v1/insights/overview?rangeType=${rangeType}`;
      if (rangeType === 'CUSTOM' && customStart && customEnd) {
        url += `&startDate=${encodeURIComponent(customStart)}&endDate=${encodeURIComponent(customEnd)}`;
      }

      const res = await fetch(url, {
        headers: {
          'x-community-id': communityId,
        },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || errJson.message || 'Failed to fetch insights data.');
      }

      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      } else {
        throw new Error('Malformed insights response.');
      }
    } catch (err: any) {
      setError(err.message || 'Network failure loading insights.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, [communityId, rangeType]);

  const handleExport = async (format: 'csv' | 'json') => {
    if (!communityId) return;
    setExporting(true);
    try {
      const res = await fetch('/api/v1/insights/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          domain: activeTab,
          format,
          rangeType,
          startDate: customStart || undefined,
          endDate: customEnd || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || 'Export failed.');
      }

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `insights-${communityId}-${activeTab.toLowerCase()}-${rangeType.toLowerCase()}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      alert(`Export error: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  const renderStatusBadge = (status: MetricStatus, note?: string) => {
    switch (status) {
      case 'AVAILABLE':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> Authoritative
          </span>
        );
      case 'INSUFFICIENT_DATA':
        return (
          <span
            title={note || 'No recorded history for this time window'}
            className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
          >
            <AlertTriangle className="h-3 w-3" /> Insufficient Data
          </span>
        );
      case 'DISCORD_LIMITATION':
        return (
          <span
            title={note || 'Discord Gateway constraint or bot intent required'}
            className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-800"
          >
            <Info className="h-3 w-3" /> Discord Limitation
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
            {status}
          </span>
        );
    }
  };

  const renderTrend = (trend: MetricTrend, delta: number | null, deltaPercent: number | null) => {
    if (trend === 'INSUFFICIENT_DATA' || delta === null) {
      return <span className="text-[11px] text-slate-400">No previous baseline</span>;
    }
    const isUp = trend === 'INCREASE';
    const isDown = trend === 'DECREASE';

    return (
      <span
        className={`inline-flex items-center text-[11px] font-bold ${
          isUp ? 'text-emerald-600' : isDown ? 'text-rose-600' : 'text-slate-500'
        }`}
      >
        {isUp ? '↑ +' : isDown ? '↓ ' : '→ '}
        {delta}
        {deltaPercent !== null ? ` (${deltaPercent > 0 ? '+' : ''}${deltaPercent}%)` : ''}
      </span>
    );
  };

  const renderMetricCard = (
    label: string,
    metric: MetricValue<number | null> | undefined,
    icon: React.ReactNode,
    suffix: string = '',
    customDescription?: string,
    metricKey?: string
  ) => {
    if (!metric) return null;

    const mKey = metricKey || (label ? label.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'metric');

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-sm relative group">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() =>
                openAiAction(
                  'EXPLAIN_CHANGE',
                  mKey,
                  label,
                  metric.value,
                  metric.previousValue,
                  metric.delta
                )
              }
              title="Explain change with Community Brain"
              className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
            {icon}
          </div>
        </div>

        <div className="mt-2 flex items-baseline gap-2">
          <div className="text-2xl font-black text-slate-900">
            {metric.value !== null ? `${metric.value}${suffix}` : '—'}
          </div>
          {renderTrend(metric.trend, metric.delta, metric.deltaPercent)}
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
          <div className="flex items-center gap-1.5">
            {renderStatusBadge(metric.status, metric.note)}
            <DataTruthBadge classification="VERIFIED_FACT" size="sm" showIcon={false} />
          </div>
          {metric.previousValue !== null && (
            <span className="text-[10px] text-slate-400 font-mono">
              Prev: {metric.previousValue}{suffix}
            </span>
          )}
        </div>

        {customDescription && (
          <p className="mt-1.5 text-[10px] text-slate-400 leading-tight">{customDescription}</p>
        )}

        {/* Quick Contextual Action Footnote */}
        <div className="mt-2 pt-2 border-t border-slate-100/60 flex items-center justify-between text-[10px] text-slate-400">
          <button
            onClick={() =>
              openAiAction('EXPLAIN_METRIC', mKey, label, metric.value, metric.previousValue, metric.delta)
            }
            className="text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Explain Metric
          </button>
          <button
            onClick={() => openAiAction('FIND_CAUSES', mKey, label, metric.value, metric.previousValue, metric.delta)}
            className="text-slate-600 hover:text-slate-900 font-medium"
          >
            Find Causes →
          </button>
        </div>
      </div>
    );
  };

  return (
    <div id="insights-intelligence-engine" className="space-y-6">
      {/* Engine Header & Range Controls */}
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              TENANT SCOPE: {communityId}
            </span>
            <span className="rounded bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              TASK 20 ENGINE
            </span>
          </div>
          <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-900">
            Community Insights & Intelligence Engine
          </h1>
          <p className="text-xs text-slate-500">
            Authoritative, cross-domain multi-tenant analytics backed by real tenant records.
          </p>
        </div>

        {/* Action controls & Date Range Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs font-medium">
            {(['TODAY', 'LAST_7_DAYS', 'LAST_30_DAYS', 'LAST_90_DAYS', 'CUSTOM'] as DateRangeType[]).map(
              (r) => {
                const label =
                  r === 'TODAY'
                    ? 'Today'
                    : r === 'LAST_7_DAYS'
                    ? '7D'
                    : r === 'LAST_30_DAYS'
                    ? '30D'
                    : r === 'LAST_90_DAYS'
                    ? '90D'
                    : 'Custom';
                return (
                  <button
                    key={r}
                    onClick={() => setRangeType(r)}
                    className={`rounded-md px-2.5 py-1 transition-colors ${
                      rangeType === r
                        ? 'bg-white font-bold text-indigo-700 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                );
              }
            )}
          </div>

          <button
            onClick={fetchInsights}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          <button
            id="btn-insights-ask-ai"
            onClick={() => setActiveTab('BRAIN')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 transition shadow-xs"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            Ask Community Brain
          </button>

          <div className="inline-flex rounded-lg border border-slate-200 bg-white text-xs font-semibold">
            <button
              onClick={() => handleExport('csv')}
              disabled={exporting || !data}
              className="px-2.5 py-1.5 hover:bg-slate-50 border-r border-slate-200 flex items-center gap-1 text-slate-700"
            >
              <Download className="h-3 w-3" /> CSV
            </button>
            <button
              onClick={() => handleExport('json')}
              disabled={exporting || !data}
              className="px-2.5 py-1.5 hover:bg-slate-50 text-slate-700"
            >
              JSON
            </button>
          </div>
        </div>
      </div>

      {/* Custom Range Inputs */}
      {rangeType === 'CUSTOM' && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-xs">
          <Calendar className="h-4 w-4 text-indigo-600" />
          <span className="font-semibold text-indigo-900">Custom Date Interval:</span>
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-800"
          />
          <span className="text-slate-500">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-800"
          />
          <button
            onClick={fetchInsights}
            className="rounded bg-indigo-600 px-3 py-1 font-bold text-white hover:bg-indigo-700"
          >
            Apply
          </button>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {/* Domain Navigation Tabs */}
      <div className="flex overflow-x-auto border-b border-slate-200 pb-px text-xs font-semibold">
        {[
          { key: 'OVERVIEW', label: '1. Community Insights' },
          { key: 'RECRUITMENT', label: '2. Recruitment Analytics' },
          { key: 'RETENTION', label: '3. Retention Intelligence' },
          { key: 'BRAIN', label: '4. Community Brain AI' },
          { key: 'COMMUNITY', label: 'Growth & Members' },
          { key: 'ENGAGEMENT', label: 'Engagement' },
          { key: 'MODERATION', label: 'Moderation & Safety' },
          { key: 'EVENTS', label: 'Events' },
          { key: 'AUTOMATION', label: 'Automation' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as TabType)}
            className={`whitespace-nowrap px-4 py-2.5 border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-indigo-600 font-bold text-indigo-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && !data && (
        <div className="py-16 text-center text-xs text-slate-400">
          <RefreshCw className="mx-auto h-5 w-5 animate-spin text-slate-400 mb-2" />
          Aggregating authoritative multi-domain intelligence...
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* ========================================================================= */}
          {/* COMMUNITY HEALTH INDICATOR (Requirement 13) */}
          {/* ========================================================================= */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-slate-100 pb-5">
              <div>
                <div className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-rose-500" />
                  <h2 className="text-base font-bold text-slate-900">Community Health Indicator</h2>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      data.health.status === 'AVAILABLE'
                        ? data.health.indicatorScore && data.health.indicatorScore >= 70
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {data.health.status === 'AVAILABLE' ? 'CALCULATED' : 'INSUFFICIENT DATA'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500 max-w-2xl">{data.health.explanation}</p>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Health Index</span>
                  <div className="text-3xl font-black text-slate-900">
                    {data.health.indicatorScore !== null ? `${data.health.indicatorScore}/100` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            {/* Signal Breakdown Grid */}
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.health.signals.map((sig) => (
                <div key={sig.key} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800">{sig.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Weight: {Math.round(sig.weight * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 text-slate-900 font-medium">{sig.displayValue}</div>
                  <div className="mt-2 flex items-center justify-between text-[10px]">
                    {renderStatusBadge(sig.status, sig.missingDataReason)}
                    {sig.status === 'AVAILABLE' && (
                      <span className="font-bold text-indigo-700">Contrib: +{sig.contribution} pts</span>
                    )}
                  </div>
                  {sig.missingDataReason && (
                    <div className="mt-1 text-[10px] text-amber-700 italic">{sig.missingDataReason}</div>
                  )}
                </div>
              ))}
            </div>

            {/* Contextual AI Actions Bar for Health (Task 21.9) */}
            <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                Contextual AI Intelligence Actions:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() =>
                    openAiAction('EXPLAIN_METRIC', 'health', 'Community Health Score', data.health.indicatorScore)
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium transition"
                >
                  Explain Score
                </button>
                <button
                  onClick={() => openAiAction('IDENTIFY_RISKS', 'health', 'Operational Risks')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-medium border border-rose-200 transition"
                >
                  <ShieldAlert className="w-3 h-3" /> Identify Risks
                </button>
                <button
                  onClick={() => openAiAction('FIND_OPPORTUNITIES', 'overview', 'Community Opportunities')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium border border-emerald-200 transition"
                >
                  <TrendingUp className="w-3 h-3" /> Find Opportunities
                </button>
                <button
                  onClick={() => openAiAction('RECOMMEND_ACTIONS', 'overview', 'Strategic Recommendations')}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-medium border border-indigo-200 transition"
                >
                  <Bot className="w-3 h-3" /> Recommend Actions
                </button>
              </div>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* TAB: OVERVIEW */}
          {/* ========================================================================= */}
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-6">
              {/* Primary KPI Grid */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {renderMetricCard(
                  'Total Active Members',
                  data.overview.totalMembers,
                  <TrendingUp className="h-4 w-4 text-indigo-600" />,
                  '',
                  'Authoritative guild member headcount.',
                  'total_members'
                )}
                {renderMetricCard(
                  'Net Member Growth',
                  data.overview.netGrowth,
                  <Activity className="h-4 w-4 text-emerald-600" />,
                  '',
                  'Joined minus departures in selected range.',
                  'net_growth'
                )}
                {renderMetricCard(
                  'Delivery Success Rate',
                  data.overview.deliverySuccessRate,
                  <CheckCircle2 className="h-4 w-4 text-teal-600" />,
                  '%',
                  'Successful Discord broadcast deliveries.',
                  'delivery_success'
                )}
                {renderMetricCard(
                  'Active Warnings',
                  data.overview.activeWarnings,
                  <ShieldAlert className="h-4 w-4 text-rose-600" />,
                  '',
                  'Unexpired disciplinary moderation warnings.',
                  'active_warnings'
                )}
              </div>

              {/* Chart Grid */}
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Growth Trend */}
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900">Member Growth Trajectory</h3>
                      <p className="text-xs text-slate-500">Authoritative daily member totals across range.</p>
                    </div>
                    <button
                      onClick={() => openAiAction('FIND_CAUSES', 'growth_trajectory', 'Member Growth Trajectory')}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" /> Find Causes
                    </button>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.community.growthTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                        <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                        <Line
                          type="monotone"
                          dataKey="totalMembers"
                          name="Total Guild Members"
                          stroke="#4f46e5"
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="newMembers"
                          name="New Joins"
                          stroke="#10b981"
                          strokeWidth={1.5}
                          dot={{ r: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Engagement Delivery Trend */}
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-900">Broadcast Deliveries & Poll Votes</h3>
                      <p className="text-xs text-slate-500">Observed deliveries vs failures vs user poll votes.</p>
                    </div>
                    <button
                      onClick={() => openAiAction('FIND_CAUSES', 'engagement', 'Broadcast Deliveries')}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" /> Find Causes
                    </button>
                  </div>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.engagement.trend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                        <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                        <Bar dataKey="delivered" name="Delivered Messages" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="votes" name="Poll Votes" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="failed" name="Failed" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Recruitment Funnel Overview */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900">Pipeline & Recruiter Conversion Funnel</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Authoritative candidate progression through pipeline.</p>
                  </div>
                  <button
                    onClick={() => openAiAction('FIND_CAUSES', 'funnel', 'Recruitment Conversion Funnel')}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" /> Analyze Bottlenecks
                  </button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-6 text-xs">
                  {data.recruitment.funnelStages.map((stage, idx) => (
                    <div key={stage.stage} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">
                        Stage {idx + 1}: {stage.stage}
                      </span>
                      <span className="text-slate-900 font-black block text-xl mt-1">{stage.count}</span>
                      <div className="mt-2 text-[10px] text-slate-500">
                        {stage.conversionFromPrevious !== null
                          ? `${stage.conversionFromPrevious}% conv.`
                          : 'Baseline'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: COMMUNITY & GROWTH */}
          {/* ========================================================================= */}
          {activeTab === 'COMMUNITY' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {renderMetricCard('Total Members', data.community.totalMembers, <TrendingUp className="h-4 w-4 text-indigo-600" />, '', '', 'total_members')}
                {renderMetricCard('New Members Joined', data.community.newMembers, <UserPlus className="h-4 w-4 text-emerald-600" />, '', '', 'new_members')}
                {renderMetricCard('Departures / Left', data.community.membersLeft, <XCircle className="h-4 w-4 text-rose-600" />, '', '', 'departures')}
                {renderMetricCard('Growth Rate', data.community.growthRate, <Activity className="h-4 w-4 text-purple-600" />, '%', '', 'growth_rate')}
              </div>

              {/* Retention & Discord Coverage */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {renderMetricCard(
                  '7-Day Cohort Retention',
                  data.community.retentionRate7Day,
                  <Clock className="h-4 w-4 text-blue-600" />,
                  '%',
                  'Members joined >= 7 days ago still active.',
                  'retention_7d'
                )}
                {renderMetricCard(
                  '30-Day Cohort Retention',
                  data.community.retentionRate30Day,
                  <Clock className="h-4 w-4 text-indigo-600" />,
                  '%',
                  'Members joined >= 30 days ago still active.',
                  'retention_30d'
                )}
                {renderMetricCard(
                  'Estimated Active Users',
                  data.community.estimatedActiveMembers,
                  <Activity className="h-4 w-4 text-teal-600" />,
                  '',
                  'Interacted with bots/events/polls.',
                  'active_members'
                )}
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                  <span className="text-xs font-semibold text-slate-500 uppercase">Records Breakdown</span>
                  <div className="mt-2 text-xl font-bold text-slate-900">
                    {data.community.discordKnownMembers} / {data.community.communityManagerRecords}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">
                    Discord Sync Active vs Total DB entries.
                  </p>
                </div>
              </div>

              {/* Detailed Growth Chart */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                <h3 className="font-bold text-slate-900">Daily Member Growth & Net Velocity</h3>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.community.growthTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} />
                      <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                      <Line type="monotone" dataKey="newMembers" stroke="#10b981" strokeWidth={2} name="New Joins" />
                      <Line type="monotone" dataKey="departures" stroke="#f43f5e" strokeWidth={2} name="Departures" />
                      <Line type="monotone" dataKey="netChange" stroke="#6366f1" strokeWidth={2} name="Net Change" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: ENGAGEMENT */}
          {/* ========================================================================= */}
          {activeTab === 'ENGAGEMENT' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {renderMetricCard('Announcements Sent', data.engagement.announcementsSent, <CheckCircle2 className="h-4 w-4 text-indigo-600" />, '', '', 'announcements')}
                {renderMetricCard('Delivery Success Rate', data.engagement.deliverySuccessRate, <Activity className="h-4 w-4 text-emerald-600" />, '%', '', 'delivery_success')}
                {renderMetricCard('Community Polls', data.engagement.pollsCount, <Info className="h-4 w-4 text-blue-600" />, '', '', 'polls')}
                {renderMetricCard('Total Poll Votes', data.engagement.pollParticipation, <CheckCircle2 className="h-4 w-4 text-purple-600" />, '', '', 'poll_votes')}
              </div>

              {/* Feature Breakdown Table */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
                <h3 className="font-bold text-slate-900">Engagement Breakdown by Feature</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase">
                        <th className="pb-2">Feature</th>
                        <th className="pb-2">Sent / Delivered</th>
                        <th className="pb-2">Failures</th>
                        <th className="pb-2">Success Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.engagement.byFeature.map((f) => (
                        <tr key={f.key} className="hover:bg-slate-50">
                          <td className="py-2.5 font-bold text-slate-800">{f.label}</td>
                          <td className="py-2.5 text-slate-600">{f.sent}</td>
                          <td className="py-2.5 text-rose-600">{f.failed}</td>
                          <td className="py-2.5 font-bold text-emerald-600">
                            {f.successRate !== null ? `${f.successRate}%` : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: RECRUITMENT ANALYTICS (Task 85) */}
          {/* ========================================================================= */}
          {activeTab === 'RECRUITMENT' && (
            <RecruitmentAnalyticsSection
              communityId={communityId}
              onAskBrain={(p) => {
                setBrainPrompt(p);
                setActiveTab('BRAIN');
              }}
            />
          )}

          {/* ========================================================================= */}
          {/* TAB: RETENTION INTELLIGENCE (Task 85) */}
          {/* ========================================================================= */}
          {activeTab === 'RETENTION' && (
            <RetentionIntelligenceSection
              communityId={communityId}
              onAskBrain={(p) => {
                setBrainPrompt(p);
                setActiveTab('BRAIN');
              }}
            />
          )}

          {/* ========================================================================= */}
          {/* TAB: COMMUNITY BRAIN AI (Task 85) */}
          {/* ========================================================================= */}
          {activeTab === 'BRAIN' && (
            <CommunityBrainSection
              communityId={communityId}
              initialPrompt={brainPrompt}
            />
          )}

          {/* ========================================================================= */}
          {/* TAB: MODERATION & SAFETY */}
          {/* ========================================================================= */}
          {activeTab === 'MODERATION' && data.moderation && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {renderMetricCard('Total Warnings Issued', data.moderation.warnings, <ShieldAlert className="h-4 w-4 text-amber-600" />, '', '', 'warnings')}
                {renderMetricCard('Active Warnings', data.moderation.activeWarnings, <AlertTriangle className="h-4 w-4 text-rose-600" />, '', '', 'active_warnings')}
                {renderMetricCard('Blacklisted Members', data.moderation.blacklistedMembers, <XCircle className="h-4 w-4 text-slate-700" />, '', '', 'blacklisted')}
                {renderMetricCard('Automod Triggers', data.moderation.automodTriggers, <Bot className="h-4 w-4 text-indigo-600" />, '', '', 'automod')}
              </div>

              {/* Actions Breakdown */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
                <h3 className="font-bold text-slate-900">Disciplinary Actions & Incidents</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6 text-xs">
                  {data.moderation.byAction.map((act) => (
                    <div key={act.action} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">{act.action}</span>
                      <span className="text-slate-900 font-bold block text-lg mt-1">{act.count}</span>
                      {act.activeCount !== undefined && (
                        <span className="text-rose-600 text-[10px] block mt-0.5">
                          {act.activeCount} currently active
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: EVENTS & ATTENDANCE */}
          {/* ========================================================================= */}
          {activeTab === 'EVENTS' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {renderMetricCard('Scheduled Events', data.events.scheduled, <CalendarDays className="h-4 w-4 text-indigo-600" />, '', '', 'events_scheduled')}
                {renderMetricCard('Total Registrations', data.events.registrations, <UserPlus className="h-4 w-4 text-teal-600" />, '', '', 'registrations')}
                {renderMetricCard('Turnout Attendance', data.events.attendance, <CheckCircle2 className="h-4 w-4 text-emerald-600" />, '', '', 'attendance')}
                {renderMetricCard('Verified Attendance Rate', data.events.attendanceRate, <Activity className="h-4 w-4 text-purple-600" />, '%', '', 'attendance_rate')}
              </div>

              {/* Event Comparison List */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
                <h3 className="font-bold text-slate-900">Event Comparison & Turnout</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase">
                        <th className="pb-2">Title</th>
                        <th className="pb-2">Start Time</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">RSVP Registrations</th>
                        <th className="pb-2">Turnout Turnout</th>
                        <th className="pb-2">Attendance Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!data?.events?.eventComparison || data.events.eventComparison.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-slate-400">
                            No community events scheduled in this period.
                          </td>
                        </tr>
                      ) : (
                        (data.events.eventComparison || []).map((ev) => (
                          <tr key={ev.id} className="hover:bg-slate-50">
                            <td className="py-2.5 font-bold text-slate-800">{ev.title}</td>
                            <td className="py-2.5 text-slate-500 font-mono text-[11px]">
                              {ev.startAt ? new Date(ev.startAt).toLocaleDateString() : '—'}
                            </td>
                            <td className="py-2.5">
                              <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-[10px] text-slate-700">
                                {ev.status}
                              </span>
                            </td>
                            <td className="py-2.5 text-slate-700">{ev.registrations}</td>
                            <td className="py-2.5 font-bold text-emerald-600">{ev.attendance}</td>
                            <td className="py-2.5 font-bold text-indigo-600">
                              {ev.attendanceRate !== null ? `${ev.attendanceRate}%` : 'N/A'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB: AUTOMATION */}
          {/* ========================================================================= */}
          {activeTab === 'AUTOMATION' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {renderMetricCard('Active Workflows', data.automation.activeWorkflows, <Bot className="h-4 w-4 text-indigo-600" />, '', '', 'active_workflows')}
                {renderMetricCard('Workflow Executions', data.automation.workflowExecutions, <Activity className="h-4 w-4 text-teal-600" />, '', '', 'workflow_executions')}
                {renderMetricCard('Successful Executions', data.automation.successfulExecutions, <CheckCircle2 className="h-4 w-4 text-emerald-600" />, '', '', 'successful_executions')}
                {renderMetricCard('Actions Dispatched', data.automation.actionsExecuted, <Bot className="h-4 w-4 text-purple-600" />, '', '', 'actions_dispatched')}
              </div>

              {/* Workflows Reliability Table */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
                <h3 className="font-bold text-slate-900">Automated Workflows Execution Reliability</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase">
                        <th className="pb-2">Workflow Name</th>
                        <th className="pb-2">Trigger</th>
                        <th className="pb-2">Executions</th>
                        <th className="pb-2">Successes</th>
                        <th className="pb-2">Failures</th>
                        <th className="pb-2">Success Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!data?.automation?.topWorkflows || data.automation.topWorkflows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-slate-400">
                            No workflow executions recorded in this time range.
                          </td>
                        </tr>
                      ) : (
                        (data.automation.topWorkflows || []).map((w) => (
                          <tr key={w.id} className="hover:bg-slate-50">
                            <td className="py-2.5 font-bold text-slate-800">{w.name}</td>
                            <td className="py-2.5 font-mono text-slate-500 text-[11px]">{w.triggerType}</td>
                            <td className="py-2.5 text-slate-700">{w.executionsCount}</td>
                            <td className="py-2.5 text-emerald-600 font-medium">{w.successCount}</td>
                            <td className="py-2.5 text-rose-600 font-medium">{w.failureCount}</td>
                            <td className="py-2.5 font-bold text-teal-600">
                              {w.successRate !== null ? `${w.successRate}%` : 'N/A'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* AUDIT & DATA COVERAGE FOOTER */}
          {/* ========================================================================= */}
          <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4 text-[11px] text-slate-500 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 text-slate-400 shrink-0" />
              <span>
                Data Coverage: <strong>{data.metadata.coverage.confidence}</strong> • Records Analyzed:{' '}
                <strong>{data.metadata.coverage.recordsIncluded}</strong> • Generated At:{' '}
                {new Date(data.metadata.generatedAt).toLocaleString()} ({data.metadata.timezone})
              </span>
            </div>
            <div className="font-mono text-slate-400 text-[10px]">
              Range: {data.metadata.rangeStart.split('T')[0]} → {data.metadata.rangeEnd.split('T')[0]}
            </div>
          </div>
        </div>
      )}

      {/* AI Contextual Action Drawer (Task 21.9) */}
      <AiContextualActionDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        communityId={communityId}
        request={drawerRequest}
        onOpenInAssistant={(req) => {
          if (onNavigate) {
            onNavigate('ai', { contextAction: req });
          }
        }}
      />
    </div>
  );
};
