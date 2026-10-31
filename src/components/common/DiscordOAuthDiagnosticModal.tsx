import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Bot,
  Key,
  Database,
  Lock,
  Server,
  Code,
  Clock,
  ChevronDown,
  ChevronRight,
  UserCheck,
  Zap,
} from 'lucide-react';
import { Modal } from './Modal.js';
import { getDiscordLoginUrl } from '../../lib/discordUrls.js';

interface OAuthStepTrace {
  step: 'STATE_VALIDATION' | 'PKCE_VERIFICATION' | 'CODE_EXCHANGE' | 'USER_FETCH' | 'SESSION_PERSISTENCE';
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';
  timestamp: string;
  durationMs?: number;
  details?: Record<string, any>;
  error?: string;
}

interface OAuthFlowTrace {
  traceId: string;
  timestamp: string;
  clientIp?: string;
  userAgent?: string;
  requestOrigin?: string;
  params: {
    hasCode: boolean;
    codePreview?: string;
    hasState: boolean;
    state?: string;
    hasError: boolean;
    error?: string;
    errorDescription?: string;
  };
  cookies: {
    hasStateCookie: boolean;
    cookieStateMatches: boolean;
    hasVerifierCookie: boolean;
    hasExistingSession: boolean;
  };
  steps: OAuthStepTrace[];
  finalStatus: 'SUCCESS' | 'FAILED';
  failedAtStep?: string;
  failureReason?: string;
  resolvedUser?: {
    id: string;
    username: string;
    discriminator: string;
    email?: string;
  };
  sessionCreated?: boolean;
}

interface AuthDiagnosticsResponse {
  summary: {
    totalTracedFlows: number;
    successfulFlows: number;
    failedFlows: number;
    successRate: string;
    failureByStep: Record<string, number>;
  };
  databaseStats: {
    activePendingOAuthStates: number;
    consumedOAuthStates: number;
    persistedSessions: number;
    persistedUsers: number;
  };
  config: {
    clientIdConfigured: boolean;
    clientIdMasked: string | null;
    clientSecretConfigured: boolean;
    clientSecretLength: number;
    redirectUri: string;
    appUrl: string;
    platformOwnerEmailConfigured: boolean;
    platformOwnerUserIdConfigured: boolean;
    pkceEnforced: boolean;
    simulationBypassAllowed: boolean;
  };
  recentTraces: OAuthFlowTrace[];
  recommendations: string[];
}

interface DiscordOAuthDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess?: () => void;
}

