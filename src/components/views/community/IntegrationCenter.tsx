import React, { useEffect, useState } from 'react';
import {
  Server,
  FileSpreadsheet,
  Calendar,
  FileText,
  Database,
  Bot,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ShieldAlert,
  Settings,
  Lock,
  CreditCard,
  Zap,
  Check,
} from 'lucide-react';
import { GoogleCalendarSettingsCard } from './settings/GoogleCalendarSettingsCard';

interface IntegrationSectionStatus {
  provider: 'DISCORD' | 'GOOGLE_FORMS' | 'GOOGLE_CALENDAR' | 'GOOGLE_SHEETS' | 'FIREBASE' | 'AI_ENGINE' | 'BILLING';
  title: string;
  status: 'NOT_CONFIGURED' | 'CONFIGURED' | 'CONNECTED' | 'PERMISSION_REQUIRED' | 'FAILED' | 'DISCONNECTED';
  configurationSummary: string;
  connectionSummary: string;
  permissionsGranted: boolean;
  lastSuccessfulOperationAt?: string;
  lastFailedOperationAt?: string;
  currentError?: string;
  retryCount: number;
  actionRequired?: string;
  capabilitiesEnabled?: string[];
  lastVerifiedAt?: string;
}

interface UnifiedIntegrationReport {
  timestamp: string;
  communityId: string;
  overallHealth: 'HEALTHY' | 'DEGRADED' | 'CONFIG_REQUIRED';
  sections: {
    discord: IntegrationSectionStatus;
    googleForms: IntegrationSectionStatus;
    googleCalendar: IntegrationSectionStatus;
    googleSheets: IntegrationSectionStatus;
    firebase: IntegrationSectionStatus;
    aiEngine: IntegrationSectionStatus;
    billing: IntegrationSectionStatus;
  };
}

