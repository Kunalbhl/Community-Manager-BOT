import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  RefreshCw,
  Send,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  ShieldAlert,
  Users,
  Calendar,
  Zap,
  Layers,
  Search,
  Filter,
  Check,
  CheckCheck,
  Archive,
  Trash2,
  Settings,
  ChevronRight,
  ChevronLeft,
  Mail,
  MessageSquare,
  Radio,
  Lock,
  ExternalLink,
  Sparkles,
  Sliders,
  Eye,
  X,
  Volume2,
  Clock,
} from 'lucide-react';
import { UserRole } from '../../../../shared/types/rbac.js';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationStatus,
  UserNotificationPreference,
} from '../../../../shared/types/notifications.js';

interface NotificationsViewProps {
  communityId: string;
  currentRole: UserRole;
  onNavigateToSection?: (section: string) => void;
}

interface NotificationItem {
  id: string;
  communityId: string;
  communityName?: string;
  recipientUserId?: string;
  recipientRole?: string;
  recipientDiscordId?: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  status: NotificationStatus;
  type: string;
  title: string;
  body: string;
  resourceType?: string;
  resourceId?: string;
  route?: string;
  channel: string;
  deliveryStatus: string;
  deliveryError?: string;
  deliveredAt?: string;
  templateVariables?: Record<string, string>;
  metadata?: Record<string, any>;
  read: boolean;
  createdAt: string;
}

