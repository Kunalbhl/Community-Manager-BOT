import React, { useState } from 'react';
import { Header } from './components/layout/Header.js';
import { Sidebar } from './components/layout/Sidebar.js';
import { NotificationDrawer } from './components/layout/NotificationDrawer.js';
import { ContactPage } from './components/site/ContactPage.js';
import { DiscordRedirect } from './components/site/DiscordRedirect.js';
import { CommunityFeaturesView } from './components/views/community/CommunityFeaturesView.js';
import { HomeToday } from './components/views/community/HomeToday.js';
import { ServerToolsView } from './components/views/community/ServerToolsView.js';
import { AccessDeniedView } from './components/views/AccessDeniedView.js';
import { ApplicantPortalView } from './components/views/ApplicantPortalView.js';
import { RecruiterPortalView } from './components/views/RecruiterPortalView.js';

// Platform Views
import { PlatformOverviewView } from './components/views/platform/PlatformOverviewView.js';
import { PlatformServersView } from './components/views/platform/PlatformServersView.js';
import { PlatformUsersView } from './components/views/platform/PlatformUsersView.js';
import { PlatformAnalyticsView } from './components/views/platform/PlatformAnalyticsView.js';
import { PlatformFeedbackView } from './components/views/platform/PlatformFeedbackView.js';
import { PlatformHealthView } from './components/views/platform/PlatformHealthView.js';
import { PlatformSettingsView } from './components/views/platform/PlatformSettingsView.js';
import { PlatformAuditView } from './components/views/platform/PlatformAuditView.js';
import { PlatformAuthModal } from './components/views/platform/PlatformAuthModal.js';

// Community Views (5 Top-Level Features + Legacy Sub-modules)
import { CommunityOverviewView } from './components/views/community/CommunityOverviewView.js';
import { ApplicationsView } from './components/views/community/ApplicationsView.js';
import { InterviewsView } from './components/views/community/InterviewsView.js';
import { RecruitersView } from './components/views/community/RecruitersView.js';
import { RecruiterCodesView } from './components/views/community/RecruiterCodesView.js';
import { MembersView } from './components/views/community/MembersView.js';
import { CommunityHubView } from './components/views/community/CommunityHubView.js';
import { CommunityConfigView } from './components/views/community/CommunityConfigView.js';
import { NotificationsView } from './components/views/community/NotificationsView.js';
import { RewardsView } from './components/views/community/RewardsView.js';
import { SpreadsheetView } from './components/views/community/SpreadsheetView.js';
import { ReportsView } from './components/views/community/ReportsView.js';
import { PermissionsView } from './components/views/community/PermissionsView.js';
import { CommunitySettingsView } from './components/views/community/CommunitySettingsView.js';
import { RecruitmentTrustView } from './components/views/community/RecruitmentTrustView.js';
import { WelcomeOnboardingView } from './components/views/community/WelcomeOnboardingView.js';
import { RecruiterRecordsView } from './components/views/community/RecruiterRecordsView.js';
import { CampaignWorkspaceView } from './components/views/community/CampaignWorkspaceView.js';

import { EngagementView } from './components/views/community/EngagementView.js';
import { ModerationView } from './components/views/community/ModerationView.js';
import { EventsView } from './components/views/community/EventsView.js';
import { AutomationView } from './components/views/community/AutomationView.js';
import { InsightsDashboardView } from './components/views/community/InsightsDashboardView.js';
import { ConnectionCenterView } from './components/views/community/ConnectionCenterView.js';
import { AiAssistantView } from './components/views/community/AiAssistantView.js';
import { DiscordConnectionCenter } from './components/views/community/DiscordConnectionCenter.js';
import { DiscordOperationsControlCenter } from './components/views/community/DiscordOperationsControlCenter.js';
import { OnboardingWizardView } from './components/views/community/OnboardingWizardView.js';
import { WorkspaceSettingsView } from './components/views/community/WorkspaceSettingsView.js';
import { PublicPricingTrustView } from './components/views/community/PublicPricingTrustView.js';
import { LifecycleIntelligenceView } from './components/views/lifecycle/LifecycleIntelligenceView.js';
import { CommandMenu } from './components/common/CommandMenu.js';
import { SupportTroubleshootingModal } from './components/common/SupportTroubleshootingModal.js';
import { FirstLoginCalendarModal } from './components/common/FirstLoginCalendarModal.js';
import { DiscordOAuthDiagnosticModal } from './components/common/DiscordOAuthDiagnosticModal.js';

