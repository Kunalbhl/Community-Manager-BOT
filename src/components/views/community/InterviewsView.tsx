import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  User,
  CheckCircle,
  XCircle,
  RefreshCw,
  Mic,
  ShieldCheck,
  MessageSquare,
  Users,
  LogOut,
  LogIn,
  Settings2,
  Trash2,
  AlertCircle,
  Clock3,
} from 'lucide-react';
import { UserRole } from '../../../../shared/types/rbac.js';

interface InterviewsViewProps {
  communityId: string;
  currentRole: UserRole;
}

export const InterviewsView: React.FC<InterviewsViewProps> = ({
  communityId,
  currentRole,
}) => {
  const [activeTab, setActiveTab] = useState<'sessions' | 'introductions' | 'audit'>('sessions');
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedInterviewId, setSelectedInterviewId] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<any | null>(null);
  const [introConfig, setIntroConfig] = useState<any>({
    defaultIntroduction: "Hello everyone, I'm {displayName} joining as a {role} for this evaluation.",
    roleIntroductions: {
      OWNER: "Greetings! I'm {displayName}, Community Owner, overseeing today's interview.",
      CONTROLLER: "Hello candidate! I'm {displayName}, Community Controller, conducting the evaluation.",
      INTERVIEWER: "Hi there! I'm {displayName}, Staff Interviewer. Let's get started.",
      RECRUITER: "Hey! I'm {displayName}, your Recruiter. Welcome to the interview session.",
    },
    userIntroductions: {},
  });
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isStaff = ['PLATFORM_OWNER', 'OWNER', 'CONTROLLER', 'INTERVIEWER', 'RECRUITER'].includes(currentRole);

  const fetchInterviews = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/interviews?communityId=${encodeURIComponent(communityId)}`, {
        headers: { 'x-user-role': currentRole, 'x-community-id': communityId },
      });
      if (res.ok) {
        const json = await res.json();
        setInterviews(json.data || []);
        if (json.data && json.data.length > 0 && !selectedInterviewId) {
          setSelectedInterviewId(json.data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load interviews:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSession = async (interviewId: string) => {
    try {
      const res = await fetch(`/api/v1/interviews/${interviewId}/session`, {
        headers: { 'x-user-role': currentRole, 'x-community-id': communityId },
      });
      if (res.ok) {
        const json = await res.json();
        setSessionData(json.data);
      }
    } catch (err) {
      console.error('Failed to load session:', err);
    }
  };

  const fetchIntroductions = async () => {
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/interview-introductions`, {
        headers: { 'x-user-role': currentRole, 'x-community-id': communityId },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setIntroConfig({
            defaultIntroduction: json.data.defaultIntroduction || '',
            roleIntroductions: json.data.roleIntroductions || {},
            userIntroductions: json.data.userIntroductions || {},
          });
        }
      }
    } catch (err) {
      console.error('Failed to load introductions:', err);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/audit-logs?limit=50`, {
        headers: { 'x-user-role': currentRole, 'x-community-id': communityId },
      });
      if (res.ok) {
        const json = await res.json();
        setAuditLogs(json.data || []);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    }
  };

  useEffect(() => {
    fetchInterviews();
    fetchIntroductions();
    fetchAuditLogs();
  }, [communityId, currentRole]);

  useEffect(() => {
    if (selectedInterviewId) {
      fetchSession(selectedInterviewId);
    }
  }, [selectedInterviewId]);

  const handleJoinInterview = async (interviewId: string) => {
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/v1/interviews/${interviewId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          discordUserId: 'disc_actor_web',
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setStatusMessage(json.message || 'Successfully joined live interview session');
        fetchSession(interviewId);
        fetchAuditLogs();
      } else {
        setErrorMessage(json.message || 'Failed to join interview');
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleLeaveInterview = async (interviewId: string) => {
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/v1/interviews/${interviewId}/leave`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          discordUserId: 'disc_actor_web',
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setStatusMessage(json.message || 'Left live interview session');
        fetchSession(interviewId);
        fetchAuditLogs();
      } else {
        setErrorMessage(json.message || 'Failed to leave interview');
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleSaveIntroductions = async () => {
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/interview-introductions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify(introConfig),
      });

      const json = await res.json();
      if (res.ok) {
        setStatusMessage('Interview introductions updated successfully');
      } else {
        setErrorMessage(json.message || 'Failed to update introductions');
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleTriggerRetentionCleanup = async () => {
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/audit-logs/cleanup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
      });

      const json = await res.json();
      if (res.ok) {
        setStatusMessage(json.message || 'Audit retention cleanup completed');
        fetchAuditLogs();
      } else {
        setErrorMessage(json.message || 'Failed to execute cleanup');
      }
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const selectedInterview = interviews.find((i) => i.id === selectedInterviewId);

  return (
    <div id="interviews-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              TASK 58 DISCORD IDENTITY
            </span>
            <span className="rounded bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              30-DAY RETENTION ACTIVE
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Interview Management & Multi-Authority Live Join
          </h1>
          <p className="text-sm text-slate-500">
            Authoritative Discord role-based live evaluations, structured introductions, and compliant 30-day security audit logs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-refresh-interviews"
            onClick={() => {
              fetchInterviews();
              fetchAuditLogs();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-8">
          <button
            id="tab-interviews-sessions"
            onClick={() => setActiveTab('sessions')}
            className={`flex items-center gap-2 border-b-2 py-4 text-sm font-medium ${
              activeTab === 'sessions'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            <Mic className="h-4 w-4" />
            Live Interview Sessions ({interviews.length})
          </button>

          <button
            id="tab-interviews-intros"
            onClick={() => setActiveTab('introductions')}
            className={`flex items-center gap-2 border-b-2 py-4 text-sm font-medium ${
              activeTab === 'introductions'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            Introduction Templates
          </button>

          <button
            id="tab-interviews-audit"
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 border-b-2 py-4 text-sm font-medium ${
              activeTab === 'audit'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            30-Day Audit Retention Trail ({auditLogs.length})
          </button>
        </nav>
      </div>

      {/* Alerts */}
      {statusMessage && (
        <div id="status-success-banner" className="flex items-center gap-2 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800 border border-emerald-200">
          <CheckCircle className="h-4 w-4 text-emerald-600" />
          <span>{statusMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div id="status-error-banner" className="flex items-center gap-2 rounded-lg bg-rose-50 p-4 text-sm text-rose-800 border border-rose-200">
          <AlertCircle className="h-4 w-4 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Tab 1: Live Sessions */}
      {activeTab === 'sessions' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left Column: Interview List */}
          <div className="space-y-3 lg:col-span-1">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Evaluations ({interviews.length})
            </h3>
            {interviews.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center bg-slate-50">
                <Calendar className="mx-auto h-8 w-8 text-slate-400" />
                <p className="mt-2 text-sm text-slate-600 font-medium">No interviews scheduled</p>
                <p className="text-xs text-slate-400 mt-1">
                  Scheduled candidate evaluations will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {interviews.map((item) => (
                  <button
                    key={item.id}
                    id={`interview-item-${item.id}`}
                    onClick={() => setSelectedInterviewId(item.id)}
                    className={`w-full text-left rounded-xl border p-4 transition-all ${
                      selectedInterviewId === item.id
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-slate-700">
                        {item.id}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          item.status === 'IN_PROGRESS'
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.status === 'SCHEDULED'
                            ? 'bg-blue-100 text-blue-800'
                            : item.status === 'COMPLETED'
                            ? 'bg-slate-100 text-slate-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
                      <User className="h-3.5 w-3.5 text-slate-400" />
                      <span>Candidate: <code className="text-slate-800">{item.applicantDiscordId || item.applicantDiscordUserId || 'Applicant'}</code></span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      <span>{item.scheduledTime ? new Date(item.scheduledTime).toLocaleString() : 'Scheduled'}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Live Session Room & Participants */}
          <div className="lg:col-span-2">
            {selectedInterview ? (
              <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-900">
                        Live Room: {selectedInterview.id}
                      </h2>
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                        {selectedInterview.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Candidate Discord ID: <code className="font-mono">{selectedInterview.applicantDiscordId || selectedInterview.applicantDiscordUserId}</code>
                    </p>
                  </div>

                  {isStaff && (
                    <div className="flex items-center gap-2">
                      <button
                        id="btn-join-live-interview"
                        onClick={() => handleJoinInterview(selectedInterview.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 shadow-sm"
                      >
                        <LogIn className="h-3.5 w-3.5" />
                        Join Live Interview
                      </button>
                      <button
                        id="btn-leave-live-interview"
                        onClick={() => handleLeaveInterview(selectedInterview.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Leave
                      </button>
                    </div>
                  )}
                </div>

                {/* Multi-Authority Participants List */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <Users className="h-4 w-4 text-indigo-600" />
                      Participating Authorities & Interviewers
                    </h3>
                    <span className="text-xs text-slate-500">
                      Authoritative Discord IDs verified
                    </span>
                  </div>

                  {sessionData?.participants && sessionData.participants.length > 0 ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {sessionData.participants.map((p: any) => (
                        <div
                          key={p.discordUserId}
                          id={`participant-${p.discordUserId}`}
                          className={`flex items-start justify-between rounded-lg border p-3 ${
                            p.isActive
                              ? 'border-emerald-200 bg-emerald-50/40'
                              : 'border-slate-200 bg-slate-50 opacity-75'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm text-slate-900">
                                {p.displayName || p.username}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                                  p.role === 'OWNER' || p.role === 'PLATFORM_OWNER'
                                    ? 'bg-purple-100 text-purple-800'
                                    : p.role === 'CONTROLLER'
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : p.role === 'INTERVIEWER'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {p.role}
                              </span>
                            </div>
                            <p className="font-mono text-xs text-slate-500">
                              ID: {p.discordUserId}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              Joined: {new Date(p.joinedAt).toLocaleTimeString()}
                              {p.leftAt ? ` • Left: ${new Date(p.leftAt).toLocaleTimeString()}` : ''}
                            </p>
                          </div>

                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              p.isActive
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                p.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                              }`}
                            />
                            {p.isActive ? 'IN ROOM' : 'DEPARTED'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                      No authorities have joined this interview room yet. Click <strong>Join Live Interview</strong> or type <code>/interview</code> in Discord.
                    </div>
                  )}
                </div>

                {/* Introduction Message Hierarchy Preview */}
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-indigo-600" />
                    Automated Introduction Template Hierarchy
                  </h4>
                  <p className="mt-1 text-xs text-indigo-800">
                    When an authority joins this room, the Discord Bot automatically posts their introduction message resolved from: <code>User Override &gt; Role Template &gt; Community Default &gt; Standard Template</code>.
                  </p>
                  <div className="mt-3 rounded border border-indigo-200/60 bg-white p-2.5 text-xs font-mono text-slate-700">
                    &quot;{introConfig.roleIntroductions?.[currentRole] || introConfig.defaultIntroduction}&quot;
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500">
                Select an interview session on the left to view live authorities and controls.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Introduction Templates */}
      {activeTab === 'introductions' && (
        <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Configurable Introduction Messages
            </h2>
            <p className="text-sm text-slate-500">
              Customize the automated announcement messages delivered when authorities join live Discord voice channels.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Community Default Introduction
              </label>
              <p className="text-xs text-slate-500 mb-1">
                Used if no role-specific or user-specific override is set. Placeholders: <code>{'{displayName}'}</code>, <code>{'{username}'}</code>, <code>{'{role}'}</code>, <code>{'{communityName}'}</code>.
              </p>
              <textarea
                id="input-default-intro"
                rows={2}
                value={introConfig.defaultIntroduction || ''}
                onChange={(e) =>
                  setIntroConfig({ ...introConfig, defaultIntroduction: e.target.value })
                }
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm font-mono text-slate-800 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                Role-Specific Introduction Templates
              </h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {(['OWNER', 'CONTROLLER', 'INTERVIEWER', 'RECRUITER'] as const).map((role) => (
                  <div key={role} className="rounded-lg border border-slate-200 p-3 bg-slate-50/50">
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      {role} Template
                    </label>
                    <input
                      id={`input-intro-${role}`}
                      type="text"
                      value={introConfig.roleIntroductions?.[role] || ''}
                      onChange={(e) =>
                        setIntroConfig({
                          ...introConfig,
                          roleIntroductions: {
                            ...introConfig.roleIntroductions,
                            [role]: e.target.value,
                          },
                        })
                      }
                      className="w-full rounded border border-slate-300 p-2 text-xs font-mono text-slate-800 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                id="btn-save-introductions"
                onClick={handleSaveIntroductions}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 shadow-sm"
              >
                <CheckCircle className="h-4 w-4" />
                Save Introduction Configurations
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: 30-Day Audit Retention Trail */}
      {activeTab === 'audit' && (
        <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  Security &amp; Action Audit Trail
                </h2>
                <span className="rounded bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800 flex items-center gap-1">
                  <Clock3 className="h-3 w-3" />
                  30-Day Automated Retention Window
                </span>
              </div>
              <p className="text-sm text-slate-500">
                All bot commands, interview joins, permissions checks, and recruitment actions are immutably logged with authoritative Discord User IDs.
              </p>
            </div>

            {['PLATFORM_OWNER', 'OWNER', 'CONTROLLER'].includes(currentRole) && (
              <button
                id="btn-purge-expired-audit-logs"
                onClick={handleTriggerRetentionCleanup}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                Trigger 30-Day Retention Cleanup
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Actor Discord ID</th>
                  <th className="px-4 py-3">Effective Role</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Retention Expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      No security audit events recorded within active retention period.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        {new Date(log.timestamp || log.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-slate-900">
                        {log.discordUserId || log.actorUserId}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            log.effectiveRole === 'OWNER' || log.effectiveRole === 'PLATFORM_OWNER'
                              ? 'bg-purple-100 text-purple-800'
                              : log.effectiveRole === 'CONTROLLER'
                              ? 'bg-indigo-100 text-indigo-800'
                              : log.effectiveRole === 'INTERVIEWER'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                        >
                          {log.effectiveRole || log.actorRole || 'MEMBER'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-indigo-700">
                        {log.action}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {log.targetType}:{log.targetId}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono">
                          {log.source || 'SYSTEM'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-400 font-mono">
                        {log.expiresAt ? new Date(log.expiresAt).toLocaleDateString() : '30d auto'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
