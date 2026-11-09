import React, { useState, useEffect } from 'react';
import { ChannelSelect } from '../../common/DiscordPickers.js';
import {
  Sliders,
  CheckCircle,
  MessageSquare,
  Sparkles,
  ShieldCheck,
  Award,
  Users,
  Edit,
  X,
  Save,
  AlertCircle,
  RefreshCw,
  Clock,
  Radio,
  FileText,
} from 'lucide-react';
import { UserRole } from '../../../../shared/types/rbac.js';

interface CommunityHubViewProps {
  communityId: string;
  currentRole: UserRole;
}

export const CommunityHubView: React.FC<CommunityHubViewProps> = ({
  communityId,
  currentRole,
}) => {
  const [loading, setLoading] = useState(true);
  const [community, setCommunity] = useState<any>(null);
  const [welcomeConfig, setWelcomeConfig] = useState<any>(null);
  const [activeModal, setActiveModal] = useState<
    'IDENTITY' | 'WELCOME' | 'RECRUITMENT_FLOW' | 'RECRUITER_PROGRAM' | 'MEMBERS_ROLES' | null
  >(null);

  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form States
  const [serverName, setServerName] = useState('');
  const [guildId, setGuildId] = useState('');
  const [botNick, setBotNick] = useState('');
  const [botName, setBotName] = useState('');
  useEffect(() => {
    if (!communityId) return;
    fetch(`/api/v1/communities/${encodeURIComponent(communityId)}/toolkit`, { credentials: 'include', headers: { 'x-community-id': communityId } })
      .then((r) => r.json()).then((j) => { setBotNick(j?.data?.resources?.botNickname || ''); setBotName(j?.data?.resources?.botName || ''); }).catch(() => undefined);
  }, [communityId]);

  const [rulesEnabled, setRulesEnabled] = useState(true);
  const [welcomeDmEnabled, setWelcomeDmEnabled] = useState(true);
  const [welcomeChannel, setWelcomeChannel] = useState('#welcome');

  const [interviewMode, setInterviewMode] = useState('OPTIONAL');
  const [cooldownHours, setCooldownHours] = useState('24');

  const [recruiterCodesEnabled, setRecruiterCodesEnabled] = useState(true);
  const [benefitsConfigured, setBenefitsConfigured] = useState(true);
  const [recordMessagesEnabled, setRecordMessagesEnabled] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = {
        'x-role': currentRole,
        'x-user-role': currentRole,
        'x-community-id': communityId,
      };

      const [commRes, welcRes] = await Promise.all([
        fetch(`/api/v1/community/${communityId}`, { headers }),
        fetch(`/api/v1/community/welcome-config?communityId=${communityId}`, { headers }),
      ]);

      if (commRes.ok) {
        const json = await commRes.json();
        if (json.success && json.data) {
          setCommunity(json.data);
          setServerName(json.data.name || `Community ${communityId}`);
          setGuildId(json.data.discordGuildId || json.data.guildId || '');
        }
      }

      if (welcRes.ok) {
        const json = await welcRes.json();
        if (json.success && json.data) {
          setWelcomeConfig(json.data);
          setRulesEnabled(json.data.rulesEnabled !== false);
          setWelcomeDmEnabled(json.data.dmEnabled !== false);
          setWelcomeChannel(json.data.welcomeChannel || '#welcome');
        }
      }
    } catch (err) {
      console.error('Failed to fetch community config', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [communityId, currentRole]);

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      if (activeModal === 'IDENTITY') {
        const res = await fetch(`/api/v1/communities/${encodeURIComponent(communityId)}/toolkit/bot-nickname`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'x-community-id': communityId },
          body: JSON.stringify({ nickname: botNick }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.success === false) throw new Error(j?.error?.message || 'Could not change the bot name.');
        setBotNick(j.data?.nickname || '');
      } else if (activeModal === 'WELCOME') {
        const res = await fetch('/api/v1/community/welcome-config', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-role': currentRole,
            'x-user-role': currentRole,
            'x-community-id': communityId,
          },
          body: JSON.stringify({
            communityId,
            rulesEnabled,
            dmEnabled: welcomeDmEnabled,
            welcomeChannel,
          }),
        });
        if (!res.ok) throw new Error('Failed to update welcome settings.');
      }

      setSavedSuccess('Community operational settings saved successfully.');
      setTimeout(() => setSavedSuccess(null), 3000);
      setActiveModal(null);
      fetchData();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save settings.');
    }
  };

  return (
    <div id="community-hub-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              DISCORD COMMUNITY OPERATIONS
            </span>
            <span className="font-mono text-xs text-slate-400">ID: {communityId}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Community Hub
          </h1>
          <p className="text-sm text-slate-500">
            Centralized settings for server identity, onboarding rules, recruitment flows, and recruiter controls.
          </p>
        </div>

        <button
          onClick={fetchData}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Status
        </button>
      </div>

      {savedSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{savedSuccess}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-800">
          <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Grid of Compact Community Cards */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* CARD 1: COMMUNITY IDENTITY */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
                <Sliders className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Community Identity</h3>
                <p className="text-xs text-slate-500">Discord Guild & Server Details</p>
              </div>
            </div>
            <button
              onClick={() => setActiveModal('IDENTITY')}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <Edit className="h-3.5 w-3.5" />
              Edit
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Server Name:</span>
              <span className="font-bold text-slate-900">{serverName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Bot name here:</span>
              <span className="font-semibold text-slate-900">{botNick || botName || 'Community Manager'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Discord Guild ID:</span>
              <span className="font-mono text-slate-700">{guildId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Gateway Status:</span>
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Connected
              </span>
            </div>
          </div>
        </div>

        {/* CARD 2: WELCOME & RULES */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-purple-50 p-2 text-purple-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Welcome & Rules</h3>
                <p className="text-xs text-slate-500">Onboarding & Rules Acknowledgement</p>
              </div>
            </div>
            <button
              onClick={() => setActiveModal('WELCOME')}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <Edit className="h-3.5 w-3.5" />
              Edit
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Rules Acknowledgement:</span>
              <span className="font-semibold text-emerald-700">{rulesEnabled ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Welcome DMs:</span>
              <span className="font-semibold text-emerald-700">{welcomeDmEnabled ? 'Enabled' : 'Disabled'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Welcome Channel:</span>
              <span className="font-mono text-slate-800">{welcomeChannel}</span>
            </div>
          </div>
        </div>

        {/* CARD 3: RECRUITMENT FLOW */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Recruitment Flow</h3>
                <p className="text-xs text-slate-500">Interviews & Application Safeguards</p>
              </div>
            </div>
            <button
              onClick={() => setActiveModal('RECRUITMENT_FLOW')}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <Edit className="h-3.5 w-3.5" />
              Edit
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Interview Mode:</span>
              <span className="font-semibold text-indigo-700">{interviewMode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Reapplication Cooldown:</span>
              <span className="font-bold text-slate-800">{cooldownHours}h</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">AI Screening Guard:</span>
              <span className="font-semibold text-emerald-600">Active</span>
            </div>
          </div>
        </div>

        {/* CARD 4: RECRUITER PROGRAM */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-amber-50 p-2 text-amber-600">
                <Award className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Recruiter Program</h3>
                <p className="text-xs text-slate-500">Codes, Benefits & Channel Records</p>
              </div>
            </div>
            <button
              onClick={() => setActiveModal('RECRUITER_PROGRAM')}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
            >
              <Edit className="h-3.5 w-3.5" />
              Edit
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Recruiter Codes:</span>
              <span className="font-semibold text-emerald-700">
                {recruiterCodesEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Benefits & Rewards:</span>
              <span className="font-semibold text-emerald-700">
                {benefitsConfigured ? 'Configured' : 'Not Configured'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Record Messages:</span>
              <span className="font-semibold text-emerald-700">
                {recordMessagesEnabled ? 'Enabled (#recruiter-records)' : 'Disabled'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL EDIT DIALOGS */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {activeModal === 'IDENTITY' && 'Bot name in this server'}
                {activeModal === 'WELCOME' && 'Edit Welcome & Rules Settings'}
                {activeModal === 'RECRUITMENT_FLOW' && 'Edit Recruitment Flow Safeguards'}
                {activeModal === 'RECRUITER_PROGRAM' && 'Edit Recruiter Program Settings'}
              </h3>
              <button
                onClick={() => setActiveModal(null)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-4 text-xs">
              {activeModal === 'IDENTITY' && (
                <>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-600">
                    <div className="flex justify-between"><span>Server</span><span className="font-semibold text-slate-900">{serverName}</span></div>
                    <div className="mt-1 flex justify-between"><span>Server ID</span><span className="font-mono">{guildId}</span></div>
                    <p className="mt-2 text-[11px] text-slate-500">These come from Discord and can’t be changed here.</p>
                  </div>
                  <div>
                    <label className="block font-bold uppercase text-slate-700">Bot name in this server</label>
                    <input
                      type="text"
                      maxLength={32}
                      value={botNick}
                      placeholder={botName || 'Community Manager'}
                      onChange={(e) => setBotNick(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">Only changes how the bot is named in <b>this</b> server (its Discord nickname). Other servers and the bot’s own name stay the same. Leave empty to use “{botName || 'Community Manager'}”.</p>
                  </div>
                </>
              )}

              {activeModal === 'WELCOME' && (
                <>
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <div>
                      <div className="font-bold text-slate-900">Rules Acknowledgement</div>
                      <div className="text-[11px] text-slate-500">Require candidates to accept server rules before submitting</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={rulesEnabled}
                      onChange={(e) => setRulesEnabled(e.target.checked)}
                      className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <div>
                      <div className="font-bold text-slate-900">Send Welcome DM</div>
                      <div className="text-[11px] text-slate-500">Dispatch automated Discord DM upon approval</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={welcomeDmEnabled}
                      onChange={(e) => setWelcomeDmEnabled(e.target.checked)}
                      className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold uppercase text-slate-700">Welcome Channel</label>
                    <ChannelSelect valueType="hashName" value={welcomeChannel} onChange={setWelcomeChannel} className="mt-1" />
                  </div>
                </>
              )}

              {activeModal === 'RECRUITMENT_FLOW' && (
                <>
                  <div>
                    <label className="block font-bold uppercase text-slate-700">Interview Requirement</label>
                    <select
                      value={interviewMode}
                      onChange={(e) => setInterviewMode(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                    >
                      <option value="OPTIONAL">Optional (Reviewer Discretion)</option>
                      <option value="REQUIRED">Mandatory For All Candidates</option>
                      <option value="DISABLED">Disabled (Auto-Approve Eligible)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold uppercase text-slate-700">Reapplication Cooldown (Hours)</label>
                    <input
                      type="number"
                      value={cooldownHours}
                      onChange={(e) => setCooldownHours(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm"
                    />
                  </div>
                </>
              )}

              {activeModal === 'RECRUITER_PROGRAM' && (
                <>
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="font-bold text-slate-900">Enable Recruiter Codes</span>
                    <input
                      type="checkbox"
                      checked={recruiterCodesEnabled}
                      onChange={(e) => setRecruiterCodesEnabled(e.target.checked)}
                      className="h-4 w-4 rounded text-indigo-600"
                    />
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="font-bold text-slate-900">Announce Recruiter Record Messages</span>
                    <input
                      type="checkbox"
                      checked={recordMessagesEnabled}
                      onChange={(e) => setRecordMessagesEnabled(e.target.checked)}
                      className="h-4 w-4 rounded text-indigo-600"
                    />
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="rounded-lg border border-slate-300 px-3.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-1.5 font-bold text-white shadow-xs hover:bg-indigo-700"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
