import React, { useState, useEffect } from 'react';
import { MemberSelect } from '../../common/DiscordPickers.js';
import {
  ShieldAlert,
  UserCheck,
  AlertTriangle,
  AlertOctagon,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  Lock,
  FileText,
  Sliders,
  Shield,
  Eye,
  RefreshCw,
  UserX,
} from 'lucide-react';

interface ModerationViewProps {
  communityId: string;
  initialTab?: string;
}

export const ModerationView: React.FC<ModerationViewProps> = ({ communityId, initialTab = 'warnings' }) => {
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // General state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Warnings State
  const [warnings, setWarnings] = useState<any[]>([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [warningReason, setWarningReason] = useState('');
  const [warningSeverity, setWarningSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('LOW');
  const [warningExpiresDays, setWarningExpiresDays] = useState<number | ''>('');

  // 2. Incidents State
  const [incidents, setIncidents] = useState<any[]>([]);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentSeverity, setIncidentSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [incidentAffectedMembers, setIncidentAffectedMembers] = useState('');
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [incidentResolution, setIncidentResolution] = useState('');

  // 3. AutoMod State
  const [autoModRules, setAutoModRules] = useState<any[]>([]);
  const [showAutoModModal, setShowAutoModModal] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [ruleType, setRuleType] = useState<'KEYWORD_PATTERN' | 'LINK_PATTERN' | 'MENTION_PATTERN' | 'SPAM_FREQUENCY' | 'REPEATED_MESSAGE'>('KEYWORD_PATTERN');
  const [ruleKeywords, setRuleKeywords] = useState('');
  const [ruleMaxMentions, setRuleMaxMentions] = useState<number>(3);
  const [ruleMaxMessages, setRuleMaxMessages] = useState<number>(5);
  const [ruleWindowSeconds, setRuleWindowSeconds] = useState<number>(10);
  const [ruleAction, setRuleAction] = useState<'LOG' | 'WARN' | 'DELETE_MESSAGE' | 'TIMEOUT'>('WARN');
  const [ruleCooldown, setRuleCooldown] = useState<number>(60);
  const [rulePriority, setRulePriority] = useState<number>(1);

  // 4. Blacklist State
  const [blacklist, setBlacklist] = useState<any[]>([]);
  const [blacklistUserId, setBlacklistUserId] = useState('');
  const [blacklistReason, setBlacklistReason] = useState('');
  const [blacklistExpiresDays, setBlacklistExpiresDays] = useState<number | ''>('');

  // 5. Restrictions State
  const [restrictions, setRestrictions] = useState<any[]>([]);
  const [restrictionTargetId, setRestrictionTargetId] = useState('');
  const [restrictionType, setRestrictionType] = useState<'CHANNEL_ACCESS' | 'TIMEOUT' | 'ROLE_REMOVAL' | 'FEATURE_RESTRICTION'>('TIMEOUT');
  const [restrictionReason, setRestrictionReason] = useState('');
  const [restrictionExpiresDays, setRestrictionExpiresDays] = useState<number | ''>('');

  // 6. Security Audit State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditFilterActor, setAuditFilterActor] = useState('');
  const [auditFilterTarget, setAuditFilterTarget] = useState('');
  const [auditFilterAction, setAuditFilterAction] = useState('');

  // Fetch Data based on tab
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { 'x-community-id': communityId };
      if (activeTab === 'warnings') {
        const res = await fetch(`/api/v1/moderation/warnings`, { headers });
        if (res.ok) {
          const data = await res.json();
          setWarnings(data.warnings || []);
        }
      } else if (activeTab === 'incidents') {
        const res = await fetch(`/api/v1/moderation/incidents`, { headers });
        if (res.ok) {
          const data = await res.json();
          setIncidents(data.incidents || []);
        }
      } else if (activeTab === 'automod') {
        const res = await fetch(`/api/v1/moderation/automod`, { headers });
        if (res.ok) {
          const data = await res.json();
          setAutoModRules(data.rules || []);
        }
      } else if (activeTab === 'blacklist') {
        const res = await fetch(`/api/v1/moderation/blacklist`, { headers });
        if (res.ok) {
          const data = await res.json();
          setBlacklist(data.blacklist || []);
        }
      } else if (activeTab === 'restrictions') {
        const res = await fetch(`/api/v1/moderation/restrictions`, { headers });
        if (res.ok) {
          const data = await res.json();
          setRestrictions(data.restrictions || []);
        }
      } else if (activeTab === 'security-audit') {
        const queryParams = new URLSearchParams();
        if (auditFilterActor) queryParams.append('actor', auditFilterActor);
        if (auditFilterTarget) queryParams.append('target', auditFilterTarget);
        if (auditFilterAction) queryParams.append('action', auditFilterAction);

        const res = await fetch(`/api/v1/moderation/audit?${queryParams.toString()}`, { headers });
        if (res.ok) {
          const data = await res.json();
          setAuditLogs(data.audit || []);
        }
      }
    } catch (err) {
      console.error(err);
      setError('Failed to fetch data from backend service.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    fetchData();
  }, [communityId, activeTab, auditFilterActor, auditFilterTarget, auditFilterAction]);

  // Handlers
  const handleIssueWarning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUserId || !warningReason) return;
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/v1/moderation/warnings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          discordUserId: targetUserId,
          reason: warningReason,
          severity: warningSeverity,
          expiresDays: warningExpiresDays ? Number(warningExpiresDays) : undefined,
        }),
      });

      if (res.ok) {
        setTargetUserId('');
        setWarningReason('');
        setWarningSeverity('LOW');
        setWarningExpiresDays('');
        setSuccess('Warning issued and recorded in moderation engine.');
        fetchData();
      } else {
        const err = await res.json();
        setError(err.message || 'Error issuing warning.');
      }
    } catch (err) {
      setError('Network failure issuing warning.');
    }
  };

  const handleRevokeWarning = async (warningId: string) => {
    try {
      const res = await fetch(`/api/v1/moderation/warnings/${warningId}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({ notes: 'Revoked by moderator' }),
      });
      if (res.ok) {
        setSuccess('Warning revoked successfully.');
        fetchData();
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to revoke warning.');
      }
    } catch (err) {
      setError('Network error revoking warning.');
    }
  };

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!incidentTitle || !incidentDescription) return;
    try {
      const affected = incidentAffectedMembers
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch('/api/v1/moderation/incidents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          title: incidentTitle,
          description: incidentDescription,
          severity: incidentSeverity,
          affectedMembers: affected,
        }),
      });

      if (res.ok) {
        setShowIncidentModal(false);
        setIncidentTitle('');
        setIncidentDescription('');
        setIncidentAffectedMembers('');
        setSuccess('Safety incident created successfully.');
        fetchData();
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to create incident.');
      }
    } catch (err) {
      setError('Network error creating incident.');
    }
  };

  const handleUpdateIncidentStatus = async (incidentId: string, status: string, resolution?: string) => {
    try {
      const res = await fetch(`/api/v1/moderation/incidents/${incidentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          status,
          resolution,
        }),
      });
      if (res.ok) {
        setSuccess(`Incident updated to ${status}.`);
        setSelectedIncident(null);
        fetchData();
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to update incident.');
      }
    } catch (err) {
      setError('Network error updating incident.');
    }
  };

  const handleCreateAutoModRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName) return;

    try {
      const conditions: any = {};
      if (ruleType === 'KEYWORD_PATTERN') {
        conditions.keywords = ruleKeywords.split(',').map((k) => k.trim()).filter(Boolean);
      } else if (ruleType === 'MENTION_PATTERN') {
        conditions.maxMentions = ruleMaxMentions;
      } else if (ruleType === 'SPAM_FREQUENCY') {
        conditions.maxMessagesPerWindow = ruleMaxMessages;
        conditions.windowSeconds = ruleWindowSeconds;
      } else if (ruleType === 'LINK_PATTERN') {
        conditions.allowLinks = false;
      }

      const res = await fetch('/api/v1/moderation/automod', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          name: ruleName,
          ruleType,
          conditions,
          action: ruleAction,
          cooldownSeconds: ruleCooldown,
          priority: rulePriority,
        }),
      });

      if (res.ok) {
        setShowAutoModModal(false);
        setRuleName('');
        setRuleKeywords('');
        setSuccess('Auto-Moderation rule created.');
        fetchData();
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to create auto-moderation rule.');
      }
    } catch (err) {
      setError('Network error creating rule.');
    }
  };

  const handleToggleAutoModRule = async (ruleId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/v1/moderation/automod/${ruleId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({ enabled: !currentStatus }),
      });
      if (res.ok) {
        setSuccess('Auto-Moderation rule status updated.');
        fetchData();
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to update status.');
      }
    } catch (err) {
      setError('Network error updating rule status.');
    }
  };

  const handleAddBlacklist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blacklistUserId || !blacklistReason) return;
    try {
      const res = await fetch('/api/v1/moderation/blacklist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          discordUserId: blacklistUserId,
          reason: blacklistReason,
          expiresDays: blacklistExpiresDays ? Number(blacklistExpiresDays) : undefined,
        }),
      });

      if (res.ok) {
        setBlacklistUserId('');
        setBlacklistReason('');
        setBlacklistExpiresDays('');
        setSuccess('Member added to blacklist successfully.');
        fetchData();
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to add blacklist entry.');
      }
    } catch (err) {
      setError('Network error adding to blacklist.');
    }
  };

  const handleRemoveBlacklist = async (discordUserId: string) => {
    try {
      const res = await fetch(`/api/v1/moderation/blacklist/${discordUserId}`, {
        method: 'DELETE',
        headers: { 'x-community-id': communityId },
      });
      if (res.ok) {
        setSuccess('Member removed from blacklist.');
        fetchData();
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to remove from blacklist.');
      }
    } catch (err) {
      setError('Network error removing from blacklist.');
    }
  };

  const handleCreateRestriction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restrictionTargetId || !restrictionReason) return;
    try {
      const res = await fetch('/api/v1/moderation/restrictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          targetDiscordUserId: restrictionTargetId,
          restrictionType,
          reason: restrictionReason,
          expiresDays: restrictionExpiresDays ? Number(restrictionExpiresDays) : undefined,
        }),
      });

      if (res.ok) {
        setRestrictionTargetId('');
        setRestrictionReason('');
        setRestrictionExpiresDays('');
        setSuccess('Restriction applied successfully.');
        fetchData();
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to apply restriction.');
      }
    } catch (err) {
      setError('Network error applying restriction.');
    }
  };

  const handleRevokeRestriction = async (restrictionId: string) => {
    try {
      const res = await fetch(`/api/v1/moderation/restrictions/${restrictionId}/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({ notes: 'Revoked by moderator' }),
      });
      if (res.ok) {
        setSuccess('Restriction revoked.');
        fetchData();
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to revoke restriction.');
      }
    } catch (err) {
      setError('Network error revoking restriction.');
    }
  };

  return (
    <div id="moderation-module" className="space-y-6">
      {/* Module Banner */}
      <div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
            COMMUNITY SCOPE
          </span>
          <span className="rounded bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-600">
            MODERATION & SAFETY ENGINE
          </span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          Trust, Safety & Moderation Control
        </h1>
        <p className="text-sm text-slate-500">
          Authoritative community safety management: staff warnings, safety incident escalation, auto-moderation rules, blacklist enforcement, member restrictions, and security audit logs.
        </p>
      </div>

      {/* Primary Sub-Navigation Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        <button
          onClick={() => setActiveTab('warnings')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors whitespace-nowrap ${
            activeTab === 'warnings'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <ShieldAlert className="h-4 w-4" />
          Warnings ({warnings.length})
        </button>

        <button
          onClick={() => setActiveTab('incidents')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors whitespace-nowrap ${
            activeTab === 'incidents'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <AlertOctagon className="h-4 w-4" />
          Safety Incidents ({incidents.length})
        </button>

        <button
          onClick={() => setActiveTab('automod')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors whitespace-nowrap ${
            activeTab === 'automod'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Sliders className="h-4 w-4" />
          Auto-Moderation ({autoModRules.length})
        </button>

        <button
          onClick={() => setActiveTab('blacklist')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors whitespace-nowrap ${
            activeTab === 'blacklist'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Ban className="h-4 w-4" />
          Blacklist ({blacklist.length})
        </button>

        <button
          onClick={() => setActiveTab('restrictions')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors whitespace-nowrap ${
            activeTab === 'restrictions'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Lock className="h-4 w-4" />
          Restrictions ({restrictions.length})
        </button>

        <button
          onClick={() => setActiveTab('security-audit')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-colors whitespace-nowrap ${
            activeTab === 'security-audit'
              ? 'border-rose-600 text-rose-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText className="h-4 w-4" />
          Security Audit
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-800 flex justify-between items-center">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="text-red-600 hover:underline">Dismiss</button>
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 flex justify-between items-center">
          <span>🛡️ {success}</span>
          <button onClick={() => setSuccess(null)} className="text-emerald-600 hover:underline">Dismiss</button>
        </div>
      )}

      {/* TAB 1: WARNINGS */}
      {activeTab === 'warnings' && (
        <div className="grid gap-6 md:grid-cols-3">
          {/* Issue Warning Form */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:col-span-1 h-fit">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-600" />
              Issue Staff Warning
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Dispatches Direct Message logs & updates member trust scores.</p>
            <form onSubmit={handleIssueWarning} className="mt-4 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Target Discord ID</label>
                <div className="mt-1"><MemberSelect value={targetUserId} onChange={(id) => setTargetUserId(id)} /></div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Severity Level</label>
                <select
                  value={warningSeverity}
                  onChange={(e) => setWarningSeverity(e.target.value as any)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                >
                  <option value="LOW">LOW (Informational)</option>
                  <option value="MEDIUM">MEDIUM (Restricted Benefits)</option>
                  <option value="HIGH">HIGH (Quarantine & Review)</option>
                  <option value="CRITICAL">CRITICAL (Escalate to Incident)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Expiration (Days)</label>
                <input
                  type="number"
                  value={warningExpiresDays}
                  onChange={(e) => setWarningExpiresDays(e.target.value ? Number(e.target.value) : '')}
                  placeholder="Leave empty for non-expiring"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:border-indigo-500 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Reason / Incident Detail</label>
                <textarea
                  value={warningReason}
                  onChange={(e) => setWarningReason(e.target.value)}
                  placeholder="Observed spamming invite codes in off-topic channel..."
                  rows={4}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs focus:border-indigo-500 focus:ring-indigo-500"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-rose-600 py-2 text-xs font-bold text-white hover:bg-rose-700"
              >
                Issue & Log Warning
              </button>
            </form>
          </div>

          {/* Warning List */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:col-span-2 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-bold text-slate-900">Incident Warning History</h3>
                <p className="text-xs text-slate-500">Authorized historical infractions within this community tenant.</p>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search logs..."
                  className="pl-8 pr-3 py-1.5 rounded-md border border-slate-300 text-xs w-48 focus:outline-hidden focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-3">
              {loading ? (
                <div className="text-center py-6 text-xs text-slate-400">Fetching community warning logs...</div>
              ) : warnings.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">Server is fully healthy. No warnings recorded.</div>
              ) : (
                warnings
                  .filter((w) => (w.discordUserId || '').toLowerCase().includes(searchQuery.toLowerCase()) || (w.reason || '').toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((w: any) => (
                    <div key={w.id} className="rounded-lg border border-slate-100 bg-slate-50 p-4 flex flex-col sm:flex-row sm:items-start gap-4">
                      <div className="shrink-0">
                        {w.severity === 'CRITICAL' || w.severity === 'HIGH' ? (
                          <AlertOctagon className="h-8 w-8 text-rose-600 bg-rose-50 p-1.5 rounded-lg border border-rose-200" />
                        ) : (
                          <AlertTriangle className={`h-8 w-8 p-1.5 rounded-lg border ${w.severity === 'MEDIUM' ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-slate-600 bg-slate-50 border-slate-200'}`} />
                        )}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-800">Target ID: {w.discordUserId}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{new Date(w.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-xs text-slate-600 bg-white p-2 rounded border border-slate-100 whitespace-pre-wrap">{w.reason}</p>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                          <span>Mod: {w.moderatorId} • Severity: {w.severity} • Status: <span className={w.status === 'ACTIVE' ? 'font-bold text-amber-600' : 'text-slate-400'}>{w.status}</span></span>
                          {w.status === 'ACTIVE' && (
                            <button onClick={() => handleRevokeWarning(w.id)} className="text-rose-600 hover:underline font-sans font-bold text-[11px]">
                              Revoke Warning
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INCIDENTS */}
      {activeTab === 'incidents' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-900">Safety Incidents Dashboard</h3>
              <p className="text-xs text-slate-500">Track and coordinate high-severity safety incident reviews and resolutions.</p>
            </div>
            <button
              onClick={() => setShowIncidentModal(true)}
              className="flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Report New Incident
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {incidents.length === 0 ? (
              <div className="md:col-span-2 text-center py-12 rounded-xl border border-slate-200 bg-white p-6 text-xs text-slate-400">
                No active safety incidents reported for this community.
              </div>
            ) : (
              incidents.map((inc: any) => (
                <div key={inc.id} className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
                  <div className="flex justify-between items-start">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      inc.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                      inc.severity === 'HIGH' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {inc.severity} SEVERITY
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      inc.status === 'OPEN' ? 'bg-blue-50 text-blue-700' :
                      inc.status === 'RESOLVED' ? 'bg-emerald-50 text-emerald-700' :
                      'bg-slate-50 text-slate-600'
                    }`}>
                      {inc.status}
                    </span>
                  </div>

                  <h4 className="font-bold text-slate-900 text-sm">{inc.title}</h4>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap">{inc.description}</p>

                  {inc.affectedMembers && inc.affectedMembers.length > 0 && (
                    <div className="text-[11px] text-slate-500">
                      <span className="font-semibold">Affected Members:</span> {inc.affectedMembers.join(', ')}
                    </div>
                  )}

                  <div className="flex justify-between items-center pt-2 border-t border-slate-100 text-[11px]">
                    <span className="text-slate-400">{new Date(inc.createdAt).toLocaleDateString()}</span>
                    <div className="flex gap-2">
                      {inc.status === 'OPEN' && (
                        <button
                          onClick={() => handleUpdateIncidentStatus(inc.id, 'INVESTIGATING')}
                          className="text-indigo-600 font-bold hover:underline"
                        >
                          Investigate
                        </button>
                      )}
                      {inc.status !== 'RESOLVED' && (
                        <button
                          onClick={() => setSelectedIncident(inc)}
                          className="text-emerald-600 font-bold hover:underline"
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Incident Creation Modal */}
          {showIncidentModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
              <div className="w-full max-w-md rounded-xl bg-white p-6 space-y-4">
                <h3 className="font-bold text-slate-900 text-base">Report Safety Incident</h3>
                <form onSubmit={handleCreateIncident} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase">Incident Title</label>
                    <input
                      type="text"
                      value={incidentTitle}
                      onChange={(e) => setIncidentTitle(e.target.value)}
                      placeholder="E.g. Mass spam attack in General channel"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase">Severity</label>
                    <select
                      value={incidentSeverity}
                      onChange={(e) => setIncidentSeverity(e.target.value as any)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                    >
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="CRITICAL">CRITICAL</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase">Affected Member Discord IDs (comma-separated)</label>
                    <input
                      type="text"
                      value={incidentAffectedMembers}
                      onChange={(e) => setIncidentAffectedMembers(e.target.value)}
                      placeholder="12345, 67890"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase">Description & Details</label>
                    <textarea
                      value={incidentDescription}
                      onChange={(e) => setIncidentDescription(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowIncidentModal(false)}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                    >
                      Submit Incident Report
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Resolve Incident Modal */}
          {selectedIncident && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
              <div className="w-full max-w-md rounded-xl bg-white p-6 space-y-4">
                <h3 className="font-bold text-slate-900 text-base">Resolve Incident: {selectedIncident.title}</h3>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase">Resolution Notes</label>
                  <textarea
                    value={incidentResolution}
                    onChange={(e) => setIncidentResolution(e.target.value)}
                    placeholder="Describe actions taken to resolve..."
                    rows={3}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setSelectedIncident(null)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleUpdateIncidentStatus(selectedIncident.id, 'RESOLVED', incidentResolution)}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    Mark Resolved
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AUTOMOD */}
      {activeTab === 'automod' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-slate-900">Auto-Moderation Engine</h3>
              <p className="text-xs text-slate-500">Configure automated keyword, link, mention, and flood guards.</p>
            </div>
            <button
              onClick={() => setShowAutoModModal(true)}
              className="flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add AutoMod Rule
            </button>
          </div>

          <div className="space-y-3">
            {autoModRules.length === 0 ? (
              <div className="text-center py-12 rounded-xl border border-slate-200 bg-white p-6 text-xs text-slate-400">
                No active auto-moderation rules configured.
              </div>
            ) : (
              autoModRules.map((rule: any) => (
                <div key={rule.id} className="rounded-xl border border-slate-200 bg-white p-4 flex justify-between items-center">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{rule.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700">{rule.ruleType}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-50 text-rose-700">Action: {rule.action}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Priority: {rule.priority} • Cooldown: {rule.cooldownSeconds}s
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleAutoModRule(rule.id, rule.enabled)}
                    className={`px-3 py-1 rounded text-xs font-bold ${
                      rule.enabled ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {rule.enabled ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              ))
            )}
          </div>

          {/* AutoMod Rule Modal */}
          {showAutoModModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
              <div className="w-full max-w-md rounded-xl bg-white p-6 space-y-4">
                <h3 className="font-bold text-slate-900 text-base">Configure AutoMod Rule</h3>
                <form onSubmit={handleCreateAutoModRule} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase">Rule Name</label>
                    <input
                      type="text"
                      value={ruleName}
                      onChange={(e) => setRuleName(e.target.value)}
                      placeholder="E.g. Filter Malicious Keywords"
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase">Rule Type</label>
                    <select
                      value={ruleType}
                      onChange={(e) => setRuleType(e.target.value as any)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                    >
                      <option value="KEYWORD_PATTERN">KEYWORD_PATTERN</option>
                      <option value="LINK_PATTERN">LINK_PATTERN</option>
                      <option value="MENTION_PATTERN">MENTION_PATTERN</option>
                      <option value="SPAM_FREQUENCY">SPAM_FREQUENCY</option>
                      <option value="REPEATED_MESSAGE">REPEATED_MESSAGE</option>
                    </select>
                  </div>

                  {ruleType === 'KEYWORD_PATTERN' && (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase">Keywords (comma-separated)</label>
                      <input
                        type="text"
                        value={ruleKeywords}
                        onChange={(e) => setRuleKeywords(e.target.value)}
                        placeholder="scam, hack, free nitro"
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                        required
                      />
                    </div>
                  )}

                  {ruleType === 'MENTION_PATTERN' && (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 uppercase">Max Mentions</label>
                      <input
                        type="number"
                        value={ruleMaxMentions}
                        onChange={(e) => setRuleMaxMentions(Number(e.target.value))}
                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                      />
                    </div>
                  )}

                  {ruleType === 'SPAM_FREQUENCY' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase">Max Messages</label>
                        <input
                          type="number"
                          value={ruleMaxMessages}
                          onChange={(e) => setRuleMaxMessages(Number(e.target.value))}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase">Window (Seconds)</label>
                        <input
                          type="number"
                          value={ruleWindowSeconds}
                          onChange={(e) => setRuleWindowSeconds(Number(e.target.value))}
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase">Action</label>
                    <select
                      value={ruleAction}
                      onChange={(e) => setRuleAction(e.target.value as any)}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                    >
                      <option value="LOG">LOG ONLY</option>
                      <option value="WARN">WARN MEMBER</option>
                      <option value="DELETE_MESSAGE">DELETE MESSAGE</option>
                      <option value="TIMEOUT">TIMEOUT MEMBER</option>
                    </select>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAutoModModal(false)}
                      className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                    >
                      Save Rule
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: BLACKLIST */}
      {activeTab === 'blacklist' && (
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:col-span-1 h-fit">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Ban className="h-4 w-4 text-rose-600" />
              Add to Blacklist
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Permanently or temporarily restrict Discord User IDs from applying or interacting.</p>
            <form onSubmit={handleAddBlacklist} className="mt-4 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Discord User ID</label>
                <input
                  type="text"
                  value={blacklistUserId}
                  onChange={(e) => setBlacklistUserId(e.target.value)}
                  placeholder="E.g. 123456789012345678"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Expiration (Days)</label>
                <input
                  type="number"
                  value={blacklistExpiresDays}
                  onChange={(e) => setBlacklistExpiresDays(e.target.value ? Number(e.target.value) : '')}
                  placeholder="Leave empty for permanent"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Blacklist Reason</label>
                <textarea
                  value={blacklistReason}
                  onChange={(e) => setBlacklistReason(e.target.value)}
                  placeholder="Reason for blacklisting..."
                  rows={3}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-rose-600 py-2 text-xs font-bold text-white hover:bg-rose-700"
              >
                Add to Blacklist
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:col-span-2 space-y-4">
            <h3 className="font-bold text-slate-900">Active Blacklist Directory</h3>
            <div className="space-y-3">
              {blacklist.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">No active blacklist entries.</div>
              ) : (
                blacklist.map((item: any) => (
                  <div key={item.id} className="rounded-lg border border-slate-100 bg-slate-50 p-4 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-xs text-slate-900">User ID: {item.discordUserId}</div>
                      <p className="text-xs text-slate-600 mt-1">{item.reason}</p>
                      <div className="text-[10px] text-slate-400 font-mono mt-1">
                        By: {item.actor} • Added: {new Date(item.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveBlacklist(item.discordUserId)}
                      className="text-xs font-bold text-rose-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: RESTRICTIONS */}
      {activeTab === 'restrictions' && (
        <div className="grid gap-6 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:col-span-1 h-fit">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <Lock className="h-4 w-4 text-rose-600" />
              Apply Member Restriction
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Enforce target channel access, role removal, or timeout restrictions.</p>
            <form onSubmit={handleCreateRestriction} className="mt-4 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Target Discord User ID</label>
                <div className="mt-1"><MemberSelect value={restrictionTargetId} onChange={(id) => setRestrictionTargetId(id)} /></div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Restriction Type</label>
                <select
                  value={restrictionType}
                  onChange={(e) => setRestrictionType(e.target.value as any)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                >
                  <option value="TIMEOUT">TIMEOUT (Gateway Mute)</option>
                  <option value="CHANNEL_ACCESS">CHANNEL_ACCESS (Restricted Channels)</option>
                  <option value="ROLE_REMOVAL">ROLE_REMOVAL (Remove Special Roles)</option>
                  <option value="FEATURE_RESTRICTION">FEATURE_RESTRICTION (Block Applications)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Expires (Days)</label>
                <input
                  type="number"
                  value={restrictionExpiresDays}
                  onChange={(e) => setRestrictionExpiresDays(e.target.value ? Number(e.target.value) : '')}
                  placeholder="Leave empty for indefinite"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase">Reason</label>
                <textarea
                  value={restrictionReason}
                  onChange={(e) => setRestrictionReason(e.target.value)}
                  placeholder="Reason for restriction..."
                  rows={3}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  required
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-md bg-rose-600 py-2 text-xs font-bold text-white hover:bg-rose-700"
              >
                Apply Restriction
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs md:col-span-2 space-y-4">
            <h3 className="font-bold text-slate-900">Active Member Restrictions</h3>
            <div className="space-y-3">
              {restrictions.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">No active restrictions applied.</div>
              ) : (
                restrictions.map((res: any) => (
                  <div key={res.id} className="rounded-lg border border-slate-100 bg-slate-50 p-4 flex justify-between items-center">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">Target: {res.targetDiscordUserId}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-50 text-rose-700">{res.restrictionType}</span>
                        <span className="text-[10px] font-mono text-slate-500">Status: {res.status}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{res.reason}</p>
                    </div>
                    {res.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleRevokeRestriction(res.id)}
                        className="text-xs font-bold text-rose-600 hover:underline"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: SECURITY AUDIT */}
      {activeTab === 'security-audit' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h3 className="font-bold text-slate-900">Security & Moderation Audit Trail</h3>
              <p className="text-xs text-slate-500">Immutable, sanitized audit timeline of all moderation actions and security events.</p>
            </div>
            <button
              onClick={fetchData}
              className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh Log
            </button>
          </div>

          {/* Audit Filters */}
          <div className="grid gap-3 sm:grid-cols-3 bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Filter Actor</label>
              <input
                type="text"
                value={auditFilterActor}
                onChange={(e) => setAuditFilterActor(e.target.value)}
                placeholder="User ID or SYSTEM"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Filter Target</label>
              <input
                type="text"
                value={auditFilterTarget}
                onChange={(e) => setAuditFilterTarget(e.target.value)}
                placeholder="Target ID"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase">Filter Action</label>
              <input
                type="text"
                value={auditFilterAction}
                onChange={(e) => setAuditFilterAction(e.target.value)}
                placeholder="E.g. WARNING, BAN, TIMEOUT"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
              />
            </div>
          </div>

          {/* Audit Timeline */}
          <div className="space-y-2">
            {loading ? (
              <div className="text-center py-8 text-xs text-slate-400">Loading audit trail...</div>
            ) : auditLogs.length === 0 ? (
              <div className="text-center py-12 rounded-lg border border-slate-100 bg-slate-50 p-6 text-xs text-slate-400">
                INSUFFICIENT_DATA: No security audit records match the current filter criteria.
              </div>
            ) : (
              auditLogs.map((log: any) => (
                <div key={log.id} className="rounded-md border border-slate-100 bg-slate-50/50 p-3 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{log.action}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">{log.type}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="text-slate-600 font-mono text-[11px]">
                      Actor: <span className="font-bold text-slate-800">{log.actor}</span> • Target: <span className="font-bold text-slate-800">{log.target}</span>
                    </div>
                    {log.reason && (
                      <div className="text-slate-500 text-[11px] bg-white p-1.5 rounded border border-slate-100 mt-1">
                        {log.reason}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-[10px] font-mono font-bold px-2 py-1 rounded bg-emerald-50 text-emerald-700">
                    {log.result || log.status}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
