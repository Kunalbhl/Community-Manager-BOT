import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  ClipboardList, Inbox, Mic, MessageSquareText, DoorOpen, Gift, Settings as SettingsIcon, Activity,
  HandHeart, BadgeCheck, MousePointerClick, UserCheck, TrendingUp, Cake, Users,
  Megaphone, Repeat, Clock, BarChart3, CalendarDays, PartyPopper, TerminalSquare, FileText,
  ShieldAlert, Scale, Ticket, ScrollText, Ban, Layers, Star,
  Server, UserCog, Plug, Bell, CreditCard, Lock,
} from 'lucide-react';

export interface ModuleCtx { communityId: string; currentRole: any; canEdit: boolean }
// Each screen loads only when opened, so the dashboard starts fast.
const BlacklistView = lazy(() => import('../views/community/BlacklistView.js').then((m) => ({ default: m.BlacklistView })));
const RewardsView = lazy(() => import('../views/community/RewardsView.js').then((m) => ({ default: m.RewardsView })));
const WarningsPanel = lazy(() => import('../views/community/WarningsPanel.js').then((m) => ({ default: m.WarningsPanel })));
const ApplicationsView = lazy(() => import('../views/community/ApplicationsView.js').then((m) => ({ default: m.ApplicationsView })));
const ServerToolsView = lazy(() => import('../views/community/ServerToolsView.js').then((m) => ({ default: m.ServerToolsView })));
const CommunityFeaturesView = lazy(() => import('../views/community/CommunityFeaturesView.js').then((m) => ({ default: m.CommunityFeaturesView })));
const CommunitySettingsView = lazy(() => import('../views/community/CommunitySettingsView.js').then((m) => ({ default: m.CommunitySettingsView })));
const EngagementView = lazy(() => import('../views/community/EngagementView.js').then((m) => ({ default: m.EngagementView })));
const EventsView = lazy(() => import('../views/community/EventsView.js').then((m) => ({ default: m.EventsView })));
const TeamAccessView = lazy(() => import('../views/community/TeamAccessView.js').then((m) => ({ default: m.TeamAccessView })));
const ConnectionCenterView = lazy(() => import('../views/community/ConnectionCenterView.js').then((m) => ({ default: m.ConnectionCenterView })));
const WelcomeRulesView = lazy(() => import('../views/community/WelcomeRulesView.js').then((m) => ({ default: m.WelcomeRulesView })));
const ServerSettingsView = lazy(() => import('../views/community/ServerSettingsView.js').then((m) => ({ default: m.ServerSettingsView })));
const RecruiterCodesManager = lazy(() => import('../views/community/RecruiterCodesManager.js').then((m) => ({ default: m.RecruiterCodesManager })));
const RecruitmentSettingsView = lazy(() => import('../views/community/RecruitmentSettingsView.js').then((m) => ({ default: m.RecruitmentSettingsView })));
const MemberListView = lazy(() => import('../views/community/MemberListView.js').then((m) => ({ default: m.MemberListView })));

interface TabDef { id: string; label: string; icon: any; hint: string; render: (c: ModuleCtx) => React.ReactNode }
export interface ModuleDef { id: string; title: string; desc: string; tabs: TabDef[] }

