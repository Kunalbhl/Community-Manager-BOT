import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Award,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock,
  Filter,
  HelpCircle,
  Layers,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  UserCheck,
  Users,
  X,
  Info,
  Edit3,
  Calendar,
  Send,
} from 'lucide-react';
import {
  RecruitmentCohort,
  RecruitmentRetentionFunnel,
  RecruiterQualityMetrics,
  CampaignQualityMetrics,
  SourceQualityMetrics,
  EarlyMemberQualitySignal,
  RetentionAlert,
  OnboardingQualityAnalysis,
  ModerationQualityCrossover,
  EventQualityCrossover,
  AutomationQualityCrossover,
  MemberLifecycleExecutiveOverview,
  RecruitmentSourceType,
} from '../../../../shared/types/models.js';

interface Props {
  communityId: string;
  currentRole: string;
  onNavigate?: (section: string) => void;
}

export const LifecycleIntelligenceView: React.FC<Props> = ({
  communityId,
  currentRole,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<
    'funnel' | 'recruiters' | 'campaigns' | 'sources' | 'signals' | 'onboarding' | 'crossovers' | 'brain'
  >('funnel');

  const [isLoading, setIsLoading] = useState(false);
  const [overview, setOverview] = useState<MemberLifecycleExecutiveOverview | null>(null);
  const [funnel, setFunnel] = useState<RecruitmentRetentionFunnel | null>(null);
  const [cohorts, setCohorts] = useState<RecruitmentCohort[]>([]);
  const [selectedCohortId, setSelectedCohortId] = useState<string>('');

  const [recruiters, setRecruiters] = useState<RecruiterQualityMetrics[]>([]);
  const [recruiterTimeRange, setRecruiterTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('all');

  const [campaigns, setCampaigns] = useState<CampaignQualityMetrics[]>([]);
  const [sources, setSources] = useState<SourceQualityMetrics[]>([]);
  const [signals, setSignals] = useState<EarlyMemberQualitySignal[]>([]);
  const [alerts, setAlerts] = useState<RetentionAlert[]>([]);
  const [onboarding, setOnboarding] = useState<OnboardingQualityAnalysis | null>(null);

  const [modCrossover, setModCrossover] = useState<ModerationQualityCrossover | null>(null);
  const [eventCrossover, setEventCrossover] = useState<EventQualityCrossover | null>(null);
  const [autoCrossover, setAutoCrossover] = useState<AutomationQualityCrossover | null>(null);

  // Community Brain State
  const [brainQuestion, setBrainQuestion] = useState('');
  const [brainAnswer, setBrainAnswer] = useState<string | null>(null);
  const [isAskingBrain, setIsAskingBrain] = useState(false);

  // Modals
  const [isCohortModalOpen, setIsCohortModalOpen] = useState(false);
  const [newCohortName, setNewCohortName] = useState('');
  const [newCohortType, setNewCohortType] = useState<RecruitmentCohort['cohortType']>('DATE_RANGE');
  const [newCohortDesc, setNewCohortDesc] = useState('');

  const [isCorrectSourceModalOpen, setIsCorrectSourceModalOpen] = useState(false);
  const [targetAppId, setTargetAppId] = useState('');
  const [targetNewSource, setTargetNewSource] = useState<RecruitmentSourceType>('DIRECT');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correcting, setCorrecting] = useState(false);

  const isAuthorizedToManage =
    ['OWNER', 'PLATFORM_OWNER', 'COMMUNITY_ADMIN', 'ADMIN'].includes(currentRole);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [
        overviewRes,
        cohortsRes,
        funnelRes,
        recruitersRes,
        campaignsRes,
        sourcesRes,
        signalsRes,
        alertsRes,
        onboardingRes,
        modRes,
        eventRes,
        autoRes,
      ] = await Promise.all([
        fetch(`/api/v1/communities/${communityId}/retention/overview`),
        fetch(`/api/v1/communities/${communityId}/retention/cohorts`),
        fetch(`/api/v1/communities/${communityId}/retention/funnel${selectedCohortId ? `?cohortId=${selectedCohortId}` : ''}`),
        fetch(`/api/v1/communities/${communityId}/retention/recruiters?range=${recruiterTimeRange}`),
        fetch(`/api/v1/communities/${communityId}/retention/campaigns`),
        fetch(`/api/v1/communities/${communityId}/retention/sources`),
        fetch(`/api/v1/communities/${communityId}/retention/signals`),
        fetch(`/api/v1/communities/${communityId}/retention/alerts`),
        fetch(`/api/v1/communities/${communityId}/retention/onboarding`),
        fetch(`/api/v1/communities/${communityId}/retention/crossovers/moderation`),
        fetch(`/api/v1/communities/${communityId}/retention/crossovers/events`),
        fetch(`/api/v1/communities/${communityId}/retention/crossovers/automation`),
      ]);

      if (overviewRes.ok) setOverview((await overviewRes.json()).data);
      if (cohortsRes.ok) setCohorts((await cohortsRes.json()).data);
      if (funnelRes.ok) setFunnel((await funnelRes.json()).data);
      if (recruitersRes.ok) setRecruiters((await recruitersRes.json()).data);
      if (campaignsRes.ok) setCampaigns((await campaignsRes.json()).data);
      if (sourcesRes.ok) setSources((await sourcesRes.json()).data);
      if (signalsRes.ok) setSignals((await signalsRes.json()).data);
      if (alertsRes.ok) setAlerts((await alertsRes.json()).data);
      if (onboardingRes.ok) setOnboarding((await onboardingRes.json()).data);
      if (modRes.ok) setModCrossover((await modRes.json()).data);
      if (eventRes.ok) setEventCrossover((await eventRes.json()).data);
      if (autoRes.ok) setAutoCrossover((await autoRes.json()).data);
    } catch (err) {
      console.error('Failed to load retention data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [communityId, selectedCohortId, recruiterTimeRange]);

  const handleAskBrain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brainQuestion.trim() || isAskingBrain) return;
    setIsAskingBrain(true);
    setBrainAnswer(null);

    try {
      const res = await fetch(`/api/v1/communities/${communityId}/retention/brain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: brainQuestion }),
      });
      const json = await res.json();
      if (json.success) {
        setBrainAnswer(json.data);
      } else {
        setBrainAnswer(`Unable to query brain: ${json.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setBrainAnswer(`Request failed: ${err.message}`);
    } finally {
      setIsAskingBrain(false);
    }
  };

  const handleCreateCohort = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCohortName.trim()) return;

    try {
      const res = await fetch(`/api/v1/communities/${communityId}/retention/cohorts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCohortName,
          cohortType: newCohortType,
          description: newCohortDesc,
          filterCriteria: {},
        }),
      });
      if (res.ok) {
        setIsCohortModalOpen(false);
        setNewCohortName('');
        setNewCohortDesc('');
        fetchData();
      }
    } catch (err) {
      console.error('Failed to create cohort:', err);
    }
  };

  const handleCorrectSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetAppId.trim() || !correctionReason.trim()) return;
    setCorrecting(true);

    try {
      const res = await fetch(`/api/v1/communities/${communityId}/retention/sources/correct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: targetAppId,
          newSource: targetNewSource,
          reason: correctionReason,
        }),
      });
      if (res.ok) {
        setIsCorrectSourceModalOpen(false);
        setTargetAppId('');
        setCorrectionReason('');
        fetchData();
      }
    } catch (err) {
      console.error('Failed to correct source:', err);
    } finally {
      setCorrecting(false);
    }
  };

  const formatRate = (val: number | 'INSUFFICIENT_DATA' | undefined) => {
    if (val === undefined || val === 'INSUFFICIENT_DATA') {
      return (
        <span className="inline-flex items-center text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
          INSUFFICIENT DATA
        </span>
      );
    }
    return <span className="font-semibold text-slate-900">{val}%</span>;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header & Executive Summary Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 ring-1 ring-inset ring-indigo-700/10">
                TASK 52 INTELLIGENCE
              </span>
              <h1 className="text-xl font-bold text-slate-900">
                Recruitment Retention & Lifecycle Intelligence
              </h1>
            </div>
            <p className="mt-1 text-xs text-slate-500 max-w-3xl">
              Authoritative evidence connecting candidate sourcing to long-term guild activation, onboarding velocity, and member health.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {isAuthorizedToManage && (
              <button
                onClick={() => setIsCohortModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
              >
                <Layers className="h-3.5 w-3.5" />
                New Cohort
              </button>
            )}
          </div>
        </div>

        {/* Executive KPI Strip */}
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5 md:grid-cols-5">
          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
            <div className="text-xs font-medium text-slate-500">Total Applicants</div>
            <div className="mt-1 text-xl font-bold text-slate-900">
              {overview?.totalApplicants ?? 0}
            </div>
            <div className="text-[11px] text-slate-400">Authoritative pipeline count</div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
            <div className="text-xs font-medium text-slate-500">Active Members</div>
            <div className="mt-1 text-xl font-bold text-emerald-600">
              {overview?.activeMembers ?? 0}
            </div>
            <div className="text-[11px] text-slate-400">Activated via handoff</div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
            <div className="text-xs font-medium text-slate-500">30-Day Retention</div>
            <div className="mt-1 text-xl font-bold text-slate-900">
              {formatRate(overview?.retentionRate30d)}
            </div>
            <div className="text-[11px] text-slate-400">≥30d post-join activity</div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
            <div className="text-xs font-medium text-slate-500">Onboarding Velocity</div>
            <div className="mt-1 text-xl font-bold text-slate-900">
              {formatRate(overview?.onboardingCompletionRate)}
            </div>
            <div className="text-[11px] text-slate-400">Checklists completed</div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-100">
            <div className="text-xs font-medium text-slate-500">Lifecycle Alerts</div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-xl font-bold text-slate-900">
                {overview?.activeAlertsCount ?? 0}
              </span>
              {(overview?.activeAlertsCount ?? 0) > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                  Needs Attention
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400">Automated quality alerts</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto gap-2">
        {[
          { id: 'funnel', label: 'Retention Funnel', icon: BarChart3 },
          { id: 'recruiters', label: 'Recruiter Quality', icon: Users },
          { id: 'campaigns', label: 'Campaign Quality', icon: Award },
          { id: 'sources', label: 'Source Comparison', icon: Filter },
          { id: 'signals', label: 'Early Signals & Alerts', icon: Activity },
          { id: 'onboarding', label: 'Onboarding Friction', icon: UserCheck },
          { id: 'crossovers', label: 'Cross-System Matrix', icon: ShieldAlert },
          { id: 'brain', label: 'Community Brain Q&A', icon: Sparkles },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-xs font-medium transition ${
                isActive
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: RETENTION FUNNEL */}
      {activeTab === 'funnel' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  End-to-End Recruitment-to-Retention Funnel
                </h2>
                <p className="text-xs text-slate-500">
                  Full 9-stage progression tracking application to 90-day guild activity.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-slate-600">Cohort Filter:</label>
                <select
                  value={selectedCohortId}
                  onChange={(e) => setSelectedCohortId(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">All Applications (Default)</option>
                  {cohorts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.memberCount} members)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Funnel Stage Visualizer */}
            <div className="mt-6 space-y-3">
              {funnel?.stages.map((stage, idx) => {
                const isInsufficient = stage.status === 'INSUFFICIENT_DATA';
                return (
                  <div
                    key={stage.stageKey}
                    className="flex flex-col sm:flex-row sm:items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-4 gap-4"
                  >
                    <div className="flex items-center gap-3 sm:w-1/3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{stage.label}</div>
                        <div className="text-[11px] text-slate-500">{stage.evidenceNote || `Stage ${stage.stageKey}`}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 sm:w-2/3 sm:justify-end">
                      <div className="text-right">
                        <div className="text-base font-bold text-slate-900">{stage.count}</div>
                        <div className="text-[10px] text-slate-400">Total Count</div>
                      </div>

                      <div className="w-28 text-right">
                        <div className="text-xs font-medium text-slate-600">
                          {isInsufficient ? (
                            <span className="text-amber-600 font-normal">INSUFFICIENT DATA</span>
                          ) : (
                            `${stage.conversionRateFromPrevious}%`
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">From Previous</div>
                      </div>

                      <div className="w-28 text-right">
                        <div className="text-xs font-semibold text-indigo-600">
                          {isInsufficient ? (
                            <span className="text-slate-400 font-normal">—</span>
                          ) : (
                            `${stage.conversionRateFromStart}%`
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">From Start</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-xl bg-blue-50/50 p-4 border border-blue-100 flex items-start gap-3">
              <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-900">
                <span className="font-semibold">Observation Window Rigor:</span> If an applicant joined less than 7, 30, or 90 days ago, their observation window is incomplete and reported as <span className="font-semibold">INSUFFICIENT_DATA</span> rather than falsely flagged as dropped out.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RECRUITER QUALITY */}
      {activeTab === 'recruiters' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Recruiter Quality Analytics</h2>
              <p className="text-xs text-slate-500">
                Evaluates recruiter outcomes through activation, onboarding, and 30-day retention rather than raw submission counts.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Window:</span>
              {(['7d', '30d', '90d', 'all'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRecruiterTimeRange(r)}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium transition ${
                    recruiterTimeRange === r
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Recruiter</th>
                  <th className="px-4 py-3 font-semibold">Apps</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                  <th className="px-4 py-3 font-semibold">Activated</th>
                  <th className="px-4 py-3 font-semibold">Onboarded</th>
                  <th className="px-4 py-3 font-semibold">Activation %</th>
                  <th className="px-4 py-3 font-semibold">30d Ret %</th>
                  <th className="px-4 py-3 font-semibold">Classification</th>
                  <th className="px-4 py-3 font-semibold">Explainable Evidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recruiters.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                      No recruiter attributions recorded for this range.
                    </td>
                  </tr>
                ) : (
                  recruiters.map((r) => {
                    const badgeColor =
                      r.qualityClassification === 'BEST_PERFORMING'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : r.qualityClassification === 'HIGH_DROP_OFF'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : r.qualityClassification === 'BALANCED'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200';

                    return (
                      <tr key={r.recruiterDiscordUserId} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{r.displayName}</div>
                          <div className="font-mono text-[10px] text-slate-400">{r.recruiterCode}</div>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-900">{r.applications}</td>
                        <td className="px-4 py-3">{r.joined}</td>
                        <td className="px-4 py-3">{r.activated}</td>
                        <td className="px-4 py-3">{r.onboarded}</td>
                        <td className="px-4 py-3">{formatRate(r.activationRate)}</td>
                        <td className="px-4 py-3">{formatRate(r.retentionRate30d)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold ${badgeColor}`}>
                            {r.qualityClassification}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[11px] text-slate-500 max-w-xs truncate">
                          {r.explainableEvidence}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CAMPAIGN QUALITY */}
      {activeTab === 'campaigns' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-bold text-slate-900">Campaign Quality Analytics</h2>
            <p className="text-xs text-slate-500">
              Evaluates recruitment campaigns across conversion velocity, member activation, and early guild engagement.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {campaigns.map((camp) => (
              <div key={camp.campaignId} className="rounded-xl border border-slate-200 p-5 bg-slate-50/50 space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">{camp.name}</h3>
                    <div className="text-[11px] font-mono text-slate-400">{camp.campaignId}</div>
                  </div>
                  <span
                    className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                      camp.statusClassification === 'BEST_PERFORMING'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : camp.statusClassification === 'NEEDS_ATTENTION'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {camp.statusClassification}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white p-2 border border-slate-100">
                    <div className="text-[10px] text-slate-400">Applications</div>
                    <div className="font-bold text-slate-900 text-sm">{camp.applications}</div>
                  </div>
                  <div className="rounded-lg bg-white p-2 border border-slate-100">
                    <div className="text-[10px] text-slate-400">Join Rate</div>
                    <div className="text-xs">{formatRate(camp.joinRate)}</div>
                  </div>
                  <div className="rounded-lg bg-white p-2 border border-slate-100">
                    <div className="text-[10px] text-slate-400">Activation %</div>
                    <div className="text-xs">{formatRate(camp.activationRate)}</div>
                  </div>
                </div>

                <div className="rounded-lg bg-white p-3 border border-slate-100 text-xs space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Onboarding Completion:</span>
                    <span className="font-medium">{formatRate(camp.onboardingRate)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Early Engagement:</span>
                    <span className="font-medium">{formatRate(camp.earlyEngagementRate)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>30-Day Retention:</span>
                    <span className="font-medium">{formatRate(camp.retentionRate30d)}</span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 italic">
                  Evidence: {camp.evidence}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: SOURCE QUALITY */}
      {activeTab === 'sources' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Sourcing Channel Quality Matrix</h2>
              <p className="text-xs text-slate-500">
                Direct comparisons across sourcing channels without automated inference of causation.
              </p>
            </div>

            {isAuthorizedToManage && (
              <button
                onClick={() => setIsCorrectSourceModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Edit3 className="h-3.5 w-3.5 text-slate-500" />
                Correct Application Source
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Source Channel</th>
                  <th className="px-4 py-3 font-semibold">Apps</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                  <th className="px-4 py-3 font-semibold">Activated</th>
                  <th className="px-4 py-3 font-semibold">Activation Rate</th>
                  <th className="px-4 py-3 font-semibold">Onboarded</th>
                  <th className="px-4 py-3 font-semibold">1st Engagement</th>
                  <th className="px-4 py-3 font-semibold">30d Retention</th>
                  <th className="px-4 py-3 font-semibold">Evidence Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sources.map((s) => (
                  <tr key={s.source} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-bold text-slate-900">{s.source}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{s.applications}</td>
                    <td className="px-4 py-3">{s.joined}</td>
                    <td className="px-4 py-3">{s.activated}</td>
                    <td className="px-4 py-3">{formatRate(s.activationRate)}</td>
                    <td className="px-4 py-3">{s.onboarded}</td>
                    <td className="px-4 py-3">{s.firstEngagementCount}</td>
                    <td className="px-4 py-3">{formatRate(s.retentionRate30d)}</td>
                    <td className="px-4 py-3 text-[11px] text-slate-500 max-w-xs">
                      {s.evidenceSummary}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-xl bg-amber-50/50 p-4 border border-amber-200/60 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <span className="font-semibold">Correlation vs Causation Directive:</span> Sourcing channels reflect observed statistical performance. Variations in retention may be influenced by external campaign audiences, screening rigor, or seasonal cohort dynamics.
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SIGNALS & ALERTS */}
      {activeTab === 'signals' && (
        <div className="space-y-6">
          {/* Active Alerts */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Automated Retention Alerts</h2>
                <p className="text-xs text-slate-500">
                  Real-time detection of drop-offs, onboarding friction, and moderation incidents.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                {alerts.length} Active
              </span>
            </div>

            {alerts.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No active retention anomalies or drop-off alerts detected.
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alt) => (
                  <div
                    key={alt.id}
                    className={`rounded-xl border p-4 text-xs ${
                      alt.severity === 'CRITICAL'
                        ? 'border-rose-200 bg-rose-50/50'
                        : alt.severity === 'WARNING'
                        ? 'border-amber-200 bg-amber-50/50'
                        : 'border-blue-200 bg-blue-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4" />
                        {alt.alertType}
                      </span>
                      <span className="uppercase text-[10px] px-2 py-0.5 rounded bg-white/80 border">
                        {alt.severity}
                      </span>
                    </div>
                    <div className="mt-2 text-slate-700 font-medium">{alt.evidence}</div>
                    <div className="mt-2 text-slate-600 bg-white/70 p-2.5 rounded-lg border border-slate-200/50">
                      <span className="font-semibold text-slate-900">Action: </span>
                      {alt.recommendedAction}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Early Member Quality Signals */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-slate-900">Early Member Quality Signals</h2>
              <p className="text-xs text-slate-500">
                Authoritative event signals across recent recruits without opaque subjective scores.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Discord User</th>
                    <th className="px-4 py-3 font-semibold">Signal</th>
                    <th className="px-4 py-3 font-semibold">Days Post-Join</th>
                    <th className="px-4 py-3 font-semibold">Events Attended</th>
                    <th className="px-4 py-3 font-semibold">Warnings</th>
                    <th className="px-4 py-3 font-semibold">Checklist</th>
                    <th className="px-4 py-3 font-semibold">Observable Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {signals.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        No member signals recorded yet.
                      </td>
                    </tr>
                  ) : (
                    signals.map((sig) => {
                      const sigColor =
                        sig.signal === 'ONBOARDED'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : sig.signal === 'ACTIVE'
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : sig.signal === 'LOW_ACTIVITY'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : sig.signal === 'MODERATION_ATTENTION'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200';

                      return (
                        <tr key={sig.discordUserId} className="hover:bg-slate-50/80">
                          <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                            {sig.discordUserId}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold ${sigColor}`}>
                              {sig.signal}
                            </span>
                          </td>
                          <td className="px-4 py-3">{sig.daysSinceJoin}d</td>
                          <td className="px-4 py-3">{sig.eventAttendanceCount}</td>
                          <td className="px-4 py-3 font-medium text-rose-600">
                            {sig.moderationWarningsCount > 0 ? sig.moderationWarningsCount : '0'}
                          </td>
                          <td className="px-4 py-3">
                            {sig.checklistCompleted ? (
                              <span className="text-emerald-600 font-bold">Done</span>
                            ) : (
                              <span className="text-slate-400">Pending</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-[11px] text-slate-500 max-w-sm">
                            {sig.evidence}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: ONBOARDING FRICTION */}
      {activeTab === 'onboarding' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-base font-bold text-slate-900">Onboarding Quality & Step Friction</h2>
            <p className="text-xs text-slate-500">
              Identifies friction bottlenecks and abandonment patterns across the onboarding checklist.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="text-xs text-slate-400 font-medium">Total Checklists</div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {onboarding?.totalChecklists ?? 0}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Started by recruits</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="text-xs text-slate-400 font-medium">Completion Rate</div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {formatRate(onboarding?.overallCompletionRate)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">100% finished</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="text-xs text-slate-400 font-medium">Average Completion Time</div>
              <div className="text-xl font-bold text-slate-900 mt-1">
                {onboarding?.averageCompletionTimeHours !== 'INSUFFICIENT_DATA' && onboarding?.averageCompletionTimeHours !== undefined
                  ? `${onboarding.averageCompletionTimeHours} hrs`
                  : 'INSUFFICIENT DATA'}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Elapsed from join</div>
            </div>
          </div>

          {onboarding?.highFrictionStep && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-xs flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-rose-900">High Friction Step Detected: </span>
                <span className="font-semibold text-rose-800">
                  {onboarding.highFrictionStep.title}
                </span>{' '}
                ({onboarding.highFrictionStep.dropoffRate}% abandonment). Consider clarifying instructions or automating verification.
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Checklist Step Progression
            </h3>
            {onboarding?.stepMetrics.map((step) => (
              <div
                key={step.key}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-xs"
              >
                <div>
                  <div className="font-semibold text-slate-900">{step.title}</div>
                  <div className="font-mono text-[10px] text-slate-400">{step.key}</div>
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div>
                    <div className="font-semibold text-emerald-600">{step.completedCount}</div>
                    <div className="text-[10px] text-slate-400">Completed</div>
                  </div>
                  <div>
                    <div className="font-semibold text-rose-600">{step.abandonedCount}</div>
                    <div className="text-[10px] text-slate-400">Abandoned</div>
                  </div>
                  <div className="w-20">
                    <div className="font-bold text-slate-900">{step.completionRate}%</div>
                    <div className="text-[10px] text-slate-400">Success Rate</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="text-xs text-slate-500 italic border-t border-slate-100 pt-3">
            Pattern insight: {onboarding?.successfulPattern}
          </div>
        </div>
      )}

      {/* TAB 7: CROSS-SYSTEM MATRIX */}
      {activeTab === 'crossovers' && (
        <div className="space-y-6">
          {/* Moderation Crossover */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-slate-900">Moderation Quality Crossover</h2>
              <p className="text-xs text-slate-500">
                Correlates recruitment channels with post-join moderation warnings and incidents.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Source Channel</th>
                    <th className="px-4 py-3 font-semibold">Members</th>
                    <th className="px-4 py-3 font-semibold">Warnings Logged</th>
                    <th className="px-4 py-3 font-semibold">Incidents Logged</th>
                    <th className="px-4 py-3 font-semibold">Correlation Observation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {modCrossover?.sourceCorrelations.map((row) => (
                    <tr key={row.source} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-bold text-slate-900">{row.source}</td>
                      <td className="px-4 py-3">{row.memberCount}</td>
                      <td className="px-4 py-3 font-medium text-amber-600">{row.warningCount}</td>
                      <td className="px-4 py-3 font-medium text-rose-600">{row.incidentCount}</td>
                      <td className="px-4 py-3 text-[11px] text-slate-500">
                        {row.correlationObservation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Event Crossover */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-slate-900">Community Event Turnout Crossover</h2>
              <p className="text-xs text-slate-500">
                Evaluates which recruitment sources drive actual attendance at community events.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Source Channel</th>
                    <th className="px-4 py-3 font-semibold">Registrations</th>
                    <th className="px-4 py-3 font-semibold">Attended Events</th>
                    <th className="px-4 py-3 font-semibold">Attendance Rate</th>
                    <th className="px-4 py-3 font-semibold">Turnout Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {eventCrossover?.sourceBreakdown.map((row) => (
                    <tr key={row.source} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-bold text-slate-900">{row.source}</td>
                      <td className="px-4 py-3">{row.registeredCount}</td>
                      <td className="px-4 py-3">{row.attendedCount}</td>
                      <td className="px-4 py-3">{formatRate(row.attendanceRate)}</td>
                      <td className="px-4 py-3 text-[11px] text-slate-500">{row.observation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Automation Crossover */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
            <h2 className="text-base font-bold text-slate-900">Automation Reliability Crossover</h2>
            <p className="text-xs text-slate-500">
              Reliability of automated onboarding triggers, DM greetings, and recruitment actions.
            </p>
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 text-xs text-slate-700">
              {autoCrossover?.evidence}
            </div>
          </div>
        </div>
      )}

      {/* TAB 8: COMMUNITY BRAIN Q&A */}
      {activeTab === 'brain' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              <h2 className="text-base font-bold text-slate-900">Community Brain Retention Advisor</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Ask natural-language questions regarding recruitment retention, source health, and drop-off points. Responses strictly cite Verified Facts, Observed Correlations, Possible Explanations, and Insufficient Evidence.
            </p>
          </div>

          <form onSubmit={handleAskBrain} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Which recruitment source yields the highest onboarding completion rate?"
                value={brainQuestion}
                onChange={(e) => setBrainQuestion(e.target.value)}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isAskingBrain || !brainQuestion.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                <Send className="h-3.5 w-3.5" />
                {isAskingBrain ? 'Analyzing Facts...' : 'Ask Brain'}
              </button>
            </div>
          </form>

          {brainAnswer && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-5 space-y-3 text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
              <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                Community Brain Analysis
              </div>
              <div>{brainAnswer}</div>
            </div>
          )}
        </div>
      )}

      {/* MODAL: CREATE COHORT */}
      {isCohortModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Create Immutable Cohort</h3>
              <button onClick={() => setIsCohortModalOpen(false)}>
                <X className="h-5 w-5 text-slate-400 hover:text-slate-600" />
              </button>
            </div>

            <form onSubmit={handleCreateCohort} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700">Cohort Name</label>
                <input
                  type="text"
                  placeholder="e.g. Q1 2026 Gaming Tourney Recruits"
                  value={newCohortName}
                  onChange={(e) => setNewCohortName(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700">Cohort Type</label>
                <select
                  value={newCohortType}
                  onChange={(e) => setNewCohortType(e.target.value as any)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="DATE_RANGE">Date Range</option>
                  <option value="CAMPAIGN">Campaign</option>
                  <option value="SOURCE">Source Channel</option>
                  <option value="RECRUITER">Recruiter</option>
                  <option value="REFERRAL">Referral</option>
                  <option value="CUSTOM">Custom Filter</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700">Description</label>
                <textarea
                  rows={2}
                  placeholder="Notes on cohort purpose..."
                  value={newCohortDesc}
                  onChange={(e) => setNewCohortDesc(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCohortModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700"
                >
                  Create Cohort
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CORRECT SOURCE */}
      {isCorrectSourceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Correct Application Source</h3>
              <button onClick={() => setIsCorrectSourceModalOpen(false)}>
                <X className="h-5 w-5 text-slate-400 hover:text-slate-600" />
              </button>
            </div>

            <form onSubmit={handleCorrectSource} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700">Application ID</label>
                <input
                  type="text"
                  placeholder="e.g. app_12345"
                  value={targetAppId}
                  onChange={(e) => setTargetAppId(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700">New Source Channel</label>
                <select
                  value={targetNewSource}
                  onChange={(e) => setTargetNewSource(e.target.value as any)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="DIRECT">DIRECT</option>
                  <option value="REFERRAL">REFERRAL</option>
                  <option value="RECRUITER">RECRUITER</option>
                  <option value="CAMPAIGN">CAMPAIGN</option>
                  <option value="EVENT">EVENT</option>
                  <option value="PARTNER">PARTNER</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700">Correction Reason (Required for Audit Trail)</label>
                <textarea
                  rows={2}
                  placeholder="Explain why this attribution is being corrected..."
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCorrectSourceModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={correcting}
                  className="rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {correcting ? 'Saving...' : 'Save & Log Audit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
