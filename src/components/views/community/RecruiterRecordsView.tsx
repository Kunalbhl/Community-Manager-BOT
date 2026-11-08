import React, { useState, useEffect } from 'react';
import { ChannelSelect } from '../../common/DiscordPickers.js';
import {
  Award,
  CheckCircle2,
  Clock,
  Send,
  RefreshCw,
  FileSpreadsheet,
  AlertCircle,
  Eye,
  Settings,
  UserCheck,
  TrendingUp,
  FileText,
  Search,
  Check,
  X,
  MessageSquare,
  Shield,
  HelpCircle,
} from 'lucide-react';
import {
  RecruiterRecordDocument,
  RecruiterRecordConfiguration,
  RecruiterBenefitStatus,
  MessageUpdateMode,
  DEFAULT_INITIAL_TEMPLATE,
  DEFAULT_CLAIMED_TEMPLATE,
  SUPPORTED_TEMPLATE_VARIABLES,
} from '../../../../shared/types/models.js';

interface RecruiterRecordsViewProps {
  communityId: string;
}

export function RecruiterRecordsView({ communityId }: RecruiterRecordsViewProps) {
  const [activeTab, setActiveTab] = useState<'records' | 'pending' | 'config' | 'reports'>('records');

  // State
  const [records, setRecords] = useState<RecruiterRecordDocument[]>([]);
  const [config, setConfig] = useState<RecruiterRecordConfiguration | null>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [codeReports, setCodeReports] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncingSheets, setSyncingSheets] = useState<boolean>(false);
  const [sheetSyncStatus, setSheetSyncStatus] = useState<string>('idle');

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Claim modal / inline form state
  const [selectedRecord, setSelectedRecord] = useState<RecruiterRecordDocument | null>(null);
  const [claimReference, setClaimReference] = useState<string>('');
  const [claiming, setClaiming] = useState<boolean>(false);

  // Detail Modal
  const [detailRecord, setDetailRecord] = useState<RecruiterRecordDocument | null>(null);

  // Config Form State
  const [configEnabled, setConfigEnabled] = useState<boolean>(false);
  const [configChannelId, setConfigChannelId] = useState<string>('');
  const [initialTemplate, setInitialTemplate] = useState<string>(DEFAULT_INITIAL_TEMPLATE);
  const [claimedTemplate, setClaimedTemplate] = useState<string>(DEFAULT_CLAIMED_TEMPLATE);
  const [updateMode, setUpdateMode] = useState<MessageUpdateMode>('SEND_FOLLOW_UP_MESSAGE');
  const [savingConfig, setSavingConfig] = useState<boolean>(false);

  // Test Message State
  const [testPreview, setTestPreview] = useState<string>('');
  const [testValidation, setTestValidation] = useState<{ valid: boolean; unsupportedVariables: string[] } | null>(null);

  // Attributed Applicants State
  const [selectedRecruiterForAttribution, setSelectedRecruiterForAttribution] = useState<string>('');
  const [attributedApplicants, setAttributedApplicants] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, [communityId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Recruiter Records
      const recordsRes = await fetch(`/api/v1/recruiter-records?communityId=${communityId}`);
      if (recordsRes.ok) {
        const data = await recordsRes.json();
        setRecords(data.data || []);
      }

      // Fetch Config
      const configRes = await fetch(`/api/v1/community/recruiter-record-config?communityId=${communityId}`);
      if (configRes.ok) {
        const data = await configRes.json();
        if (data.data) {
          setConfig(data.data);
          setConfigEnabled(data.data.enabled ?? false);
          setConfigChannelId(data.data.channelId || '');
          setInitialTemplate(data.data.initialMessageTemplate || DEFAULT_INITIAL_TEMPLATE);
          setClaimedTemplate(data.data.claimedMessageTemplate || DEFAULT_CLAIMED_TEMPLATE);
          setUpdateMode(data.data.messageUpdateMode || 'SEND_FOLLOW_UP_MESSAGE');
        }
      }

      // Fetch Reports
      const reportRes = await fetch(`/api/v1/community/recruiter-record-report?communityId=${communityId}`);
      if (reportRes.ok) {
        const data = await reportRes.json();
        setReports(data.data || []);
      }

      const codeReportRes = await fetch(`/api/v1/community/recruiter-code-report?communityId=${communityId}`);
      if (codeReportRes.ok) {
        const data = await codeReportRes.json();
        setCodeReports(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching recruiter record data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleClaimBenefit = async (recordId: string, actionType: 'CLAIMED' | 'FULFILLED') => {
    setClaiming(true);
    try {
      const endpoint = actionType === 'CLAIMED' ? 'claim-benefit' : 'fulfill-benefit';
      const res = await fetch(`/api/v1/recruiter-records/${recordId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          claimReference,
        }),
      });

      if (res.ok) {
        setSelectedRecord(null);
        setClaimReference('');
        await fetchData();
      } else {
        const err = await res.json();
        alert(`Failed to ${actionType.toLowerCase()} benefit: ${err.message || 'Unknown error'}`);
      }
    } catch (err) {
      alert(`Error claiming benefit: ${(err as Error).message}`);
    } finally {
      setClaiming(false);
    }
  };

  const handleRetryMessage = async (recordId: string) => {
    try {
      const res = await fetch(`/api/v1/recruiter-records/${recordId}/retry-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      if (res.ok) {
        alert('Message retry triggered successfully.');
        await fetchData();
      } else {
        const err = await res.json();
        alert(`Failed to retry message: ${err.message}`);
      }
    } catch (err) {
      alert(`Retry error: ${(err as Error).message}`);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await fetch('/api/v1/community/recruiter-record-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          enabled: configEnabled,
          channelId: configChannelId,
          initialMessageTemplate: initialTemplate,
          claimedMessageTemplate: claimedTemplate,
          messageUpdateMode: updateMode,
        }),
      });

      if (res.ok) {
        alert('Recruiter Record Configuration updated.');
        await fetchData();
      } else {
        const err = await res.json();
        alert(`Error updating config: ${err.message}`);
      }
    } catch (err) {
      alert(`Save error: ${(err as Error).message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestTemplate = async (templateStr: string) => {
    try {
      const res = await fetch('/api/v1/community/recruiter-record-config/test-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: templateStr }),
      });
      if (res.ok) {
        const data = await res.json();
        setTestPreview(data.preview);
        setTestValidation(data.validation);
      }
    } catch (err) {
      console.error('Test message preview error:', err);
    }
  };

  const handleSyncSheets = async () => {
    setSyncingSheets(true);
    setSheetSyncStatus('Syncing...');
    try {
      const res = await fetch('/api/v1/community/recruiter-records/sync-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'NOT_CONFIGURED') {
          setSheetSyncStatus('Not Configured');
          alert('Google Sheets integration is not configured or disabled for this community.');
        } else {
          setSheetSyncStatus('Synced');
          alert(`Successfully synced ${data.syncedCount} recruiter records to Google Sheets!`);
        }
      }
    } catch (err) {
      setSheetSyncStatus('Failed');
      alert(`Sheets sync error: ${(err as Error).message}`);
    } finally {
      setSyncingSheets(false);
    }
  };

  const handleFetchAttributedApplicants = async (identifier: string) => {
    setSelectedRecruiterForAttribution(identifier);
    try {
      const res = await fetch(`/api/v1/recruiter-records/recruiter/${identifier}?communityId=${communityId}`);
      if (res.ok) {
        const data = await res.json();
        setAttributedApplicants(data.attributedApplicants || []);
      }
    } catch (err) {
      console.error('Error fetching attributed applicants:', err);
    }
  };

  // Filtered records
  const filteredRecords = records.filter((rec) => {
    const matchesSearch =
      rec.recruiterUsernameSnapshot.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.applicantUsernameSnapshot.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.recruiterCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.applicationId.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'ALL' || rec.benefitStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const pendingRecords = records.filter((r) => r.benefitStatus === 'PENDING');
  const fulfilledRecords = records.filter((r) => r.benefitStatus === 'CLAIMED' || r.benefitStatus === 'FULFILLED');

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-stone-900 border border-stone-800 rounded-xl p-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-stone-100">Recruiter Records & Benefit Claim Lifecycle</h1>
              <p className="text-sm text-stone-400">
                Authoritative record creation, channel messages, benefit claims, and Google Sheets sync
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncSheets}
            disabled={syncingSheets}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 transition"
          >
            <FileSpreadsheet className={`w-4 h-4 text-emerald-400 ${syncingSheets ? 'animate-spin' : ''}`} />
            <span>Sync Google Sheets</span>
          </button>

          <button
            onClick={fetchData}
            className="p-2 text-stone-400 hover:text-stone-200 bg-stone-800 border border-stone-700 rounded-lg transition"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary KPI Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-stone-900/60 border border-stone-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between text-stone-400 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Total Recruiter Records</span>
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-stone-100">{records.length}</div>
          <div className="text-xs text-stone-500 mt-1">Authoritative joined member records</div>
        </div>

        <div className="bg-stone-900/60 border border-stone-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between text-stone-400 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Benefits Pending</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400">{pendingRecords.length}</div>
          <div className="text-xs text-stone-500 mt-1">Awaiting admin claim/fulfillment</div>
        </div>

        <div className="bg-stone-900/60 border border-stone-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between text-stone-400 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Benefits Fulfilled</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">{fulfilledRecords.length}</div>
          <div className="text-xs text-stone-500 mt-1">Claimed or granted to recruiters</div>
        </div>

        <div className="bg-stone-900/60 border border-stone-800/80 rounded-xl p-4">
          <div className="flex items-center justify-between text-stone-400 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Record Channel</span>
            <MessageSquare className="w-4 h-4 text-sky-400" />
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                configEnabled ? 'bg-emerald-400' : 'bg-stone-600'
              }`}
            />
            <span className="text-base font-semibold text-stone-200">
              {configEnabled ? 'Active' : 'Disabled'}
            </span>
          </div>
          <div className="text-xs text-stone-500 mt-1">
            {configChannelId ? `Channel: ${configChannelId}` : 'Channel unassigned'}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-stone-800 flex gap-2">
        <button
          onClick={() => setActiveTab('records')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
            activeTab === 'records'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>All Recruiter Records ({records.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
            activeTab === 'pending'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Pending Benefit Claims ({pendingRecords.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('config')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
            activeTab === 'config'
              ? 'border-sky-500 text-sky-400'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Record Channel & Templates</span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
            activeTab === 'reports'
              ? 'border-purple-500 text-purple-400'
              : 'border-transparent text-stone-400 hover:text-stone-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Performance & Attribution Reports</span>
        </button>
      </div>

      {/* TAB 1: ALL RECRUITER RECORDS */}
      {activeTab === 'records' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-stone-900/40 p-4 rounded-xl border border-stone-800">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-3 text-stone-500" />
              <input
                type="text"
                placeholder="Search recruiter, applicant, code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-stone-900 border border-stone-700 rounded-lg pl-9 pr-4 py-2 text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="ALL">All Benefit Statuses</option>
                <option value="PENDING">Pending</option>
                <option value="CLAIMED">Claimed</option>
                <option value="FULFILLED">Fulfilled</option>
                <option value="NOT_REQUIRED">Not Required</option>
              </select>
            </div>
          </div>

          <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-stone-300">
                <thead className="bg-stone-950 text-stone-400 text-xs uppercase tracking-wider border-b border-stone-800">
                  <tr>
                    <th className="py-3.5 px-4 font-semibold">Record ID / Time</th>
                    <th className="py-3.5 px-4 font-semibold">Recruiter / Code</th>
                    <th className="py-3.5 px-4 font-semibold">Applicant</th>
                    <th className="py-3.5 px-4 font-semibold">Planned Benefit</th>
                    <th className="py-3.5 px-4 font-semibold">Benefit Status</th>
                    <th className="py-3.5 px-4 font-semibold">Message</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-stone-500">
                        No recruiter records found.
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((record) => (
                      <tr key={record.id} className="hover:bg-stone-800/40 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-mono text-xs text-stone-300">{record.id}</div>
                          <div className="text-xs text-stone-500">
                            {new Date(record.createdAt).toLocaleString()}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-medium text-stone-200">
                            {record.recruiterDisplayNameSnapshot || record.recruiterUsernameSnapshot}
                          </div>
                          <div className="text-xs font-mono text-emerald-400">
                            Code: {record.recruiterCode}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-medium text-stone-200">
                            {record.applicantDisplayNameSnapshot || record.applicantUsernameSnapshot}
                          </div>
                          <div className="text-xs text-stone-500">App: {record.applicationId}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="text-stone-200 font-medium">{record.plannedBenefit}</div>
                          <div className="text-xs text-stone-500">Count: {record.plannedBenefitCount}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                              record.benefitStatus === 'PENDING'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                : record.benefitStatus === 'CLAIMED' || record.benefitStatus === 'FULFILLED'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-stone-800 text-stone-400 border-stone-700'
                            }`}
                          >
                            {record.benefitStatus}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`text-xs font-mono px-2 py-0.5 rounded ${
                              record.messageStatus === 'SENT'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : record.messageStatus === 'FAILED'
                                ? 'bg-rose-500/10 text-rose-400'
                                : 'bg-stone-800 text-stone-400'
                            }`}
                          >
                            {record.messageStatus}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setDetailRecord(record)}
                              className="p-1.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded transition"
                              title="View Record Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {record.benefitStatus === 'PENDING' && (
                              <button
                                onClick={() => setSelectedRecord(record)}
                                className="px-2.5 py-1 text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded transition"
                              >
                                Claim Benefit
                              </button>
                            )}

                            {record.messageStatus === 'FAILED' && (
                              <button
                                onClick={() => handleRetryMessage(record.id)}
                                className="px-2.5 py-1 text-xs font-medium bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded transition"
                              >
                                Retry Msg
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PENDING BENEFIT CLAIMS */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3 text-amber-300 text-sm">
            <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-200">Pending Benefit Claims Queue</div>
              <div>
                When a recruiter earns a milestone perk or custom community benefit upon successful member join, it enters
                PENDING status. Review and claim or fulfill benefits below.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingRecords.length === 0 ? (
              <div className="col-span-full bg-stone-900 border border-stone-800 rounded-xl p-8 text-center text-stone-500">
                No pending benefit claims at this time! All recruiter rewards are up to date.
              </div>
            ) : (
              pendingRecords.map((record) => (
                <div key={record.id} className="bg-stone-900 border border-stone-800 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                    <div>
                      <div className="text-xs text-stone-500 font-mono">Record: {record.id}</div>
                      <div className="font-semibold text-stone-200 text-base">
                        {record.recruiterDisplayNameSnapshot || record.recruiterUsernameSnapshot}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 text-xs font-semibold rounded-full border border-amber-500/20">
                      Code: {record.recruiterCode}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-stone-300">
                    <div className="flex justify-between">
                      <span className="text-stone-500">Attributed Applicant:</span>
                      <span className="font-medium text-stone-200">{record.applicantUsernameSnapshot}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Earned Benefit:</span>
                      <span className="font-semibold text-emerald-400">{record.plannedBenefit}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-stone-500">Joined At:</span>
                      <span>{new Date(record.createdAt).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-stone-800 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setSelectedRecord(record)}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition"
                    >
                      Process & Claim Benefit
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: RECORD CHANNEL & MESSAGES CONFIG */}
      {activeTab === 'config' && (
        <div className="bg-stone-900 border border-stone-800 rounded-xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-stone-800 pb-4">
            <div>
              <h2 className="text-lg font-bold text-stone-100">Recruiter Record Channel Integration</h2>
              <p className="text-xs text-stone-400">
                Configure Discord channel dispatching, message templates, and follow-up modes.
              </p>
            </div>
            <button
              onClick={handleSaveConfig}
              disabled={savingConfig}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-lg transition flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>{savingConfig ? 'Saving...' : 'Save Configuration'}</span>
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="cfgEnabled"
                checked={configEnabled}
                onChange={(e) => setConfigEnabled(e.target.checked)}
                className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
              />
              <label htmlFor="cfgEnabled" className="text-sm font-semibold text-stone-200 cursor-pointer">
                Enable Recruiter Record Channel Message Dispatch
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
                  Target Discord Channel ID
                </label>
                <ChannelSelect value={configChannelId} onChange={setConfigChannelId} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
                  Follow-Up Message Update Mode
                </label>
                <select
                  value={updateMode}
                  onChange={(e) => setUpdateMode(e.target.value as MessageUpdateMode)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3.5 py-2 text-sm text-stone-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="SEND_FOLLOW_UP_MESSAGE">Send New Follow-Up Message in Channel</option>
                  <option value="EDIT_OR_UPDATE_ORIGINAL_MESSAGE">Edit/Update Original Record Message</option>
                </select>
              </div>
            </div>

            {/* Template Editors */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
              {/* Initial Message Template */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
                    Initial Record Message Template
                  </label>
                  <button
                    onClick={() => handleTestTemplate(initialTemplate)}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                  >
                    Preview Render
                  </button>
                </div>
                <textarea
                  rows={10}
                  value={initialTemplate}
                  onChange={(e) => setInitialTemplate(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-lg p-3 text-xs text-stone-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Claimed Message Template */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
                    Claimed / Fulfilled Follow-Up Template
                  </label>
                  <button
                    onClick={() => handleTestTemplate(claimedTemplate)}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                  >
                    Preview Render
                  </button>
                </div>
                <textarea
                  rows={10}
                  value={claimedTemplate}
                  onChange={(e) => setClaimedTemplate(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-700 rounded-lg p-3 text-xs text-stone-200 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Supported Variables Reference & Live Preview Box */}
            <div className="bg-stone-950 border border-stone-800 rounded-xl p-4 space-y-3">
              <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
                Supported Template Variables Reference
              </div>
              <div className="flex flex-wrap gap-2">
                {SUPPORTED_TEMPLATE_VARIABLES.map((v) => (
                  <span
                    key={v}
                    className="px-2 py-1 bg-stone-900 border border-stone-800 rounded text-xs font-mono text-emerald-400"
                  >
                    {v}
                  </span>
                ))}
              </div>

              {testPreview && (
                <div className="pt-3 border-t border-stone-800 space-y-2">
                  <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider">
                    Interactive Live Template Preview
                  </div>
                  {testValidation && !testValidation.valid && (
                    <div className="text-xs text-amber-400 bg-amber-500/10 p-2 rounded border border-amber-500/20">
                      Unsupported variables detected: {testValidation.unsupportedVariables.join(', ')}
                    </div>
                  )}
                  <pre className="bg-stone-900 p-3 rounded-lg text-xs text-stone-200 font-mono whitespace-pre-wrap">
                    {testPreview}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: REPORTS */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="bg-stone-900 border border-stone-800 rounded-xl p-5 space-y-4">
            <h2 className="text-base font-bold text-stone-100 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-400" />
              <span>Recruiter Aggregated Performance Report</span>
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-stone-300">
                <thead className="bg-stone-950 text-stone-400 uppercase border-b border-stone-800">
                  <tr>
                    <th className="py-3 px-3">Recruiter</th>
                    <th className="py-3 px-3">Recruiter Code</th>
                    <th className="py-3 px-3 text-center">Invited</th>
                    <th className="py-3 px-3 text-center">Submitted</th>
                    <th className="py-3 px-3 text-center">Approved</th>
                    <th className="py-3 px-3 text-center">Joined</th>
                    <th className="py-3 px-3 text-center">Success Rate</th>
                    <th className="py-3 px-3 text-center">Benefits (Earned / Pending / Fulfilled)</th>
                    <th className="py-3 px-3 text-right">Drilldown</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800">
                  {reports.map((r) => (
                    <tr key={r.recruiterDiscordUserId} className="hover:bg-stone-800/40">
                      <td className="py-3 px-3 font-medium text-stone-200">{r.recruiterName}</td>
                      <td className="py-3 px-3 font-mono text-emerald-400">{r.recruiterCode}</td>
                      <td className="py-3 px-3 text-center">{r.totalInvited}</td>
                      <td className="py-3 px-3 text-center">{r.applicationsSubmitted}</td>
                      <td className="py-3 px-3 text-center">{r.approved}</td>
                      <td className="py-3 px-3 text-center font-bold text-emerald-400">{r.joined}</td>
                      <td className="py-3 px-3 text-center font-mono text-purple-400">{r.successRate}</td>
                      <td className="py-3 px-3 text-center">
                        <span className="text-emerald-400 font-bold">{r.benefitsEarned}</span> /{' '}
                        <span className="text-amber-400">{r.benefitsPending}</span> /{' '}
                        <span className="text-sky-400">{r.benefitsFulfilled}</span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleFetchAttributedApplicants(r.recruiterDiscordUserId)}
                          className="px-2 py-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded text-xs transition"
                        >
                          View Applicants
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Attributed Applicants Inspector */}
          {selectedRecruiterForAttribution && (
            <div className="bg-stone-900 border border-purple-500/30 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                <h3 className="text-sm font-bold text-purple-300">
                  Attributed Applicants for Recruiter: {selectedRecruiterForAttribution}
                </h3>
                <button
                  onClick={() => setSelectedRecruiterForAttribution('')}
                  className="p-1 text-stone-400 hover:text-stone-200 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-stone-300">
                  <thead className="bg-stone-950 text-stone-400 uppercase border-b border-stone-800">
                    <tr>
                      <th className="py-2.5 px-3">Applicant Username</th>
                      <th className="py-2.5 px-3">Application ID</th>
                      <th className="py-2.5 px-3">Lifecycle Status</th>
                      <th className="py-2.5 px-3">Applied At</th>
                      <th className="py-2.5 px-3">Joined At</th>
                      <th className="py-2.5 px-3">Benefit</th>
                      <th className="py-2.5 px-3">Benefit Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-800">
                    {attributedApplicants.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-4 text-center text-stone-500">
                          No attributed applicants found for this recruiter.
                        </td>
                      </tr>
                    ) : (
                      attributedApplicants.map((app) => (
                        <tr key={app.referralId || app.applicationId}>
                          <td className="py-2.5 px-3 font-medium text-stone-200">{app.applicantUsername}</td>
                          <td className="py-2.5 px-3 font-mono text-stone-400">{app.applicationId}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded text-xs bg-stone-800 text-stone-300 font-mono">
                              {app.lifecycleStatus}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-stone-400">{new Date(app.appliedAt).toLocaleDateString()}</td>
                          <td className="py-2.5 px-3 text-stone-400">
                            {app.joinedAt ? new Date(app.joinedAt).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="py-2.5 px-3 text-emerald-400">{app.benefit}</td>
                          <td className="py-2.5 px-3">{app.benefitStatus}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Claim Benefit Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="text-lg font-bold text-stone-100">Claim / Fulfill Recruiter Benefit</h3>
              <button onClick={() => setSelectedRecord(null)} className="text-stone-400 hover:text-stone-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-stone-300">
              <div>
                <span className="text-stone-500">Record ID:</span>{' '}
                <span className="font-mono text-stone-200">{selectedRecord.id}</span>
              </div>
              <div>
                <span className="text-stone-500">Recruiter:</span>{' '}
                <span className="font-semibold text-stone-200">{selectedRecord.recruiterUsernameSnapshot}</span>
              </div>
              <div>
                <span className="text-stone-500">Planned Benefit:</span>{' '}
                <span className="font-semibold text-emerald-400">{selectedRecord.plannedBenefit}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1.5">
                Claim Reference / Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Granted Discord VIP Role / Sent Promo Code #88"
                value={claimReference}
                onChange={(e) => setClaimReference(e.target.value)}
                className="w-full bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="pt-3 border-t border-stone-800 flex items-center justify-end gap-3">
              <button
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2 text-xs font-medium text-stone-400 hover:text-stone-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleClaimBenefit(selectedRecord.id, 'CLAIMED')}
                disabled={claiming}
                className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition"
              >
                {claiming ? 'Processing...' : 'Mark as Claimed'}
              </button>
              <button
                onClick={() => handleClaimBenefit(selectedRecord.id, 'FULFILLED')}
                disabled={claiming}
                className="px-4 py-2 text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition"
              >
                {claiming ? 'Processing...' : 'Mark as Fulfilled'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Detail Modal */}
      {detailRecord && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-800 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="text-lg font-bold text-stone-100">Recruiter Record Details</h3>
              <button onClick={() => setDetailRecord(null)} className="text-stone-400 hover:text-stone-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-stone-300">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-stone-500 block">Record ID:</span>
                  <span className="font-mono text-stone-200">{detailRecord.id}</span>
                </div>
                <div>
                  <span className="text-stone-500 block">Community ID:</span>
                  <span className="font-mono text-stone-200">{detailRecord.communityId}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-800">
                <div>
                  <span className="text-stone-500 block">Recruiter User ID:</span>
                  <span className="font-mono text-stone-200">{detailRecord.recruiterDiscordUserId}</span>
                </div>
                <div>
                  <span className="text-stone-500 block">Recruiter Code:</span>
                  <span className="font-mono text-emerald-400">{detailRecord.recruiterCode}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-800">
                <div>
                  <span className="text-stone-500 block">Applicant User ID:</span>
                  <span className="font-mono text-stone-200">{detailRecord.applicantDiscordUserId}</span>
                </div>
                <div>
                  <span className="text-stone-500 block">Application ID:</span>
                  <span className="font-mono text-stone-200">{detailRecord.applicationId}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-800">
                <div>
                  <span className="text-stone-500 block">Planned Benefit:</span>
                  <span className="font-semibold text-emerald-400">{detailRecord.plannedBenefit}</span>
                </div>
                <div>
                  <span className="text-stone-500 block">Benefit Status:</span>
                  <span className="font-semibold text-amber-400">{detailRecord.benefitStatus}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-800">
                <div>
                  <span className="text-stone-500 block">Message Status:</span>
                  <span className="font-mono text-stone-200">{detailRecord.messageStatus}</span>
                </div>
                <div>
                  <span className="text-stone-500 block">Initial Msg ID:</span>
                  <span className="font-mono text-stone-400">{detailRecord.initialRecordMessageId || 'N/A'}</span>
                </div>
              </div>

              {detailRecord.benefitClaimedAt && (
                <div className="pt-2 border-t border-stone-800">
                  <span className="text-stone-500 block">Claimed By / At:</span>
                  <span className="text-stone-200">
                    {detailRecord.benefitClaimedByUsernameSnapshot} on{' '}
                    {new Date(detailRecord.benefitClaimedAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-stone-800 flex justify-end">
              <button
                onClick={() => setDetailRecord(null)}
                className="px-4 py-2 text-xs font-semibold bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
