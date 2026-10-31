import React, { useState, useEffect } from 'react';
import {
  Bot,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Server,
  Users,
  Radio,
  Settings,
  Layers,
  Sparkles,
  Clock,
  ExternalLink,
  ChevronRight,
  Lock,
  Globe,
  Bell,
  Sliders,
  XCircle,
} from 'lucide-react';
import { getDiscordClientId, getDiscordLoginUrl } from '../../../lib/discordUrls.js';

export interface OnboardingWizardProps {
  communityId?: string;
  onComplete: (completedCommunityId: string) => void;
}

export type OnboardingStep =
  | 'WELCOME'
  | 'CONNECT_DISCORD'
  | 'SELECT_SERVER'
  | 'VERIFY_SERVER'
  | 'INITIAL_SYNC'
  | 'COMMUNITY_SETUP'
  | 'WORKSPACE_READY';

export interface UserGuildItem {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  botPresent: boolean;
  connectionStatus: string;
}

export interface VerificationStep {
  id: string;
  label: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'PASSED' | 'FAILED' | 'SKIPPED';
  code?: string;
  details?: string;
  recoveryCta?: string;
}

export function OnboardingWizardView({ communityId, onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('WELCOME');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Guild selection & verification state
  const [guilds, setGuilds] = useState<UserGuildItem[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [botInstallUrl, setBotInstallUrl] = useState<string>('');
  const [activeCommunityId, setActiveCommunityId] = useState<string | null>(communityId || null);

  // Verification & Sync state
  const [verificationSteps, setVerificationSteps] = useState<VerificationStep[]>([]);
  const [verificationError, setVerificationError] = useState<{
    code: string;
    message: string;
    recoveryCta: string;
  } | null>(null);

  // Channels state for real-time selection
  const [availableChannels, setAvailableChannels] = useState<Array<{ id: string; name: string; type: number; isVoice?: boolean }>>([]);
  const [loadingChannels, setLoadingChannels] = useState<boolean>(false);
  const [welcomeChannelId, setWelcomeChannelId] = useState<string>('');
  const [alertsChannelId, setAlertsChannelId] = useState<string>('');

  // Progress metrics
  const [syncMetrics, setSyncMetrics] = useState<{
    memberCount: number;
    channelCount: number;
    roleCount: number;
    syncTimestamp: string;
  } | null>(null);

  // Configuration form state
  const [displayName, setDisplayName] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('America/New_York');
  const [customGuildInput, setCustomGuildInput] = useState<string>('');
  const [customGuildName, setCustomGuildName] = useState<string>('');
  const [enablePersonalDm, setEnablePersonalDm] = useState<boolean>(true);
  const [enableServerWelcome, setEnableServerWelcome] = useState<boolean>(true);
  const [enableAutoRole, setEnableAutoRole] = useState<boolean>(true);
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(true);
  const [autoModEnabled, setAutoModEnabled] = useState<boolean>(true);

  // Completed Summary State
  const [readySummary, setReadySummary] = useState<any>(null);

  // Load real-time Discord channels when community is active
  useEffect(() => {
    if (!activeCommunityId) return;
    if (currentStep === 'WELCOME' || currentStep === 'CONNECT_DISCORD' || currentStep === 'SELECT_SERVER') {
      return;
    }
    setLoadingChannels(true);
    fetch(`/api/v1/community/${activeCommunityId}/discord-channels`)
      .then(async (res) => {
        if (!res.ok) {
          return { success: false, data: [] };
        }
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return res.json();
        }
        return { success: false, data: [] };
      })
      .then((json) => {
        if (json?.success && Array.isArray(json.data)) {
          setAvailableChannels(json.data);
          if (json.data.length > 0) {
            const generalCh = json.data.find((c: any) => c.name.toLowerCase().includes('general') || c.name.toLowerCase().includes('welcome'));
            if (generalCh) {
              setWelcomeChannelId(generalCh.id);
            }
          }
        }
      })
      .catch((err) => console.error('Failed to fetch Discord channels for onboarding:', err))
      .finally(() => setLoadingChannels(false));
  }, [activeCommunityId, currentStep]);

  // Fetch bot install URL on mount
  useEffect(() => {
    fetch('/api/v1/discord/bot-install-url')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data?.installUrl) {
          setBotInstallUrl(json.data.installUrl);
        }
      })
      .catch(() => {});
  }, []);

  // Step 1 -> Start Onboarding Audit
  const handleStartOnboarding = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/v1/onboarding/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId: activeCommunityId }),
      });
      const json = await res.json();
      if (json.success) {
        setCurrentStep('CONNECT_DISCORD');
      } else {
        setErrorMsg(json.error?.message || 'Failed to initialize onboarding flow');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error initiating onboarding');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 -> Load Authorized Guilds
  const handleConnectDiscord = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/v1/onboarding/user-guilds');
      const json = await res.json();

      // No valid Discord OAuth session — send user through Discord login flow
      if (
        res.status === 401 ||
        json.error?.code === 'AUTHENTICATION_REQUIRED' ||
        json.error?.code === 'DISCORD_REAUTH_REQUIRED'
      ) {
        sessionStorage.setItem('onboarding_return_step', 'SELECT_SERVER');
        window.location.href = getDiscordLoginUrl();
        return;
      }

      if (json.success) {
        setGuilds(json.data || []);
        setCurrentStep('SELECT_SERVER');
      } else {
        setErrorMsg(json.error?.message || 'Failed to fetch Discord server authorization');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error communicating with Discord authentication');
    } finally {
      setLoading(false);
    }
  };

  // Step 3 -> Select & Perform Authoritative Verification
  const handleSelectGuild = async (guild: UserGuildItem) => {
    setSelectedGuildId(guild.id);
    setLoading(true);
    setErrorMsg(null);
    setVerificationError(null);
    setCurrentStep('VERIFY_SERVER');

    try {
      const res = await fetch('/api/v1/onboarding/verify-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guildId: guild.id, guildName: guild.name }),
      });
      const json = await res.json();

      if (json.success && json.data) {
        const { community, summary } = json.data;
        setActiveCommunityId(community.id);
        setVerificationSteps(summary.steps || []);
        setDisplayName(community.name || guild.name);

        if (summary.passed) {
          // Trigger initial sync automatically
          runSync(community.id);
        } else {
          setVerificationError(
            summary.primaryError || {
              code: 'NOT_CONFIGURED',
              message: 'Server verification failed',
              recoveryCta: 'Fix server settings and retry',
            }
          );
        }
      } else {
        setErrorMsg(json.error?.message || 'Failed to verify server configuration');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error executing server verification');
    } finally {
      setLoading(false);
    }
  };

  // Step 4 -> Execute Real Initial Synchronization
  const runSync = async (targetCommId: string) => {
    setCurrentStep('INITIAL_SYNC');
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/v1/onboarding/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': targetCommId,
        },
        body: JSON.stringify({ communityId: targetCommId }),
      });
      const json = await res.json();

      if (json.success && json.data) {
        setSyncMetrics({
          memberCount: json.data.memberCount || 0,
          channelCount: json.data.channelCount || 0,
          roleCount: json.data.roleCount || 0,
          syncTimestamp: json.data.syncTimestamp,
        });
        setCurrentStep('COMMUNITY_SETUP');
      } else {
        setErrorMsg(json.error?.message || 'Initial synchronization failed');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error running initial sync');
    } finally {
      setLoading(false);
    }
  };

  // Step 5 -> Save Configuration
  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCommunityId) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const payload = {
        communityId: activeCommunityId,
        displayName,
        timezone,
        welcomeSettings: {
          enablePersonalDm,
          enableServerWelcome,
          enableAutoRoleAssignment: enableAutoRole,
        },
        notificationPreferences: {
          alertsEnabled,
        },
        moderationDefaults: {
          autoModEnabled,
        },
      };

      const res = await fetch('/api/v1/onboarding/configure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': activeCommunityId,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (json.success) {
        handleCompleteOnboarding();
      } else {
        setErrorMsg(json.error?.message || 'Failed to save community setup settings');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving setup configuration');
    } finally {
      setLoading(false);
    }
  };

  // Step 6 -> Complete Onboarding & Load Workspace Ready Screen
  const handleCompleteOnboarding = async () => {
    if (!activeCommunityId) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/v1/onboarding/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': activeCommunityId,
        },
        body: JSON.stringify({ communityId: activeCommunityId }),
      });
      const json = await res.json();

      if (json.success && json.data) {
        setReadySummary(json.data.summary);
        setCurrentStep('WORKSPACE_READY');
      } else {
        setErrorMsg(json.error?.message || 'Failed to finalize community onboarding');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error completing onboarding');
    } finally {
      setLoading(false);
    }
  };

  // Helper step indicators
  const stepList: { key: OnboardingStep; label: string }[] = [
    { key: 'WELCOME', label: 'Welcome' },
    { key: 'CONNECT_DISCORD', label: 'Connect' },
    { key: 'SELECT_SERVER', label: 'Select Server' },
    { key: 'VERIFY_SERVER', label: 'Verification' },
    { key: 'INITIAL_SYNC', label: 'Sync' },
    { key: 'COMMUNITY_SETUP', label: 'Configuration' },
    { key: 'WORKSPACE_READY', label: 'Workspace Ready' },
  ];

  const currentStepIndex = stepList.findIndex((s) => s.key === currentStep);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8">
      {/* Container */}
      <div className="w-full max-w-4xl bg-slate-800/90 border border-slate-700/80 rounded-2xl shadow-2xl p-6 sm:p-10 backdrop-blur-md">
        {/* Progress Tracker */}
        <div className="mb-8 border-b border-slate-700/60 pb-6">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium mb-3">
            <span>Onboarding Setup Progress</span>
            <span>Step {currentStepIndex + 1} of {stepList.length}</span>
          </div>

          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {stepList.map((st, idx) => {
              const isPast = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;
              return (
                <div key={st.key} className="flex flex-col items-center gap-1.5">
                  <div
                    className={`h-2 w-full rounded-full transition-all duration-300 ${
                      isPast
                        ? 'bg-indigo-500'
                        : isCurrent
                        ? 'bg-indigo-400 animate-pulse'
                        : 'bg-slate-700'
                    }`}
                  />
                  <span
                    className={`text-[10px] sm:text-xs font-semibold text-center truncate w-full ${
                      isCurrent
                        ? 'text-indigo-400 font-bold'
                        : isPast
                        ? 'text-slate-300'
                        : 'text-slate-500'
                    }`}
                  >
                    {st.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMsg && (
          <div className="mb-6 p-4 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-semibold text-rose-300">Onboarding Action Error</p>
              <p className="mt-0.5">{errorMsg}</p>
            </div>
            <button
              onClick={() => setErrorMsg(null)}
              className="text-xs text-rose-400 hover:text-rose-200 font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* STEP 1: WELCOME */}
        {currentStep === 'WELCOME' && (
          <div className="text-center py-6 space-y-6">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
              <Bot className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Welcome to Community Manager
              </h1>
              <p className="text-slate-300 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
                Set up your production workspace in minutes. Connect your real Discord server, verify bot access, synchronize your community, and unleash automated recruitment, interviews, and member management.
              </p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4 text-left max-w-2xl mx-auto pt-4">
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700/60 space-y-1.5">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="font-semibold text-white text-sm">Authoritative & Secure</h3>
                <p className="text-xs text-slate-400">Strict server-side validation and multi-tenant isolation.</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700/60 space-y-1.5">
                <Radio className="w-5 h-5 text-indigo-400" />
                <h3 className="font-semibold text-white text-sm">Live Discord Sync</h3>
                <p className="text-xs text-slate-400">Real-time sync for members, roles, channels, and permissions.</p>
              </div>
              <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700/60 space-y-1.5">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <h3 className="font-semibold text-white text-sm">Automated Growth</h3>
                <p className="text-xs text-slate-400">Recruiter codes, AI interviews, and engagement tools.</p>
              </div>
            </div>

            <div className="pt-6">
              <button
                onClick={handleStartOnboarding}
                disabled={loading}
                className="px-8 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2 mx-auto disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Initializing Setup...
                  </>
                ) : (
                  <>
                    Get Started & Connect Discord
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: CONNECT DISCORD */}
        {currentStep === 'CONNECT_DISCORD' && (
          <div className="space-y-6 py-4">
            <div className="flex items-center gap-3 border-b border-slate-700/60 pb-4">
              <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400">
                <Server className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Connect Discord Account & Bot</h2>
                <p className="text-xs text-slate-400">Authorize your Discord identity to manage your community servers.</p>
              </div>
            </div>

            {!getDiscordClientId() && (
              <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-white">Discord Integration is Not Configured</p>
                  <p className="text-slate-400">The server administrator must set DISCORD_CLIENT_ID or DISCORD_APPLICATION_ID in the environment settings to allow connects and authorizations.</p>
                </div>
              </div>
            )}

            <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-700/80 space-y-4">
              <div className="flex items-start gap-3">
                <Lock className="w-5 h-5 text-indigo-400 mt-0.5" />
                <div className="space-y-1 text-xs sm:text-sm text-slate-300">
                  <p className="font-semibold text-white">Discord Authorization Requirements:</p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-400">
                    <li>Must be the Discord Server Owner or have <span className="text-slate-200 font-medium">Administrator / Manage Server</span> permission.</li>
                    <li>Requires installing the Community Manager bot to your Discord server.</li>
                    <li>Only genuine Discord guilds you own or administer will be shown.</li>
                  </ul>
                </div>
              </div>

              {botInstallUrl && getDiscordClientId() && (
                <div className="pt-2">
                  <a
                    href={botInstallUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Install Bot directly via Discord OAuth URL
                  </a>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => setCurrentStep('WELCOME')}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors"
              >
                Back
              </button>

              <button
                onClick={handleConnectDiscord}
                disabled={loading || !getDiscordClientId()}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Fetching Authorized Servers...
                  </>
                ) : (
                  <>
                    Fetch Authorized Discord Servers
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: SELECT SERVER */}
        {currentStep === 'SELECT_SERVER' && (
          <div className="space-y-6 py-4">
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-4">
              <div>
                <h2 className="text-xl font-bold text-white">Select Your Discord Server</h2>
                <p className="text-xs text-slate-400">Only authorized servers where you possess management permissions are listed.</p>
              </div>
              <button
                onClick={handleConnectDiscord}
                disabled={loading}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {guilds.length === 0 ? (
              <div className="text-center py-10 px-4 rounded-xl bg-slate-900/60 border border-slate-700/80 space-y-3">
                <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
                <h3 className="font-bold text-white text-base">No Authorized Servers Found</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  We could not find any Discord servers where your account is Server Owner or Administrator, or the Discord OAuth token requires re-authentication.
                </p>
                {botInstallUrl && (
                  <a
                    href={botInstallUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs mt-2"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Install Bot to Discord Guild
                  </a>
                )}
              </div>
            ) : (
              <div className="grid gap-3 max-h-80 overflow-y-auto pr-1">
                {guilds.map((g) => (
                  <div
                    key={g.id}
                    className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-4 ${
                      selectedGuildId === g.id
                        ? 'bg-indigo-950/60 border-indigo-500 shadow-md'
                        : 'bg-slate-900/60 border-slate-700/80 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {g.icon ? (
                        <img src={g.icon} alt={g.name} className="w-10 h-10 rounded-xl object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-indigo-400 shrink-0">
                          {g.name.substring(0, 2).toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-white text-sm truncate">{g.name}</h4>
                          {g.owner && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              Owner
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 font-mono">ID: {g.id}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {g.botPresent ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Bot Installed
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
                          Bot Not Installed
                        </span>
                      )}

                      <button
                        onClick={() => handleSelectGuild(g)}
                        disabled={loading}
                        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow transition-all disabled:opacity-50"
                      >
                        Select & Verify
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Direct Discord Server ID Option */}
            <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-700/80 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                    Or Link Server by Discord Server ID
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Paste your Discord Server ID (Guild ID) to verify and link your original server directly.
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Discord Server ID (e.g. 123456789012345678)"
                  value={customGuildInput}
                  onChange={(e) => setCustomGuildInput(e.target.value.trim())}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Community Name (Optional)"
                  value={customGuildName}
                  onChange={(e) => setCustomGuildName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/80 border border-slate-700 text-white text-xs font-medium focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-1">
                {botInstallUrl && (
                  <a
                    href={botInstallUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Add Bot to this Server
                  </a>
                )}
                <button
                  type="button"
                  disabled={!customGuildInput || loading}
                  onClick={() =>
                    handleSelectGuild({
                      id: customGuildInput,
                      name: customGuildName || `Server ${customGuildInput.slice(-4)}`,
                      icon: null,
                      owner: true,
                      permissions: '2147483647',
                      botPresent: true,
                      connectionStatus: 'CONNECTED',
                    })
                  }
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Verify & Connect Server ID
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setCurrentStep('CONNECT_DISCORD')}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: VERIFY SERVER */}
        {currentStep === 'VERIFY_SERVER' && (
          <div className="space-y-6 py-4">
            <div className="border-b border-slate-700/60 pb-4">
              <h2 className="text-xl font-bold text-white">Authoritative Server Verification</h2>
              <p className="text-xs text-slate-400">Verifying guild access, bot installation, permission bitfields, and role hierarchy.</p>
            </div>

            <div className="space-y-3">
              {verificationSteps.map((st) => (
                <div
                  key={st.id}
                  className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs sm:text-sm ${
                    st.status === 'PASSED'
                      ? 'bg-emerald-950/20 border-emerald-800/60 text-emerald-200'
                      : st.status === 'FAILED'
                      ? 'bg-rose-950/30 border-rose-800/80 text-rose-200'
                      : 'bg-slate-900/60 border-slate-700/80 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {st.status === 'PASSED' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    ) : st.status === 'FAILED' ? (
                      <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                    ) : (
                      <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin shrink-0" />
                    )}
                    <div>
                      <p className="font-semibold">{st.label}</p>
                      {st.details && <p className="text-xs opacity-80 mt-0.5">{st.details}</p>}
                    </div>
                  </div>

                  <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    st.status === 'PASSED'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : st.status === 'FAILED'
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-indigo-500/20 text-indigo-300'
                  }`}>
                    {st.status}
                  </span>
                </div>
              ))}
            </div>

            {/* Verification Error & Recovery CTA */}
            {verificationError && (
              <div className="p-5 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-200 space-y-3 mt-4">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-xs font-mono uppercase bg-rose-900/80 px-2 py-0.5 rounded text-rose-200 mr-2">
                      {verificationError.code}
                    </span>
                    <p className="text-sm font-medium mt-1">{verificationError.message}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  {botInstallUrl && verificationError.code === 'BOT_NOT_INSTALLED' && (
                    <a
                      href={botInstallUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {verificationError.recoveryCta}
                    </a>
                  )}

                  <button
                    onClick={() => {
                      const selectedGuild = guilds.find((g) => g.id === selectedGuildId);
                      if (selectedGuild) handleSelectGuild(selectedGuild);
                    }}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-600 flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry Verification
                  </button>

                  <button
                    onClick={() => setCurrentStep('SELECT_SERVER')}
                    className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 font-medium text-xs"
                  >
                    Change Server
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 5: INITIAL SYNC */}
        {currentStep === 'INITIAL_SYNC' && (
          <div className="text-center py-10 space-y-6">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-white">Synchronizing Discord Community</h2>
              <p className="text-slate-300 text-sm max-w-md mx-auto">
                Executing initial synchronization for members, roles, channels, and permissions directly from Discord.
              </p>
            </div>

            <div className="max-w-md mx-auto bg-slate-900/60 border border-slate-700/80 rounded-xl p-4 text-left space-y-2.5 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Connecting Discord Gateway</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Verifying Server Permissions</span>
              </div>
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
                <span className="font-semibold text-indigo-300">Syncing Members, Roles, and Channels...</span>
              </div>
            </div>
          </div>
        )}

        {/* STEP 6: COMMUNITY SETUP */}
        {currentStep === 'COMMUNITY_SETUP' && (
          <form onSubmit={handleSaveConfig} className="space-y-6 py-4">
            <div className="border-b border-slate-700/60 pb-4">
              <h2 className="text-xl font-bold text-white">Configure Community Workspace</h2>
              <p className="text-xs text-slate-400">Customize display settings, welcome onboarding rules, and notification defaults.</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-indigo-400" />
                  Community Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white text-xs font-medium focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  Workspace Timezone
                </label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white text-xs font-medium focus:outline-none focus:border-indigo-500"
                >
                  <option value="America/New_York">Eastern Time (ET)</option>
                  <option value="America/Chicago">Central Time (CT)</option>
                  <option value="America/Los_Angeles">Pacific Time (PT)</option>
                  <option value="UTC">Coordinated Universal Time (UTC)</option>
                  <option value="Europe/London">London (GMT/BST)</option>
                </select>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                Default Module Preferences
              </h3>

              <div className="grid sm:grid-cols-2 gap-3">
                <label className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/80 flex items-center justify-between cursor-pointer hover:border-slate-600 transition-colors">
                  <span className="text-xs text-slate-300 font-medium">Send Personal Welcome DMs</span>
                  <input
                    type="checkbox"
                    checked={enablePersonalDm}
                    onChange={(e) => setEnablePersonalDm(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-800 border-slate-700 focus:ring-0"
                  />
                </label>

                <label className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/80 flex items-center justify-between cursor-pointer hover:border-slate-600 transition-colors">
                  <span className="text-xs text-slate-300 font-medium">Post Server Welcome Messages</span>
                  <input
                    type="checkbox"
                    checked={enableServerWelcome}
                    onChange={(e) => setEnableServerWelcome(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-800 border-slate-700 focus:ring-0"
                  />
                </label>

                <label className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/80 flex items-center justify-between cursor-pointer hover:border-slate-600 transition-colors">
                  <span className="text-xs text-slate-300 font-medium">Automated Role Assignment</span>
                  <input
                    type="checkbox"
                    checked={enableAutoRole}
                    onChange={(e) => setEnableAutoRole(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-800 border-slate-700 focus:ring-0"
                  />
                </label>

                <label className="p-3 rounded-xl bg-slate-900/60 border border-slate-700/80 flex items-center justify-between cursor-pointer hover:border-slate-600 transition-colors">
                  <span className="text-xs text-slate-300 font-medium">Auto-Moderation Safeguards</span>
                  <input
                    type="checkbox"
                    checked={autoModEnabled}
                    onChange={(e) => setAutoModEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-800 border-slate-700 focus:ring-0"
                  />
                </label>
              </div>
            </div>

            {/* Live Discord Channel Routing */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-indigo-400" />
                  Discord Channel Routing
                </h3>
                {loadingChannels && (
                  <span className="text-[10px] text-indigo-400 flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Fetching live channels...
                  </span>
                )}
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-indigo-400" />
                    Public Welcome Channel
                  </label>
                  {availableChannels.length > 0 ? (
                    <select
                      value={welcomeChannelId}
                      onChange={(e) => setWelcomeChannelId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white text-xs font-medium focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Select Welcome Channel --</option>
                      {availableChannels.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          #{ch.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="e.g. #welcome"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white text-xs font-medium focus:outline-none focus:border-indigo-500"
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-indigo-400" />
                    System Alerts & Announcements Channel
                  </label>
                  {availableChannels.length > 0 ? (
                    <select
                      value={alertsChannelId}
                      onChange={(e) => setAlertsChannelId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white text-xs font-medium focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Select Alerts Channel --</option>
                      {availableChannels.map((ch) => (
                        <option key={ch.id} value={ch.id}>
                          #{ch.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="e.g. #announcements"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-slate-700 text-white text-xs font-medium focus:outline-none focus:border-indigo-500"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end pt-4 border-t border-slate-700/60">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Saving Configuration...
                  </>
                ) : (
                  <>
                    Save & Finalize Workspace
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 7: WORKSPACE READY */}
        {currentStep === 'WORKSPACE_READY' && (
          <div className="text-center py-6 space-y-6">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-white">Community Workspace Ready!</h2>
              <p className="text-slate-300 text-sm max-w-lg mx-auto">
                Your Discord server is genuinely connected, synchronized, and configured for production recruitment operations.
              </p>
            </div>

            {readySummary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto text-left pt-2">
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/80">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Status</span>
                  <span className="font-extrabold text-emerald-400 text-sm flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Connected
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/80">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Members</span>
                  <span className="font-extrabold text-white text-base mt-0.5 block">{readySummary.memberCount ?? 0}</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/80">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Channels</span>
                  <span className="font-extrabold text-white text-base mt-0.5 block">{readySummary.channelCount ?? 0}</span>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-700/80">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Roles</span>
                  <span className="font-extrabold text-white text-base mt-0.5 block">{readySummary.roleCount ?? 0}</span>
                </div>
              </div>
            )}

            <div className="pt-4">
              <button
                onClick={() => {
                  if (activeCommunityId) onComplete(activeCommunityId);
                }}
                className="px-8 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2 mx-auto"
              >
                Enter Community Workspace Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
