import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  RefreshCw,
  Award,
  Plus,
  Key,
  CheckCircle,
  Clock,
  Copy,
  Check,
  ChevronRight,
  X,
  UserCheck,
  Shield,
  Activity,
  Filter,
  ExternalLink,
  Gift,
  AlertCircle,
  FileText,
  Calendar,
  Target,
  Sparkles,
  AlertTriangle,
  MessageSquare,
  TrendingUp,
  Compass,
} from 'lucide-react';
import { UserRole } from '../../../../shared/types/rbac.js';

interface RecruitersViewProps {
  communityId: string;
  currentRole: UserRole;
}

export const RecruitersView: React.FC<RecruitersViewProps> = ({
  communityId,
  currentRole,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'recruiters' | 'referrals' | 'leaderboard' | 'abuse'>('overview');
  
  // Data States
  const [recruiters, setRecruiters] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [rewards, setRewards] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [abuseData, setAbuseData] = useState<{ duplicates: any[]; abuse: any[] }>({ duplicates: [], abuse: [] });
  const [overviewStats, setOverviewStats] = useState<any | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [leaderboardRange, setLeaderboardRange] = useState<'7 days' | '30 days' | 'All Time'>('All Time');

  // Selected details drawer
  const [selectedRecruiter, setSelectedRecruiter] = useState<any | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  
  // Modal controllers
  const [isAddRecruiterOpen, setIsAddRecruiterOpen] = useState(false);
  const [isAddReferralOpen, setIsAddReferralOpen] = useState(false);
  const [isCreateGoalOpen, setIsCreateGoalOpen] = useState(false);
  const [isCreateRewardOpen, setIsCreateRewardOpen] = useState(false);

  // Form states
  const [newDiscordUser, setNewDiscordUser] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newRole, setNewRole] = useState<'RECRUITER' | 'SENIOR_RECRUITER' | 'REVIEWER' | 'INTERVIEWER' | 'RECRUITMENT_MANAGER'>('RECRUITER');
  
  const [refRecruiterId, setRefRecruiterId] = useState('');
  const [refCode, setRefCode] = useState('');
  const [refSource, setRefSource] = useState('DISCORD');
  const [refCampaignId, setRefCampaignId] = useState('');
  const [refExpiresAt, setRefExpiresAt] = useState('');

  const [goalType, setGoalType] = useState<'APPLICATIONS' | 'INTERVIEWS' | 'JOINS' | 'SUCCESSFUL_RECRUITMENT'>('JOINS');
  const [goalValue, setGoalValue] = useState(5);
  const [goalEndAt, setGoalEndAt] = useState('');

  const [rewType, setRewType] = useState<'ROLE' | 'BENEFIT' | 'POINTS' | 'BONUS'>('BENEFIT');
  const [rewReason, setRewReason] = useState('');
  const [rewAppId, setRewAppId] = useState('');

  // Community Brain State
  const [brainQuery, setBrainQuery] = useState('');
  const [brainResponse, setBrainResponse] = useState<string | null>(null);
  const [brainLoading, setBrainLoading] = useState(false);

  // Feedback states
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 4500);
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const headers = {
        'x-user-role': currentRole,
        'x-role': currentRole,
        'x-community-id': communityId,
      };

      const [overviewRes, recRes, refRes, rewardsRes, goalsRes, leaderboardRes, abuseRes] = await Promise.all([
        fetch(`/api/v1/communities/${communityId}/recruitment/overview`, { headers }),
        fetch(`/api/v1/communities/${communityId}/recruitment/recruiters`, { headers }),
        fetch(`/api/v1/communities/${communityId}/recruitment/referrals`, { headers }),
        fetch(`/api/v1/communities/${communityId}/recruitment/rewards`, { headers }),
        fetch(`/api/v1/communities/${communityId}/recruitment/goals`, { headers }),
        fetch(`/api/v1/communities/${communityId}/recruitment/leaderboard?range=${leaderboardRange}`, { headers }),
        fetch(`/api/v1/communities/${communityId}/recruitment/abuse-check`, { headers }),
      ]);

      if (overviewRes.ok) {
        const json = await overviewRes.json();
        if (json.success) setOverviewStats(json.data);
      }
      if (recRes.ok) {
        const json = await recRes.json();
        if (json.success) setRecruiters(json.data);
      }
      if (refRes.ok) {
        const json = await refRes.json();
        if (json.success) setReferrals(json.data);
      }
      if (rewardsRes.ok) {
        const json = await rewardsRes.json();
        if (json.success) setRewards(json.data);
      }
      if (goalsRes.ok) {
        const json = await goalsRes.json();
        if (json.success) setGoals(json.data);
      }
      if (leaderboardRes.ok) {
        const json = await leaderboardRes.json();
        if (json.success) setLeaderboard(json.data);
      }
      if (abuseRes.ok) {
        const json = await abuseRes.json();
        if (json.success) setAbuseData(json.data);
      }
    } catch (err) {
      console.error('Failed to load recruitment network data:', err);
      showError('Failed to refresh data from server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [communityId, currentRole, leaderboardRange]);

  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateRecruiter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDiscordUser || !newCode) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/recruitment/recruiters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-role': currentRole,
        },
        body: JSON.stringify({
          workspaceId: 'ws_default',
          discordUserId: newDiscordUser.trim(),
          displayNameSnapshot: newDiscordUser.trim(),
          role: newRole,
          recruiterCode: newCode.trim().toUpperCase(),
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        showSuccess(`Recruiter '${newDiscordUser}' registered successfully.`);
        setIsAddRecruiterOpen(false);
        setNewDiscordUser('');
        setNewCode('');
        loadAllData();
      } else {
        showError(json.message || 'Failed to create recruiter.');
      }
    } catch (err) {
      showError('An unexpected network error occurred.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refRecruiterId || !refCode) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/recruitment/referrals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-role': currentRole,
        },
        body: JSON.stringify({
          workspaceId: 'ws_default',
          recruiterId: refRecruiterId,
          code: refCode.trim().toUpperCase(),
          source: refSource,
          campaignId: refCampaignId || undefined,
          expiresAt: refExpiresAt || undefined,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        showSuccess(`Referral code '${refCode.toUpperCase()}' generated successfully.`);
        setIsAddReferralOpen(false);
        setRefCode('');
        setRefExpiresAt('');
        loadAllData();
      } else {
        showError(json.message || 'Failed to register referral code.');
      }
    } catch (err) {
      showError('Network error registering referral.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecruiter) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/recruitment/goals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-role': currentRole,
        },
        body: JSON.stringify({
          workspaceId: 'ws_default',
          recruiterId: selectedRecruiter.recruiter.id,
          targetType: goalType,
          targetValue: goalValue,
          startAt: new Date().toISOString(),
          endAt: goalEndAt ? new Date(goalEndAt).toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        showSuccess('New milestone goal defined successfully.');
        setIsCreateGoalOpen(false);
        setGoalEndAt('');
        // Refresh details drawer
        const details = await fetch(`/api/v1/communities/${communityId}/recruitment/recruiters/${selectedRecruiter.recruiter.id}`, {
          headers: { 'x-user-role': currentRole, 'x-role': currentRole }
        }).then(r => r.json());
        if (details.success) setSelectedRecruiter(details.data);
        loadAllData();
      } else {
        showError(json.message || 'Failed to create recruiter goal.');
      }
    } catch (err) {
      showError('Network error defining goal.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecruiter || !rewAppId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/recruitment/rewards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-role': currentRole,
        },
        body: JSON.stringify({
          workspaceId: 'ws_default',
          recruiterId: selectedRecruiter.recruiter.id,
          applicationId: rewAppId,
          rewardType: rewType,
          reason: rewReason || `Milestone performance payout for ${selectedRecruiter.recruiter.displayNameSnapshot}`,
          source: 'DIRECT_AWARD',
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        showSuccess('Benefit reward registered in pending status.');
        setIsCreateRewardOpen(false);
        setRewAppId('');
        setRewReason('');
        // Refresh details drawer
        const details = await fetch(`/api/v1/communities/${communityId}/recruitment/recruiters/${selectedRecruiter.recruiter.id}`, {
          headers: { 'x-user-role': currentRole, 'x-role': currentRole }
        }).then(r => r.json());
        if (details.success) setSelectedRecruiter(details.data);
        loadAllData();
      } else {
        showError(json.message || 'Candidate must be APPROVED/JOINED and verified for rewards.');
      }
    } catch (err) {
      showError('Network error establishing reward.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaimReward = async (rewardId: string) => {
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/recruitment/rewards/${rewardId}/claim`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-role': currentRole,
        },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showSuccess('Benefit claimed and issued successfully!');
        if (selectedRecruiter) {
          const details = await fetch(`/api/v1/communities/${communityId}/recruitment/recruiters/${selectedRecruiter.recruiter.id}`, {
            headers: { 'x-user-role': currentRole, 'x-role': currentRole }
          }).then(r => r.json());
          if (details.success) setSelectedRecruiter(details.data);
        }
        loadAllData();
      } else {
        showError(json.message || 'Failed to claim reward.');
      }
    } catch (err) {
      showError('Network error claiming reward.');
    }
  };

  const handleAskBrain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brainQuery.trim()) return;
    setBrainLoading(true);
    setBrainResponse(null);
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/recruitment/brain`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-role': currentRole,
        },
        body: JSON.stringify({ question: brainQuery }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setBrainResponse(json.data);
      } else {
        setBrainResponse(`**Insufficient Evidence**: The AI engine returned an error: ${json.message || 'Internal Failure'}`);
      }
    } catch (err) {
      setBrainResponse('**Insufficient Evidence**: Network query timed out or failed to reach Community Brain server.');
    } finally {
      setBrainLoading(false);
    }
  };

  const openRecruiterDrawer = async (rec: any) => {
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/recruitment/recruiters/${rec.id}`, {
        headers: {
          'x-user-role': currentRole,
          'x-role': currentRole,
        }
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setSelectedRecruiter(json.data);
        setIsDetailDrawerOpen(true);
      } else {
        showError('Could not fetch recruiter details.');
      }
    } catch (err) {
      showError('Error loading detail drawer.');
    }
  };

  // Filter recruiters for search
  const filteredRecruiters = recruiters.filter((r) => {
    const query = searchQuery.toLowerCase();
    return (
      r.displayNameSnapshot?.toLowerCase().includes(query) ||
      r.recruiterCode?.toLowerCase().includes(query) ||
      r.discordUserId?.toLowerCase().includes(query)
    );
  });

  return (
    <div id="recruitment-growth-hub" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              RECRUITMENT COMMAND CENTER
            </span>
            <span className="font-mono text-xs text-slate-400">ACTIVE REGION: {communityId}</span>
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">
            Recruitment Network & Talent Acquisition Hub
          </h1>
          <p className="text-sm text-slate-500">
            Design recruiter profiles, generate trackable referral links, review automated fraud analysis, and monitor community goals.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadAllData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </button>
          <button
            onClick={() => setIsAddRecruiterOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
          >
            <Plus className="h-4 w-4" />
            Add Recruiter Node
          </button>
        </div>
      </div>

      {/* Feedback Alerts */}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6">
          {(['overview', 'recruiters', 'referrals', 'leaderboard', 'abuse'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 text-sm font-bold capitalize transition-colors border-b-2 ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab === 'abuse' ? 'Abuse Guard' : tab === 'referrals' ? 'Referral Ecosystem' : `${tab}`}
            </button>
          ))}
        </nav>
      </div>

      {/* TAB CONTENTS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Sourced Applications
              </span>
              <div className="mt-2 text-3xl font-extrabold text-slate-900">{overviewStats?.totalApplications || 0}</div>
              <div className="mt-1 text-xs text-slate-500">Total processed candidates</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Active Recruiters
              </span>
              <div className="mt-2 text-3xl font-extrabold text-slate-900">{overviewStats?.recruitersCount || 0}</div>
              <div className="mt-1 text-xs text-slate-500">Verified recruitment nodes</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Active Referrals
              </span>
              <div className="mt-2 text-3xl font-extrabold text-slate-900">{overviewStats?.referralsCount || 0}</div>
              <div className="mt-1 text-xs text-slate-500">Immutable custom links</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Recruitment Success rate
              </span>
              <div className="mt-2 text-3xl font-extrabold text-emerald-600">
                {overviewStats?.pipeline?.JOINED > 0 && overviewStats?.totalApplications > 0
                  ? `${Math.round((overviewStats.pipeline.JOINED / overviewStats.totalApplications) * 100)}%`
                  : '0%'}
              </div>
              <div className="mt-1 text-xs text-slate-500">Approved & joined ratio</div>
            </div>
          </div>

          {/* Sourcing Channel Distribution & Acquisition Funnel */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Acquisition Funnel */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5 mb-4">
                <TrendingUp className="h-5 w-5 text-indigo-600" />
                Active Acquisition Funnel
              </h3>
              
              <div className="space-y-4">
                {[
                  { name: 'Sourced (Submitted)', value: overviewStats?.pipeline?.SUBMITTED || 0, color: 'bg-indigo-500' },
                  { name: 'Under Review', value: overviewStats?.pipeline?.REVIEW || 0, color: 'bg-blue-500' },
                  { name: 'Interview Stage', value: overviewStats?.pipeline?.INTERVIEW || 0, color: 'bg-purple-500' },
                  { name: 'Approved Candidates', value: overviewStats?.pipeline?.APPROVED || 0, color: 'bg-amber-500' },
                  { name: 'Joined Community', value: overviewStats?.pipeline?.JOINED || 0, color: 'bg-emerald-500' },
                ].map((stage, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-600">{stage.name}</span>
                      <span className="text-slate-900">{stage.value} candidates</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${stage.color}`}
                        style={{
                          width: `${
                            overviewStats?.totalApplications > 0
                              ? Math.max(5, (stage.value / overviewStats.totalApplications) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sourcing Channels */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5 mb-4">
                <Compass className="h-5 w-5 text-indigo-600" />
                Sourcing Distribution
              </h3>

              {overviewStats?.sources?.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs italic">No sourcing data recorded.</div>
              ) : (
                <div className="space-y-3">
                  {overviewStats?.sources?.map((src: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between rounded-lg border border-slate-50 p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-indigo-600" />
                        <span className="text-xs font-bold text-slate-700 uppercase">{src.name}</span>
                      </div>
                      <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-extrabold text-indigo-700">
                        {src.count}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Community Brain Recruitment Assistant */}
          <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/30 p-6 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-600 animate-pulse" />
              <h3 className="text-base font-bold text-indigo-900">Community Brain Q&A Assistant</h3>
            </div>
            <p className="mt-1 text-xs text-indigo-700 max-w-2xl">
              Ask any complex questions about your campaign conversions, recruiter workloads, and pipelines. 
              The Community Brain matches data patterns dynamically and cites facts objectively.
            </p>

            <form onSubmit={handleAskBrain} className="mt-4 flex gap-2">
              <input
                type="text"
                value={brainQuery}
                onChange={(e) => setBrainQuery(e.target.value)}
                placeholder="e.g. Which recruiters have the highest conversion rates and what channels did they use?"
                className="flex-1 rounded-lg border border-indigo-200 bg-white px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={brainLoading || !brainQuery.trim()}
                className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {brainLoading ? 'Analyzing...' : 'Query Brain'}
              </button>
            </form>

            {brainResponse && (
              <div className="mt-4 rounded-lg bg-white border border-indigo-100 p-4 shadow-2xs space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
                  <MessageSquare className="h-4 w-4 text-indigo-600" />
                  <span>COMMUNITY BRAIN VERDICT</span>
                </div>
                <div className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                  {brainResponse}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'recruiters' && (
        <div className="space-y-4">
          {/* List Search & Filter */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, role, or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-300 pl-9 pr-4 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Recruiters List */}
          {filteredRecruiters.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
              <Users className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">No recruiters found matching query.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3.5">Recruiter</th>
                      <th className="px-6 py-3.5">Role responsibility</th>
                      <th className="px-6 py-3.5">Authoritative Code</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5">Enrolled Since</th>
                      <th className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {filteredRecruiters.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50/50 transition">
                        <td className="px-6 py-4 flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700">
                            {rec.displayNameSnapshot?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{rec.displayNameSnapshot}</div>
                            <div className="text-xs text-slate-400">@{rec.discordUserId}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {rec.role?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                            {rec.recruiterCode}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            rec.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {rec.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-400">
                          {new Date(rec.joinedAt || rec.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => openRecruiterDrawer(rec)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                          >
                            <span>Profile & Goals</span>
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'referrals' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-base font-bold text-slate-900">Referral Links & Sourcing Nodes</h3>
            <button
              onClick={() => setIsAddReferralOpen(true)}
              className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
            >
              <Plus className="h-3 w-3" />
              Generate Referral Code
            </button>
          </div>

          {referrals.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
              <Key className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">No active referral codes registered.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3.5">Referral Code</th>
                      <th className="px-6 py-3.5">Source Channel</th>
                      <th className="px-6 py-3.5">Associated Recruiter</th>
                      <th className="px-6 py-3.5">Campaign Context</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5 text-right font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                    {referrals.map((ref) => {
                      const associatedRec = recruiters.find(r => r.id === ref.recruiterId);
                      return (
                        <tr key={ref.id} className="hover:bg-slate-50/50 transition">
                          <td className="px-6 py-4">
                            <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded">
                              {ref.code}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-xs font-bold text-slate-500">{ref.source}</td>
                          <td className="px-6 py-4 text-xs">
                            {associatedRec?.displayNameSnapshot || 'System Node'}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-400">{ref.campaignId || 'DIRECT_LINK'}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              ref.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {ref.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleCopyText(ref.code, ref.id)}
                              className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                            >
                              {copiedId === ref.id ? 'Copied!' : 'Copy Code'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'leaderboard' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Recruiter Performance Leaderboard</h3>
              <p className="text-xs text-slate-500">Live evidence-based metrics ranked dynamically. No simulated stats.</p>
            </div>

            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
              {(['7 days', '30 days', 'All Time'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setLeaderboardRange(range)}
                  className={`rounded-md px-3 py-1 font-bold transition ${
                    leaderboardRange === range
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          {leaderboard.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-400 text-sm italic">
              No active recruiters have logs under this date range.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3.5 text-center w-16">Rank</th>
                    <th className="px-6 py-3.5">Recruiter Node</th>
                    <th className="px-6 py-3.5 text-center">Successful</th>
                    <th className="px-6 py-3.5 text-center">Joined</th>
                    <th className="px-6 py-3.5 text-center">Conversion</th>
                    <th className="px-6 py-3.5 text-center">Avg. Review Time</th>
                    <th className="px-6 py-3.5">Badges</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {leaderboard.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          idx === 0 ? 'bg-amber-100 text-amber-800' : idx === 1 ? 'bg-slate-200 text-slate-800' : 'bg-slate-50 text-slate-600'
                        }`}>
                          {idx + 1}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900">{item.displayName}</td>
                      <td className="px-6 py-4 text-center font-bold text-indigo-600">{item.successful}</td>
                      <td className="px-6 py-4 text-center text-emerald-600 font-bold">{item.joined}</td>
                      <td className="px-6 py-4 text-center">{item.conversionRate}%</td>
                      <td className="px-6 py-4 text-center text-slate-400 text-xs">{item.reviewVelocity}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold ${
                          item.successful >= 5 ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'text-slate-600'
                        }`}>
                          {item.successful >= 5 ? '🏆 Top Recruiter' : 'Consistent Recruiter'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'abuse' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50/30 p-5">
            <h3 className="text-base font-bold text-rose-900 flex items-center gap-1.5">
              <Shield className="h-5 w-5 text-rose-600" />
              Recruitment Double-Agent & Fraud Guard
            </h3>
            <p className="mt-1 text-xs text-rose-700 max-w-2xl">
              Automatic risk verification flagging candidate profiles using suspicious attribution turnover patterns, duplicate Discord IDs, or identical applicant usernames. No automatic decisions are made.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Duplicate Candidate Warnings */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Duplicate Candidate Warnings</h4>
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-700">
                  {abuseData.duplicates?.length || 0} Alerts
                </span>
              </div>

              {abuseData.duplicates?.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs italic">No identical candidate profile collisions detected.</div>
              ) : (
                <div className="space-y-3">
                  {abuseData.duplicates?.map((item: any, idx: number) => (
                    <div key={idx} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-xs space-y-1.5">
                      <div className="flex items-start gap-1 text-rose-800 font-bold">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                        <span>{item.type?.replace(/_/g, ' ')}</span>
                      </div>
                      <p className="text-slate-600">{item.evidence}</p>
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase font-bold text-slate-400">Related Applications:</div>
                        {item.applications?.map((app: any, appIdx: number) => (
                          <div key={appIdx} className="flex items-center justify-between text-[11px] bg-white border border-slate-100 p-1.5 rounded">
                            <span className="font-medium text-slate-800">{app.username} (ID: {app.id})</span>
                            <span className="rounded bg-slate-50 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{app.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Suspicious Sourcing Patterns */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Suspicious Sourcing Warnings</h4>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">
                  {abuseData.abuse?.length || 0} Flags
                </span>
              </div>

              {abuseData.abuse?.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs italic">No suspicious referral loops detected.</div>
              ) : (
                <div className="space-y-3">
                  {abuseData.abuse?.map((item: any, idx: number) => (
                    <div key={idx} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-xs space-y-1">
                      <div className="flex items-start gap-1 text-amber-800 font-bold">
                        <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                        <span>{item.type?.replace(/_/g, ' ')}</span>
                      </div>
                      <p className="text-slate-600">{item.evidence}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DETAILED RECRUITER DRAWER */}
      {isDetailDrawerOpen && selectedRecruiter && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl overflow-y-auto flex flex-col">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-900 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-600 font-bold text-white text-lg">
                  {selectedRecruiter.recruiter.displayNameSnapshot?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold">{selectedRecruiter.recruiter.displayNameSnapshot}</h2>
                  <div className="text-xs text-slate-400">Role: {selectedRecruiter.recruiter.role?.replace(/_/g, ' ')}</div>
                </div>
              </div>
              <button
                onClick={() => setIsDetailDrawerOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="p-6 space-y-6 flex-1">
              {/* Core Performance metrics */}
              <div className="grid grid-cols-4 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Assigned</div>
                  <div className="mt-1 text-base font-extrabold text-slate-900">{selectedRecruiter.metrics?.assigned}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Interviews</div>
                  <div className="mt-1 text-base font-extrabold text-indigo-600">{selectedRecruiter.metrics?.interviews}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Approved</div>
                  <div className="mt-1 text-base font-extrabold text-amber-600">{selectedRecruiter.metrics?.approved}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase">Successful</div>
                  <div className="mt-1 text-base font-extrabold text-emerald-600">{selectedRecruiter.metrics?.successful}</div>
                </div>
              </div>

              {/* Dynamic Goals & Milestones */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <h3 className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Target className="h-4 w-4 text-indigo-600" />
                    Recruiter Performance Goals
                  </h3>
                  <button
                    onClick={() => setIsCreateGoalOpen(true)}
                    className="rounded bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"
                  >
                    Set New Target
                  </button>
                </div>

                {selectedRecruiter.goals?.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No milestone targets registered for this node.</p>
                ) : (
                  <div className="space-y-3">
                    {selectedRecruiter.goals?.map((goal: any) => (
                      <div key={goal.id} className="rounded-lg border border-slate-100 p-3 text-xs space-y-2 bg-slate-5/50">
                        <div className="flex items-center justify-between font-bold text-slate-800">
                          <span className="uppercase">{goal.targetType?.replace(/_/g, ' ')}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded font-extrabold uppercase ${
                            goal.status === 'REACHED' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {goal.status}
                          </span>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>Progress: {goal.currentValue || 0} / {goal.targetValue}</span>
                            <span>{Math.round((goal.currentValue || 0) / goal.targetValue * 100)}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-indigo-600"
                              style={{ width: `${Math.min(100, ((goal.currentValue || 0) / goal.targetValue) * 100)}%` }}
                            />
                          </div>
                        </div>

                        <div className="text-[10px] text-slate-400 font-medium">
                          Ends on: {new Date(goal.endAt).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Verified Rewards Panel */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                  <h3 className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Award className="h-4 w-4 text-amber-500" />
                    Assigned Rewards ({selectedRecruiter.rewards?.length || 0})
                  </h3>
                  <button
                    onClick={() => setIsCreateRewardOpen(true)}
                    className="rounded bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-700 hover:bg-amber-100"
                  >
                    Direct Award Benefit
                  </button>
                </div>

                {selectedRecruiter.rewards?.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No rewards have been registered.</p>
                ) : (
                  <div className="space-y-2">
                    {selectedRecruiter.rewards?.map((rew: any) => (
                      <div key={rew.id} className="flex items-center justify-between rounded-lg border border-slate-50 p-2.5 text-xs bg-slate-50/50">
                        <div>
                          <div className="font-bold text-slate-900 uppercase">{rew.rewardType} Payout</div>
                          <div className="text-slate-500 text-[11px] mt-0.5">{rew.reason}</div>
                        </div>
                        <div>
                          {rew.status === 'PENDING' ? (
                            <button
                              onClick={() => handleClaimReward(rew.id)}
                              className="rounded bg-indigo-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-indigo-700"
                            >
                              Claim & Issue
                            </button>
                          ) : (
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-800">
                              Issued
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE GOAL PANEL MODAL */}
      {isCreateGoalOpen && selectedRecruiter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Define Milestone Target</h3>
            <form onSubmit={handleCreateGoal} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Target Metric</label>
                <select
                  value={goalType}
                  onChange={(e) => setGoalType(e.target.value as any)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-xs focus:outline-none"
                >
                  <option value="JOINS">Joins (Successful Discord Entry)</option>
                  <option value="INTERVIEWS">Interviews Completed</option>
                  <option value="APPLICATIONS">Applications Sourced</option>
                  <option value="SUCCESSFUL_RECRUITMENT">Total Successful Recruitment Funnel</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Target Value</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={goalValue}
                  onChange={(e) => setGoalValue(parseInt(e.target.value))}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Target Expiry Date</label>
                <input
                  type="date"
                  required
                  value={goalEndAt}
                  onChange={(e) => setGoalEndAt(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-xs focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateGoalOpen(false)}
                  className="rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                >
                  Save Target
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE REWARD DIRECT MODAL */}
      {isCreateRewardOpen && selectedRecruiter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Direct Award Benefit</h3>
            <form onSubmit={handleCreateReward} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Reward Type</label>
                <select
                  value={rewType}
                  onChange={(e) => setRewType(e.target.value as any)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-xs focus:outline-none"
                >
                  <option value="BENEFIT">Benefit (In-game Role or Premium Item)</option>
                  <option value="ROLE">Discord Success Role</option>
                  <option value="POINTS">Loyalty Hub Points</option>
                  <option value="BONUS">Incentive Cash / Voucher Bonus</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Linked Candidate Application ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. app_123456"
                  value={rewAppId}
                  onChange={(e) => setRewAppId(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-xs focus:outline-none"
                />
                <p className="text-[10px] text-slate-400 mt-1">Application must have approved status to allow rewarding.</p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Fulfillment Reason</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sourced senior moderator join"
                  value={rewReason}
                  onChange={(e) => setRewReason(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2 text-xs focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateRewardOpen(false)}
                  className="rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                >
                  Establish Reward
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD RECRUITER NODE MODAL */}
      {isAddRecruiterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Users className="h-5 w-5 text-indigo-600" />
              Enroll Recruiter Node
            </h3>

            <form onSubmit={handleCreateRecruiter} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Discord Username / ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. alex_community"
                  value={newDiscordUser}
                  onChange={(e) => setNewDiscordUser(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2.5 text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Recruitment Responsibility</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  className="mt-1 w-full rounded border border-slate-300 p-2.5 text-xs focus:outline-none"
                >
                  <option value="RECRUITER">Standard Recruiter</option>
                  <option value="SENIOR_RECRUITER">Senior Recruiter</option>
                  <option value="REVIEWER">Screening Reviewer</option>
                  <option value="INTERVIEWER">Active Interviewer</option>
                  <option value="RECRUITMENT_MANAGER">Recruitment Lead / Manager</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Unique Referral Code</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ALEX-COMMUNITY"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  className="mt-1 w-full rounded font-mono border border-slate-300 p-2.5 text-xs uppercase focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddRecruiterOpen(false)}
                  className="rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                >
                  Save Recruiter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GENERATE REFERRAL LINK MODAL */}
      {isAddReferralOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Key className="h-5 w-5 text-indigo-600" />
              Generate Referral Code
            </h3>

            <form onSubmit={handleCreateReferral} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Select Recruiter Node</label>
                <select
                  required
                  value={refRecruiterId}
                  onChange={(e) => setRefRecruiterId(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2.5 text-xs focus:outline-none"
                >
                  <option value="">-- Choose Recruiter --</option>
                  {recruiters.map((rec) => (
                    <option key={rec.id} value={rec.id}>
                      {rec.displayNameSnapshot} ({rec.recruiterCode})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Referral Code Text</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. INBOUND-REDDIT-CAMPAIGN"
                  value={refCode}
                  onChange={(e) => setRefCode(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2.5 text-xs font-mono uppercase focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Sourcing Channel / Medium</label>
                <input
                  type="text"
                  required
                  value={refSource}
                  onChange={(e) => setRefSource(e.target.value)}
                  placeholder="e.g. DISCORD, REDDIT, TWITTER, GAME_LOBBY"
                  className="mt-1 w-full rounded border border-slate-300 p-2.5 text-xs focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase">Campaign Association (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Autumn Guild Expansion 2026"
                  value={refCampaignId}
                  onChange={(e) => setRefCampaignId(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-300 p-2.5 text-xs focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddReferralOpen(false)}
                  className="rounded border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700"
                >
                  Generate Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
