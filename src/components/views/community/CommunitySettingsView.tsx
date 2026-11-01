import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Shield,
  Users,
  Bell,
  CreditCard,
  Lock,
  Server,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Save,
  RotateCcw,
  RefreshCw,
  ExternalLink,
  Eye,
  FileText,
  Send,
  Calendar,
  Sparkles,
  Clock,
  Globe,
  HelpCircle,
  Info,
  Check,
  X,
} from 'lucide-react';
import {
  ConsolidatedCommunitySettings,
  SettingsSectionKey,
  DiagnosticItem,
  CommunitySettingsDiagnostics,
  RolePermissionConfig,
  NotificationCategoryConfig,
} from '../../../../shared/types/settings';
import { UserRole } from '../../../../shared/types/rbac';
import { DiscordChannelPicker } from '../../common/DiscordChannelPicker';
import { DiscordRolePicker } from '../../common/DiscordRolePicker';

interface CommunitySettingsViewProps {
  communityId: string;
  currentRole: UserRole;
}

const SECTION_TABS: { key: SettingsSectionKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'general', label: 'General', icon: Globe },
  { key: 'community', label: 'Community', icon: Server },
  { key: 'permissions', label: 'Permissions', icon: Shield },
  { key: 'recruitment', label: 'Recruitment', icon: Users },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'plansUsage', label: 'Plans & Usage', icon: CreditCard },
  { key: 'security', label: 'Security', icon: Lock },
];

const IANA_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'America/Buenos_Aires',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Madrid',
  'Europe/Amsterdam',
  'Europe/Warsaw',
  'Europe/Athens',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Australia/Brisbane',
  'Australia/Perth',
  'Pacific/Auckland',
];

const LOCALES = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'en-CA', label: 'English (Canada)' },
  { code: 'en-AU', label: 'English (Australia)' },
  { code: 'es-ES', label: 'Español (España)' },
  { code: 'fr-FR', label: 'Français (France)' },
  { code: 'de-DE', label: 'Deutsch (Deutschland)' },
  { code: 'ja-JP', label: '日本語 (Japan)' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'hi-IN', label: 'हिन्दी (India)' },
  { code: 'zh-CN', label: '简体中文 (China)' },
  { code: 'ko-KR', label: '한국어 (Korea)' },
  { code: 'it-IT', label: 'Italiano (Italia)' },
  { code: 'nl-NL', label: 'Nederlands (Netherlands)' },
  { code: 'ru-RU', label: 'Русский (Russia)' },
];

