import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  RefreshCw,
  Download,
  Upload,
  UserCheck,
  Tag,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  X,
  Shield,
  Activity,
  ChevronLeft,
  ChevronRight,
  Filter,
  ArrowUpDown,
  Send,
  AlertTriangle,
  Award,
  Copy,
  Check,
} from 'lucide-react';
import { UserRole } from '../../../../shared/types/rbac.js';
import { MemberListResponse, MemberRoleInfo } from '../../../../shared/types/member360.js';
import { Member360Modal } from './Member360Modal.js';

interface MembersViewProps {
  communityId: string;
  currentRole: UserRole;
}

export const MembersView: React.FC<MembersViewProps> = ({ communityId, currentRole }) => {
  // Directory state
  const [data, setData] = useState<MemberListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter & Pagination State
  const [search, setSearch] = useState('');
  const [selectedRole, setSelectedRole] = useState('ALL');
  const [membershipStatus, setMembershipStatus] = useState('ALL');
  const [recruitmentStatus, setRecruitmentStatus] = useState<'ALL' | 'RECRUITED' | 'ORGANIC'>('ALL');
  const [warningStatus, setWarningStatus] = useState<'ALL' | 'HAS_WARNINGS' | 'CLEAN'>('ALL');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [sortBy, setSortBy] = useState<'joinedAt' | 'displayName' | 'lastSyncedAt'>('joinedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Available Discord roles for filter
  const [availableRoles, setAvailableRoles] = useState<MemberRoleInfo[]>([]);

  // Selected Member 360 Modal
  const [selected360UserId, setSelected360UserId] = useState<string | null>(null);

  // Assign Code Modal State
  const [assignCodeModalOpen, setAssignCodeModalOpen] = useState(false);
  const [targetMember, setTargetMember] = useState<{ discordUserId: string; displayName: string } | null>(null);
  const [inputCode, setInputCode] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Bulk Import Modal State
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [previewResult, setPreviewResult] = useState<{
    totalRows: number;
    validRows: number;
    invalidRows: number;
    unchangedRows: number;
    details: { rowIndex: number; discordUserId: string; recruiterCode?: string; status: string; reason?: string }[];
  } | null>(null);
  const [importing, setImporting] = useState(false);

  // Fetch Community Roles for Filter
  const fetchRoles = async () => {
    try {
      const res = await fetch(`/api/v1/community/${communityId}/discord-roles`);
      if (res.ok) {
        const json = await res.json();
        setAvailableRoles(json.data || []);
      }
    } catch (err) {
      console.warn('Could not fetch community roles for filters', err);
    }
  };

  // Fetch Members List with server-side filters & pagination
  const fetchMembers = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('communityId', communityId);
      params.append('page', String(page));
      params.append('limit', String(limit));
      if (search.trim()) params.append('q', search.trim());
      if (selectedRole !== 'ALL') params.append('roleId', selectedRole);
      if (membershipStatus !== 'ALL') params.append('membershipStatus', membershipStatus);
      if (recruitmentStatus !== 'ALL') params.append('recruitmentStatus', recruitmentStatus);
      if (warningStatus !== 'ALL') params.append('warningStatus', warningStatus);
      params.append('sortBy', sortBy);
      params.append('sortDirection', sortDirection);

      const res = await fetch(`/api/v1/community/members?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch member directory:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, [communityId]);

  useEffect(() => {
    fetchMembers();
  }, [communityId, page, limit, selectedRole, membershipStatus, recruitmentStatus, warningStatus, sortBy, sortDirection]);

  // Debounced search trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchMembers();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/v1/community/members/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      if (res.ok) {
        await fetchMembers();
      }
    } catch (err) {
      console.error('Failed to sync members:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCopyId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAssignCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetMember || !inputCode.trim()) return;

    setAssigning(true);
    setAssignError(null);
    try {
      const res = await fetch(`/api/v1/community/members/${targetMember.discordUserId}/assign-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recruiterCode: inputCode.trim().toUpperCase(), communityId }),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.message || 'Failed to assign recruiter code');
      }

      setAssignCodeModalOpen(false);
      setInputCode('');
      setTargetMember(null);
      await fetchMembers();
    } catch (err) {
      setAssignError((err as Error).message);
    } finally {
      setAssigning(false);
    }
  };

  const handleExportCsv = () => {
    window.open(`/api/v1/community/members/export?communityId=${communityId}`, '_blank');
  };

  const handlePreviewImport = async () => {
    if (!csvText.trim()) return;

    const lines = csvText.trim().split('\n');
    const rows: { discordUserId: string; recruiterCode?: string }[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
      if (i === 0 && (parts[0].toLowerCase().includes('discord') || parts[0].toLowerCase().includes('user'))) {
        continue;
      }
      if (parts[0]) {
        rows.push({
          discordUserId: parts[0],
          recruiterCode: parts[1] || parts[5] || undefined,
        });
      }
    }

    setImporting(true);
    try {
      const res = await fetch('/api/v1/community/members/import-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, rows }),
      });
      if (res.ok) {
        const json = await res.json();
        setPreviewResult(json.data);
      }
    } catch (err) {
      console.error('Failed to preview import:', err);
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewResult || !csvText.trim()) return;

    const lines = csvText.trim().split('\n');
    const rows: { discordUserId: string; recruiterCode?: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
      if (i === 0 && (parts[0].toLowerCase().includes('discord') || parts[0].toLowerCase().includes('user'))) {
        continue;
      }
      if (parts[0]) {
        rows.push({
          discordUserId: parts[0],
          recruiterCode: parts[1] || parts[5] || undefined,
        });
      }
    }

    setImporting(true);
    try {
      const res = await fetch('/api/v1/community/members/import-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, rows }),
      });
      if (res.ok) {
        setImportModalOpen(false);
        setCsvText('');
        setPreviewResult(null);
        await fetchMembers();
      }
    } catch (err) {
      console.error('Failed to confirm bulk import:', err);
    } finally {
      setImporting(false);
    }
  };

  const isStaff = ['OWNER', 'ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MANAGER', 'MODERATOR'].includes(currentRole);

  return (
    <div id="members-view-container" className="space-y-6">
      {/* Top Authoritative Header & Sync Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-neutral-900 border border-neutral-800 rounded-xl p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <h1 className="text-xl font-bold tracking-tight text-white">Member Directory & Community 360</h1>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Authoritative Discord membership records, roles, recruitment lineage, and 360-degree activity.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            id="btn-sync-members-now"
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="px-3.5 py-2 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-indigo-400' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Gateway'}
          </button>

          <button
            id="btn-export-members-csv"
            onClick={handleExportCsv}
            className="px-3.5 py-2 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-lg flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>

          {isStaff && (
            <button
              id="btn-import-members-csv"
              onClick={() => setImportModalOpen(true)}
              className="px-3.5 py-2 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <Upload className="w-3.5 h-3.5" />
              Import CSV
            </button>
          )}
        </div>
      </div>

      {/* Sync Overview Metrics */}
      {data?.syncOverview && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <div className="text-xs text-neutral-400">Total Directory Members</div>
            <div className="text-xl font-bold text-white mt-1">{data.syncOverview.totalMembers}</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">Authoritative records</div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <div className="text-xs text-neutral-400">Active Guild Members</div>
            <div className="text-xl font-bold text-emerald-400 mt-1">{data.syncOverview.activeMembers}</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">Connected in Discord</div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <div className="text-xs text-neutral-400">Linked Recruits</div>
            <div className="text-xl font-bold text-indigo-400 mt-1">{data.syncOverview.linkedRecruits}</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">Attributed via codes</div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <div className="text-xs text-neutral-400">Sync Status</div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-semibold text-neutral-200">{data.syncOverview.syncState}</span>
            </div>
            <div className="text-[11px] text-neutral-500 mt-0.5 truncate">
              {data.syncOverview.lastSyncedAt
                ? new Date(data.syncOverview.lastSyncedAt).toLocaleTimeString()
                : 'Synced'}
            </div>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="input-member-search"
              type="text"
              placeholder="Search by username, display name, Discord ID, or recruiter code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Role Filter */}
          <select
            id="filter-member-role"
            value={selectedRole}
            onChange={(e) => {
              setSelectedRole(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Roles</option>
            {availableRoles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          {/* Membership Status Filter */}
          <select
            id="filter-member-status"
            value={membershipStatus}
            onChange={(e) => {
              setMembershipStatus(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Membership Statuses</option>
            <option value="ACTIVE">Active in Guild</option>
            <option value="LEFT">Left Guild</option>
            <option value="BANNED">Banned</option>
          </select>

          {/* Recruitment Status Filter */}
          <select
            id="filter-recruitment-status"
            value={recruitmentStatus}
            onChange={(e) => {
              setRecruitmentStatus(e.target.value as any);
              setPage(1);
            }}
            className="px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-300 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Sources</option>
            <option value="RECRUITED">Recruited (Code Attached)</option>
            <option value="ORGANIC">Organic</option>
          </select>

          {/* Warnings Filter (if staff) */}
          {isStaff && (
            <select
              id="filter-warning-status"
              value={warningStatus}
              onChange={(e) => {
                setWarningStatus(e.target.value as any);
                setPage(1);
              }}
              className="px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">All Standing</option>
              <option value="HAS_WARNINGS">Active Warnings</option>
              <option value="CLEAN">Clean Standing</option>
            </select>
          )}

          {/* Sort Control */}
          <button
            id="btn-toggle-sort-direction"
            onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
            className="px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-neutral-300 hover:text-white flex items-center gap-1.5 transition-colors"
            title={`Sort Direction: ${sortDirection}`}
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            {sortDirection === 'asc' ? 'Oldest / A-Z' : 'Newest / Z-A'}
          </button>
        </div>
      </div>

      {/* Members Directory Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-neutral-300">
            <thead className="bg-neutral-950/60 text-neutral-400 uppercase tracking-wider text-[11px] border-b border-neutral-800">
              <tr>
                <th className="px-5 py-3 font-semibold">Member</th>
                <th className="px-4 py-3 font-semibold">Discord Roles</th>
                <th className="px-4 py-3 font-semibold">Recruitment</th>
                <th className="px-4 py-3 font-semibold">Joined Date</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-neutral-400">
                    <RefreshCw className="w-6 h-6 animate-spin text-indigo-500 mx-auto mb-2" />
                    Loading authoritative member directory...
                  </td>
                </tr>
              ) : !data?.items || data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-neutral-500">
                    No matching members found in community directory.
                  </td>
                </tr>
              ) : (
                (data.items || []).map((member) => (
                  <tr
                    key={member.id}
                    id={`member-row-${member.discordUserId}`}
                    onClick={() => setSelected360UserId(member.discordUserId)}
                    className="hover:bg-neutral-800/40 transition-colors cursor-pointer group"
                  >
                    {/* Member Column */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center font-medium text-neutral-200 shrink-0 overflow-hidden">
                          {member.avatarSnapshot ? (
                            <img src={member.avatarSnapshot} alt="" className="w-full h-full object-cover" />
                          ) : (
                            member.displayNameSnapshot.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-neutral-100 group-hover:text-indigo-400 transition-colors flex items-center gap-1.5">
                            {member.displayNameSnapshot}
                            {member.hasActiveWarnings && (
                              <span title="Active Moderation Warning">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-neutral-500 flex items-center gap-1">
                            <span>@{member.usernameSnapshot}</span>
                            <span>•</span>
                            <span
                              onClick={(e) => handleCopyId(member.discordUserId, e)}
                              className="font-mono hover:text-neutral-300 transition-colors"
                              title="Click to copy ID"
                            >
                              {member.discordUserId.substring(0, 10)}...
                              {copiedId === member.discordUserId ? (
                                <Check className="w-2.5 h-2.5 inline text-emerald-400 ml-0.5" />
                              ) : (
                                <Copy className="w-2.5 h-2.5 inline ml-0.5" />
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Roles Column */}
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {member.roleDetails && member.roleDetails.length > 0 ? (
                          member.roleDetails.slice(0, 3).map((r) => (
                            <span
                              key={r.id}
                              style={{ borderColor: r.color ? `${r.color}50` : '#374151' }}
                              className="px-2 py-0.5 text-[11px] font-medium bg-neutral-950 border rounded-md flex items-center gap-1"
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: r.color || '#818cf8' }}
                              />
                              {r.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-neutral-500 text-[11px]">No roles</span>
                        )}
                        {member.roleDetails && member.roleDetails.length > 3 && (
                          <span className="px-1.5 py-0.5 text-[11px] text-neutral-400 bg-neutral-800 rounded">
                            +{member.roleDetails.length - 3}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Recruitment Column */}
                    <td className="px-4 py-3.5">
                      {member.recruiterCode ? (
                        <span className="px-2 py-0.5 text-[11px] font-mono font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-md">
                          {member.recruiterCode}
                        </span>
                      ) : (
                        <span className="text-neutral-500 text-[11px]">Organic</span>
                      )}
                    </td>

                    {/* Joined Date */}
                    <td className="px-4 py-3.5 text-neutral-400 text-[11px]">
                      {member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : 'Unknown'}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3.5">
                      {member.membershipStatus === 'ACTIVE' && (
                        <span className="px-2 py-0.5 text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
                          Active
                        </span>
                      )}
                      {member.membershipStatus === 'LEFT' && (
                        <span className="px-2 py-0.5 text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">
                          Left
                        </span>
                      )}
                      {member.membershipStatus === 'BANNED' && (
                        <span className="px-2 py-0.5 text-[11px] font-medium bg-red-500/10 text-red-400 border border-red-500/20 rounded-full">
                          Banned
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          id={`btn-open-360-${member.discordUserId}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected360UserId(member.discordUserId);
                          }}
                          className="px-2.5 py-1 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-indigo-300 rounded-md transition-colors"
                        >
                          View 360
                        </button>
                        {isStaff && (
                          <button
                            id={`btn-quick-code-${member.discordUserId}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setTargetMember({
                                discordUserId: member.discordUserId,
                                displayName: member.displayNameSnapshot,
                              });
                              setInputCode(member.recruiterCode || '');
                              setAssignCodeModalOpen(true);
                            }}
                            className="p-1 text-neutral-400 hover:text-white rounded transition-colors"
                            title="Assign Recruiter Code"
                          >
                            <Tag className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {data && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-neutral-800 bg-neutral-950/40 text-xs text-neutral-400">
            <div className="flex items-center gap-2">
              <span>Rows per page:</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="px-2 py-1 bg-neutral-900 border border-neutral-700 rounded text-neutral-200 focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="ml-2">
                Showing {Math.min((page - 1) * limit + 1, data.total)} to{' '}
                {Math.min(page * limit, data.total)} of {data.total} members
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                id="btn-page-prev"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 bg-neutral-900 border border-neutral-800 rounded hover:bg-neutral-800 disabled:opacity-40 transition-colors text-neutral-300"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 bg-neutral-900 border border-neutral-800 rounded font-medium text-neutral-200">
                Page {page} of {data.totalPages || 1}
              </span>
              <button
                id="btn-page-next"
                onClick={() => setPage((p) => Math.min(data.totalPages || 1, p + 1))}
                disabled={page >= (data.totalPages || 1)}
                className="p-1.5 bg-neutral-900 border border-neutral-800 rounded hover:bg-neutral-800 disabled:opacity-40 transition-colors text-neutral-300"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Member 360 Full Modal */}
      {selected360UserId && (
        <Member360Modal
          communityId={communityId}
          discordUserId={selected360UserId}
          currentRole={currentRole}
          onClose={() => setSelected360UserId(null)}
          onMemberUpdated={fetchMembers}
        />
      )}

      {/* Assign Recruiter Code Modal */}
      {assignCodeModalOpen && targetMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-sm w-full p-5 space-y-4 shadow-xl">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Assign Recruiter Code</h3>
              <button onClick={() => setAssignCodeModalOpen(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-400">
              Set recruiter code attribution for <span className="text-white font-medium">{targetMember.displayName}</span>.
            </p>

            {assignError && (
              <div className="p-2.5 bg-red-950/40 border border-red-800/80 rounded-lg text-red-300 text-xs">
                {assignError}
              </div>
            )}

            <form onSubmit={handleAssignCodeSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-neutral-400 block mb-1">Recruiter Code</label>
                <input
                  id="input-modal-recruiter-code"
                  type="text"
                  required
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  placeholder="e.g. VIP2026"
                  className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-700 rounded-lg text-white font-mono uppercase focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssignCodeModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  id="btn-submit-assign-code"
                  type="submit"
                  disabled={assigning}
                  className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-medium"
                >
                  {assigning ? 'Saving...' : 'Save Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import CSV Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-xl w-full p-6 space-y-4 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
                Bulk Import Members / Recruiter Attribution
              </h3>
              <button onClick={() => setImportModalOpen(false)} className="text-neutral-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-400">
              Paste CSV rows containing <code className="text-indigo-300">discordUserId, recruiterCode</code>. The system will preflight validate each Discord ID before committing.
            </p>

            <textarea
              id="textarea-csv-import"
              rows={6}
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                setPreviewResult(null);
              }}
              placeholder={`discordUserId,recruiterCode\n123456789012345678,VIP2026\n987654321098765432,FALL2026`}
              className="w-full p-3 text-xs font-mono bg-neutral-950 border border-neutral-700 rounded-lg text-neutral-200 focus:outline-none focus:border-indigo-500"
            />

            {previewResult && (
              <div className="space-y-2 p-3 bg-neutral-950 border border-neutral-800 rounded-lg text-xs overflow-y-auto max-h-40">
                <div className="flex gap-4 font-semibold">
                  <span className="text-emerald-400">Valid: {previewResult.validRows}</span>
                  <span className="text-red-400">Invalid: {previewResult.invalidRows}</span>
                  <span className="text-neutral-400">Unchanged: {previewResult.unchangedRows}</span>
                </div>
                {previewResult.details.map((d, i) => (
                  <div key={i} className="text-[11px] flex justify-between py-1 border-b border-neutral-800/60">
                    <span className="font-mono text-neutral-300">{d.discordUserId}</span>
                    <span className={d.status === 'VALID' ? 'text-emerald-400' : 'text-red-400'}>
                      {d.status} {d.reason ? `(${d.reason})` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setImportModalOpen(false)}
                className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white"
              >
                Cancel
              </button>
              {!previewResult ? (
                <button
                  id="btn-preview-import"
                  onClick={handlePreviewImport}
                  disabled={importing || !csvText.trim()}
                  className="px-4 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white rounded-lg font-medium border border-neutral-700"
                >
                  {importing ? 'Validating...' : 'Preflight Preview'}
                </button>
              ) : (
                <button
                  id="btn-confirm-import"
                  onClick={handleConfirmImport}
                  disabled={importing || previewResult.validRows === 0}
                  className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-medium"
                >
                  {importing ? 'Importing...' : `Confirm Import (${previewResult.validRows} Records)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
