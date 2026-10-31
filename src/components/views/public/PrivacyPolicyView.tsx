import React from 'react';
import { Shield, Lock, Eye, FileText, ArrowLeft, Mail } from 'lucide-react';

interface PrivacyPolicyViewProps {
  onBack?: () => void;
}

export function PrivacyPolicyView({ onBack }: PrivacyPolicyViewProps) {
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
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">Privacy Policy</h1>
              <p className="text-neutral-400 text-sm">Effective Date: September 15, 2026 | Community Manager SaaS</p>
            </div>
          </div>
        </div>

        <div className="space-y-6 text-neutral-300 leading-relaxed text-sm">
          <section className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-6 space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Eye className="w-5 h-5 text-indigo-400" /> 1. Data We Collect
            </h2>
            <p>
              Community Manager collects necessary operational data to provide recruitment management, role authorization, candidate tracking, and community automation services:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-neutral-400">
              <li><strong className="text-neutral-200">Discord Identity Data:</strong> Discord User ID, username, avatar, and server membership roles.</li>
              <li><strong className="text-neutral-200">Discord Server Data:</strong> Guild ID, server name, channel list, and role hierarchy for automated permission checks.</li>
              <li><strong className="text-neutral-200">Recruitment & Applicant Records:</strong> Application forms, candidate answers, interview schedules, recruiter notes, and evaluation statuses.</li>
              <li><strong className="text-neutral-200">Google Calendar Tokens (Optional):</strong> When you explicitly connect Google Calendar, we store OAuth tokens securely to create interview events and synchronize schedules.</li>
              <li><strong className="text-neutral-200">Audit & System Logs:</strong> Event timestamps, action types, and user IDs for security, role audits, and compliance tracking.</li>
            </ul>
          </section>

          <section className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-6 space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-emerald-400" /> 2. How We Use Your Information
            </h2>
            <p>Your data is strictly processed for providing core platform functionality:</p>
            <ul className="list-disc pl-5 space-y-1 text-neutral-400">
              <li>Processing recruitment applications and managing applicant pipelines.</li>
              <li>Verifying interviewer and administrator authorizations across connected Discord servers.</li>
              <li>Scheduling candidate interviews and generating Calendar events when connected.</li>
              <li>Enforcing community access controls, role assignments, and applicant restrictions.</li>
              <li>Maintaining immutable audit logs for server administrators.</li>
            </ul>
          </section>

          <section className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-6 space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-400" /> 3. Data Storage & Security
            </h2>
            <p>
              All tenant data is stored in isolated multi-tenant Cloud Firestore databases with strict document-level security rules.
              Data in transit is encrypted using TLS 1.3, and access is enforced through server-side role validation.
            </p>
          </section>

          <section className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-6 space-y-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Mail className="w-5 h-5 text-sky-400" /> 4. Data Retention & Deletion Rights
            </h2>
            <p>
              Server owners can delete community data at any time through Workspace Settings or by submitting a data removal request.
              When the Community Manager bot is removed from a server, data is retained in a dormant state for reinstallation unless explicit deletion is requested.
            </p>
            <p className="text-neutral-400 pt-2">
              For privacy inquiries or deletion requests, contact support at <a href="mailto:support@communitymanager.app" className="text-indigo-400 underline">support@communitymanager.app</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
