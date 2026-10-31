import React, { useState, useEffect } from 'react';
import { Calendar, X, ExternalLink, CheckCircle } from 'lucide-react';

interface FirstLoginCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: (data: any) => void;
  onSkipped?: () => void;
  communityId?: string;
}

export const FirstLoginCalendarModal: React.FC<FirstLoginCalendarModalProps> = ({
  isOpen,
  onClose,
  onConnected,
  onSkipped,
  communityId,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_CALENDAR_CONNECTED') {
        if (onConnected) onConnected(event.data.data);
        onClose();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onConnected, onClose]);

  if (!isOpen) return null;

  const handleConnect = async () => {
    if (!communityId) {
      setError('Community context is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const authRes = await fetch(`/api/v1/calendar/oauth/authorize?communityId=${encodeURIComponent(communityId)}`, {
        credentials: 'include',
        headers: {
          'x-community-id': communityId,
        },
      });
      const authJson = await authRes.json();
      
      if (authJson.success && authJson.data?.url) {
        const authUrl = authJson.data.url;

        if (authUrl.startsWith('https://accounts.google.com') || (authUrl.startsWith('http') && !authUrl.includes(window.location.host))) {
          const width = 600;
          const height = 700;
          const left = window.screen.width / 2 - width / 2;
          const top = window.screen.height / 2 - height / 2;
          const popup = window.open(
            authUrl,
            'GoogleCalendarOAuth',
            `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`
          );

          if (!popup || popup.closed) {
            window.location.href = authUrl;
            return;
          }
        } else {
          // Direct connection via API for in-app flow
          const connRes = await fetch(`/api/v1/calendar/connect?communityId=${encodeURIComponent(communityId)}`, {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'x-community-id': communityId,
            },
            body: JSON.stringify({ communityId }),
          });
          const connJson = await connRes.json();
          
          if (connJson.success) {
            if (onConnected) onConnected(connJson.data);
            onClose();
          } else {
            const errorMsg =
              (typeof connJson.error === 'string' ? connJson.error : connJson.error?.message) ||
              connJson.message ||
              'Failed to connect Google Calendar';
            setError(errorMsg);
          }
        }
      } else {
        const errorMsg =
          (typeof authJson.error === 'string' ? authJson.error : authJson.error?.message) ||
          authJson.message ||
          'Failed to initialize OAuth authorization flow';
        setError(errorMsg);
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during authorization.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async () => {
    setLoading(true);
    setError(null);
    try {
      const targetCommunity = communityId || '';
      const res = await fetch(`/api/v1/calendar/skip?communityId=${encodeURIComponent(targetCommunity)}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(targetCommunity ? { 'x-community-id': targetCommunity } : {}),
        },
        body: JSON.stringify({ communityId: targetCommunity }),
      });
      const json = await res.json();
      if (json.success) {
        if (onSkipped) onSkipped();
        onClose();
      } else {
        const errorMsg =
          (typeof json.error === 'string' ? json.error : json.error?.message) ||
          json.message ||
          'Failed to save skip preference';
        setError(errorMsg);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to process skip request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in duration-200">
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 shadow-xs">
              <Calendar className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">Connect Google Calendar</h3>
              <p className="text-xs text-slate-500 font-medium">First-run recruitment calendar onboarding</p>
            </div>
          </div>
          <button
            onClick={handleSkip}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
            title="Close / Skip for now"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 text-xs text-slate-600 leading-relaxed font-medium">
          <p>
            Connect your Google Calendar to schedule recruitment interviews, receive interview events, and keep your recruitment calendar synchronized.
          </p>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5 space-y-2 text-[11px] text-indigo-900">
            <div className="flex items-center gap-2 font-bold">
              <CheckCircle className="h-4 w-4 text-indigo-600 shrink-0" />
              <span>Personalized Calendar Integration</span>
            </div>
            <p className="text-indigo-700/80">
              Each interviewer connects their own Google Calendar. Your schedule stays isolated, private, and always up-to-date.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={handleSkip}
            disabled={loading}
            className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={handleConnect}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {loading ? 'Processing...' : (
              <>
                <span>Connect Google Calendar</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
