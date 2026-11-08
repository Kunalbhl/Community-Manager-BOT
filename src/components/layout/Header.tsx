import React, { useState, useRef, useEffect } from 'react';
import {
  Bell,
  Menu,
  Shield,
  ChevronDown,
  Layers,
  Search,
  HelpCircle,
  ArrowLeft,
  User,
  Settings,
  Activity,
  Check,
  ExternalLink,
  Lock,
  Bot,
  LogOut,
  LogIn,
  FileCode2, RefreshCw } from 'lucide-react';
import { UserRole } from '../../../shared/types/rbac.js';
import { PortalMode } from '../../types/ui.js';
import { WorkspaceSwitcher } from './WorkspaceSwitcher.js';
import { getAddToDiscordUrl, getDiscordClientId } from '../../lib/discordUrls.js';

interface HeaderProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  selectedCommunity: string;
  onCommunityChange: (community: string) => void;
  selectedWorkspaceId?: string;
  onSelectWorkspace?: (workspaceId: string) => void;
  onOpenWorkspaceSettings?: () => void;
  portalMode: PortalMode;
  onSelectPortalMode: (mode: PortalMode) => void;
  onToggleSidebar: () => void;
  onToggleNotifications: () => void;
  unreadNotificationsCount: number;
  onOpenPlatformAuth?: () => void;
  isPlatformVerified?: boolean;
  currentUser?: {
    userId?: string;
    discordUserId?: string;
    username?: string;
    discriminator?: string;
    avatar?: string;
    avatarUrl?: string;
    email?: string;
    isPlatformOwner?: boolean;
    role?: UserRole;
  } | null;
  isAuthenticated?: boolean;
  onLoginWithDiscord?: () => void;
  onLogout?: () => void;
  onOpenOAuthDiagnostics?: () => void;
  onStartOnboarding?: () => void;
  onOpenCommandMenu?: () => void;
  onOpenHelp?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onRoleChange,
  selectedCommunity,
  onCommunityChange,
  selectedWorkspaceId,
  onSelectWorkspace,
  onOpenWorkspaceSettings,
  portalMode,
  onSelectPortalMode,
  onToggleSidebar,
  onToggleNotifications,
  unreadNotificationsCount,
  onOpenPlatformAuth,
  isPlatformVerified,
  currentUser,
  isAuthenticated = false,
  onLoginWithDiscord,
  onLogout,
  onOpenOAuthDiagnostics,
  onStartOnboarding,
  onOpenCommandMenu,
  onOpenHelp,
}) => {
  const [showCommunityDropdown, setShowCommunityDropdown] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [fetchedCommunities, setFetchedCommunities] = useState<Array<{ id: string; name: string }>>([]);

  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const communityDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
      if (communityDropdownRef.current && !communityDropdownRef.current.contains(event.target as Node)) {
        setShowCommunityDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load communities dynamically from API
  useEffect(() => {
    fetch('/api/v1/community')
      .then((res) => res.json())
      .then((json) => {
        if (json.success && Array.isArray(json.data)) {
          setFetchedCommunities(json.data);
          if (json.data.length > 0 && (!selectedCommunity || !json.data.some((c: any) => c.id === selectedCommunity))) {
            onCommunityChange(json.data[0].id);
          }
        }
      })
      .catch(() => {});
  }, [selectedCommunity, onCommunityChange]);

  const communities = fetchedCommunities;

  const getRoleBadgeStyle = (role: UserRole) => {
    switch (role) {
      case 'PLATFORM_OWNER':
        return 'bg-indigo-900 text-white border-indigo-700';
      case 'OWNER':
        return 'bg-amber-100 text-amber-900 border-amber-300';
      case 'CONTROLLER':
        return 'bg-purple-100 text-purple-900 border-purple-300';
      case 'INTERVIEWER':
        return 'bg-blue-100 text-blue-900 border-blue-300';
      case 'RECRUITER':
        return 'bg-emerald-100 text-emerald-900 border-emerald-300';
      case 'MEMBER':
        return 'bg-slate-100 text-slate-800 border-slate-300';
      case 'APPLICANT':
        return 'bg-rose-100 text-rose-900 border-rose-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  const displayName = currentUser?.username
    ? `${currentUser.username}${currentUser.discriminator && currentUser.discriminator !== '0' ? `#${currentUser.discriminator}` : ''}`
    : isAuthenticated
    ? 'Discord Member'
    : 'Guest (Unauthenticated)';

  const avatarUrl =
    currentUser?.avatarUrl ||
    (currentUser?.discordUserId && currentUser?.avatar
      ? `https://cdn.discordapp.com/avatars/${currentUser.discordUserId}/${currentUser.avatar}.png`
      : undefined);

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
      {/* LEFT: Navigation triggers & Workspace/Community Selectors */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus:outline-hidden lg:hidden"
          aria-label="Toggle navigation sidebar"
          id="btn-toggle-sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        {portalMode === 'PLATFORM_ADMIN' ? (
          /* Platform Mode Indicator */
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-900 px-3 py-1.5 text-xs font-bold text-white shadow-xs">
              <Shield className="h-3.5 w-3.5 text-indigo-300" />
              <span>PLATFORM OWNER PORTAL</span>
            </span>
            <button
              onClick={() => onSelectPortalMode('COMMUNITY_DASHBOARD')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Community Scope</span>
            </button>
          </div>
        ) : (
          /* SaaS Workspace & Community Selectors */
          <div className="flex items-center gap-2.5">
            {onSelectWorkspace && (
              <WorkspaceSwitcher
                selectedWorkspaceId={selectedWorkspaceId}
                onSelectWorkspace={onSelectWorkspace}
                onOpenWorkspaceSettings={onOpenWorkspaceSettings}
                onOpenCreateWorkspaceModal={onStartOnboarding}
              />
            )}

            <div className="relative flex items-center" ref={communityDropdownRef}>
              <button
                onClick={() => setShowCommunityDropdown(!showCommunityDropdown)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                id="btn-community-selector"
              >
                <Layers className="h-4 w-4 text-indigo-600" />
                <span className="max-w-[130px] truncate sm:max-w-[190px]">
                  {communities.find((c) => c.id === selectedCommunity)?.name || 'Select Server'}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
              <a href="/servers" className="ml-2 hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-indigo-300 hover:text-indigo-700 sm:inline-flex" title="See all your servers">
                <RefreshCw className="h-3.5 w-3.5" /> Switch server
              </a>

              {showCommunityDropdown && (
                <div className="absolute left-0 top-full mt-2 w-64 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg z-50">
                  <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Discord Communities (Tenants)
                  </div>
                  {communities.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        onCommunityChange(c.id);
                        setShowCommunityDropdown(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition ${
                        selectedCommunity === c.id
                          ? 'bg-indigo-50 font-medium text-indigo-700'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="truncate">{c.name}</span>
                      {selectedCommunity === c.id && (
                        <span className="text-xs text-indigo-600 font-semibold">Active</span>
                      )}
                    </button>
                  ))}

                  <div className="pt-1.5 mt-1 border-t border-slate-100 space-y-1">
                    {onStartOnboarding && (
                      <button
                        onClick={() => {
                          onStartOnboarding();
                          setShowCommunityDropdown(false);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition"
                      >
                        <span>+ Connect New Server (Setup)</span>
                      </button>
                    )}
                    <a
                      href={getDiscordClientId() ? getAddToDiscordUrl() : '#'}
                      onClick={(e) => {
                        if (!getDiscordClientId()) {
                          e.preventDefault();
                          alert('Discord integration is not configured on the server. Please set DISCORD_CLIENT_ID or DISCORD_APPLICATION_ID in the environment settings.');
                        }
                      }}
                      target={getDiscordClientId() ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-semibold ${!getDiscordClientId() ? 'text-slate-400 bg-slate-100 cursor-not-allowed' : 'text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100'} transition`}
                      id="btn-add-to-discord-header"
                    >
                      <Bot className="h-3.5 w-3.5 text-indigo-600" />
                      <span>Add to Discord</span>
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CENTER: Professional Global Search (420px - 560px on desktop) */}
      <div className="hidden md:flex flex-1 items-center justify-center px-4 max-w-xl mx-auto">
        {onOpenCommandMenu && (
          <button
            onClick={onOpenCommandMenu}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50/90 px-3.5 py-2 text-xs text-slate-500 shadow-2xs transition hover:border-slate-300 hover:bg-white hover:text-slate-800"
            title="Global Command Search (⌘K / Ctrl+K)"
            id="btn-global-command-search"
          >
            <div className="flex items-center gap-2.5">
              <Search className="h-4 w-4 text-indigo-600" />
              <span className="font-medium text-slate-600">
                Search applicants, members, workflows, actions...
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <kbd className="rounded bg-slate-200/80 px-2 py-0.5 text-[10px] font-mono font-bold text-slate-600 shadow-3xs">
                ⌘K
              </kbd>
            </div>
          </button>
        )}
      </div>

      {/* RIGHT: OAuth Diagnostics / Profile / Help / Notifications */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* OAuth Diagnostics Trigger */}
        {onOpenOAuthDiagnostics && (
          <button
            onClick={onOpenOAuthDiagnostics}
            className="hidden md:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition"
            title="Inspect Discord OAuth Flow Traces and Database State"
            id="btn-header-oauth-diagnostics"
          >
            <Activity className="h-3.5 w-3.5 text-indigo-600" />
            <span>OAuth Diagnostics</span>
          </button>
        )}

        {/* Mobile Search Trigger */}
        {onOpenCommandMenu && (
          <button
            onClick={onOpenCommandMenu}
            className="md:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus:outline-hidden"
            aria-label="Search"
            id="btn-mobile-search-trigger"
          >
            <Search className="h-5 w-5" />
          </button>
        )}

        {/* Help & Support Button */}
        {onOpenHelp && (
          <button
            onClick={onOpenHelp}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
            aria-label="Help & Diagnostics"
            title="Help, Diagnostics & Support"
            id="btn-open-help"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        )}

        {/* Notifications Bell */}
        <button
          onClick={onToggleNotifications}
          className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
          aria-label="View notifications"
          id="btn-open-notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadNotificationsCount > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
          )}
        </button>

        {/* User Profile & Account Menu */}
        <div className="relative" ref={profileDropdownRef}>
          <button
            onClick={() => setShowProfileDropdown(!showProfileDropdown)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 py-1 pl-2 pr-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
            id="btn-user-profile-menu"
          >
            {/* User Avatar */}
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={displayName}
                className="h-7 w-7 rounded-full object-cover shadow-xs border border-indigo-200"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 font-bold text-white shadow-xs text-xs">
                {currentRole === 'PLATFORM_OWNER' ? 'PO' : displayName.charAt(0).toUpperCase()}
              </div>
            )}

            {/* Role Badge */}
            <div
              className={`hidden sm:inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${getRoleBadgeStyle(
                currentRole
              )}`}
            >
              {currentRole === 'OWNER' ? 'Server Owner' : currentRole}
            </div>

            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {/* Profile Dropdown Menu */}
          {showProfileDropdown && (
            <div className="absolute right-0 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-xl z-50 text-slate-800">
              {/* Profile Card Header */}
              <div className="border-b border-slate-100 px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="h-9 w-9 rounded-full object-cover border border-indigo-200"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 font-bold text-white text-sm">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <div className="truncate text-xs font-bold text-slate-900">{displayName}</div>
                    <div className="text-[11px] text-slate-500 font-mono truncate">
                      {currentUser?.discordUserId ? `Discord: ${currentUser.discordUserId}` : (isAuthenticated ? 'Authenticated' : 'No Discord Account Connected')}
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between pt-1">
                  <span className="text-[11px] font-medium text-slate-500">Effective Role:</span>
                  <span
                    className={`inline-flex rounded border px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider ${getRoleBadgeStyle(
                      currentRole
                    )}`}
                  >
                    {currentRole}
                  </span>
                </div>
              </div>

              {/* Standard Actions */}
              <div className="py-1.5 space-y-0.5">
                {!isAuthenticated && onLoginWithDiscord && (
                  <button
                    onClick={() => {
                      setShowProfileDropdown(false);
                      onLoginWithDiscord();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 transition"
                  >
                    <LogIn className="h-4 w-4 text-indigo-600" />
                    <span>Log in with Discord (OAuth)</span>
                  </button>
                )}

                {onOpenOAuthDiagnostics && (
                  <button
                    onClick={() => {
                      onOpenOAuthDiagnostics();
                      setShowProfileDropdown(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Activity className="h-4 w-4 text-indigo-600" />
                    <span>OAuth Diagnostics &amp; Traces</span>
                  </button>
                )}

                {onOpenWorkspaceSettings && (
                  <button
                    onClick={() => {
                      onOpenWorkspaceSettings();
                      setShowProfileDropdown(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    <Settings className="h-4 w-4 text-slate-500" />
                    <span>Workspace Settings</span>
                  </button>
                )}

                {onOpenHelp && (
                  <button
                    onClick={() => {
                      onOpenHelp();
                      setShowProfileDropdown(false);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                  >
                    <HelpCircle className="h-4 w-4 text-slate-500" />
                    <span>System Diagnostics &amp; Support</span>
                  </button>
                )}

                {/* Platform Owner Console Link */}
                {portalMode !== 'PLATFORM_ADMIN' && onOpenPlatformAuth && (
                  <button
                    onClick={() => {
                      onOpenPlatformAuth();
                      setShowProfileDropdown(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold text-indigo-700 hover:bg-indigo-50 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <Lock className="h-4 w-4 text-indigo-600" />
                      <span>Platform Owner Console</span>
                    </div>
                    <span className="rounded bg-indigo-100 px-1.5 py-0.2 text-[9px] text-indigo-800">Admin</span>
                  </button>
                )}

                {isAuthenticated && onLogout && (
                  <button
                    onClick={() => {
                      setShowProfileDropdown(false);
                      onLogout();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-700 hover:bg-rose-50 transition"
                  >
                    <LogOut className="h-4 w-4 text-rose-600" />
                    <span>Log Out</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

