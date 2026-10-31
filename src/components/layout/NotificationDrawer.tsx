import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Bell,
  Check,
  CheckCheck,
  Archive,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  Users,
  ShieldAlert,
  Calendar,
  Zap,
  Layers,
  Settings,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  MessageSquare,
  Clock,
} from 'lucide-react';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationStatus,
} from '../../../shared/types/notifications.js';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateToSection?: (section: string) => void;
  onNotificationsUpdated?: () => void;
}

interface NotificationItem {
  id: string;
  communityId?: string;
  communityName?: string;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  status?: NotificationStatus;
  type: string;
  title: string;
  body: string;
  route?: string;
  channel?: string;
  deliveryStatus?: string;
  read: boolean;
  createdAt: string;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  onNavigateToSection,
  onNotificationsUpdated,
}) => {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD' | 'CRITICAL' | 'RECRUITMENT' | 'SECURITY'>('ALL');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
      let url = '/api/v1/notifications?limit=30';
      if (filter === 'UNREAD') {
        url += '&unreadOnly=true';
      } else if (filter === 'CRITICAL') {
        url += '&priority=CRITICAL';
      } else if (filter === 'RECRUITMENT') {
        url += '&category=RECRUITMENT';
      } else if (filter === 'SECURITY') {
        url += '&category=SECURITY';
      }

      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setNotifications(json.data);
          if (typeof json.unreadCount === 'number') {
            setUnreadCount(json.unreadCount);
          }
        }
      }
    } catch {
      // Safe fallback
    } finally {
      setLoading(false);
    }
  }, [isOpen, filter]);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/v1/notifications/${id}/read`, {
        method: 'PATCH',
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true, status: 'READ' } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
        if (onNotificationsUpdated) onNotificationsUpdated();
      }
    } catch {
      // Safe fallback
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleArchive = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActionLoadingId(id);
    try {
      const res = await fetch(`/api/v1/notifications/${id}/archive`, {
        method: 'PATCH',
      });
      if (res.ok) {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        if (onNotificationsUpdated) onNotificationsUpdated();
      }
    } catch {
      // Safe fallback
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleMarkAllAsRead = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/notifications/mark-all-read', {
        method: 'POST',
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, read: true, status: 'READ' }))
        );
        setUnreadCount(0);
        if (onNotificationsUpdated) onNotificationsUpdated();
      }
    } catch {
      // Safe fallback
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationClick = (n: NotificationItem) => {
    if (!n.read) {
      handleMarkAsRead(n.id);
    }
    if (n.route && onNavigateToSection) {
      onNavigateToSection(n.route);
      onClose();
    }
  };

  if (!isOpen) return null;

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
          <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
            <AlertCircle className="h-2.5 w-2.5" /> CRITICAL
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
            <AlertTriangle className="h-2.5 w-2.5" /> WARNING
          </span>
        );
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
            <CheckCircle2 className="h-2.5 w-2.5" /> SUCCESS
          </span>
        );
      default:
        return null;
    }
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const diffMs = Date.now() - d.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffDay > 0) return `${diffDay}d ago`;
      if (diffHour > 0) return `${diffHour}h ago`;
      if (diffMin > 0) return `${diffMin}m ago`;
      return 'just now';
    } catch {
      return '';
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5 bg-white">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[9px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Notifications & Alerts</h2>
            <p className="text-[11px] text-slate-500">
              {unreadCount === 0 ? 'All caught up' : `${unreadCount} unread alert${unreadCount === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              title="Mark all as read"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition"
              id="btn-mark-all-read"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
          )}
          <button
            onClick={fetchNotifications}
            title="Refresh alerts"
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            id="btn-refresh-notifications"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            id="btn-close-notifications"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-xs">
        <button
          onClick={() => setFilter('ALL')}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
            filter === 'ALL'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('UNREAD')}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
            filter === 'UNREAD'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
          }`}
        >
          Unread {unreadCount > 0 && `(${unreadCount})`}
        </button>
        <button
          onClick={() => setFilter('CRITICAL')}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
            filter === 'CRITICAL'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
          }`}
        >
          Critical
        </button>
        <button
          onClick={() => setFilter('RECRUITMENT')}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
            filter === 'RECRUITMENT'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
          }`}
        >
          Recruitment
        </button>
        <button
          onClick={() => setFilter('SECURITY')}
          className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
            filter === 'SECURITY'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
          }`}
        >
          Security
        </button>
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {loading && notifications.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-slate-400">
            <RefreshCw className="h-5 w-5 animate-spin text-indigo-500" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
            </div>
            <div className="text-sm font-semibold text-slate-800">No notifications found</div>
            <p className="mt-1 max-w-xs text-xs text-slate-500">
              {filter === 'UNREAD'
                ? 'You are all caught up on pending alerts.'
                : 'Zero alerts in this category. Real activity from recruitment and events will appear here.'}
            </p>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => handleNotificationClick(n)}
              className={`group relative rounded-xl border p-3.5 transition cursor-pointer ${
                n.read
                  ? 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
                  : 'border-indigo-200 bg-indigo-50/30 hover:border-indigo-300 hover:bg-indigo-50/50 shadow-2xs'
              }`}
            >
              {/* Unread indicator dot */}
              {!n.read && (
                <div className="absolute top-3.5 right-3.5 h-2 w-2 rounded-full bg-indigo-600 ring-4 ring-indigo-100" />
              )}

              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200 shadow-2xs">
                  {getCategoryIcon(n.category)}
                </div>

                <div className="flex-1 pr-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {getPriorityBadge(n.priority)}
                    {n.category && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 uppercase">
                        {n.category}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 font-mono">
                      {formatTimestamp(n.createdAt)}
                    </span>
                  </div>

                  <h4 className="mt-1 text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition">
                    {n.title}
                  </h4>
                  <p className="mt-0.5 text-[11px] text-slate-600 leading-relaxed line-clamp-2">
                    {n.body}
                  </p>

                  {/* Actions footer */}
                  <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-slate-100/80">
                    <div className="flex items-center gap-2">
                      {n.route && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 hover:underline">
                          View details <ArrowRight className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      {!n.read ? (
                        <button
                          onClick={(e) => handleMarkAsRead(n.id, e)}
                          disabled={actionLoadingId === n.id}
                          title="Mark as read"
                          className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      ) : null}
                      <button
                        onClick={(e) => handleArchive(n.id, e)}
                        disabled={actionLoadingId === n.id}
                        title="Archive notification"
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      >
                        <Archive className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 p-3 bg-slate-50/80">
        <button
          onClick={() => {
            if (onNavigateToSection) {
              onNavigateToSection('notifications');
            }
            onClose();
          }}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-100 transition"
          id="btn-open-full-notifications"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open Full Notification Center
        </button>
      </div>
    </div>
  );
};
