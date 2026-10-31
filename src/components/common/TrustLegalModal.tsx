import React, { useState } from 'react';
import {
  ShieldCheck,
  X,
  Lock,
  FileText,
  CheckCircle2,
  AlertCircle,
  Database,
  Cpu,
  Bot,
  ExternalLink,
  Shield,
} from 'lucide-react';

interface TrustLegalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TrustLegalModal: React.FC<TrustLegalModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'terms' | 'privacy' | 'refund'>('overview');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl text-slate-800 flex flex-col">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-6 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white">Trust, Security & Legal Transparency</h2>
              <p className="text-xs text-slate-400">
                Community Manager data protection guarantees, AI safety rules, and legal documents.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Subnav */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 space-x-6 text-xs font-bold">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'overview'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Trust & Security Architecture</span>
          </button>

          <button
            onClick={() => setActiveTab('terms')}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'terms'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Terms of Service</span>
          </button>

          <button
            onClick={() => setActiveTab('privacy')}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'privacy'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Privacy Policy</span>
          </button>

          <button
            onClick={() => setActiveTab('refund')}
            className={`pb-3 border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'refund'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Refund & Cancellation Policy</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-slate-600 leading-relaxed">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <Database className="w-4 h-4 text-indigo-600" />
                    <span>Multi-Tenant Workspace Isolation</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    All customer data, member records, and audit logs are authoritatively isolated using strictly enforced workspace/community tenant keys. No cross-tenant data leaks are possible.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <Cpu className="w-4 h-4 text-purple-600" />
                    <span>AI Community Brain Safety</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Community Brain AI operates strictly server-side using grounded prompt boundaries. Your community messages are never used to train global public AI models.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <Bot className="w-4 h-4 text-indigo-600" />
                    <span>Least-Privilege Discord Permissions</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    The Discord Bot Gateway operates strictly with minimal required permissions (Manage Roles, Read/Send Messages, Create Channels). Administrative Discord server ownership is never required or requested.
                  </p>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <Lock className="w-4 h-4 text-emerald-600" />
                    <span>Zero Client Secret Exposure</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    All OAuth client secrets, bot tokens, Gemini API keys, and Stripe billing keys are stored strictly in server environment variables and never exposed to client browsers.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-indigo-100 bg-indigo-50/50 text-indigo-900 text-xs space-y-1">
                <div className="font-bold text-indigo-950 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                  <span>Free-First Commercial Guarantee</span>
                </div>
                <p>
                  Community Manager provides perpetual functionality on the FREE plan. We never force payment before customers receive legitimate value, and we never charge hidden overage fees.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'terms' && (
            <div className="space-y-4 text-xs text-slate-700">
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-between">
                <span className="font-semibold">Standard Commercial Terms of Service</span>
                <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-amber-200/60 font-bold text-amber-900">
                  STANDARD_PLAINTEXT
                </span>
              </div>
              <h3 className="font-bold text-slate-900 text-sm">1. Acceptance of Terms</h3>
              <p>
                By connecting a Discord server or creating a workspace in Community Manager, you agree to these Terms of Service. If you are acting on behalf of a community or organization, you represent that you have authority to bind that entity.
              </p>

              <h3 className="font-bold text-slate-900 text-sm">2. Account & Discord Authorization</h3>
              <p>
                You are responsible for maintaining control of your Discord account and administrative permissions on connected Discord servers. You must comply with Discord Service Terms and Community Guidelines.
              </p>

              <h3 className="font-bold text-slate-900 text-sm">3. Acceptable Use</h3>
              <p>
                Community Manager may not be used for illegal activities, automated spamming, harassment, or violating Discord platform rules. Violations will result in immediate tenant suspension.
              </p>

              <h3 className="font-bold text-slate-900 text-sm">4. Service Availability & Quotas</h3>
              <p>
                Service availability is subject to standard maintenance windows. Quotas on FREE, PRO, and BUSINESS plans are authoritatively enforced at the server layer.
              </p>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-4 text-xs text-slate-700">
              <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-900 flex items-center justify-between">
                <span className="font-semibold">Privacy Policy & Data Handling</span>
                <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-indigo-200/60 font-bold text-indigo-900">
                  VERIFIED_PRIVACY_COMPLIANT
                </span>
              </div>

              <h3 className="font-bold text-slate-900 text-sm">1. Information We Collect</h3>
              <p>
                We collect minimal required information to operate community features: Discord User IDs, server IDs, applicant form submissions, and configuration settings. We never store Discord passwords or payment card details.
              </p>

              <h3 className="font-bold text-slate-900 text-sm">2. How Data is Used</h3>
              <p>
                Data is strictly used to deliver community management, member onboarding, AI assistance, and analytics services within your designated workspace.
              </p>

              <h3 className="font-bold text-slate-900 text-sm">3. Data Retention & Deletion</h3>
              <p>
                Workspace owners may request complete tenant data deletion at any time through workspace settings or support inquiry.
              </p>
            </div>
          )}

          {activeTab === 'refund' && (
            <div className="space-y-4 text-xs text-slate-700">
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between">
                <span className="font-semibold">Refund & Subscription Policy</span>
                <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-emerald-200/60 font-bold text-emerald-900">
                  CUSTOMER_FRIENDLY
                </span>
              </div>

              <h3 className="font-bold text-slate-900 text-sm">1. Free Plan Forever</h3>
              <p>
                The FREE plan requires no credit card and does not expire. You can upgrade or downgrade at any time.
              </p>

              <h3 className="font-bold text-slate-900 text-sm">2. 14-Day Money-Back Guarantee</h3>
              <p>
                Paid subscriptions on PRO or BUSINESS plans are eligible for a 100% refund within 14 days of purchase if the platform does not meet your community needs.
              </p>

              <h3 className="font-bold text-slate-900 text-sm">3. Cancellation</h3>
              <p>
                You can cancel paid subscriptions anytime in Billing Settings. Upon cancellation, paid features remain active until the end of the paid billing period before reverting safely to FREE mode.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Community Manager Commercial Transparency Guarantee</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 text-white font-semibold hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
