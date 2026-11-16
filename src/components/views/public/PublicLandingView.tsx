import React from 'react';
import {
  Bot,
  ShieldCheck,
  Users,
  Calendar,
  CheckCircle2,
  ExternalLink,
  ArrowRight,
  Sparkles,
  Zap,
  Lock,
  Layers,
  HelpCircle,
  FileText,
  Shield,
} from 'lucide-react';
import { getAddToDiscordUrl, getDiscordLoginUrl, getDiscordClientId, AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD } from '../../../lib/discordUrls.js';

interface PublicLandingViewProps {
  onLogin?: () => void;
  onAddDiscord?: () => void;
  onNavigateToSupport?: () => void;
  onNavigateToPrivacy?: () => void;
  onNavigateToTerms?: () => void;
}

export function PublicLandingView({
  onLogin,
  onAddDiscord,
  onNavigateToSupport,
  onNavigateToPrivacy,
  onNavigateToTerms,
}: PublicLandingViewProps) {
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = React.useState<boolean>(false);

  const handleAddDiscordClick = () => {
    window.location.href = getAddToDiscordUrl();
  };

  const handleLoginClick = () => {
    window.location.href = getDiscordLoginUrl();
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      {/* Navbar */}
      <header className="border-b border-neutral-800/80 bg-neutral-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <span className="font-bold text-lg text-white tracking-tight">Community Manager</span>
              <span className="hidden sm:inline-block ml-2.5 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-medium border border-indigo-500/20">
                SaaS Release
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleLoginClick}
              className="px-4 py-2 rounded-xl text-sm font-medium text-neutral-300 hover:text-white hover:bg-neutral-800 transition border border-transparent"
            >
              Login with Discord
            </button>
            <button
              onClick={handleAddDiscordClick}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/25 transition flex items-center gap-2"
            >
              <Bot className="w-4 h-4" /> Add to Discord
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-16 sm:py-24 border-b border-neutral-800/60 bg-gradient-to-b from-neutral-900/50 to-neutral-950">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="w-3.5 h-3.5" /> Professional Discord-First Platform
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-tight">
            Community Manager
          </h1>

          <p className="text-xl sm:text-2xl font-medium text-neutral-300 max-w-3xl mx-auto">
            Professional Discord-first Community Management Platform
          </p>

          <p className="text-neutral-400 text-sm sm:text-base max-w-2xl mx-auto leading-relaxed">
            Automate member onboarding, applicant screening, candidate interviews, Discord role synchronization, and community workflows in one unified dashboard.
          </p>

          {authError && (
            <div className="max-w-md mx-auto p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm space-y-2">
              <p className="font-semibold">Authentication Failed</p>
              <p className="text-xs text-red-400/80">{authError}</p>
              <button
                onClick={handleLoginClick}
                className="px-3 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs font-semibold transition inline-flex items-center gap-1.5 cursor-pointer border border-red-500/30"
              >
                <Zap className="w-3.5 h-3.5 animate-pulse" /> Retry Authentication
              </button>
            </div>
          )}

          {isAuthenticating && (
            <div className="max-w-md mx-auto p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
              <span>Please complete authorization in the popup window...</span>
            </div>
          )}

          {/* Primary Action Buttons */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={handleAddDiscordClick}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-semibold text-base bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl shadow-indigo-600/30 transition flex items-center justify-center gap-2.5"
            >
              <Bot className="w-5 h-5" /> Add to Discord <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleLoginClick}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-semibold text-base bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 transition flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" /> Login with Discord
            </button>
          </div>

          <div className="pt-6 flex flex-wrap justify-center gap-6 text-xs text-neutral-400 font-medium">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Automatic Guild Detection
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> $0 Forever Free Plan
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Multi-Tenant Role Security
            </span>
          </div>
        </div>
      </section>

      {/* Key Capabilities Bento Grid */}
      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="text-center space-y-3">
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Built for Modern Discord Communities
          </h2>
          <p className="text-neutral-400 text-sm max-w-xl mx-auto">
            Everything your team needs to recruit, evaluate, onboard, and manage members seamlessly.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 space-y-3 hover:border-neutral-700 transition">
            <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 w-fit">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">Instant Bot Server Linking</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              When the bot joins your server, Community Manager automatically detects the guild, validates permissions, and establishes your connected portal workspace.
            </p>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 space-y-3 hover:border-neutral-700 transition">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 w-fit">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">Recruitment & Applicant Pipeline</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Create custom screening questionnaires, candidate rule verification checks, and automated application review stages with recruiter referral codes.
            </p>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 space-y-3 hover:border-neutral-700 transition">
            <div className="p-3 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20 w-fit">
              <Calendar className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">Live Candidate Interviews</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Conduct candidate interviews with assigned interviewer roles, evaluation templates, decisions (Approve, Reject, Escalate), and optional Google Calendar sync.
            </p>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 space-y-3 hover:border-neutral-700 transition">
            <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 w-fit">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">Discord Role Mapping</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Map server owner, controller, interviewer, and recruiter permissions directly to existing Discord roles without replacing your hierarchy.
            </p>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 space-y-3 hover:border-neutral-700 transition">
            <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 w-fit">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">Community Brain Intelligence</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Optional AI assistant for candidate evaluation, summary generation, and intelligent community moderation recommendations.
            </p>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-6 space-y-3 hover:border-neutral-700 transition">
            <div className="p-3 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 w-fit">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-white">Multi-Tenant Security & Audits</h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Isolated community data, document-level security rules, and immutable security audit logs for all administrative actions.
            </p>
          </div>
        </div>
      </section>

      {/* Product Visuals & Screenshot Showcase Section */}
      <section className="py-12 bg-neutral-900/30 border-t border-neutral-800/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-white tracking-tight">App Directory Production Showcase</h2>
            <p className="text-neutral-400 text-xs sm:text-sm max-w-xl mx-auto">
              Clean, safe production interface visuals for Discord community management, candidate interviews, and role mapping.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3 hover:border-indigo-500/40 transition">
              <div className="h-32 bg-neutral-950 rounded-lg border border-neutral-800 p-3 flex flex-col justify-between text-[11px] font-mono text-neutral-400">
                <div className="flex items-center justify-between text-indigo-400 font-bold border-b border-neutral-800 pb-1.5">
                  <span>Community Dashboard</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300">LIVE</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-neutral-300"><span>Members</span><span className="font-bold">1,420</span></div>
                  <div className="flex justify-between text-neutral-300"><span>Applicants</span><span className="font-bold text-emerald-400">18 Active</span></div>
                </div>
                <div className="text-[10px] text-neutral-500 truncate">Guild ID: 999888777...</div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white">Community Overview</h4>
                <p className="text-[11px] text-neutral-400">Real-time health, member activity, and sync metrics.</p>
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3 hover:border-indigo-500/40 transition">
              <div className="h-32 bg-neutral-950 rounded-lg border border-neutral-800 p-3 flex flex-col justify-between text-[11px] font-mono text-neutral-400">
                <div className="flex items-center justify-between text-emerald-400 font-bold border-b border-neutral-800 pb-1.5">
                  <span>Recruitment Pipeline</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300">QUEUE</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-neutral-300"><span>Candidate</span><span className="text-neutral-200">Alex_Dev</span></div>
                  <div className="flex justify-between text-neutral-300"><span>Status</span><span className="text-amber-400">Interview Scheduled</span></div>
                </div>
                <div className="text-[10px] text-neutral-500 truncate">Code: REC-PROMO-2026</div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white">Applicant Command Center</h4>
                <p className="text-[11px] text-neutral-400">Review applications and referral attribution.</p>
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3 hover:border-indigo-500/40 transition">
              <div className="h-32 bg-neutral-950 rounded-lg border border-neutral-800 p-3 flex flex-col justify-between text-[11px] font-mono text-neutral-400">
                <div className="flex items-center justify-between text-sky-400 font-bold border-b border-neutral-800 pb-1.5">
                  <span>Live Candidate Interview</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300">STAFF</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-neutral-300"><span>Interviewer</span><span>Mod_Leader</span></div>
                  <div className="flex justify-between text-neutral-300"><span>Decision</span><span className="text-emerald-400 font-bold">Approved</span></div>
                </div>
                <div className="text-[10px] text-neutral-500 truncate">Calendar: Sync Active</div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white">Interview Workbench</h4>
                <p className="text-[11px] text-neutral-400">Staff review decisions, rubrics, and calendar sync.</p>
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3 hover:border-indigo-500/40 transition">
              <div className="h-32 bg-neutral-950 rounded-lg border border-neutral-800 p-3 flex flex-col justify-between text-[11px] font-mono text-neutral-400">
                <div className="flex items-center justify-between text-amber-400 font-bold border-b border-neutral-800 pb-1.5">
                  <span>Role Authorization</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300">SYNCED</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-neutral-300"><span>Controllers</span><span className="text-neutral-200">@StaffAdmin</span></div>
                  <div className="flex justify-between text-neutral-300"><span>Interviewers</span><span className="text-neutral-200">@RecruitingTeam</span></div>
                </div>
                <div className="text-[10px] text-neutral-500 truncate">Bitfield: {AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD}</div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white">Discord Role Mapping</h4>
                <p className="text-[11px] text-neutral-400">Map platform controls directly to Discord roles.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust & Security Section */}
      <section className="py-12 bg-neutral-950 border-t border-neutral-800/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center justify-center gap-2">
              <ShieldCheck className="w-6 h-6 text-indigo-400" /> Enterprise-Grade Trust & Security
            </h2>
            <p className="text-neutral-400 text-xs sm:text-sm max-w-lg mx-auto">
              Designed specifically for Discord communities with strict isolation, role authority, and privacy protection.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            <div className="bg-neutral-900/60 p-4 rounded-xl border border-neutral-800 space-y-1.5">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-indigo-400" /> Discord-First Identity
              </span>
              <p className="text-neutral-400">
                Uses Discord OAuth 2.0 with state validation. All user sessions map directly to verified Discord user and guild IDs.
              </p>
            </div>

            <div className="bg-neutral-900/60 p-4 rounded-xl border border-neutral-800 space-y-1.5">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-emerald-400" /> Multi-Tenant Data Isolation
              </span>
              <p className="text-neutral-400">
                Isolated database records with document-level Firestore security rules prevent cross-community data leakage.
              </p>
            </div>

            <div className="bg-neutral-900/60 p-4 rounded-xl border border-neutral-800 space-y-1.5">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-amber-400" /> Immutable Audit Logs
              </span>
              <p className="text-neutral-400">
                Every administrative action, decision, role mapping change, and configuration update is logged with immutable security trails.
              </p>
            </div>

            <div className="bg-neutral-900/60 p-4 rounded-xl border border-neutral-800 space-y-1.5">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-sky-400" /> Role-Based Access Control
              </span>
              <p className="text-neutral-400">
                Server-authoritative permission enforcement based directly on native Discord role hierarchies and assigned permissions.
              </p>
            </div>

            <div className="bg-neutral-900/60 p-4 rounded-xl border border-neutral-800 space-y-1.5">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-purple-400" /> User-Scoped Calendar Access
              </span>
              <p className="text-neutral-400">
                Google Calendar OAuth is strictly user-scoped for interviewers with permanent skip/disconnect capability.
              </p>
            </div>

            <div className="bg-neutral-900/60 p-4 rounded-xl border border-neutral-800 space-y-1.5">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-rose-400" /> Production-Safe Integrations
              </span>
              <p className="text-neutral-400">
                Automated error recovery and telemetry redactions ensure OAuth secrets and private credentials are never exposed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Free Plan Pricing Section */}
      <section className="py-12 bg-neutral-900/40 border-t border-b border-neutral-800/80">
        <div className="max-w-4xl mx-auto px-4 text-center space-y-6">
          <h2 className="text-2xl font-bold text-white">Simple, Honest Pricing</h2>
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 max-w-md mx-auto space-y-4 shadow-xl">
            <div className="space-y-1">
              <h3 className="text-xl font-semibold text-white">Free Plan</h3>
              <p className="text-3xl font-extrabold text-indigo-400">$0 <span className="text-sm font-normal text-neutral-400">forever</span></p>
            </div>
            <ul className="text-xs text-neutral-300 space-y-2 text-left pt-2 border-t border-neutral-800">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> Full Discord bot integration & slash commands</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> Recruitment pipeline & applicant questionnaires</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> Live candidate interview tools & decisions</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> Discord role synchronization & access controls</li>
            </ul>
            <div className="pt-2 text-[11px] text-neutral-500 italic">
              Paid plans are not currently activated. Free tier includes all core capabilities.
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-neutral-800 bg-neutral-950 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-400">
          <div>
            © 2026 K. Tech Services. All rights reserved. Community Manager is a product of K. Tech Services, owned and built by Kunal Pareek.
          </div>
          <div className="flex items-center gap-6">
            <button onClick={onNavigateToPrivacy} className="hover:text-white transition flex items-center gap-1">
              <Shield className="w-3.5 h-3.5" /> Privacy Policy
            </button>
            <button onClick={onNavigateToTerms} className="hover:text-white transition flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" /> Terms of Service
            </button>
            <button onClick={onNavigateToSupport} className="hover:text-white transition flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5" /> Support Center
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
