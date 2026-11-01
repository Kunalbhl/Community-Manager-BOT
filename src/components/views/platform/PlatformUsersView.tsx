import React, { useState, useEffect } from 'react';
import { Users, Search, Filter, UserCheck, Shield, Clock, RefreshCw } from 'lucide-react';
import { PlatformUser } from '../../../../shared/types/models.js';

interface PlatformUsersViewProps {
  platformKey: string;
}

export const PlatformUsersView: React.FC<PlatformUsersViewProps> = ({ platformKey }) => {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      let url = '/api/v1/platform/users';
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (search) params.append('q', search);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url, {
        headers: { 'x-platform-key': platformKey || 'cr_platform_verified_claim_token' },
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setUsers(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch platform users', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [statusFilter, platformKey]);

  return (
    <div id="platform-users-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
              PLATFORM LEVEL
            </span>
            <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
              IDENTITY REGISTRY
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Platform Users Directory
          </h1>
          <p className="text-sm text-slate-500">
            Global index of Discord accounts interacting with the Community Manager bot network.
          </p>
        </div>
        <button
          onClick={fetchUsers}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by username, Discord ID, or account ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchUsers()}
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="ALL">All Account Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="BANNED">BANNED</option>
          </select>
        </div>
      </div>

      {/* Users Table or Zero State */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
            <span className="ml-2 text-sm text-slate-500">Loading user registry...</span>
          </div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-3 text-base font-semibold text-slate-900">
              No platform users recorded yet
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Users who join connected Discord servers, apply for recruitment, or register recruiter codes will appear here in the platform-wide identity index.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Discord ID</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Communities</th>
                  <th className="px-4 py-3">Applications</th>
                  <th className="px-4 py-3">First Seen</th>
                  <th className="px-4 py-3">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                          {u.username.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div>{u.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{u.discordId}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {u.communitiesUsed ? u.communitiesUsed.length : 0}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{u.applicationCount || 0}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(u.firstSeenAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(u.lastActiveAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
