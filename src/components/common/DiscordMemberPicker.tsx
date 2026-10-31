import React, { useState, useEffect, useCallback } from 'react';
import { User, RefreshCw, AlertTriangle, Search, Check } from 'lucide-react';
import { DiscordMemberResource } from '../../../shared/types/discord';

interface DiscordMemberPickerProps {
  id?: string;
  guildId?: string;
  communityId?: string;
  value?: string;
  onChange: (memberUserId: string, member?: DiscordMemberResource) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  className?: string;
}

export const DiscordMemberPicker: React.FC<DiscordMemberPickerProps> = ({
  id,
  guildId,
  communityId,
  value,
  onChange,
  required = false,
  disabled = false,
  placeholder = 'Search & select a live Discord member...',
  label,
  className = '',
}) => {
  const [members, setMembers] = useState<DiscordMemberResource[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState<boolean>(false);

  const fetchMembers = useCallback(async (query = '') => {
    if (!guildId && !communityId) {
      setMembers([]);
      setError('Discord context not specified');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let url = '';
      if (guildId) {
        url = `/api/v1/discord/guilds/${guildId}/members?limit=50${query ? `&query=${encodeURIComponent(query)}` : ''}`;
      } else if (communityId) {
        url = `/api/v1/discord/communities/${communityId}/resources`;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (data.success && Array.isArray(data.data || data.data?.members)) {
        const list: DiscordMemberResource[] = Array.isArray(data.data) ? data.data : data.data.members;
        setMembers(list);
        setIsLive(Boolean(data.isLive));
      } else {
        setError(data.error || data.message || 'Discord bot not connected');
        setMembers([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch Discord members');
      setMembers([]);
    } finally {
      setIsLoading(false);
    }
  }, [guildId, communityId]);

  useEffect(() => {
    let isSubscribed = true;

    const load = async () => {
      if (!guildId && !communityId) {
        if (isSubscribed) {
          setMembers([]);
          setError('Discord context not specified');
        }
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        let url = '';
        if (guildId) {
          url = `/api/v1/discord/guilds/${guildId}/members?limit=50`;
        } else if (communityId) {
          url = `/api/v1/discord/communities/${communityId}/resources`;
        }

        const res = await fetch(url);
        const data = await res.json();

        if (isSubscribed) {
          if (data.success && Array.isArray(data.data || data.data?.members)) {
            const list: DiscordMemberResource[] = Array.isArray(data.data) ? data.data : data.data.members;
            setMembers(list);
            setIsLive(Boolean(data.isLive));
          } else {
            setError(data.error || data.message || 'Discord bot not connected');
            setMembers([]);
          }
        }
      } catch (err: any) {
        if (isSubscribed) {
          setError(err.message || 'Failed to fetch Discord members');
          setMembers([]);
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
  }, [guildId, communityId, fetchMembers]);

  const selectedMember = members.find((m) => m.discordUserId === value || m.id === value);

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
              <span className="text-amber-600 font-medium">Offline</span>
            )}
            <button
              type="button"
              onClick={() => fetchMembers(searchQuery)}
              disabled={isLoading || disabled}
              className="p-1 hover:text-slate-700 rounded transition-colors"
              title="Refresh members from Discord gateway"
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
            const memberId = e.target.value;
            const member = members.find((m) => m.discordUserId === memberId || m.id === memberId);
            onChange(memberId, member);
          }}
          disabled={disabled || isLoading || members.length === 0}
          className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-10 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="">{placeholder}</option>
          {members.map((m) => (
            <option key={m.discordUserId || m.id} value={m.discordUserId || m.id}>
              {m.displayName || m.username} (@{m.username}) {m.isBot ? '[Bot]' : ''}
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

      {selectedMember && (
        <div className="flex items-center gap-2 pt-1 text-xs text-slate-600">
          {selectedMember.avatarUrl ? (
            <img
              src={selectedMember.avatarUrl}
              alt=""
              className="w-5 h-5 rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-medium text-slate-600">
              {selectedMember.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <span className="font-medium text-slate-800">{selectedMember.displayName}</span>
          <span className="text-slate-400">(@{selectedMember.username})</span>
          <span className="font-mono text-[10px] text-slate-400">ID: {selectedMember.discordUserId}</span>
        </div>
      )}
    </div>
  );
};