import { PrivacyPolicyView } from './components/views/public/PrivacyPolicyView.js';
import { TermsOfServiceView } from './components/views/public/TermsOfServiceView.js';
import { SupportView } from './components/views/public/SupportView.js';
import { PublicLandingView } from './components/views/public/PublicLandingView.js';
import { MultiServerSelectorView } from './components/common/MultiServerSelectorView.js';
import { SiteLanding } from './components/site/SiteLanding.js';
import { ServerPickerPage } from './components/site/ServerPickerPage.js';

import { PortalMode, PlatformSection, CommunitySection } from './types/ui.js';
import { UserRole, Permission } from '../shared/types/rbac.js';
import { hasPermission } from '../server/security/rbac.js';
import { getDiscordLoginUrl } from './lib/discordUrls.js';

// Community section permission mapping
const COMMUNITY_SECTION_PERMISSIONS: Partial<Record<CommunitySection, Permission>> = {
  home: 'community.view',
  dashboard: 'community.view',
  community: 'community.view',
  engagement: 'community.view',
  recruitment: 'applications.view',
  moderation: 'community.view',
  'events-automation': 'community.view',
  'insights-ai': 'reports.view',
  integrations: 'community.view',
  settings: 'settings.view',
  applications: 'applications.view',
  recruiters: 'recruiters.view',
  'recruiter-codes': 'recruiterCodes.view',
  'recruiter-records': 'recruiters.view',
  interviews: 'interviews.view',
  members: 'users.view',
  notifications: 'notifications.view',
  reports: 'reports.view',
  'community-config': 'community.view',
  permissions: 'community.manage',
  rewards: 'rewards.view',
  spreadsheet: 'settings.view',
  ai: 'community.view',
  'welcome-onboarding': 'community.view',
  announcements: 'community.view',
  campaigns: 'community.view',
  polls: 'community.view',
  templates: 'community.view',
  warnings: 'community.view',
  blacklist: 'community.view',
  channels: 'community.view',
  events: 'community.view',
  automation: 'community.view',
  'insights-dashboard': 'reports.view',
  'google-calendar': 'community.view',
  'discord-gateway': 'community.view',
  'lifecycle-intelligence': 'applications.view',
  'recruitment-command-center': 'applications.view',
  candidates: 'applications.view',
  'onboarding-interview': 'applications.view',
  'recruitment-settings': 'settings.manage',
};

const getInitialCommunity = (): string => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('selected_community_id');
    if (saved) return saved;
  }
  return 'comm_default';
};

