import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  HelpCircle,
  ArrowRight,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  Bot,
  Zap,
  Users,
  Bell,
  Calendar,
  Sliders,
  Check,
  ExternalLink,
} from 'lucide-react';
import { UserRole } from '../../../../shared/types/rbac.js';

export interface ChecklistItem {
  key: string;
  title: string;
  description: string;
  isCore: boolean;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'NOT_CONFIGURED';
  nextAction?: string;
  blocker?: string;
  retryAction?: string;
}

export interface ActivationData {
  communityId: string;
  activationLifecycle: 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'ACTIVATED';
  activatedAt?: string;
  firstValueCompleted: boolean;
  firstValueCompletedAt?: string;
  firstValueActionType?: string;
  completedCoreCount: number;
  totalCoreCount: number;
  overallProgressPercentage: number;
  items: ChecklistItem[];
}

interface CustomerActivationSectionProps {
  communityId: string;
  onNavigate: (section: string) => void;
  currentRole: UserRole;
}

const itemSectionMap: Record<string, string> = {
  workspace_created: 'workspace_settings',
  discord_connected: 'discord_connection_center',
  bot_installed: 'discord_connection_center',
  permissions_verified: 'discord_connection_center',
  community_selected: 'community_settings',
  initial_sync_completed: 'discord_connection_center',
  recruitment_configured: 'recruitment_trust',
  welcome_configured: 'welcome_onboarding',
  moderation_configured: 'moderation',
  first_announcement_created: 'engagement',
  first_event_created: 'events',
  first_automation_created: 'automation',
};

