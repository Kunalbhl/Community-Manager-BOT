import React, { useState, useEffect } from 'react';
import {
  Bot,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Play,
  ShieldAlert,
  Hash,
  Sliders,
  Terminal,
  Zap,
  RotateCcw,
  ExternalLink,
  Info,
} from 'lucide-react';
import { DiscordBotProfile } from '../../brand/DiscordBotProfile.js';

interface DiscordConnectionCenterProps {
  communityId: string;
}

export const DiscordConnectionCenter: React.FC<DiscordConnectionCenterProps> = ({ communityId }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [smokeTestResult, setSmokeTestResult] = useState<any>(null);
  const [runningSmokeTest, setRunningSmokeTest] = useState(false);
  const [retryingOps, setRetryingOps] = useState(false);
  const [retryResult, setRetryResult] = useState<any>(null);

  const fetchConnectionCenter = async () => {
    try {
      setRefreshing(true);
      const res = await fetch(`/api/discord/connection-center?communityId=${communityId}`, {
        headers: { 'x-community-id': communityId, 'x-role': 'OWNER' },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setStatus(json.data);
        }
      }
    } catch (err) {
      console.error('Error fetching Discord Connection Center:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchConnectionCenter();
  }, [communityId]);

  const handleRunSmokeTest = async () => {
    try {
      setRunningSmokeTest(true);
      setSmokeTestResult(null);
      const res = await fetch(`/api/discord/smoke-test?communityId=${communityId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-community-id': communityId, 'x-role': 'OWNER' },
        body: JSON.stringify({ communityId }),
      });
      if (res.ok) {
        const json = await res.json();
        setSmokeTestResult(json.data);
      }
    } catch (err) {
      console.error('Error running smoke test:', err);
    } finally {
      setRunningSmokeTest(false);
    }
  };

  const handleRetryOnboardingOps = async () => {
    try {
      setRetryingOps(true);
      setRetryResult(null);
      const res = await fetch(`/api/community/welcome-config/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-community-id': communityId, 'x-role': 'OWNER' },
        body: JSON.stringify({ communityId }),
      });
      if (res.ok) {
        const json = await res.json();
        setRetryResult(json);
        await fetchConnectionCenter();
      }
    } catch (err) {
      console.error('Error retrying onboarding operations:', err);
    } finally {
      setRetryingOps(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-3 text-emerald-400" />
        <span>Inspecting real Discord Gateway and permissions state...</span>
      </div>
    );
  }

  const gateway = status?.gateway;
  const guild = status?.guild;
  const permissions = status?.permissions || [];
  const channels = status?.channels || [];
  const role = status?.role;
  const commands = status?.commands;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-zinc-900 to-indigo-950/40 p-6 rounded-2xl border border-zinc-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Bot className="w-6 h-6 text-indigo-400" />
            <h2 className="text-xl font-semibold text-white">Discord Connection Center</h2>
            <span
              className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${
                status?.overallHealth === 'HEALTHY'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : status?.overallHealth === 'NOT_CONFIGURED'
                  ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}
            >
              {status?.overallHealth || 'UNKNOWN'}
            </span>
          </div>
          <p className="text-sm text-zinc-400">
            Real server verification, channel allowlist diagnostics, role hierarchy checks, and command status.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchConnectionCenter}
            disabled={refreshing}
            className="px-3.5 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl transition flex items-center gap-2 border border-zinc-700"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-emerald-400' : ''}`} />
            Refresh Diagnostics
          </button>

          <button
            onClick={handleRunSmokeTest}
            disabled={runningSmokeTest}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition flex items-center gap-2 shadow-sm"
          >
            <Play className={`w-4 h-4 ${runningSmokeTest ? 'animate-spin' : ''}`} />
            Run Smoke Test
          </button>
        </div>
      </div>

      {/* Smoke Test Alert Banner */}
      {smokeTestResult && (
        <div className="bg-zinc-900 border border-indigo-500/30 p-4 rounded-xl flex items-start gap-3 text-sm text-zinc-300">
          <Zap className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-white">Smoke Test Completed</h4>
            <p className="text-xs text-zinc-400 mt-1">
              Gateway status: <span className="text-emerald-400 font-mono">{smokeTestResult.smokeTestStatus}</span> |
              Commands: <span className="text-zinc-200 font-mono">{smokeTestResult.slashCommands?.status}</span>
            </p>
          </div>
        </div>
      )}

      {/* Retry Result Alert Banner */}
      {retryResult && (
        <div className="bg-zinc-900 border border-emerald-500/30 p-4 rounded-xl flex items-start gap-3 text-sm text-zinc-300">
          <RotateCcw className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-white">Onboarding Operations Retried</h4>
            <p className="text-xs text-zinc-400 mt-1">{retryResult.message}</p>
          </div>
        </div>
      )}

      {/* Official Discord Bot Identity & Public Profile */}
      <DiscordBotProfile />

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 1. Gateway Status */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Activity className="w-5 h-5 text-emerald-400" />
              <h3 className="font-semibold text-white">Discord Gateway State</h3>
            </div>
            <span
              className={`px-2.5 py-0.5 text-xs font-mono rounded-md ${
                gateway?.state === 'CONNECTED'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
              }`}
            >
              {gateway?.state || 'DISCONNECTED'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/80">
              <span className="text-zinc-500 block">Bot Tag</span>
              <span className="font-mono text-zinc-200 font-medium">{gateway?.botTag || 'Not Connected'}</span>
            </div>
            <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/80">
              <span className="text-zinc-500 block">Latency (Ping)</span>
              <span className="font-mono text-emerald-400 font-medium">{gateway?.pingMs ? `${gateway.pingMs} ms` : 'N/A'}</span>
            </div>
            <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/80">
              <span className="text-zinc-500 block">Guilds Served</span>
              <span className="font-mono text-zinc-200 font-medium">{gateway?.guildsCount ?? 0}</span>
            </div>
            <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/80">
              <span className="text-zinc-500 block">Last Heartbeat</span>
              <span className="font-mono text-zinc-400 text-[11px]">
                {gateway?.lastHeartbeatAt ? new Date(gateway.lastHeartbeatAt).toLocaleTimeString() : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Target Server / Guild */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className="w-5 h-5 text-indigo-400" />
              <h3 className="font-semibold text-white">Target Discord Guild</h3>
            </div>
            <span
              className={`px-2.5 py-0.5 text-xs font-mono rounded-md ${
                guild?.status === 'CONNECTED'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
              }`}
            >
              {guild?.status || 'NOT_CONFIGURED'}
            </span>
          </div>

          <div className="bg-zinc-950/60 p-4 rounded-xl border border-zinc-800/80 space-y-2 text-xs">
            <div className="flex justify-between text-zinc-400">
              <span>Configured Guild ID:</span>
              <span className="font-mono text-zinc-200">{guild?.guildId || 'None Linked'}</span>
            </div>
            <div className="flex justify-between text-zinc-400">
              <span>Bot Guild Membership:</span>
              <span className="font-medium text-emerald-400">{guild?.botPresent ? 'Verified Present' : 'Not Detected'}</span>
            </div>
            {guild?.error && (
              <div className="text-amber-400 text-xs mt-2 p-2 bg-amber-500/10 rounded border border-amber-500/20">
                {guild.error}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Onboarding Operations Retry Action Section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-white flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-emerald-400" />
            Durable Onboarding Operations Recovery
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            If role assignments or welcome DMs fail due to temporary Discord API rate limits, click below to safely retry pending tasks.
          </p>
        </div>
        <button
          onClick={handleRetryOnboardingOps}
          disabled={retryingOps}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-xl transition flex items-center gap-2 shrink-0"
        >
          <RotateCcw className={`w-4 h-4 ${retryingOps ? 'animate-spin' : ''}`} />
          Retry Pending Onboarding Tasks
        </button>
      </div>

      {/* 3. Role Assignment Hierarchy Check */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-purple-400" />
            <h3 className="font-semibold text-white">Member Role Assignment & Hierarchy</h3>
          </div>
          <span
            className={`px-2.5 py-0.5 text-xs font-mono rounded-md ${
              role?.status === 'ROLE_READY'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}
          >
            {role?.status || 'NOT_CONFIGURED'}
          </span>
        </div>

        <p className="text-xs text-zinc-400">{role?.details || 'Configured role readiness check.'}</p>
      </div>

      {/* 4. Channel Allowlists */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Hash className="w-5 h-5 text-indigo-400" />
            <h3 className="font-semibold text-white">Allowlisted Channels Readiness</h3>
          </div>
          <span className="text-xs text-zinc-400 font-mono">{channels.length} channel(s) configured</span>
        </div>

        {channels.length === 0 ? (
          <div className="text-xs text-zinc-500 p-4 bg-zinc-950/60 rounded-xl border border-zinc-800 text-center">
            No specific channel allowlists configured. All visible channels process commands according to default rules.
          </div>
        ) : (
          <div className="space-y-2">
            {channels.map((chan: any, idx: number) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 bg-zinc-950/60 rounded-xl border border-zinc-800/80 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Hash className="w-4 h-4 text-zinc-500" />
                  <span className="font-mono text-zinc-200">{chan.channelName || chan.channelId}</span>
                  <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded text-[10px] uppercase font-semibold">
                    {chan.purpose}
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded font-mono ${
                    chan.status === 'VALID'
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : 'bg-amber-500/10 text-amber-400'
                  }`}
                >
                  {chan.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Slash Commands Status */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-white">Slash Commands Status</h3>
          </div>
          <span
            className={`px-2.5 py-0.5 text-xs font-mono rounded-md ${
              commands?.status === 'REGISTERED'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
            }`}
          >
            {commands?.status || 'NOT_CONFIGURED'}
          </span>
        </div>

        {commands?.commands && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {commands.commands.map((cmd: any, idx: number) => (
              <div
                key={idx}
                className="p-2.5 bg-zinc-950/60 rounded-lg border border-zinc-800/80 text-xs font-mono text-zinc-300 flex items-center justify-between"
              >
                <span>/{cmd.name}</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5.5. Bot Commands Catalog */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Terminal className="w-5 h-5 text-indigo-400" />
            <h3 className="font-semibold text-white">Bot Commands Catalog</h3>
          </div>
          <span className="text-xs text-zinc-400 font-mono">
            Generated from Canonical Command Registry
          </span>
        </div>

        <p className="text-xs text-zinc-400">
          The following list defines the active commands supported by the Community Manager bot in this server.
        </p>

        <div className="overflow-x-auto border border-zinc-800 rounded-xl bg-zinc-950/50">
          <table className="w-full border-collapse text-left text-xs text-zinc-300">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/80 text-zinc-400 uppercase font-mono tracking-wider text-[10px]">
                <th className="p-3">Command</th>
                <th className="p-3">What it does</th>
                <th className="p-3">Availability</th>
                <th className="p-3">Who can use</th>
                <th className="p-3">Example</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {[
                {
                  command: '/help',
                  description: 'Discover Community Manager commands grouped by purpose.',
                  availability: 'Server & DM',
                  whoCanUse: 'Everyone',
                  example: '/help',
                },
                {
                  command: '/portal',
                  description: 'View the community portal link.',
                  availability: 'Server & DM',
                  whoCanUse: 'Everyone',
                  example: '/portal',
                },
                {
                  command: '/rules',
                  description: 'List current community rules and guidelines.',
                  availability: 'Server only',
                  whoCanUse: 'Everyone',
                  example: '/rules',
                },
                {
                  command: '/support',
                  description: 'Request community manager support or open a ticket.',
                  availability: 'Server & DM',
                  whoCanUse: 'Everyone',
                  example: '/support',
                },
                {
                  command: '/recruiter',
                  description: 'Access recruiter specific dashboard and tools.',
                  availability: 'Server only',
                  whoCanUse: 'Recruiters',
                  example: '/recruiter',
                },
                {
                  command: '/recruiter-code',
                  description: 'Verify or generate recruit attribution codes.',
                  availability: 'Server & DM',
                  whoCanUse: 'Everyone',
                  example: '/recruiter-code code:abc',
                },
                {
                  command: '/referral',
                  description: 'Submit or track referral links.',
                  availability: 'Server only',
                  whoCanUse: 'Members',
                  example: '/referral action:submit link:https://...',
                },
                {
                  command: '/blacklist',
                  description: 'Blacklist a problematic applicant or discord user ID from applying.',
                  availability: 'Server only',
                  whoCanUse: 'Controllers & Owner',
                  example: '/blacklist user_id:123 duration:permanent',
                },
                {
                  command: '/interview',
                  description: 'Schedule, update, or check status of candidate interviews.',
                  availability: 'Server only',
                  whoCanUse: 'Interviewers & Staff',
                  example: '/interview schedule candidate:@User',
                },
                {
                  command: '/review-decision',
                  description: 'Process decisions on applicant profiles directly from Discord.',
                  availability: 'Server only',
                  whoCanUse: 'Recruiters & Staff',
                  example: '/review-decision approve applicant:@User',
                },
                {
                  command: '/user-status',
                  description: 'Get live status and role diagnostics of a user.',
                  availability: 'Server & DM',
                  whoCanUse: 'Everyone',
                  example: '/user-status user:@User',
                },
                {
                  command: '/applications',
                  description: 'View current active candidate application statistics and list.',
                  availability: 'Server only',
                  whoCanUse: 'Recruiters & Staff',
                  example: '/applications',
                }
              ].map((cmd, idx) => (
                <tr key={idx} className="hover:bg-zinc-900/30 transition-colors">
                  <td className="p-3 font-mono font-bold text-indigo-400">{cmd.command}</td>
                  <td className="p-3 text-zinc-300 max-w-xs leading-normal">{cmd.description}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-zinc-700/50">
                      {cmd.availability}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                      cmd.whoCanUse.includes('Everyone')
                        ? 'bg-zinc-800/60 text-zinc-400'
                        : cmd.whoCanUse.includes('Owner') || cmd.whoCanUse.includes('Controllers')
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                    }`}>
                      {cmd.whoCanUse}
                    </span>
                  </td>
                  <td className="p-3">
                    <code className="px-2 py-1 rounded bg-zinc-950 font-mono text-xs text-zinc-400 border border-zinc-900">
                      {cmd.example}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Bot Capability Matrix */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold text-white">Bot Capability Matrix</h3>
        <div className="space-y-3">
          {permissions.map((check: any, idx: number) => (
            <div
              key={idx}
              className="p-3.5 bg-zinc-950/60 rounded-xl border border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{check.permissionName}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                      check.granted
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    {check.status}
                  </span>
                </div>
                <p className="text-zinc-400 mt-1">{check.requiredFor}</p>
              </div>

              {!check.granted && (
                <div className="text-zinc-400 bg-zinc-900/80 p-2 rounded border border-zinc-800 text-[11px] max-w-xs">
                  <Info className="w-3.5 h-3.5 text-amber-400 inline mr-1" />
                  {check.resolutionGuidance}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
