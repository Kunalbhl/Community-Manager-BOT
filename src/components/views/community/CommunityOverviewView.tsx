import React, { useState, useEffect } from 'react';
import {
  FileText,
  Clock,
  UserCheck,
  Award,
  Plus,
  RefreshCw,
  CheckCircle,
  XCircle,
  Video,
  Radio,
  Share2,
  Copy,
  Send,
  Zap,
  ShieldCheck,
  TrendingUp,
  Activity,
  X,
  Server,
  Sparkles,
  AlertTriangle,
  Cpu,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  ChevronRight,
  Users,
  Calendar,
  AlertCircle,
  Settings,
  Shield,
  Layers,
  HelpCircle,
  AlertOctagon,
  Link2,
  Info,
} from 'lucide-react';
import { UserRole } from '../../../../shared/types/rbac.js';
import { LoadingSkeleton } from '../../common/LoadingSkeleton.js';
import { DashboardWidget } from './DashboardWidget.js';
import { getDiscordLoginUrl } from '../../../lib/discordUrls.js';

interface AttentionSignal {
  id: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  description: string;
  category: string;
  affectedArea?: string;
  requiredAction?: string;
  actionText?: string;
  targetSection?: string;
}

interface CommandCenterData {
  community: {
    id: string;
    name: string;
    guildId: string;
    connectionStatus: string;
    createdAt: string;
    plan: string;
    usage: any;
  };
  serverHealth: {
    gateway?: {
      state: string;
      pingMs?: number;
    };
    guild?: {
      status: string;
      guildId?: string;
      guildName?: string;
      memberCount?: number;
      botPresent?: boolean;
      error?: string;
    };
    permissions?: Array<{
      permissionName: string;
      requiredFor: string;
      granted: boolean;
      status: string;
      resolutionGuidance: string;
    }>;
    channels?: Array<{
      channelId: string;
      purpose: string;
      status: string;
      channelName?: string;
      canView?: boolean;
      canSendMessages?: boolean;
      details?: string;
    }>;
    role?: {
      status: string;
      roleId?: string;
      roleName?: string;
      isManagedByBot?: boolean;
      details?: string;
    };
    commands?: {
      status: string;
      commands: Array<{ name: string; description: string; registered: boolean }>;
      totalCommands: number;
    };
    overallHealth: 'HEALTHY' | 'ACTION_REQUIRED' | 'DEGRADED' | 'NOT_CONFIGURED';
  } | null;
  needsAttention: {
    status: 'OPTIMAL' | 'DEGRADED' | 'CRITICAL';
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    signals: AttentionSignal[];
  } | null;
  today: {
    events: Array<{
      id: string;
      title: string;
      scheduledAt: string;
      status: string;
      type: string;
    }>;
    reminders: any[];
    activeAutomations: any[];
  };
  memberActivity: {
    totalMembers: number;
    activeMembers: number;
    list: Array<{
      id: string;
      username: string;
      discordUserId: string;
      membershipStatus: string;
      joinedAt?: string;
    }>;
  };
  workload: {
    pendingApplications: number;
    totalApplications: number;
    activeRecruiters: number;
    scheduledInterviews: number;
    activeCodes?: number;
  };
  engagement: {
    activeCampaigns: number;
    activePolls: number;
    pendingAnnouncements: number;
  };
  moderationSafety: {
    activeWarnings: number;
    unresolvedIncidents: number;
  };
  integrations: {
    status: string;
    sections?: Array<{
      provider: string;
      title: string;
      status: string;
      error?: string;
      capabilitiesEnabled?: string[];
    }>;
  } | null;
  notifications: Array<{
    id: string;
    title: string;
    description: string;
    timestamp: string;
    read?: boolean;
  }>;
  recommendations: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    impact: string;
    effort: string;
    suggestedAction?: string | { actionType: string; targetModule: string; parameters?: Record<string, unknown> };
    actionType?: string;
  }>;
  freshness: string;
}

interface CommunityOverviewViewProps {
  currentRole: UserRole;
  communityId: string;
  onNavigate: (section: string) => void;
}

