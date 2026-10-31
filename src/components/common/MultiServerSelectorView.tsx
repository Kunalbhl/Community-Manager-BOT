import React, { useState, useEffect } from 'react';
import { Bot, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, ExternalLink, ArrowRight } from 'lucide-react';
import { getAddToDiscordUrl } from '../../lib/discordUrls.js';

export interface ServerEntry {
  guildId: string;
  name: string;
  icon?: string;
  communityId?: string;
  botStatus: 'CONNECTED' | 'BOT_INSTALLED' | 'BOT_MISSING' | 'PERMISSION_REQUIRED';
  connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'SYNCING' | 'SYNC_FAILED';
  setupStatus: 'READY' | 'SETUP_REQUIRED' | 'INSTALL_REQUIRED' | 'PERMISSION_REQUIRED';
}

interface MultiServerSelectorViewProps {
  selectedCommunityId?: string;
  onSelectCommunity: (communityId: string, guildId: string) => void;
  onStartOnboarding: (guildId: string, communityId: string) => void;
}

export function MultiServerSelectorView({
  selectedCommunityId,
  onSelectCommunity,
  onStartOnboarding,
}: MultiServerSelectorViewProps) {
  const [servers, setServers] = useState<ServerEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchServers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/discord/guilds/list');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setServers(json.data);
      } else {
        setServers([]);
        setError(json.message || 'Failed loading connected server list');
      }
    } catch (err: any) {
      setServers([]);
      setError(err.message || 'Failed loading connected server list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
  }, []);

  const renderStatusBadge = (server: ServerEntry) => {
    if (server.setupStatus === 'READY' && server.botStatus === 'CONNECTED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3.5 h-3.5" /> READY
        </span>
      );
    }
    if (server.setupStatus === 'SETUP_REQUIRED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <AlertCircle className="w-3.5 h-3.5" /> SETUP REQUIRED
        </span>
      );
    }
    if (server.botStatus === 'PERMISSION_REQUIRED' || server.setupStatus === 'PERMISSION_REQUIRED') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <AlertCircle className="w-3.5 h-3.5" /> Permission required
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
        <Bot className="w-3.5 h-3.5" /> Bot not installed
      </span>
    );
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-6 shadow-xl max-w-3xl mx-auto">
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-indigo-400" /> Discord Server Directory
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Select a server to access its Community Manager dashboard or complete first-time onboarding.
          </p>
        </div>
        <button
          onClick={fetchServers}
          className="p-2 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white transition"
          title="Refresh servers"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" /> Scanning connected Discord servers...
        </div>
      ) : servers.length === 0 ? (
        <div className="py-8 text-center space-y-3">
          <p className="text-sm text-neutral-400">No Discord servers detected for your account yet.</p>
          <a
            href={getAddToDiscordUrl()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition shadow-lg shadow-indigo-600/20"
          >
            <Bot className="w-4 h-4" /> Add Bot to Discord
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map((server) => {
            const isSelected = selectedCommunityId === server.communityId;
            return (
              <div
                key={server.guildId}
                className={`p-4 rounded-xl border transition flex items-center justify-between gap-4 ${
                  isSelected
                    ? 'bg-indigo-500/10 border-indigo-500/50 text-white'
                    : 'bg-neutral-800/40 border-neutral-800 hover:border-neutral-700 text-neutral-200'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center font-bold text-indigo-400">
                    {server.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-white">{server.name}</h3>
                    <div className="text-[11px] text-neutral-400 flex items-center gap-2 mt-0.5 font-mono">
                      <span>Guild: {server.guildId}</span>
                      <span>•</span>
                      <span>Bot: {server.botStatus}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {renderStatusBadge(server)}

                  {server.setupStatus === 'READY' && server.communityId ? (
                    <button
                      onClick={() => onSelectCommunity(server.communityId!, server.guildId)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition flex items-center gap-1.5"
                    >
                      Open Dashboard <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : server.setupStatus === 'SETUP_REQUIRED' && server.communityId ? (
                    <button
                      onClick={() => onStartOnboarding(server.guildId, server.communityId!)}
                      className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition flex items-center gap-1.5"
                    >
                      Continue Setup <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <a
                      href={getAddToDiscordUrl({ guildId: server.guildId })}
                      className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition flex items-center gap-1.5"
                    >
                      Install Bot <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="pt-2 flex items-center justify-between text-xs text-neutral-400 border-t border-neutral-800">
        <span>Need to connect another server?</span>
        <a
          href={getAddToDiscordUrl()}
          className="text-indigo-400 hover:underline font-medium flex items-center gap-1"
        >
          <Bot className="w-3.5 h-3.5" /> Add to another Discord server
        </a>
      </div>
    </div>
  );
}
