import React, { useState, useEffect } from 'react';
import {
  Award,
  Copy,
  Check,
  Users,
  Clock,
  CheckCircle,
  Share2,
  TrendingUp,
  Gift,
  Plus,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { RecruiterCodeDocument, ReferralDocument, RewardDocument } from '../../../shared/types/models.js';

interface RecruiterPortalViewProps {
  onBackToAdmin?: () => void;
  communityId: string;
}

export const RecruiterPortalView: React.FC<RecruiterPortalViewProps> = ({
  onBackToAdmin,
  communityId,
}) => {
  const [profile, setProfile] = useState<any>(null);
  const [codes, setCodes] = useState<RecruiterCodeDocument[]>([]);
  const [referrals, setReferrals] = useState<ReferralDocument[]>([]);
  const [rewards, setRewards] = useState<RewardDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [newCodeInput, setNewCodeInput] = useState('');
  const [creatingCode, setCreatingCode] = useState(false);
  const [recruiterPersonaName, setRecruiterPersonaName] = useState('Community Recruiter');

  const fetchRecruiterData = async () => {
    if (!communityId || communityId === 'undefined' || communityId === 'null') {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [recruiterRes, personaRes] = await Promise.all([
        fetch(`/api/v1/recruiters/me?communityId=${communityId}`, {
          headers: {
            'x-user-role': 'RECRUITER',
            'x-role': 'RECRUITER',
            'x-community-id': communityId,
          },
        }),
        fetch(`/api/v1/community/${communityId}/recruiter-identity`, {
          headers: {
            'x-user-role': 'RECRUITER',
            'x-role': 'RECRUITER',
            'x-community-id': communityId,
          },
        }),
      ]);

      if (recruiterRes.ok && recruiterRes.headers.get('content-type')?.includes('application/json')) {
        const json = await recruiterRes.json();
        if (json.success && json.data) {
          setProfile(json.data.profile);
          setCodes(json.data.codes || []);
          setReferrals(json.data.referrals || []);
          setRewards(json.data.rewards || []);
        }
      }

      if (personaRes.ok && personaRes.headers.get('content-type')?.includes('application/json')) {
        const personaJson = await personaRes.json();
        if (personaJson.success && personaJson.data) {
          setRecruiterPersonaName(personaJson.data.recruiterDisplayName || 'Community Recruiter');
        }
      }
    } catch (err) {
      console.error('Failed to load recruiter data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecruiterData();
  }, [communityId]);

  const handleCreateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCodeInput.trim()) return;
    setCreatingCode(true);
    try {
      const res = await fetch('/api/v1/recruiter-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': 'RECRUITER',
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          code: newCodeInput.trim().toUpperCase(),
          communityId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setNewCodeInput('');
        fetchRecruiterData();
      }
    } catch (err) {
      console.error('Failed to create recruiter code', err);
    } finally {
      setCreatingCode(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const totalReferrals = referrals.length;
  const successfulReferrals = referrals.filter((r) => r.status === 'SUCCESSFUL').length;
  const pendingReferrals = referrals.filter((r) => r.status === 'PENDING').length;

  if (!communityId || communityId === 'undefined' || communityId === 'null') {
    return (
      <div id="recruiter-portal-unconfigured" className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500 max-w-lg mx-auto my-12 space-y-4">
        <Lock className="w-10 h-10 mx-auto text-indigo-500" />
        <h3 className="text-lg font-bold text-slate-800">No Connected Community Selected</h3>
        <p className="text-sm text-slate-500">
          You must be associated with a valid, bot-installed community to access the recruiter workspace.
        </p>
        {onBackToAdmin && (
          <button
            onClick={onBackToAdmin}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Go to Community Dashboard
          </button>
        )}
      </div>
    );
  }

  return (
    <div id="recruiter-portal-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
              RECRUITER WORKSPACE
            </span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              COMMUNITY: {communityId}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            My Recruiter Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            Share your unique recruiter code, track applicant referrals, and check reward progress.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onBackToAdmin && (
            <button
              onClick={onBackToAdmin}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Switch Role
            </button>
          )}
          <button
            onClick={fetchRecruiterData}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Recruiter Privacy Notice */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
        <Lock className="h-4 w-4 text-indigo-600 shrink-0" />
        <span>
          <strong>Isolated Recruiter View:</strong> You only see your own referral records, personal codes, and rewards. Private community administration and other recruiters' statistics are restricted.
        </span>
      </div>

      {/* Recruiter Identity & Community Assistant Persona Awareness (Task 1.6) */}
      <div
        id="recruiter-persona-awareness-card"
        className="rounded-xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-white to-white p-4 shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white font-bold text-sm">
              {(profile?.name || 'Recruiter').charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">
                  {profile?.name || 'Verified Community Recruiter'}
                </span>
                <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                  HUMAN RECRUITER (YOU)
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Community Brain Persona:{' '}
                <strong className="text-indigo-900">{recruiterPersonaName}</strong>
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-500 max-w-sm leading-relaxed border-t sm:border-t-0 sm:border-l sm:pl-4 border-slate-200 pt-2 sm:pt-0">
            Automated notifications and candidate greetings are delivered by <strong>{recruiterPersonaName}</strong> on behalf of this server, while all candidate referrals and reward points link directly to your personal codes.
          </div>
        </div>
      </div>

      {/* Referral Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total Referrals
            </span>
            <Users className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{totalReferrals}</div>
          <div className="mt-1 text-xs text-slate-400">Lifetime applicants attributed</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Successful Onboarding
            </span>
            <CheckCircle className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{successfulReferrals}</div>
          <div className="mt-1 text-xs text-emerald-600 font-medium">Joined and verified</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Pending Evaluation
            </span>
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{pendingReferrals}</div>
          <div className="mt-1 text-xs text-slate-400">Applications currently under review</div>
        </div>
      </div>

      {/* Recruiter Code Management */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-slate-900">Your Active Recruiter Codes</h3>
            <p className="text-xs text-slate-500">
              Share these codes with prospective members. When they enter your code during application, referral credit is awarded to you.
            </p>
          </div>

          <form onSubmit={handleCreateCode} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="e.g. VIP-RECRUIT"
              value={newCodeInput}
              onChange={(e) => setNewCodeInput(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono uppercase focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={creatingCode || !newCodeInput.trim()}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {creatingCode ? 'Creating...' : 'Create Code'}
            </button>
          </form>
        </div>

        {codes.length === 0 ? (
          <div className="py-8 text-center text-slate-500">
            <Share2 className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm">No recruiter codes active yet.</p>
            <p className="text-xs text-slate-400">Generate your first code using the form above to begin sharing.</p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {codes.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-slate-900">{c.code}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        c.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {c.isActive ? 'ACTIVE' : 'REVOKED'}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    Uses: {c.totalUses || 0}
                  </div>
                </div>

                <button
                  onClick={() => copyToClipboard(c.code)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-xs hover:bg-slate-100"
                >
                  {copiedCode === c.code ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-slate-500" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Referral History & Reward Progress */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Referral History */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">Referral History</h3>
          <p className="text-xs text-slate-500">Applicants who applied using your recruiter codes.</p>

          {referrals.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              No applicant referrals recorded yet.
            </div>
          ) : (
            <div className="mt-4 divide-y divide-slate-100 text-xs">
              {referrals.map((ref) => (
                <div key={ref.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-800">
                      Applicant: {ref.applicantUserId}
                    </div>
                    <div className="text-slate-400">Code: {ref.recruiterCode}</div>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 font-medium ${
                      ref.status === 'SUCCESSFUL'
                        ? 'bg-emerald-50 text-emerald-700'
                        : ref.status === 'REJECTED'
                        ? 'bg-rose-50 text-rose-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {ref.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reward Progress */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Reward Progress & Tiers</h3>
            <Gift className="h-5 w-5 text-indigo-600" />
          </div>
          <p className="text-xs text-slate-500">Rewards unlocked via successful recruitment milestones.</p>

          <div className="mt-4 space-y-3">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span>Tier 1: Apprentice Recruiter (3 Successful)</span>
                <span>{Math.min(successfulReferrals, 3)} / 3</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-indigo-600 transition-all duration-300"
                  style={{ width: `${Math.min(100, (successfulReferrals / 3) * 100)}%` }}
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span>Tier 2: Master Recruiter (10 Successful)</span>
                <span>{Math.min(successfulReferrals, 10)} / 10</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-indigo-600 transition-all duration-300"
                  style={{ width: `${Math.min(100, (successfulReferrals / 10) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
