import React, { useState } from 'react';
import {
  Layers,
  Database,
  Code2,
  ShieldCheck,
  CheckCircle,
  Play,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { DashboardSection } from '../../types/ui.js';
import { UserRole } from '../../../shared/types/rbac.js';

interface ModuleMetadata {
  title: string;
  description: string;
  firestoreCollections: string[];
  apiEndpoint: string;
  requiredPermission: string;
  futureCapabilities: string[];
}

const MODULE_DATA: Partial<Record<DashboardSection, ModuleMetadata>> = {
  dashboard: {
    title: 'Dashboard Overview',
    description: 'System-wide health, quotas, and service telemetry.',
    firestoreCollections: ['systemSettings'],
    apiEndpoint: '/api/v1/health',
    requiredPermission: 'None (Public to Staff)',
    futureCapabilities: ['Real-time quota monitoring', 'Queue status metrics'],
  },
  applications: {
    title: 'Applications Management',
    description: 'Applicant intake, structured answers, screening scores, and approval workflow.',
    firestoreCollections: ['applications', 'applicationAnswers'],
    apiEndpoint: '/api/v1/applications',
    requiredPermission: 'applications.view, applications.review, applications.approve, applications.reject',
    futureCapabilities: [
      'Multi-stage application review pipeline',
      'AI Assistant answer analysis & score suggestions',
      'Automated Discord onboarding role assignment',
    ],
  },
  recruiters: {
    title: 'Recruiter Operations',
    description: 'Recruiter directory, conversion tracking, performance metrics, and rewards integration.',
    firestoreCollections: ['recruiters', 'referrals'],
    apiEndpoint: '/api/v1/recruiters',
    requiredPermission: 'recruiters.view, recruiters.manage',
    futureCapabilities: [
      'Recruiter conversion leaderboard',
      'Referral relationship mapping',
      'Custom Discord recruiter role sync',
    ],
  },
  'recruiter-codes': {
    title: 'Recruiter Code Manager',
    description: 'Unique referral code generation, tracking, revocation, and use counters.',
    firestoreCollections: ['recruiterCodes', 'referrals'],
    apiEndpoint: '/api/v1/recruiter-codes',
    requiredPermission: 'recruiterCodes.view, recruiterCodes.create, recruiterCodes.revoke',
    futureCapabilities: [
      'Auto-generation of vanity Discord recruiter codes',
      'Usage limits & expiration timestamps',
      'Revocation & audit attribution',
    ],
  },
  interviews: {
    title: 'Interview Scheduling & Analysis',
    description: 'Voice/text interview coordination, sentiment analysis, and interviewer notes.',
    firestoreCollections: ['interviews'],
    apiEndpoint: '/api/v1/interviews',
    requiredPermission: 'interviews.view, interviews.manage',
    futureCapabilities: [
      'Discord voice channel interview scheduling',
      'AI Assistant transcript summary & follow-up questions',
      'Interviewer scoring rubrics',
    ],
  },
  users: {
    title: 'User & Role Directory',
    description: 'Discord user mapping, global roles, and community-specific assignments.',
    firestoreCollections: ['users', 'roles'],
    apiEndpoint: '/api/v1/users',
    requiredPermission: 'users.view, users.manage',
    futureCapabilities: [
      'Discord OAuth token sync and identity verification',
      'Role synchronization between web dashboard & Discord server',
      'User activity history',
    ],
  },
  notifications: {
    title: 'Notification Hub',
    description: 'Multi-channel notification routing (Discord DM, Discord Channel, Web Dashboard).',
    firestoreCollections: ['notifications'],
    apiEndpoint: '/api/v1/notifications',
    requiredPermission: 'notifications.view, notifications.manage',
    futureCapabilities: [
      'Discord DM alert dispatch',
      'Discord channel recruitment announcement webhooks',
      'Read status synchronization',
    ],
  },
  reports: {
    title: 'Reports & Analytics',
    description: 'Recruitment velocity, conversion funnel, interviewer throughput, and CSV/Sheets export.',
    firestoreCollections: ['applications', 'recruiters', 'referrals'],
    apiEndpoint: '/api/v1/reports',
    requiredPermission: 'reports.view, reports.export',
    futureCapabilities: [
      'Automated Google Sheets pipeline sync',
      'Recruitment funnel conversion analytics',
      'Performance audit export',
    ],
  },
  'community-config': {
    title: 'Community Configuration',
    description: 'Discord server rules, guidelines, requirements, mission, and visibility tiers.',
    firestoreCollections: ['communityConfiguration', 'communities'],
    apiEndpoint: '/api/v1/community',
    requiredPermission: 'community.view, community.manage',
    futureCapabilities: [
      'Tiered visibility control (Public, Applicant, Member, Recruiter, Controller, Owner)',
      'Recruitment toggle switch & interview requirements',
      'Discord welcome message customization',
    ],
  },
  permissions: {
    title: 'Permissions & RBAC Controller',
    description: 'Granular permissions matrix, controller overrides, and least-privilege security.',
    firestoreCollections: ['permissions', 'roles'],
    apiEndpoint: '/api/v1/users',
    requiredPermission: 'community.manage',
    futureCapabilities: [
      'Individual CONTROLLER permission assignment (non-admin controllers)',
      'Security audit logging of permission modifications',
      'Custom role creation',
    ],
  },
  rewards: {
    title: 'Rewards & Incentive Engine',
    description: 'Tiered recruiter incentives, point systems, and reward claiming logs.',
    firestoreCollections: ['rewards'],
    apiEndpoint: '/api/v1/rewards',
    requiredPermission: 'rewards.view, rewards.manage',
    futureCapabilities: [
      'Recruitment milestone badge distribution in Discord',
      'Points calculation per converted referral',
      'Claim status tracking',
    ],
  },
  'audit-logs': {
    title: 'Security Audit Logs',
    description: 'Tamper-evident log of administrative actions, role changes, and system settings.',
    firestoreCollections: ['auditLogs'],
    apiEndpoint: '/api/v1/reports',
    requiredPermission: 'auditLogs.view',
    futureCapabilities: [
      'Immutable administrative action records',
      'Sanitized metadata recording (no leaked tokens or secrets)',
      'Actor attribution and IP address capture',
    ],
  },
  settings: {
    title: 'System Settings & Free Mode',
    description: 'Free-mode quotas, rate limits, maintenance flags, and cloud integration keys.',
    firestoreCollections: ['systemSettings'],
    apiEndpoint: '/api/v1/settings',
    requiredPermission: 'settings.view, settings.manage',
    futureCapabilities: [
      'Free mode budget controls (AI requests, sheet writes, application caps)',
      'Discord Bot token and Gateway health diagnostics',
      'Google Sheets spreadsheet ID binding',
    ],
  },
  'applicant-portal': {
    title: 'Applicant Portal',
    description: 'Limited public/candidate interface for submitting and tracking community applications.',
    firestoreCollections: ['applications', 'applicationAnswers'],
    apiEndpoint: '/api/v1/applications',
    requiredPermission: 'APPLICANT Role',
    futureCapabilities: [],
  },
};

interface ModuleFoundationViewProps {
  section: DashboardSection;
  currentRole: UserRole;
}

export const ModuleFoundationView: React.FC<ModuleFoundationViewProps> = ({ section, currentRole }) => {
  const meta = MODULE_DATA[section] || MODULE_DATA.dashboard!;
  const [apiResponse, setApiResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const testApiEndpoint = async () => {
    setLoading(true);
    try {
      const res = await fetch(meta.apiEndpoint);
      const data = await res.json();
      setApiResponse(JSON.stringify(data, null, 2));
    } catch (err) {
      setApiResponse(JSON.stringify({ error: (err as Error).message }, null, 2));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                Architecture Task 1
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                <Clock className="h-3 w-3" />
                Module Foundation Ready
              </span>
            </div>
            <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900">{meta.title}</h1>
            <p className="mt-1 text-sm text-slate-500 max-w-2xl">{meta.description}</p>
          </div>

          <div className="shrink-0">
            <button
              onClick={testApiEndpoint}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition disabled:opacity-50"
              id="btn-test-module-api"
            >
              <Play className="h-3.5 w-3.5" />
              <span>{loading ? 'Querying...' : 'Test Backend Route'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Contract & Schema Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Architectural Contracts */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <Database className="h-5 w-5 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">Firestore Schema & Repository</h2>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Target Collections
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {meta.firestoreCollections.map((col) => (
                  <span
                    key={col}
                    className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-mono font-medium text-slate-700"
                  >
                    /{col}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4">
                Enforced RBAC Permission
              </div>
              <div className="mt-1 rounded-md bg-slate-50 p-2.5 border border-slate-200 text-xs font-mono text-slate-800">
                {meta.requiredPermission}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4">
                Production Data State
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-emerald-700">
                <CheckCircle className="h-4 w-4" />
                <span>Zero Mock Data — Ready for Task 2 Real Database Binding</span>
              </div>
            </div>
          </div>
        </div>

        {/* API Route Contract */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <Code2 className="h-5 w-5 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">API Contract & Versioning</h2>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Target Endpoint
              </div>
              <div className="mt-1 rounded-md bg-slate-900 p-2.5 text-xs font-mono text-emerald-400">
                {meta.apiEndpoint}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4">
                Planned Future Capabilities
              </div>
              <ul className="mt-1 space-y-1 text-xs text-slate-600">
                {meta.futureCapabilities.map((cap, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500"></span>
                    <span>{cap}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Live Endpoint Response Preview */}
      {apiResponse && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Live Express Backend Response ({meta.apiEndpoint})
            </h3>
            <span className="text-[11px] font-mono text-slate-400">RFC 7807 Structured Contract</span>
          </div>
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs font-mono text-emerald-400">
            {apiResponse}
          </pre>
        </div>
      )}
    </div>
  );
};
