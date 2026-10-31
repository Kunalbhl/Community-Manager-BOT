import React, { useState, useEffect } from 'react';
import {
  Users,
  UserCheck,
  CheckCircle2,
  TrendingDown,
  Award,
  Link,
  Target,
  AlertCircle,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { DataTruthBadge } from './DataTruthBadge.js';
import {
  RecruiterQualityMetrics,
  CampaignQualityMetrics,
  SourceQualityMetrics,
} from '../../../../../shared/types/models.js';

interface FunnelStageEnriched {
  stageKey: string;
  label: string;
  count: number;
  conversionRateFromPrevious: number | 'INSUFFICIENT_DATA';
  conversionRateFromStart: number | 'INSUFFICIENT_DATA';
  dropOffCount: number;
  dropOffPercent: number | 'INSUFFICIENT_DATA';
  status: 'AVAILABLE' | 'INSUFFICIENT_DATA';
  truthClassification: 'VERIFIED_FACT' | 'OBSERVED_CORRELATION' | 'INSUFFICIENT_EVIDENCE';
}

interface RecruitmentAnalyticsSectionProps {
  communityId: string;
  onAskBrain?: (prompt: string) => void;
}

export const RecruitmentAnalyticsSection: React.FC<RecruitmentAnalyticsSectionProps> = ({
  communityId,
  onAskBrain,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [funnel, setFunnel] = useState<{
    stages: FunnelStageEnriched[];
    totalObserved: number;
    period: string;
  } | null>(null);

  const [recruiters, setRecruiters] = useState<RecruiterQualityMetrics[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignQualityMetrics[]>([]);
  const [sources, setSources] = useState<SourceQualityMetrics[]>([]);
  const [recruiterRange, setRecruiterRange] = useState<'7d' | '30d' | '90d' | 'all'>('all');

  const fetchData = async () => {
    if (!communityId) return;
    setLoading(true);
    setError(null);

    try {
      const [funnelRes, recruitersRes, campaignsRes, sourcesRes] = await Promise.all([
        fetch(`/api/v1/insights/recruitment/funnel`, {
          headers: { 'x-community-id': communityId },
        }),
        fetch(`/api/v1/insights/recruitment/recruiters?range=${recruiterRange}`, {
          headers: { 'x-community-id': communityId },
        }),
        fetch(`/api/v1/insights/recruitment/campaigns`, {
          headers: { 'x-community-id': communityId },
        }),
        fetch(`/api/v1/insights/recruitment/sources`, {
          headers: { 'x-community-id': communityId },
        }),
      ]);

      const [funnelJson, recruitersJson, campaignsJson, sourcesJson] = await Promise.all([
        funnelRes.json().catch(() => ({})),
        recruitersRes.json().catch(() => ({})),
        campaignsRes.json().catch(() => ({})),
        sourcesRes.json().catch(() => ({})),
      ]);

      if (funnelJson.success) setFunnel(funnelJson.data);
      if (recruitersJson.success) setRecruiters(recruitersJson.data || []);
      if (campaignsJson.success) setCampaigns(campaignsJson.data || []);
      if (sourcesJson.success) setSources(sourcesJson.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load recruitment analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [communityId, recruiterRange]);

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">Authoritative Recruitment Analytics</h2>
            <DataTruthBadge classification="VERIFIED_FACT" size="sm" />
          </div>
          <p className="mt-1 text-xs text-slate-500 max-w-2xl">
            9-stage lifecycle funnel tracking candidates from first application through approved join,
            onboarding completion, and active 90-day community tenure.
          </p>
        </div>

        {onAskBrain && (
          <button
            onClick={() => onAskBrain('Analyze recent recruitment funnel conversion bottlenecks')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 border border-indigo-200/60 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition shrink-0"
          >
            <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
            Analyze Funnel Drop-off
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
          {error}
        </div>
      )}

      {/* 9-Stage Recruitment Funnel */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Canonical 9-Stage Recruitment Funnel</h3>
            <p className="text-xs text-slate-500">
              Total candidates observed: <span className="font-semibold text-slate-800">{funnel?.totalObserved ?? 0}</span>
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Period: {funnel?.period || 'All-time'}
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading verified funnel stages...</div>
        ) : (
          <div className="space-y-3">
            {funnel?.stages?.map((stage, idx) => {
              const maxCount = funnel.stages[0]?.count || 1;
              const widthPct = maxCount > 0 ? Math.max(8, Math.round((stage.count / maxCount) * 100)) : 8;
              const stageKey = stage.stageKey || `stage-${idx}`;

              return (
                <div key={stageKey} className="group rounded-lg border border-slate-100 bg-slate-50/50 p-3 hover:bg-slate-50 transition">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-slate-900">{stage.label}</span>
                      <DataTruthBadge classification={stage.truthClassification} showIcon={false} size="sm" />
                    </div>

                    <div className="flex items-center gap-4 text-slate-600">
                      <div>
                        <span className="text-slate-400 text-[11px]">Count: </span>
                        <span className="font-bold text-slate-900">{stage.count}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 text-[11px]">Conversion: </span>
                        <span className="font-semibold text-indigo-600">
                          {typeof stage.conversionRateFromStart === 'number' ? `${stage.conversionRateFromStart}%` : 'N/A'}
                        </span>
                      </div>
                      {idx > 0 && (
                        <div>
                          <span className="text-slate-400 text-[11px]">Drop-off: </span>
                          <span className="font-semibold text-rose-600">
                            {typeof stage.dropOffPercent === 'number' ? `-${stage.dropOffPercent}%` : '0%'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Visual Funnel Bar */}
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        idx < 3
                          ? 'bg-indigo-600'
                          : idx < 6
                          ? 'bg-blue-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recruiter Performance Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-bold text-slate-900">Recruiter Quality Leaderboard</h3>
              <DataTruthBadge classification="VERIFIED_FACT" size="sm" />
            </div>
            <p className="text-xs text-slate-500">
              Measured by real candidate activation and 30-day verified member retention.
            </p>
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
            {(['7d', '30d', '90d', 'all'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRecruiterRange(r)}
                className={`rounded px-2.5 py-1 uppercase ${
                  recruiterRange === r
                    ? 'bg-white font-bold text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {recruiters.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No recruiter link activities recorded in this time range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Recruiter</th>
                  <th className="py-2.5 px-3">Applications</th>
                  <th className="py-2.5 px-3">Approved</th>
                  <th className="py-2.5 px-3">Joined</th>
                  <th className="py-2.5 px-3">Activated</th>
                  <th className="py-2.5 px-3">30d Retention</th>
                  <th className="py-2.5 px-3">Quality Tier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recruiters.map((rec, idx) => {
                  const recKey = rec.recruiterDiscordUserId || rec.recruiterCode || `recruiter-${idx}`;
                  return (
                    <tr key={recKey} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {rec.displayName || rec.recruiterDiscordUserId || 'Direct / Anonymous'}
                        {rec.recruiterCode && (
                          <span className="ml-1.5 font-mono text-[10px] text-slate-400">
                            ({rec.recruiterCode})
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{rec.applications}</td>
                      <td className="py-2.5 px-3 text-slate-700">{rec.approved}</td>
                      <td className="py-2.5 px-3 text-slate-700">{rec.joined}</td>
                      <td className="py-2.5 px-3 text-slate-700 font-semibold text-indigo-600">
                        {rec.activated} ({typeof rec.activationRate === 'number' ? `${rec.activationRate}%` : 'N/A'})
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {typeof rec.retentionRate30d === 'number' ? `${rec.retentionRate30d}%` : 'N/A'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            rec.qualityClassification === 'BEST_PERFORMING'
                              ? 'bg-emerald-50 text-emerald-700'
                              : rec.qualityClassification === 'HIGH_DROP_OFF'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {rec.qualityClassification ? rec.qualityClassification.replace('_', ' ') : 'STANDARD'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Campaigns & Source Attribution Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Campaigns */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
            <Target className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Recruitment Campaigns</h3>
            <DataTruthBadge classification="VERIFIED_FACT" size="sm" />
          </div>

          {campaigns.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              No active recruitment campaigns recorded.
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((camp, idx) => {
                const campaignKey = camp.campaignId || (camp as any).id || `camp-${idx}`;
                const campaignTitle = camp.name || (camp as any).campaignName || 'Campaign';
                const convRate = typeof (camp as any).conversionRate === 'number'
                  ? `${(camp as any).conversionRate}% Conv`
                  : typeof camp.activationRate === 'number'
                  ? `${camp.activationRate}% Act`
                  : 'N/A';

                return (
                  <div
                    key={campaignKey}
                    className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-900 mb-1">
                      <span>{campaignTitle}</span>
                      <span className="text-indigo-600 font-medium">
                        {convRate}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-slate-500">
                      <span>Apps: {camp.applications}</span>
                      <span>Joined: {camp.joined ?? (camp as any).joinCount ?? 0}</span>
                      <span>Activated: {camp.activated ?? (camp as any).activationCount ?? 0}</span>
                      <span>Retained 30d: {camp.retentionRate30d !== 'INSUFFICIENT_DATA' && camp.retentionRate30d !== undefined ? `${camp.retentionRate30d}%` : 'N/A'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Source Attribution */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
            <Link className="h-4 w-4 text-sky-600" />
            <h3 className="text-sm font-bold text-slate-900">Source Attribution</h3>
            <DataTruthBadge classification="VERIFIED_FACT" size="sm" />
          </div>

          {sources.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              No source attribution records found.
            </div>
          ) : (
            <div className="space-y-3">
              {sources.map((src, idx) => {
                const sourceName = src.source || (src as any).sourceType || 'DIRECT';
                const sourceKey = `${sourceName}-${idx}`;
                return (
                  <div
                    key={sourceKey}
                    className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-slate-900 block">
                        {sourceName ? String(sourceName).replace(/_/g, ' ') : 'DIRECT'}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {src.joined ?? 0} joined • {src.activated ?? 0} activated
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slate-900 text-sm">{src.applications ?? 0}</span>
                      <span className="text-[11px] text-slate-400 block">apps</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
