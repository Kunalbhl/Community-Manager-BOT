import React, { useState, useEffect } from 'react';
import { Calendar, CheckCircle, AlertTriangle, RefreshCw, Unplug, ExternalLink, Settings } from 'lucide-react';

interface GoogleCalendarSettingsCardProps {
  communityId?: string;
  onStatusChange?: (status: any) => void;
}

export const GoogleCalendarSettingsCard: React.FC<GoogleCalendarSettingsCardProps> = ({
  communityId,
  onStatusChange,
}) => {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusData, setStatusData] = useState<any>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Calendar selection state
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [availableCalendars, setAvailableCalendars] = useState<any[]>([]);
  const [selectedCalId, setSelectedCalId] = useState<string>('primary');
  const [fetchingCalendars, setFetchingCalendars] = useState(false);

  const fetchStatus = async () => {
    if (!communityId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/calendar/setup-status?communityId=${encodeURIComponent(communityId)}`);
      const json = await res.json();
      if (json.success) {
        setStatusData(json.data);
        if (onStatusChange) onStatusChange(json.data);
      }
    } catch (err) {
      console.error('Failed to fetch calendar status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [communityId]);

  const handleOpenCalendarSelector = async () => {
    setFetchingCalendars(true);
    setShowCalendarModal(true);
    try {
      const res = await fetch(`/api/v1/calendar/calendars?communityId=${encodeURIComponent(communityId)}`);
      const json = await res.json();
      if (json.success && json.data) {
        setAvailableCalendars(json.data.calendars || []);
        setSelectedCalId(json.data.selectedCalendarId || 'primary');
      }
    } catch (err) {
      console.error('Failed to list user calendars:', err);
    } finally {
      setFetchingCalendars(false);
    }
  };

  const handleSelectCalendar = async (calId: string) => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/v1/calendar/select-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, calendarId: calId }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: `Target calendar updated to '${calId}'.` });
        setShowCalendarModal(false);
        await fetchStatus();
      } else {
        setMessage({ type: 'error', text: json.message || 'Failed to update calendar selection.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to select calendar.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleConnect = async () => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/v1/calendar/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: json.message || 'Google Calendar connected successfully.' });
        await fetchStatus();
      } else {
        setMessage({ type: 'error', text: json.message || 'Failed to connect Google Calendar.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Connection error.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/v1/calendar/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ type: 'success', text: 'Google Calendar disconnected.' });
        await fetchStatus();
      } else {
        setMessage({ type: 'error', text: json.message || 'Failed to disconnect Google Calendar.' });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Disconnection error.' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-100" />
          <div className="space-y-1">
            <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-60 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  const status = statusData?.status || 'NEVER_CONFIGURED';
  const preference = statusData?.preference || 'NEVER_CONFIGURED';
  const googleAccount = statusData?.googleAccountId || 'interviewer@gmail.com';
  const calendarId = statusData?.calendarId || 'primary';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600">
            <Calendar className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-black text-slate-900">Google Calendar Integration</h4>
            <p className="text-xs text-slate-500 font-medium">Interviewer personal recruitment calendar synchronization</p>
          </div>
        </div>

        <div>
          {status === 'CONNECTED' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
              <CheckCircle className="h-3.5 w-3.5" />
              Connected
            </span>
          ) : preference === 'SKIPPED' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 border border-amber-200">
              <AlertTriangle className="h-3.5 w-3.5" />
              Setup Status: Skipped
            </span>
          ) : status === 'DISCONNECTED' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 border border-slate-200">
              <Unplug className="h-3.5 w-3.5" />
              Status: Disconnected
            </span>
          ) : status === 'ERROR' || status === 'REAUTH_REQUIRED' ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700 border border-rose-200">
              <AlertTriangle className="h-3.5 w-3.5" />
              Status: Action Required
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 border border-slate-200">
              Status: Not Configured
            </span>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg p-3 text-xs font-medium border ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* BODY ACCORDING TO STATE */}
      {status === 'CONNECTED' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-500 uppercase">Google Account</span>
              <span className="font-mono font-bold text-indigo-700">{googleAccount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="font-bold text-slate-500 uppercase">Target Calendar</span>
              <span className="font-mono text-slate-700">{calendarId}</span>
            </div>
            {statusData?.connectedAt && (
              <div className="flex justify-between items-center text-[10px] text-slate-400">
                <span>Authorized On</span>
                <span>{new Date(statusData.connectedAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={handleOpenCalendarSelector}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
            >
              <Calendar className="h-3.5 w-3.5 text-indigo-600" />
              Change Calendar
            </button>
            <button
              onClick={handleDisconnect}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 transition disabled:opacity-50"
            >
              <Unplug className="h-3.5 w-3.5" />
              Disconnect
            </button>
          </div>
        </div>
      ) : preference === 'SKIPPED' ? (
        <div className="space-y-4">
          <p className="text-xs text-slate-600 font-medium">
            You previously skipped Google Calendar setup. You can connect your calendar anytime to synchronize recruitment interviews.
          </p>
          <div className="flex items-center justify-end">
            <button
              onClick={handleConnect}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition disabled:opacity-50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Connect Google Calendar
            </button>
          </div>
        </div>
      ) : status === 'DISCONNECTED' ? (
        <div className="space-y-4">
          <p className="text-xs text-slate-600 font-medium">
            Google Calendar is currently disconnected for your interviewer account. Reconnect to resume calendar synchronization.
          </p>
          <div className="flex items-center justify-end">
            <button
              onClick={handleConnect}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reconnect Google Calendar
            </button>
          </div>
        </div>
      ) : status === 'ERROR' || status === 'REAUTH_REQUIRED' ? (
        <div className="space-y-4">
          <p className="text-xs text-rose-600 font-medium">
            Google Calendar authorization needs attention. Please reconnect your account to restore event synchronization.
          </p>
          <div className="flex items-center justify-end">
            <button
              onClick={handleConnect}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-700 transition disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-slate-600 font-medium">
            Connect your Google Calendar to schedule recruitment interviews, receive interview events, and keep your recruitment calendar synchronized.
          </p>
          <div className="flex items-center justify-end">
            <button
              onClick={handleConnect}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-indigo-700 transition disabled:opacity-50"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Connect Google Calendar
            </button>
          </div>
        </div>
      )}
      {/* CALENDAR SELECTION MODAL */}
      {showCalendarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-indigo-600" />
                <h3 className="text-sm font-black text-slate-900">Select Target Google Calendar</h3>
              </div>
              <button
                onClick={() => setShowCalendarModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Choose which calendar recruitment interview events should be created on:
            </p>

            {fetchingCalendars ? (
              <div className="p-8 text-center text-xs font-medium text-slate-500">
                Fetching accessible calendars...
              </div>
            ) : availableCalendars.length === 0 ? (
              <div className="p-4 text-center text-xs font-medium text-slate-500 bg-slate-50 rounded-xl border border-slate-100">
                No custom calendars found. Using 'Primary' calendar.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {availableCalendars.map((cal) => (
                  <button
                    key={cal.id}
                    onClick={() => setSelectedCalId(cal.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border text-xs font-medium transition text-left ${
                      selectedCalId === cal.id
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div>
                      <div className="font-bold">{cal.summary}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{cal.id}</div>
                    </div>
                    {cal.primary && (
                      <span className="text-[10px] uppercase font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md">
                        Primary
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowCalendarModal(false)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSelectCalendar(selectedCalId)}
                disabled={actionLoading}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Save Selection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
