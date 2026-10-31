import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Sparkles,
  AlertCircle,
  Clock,
  Shield,
  Layers,
  RefreshCw,
  Menu,
  X,
  Lock,
  Zap,
} from 'lucide-react';
import {
  AiCommunityContext,
  AiQuotaSnapshot,
  AiConversation,
  AiActionPreview,
  AiRecommendation,
  AiContextualActionRequest,
} from '../../../../shared/types/ai.js';
import { DateRangeType } from '../../../../shared/types/insights.js';
import { AiContextBanner } from './ai/AiContextBanner.js';
import { AiConversationSidebar } from './ai/AiConversationSidebar.js';
import { AiMessageItem, ChatMessageData } from './ai/AiMessageItem.js';
import { AiActionLifecycleModal } from './ai/AiActionLifecycleModal.js';
import { AiQuickActionsBar } from './ai/AiQuickActionsBar.js';
import { AiExportButton } from './ai/AiExportButton.js';


interface AiAssistantViewProps {
  communityId: string;
  initialPrompt?: string;
  initialContextAction?: AiContextualActionRequest;
  onNavigateToInsights?: (tab?: string, deepLink?: string) => void;
  onNavigateToModule?: (moduleKey: string) => void;
}

export const AiAssistantView: React.FC<AiAssistantViewProps> = ({
  communityId,
  initialPrompt,
  initialContextAction,
  onNavigateToInsights,
  onNavigateToModule,
}) => {
  // Real State
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [context, setContext] = useState<AiCommunityContext | null>(null);
  const [quota, setQuota] = useState<AiQuotaSnapshot | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<DateRangeType>(
    initialContextAction?.dateRange || 'LAST_30_DAYS'
  );

  // Input & Status
  const [prompt, setPrompt] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Action Lifecycle
  const [activeActionPreview, setActiveActionPreview] = useState<AiActionPreview | null>(null);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [loadingActionType, setLoadingActionType] = useState<string | null>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const initializedActionRef = useRef<boolean>(false);

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load Context & Quota
  const loadCommunityContextAndQuota = async () => {
    try {
      setLoadingContext(true);
      const [contextRes, quotaRes] = await Promise.all([
        fetch(`/api/v1/communities/${communityId}/ai/context?rangeType=${selectedPeriod}`),
        fetch(`/api/v1/communities/${communityId}/ai/usage`),
      ]);

      if (contextRes.ok) {
        const json = await contextRes.json();
        setContext(json.context || null);
      }
      if (quotaRes.ok) {
        const json = await quotaRes.json();
        setQuota(json.snapshot || null);
      }
    } catch (err: any) {
      console.error('Failed to load community context:', err);
    } finally {
      setLoadingContext(false);
    }
  };

  // Load Conversations List
  const loadConversations = async () => {
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/ai/conversations`);
      if (res.ok) {
        const json = await res.json();
        const convList: AiConversation[] = json.conversations || [];
        setConversations(convList);

        // If no active conversation, select the most recent or leave ready for fresh prompt
        if (!activeConversationId && convList.length > 0 && !initialPrompt && !initialContextAction) {
          selectConversation(convList[0].id);
        }
      }
    } catch (err: any) {
      console.error('Failed to load conversations:', err);
    }
  };

  // Select a Conversation & Load its messages
  const selectConversation = async (convId: string) => {
    try {
      setActiveConversationId(convId);
      setError(null);
      const res = await fetch(`/api/v1/communities/${communityId}/ai/conversations/${convId}`);
      if (res.ok) {
        const json = await res.json();
        const conv = json.conversation;
        if (conv && conv.messages) {
          const formatted: ChatMessageData[] = conv.messages.map((m: any) => ({
            id: m.id || `msg_${Date.now()}`,
            sender: m.role === 'USER' ? 'USER' : 'ASSISTANT',
            text: m.content || '',
            facts: m.facts,
            insights: m.insights,
            recommendations: m.recommendations,
            actionsPlanned: m.actionsPlanned,
            limitations: m.limitations,
            confidence: m.confidence,
            period: m.period || selectedPeriod,
            timestamp: m.timestamp
              ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          }));
          setMessages(formatted);
        }
      }
    } catch (err: any) {
      setError('Failed to load conversation messages.');
    }
  };

  // Initial Load
  useEffect(() => {
    loadCommunityContextAndQuota();
    loadConversations();
  }, [communityId, selectedPeriod]);

  // Execute Context Action
  const executeContextAction = async (actionReq: AiContextualActionRequest) => {
    setError(null);
    setLoading(true);

    const userMessage: ChatMessageData = {
      id: `user_${Date.now()}`,
      sender: 'USER',
      text: `[${(actionReq.action || 'ACTION').replace(/_/g, ' ')}] ${actionReq.metricLabel || actionReq.metricKey || 'Community Scope'}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      const res = await fetch(`/api/v1/communities/${communityId}/ai/contextual-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...actionReq,
          conversationId: activeConversationId || undefined,
          dateRange: selectedPeriod,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        const errorMsg = json.error?.message || json.message || 'Failed to execute contextual analysis';
        setError(errorMsg);
        return;
      }

      const assistantMessage: ChatMessageData = {
        id: `assistant_${Date.now()}`,
        sender: 'ASSISTANT',
        text: json.answer || 'Authoritative analysis synthesized.',
        facts: json.facts || [],
        insights: json.insights || [],
        recommendations: json.recommendations || [],
        actionsPlanned: json.actionsPlanned || [],
        limitations: json.limitations || [],
        confidence: json.confidence,
        period: selectedPeriod,
        canonicalDeepLink: json.canonicalDeepLink || json.deepLink,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      loadCommunityContextAndQuota();
    } catch (err: any) {
      setError(err.message || 'Network error executing contextual analysis');
    } finally {
      setLoading(false);
    }
  };

  // Handle Initial Props
  useEffect(() => {
    if (!initializedActionRef.current) {
      if (initialContextAction) {
        initializedActionRef.current = true;
        executeContextAction(initialContextAction);
      } else if (initialPrompt) {
        initializedActionRef.current = true;
        handleSend(initialPrompt);
      }
    }
  }, [initialPrompt, initialContextAction]);

  // Create New Conversation
  const handleNewConversation = async () => {
    try {
      setError(null);
      setActiveConversationId(null);
      setMessages([]);
      setSidebarOpen(false);
    } catch (err: any) {
      setError(err.message || 'Error creating conversation');
    }
  };

  // Rename Conversation
  const handleRenameConversation = async (convId: string, newTitle: string) => {
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/ai/conversations/${convId}/title`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.ok) {
        await loadConversations();
      }
    } catch (err: any) {
      setError('Failed to rename conversation');
    }
  };

  // Delete Conversation
  const handleDeleteConversation = async (convId: string) => {
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/ai/conversations/${convId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        if (activeConversationId === convId) {
          setActiveConversationId(null);
          setMessages([]);
        }
        await loadConversations();
      }
    } catch (err: any) {
      setError('Failed to delete conversation');
    }
  };

  // Clear Context
  const handleClearContext = async (convId: string) => {
    try {
      const res = await fetch(
        `/api/v1/communities/${communityId}/ai/conversations/${convId}/clear-context`,
        { method: 'POST' }
      );
      if (res.ok) {
        setMessages([]);
        await loadConversations();
      }
    } catch (err: any) {
      setError('Failed to clear context');
    }
  };

  // Send Prompt / Ask
  const handleSend = async (customPrompt?: string) => {
    const textToSend = (customPrompt || prompt).trim();
    if (!textToSend || loading) return;

    setLastPrompt(textToSend);
    setError(null);
    setLoading(true);

    const userMessage: ChatMessageData = {
      id: `user_${Date.now()}`,
      sender: 'USER',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!customPrompt) setPrompt('');

    try {
      const payload: any = {
        prompt: textToSend,
        dateRange: selectedPeriod,
        conversationId: activeConversationId || undefined,
        includePlannedActions: true,
      };

      const res = await fetch(`/api/v1/communities/${communityId}/ai/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok) {
        const errorMsg = json.userMessage || json.message || json.error?.message || 'Failed to process inquiry';
        setError(errorMsg);
        return;
      }

      // Update active conversation ID if newly created
      if (json.conversationId && json.conversationId !== activeConversationId) {
        setActiveConversationId(json.conversationId);
        loadConversations();
      }

      const assistantMessage: ChatMessageData = {
        id: `assistant_${Date.now()}`,
        sender: 'ASSISTANT',
        text: json.answer || 'Analysis complete.',
        facts: json.facts || [],
        insights: json.insights || [],
        recommendations: json.recommendations || [],
        actionsPlanned: json.actionsPlanned || [],
        limitations: json.limitations || [],
        confidence: json.confidence,
        period: selectedPeriod,
        canonicalDeepLink: json.canonicalDeepLink || json.deepLink,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Refresh quota status
      loadCommunityContextAndQuota();
    } catch (err: any) {
      setError(err.message || 'Network error communicating with Community Manager AI');
    } finally {
      setLoading(false);
    }
  };

  // Action Preview Lifecycle Handler
  const handlePreviewAction = async (
    actionType: string,
    targetModule: string,
    parameters: Record<string, any>,
    targetResource?: string
  ) => {
    try {
      setLoadingActionType(actionType);
      setError(null);

      const res = await fetch(`/api/v1/communities/${communityId}/ai/actions/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType,
          targetModule,
          parameters,
          targetResource,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setActiveActionPreview(json.preview);
        setIsActionModalOpen(true);
      } else {
        setError(json.error?.message || json.message || 'Failed to generate action preview');
      }
    } catch (err: any) {
      setError(err.message || 'Error generating action preview');
    } finally {
      setLoadingActionType(null);
    }
  };

  const isQuotaReached = quota?.state === 'LIMIT_REACHED';
  const isRateLimited = quota?.state === 'RATE_LIMITED';

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-white overflow-hidden">
      {/* Top Real Context & Quota Banner */}
      <AiContextBanner
        communityId={communityId}
        context={context}
        quota={quota}
        selectedPeriod={selectedPeriod}
        onPeriodChange={setSelectedPeriod}
        loadingContext={loadingContext}
        onRefreshContext={loadCommunityContextAndQuota}
      />

      {/* Main Workspace Body */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile Sidebar Toggle */}
        <div className="md:hidden absolute top-2 left-2 z-20">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 bg-white border border-zinc-200 rounded-md shadow-sm text-zinc-700"
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {/* Left Sidebar (Inquiries & History) */}
        <div
          className={`${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } md:translate-x-0 transition-transform duration-200 absolute md:relative z-10 h-full shadow-lg md:shadow-none`}
        >
          <AiConversationSidebar
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={(id) => {
              selectConversation(id);
              setSidebarOpen(false);
            }}
            onNewConversation={handleNewConversation}
            onRenameConversation={handleRenameConversation}
            onDeleteConversation={handleDeleteConversation}
            onClearContext={handleClearContext}
            onQuickAction={(p) => {
              handleSend(p);
              setSidebarOpen(false);
            }}
            loading={loading}
          />
        </div>

        {/* Right Chat & Workspace Area */}
        <div className="flex-1 flex flex-col h-full bg-zinc-50/50 overflow-hidden">
          {/* Workspace Action & Export Header */}
          <div className="px-4 py-2 bg-white border-b border-zinc-200 flex items-center justify-between text-xs text-zinc-600">
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-zinc-800 truncate">
                {activeConversationId
                  ? conversations.find((c) => c.id === activeConversationId)?.title || 'Current Inquiry'
                  : 'New Community Intelligence Inquiry'}
              </span>
              {messages.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 text-[10px] font-medium shrink-0">
                  {messages.length} {messages.length === 1 ? 'turn' : 'turns'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <AiExportButton
                communityId={communityId}
                sourceType={activeConversationId ? 'CONVERSATION' : 'QUERY_RESPONSE'}
                conversationId={activeConversationId || undefined}
                dateRange={selectedPeriod}
                title={conversations.find((c) => c.id === activeConversationId)?.title || 'Community Brain'}
                label="Export Analysis"
              />
            </div>
          </div>

          {/* Messages Container */}
          <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6 space-y-4">
            {error && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start justify-between gap-3 shadow-xs">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                  <div>
                    <div className="font-semibold text-red-800">Operational Failure</div>
                    <div>{error}</div>
                  </div>
                </div>
                {lastPrompt && (
                  <button
                    onClick={() => handleSend(lastPrompt)}
                    disabled={loading}
                    className="px-2.5 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-800 font-medium text-xs flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>Retry Request</span>
                  </button>
                )}
              </div>
            )}

            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 text-zinc-500 my-auto">
                <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-900 border border-zinc-200 shadow-xs">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="max-w-md space-y-1">
                  <h3 className="text-sm font-bold text-zinc-900">Community Brain</h3>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    Grounded directly in verified Community Manager telemetry. Ask questions about member
                    health, recruitment conversion, moderation incidents, or event attendance.
                  </p>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <AiMessageItem
                  key={msg.id}
                  message={msg}
                  onPreviewAction={handlePreviewAction}
                  onNavigateToInsights={onNavigateToInsights}
                  onAskContextualFollowUp={(followUpPrompt) => handleSend(followUpPrompt)}
                  loadingActionType={loadingActionType}
                />
              ))
            )}

            {/* In-Flight Processing Indicator */}
            {loading && (
              <div className="flex items-center gap-3 my-4">
                <div className="w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 animate-spin" />
                </div>
                <div className="bg-white border border-zinc-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-xs">
                  <div className="flex items-center gap-2 text-xs text-zinc-600 font-medium">
                    <span className="w-2 h-2 rounded-full bg-zinc-400 animate-pulse" />
                    Synthesizing verified community metrics & generating recommendations...
                  </div>
                </div>
              </div>
            )}

            <div ref={chatBottomRef} />
          </div>

          {/* Bottom Prompt Bar & Controls */}
          <div className="p-3 bg-white border-t border-zinc-200 space-y-2">
            {/* Quick Action Chips */}
            <AiQuickActionsBar onSelectPrompt={(p) => handleSend(p)} disabled={loading} />

            {/* Input Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <input
                id="ai-prompt-input"
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  isQuotaReached
                    ? 'Daily quota limit reached. Resets at midnight UTC.'
                    : isRateLimited
                    ? 'Rate limited. Please wait a moment...'
                    : 'Ask about community health, growth funnels, moderation trends, or actions...'
                }
                disabled={loading || isQuotaReached}
                className="flex-1 bg-zinc-50 border border-zinc-300 rounded-lg px-3.5 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-800 disabled:bg-zinc-100 disabled:text-zinc-400"
              />

              <button
                id="btn-submit-ai-prompt"
                type="submit"
                disabled={!prompt.trim() || loading || isQuotaReached}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-sm font-semibold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Action Lifecycle Review Modal (Preview → Confirm → Revalidate → Execute) */}
      <AiActionLifecycleModal
        communityId={communityId}
        preview={activeActionPreview}
        isOpen={isActionModalOpen}
        onClose={() => {
          setIsActionModalOpen(false);
          setActiveActionPreview(null);
        }}
        onExecuteSuccess={() => {
          loadCommunityContextAndQuota();
        }}
      />
    </div>
  );
};
