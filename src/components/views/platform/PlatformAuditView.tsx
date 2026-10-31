import React, { useState, useEffect } from 'react';
import { ShieldCheck, Filter, Search, Lock, AlertTriangle, RefreshCw } from 'lucide-react';
import { PlatformAuditEvent } from '../../../../shared/types/models.js';

interface PlatformAuditViewProps {
  platformKey: string;
}

export const PlatformAuditView: React.FC<PlatformAuditViewProps> = ({ platformKey }) => {
  const [logs, setLogs] = useState<PlatformAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('ALL');

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/platform/audit', {
        headers: { 'x-platform-key': platformKey || 'cr_platform_verified_claim_token' },
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setLogs(json.data);
      }
    } catch (err) {
      console.error('Failed to load audit logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [platformKey]);

  const filteredLogs = actionFilter === 'ALL'
    ? logs
    : logs.filter((l) => l.action === actionFilter);

  return (
    <div id="platform-audit-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
              PLATFORM LEVEL
            </span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              SECURITY & COMPLIANCE
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Platform Security & Audit Trail
          </h1>
          <p className="text-sm text-slate-500">
            Immutable log of server installations, suspensions, authorization events, and platform modifications.
          </p>
        </div>
        <button
          onClick={fetchAuditLogs}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Redaction Notice */}
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
        <Lock className="h-4 w-4 text-indigo-600 shrink-0" />
        <span>
          <strong className="text-slate-800">Automatic Credential Redaction:</strong> All authentication tokens, API keys, and Discord OAuth secrets are masked before persistence in platform audit trails.
        </span>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Action Type:</span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Actions</option>
            <option value="SERVER_INSTALLED">Server Installed</option>
            <option value="SERVER_SUSPENDED">Server Suspended</option>
            <option value="SERVER_ACTIVATED">Server Activated</option>
            <option value="PLATFORM_SETTINGS_CHANGED">Settings Changed</option>
            <option value="PLATFORM_AUTH_EVENT">Auth Event</option>
            <option value="SECURITY_EVENT">Security Event</option>
          </select>
        </div>
        <span className="text-xs text-slate-500">{filteredLogs.length} events logged</span>
      </div>

      {/* Audit Logs Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
            <span className="ml-2 text-sm text-slate-500">Loading audit trail...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="py-16 text-center">
            <ShieldCheck className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-3 text-base font-semibold text-slate-900">
              No audit events recorded yet
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Platform administration actions, server suspensions, and security verification events will appear here in the immutable audit log.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-xs">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-800">{log.actorUserId}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700">
                        {log.actorRole}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{log.action}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {log.targetType}:{log.targetId}
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {log.metadata ? JSON.stringify(log.metadata) : '-'}
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