export const CustomerActivationSection: React.FC<CustomerActivationSectionProps> = ({
  communityId,
  onNavigate,
  currentRole,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<ActivationData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchChecklist = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/onboarding/checklist?communityId=${communityId}`, {
        headers: {
          'x-community-id': communityId,
          'x-role': currentRole,
          'x-user-role': currentRole,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setData(json.data);
        } else {
          setError(json.message || 'Failed to fetch activation checklist');
        }
      } else {
        setError('Server returned status ' + res.status);
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching activation checklist');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChecklist();
  }, [communityId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 animate-pulse space-y-4">
        <div className="h-6 w-64 bg-slate-800 rounded"></div>
        <div className="h-4 w-full bg-slate-800/60 rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <div className="h-24 bg-slate-800/40 rounded-lg"></div>
          <div className="h-24 bg-slate-800/40 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <h4 className="text-sm font-semibold text-amber-200">Activation Status Check</h4>
            <p className="text-xs text-amber-300/80 mt-0.5">{error || 'Checklist data unavailable'}</p>
          </div>
        </div>
        <button
          onClick={fetchChecklist}
          className="px-3 py-1.5 rounded-lg bg-amber-900/40 hover:bg-amber-900/60 text-amber-200 text-xs font-medium transition-colors flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry Check
        </button>
      </div>
    );
  }

  const getLifecycleBadge = () => {
    switch (data.activationLifecycle) {
      case 'ACTIVATED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3.5 h-3.5" />
            COMMUNITY ACTIVATED
          </span>
        );
      case 'BLOCKED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/30">
            <AlertTriangle className="w-3.5 h-3.5" />
            ACTIVATION BLOCKED
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
            <Clock className="w-3.5 h-3.5" />
            ONBOARDING IN PROGRESS
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
            <Clock className="w-3.5 h-3.5" />
            ONBOARDING NOT STARTED
          </span>
        );
    }
  };

  const getStatusBadge = (status: ChecklistItem['status']) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/60">
            <Check className="w-3 h-3" />
            COMPLETED
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800/60">
            IN PROGRESS
          </span>
        );
      case 'BLOCKED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-400 border border-red-800/60">
            BLOCKED
          </span>
        );
      case 'NOT_CONFIGURED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
            NOT CONFIGURED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
            NOT STARTED
          </span>
        );
    }
  };

  const coreItems = data.items.filter((i) => i.isCore);
  const setupItems = data.items.filter((i) => !i.isCore);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-5 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-lg font-extrabold text-white tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              Customer Activation Checklist
            </h3>
            {getLifecycleBadge()}
            {data.firstValueCompleted && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                <Zap className="w-3.5 h-3.5" />
                FIRST VALUE ACHIEVED
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Complete the 6 core setup steps to activate your community workspace. Follow the guided actions below to unlock automated recruitment, discord sync, and welcome onboarding.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-xs font-semibold text-slate-400">Core Progress</div>
            <div className="text-base font-extrabold text-white">
              {data.completedCoreCount} / {data.totalCoreCount} Steps
            </div>
          </div>
          <button
            onClick={fetchChecklist}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            title="Refresh checklist"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
          <span>Overall Workspace Readiness</span>
          <span className="text-indigo-400 font-bold">{data.overallProgressPercentage}%</span>
        </div>
        <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden p-0.5">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${Math.max(5, data.overallProgressPercentage)}%` }}
          />
        </div>
      </div>

      {/* Core Onboarding Steps */}
      <div className="space-y-3">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-400" />
          1. Core Verification & Connection Steps
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {coreItems.map((item) => {
            const targetSection = itemSectionMap[item.key] || 'discord_connection_center';
            return (
              <div
                key={item.key}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 ${
                  item.status === 'COMPLETED'
                    ? 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
                    : item.status === 'BLOCKED'
                    ? 'bg-red-950/20 border-red-900/50 hover:border-red-800/80'
                    : 'bg-indigo-950/10 border-indigo-900/40 hover:border-indigo-800/60'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h5 className="text-xs font-bold text-slate-200">{item.title}</h5>
                    {getStatusBadge(item.status)}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{item.description}</p>

                  {item.blocker && (
                    <div className="mt-2.5 p-2 rounded bg-red-950/50 border border-red-900/60 text-[10px] text-red-300 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                      <span>{item.blocker}</span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-medium">Core Requirement</span>
                  <button
                    onClick={() => onNavigate(targetSection)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1 ${
                      item.status === 'COMPLETED'
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        : item.status === 'BLOCKED'
                        ? 'bg-red-900/60 hover:bg-red-800 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs'
                    }`}
                  >
                    {item.status === 'COMPLETED' ? 'Manage' : item.nextAction || 'Configure'}
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Guided Community Setup & First Value */}
      <div className="space-y-3 pt-2">
        <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          2. Guided First Value & Module Setup
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {setupItems.map((item) => {
            const targetSection = itemSectionMap[item.key] || 'community_overview';
            return (
              <div
                key={item.key}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 ${
                  item.status === 'COMPLETED'
                    ? 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
                    : 'bg-slate-900/20 border-slate-800/60 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h5 className="text-xs font-bold text-slate-200">{item.title}</h5>
                    {getStatusBadge(item.status)}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{item.description}</p>
                </div>

                <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 font-medium">Optional Module</span>
                  <button
                    onClick={() => onNavigate(targetSection)}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors flex items-center gap-1"
                  >
                    {item.status === 'COMPLETED' ? 'View Setup' : 'Set Up Now'}
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Support & Troubleshooting Banner */}
      {data.activationLifecycle === 'BLOCKED' && (
        <div className="p-4 rounded-xl bg-red-950/30 border border-red-900/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <HelpCircle className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <h5 className="text-xs font-bold text-red-200">Need Help Resolving Activation Blockers?</h5>
              <p className="text-[11px] text-red-300/80 mt-0.5">
                Check Discord Connection Center permissions or review system configuration logs in Settings.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('discord_connection_center')}
            className="px-3 py-1.5 rounded-lg bg-red-900/60 hover:bg-red-800 text-white text-xs font-semibold shrink-0 transition-colors flex items-center gap-1.5"
          >
            Open Connection Center
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
