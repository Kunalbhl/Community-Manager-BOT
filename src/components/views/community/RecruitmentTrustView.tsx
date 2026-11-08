import React, { useState, useEffect } from 'react';
import { ChannelSelect } from '../../common/DiscordPickers.js';
import { MemberSelect } from '../../common/DiscordPickers.js';
import { RoleSelect } from '../../common/DiscordPickers.js';
import {
  ShieldAlert,
  UserCheck,
  Radio,
  HelpCircle,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Plus,
  Trash2,
  ExternalLink,
  Sliders,
  Bell,
  Award,
  Search,
  Key,
  Info,
} from 'lucide-react';
import { UserRole } from '../../../../shared/types/rbac.js';
import {
  DiscordCapabilityStatus,
  CommunityChannelAccess,
  RecruiterBenefit,
  ReferralLifecycleRecord,
  ApplicantRestriction,
  ApplicationQuestion,
  InterviewQuestion,
  CommunityGuideline,
  GoogleSheetsConfig,
  DiscordBotPermissionCheck,
  ChannelPurpose,
  RestrictionStatus,
  RecruiterRewardType,
  QuestionInputType,
} from '../../../../shared/types/models.js';

interface RecruitmentTrustViewProps {
  communityId: string;
  currentRole: UserRole;
  initialTab?: 'referrals' | 'blacklist' | 'channels' | 'questions' | 'sheets' | 'capabilities';
}

