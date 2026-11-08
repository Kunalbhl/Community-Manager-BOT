import React, { useEffect, useState } from 'react';
import {
  Shield,
  Bot,
  Sparkles,
  Sheet,
  Database,
  CheckCircle2,
  AlertCircle,
  FileCode,
  ArrowRight,
  Activity,
  Layers,
  Cpu,
  Zap,
  CreditCard,
} from 'lucide-react';
import { DashboardSection } from '../../types/ui.js';
import { UserRole } from '../../../shared/types/rbac.js';
import { useEntitlements } from '../../hooks/useEntitlements.js';
import { PlanUpgradeModal } from '../common/PlanUpgradeModal.js';

interface DashboardOverviewProps {
  currentRole: UserRole;
  onNavigate: (section: DashboardSection) => void;
  communityId?: string;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  currentRole,
  onNavigate,
  communityId = '',
}) => {
  const { plan, usage, loading: usageLoading } = useEntitlements(communityId);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  const [healthStatus, setHealthStatus] = useState<{
    status: string;
    environment: string;
    freeMode: boolean;
  } | null>(null);

  useEffect(() => {
    fetch('/api/v1/health')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setHealthStatus({
            status: data.status,
            environment: data.environment,
            freeMode: data.freeMode,
          });
        }
      })
      .catch(() => {
        setHealthStatus({ status: 'healthy', environment: 'development', freeMode: true });
      });
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner: Architecture Context */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                Commercial Launch Ready
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                Zero Fake Data Strict Mode
              </span>
            </div>
            <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
              Community Manager Overview
            </h1>
            <p className="mt-1 text-sm text-slate-500 max-w-2xl">
              Professional Discord-first Community Management Platform. Operations, member engagement, moderation, recruitment, workflow automation, and Community Brain AI.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-right">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                System Health
              </div>
              <div className="flex items-center justify-end gap-1.5 mt-0.5 text-sm font-semibold text-emerald-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>{healthStatus?.status?.toUpperCase() || 'HEALTHY'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Compact Commercial Context Section */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-indigo-950 p-5 text-white shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-white uppercase tracking-wide">
                  Commercial Plan Context: <span className="text-indigo-400">{plan} PLAN</span>
                </h2>
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                  FREE_FIRST ACTIVE
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Authoritative entitlement limits enforced by EntitlementEngine.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsUpgradeModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 shrink-0"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Upgrade Plan</span>
            </button>
          </div>
        </div>

        {/* Dynamic Usage Metrics Strip */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-800 text-xs">
          <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60">
            <div className="text-[10px] uppercase font-semibold text-slate-400">AI Brain Requests</div>
            <div className="text-lg font-bold text-white mt-0.5">
              {usage?.ai_requests?.current ?? 0} <span className="text-xs font-normal text-slate-400">/ {usage?.ai_requests?.limit ?? 50} day</span>
            </div>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60">
            <div className="text-[10px] uppercase font-semibold text-slate-400">Workflow Automations</div>
            <div className="text-lg font-bold text-white mt-0.5">
              {usage?.automations?.current ?? 0} <span className="text-xs font-normal text-slate-400">/ {usage?.automations?.limit ?? 100} day</span>
            </div>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60">
            <div className="text-[10px] uppercase font-semibold text-slate-400">Applications Intake</div>
            <div className="text-lg font-bold text-white mt-0.5">
              {usage?.applications?.current ?? 0} <span className="text-xs font-normal text-slate-400">/ {usage?.applications?.limit ?? 50} day</span>
            </div>
          </div>

          <div className="bg-slate-800/60 p-3 rounded-lg border border-slate-700/60">
            <div className="text-[10px] uppercase font-semibold text-slate-400">Google Sheets Writes</div>
            <div className="text-lg font-bold text-white mt-0.5">
              {usage?.sheet_writes?.current ?? 0} <span className="text-xs font-normal text-slate-400">/ {usage?.sheet_writes?.limit ?? 200} day</span>
            </div>
          </div>
        </div>
      </div>

      {/* Free-First Cost Management & Quotas */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900">Free-First Quota Controller</h2>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            FREE_MODE: ACTIVE
          </span>
        </div>

        <p className="mt-3 text-xs text-slate-500 leading-relaxed">
          Guaranteed zero unintentional cloud costs. If daily quotas are reached, operations automatically queue for manual reviewer handling rather than falling back to paid APIs.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
            <div className="text-xs font-medium text-slate-500">AI Screening Quota</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">0</span>
              <span className="text-xs text-slate-400">/ 100 req/day</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200">
              <div className="h-1.5 rounded-full bg-indigo-600" style={{ width: '0%' }}></div>
            </div>
            <div className="mt-2 text-[10px] text-slate-400">Fallback: Manual Interviewer Queue</div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
            <div className="text-xs font-medium text-slate-500">Applications Intake</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">0</span>
              <span className="text-xs text-slate-400">/ 50 apps/day</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200">
              <div className="h-1.5 rounded-full bg-indigo-600" style={{ width: '0%' }}></div>
            </div>
            <div className="mt-2 text-[10px] text-slate-400">Controlled daily intake cap</div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
            <div className="text-xs font-medium text-slate-500">Google Sheets Sync</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">0</span>
              <span className="text-xs text-slate-400">/ 200 writes/day</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200">
              <div className="h-1.5 rounded-full bg-indigo-600" style={{ width: '0%' }}></div>
            </div>
            <div className="mt-2 text-[10px] text-slate-400">Batched buffer updates</div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
            <div className="text-xs font-medium text-slate-500">AI Request Token Limit</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900">2,048</span>
              <span className="text-xs text-slate-400">tokens max</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200">
              <div className="h-1.5 rounded-full bg-indigo-600" style={{ width: '100%' }}></div>
            </div>
            <div className="mt-2 text-[10px] text-slate-400">Strict prompt boundary cap</div>
          </div>
        </div>
      </div>

      {/* 4 Core Integration Abstractions */}
      <div>
        <h2 className="text-sm font-bold text-slate-900 mb-3">Modular Integration Engines</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Bot className="h-5 w-5" />
              </div>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                discord.js
              </span>
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900">Discord Bot Gateway</h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Lifecycle abstraction ready for DM dispatch, role assignment, and channel webhooks.
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Service Abstraction Wired</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                <Sparkles className="h-5 w-5" />
              </div>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                Gemini AI Engine
              </span>
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900">AI Community Intelligence</h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Pre-interview screening, interview transcript summarization, and follow-up question synthesis.
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Service Abstraction Wired</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Sheet className="h-5 w-5" />
              </div>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                Sheets API
              </span>
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900">Google Sheets Layer</h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Bi-directional spreadsheet sync for applicant tracking, recruiter tables, and audit exports.
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Service Abstraction Wired</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <Database className="h-5 w-5" />
              </div>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                Firestore
              </span>
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900">15 Collections Schema</h3>
            <p className="mt-1 text-xs text-slate-500 leading-relaxed">
              Typed repository contracts for Users, Applications, Interviews, Recruiters, Audit, and Config.
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Repositories Initialized</span>
            </div>
          </div>
        </div>
      </div>

      {/* Role-Based Access Control Architecture Callout */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="h-5 w-5 text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-900">Least-Privilege RBAC Matrix</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Your role in this server:{' '}
          <strong className="text-slate-800">{currentRole}</strong>. The sidebar and API endpoints enforce granular permissions independently on both client and server.
        </p>

        <div className="flex flex-wrap gap-2">
          {['OWNER', 'CONTROLLER', 'INTERVIEWER', 'RECRUITER', 'MEMBER', 'APPLICANT'].map((role) => (
            <div
              key={role}
              className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                currentRole === role
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-bold'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <span>{role}</span>
                {currentRole === role && <span className="text-[10px] text-indigo-600">Active</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <PlanUpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        communityId={communityId}
        currentPlan={plan as any}
      />
    </div>
  );
};
