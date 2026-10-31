import React from 'react';
import { Scale, CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';

interface TermsOfServiceViewProps {
  onBack?: () => void;
}

export function TermsOfServiceView({ onBack }: TermsOfServiceViewProps) {
  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-700 transition text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        )}

        <div className="border-b border-neutral-800 pb-6 space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">Terms of Service</h1>
              <p className="text-neutral-400 text-sm">Effective Date: September 15, 2026 | Community Manager SaaS</p>
            </div>
          </div>
        </div>

        <div className="space-y-6 text-neutral-300 leading-relaxed text-sm">
          <section className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-6 space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" /> 1. Acceptance of Terms
            </h2>
            <p>
              By installing the Community Manager Discord Bot, connecting a Discord server, or accessing the Community Manager web portal, you agree to be bound by these Terms of Service and all applicable Discord API terms.
            </p>
          </section>

          <section className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-6 space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Scale className="w-5 h-5 text-indigo-400" /> 2. Permitted Use & Account Authority
            </h2>
            <p>
              Community Manager is provided for legitimate Discord community operations, member recruitment, candidate onboarding, and interview management.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-neutral-400">
              <li>Users must maintain appropriate Discord server administrative authority when installing or configuring the application.</li>
              <li>You agree not to bypass security controls, tamper with authorization tokens, or attempt cross-tenant data access.</li>
              <li>You agree not to use Community Manager for spamming, harassment, or violating Discord Developer Terms of Service.</li>
            </ul>
          </section>

          <section className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-6 space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" /> 3. Service Availability & Limits
            </h2>
            <p>
              Community Manager operates on a Free-First architecture with rate controls to protect platform stability.
              Optional paid features require active subscriptions managed via configured billing gateways.
              We reserve the right to suspend accounts that abuse rate limits or engage in fraudulent activity.
            </p>
          </section>

          <section className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-6 space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-sky-400" /> 4. Contact & Support
            </h2>
            <p>
              For legal inquiries, terms compliance, or support regarding these terms, visit our <a href="/support" className="text-indigo-400 underline">Support Center</a> or email <a href="mailto:terms@communitymanager.app" className="text-indigo-400 underline">terms@communitymanager.app</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
