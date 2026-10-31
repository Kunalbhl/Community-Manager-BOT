import React from 'react';
import { HelpCircle, BookOpen, Bot, Calendar, ShieldAlert, ExternalLink, ArrowLeft } from 'lucide-react';

interface SupportViewProps {
  onBack?: () => void;
}

export function SupportView({ onBack }: SupportViewProps) {
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
            <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <HelpCircle className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">Help & Support Center</h1>
              <p className="text-neutral-400 text-sm">Documentation, setup assistance, and troubleshooting guides for Community Manager</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-indigo-400 font-semibold">
              <Bot className="w-5 h-5" /> Discord Bot Installation
            </div>
            <p className="text-xs text-neutral-400">
              To install Community Manager, click <strong>Add to Discord</strong> from the portal or use the authorized installation URL.
              Ensure you possess <em>Manage Server</em> or <em>Administrator</em> permissions on your target server.
            </p>
          </div>

          <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold">
              <BookOpen className="w-5 h-5" /> Role Mapping & Onboarding
            </div>
            <p className="text-xs text-neutral-400">
              Configure interviewer roles (Controller, Interviewer, Recruiter) under <strong>Recruitment Settings</strong>.
              Community Manager synchronizes user permissions based on their mapped Discord roles.
            </p>
          </div>

          <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-amber-400 font-semibold">
              <Calendar className="w-5 h-5" /> Google Calendar Integration
            </div>
            <p className="text-xs text-neutral-400">
              Connect your personal Google Calendar to schedule candidate interviews directly. You can skip initial setup and connect anytime from your profile or recruitment settings.
            </p>
          </div>

          <div className="bg-neutral-800/50 border border-neutral-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-rose-400 font-semibold">
              <ShieldAlert className="w-5 h-5" /> Permissions & Bot Removal Recovery
            </div>
            <p className="text-xs text-neutral-400">
              If the bot displays <span className="text-amber-400 font-mono">PERMISSION_REQUIRED</span>, verify the bot has <em>View Channels</em>, <em>Send Messages</em>, and <em>Manage Roles</em>.
              If the bot was kicked or removed, simply re-run <strong>Add to Discord</strong> — your existing community setup and recruitment records will be restored automatically.
            </p>
          </div>
        </div>

        <div className="bg-neutral-800/80 border border-neutral-700/60 rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Command Quick Reference</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-2.5 rounded bg-neutral-900 border border-neutral-800">
              <span className="text-indigo-400 font-bold">/community-manager</span>
              <p className="text-neutral-400 font-sans mt-0.5">Open web dashboard / server portal link</p>
            </div>
            <div className="p-2.5 rounded bg-neutral-900 border border-neutral-800">
              <span className="text-indigo-400 font-bold">/applications</span>
              <p className="text-neutral-400 font-sans mt-0.5">List and review candidate applications</p>
            </div>
            <div className="p-2.5 rounded bg-neutral-900 border border-neutral-800">
              <span className="text-indigo-400 font-bold">/interview</span>
              <p className="text-neutral-400 font-sans mt-0.5">Schedule & manage candidate interview sessions</p>
            </div>
            <div className="p-2.5 rounded bg-neutral-900 border border-neutral-800">
              <span className="text-indigo-400 font-bold">/create-recruiter-code</span>
              <p className="text-neutral-400 font-sans mt-0.5">Generate recruiter referral tracking code</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between p-4 rounded-xl bg-neutral-800/40 border border-neutral-800 text-xs text-neutral-400">
          <div>
            Need further technical assistance? Contact our engineering team at <a href="mailto:support@communitymanager.app" className="text-indigo-400 underline">support@communitymanager.app</a>
          </div>
          <div className="flex items-center gap-4 mt-2 sm:mt-0">
            <a href="/privacy" className="hover:text-white transition">Privacy Policy</a>
            <a href="/terms" className="hover:text-white transition">Terms of Service</a>
          </div>
        </div>
      </div>
    </div>
  );
}