/** One place per module: setup, daily work and settings live together as tabs. */
/** Two or three closely related screens under one tab, chosen with a simple switch (no duplicate tabs). */
function Switcher({ id, options }: { id: string; options: { id: string; label: string; icon: React.ComponentType<{ className?: string }>; render: () => React.ReactNode }[] }) {
  const [sel, setSel] = useState<string>(() => {
    try {
      const v = sessionStorage.getItem('cm_sub') || '';
      if (v.startsWith(`${id}:`)) { sessionStorage.removeItem('cm_sub'); const o = v.slice(id.length + 1); if (options.some((x) => x.id === o)) return o; }
    } catch { /* ignore */ }
    return options[0].id;
  });
  const cur = options.find((o) => o.id === sel) || options[0];
  return (
    <div className="space-y-4">
      <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
        {options.map((o) => (
          <button key={o.id} role="tab" aria-selected={o.id === cur.id} onClick={() => setSel(o.id)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${o.id === cur.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
            <o.icon className="h-4 w-4" />{o.label}
          </button>
        ))}
      </div>
      <div key={cur.id}><Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading…</div>}>{cur.render()}</Suspense></div>
    </div>
  );
}

export const MODULES: Record<string, ModuleDef> = {
  recruitment: {
    id: 'recruitment', title: 'Recruitment', desc: 'Applications, interviews, recruiters and the whole apply flow in Discord.',
    tabs: [
      { id: 'overview', label: 'Overview', icon: Activity, hint: 'What needs attention right now and how recruitment is going.', render: (c) => <ApplicationsView embedded communityId={c.communityId} currentRole={c.currentRole} initialTab="overview" /> },
      { id: 'applications', label: 'Applications', icon: Inbox, hint: 'Every application, its stage and its reviewer.', render: (c) => <ApplicationsView embedded communityId={c.communityId} currentRole={c.currentRole} initialTab="applications" /> },
      { id: 'interviews', label: 'Interviews', icon: Mic, hint: 'Scheduled interviews and the questions the bot asks.', render: (c) => <ApplicationsView embedded communityId={c.communityId} currentRole={c.currentRole} initialTab="interviews" /> },
      { id: 'discord', label: 'Discord flow', icon: MessageSquareText, hint: 'Apply panel, rules, rules quiz, Secure Setup, messages, log channel and Google Sheets.', render: (c) => <ServerToolsView communityId={c.communityId} only="recruit" /> },
      { id: 'rooms', label: 'Review rooms', icon: DoorOpen, hint: 'A private chat per application, a temporary voice room and escalation by rank.', render: (c) => <ServerToolsView communityId={c.communityId} only="rooms" /> },
      { id: 'recruiters', label: 'Recruiters & codes', icon: ClipboardList, hint: 'Recruiter codes, naming series, import and export, and each code’s history.', render: (c) => <RecruiterCodesManager communityId={c.communityId} /> },
      { id: 'rewards', label: 'Rewards', icon: Gift, hint: 'Milestones, repeating rewards, streaks and top recruiter: roles, XP, messages or hand-out prizes for members recruiters bring in.', render: (c) => <RewardsView communityId={c.communityId} /> },
      { id: 'settings', label: 'Settings', icon: SettingsIcon, hint: 'Open or close applications, recruiter codes on the form, the quiz pass mark and the recruiter credit announcement.', render: (c) => <RecruitmentSettingsView communityId={c.communityId} /> },
    ],
  },
  members: {
    id: 'members', title: 'Members & onboarding', desc: 'How new members are welcomed, verified and given roles, and how they grow.',
    tabs: [
      { id: 'welcome', label: 'Welcome & rules', icon: HandHeart, hint: 'Welcome messages, the role given on join, your rules channel and rules list.', render: (c) => <WelcomeRulesView communityId={c.communityId} /> },
      { id: 'verification', label: 'Verification', icon: BadgeCheck, hint: 'New members press Verify (optionally solve a quick sum) before they can see the server.', render: (c) => <CommunityFeaturesView communityId={c.communityId} only="verification" /> },
      { id: 'role-panels', label: 'Role panels', icon: MousePointerClick, hint: 'Let members pick their own roles with buttons: games, regions, pings and more.', render: (c) => <CommunityFeaturesView communityId={c.communityId} only="buttonRoles" /> },
      { id: 'role-rules', label: 'Role rules', icon: UserCheck, hint: 'Which roles an approved applicant gets, and when.', render: (c) => <ServerToolsView communityId={c.communityId} only="roles" /> },
      { id: 'levels', label: 'Levels & XP', icon: TrendingUp, hint: 'Members earn XP by chatting and unlock reward roles.', render: (c) => <CommunityFeaturesView communityId={c.communityId} only="levels" /> },
      { id: 'birthdays', label: 'Birthdays', icon: Cake, hint: 'Members save their birthday with /birthday; the bot celebrates on the day.', render: (c) => <CommunityFeaturesView communityId={c.communityId} only="birthdays" /> },
      { id: 'server-stats', label: 'Server stats', icon: BarChart3, hint: 'Channels whose names show live numbers: members, a role’s members, online, boosts and more.', render: (c) => <CommunityFeaturesView communityId={c.communityId} only="stats" /> },
      { id: 'directory', label: 'Member list', icon: Users, hint: 'Everyone in the server, live from Discord, with their name in this server and their roles.', render: (c) => <MemberListView communityId={c.communityId} /> },
    ],
  },
  engagement: {
    id: 'engagement', title: 'Engagement', desc: 'Messages, polls, events, giveaways and starboard, all posted by the bot.',
    tabs: [
      { id: 'messages', label: 'Messages', icon: Megaphone, hint: 'Send a message now or later, repeat it, or remind someone. One place for every message the bot sends on a schedule.', render: (c) => <Switcher id="messages" options={[{ id: 'once', label: 'Send once or later', icon: Megaphone, render: () => <EngagementView communityId={c.communityId} only="announcements" /> }, { id: 'repeat', label: 'Repeat or send by DM', icon: Repeat, render: () => <EngagementView communityId={c.communityId} only="campaigns" /> }, { id: 'remind', label: 'Remind someone', icon: Clock, render: () => <EngagementView communityId={c.communityId} only="reminders" /> }]} /> },
      { id: 'polls', label: 'Polls', icon: BarChart3, hint: 'Native Discord polls that close on time.', render: (c) => <EngagementView communityId={c.communityId} only="polls" /> },
      { id: 'events', label: 'Events', icon: CalendarDays, hint: 'Events members register for with buttons in Discord.', render: (c) => <EventsView communityId={c.communityId} /> },
      { id: 'giveaways', label: 'Giveaways', icon: PartyPopper, hint: 'Members press Enter; winners are picked fairly when time runs out.', render: (c) => <CommunityFeaturesView communityId={c.communityId} only="giveaways" /> },
      { id: 'commands', label: 'Custom commands', icon: TerminalSquare, hint: 'Your own text commands, like !rules or !socials.', render: (c) => <CommunityFeaturesView communityId={c.communityId} only="custom" /> },
      { id: 'starboard', label: 'Starboard', icon: Star, hint: 'Messages with enough star reactions are reposted in a highlight channel.', render: (c) => <CommunityFeaturesView communityId={c.communityId} only="starboard" /> },
      { id: 'templates', label: 'Templates', icon: FileText, hint: 'Saved messages you can reuse from any message box.', render: (c) => <EngagementView communityId={c.communityId} only="templates" /> },
    ],
  },
  moderation: {
    id: 'moderation', title: 'Moderation', desc: 'Warnings, tickets, logs, the blacklist and tools that keep the server safe.',
    tabs: [
      { id: 'warnings', label: 'Warnings', icon: ShieldAlert, hint: 'Every warning given, plus the points per reason and the action taken at each level.', render: (c) => <Switcher id="warnings" options={[{ id: 'log', label: 'Warnings given', icon: ShieldAlert, render: () => <WarningsPanel communityId={c.communityId} /> }, { id: 'rules', label: 'Rules and actions', icon: Scale, render: () => <ServerToolsView communityId={c.communityId} only="warnings" /> }]} /> },
      { id: 'tickets', label: 'Tickets', icon: Ticket, hint: 'Members open private tickets by type; staff claim and close them.', render: (c) => <ServerToolsView communityId={c.communityId} only="tickets" /> },
      { id: 'logs', label: 'Server logs', icon: ScrollText, hint: 'Joins, leaves, deleted and edited messages, role changes and warnings in one channel.', render: (c) => <CommunityFeaturesView communityId={c.communityId} only="logs" /> },
      { id: 'blacklist', label: 'Blacklist', icon: Ban, hint: 'People kept out of the server, known by Discord ID, Discord name or only their game name. Search, filters, alerts and /blacklist-check.', render: (c) => <BlacklistView communityId={c.communityId} /> },
      { id: 'bulk', label: 'Bulk tools', icon: Layers, hint: 'Do one thing to many members or channels at once.', render: (c) => <ServerToolsView communityId={c.communityId} only="bulk" /> },
    ],
  },
  settings: {
    id: 'settings', title: 'Settings', desc: 'Server-wide settings, who can use the dashboard, connected services and your plan.',
    tabs: [
      { id: 'server', label: 'Server', icon: Server, hint: 'The bot’s name in this server and the server time zone.', render: (c) => <ServerSettingsView communityId={c.communityId} /> },
      { id: 'team', label: 'Team & access', icon: UserCog, hint: 'Which Discord roles can open the dashboard and what they can do.', render: (c) => <TeamAccessView communityId={c.communityId} canEdit={c.canEdit} /> },
      { id: 'integrations', label: 'Integrations', icon: Plug, hint: 'Services connected to the bot.', render: (c) => <ConnectionCenterView communityId={c.communityId} /> },
      { id: 'notifications', label: 'Notifications', icon: Bell, hint: 'Where staff alerts are sent.', render: (c) => <CommunitySettingsView communityId={c.communityId} currentRole={c.currentRole} only="notifications" /> },
      { id: 'plan', label: 'Plan & usage', icon: CreditCard, hint: 'What your plan includes and how much you’ve used.', render: (c) => <CommunitySettingsView communityId={c.communityId} currentRole={c.currentRole} only="plansUsage" /> },
      { id: 'security', label: 'Security', icon: Lock, hint: 'Sign-in and audit settings.', render: (c) => <CommunitySettingsView communityId={c.communityId} currentRole={c.currentRole} only="security" /> },
    ],
  },
};

/** Old screen names → where they live now (keeps setup-guide links and bookmarks working). */
const LEGACY: Record<string, [string, string?, string?]> = {
  'server-tools:recruit': ['recruitment', 'discord'], 'server-tools:rooms': ['recruitment', 'rooms'], 'server-tools:roles': ['members', 'role-rules'],
  'server-tools:warnings': ['moderation', 'warnings', 'rules'], 'server-tools:tickets': ['moderation', 'tickets'], 'server-tools:bulk': ['moderation', 'bulk'], 'server-tools': ['recruitment', 'discord'],
  'community-features:levels': ['members', 'levels'], 'community-features:verification': ['members', 'verification'], 'community-features:buttonRoles': ['members', 'role-panels'],
  'community-features:birthdays': ['members', 'birthdays'], 'community-features:logs': ['moderation', 'logs'], 'community-features:starboard': ['engagement', 'starboard'],
  'community-features:giveaways': ['engagement', 'giveaways'], 'community-features:custom': ['engagement', 'commands'], 'community-features': ['members', 'levels'],
  'settings:recruitment': ['recruitment', 'settings'], 'applications': ['recruitment', 'applications'], 'interviews': ['recruitment', 'interviews'], 'onboarding-interview': ['recruitment', 'interviews'],
  'recruitment-settings': ['recruitment', 'settings'], 'recruiters': ['recruitment', 'recruiters'], 'recruiter-codes': ['recruitment', 'recruiters'], 'rewards': ['recruitment', 'rewards'],
  'recruitment-command-center': ['recruitment', 'overview'], 'candidates': ['recruitment', 'applications'],
  'community': ['members', 'welcome'], 'community-config': ['members', 'welcome'], 'welcome-onboarding': ['members', 'welcome'], 'members': ['members', 'directory'],
  'announcements': ['engagement', 'messages', 'once'], 'campaigns': ['engagement', 'messages', 'repeat'], 'reminders': ['engagement', 'messages', 'remind'], 'polls': ['engagement', 'polls'], 'templates': ['engagement', 'templates'],
  'events': ['engagement', 'events'], 'events-automation': ['engagement', 'events'],
  'warnings': ['moderation', 'warnings'], 'blacklist': ['moderation', 'blacklist'],
  'team-access': ['settings', 'team'], 'integrations': ['settings', 'integrations'], 'google-calendar': ['settings', 'integrations'], 'spreadsheet': ['recruitment', 'discord'],
  'notifications': ['settings', 'notifications'], 'pricing-trust': ['settings', 'plan'],
};

const TAB_KEY = 'cm_module_tab';

/** Translate an old section (plus an optional pending tab) into module + tab. */
export function resolveSection(section: string): { section: string; tab?: string } {
  let pending: string | null = null;
  try { pending = sessionStorage.getItem('cm_open_tab'); } catch { /* ignore */ }
  const hit = (pending && LEGACY[`${section}:${pending}`]) || LEGACY[section];
  if (hit) {
    try { sessionStorage.removeItem('cm_open_tab'); if (hit[2]) sessionStorage.setItem('cm_sub', `${hit[1]}:${hit[2]}`); } catch { /* ignore */ }
    return { section: hit[0], tab: hit[1] };
  }
  if (MODULES[section] && pending && MODULES[section].tabs.some((t) => t.id === pending)) {
    try { sessionStorage.removeItem('cm_open_tab'); } catch { /* ignore */ }
    return { section, tab: pending };
  }
  return { section };
}
export function setPendingModuleTab(tab?: string) {
  try { if (tab) sessionStorage.setItem(TAB_KEY, tab); } catch { /* ignore */ }
}

function urlTab(): string | null {
  try { return new URLSearchParams(window.location.search).get('t'); } catch { return null; }
}

export function ModuleView({ module, ctx }: { module: ModuleDef; ctx: ModuleCtx }) {
  const pick = () => {
    let t: string | null = null;
    try { t = sessionStorage.getItem(TAB_KEY); sessionStorage.removeItem(TAB_KEY); } catch { /* ignore */ }
    t = t || urlTab();
    return module.tabs.some((x) => x.id === t) ? (t as string) : module.tabs[0].id;
  };
  const [tab, setTab] = useState(pick);
  useEffect(() => { setTab(pick()); }, [module.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the open tab in the address so a reload comes back to it.
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('s', module.id);
      u.searchParams.set('t', tab);
      window.history.replaceState(window.history.state, '', u.toString());
    } catch { /* ignore */ }
  }, [module.id, tab]);
  useEffect(() => {
    const onTab = (e: Event) => { const t = (e as CustomEvent).detail; if (module.tabs.some((x) => x.id === t)) setTab(t); };
    window.addEventListener('cm:module-tab', onTab);
    return () => window.removeEventListener('cm:module-tab', onTab);
  }, [module]);

  const current = module.tabs.find((t) => t.id === tab) || module.tabs[0];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{module.title}</h1>
        <p className="mt-1 text-slate-600">{module.desc}</p>
      </div>
      <div role="tablist" aria-label={`${module.title} sections`} className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 bg-[inherit] px-1 backdrop-blur">
        {module.tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === current.id} onClick={() => setTab(t.id)}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-semibold transition ${t.id === current.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-500">{current.hint}</p>
      <div key={`${module.id}:${current.id}`}><Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading…</div>}>{current.render(ctx)}</Suspense></div>
    </div>
  );
}