export const RecruitmentTrustView: React.FC<RecruitmentTrustViewProps> = ({
  communityId,
  currentRole,
  initialTab = 'referrals',
}) => {
  const [activeTab, setActiveTab] = useState<'referrals' | 'blacklist' | 'channels' | 'questions' | 'sheets' | 'capabilities'>(initialTab);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Data states
  const [referrals, setReferrals] = useState<ReferralLifecycleRecord[]>([]);
  const [benefits, setBenefits] = useState<RecruiterBenefit[]>([]);
  const [restrictions, setRestrictions] = useState<ApplicantRestriction[]>([]);
  const [channels, setChannels] = useState<CommunityChannelAccess[]>([]);
  const [appQuestions, setAppQuestions] = useState<ApplicationQuestion[]>([]);
  const [interviewQuestions, setInterviewQuestions] = useState<InterviewQuestion[]>([]);
  const [guidelines, setGuidelines] = useState<CommunityGuideline[]>([]);
  const [sheetsConfig, setSheetsConfig] = useState<GoogleSheetsConfig | null>(null);
  const [capabilities, setCapabilities] = useState<DiscordBotPermissionCheck[]>([]);

  // Forms / Interactivity states
  const [riskCheckDiscordId, setRiskCheckDiscordId] = useState('');
  const [riskCheckUsername, setRiskCheckUsername] = useState('');
  const [riskCheckResult, setRiskCheckResult] = useState<any | null>(null);

  const [newChannelId, setNewChannelId] = useState('');
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelPurpose, setNewChannelPurpose] = useState<ChannelPurpose>('APPLICATION');

  const [newBenefitName, setNewBenefitName] = useState('');
  const [newBenefitThreshold, setNewBenefitThreshold] = useState(1);
  const [newBenefitType, setNewBenefitType] = useState<RecruiterRewardType>('DISCORD_ROLE');
  const [newBenefitRoleId, setNewBenefitRoleId] = useState('');

  const [flagDiscordId, setFlagDiscordId] = useState('');
  const [flagUsername, setFlagUsername] = useState('');
  const [flagAliases, setFlagAliases] = useState('');
  const [flagStatus, setFlagStatus] = useState<RestrictionStatus>('BLACKLISTED');
  const [flagReason, setFlagReason] = useState('');

  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionType, setNewQuestionType] = useState<QuestionInputType>('SHORT_TEXT');

  const [syncingSheets, setSyncingSheets] = useState(false);

  // Load community trust data
  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Capabilities
      const capRes = await fetch('/api/v1/discord/capabilities');
      if (capRes.ok) {
        const capData = await capRes.json();
        setCapabilities(capData.data || []);
      }

      // 2. Channels
      const chanRes = await fetch(`/api/v1/community/channels?communityId=${communityId}`);
      if (chanRes.ok) {
        const chanData = await chanRes.json();
        setChannels(chanData.data || []);
      }

      // 3. Benefits
      const benRes = await fetch(`/api/v1/recruiter-benefits?communityId=${communityId}`);
      if (benRes.ok) {
        const benData = await benRes.json();
        setBenefits(benData.data || []);
      }

      // 4. Referrals
      const refRes = await fetch(`/api/v1/referrals/lifecycle?communityId=${communityId}`);
      if (refRes.ok) {
        const refData = await refRes.json();
        setReferrals(refData.data || []);
      }

      // 5. Restrictions
      const resRes = await fetch(`/api/v1/restrictions?communityId=${communityId}`);
      if (resRes.ok) {
        const resData = await resRes.json();
        setRestrictions(resData.data || []);
      }

      // 6. Questions
      const qRes = await fetch(`/api/v1/community/questions?communityId=${communityId}`);
      if (qRes.ok) {
        const qData = await qRes.json();
        setAppQuestions(qData.data?.applicationQuestions || []);
        setInterviewQuestions(qData.data?.interviewQuestions || []);
        setGuidelines(qData.data?.guidelines || []);
      }

      // 7. Sheets config
      const sheetRes = await fetch(`/api/v1/integrations/google-sheets?communityId=${communityId}`);
      if (sheetRes.ok) {
        const sheetData = await sheetRes.json();
        setSheetsConfig(sheetData.data || null);
      }
    } catch {
      // Error handling
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [communityId]);

  // Actions
  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelId.trim()) return;
    try {
      const res = await fetch('/api/v1/community/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          channelId: newChannelId.trim(),
          channelNameSnapshot: newChannelName.trim() || `channel-${newChannelId}`,
          purpose: newChannelPurpose,
          enabled: true,
        }),
      });
      if (res.ok) {
        setNotice({ type: 'success', message: 'Channel authorized for bot processing' });
        setNewChannelId('');
        setNewChannelName('');
        loadData();
      } else {
        const err = await res.json();
        setNotice({ type: 'error', message: err.error?.message || 'Failed to add channel' });
      }
    } catch {
      setNotice({ type: 'error', message: 'Network error configuring channel' });
    }
  };

  const handleRemoveChannel = async (channelId: string) => {
    try {
      const res = await fetch(`/api/v1/community/channels/${channelId}?communityId=${communityId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setNotice({ type: 'success', message: 'Channel removed from bot processing' });
        loadData();
      }
    } catch {
      setNotice({ type: 'error', message: 'Failed to remove channel' });
    }
  };

  const handleCreateBenefit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBenefitName.trim()) return;
    try {
      const res = await fetch('/api/v1/recruiter-benefits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          name: newBenefitName.trim(),
          description: `Reward tier for ${newBenefitThreshold} confirmed recruits`,
          threshold: newBenefitThreshold,
          rewardType: newBenefitType,
          discordRoleId: newBenefitRoleId.trim() || undefined,
          fulfillmentType: newBenefitType === 'DISCORD_ROLE' ? 'AUTOMATIC' : 'MANUAL',
          isActive: true,
        }),
      });
      if (res.ok) {
        setNotice({ type: 'success', message: 'Recruiter benefit tier created' });
        setNewBenefitName('');
        setNewBenefitRoleId('');
        loadData();
      }
    } catch {
      setNotice({ type: 'error', message: 'Failed to create benefit tier' });
    }
  };

  const handleConfirmMemberJoin = async (discordUserId: string) => {
    try {
      const res = await fetch('/api/v1/referrals/confirm-join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, discordUserId }),
      });
      if (res.ok) {
        setNotice({ type: 'success', message: 'Member join confirmed! Recruitment credited and benefits evaluated.' });
        loadData();
      } else {
        const err = await res.json();
        setNotice({ type: 'error', message: err.error?.message || 'Confirmation failed' });
      }
    } catch {
      setNotice({ type: 'error', message: 'Error confirming member join' });
    }
  };

  const handleFlagRestriction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!flagDiscordId.trim() || !flagReason.trim()) return;
    try {
      const aliasesArray = flagAliases
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);

      const res = await fetch('/api/v1/restrictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          discordUserId: flagDiscordId.trim(),
          currentUsernameSnapshot: flagUsername.trim() || 'Restricted User',
          gameNameAliases: aliasesArray,
          status: flagStatus,
          reason: flagReason.trim(),
        }),
      });
      if (res.ok) {
        setNotice({ type: 'success', message: `User restriction (${flagStatus}) recorded permanently by Discord ID.` });
        setFlagDiscordId('');
        setFlagUsername('');
        setFlagAliases('');
        setFlagReason('');
        loadData();
      } else {
        const err = await res.json();
        setNotice({ type: 'error', message: err.error?.message || 'Failed to record restriction' });
      }
    } catch {
      setNotice({ type: 'error', message: 'Error flagging user restriction' });
    }
  };

  const handleUnflag = async (restrictionId: string) => {
    try {
      const res = await fetch(`/api/v1/restrictions/${restrictionId}/unflag?communityId=${communityId}`, {
        method: 'POST',
      });
      if (res.ok) {
        setNotice({ type: 'success', message: 'Restriction cleared.' });
        loadData();
      }
    } catch {
      setNotice({ type: 'error', message: 'Failed to unflag user' });
    }
  };

  const handleCheckRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/restrictions/check-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          discordUserId: riskCheckDiscordId.trim(),
          username: riskCheckUsername.trim(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setRiskCheckResult(data.data);
      }
    } catch {
      setNotice({ type: 'error', message: 'Error running risk evaluation' });
    }
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim()) return;
    try {
      const res = await fetch('/api/v1/community/application-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          questionText: newQuestionText.trim(),
          type: newQuestionType,
          required: true,
          order: appQuestions.length + 1,
        }),
      });
      if (res.ok) {
        setNotice({ type: 'success', message: 'Question created' });
        setNewQuestionText('');
        loadData();
      }
    } catch {
      setNotice({ type: 'error', message: 'Failed to create question' });
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/community/application-questions/${id}?communityId=${communityId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setNotice({ type: 'success', message: 'Question deleted' });
        loadData();
      }
    } catch {
      setNotice({ type: 'error', message: 'Failed to delete question' });
    }
  };

  const handleSyncSheets = async () => {
    setSyncingSheets(true);
    try {
      const res = await fetch('/api/v1/integrations/google-sheets/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNotice({ type: 'success', message: data.message });
      } else {
        setNotice({ type: 'info', message: data.message || 'Google Sheets is not configured.' });
      }
      loadData();
    } catch {
      setNotice({ type: 'error', message: 'Network error attempting sync' });
    } finally {
      setSyncingSheets(false);
    }
  };

  const getStatusBadge = (status: DiscordCapabilityStatus | string) => {
    switch (status) {
      case 'AVAILABLE':
      case 'CONNECTED':
      case 'RECRUITMENT_SUCCESSFUL':
      case 'APPROVED':
      case 'CLEAR':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {status}
          </span>
        );
      case 'NOT_CONFIGURED':
      case 'PENDING':
      case 'UNDER_REVIEW':
      case 'SUBMITTED':
      case 'APPLICATION_SUBMITTED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
            <Info className="h-3.5 w-3.5" />
            {status}
          </span>
        );
      case 'PERMISSION_REQUIRED':
      case 'MANUAL_ACTION_REQUIRED':
      case 'CAUTION':
      case 'ADDITIONAL_INFO_REQUIRED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            {status}
          </span>
        );
      case 'BLACKLISTED':
      case 'DO_NOT_REAPPLY':
      case 'FAILED':
      case 'REJECTED':
      case 'DISCORD_LIMITATION':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
            <XCircle className="h-3.5 w-3.5" />
            {status}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div id="recruitment-trust-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              TRUST & RECRUITMENT ARCHITECTURE
            </span>
            <span className="rounded bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              DISCORD-NATIVE
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Community Trust & Recruitment System</h1>
          <p className="text-sm text-slate-500">
            Authoritative Discord ID tracking, channel allowlists, blacklist aliases, and transparent capability statuses.
          </p>
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Status
        </button>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          className={`flex items-center justify-between rounded-lg p-4 text-sm ${
            notice.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : notice.type === 'error'
              ? 'bg-rose-50 text-rose-800 border border-rose-200'
              : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
          }`}
        >
          <p>{notice.message}</p>
          <button onClick={() => setNotice(null)} className="font-semibold underline text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto gap-2">
        <button
          onClick={() => setActiveTab('referrals')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'referrals'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="flex items-center gap-2">
            <UserCheck className="h-4 w-4" />
            Referrals & Benefits ({referrals.length})
          </span>
        </button>

        <button
          onClick={() => setActiveTab('blacklist')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'blacklist'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            Blacklist & Aliases ({restrictions.length})
          </span>
        </button>

        <button
          onClick={() => setActiveTab('channels')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'channels'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Channel Allowlist ({channels.length})
          </span>
        </button>

        <button
          onClick={() => setActiveTab('questions')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'questions'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4" />
            Questions & Rules ({appQuestions.length})
          </span>
        </button>

        <button
          onClick={() => setActiveTab('sheets')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'sheets'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Google Sheets
          </span>
        </button>

        <button
          onClick={() => setActiveTab('capabilities')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'capabilities'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Capabilities Matrix
          </span>
        </button>
      </div>

      {/* TAB 1: REFERRALS & BENEFITS */}
      {activeTab === 'referrals' && (
        <div className="space-y-6">
          {/* Benefit Tiers Configuration */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Award className="h-5 w-5 text-indigo-600" />
              Recruiter Rewards & Milestone Tiers
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Configure rewards (Discord roles, perks, points) unlocked when recruiters achieve verified successful recruits.
            </p>

            <form onSubmit={handleCreateBenefit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Tier Name</label>
                <input
                  type="text"
                  placeholder="e.g. Veteran Recruiter"
                  value={newBenefitName}
                  onChange={(e) => setNewBenefitName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Recruitment Threshold</label>
                <input
                  type="number"
                  min="1"
                  value={newBenefitThreshold}
                  onChange={(e) => setNewBenefitThreshold(parseInt(e.target.value, 10))}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Reward Type</label>
                <select
                  value={newBenefitType}
                  onChange={(e) => setNewBenefitType(e.target.value as any)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm bg-white"
                >
                  <option value="DISCORD_ROLE">Discord Role Assignment</option>
                  <option value="SPECIAL_CHANNEL">Special Channel Access</option>
                  <option value="CUSTOM_PERK">Custom Community Perk</option>
                  <option value="POINTS">Community Points / XP</option>
                </select>
              </div>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-700">Discord Role ID (Optional)</label>
                  <RoleSelect className="mt-1" value={newBenefitRoleId} onChange={setNewBenefitRoleId} />
                </div>
                <button
                  type="submit"
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Add Tier
                </button>
              </div>
            </form>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {benefits.length === 0 ? (
                <div className="col-span-3 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  No recruiter benefit tiers configured yet.
                </div>
              ) : (
                benefits.map((b) => (
                  <div key={b.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                        {b.threshold} Recruit(s)
                      </span>
                      {getStatusBadge(b.fulfillmentType === 'AUTOMATIC' ? 'AVAILABLE' : 'MANUAL_ACTION_REQUIRED')}
                    </div>
                    <h3 className="mt-1 font-semibold text-slate-900">{b.name}</h3>
                    <p className="mt-1 text-xs text-slate-500">{b.description}</p>
                    {b.discordRoleId && (
                      <p className="mt-2 text-xs font-mono text-slate-600 bg-slate-50 p-1.5 rounded">
                        Role ID: {b.discordRoleId}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Referral Lifecycle Tracking */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Key className="h-5 w-5 text-indigo-600" />
              Referral Lifecycle & Confirmation
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Referrals track from code submission through review, approval, and actual server join.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Applicant (Discord ID)</th>
                    <th className="px-4 py-3">Recruiter (Discord ID)</th>
                    <th className="px-4 py-3">Recruiter Code</th>
                    <th className="px-4 py-3">Lifecycle Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {referrals.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-500">
                        No referrals recorded. All records are created from real application submissions.
                      </td>
                    </tr>
                  ) : (
                    referrals.map((ref) => (
                      <tr key={ref.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{ref.applicantUsernameSnapshot}</div>
                          <div className="font-mono text-xs text-slate-500">{ref.applicantDiscordId}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-mono text-xs text-slate-700">{ref.recruiterDiscordId}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-indigo-600">{ref.recruiterCode}</span>
                        </td>
                        <td className="px-4 py-3">{getStatusBadge(ref.lifecycleStatus)}</td>
                        <td className="px-4 py-3">
                          {ref.lifecycleStatus === 'APPROVED' && (
                            <button
                              onClick={() => handleConfirmMemberJoin(ref.applicantDiscordId)}
                              className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                            >
                              Confirm Join
                            </button>
                          )}
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

      {/* TAB 2: BLACKLIST & APPLICANT RESTRICTIONS */}
      {activeTab === 'blacklist' && (
        <div className="space-y-6">
          {/* Live Risk Check Diagnostic */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Search className="h-5 w-5 text-indigo-600" />
              Applicant Risk & Alias Scanner
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Evaluates incoming candidate credentials against permanent Discord User IDs and known game aliases.
            </p>

            <form onSubmit={handleCheckRisk} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Discord User ID</label>
                <div className="mt-1"><MemberSelect value={riskCheckDiscordId} onChange={(id) => setRiskCheckDiscordId(id)} /></div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Username or Game Name Alias</label>
                <input
                  type="text"
                  placeholder="e.g. GamerTag99"
                  value={riskCheckUsername}
                  onChange={(e) => setRiskCheckUsername(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
                >
                  Scan Records
                </button>
              </div>
            </form>

            {riskCheckResult && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase">Match Result</span>
                  {getStatusBadge(riskCheckResult.riskStatus)}
                </div>
                {riskCheckResult.alertBanner ? (
                  <p className="mt-2 text-sm font-medium text-rose-800 bg-rose-50 p-2.5 rounded border border-rose-200">
                    {riskCheckResult.alertBanner}
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-emerald-800 bg-emerald-50 p-2.5 rounded border border-emerald-200">
                    CLEAR: No restriction records found for this candidate.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Add Restriction Form */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-600" />
              Flag User Restriction (Permanent Discord ID)
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Restrictions are authoritatively keyed by Discord User ID to ensure identity tracking remains resilient against username changes.
            </p>

            <form onSubmit={handleFlagRestriction} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Discord User ID (Authoritative Primary ID) *
                </label>
                <div className="mt-1"><MemberSelect value={flagDiscordId} onChange={(id) => setFlagDiscordId(id)} /></div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Username Snapshot</label>
                <input
                  type="text"
                  placeholder="e.g. DisciplinaryUser"
                  value={flagUsername}
                  onChange={(e) => setFlagUsername(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Game Name Aliases (Comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. MrTechnicalGamer, Shadow, Kunal"
                  value={flagAliases}
                  onChange={(e) => setFlagAliases(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Restriction Status</label>
                <select
                  value={flagStatus}
                  onChange={(e) => setFlagStatus(e.target.value as any)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="BLACKLISTED">BLACKLISTED (Disqualified & Blocked)</option>
                  <option value="DO_NOT_REAPPLY">DO_NOT_REAPPLY (Reapplication Prohibited)</option>
                  <option value="CAUTION">CAUTION (Requires Senior Admin Review)</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">Reason & Incident Evidence *</label>
                <textarea
                  rows={2}
                  placeholder="Detailed justification for permanent record..."
                  value={flagReason}
                  onChange={(e) => setFlagReason(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>

              <div className="sm:col-span-2 flex justify-end">
                <button
                  type="submit"
                  className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
                >
                  Record Restriction
                </button>
              </div>
            </form>
          </div>

          {/* Active Restrictions Table */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Active Restriction Directory</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Discord ID (Authoritative)</th>
                    <th className="px-4 py-3">Username & Known Aliases</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Enforcement Note</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {restrictions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500">
                        No restricted users on file.
                      </td>
                    </tr>
                  ) : (
                    restrictions.map((res) => (
                      <tr key={res.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                          {res.discordUserId}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{res.currentUsernameSnapshot}</div>
                          {res.gameNameAliases?.length > 0 && (
                            <div className="text-xs text-slate-500">
                              Aliases: {res.gameNameAliases.join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">{getStatusBadge(res.status)}</td>
                        <td className="px-4 py-3 text-xs text-slate-600 max-w-xs">{res.reason}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{res.discordEnforcementStatus}</td>
                        <td className="px-4 py-3">
                          {res.status !== 'CLEAR' && (
                            <button
                              onClick={() => handleUnflag(res.id)}
                              className="text-xs font-medium text-slate-600 hover:text-slate-900 underline"
                            >
                              Clear Flag
                            </button>
                          )}
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

      {/* TAB 3: CHANNEL ALLOWLIST */}
      {activeTab === 'channels' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <Radio className="h-5 w-5 text-indigo-600" />
              Authorized Discord Channel Allowlist
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              The bot is strictly prohibited from reading or listening to channels that are not explicitly authorized by the community owner.
            </p>

            <form onSubmit={handleAddChannel} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Discord Channel ID *</label>
                <ChannelSelect className="mt-1" value={newChannelId} onChange={(v) => { setNewChannelId(v); }} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Channel Name Snapshot</label>
                <input
                  type="text"
                  placeholder="e.g. application-intake"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Purpose</label>
                <select
                  value={newChannelPurpose}
                  onChange={(e) => setNewChannelPurpose(e.target.value as any)}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm bg-white"
                >
                  <option value="APPLICATION">APPLICATION (Intake & Submissions)</option>
                  <option value="RECRUITMENT">RECRUITMENT (Recruiter Bot Commands)</option>
                  <option value="INTERVIEW">INTERVIEW (Stage Questions & Transcripts)</option>
                  <option value="BLACKLIST">BLACKLIST (Operational Alerts & Audit)</option>
                  <option value="SUPPORT">SUPPORT (Applicant Questions)</option>
                  <option value="ANNOUNCEMENTS">ANNOUNCEMENTS (Community Updates)</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Authorize Channel
                </button>
              </div>
            </form>

            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Channel Name</th>
                    <th className="px-4 py-3">Channel ID</th>
                    <th className="px-4 py-3">Designated Purpose</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {channels.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-500">
                        No channels authorized. Bot will not process messages in any guild channel until explicitly allowlisted.
                      </td>
                    </tr>
                  ) : (
                    channels.map((chan) => (
                      <tr key={chan.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-900">#{chan.channelNameSnapshot}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{chan.channelId}</td>
                        <td className="px-4 py-3">
                          <span className="rounded bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                            {chan.purpose}
                          </span>
                        </td>
                        <td className="px-4 py-3">{getStatusBadge(chan.enabled ? 'AVAILABLE' : 'NOT_CONFIGURED')}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleRemoveChannel(chan.channelId)}
                            className="text-rose-600 hover:text-rose-800"
                            title="Remove authorization"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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

      {/* TAB 4: QUESTIONS & GUIDELINES */}
      {activeTab === 'questions' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-indigo-600" />
              Configurable Application Questions
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Customize questions presented to applicants during Discord modal/intake workflows.
            </p>

            <form onSubmit={handleCreateQuestion} className="mt-4 flex gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <input
                type="text"
                placeholder="e.g. What is your primary gaming handle and previous competitive experience?"
                value={newQuestionText}
                onChange={(e) => setNewQuestionText(e.target.value)}
                className="flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                required
              />

              <select
                value={newQuestionType}
                onChange={(e) => setNewQuestionType(e.target.value as any)}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm bg-white"
              >
                <option value="SHORT_TEXT">Short Text (Single-line)</option>
                <option value="LONG_TEXT">Long Text (Paragraph)</option>
                <option value="YES_NO">Yes / No</option>
              </select>

              <button
                type="submit"
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Add Question
              </button>
            </form>

            <div className="mt-4 space-y-3">
              {appQuestions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                  No custom application questions configured. Default intake fields apply.
                </div>
              ) : (
                appQuestions.map((q, idx) => (
                  <div key={q.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 bg-white">
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-medium text-slate-900">{q.questionText}</span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{q.type}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteQuestion(q.id)}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: GOOGLE SHEETS */}
      {activeTab === 'sheets' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                  Google Sheets Synchronizer
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Optional two-way structured export. Clear status indicator prevents false sync representations.
                </p>
              </div>
              <div>{getStatusBadge(sheetsConfig?.lastSyncStatus || 'NOT_CONFIGURED')}</div>
            </div>

            <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase">Integration Status</span>
                  <p className="mt-1 font-semibold text-slate-900">
                    {sheetsConfig?.configured ? 'Connected to Google Sheets API' : 'Not Configured (Optional)'}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase">Last Sync Timestamp</span>
                  <p className="mt-1 font-mono text-sm text-slate-700">
                    {sheetsConfig?.lastSyncTime ? new Date(sheetsConfig.lastSyncTime).toLocaleString() : 'Never synced'}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleSyncSheets}
                  disabled={syncingSheets}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${syncingSheets ? 'animate-spin' : ''}`} />
                  {syncingSheets ? 'Synchronizing...' : 'Sync Applications Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: CAPABILITIES MATRIX */}
      {activeTab === 'capabilities' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-indigo-600" />
              Discord Capability & Permissions Matrix
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Clear breakdown of what Discord permits automated bot execution for versus actions requiring manual server administrator intervention.
            </p>

            <div className="mt-6 space-y-3">
              {capabilities.map((cap, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 p-4 bg-white">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-slate-900">{cap.permissionName}</h3>
                      <p className="text-xs text-slate-500">{cap.requiredFor}</p>
                    </div>
                    <div>{getStatusBadge(cap.status)}</div>
                  </div>
                  <p className="mt-2 text-xs text-slate-600 bg-slate-50 p-2 rounded">
                    <strong>Guidance:</strong> {cap.resolutionGuidance}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
