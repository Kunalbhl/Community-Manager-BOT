import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  Zap,
  Save,
  CheckCircle,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import { PlatformSetting } from '../../../../shared/types/models.js';

interface PlatformSettingsViewProps {
  platformKey: string;
}

export const PlatformSettingsView: React.FC<PlatformSettingsViewProps> = ({ platformKey }) => {
  const [settings, setSettings] = useState<PlatformSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Editable fields
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [aiScreening, setAiScreening] = useState(true);
  const [recruiterReferralTracking, setRecruiterReferralTracking] = useState(true);
  const [sheetsSync, setSheetsSync] = useState(true);
  const [discordDmNotifications, setDiscordDmNotifications] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState('');

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/platform/settings', {
        headers: { 'x-platform-key': platformKey || 'cr_platform_verified_claim_token' },
      });
      const json = await res.json();
      if (json.success && json.data) {
        setSettings(json.data);
        setMaintenanceMode(json.data.maintenanceMode || false);
        setAiScreening(json.data.featureFlags?.aiScreening ?? true);
        setRecruiterReferralTracking(json.data.featureFlags?.recruiterReferralTracking ?? true);
        setSheetsSync(json.data.featureFlags?.sheetsSync ?? true);
        setDiscordDmNotifications(json.data.featureFlags?.discordDmNotifications ?? true);
        setWebhookUrl(json.data.platformNotificationWebhook || '');
      }
    } catch (err) {
      console.error('Failed to load platform settings', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [platformKey]);

  const handleSave = async () => {
    setSaving(true);
    setSuccessMessage(null);
    try {
      const res = await fetch('/api/v1/platform/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-platform-key': platformKey || 'cr_platform_verified_claim_token',
        },
        body: JSON.stringify({
          maintenanceMode,
          featureFlags: {
            aiScreening,
            recruiterReferralTracking,
            sheetsSync,
            discordDmNotifications,
          },
          platformNotificationWebhook: webhookUrl,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSuccessMessage('Platform settings saved successfully.');
        setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (err) {
      console.error('Failed to update platform settings', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div id="platform-settings-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
              PLATFORM LEVEL
            </span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              GLOBAL CONFIGURATION
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Platform Master Settings
          </h1>
          <p className="text-sm text-slate-500">
            Configure system-wide feature flags, free-mode quota protections, and operational controls.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>

      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          <CheckCircle className="h-4 w-4" />
          {successMessage}
        </div>
      )}

      {/* Free-First Safeguard Banner */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-indigo-950">
              Platform Free-First Quota Architecture
            </h3>
            <p className="mt-1 text-sm text-indigo-800">
              The platform runs with FREE_MODE=true. System limits are enforced at the backend repository and service layer. When free quotas are exhausted, operations gracefully fall back to a manual queue. Paid API fallback is strictly forbidden.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs font-medium text-indigo-900">
              <div className="rounded bg-white/80 p-2 border border-indigo-100">
                <span>AI Limit: </span>
                <span className="font-bold">100 req/day</span>
              </div>
              <div className="rounded bg-white/80 p-2 border border-indigo-100">
                <span>App Intake: </span>
                <span className="font-bold">50 apps/day</span>
              </div>
              <div className="rounded bg-white/80 p-2 border border-indigo-100">
                <span>Sheet Writes: </span>
                <span className="font-bold">200 writes/day</span>
              </div>
              <div className="rounded bg-white/80 p-2 border border-indigo-100">
                <span>Token Cap: </span>
                <span className="font-bold">2048 tokens</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Global Controls & Feature Flags */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Maintenance & Emergency Controls */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">Operational Controls</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Emergency toggles affecting all registered communities simultaneously.
          </p>

          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-800">Global Maintenance Mode</div>
                <div className="text-xs text-slate-500">
                  Temporarily pause application intake and external webhook dispatchers
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMaintenanceMode(!maintenanceMode)}
                className="text-indigo-600 focus:outline-none"
              >
                {maintenanceMode ? (
                  <ToggleRight className="h-8 w-8 text-amber-600" />
                ) : (
                  <ToggleLeft className="h-8 w-8 text-slate-400" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Global Feature Flags */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">Platform Feature Flags</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Enable or disable modules across the multi-tenant bot network.
          </p>

          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-800">AI Screening Module</div>
                <div className="text-xs text-slate-500">Automated evaluation within free limits</div>
              </div>
              <button
                type="button"
                onClick={() => setAiScreening(!aiScreening)}
                className="text-indigo-600 focus:outline-none"
              >
                {aiScreening ? (
                  <ToggleRight className="h-8 w-8 text-indigo-600" />
                ) : (
                  <ToggleLeft className="h-8 w-8 text-slate-400" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-800">Recruiter Referral Tracking</div>
                <div className="text-xs text-slate-500">Code generation and referral points</div>
              </div>
              <button
                type="button"
                onClick={() => setRecruiterReferralTracking(!recruiterReferralTracking)}
                className="text-indigo-600 focus:outline-none"
              >
                {recruiterReferralTracking ? (
                  <ToggleRight className="h-8 w-8 text-indigo-600" />
                ) : (
                  <ToggleLeft className="h-8 w-8 text-slate-400" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-800">Google Sheets Sync Engine</div>
                <div className="text-xs text-slate-500">Background spreadsheet sync module</div>
              </div>
              <button
                type="button"
                onClick={() => setSheetsSync(!sheetsSync)}
                className="text-indigo-600 focus:outline-none"
              >
                {sheetsSync ? (
                  <ToggleRight className="h-8 w-8 text-indigo-600" />
                ) : (
                  <ToggleLeft className="h-8 w-8 text-slate-400" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-800">Discord DM Notifications</div>
                <div className="text-xs text-slate-500">Direct messages dispatched by bot</div>
              </div>
              <button
                type="button"
                onClick={() => setDiscordDmNotifications(!discordDmNotifications)}
                className="text-indigo-600 focus:outline-none"
              >
                {discordDmNotifications ? (
                  <ToggleRight className="h-8 w-8 text-indigo-600" />
                ) : (
                  <ToggleLeft className="h-8 w-8 text-slate-400" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Platform Webhook Config */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900">Platform Alert Webhook</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Receive urgent operational notifications (quota breaches, system errors, bot disconnections).
        </p>
        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
            Discord Webhook URL
          </label>
          <input
            type="url"
            placeholder="https://discord.com/api/webhooks/..."
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
};
