import React, { useState, useEffect } from 'react';
import { Building2, ChevronDown, Plus, Settings, Check, Users } from 'lucide-react';
import { WorkspaceDocument, WorkspaceRole } from '../../../shared/types/models.js';

interface WorkspaceItem {
  workspace: WorkspaceDocument;
  memberRole: WorkspaceRole;
}

interface WorkspaceSwitcherProps {
  selectedWorkspaceId?: string;
  onSelectWorkspace: (workspaceId: string) => void;
  onOpenWorkspaceSettings?: () => void;
  onOpenCreateWorkspaceModal?: () => void;
}

export const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = ({
  selectedWorkspaceId,
  onSelectWorkspace,
  onOpenWorkspaceSettings,
  onOpenCreateWorkspaceModal,
}) => {
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchWorkspaces = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/workspaces');
      if (!res.ok) return;
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) return;
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setWorkspaces(json.data);
        if (!selectedWorkspaceId && json.data.length > 0) {
          const firstId = json.data[0]?.workspace?.id || json.data[0]?.id;
          if (firstId) {
            onSelectWorkspace(firstId);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch workspaces', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, [selectedWorkspaceId]);

  const activeItem = workspaces.find((w) => w.workspace.id === selectedWorkspaceId) || workspaces[0];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        id="btn-workspace-switcher"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded bg-indigo-100 text-indigo-700">
          <Building2 className="h-3.5 w-3.5" />
        </div>
        <div className="flex flex-col text-left">
          <span className="max-w-[120px] truncate sm:max-w-[160px] font-bold text-slate-900">
            {activeItem ? activeItem.workspace.name : 'Default Workspace'}
          </span>
          <span className="text-[10px] text-slate-500">
            {activeItem
              ? `${activeItem.workspace?.communityIds?.length || 0} Servers • ${(activeItem.memberRole || 'WORKSPACE_MEMBER').replace('WORKSPACE_', '')}`
              : '1 Server'}
          </span>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-1" />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-xl z-50">
          <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <span>SaaS Workspaces</span>
            {onOpenWorkspaceSettings && activeItem && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenWorkspaceSettings();
                }}
                className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 transition"
              >
                <Settings className="h-3 w-3" />
                <span>Settings</span>
              </button>
            )}
          </div>

          <div className="mt-1 space-y-1 max-h-60 overflow-y-auto">
            {workspaces.map((item) => {
              const isSelected = item.workspace.id === selectedWorkspaceId || (!selectedWorkspaceId && item === workspaces[0]);
              return (
                <button
                  key={item.workspace.id}
                  onClick={() => {
                    onSelectWorkspace(item.workspace.id);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition ${
                    isSelected ? 'bg-indigo-50 text-indigo-900 font-semibold border border-indigo-200' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Building2 className={`h-4 w-4 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <div className="truncate">
                      <div className="truncate font-semibold">{item.workspace.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {item.workspace?.communityIds?.length || 0} Communities • {(item.memberRole || 'WORKSPACE_MEMBER').replace('WORKSPACE_', '')}
                      </div>
                    </div>
                  </div>
                  {isSelected && <Check className="h-4 w-4 text-indigo-600" />}
                </button>
              );
            })}
          </div>

          {onOpenCreateWorkspaceModal && (
            <div className="pt-2 mt-1 border-t border-slate-100">
              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenCreateWorkspaceModal();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition"
              >
                <Plus className="h-4 w-4" />
                <span>+ Create New SaaS Workspace</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
