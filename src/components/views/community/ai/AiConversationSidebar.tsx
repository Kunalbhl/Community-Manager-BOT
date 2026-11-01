import React, { useState } from 'react';
import {
  Plus,
  MessageSquare,
  Edit2,
  Trash2,
  Check,
  X,
  RotateCcw,
  Sparkles,
  TrendingUp,
  ShieldAlert,
  Users,
  Calendar,
  Zap,
} from 'lucide-react';
import { AiConversation } from '../../../../../shared/types/ai.js';

interface AiConversationSidebarProps {
  conversations: AiConversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onRenameConversation: (id: string, newTitle: string) => Promise<void>;
  onDeleteConversation: (id: string) => Promise<void>;
  onClearContext: (id: string) => Promise<void>;
  onQuickAction: (promptText: string) => void;
  loading: boolean;
}

const QUICK_ACTIONS = [
  {
    icon: Sparkles,
    label: 'Community Health',
    prompt: 'Analyze overall community health and member retention across recent periods.',
  },
  {
    icon: TrendingUp,
    label: 'Engagement Changes',
    prompt: 'Explain what changed in message volume, active channels, and member participation.',
  },
  {
    icon: Users,
    label: 'Recruitment Performance',
    prompt: 'Review recruitment funnel conversion, recruiter activity, and applicant bottlenecks.',
  },
  {
    icon: ShieldAlert,
    label: 'Moderation Activity',
    prompt: 'Review moderation actions, automod trigger frequency, and safety incident trends.',
  },
  {
    icon: Calendar,
    label: 'Event Attendance',
    prompt: 'Analyze event registration rates, attendance turnouts, and reminder effectiveness.',
  },
  {
    icon: Zap,
    label: 'Automation Health',
    prompt: 'Review workflow execution success, failure rates, and trigger triggers.',
  },
];

export const AiConversationSidebar: React.FC<AiConversationSidebarProps> = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onRenameConversation,
  onDeleteConversation,
  onClearContext,
  onQuickAction,
  loading,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const startRename = (conv: AiConversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditTitle(conv.title);
  };

  const handleSaveRename = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingId || !editTitle.trim()) return;
    try {
      setIsProcessing(true);
      await onRenameConversation(editingId, editTitle.trim());
      setEditingId(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
    setEditTitle('');
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingId !== id) {
      setDeletingId(id);
      return;
    }
    try {
      setIsProcessing(true);
      await onDeleteConversation(id);
      setDeletingId(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Clear stored message context for this inquiry?')) return;
    try {
      setIsProcessing(true);
      await onClearContext(id);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full md:w-64 lg:w-72 bg-zinc-50 border-r border-zinc-200 flex flex-col h-full select-none">
      {/* Top Header & New Button */}
      <div className="p-3 border-b border-zinc-200 bg-white">
        <button
          id="btn-new-ai-conversation"
          onClick={onNewConversation}
          disabled={loading || isProcessing}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-zinc-900 text-white hover:bg-zinc-800 active:bg-zinc-950 rounded-md text-sm font-medium transition shadow-sm disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          New Inquiry
        </button>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="px-2 py-1 text-[11px] font-semibold tracking-wider text-zinc-600 uppercase">
          Inquiries & History
        </div>

        {conversations.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-500">
            No previous inquiries saved for this community.
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const isEditing = editingId === conv.id;
            const isConfirmingDelete = deletingId === conv.id;

            return (
              <div
                key={conv.id}
                id={`ai-conversation-item-${conv.id}`}
                onClick={() => !isEditing && onSelectConversation(conv.id)}
                className={`group relative flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-xs cursor-pointer transition ${
                  isActive
                    ? 'bg-zinc-200/80 text-zinc-900 font-medium'
                    : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-zinc-900' : 'text-zinc-400'}`} />
                  {isEditing ? (
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename(e as any);
                        if (e.key === 'Escape') handleCancelRename(e as any);
                      }}
                      className="w-full bg-white border border-zinc-300 rounded px-1.5 py-0.5 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                      autoFocus
                    />
                  ) : (
                    <div className="truncate flex-1">
                      <span className="truncate">{conv.title || 'Untitled Inquiry'}</span>
                    </div>
                  )}
                </div>

                {/* Right controls */}
                <div className="flex items-center gap-1 shrink-0">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleSaveRename}
                        title="Save title"
                        className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={handleCancelRename}
                        title="Cancel"
                        className="p-1 text-zinc-400 hover:text-zinc-600 rounded"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : isConfirmingDelete ? (
                    <div className="flex items-center gap-1 bg-red-50 px-1 py-0.5 rounded border border-red-200">
                      <button
                        onClick={(e) => handleDelete(conv.id, e)}
                        className="text-[10px] text-red-700 font-medium hover:underline"
                      >
                        Delete?
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingId(null);
                        }}
                        className="p-0.5 text-zinc-400 hover:text-zinc-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="hidden group-hover:flex items-center gap-0.5">
                      <button
                        onClick={(e) => startRename(conv, e)}
                        title="Rename inquiry"
                        className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 rounded"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      {isActive && (
                        <button
                          onClick={(e) => handleClear(conv.id, e)}
                          title="Clear context messages"
                          className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 rounded"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleDelete(conv.id, e)}
                        title="Delete inquiry"
                        className="p-1 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {!isEditing && !isConfirmingDelete && (conv.metadata?.totalMessages ?? conv.messages?.length ?? 0) > 0 && (
                    <span className="group-hover:hidden text-[10px] text-zinc-600 bg-zinc-200 px-1.5 py-0.2 rounded font-mono">
                      {conv.metadata?.totalMessages ?? conv.messages?.length ?? 0}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Quick Launch Analysis Section */}
      <div className="p-3 border-t border-zinc-200 bg-white space-y-1.5">
        <div className="text-[11px] font-semibold tracking-wider text-zinc-600 uppercase">
          Quick Inquiries
        </div>
        <div className="grid grid-cols-1 gap-1">
          {QUICK_ACTIONS.map((qa, idx) => {
            const Icon = qa.icon;
            return (
              <button
                key={idx}
                id={`ai-quick-action-${idx}`}
                onClick={() => onQuickAction(qa.prompt)}
                disabled={loading || isProcessing}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 rounded transition disabled:opacity-50"
              >
                <Icon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="truncate">{qa.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
