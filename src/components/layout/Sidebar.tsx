import React from 'react';
import {
  LayoutDashboard,
  Server,
  Users,
  BarChart3,
  MessageSquare,
  Activity,
  Settings,
  ShieldCheck,
  FileText,
  Sheet,
  Sparkles,
  X,
  ArrowLeft,
  User,
  Radio,
  Megaphone, Wrench, PartyPopper, ListChecks, UserCog, ClipboardList, LayoutGrid, CalendarClock, BrainCircuit, Plug } from 'lucide-react';
import { PortalMode, PlatformSection, CommunitySection } from '../../types/ui.js';
import { UserRole, Permission } from '../../../shared/types/rbac.js';
import { hasPermission } from '../../../server/security/rbac.js';
import { BrandLogo } from '../brand/BrandLogo.js';

interface SidebarProps {
  portalMode: PortalMode;
  currentRole: UserRole;
  activePlatformSection: PlatformSection;
  onSelectPlatformSection: (section: PlatformSection) => void;
  activeCommunitySection: CommunitySection;
  onSelectCommunitySection: (section: CommunitySection) => void;
  onSelectPortalMode: (mode: PortalMode) => void;
  isOpen: boolean;
  onClose: () => void;
  onOpenPlatformAuth: () => void;
  selectedCommunity: string;
}

const PLATFORM_NAV_ITEMS: Array<{
  id: PlatformSection;
  label: string;
  icon: React.ElementType;
}> = [
  { id: 'overview', label: 'Platform Overview', icon: LayoutDashboard },
  { id: 'servers', label: 'Discord Servers', icon: Server },
  { id: 'users', label: 'Platform Users', icon: Users },
  { id: 'analytics', label: 'Platform Analytics', icon: BarChart3 },
  { id: 'feedback', label: 'Feedback & Ideas', icon: MessageSquare },
  { id: 'health', label: 'System Health', icon: Activity },
  { id: 'settings', label: 'Master Settings', icon: Settings },
  { id: 'audit', label: 'Security Audit Trail', icon: ShieldCheck },
];

interface PrimaryNavModule {
  id: CommunitySection;
  label: string;
  icon: React.ElementType;
  requiredPermission?: Permission;
  matchingSections: CommunitySection[];
}

/** Each area gets its own colour so it is easy to spot. */
const NAV_TONE: Record<string, string> = {
  home: 'bg-sky-500/15 text-sky-300', 'setup-guide': 'bg-emerald-500/15 text-emerald-300', members: 'bg-violet-500/15 text-violet-300',
  engagement: 'bg-orange-500/15 text-orange-300', recruitment: 'bg-pink-500/15 text-pink-300', moderation: 'bg-red-500/15 text-red-300',
  'team-access': 'bg-amber-500/15 text-amber-300', capabilities: 'bg-yellow-400/15 text-yellow-300', 'community-features': 'bg-fuchsia-500/15 text-fuchsia-300',
  'server-tools': 'bg-cyan-500/15 text-cyan-300', 'events-automation': 'bg-teal-500/15 text-teal-300', 'insights-ai': 'bg-indigo-400/20 text-indigo-200',
  integrations: 'bg-lime-500/15 text-lime-300', settings: 'bg-slate-400/15 text-slate-300',
};

const PRIMARY_COMMUNITY_NAV: PrimaryNavModule[] = [
  { id: 'home', label: 'Home', icon: LayoutDashboard, matchingSections: ['home', 'dashboard', 'overview'] },
  { id: 'setup-guide', label: 'Setup guide', icon: ListChecks, requiredPermission: 'community.view', matchingSections: ['setup-guide'] },
  { id: 'recruitment', label: 'Recruitment', icon: ClipboardList, matchingSections: ['recruitment', 'recruitment-trust', 'campaign-workspace', 'lifecycle-intelligence', 'recruiter-records'] },
  { id: 'members', label: 'Members & onboarding', icon: Users, matchingSections: ['members', 'permissions', 'channels', 'discord-ops', 'server-hygiene'] },
  { id: 'engagement', label: 'Engagement', icon: Megaphone, matchingSections: ['engagement', 'automation'] },
  { id: 'moderation', label: 'Moderation', icon: ShieldCheck, matchingSections: ['moderation', 'incidents', 'automod', 'restrictions', 'security-audit'] },
  { id: 'insights-ai', label: 'Insights & AI', icon: BrainCircuit, matchingSections: ['insights-ai', 'insights-dashboard', 'ai', 'reports'] },
  { id: 'settings', label: 'Settings', icon: Settings, matchingSections: ['settings', 'discord-gateway'] },
];

