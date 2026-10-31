import React, { useState } from 'react';
import {
  X,
  Zap,
  CheckCircle2,
  Shield,
  Sparkles,
  AlertCircle,
  ArrowRight,
  Lock,
  Building,
  CreditCard,
} from 'lucide-react';
import { AUTHORITATIVE_PLANS, PlanType } from '../../../shared/types/plans.js';

interface PlanUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  communityId: string;
  currentPlan?: 'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
  featureKey?: string;
  featureName?: string;
  requiredPlan?: string;
  onPlanChanged?: () => void;
}

export const PlanUpgradeModal: React.FC<PlanUpgradeModalProps> = ({
  isOpen,
  onClose,
  communityId,
  currentPlan = 'FREE',
  featureKey,
  featureName,
  requiredPlan = 'PRO',
  onPlanChanged,
}) => {
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [updating, setUpdating] = useState<boolean>(false);
  const [providerConfigured, setProviderConfigured] = useState<boolean>(false);
  const [checkingStatus, setCheckingStatus] = useState<boolean>(true);

  React.useEffect(() => {
    if (isOpen) {
      setCheckingStatus(true);
      fetch(`/api/v1/billing/status?workspaceId=ws_${communityId}`)
        .then((res) => res.json())
        .then((json) => {
          if (json.success && json.data) {
            setProviderConfigured(json.data.providerConfigured || false);
          }
        })
        .catch(() => setProviderConfigured(false))
        .finally(() => setCheckingStatus(false));
    }
  }, [isOpen, communityId]);

  if (!isOpen) return null;

  const handleSelectPlan = async (targetPlan: string) => {
    if (targetPlan === currentPlan) return;
    setUpdating(true);
    setNoticeMessage(null);

    if (targetPlan !== 'FREE' && !providerConfigured) {
      setNoticeMessage(`Paid upgrades are currently unavailable. The payment gateway is set to NOT_CONFIGURED. All core features remain accessible on the FREE plan.`);
      setUpdating(false);
      return;
    }

    try {
      const res = await fetch('/api/v1/plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({ plan: targetPlan }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setNoticeMessage(`Plan successfully switched to ${targetPlan}!`);
        if (onPlanChanged) onPlanChanged();
      } else {
        setNoticeMessage(json.message || `Subscription status is NOT_CONFIGURED. Contact platform support or system administrator to upgrade.`);
      }
    } catch {
      setNoticeMessage(`Payment gateway is currently set to NOT_CONFIGURED.`);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl text-slate-100 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800 p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-white">
                {featureName ? `Upgrade to unlock ${featureName}` : 'Community Manager Plans & Entitlements'}
              </h2>
              <p className="text-xs text-slate-400">
                {featureKey
                  ? `This feature requires the ${requiredPlan} plan or higher.`
                  : 'Select a plan to scale your community automation, AI, and analytics capabilities.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 flex-1">
          {/* Status banner */}
          {noticeMessage ? (
            <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-sm flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
              <span>{noticeMessage}</span>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CreditCard className="w-4 h-4 shrink-0 text-amber-400" />
                <span>
                  <strong>Production Status:</strong> Payment processing is set to <code>NOT_CONFIGURED</code>.
                </span>
              </div>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
                NOT_CONFIGURED
              </span>
            </div>
          )}

          {/* Plan Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* FREE PLAN */}
            <div
              className={`p-5 rounded-2xl border flex flex-col justify-between transition-all ${
                currentPlan === 'FREE'
                  ? 'bg-slate-800/80 border-purple-500/50 shadow-lg shadow-purple-500/5 ring-1 ring-purple-500/30'
                  : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-white">{AUTHORITATIVE_PLANS.FREE.id}</h3>
                  {currentPlan === 'FREE' && (
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Active Plan
                    </span>
                  )}
                </div>
                <div className="mb-4">
                  <span className="text-3xl font-extrabold text-white">{AUTHORITATIVE_PLANS.FREE.priceFormatted}</span>
                  <span className="text-xs text-slate-400"> / {AUTHORITATIVE_PLANS.FREE.billingInterval}</span>
                </div>
                <p className="text-xs text-slate-400 mb-5 leading-relaxed">
                  {AUTHORITATIVE_PLANS.FREE.description}
                </p>
                <ul className="space-y-2.5 text-xs text-slate-300 mb-6">
                  {AUTHORITATIVE_PLANS.FREE.features.map((feat, i) => (
                    <li key={i} className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                disabled={currentPlan === 'FREE' || updating}
                onClick={() => handleSelectPlan('FREE')}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold transition-all ${
                  currentPlan === 'FREE'
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                }`}
              >
                {currentPlan === 'FREE' ? 'Current Plan' : 'Switch to Free'}
              </button>
            </div>

            {/* PRO PLAN */}
            <div
              className={`p-5 rounded-2xl border flex flex-col justify-between transition-all relative ${
                currentPlan === 'PRO'
                  ? 'bg-slate-800/80 border-purple-500/50 shadow-lg shadow-purple-500/5 ring-1 ring-purple-500/30'
                  : 'bg-gradient-to-b from-purple-950/20 to-slate-900 border-purple-500/30 hover:border-purple-500/50'
              }`}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-bold tracking-wide uppercase shadow-sm">
                Most Popular
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
                    {AUTHORITATIVE_PLANS.PRO.id} <Sparkles className="w-4 h-4 text-purple-400" />
                  </h3>
                  {currentPlan === 'PRO' && (
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Active Plan
                    </span>
                  )}
                </div>
                <div className="mb-4">
                  <span className="text-3xl font-extrabold text-white">{AUTHORITATIVE_PLANS.PRO.priceFormatted}</span>
                  <span className="text-xs text-slate-400"> / {AUTHORITATIVE_PLANS.PRO.billingInterval}</span>
                </div>
                <p className="text-xs text-slate-400 mb-5 leading-relaxed">
                  {AUTHORITATIVE_PLANS.PRO.description}
                </p>
                <ul className="space-y-2.5 text-xs text-slate-300 mb-6">
                  {AUTHORITATIVE_PLANS.PRO.features.map((feat, i) => (
                    <li key={i} className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                disabled={updating}
                onClick={() => handleSelectPlan('PRO')}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 ${
                  currentPlan === 'PRO'
                    ? 'bg-slate-800 text-slate-400 cursor-default border border-slate-700'
                    : 'bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/20'
                }`}
              >
                <span>{currentPlan === 'PRO' ? 'Current Plan' : providerConfigured ? 'Select Pro Plan' : 'Pro Plan (NOT_CONFIGURED)'}</span>
                {currentPlan !== 'PRO' && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* BUSINESS PLAN */}
            <div
              className={`p-5 rounded-2xl border flex flex-col justify-between transition-all ${
                currentPlan === 'BUSINESS'
                  ? 'bg-slate-800/80 border-purple-500/50 shadow-lg shadow-purple-500/5 ring-1 ring-purple-500/30'
                  : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
                    {AUTHORITATIVE_PLANS.BUSINESS.id} <Building className="w-4 h-4 text-indigo-400" />
                  </h3>
                  {currentPlan === 'BUSINESS' && (
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Active Plan
                    </span>
                  )}
                </div>
                <div className="mb-4">
                  <span className="text-3xl font-extrabold text-white">{AUTHORITATIVE_PLANS.BUSINESS.priceFormatted}</span>
                  <span className="text-xs text-slate-400"> / {AUTHORITATIVE_PLANS.BUSINESS.billingInterval}</span>
                </div>
                <p className="text-xs text-slate-400 mb-5 leading-relaxed">
                  {AUTHORITATIVE_PLANS.BUSINESS.description}
                </p>
                <ul className="space-y-2.5 text-xs text-slate-300 mb-6">
                  {AUTHORITATIVE_PLANS.BUSINESS.features.map((feat, i) => (
                    <li key={i} className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                disabled={updating}
                onClick={() => handleSelectPlan('BUSINESS')}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 ${
                  currentPlan === 'BUSINESS'
                    ? 'bg-slate-800 text-slate-400 cursor-default border border-slate-700'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20'
                }`}
              >
                <span>{currentPlan === 'BUSINESS' ? 'Current Plan' : providerConfigured ? 'Select Business Plan' : 'Business Plan (NOT_CONFIGURED)'}</span>
                {currentPlan !== 'BUSINESS' && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* ENTERPRISE PLAN */}
            <div
              className={`p-5 rounded-2xl border flex flex-col justify-between transition-all ${
                currentPlan === 'ENTERPRISE'
                  ? 'bg-slate-800/80 border-purple-500/50 shadow-lg shadow-purple-500/5 ring-1 ring-purple-500/30'
                  : 'bg-slate-900/50 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-white flex items-center gap-1.5">
                    {AUTHORITATIVE_PLANS.ENTERPRISE.id} <Lock className="w-4 h-4 text-purple-400" />
                  </h3>
                  {currentPlan === 'ENTERPRISE' && (
                    <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Active Plan
                    </span>
                  )}
                </div>
                <div className="mb-4">
                  <span className="text-3xl font-extrabold text-white">{AUTHORITATIVE_PLANS.ENTERPRISE.priceFormatted}</span>
                  <span className="text-xs text-slate-400"> / {AUTHORITATIVE_PLANS.ENTERPRISE.billingInterval}</span>
                </div>
                <p className="text-xs text-slate-400 mb-5 leading-relaxed">
                  {AUTHORITATIVE_PLANS.ENTERPRISE.description}
                </p>
                <ul className="space-y-2.5 text-xs text-slate-300 mb-6">
                  {AUTHORITATIVE_PLANS.ENTERPRISE.features.map((feat, i) => (
                    <li key={i} className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                disabled={updating}
                onClick={() => setNoticeMessage(`Enterprise plan requires custom onboarding. Contact sales or system administrator.`)}
                className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold transition-all flex items-center justify-center space-x-1.5 ${
                  currentPlan === 'ENTERPRISE'
                    ? 'bg-slate-800 text-slate-400 cursor-default border border-slate-700'
                    : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                }`}
              >
                <span>{currentPlan === 'ENTERPRISE' ? 'Current Plan' : 'Contact Sales'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4 text-slate-500" />
            <span>Server-side entitlement enforcement active.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