export const CommunityOverviewView: React.FC<CommunityOverviewViewProps> = ({
  currentRole,
  communityId,
  onNavigate,
}) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'health' | 'operations'>('overview');

  // Quick Action Modals
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);

  // Form States
  const [applicantUsername, setApplicantUsername] = useState('');
  const [applicantDiscordId, setApplicantDiscordId] = useState('');
  const [recruiterCode, setRecruiterCode] = useState('');
  const [newCodeName, setNewCodeName] = useState('');
  const [recruiterUserId, setRecruiterUserId] = useState('');

  const [authError, setAuthError] = useState<string | null>(null);

  const fetchCommandCenterData = async () => {
    if (!communityId) {
      return;
    }

    if (currentRole === 'APPLICANT') {
      setLoading(false);
      setAuthError('Discord Guild Owner/Manager authorization required to load Command Center analytics.');
      return;
    }

    setLoading(true);
    setAuthError(null);
    try {
      const headers = {
        'x-role': currentRole,
        'x-user-role': currentRole,
        'x-community-id': communityId,
      };

      const res = await fetch(`/api/v1/community/${communityId}/command-center`, {
        credentials: 'include',
        headers,
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setData(json);
        }
      } else if (res.status === 401 || res.status === 403) {
        setAuthError('Discord Guild Owner/Manager authorization required to load Command Center analytics.');
      }
    } catch (err) {
      console.warn('Command Center data fetch deferred:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommandCenterData();
  }, [communityId, currentRole]);

  const handleCopyPortalLink = () => {
    const url = `${window.location.origin}/apply/${communityId}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setActionFeedback('Applicant Portal link copied!');
    setTimeout(() => {
      setCopiedLink(false);
      setActionFeedback(null);
    }, 3000);
  };

  const handleSubmitApp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          communityId,
          applicantUsername,
          applicantDiscordId,
          recruiterCodeUsed: recruiterCode || undefined,
        }),
      });
      if (res.ok) {
        setShowSubmitModal(false);
        setApplicantUsername('');
        setApplicantDiscordId('');
        setRecruiterCode('');
        setActionFeedback('Application successfully submitted!');
        fetchCommandCenterData();
      }
    } catch (err) {
      console.error('Failed to submit app', err);
    }
  };

  const handleCreateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/v1/recruiter-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          communityId,
          code: newCodeName.toUpperCase(),
          recruiterUserId,
        }),
      });
      if (res.ok) {
        setShowCodeModal(false);
        setNewCodeName('');
        setRecruiterUserId('');
        setActionFeedback('Recruiter referral code generated!');
        fetchCommandCenterData();
      }
    } catch (err) {
      console.error('Failed to create recruiter code', err);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-32 bg-slate-100 rounded-2xl animate-pulse flex items-center justify-center text-slate-400 font-medium">
          Loading your server overview…
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-48 bg-slate-50 border border-slate-100 rounded-xl animate-pulse" />
          <div className="h-48 bg-slate-50 border border-slate-100 rounded-xl animate-pulse" />
          <div className="h-48 bg-slate-50 border border-slate-100 rounded-xl animate-pulse" />
        </div>
        <LoadingSkeleton type="card" count={3} />
      </div>
    );
  }

  const roleLabel =
    currentRole === 'PLATFORM_OWNER' || currentRole === 'OWNER'
      ? 'Server Owner Command Center'
      : currentRole === 'CONTROLLER'
      ? 'Operations Controller Hub'
      : currentRole === 'INTERVIEWER'
      ? 'Interviewer Desk'
      : currentRole === 'RECRUITER'
      ? 'Recruiter Partner Hub'
      : 'Member Portal';

  const comm = data?.community;
  const health = data?.serverHealth;
  const attention = data?.needsAttention;
  const todayOps = data?.today;
  const members = data?.memberActivity;
  const workloadMetrics = data?.workload;
  const engageMetrics = data?.engagement;
  const safetyMetrics = data?.moderationSafety;
  const integrationsInfo = data?.integrations;
  const alerts = data?.notifications || [];
  const recs = data?.recommendations || [];

  return (
    <div id="discord-community-operations-command-center" className="space-y-6">
      {authError && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 font-bold">⚠️</span>
            <div>
              <p className="text-sm font-semibold">Discord Authorization Required</p>
              <p className="text-xs text-amber-700">{authError}</p>
            </div>
          </div>
          <button
            onClick={() => {
              window.location.href = getDiscordLoginUrl();
            }}
            className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 transition"
          >
            Connect Discord
          </button>
        </div>
      )}

      {/* 1. TOP HEADER PANEL */}
      <div className="rounded-2xl border border-slate-200 bg-linear-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-extrabold text-2xl tracking-tight text-white">
                {comm?.name || 'Discord Community Operations'}
              </span>
              <span className="rounded-md bg-indigo-500/20 px-2.5 py-1 font-mono text-xs text-indigo-300 border border-indigo-500/30 font-bold">
                {roleLabel}
              </span>
              <span className="rounded-md bg-slate-500/20 px-2.5 py-1 font-mono text-xs text-slate-300 border border-slate-500/20 font-medium">
                Plan: {comm?.plan || 'PRO'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-1.5 text-xs text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${comm?.connectionStatus === 'CONNECTED' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                Discord Status: <strong className="text-white">{comm?.connectionStatus || 'OFFLINE'}</strong>
              </span>
              {health?.guild?.guildName && (
                <span className="inline-flex items-center gap-1">
                  <Server className="h-3.5 w-3.5 text-indigo-400" />
                  Connected Server: <strong className="text-white">{health.guild.guildName}</strong>
                </span>
              )}
              {health?.guild?.memberCount !== undefined && (
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-indigo-400" />
                  Guild Members: <strong className="text-white">{health.guild.memberCount}</strong>
                </span>
              )}
            </div>
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={fetchCommandCenterData}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
              title="Refresh Command Center Data"
            >
              <RefreshCw className="h-3.5 w-3.5 text-indigo-400" />
              Refresh
            </button>

            {(currentRole === 'OWNER' || currentRole === 'PLATFORM_OWNER' || currentRole === 'CONTROLLER') && (
              <>
                <button
                  onClick={() => setShowSubmitModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-md hover:bg-indigo-500 transition cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Test Application
                </button>
                <button
                  onClick={() => setShowCodeModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
                >
                  <Share2 className="h-4 w-4 text-indigo-400" />
                  Generate Referral Code
                </button>
              </>
            )}

            <button
              onClick={handleCopyPortalLink}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
            >
              <Copy className="h-3.5 w-3.5 text-indigo-400" />
              {copiedLink ? 'Copied Link!' : 'Copy Portal Link'}
            </button>
          </div>
        </div>
      </div>

      {actionFeedback && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3.5 text-xs font-bold text-indigo-900 flex items-center justify-between shadow-xs">
          <span className="flex items-center gap-1.5">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            {actionFeedback}
          </span>
          <button onClick={() => setActionFeedback(null)} className="underline text-indigo-700 font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* VIEW SELECTOR TABS */}
      <div className="border-b border-slate-200 pb-px flex items-center gap-6">
        <button
          onClick={() => setActiveTab('overview')}
          className={`pb-3 text-sm font-bold border-b-2 transition relative ${activeTab === 'overview' ? 'text-indigo-600 border-indigo-600' : 'text-slate-500 border-transparent hover:text-slate-800'}`}
        >
          Operations Overview
        </button>
        <button
          onClick={() => setActiveTab('health')}
          className={`pb-3 text-sm font-bold border-b-2 transition relative ${activeTab === 'health' ? 'text-indigo-600 border-indigo-600' : 'text-slate-500 border-transparent hover:text-slate-800'}`}
        >
          Discord Server Diagnostics
        </button>
        <button
          onClick={() => setActiveTab('operations')}
          className={`pb-3 text-sm font-bold border-b-2 transition relative ${activeTab === 'operations' ? 'text-indigo-600 border-indigo-600' : 'text-slate-500 border-transparent hover:text-slate-800'}`}
        >
          Daily Workload & Integrations
        </button>
      </div>

      {/* TAB CONTENT: 1. OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* REAL-TIME PULSE DASHBOARD WIDGET */}
          <DashboardWidget communityId={communityId} onNavigate={onNavigate} />

          {/* NEEDS ATTENTION ACTION ENGINE BLOCK */}
          {attention && attention.signals && attention.signals.length > 0 && (
            <div className="rounded-xl border border-rose-100 bg-rose-50/30 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-rose-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-rose-50 border border-rose-200">
                    <AlertTriangle className="h-5 w-5 text-rose-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Priority Action Panel</h2>
                    <p className="text-xs text-slate-500">Unresolved operational signals requiring intervention</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-rose-100 px-3 py-1 font-mono text-xs font-bold text-rose-700">
                    {attention.signals.length} Active Signals
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {attention.signals.map((item) => {
                  const priorityBg =
                    item.priority === 'CRITICAL' || item.priority === 'HIGH'
                      ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                      : 'bg-amber-50/80 border-amber-200 text-amber-900';

                  return (
                    <div
                      key={item.id}
                      className={`rounded-lg border p-4 text-xs flex flex-col justify-between gap-3 transition hover:shadow-xs ${priorityBg}`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold uppercase tracking-wider text-[10px] opacity-75">
                            {item.category || item.affectedArea || 'General Alert'}
                          </span>
                          <span className="font-mono text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-black/5">
                            {item.priority}
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-900">{item.title}</h4>
                        <p className="text-slate-600 leading-relaxed font-medium">{item.description}</p>
                      </div>

                      {item.requiredAction && (
                        <div className="border-t border-black/5 pt-2.5 text-slate-700 font-medium">
                          <strong>Recommended:</strong> {item.requiredAction}
                        </div>
                      )}

                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => {
                            if (item.targetSection) {
                              onNavigate(item.targetSection);
                            } else {
                              onNavigate('dashboard');
                            }
                          }}
                          className="inline-flex items-center gap-1 font-extrabold text-indigo-700 hover:text-indigo-900 cursor-pointer"
                        >
                          {item.actionText || 'Take Action'}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* QUICK SUMMARY CARD GRID (BENTO MINIS) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div
              onClick={() => onNavigate('recruitment')}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between h-32 hover:border-indigo-400 transition cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Recruitment</span>
                <FileText className="h-5 w-5 text-indigo-500" />
              </div>
              <div>
                <div className="text-2xl font-black text-slate-900">{workloadMetrics?.pendingApplications || 0}</div>
                <div className="text-xs text-slate-500 font-medium">Pending Join Applications</div>
              </div>
            </div>

            <div
              onClick={() => onNavigate('members')}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between h-32 hover:border-indigo-400 transition cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Directory</span>
                <Users className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <div className="text-2xl font-black text-slate-900">{members?.totalMembers || 0}</div>
                <div className="text-xs text-slate-500 font-medium">Synced Community Members</div>
              </div>
            </div>

            <div
              onClick={() => onNavigate('engagement')}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between h-32 hover:border-indigo-400 transition cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Engagement</span>
                <Activity className="h-5 w-5 text-sky-500" />
              </div>
              <div>
                <div className="text-2xl font-black text-slate-900">{engageMetrics?.activeCampaigns || 0}</div>
                <div className="text-xs text-slate-500 font-medium">Active Engagement Campaigns</div>
              </div>
            </div>

            <div
              onClick={() => onNavigate('moderation')}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between h-32 hover:border-indigo-400 transition cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Safety & Moderation</span>
                <Shield className="h-5 w-5 text-rose-500" />
              </div>
              <div>
                <div className="text-2xl font-black text-slate-900">{safetyMetrics?.unresolvedIncidents || 0}</div>
                <div className="text-xs text-slate-500 font-medium">Unresolved Incidents</div>
              </div>
            </div>
          </div>

          {/* COMMUNITY BRAIN COGNITIVE ADVICE COLUMN */}
          {recs && recs.length > 0 && (
            <div className="rounded-xl border border-indigo-100 bg-linear-to-b from-indigo-50/50 to-white p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-indigo-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-indigo-50 border border-indigo-100">
                    <Sparkles className="h-5 w-5 text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Community Brain Insights</h2>
                    <p className="text-xs text-slate-500">Algorithmic and AI strategic recommendations for your server</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {recs.map((rec) => (
                  <div
                    key={rec.id}
                    className="rounded-lg border border-slate-200 bg-white p-4 text-xs flex flex-col justify-between gap-4 hover:shadow-md transition"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-sm bg-indigo-100 text-indigo-700">
                          {rec.category || 'OPERATION'}
                        </span>
                        <span className="font-semibold text-slate-500">
                          Impact: <strong className="text-indigo-600">{rec.impact}</strong>
                        </span>
                      </div>
                      <h4 className="font-bold text-slate-900 leading-snug">{rec.title}</h4>
                      <p className="text-slate-600 leading-relaxed font-medium">{rec.description}</p>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                      <span className="text-[10px] text-slate-500">
                        Effort: <strong>{rec.effort}</strong>
                      </span>
                      {rec.suggestedAction && (
                        <button
                          onClick={() => {
                            const isGuided = rec.actionType === 'GUIDED_SETUP' || 
                              (typeof rec.suggestedAction === 'object' && rec.suggestedAction !== null && rec.suggestedAction.actionType === 'GUIDED_SETUP');
                            if (isGuided) {
                              onNavigate('community-config');
                            } else {
                              setActionFeedback(`Triggering: ${rec.title}`);
                              setTimeout(() => setActionFeedback(null), 3000);
                            }
                          }}
                          className="rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition cursor-pointer"
                        >
                          {typeof rec.suggestedAction === 'object' && rec.suggestedAction !== null
                            ? (rec.suggestedAction as any).actionType
                            : String(rec.suggestedAction)}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TWO COLUMN DETAILS SUMMARY */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* RECENT NOTIFICATIONS & SYSTEM EVENTS */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Recent Alerts & Communications</h3>
                <span className="text-xs text-slate-500 font-medium">{alerts.length} Registered</span>
              </div>

              {alerts.length > 0 ? (
                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto pr-1">
                  {alerts.map((alert) => (
                    <div key={alert.id} className="py-3 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-slate-900">{alert.title}</h4>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(alert.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-slate-600 font-medium">{alert.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400 font-medium">
                  No active operational alerts or recent messages.
                </div>
              )}
            </div>

            {/* MEMBER ACTIVITY OVERVIEW */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Active Server Cohort</h3>
                <button
                  onClick={() => onNavigate('members')}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                >
                  View Directory
                </button>
              </div>

              {members && members.list && members.list.length > 0 ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="rounded-lg bg-slate-50 p-2.5">
                      <div className="text-sm font-bold text-slate-900">{members.totalMembers}</div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-extrabold">Total Synced</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-2.5">
                      <div className="text-sm font-bold text-emerald-600">{members.activeMembers}</div>
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider font-extrabold">Active Status</div>
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto pr-1">
                    {members.list.slice(0, 5).map((member) => (
                      <div key={member.id} className="py-2.5 text-xs flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center font-bold text-[10px] text-indigo-700">
                            {member.username ? member.username[0].toUpperCase() : 'U'}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900">{member.username}</span>
                            <span className="block text-[9px] text-slate-400 font-mono">{member.discordUserId}</span>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-sm font-mono text-[9px] font-bold ${member.membershipStatus === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                          {member.membershipStatus}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400 font-medium">
                  No directory synchronized yet. Link your Discord server or run member sync.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: 2. SERVER DIAGNOSTICS */}
      {activeTab === 'health' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h3 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100">
              Capability & Bot Permissions Matrix
            </h3>

            {health?.permissions && health.permissions.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {health.permissions.map((p, idx) => (
                  <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 text-xs flex items-start gap-3">
                    <div className="mt-0.5">
                      {p.granted ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                      ) : (
                        <ShieldAlert className="h-5 w-5 text-rose-500 shrink-0" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-slate-900">{p.permissionName}</h4>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold ${p.granted ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                          {p.status || (p.granted ? 'GRANTED' : 'MISSING')}
                        </span>
                      </div>
                      <p className="text-slate-500 font-semibold">{p.requiredFor}</p>
                      {!p.granted && p.resolutionGuidance && (
                        <p className="text-rose-700 bg-rose-50 p-2 rounded-sm border border-rose-100 font-medium text-[11px] mt-1 leading-normal">
                          <strong>Resolution:</strong> {p.resolutionGuidance}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-400 font-medium">
                No active permission matrix loaded. Check your server settings or configuration file.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CHANNEL SECURITY & STATUS MATRIX */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100">
                Core Operations Channel Matrix
              </h3>

              {health?.channels && health.channels.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {health.channels.map((chan, idx) => (
                    <div key={idx} className="py-3 text-xs flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">#{chan.channelName || chan.channelId}</span>
                          <span className="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[9px] font-extrabold text-indigo-700">
                            {chan.purpose}
                          </span>
                        </div>
                        {chan.details && <span className="block text-[10px] text-slate-400 mt-0.5 font-medium">{chan.details}</span>}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded-sm font-mono text-[9px] font-extrabold ${chan.status === 'VALID' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {chan.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400 font-medium">
                  No active channels configured. Run guided setup to automatically deploy Discord channels.
                </div>
              )}
            </div>

            {/* MEMBER ROLE HIERARCHY & SLASH COMMANDS */}
            <div className="space-y-6">
              {/* MEMBER ROLE CONFIG */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <h3 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100">
                  Onboarding Member Role
                </h3>

                {health?.role ? (
                  <div className="text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-semibold">Configured Role:</span>
                      <strong className="text-slate-950 font-bold">{health.role.roleName || 'Unconfigured'}</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-semibold">Verification State:</span>
                      <span className={`px-2 py-0.5 rounded-sm font-mono text-[9px] font-extrabold ${health.role.status === 'ROLE_READY' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {health.role.status}
                      </span>
                    </div>
                    {health.role.details && (
                      <p className="bg-slate-50 p-2.5 rounded-lg text-slate-600 border border-slate-100 leading-normal font-medium text-[11px]">
                        {health.role.details}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400 font-medium">
                    No onboarding role verification loaded.
                  </div>
                )}
              </div>

              {/* SLASH COMMANDS */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                <h3 className="text-base font-bold text-slate-900 pb-2 border-b border-slate-100">
                  Slash Commands Registration
                </h3>

                {health?.commands ? (
                  <div className="text-xs space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-semibold">Total Commands:</span>
                      <strong className="text-slate-950 font-extrabold">{health.commands.totalCommands} Registered</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-semibold">Status:</span>
                      <span className={`px-2 py-0.5 rounded-sm font-mono text-[9px] font-extrabold ${health.commands.status === 'REGISTERED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                        {health.commands.status}
                      </span>
                    </div>
                    <div className="max-h-24 overflow-y-auto pr-1 flex flex-wrap gap-1.5 pt-1">
                      {health.commands.commands.map((cmd, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-700 font-mono text-[9px] rounded-sm font-bold border border-slate-200">
                          /{cmd.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400 font-medium">
                    No active command diagnostics loaded.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT: 3. DAILY OPERATIONS */}
      {activeTab === 'operations' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* UPCOMING EVENTS & AUTOMATED TASKS */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-base font-bold text-slate-900">Upcoming Server Operations</h3>
                <button
                  onClick={() => onNavigate('events')}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                >
                  Manage Events
                </button>
              </div>

              {todayOps && todayOps.events && todayOps.events.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {todayOps.events.map((e) => (
                    <div key={e.id} className="py-3 text-xs flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <strong className="text-slate-900 font-bold">{e.title}</strong>
                          <span className="px-1.5 py-0.5 rounded-sm font-mono text-[8px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase">
                            {e.type}
                          </span>
                        </div>
                        <span className="block text-[10px] text-slate-400 flex items-center gap-1 font-medium">
                          <Calendar className="h-3 w-3 text-slate-400 shrink-0" />
                          {new Date(e.scheduledAt).toLocaleString()}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase">
                        {e.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400 font-medium">
                  No upcoming operations or events scheduled for today.
                </div>
              )}
            </div>

            {/* INTEGRATION HEALTH */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-base font-bold text-slate-900">Third-Party Connections</h3>
                <button
                  onClick={() => onNavigate('integrations')}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                >
                  Configure Links
                </button>
              </div>

              {(() => {
                const sectionItems: any[] = Array.isArray(integrationsInfo?.sections)
                  ? integrationsInfo.sections
                  : integrationsInfo?.sections && typeof integrationsInfo.sections === 'object'
                  ? Object.values(integrationsInfo.sections)
                  : [];

                return sectionItems.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {sectionItems.map((item: any, idx: number) => (
                      <div key={idx} className="py-3 text-xs flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                          <h4 className="font-bold text-slate-900">{item.title || item.provider || 'Integration'}</h4>
                          {item.capabilitiesEnabled && Array.isArray(item.capabilitiesEnabled) && item.capabilitiesEnabled.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {item.capabilitiesEnabled.map((cap: string, cIdx: number) => (
                                <span key={cIdx} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 font-mono text-[9px] rounded-sm font-semibold">
                                  {cap}
                                </span>
                              ))}
                            </div>
                          )}
                          {item.currentError && <span className="block text-[10px] text-rose-500 font-medium">{item.currentError}</span>}
                          {item.error && <span className="block text-[10px] text-rose-500 font-medium">{item.error}</span>}
                        </div>

                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase ${item.status === 'CONNECTED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-600'}`}>
                          {item.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-400 font-medium">
                    No active third-party integrations linked to this community.
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* SUBMIT APPLICANT PORTAL MODAL */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Submit Test Candidate Application</h3>
              <button onClick={() => setShowSubmitModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitApp} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Applicant Discord Username</label>
                <input
                  type="text"
                  required
                  value={applicantUsername}
                  onChange={(e) => setApplicantUsername(e.target.value)}
                  placeholder="e.g. janesmith_gaming"
                  className="w-full rounded-lg border border-slate-300 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Discord User ID</label>
                <input
                  type="text"
                  required
                  value={applicantDiscordId}
                  onChange={(e) => setApplicantDiscordId(e.target.value)}
                  placeholder="e.g. 123456789012345678"
                  className="w-full rounded-lg border border-slate-300 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Recruiter Invite Code (Optional)</label>
                <input
                  type="text"
                  value={recruiterCode}
                  onChange={(e) => setRecruiterCode(e.target.value)}
                  placeholder="e.g. ALPHA10"
                  className="w-full rounded-lg border border-slate-300 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-hidden uppercase"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white shadow-md hover:bg-indigo-500 cursor-pointer"
                >
                  Submit Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE REFERRAL CODE MODAL */}
      {showCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Generate Recruiter Referral Code</h3>
              <button onClick={() => setShowCodeModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCode} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Custom Invite Code</label>
                <input
                  type="text"
                  required
                  value={newCodeName}
                  onChange={(e) => setNewCodeName(e.target.value)}
                  placeholder="e.g. ALPHA2026"
                  className="w-full rounded-lg border border-slate-300 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-hidden uppercase"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Recruiter Discord User ID</label>
                <input
                  type="text"
                  required
                  value={recruiterUserId}
                  onChange={(e) => setRecruiterUserId(e.target.value)}
                  placeholder="e.g. 987654321098765432"
                  className="w-full rounded-lg border border-slate-300 p-2.5 font-medium text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCodeModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white shadow-md hover:bg-indigo-500 cursor-pointer"
                >
                  Generate Code
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
