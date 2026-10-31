import React, { useState, useEffect, useCallback } from 'react';
import { Hash, Volume2, Megaphone, Folder, RefreshCw, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { DiscordChannelResource, DiscordChannelType } from '../../../shared/types/discord';

interface DiscordChannelPickerProps {
  id?: string;
  guildId?: string;
  communityId?: string;
  value?: string;
  onChange: (channelId: string, channelName?: string) => void;
  textOnly?: boolean;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  showPermissionBadges?: boolean;
  className?: string;
}

export const DiscordChannelPicker: React.FC<DiscordChannelPickerProps> = ({
  id,
  guildId,
  communityId,
  value,
  onChange,
  textOnly = true,
  required = false,
  disabled = false,
  placeholder = 'Select a live Discord channel...',
  label,
  showPermissionBadges = true,
  className = '',
}) => {
  const [channels, setChannels] = useState<DiscordChannelResource[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);

  const fetchChannels = useCallback(async () => {
    if (!guildId && !communityId) {
      setChannels([]);
      setError('Discord Guild context not specified');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let url = '';
      if (guildId) {
        url = `/api/v1/discord/guilds/${guildId}/channels?textOnly=${textOnly}`;
      } else if (communityId) {
        url = `/api/v1/discord/communities/${communityId}/resources`;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (data.success && Array.isArray(data.data || data.data?.channels)) {
        const list: DiscordChannelResource[] = Array.isArray(data.data) ? data.data : data.data.channels;
        setChannels(list);
        setIsLive(Boolean(data.isLive));
        setLastRefreshed(new Date().toLocaleTimeString());
      } else {
        setError(data.error || data.message || 'Discord bot not connected to guild');
        setChannels([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch Discord channels');
      setChannels([]);
    } finally {
      setIsLoading(false);
    }
  }, [guildId, communityId, textOnly]);

  useEffect(() => {
    let isSubscribed = true;

    const load = async () => {
      if (!guildId && !communityId) {
        if (isSubscribed) {
          setChannels([]);
          setError('Discord Guild context not specified');
        }
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        let url = '';
        if (guildId) {
          url = `/api/v1/discord/guilds/${guildId}/channels?textOnly=${textOnly}`;
        } else if (communityId) {
          url = `/api/v1/discord/communities/${communityId}/resources`;
        }

        const res = await fetch(url);
        const data = await res.json();

        if (isSubscribed) {
          if (data.success && Array.isArray(data.data || data.data?.channels)) {
            const list: DiscordChannelResource[] = Array.isArray(data.data) ? data.data : data.data.channels;
            setChannels(list);
            setIsLive(Boolean(data.isLive));
            setLastRefreshed(new Date().toLocaleTimeString());
          } else {
            setError(data.error || data.message || 'Discord bot not connected to guild');
            setChannels([]);
          }
        }
      } catch (err: any) {
        if (isSubscribed) {
          setError(err.message || 'Failed to fetch Discord channels');
          setChannels([]);
        }
      } finally {
        if (isSubscribed) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      isSubscribed = false;
    };
  }, [guildId, communityId, textOnly, fetchChannels]);

  const selectedChannel = channels.find((c) => c.id === value);

  const getChannelIcon = (type: DiscordChannelType) => {
    switch (type) {
      case 'GUILD_ANNOUNCEMENT':
      case 'ANNOUNCEMENT':
        return <Megaphone className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
      case 'GUILD_VOICE':
      case 'VOICE':
        return <Volume2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
      case 'GUILD_CATEGORY':
      case 'CATEGORY':
        return <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
      default:
        return <Hash className="w-3.5 h-3.5 text-indigo-500 shrink-0" />;
    }
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <label htmlFor={id} className="block text-xs font-semibold text-slate-700">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            {isLive ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Live Discord
              </span>
            ) : (
              <span className="text-amber-600 font-medium">Offline / Unlinked</span>
            )}
            <button
              type="button"
              onClick={fetchChannels}
              disabled={isLoading || disabled}
              className="p-1 hover:text-slate-700 rounded transition-colors"
              title="Refresh channels from live Discord gateway"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      )}

      <div className="relative">
        <select
          id={id}
          value={value || ''}
          onChange={(e) => {
            const chanId = e.target.value;
            const chan = channels.find((c) => c.id === chanId);
            onChange(chanId, chan?.name);
          }}
          disabled={disabled || isLoading || channels.length === 0}
          className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-10 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="">{placeholder}</option>
          {channels.map((chan) => (
            <option key={chan.id} value={chan.id}>
              {chan.name} {chan.parentName ? `(${chan.parentName})` : ''} {chan.canBotSendMessages === false ? '[No Send Perms]' : ''}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2.5 py-1.5 rounded-md border border-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {selectedChannel && showPermissionBadges && (
        <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
          <span className="font-mono text-slate-400">ID: {selectedChannel.id}</span>
          {selectedChannel.canBotSendMessages ? (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="w-3 h-3" /> Bot Can Post
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
              <ShieldAlert className="w-3 h-3" /> Bot Lacks Send Permissions
            </span>
          )}
        </div>
      )}
    </div>
  );
};