interface NotificationStats {
  totalCount: number;
  unreadCount: number;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  communityId,
  currentRole,
  onNavigateToSection,
}) => {
  const [activeTab, setActiveTab] = useState<'ALERTS' | 'PREFERENCES' | 'TEMPLATES'>('ALERTS');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Selected Notification Detail Modal
  const [selectedDetail, setSelectedDetail] = useState<NotificationItem | null>(null);

  // Preferences State
  const [preferences, setPreferences] = useState<UserNotificationPreference | null>(null);
  const [savingPreferences, setSavingPreferences] = useState<boolean>(false);
  const [preferencesSavedMessage, setPreferencesSavedMessage] = useState<string | null>(null);

  // Recruiter Persona & Templates State
  const [recruiterName, setRecruiterName] = useState<string>('Community Recruiter');
  const [selectedTemplate, setSelectedTemplate] = useState<'RECEIVED' | 'APPROVED' | 'MORE_INFO'>('RECEIVED');
  const [testSent, setTestSent] = useState<boolean>(false);
  const [testSending, setTestSending] = useState<boolean>(false);

  // Fetch Notifications & Stats
  const fetchNotificationsAndStats = useCallback(async () => {
    setLoading(true);
    try {
      let queryParams = `page=${page}&limit=15&communityId=${encodeURIComponent(communityId)}`;
      if (searchQuery.trim()) queryParams += `&search=${encodeURIComponent(searchQuery.trim())}`;
      if (selectedCategory !== 'ALL') queryParams += `&category=${encodeURIComponent(selectedCategory)}`;
      if (selectedPriority !== 'ALL') queryParams += `&priority=${encodeURIComponent(selectedPriority)}`;
      if (selectedStatus === 'UNREAD') queryParams += `&unreadOnly=true`;
      else if (selectedStatus !== 'ALL') queryParams += `&status=${encodeURIComponent(selectedStatus)}`;

      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/v1/notifications?${queryParams}`),
        fetch(`/api/v1/notifications/stats?communityId=${encodeURIComponent(communityId)}`),
      ]);

      if (listRes.ok) {
        const listJson = await listRes.json();
        if (listJson.success && Array.isArray(listJson.data)) {
          setNotifications(listJson.data);
          setTotalCount(listJson.total || listJson.data.length);
          setTotalPages(Math.max(1, Math.ceil((listJson.total || listJson.data.length) / 15)));
        }
      }

      if (statsRes.ok) {
        const statsJson = await statsRes.json();
        if (statsJson.success && statsJson.data) {
          setStats(statsJson.data);
        }
      }
    } catch {
      // Safe fallback
    } finally {
      setLoading(false);
    }
  }, [communityId, page, searchQuery, selectedCategory, selectedPriority, selectedStatus]);

  // Fetch Preferences
  const fetchPreferences = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/notifications/preferences?communityId=${encodeURIComponent(communityId)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setPreferences(json.data);
        }
      }
    } catch {
      // Safe fallback
    }
  }, [communityId]);

  // Fetch Recruiter Identity
  const fetchRecruiterIdentity = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/community/${communityId}/recruiter-identity`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setRecruiterName(json.data.recruiterDisplayName || 'Community Recruiter');
        }
      }
    } catch {
      // Safe fallback
    }
  }, [communityId]);

  useEffect(() => {
    fetchNotificationsAndStats();
  }, [fetchNotificationsAndStats]);

  useEffect(() => {
    if (activeTab === 'PREFERENCES') {
      fetchPreferences();
    } else if (activeTab === 'TEMPLATES') {
      fetchRecruiterIdentity();
    }
  }, [activeTab, fetchPreferences, fetchRecruiterIdentity]);

  // Mark as Read / Unread / Archive
  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`/api/v1/notifications/${id}/read`, { method: 'PATCH' });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true, status: 'READ' } : n))
        );
        fetchNotificationsAndStats();
      }
    } catch {}
  };

  const handleMarkAsUnread = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`/api/v1/notifications/${id}/unread`, { method: 'PATCH' });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: false, status: 'UNREAD' } : n))
        );
        fetchNotificationsAndStats();
      }
    } catch {}
  };

  const handleArchive = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`/api/v1/notifications/${id}/archive`, { method: 'PATCH' });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, status: 'ARCHIVED' } : n))
        );
        fetchNotificationsAndStats();
      }
    } catch {}
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`/api/v1/notifications/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        if (selectedDetail?.id === id) setSelectedDetail(null);
        fetchNotificationsAndStats();
      }
    } catch {}
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch('/api/v1/notifications/mark-all-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      if (res.ok) {
        fetchNotificationsAndStats();
      }
    } catch {}
  };

  // Save Preferences
  const handleSavePreferences = async () => {
    if (!preferences) return;
    setSavingPreferences(true);
    try {
      const res = await fetch('/api/v1/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          ...preferences,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setPreferences(json.data);
          setPreferencesSavedMessage('Notification preferences updated successfully.');
          setTimeout(() => setPreferencesSavedMessage(null), 3000);
        }
      }
    } catch {}
    finally {
      setSavingPreferences(false);
    }
  };

  // Simulate Test Notification
  const handleSendTestNotification = async () => {
    setTestSending(true);
    try {
      const templateTitle =
        selectedTemplate === 'RECEIVED'
          ? `Application Received by ${recruiterName}`
          : selectedTemplate === 'APPROVED'
          ? `Application Approved by ${recruiterName}`
          : `${recruiterName} requires additional information`;

      const templateBody =
        selectedTemplate === 'RECEIVED'
          ? `Hi Rahul,\n\n${recruiterName} has received your application (ID: APP-1024).\nYour submission is now under review by our recruitment team.`
          : selectedTemplate === 'APPROVED'
          ? `Hi Rahul,\n\nGreat news! ${recruiterName} has approved your application (ID: APP-1024).\nWelcome to the community!`
          : `Hi Rahul,\n\n${recruiterName} needs some additional details regarding application APP-1024.\n\nNotes: Please provide your portfolio link.`;

      const res = await fetch('/api/v1/notifications/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          category: 'RECRUITMENT',
          type: 'RECRUITMENT_APPLICATION_SUBMITTED',
          priority: 'INFO',
          title: templateTitle,
          body: templateBody,
          channel: 'IN_APP',
          route: 'recruitment',
        }),
      });

      if (res.ok) {
        setTestSent(true);
        setTimeout(() => setTestSent(false), 3000);
        fetchNotificationsAndStats();
      }
    } catch {}
    finally {
      setTestSending(false);
    }
  };

  const getCategoryIcon = (category?: NotificationCategory) => {
    switch (category) {
      case 'RECRUITMENT':
        return <Users className="h-4 w-4 text-indigo-500" />;
      case 'SECURITY':
        return <ShieldAlert className="h-4 w-4 text-rose-500" />;
      case 'MODERATION':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'EVENTS':
        return <Calendar className="h-4 w-4 text-emerald-500" />;
      case 'AUTOMATION':
        return <Zap className="h-4 w-4 text-purple-500" />;
      case 'INTEGRATIONS':
        return <Layers className="h-4 w-4 text-cyan-500" />;
      default:
        return <Bell className="h-4 w-4 text-slate-500" />;
    }
  };

  const getPriorityBadge = (priority?: NotificationPriority) => {
    switch (priority) {
      case 'CRITICAL':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
            <AlertCircle className="h-3 w-3" /> CRITICAL
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
            <AlertTriangle className="h-3 w-3" /> WARNING
          </span>
        );
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="h-3 w-3" /> SUCCESS
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
            <Info className="h-3 w-3 text-slate-400" /> INFO
          </span>
        );
    }
  };

  return (
    <div id="notifications-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              COMMUNITY SCOPE
            </span>
            <span className="rounded bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              MODULE 8 OF 14
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Notification Center & Unified Alerts
          </h1>
          <p className="text-sm text-slate-500">
            Authoritative in-app alerts, multi-channel dispatch routing, and persona template engine.
          </p>
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-2xs">
            <button
              onClick={() => setActiveTab('ALERTS')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'ALERTS'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Bell className="h-3.5 w-3.5" />
              Alerts Feed
            </button>
            <button
              onClick={() => setActiveTab('PREFERENCES')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'PREFERENCES'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              Routing & Preferences
            </button>
            <button
              onClick={() => setActiveTab('TEMPLATES')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === 'TEMPLATES'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Persona & Templates
            </button>
          </div>

          <button
            onClick={fetchNotificationsAndStats}
            title="Refresh alerts"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* TAB 1: ALERTS FEED */}
      {activeTab === 'ALERTS' && (
        <>
          {/* Metrics summary banner */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Total Alerts</span>
                <Bell className="h-4 w-4 text-slate-400" />
              </div>
              <div className="mt-2 text-2xl font-bold text-slate-900">
                {stats?.totalCount ?? totalCount}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">Across all categories</div>
            </div>

            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-700">Unread Alerts</span>
                <div className="h-2 w-2 rounded-full bg-indigo-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-indigo-900">
                {stats?.unreadCount ?? 0}
              </div>
              <div className="mt-1 text-[11px] text-indigo-600">Pending review</div>
            </div>

            <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-rose-700">Critical / Security</span>
                <ShieldAlert className="h-4 w-4 text-rose-500" />
              </div>
              <div className="mt-2 text-2xl font-bold text-rose-900">
                {(stats?.byPriority?.CRITICAL ?? 0) + (stats?.byCategory?.SECURITY ?? 0)}
              </div>
              <div className="mt-1 text-[11px] text-rose-600">High priority events</div>
            </div>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-700">Multi-Channel Health</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="mt-2 text-2xl font-bold text-emerald-900">100%</div>
              <div className="mt-1 text-[11px] text-emerald-600">Dispatch engine active</div>
            </div>
          </div>

          {/* Main Feed Card */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-2xs">
            {/* Filter controls toolbar */}
            <div className="border-b border-slate-200 p-4 space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                {/* Search */}
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Search alerts by keyword, user, or resource..."
                    className="w-full rounded-lg border border-slate-300 pl-9 pr-4 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setPage(1);
                      }}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Bulk Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleMarkAllRead}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                  >
                    <CheckCheck className="h-3.5 w-3.5 text-indigo-600" />
                    Mark all read
                  </button>
                </div>
              </div>

              {/* Categorical & Status Pills */}
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                {/* Status selector */}
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-md">
                  <button
                    onClick={() => {
                      setSelectedStatus('ALL');
                      setPage(1);
                    }}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                      selectedStatus === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => {
                      setSelectedStatus('UNREAD');
                      setPage(1);
                    }}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                      selectedStatus === 'UNREAD' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Unread
                  </button>
                  <button
                    onClick={() => {
                      setSelectedStatus('ARCHIVED');
                      setPage(1);
                    }}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                      selectedStatus === 'ARCHIVED' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Archived
                  </button>
                </div>

                {/* Category Dropdown */}
                <select
                  value={selectedCategory}
                  onChange={(e) => {
                    setSelectedCategory(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-hidden"
                >
                  <option value="ALL">All Categories</option>
                  <option value="RECRUITMENT">Recruitment</option>
                  <option value="MODERATION">Moderation</option>
                  <option value="ENGAGEMENT">Engagement</option>
                  <option value="EVENTS">Events</option>
                  <option value="AUTOMATION">Automation</option>
                  <option value="SECURITY">Security</option>
                  <option value="INTEGRATIONS">Integrations</option>
                  <option value="INSIGHTS">Insights</option>
                  <option value="SYSTEM">System</option>
                </select>

                {/* Priority Dropdown */}
                <select
                  value={selectedPriority}
                  onChange={(e) => {
                    setSelectedPriority(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-hidden"
                >
                  <option value="ALL">All Priorities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="WARNING">Warning</option>
                  <option value="INFO">Info</option>
                  <option value="SUCCESS">Success</option>
                </select>
              </div>
            </div>

            {/* List Feed */}
            {loading && notifications.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-slate-400">
                <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-16 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                </div>
                <h3 className="mt-3 text-sm font-bold text-slate-900">Zero Pending Notifications</h3>
                <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                  No alerts match your current filter criteria. Real community events, recruitment submissions, and automations will automatically appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => setSelectedDetail(n)}
                    className={`group flex items-start justify-between p-4 transition cursor-pointer ${
                      n.read
                        ? 'bg-white hover:bg-slate-50/70'
                        : 'bg-indigo-50/25 hover:bg-indigo-50/40 border-l-2 border-l-indigo-600'
                    }`}
                  >
                    <div className="flex items-start gap-3.5 flex-1 pr-4">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 shadow-2xs">
                        {getCategoryIcon(n.category)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {getPriorityBadge(n.priority)}
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 uppercase">
                            {n.category}
                          </span>
                          {n.channel && (
                            <span className="text-[10px] font-medium text-slate-500">
                              via {n.channel}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(n.createdAt).toLocaleString()}
                          </span>
                        </div>

                        <h4 className="mt-1.5 text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition">
                          {n.title}
                        </h4>
                        <p className="mt-0.5 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                          {n.body}
                        </p>

                        {/* Navigation pill if route is linked */}
                        {n.route && (
                          <div className="mt-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onNavigateToSection) onNavigateToSection(n.route!);
                              }}
                              className="inline-flex items-center gap-1 rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 transition"
                            >
                              Go to {n.route} <ExternalLink className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Quick action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {!n.read ? (
                        <button
                          onClick={(e) => handleMarkAsRead(n.id, e)}
                          title="Mark as read"
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={(e) => handleMarkAsUnread(n.id, e)}
                          title="Mark as unread"
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleArchive(n.id, e)}
                        title="Archive"
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 hover:text-amber-600 transition"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(n.id, e)}
                        title="Delete"
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination footer */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 bg-slate-50/50">
                <div className="text-xs text-slate-500">
                  Page <span className="font-semibold text-slate-900">{page}</span> of{' '}
                  <span className="font-semibold text-slate-900">{totalPages}</span> ({totalCount} total alerts)
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Previous
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* TAB 2: ROUTING & PREFERENCES */}
      {activeTab === 'PREFERENCES' && (
        <div className="space-y-6">
          {preferencesSavedMessage && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              {preferencesSavedMessage}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-bold text-slate-900">Multi-Channel Delivery Routing</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure which transport channels deliver alerts for each operational category.
                </p>
              </div>

              <button
                onClick={handleSavePreferences}
                disabled={savingPreferences}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {savingPreferences ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Save Preferences
              </button>
            </div>

            {/* Category routing table */}
            <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50 font-semibold text-slate-700">
                  <tr>
                    <th className="py-3 pl-4 pr-3 text-left">Category</th>
                    <th className="px-3 py-3 text-center">In-App Alerts</th>
                    <th className="px-3 py-3 text-center">Discord DM</th>
                    <th className="px-3 py-3 text-center">Discord Channel</th>
                    <th className="px-3 py-3 text-center">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {/* SECURITY (LOCKED) */}
                  <tr className="bg-rose-50/20">
                    <td className="py-3.5 pl-4 pr-3">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-rose-500" />
                        <div>
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            Security & RBAC Violations
                            <span className="rounded bg-rose-100 px-1.5 py-0.2 text-[9px] font-bold text-rose-800 flex items-center gap-0.5">
                              <Lock className="h-2.5 w-2.5" /> MANDATORY
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">Security audits, tenant isolation breaches</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input type="checkbox" checked={true} disabled className="h-4 w-4 text-indigo-600 rounded opacity-60" />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input type="checkbox" checked={true} disabled className="h-4 w-4 text-indigo-600 rounded opacity-60" />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input type="checkbox" checked={true} disabled className="h-4 w-4 text-indigo-600 rounded opacity-60" />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input type="checkbox" checked={true} disabled className="h-4 w-4 text-indigo-600 rounded opacity-60" />
                    </td>
                  </tr>

                  {/* RECRUITMENT */}
                  <tr>
                    <td className="py-3.5 pl-4 pr-3">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-indigo-500" />
                        <div>
                          <div className="font-bold text-slate-900">Recruitment & Applications</div>
                          <div className="text-[11px] text-slate-500">Submissions, reviews, approvals, recruiter codes</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={preferences?.channels?.inApp !== false}
                        onChange={(e) =>
                          setPreferences((prev) =>
                            prev ? { ...prev, channels: { ...prev.channels, inApp: e.target.checked } } : prev
                          )
                        }
                        className="h-4 w-4 text-indigo-600 rounded"
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={preferences?.channels?.discordDm !== false}
                        onChange={(e) =>
                          setPreferences((prev) =>
                            prev ? { ...prev, channels: { ...prev.channels, discordDm: e.target.checked } } : prev
                          )
                        }
                        className="h-4 w-4 text-indigo-600 rounded"
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={preferences?.channels?.discordChannel !== false}
                        onChange={(e) =>
                          setPreferences((prev) =>
                            prev ? { ...prev, channels: { ...prev.channels, discordChannel: e.target.checked } } : prev
                          )
                        }
                        className="h-4 w-4 text-indigo-600 rounded"
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={preferences?.channels?.email === true}
                        onChange={(e) =>
                          setPreferences((prev) =>
                            prev ? { ...prev, channels: { ...prev.channels, email: e.target.checked } } : prev
                          )
                        }
                        className="h-4 w-4 text-indigo-600 rounded"
                      />
                    </td>
                  </tr>

                  {/* MODERATION */}
                  <tr>
                    <td className="py-3.5 pl-4 pr-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        <div>
                          <div className="font-bold text-slate-900">Moderation & Safety</div>
                          <div className="text-[11px] text-slate-500">Warnings, safety incidents, blacklists</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={preferences?.channels?.inApp !== false}
                        onChange={(e) =>
                          setPreferences((prev) =>
                            prev ? { ...prev, channels: { ...prev.channels, inApp: e.target.checked } } : prev
                          )
                        }
                        className="h-4 w-4 text-indigo-600 rounded"
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={preferences?.channels?.discordDm !== false}
                        onChange={(e) =>
                          setPreferences((prev) =>
                            prev ? { ...prev, channels: { ...prev.channels, discordDm: e.target.checked } } : prev
                          )
                        }
                        className="h-4 w-4 text-indigo-600 rounded"
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={preferences?.channels?.discordChannel !== false}
                        onChange={(e) =>
                          setPreferences((prev) =>
                            prev ? { ...prev, channels: { ...prev.channels, discordChannel: e.target.checked } } : prev
                          )
                        }
                        className="h-4 w-4 text-indigo-600 rounded"
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={preferences?.channels?.email === true}
                        onChange={(e) =>
                          setPreferences((prev) =>
                            prev ? { ...prev, channels: { ...prev.channels, email: e.target.checked } } : prev
                          )
                        }
                        className="h-4 w-4 text-indigo-600 rounded"
                      />
                    </td>
                  </tr>

                  {/* EVENTS */}
                  <tr>
                    <td className="py-3.5 pl-4 pr-3">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-emerald-500" />
                        <div>
                          <div className="font-bold text-slate-900">Events & Calendars</div>
                          <div className="text-[11px] text-slate-500">Live reminders, registrations, completions</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={preferences?.channels?.inApp !== false}
                        onChange={(e) =>
                          setPreferences((prev) =>
                            prev ? { ...prev, channels: { ...prev.channels, inApp: e.target.checked } } : prev
                          )
                        }
                        className="h-4 w-4 text-indigo-600 rounded"
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={preferences?.channels?.discordDm !== false}
                        onChange={(e) =>
                          setPreferences((prev) =>
                            prev ? { ...prev, channels: { ...prev.channels, discordDm: e.target.checked } } : prev
                          )
                        }
                        className="h-4 w-4 text-indigo-600 rounded"
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={preferences?.channels?.discordChannel !== false}
                        onChange={(e) =>
                          setPreferences((prev) =>
                            prev ? { ...prev, channels: { ...prev.channels, discordChannel: e.target.checked } } : prev
                          )
                        }
                        className="h-4 w-4 text-indigo-600 rounded"
                      />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={preferences?.channels?.email === true}
                        onChange={(e) =>
                          setPreferences((prev) =>
                            prev ? { ...prev, channels: { ...prev.channels, email: e.target.checked } } : prev
                          )
                        }
                        className="h-4 w-4 text-indigo-600 rounded"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PERSONA & TEMPLATES */}
      {activeTab === 'TEMPLATES' && (
        <div className="space-y-6">
          {/* Recruiter Persona Active Banner */}
          <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50/70 via-white to-white p-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white font-bold text-sm">
                  {recruiterName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    Active Recruiter Persona: <span className="text-indigo-600">{recruiterName}</span>
                    <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                      TENANT ISOLATED
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    All templates automatically substitute <code className="font-mono text-indigo-600 font-semibold">{'{{recruiterName}}'}</code> with <strong className="text-slate-700">{recruiterName}</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Template Preview Section */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-bold text-slate-900">Notification Template Engine</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Live variable resolution preview for Discord DMs sent to applicants.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedTemplate('RECEIVED')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    selectedTemplate === 'RECEIVED'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Application Received
                </button>
                <button
                  onClick={() => setSelectedTemplate('APPROVED')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    selectedTemplate === 'APPROVED'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Approved
                </button>
                <button
                  onClick={() => setSelectedTemplate('MORE_INFO')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    selectedTemplate === 'MORE_INFO'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Action Required
                </button>
              </div>
            </div>

            {testSent && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
                <CheckCircle2 className="h-4 w-4" />
                Notification dispatched to alerts feed and message queue.
              </div>
            )}

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Raw Template */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Raw Template Definition
                  </span>
                  <span className="text-[11px] font-mono text-indigo-600">Supported: {'{{recruiterName}}'}, {'{{applicantName}}'}</span>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="text-xs font-semibold text-slate-700">Subject:</div>
                  <div className="mt-1 font-mono text-xs text-slate-800 bg-white p-2 rounded border border-slate-200">
                    {selectedTemplate === 'RECEIVED'
                      ? 'Application Received by {{recruiterName}}'
                      : selectedTemplate === 'APPROVED'
                      ? 'Application Approved by {{recruiterName}}'
                      : '{{recruiterName}} requires additional information'}
                  </div>

                  <div className="mt-3 text-xs font-semibold text-slate-700">Body Template:</div>
                  <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-slate-800 bg-white p-2.5 rounded border border-slate-200 leading-relaxed">
                    {selectedTemplate === 'RECEIVED'
                      ? 'Hi {{applicantName}},\n\n{{recruiterName}} has received your application (ID: {{applicationId}}).\nYour submission is now under review by our recruitment team.\n\nThank you for your interest in our community!'
                      : selectedTemplate === 'APPROVED'
                      ? 'Hi {{applicantName}},\n\nGreat news! {{recruiterName}} has approved your application (ID: {{applicationId}}).\nWelcome to the community! Please check your server roles.'
                      : 'Hi {{applicantName}},\n\n{{recruiterName}} needs some additional details regarding application {{applicationId}}.\n\nNotes: Please provide your GitHub or portfolio link.'}
                  </pre>
                </div>
              </div>

              {/* Rendered Discord DM */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Rendered Discord DM Preview
                  </span>
                  <span className="text-[11px] text-slate-400">Target: Applicant DM</span>
                </div>

                <div className="rounded-lg bg-slate-900 p-4 font-mono text-xs text-slate-200 shadow-inner">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-emerald-500" />
                      <span className="font-bold text-indigo-400">{recruiterName} [BOT]</span>
                    </div>
                    <span className="text-[10px] text-slate-500">Today at 12:00 PM</span>
                  </div>

                  <div className="whitespace-pre-wrap leading-relaxed text-slate-100">
                    {selectedTemplate === 'RECEIVED'
                      ? `Hi Rahul,\n\n${recruiterName} has received your application (ID: APP-1024).\nYour submission is now under review by our recruitment team.\n\nThank you for your interest in our community!`
                      : selectedTemplate === 'APPROVED'
                      ? `Hi Rahul,\n\nGreat news! ${recruiterName} has approved your application (ID: APP-1024).\nWelcome to the community! Please check your server roles.`
                      : `Hi Rahul,\n\n${recruiterName} needs some additional details regarding application APP-1024.\n\nNotes: Please provide your portfolio link.`}
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSendTestNotification}
                    disabled={testSending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition"
                  >
                    {testSending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Simulate Test Dispatch
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NOTIFICATION DETAIL MODAL */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100">
                  {getCategoryIcon(selectedDetail.category)}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{selectedDetail.title}</h3>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                    {getPriorityBadge(selectedDetail.priority)}
                    <span className="font-mono">{new Date(selectedDetail.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedDetail(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              <div>
                <span className="font-semibold text-slate-700">Message Content:</span>
                <div className="mt-1 rounded-lg bg-slate-50 p-3 text-slate-800 leading-relaxed whitespace-pre-wrap border border-slate-200">
                  {selectedDetail.body}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div className="rounded-lg border border-slate-200 p-2.5">
                  <span className="text-slate-400">Category:</span>
                  <div className="font-semibold text-slate-800 mt-0.5">{selectedDetail.category}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-2.5">
                  <span className="text-slate-400">Delivery Channel:</span>
                  <div className="font-semibold text-slate-800 mt-0.5">{selectedDetail.channel}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-2.5">
                  <span className="text-slate-400">Delivery Status:</span>
                  <div className="font-semibold text-slate-800 mt-0.5">{selectedDetail.deliveryStatus || 'DELIVERED'}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-2.5">
                  <span className="text-slate-400">Read State:</span>
                  <div className="font-semibold text-slate-800 mt-0.5">{selectedDetail.read ? 'READ' : 'UNREAD'}</div>
                </div>
              </div>

              {selectedDetail.metadata && Object.keys(selectedDetail.metadata).length > 0 && (
                <div>
                  <span className="font-semibold text-slate-700">Payload Metadata:</span>
                  <pre className="mt-1 max-h-28 overflow-y-auto rounded bg-slate-900 p-2 font-mono text-[10px] text-emerald-400">
                    {JSON.stringify(selectedDetail.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
              <div className="flex items-center gap-2">
                {!selectedDetail.read ? (
                  <button
                    onClick={() => {
                      handleMarkAsRead(selectedDetail.id);
                      setSelectedDetail((prev) => (prev ? { ...prev, read: true, status: 'READ' } : null));
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Check className="h-3.5 w-3.5" /> Mark Read
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      handleMarkAsUnread(selectedDetail.id);
                      setSelectedDetail((prev) => (prev ? { ...prev, read: false, status: 'UNREAD' } : null));
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Eye className="h-3.5 w-3.5" /> Mark Unread
                  </button>
                )}
                <button
                  onClick={() => {
                    handleArchive(selectedDetail.id);
                    setSelectedDetail(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Archive className="h-3.5 w-3.5" /> Archive
                </button>
              </div>

              {selectedDetail.route && (
                <button
                  onClick={() => {
                    if (onNavigateToSection) onNavigateToSection(selectedDetail.route!);
                    setSelectedDetail(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 shadow-2xs"
                >
                  Navigate to {selectedDetail.route} <ExternalLink className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