export const CommunitySettingsView: React.FC<CommunitySettingsViewProps> = ({ communityId, currentRole }) => {
  const [activeTab, setActiveTab] = useState<SettingsSectionKey>('general');
  const [settings, setSettings] = useState<ConsolidatedCommunitySettings | null>(null);
  const [originalSettings, setOriginalSettings] = useState<ConsolidatedCommunitySettings | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showDiagnosticsDetail, setShowDiagnosticsDetail] = useState<boolean>(false);

  // Additional test trigger states
  const [testSending, setTestSending] = useState<boolean>(false);
  const [sheetsSyncing, setSheetsSyncing] = useState<boolean>(false);

  const fetchSettings = async () => {
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/settings`, {
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setSettings(json.data);
        setOriginalSettings(JSON.parse(JSON.stringify(json.data)));
      } else {
        setStatusMessage({ type: 'error', text: json.message || 'Failed to fetch settings.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Error connecting to settings control plane.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [communityId, currentRole]);

  // Dirty check: check if modified vs original
  const isDirty = React.useMemo(() => {
    if (!settings || !originalSettings) return false;
    return JSON.stringify(settings[activeTab]) !== JSON.stringify(originalSettings[activeTab]);
  }, [settings, originalSettings, activeTab]);

  const handleDiscardChanges = () => {
    if (!originalSettings) return;
    setSettings(JSON.parse(JSON.stringify(originalSettings)));
    setValidationErrors([]);
    setStatusMessage({ type: 'info', text: 'Changes discarded.' });
  };

  const handleValidate = async () => {
    if (!settings) return;
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/settings/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({ [activeTab]: settings[activeTab] }),
      });
      const json = await res.json();
      if (res.ok && json.valid) {
        setValidationErrors([]);
        return true;
      } else {
        setValidationErrors(json.errors || ['Validation failed.']);
        return false;
      }
    } catch {
      setValidationErrors(['Failed to contact validation engine.']);
      return false;
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    setStatusMessage(null);
    setValidationErrors([]);

    const isValid = await handleValidate();
    if (!isValid) {
      setSaving(false);
      setStatusMessage({ type: 'error', text: 'Please resolve configuration validation errors before saving.' });
      return;
    }

    try {
      const res = await fetch(`/api/v1/communities/${communityId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({ [activeTab]: settings[activeTab] }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setSettings(json.data);
        setOriginalSettings(JSON.parse(JSON.stringify(json.data)));
        setStatusMessage({ type: 'success', text: `Saved ${activeTab} settings (v${json.data.version}).` });
      } else {
        setStatusMessage({ type: 'error', text: json.message || 'Failed to save settings.' });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: 'Error saving settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshDiagnostics = async () => {
    setDiagnosticsLoading(true);
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/settings/diagnostics`, {
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
      });
      const json = await res.json();
      if (res.ok && json.success && settings) {
        setSettings({ ...settings, diagnostics: json.data });
      }
    } catch (err) {
      // ignore
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  // Sub-handlers for modifying specific sections
  const updateGeneral = (patch: Partial<ConsolidatedCommunitySettings['general']>) => {
    if (!settings) return;
    setSettings({ ...settings, general: { ...settings.general, ...patch } });
  };

  const updateCommunity = (patch: Partial<ConsolidatedCommunitySettings['community']>) => {
    if (!settings) return;
    setSettings({ ...settings, community: { ...settings.community, ...patch } });
  };

  const updateRecruitment = (patch: Partial<ConsolidatedCommunitySettings['recruitment']>) => {
    if (!settings) return;
    setSettings({ ...settings, recruitment: { ...settings.recruitment, ...patch } });
  };

  const updateNotifications = (patch: Partial<ConsolidatedCommunitySettings['notifications']>) => {
    if (!settings) return;
    setSettings({ ...settings, notifications: { ...settings.notifications, ...patch } });
  };

  const updateSecurity = (patch: Partial<ConsolidatedCommunitySettings['security']>) => {
    if (!settings) return;
    setSettings({ ...settings, security: { ...settings.security, ...patch } });
  };

  const updateRoleMapping = (roleKey: UserRole, patch: Partial<ConsolidatedCommunitySettings['permissions']['roleMappings'][UserRole]>) => {
    if (!settings) return;
    const currentMappings = { ...settings.permissions.roleMappings };
    if (currentMappings[roleKey]) {
      currentMappings[roleKey] = { ...currentMappings[roleKey], ...patch };
      setSettings({ ...settings, permissions: { ...settings.permissions, roleMappings: currentMappings } });
    }
  };

  // Test Announcement Handler
  const handleSendTestAnnouncement = async () => {
    setTestSending(true);
    try {
      const res = await fetch('/api/v1/community/recruiter-record-config/test-message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({ communityId }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setStatusMessage({ type: 'success', text: 'Test record message dispatched successfully.' });
      } else {
        setStatusMessage({ type: 'error', text: json.message || 'Failed to dispatch test message.' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Error dispatching test message.' });
    } finally {
      setTestSending(false);
    }
  };

  // Sync Google Sheets Handler
  const handleSyncSheets = async () => {
    setSheetsSyncing(true);
    try {
      const res = await fetch('/api/v1/community/recruiter-records/sync-sheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({ communityId }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setStatusMessage({ type: 'success', text: 'Recruiter records synchronized to Google Sheets.' });
      } else {
        setStatusMessage({ type: 'error', text: json.message || 'Google Sheets sync failed or integration is not configured.' });
      }
    } catch {
      setStatusMessage({ type: 'error', text: 'Error triggering Google Sheets sync.' });
    } finally {
      setSheetsSyncing(false);
    }
  };

  if (loading) {
    return (
      <div id="settings-loading-state" className="flex min-h-[400px] items-center justify-center rounded-xl border border-slate-200 bg-white p-12">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
          <p className="text-sm font-medium text-slate-600">Loading Configuration Control Plane...</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div id="settings-error-state" className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          <span className="font-semibold">Unable to load community configuration</span>
        </div>
        <p className="mt-2 text-sm text-rose-700">Please verify your tenant connection and permissions.</p>
        <button
          onClick={fetchSettings}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-700"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  const diagnostics = settings.diagnostics;

  return (
    <div id="community-settings-control-plane" className="space-y-6">
      {/* Top Header & Context Metadata */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              SETTINGS CONTROL PLANE
            </span>
            <span className="font-mono text-xs text-slate-400">ID: {communityId}</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-600">
              v{settings.version}
            </span>
            <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              Tenant: {settings.general.displayName}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Community Configuration & Control Plane
          </h1>
          <p className="text-sm text-slate-500">
            Centralized, tenant-isolated configuration engine governing general settings, roles, recruitment, notifications, and security.
          </p>
        </div>

        {/* Global Save / Discard Bar */}
        <div className="flex items-center gap-3">
          {isDirty && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              Unsaved changes
            </span>
          )}
          <button
            id="btn-discard-settings"
            onClick={handleDiscardChanges}
            disabled={!isDirty || saving}
            className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 shadow-sm transition-all ${
              !isDirty || saving ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50'
            }`}
          >
            <RotateCcw className="h-4 w-4" />
            Discard
          </button>
          <button
            id="btn-save-settings"
            onClick={handleSaveSettings}
            disabled={!isDirty || saving}
            className={`inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all ${
              !isDirty || saving ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700'
            }`}
          >
            {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Status Feedback Banners */}
      {statusMessage && (
        <div
          id="settings-status-banner"
          className={`flex items-center justify-between rounded-lg p-3.5 text-sm ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : statusMessage.type === 'error'
              ? 'bg-rose-50 text-rose-800 border border-rose-200'
              : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : statusMessage.type === 'error' ? (
              <AlertCircle className="h-4 w-4 text-rose-600" />
            ) : (
              <Info className="h-4 w-4 text-indigo-600" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Validation Errors List */}
      {validationErrors.length > 0 && (
        <div id="settings-validation-errors" className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-rose-800">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            <span>Configuration Validation Errors</span>
          </div>
          <ul className="mt-2 list-disc list-inside space-y-1 text-xs text-rose-700">
            {validationErrors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Diagnostics Health Summary Bar */}
      <div id="settings-diagnostics-bar" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                diagnostics.overallStatus === 'READY'
                  ? 'bg-emerald-100 text-emerald-700'
                  : diagnostics.overallStatus === 'CONFIGURATION_REQUIRED'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-rose-100 text-rose-700'
              }`}
            >
              <Sliders className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Diagnostics Engine</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    diagnostics.overallStatus === 'READY'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : diagnostics.overallStatus === 'CONFIGURATION_REQUIRED'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {diagnostics.overallStatus}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {diagnostics.readyCount} ready · {diagnostics.warningCount} configuration warnings · {diagnostics.errorCount} blockers
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="btn-toggle-diagnostics-detail"
              onClick={() => setShowDiagnosticsDetail(!showDiagnosticsDetail)}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              {showDiagnosticsDetail ? 'Hide details' : 'View diagnostic details'}
            </button>
            <button
              id="btn-refresh-diagnostics"
              onClick={handleRefreshDiagnostics}
              disabled={diagnosticsLoading}
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="Refresh diagnostics"
            >
              <RefreshCw className={`h-4 w-4 ${diagnosticsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Detailed Diagnostics Drawer */}
        {showDiagnosticsDetail && (
          <div className="mt-4 border-t border-slate-100 pt-3 space-y-2">
            {diagnostics.items.map((item: DiagnosticItem, idx: number) => (
              <div key={idx} className="flex items-start justify-between rounded-lg bg-slate-50 p-2.5 text-xs">
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 inline-block h-2 w-2 rounded-full ${
                      item.status === 'READY'
                        ? 'bg-emerald-500'
                        : item.status === 'CONFIGURATION_REQUIRED'
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700">{item.category}</span>
                      <span className="font-mono text-slate-500">[{item.settingKey}]</span>
                    </div>
                    <p className="text-slate-600">{item.message}</p>
                    {item.remediation && <p className="text-indigo-600 font-medium">Remediation: {item.remediation}</p>}
                  </div>
                </div>
                <span className="rounded bg-white px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-600 border border-slate-200">
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Section Tabs Navigation */}
      <div id="settings-tab-navigation" className="flex items-center space-x-1 border-b border-slate-200 pb-2 overflow-x-auto">
        {SECTION_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              id={`tab-${tab.key}`}
              onClick={() => {
                setActiveTab(tab.key);
                setValidationErrors([]);
              }}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-all ${
                isActive ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 1. GENERAL SETTINGS TAB */}
      {/* ========================================================================= */}
      {activeTab === 'general' && (
        <div id="settings-section-general" className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">General Identity & Localization</h2>
            <p className="mt-1 text-xs text-slate-500">
              Manage core tenant identification, authoritative Discord guild associations, timezone, and locale standards.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700">Display Name</label>
                <input
                  type="text"
                  id="input-general-display-name"
                  value={settings.general.displayName}
                  onChange={(e) => updateGeneral({ displayName: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                  placeholder="e.g. Acme Community"
                />
                <p className="mt-1 text-xs text-slate-500">Custom user-facing community title.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Authoritative Discord Guild Name</label>
                <input
                  type="text"
                  disabled
                  value={settings.general.guildName}
                  className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 shadow-sm cursor-not-allowed"
                />
                <p className="mt-1 text-xs text-slate-400">Synced directly from Discord OAuth connection.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Primary Timezone</label>
                <select
                  id="select-general-timezone"
                  value={settings.general.timezone}
                  onChange={(e) => updateGeneral({ timezone: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                >
                  {IANA_TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-indigo-50 p-2 text-xs text-indigo-700">
                  <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Community timezone affects scheduled messages, reminders, events, automation schedules, and reporting date boundaries.
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Locale & Language</label>
                <select
                  id="select-general-locale"
                  value={settings.general.locale}
                  onChange={(e) => updateGeneral({ locale: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                >
                  {LOCALES.map((loc) => (
                    <option key={loc.code} value={loc.code}>
                      {loc.label} ({loc.code})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">Formatting for dates, numbers, and system templates.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Time Format</label>
                <div className="mt-2 flex items-center space-x-4">
                  <label className="flex items-center space-x-2 text-xs text-slate-700">
                    <input
                      type="radio"
                      name="dateTimeFormat"
                      checked={settings.general.dateTimeFormat === '12_HOUR'}
                      onChange={() => updateGeneral({ dateTimeFormat: '12_HOUR' })}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>12-Hour (1:30 PM)</span>
                  </label>
                  <label className="flex items-center space-x-2 text-xs text-slate-700">
                    <input
                      type="radio"
                      name="dateTimeFormat"
                      checked={settings.general.dateTimeFormat === '24_HOUR'}
                      onChange={() => updateGeneral({ dateTimeFormat: '24_HOUR' })}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>24-Hour (13:30)</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Default Landing Context</label>
                <select
                  id="select-general-landing"
                  value={settings.general.defaultLandingContext}
                  onChange={(e) => updateGeneral({ defaultLandingContext: e.target.value as any })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="OVERVIEW">Community Overview</option>
                  <option value="APPLICATIONS">Applications & Candidates</option>
                  <option value="ENGAGEMENT">Member Engagement</option>
                  <option value="EVENTS">Events & Automations</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700">Community Description & Purpose</label>
                <textarea
                  id="textarea-general-description"
                  rows={3}
                  value={settings.general.description || ''}
                  onChange={(e) => updateGeneral({ description: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                  placeholder="Describe your community mission, guidelines, or focus..."
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. COMMUNITY SETTINGS TAB */}
      {/* ========================================================================= */}
      {activeTab === 'community' && (
        <div id="settings-section-community" className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Community Experience & Onboarding</h2>
              <p className="mt-1 text-xs text-slate-500">
                Configure welcome messages, onboarding channels, guidelines links, and community policy enforcement.
              </p>
            </div>

            {/* Welcome Message Toggle */}
            <div className="flex items-start justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div>
                <label className="text-xs font-semibold text-slate-900">Welcome Message Delivery</label>
                <p className="text-xs text-slate-500">
                  Automatically publish a personalized greeting when new members join the server.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.community.welcomeMessageEnabled}
                  onChange={(e) => updateCommunity({ welcomeMessageEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <DiscordChannelPicker
                label="Welcome Target Channel"
                communityId={communityId}
                value={settings.community.welcomeChannelName}
                onChange={(chanId, chanName) => updateCommunity({ welcomeChannelName: chanName || chanId })}
                placeholder="Select live Discord welcome channel..."
              />

              <DiscordChannelPicker
                label="Rules Channel"
                communityId={communityId}
                value={settings.community.rulesChannelName}
                onChange={(chanId, chanName) => updateCommunity({ rulesChannelName: chanName || chanId })}
                placeholder="Select live Discord rules channel..."
              />

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700">Welcome Greeting Template</label>
                <textarea
                  rows={3}
                  value={settings.community.welcomeGreeting || ''}
                  onChange={(e) => updateCommunity({ welcomeGreeting: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                  placeholder="Welcome to {{communityName}}! Please review {{rulesChannel}}..."
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Onboarding Rules Link</label>
                <input
                  type="url"
                  value={settings.community.onboardingRulesLink || ''}
                  onChange={(e) => updateCommunity({ onboardingRulesLink: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                  placeholder="https://example.com/rules"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Code of Conduct Link</label>
                <input
                  type="url"
                  value={settings.community.codeOfConductLink || ''}
                  onChange={(e) => updateCommunity({ codeOfConductLink: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                  placeholder="https://example.com/conduct"
                />
              </div>
            </div>

            {/* Rules & Guidelines Editor */}
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Community Rules List</h3>
              <p className="text-xs text-slate-500 mt-0.5">Authoritative community rules enforced by AI & assistant persona.</p>
              <div className="mt-3 space-y-2">
                {settings.community.rules.map((rule, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400 w-4">{idx + 1}.</span>
                    <input
                      type="text"
                      value={rule}
                      onChange={(e) => {
                        const newRules = [...settings.community.rules];
                        newRules[idx] = e.target.value;
                        updateCommunity({ rules: newRules });
                      }}
                      className="block w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs shadow-sm focus:border-indigo-500 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        const newRules = settings.community.rules.filter((_, i) => i !== idx);
                        updateCommunity({ rules: newRules });
                      }}
                      className="rounded p-1 text-slate-400 hover:text-rose-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => updateCommunity({ rules: [...settings.community.rules, 'New community rule'] })}
                  className="mt-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  + Add Rule Item
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. PERMISSIONS SETTINGS TAB */}
      {/* ========================================================================= */}
      {activeTab === 'permissions' && (
        <div id="settings-section-permissions" className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Role-Based Access Control & Discord Role Mappings</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Strict tenant-isolated permissions hierarchy. Server Owner roles are protected against demotion or privilege escalation.
                </p>
              </div>
              <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 border border-indigo-200">
                Hierarchy Enforced
              </span>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Internal Role</th>
                    <th className="px-4 py-3">Mapped Discord Role</th>
                    <th className="px-4 py-3">Security Level</th>
                    <th className="px-4 py-3">Granted Permissions</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {Object.entries(settings.permissions.roleMappings).map(([roleKey, roleConfig]: [string, RolePermissionConfig]) => {
                    const isProtected = roleConfig.isProtected;
                    return (
                      <tr key={roleKey} className="hover:bg-slate-50/80">
                        <td className="px-4 py-3 font-semibold text-slate-900 flex items-center gap-1.5">
                          {isProtected && <Lock className="h-3.5 w-3.5 text-amber-500" />}
                          <span>{roleKey}</span>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            disabled={isProtected && roleKey === 'OWNER'}
                            value={roleConfig.discordRoleName || ''}
                            onChange={(e) =>
                              updateRoleMapping(roleKey as UserRole, { discordRoleName: e.target.value })
                            }
                            placeholder="@role-name"
                            className={`rounded border px-2.5 py-1 text-xs shadow-sm ${
                              isProtected && roleKey === 'OWNER'
                                ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed'
                                : 'border-slate-300 focus:border-indigo-500 focus:outline-none'
                            }`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded px-2 py-0.5 font-medium ${
                              isProtected
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {isProtected ? 'Protected' : 'Customizable'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          <span className="font-mono text-xs">{(roleConfig.permissions || []).length} permissions</span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 font-semibold text-[10px] ${
                              roleConfig.status === 'READY'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {roleConfig.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg bg-slate-50 p-4 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800">Security Invariant Notes:</p>
              <p>• Self-assignment of privileged roles is strictly prevented by the security engine.</p>
              <p>• Only Server Owners or Platform Owners can alter Owner permissions or role delegations.</p>
              <p>• Every role permission mutation generates an immutable audit log entry.</p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. RECRUITMENT SETTINGS TAB */}
      {/* ========================================================================= */}
      {activeTab === 'recruitment' && (
        <div id="settings-section-recruitment" className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Recruitment Pipeline & Persona Identity</h2>
              <p className="mt-1 text-xs text-slate-500">
                Configure candidate workflows, automatic code generators, assistant persona, and public record announcements.
              </p>
            </div>

            {/* Workflow Toggles */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                <div>
                  <span className="text-xs font-semibold text-slate-800">Application Intake</span>
                  <p className="text-[11px] text-slate-500">Allow prospective members to submit applications.</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.recruitment.applicationEnabled}
                  onChange={(e) => updateRecruitment({ applicationEnabled: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-800">Recruiter Code Required</span>
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">DEFAULT MANDATORY</span>
                  </div>
                  <p className="text-[11px] text-slate-500">Enforce recruiter referral code validation during candidate application intake.</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.recruitment.recruiterCodeRequired !== false}
                  onChange={(e) => updateRecruitment({ recruiterCodeRequired: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                <div>
                  <span className="text-xs font-semibold text-slate-800">Interview Scheduling</span>
                  <p className="text-[11px] text-slate-500">Enable interviewer scheduling and candidate reviews.</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.recruitment.interviewEnabled}
                  onChange={(e) => updateRecruitment({ interviewEnabled: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                <div>
                  <span className="text-xs font-semibold text-slate-800">Automatic Code Generation</span>
                  <p className="text-[11px] text-slate-500">Auto-issue referral codes for qualified recruiters.</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.recruitment.automaticRecruiterCodeGeneration}
                  onChange={(e) => updateRecruitment({ automaticRecruiterCodeGeneration: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                <div>
                  <span className="text-xs font-semibold text-slate-800">Blacklist Verification</span>
                  <p className="text-[11px] text-slate-500">Automatically filter known banned or suspicious candidates.</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.recruitment.blacklistEnforcementEnabled}
                  onChange={(e) => updateRecruitment({ blacklistEnforcementEnabled: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
              </div>
            </div>

            {/* Recruiter Persona Customization */}
            <div className="border-t border-slate-200 pt-4 space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Assistant Recruiter Persona</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Persona Display Name</label>
                  <input
                    type="text"
                    value={settings.recruitment.recruiterDisplayName}
                    onChange={(e) => updateRecruitment({ recruiterDisplayName: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                    placeholder="e.g. Maya the Recruiter"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700">Screening Pass Threshold (%)</label>
                  <div className="mt-1 flex items-center gap-3">
                    <input
                      type="range"
                      min="50"
                      max="95"
                      value={settings.recruitment.screeningThreshold}
                      onChange={(e) => updateRecruitment({ screeningThreshold: parseInt(e.target.value, 10) })}
                      className="w-full accent-indigo-600"
                    />
                    <span className="text-xs font-mono font-bold text-slate-700 w-10">
                      {settings.recruitment.screeningThreshold}%
                    </span>
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700">Recruiter Welcome Greeting</label>
                  <textarea
                    rows={2}
                    value={settings.recruitment.recruiterWelcomeGreeting}
                    onChange={(e) => updateRecruitment({ recruiterWelcomeGreeting: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Recruiter Record Announcement Configuration */}
            <div className="border-t border-slate-200 pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Recruiter Record Announcements
                  </h3>
                  <p className="text-xs text-slate-500">
                    Publish verified referral achievements directly to a designated public Discord channel.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSendTestAnnouncement}
                    disabled={testSending}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {testSending ? 'Sending...' : 'Test Announcement'}
                  </button>
                  <button
                    onClick={handleSyncSheets}
                    disabled={sheetsSyncing}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${sheetsSyncing ? 'animate-spin' : ''}`} />
                    {sheetsSyncing ? 'Syncing...' : 'Sync Sheets'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <DiscordChannelPicker
                  label="Announcement Channel"
                  communityId={communityId}
                  value={settings.recruitment.recordChannelName}
                  onChange={(chanId, chanName) => updateRecruitment({ recordChannelName: chanName || chanId })}
                  placeholder="Select live Discord announcement channel..."
                />

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700">Record Announcement Template</label>
                  <textarea
                    rows={3}
                    value={settings.recruitment.recordTemplate || ''}
                    onChange={(e) => updateRecruitment({ recordTemplate: e.target.value })}
                    className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono shadow-sm focus:border-indigo-500 focus:outline-none"
                  />
                  <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs">
                    <span className="font-semibold text-slate-700">Live Preview:</span>
                    <div className="mt-1 font-mono text-slate-600 bg-white p-2 rounded border border-slate-200">
                      {(settings.recruitment?.recordTemplate || '')
                        .replace(/\{\{\s*recruiterMention\s*\}\}/g, '@AlexRecruiter')
                        .replace(/\{\{\s*applicantName\s*\}\}/g, 'StarGamer_99')
                        .replace(/\{\{\s*recruiterCode\s*\}\}/g, 'JOIN-ALEX-123')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. NOTIFICATIONS SETTINGS TAB */}
      {/* ========================================================================= */}
      {activeTab === 'notifications' && (
        <div id="settings-section-notifications" className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Notification Routing & Destination Preferences</h2>
              <p className="mt-1 text-xs text-slate-500">
                Configure alerting channels, minimum role clearance per notification category, and fallback delivery mechanisms.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                <div>
                  <span className="text-xs font-semibold text-slate-800">DM Fallback Delivery</span>
                  <p className="text-[11px] text-slate-500">Send direct messages if channel notifications fail.</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.notifications.dmDeliveryFallback}
                  onChange={(e) => updateNotifications({ dmDeliveryFallback: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Summary Frequency</label>
                <select
                  value={settings.notifications.summaryFrequency}
                  onChange={(e) => updateNotifications({ summaryFrequency: e.target.value as any })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="INSTANT">Instant Real-Time Alerts</option>
                  <option value="DAILY">Daily Digest</option>
                  <option value="WEEKLY">Weekly Summary</option>
                </select>
              </div>
            </div>

            {/* Category Routing Matrix */}
            <div className="border-t border-slate-200 pt-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Category Alert Routing</h3>
              <div className="space-y-3">
                {Object.entries(settings.notifications.categories).map(([catKey, catConfig]: [string, NotificationCategoryConfig]) => (
                  <div
                    key={catKey}
                    className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={catConfig.enabled}
                        onChange={(e) => {
                          const newCats = { ...settings.notifications.categories };
                          newCats[catKey] = { ...catConfig, enabled: e.target.checked };
                          updateNotifications({ categories: newCats });
                        }}
                        className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                      />
                      <div>
                        <span className="text-xs font-semibold text-slate-900">{catConfig.name}</span>
                        <p className="text-[11px] text-slate-500">Category key: {catKey}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <select
                        value={catConfig.destination}
                        onChange={(e) => {
                          const newCats = { ...settings.notifications.categories };
                          newCats[catKey] = { ...catConfig, destination: e.target.value as any };
                          updateNotifications({ categories: newCats });
                        }}
                        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs shadow-sm focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="DISCORD">Discord Channel</option>
                        <option value="NOTIFICATION_CENTER">Notification Center</option>
                        <option value="EMAIL">Email</option>
                      </select>

                      {catConfig.destination === 'DISCORD' && (
                        <input
                          type="text"
                          value={catConfig.channelName || ''}
                          onChange={(e) => {
                            const newCats = { ...settings.notifications.categories };
                            newCats[catKey] = { ...catConfig, channelName: e.target.value };
                            updateNotifications({ categories: newCats });
                          }}
                          placeholder="#channel"
                          className="w-32 rounded border border-slate-300 px-2 py-1 text-xs shadow-sm focus:border-indigo-500 focus:outline-none"
                        />
                      )}

                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        Min: {catConfig.minimumRole}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. PLANS & USAGE SETTINGS TAB */}
      {/* ========================================================================= */}
      {activeTab === 'plansUsage' && (
        <div id="settings-section-plans" className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Subscription Plan & Tenant Quotas</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Track real-time capacity consumption, active plan tiers, and unlocked enterprise modules.
                </p>
              </div>
              <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700 border border-indigo-200">
                Plan: {settings.plansUsage.plan}
              </span>
            </div>

            {/* Quota Consumption Meters */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.entries(settings.plansUsage.quotas) as Array<[string, any]>).map(([metricKey, quota]) => {
                const pct = Math.min(100, Math.round((quota.used / Math.max(1, quota.limit)) * 100));
                return (
                  <div key={metricKey} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{metricKey}</span>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-lg font-bold text-slate-900">{quota.used}</span>
                      <span className="text-xs font-medium text-slate-500">/ {quota.limit}</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          pct > 90 ? 'bg-rose-500' : pct > 70 ? 'bg-amber-500' : 'bg-indigo-600'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Feature Entitlements Matrix */}
            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">Entitlement Matrix</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {Object.entries(settings.plansUsage.featureAccess).map(([featureKey, enabled]) => (
                  <div key={featureKey} className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                    <span className="text-xs font-medium text-slate-800">{featureKey}</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {enabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      {enabled ? 'Active' : 'Locked'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. SECURITY SETTINGS TAB */}
      {/* ========================================================================= */}
      {activeTab === 'security' && (
        <div id="settings-section-security" className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Security Invariants & Moderation Baseline</h2>
              <p className="mt-1 text-xs text-slate-500">
                Enforce mass mention controls, baseline moderation severity, and immutable security audit retention policies.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-slate-700">Mass Mention Policy (@everyone / @here)</label>
                <select
                  value={settings.security.massMentionPolicy}
                  onChange={(e) => updateSecurity({ massMentionPolicy: e.target.value as any })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="DISABLED">DISABLED (Safe default)</option>
                  <option value="RESTRICTED">RESTRICTED (Controllers & Admins only)</option>
                  <option value="ADMIN_ONLY">ADMIN_ONLY (Server Owner only)</option>
                </select>
                <p className="mt-1 text-xs text-slate-500">Restricts unauthorized bulk pings in community channels.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Moderation Baseline Severity</label>
                <select
                  value={settings.security.moderationBaselineSeverity}
                  onChange={(e) => updateSecurity({ moderationBaselineSeverity: e.target.value as any })}
                  className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="LOW">LOW (Standard warnings)</option>
                  <option value="MEDIUM">MEDIUM (Balanced enforcement)</option>
                  <option value="HIGH">HIGH (Aggressive auto-isolation)</option>
                </select>
              </div>

              <DiscordChannelPicker
                label="Moderation Log Target Channel"
                communityId={communityId}
                value={settings.security.moderationLogChannel}
                onChange={(chanId, chanName) => updateSecurity({ moderationLogChannel: chanName || chanId })}
                placeholder="Select live Discord moderation log channel..."
              />

              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                <div>
                  <span className="text-xs font-semibold text-slate-800">Suspicious Activity Alerts</span>
                  <p className="text-[11px] text-slate-500">Alert controllers on repeated join attempts or suspicious patterns.</p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.security.suspiciousActivityAlerts}
                  onChange={(e) => updateSecurity({ suspiciousActivityAlerts: e.target.checked })}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
              </div>
            </div>

            {/* Audit Retention Policy Notice */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-slate-700" />
                <span className="text-xs font-bold text-slate-800">Security Audit Trail Retention Policy</span>
                <span className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                  Fixed 30-Day Policy
                </span>
              </div>
              <p className="text-xs text-slate-600">{settings.security.auditRetentionPolicyNotice}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
