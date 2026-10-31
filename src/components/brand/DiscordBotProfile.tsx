import React, { useState, useEffect } from 'react';
import {
  Bot,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  Key,
  Terminal,
  Activity,
  Server,
  Users,
  Sparkles,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { BrandMark } from './BrandLogo.js';
import { getDiscordClientId, getAddToDiscordUrl } from '../../lib/discordUrls.js';

interface DiscordBotProfileProps {
  onOpenSupport?: () => void;
  className?: string;
}

export const DiscordBotProfile: React.FC<DiscordBotProfileProps> = ({
  onOpenSupport,
  className = '',
}) => {
  const [copied, setCopied] = useState<string | null>(null);
  const [botStatus, setBotStatus] = useState<{
    configured: boolean;
    connected: boolean;
    botTag?: string;
    clientId?: string;
    gatewayState?: string;
  }>({
    configured: false,
    connected: false,
  });

  const canonicalUrl = typeof window !== 'undefined' ? window.location.origin : '';

  useEffect(() => {
    fetch('/api/v1/integrations/discord/diagnostics')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setBotStatus({
            configured: json.data.configured || false,
            connected: json.data.gatewayState === 'CONNECTED',
            botTag: json.data.botTag,
            clientId: json.data.clientId || undefined,
            gatewayState: json.data.gatewayState,
          });
        }
      })
      .catch(() => {});
  }, []);

  const officialBotInstallUrl = getAddToDiscordUrl();
  const effectiveClientId = botStatus.clientId || import.meta.env.VITE_DISCORD_CLIENT_ID || '1347087859345096766';

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>
      {/* Bot Identity Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-center gap-4">
          <div className="relative">
            <BrandMark size={56} />
            <span
              className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-white ${
                botStatus.connected ? 'bg-emerald-500' : botStatus.configured ? 'bg-amber-500' : 'bg-slate-400'
              }`}
              title={botStatus.connected ? 'Gateway Connected' : botStatus.configured ? 'Configured (Idle)' : 'Not Configured'}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">Community Manager</h2>
              <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                Official Discord Bot
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Tag: {botStatus.botTag || 'Community Manager#9901'} • Application ID: {effectiveClientId}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <a
            href={effectiveClientId ? officialBotInstallUrl : '#'}
            onClick={(e) => {
              if (!effectiveClientId) {
                e.preventDefault();
                alert('Discord integration is not configured on the server. Please set DISCORD_CLIENT_ID or DISCORD_APPLICATION_ID in the environment settings.');
              }
            }}
            target={effectiveClientId ? '_blank' : undefined}
            rel="noopener noreferrer"
            className={`flex flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-xs transition ${
              !effectiveClientId ? 'bg-slate-400 cursor-not-allowed opacity-60' : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
            id="btn-install-official-bot"
          >
            <Bot className="h-4 w-4" />
            <span>Install Bot to Discord</span>
            <ExternalLink className="h-3.5 w-3.5 opacity-80" />
          </a>
        </div>
      </div>

      {/* Official Bot Bio & Specifications */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">About / Bot Bio</h3>
            <p className="mt-1 text-sm text-slate-700 leading-relaxed">
              <strong>Community Manager</strong> is the Discord-first operations and intelligence bot for modern communities.
              It automates structured applicant intake, verifies member Discord joins, coordinates multi-stage onboarding checklists,
              safely assigns verified member roles, and provides grounded operational AI assistance via the Community Brain.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Key Bot Capabilities</h3>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700">
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 border border-slate-100">
                <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />
                <span>Automated Discord Join Verification</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 border border-slate-100">
                <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />
                <span>Role Hierarchy-Safe Assignment</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 border border-slate-100">
                <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />
                <span>Onboarding Checklists & DMs</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 border border-slate-100">
                <CheckCircle2 className="h-4 w-4 text-indigo-600 shrink-0" />
                <span>Community Brain Operations AI</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Setup Instructions</h3>
            <ol className="mt-1.5 list-decimal list-inside space-y-1.5 text-xs text-slate-600">
              <li>Click <strong>Install Bot to Discord</strong> to add the bot to your target server.</li>
              <li>Select your server and grant the required permissions (Manage Roles, Read/Send Messages).</li>
              <li>In your Discord Server Settings &gt; Roles, drag the <strong>Community Manager</strong> role <em>above</em> the roles it needs to assign.</li>
              <li>Navigate to <strong>Discord Connect</strong> in the dashboard and link your Guild ID to finish verification.</li>
            </ol>
          </div>
        </div>

        {/* Technical Metadata & Endpoints */}
        <div className="rounded-lg bg-slate-50 p-4 border border-slate-200/80 space-y-3.5">
          <div className="text-xs font-bold text-slate-900 border-b border-slate-200 pb-2 flex items-center justify-between">
            <span>Production Metadata</span>
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                botStatus.connected
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {botStatus.gatewayState || 'GATEWAY_IDLE'}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-slate-500">Official App URL</span>
            <div className="flex items-center justify-between gap-1 rounded bg-white p-1.5 border border-slate-200 text-[11px] font-mono text-slate-700">
              <span className="truncate">{canonicalUrl}</span>
              <button
                onClick={() => copyToClipboard(canonicalUrl, 'url')}
                className="p-1 hover:bg-slate-100 rounded text-slate-500"
                title="Copy URL"
              >
                {copied === 'url' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-slate-500">OAuth Client ID</span>
            <div className="flex items-center justify-between gap-1 rounded bg-white p-1.5 border border-slate-200 text-[11px] font-mono text-slate-700">
              <span className="truncate">{effectiveClientId}</span>
              <button
                onClick={() => copyToClipboard(effectiveClientId, 'client_id')}
                className="p-1 hover:bg-slate-100 rounded text-slate-500"
                title="Copy Client ID"
              >
                {copied === 'client_id' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200 flex flex-col gap-2">
            {onOpenSupport && (
              <button
                onClick={onOpenSupport}
                className="flex items-center justify-center gap-1.5 w-full rounded border border-slate-300 bg-white py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
              >
                <HelpCircle className="h-3.5 w-3.5 text-indigo-600" />
                <span>Support &amp; Troubleshooting</span>
              </button>
            )}
            <a
              href="https://discord.com/developers/applications"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 w-full rounded border border-slate-200 bg-white py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
            >
              <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
              <span>Discord Developer Portal</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
