import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit,
  Play,
  Pause,
  Archive,
  Check,
  CheckCircle,
  AlertTriangle,
  Info,
  Calendar,
  DollarSign,
  Users,
  Layers,
  Search,
  ArrowRight,
  Link,
  Copy,
  RotateCcw,
  FileText,
  CheckSquare,
  Settings2,
  ArrowLeft,
  AlertOctagon,
} from 'lucide-react';
import { UserRole } from '../../../../shared/types/rbac.js';

interface CampaignWorkspaceViewProps {
  communityId: string;
  currentRole: UserRole;
}

export const CampaignWorkspaceView: React.FC<CampaignWorkspaceViewProps> = ({
  communityId,
  currentRole,
}) => {
  const [activeTab, setActiveTab] = useState<'campaigns' | 'forms' | 'attribution'>('campaigns');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Data list states
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);

  // Selected details
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [campaignDetails, setCampaignDetails] = useState<any | null>(null);

  // Modals / Forms
  const [showCreateCampaign, setShowCreateCampaign] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // New Campaign Form State
  const [campName, setCampName] = useState('');
  const [campDesc, setCampDesc] = useState('');
  const [campGoal, setCampGoal] = useState<'APPLICATIONS' | 'INTERVIEWS' | 'APPROVALS' | 'JOINS' | 'RECRUITMENT_SUCCESS'>('APPLICATIONS');
  const [campSource, setCampSource] = useState('DIRECT');
  const [campFormId, setCampFormId] = useState('');
  const [campRecruiterGroup, setCampRecruiterGroup] = useState('');
  const [campStartAt, setCampStartAt] = useState('');
  const [campEndAt, setCampEndAt] = useState('');
  const [campCost, setCampCost] = useState<number>(0);
  const [campRewardCost, setCampRewardCost] = useState<number>(0);
  const [campBenefitCost, setCampBenefitCost] = useState<number>(0);
  const [campRecruiterRewardCost, setCampRecruiterRewardCost] = useState<number>(0);

  // New Versioned Form Form State
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formVersion, setFormVersion] = useState('1.0');
  const [formQuestions, setFormQuestions] = useState<any[]>([]);

  // Selected Candidate for Correction
  const [selectedAppId, setSelectedAppId] = useState('');
  const [appSource, setAppSource] = useState('DIRECT');
  const [appSourceId, setAppSourceId] = useState('');
  const [appCampaignId, setAppCampaignId] = useState('');
  const [appRecruiterCode, setAppRecruiterCode] = useState('');

  // Link builder
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);

  // Question editing workspace helper
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionType, setNewQuestionType] = useState<'SHORT_TEXT' | 'LONG_TEXT' | 'SINGLE_SELECT' | 'MULTI_SELECT' | 'YES_NO' | 'NUMBER'>('SHORT_TEXT');
  const [newQuestionRequired, setNewQuestionRequired] = useState(true);
  const [newQuestionOptions, setNewQuestionOptions] = useState('');

  // Fetch initial data
  const loadData = async () => {
    setLoading(true);
    try {
      const campRes = await fetch(`/api/v1/communities/${communityId}/recruitment/campaigns`);
      const campData = await campRes.json();
      if (campData.success) setCampaigns(campData.data);

      const formRes = await fetch(`/api/v1/communities/${communityId}/recruitment/forms`);
      const formData = await formRes.json();
      if (formData.success) setForms(formData.data);

      const appRes = await fetch(`/api/v1/communities/${communityId}/applications`);
      const appData = await appRes.json();
      if (appData.success) {
        setApplications(Array.isArray(appData.data) ? appData.data : []);
      }
    } catch (err) {
      console.error(err);
      triggerNotice('error', 'Failed loading workspace configuration');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [communityId]);

  // Fetch Campaign Details
  const fetchCampaignDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/recruitment/campaigns/${id}`);
      const data = await res.json();
      if (data.success) {
        setCampaignDetails(data.data);
      } else {
        triggerNotice('error', 'Failed loading campaign details');
      }
    } catch (err) {
      triggerNotice('error', 'Network error loading campaign analytics');
    }
  };

  useEffect(() => {
    if (selectedCampaignId) {
      fetchCampaignDetails(selectedCampaignId);
    }
  }, [selectedCampaignId]);

  const triggerNotice = (type: 'success' | 'error', message: string) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 4000);
  };

  // Create Campaign
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/recruitment/campaigns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: `ws_${communityId}`,
          name: campName,
          description: campDesc,
          goal: campGoal,
          source: campSource,
          applicationFormId: campFormId,
          recruiterGroup: campRecruiterGroup,
          startAt: campStartAt || new Date().toISOString(),
          endAt: campEndAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'DRAFT',
          campaignCost: campCost || 0,
          rewardCost: campRewardCost || 0,
          benefitCost: campBenefitCost || 0,
          recruiterRewardCost: campRecruiterRewardCost || 0,
        }),
      });
      const data = await res.json();
      if (data.success) {
        triggerNotice('success', 'Recruitment campaign drafted successfully');
        setShowCreateCampaign(false);
        resetCampaignForm();
        loadData();
      } else {
        triggerNotice('error', data.message || 'Failed to create campaign');
      }
    } catch (err) {
      triggerNotice('error', 'Network error creating campaign');
    }
  };

  const resetCampaignForm = () => {
    setCampName('');
    setCampDesc('');
    setCampGoal('APPLICATIONS');
    setCampSource('DIRECT');
    setCampFormId('');
    setCampRecruiterGroup('');
    setCampStartAt('');
    setCampEndAt('');
    setCampCost(0);
    setCampRewardCost(0);
    setCampBenefitCost(0);
    setCampRecruiterRewardCost(0);
  };

  // Change status of campaign
  const handleUpdateStatus = async (id: string, nextStatus: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED') => {
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/recruitment/campaigns/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        triggerNotice('success', `Campaign status changed to ${nextStatus}`);
        if (selectedCampaignId === id) {
          fetchCampaignDetails(id);
        }
        loadData();
      } else {
        triggerNotice('error', data.message || 'Failed updating campaign status');
      }
    } catch (err) {
      triggerNotice('error', 'Network error changing campaign state');
    }
  };

  // Create Versioned Form Draft
  const handleCreateForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName) return;
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/recruitment/forms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          description: formDesc,
          version: formVersion,
          questions: formQuestions,
        }),
      });
      const data = await res.json();
      if (data.success) {
        triggerNotice('success', 'Application form draft created');
        setShowCreateForm(false);
        setFormName('');
        setFormDesc('');
        setFormVersion('1.0');
        setFormQuestions([]);
        loadData();
      } else {
        triggerNotice('error', data.message || 'Failed creating form draft');
      }
    } catch (err) {
      triggerNotice('error', 'Network error creating application form');
    }
  };

  const addQuestionToForm = () => {
    if (!newQuestionText) return;
    const q = {
      id: `q_${Date.now()}`,
      label: newQuestionText,
      type: newQuestionType,
      required: newQuestionRequired,
      options: newQuestionOptions ? newQuestionOptions.split(',').map(s => s.trim()) : [],
      order: formQuestions.length,
    };
    setFormQuestions([...formQuestions, q]);
    setNewQuestionText('');
    setNewQuestionOptions('');
  };

  const removeQuestion = (idx: number) => {
    const updated = [...formQuestions];
    updated.splice(idx, 1);
    setFormQuestions(updated);
  };

  // Publish / Archive Form version
  const handleUpdateFormStatus = async (id: string, nextStatus: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') => {
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/recruitment/forms/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        triggerNotice('success', `Form status updated to ${nextStatus}`);
        loadData();
      } else {
        triggerNotice('error', data.message || 'Failed to update form version status');
      }
    } catch (err) {
      triggerNotice('error', 'Network error changing form state');
    }
  };

  // Correct Attribution
  const handleCorrectAttribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppId) return;
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/recruitment/applications/${selectedAppId}/correct-attribution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: appSource,
          sourceId: appSourceId,
          campaignId: appCampaignId,
          recruiterCode: appRecruiterCode,
        }),
      });
      const data = await res.json();
      if (data.success) {
        triggerNotice('success', 'Candidate source attribution corrected and audited successfully');
        loadData();
        setSelectedAppId('');
      } else {
        triggerNotice('error', data.message || 'Failed correcting attribution');
      }
    } catch (err) {
      triggerNotice('error', 'Network error executing attribution update');
    }
  };

  const handleManualRecordSuccess = async (appId: string) => {
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/recruitment/applications/${appId}/record-success`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        triggerNotice('success', 'Recruitment Success milestone recorded and audited');
        if (selectedCampaignId) {
          fetchCampaignDetails(selectedCampaignId);
        }
        loadData();
      } else {
        triggerNotice('error', data.message || 'Failed recording success conversion');
      }
    } catch (err) {
      triggerNotice('error', 'Network error recording milestone');
    }
  };

  const handleSelectAppToCorrect = (app: any) => {
    setSelectedAppId(app.id);
    setAppSource(app.source || 'DIRECT');
    setAppSourceId(app.sourceId || '');
    setAppCampaignId(app.campaignId || '');
    setAppRecruiterCode(app.recruiterCode || '');
  };

  const generateTrackingLink = (campaignId: string) => {
    const link = `${window.location.origin}/apply?communityId=${communityId}&campaignId=${campaignId}`;
    setGeneratedLink(link);
    setCopied(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 p-6 min-h-screen">
      {/* Title block */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Campaigns & Sourcing</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage your recruitment conversion funnel, versioned application forms, and audited candidate attribution.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData()}
            className="p-2 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 text-slate-600 hover:text-slate-900"
            title="Refresh Data"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          {activeTab === 'campaigns' && !selectedCampaignId && (
            <button
              onClick={() => setShowCreateCampaign(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm"
            >
              <Plus className="h-4 w-4" /> Draft Campaign
            </button>
          )}
          {activeTab === 'forms' && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-sm"
            >
              <Plus className="h-4 w-4" /> Create Form Version
            </button>
          )}
        </div>
      </div>

      {/* Notices */}
      {notice && (
        <div
          className={`mb-6 p-4 rounded-lg flex items-center gap-3 border ${
            notice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {notice.type === 'success' ? (
            <CheckCircle className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertOctagon className="h-5 w-5 text-rose-600 flex-shrink-0" />
          )}
          <span className="text-sm font-medium">{notice.message}</span>
        </div>
      )}

      {/* Main Tabs Selection (No nested cards) */}
      {!selectedCampaignId && (
        <div className="border-b border-slate-200 mb-6 flex gap-6">
          <button
            onClick={() => {
              setActiveTab('campaigns');
              setSelectedCampaignId(null);
            }}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'campaigns'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Active Campaigns
          </button>
          <button
            onClick={() => {
              setActiveTab('forms');
              setSelectedCampaignId(null);
            }}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'forms'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Versioned Screening Forms
          </button>
          <button
            onClick={() => {
              setActiveTab('attribution');
              setSelectedCampaignId(null);
            }}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'attribution'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Manual Attribution Corrector
          </button>
        </div>
      )}

      {/* --- CAMPAIGN DETAILS ANCHOR VIEW --- */}
      {selectedCampaignId && campaignDetails ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                setSelectedCampaignId(null);
                setCampaignDetails(null);
              }}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium text-sm"
            >
              <ArrowLeft className="h-4 w-4" /> Back to campaigns list
            </button>
            <div className="flex items-center gap-2">
              {campaignDetails.campaign.status === 'DRAFT' && (
                <button
                  onClick={() => handleUpdateStatus(campaignDetails.campaign.id, 'ACTIVE')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                >
                  <Play className="h-3 w-3" /> Start Campaign
                </button>
              )}
              {campaignDetails.campaign.status === 'ACTIVE' && (
                <button
                  onClick={() => handleUpdateStatus(campaignDetails.campaign.id, 'PAUSED')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                >
                  <Pause className="h-3 w-3" /> Pause Campaign
                </button>
              )}
              {campaignDetails.campaign.status === 'PAUSED' && (
                <button
                  onClick={() => handleUpdateStatus(campaignDetails.campaign.id, 'ACTIVE')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                >
                  <Play className="h-3 w-3" /> Resume Campaign
                </button>
              )}
              {['ACTIVE', 'PAUSED'].includes(campaignDetails.campaign.status) && (
                <button
                  onClick={() => handleUpdateStatus(campaignDetails.campaign.id, 'COMPLETED')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                >
                  <Check className="h-3 w-3" /> Conclude Campaign
                </button>
              )}
            </div>
          </div>

          {/* Campaign summary card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-slate-900">{campaignDetails.campaign.name}</h2>
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      campaignDetails.campaign.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : campaignDetails.campaign.status === 'PAUSED'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : campaignDetails.campaign.status === 'COMPLETED'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {campaignDetails.campaign.status}
                  </span>
                </div>
                <p className="text-sm text-slate-500 mt-2">{campaignDetails.campaign.description}</p>
                <div className="flex items-center gap-6 mt-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5" /> Target Goal: {campaignDetails.campaign.goal}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> Close Target: {campaignDetails.campaign.endAt ? new Date(campaignDetails.campaign.endAt).toLocaleDateString() : 'None'}
                  </span>
                </div>
              </div>
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-right">
                <span className="text-xs text-slate-400 font-medium block">RECRUITMENT SUCCESS ROI</span>
                <span className="text-2xl font-bold text-slate-900 block mt-1">{campaignDetails.analytics.conversion}</span>
              </div>
            </div>
          </div>

          {/* Alerts */}
          {campaignDetails.analytics.alerts && campaignDetails.analytics.alerts.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-800">Operational Campaign Alerts</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {campaignDetails.analytics.alerts.map((alert: any, idx: number) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border flex gap-3 ${
                      alert.type === 'CRITICAL'
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : alert.type === 'WARNING'
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : 'bg-sky-50 border-sky-200 text-sky-900'
                    }`}
                  >
                    <AlertTriangle
                      className={`h-5 w-5 flex-shrink-0 ${
                        alert.type === 'CRITICAL'
                          ? 'text-rose-600'
                          : alert.type === 'WARNING'
                          ? 'text-amber-600'
                          : 'text-sky-600'
                      }`}
                    />
                    <div>
                      <h4 className="text-sm font-bold">{alert.message}</h4>
                      <p className="text-xs mt-1 text-slate-600">
                        <strong>Evidence:</strong> {alert.evidence}
                      </p>
                      <p className="text-xs mt-1 text-slate-600">
                        <strong>Next Action:</strong> {alert.nextAction}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sourcing links generator */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-2 flex items-center gap-2">
              <Link className="h-4 w-4 text-indigo-500" /> Sourcing URL Generator
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Generate tracked invitation landing page coordinates specifically mapped to this campaign context.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => generateTrackingLink(campaignDetails.campaign.id)}
                className="px-4 py-2 border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg text-xs font-semibold"
              >
                Generate Link
              </button>
              {generatedLink && (
                <div className="flex-1 flex gap-2 items-center">
                  <input
                    type="text"
                    readOnly
                    value={generatedLink}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs font-mono text-slate-700 outline-none"
                  />
                  <button
                    onClick={handleCopy}
                    className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm"
                    title="Copy Link"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Funnel Metrics Row */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm text-center">
              <span className="text-xs text-slate-400 block font-medium">SUBMISSIONS</span>
              <span className="text-2xl font-bold text-slate-900 block mt-1">
                {campaignDetails.analytics.applications}
              </span>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm text-center">
              <span className="text-xs text-slate-400 block font-medium">SCREENED / REVIEWED</span>
              <span className="text-2xl font-bold text-slate-900 block mt-1">
                {campaignDetails.analytics.reviewed}
              </span>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm text-center">
              <span className="text-xs text-slate-400 block font-medium">INTERVIEWS</span>
              <span className="text-2xl font-bold text-slate-900 block mt-1">
                {campaignDetails.analytics.interviews}
              </span>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm text-center">
              <span className="text-xs text-slate-400 block font-medium">APPROVED</span>
              <span className="text-2xl font-bold text-slate-900 block mt-1">
                {campaignDetails.analytics.approved}
              </span>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm text-center">
              <span className="text-xs text-slate-400 block font-medium">DISCORD JOINED</span>
              <span className="text-2xl font-bold text-slate-900 block mt-1">
                {campaignDetails.analytics.joined}
              </span>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm text-center border-l-4 border-l-emerald-500">
              <span className="text-xs text-emerald-600 block font-semibold">RECRUITED</span>
              <span className="text-2xl font-bold text-emerald-700 block mt-1">
                {campaignDetails.analytics.recruitmentSuccess}
              </span>
            </div>
          </div>

          {/* Funnel chart and breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Horizontal Funnel */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Conversion Funnel Visualizer</h3>
              {campaignDetails.analytics.applications === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Insufficient data: submission metrics are not yet registered
                </div>
              ) : (
                <div className="space-y-4">
                  {[
                    { label: 'Applications', count: campaignDetails.analytics.applications },
                    { label: 'Screened', count: campaignDetails.analytics.reviewed },
                    { label: 'Interviews', count: campaignDetails.analytics.interviews },
                    { label: 'Approved', count: campaignDetails.analytics.approved },
                    { label: 'Joined', count: campaignDetails.analytics.joined },
                    { label: 'Recruited', count: campaignDetails.analytics.recruitmentSuccess, color: 'bg-emerald-500' },
                  ].map((step, idx, arr) => {
                    const widthPct = Math.round((step.count / arr[0].count) * 100);
                    return (
                      <div key={idx}>
                        <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                          <span>{step.label}</span>
                          <span>{step.count} ({widthPct}%)</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-3">
                          <div
                            className={`h-3 rounded-full ${step.color || 'bg-indigo-500'}`}
                            style={{ width: `${widthPct}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Campaign ROI & Costs */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Cost & ROI Metrics</h3>
              <div className="space-y-4 text-sm text-slate-600">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs text-slate-400 font-medium">Sourcing Campaign Cost</span>
                    <span className="text-lg font-bold text-slate-800 block mt-1">
                      ${campaignDetails.campaign.campaignCost || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 font-medium">Member Reward Variable</span>
                    <span className="text-lg font-bold text-slate-800 block mt-1">
                      ${campaignDetails.campaign.rewardCost || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 font-medium">Tenant Benefit Variable</span>
                    <span className="text-lg font-bold text-slate-800 block mt-1">
                      ${campaignDetails.campaign.benefitCost || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 font-medium">Recruiter Bonus Variable</span>
                    <span className="text-lg font-bold text-slate-800 block mt-1">
                      ${campaignDetails.campaign.recruiterRewardCost || 0}
                    </span>
                  </div>
                </div>

                <hr className="border-slate-100 my-4" />

                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-lg">
                  <span className="text-xs font-semibold text-slate-500">ACQUISITION COST (ROI)</span>
                  <span className="text-sm font-bold text-slate-900">
                    {campaignDetails.analytics.roi !== 'INSUFFICIENT_DATA'
                      ? `$${campaignDetails.analytics.roi.costPerAcquisition.toFixed(2)} per conversion`
                      : 'INSUFFICIENT_DATA'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Sourcing Attribution breakdowns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h4 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-3">Sources breakdown</h4>
              <div className="space-y-2">
                {Object.entries(campaignDetails.analytics.sources || {}).map(([name, data]: any) => (
                  <div key={name} className="flex justify-between text-xs border-b border-slate-50 pb-2">
                    <span className="font-semibold text-slate-700">{name}</span>
                    <span className="text-slate-500">{data.count} submissions • {data.joined} joined</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h4 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-3">Recruiters performance</h4>
              <div className="space-y-2">
                {Object.entries(campaignDetails.analytics.recruiters || {}).map(([name, data]: any) => (
                  <div key={name} className="flex justify-between text-xs border-b border-slate-50 pb-2">
                    <span className="font-semibold text-slate-700">{name}</span>
                    <span className="text-slate-500">{data.count} submissions • {data.joined} joined</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
              <h4 className="text-xs font-bold text-slate-400 tracking-wider uppercase mb-3">Referral conversion codes</h4>
              <div className="space-y-2">
                {Object.entries(campaignDetails.analytics.referrals || {}).map(([name, data]: any) => (
                  <div key={name} className="flex justify-between text-xs border-b border-slate-50 pb-2">
                    <span className="font-semibold text-slate-700">{name}</span>
                    <span className="text-slate-500">{data.count} submissions • {data.joined} joined</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Action table for manual conversions */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800 mb-4">Candidates Pipeline Conversion Console</h3>
            <p className="text-xs text-slate-500 mb-4">
              Authorized reviewers can manually trigger final recruitment success conversion state changes under this campaign.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase tracking-wider">
                    <th className="p-3">Applicant Name</th>
                    <th className="p-3">Pipeline Status</th>
                    <th className="p-3">Original Source</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applications
                    .filter((a) => a.campaignId === campaignDetails.campaign.id)
                    .map((app) => (
                      <tr key={app.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-semibold text-slate-800">{app.applicantUsername}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border">
                            {app.status}
                          </span>
                        </td>
                        <td className="p-3 font-medium text-slate-500">{app.source || 'DIRECT'}</td>
                        <td className="p-3 text-right">
                          {app.successfulAt ? (
                            <span className="text-emerald-600 font-semibold flex items-center justify-end gap-1">
                              <CheckCircle className="h-3 w-3" /> SUCCESS
                            </span>
                          ) : (
                            <button
                              onClick={() => handleManualRecordSuccess(app.id)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[11px] font-semibold"
                            >
                              Conclude Success
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  {applications.filter((a) => a.campaignId === campaignDetails.campaign.id).length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-slate-400">
                        No candidates found inside this campaign pipeline
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* --- LIST VIEWS BASED ON SELECTED TABS --- */
        <div>
          {/* Active Campaigns Tab */}
          {activeTab === 'campaigns' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {campaigns.map((camp) => (
                <div
                  key={camp.id}
                  className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow transition-all p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-4">
                      <h3 className="font-bold text-slate-800 text-base">{camp.name}</h3>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          camp.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : camp.status === 'PAUSED'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : camp.status === 'COMPLETED'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {camp.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 line-clamp-2">{camp.description}</p>
                    <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-400">
                      <span className="bg-slate-50 px-2 py-1 rounded border border-slate-100">
                        Goal: {camp.goal}
                      </span>
                      <span className="bg-slate-50 px-2 py-1 rounded border border-slate-100">
                        Form: {camp.applicationFormId ? 'Versioned' : 'Global Default'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      Created: {new Date(camp.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() => setSelectedCampaignId(camp.id)}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                    >
                      Workspace & Analytics <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {campaigns.length === 0 && (
                <div className="col-span-full bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
                  <FileText className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                  <span className="text-sm block">No recruitment campaigns configured</span>
                  <span className="text-xs text-slate-400 block mt-1">Draft a campaign to configure recruitment tracking.</span>
                </div>
              )}
            </div>
          )}

          {/* Versioned Forms Tab */}
          {activeTab === 'forms' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {forms.map((form) => (
                <div
                  key={form.id}
                  className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-slate-800 text-base">{form.name}</h3>
                        <span className="text-xs font-medium text-slate-400">Version: {form.version}</span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          form.status === 'PUBLISHED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : form.status === 'ARCHIVED'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {form.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">{form.description}</p>
                    <div className="mt-4 space-y-1">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block">
                        Screening Questions ({form.questions?.length || 0})
                      </span>
                      <div className="max-h-24 overflow-y-auto divide-y divide-slate-50">
                        {form.questions?.map((q: any, i: number) => (
                          <div key={i} className="py-1 text-xs text-slate-600 flex justify-between">
                            <span className="truncate">{q.label}</span>
                            <span className="text-[10px] font-mono text-slate-400">{q.type}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                    {form.status === 'DRAFT' && (
                      <button
                        onClick={() => handleUpdateFormStatus(form.id, 'PUBLISHED')}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold"
                      >
                        Publish version
                      </button>
                    )}
                    {form.status === 'PUBLISHED' && (
                      <button
                        onClick={() => handleUpdateFormStatus(form.id, 'ARCHIVED')}
                        className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-semibold"
                      >
                        Archive version
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {forms.length === 0 && (
                <div className="col-span-full bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
                  <CheckSquare className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                  <span className="text-sm block">No versioned application screening forms drafted</span>
                  <span className="text-xs text-slate-400 block mt-1">Create a form version to add custom questions.</span>
                </div>
              )}
            </div>
          )}

          {/* Attribution Corrector Tab */}
          {activeTab === 'attribution' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Candidates selection */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 mb-4">Applicant Roster & Attribution State</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase tracking-wider">
                        <th className="p-3">Candidate</th>
                        <th className="p-3">Attributed Source</th>
                        <th className="p-3">Tracked Campaign</th>
                        <th className="p-3">Recruiter Code</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {applications.map((app) => (
                        <tr key={app.id} className="hover:bg-slate-50/50">
                          <td className="p-3 font-semibold text-slate-800">{app.applicantUsername}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                              {app.source || 'DIRECT'}
                            </span>
                          </td>
                          <td className="p-3 text-slate-500 truncate max-w-[120px]">
                            {app.campaignId ? campaigns.find((c) => c.id === app.campaignId)?.name || app.campaignId : 'None'}
                          </td>
                          <td className="p-3 text-slate-500">{app.recruiterCode || 'None'}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleSelectAppToCorrect(app)}
                              className="text-indigo-600 hover:text-indigo-800 font-bold"
                            >
                              Edit Source
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Correction workspace panel */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Attribution Workspace</h3>
                <p className="text-xs text-slate-500 mb-4">
                  Correct and override target applicant attributes. Overrides are permanently saved inside the immutable audit logging matrix.
                </p>

                {selectedAppId ? (
                  <form onSubmit={handleCorrectAttribution} className="space-y-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 block mb-1">Source Variable</label>
                      <select
                        value={appSource}
                        onChange={(e) => setAppSource(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500 font-medium text-slate-700"
                      >
                        {['DIRECT', 'REFERRAL', 'RECRUITER_CODE', 'DISCORD_INVITE', 'CAMPAIGN', 'PARTNER', 'COMMUNITY_EVENT', 'MANUAL', 'OTHER'].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 block mb-1">Source ID Tracker</label>
                      <input
                        type="text"
                        value={appSourceId}
                        onChange={(e) => setAppSourceId(e.target.value)}
                        placeholder="e.g. invite_code_12"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 block mb-1">Recruitment Campaign</label>
                      <select
                        value={appCampaignId}
                        onChange={(e) => setAppCampaignId(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500 font-medium text-slate-700"
                      >
                        <option value="">-- No Campaign assigned --</option>
                        {campaigns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-500 block mb-1">Recruiter Code snapshot</label>
                      <input
                        type="text"
                        value={appRecruiterCode}
                        onChange={(e) => setAppRecruiterCode(e.target.value)}
                        placeholder="e.g. ALICE44"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setSelectedAppId('')}
                        className="flex-1 py-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-600"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold"
                      >
                        Save & Audit Overrides
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="py-12 text-center text-xs text-slate-400">
                    Select a candidate application to edit source attribution
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Draft Campaign Modal */}
      {showCreateCampaign && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Create Recruitment Campaign</h2>
            <form onSubmit={handleCreateCampaign} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Campaign Name</label>
                <input
                  type="text"
                  required
                  value={campName}
                  onChange={(e) => setCampName(e.target.value)}
                  placeholder="e.g. Winter Developer Acquisition"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Description</label>
                <textarea
                  value={campDesc}
                  onChange={(e) => setCampDesc(e.target.value)}
                  placeholder="Goals and details about sourcing strategy..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-indigo-500 h-20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">Target Milestone Goal</label>
                  <select
                    value={campGoal}
                    onChange={(e) => setCampGoal(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500 font-medium text-slate-700"
                  >
                    <option value="APPLICATIONS">Applications</option>
                    <option value="INTERVIEWS">Interviews</option>
                    <option value="APPROVALS">Approvals</option>
                    <option value="JOINS">Discord Joins</option>
                    <option value="RECRUITMENT_SUCCESS">Full Success Conversions</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">Sourcing Medium</label>
                  <select
                    value={campSource}
                    onChange={(e) => setCampSource(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500 font-medium text-slate-700"
                  >
                    {['DIRECT', 'REFERRAL', 'RECRUITER_CODE', 'DISCORD_INVITE', 'CAMPAIGN', 'PARTNER', 'COMMUNITY_EVENT'].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">Application form version</label>
                  <select
                    value={campFormId}
                    onChange={(e) => setCampFormId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500 font-medium text-slate-700"
                  >
                    <option value="">-- Use Global Default Form --</option>
                    {forms
                      .filter((f) => f.status === 'PUBLISHED')
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.version})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">Assigned Recruiter Group</label>
                  <input
                    type="text"
                    value={campRecruiterGroup}
                    onChange={(e) => setCampRecruiterGroup(e.target.value)}
                    placeholder="e.g. staff_recruiters"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">Start Date</label>
                  <input
                    type="datetime-local"
                    value={campStartAt}
                    onChange={(e) => setCampStartAt(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500 text-slate-700"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">End Date</label>
                  <input
                    type="datetime-local"
                    value={campEndAt}
                    onChange={(e) => setCampEndAt(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500 text-slate-700"
                  />
                </div>
              </div>

              {/* Cost ROI Matrix fields */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100 space-y-3">
                <span className="text-xs font-bold text-slate-700 block">Cost & Sourcing variables (Acquisition ROI)</span>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Campaign cost ($)</label>
                    <input
                      type="number"
                      value={campCost}
                      onChange={(e) => setCampCost(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Member Referral reward ($)</label>
                    <input
                      type="number"
                      value={campRewardCost}
                      onChange={(e) => setCampRewardCost(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Tenant benefit variable ($)</label>
                    <input
                      type="number"
                      value={campBenefitCost}
                      onChange={(e) => setCampBenefitCost(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Recruiter reward variables ($)</label>
                    <input
                      type="number"
                      value={campRecruiterRewardCost}
                      onChange={(e) => setCampRecruiterRewardCost(Number(e.target.value))}
                      className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateCampaign(false);
                    resetCampaignForm();
                  }}
                  className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold"
                >
                  Draft Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Versioned Form Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Create Application Form Version</h2>
            <form onSubmit={handleCreateForm} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-bold text-slate-500 block mb-1">Form Name</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Developer Intake Form"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 block mb-1">Version tag</label>
                  <input
                    type="text"
                    required
                    value={formVersion}
                    onChange={(e) => setFormVersion(e.target.value)}
                    placeholder="e.g. 1.2"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1">Description / Purpose</label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Candidate instructions..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-indigo-500 h-16"
                />
              </div>

              {/* Screening questions workspace */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-4">
                <span className="text-xs font-bold text-slate-700 block">Form Screening Questions Builder</span>

                {/* Question workspace input */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-[10px] font-semibold text-slate-400 block mb-1">Question Label Text</label>
                      <input
                        type="text"
                        value={newQuestionText}
                        onChange={(e) => setNewQuestionText(e.target.value)}
                        placeholder="e.g. Do you have experience with TypeScript?"
                        className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 block mb-1">Input type</label>
                      <select
                        value={newQuestionType}
                        onChange={(e) => setNewQuestionType(e.target.value as any)}
                        className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs outline-none font-medium text-slate-700"
                      >
                        <option value="SHORT_TEXT">Short Text</option>
                        <option value="LONG_TEXT">Long Text</option>
                        <option value="SINGLE_SELECT">Single Select</option>
                        <option value="MULTI_SELECT">Multi Select</option>
                        <option value="YES_NO">Yes / No answer</option>
                        <option value="NUMBER">Numeric input</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="q-req"
                        checked={newQuestionRequired}
                        onChange={(e) => setNewQuestionRequired(e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                      <label htmlFor="q-req" className="text-[11px] font-semibold text-slate-500">
                        Required Question
                      </label>
                    </div>
                  </div>

                  {['SINGLE_SELECT', 'MULTI_SELECT'].includes(newQuestionType) && (
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 block mb-1">
                        Select options (comma-separated list)
                      </label>
                      <input
                        type="text"
                        value={newQuestionOptions}
                        onChange={(e) => setNewQuestionOptions(e.target.value)}
                        placeholder="e.g. Junior, Mid, Senior"
                        className="w-full bg-white border border-slate-200 rounded p-1.5 text-xs outline-none"
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={addQuestionToForm}
                    className="w-full py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded border border-indigo-100"
                  >
                    Add Question to version list
                  </button>
                </div>

                {/* Added questions list */}
                <div className="space-y-2 max-h-36 overflow-y-auto divide-y divide-slate-100">
                  {formQuestions.map((q, idx) => (
                    <div key={q.id} className="pt-2 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-semibold text-slate-700">
                          {idx + 1}. {q.label}
                        </span>
                        <span className="ml-2 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                          {q.type} {q.required ? '*Required' : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeQuestion(idx)}
                        className="text-rose-500 hover:text-rose-700 font-bold"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  {formQuestions.length === 0 && (
                    <div className="text-center text-slate-400 text-xs py-4">No questions added yet.</div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setFormName('');
                    setFormDesc('');
                    setFormQuestions([]);
                  }}
                  className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formQuestions.length === 0}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold disabled:opacity-55"
                >
                  Save Draft Version
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