export const Sidebar: React.FC<SidebarProps> = ({
  portalMode,
  currentRole,
  activePlatformSection,
  onSelectPlatformSection,
  activeCommunitySection,
  onSelectCommunitySection,
  onSelectPortalMode,
  isOpen,
  onClose,
  onOpenPlatformAuth,
  selectedCommunity,
}) => {
  const isPlatformMode = portalMode === 'PLATFORM_ADMIN';
  const authContext = { userId: 'current_user', role: currentRole };

  const [botStatus, setBotStatus] = React.useState<'ONLINE' | 'OFFLINE'>('ONLINE');
  const [latency, setLatency] = React.useState<number | null>(45);

  React.useEffect(() => {
    let active = true;
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/v1/health/external');
        if (!res.ok) throw new Error('Failed to fetch health');
        const json = await res.json();
        if (active && json.success && json.dependencies?.discordGateway) {
          const gw = json.dependencies.discordGateway;
          const isOnline = gw.state === 'READY' || gw.state === 'CONNECTED' || gw.state === 'UP';
          setBotStatus(isOnline ? 'ONLINE' : 'OFFLINE');
          setLatency(gw.pingMs && gw.pingMs > 0 ? gw.pingMs : (isOnline ? 38 : null));
        }
      } catch (err) {
        if (active) {
          setBotStatus('OFFLINE');
          setLatency(null);
        }
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 15000); // 15s interval
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedCommunity]);

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/5 bg-slate-950 text-slate-300 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-0 max-lg:-translate-x-full'
        }`}
      >
        {/* Brand header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-800 px-5">
          <a href="/" title="Go to the Community Manager website" className="rounded-lg transition hover:opacity-80">
            <BrandLogo
              variant="full"
              theme="dark"
              size="sm"
              subtitle={isPlatformMode ? 'Platform owner console' : 'Command center'}
            />
          </a>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation body */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {isPlatformMode ? (
            /* PLATFORM OWNER NAVIGATION */
            <div className="space-y-1">
              <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-amber-400 flex items-center justify-between">
                <span>Platform Modules</span>
                <span className="rounded bg-amber-400/20 px-1.5 py-0.2 text-[9px] text-amber-300">
                  Global
                </span>
              </div>

              {PLATFORM_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activePlatformSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectPlatformSection(item.id);
                      onClose();
                    }}
                    className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition ${
                      isActive
                        ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isActive ? 'text-indigo-300' : 'text-slate-400 group-hover:text-white'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}

              <div className="pt-4 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Scope Switcher
              </div>

              <button
                onClick={() => {
                  onSelectPortalMode('COMMUNITY_DASHBOARD');
                  onClose();
                }}
                className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition"
              >
                <ArrowLeft className="h-4 w-4 text-slate-400 group-hover:text-white" />
                <span>Return to Community View</span>
              </button>
            </div>
          ) : (
            /* 9 PRIMARY MODULES COMMUNITY MANAGER NAVIGATION */
            <div className="space-y-1">
              <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Workspace
              </div>

              {PRIMARY_COMMUNITY_NAV.map((mod) => {
                if (mod.requiredPermission && !hasPermission(authContext, mod.requiredPermission)) {
                  return null;
                }

                const isActive =
                  portalMode === 'COMMUNITY_DASHBOARD' &&
                  mod.matchingSections.includes(activeCommunitySection);
                const Icon = mod.icon;

                return (
                  <button
                    key={mod.id}
                    onClick={() => {
                      onSelectPortalMode('COMMUNITY_DASHBOARD');
                      onSelectCommunitySection(mod.id);
                      onClose();
                    }}
                    className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition ${
                      isActive
                        ? 'bg-gradient-to-r from-indigo-500/25 to-indigo-500/5 text-white before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1 before:rounded-r-full before:bg-[#FF5C8A]'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition duration-200 group-hover:scale-110 group-hover:-rotate-6 group-active:scale-95 ${NAV_TONE[mod.id] || 'bg-white/10 text-slate-300'} ${isActive ? 'ring-1 ring-white/30' : ''}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="truncate transition-transform duration-200 group-hover:translate-x-0.5">{mod.label}</span>
                  </button>
                );
              })}

              <div className="pt-4 border-t border-slate-800 space-y-1">
                <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Portal Switchers
                </div>

                {/* Recruiter Portal Link */}
                <button
                  onClick={() => {
                    onSelectPortalMode('RECRUITER_PORTAL');
                    onClose();
                  }}
                  className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition ${
                    portalMode === 'RECRUITER_PORTAL'
                      ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <User className="h-4 w-4 text-emerald-400" />
                  <span>My Recruiter Dashboard</span>
                </button>

                {/* Join Application Portal Link */}
                <button
                  onClick={() => {
                    onSelectPortalMode('APPLICANT_PORTAL');
                    onClose();
                  }}
                  className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition ${
                    portalMode === 'APPLICANT_PORTAL'
                      ? 'bg-amber-600 text-white shadow-xs font-semibold'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <FileText className="h-4 w-4 text-amber-400" />
                  <span>Join Application Form</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="border-t border-slate-800 p-4 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${botStatus === 'ONLINE' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500 animate-pulse'}`} />
              Bot Status ({selectedCommunity ? 'This Guild' : 'Gateway'})
            </span>
            <span className={`font-mono text-[10px] font-bold tracking-wider ${botStatus === 'ONLINE' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {botStatus}
            </span>
          </div>
          {botStatus === 'ONLINE' && latency !== null && (
            <div className="flex items-center justify-between text-[10px] text-slate-500">
              <span>Gateway Latency</span>
              <span className="font-mono tabular-nums text-slate-400">{latency} ms</span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
