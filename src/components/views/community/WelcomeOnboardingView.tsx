import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Sparkles,
  ShieldCheck,
  Send,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sliders,
  Users,
  Hash,
  Award,
  RefreshCw,
  FileCheck,
  HelpCircle,
  Eye,
  Info,
  Bot,
} from 'lucide-react';
import { WelcomeOnboardingConfig, WelcomeAuditRecord, InterviewMode } from '../../../../shared/types/models.js';
import { DiscordConnectionCenter } from './DiscordConnectionCenter.js';
import { IntegrationCenter } from './IntegrationCenter.js';

interface WelcomeOnboardingViewProps {
  communityId: string;
}

export const WelcomeOnboardingView: React.FC<WelcomeOnboardingViewProps> = ({ communityId }) => {
  const [config, setConfig] = useState<WelcomeOnboardingConfig | null>(null);
  const [audits, setAudits] = useState<WelcomeAuditRecord[]>([]);
  const [setupStatus, setSetupStatus] = useState<{
    completionPercentage: number;
    completedSteps: string[];
    pendingSteps: string[];
    isSetupComplete: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'preview' | 'audits' | 'wizard' | 'connection' | 'integrations'>('settings');

  // Form State
  const [personalMsg, setPersonalMsg] = useState('');
  const [serverMsg, setServerMsg] = useState('');
  const [welcomeChanId, setWelcomeChanId] = useState('');
  const [newMemberRoleId, setNewMemberRoleId] = useState('');
  const [enablePersonalDm, setEnablePersonalDm] = useState(true);
  const [enableServerWelcome, setEnableServerWelcome] = useState(true);
  const [enableAutoRole, setEnableAutoRole] = useState(true);
  const [interviewMode, setInterviewMode] = useState<InterviewMode>('NO_INTERVIEW');
  const [rulesAckEnabled, setRulesAckEnabled] = useState(false);
  const [rulesText, setRulesText] = useState('');
  const [rulesVersion, setRulesVersion] = useState('v1.0');
  const [cooldownHours, setCooldownHours] = useState<number>(0);
  const [onboardingInstructions, setOnboardingInstructions] = useState('');

  // Preview State
  const [previewMemberName, setPreviewMemberName] = useState('Alex');
  const [previewRecruiterName, setPreviewRecruiterName] = useState('Sarah_Recruiter');
  const [previewRecruiterCode, setPreviewRecruiterCode] = useState('GAMER2026');
  const [renderedPreview, setRenderedPreview] = useState<{
    personal: string;
    server: string;
  }>({ personal: '', server: '' });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [configRes, auditsRes, setupRes] = await Promise.all([
        fetch(`/api/community/welcome-config?communityId=${communityId}`, {
          headers: { 'x-community-id': communityId, 'x-role': 'OWNER' },
        }),
        fetch(`/api/community/welcome-audits?communityId=${communityId}`, {
          headers: { 'x-community-id': communityId, 'x-role': 'OWNER' },
        }),
        fetch(`/api/community/setup-status?communityId=${communityId}`, {
          headers: { 'x-community-id': communityId, 'x-role': 'OWNER' },
        }),
      ]);

      if (configRes.ok) {
        const json = await configRes.json();
        if (json.success && json.data) {
          setConfig(json.data);
          setPersonalMsg(json.data.personalWelcomeMessage || '');
          setServerMsg(json.data.serverWelcomeMessage || '');
          setWelcomeChanId(json.data.welcomeChannelId || '');
          setNewMemberRoleId(json.data.newMemberRoleId || '');
          setEnablePersonalDm(json.data.enablePersonalDm ?? true);
          setEnableServerWelcome(json.data.enableServerWelcome ?? true);
          setEnableAutoRole(json.data.enableAutoRoleAssignment ?? true);
          setInterviewMode(json.data.interviewMode || 'NO_INTERVIEW');
          setRulesAckEnabled(json.data.rulesAcknowledgementEnabled ?? false);
          setRulesText(json.data.communityRulesText || '');
          setRulesVersion(json.data.rulesVersion || 'v1.0');
          setCooldownHours(json.data.reapplicationCooldownHours ?? 0);
          setOnboardingInstructions(json.data.onboardingInstructions || '');
        }
      }

      if (auditsRes.ok) {
        const json = await auditsRes.json();
        if (json.success && json.data) {
          setAudits(json.data);
        }
      }

      if (setupRes.ok) {
        const json = await setupRes.json();
        if (json.success && json.data) {
          setSetupStatus(json.data);
        }
      }
    } catch (err) {
      console.error('Error fetching welcome configuration:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [communityId]);

  // Live Template Preview Renderer
  useEffect(() => {
    const render = (text: string) => {
      let res = text || '';
      res = res.replace(/\{\{memberName\}\}/g, previewMemberName || 'Member');
      res = res.replace(/\{\{communityName\}\}/g, 'Discord Community');
      res = res.replace(/\{\{recruiterName\}\}/g, previewRecruiterName || '');
      res = res.replace(/\{\{recruiterCode\}\}/g, previewRecruiterCode || '');
      return res;
    };

    setRenderedPreview({
      personal: render(personalMsg),
      server: render(serverMsg),
    });
  }, [personalMsg, serverMsg, previewMemberName, previewRecruiterName, previewRecruiterCode]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setSaveSuccess(false);

      const res = await fetch(`/api/community/welcome-config?communityId=${communityId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
          'x-role': 'OWNER',
        },
        body: JSON.stringify({
          communityId,
          personalWelcomeMessage: personalMsg,
          serverWelcomeMessage: serverMsg,
          welcomeChannelId: welcomeChanId.trim() || undefined,
          newMemberRoleId: newMemberRoleId.trim() || undefined,
          enablePersonalDm,
          enableServerWelcome,
          enableAutoRoleAssignment: enableAutoRole,
          interviewMode,
          rulesAcknowledgementEnabled: rulesAckEnabled,
          communityRulesText: rulesText || undefined,
          rulesVersion: rulesVersion || 'v1.0',
          reapplicationCooldownHours: Number(cooldownHours) || 0,
          onboardingInstructions: onboardingInstructions || undefined,
        }),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        await fetchData();
      }
    } catch (err) {
      console.error('Failed to update welcome configuration:', err);
    } finally {
      setSaving(false);
    }
  };

  const insertVariable = (variable: string, target: 'personal' | 'server') => {
    if (target === 'personal') {
      setPersonalMsg((prev) => prev + ` {{${variable}}}`);
    } else {
      setServerMsg((prev) => prev + ` {{${variable}}}`);
    }
  };

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                <Sparkles className="h-3.5 w-3.5" />
                Discord Community Onboarding
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
              Welcome Messages & Role Assignment
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Configure personal Discord DMs, public server welcome messages, and automatic role assignments triggered only upon genuine server join.
            </p>
          </div>

          {setupStatus && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 min-w-[220px]">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1.5">
                <span>Setup Health</span>
                <span className="text-indigo-600">{setupStatus.completionPercentage}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-indigo-600 transition-all duration-300"
                  style={{ width: `${setupStatus.completionPercentage}%` }}
                />
              </div>
              <div className="mt-1.5 text-[11px] text-slate-500 flex items-center justify-between">
                <span>{(setupStatus.completedSteps || []).length} items configured</span>
                <span>{setupStatus.isSetupComplete ? '✓ Ready' : 'Pending steps'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Tab Selector */}
        <div className="mt-6 flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'settings'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sliders className="inline-block h-4 w-4 mr-1.5" />
            Configuration & Rules
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'preview'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye className="inline-block h-4 w-4 mr-1.5" />
            Discord Message Preview
          </button>
          <button
            onClick={() => setActiveTab('audits')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'audits'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileCheck className="inline-block h-4 w-4 mr-1.5" />
            Delivery & Role Audits ({audits.length})
          </button>
          <button
            onClick={() => setActiveTab('wizard')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'wizard'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="inline-block h-4 w-4 mr-1.5" />
            10-Step Adaptive Setup
          </button>
          <button
            onClick={() => setActiveTab('connection')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'connection'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bot className="inline-block h-4 w-4 mr-1.5" />
            Discord Connection Center
          </button>
          <button
            onClick={() => setActiveTab('integrations')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'integrations'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="inline-block h-4 w-4 mr-1.5" />
            Unified Integration Center
          </button>
        </div>
      </div>

      {/* TAB 1: SETTINGS */}
      {activeTab === 'settings' && (
        <form onSubmit={handleSave} className="space-y-6">
          {saveSuccess && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-emerald-800 text-sm flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <span>Welcome and onboarding settings saved successfully!</span>
            </div>
          )}

          {/* Section 1: Workflow & Interview Mode */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-indigo-600" />
              Community Join Flow & Interview Requirement
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Community Manager uses a <em>minimum information, maximum community fit</em> philosophy. Select whether interviews are required, optional, or bypassed entirely.
            </p>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <label
                className={`flex flex-col p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  interviewMode === 'NO_INTERVIEW'
                    ? 'border-indigo-600 bg-indigo-50/40 text-indigo-950'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">Direct Fast-Track</span>
                  <input
                    type="radio"
                    name="interviewMode"
                    value="NO_INTERVIEW"
                    checked={interviewMode === 'NO_INTERVIEW'}
                    onChange={() => setInterviewMode('NO_INTERVIEW')}
                    className="text-indigo-600"
                  />
                </div>
                <span className="text-xs text-slate-500 mt-2">
                  (Default) Fast join flow. Reviewers approve or auto-admit based on lightweight join application. No interview step.
                </span>
              </label>

              <label
                className={`flex flex-col p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  interviewMode === 'OPTIONAL_INTERVIEW'
                    ? 'border-indigo-600 bg-indigo-50/40 text-indigo-950'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">Optional Verification</span>
                  <input
                    type="radio"
                    name="interviewMode"
                    value="OPTIONAL_INTERVIEW"
                    checked={interviewMode === 'OPTIONAL_INTERVIEW'}
                    onChange={() => setInterviewMode('OPTIONAL_INTERVIEW')}
                    className="text-indigo-600"
                  />
                </div>
                <span className="text-xs text-slate-500 mt-2">
                  Staff can optionally request a quick 3-minute chat or voice check if extra verification is needed.
                </span>
              </label>

              <label
                className={`flex flex-col p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  interviewMode === 'REQUIRED_INTERVIEW'
                    ? 'border-indigo-600 bg-indigo-50/40 text-indigo-950'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">Required Interview</span>
                  <input
                    type="radio"
                    name="interviewMode"
                    value="REQUIRED_INTERVIEW"
                    checked={interviewMode === 'REQUIRED_INTERVIEW'}
                    onChange={() => setInterviewMode('REQUIRED_INTERVIEW')}
                    className="text-indigo-600"
                  />
                </div>
                <span className="text-xs text-slate-500 mt-2">
                  Every applicant must complete a quick interview before join confirmation. Suitable for closed / high-security servers.
                </span>
              </label>
            </div>
          </div>

          {/* Section 2: Personal Discord DM */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-indigo-600" />
                  Personal Welcome Direct Message
                </h2>
                <p className="text-sm text-slate-600 mt-0.5">
                  Sent directly to the member's Discord DM upon joining the server.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enablePersonalDm}
                  onChange={(e) => setEnablePersonalDm(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                <span className="ml-2 text-xs font-semibold text-slate-700">
                  {enablePersonalDm ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </div>

            {enablePersonalDm && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="text-slate-500 font-medium self-center">Available Tags:</span>
                  <button
                    type="button"
                    onClick={() => insertVariable('memberName', 'personal')}
                    className="rounded bg-slate-100 hover:bg-slate-200 px-2 py-1 text-slate-700 font-mono text-[11px]"
                  >
                    {'{{memberName}}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertVariable('communityName', 'personal')}
                    className="rounded bg-slate-100 hover:bg-slate-200 px-2 py-1 text-slate-700 font-mono text-[11px]"
                  >
                    {'{{communityName}}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertVariable('recruiterName', 'personal')}
                    className="rounded bg-slate-100 hover:bg-slate-200 px-2 py-1 text-slate-700 font-mono text-[11px]"
                  >
                    {'{{recruiterName}}'}
                  </button>
                  <button
                    type="button"
                    onClick={() => insertVariable('recruiterCode', 'personal')}
                    className="rounded bg-slate-100 hover:bg-slate-200 px-2 py-1 text-slate-700 font-mono text-[11px]"
                  >
                    {'{{recruiterCode}}'}
                  </button>
                </div>

                <textarea
                  rows={4}
                  value={personalMsg}
                  onChange={(e) => setPersonalMsg(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-indigo-500 focus:outline-hidden font-sans"
                  placeholder="Welcome {{memberName}} to {{communityName}}!..."
                />
              </div>
            )}
          </div>

          {/* Section 3: Server Welcome Channel */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <Hash className="h-5 w-5 text-indigo-600" />
                  Public Server Welcome Message
                </h2>
                <p className="text-sm text-slate-600 mt-0.5">
                  Posted in your server's welcome/arrivals channel when a new recruit joins.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableServerWelcome}
                  onChange={(e) => setEnableServerWelcome(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                <span className="ml-2 text-xs font-semibold text-slate-700">
                  {enableServerWelcome ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </div>

            {enableServerWelcome && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Welcome Channel ID (Discord Channel ID)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={welcomeChanId}
                      onChange={(e) => setWelcomeChanId(e.target.value)}
                      placeholder="e.g. 104857692847192837"
                      className="w-full md:w-1/2 rounded-lg border border-slate-300 p-2.5 text-sm font-mono focus:border-indigo-500 focus:outline-hidden"
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Ensure bot has <code>ViewChannel</code> and <code>SendMessages</code> in this channel.
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="text-slate-500 font-medium self-center">Available Tags:</span>
                    <button
                      type="button"
                      onClick={() => insertVariable('memberName', 'server')}
                      className="rounded bg-slate-100 hover:bg-slate-200 px-2 py-1 text-slate-700 font-mono text-[11px]"
                    >
                      {'{{memberName}}'}
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable('communityName', 'server')}
                      className="rounded bg-slate-100 hover:bg-slate-200 px-2 py-1 text-slate-700 font-mono text-[11px]"
                    >
                      {'{{communityName}}'}
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable('recruiterName', 'server')}
                      className="rounded bg-slate-100 hover:bg-slate-200 px-2 py-1 text-slate-700 font-mono text-[11px]"
                    >
                      {'{{recruiterName}}'}
                    </button>
                  </div>

                  <textarea
                    rows={3}
                    value={serverMsg}
                    onChange={(e) => setServerMsg(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-indigo-500 focus:outline-hidden font-sans"
                    placeholder="🎉 Welcome {{memberName}} to {{communityName}}!..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Automatic Role Assignment */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <Award className="h-5 w-5 text-indigo-600" />
                  Automatic Discord Role Assignment
                </h2>
                <p className="text-sm text-slate-600 mt-0.5">
                  Authoritatively assigned to the recruit only after confirmed server membership.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableAutoRole}
                  onChange={(e) => setEnableAutoRole(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                <span className="ml-2 text-xs font-semibold text-slate-700">
                  {enableAutoRole ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            </div>

            {enableAutoRole && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Recruited Member Role ID (Discord Role ID)
                  </label>
                  <input
                    type="text"
                    value={newMemberRoleId}
                    onChange={(e) => setNewMemberRoleId(e.target.value)}
                    placeholder="e.g. 987654321098765432"
                    className="w-full md:w-1/2 rounded-lg border border-slate-300 p-2.5 text-sm font-mono focus:border-indigo-500 focus:outline-hidden"
                  />
                  <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
                    <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>Role Hierarchy Rule:</strong> In Discord server settings, the Bot's highest role must be positioned <em>above</em> the role you want it to assign, and the bot must have <code>Manage Roles</code> permission.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Rules Acknowledgement & Onboarding Directives */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <FileCheck className="h-5 w-5 text-indigo-600" />
                  Community Rules & Member Directives
                </h2>
                <p className="text-sm text-slate-600 mt-0.5">
                  Require new recruits to acknowledge server rules during onboarding.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={rulesAckEnabled}
                  onChange={(e) => setRulesAckEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                <span className="ml-2 text-xs font-semibold text-slate-700">
                  {rulesAckEnabled ? 'Required' : 'Optional'}
                </span>
              </label>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Community Rules / Code of Conduct
                </label>
                <textarea
                  rows={4}
                  value={rulesText}
                  onChange={(e) => setRulesText(e.target.value)}
                  placeholder="1. Treat all members with respect.&#10;2. No spam or unsolicited DMs.&#10;3. Follow Discord TOS."
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Rules Version Identifier
                  </label>
                  <input
                    type="text"
                    value={rulesVersion}
                    onChange={(e) => setRulesVersion(e.target.value)}
                    placeholder="e.g. v1.0 or 2026.1"
                    className="w-full rounded-lg border border-slate-300 p-2 text-sm font-mono focus:border-indigo-500 focus:outline-hidden"
                  />
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Bumping version resets member acknowledgements.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Reapplication Cooldown (Hours)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="720"
                    value={cooldownHours}
                    onChange={(e) => setCooldownHours(parseInt(e.target.value, 10) || 0)}
                    placeholder="0"
                    className="w-full rounded-lg border border-slate-300 p-2 text-sm focus:border-indigo-500 focus:outline-hidden"
                  />
                  <span className="text-[11px] text-slate-500 mt-0.5 block">
                    Wait period before rejected applicants may re-apply (0 = no cooldown).
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Post-Join Next Steps / Directives
              </label>
              <input
                type="text"
                value={onboardingInstructions}
                onChange={(e) => setOnboardingInstructions(e.target.value)}
                placeholder="e.g. Check #announcements, introduce yourself in #lounge, and read #rules."
                className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:border-indigo-500 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={fetchData}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Reset Changes
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Save Onboarding Settings
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: PREVIEW */}
      {activeTab === 'preview' && (
        <div className="space-y-6">
          {/* Sample Variables Selector */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <div className="text-xs font-semibold text-slate-700 mb-2">Simulate Variables for Preview:</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Member Name (<code>{'{{memberName}}'}</code>)</label>
                <input
                  type="text"
                  value={previewMemberName}
                  onChange={(e) => setPreviewMemberName(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Recruiter Name (<code>{'{{recruiterName}}'}</code>)</label>
                <input
                  type="text"
                  value={previewRecruiterName}
                  onChange={(e) => setPreviewRecruiterName(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">Recruiter Code (<code>{'{{recruiterCode}}'}</code>)</label>
                <input
                  type="text"
                  value={previewRecruiterCode}
                  onChange={(e) => setPreviewRecruiterCode(e.target.value)}
                  className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Personal DM Discord Preview Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-slate-200 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-indigo-400" />
                  Personal DM Preview
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">
                  Direct Message
                </span>
              </div>

              <div className="flex gap-3">
                <div className="h-10 w-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  CM
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-white">Community Manager</span>
                    <span className="rounded bg-indigo-500 px-1.5 py-0.2 text-[10px] font-bold text-white uppercase">
                      BOT
                    </span>
                    <span className="text-[11px] text-slate-400">Today at 12:00 PM</span>
                  </div>
                  <div className="mt-2 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
                    {renderedPreview.personal || <span className="text-slate-500 italic">No message configured</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Server Welcome Channel Discord Preview Card */}
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-slate-200 shadow-md">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Hash className="h-4 w-4 text-emerald-400" />
                  Welcome Channel Preview
                </span>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-mono">
                  #{welcomeChanId ? 'welcome-channel' : 'unconfigured'}
                </span>
              </div>

              <div className="flex gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  CM
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-white">Community Manager</span>
                    <span className="rounded bg-indigo-500 px-1.5 py-0.2 text-[10px] font-bold text-white uppercase">
                      BOT
                    </span>
                    <span className="text-[11px] text-slate-400">Today at 12:00 PM</span>
                  </div>
                  <div className="mt-2 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-800/60 p-3 rounded-lg border border-slate-700/50">
                    {renderedPreview.server || <span className="text-slate-500 italic">No message configured</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AUDITS */}
      {activeTab === 'audits' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">Welcome & Role Assignment History</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Authoritative record of genuine join deliveries and role assignment attempts.
              </p>
            </div>
            <button
              onClick={fetchData}
              className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          {audits.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-sm">
              No welcome events recorded yet. When recruits join your Discord server, their delivery and role status will be logged here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Event ID</th>
                    <th className="py-3 px-4">Member Discord ID</th>
                    <th className="py-3 px-4">Action Type</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Details / Error</th>
                    <th className="py-3 px-4">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {audits.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 font-mono text-slate-500">{a.welcomeEventId}</td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-900">{a.memberDiscordUserId}</td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-700">{a.messageType}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                            a.status === 'SENT' || a.status === 'ROLE_ASSIGNED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : a.status === 'SKIPPED' || a.status === 'NOT_CONFIGURED'
                              ? 'bg-slate-100 text-slate-700'
                              : a.status === 'ROLE_HIERARCHY_BLOCKED' || a.status === 'PERMISSION_REQUIRED'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {a.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {a.failureReason || (a.status === 'ROLE_ASSIGNED' ? 'Role successfully granted' : 'Delivered cleanly')}
                      </td>
                      <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                        {new Date(a.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: 10-STEP ADAPTIVE SETUP WIZARD */}
      {activeTab === 'wizard' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-indigo-600" />
              10-Step Adaptive Community Setup Wizard
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Adapts to your server's chosen workflow. Only required steps count toward 100% completion.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                step: 1,
                title: 'Community Name & Guild ID',
                desc: 'Discord Guild ID binding for authoritative role and event syncing.',
                done: Boolean(setupStatus?.completedSteps?.includes('COMMUNITY_IDENTITY')),
              },
              {
                step: 2,
                title: 'Allowed Bot Channels',
                desc: 'Restrict bot interactions to designated recruiter/verification channels.',
                done: true,
              },
              {
                step: 3,
                title: 'Join Form & Questions',
                desc: 'Configure lightweight questions for prospective member applications.',
                done: true,
              },
              {
                step: 4,
                title: 'Recruiter Codes Generation',
                desc: 'Generate distinct codes for your community ambassadors & recruiters.',
                done: true,
              },
              {
                step: 5,
                title: 'Recruiter Benefit Tiers',
                desc: 'Set up automated rewards when recruiters reach milestone recruit counts.',
                done: true,
              },
              {
                step: 6,
                title: 'Interview Mode Selection',
                desc: `Configured as ${interviewMode} (Direct fast-track requires 0 interview overhead).`,
                done: true,
              },
              {
                step: 7,
                title: 'Personal Welcome Direct Message',
                desc: 'Personalized DM dispatched upon server arrival.',
                done: Boolean(personalMsg && enablePersonalDm),
              },
              {
                step: 8,
                title: 'Welcome Channel & Public Greeting',
                desc: welcomeChanId ? `Connected to channel ${welcomeChanId}` : 'Welcome channel not set yet.',
                done: Boolean(welcomeChanId && enableServerWelcome),
              },
              {
                step: 9,
                title: 'Automatic Recruited Role Assignment',
                desc: newMemberRoleId ? `Bound to role ${newMemberRoleId}` : 'New member role ID not set yet.',
                done: Boolean(newMemberRoleId && enableAutoRole),
              },
              {
                step: 10,
                title: 'Safety & Restriction Rules',
                desc: 'Configured blacklist, aliases, and safety triggers for grief protection.',
                done: true,
              },
            ].map((item) => (
              <div
                key={item.step}
                className={`p-4 rounded-lg border flex items-start gap-3 ${
                  item.done ? 'bg-emerald-50/40 border-emerald-200' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    item.done ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700'
                  }`}
                >
                  {item.done ? '✓' : item.step}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                  <div className="text-xs text-slate-600 mt-0.5">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: DISCORD CONNECTION CENTER */}
      {activeTab === 'connection' && (
        <DiscordConnectionCenter communityId={communityId} />
      )}

      {/* TAB 6: UNIFIED INTEGRATION CONNECTION CENTER */}
      {activeTab === 'integrations' && (
        <IntegrationCenter communityId={communityId} />
      )}
    </div>
  );
};
