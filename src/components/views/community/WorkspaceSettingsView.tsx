import React, { useState, useEffect } from 'react';
import {
  Building2,
  Users,
  UserPlus,
  Shield,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Mail,
  RefreshCw,
  XCircle,
  Crown,
  Key,
  Layers,
} from 'lucide-react';
import {
  WorkspaceDocument,
  WorkspaceMemberDocument,
  WorkspaceInvitationDocument,
  WorkspaceRole,
} from '../../../../shared/types/models.js';

interface WorkspaceSettingsViewProps {
  workspaceId?: string;
  onClose?: () => void;
}

export const WorkspaceSettingsView: React.FC<WorkspaceSettingsViewProps> = ({ workspaceId, onClose }) => {
  const [workspace, setWorkspace] = useState<WorkspaceDocument | null>(null);
  const [memberRole, setMemberRole] = useState<WorkspaceRole>('WORKSPACE_MEMBER');
  const [members, setMembers] = useState<WorkspaceMemberDocument[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitationDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'MEMBERS' | 'SETTINGS' | 'DANGER'>('MEMBERS');

  // Form states
  const [workspaceName, setWorkspaceName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('WORKSPACE_MEMBER');
  const [transferTargetUserId, setTransferTargetUserId] = useState('');
  const [transferConfirmText, setTransferConfirmText] = useState('');
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadWorkspace = async () => {
    if (!workspaceId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/workspaces/${workspaceId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setWorkspace(json.data.workspace);
        setWorkspaceName(json.data.workspace.name);
        setMemberRole(json.data.memberRole);
        setMembers(json.data.members || []);
      }
    } catch (err) {
      console.error('Failed loading workspace', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, [workspaceId]);

  const handleUpdateName = async () => {
    if (!workspaceId || !workspaceName) return;
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: workspaceName }),
      });
      const json = await res.json();
      if (json.success) {
        setActionMessage({ type: 'success', text: 'Workspace name updated successfully' });
        loadWorkspace();
      } else {
        setActionMessage({ type: 'error', text: json.message || 'Failed updating workspace' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Network error updating workspace' });
    }
  };

  const handleSendInvite = async () => {
    if (!workspaceId || !inviteEmail) return;
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitedEmail: inviteEmail,
          role: inviteRole,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setActionMessage({ type: 'success', text: `Invitation sent to ${inviteEmail}` });
        setInviteEmail('');
        loadWorkspace();
      } else {
        setActionMessage({ type: 'error', text: json.message || 'Failed sending invitation' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Failed sending invitation' });
    }
  };

  const handleTransferOwnership = async () => {
    if (!workspaceId || !transferTargetUserId) return;
    if (transferConfirmText !== 'TRANSFER') {
      setActionMessage({ type: 'error', text: 'Please type "TRANSFER" to confirm ownership transfer.' });
      return;
    }
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/transfer-ownership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: transferTargetUserId }),
      });
      const json = await res.json();
      if (json.success) {
        setActionMessage({ type: 'success', text: `Workspace ownership transferred to ${transferTargetUserId}` });
        setTransferConfirmText('');
        loadWorkspace();
      } else {
        setActionMessage({ type: 'error', text: json.message || 'Failed transferring ownership' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Failed transferring ownership' });
    }
  };

  const handleDeletionWorkflow = async (action: 'REQUEST' | 'CONFIRM' | 'CANCEL') => {
    if (!workspaceId) return;
    try {
      const res = await fetch(`/api/v1/workspaces/${workspaceId}/deletion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (json.success) {
        setActionMessage({ type: 'success', text: `Deletion workflow status updated: ${json.data.status}` });
        loadWorkspace();
      } else {
        setActionMessage({ type: 'error', text: json.message || 'Failed updating deletion workflow' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Error in deletion workflow' });
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500 flex items-center justify-center gap-2">
        <RefreshCw className="h-5 w-5 animate-spin text-indigo-600" />
        <span>Loading workspace details...</span>
      </div>
    );
  }

  if (!workspace) {
    return <div className="p-8 text-center text-slate-500">Workspace not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{workspace.name}</h1>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
              <span>ID: {workspace.id}</span>
              <span>•</span>
              <span className="font-semibold text-indigo-600">Role: {memberRole}</span>
              <span>•</span>
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                {workspace.status}
              </span>
            </div>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Close Settings
          </button>
        )}
      </div>

      {actionMessage && (
        <div
          className={`p-4 rounded-lg text-sm font-medium flex items-center gap-2 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-600" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-6">
        <button
          onClick={() => setActiveTab('MEMBERS')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'MEMBERS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="h-4 w-4" />
          <span>Members & Roles ({members.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('SETTINGS')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'SETTINGS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="h-4 w-4" />
          <span>Workspace Settings</span>
        </button>

        {memberRole === 'WORKSPACE_OWNER' && (
          <button
            onClick={() => setActiveTab('DANGER')}
            className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition ${
              activeTab === 'DANGER'
                ? 'border-rose-600 text-rose-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shield className="h-4 w-4" />
            <span>Ownership & Danger Zone</span>
          </button>
        )}
      </div>

      {/* TAB 1: MEMBERS */}
      {activeTab === 'MEMBERS' && (
        <div className="space-y-6">
          {/* Invite Section */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-indigo-600" />
              <span>Invite Workspace Member</span>
            </h3>

            <div className="flex flex-wrap gap-3 items-center">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
                className="flex-1 min-w-[240px] rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none bg-white"
              >
                <option value="WORKSPACE_MEMBER">WORKSPACE_MEMBER</option>
                <option value="WORKSPACE_ADMIN">WORKSPACE_ADMIN</option>
              </select>
              <button
                onClick={handleSendInvite}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition"
              >
                Send Invite
              </button>
            </div>
          </div>

          {/* Members List Table */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 font-bold text-xs uppercase tracking-wider text-slate-500 flex justify-between items-center">
              <span>Active Workspace Members</span>
              <span>Total: {members.length}</span>
            </div>

            <div className="divide-y divide-slate-100">
              {members.map((m) => (
                <div key={m.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700">
                      {m.userId.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <span>{m.userId}</span>
                        {m.role === 'WORKSPACE_OWNER' && (
                          <span className="flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                            <Crown className="h-3 w-3 text-amber-600" />
                            Owner
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        Joined: {new Date(m.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-50">
                      {m.role}
                    </span>
                    <span className="text-xs font-semibold text-emerald-600">{m.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SETTINGS */}
      {activeTab === 'SETTINGS' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <h3 className="text-sm font-bold text-slate-900">General Workspace Information</h3>

          <div className="space-y-2 max-w-lg">
            <label className="text-xs font-bold text-slate-700">Workspace Display Name</label>
            <input
              type="text"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700">Bound Communities / Discord Servers</label>
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-600 space-y-1">
              {!workspace?.communityIds || workspace.communityIds.length === 0 ? (
                <div>No communities assigned to this workspace yet. Use Onboarding to connect a server.</div>
              ) : (
                (workspace.communityIds || []).map((cId) => (
                  <div key={cId} className="flex items-center gap-2 font-semibold text-slate-800">
                    <Layers className="h-3.5 w-3.5 text-indigo-600" />
                    <span>{cId}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            onClick={handleUpdateName}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition"
          >
            Save Changes
          </button>
        </div>
      )}

      {/* TAB 3: DANGER ZONE */}
      {activeTab === 'DANGER' && memberRole === 'WORKSPACE_OWNER' && (
        <div className="space-y-6">
          {/* Ownership Transfer */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-6 space-y-4">
            <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-600" />
              <span>Transfer Workspace Ownership</span>
            </h3>
            <p className="text-xs text-amber-800">
              Transferring workspace ownership demotes your workspace role to WORKSPACE_ADMIN and elevates the target member to WORKSPACE_OWNER. This generates an immutable audit record (`WORKSPACE_OWNER_CHANGED`).
            </p>

            <div className="space-y-3 max-w-md">
              <select
                value={transferTargetUserId}
                onChange={(e) => setTransferTargetUserId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
              >
                <option value="">Select target active member...</option>
                {members
                  .filter((m) => m.userId !== workspace.ownerUserId)
                  .map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.userId} ({m.role})
                    </option>
                  ))}
              </select>

              <input
                type="text"
                value={transferConfirmText}
                onChange={(e) => setTransferConfirmText(e.target.value)}
                placeholder='Type "TRANSFER" to confirm'
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />

              <button
                onClick={handleTransferOwnership}
                disabled={!transferTargetUserId || transferConfirmText !== 'TRANSFER'}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition"
              >
                Transfer Ownership
              </button>
            </div>
          </div>

          {/* Deletion Workflow */}
          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-6 space-y-4">
            <h3 className="text-sm font-bold text-rose-900 flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-rose-600" />
              <span>Protected Workspace Deletion Workflow</span>
            </h3>
            <p className="text-xs text-rose-800">
              SaaS workspace deletion follows a multi-stage safety workflow (`REQUESTED` → `CONFIRMATION_REQUIRED` → `SCHEDULED`). Immediate hard-deletion is blocked to prevent accidental data loss.
            </p>

            <div className="flex flex-wrap gap-3">
              {workspace.status === 'ACTIVE' && (
                <button
                  onClick={() => handleDeletionWorkflow('REQUEST')}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 transition"
                >
                  Request Deletion
                </button>
              )}

              {workspace.status === 'DELETION_REQUESTED' && (
                <button
                  onClick={() => handleDeletionWorkflow('CONFIRM')}
                  className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800 transition"
                >
                  Schedule 7-Day Deletion
                </button>
              )}

              {(workspace.status === 'DELETION_REQUESTED' || workspace.status === 'SCHEDULED_FOR_DELETION') && (
                <button
                  onClick={() => handleDeletionWorkflow('CANCEL')}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 transition"
                >
                  Cancel Deletion Workflow
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
