import React, { useState, useEffect } from 'react';
import {
  Server,
  Search,
  Filter,
  ShieldAlert,
  CheckCircle,
  Clock,
  AlertCircle,
  Eye,
  RefreshCw,
  Power,
  X,
} from 'lucide-react';
import { PlatformServer, PlatformServerStatus } from '../../../../shared/types/models.js';

interface PlatformServersViewProps {
  platformKey: string;
}

export const PlatformServersView: React.FC<PlatformServersViewProps> = ({ platformKey }) => {
  const [servers, setServers] = useState<PlatformServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedServer, setSelectedServer] = useState<PlatformServer | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchServers = async () => {
    setLoading(true);
    try {
      let url = '/api/v1/platform/servers';
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (search) params.append('q', search);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url, {
        headers: { 'x-platform-key': platformKey || 'cr_platform_verified_claim_token' },
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setServers(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch servers', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServers();
  }, [statusFilter, platformKey]);

  const handleToggleSuspend = async (server: PlatformServer) => {
    setUpdatingId(server.id);
    const newStatus: PlatformServerStatus = server.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    try {
      const res = await fetch(`/api/v1/platform/servers/${server.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-platform-key': platformKey || 'cr_platform_verified_claim_token',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.success) {
        setServers((prev) =>
          prev.map((s) => (s.id === server.id ? { ...s, status: newStatus } : s))
        );
        if (selectedServer && selectedServer.id === server.id) {
          setSelectedServer({ ...selectedServer, status: newStatus });
        }
      }
    } catch (err) {
      console.error('Failed to update server status', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusBadge = (status: PlatformServerStatus) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            <CheckCircle className="h-3 w-3" /> Active
          </span>
        );
      case 'SUSPENDED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
            <ShieldAlert className="h-3 w-3" /> Suspended
          </span>
        );
      case 'CONFIGURATION_REQUIRED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
            <Clock className="h-3 w-3" /> Config Required
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
            <AlertCircle className="h-3 w-3" /> Error
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
            Inactive
          </span>
        );
    }
  };

  return (
    <div id="platform-servers-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
              PLATFORM LEVEL
            </span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              TENANT REGISTRY
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Registered Discord Communities
          </h1>
          <p className="text-sm text-slate-500">
            Manage bot installations, track multi-tenant health, and inspect server configurations.
          </p>
        </div>
        <button
          onClick={fetchServers}
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
            placeholder="Search by community name or Discord guild ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchServers()}
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
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="CONFIGURATION_REQUIRED">Config Required</option>
            <option value="ERROR">Error</option>
          </select>
        </div>
      </div>

      {/* Servers Table or Zero State */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
            <span className="ml-2 text-sm text-slate-500">Loading registered servers...</span>
          </div>
        ) : servers.length === 0 ? (
          <div className="py-16 text-center">
            <Server className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-3 text-base font-semibold text-slate-900">
              No communities registered yet
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              When Discord community owners install the Community Manager bot using the bot invite URL, their servers and configuration status will be listed here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Community / Server</th>
                  <th className="px-4 py-3">Guild ID</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Bot Status</th>
                  <th className="px-4 py-3">Installed</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {servers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 font-bold text-indigo-700">
                          {s.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div>{s.name}</div>
                          <div className="text-xs text-slate-400">ID: {s.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.guildId}</td>
                    <td className="px-4 py-3">{getStatusBadge(s.status)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        {s.botStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(s.installedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedServer(s)}
                          className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                          title="Inspect Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleToggleSuspend(s)}
                          disabled={updatingId === s.id}
                          className={`rounded p-1.5 ${
                            s.status === 'SUSPENDED'
                              ? 'text-emerald-600 hover:bg-emerald-50'
                              : 'text-red-600 hover:bg-red-50'
                          }`}
                          title={s.status === 'SUSPENDED' ? 'Activate Server' : 'Suspend Server'}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {selectedServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                Server Operational Inspection
              </h3>
              <button
                onClick={() => setSelectedServer(null)}
                className="rounded p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between border-b border-slate-50 pb-2">
                <span className="text-slate-500">Community Name:</span>
                <span className="font-semibold text-slate-800">{selectedServer.name}</span>
              </div>
              <div className="flex justify-between border-b border-slate-50 pb-2">
                <span className="text-slate-500">Discord Guild ID:</span>
                <span className="font-mono text-xs text-slate-800">{selectedServer.guildId}</span>
              </div>
              <div className="flex justify-between border-b border-slate-50 pb-2">
                <span className="text-slate-500">Owner User ID:</span>
                <span className="font-mono text-xs text-slate-800">{selectedServer.ownerUserId}</span>
              </div>
              <div className="flex justify-between border-b border-slate-50 pb-2">
                <span className="text-slate-500">Tenant Status:</span>
                <span>{getStatusBadge(selectedServer.status)}</span>
              </div>
              <div className="flex justify-between border-b border-slate-50 pb-2">
                <span className="text-slate-500">Bot Connection Status:</span>
                <span className="font-medium text-slate-800">{selectedServer.botStatus}</span>
              </div>
              <div className="flex justify-between border-b border-slate-50 pb-2">
                <span className="text-slate-500">Configuration Status:</span>
                <span className="font-medium text-slate-800">{selectedServer.configurationStatus}</span>
              </div>
              <div className="flex justify-between border-b border-slate-50 pb-2">
                <span className="text-slate-500">Installed Date:</span>
                <span className="text-slate-800">
                  {new Date(selectedServer.installedAt).toLocaleString()}
                </span>
              </div>

              <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                <span className="font-semibold">Privacy Boundary:</span> Private applicant answers and individual interview notes remain tenant-isolated and are never exposed across the platform management boundary.
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => handleToggleSuspend(selectedServer)}
                disabled={updatingId === selectedServer.id}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium text-white ${
                  selectedServer.status === 'SUSPENDED'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {selectedServer.status === 'SUSPENDED' ? 'Activate Server' : 'Suspend Server'}
              </button>
              <button
                onClick={() => setSelectedServer(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
