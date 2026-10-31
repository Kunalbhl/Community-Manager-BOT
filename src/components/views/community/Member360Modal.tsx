import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Shield,
  Calendar,
  Award,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Send,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  FileText,
  MessageSquare,
  Sparkles,
  ChevronRight,
  ExternalLink,
  Ban,
  UserX,
} from 'lucide-react';
import {
  Member360Profile,
  MemberRoleInfo,
  Member360TimelineItem,
} from '../../../../shared/types/member360.js';
import { UserRole } from '../../../../shared/types/rbac.js';

interface Member360ModalProps {
  communityId: string;
  discordUserId: string;
  currentRole: UserRole;
  onClose: () => void;
  onMemberUpdated?: () => void;
}

export const Member360Modal: React.FC<Member360ModalProps> = ({
  communityId,
  discordUserId,
  currentRole,
  onClose,
  onMemberUpdated,
}) => {
  const [profile, setProfile] = useState<Member360Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'discord' | 'recruitment' | 'engagement' | 'moderation' | 'events' | 'timeline'
  >('overview');
  const [copiedId, setCopiedId] = useState(false);

  // Available community roles for assignment
  const [availableRoles, setAvailableRoles] = useState<MemberRoleInfo[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [isAssigningRole, setIsAssigningRole] = useState(false);
  const [isRemovingRole, setIsRemovingRole] = useState<string | null>(null);

  // Send notification modal/state
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');
  const [isSendingNotif, setIsSendingNotif] = useState(false);
  const [notifSuccess, setNotifSuccess] = useState(false);

  // Manual Recruiter Code State
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [newRecruiterCode, setNewRecruiterCode] = useState('');
  const [isSavingCode, setIsSavingCode] = useState(false);

  // Moderation Action State
  const [modModalOpen, setModModalOpen] = useState(false);
  const [modAction, setModAction] = useState<'WARN' | 'RESTRICT'>('WARN');
  const [modReason, setModReason] = useState('');
  const [modSeverity, setModSeverity] = useState('MEDIUM');
  const [isSubmittingMod, setIsSubmittingMod] = useState(false);

  // Single Member Sync State
  const [isSyncingMember, setIsSyncingMember] = useState(false);

  const fetchProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/community/members/${discordUserId}/360?communityId=${communityId}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Failed to fetch member 360 profile (${res.status})`);
      }
      const data = await res.json();
      setProfile(data.data);
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading member profile');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCommunityRoles = async () => {
    try {
      const res = await fetch(`/api/v1/community/${communityId}/discord-roles`);
      if (res.ok) {
        const json = await res.json();
        setAvailableRoles(json.data || []);
      }
    } catch (err) {
      console.warn('Could not fetch community discord roles', err);
    }
  };

  useEffect(() => {
    fetchProfile();
    fetchCommunityRoles();
  }, [communityId, discordUserId]);

  const handleCopyId = () => {
    navigator.clipboard.writeText(discordUserId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleAssignRole = async () => {
    if (!selectedRoleId || isAssigningRole) return;
    setIsAssigningRole(true);
    try {
      const res = await fetch(`/api/v1/community/members/${discordUserId}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: selectedRoleId, communityId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to assign role');
      }
      setSelectedRoleId('');
      await fetchProfile();
      onMemberUpdated?.();
    } catch (err: any) {
      alert(`Role assignment error: ${err.message}`);
    } finally {
      setIsAssigningRole(false);
    }
  };

  const handleRemoveRole = async (roleId: string) => {
    if (isRemovingRole) return;
    setIsRemovingRole(roleId);
    try {
      const res = await fetch(`/api/v1/community/members/${discordUserId}/roles/${roleId}?communityId=${communityId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to remove role');
      }
      await fetchProfile();
      onMemberUpdated?.();
    } catch (err: any) {
      alert(`Role removal error: ${err.message}`);
    } finally {
      setIsRemovingRole(null);
    }
  };

  const handleSyncMember = async () => {
    setIsSyncingMember(true);
    try {
      const res = await fetch(`/api/v1/community/members/${discordUserId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to sync member');
      }
      await fetchProfile();
      onMemberUpdated?.();
    } catch (err: any) {
      alert(`Sync error: ${err.message}`);
    } finally {
      setIsSyncingMember(false);
    }
  };

  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle.trim() || !notifBody.trim()) return;
    setIsSendingNotif(true);
    try {
      const res = await fetch(`/api/v1/community/members/${discordUserId}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: notifTitle.trim(),
          body: notifBody.trim(),
          communityId,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to send notification');
      }
      setNotifSuccess(true);
      setTimeout(() => {
        setNotifSuccess(false);
        setNotifModalOpen(false);
        setNotifTitle('');
        setNotifBody('');
      }, 1500);
    } catch (err: any) {
      alert(`Notification error: ${err.message}`);
    } finally {
      setIsSendingNotif(false);
    }
  };

  const handleSaveRecruiterCode = async () => {
    setIsSavingCode(true);
    try {
      const res = await fetch(`/api/v1/community/members/${discordUserId}/assign-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recruiterCode: newRecruiterCode.trim(), communityId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to update recruiter code');
      }
      setIsEditingCode(false);
      await fetchProfile();
      onMemberUpdated?.();
    } catch (err: any) {
      alert(`Code assignment error: ${err.message}`);
    } finally {
      setIsSavingCode(false);
    }
  };

  const handleIssueModeration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modReason.trim()) return;
    setIsSubmittingMod(true);
    try {
      let endpoint = '/api/v1/moderation/warnings';
      let payload: any = {
        communityId,
        discordUserId,
        reason: modReason.trim(),
        severity: modSeverity,
      };

      if (modAction === 'RESTRICT') {
        endpoint = '/api/v1/moderation/restrictions';
        payload = {
          communityId,
          discordUserId,
          reason: modReason.trim(),
          restrictionType: 'RESTRICTION',
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Moderation action failed');
      }

      setModModalOpen(false);
      setModReason('');
      await fetchProfile();
      onMemberUpdated?.();
    } catch (err: any) {
      alert(`Moderation error: ${err.message}`);
    } finally {
      setIsSubmittingMod(false);
    }
  };

  const unassignedRoles = availableRoles.filter(
    (ar) => !(profile?.discord.roles || []).some((mr) => mr.id === ar.id)
  );

  return (
    <div id="member-360-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div id="member-360-modal-card" className="relative w-full max-w-5xl bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-neutral-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-semibold text-lg border border-indigo-500/30 overflow-hidden">
              {profile?.overview.avatarUrl ? (
                <img src={profile.overview.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                profile?.overview.displayName?.charAt(0) || 'M'
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight text-white">
                  {profile?.overview.displayName || 'Loading Member...'}
                </h2>
                {profile?.overview.membershipStatus === 'ACTIVE' && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                    Active Discord Member
                  </span>
                )}
                {profile?.overview.membershipStatus === 'LEFT' && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">
                    Left Server
                  </span>
                )}
                {profile?.overview.membershipStatus === 'BANNED' && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 rounded-full">
                    Banned
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-neutral-400">
                <span>@{profile?.overview.username}</span>
                <span>•</span>
                <button
                  onClick={handleCopyId}
                  className="flex items-center gap-1 hover:text-neutral-200 transition-colors font-mono"
                  title="Copy Discord User ID"
                >
                  {discordUserId}
                  {copiedId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="member-360-sync-btn"
              onClick={handleSyncMember}
              disabled={isSyncingMember}
              className="px-3 py-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg flex items-center gap-1.5 transition-colors border border-neutral-700 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingMember ? 'animate-spin text-indigo-400' : ''}`} />
              Re-sync
            </button>
            <button
              id="member-360-close-btn"
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 border-b border-neutral-800 bg-neutral-950/40 text-xs overflow-x-auto">
          {[
            { id: 'overview', label: '360 Overview', icon: Activity },
            { id: 'discord', label: 'Discord & Roles', icon: Shield },
            { id: 'recruitment', label: 'Recruitment & Journey', icon: Award },
            { id: 'engagement', label: 'Engagement & Health', icon: CheckCircle2 },
            { id: 'moderation', label: 'Moderation & Safety', icon: AlertTriangle },
            { id: 'events', label: 'Events & Attendance', icon: Calendar },
            { id: 'timeline', label: 'Unified Timeline', icon: Clock },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`member-360-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3 px-3 font-medium border-b-2 transition-all whitespace-nowrap ${
                  isActive
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
              <p className="text-sm">Aggregating real member 360 data across engines...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-950/30 border border-red-800/50 rounded-xl text-red-300 text-sm">
              <p className="font-semibold mb-1">Failed to load member profile</p>
              <p>{error}</p>
            </div>
          ) : profile ? (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Top Stats Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-neutral-800/50 border border-neutral-700/60 rounded-xl p-4">
                      <div className="text-xs text-neutral-400 mb-1">Joined Community</div>
                      <div className="text-sm font-semibold text-neutral-100">
                        {profile.overview.joinedAt
                          ? new Date(profile.overview.joinedAt).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })
                          : 'Not available'}
                      </div>
                      <div className="text-xs text-neutral-400 mt-1">
                        {profile.retention.observationDays} days observed
                      </div>
                    </div>

                    <div className="bg-neutral-800/50 border border-neutral-700/60 rounded-xl p-4">
                      <div className="text-xs text-neutral-400 mb-1">Health Signal</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            profile.overview.healthSignal === 'ONBOARDING_COMPLETE' || profile.overview.healthSignal === 'ACTIVE'
                              ? 'bg-emerald-500'
                              : profile.overview.healthSignal === 'LOW_ACTIVITY'
                              ? 'bg-amber-500'
                              : profile.overview.healthSignal === 'AT_RISK'
                              ? 'bg-red-500'
                              : 'bg-neutral-500'
                          }`}
                        />
                        <span className="text-sm font-semibold text-neutral-100">
                          {(profile.overview?.healthSignal || 'UNKNOWN').replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-400 mt-1">
                        {(profile.engagement?.earlyEngagementEvents || []).length} early actions
                      </div>
                    </div>

                    <div className="bg-neutral-800/50 border border-neutral-700/60 rounded-xl p-4">
                      <div className="text-xs text-neutral-400 mb-1">Recruitment Attribution</div>
                      <div className="text-sm font-semibold text-neutral-100">
                        {profile.overview.recruiterCode ? (
                          <span className="font-mono text-indigo-400">{profile.overview.recruiterCode}</span>
                        ) : (
                          <span className="text-neutral-400">Organic</span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-400 mt-1">
                        {profile.recruitment?.hasApplication ? 'Application Linked' : 'No Application'}
                      </div>
                    </div>

                    <div className="bg-neutral-800/50 border border-neutral-700/60 rounded-xl p-4">
                      <div className="text-xs text-neutral-400 mb-1">Moderation Status</div>
                      <div className="text-sm font-semibold text-neutral-100">
                        {profile.overview.moderationSummary ? (
                          profile.overview.moderationSummary.isBlacklisted ? (
                            <span className="text-red-400">Blacklisted</span>
                          ) : profile.overview.moderationSummary.activeWarnings > 0 ? (
                            <span className="text-amber-400">
                              {profile.overview.moderationSummary.activeWarnings} Active Warning(s)
                            </span>
                          ) : (
                            <span className="text-emerald-400">Clean Standing</span>
                          )
                        ) : (
                          <span className="text-neutral-400">Restricted View</span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-400 mt-1">
                        {profile.events.totalAttended} events attended
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex flex-wrap gap-2 p-3 bg-neutral-800/30 border border-neutral-800 rounded-xl items-center">
                    <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mr-2">
                      Quick Actions:
                    </span>
                    {profile.viewerPermissions.canSendNotification && (
                      <button
                        id="btn-quick-notify"
                        onClick={() => setNotifModalOpen(true)}
                        className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center gap-1.5 transition-colors font-medium shadow-xs"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Send Notification
                      </button>
                    )}
                    {profile.viewerPermissions.canModerate && (
                      <button
                        id="btn-quick-moderate"
                        onClick={() => {
                          setModAction('WARN');
                          setModModalOpen(true);
                        }}
                        className="px-3 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-lg flex items-center gap-1.5 transition-colors font-medium"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        Issue Warning / Restriction
                      </button>
                    )}
                    {profile.viewerPermissions.canViewRecruitment && (
                      <button
                        id="btn-quick-code"
                        onClick={() => {
                          setNewRecruiterCode(profile.overview.recruiterCode || '');
                          setIsEditingCode(true);
                        }}
                        className="px-3 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-lg flex items-center gap-1.5 transition-colors font-medium"
                      >
                        <Award className="w-3.5 h-3.5 text-indigo-400" />
                        Assign Recruiter Code
                      </button>
                    )}
                  </div>

                  {/* Retention Milestones Section */}
                  <div className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-neutral-200 mb-3 flex items-center gap-2">
                      <Award className="w-4 h-4 text-indigo-400" />
                      Retention Intelligence Milestones
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Day 1 Milestone', val: profile.retention.day1 },
                        { label: 'Day 7 Milestone', val: profile.retention.day7 },
                        { label: 'Day 30 Milestone', val: profile.retention.day30 },
                        { label: 'Day 90 Milestone', val: profile.retention.day90 },
                      ].map((m, idx) => (
                        <div key={idx} className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-lg">
                          <div className="text-xs text-neutral-400">{m.label}</div>
                          <div className="mt-1 text-sm font-semibold">
                            {m.val === 'INSUFFICIENT_DATA' ? (
                              <span className="text-neutral-500 font-normal text-xs">Insufficient Data</span>
                            ) : m.val === true ? (
                              <span className="text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Retained
                              </span>
                            ) : (
                              <span className="text-amber-400">Inactive</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Summary of Roles */}
                  <div className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                        <Shield className="w-4 h-4 text-indigo-400" />
                        Active Discord Roles ({(profile.overview?.roles || []).length})
                      </h3>
                      {profile.viewerPermissions.canManageRoles && (
                        <button
                          onClick={() => setActiveTab('discord')}
                          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
                        >
                          Manage Roles <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {profile.overview?.roles && profile.overview.roles.length > 0 ? (
                        profile.overview.roles.map((r) => (
                          <span
                            key={r.id}
                            style={{ borderColor: r.color || '#4f46e5' }}
                            className="px-2.5 py-1 text-xs font-medium bg-neutral-900 border rounded-lg flex items-center gap-1.5"
                          >
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: r.color || '#818cf8' }}
                            />
                            {r.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-neutral-500">No special Discord roles assigned</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: DISCORD & ROLES */}
              {activeTab === 'discord' && (
                <div className="space-y-6">
                  <div className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-neutral-200 mb-4 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-indigo-400" />
                      Discord Guild Identity & Synchronization
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-2">
                        <div className="flex justify-between py-1.5 border-b border-neutral-800">
                          <span className="text-neutral-400">Server Name</span>
                          <span className="font-semibold text-neutral-200">{profile.discord.guildName}</span>
                        </div>
                        <div className="flex justify-between py-1.5 border-b border-neutral-800">
                          <span className="text-neutral-400">Guild ID</span>
                          <span className="font-mono text-neutral-300">{profile.discord.guildId}</span>
                        </div>
                        <div className="flex justify-between py-1.5 border-b border-neutral-800">
                          <span className="text-neutral-400">Discord User ID</span>
                          <span className="font-mono text-neutral-300">{discordUserId}</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between py-1.5 border-b border-neutral-800">
                          <span className="text-neutral-400">Sync Status</span>
                          <span className="text-emerald-400 font-semibold">{profile.discord.syncState}</span>
                        </div>
                        <div className="flex justify-between py-1.5 border-b border-neutral-800">
                          <span className="text-neutral-400">Last Authoritative Sync</span>
                          <span className="text-neutral-300">
                            {new Date(profile.discord.lastSyncedAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between py-1.5 border-b border-neutral-800">
                          <span className="text-neutral-400">Nickname Snapshot</span>
                          <span className="text-neutral-300">{profile.discord.nickname || 'None'}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Role Management */}
                  <div className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-neutral-200">Role Management</h3>
                        <p className="text-xs text-neutral-400">
                          Authoritatively assign or revoke Discord roles using the Discord Gateway.
                        </p>
                      </div>
                    </div>

                    {profile.viewerPermissions.canManageRoles && (
                      <div className="flex items-center gap-2 pt-2 border-t border-neutral-800">
                        <select
                          id="select-assign-role"
                          value={selectedRoleId}
                          onChange={(e) => setSelectedRoleId(e.target.value)}
                          className="flex-1 px-3 py-2 text-xs bg-neutral-900 border border-neutral-700 rounded-lg text-neutral-200 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">Select a Discord role to assign...</option>
                          {unassignedRoles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} {r.managed ? '(Managed/Bot)' : ''}
                            </option>
                          ))}
                        </select>
                        <button
                          id="btn-assign-role-submit"
                          onClick={handleAssignRole}
                          disabled={!selectedRoleId || isAssigningRole}
                          className="px-4 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg flex items-center gap-1.5 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Assign Role
                        </button>
                      </div>
                    )}

                    <div className="space-y-2 pt-2">
                      <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                        Assigned Roles ({(profile.discord?.roles || []).length})
                      </div>
                      {!profile.discord?.roles || profile.discord.roles.length === 0 ? (
                        <p className="text-xs text-neutral-500 py-2">No roles currently assigned.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {(profile.discord.roles || []).map((role) => (
                            <div
                              key={role.id}
                              className="flex items-center justify-between p-2.5 bg-neutral-900/80 border border-neutral-800 rounded-lg"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: role.color || '#818cf8' }}
                                />
                                <span className="text-xs font-medium text-neutral-200">{role.name}</span>
                              </div>
                              {profile.viewerPermissions.canManageRoles && (
                                <button
                                  id={`btn-remove-role-${role.id}`}
                                  onClick={() => handleRemoveRole(role.id)}
                                  disabled={isRemovingRole === role.id}
                                  className="p-1 text-neutral-400 hover:text-red-400 rounded-md transition-colors"
                                  title="Remove Role"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: RECRUITMENT & JOURNEY */}
              {activeTab === 'recruitment' && (
                <div className="space-y-6">
                  {profile.recruitment ? (
                    <>
                      {/* Application Info */}
                      <div className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                            <Award className="w-4 h-4 text-indigo-400" />
                            Recruitment & Candidate Profile
                          </h3>
                          {profile.recruitment.applicationStatus && (
                            <span className="px-2.5 py-1 text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">
                              Status: {profile.recruitment.applicationStatus}
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          <div className="space-y-2">
                            <div className="flex justify-between py-1.5 border-b border-neutral-800">
                              <span className="text-neutral-400">Application ID</span>
                              <span className="font-mono text-neutral-300">
                                {profile.recruitment.applicationId || 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between py-1.5 border-b border-neutral-800">
                              <span className="text-neutral-400">Submitted Date</span>
                              <span className="text-neutral-300">
                                {profile.recruitment.submittedAt
                                  ? new Date(profile.recruitment.submittedAt).toLocaleDateString()
                                  : 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between py-1.5 border-b border-neutral-800">
                              <span className="text-neutral-400">Recruiter Code</span>
                              <span className="font-mono text-indigo-400">
                                {profile.recruitment.recruiterCode || 'None'}
                              </span>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between py-1.5 border-b border-neutral-800">
                              <span className="text-neutral-400">Recruiter Name</span>
                              <span className="text-neutral-300">
                                {profile.recruitment.recruiterName || 'Unassigned'}
                              </span>
                            </div>
                            <div className="flex justify-between py-1.5 border-b border-neutral-800">
                              <span className="text-neutral-400">Referral Source</span>
                              <span className="text-neutral-300">
                                {profile.recruitment.referralSource || 'Direct'}
                              </span>
                            </div>
                            <div className="flex justify-between py-1.5 border-b border-neutral-800">
                              <span className="text-neutral-400">Interview Status</span>
                              <span className="text-neutral-300">
                                {profile.recruitment.interviewStatus || 'Not Scheduled'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Onboarding Checklist Progress */}
                      {profile.recruitment.checklistProgress && (
                        <div className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-5 space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                              Onboarding Checklist Progress
                            </h4>
                            <span className="text-xs font-bold text-indigo-400">
                              {profile.recruitment.checklistProgress.percentage}% (
                              {profile.recruitment.checklistProgress.completed}/
                              {profile.recruitment.checklistProgress.total})
                            </span>
                          </div>
                          <div className="w-full h-2 bg-neutral-900 rounded-full overflow-hidden border border-neutral-800">
                            <div
                              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                              style={{ width: `${profile.recruitment.checklistProgress.percentage}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="p-8 text-center bg-neutral-800/30 border border-neutral-800 rounded-xl text-neutral-400">
                      <Award className="w-8 h-8 mx-auto mb-2 text-neutral-500" />
                      <p className="text-sm font-medium">No Recruitment Data Available</p>
                      <p className="text-xs text-neutral-500 mt-1">
                        This member joined organically or recruitment details are restricted.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: ENGAGEMENT & HEALTH */}
              {activeTab === 'engagement' && (
                <div className="space-y-6">
                  <div className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-5 space-y-4">
                    <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-indigo-400" />
                      Community Engagement & Telemetry
                    </h3>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                      <div className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-lg">
                        <div className="text-xl font-bold text-indigo-400">
                          {(profile.engagement?.earlyEngagementEvents || []).length}
                        </div>
                        <div className="text-xs text-neutral-400 mt-1">Early Actions</div>
                      </div>
                      <div className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-lg">
                        <div className="text-xl font-bold text-emerald-400">
                          {profile.events.totalAttended}
                        </div>
                        <div className="text-xs text-neutral-400 mt-1">Events Attended</div>
                      </div>
                      <div className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-lg">
                        <div className="text-xl font-bold text-amber-400">
                          {profile.engagement.pollVotesCount}
                        </div>
                        <div className="text-xs text-neutral-400 mt-1">Poll Votes</div>
                      </div>
                      <div className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-lg">
                        <div className="text-xl font-bold text-neutral-200">
                          {profile.engagement.campaignParticipationCount}
                        </div>
                        <div className="text-xs text-neutral-400 mt-1">Campaigns</div>
                      </div>
                    </div>

                    <div className="pt-2">
                      <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                        Recorded Early Engagement Events
                      </div>
                      {!profile.engagement?.earlyEngagementEvents || profile.engagement.earlyEngagementEvents.length === 0 ? (
                        <p className="text-xs text-neutral-500">No early telemetry events recorded yet.</p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {(profile.engagement.earlyEngagementEvents || []).map((evt, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-2.5 bg-neutral-900/80 border border-neutral-800 rounded-lg text-xs"
                            >
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="font-medium text-neutral-200">
                                  {(evt.eventType || 'EVENT').replace(/_/g, ' ')}
                                </span>
                              </div>
                              <span className="text-neutral-500">
                                {new Date(evt.timestamp).toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: MODERATION & SAFETY */}
              {activeTab === 'moderation' && (
                <div className="space-y-6">
                  {profile.moderation ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-neutral-200">Moderation Standing</h3>
                          <p className="text-xs text-neutral-400">
                            Factual warnings, restrictions, and blacklist records.
                          </p>
                        </div>
                        {profile.viewerPermissions.canModerate && (
                          <button
                            id="btn-open-moderation-modal"
                            onClick={() => setModModalOpen(true)}
                            className="px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Issue Action
                          </button>
                        )}
                      </div>

                      {/* Blacklist banner */}
                      {profile.moderation.isBlacklisted && (
                        <div className="p-4 bg-red-950/40 border border-red-800/80 rounded-xl flex items-center gap-3 text-red-300 text-xs">
                          <Ban className="w-5 h-5 text-red-400 shrink-0" />
                          <div>
                            <span className="font-semibold block">Member is Blacklisted</span>
                            <span>{profile.moderation.blacklistReason || 'Security/Safety violation'}</span>
                          </div>
                        </div>
                      )}

                      {/* Warnings list */}
                      <div className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-5 space-y-3">
                        <div className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                          Active Warnings ({(profile.moderation?.warnings || []).length})
                        </div>
                        {!profile.moderation?.warnings || profile.moderation.warnings.length === 0 ? (
                          <p className="text-xs text-neutral-500">No active warnings on record.</p>
                        ) : (
                          <div className="space-y-2">
                            {(profile.moderation.warnings || []).map((w) => (
                              <div
                                key={w.id}
                                className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg text-xs space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-amber-400">
                                    Severity: {w.severity}
                                  </span>
                                  <span className="text-neutral-500">
                                    {new Date(w.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <p className="text-neutral-300">{w.reason}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Restrictions list */}
                      <div className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-5 space-y-3">
                        <div className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
                          Restrictions ({(profile.moderation?.restrictions || []).length})
                        </div>
                        {!profile.moderation?.restrictions || profile.moderation.restrictions.length === 0 ? (
                          <p className="text-xs text-neutral-500">No active restrictions.</p>
                        ) : (
                          <div className="space-y-2">
                            {(profile.moderation.restrictions || []).map((r) => (
                              <div
                                key={r.id}
                                className="p-3 bg-neutral-900 border border-neutral-800 rounded-lg text-xs space-y-1"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-semibold text-red-400">{r.restrictionType}</span>
                                  <span className="text-neutral-500">
                                    {new Date(r.createdAt).toLocaleDateString()}
                                  </span>
                                </div>
                                <p className="text-neutral-300">{r.reason}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="p-8 text-center bg-neutral-800/30 border border-neutral-800 rounded-xl text-neutral-400">
                      <Shield className="w-8 h-8 mx-auto mb-2 text-neutral-500" />
                      <p className="text-sm font-medium">Moderation Data Restricted</p>
                      <p className="text-xs text-neutral-500 mt-1">
                        Only staff members have authorization to view disciplinary records.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 6: EVENTS & ATTENDANCE */}
              {activeTab === 'events' && (
                <div className="space-y-6">
                  <div className="bg-neutral-800/40 border border-neutral-800 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-indigo-400" />
                        Community Event Registrations & Attendance
                      </h3>
                      <div className="text-xs text-neutral-400">
                        {profile.events.totalAttended} / {profile.events.totalRegistrations} attended
                      </div>
                    </div>

                    {!profile.events?.registrations || profile.events.registrations.length === 0 ? (
                      <p className="text-xs text-neutral-500 py-4 text-center">
                        No community event registrations found.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {(profile.events.registrations || []).map((reg, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-3 bg-neutral-900/80 border border-neutral-800 rounded-lg text-xs"
                          >
                            <div>
                              <div className="font-semibold text-neutral-200">{reg.eventTitle}</div>
                              <div className="text-neutral-500 text-[11px]">
                                Registered: {new Date(reg.registeredAt).toLocaleDateString()}
                              </div>
                            </div>
                            <div>
                              {reg.attendanceStatus === 'ATTENDED' && (
                                <span className="px-2.5 py-1 text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                                  Attended
                                </span>
                              )}
                              {reg.attendanceStatus === 'REGISTERED' && (
                                <span className="px-2.5 py-1 text-[11px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">
                                  Registered
                                </span>
                              )}
                              {reg.attendanceStatus === 'NO_SHOW' && (
                                <span className="px-2.5 py-1 text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20 rounded-full">
                                  No Show
                                </span>
                              )}
                              {reg.attendanceStatus === 'CANCELLED' && (
                                <span className="px-2.5 py-1 text-[11px] font-medium bg-neutral-500/10 text-neutral-400 border border-neutral-500/20 rounded-full">
                                  Cancelled
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 7: UNIFIED TIMELINE */}
              {activeTab === 'timeline' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-indigo-400" />
                      Authoritative Member Timeline
                    </h3>
                    <span className="text-xs text-neutral-400">
                      {(profile.activityTimeline || []).length} events
                    </span>
                  </div>

                  <div className="relative pl-6 border-l-2 border-neutral-800 space-y-6 pt-2">
                    {(profile.activityTimeline || []).map((item) => (
                      <div key={item.id} className="relative group">
                        <span
                          className={`absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full border-2 border-neutral-900 ${
                            item.category === 'DISCORD'
                              ? 'bg-indigo-500'
                              : item.category === 'RECRUITMENT'
                              ? 'bg-blue-500'
                              : item.category === 'ENGAGEMENT'
                              ? 'bg-emerald-500'
                              : item.category === 'MODERATION'
                              ? 'bg-amber-500'
                              : item.category === 'EVENTS'
                              ? 'bg-purple-500'
                              : 'bg-neutral-500'
                          }`}
                        />
                        <div className="bg-neutral-900/90 border border-neutral-800 rounded-lg p-3 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-neutral-200">{item.title}</span>
                            <span className="text-[11px] text-neutral-500 font-mono">
                              {new Date(item.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-neutral-400">{item.description}</p>
                          {item.result && (
                            <div className="text-[11px] text-indigo-400 font-medium pt-1">
                              Result: {item.result}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* MODAL: Send Notification */}
        {notifModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Send className="w-4 h-4 text-indigo-400" />
                  Send Notification to Member
                </h3>
                <button onClick={() => setNotifModalOpen(false)} className="text-neutral-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {notifSuccess ? (
                <div className="p-4 bg-emerald-950/40 border border-emerald-800 rounded-lg text-emerald-300 text-xs text-center">
                  Notification dispatched successfully!
                </div>
              ) : (
                <form onSubmit={handleSendNotification} className="space-y-3">
                  <div>
                    <label className="text-xs text-neutral-400 block mb-1">Notification Title</label>
                    <input
                      id="input-notif-title"
                      type="text"
                      required
                      value={notifTitle}
                      onChange={(e) => setNotifTitle(e.target.value)}
                      placeholder="e.g., Welcome to the community!"
                      className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 block mb-1">Message Body</label>
                    <textarea
                      id="input-notif-body"
                      required
                      rows={3}
                      value={notifBody}
                      onChange={(e) => setNotifBody(e.target.value)}
                      placeholder="Enter the notification content..."
                      className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setNotifModalOpen(false)}
                      className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      id="btn-submit-notif"
                      type="submit"
                      disabled={isSendingNotif}
                      className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-medium"
                    >
                      {isSendingNotif ? 'Sending...' : 'Send Notification'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* MODAL: Recruiter Code Assignment */}
        {isEditingCode && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-sm w-full p-5 space-y-4 shadow-xl">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-white">Assign Recruiter Code</h3>
                <button onClick={() => setIsEditingCode(false)} className="text-neutral-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Recruiter Code</label>
                  <input
                    id="input-edit-recruiter-code"
                    type="text"
                    value={newRecruiterCode}
                    onChange={(e) => setNewRecruiterCode(e.target.value.toUpperCase())}
                    placeholder="e.g. VIP2026"
                    className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-700 rounded-lg text-white font-mono uppercase focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setIsEditingCode(false)}
                    className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    id="btn-save-recruiter-code"
                    onClick={handleSaveRecruiterCode}
                    disabled={isSavingCode}
                    className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-medium"
                  >
                    {isSavingCode ? 'Saving...' : 'Save Code'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Moderation Action */}
        {modModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 p-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Issue Moderation Action
                </h3>
                <button onClick={() => setModModalOpen(false)} className="text-neutral-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleIssueModeration} className="space-y-3">
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Action Type</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setModAction('WARN')}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg border ${
                        modAction === 'WARN'
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-neutral-950 border-neutral-700 text-neutral-400'
                      }`}
                    >
                      Warning
                    </button>
                    <button
                      type="button"
                      onClick={() => setModAction('RESTRICT')}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg border ${
                        modAction === 'RESTRICT'
                          ? 'bg-red-500/20 border-red-500 text-red-300'
                          : 'bg-neutral-950 border-neutral-700 text-neutral-400'
                      }`}
                    >
                      Restriction
                    </button>
                  </div>
                </div>

                {modAction === 'WARN' && (
                  <div>
                    <label className="text-xs text-neutral-400 block mb-1">Severity</label>
                    <select
                      value={modSeverity}
                      onChange={(e) => setModSeverity(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="CRITICAL">Critical</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Reason / Explanation</label>
                  <textarea
                    id="input-mod-reason"
                    required
                    rows={3}
                    value={modReason}
                    onChange={(e) => setModReason(e.target.value)}
                    placeholder="Document factual policy reason..."
                    className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-amber-500 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModModalOpen(false)}
                    className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    id="btn-submit-mod"
                    type="submit"
                    disabled={isSubmittingMod}
                    className="px-4 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg font-medium"
                  >
                    {isSubmittingMod ? 'Submitting...' : 'Confirm Action'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
