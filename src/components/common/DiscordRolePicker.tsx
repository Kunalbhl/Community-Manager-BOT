import React, { useState, useEffect, useCallback } from 'react';
import { Shield, ShieldAlert, CheckCircle2, RefreshCw, AlertTriangle } from 'lucide-react';
import { DiscordRoleResource } from '../../../shared/types/discord';

interface DiscordRolePickerProps {
  id?: string;
  guildId?: string;
  communityId?: string;
  value?: string;
  onChange: (roleId: string, roleName?: string) => void;
  unmanagedOnly?: boolean;
  includeEveryone?: boolean;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  showHierarchyBadges?: boolean;
  className?: string;
}

export const DiscordRolePicker: React.FC<DiscordRolePickerProps> = ({
  id,
  guildId,
  communityId,
  value,
  onChange,
  unmanagedOnly = true,
  includeEveryone = false,
  required = false,
  disabled = false,
  placeholder = 'Select a live Discord role...',
  label,
  showHierarchyBadges = true,
  className = '',
}) => {
  const [roles, setRoles] = useState<DiscordRoleResource[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState<boolean>(false);

  const fetchRoles = useCallback(async () => {
    if (!guildId && !communityId) {
      setRoles([]);
      setError('Discord Guild context not specified');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let url = '';
      if (guildId) {
        url = `/api/v1/discord/guilds/${guildId}/roles?unmanagedOnly=${unmanagedOnly}&includeEveryone=${includeEveryone}`;
      } else if (communityId) {
        url = `/api/v1/discord/communities/${communityId}/resources`;
      }

      const res = await fetch(url);
      const data = await res.json();

      if (data.success && Array.isArray(data.data || data.data?.roles)) {
        const list: DiscordRoleResource[] = Array.isArray(data.data) ? data.data : data.data.roles;
        setRoles(list);
        setIsLive(Boolean(data.isLive));
      } else {
        setError(data.error || data.message || 'Discord bot not connected to guild');
        setRoles([]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch Discord roles');
      setRoles([]);
    } finally {
      setIsLoading(false);
    }
  }, [guildId, communityId, unmanagedOnly, includeEveryone]);

  useEffect(() => {
    let isSubscribed = true;

    const load = async () => {
      if (!guildId && !communityId) {
        if (isSubscribed) {
          setRoles([]);
          setError('Discord Guild context not specified');
        }
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        let url = '';
        if (guildId) {
          url = `/api/v1/discord/guilds/${guildId}/roles?unmanagedOnly=${unmanagedOnly}&includeEveryone=${includeEveryone}`;
        } else if (communityId) {
          url = `/api/v1/discord/communities/${communityId}/resources`;
        }

        const res = await fetch(url);
        const data = await res.json();

        if (isSubscribed) {
          if (data.success && Array.isArray(data.data || data.data?.roles)) {
            const list: DiscordRoleResource[] = Array.isArray(data.data) ? data.data : data.data.roles;
            setRoles(list);
            setIsLive(Boolean(data.isLive));
          } else {
            setError(data.error || data.message || 'Discord bot not connected to guild');
            setRoles([]);
          }
        }
      } catch (err: any) {
        if (isSubscribed) {
          setError(err.message || 'Failed to fetch Discord roles');
          setRoles([]);
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
  }, [guildId, communityId, unmanagedOnly, includeEveryone, fetchRoles]);

  const selectedRole = roles.find((r) => r.id === value);

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
              onClick={fetchRoles}
              disabled={isLoading || disabled}
              className="p-1 hover:text-slate-700 rounded transition-colors"
              title="Refresh roles from live Discord gateway"
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
            const roleId = e.target.value;
            const role = roles.find((r) => r.id === roleId);
            onChange(roleId, role?.name);
          }}
          disabled={disabled || isLoading || roles.length === 0}
          className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-10 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="">{placeholder}</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} (Pos {r.position}) {r.managed ? '[Managed]' : ''} {r.isHigherThanBot ? '[Above Bot]' : ''}
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

      {selectedRole && showHierarchyBadges && (
        <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-500">
          {selectedRole.hexColor && selectedRole.hexColor !== '#000000' && (
            <span
              className="w-2.5 h-2.5 rounded-full inline-block border border-black/10"
              style={{ backgroundColor: selectedRole.hexColor }}
            />
          )}
          <span className="font-mono text-slate-400">ID: {selectedRole.id}</span>
          {selectedRole.botManageable !== false && !selectedRole.isHigherThanBot ? (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="w-3 h-3" /> Bot Can Assign
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
              <ShieldAlert className="w-3 h-3" />
              {selectedRole.isHigherThanBot ? 'Higher than Bot Role' : 'Managed / System Role'}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
