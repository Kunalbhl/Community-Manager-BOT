import React, { useState, useEffect } from 'react';
import { Share2, Plus, Copy, Check, RefreshCw, XCircle, Search } from 'lucide-react';
import { RecruiterCodeDocument } from '../../../../shared/types/models.js';
import { UserRole } from '../../../../shared/types/rbac.js';

interface RecruiterCodesViewProps {
  communityId: string;
  currentRole: UserRole;
}

export const RecruiterCodesView: React.FC<RecruiterCodesViewProps> = ({
  communityId,
  currentRole,
}) => {
  const [codes, setCodes] = useState<RecruiterCodeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCode, setNewCode] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchCodes = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/recruiter-codes?communityId=${communityId}`, {
        headers: {
          'x-user-role': currentRole,
          'x-role': currentRole,
          'x-community-id': communityId,
        },
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setCodes(json.data);
        }
      } else {
        setCodes([]);
      }
    } catch (err) {
      console.error('Failed to load recruiter codes', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCodes();
  }, [communityId, currentRole]);

  const handleCreateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/v1/recruiter-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': currentRole,
          'x-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          communityId,
          code: newCode.trim().toUpperCase(),
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const json = await res.json();
        if (json.success) {
          setNewCode('');
          fetchCodes();
        }
      }
    } catch (err) {
      console.error('Failed to create code', err);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/recruiter-codes/${id}`, {
        method: 'DELETE',
        headers: {
          'x-user-role': currentRole,
          'x-role': currentRole,
          'x-community-id': communityId,
        },
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const json = await res.json();
        if (json.success) {
          setCodes((prev) => prev.map((c) => (c.id === id ? { ...c, isActive: false } : c)));
        }
      }
    } catch (err) {
      console.error('Failed to revoke code', err);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div id="recruiter-codes-view" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              COMMUNITY SCOPE
            </span>
            <span className="rounded bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              MODULE 5 OF 14
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Recruiter Codes Management
          </h1>
          <p className="text-sm text-slate-500">
            Issue referral codes, monitor invitation metrics, and manage active code permissions.
          </p>
        </div>

        <form onSubmit={handleCreateCode} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="e.g. VIP-RECRUIT"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono uppercase focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={creating || !newCode.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Issue Code
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
            <span className="ml-2 text-sm text-slate-500">Loading recruiter codes...</span>
          </div>
        ) : codes.length === 0 ? (
          <div className="py-16 text-center">
            <Share2 className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-3 text-base font-semibold text-slate-900">
              No recruiter codes issued yet
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Generate a recruiter code above to track candidate attribution and reward recruiters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Uses</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-xs">
                {codes.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-bold text-slate-900">{c.code}</td>
                    <td className="px-4 py-3 text-slate-600">{c.recruiterUserId}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 font-semibold ${
                          c.isActive
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {c.isActive ? 'ACTIVE' : 'REVOKED'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{c.totalUses || 0}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right font-sans">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => copyCode(c.code)}
                          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title="Copy Code"
                        >
                          {copiedCode === c.code ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {c.isActive && (
                          <button
                            onClick={() => handleRevoke(c.id)}
                            className="rounded p-1 text-rose-600 hover:bg-rose-50"
                            title="Revoke Code"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
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
