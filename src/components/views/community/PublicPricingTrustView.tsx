import React, { useState, useEffect } from 'react';
import {
  Zap,
  CheckCircle2,
  Shield,
  Sparkles,
  Building,
  CreditCard,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  ShieldCheck,
  LifeBuoy,
  Users,
  Bot,
  Megaphone,
  Sliders,
  BarChart3,
  Terminal,
  Lock,
} from 'lucide-react';
import { PlanUpgradeModal } from '../../common/PlanUpgradeModal.js';
import { TrustLegalModal } from '../../common/TrustLegalModal.js';
import { SupportTroubleshootingModal } from '../../common/SupportTroubleshootingModal.js';
import { AUTHORITATIVE_PLANS } from '../../../../shared/types/plans.js';

interface PublicPricingTrustViewProps {
  communityId?: string;
  currentPlan?: string;
  canEdit?: boolean;
}

export const PublicPricingTrustView: React.FC<PublicPricingTrustViewProps> = ({
  communityId = '',
  currentPlan = 'FREE',
  canEdit = true,
}) => {
  const [billingConfigured, setBillingConfigured] = useState<boolean>(false);
  const [providerName, setProviderName] = useState<string>('Stripe (Unconfigured)');
  const [loading, setLoading] = useState<boolean>(true);

  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState<boolean>(false);
  const [isTrustModalOpen, setIsTrustModalOpen] = useState<boolean>(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState<boolean>(false);

  useEffect(() => {
    fetch(`/api/v1/billing/status?workspaceId=ws_${communityId}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setBillingConfigured(json.data.providerConfigured || false);
          setProviderName(json.data.providerName || 'Stripe');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [communityId]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto py-4">
      {/* Hero Header */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-8 text-white shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-indigo-500/20 border border-indigo-400/30 px-3 py-1 text-xs font-bold text-indigo-300">
              COMMERCIAL LAUNCH READY
            </span>
            <span className="rounded-full bg-emerald-500/20 border border-emerald-400/30 px-3 py-1 text-xs font-bold text-emerald-300 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Free-First Guarantee
            </span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Community Manager
          </h1>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
            The professional Discord-first Community Management Platform. Built for community operators, moderators, recruiters, and creators to automate operations, engage members, and grow safely.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                // Navigate or open onboarding
                const onboardingEl = document.getElementById('onboarding-wizard-section');
                if (onboardingEl) {
                  onboardingEl.scrollIntoView({ behavior: 'smooth' });
                } else {
                  setIsUpgradeModalOpen(true);
                }
              }}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition flex items-center gap-2"
            >
              <Zap className="w-4 h-4" />
              <span>Start Free</span>
            </button>

            <button
              onClick={() => {
                const pricingEl = document.getElementById('commercial-plan-matrix');
                if (pricingEl) {
                  pricingEl.scrollIntoView({ behavior: 'smooth' });
                } else {
                  setIsUpgradeModalOpen(true);
                }
              }}
              className="px-5 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200 font-bold text-xs transition flex items-center gap-2"
            >
              <CreditCard className="w-4 h-4 text-indigo-400" />
              <span>View Pricing</span>
            </button>

            <button
              onClick={() => setIsTrustModalOpen(true)}
              className="px-5 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200 font-bold text-xs transition flex items-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              <span>Trust, Safety & Legal</span>
            </button>

            <button
              onClick={() => setIsSupportModalOpen(true)}
              className="px-5 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200 font-bold text-xs transition flex items-center gap-2"
            >
              <LifeBuoy className="w-4 h-4 text-purple-400" />
              <span>Support & Diagnostics</span>
            </button>
          </div>
        </div>
      </div>

      {/* Production Billing Availability Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${billingConfigured ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-slate-900">
              Billing Gateway Status: <code className="text-indigo-600">{billingConfigured ? 'ACTIVE' : 'NOT_CONFIGURED'}</code>
            </div>
            <p className="text-slate-500 mt-0.5">
              {billingConfigured
                ? `Live subscriptions processing enabled via ${providerName}.`
                : 'Payment processing gateway is unconfigured. All communities operate perpetually on the functional FREE plan.'}
            </p>
          </div>
        </div>

        <span className={`px-2.5 py-1 rounded font-bold uppercase text-[10px] shrink-0 ${billingConfigured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
          {billingConfigured ? 'LIVE_BILLING_CONNECTED' : 'NOT_CONFIGURED'}
        </span>
      </div>

      {/* 8 Core Pillars of Product Lifecycle */}
      <div className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">End-to-End Community Lifecycle Management</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { title: '1. Connect', desc: 'Discord Bot Gateway & OAuth server link', icon: Bot },
            { title: '2. Manage', desc: 'Roster, permissions, roles & workspace scope', icon: Sliders },
            { title: '3. Engage', desc: 'Welcome onboarding, polls & campaigns', icon: Megaphone },
            { title: '4. Moderate', desc: 'Rules, warnings, auto-mod & blacklists', icon: Shield },
            { title: '5. Recruit', desc: 'Applications, code tracking & interviewing', icon: Users },
            { title: '6. Automate', desc: 'Trigger-action workflows & webhooks', icon: Terminal },
            { title: '7. Analyze', desc: 'Community health, metrics & reports', icon: BarChart3 },
            { title: '8. Grow', desc: 'Community Brain AI & retention loops', icon: Sparkles },
          ].map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div key={pillar.title} className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs space-y-1">
                <div className="flex items-center gap-2 text-indigo-600">
                  <Icon className="w-4 h-4" />
                  <span className="font-bold text-xs text-slate-900">{pillar.title}</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">{pillar.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Commercial Plans Matrix */}
      <div id="commercial-plan-matrix" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Commercial Plan Matrix</h2>
            <p className="text-xs text-slate-500">Authoritatively enforced limits powered by EntitlementEngine</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
              FREE Plan: AVAILABLE
            </span>
            <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
              Active Plan: {currentPlan}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* FREE PLAN */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-base">{AUTHORITATIVE_PLANS.FREE.id}</h3>
                {currentPlan === 'FREE' && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Active
                  </span>
                )}
              </div>
              <div>
                <span className="text-2xl font-extrabold text-slate-900">{AUTHORITATIVE_PLANS.FREE.priceFormatted}</span>
                <span className="text-xs text-slate-500"> / {AUTHORITATIVE_PLANS.FREE.billingInterval}</span>
              </div>
              <p className="text-xs text-slate-500">{AUTHORITATIVE_PLANS.FREE.description}</p>
              <ul className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                {AUTHORITATIVE_PLANS.FREE.features.slice(0, 4).map((feat, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              disabled={currentPlan === 'FREE'}
              onClick={() => setIsUpgradeModalOpen(true)}
              className="w-full py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 font-bold text-xs hover:bg-slate-100 transition"
            >
              {currentPlan === 'FREE' ? 'Current Plan' : 'Select Free'}
            </button>
          </div>

          {/* PRO PLAN */}
          <div className="p-5 rounded-2xl border border-purple-200 bg-gradient-to-b from-purple-50/50 to-white flex flex-col justify-between space-y-4 relative">
            <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-[9px] font-bold uppercase px-2 py-0.5 rounded-full">
              Most Popular
            </span>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-1">
                  {AUTHORITATIVE_PLANS.PRO.id} <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                </h3>
                {currentPlan === 'PRO' && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Active
                  </span>
                )}
              </div>
              <div>
                <span className="text-2xl font-extrabold text-slate-900">{AUTHORITATIVE_PLANS.PRO.priceFormatted}</span>
                <span className="text-xs text-slate-500"> / {AUTHORITATIVE_PLANS.PRO.billingInterval}</span>
              </div>
              <p className="text-xs text-slate-500">{AUTHORITATIVE_PLANS.PRO.description}</p>
              <ul className="space-y-2 text-xs text-slate-600 border-t border-purple-100 pt-3">
                {AUTHORITATIVE_PLANS.PRO.features.slice(0, 4).map((feat, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setIsUpgradeModalOpen(true)}
              className="w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-xs transition"
            >
              {currentPlan === 'PRO' ? 'Current Plan' : billingConfigured ? 'Upgrade to Pro' : 'View Pro Plan (NOT_CONFIGURED)'}
            </button>
          </div>

          {/* BUSINESS PLAN */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-white flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-1">
                  {AUTHORITATIVE_PLANS.BUSINESS.id} <Building className="w-3.5 h-3.5 text-indigo-600" />
                </h3>
                {currentPlan === 'BUSINESS' && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Active
                  </span>
                )}
              </div>
              <div>
                <span className="text-2xl font-extrabold text-slate-900">{AUTHORITATIVE_PLANS.BUSINESS.priceFormatted}</span>
                <span className="text-xs text-slate-500"> / {AUTHORITATIVE_PLANS.BUSINESS.billingInterval}</span>
              </div>
              <p className="text-xs text-slate-500">{AUTHORITATIVE_PLANS.BUSINESS.description}</p>
              <ul className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                {AUTHORITATIVE_PLANS.BUSINESS.features.slice(0, 4).map((feat, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setIsUpgradeModalOpen(true)}
              className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xs transition"
            >
              {currentPlan === 'BUSINESS' ? 'Current Plan' : billingConfigured ? 'Upgrade to Business' : 'View Business Plan (NOT_CONFIGURED)'}
            </button>
          </div>

          {/* ENTERPRISE PLAN */}
          <div className="p-5 rounded-2xl border border-slate-200 bg-slate-900 text-white flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-white text-base">{AUTHORITATIVE_PLANS.ENTERPRISE.id}</h3>
                {currentPlan === 'ENTERPRISE' && (
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                    Active
                  </span>
                )}
              </div>
              <div>
                <span className="text-xl font-extrabold text-white">{AUTHORITATIVE_PLANS.ENTERPRISE.priceFormatted}</span>
                <span className="text-xs text-slate-400"> / {AUTHORITATIVE_PLANS.ENTERPRISE.billingInterval}</span>
              </div>
              <p className="text-xs text-slate-400">{AUTHORITATIVE_PLANS.ENTERPRISE.description}</p>
              <ul className="space-y-2 text-xs text-slate-300 border-t border-slate-800 pt-3">
                {AUTHORITATIVE_PLANS.ENTERPRISE.features.slice(0, 4).map((feat, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setIsSupportModalOpen(true)}
              className="w-full py-2 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 font-bold text-xs transition"
            >
              Contact Sales (Enterprise)
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      <PlanUpgradeModal
        isOpen={isUpgradeModalOpen}
        onClose={() => setIsUpgradeModalOpen(false)}
        communityId={communityId}
        currentPlan={currentPlan as any}
      />

      <TrustLegalModal
        isOpen={isTrustModalOpen}
        onClose={() => setIsTrustModalOpen(false)}
      />

      <SupportTroubleshootingModal
        isOpen={isSupportModalOpen}
        onClose={() => setIsSupportModalOpen(false)}
        communityId={communityId}
      />
    </div>
  );
};