export const IntegrationCenter: React.FC<{ communityId?: string }> = ({ communityId = '' }) => {
  const [report, setReport] = useState<UnifiedIntegrationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Config Modal State
  const [configModalProvider, setConfigModalProvider] = useState<
    'DISCORD' | 'AI_ENGINE' | 'BILLING' | 'GOOGLE_SHEETS' | null
  >(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [modalMessage, setModalMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/v1/integrations/unified-status?communityId=${communityId}`, {
        headers: { 'x-community-id': communityId, 'x-role': 'OWNER' },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Failed to fetch integration status`);
      }
      const json = await res.json();
      if (json.success && json.data) {
        setReport(json.data);
      } else {
        throw new Error(json.error?.message || 'Failed to load integration status');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load integration status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [communityId]);

  const handleOpenConfigModal = (provider: 'DISCORD' | 'AI_ENGINE' | 'BILLING' | 'GOOGLE_SHEETS') => {
    setConfigModalProvider(provider);
    setFormData({});
    setModalMessage(null);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configModalProvider) return;

    try {
      setSaving(true);
      setModalMessage(null);

      const res = await fetch('/api/v1/integrations/configure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
          'x-role': 'OWNER',
        },
        body: JSON.stringify({
          provider: configModalProvider,
          payload: formData,
        }),
      });

      const json = await res.json();
      if (json.success) {
        setModalMessage({
          type: 'success',
          text: `${configModalProvider} integration configured and verified successfully! Status: ${json.data.status}`,
        });
        setTimeout(() => {
          setConfigModalProvider(null);
          fetchStatus();
        }, 1200);
      } else {
        setModalMessage({
          type: 'error',
          text: json.error?.message || json.data?.message || 'Configuration failed',
        });
      }
    } catch (err: any) {
      setModalMessage({
        type: 'error',
        text: err.message || 'Failed updating integration credentials',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestVerify = async (provider: 'DISCORD' | 'AI_ENGINE' | 'BILLING' | 'GOOGLE_SHEETS') => {
    try {
      setLoading(true);
      const res = await fetch('/api/v1/integrations/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
          'x-role': 'OWNER',
        },
        body: JSON.stringify({ provider, communityId }),
      });
      const json = await res.json();
      if (json.success) {
        fetchStatus();
      }
    } catch (err) {
      console.error('Verification ping failed', err);
    } finally {
      setLoading(false);
    }
  };

  const renderBadge = (status: IntegrationSectionStatus['status']) => {
    switch (status) {
      case 'CONNECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Connected
          </span>
        );
      case 'CONFIGURED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Configured
          </span>
        );
      case 'PERMISSION_REQUIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <ShieldAlert className="w-3.5 h-3.5" />
            Permission Required
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5" />
            Failed
          </span>
        );
      case 'NOT_CONFIGURED':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
            <HelpCircle className="w-3.5 h-3.5" />
            Optional / Unconfigured
          </span>
        );
    }
  };

  const renderTile = (
    icon: React.ReactNode,
    item: IntegrationSectionStatus,
    configurableProvider?: 'DISCORD' | 'AI_ENGINE' | 'BILLING' | 'GOOGLE_SHEETS'
  ) => (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors space-y-4">
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-slate-700">
              {icon}
            </div>
            <h3 className="font-semibold text-slate-900 text-sm">{item.title}</h3>
          </div>
          {renderBadge(item.status)}
        </div>

        <div className="space-y-2 text-xs text-slate-600 mb-3">
          <div>
            <span className="font-medium text-slate-800">Config: </span>
            {item.configurationSummary}
          </div>
          <div>
            <span className="font-medium text-slate-800">Connection: </span>
            {item.connectionSummary}
          </div>
          {item.lastVerifiedAt && (
            <div className="text-slate-400 text-[11px]">
              Last Verified: {new Date(item.lastVerifiedAt).toLocaleString()}
            </div>
          )}
          {item.currentError && (
            <div className="p-2 bg-rose-50 border border-rose-100 text-rose-700 rounded-md text-xs mt-2 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{item.currentError}</span>
            </div>
          )}
        </div>

        {/* Enabled Capabilities */}
        {item.capabilitiesEnabled && item.capabilitiesEnabled.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Capabilities Enabled
            </div>
            <div className="flex flex-wrap gap-1.5">
              {item.capabilitiesEnabled.map((cap, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 text-[10px] font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md"
                >
                  <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                  {cap}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
        {configurableProvider ? (
          <div className="flex items-center gap-2 w-full justify-between">
            <button
              onClick={() => handleOpenConfigModal(configurableProvider)}
              className="px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Settings className="w-3.5 h-3.5" />
              Configure
            </button>

            <button
              onClick={() => handleTestVerify(configurableProvider)}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
            >
              <RefreshCw className="w-3 h-3" />
              Verify
            </button>
          </div>
        ) : (
          <span className="text-[11px] text-slate-400 italic">
            Managed via system environment / database schema
          </span>
        )}
      </div>
    </div>
  );

  if (loading && !report) {
    return (
      <div className="p-8 text-center text-slate-500 text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
        Loading Unified Integration Connection Center...
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-sm">
        <div className="font-semibold mb-1">Failed to load integration status</div>
        <div>{error || 'Unable to connect to integration center backend'}</div>
        <button
          onClick={fetchStatus}
          className="mt-3 px-3 py-1.5 text-xs font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Self-Service Integration Configuration Center</h2>
          <p className="text-xs text-slate-500">
            Configure credentials, test connectivity, and monitor capabilities across external platform integrations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500">
            Overall Health:{' '}
            <span
              className={`font-semibold ${
                report.overallHealth === 'HEALTHY' ? 'text-emerald-600' : 'text-amber-600'
              }`}
            >
              {report.overallHealth}
            </span>
          </div>
          <button
            onClick={fetchStatus}
            className="p-2 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors text-xs flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {renderTile(<Server className="w-4 h-4 text-indigo-600" />, report.sections.discord, 'DISCORD')}
        {renderTile(<Bot className="w-4 h-4 text-purple-600" />, report.sections.aiEngine, 'AI_ENGINE')}
        {renderTile(<CreditCard className="w-4 h-4 text-emerald-600" />, report.sections.billing, 'BILLING')}
        {renderTile(<FileSpreadsheet className="w-4 h-4 text-green-600" />, report.sections.googleSheets, 'GOOGLE_SHEETS')}
        {renderTile(<FileText className="w-4 h-4 text-slate-600" />, report.sections.googleForms)}
        {renderTile(<Calendar className="w-4 h-4 text-blue-600" />, report.sections.googleCalendar)}
        {renderTile(<Database className="w-4 h-4 text-amber-600" />, report.sections.firebase)}
      </div>

      {/* User-Scoped Google Calendar Setup & Configuration */}
      <GoogleCalendarSettingsCard communityId={communityId} onStatusChange={fetchStatus} />

      {/* Self-Service Configuration Modal */}
      {configModalProvider && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Configure {configModalProvider} Credentials
                </h3>
              </div>
              <button
                onClick={() => setConfigModalProvider(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {modalMessage && (
              <div
                className={`p-3 rounded-lg text-xs font-medium ${
                  modalMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {modalMessage.text}
              </div>
            )}

            <form onSubmit={handleSaveConfig} className="space-y-4">
              {configModalProvider === 'DISCORD' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Discord Bot Token *
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••••••••••••••••••"
                      value={formData.botToken || ''}
                      onChange={(e) => setFormData({ ...formData, botToken: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Application ID / Client ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 123456789012345678"
                      value={formData.applicationId || ''}
                      onChange={(e) => setFormData({ ...formData, applicationId: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      OAuth Client Secret
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••••••••••"
                      value={formData.clientSecret || ''}
                      onChange={(e) => setFormData({ ...formData, clientSecret: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                  </div>
                </>
              )}

              {configModalProvider === 'AI_ENGINE' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Gemini AI API Key *
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="AIzaSy••••••••••••••••••••"
                    value={formData.apiKey || ''}
                    onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Enables advisory applicant scoring, AI insights, and Community Brain contextual recommendations.
                  </p>
                </div>
              )}

              {configModalProvider === 'BILLING' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Stripe Secret Key *
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••••••••••••••"
                      value={formData.stripeSecretKey || ''}
                      onChange={(e) => setFormData({ ...formData, stripeSecretKey: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Stripe Webhook Secret
                    </label>
                    <input
                      type="password"
                      placeholder="whsec_••••••••••••••••••••"
                      value={formData.stripeWebhookSecret || ''}
                      onChange={(e) => setFormData({ ...formData, stripeWebhookSecret: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 font-mono"
                    />
                  </div>
                </>
              )}

              {configModalProvider === 'GOOGLE_SHEETS' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Google Spreadsheet ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                    value={formData.spreadsheetId || ''}
                    onChange={(e) => setFormData({ ...formData, spreadsheetId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Target Spreadsheet ID for automated member roster exports and analytics reporting.
                  </p>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => setConfigModalProvider(null)}
                  className="flex-1 py-2 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition flex items-center justify-center gap-1.5"
                >
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Save & Verify'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
