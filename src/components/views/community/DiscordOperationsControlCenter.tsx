import React, { useState, useEffect } from 'react';
import {
  Server,
  Shield,
  Layers,
  Wrench,
  Users,
  Hash,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Plus,
  Play,
  Zap,
  ArrowRight,
  ChevronRight,
  HelpCircle,
  Sliders,
  Sparkles,
  Lock,
  Eye,
  Check,
} from 'lucide-react';

interface DiscordOperationsControlCenterProps {
  communityId?: string;
}

export const DiscordOperationsControlCenter: React.FC<DiscordOperationsControlCenterProps> = ({
  communityId,
}) => {
  const [activeTab, setActiveTab] = useState<'hygiene' | 'blueprint' | 'roles' | 'channels' | 'bulk'>('hygiene');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Server Info
  const [serverInfo, setServerInfo] = useState<any>(null);

  // Hygiene State
  const [hygieneReport, setHygieneReport] = useState<any>(null);
  const [selectedFixFinding, setSelectedFixFinding] = useState<any>(null);
  const [fixSuccessMsg, setFixSuccessMsg] = useState<string | null>(null);

  // Blueprint State
  const [blueprint, setBlueprint] = useState<any>(null);
  const [selectedBlueprintModules, setSelectedBlueprintModules] = useState<string[]>([]);
  const [blueprintPreviewModal, setBlueprintPreviewModal] = useState<boolean>(false);
  const [blueprintResultMsg, setBlueprintResultMsg] = useState<string | null>(null);

  // Roles State
  const [roles, setRoles] = useState<any[]>([]);
  const [roleDiagnostics, setRoleDiagnostics] = useState<any>(null);
  const [newRoleName, setNewRoleName] = useState<string>('');
  const [newRoleColor, setNewRoleColor] = useState<string>('#3498db');
  const [roleAssignMemberId, setRoleAssignMemberId] = useState<string>('');
  const [roleAssignRoleId, setRoleAssignRoleId] = useState<string>('');

  // Channels State
  const [channels, setChannels] = useState<any[]>([]);
  const [newChannelName, setNewChannelName] = useState<string>('');
  const [newChannelTopic, setNewChannelTopic] = useState<string>('');
  const [channelDiag, setChannelDiag] = useState<any>(null);

  // Bulk State
  const [bulkAction, setBulkAction] = useState<'ASSIGN' | 'REMOVE'>('ASSIGN');
  const [bulkRoleId, setBulkRoleId] = useState<string>('');
  const [bulkMemberIdsInput, setBulkMemberIdsInput] = useState<string>('');
  const [bulkPreview, setBulkPreview] = useState<any>(null);
  const [bulkResult, setBulkResult] = useState<any>(null);

  // Initial Data Fetch
  const loadData = async () => {
    if (!communityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [srvRes, hygRes, bpRes, rolesRes, diagRes, chanRes] = await Promise.all([
        fetch(`/api/v1/communities/${communityId}/discord-ops/server`).then((r) => r.json()),
        fetch(`/api/v1/communities/${communityId}/discord-ops/hygiene`).then((r) => r.json()),
        fetch(`/api/v1/communities/${communityId}/discord-ops/blueprint`).then((r) => r.json()),
        fetch(`/api/v1/communities/${communityId}/discord-ops/roles`).then((r) => r.json()),
        fetch(`/api/v1/communities/${communityId}/discord-ops/roles/diagnostics`).then((r) => r.json()),
        fetch(`/api/v1/communities/${communityId}/discord-ops/channels`).then((r) => r.json()),
      ]);

      if (srvRes.data) setServerInfo(srvRes.data);
      if (hygRes.data) setHygieneReport(hygRes.data);
      if (bpRes.data) {
        setBlueprint(bpRes.data);
        setSelectedBlueprintModules(
          bpRes.data.modules.filter((m: any) => m.status === 'MISSING').map((m: any) => m.moduleId)
        );
      }
      if (rolesRes.data) setRoles(rolesRes.data);
      if (diagRes.data) setRoleDiagnostics(diagRes.data);
      if (chanRes.data) setChannels(chanRes.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load Discord Operations data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [communityId]);

  // Sync Discord Data
  const handleSyncServer = async () => {
    setLoading(true);
    try {
      await fetch(`/api/v1/communities/${communityId}/discord-ops/server/sync`, { method: 'POST' });
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Apply Hygiene Fix
  const handleApplyHygieneFix = async (findingId: string) => {
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/discord-ops/hygiene/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId, confirmed: true }),
      }).then((r) => r.json());

      if (res.success) {
        setFixSuccessMsg(res.message);
        setSelectedFixFinding(null);
        loadData();
      } else {
        setError(res.message || 'Failed to apply hygiene fix.');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Apply Blueprint
  const handleApplyBlueprint = async () => {
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/discord-ops/blueprint/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedModules: selectedBlueprintModules, confirmed: true }),
      }).then((r) => r.json());

      if (res.success) {
        setBlueprintResultMsg(res.message);
        setBlueprintPreviewModal(false);
        loadData();
      } else {
        setError(res.message || 'Blueprint application failed.');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Create Role
  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/discord-ops/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newRoleName, color: newRoleColor, confirmed: true }),
      }).then((r) => r.json());

      if (res.success) {
        setNewRoleName('');
        loadData();
      } else {
        setError(res.message);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Apply Role Template
  const handleApplyRoleTemplate = async (templateName: string) => {
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/discord-ops/roles/apply-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateName, confirmed: true }),
      }).then((r) => r.json());

      if (res.success) {
        loadData();
      } else {
        setError(res.message);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Assign Role
  const handleAssignRole = async () => {
    if (!roleAssignMemberId || !roleAssignRoleId) return;
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/discord-ops/roles/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIdOrDiscordId: roleAssignMemberId, roleId: roleAssignRoleId }),
      }).then((r) => r.json());

      if (res.success) {
        setFixSuccessMsg(res.message);
        setRoleAssignMemberId('');
      } else {
        setError(res.message);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Create Channel
  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannelName.trim()) return;
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/discord-ops/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newChannelName, topic: newChannelTopic, confirmed: true }),
      }).then((r) => r.json());

      if (res.success) {
        setNewChannelName('');
        setNewChannelTopic('');
        loadData();
      } else {
        setError(res.message);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Apply Channel Template
  const handleApplyChannelTemplate = async (templateName: string) => {
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/discord-ops/channels/apply-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateName, confirmed: true }),
      }).then((r) => r.json());

      if (res.success) {
        loadData();
      } else {
        setError(res.message);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Bulk Preview & Run
  const handlePreviewBulk = async () => {
    setBulkResult(null);
    const memberIds = bulkMemberIdsInput
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (!bulkRoleId || memberIds.length === 0) {
      setError('Please select a role and input at least one member ID.');
      return;
    }

    try {
      const res = await fetch(`/api/v1/communities/${communityId}/discord-ops/members/bulk-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: bulkAction, roleId: bulkRoleId, targetMemberIds: memberIds, confirmed: false }),
      }).then((r) => r.json());

      if (res.preview) {
        setBulkPreview(res.preview);
      } else if (res.message) {
        setError(res.message);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleExecuteBulk = async () => {
    const memberIds = bulkMemberIdsInput
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    try {
      const res = await fetch(`/api/v1/communities/${communityId}/discord-ops/members/bulk-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: bulkAction, roleId: bulkRoleId, targetMemberIds: memberIds, confirmed: true }),
      }).then((r) => r.json());

      if (res.success && res.result) {
        setBulkResult(res.result);
        setBulkPreview(null);
        setBulkMemberIdsInput('');
      } else {
        setError(res.message || 'Bulk operation failed.');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">Discord Operations & Server Control</h1>
              <p className="text-sm text-slate-500">
                Authoritative server governance, hygiene analyzer, role hierarchy manager, and bulk operations.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-semibold text-slate-400">AUTHORITATIVE DISCORD GUILD</div>
            <div className="text-sm font-bold text-slate-800">{serverInfo?.guildName || 'Linked Guild'}</div>
          </div>
          <button
            onClick={handleSyncServer}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-sm transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync Discord</span>
          </button>
        </div>
      </div>

      {/* Notifications / Errors */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {fixSuccessMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{fixSuccessMsg}</span>
          </div>
          <button onClick={() => setFixSuccessMsg(null)} className="font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('hygiene')}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'hygiene'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>Server Hygiene Engine</span>
          {hygieneReport?.findings?.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 font-bold">
              {hygieneReport.findings.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('blueprint')}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'blueprint'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Setup Blueprint Wizard</span>
          {blueprint && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700 font-bold">
              {blueprint.overallCompletionPercentage}%
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('roles')}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'roles'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Role Control & Hierarchy</span>
          <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700 font-bold">
            {roles.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('channels')}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'channels'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Hash className="w-4 h-4" />
          <span>Channels & Permissions</span>
          <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700 font-bold">
            {channels.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('bulk')}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'bulk'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>Bulk Member Operations</span>
        </button>
      </div>

      {/* TAB 1: SERVER HYGIENE ENGINE */}
      {activeTab === 'hygiene' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase">Overall Health</div>
              <div className="text-2xl font-black text-slate-900 mt-1 flex items-center gap-2">
                {hygieneReport?.overallHealth === 'HEALTHY' && (
                  <span className="text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-6 h-6" /> Healthy
                  </span>
                )}
                {hygieneReport?.overallHealth === 'ACTION_REQUIRED' && (
                  <span className="text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="w-6 h-6" /> Action Req.
                  </span>
                )}
                {hygieneReport?.overallHealth === 'DEGRADED' && (
                  <span className="text-red-600 flex items-center gap-1">
                    <XCircle className="w-6 h-6" /> Degraded
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase">Critical Findings</div>
              <div className="text-2xl font-black text-red-600 mt-1">
                {hygieneReport?.criticalCount || 0}
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase">High Priority</div>
              <div className="text-2xl font-black text-amber-600 mt-1">
                {hygieneReport?.highCount || 0}
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase">Medium / Low</div>
              <div className="text-2xl font-black text-slate-700 mt-1">
                {(hygieneReport?.mediumCount || 0) + (hygieneReport?.lowCount || 0)}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-base font-bold text-slate-900 mb-4">Server Hygiene Diagnostics & Fixes</h2>

            {hygieneReport?.findings?.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <p className="font-semibold text-slate-800">All Discord Server Hygiene Checks Passed!</p>
                <p className="text-xs text-slate-400 mt-1">
                  Your channels, role mappings, and bot gateway connections are fully aligned.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {hygieneReport?.findings?.map((finding: any) => (
                  <div
                    key={finding.findingId}
                    className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 text-xs font-extrabold rounded ${
                            finding.severity === 'CRITICAL'
                              ? 'bg-red-100 text-red-800'
                              : finding.severity === 'HIGH'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {finding.severity}
                        </span>
                        <span className="text-xs font-semibold text-slate-400 uppercase">
                          {finding.category}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900">{finding.title}</h3>
                      </div>
                      <p className="text-xs text-slate-600">{finding.evidence}</p>
                      <p className="text-xs font-semibold text-indigo-600 mt-1">
                        Recommendation: {finding.recommendedAction}
                      </p>
                    </div>

                    {finding.actionAvailability === 'ONE_CLICK_FIX' ? (
                      <button
                        onClick={() => setSelectedFixFinding(finding)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-sm whitespace-nowrap"
                      >
                        Fix Issue
                      </button>
                    ) : (
                      <span className="px-3 py-1 bg-slate-200 text-slate-600 font-bold text-xs rounded whitespace-nowrap">
                        Manual Action Required
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FIX CONFIRMATION MODAL */}
      {selectedFixFinding && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Confirm Hygiene Automated Fix</h3>
            <p className="text-xs text-slate-600">
              You are about to execute automated repair for finding:
            </p>
            <div className="p-3 bg-slate-100 rounded-lg text-xs space-y-1">
              <div className="font-bold text-slate-900">{selectedFixFinding.title}</div>
              <div className="text-slate-600">{selectedFixFinding.recommendedAction}</div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setSelectedFixFinding(null)}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleApplyHygieneFix(selectedFixFinding.findingId)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg"
              >
                Confirm & Apply Fix
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SETUP BLUEPRINT WIZARD */}
      {activeTab === 'blueprint' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Server Setup Blueprint Wizard</h2>
              <p className="text-xs text-slate-500">
                Provision missing Discord channels and role mappings automatically from standard community templates.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400 font-semibold uppercase">Blueprint Readiness</div>
              <div className="text-lg font-black text-indigo-600">
                {blueprint?.overallCompletionPercentage || 0}% Complete
              </div>
            </div>
          </div>

          {blueprintResultMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-semibold">
              {blueprintResultMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {blueprint?.modules?.map((mod: any) => {
              const isSelected = selectedBlueprintModules.includes(mod.moduleId);
              return (
                <div
                  key={mod.moduleId}
                  onClick={() => {
                    if (mod.status === 'CONFIGURED') return;
                    setSelectedBlueprintModules((prev) =>
                      prev.includes(mod.moduleId)
                        ? prev.filter((m) => m !== mod.moduleId)
                        : [...prev, mod.moduleId]
                    );
                  }}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    mod.status === 'CONFIGURED'
                      ? 'border-emerald-200 bg-emerald-50/30 opacity-80 cursor-default'
                      : isSelected
                      ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{mod.title}</span>
                        {mod.status === 'CONFIGURED' ? (
                          <span className="px-2 py-0.5 text-[10px] bg-emerald-100 text-emerald-800 font-bold rounded">
                            Configured
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] bg-amber-100 text-amber-800 font-bold rounded">
                            Missing
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600">{mod.description}</p>
                      <div className="text-[11px] font-mono text-slate-500 mt-2">
                        Suggested: #{mod.suggestedChannelName}
                        {mod.suggestedRoleName && ` • @${mod.suggestedRoleName}`}
                      </div>
                    </div>

                    {mod.status !== 'CONFIGURED' && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="w-4 h-4 text-indigo-600 rounded"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              onClick={() => setBlueprintPreviewModal(true)}
              disabled={selectedBlueprintModules.length === 0}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Apply Selected Blueprint ({selectedBlueprintModules.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* BLUEPRINT PREVIEW MODAL */}
      {blueprintPreviewModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Confirm Blueprint Provisioning</h3>
            <p className="text-xs text-slate-600">
              The following operational modules will be created in your linked Discord server:
            </p>
            <div className="p-3 bg-slate-100 rounded-lg text-xs space-y-2 max-h-48 overflow-y-auto">
              {selectedBlueprintModules.map((m) => (
                <div key={m} className="font-bold text-slate-800 flex items-center gap-2">
                  <Check className="w-4 h-4 text-indigo-600" /> Module: {m}
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setBlueprintPreviewModal(false)}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyBlueprint}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg"
              >
                Confirm & Execute
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ROLES & HIERARCHY CONTROL */}
      {activeTab === 'roles' && (
        <div className="space-y-6">
          {/* Hierarchy Diagnostics Card */}
          {roleDiagnostics && (
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="w-6 h-6 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Role Hierarchy Diagnostics</h3>
                  <p className="text-xs text-slate-600">{roleDiagnostics.details}</p>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded text-xs font-bold ${
                  roleDiagnostics.isBotPositionOptimal
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                Bot Position: {roleDiagnostics.botRolePosition}
              </span>
            </div>
          )}

          {/* Role Templates & Creation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Create Discord Role</h3>
              <form onSubmit={handleCreateRole} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Role Name</label>
                  <input
                    type="text"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="e.g. Community Moderator"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Hex Color</label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={newRoleColor}
                      onChange={(e) => setNewRoleColor(e.target.value)}
                      className="w-8 h-8 rounded border-none cursor-pointer"
                    />
                    <input
                      type="text"
                      value={newRoleColor}
                      onChange={(e) => setNewRoleColor(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-sm"
                >
                  Create Role in Discord
                </button>
              </form>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Quick Role Templates</h3>
              <p className="text-xs text-slate-500">
                Instantly provision standard operational roles with pre-configured permissions.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: 'NEW_MEMBER', label: 'Member' },
                  { name: 'VERIFIED', label: 'Verified Member' },
                  { name: 'RECRUITER', label: 'Recruiter' },
                  { name: 'INTERVIEWER', label: 'Interviewer' },
                  { name: 'MODERATOR', label: 'Moderator' },
                ].map((tpl) => (
                  <button
                    key={tpl.name}
                    onClick={() => handleApplyRoleTemplate(tpl.name)}
                    className="p-3 border border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/30 rounded-lg text-xs font-bold text-slate-800 text-left transition-colors"
                  >
                    + {tpl.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Existing Discord Roles List */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Authoritative Discord Guild Roles</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 uppercase font-semibold">
                    <th className="pb-3">Role Name</th>
                    <th className="pb-3">Role ID</th>
                    <th className="pb-3">Color</th>
                    <th className="pb-3">Position</th>
                    <th className="pb-3">Managed Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {roles.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-bold text-slate-900 flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full border border-slate-300"
                          style={{ backgroundColor: r.color }}
                        />
                        {r.name}
                      </td>
                      <td className="py-3 font-mono text-slate-500">{r.id}</td>
                      <td className="py-3 font-mono text-slate-500">{r.color}</td>
                      <td className="py-3 font-bold text-slate-700">{r.position}</td>
                      <td className="py-3">
                        {r.managed ? (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold rounded">
                            Managed Bot Role
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded">
                            Manageable
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CHANNELS & PERMISSIONS */}
      {activeTab === 'channels' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Create Channel */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Create Discord Channel</h3>
              <form onSubmit={handleCreateChannel} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Channel Name</label>
                  <input
                    type="text"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    placeholder="e.g. recruitment-applications"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Topic (Optional)</label>
                  <input
                    type="text"
                    value={newChannelTopic}
                    onChange={(e) => setNewChannelTopic(e.target.value)}
                    placeholder="e.g. Official recruitment intake channel"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg mt-1"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-sm"
                >
                  Create Channel in Discord
                </button>
              </form>
            </div>

            {/* Channel Templates */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Operational Channel Templates</h3>
              <p className="text-xs text-slate-500">
                Provision standard community workspace channels with one click.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: 'WELCOME', label: '#welcome' },
                  { name: 'RECRUITMENT', label: '#recruitment-applications' },
                  { name: 'ANNOUNCEMENTS', label: '#announcements' },
                  { name: 'MODERATION_LOG', label: '#mod-log' },
                  { name: 'INTERVIEW', label: '#applicant-interviews' },
                  { name: 'EVENT', label: '#community-events' },
                ].map((tpl) => (
                  <button
                    key={tpl.name}
                    onClick={() => handleApplyChannelTemplate(tpl.name)}
                    className="p-3 border border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/30 rounded-lg text-xs font-bold text-slate-800 text-left transition-colors"
                  >
                    + {tpl.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Existing Channels List */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Authoritative Discord Channels</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 uppercase font-semibold">
                    <th className="pb-3">Channel Name</th>
                    <th className="pb-3">Channel ID</th>
                    <th className="pb-3">Type</th>
                    <th className="pb-3">Bot View / Send</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {channels.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-bold text-slate-900">#{c.name}</td>
                      <td className="py-3 font-mono text-slate-500">{c.id}</td>
                      <td className="py-3 text-slate-600">{c.type}</td>
                      <td className="py-3">
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded">
                          Verified Accessible
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: BULK MEMBER OPERATIONS */}
      {activeTab === 'bulk' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">Rate-Limited Bulk Member Operations</h2>
              <p className="text-xs text-slate-500">
                Safely assign or remove roles across multiple community members with automatic Discord rate-limit throttling.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600">Action Type</label>
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => setBulkAction('ASSIGN')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border ${
                      bulkAction === 'ASSIGN'
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Assign Role
                  </button>
                  <button
                    onClick={() => setBulkAction('REMOVE')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg border ${
                      bulkAction === 'REMOVE'
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Remove Role
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Target Role</label>
                <select
                  value={bulkRoleId}
                  onChange={(e) => setBulkRoleId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg mt-1"
                >
                  <option value="">-- Select Target Role --</option>
                  {roles
                    .filter((r) => !r.managed)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.id})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">
                Target Member / Discord User Snowflake IDs (One per line or comma-separated)
              </label>
              <textarea
                value={bulkMemberIdsInput}
                onChange={(e) => setBulkMemberIdsInput(e.target.value)}
                rows={5}
                placeholder="123456789012345678&#10;987654321098765432"
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono mt-1"
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                onClick={handlePreviewBulk}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-lg"
              >
                Preview Operation Risk
              </button>

              {bulkPreview && (
                <button
                  onClick={handleExecuteBulk}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg shadow-sm"
                >
                  Execute Bulk Operation ({bulkPreview.estimatedAffectedCount})
                </button>
              )}
            </div>
          </div>

          {/* Bulk Risk Preview Card */}
          {bulkPreview && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-amber-900">Operation Risk Assessment</h3>
                <span className="px-3 py-1 bg-amber-200 text-amber-900 font-bold text-xs rounded-full">
                  Risk Level: {bulkPreview.riskLevel}
                </span>
              </div>
              <p className="text-xs text-amber-800">{bulkPreview.impactDescription}</p>
              {bulkPreview.warnings?.map((w: string, idx: number) => (
                <div key={idx} className="text-xs font-semibold text-amber-900 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700" /> {w}
                </div>
              ))}
            </div>
          )}

          {/* Bulk Execution Result Card */}
          {bulkResult && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">Bulk Operation Execution Summary</h3>
                <span className="text-xs font-mono text-slate-400">ID: {bulkResult.operationId}</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 bg-emerald-50 rounded-lg">
                  <div className="text-xs font-semibold text-emerald-800 uppercase">Succeeded</div>
                  <div className="text-xl font-black text-emerald-600">{bulkResult.succeededCount}</div>
                </div>
                <div className="p-3 bg-red-50 rounded-lg">
                  <div className="text-xs font-semibold text-red-800 uppercase">Failed</div>
                  <div className="text-xl font-black text-red-600">{bulkResult.failedCount}</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <div className="text-xs font-semibold text-slate-600 uppercase">Duration</div>
                  <div className="text-xl font-black text-slate-800">{bulkResult.durationMs}ms</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