export const DiscordOAuthDiagnosticModal: React.FC<DiscordOAuthDiagnosticModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [data, setData] = useState<AuthDiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  const [testLoginInProgress, setTestLoginInProgress] = useState<boolean>(false);

  const fetchDiagnostics = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/diagnostics');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setData(json.data);
          if (json.data.recentTraces?.length > 0 && !expandedTraceId) {
            setExpandedTraceId(json.data.recentTraces[0].traceId);
          }
        }
      }
    } catch (err) {
      console.error('Failed fetching auth diagnostics', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDiagnostics();
    }
  }, [isOpen]);

  const handleTestOAuth = () => {
    setTestLoginInProgress(true);
    const width = 540;
    const height = 750;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const loginUrl = getDiscordLoginUrl();
    const popup = window.open(
      loginUrl,
      'discord_oauth_diagnostic_popup',
      `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes`
    );

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'DISCORD_AUTH_SUCCESS' || event.data?.type === 'DISCORD_AUTH_ERROR') {
        window.removeEventListener('message', handleMessage);
        setTestLoginInProgress(false);
        // Refresh diagnostics after attempt
        setTimeout(fetchDiagnostics, 400);
        if (event.data?.type === 'DISCORD_AUTH_SUCCESS' && onLoginSuccess) {
          onLoginSuccess();
        }
      }
    };

    window.addEventListener('message', handleMessage);

    if (!popup) {
      setTestLoginInProgress(false);
      window.location.href = loginUrl;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Discord OAuth Flow Diagnostics"
      maxWidth="max-w-4xl"
    >
      <div className="space-y-6 text-slate-800">
        {/* TOP STATUS BAR */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-indigo-600" />
            <span className="text-sm font-semibold text-slate-900">
              Diagnostic & Trace Inspector
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-600">
              RFC 7636 PKCE S256
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchDiagnostics}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-50 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
              <span>Refresh Traces</span>
            </button>

            <button
              onClick={handleTestOAuth}
              disabled={testLoginInProgress}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 transition"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>{testLoginInProgress ? 'Testing in popup...' : 'Test OAuth Flow'}</span>
            </button>
          </div>
        </div>

        {/* CONFIG & DB SUMMARY METRICS */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Key className="h-3.5 w-3.5 text-indigo-600" />
                <span>Discord Client</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                {data.config.clientIdConfigured ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                )}
                <span className="font-mono text-xs font-semibold text-slate-800 truncate">
                  {data.config.clientIdMasked || 'Not Configured'}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Lock className="h-3.5 w-3.5 text-amber-600" />
                <span>Client Secret</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                {data.config.clientSecretConfigured ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                )}
                <span className="text-xs font-semibold text-slate-800">
                  {data.config.clientSecretConfigured ? 'Configured (Masked)' : 'Missing'}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Database className="h-3.5 w-3.5 text-blue-600" />
                <span>Active Sessions</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <UserCheck className="h-4 w-4 text-blue-600 shrink-0" />
                <span className="text-xs font-bold text-slate-900">
                  {data.databaseStats.persistedSessions} Persisted
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <ShieldAlert className="h-3.5 w-3.5 text-purple-600" />
                <span>Success Rate</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-sm font-bold text-slate-900">
                  {data.summary.successRate}
                </span>
                <span className="text-[11px] text-slate-500">
                  ({data.summary.successfulFlows}/{data.summary.totalTracedFlows})
                </span>
              </div>
            </div>
          </div>
        )}

        {/* REDIRECT URI NOTICE */}
        {data && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5">
            <div className="flex items-start gap-2.5">
              <Server className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" />
              <div className="text-xs space-y-1">
                <div className="font-semibold text-indigo-950">Authoritative Callback URI:</div>
                <div className="font-mono bg-white/80 px-2.5 py-1 rounded border border-indigo-200 text-indigo-900 break-all select-all">
                  {data.config.redirectUri}
                </div>
                <div className="text-[11px] text-indigo-700">
                  Ensure this exact URI is saved under <strong>Discord Developer Portal &gt; Applications &gt; OAuth2 &gt; Redirects</strong>.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP TRACE LOGS */}
        <div>
          <div className="flex items-center justify-between pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              OAuth Flow Step-by-Step Traces ({data?.recentTraces?.length || 0})
            </h3>
            <span className="text-[11px] text-slate-400">
              Logs identify: State Validation &bull; PKCE &bull; Code Exchange &bull; Profile Fetch &bull; Session Persistence
            </span>
          </div>

          {data && data.recentTraces?.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
              No recent OAuth callback traces recorded yet. Click <strong>Test OAuth Flow</strong> above to generate a live trace.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {data?.recentTraces.map((trace) => {
                const isExpanded = expandedTraceId === trace.traceId;
                return (
                  <div
                    key={trace.traceId}
                    className={`rounded-xl border transition ${
                      trace.finalStatus === 'SUCCESS'
                        ? 'border-emerald-200 bg-emerald-50/20'
                        : 'border-rose-200 bg-rose-50/20'
                    }`}
                  >
                    {/* TRACE SUMMARY ROW */}
                    <button
                      type="button"
                      onClick={() => setExpandedTraceId(isExpanded ? null : trace.traceId)}
                      className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50/60 transition rounded-xl"
                    >
                      <div className="flex items-center gap-2.5 overflow-hidden">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                        )}

                        {trace.finalStatus === 'SUCCESS' ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                        )}

                        <div className="overflow-hidden">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-slate-800">
                              {trace.traceId}
                            </span>
                            {trace.resolvedUser && (
                              <span className="text-xs font-semibold text-indigo-600 truncate">
                                @{trace.resolvedUser.username}
                              </span>
                            )}
                            <span
                              className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${
                                trace.finalStatus === 'SUCCESS'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {trace.finalStatus}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {new Date(trace.timestamp).toLocaleTimeString()} &bull; IP: {trace.clientIp || '127.0.0.1'} &bull; Code: {trace.params.hasCode ? 'Present' : 'Missing'} &bull; State: {trace.params.hasState ? 'Present' : 'Missing'}
                          </div>
                        </div>
                      </div>

                      {trace.failedAtStep && (
                        <span className="text-xs font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded shrink-0">
                          Failed at {trace.failedAtStep}
                        </span>
                      )}
                    </button>

                    {/* EXPANDED STEP DETAILS */}
                    {isExpanded && (
                      <div className="border-t border-slate-200/80 bg-white p-3.5 space-y-3 rounded-b-xl">
                        {/* FAILURE NOTICE */}
                        {trace.failureReason && (
                          <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800 flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
                            <div>
                              <div className="font-bold">Failure Cause:</div>
                              <div>{trace.failureReason}</div>
                            </div>
                          </div>
                        )}

                        {/* STEP PROGRESSION */}
                        <div className="space-y-2">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Execution Pipeline
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                            {(
                              [
                                'STATE_VALIDATION',
                                'PKCE_VERIFICATION',
                                'CODE_EXCHANGE',
                                'USER_FETCH',
                                'SESSION_PERSISTENCE',
                              ] as const
                            ).map((stepName) => {
                              const stepTrace = trace.steps.find((s) => s.step === stepName);
                              const isSuccess = stepTrace?.status === 'SUCCESS';
                              const isFailed = stepTrace?.status === 'FAILED';
                              const isSkipped = stepTrace?.status === 'SKIPPED';
                              const isPending = !stepTrace;

                              return (
                                <div
                                  key={stepName}
                                  className={`rounded-lg border p-2 text-left text-xs ${
                                    isSuccess
                                      ? 'border-emerald-200 bg-emerald-50/50'
                                      : isFailed
                                      ? 'border-rose-300 bg-rose-50'
                                      : isSkipped
                                      ? 'border-slate-200 bg-slate-50 text-slate-400'
                                      : 'border-slate-100 bg-slate-50/50 text-slate-300'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-[10px]">
                                      {stepName.replace('_', ' ')}
                                    </span>
                                    {isSuccess && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                                    {isFailed && <XCircle className="h-3 w-3 text-rose-600" />}
                                  </div>
                                  <div className="mt-1 text-[10px]">
                                    {stepTrace ? (
                                      <span>
                                        {stepTrace.status} ({stepTrace.durationMs || 0}ms)
                                      </span>
                                    ) : (
                                      'NOT REACHED'
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* STEP LOG DETAILS */}
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                            Diagnostic Step Details
                          </div>
                          <div className="space-y-1">
                            {trace.steps.map((st, idx) => (
                              <div
                                key={idx}
                                className="flex items-start justify-between rounded bg-slate-50 px-2.5 py-1.5 text-xs font-mono"
                              >
                                <div>
                                  <span className="font-bold text-slate-700">{st.step}:</span>{' '}
                                  <span
                                    className={
                                      st.status === 'SUCCESS'
                                        ? 'text-emerald-700'
                                        : st.status === 'FAILED'
                                        ? 'text-rose-700 font-semibold'
                                        : 'text-slate-500'
                                    }
                                  >
                                    [{st.status}]
                                  </span>{' '}
                                  {st.error && <span className="text-rose-600">{st.error}</span>}
                                  {st.details && (
                                    <span className="text-slate-500">
                                      {JSON.stringify(st.details)}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                                  {st.durationMs !== undefined ? `${st.durationMs}ms` : ''}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ACTIONS FOOTER */}
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};
