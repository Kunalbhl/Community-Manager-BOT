import React, { useState } from 'react';
import {
  Zap,
  Shield,
  CheckCircle2,
  AlertCircle,
  Lock,
  RefreshCw,
  Sparkles,
  Award,
  BarChart3,
  Sliders,
  Layers,
  Building,
  CreditCard,
  ArrowUpRight,
} from 'lucide-react';
import { useEntitlements } from '../../../../hooks/useEntitlements.js';
import { PlanUpgradeModal } from '../../../common/PlanUpgradeModal.js';
import { BillingView } from '../BillingView.js';

interface PlanUsageSettingsProps {
  communityId: string;
  canEdit: boolean;
}

export const PlanUsageSettings: React.FC<PlanUsageSettingsProps> = ({ communityId, canEdit }) => {
  const {
    plan,
    subscriptionStatus,
    billingStatus,
    entitlements,
    usage,
    loading,
    error,
    refetch,
    updatePlan,
    resetUsage,
  } = useEntitlements(communityId);

  const [settingsTab, setSettingsTab] = useState<'billing' | 'entitlements'>('billing');
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [selectedUpgradeFeature, setSelectedUpgradeFeature] = useState<{
    key: string;
    name: string;
    requiredPlan?: string;
  } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [switching, setSwitching] = useState(false);

  const handlePlanChange = async (newPlan: string) => {
    setSwitching(true);
    setFeedback(null);
    const success = await updatePlan(newPlan);
    if (success) {
      setFeedback({ type: 'success', msg: `Community plan switched to ${newPlan}.` });
    } else {
      setFeedback({ type: 'error', msg: 'Failed to update community plan.' });
    }
    setSwitching(false);
  };

  const handleResetUsage = async () => {
    setFeedback(null);
    const success = await resetUsage();
    if (success) {
      setFeedback({ type: 'success', msg: 'Usage quotas reset successfully.' });
    } else {
      setFeedback({ type: 'error', msg: 'Failed to reset usage quotas.' });
    }
  };

  const openUpgradeForFeature = (key: string, name: string, reqPlan?: string) => {
    setSelectedUpgradeFeature({ key, name, requiredPlan: reqPlan || 'PRO' });
    setIsUpgradeModalOpen(true);
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400 animate-pulse flex items-center justify-center space-x-2">
        <RefreshCw className="w-5 h-5 animate-spin text-purple-400" />
        <span>Loading plan & entitlement engine data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex border-b border-slate-800 space-x-6">
        <button
          onClick={() => setSettingsTab('billing')}
          className={`pb-3 text-sm font-bold flex items-center space-x-2 border-b-2 transition-colors ${
            settingsTab === 'billing'
              ? 'border-purple-500 text-purple-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>SaaS Subscription & Billing</span>
        </button>

        <button
          onClick={() => setSettingsTab('entitlements')}
          className={`pb-3 text-sm font-bold flex items-center space-x-2 border-b-2 transition-colors ${
            settingsTab === 'entitlements'
              ? 'border-purple-500 text-purple-400'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Community Entitlements & Usage</span>
        </button>
      </div>

      {settingsTab === 'billing' ? (
        <BillingView workspaceId={`ws_${communityId}`} canEdit={canEdit} />
      ) : (
        <>
          {/* Feedback banner */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center space-x-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* Plan Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-xl font-bold text-white tracking-tight">{plan} PLAN</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    Active
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Authoritative server-side entitlement engine evaluating feature keys & usage quotas.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 text-xs">
              <div className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300">
                <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400">Subscription:</span>
                <span className="font-mono text-slate-200 font-semibold">{subscriptionStatus}</span>
              </div>
              <div className="flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300">
                <Shield className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-400">Billing:</span>
                <span className="font-mono text-slate-200 font-semibold">{billingStatus}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {canEdit && (
              <div className="flex items-center space-x-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                <span className="text-[11px] text-slate-400 px-2 font-medium">Test Plan:</span>
                {(['FREE', 'PRO', 'BUSINESS'] as const).map((p) => (
                  <button
                    key={p}
                    disabled={switching || plan === p}
                    onClick={() => handlePlanChange(p)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      plan === p
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => {
                setSelectedUpgradeFeature(null);
                setIsUpgradeModalOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-md shadow-purple-600/20 flex items-center space-x-1.5 transition-all"
            >
              <span>View Plans</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Usage Quotas Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-2.5">
            <BarChart3 className="w-5 h-5 text-purple-400" />
            <h4 className="text-sm font-bold text-white tracking-wide uppercase">Usage & Quotas Snapshot</h4>
          </div>
          <button
            onClick={handleResetUsage}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 flex items-center space-x-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            <span>Reset Quotas</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Daily AI Requests', key: 'ai_requests', unit: 'req' },
            { label: 'Daily Automations', key: 'automation_executions', unit: 'exec' },
            { label: 'Daily Applications', key: 'applications', unit: 'apps' },
            { label: 'Daily Sheet Writes', key: 'sheet_writes', unit: 'writes' },
            { label: 'Daily Report Exports', key: 'exports', unit: 'exports' },
            { label: 'Communities Count', key: 'communities', unit: 'servers' },
            { label: 'Member Limit', key: 'members', unit: 'members' },
            { label: 'Scheduled Actions', key: 'scheduled_actions', unit: 'actions' },
          ].map(({ label, key, unit }) => {
            const m = usage[key] || { current: 0, limit: 100 };
            const pct = Math.min(100, Math.round((m.current / (m.limit || 1)) * 100));
            const isNearLimit = pct >= 80;
            const isExceeded = m.current >= m.limit;

            return (
              <div key={key} className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300 font-medium">{label}</span>
                  <span className="font-mono text-slate-400">
                    {m.current} / {m.limit === Infinity ? '∞' : m.limit} {unit}
                  </span>
                </div>

                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${
                      isExceeded
                        ? 'bg-rose-500'
                        : isNearLimit
                        ? 'bg-amber-500'
                        : 'bg-gradient-to-r from-purple-500 to-indigo-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[10px]">
                  <span
                    className={`font-semibold ${
                      isExceeded ? 'text-rose-400' : isNearLimit ? 'text-amber-400' : 'text-slate-500'
                    }`}
                  >
                    {isExceeded ? 'LIMIT REACHED' : isNearLimit ? 'NEAR LIMIT' : `${pct}% Used`}
                  </span>
                  <span className="text-slate-500">Resets daily</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Feature Matrix Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-2.5">
            <Layers className="w-5 h-5 text-purple-400" />
            <h4 className="text-sm font-bold text-white tracking-wide uppercase">
              Feature Matrix & Entitlements ({entitlements.length})
            </h4>
          </div>
          <span className="text-xs text-slate-400">Evaluated server-side per community tenant</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {entitlements.map((feat) => {
            const isAvailable = feat.active;
            const status = feat.status;

            return (
              <div
                key={feat.key}
                className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                  isAvailable
                    ? 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
                    : 'bg-slate-950/80 border-slate-800/60 opacity-80'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h5 className="text-xs font-semibold text-white tracking-tight">{feat.displayName}</h5>
                    {status === 'AVAILABLE' && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                        Available
                      </span>
                    )}
                    {status === 'LIMIT_REACHED' && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 shrink-0">
                        Limited
                      </span>
                    )}
                    {status === 'BILLING_REQUIRED' && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20 shrink-0 flex items-center gap-1">
                        <Lock className="w-2.5 h-2.5" />
                        {feat.requiredPlan || 'PRO'}
                      </span>
                    )}
                    {status === 'FEATURE_NOT_ENABLED' && (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700 shrink-0">
                        Disabled
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-3">
                    {feat.description}
                  </p>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-slate-800/60">
                  <span className="uppercase tracking-wider font-medium">{feat.module}</span>
                  {!isAvailable && status === 'BILLING_REQUIRED' && (
                    <button
                      onClick={() => openUpgradeForFeature(feat.key, feat.displayName, feat.requiredPlan)}
                      className="text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 transition-colors"
                    >
                      <span>Upgrade</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Plan Upgrade Modal */}
      <PlanUpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        communityId={communityId}
        currentPlan={plan}
        featureKey={selectedUpgradeFeature?.key}
        featureName={selectedUpgradeFeature?.name}
        requiredPlan={selectedUpgradeFeature?.requiredPlan}
        onPlanChanged={refetch}
      />
        </>
      )}
    </div>
  );
};