export default function App() {
  const currentPath = typeof window !== 'undefined' ? window.location.pathname.toLowerCase() : '';

  if (currentPath === '/privacy' || currentPath === '/privacy-policy') {
    return <PrivacyPolicyView onBack={() => { window.location.href = '/'; }} />;
  }
  if (currentPath === '/terms' || currentPath === '/terms-of-service') {
    return <TermsOfServiceView onBack={() => { window.location.href = '/'; }} />;
  }
  if (currentPath === '/support') {
    return <SupportView onBack={() => { window.location.href = '/'; }} />;
  }
  // Public website and server picker (the dashboard lives at /dashboard).
  if (currentPath === '' || currentPath === '/' || currentPath === '/landing' || currentPath === '/login') {
    return <SiteLanding />;
  }
  if (currentPath === '/servers') {
    return <ServerPickerPage />;
  }
  if (currentPath === '/contact' || currentPath === '/contact-us') {
    return <ContactPage />;
  }
  if (currentPath === '/discord' || currentPath === '/feedback') {
    return <DiscordRedirect />;
  }

  // Navigation & Scope State
  const [portalMode, setPortalMode] = useState<PortalMode>('COMMUNITY_DASHBOARD');
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [activeCommunitySection, setActiveCommunitySection] = useState<CommunitySection>('dashboard');
  const [activePlatformSection, setActivePlatformSection] = useState<PlatformSection>('overview');

  // Tenant / Community & Workspace Context
  const [selectedCommunity, setSelectedCommunity] = useState<string>(getInitialCommunity);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>('');
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState<boolean>(false);

  // Authoritative Discord User Session
  const [currentUser, setCurrentUser] = useState<{
    id?: string;
    discordUserId?: string;
    username?: string;
    discriminator?: string;
    avatar?: string;
    avatarUrl?: string;
    email?: string;
    isPlatformOwner?: boolean;
    role?: UserRole;
  } | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [sessionLoaded, setSessionLoaded] = useState<boolean>(false);
  const [showOAuthDiagnostics, setShowOAuthDiagnostics] = useState<boolean>(false);

  const [aiInitialAction, setAiInitialAction] = useState<any>(null);
  const [aiInitialPrompt, setAiInitialPrompt] = useState<string | undefined>(undefined);

  // Authoritative server-resolved Role and Permissions (for community)
  const [currentRole, setCurrentRole] = useState<UserRole>('APPLICANT');
  const [currentPermissions, setCurrentPermissions] = useState<Permission[]>([]);

  // Platform Authentication & Claim State
  const [platformKey, setPlatformKey] = useState<string>('cr_platform_verified_claim_token');
  const [isPlatformVerified, setIsPlatformVerified] = useState<boolean>(false);
  const [showPlatformAuthModal, setShowPlatformAuthModal] = useState<boolean>(false);

  // UI layout toggles
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [notificationsOpen, setNotificationsOpen] = useState<boolean>(false);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState<number>(0);
  const [commandMenuOpen, setCommandMenuOpen] = useState<boolean>(false);
  const [supportModalOpen, setSupportModalOpen] = useState<boolean>(false);

  // Dynamic Notification unread count poller
  const fetchUnreadNotifications = React.useCallback(async () => {
    if (!selectedCommunity) return;
    try {
      const res = await fetch(`/api/v1/notifications/unread-count?communityId=${encodeURIComponent(selectedCommunity)}`, {
        credentials: 'include',
        headers: {
          'x-community-id': selectedCommunity,
          ...(isPlatformVerified ? { 'x-platform-key': platformKey } : {}),
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (typeof json.unreadCount === 'number') {
          setUnreadNotificationsCount(json.unreadCount);
        }
      }
    } catch {
      // Safe fallback
    }
  }, [selectedCommunity, isPlatformVerified, platformKey]);

  React.useEffect(() => {
    if (!selectedCommunity) return;
    fetchUnreadNotifications();
    const interval = setInterval(fetchUnreadNotifications, 20000);
    return () => clearInterval(interval);
  }, [fetchUnreadNotifications, selectedCommunity]);

  // Global Cmd+K / Ctrl+K listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandMenuOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Hydrate authoritative Discord Client ID dynamically on startup
  React.useEffect(() => {
    fetch('/api/v1/discord/diagnostics', { credentials: 'include' })
      .then((res) => res.json())
      .then((payload) => {
        if (payload?.data?.clientId) {
          (window as any).__DISCORD_CLIENT_ID__ = payload.data.clientId;
        }
      })
      .catch(() => {
        // Safe fallback
      });
  }, []);

  // Onboarding State
  const [showOnboardingFlow, setShowOnboardingFlow] = useState<boolean>(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'onboarding'
  );
  const [onboardingRequired, setOnboardingRequired] = useState<boolean>(false);
  const [showCalendarSetupModal, setShowCalendarSetupModal] = useState<boolean>(false);

  // Check onboarding status & first-login calendar setup status
  React.useEffect(() => {
    if (!selectedCommunity) return;
    const checkOnboarding = async () => {
      try {
        const res = await fetch(`/api/v1/onboarding/status?communityId=${selectedCommunity}`, {
          credentials: 'include',
          headers: {
            'x-community-id': selectedCommunity,
            ...(isPlatformVerified ? { 'x-platform-key': platformKey } : {}),
          },
        });
        if (!res.ok) return;
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) return;
        const json = await res.json();
        if (json.success && json.data) {
          setOnboardingRequired(json.data.onboardingRequired);
          if (json.data.onboardingRequired) {
            setShowOnboardingFlow(true);
          }
        }
      } catch (err) {
        console.error('Failed checking onboarding status', err);
      }
    };

    const checkCalendarSetup = async () => {
      try {
        const res = await fetch(`/api/v1/calendar/setup-status?communityId=${selectedCommunity}&recordPrompt=true`, {
          credentials: 'include',
          headers: {
            'x-community-id': selectedCommunity,
            ...(isPlatformVerified ? { 'x-platform-key': platformKey } : {}),
          },
        });
        if (!res.ok) return;
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) return;
        const json = await res.json();
        if (json.success && json.data?.shouldShowFirstLoginPrompt) {
          setShowCalendarSetupModal(true);
        }
      } catch (err) {
        console.error('Failed checking calendar setup status', err);
      }
    };

    checkOnboarding();
    checkCalendarSetup();
  }, [selectedCommunity, isPlatformVerified, platformKey]);

  // Fetch authentication context from the server dynamically
  const fetchSession = React.useCallback(async () => {
    try {
      const headers: Record<string, string> = {
        'x-community-id': selectedCommunity,
      };
      if (isPlatformVerified) {
        headers['x-platform-key'] = platformKey;
      }
      const res = await fetch(`/api/v1/auth/session`, {
        credentials: 'include',
        headers,
      });
      if (res.status === 401) {
        setIsAuthenticated(false);
        setCurrentUser(null);
        setCurrentRole('APPLICANT');
        document.cookie = 'discord_session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT;';
        setPortalMode('APPLICANT_PORTAL');
      } else if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setIsAuthenticated(Boolean(json.data.authenticated));
          // Signed-out visitors on the admin dashboard belong on the website (applicants use ?view=apply).
          const params = new URLSearchParams(window.location.search);
          if (!json.data.authenticated && window.location.pathname.startsWith('/dashboard') && params.get('view') !== 'apply') {
            window.location.href = '/';
            return;
          }
          if (json.data.user) {
            setCurrentUser(json.data.user);
            setCurrentRole(json.data.user.role || 'APPLICANT');
            setCurrentPermissions(json.data.user.customPermissions || []);

            if (json.data.user.communityId && (!selectedCommunity || selectedCommunity === 'comm_default')) {
              setSelectedCommunity(json.data.user.communityId);
              if (typeof window !== 'undefined') {
                localStorage.setItem('selected_community_id', json.data.user.communityId);
              }
            }

            // Only switch to community dashboard if user is promoted out of applicant
            if (portalMode === 'APPLICANT_PORTAL' && json.data.user.role !== 'APPLICANT') {
              setPortalMode('COMMUNITY_DASHBOARD');
            }

            // If role is still APPLICANT and we are on the onboarding/dashboard page,
            // it means no real Discord session exists. Show login prompt.
            if (json.data.user.role === 'APPLICANT' && !window.location.pathname.includes('/landing')) {
              const hasSessionCookie = document.cookie.includes('discord_session_token');
              if (!hasSessionCookie) {
                setCurrentRole('APPLICANT');
                setPortalMode('APPLICANT_PORTAL');
              }
            }
          } else {
            setCurrentUser(null);
          }
        }
      }
    } catch (err) {
      console.error('Session retrieval failed', err);
    } finally {
      setSessionLoaded(true);
    }
  }, [selectedCommunity, isPlatformVerified, platformKey]);

  React.useEffect(() => {
    fetchSession();
  }, [fetchSession, refreshTrigger]);

  const handleLoginWithDiscord = () => {
    window.location.href = getDiscordLoginUrl();
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      setIsAuthenticated(false);
      setCurrentUser(null);
    } catch (err) {
      console.error('Failed to logout', err);
    }
    window.location.href = '/';
  };

  const handleRoleChange = (newRole: UserRole) => {
    setCurrentRole(newRole);
    if (newRole === 'APPLICANT') {
      setPortalMode('APPLICANT_PORTAL');
    }
  };

  const handleOpenPlatformAuth = () => {
    if (isPlatformVerified) {
      setPortalMode('PLATFORM_ADMIN');
    } else {
      setShowPlatformAuthModal(true);
    }
  };

  const handlePlatformAuthSuccess = (verifiedKey: string) => {
    setPlatformKey(verifiedKey);
    setIsPlatformVerified(true);
    setShowPlatformAuthModal(false);
    setPortalMode('PLATFORM_ADMIN');
  };

  // Check permissions for community scope using authoritative server permissions
  const requiredPermission = COMMUNITY_SECTION_PERMISSIONS[activeCommunitySection];
  const isCommunityAuthorized =
    currentRole === 'PLATFORM_OWNER' ||
    currentRole === 'OWNER' ||
    (currentRole !== 'APPLICANT' && (!requiredPermission || currentPermissions.includes(requiredPermission)));

  const renderCommunityContent = () => {
    if (!sessionLoaded) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
          <div className="flex items-center gap-3 text-slate-500">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
            Loading your server…
          </div>
        </div>
      );
    }
    if (!isCommunityAuthorized) {
      return (
        <AccessDeniedView
          currentRole={currentRole}
          requiredPermission={requiredPermission}
          isAuthenticated={isAuthenticated}
          onLoginWithDiscord={handleLoginWithDiscord}
          onGoToApplicantPortal={() => setPortalMode('APPLICANT_PORTAL')}
          onGoHome={() => setActiveCommunitySection('dashboard')}
        />
      );
    }

    switch (activeCommunitySection) {
      case 'home':
      case 'dashboard':
      case 'overview':
        return (
          <>
          <HomeToday communityId={selectedCommunity} onNavigate={(s) => setActiveCommunitySection(s as CommunitySection)} />
          <CommunityOverviewView
            currentRole={currentRole}
            communityId={selectedCommunity}
            onNavigate={(s) => setActiveCommunitySection(s as CommunitySection)}
          />
          </>
        );
      case 'community':
      case 'community-config':
        return <CommunityHubView communityId={selectedCommunity} currentRole={currentRole} />;
      case 'engagement':
        return <EngagementView communityId={selectedCommunity} initialTab="announcements" />;
      case 'recruitment':
      case 'recruitment-command-center':
        return <ApplicationsView communityId={selectedCommunity} currentRole={currentRole} initialTab="overview" />;
      case 'moderation':
        return <ModerationView communityId={selectedCommunity} initialTab="warnings" />;
      case 'community-features':
        return <CommunityFeaturesView communityId={selectedCommunity} />;
      case 'server-tools':
        return <ServerToolsView communityId={selectedCommunity} />;
      case 'events-automation':
        return <EventsView communityId={selectedCommunity} />;
      case 'insights-ai':
      case 'reports':
      case 'insights-dashboard':
        return (
          <InsightsDashboardView
            communityId={selectedCommunity}
            onNavigate={(s, meta) => {
              if (s === 'ai') {
                if (meta?.contextAction) {
                  setAiInitialAction(meta.contextAction);
                  setAiInitialPrompt(undefined);
                } else if (meta?.prompt) {
                  setAiInitialPrompt(meta.prompt);
                  setAiInitialAction(null);
                }
              }
              setActiveCommunitySection(s as CommunitySection);
            }}
          />
        );
      case 'integrations':
        return <ConnectionCenterView communityId={selectedCommunity} />;
      case 'settings':
        return <CommunitySettingsView communityId={selectedCommunity} currentRole={currentRole} />;
      case 'applications':
        return <ApplicationsView communityId={selectedCommunity} currentRole={currentRole} initialTab="applications" />;
      case 'candidates':
        return <ApplicationsView communityId={selectedCommunity} currentRole={currentRole} initialTab="candidates" />;
      case 'onboarding-interview':
      case 'interviews':
        return <ApplicationsView communityId={selectedCommunity} currentRole={currentRole} initialTab="interviews" />;
      case 'recruitment-settings':
        return <ApplicationsView communityId={selectedCommunity} currentRole={currentRole} initialTab="settings" />;
      case 'recruiters':
        return <RecruitersView communityId={selectedCommunity} currentRole={currentRole} />;
      case 'recruiter-codes':
        return <RecruiterCodesView communityId={selectedCommunity} currentRole={currentRole} />;
      case 'members':
        return <MembersView communityId={selectedCommunity} currentRole={currentRole} />;
      case 'notifications':
        return (
          <NotificationsView
            communityId={selectedCommunity}
            currentRole={currentRole}
            onNavigateToSection={(s) => setActiveCommunitySection(s as CommunitySection)}
          />
        );
      case 'rewards':
        return <RewardsView communityId={selectedCommunity} currentRole={currentRole} />;
      case 'spreadsheet':
        return <SpreadsheetView communityId={selectedCommunity} currentRole={currentRole} />;
      case 'ai':
        return (
          <AiAssistantView
            communityId={selectedCommunity}
            initialPrompt={aiInitialPrompt}
            initialContextAction={aiInitialAction}
            onNavigateToInsights={(tab, deepLink) => {
              setActiveCommunitySection('insights-dashboard');
            }}
            onNavigateToModule={(mod) => {
              setActiveCommunitySection(mod as any);
            }}
          />
        );
      case 'permissions':
        return <PermissionsView communityId={selectedCommunity} currentRole={currentRole} />;
      case 'recruitment-trust':
        return <RecruitmentTrustView communityId={selectedCommunity} currentRole={currentRole} initialTab="referrals" />;
      case 'channels':
        return <RecruitmentTrustView communityId={selectedCommunity} currentRole={currentRole} initialTab="channels" />;
      case 'welcome-onboarding':
        return <WelcomeOnboardingView communityId={selectedCommunity} />;
      case 'campaign-workspace':
        return <CampaignWorkspaceView communityId={selectedCommunity} currentRole={currentRole} />;
      case 'announcements':
        return <EngagementView communityId={selectedCommunity} initialTab="announcements" />;
      case 'campaigns':
        return <EngagementView communityId={selectedCommunity} initialTab="campaigns" />;
      case 'polls':
        return <EngagementView communityId={selectedCommunity} initialTab="polls" />;
      case 'templates':
        return <EngagementView communityId={selectedCommunity} initialTab="templates" />;
      case 'warnings':
        return <ModerationView communityId={selectedCommunity} initialTab="warnings" />;
      case 'incidents':
        return <ModerationView communityId={selectedCommunity} initialTab="incidents" />;
      case 'automod':
        return <ModerationView communityId={selectedCommunity} initialTab="automod" />;
      case 'blacklist':
        return <ModerationView communityId={selectedCommunity} initialTab="blacklist" />;
      case 'restrictions':
        return <ModerationView communityId={selectedCommunity} initialTab="restrictions" />;
      case 'security-audit':
        return <ModerationView communityId={selectedCommunity} initialTab="security-audit" />;
      case 'events':
        return <EventsView communityId={selectedCommunity} />;
      case 'automation':
        return <AutomationView communityId={selectedCommunity} />;
      case 'google-calendar':
        return <ConnectionCenterView communityId={selectedCommunity} />;
      case 'discord-gateway':
        return <DiscordConnectionCenter communityId={selectedCommunity} />;
      case 'discord-ops':
      case 'server-hygiene':
        return <DiscordOperationsControlCenter communityId={selectedCommunity} />;
      case 'recruiter-records':
        return <RecruiterRecordsView communityId={selectedCommunity} />;
      case 'pricing-trust':
        return <PublicPricingTrustView communityId={selectedCommunity} currentPlan="FREE" canEdit={hasPermission({ userId: (currentUser as any)?.userId || currentUser?.id || '', isPlatformOwner: currentUser?.isPlatformOwner, role: currentRole, customPermissions: currentPermissions.length ? currentPermissions : undefined } as any, 'settings.manage')} />;
      case 'lifecycle-intelligence':
        return (
          <LifecycleIntelligenceView
            communityId={selectedCommunity}
            currentRole={currentRole}
            onNavigate={(s) => setActiveCommunitySection(s as CommunitySection)}
          />
        );
      default:
        return (
          <CommunityOverviewView
            currentRole={currentRole}
            communityId={selectedCommunity}
            onNavigate={(s) => setActiveCommunitySection(s as CommunitySection)}
          />
        );
    }
  };

  const renderPlatformContent = () => {
    switch (activePlatformSection) {
      case 'overview':
        return (
          <PlatformOverviewView
            platformKey={platformKey}
            onNavigate={(s) => setActivePlatformSection(s as PlatformSection)}
          />
        );
      case 'servers':
        return <PlatformServersView platformKey={platformKey} />;
      case 'users':
        return <PlatformUsersView platformKey={platformKey} />;
      case 'analytics':
        return <PlatformAnalyticsView platformKey={platformKey} />;
      case 'feedback':
        return <PlatformFeedbackView platformKey={platformKey} />;
      case 'health':
        return <PlatformHealthView platformKey={platformKey} />;
      case 'settings':
        return <PlatformSettingsView platformKey={platformKey} />;
      case 'audit':
        return <PlatformAuditView platformKey={platformKey} />;
      default:
        return (
          <PlatformOverviewView
            platformKey={platformKey}
            onNavigate={(s) => setActivePlatformSection(s as PlatformSection)}
          />
        );
    }
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50 font-sans text-slate-800 antialiased">
      {/* Sidebar with Dual Modes & Role Filtering */}
      <Sidebar
        portalMode={portalMode}
        currentRole={currentRole}
        activePlatformSection={activePlatformSection}
        onSelectPlatformSection={(s) => setActivePlatformSection(s)}
        activeCommunitySection={activeCommunitySection}
        onSelectCommunitySection={(s) => setActiveCommunitySection(s)}
        onSelectPortalMode={(m) => setPortalMode(m)}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenPlatformAuth={handleOpenPlatformAuth}
        selectedCommunity={selectedCommunity}
      />

      {/* Main Column */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Universal Header */}
        <Header
          currentRole={currentRole}
          onRoleChange={handleRoleChange}
          selectedCommunity={selectedCommunity}
          onCommunityChange={(commId) => {
            setSelectedCommunity(commId);
            if (typeof window !== 'undefined') {
              localStorage.setItem('selected_community_id', commId);
            }
            setShowOnboardingFlow(false);
            setShowWorkspaceSettings(false);
          }}
          selectedWorkspaceId={selectedWorkspaceId}
          onSelectWorkspace={(wsId) => {
            setSelectedWorkspaceId(wsId);
            setShowWorkspaceSettings(false);
          }}
          onOpenWorkspaceSettings={() => setShowWorkspaceSettings(true)}
          portalMode={portalMode}
          onSelectPortalMode={(m) => {
            setPortalMode(m);
            setShowWorkspaceSettings(false);
          }}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onToggleNotifications={() => setNotificationsOpen(!notificationsOpen)}
          unreadNotificationsCount={unreadNotificationsCount}
          onOpenPlatformAuth={handleOpenPlatformAuth}
          isPlatformVerified={isPlatformVerified}
          currentUser={currentUser}
          isAuthenticated={isAuthenticated}
          onLoginWithDiscord={handleLoginWithDiscord}
          onLogout={handleLogout}
          onOpenOAuthDiagnostics={() => setShowOAuthDiagnostics(true)}
          onStartOnboarding={() => {
            setShowWorkspaceSettings(false);
            setShowOnboardingFlow(true);
          }}
          onOpenCommandMenu={() => setCommandMenuOpen(true)}
          onOpenHelp={() => setSupportModalOpen(true)}
        />

        {/* Dynamic Content View */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1920px]">
            {showWorkspaceSettings && portalMode === 'COMMUNITY_DASHBOARD' ? (
              <WorkspaceSettingsView
                workspaceId={selectedWorkspaceId}
                onClose={() => setShowWorkspaceSettings(false)}
              />
            ) : showOnboardingFlow && portalMode === 'COMMUNITY_DASHBOARD' ? (
              <OnboardingWizardView
                communityId={selectedCommunity}
                onComplete={(completedCommId) => {
                  setSelectedCommunity(completedCommId);
                  setShowOnboardingFlow(false);
                  setOnboardingRequired(false);
                }}
              />
            ) : portalMode === 'PLATFORM_ADMIN' ? (
              renderPlatformContent()
            ) : portalMode === 'RECRUITER_PORTAL' ? (
              <RecruiterPortalView
                communityId={selectedCommunity}
                onBackToAdmin={() => setPortalMode('COMMUNITY_DASHBOARD')}
              />
            ) : portalMode === 'APPLICANT_PORTAL' ? (
              <ApplicantPortalView
                communityId={selectedCommunity}
                onBackToAdmin={() => setPortalMode('COMMUNITY_DASHBOARD')}
              />
            ) : portalMode === 'PUBLIC_LANDING' ? (
              <PublicLandingView
                onLogin={() => {
                  setRefreshTrigger((prev) => prev + 1);
                  setPortalMode('COMMUNITY_DASHBOARD');
                }}
                onAddDiscord={() => setShowOnboardingFlow(true)}
                onNavigateToSupport={() => { window.location.href = '/support'; }}
                onNavigateToPrivacy={() => { window.location.href = '/privacy'; }}
                onNavigateToTerms={() => { window.location.href = '/terms'; }}
              />
            ) : portalMode === 'SERVER_SELECTION' ? (
              <MultiServerSelectorView
                selectedCommunityId={selectedCommunity}
                onSelectCommunity={(commId) => {
                  setSelectedCommunity(commId);
                  setPortalMode('COMMUNITY_DASHBOARD');
                }}
                onStartOnboarding={(guildId, commId) => {
                  setSelectedCommunity(commId);
                  setShowOnboardingFlow(true);
                  setPortalMode('COMMUNITY_DASHBOARD');
                }}
              />
            ) : (
              renderCommunityContent()
            )}
          </div>
        </main>
      </div>

      {/* Notification Drawer */}
      <NotificationDrawer
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onNavigateToSection={(s) => setActiveCommunitySection(s as CommunitySection)}
        onNotificationsUpdated={fetchUnreadNotifications}
      />

      {/* Global Command & Search Menu */}
      <CommandMenu
        isOpen={commandMenuOpen}
        onClose={() => setCommandMenuOpen(false)}
        communityId={selectedCommunity}
        currentRole={currentRole}
        portalMode={portalMode}
        onNavigate={(section) => {
          setPortalMode('COMMUNITY_DASHBOARD');
          setActiveCommunitySection(section);
        }}
        onNavigatePlatform={(section) => {
          setPortalMode('PLATFORM_ADMIN');
          setActivePlatformSection(section);
        }}
      />

      {/* Platform Owner Authorization Challenge Gate */}
      <PlatformAuthModal
        isOpen={showPlatformAuthModal}
        onClose={() => setShowPlatformAuthModal(false)}
        onSuccess={handlePlatformAuthSuccess}
      />

      {/* System Diagnostics & Help Modal */}
      <SupportTroubleshootingModal
        isOpen={supportModalOpen}
        onClose={() => setSupportModalOpen(false)}
        communityId={selectedCommunity}
      />

      {/* Discord OAuth Diagnostics Modal */}
      <DiscordOAuthDiagnosticModal
        isOpen={showOAuthDiagnostics}
        onClose={() => setShowOAuthDiagnostics(false)}
        onLoginSuccess={fetchSession}
      />

      {/* TASK 61 First-Login Google Calendar Onboarding Prompt */}
      <FirstLoginCalendarModal
        isOpen={showCalendarSetupModal}
        onClose={() => setShowCalendarSetupModal(false)}
        onConnected={() => setShowCalendarSetupModal(false)}
        onSkipped={() => setShowCalendarSetupModal(false)}
        communityId={selectedCommunity}
      />
    </div>
  );
}
