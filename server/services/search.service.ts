import {
  SearchResourceType,
  SearchCategory,
  SearchResultItem,
  SearchQueryOptions,
  SearchResponse,
  CommandDefinition,
} from '../../shared/types/search.js';
import { UserAuthContext, Permission } from '../../shared/types/rbac.js';
import { hasPermission, isPlatformOwner } from '../security/rbac.js';
import {
  discordMembersRepository,
  applicationsRepository,
  recruitersRepository,
  recruiterCodesRepository,
  announcementsRepository,
  messageTemplatesRepository,
  campaignsRepository,
  pollsRepository,
  remindersRepository,
  eventsRepository,
  schedulesRepository,
  automationWorkflowsRepository,
  moderationWarningsRepository,
  safetyIncidentsRepository,
  moderationRestrictionsRepository,
  blacklistEntriesRepository,
  platformServersRepository,
  platformUsersRepository,
  platformSettingsRepository,
  platformFeedbackRepository,
  incidentsRepository,
} from '../repositories/index.js';
import { logger } from '../logging/logger.js';
import { BadRequestError, ForbiddenError } from '../utils/errors.js';

export interface NavigationRouteDefinition {
  id: string;
  title: string;
  subtitle: string;
  category: SearchCategory;
  route: string;
  permissionRequired?: Permission;
  keywords: string[];
}

export const CANONICAL_NAVIGATION_ROUTES: NavigationRouteDefinition[] = [
  {
    id: 'nav-overview',
    title: 'Community Overview',
    subtitle: 'High-level server metrics, health status, and live activity',
    category: 'Navigation',
    route: 'dashboard',
    keywords: ['overview', 'dashboard', 'home', 'stats', 'metrics', 'activity'],
  },
  {
    id: 'nav-members',
    title: 'Member Directory',
    subtitle: 'Synchronized Discord members, verified roles, and activity tracking',
    category: 'Navigation',
    route: 'members',
    permissionRequired: 'users.view',
    keywords: ['members', 'users', 'roster', 'directory', 'discord members', 'roles', 'sync'],
  },
  {
    id: 'nav-recruitment-hub',
    title: 'Recruitment Command Center',
    subtitle: 'Applicant tracking pipeline, candidate screenings, and review workflow',
    category: 'Navigation',
    route: 'applications',
    permissionRequired: 'applications.view',
    keywords: ['recruitment', 'applicants', 'applications', 'pipeline', 'candidates', 'hiring', 'screenings'],
  },
  {
    id: 'nav-recruiters',
    title: 'Recruiter Network',
    subtitle: 'Recruiter profiles, sourcing performance, and verified invitations',
    category: 'Navigation',
    route: 'recruiters',
    permissionRequired: 'recruiters.view',
    keywords: ['recruiters', 'recruiter', 'referrals', 'sourcing', 'talent', 'performance'],
  },
  {
    id: 'nav-recruiter-codes',
    title: 'Recruiter Referral Codes',
    subtitle: 'Generate, track, and manage unique referral invite codes',
    category: 'Navigation',
    route: 'recruiter-codes',
    permissionRequired: 'recruiterCodes.view',
    keywords: ['codes', 'recruiter codes', 'referral codes', 'invites', 'tracking links'],
  },
  {
    id: 'nav-interviews',
    title: 'Interview Management',
    subtitle: 'Scheduled candidate screening sessions, interviewer introductions, and notes',
    category: 'Navigation',
    route: 'interviews',
    permissionRequired: 'interviews.view',
    keywords: ['interviews', 'screening', 'voice chat', 'stage', 'candidate reviews'],
  },
  {
    id: 'nav-engagement',
    title: 'Engagement & Communication',
    subtitle: 'Announcements, broadcast campaigns, recurring reminders, and polls',
    category: 'Navigation',
    route: 'engagement',
    permissionRequired: 'community.view',
    keywords: ['engagement', 'announcements', 'broadcasts', 'campaigns', 'polls', 'reminders', 'templates'],
  },
  {
    id: 'nav-moderation',
    title: 'Moderation & Safety Engine',
    subtitle: 'Member warnings, disciplinary restrictions, server blacklist, and safety incidents',
    category: 'Navigation',
    route: 'moderation',
    permissionRequired: 'community.view',
    keywords: ['moderation', 'safety', 'warnings', 'blacklist', 'restrictions', 'incidents', 'rules', 'automod'],
  },
  {
    id: 'nav-events-automation',
    title: 'Events & Automation Engine',
    subtitle: 'Community calendar events, recurring schedules, and trigger-action workflows',
    category: 'Navigation',
    route: 'events-automation',
    permissionRequired: 'community.view',
    keywords: ['events', 'calendar', 'automation', 'workflows', 'schedules', 'triggers', 'rsvp'],
  },
  {
    id: 'nav-insights-ai',
    title: 'Insights & Community Brain AI',
    subtitle: 'Analytics dashboard, retention intelligence, and AI advisory assistant',
    category: 'Navigation',
    route: 'insights-ai',
    permissionRequired: 'reports.view',
    keywords: ['insights', 'analytics', 'reports', 'community brain', 'ai', 'retention', 'intelligence'],
  },
  {
    id: 'nav-integrations',
    title: 'Connection Center & Integrations',
    subtitle: 'Discord gateway, Google Sheets, Google Calendar, Google Forms, and Webhooks',
    category: 'Navigation',
    route: 'integrations',
    permissionRequired: 'community.view',
    keywords: ['integrations', 'connectivity', 'discord gateway', 'google sheets', 'google calendar', 'google forms', 'webhooks'],
  },
  {
    id: 'nav-settings',
    title: 'Community Settings & Control Plane',
    subtitle: 'General configuration, role mappings, notification preferences, and security',
    category: 'Navigation',
    route: 'settings',
    permissionRequired: 'settings.view',
    keywords: ['settings', 'configuration', 'control plane', 'role mappings', 'preferences', 'security settings'],
  },
  {
    id: 'nav-pricing-plans',
    title: 'Plans & Commercial Entitlements',
    subtitle: 'Feature entitlements, usage limits, and subscription tier status',
    category: 'Navigation',
    route: 'pricing-trust',
    keywords: ['plans', 'pricing', 'entitlements', 'limits', 'billing', 'subscription'],
  },
];

export const CANONICAL_COMMANDS: CommandDefinition[] = [
  {
    id: 'cmd-create-announcement',
    title: 'Create Announcement',
    subtitle: 'Compose and broadcast an announcement to Discord channels',
    category: 'Commands',
    permissionRequired: 'community.manage',
    route: 'announcements',
    actionId: 'create-announcement',
    keywords: ['create announcement', 'new announcement', 'broadcast', 'post message', 'announce'],
  },
  {
    id: 'cmd-schedule-event',
    title: 'Schedule Event',
    subtitle: 'Set up a new community event with RSVP tracking',
    category: 'Commands',
    permissionRequired: 'community.manage',
    route: 'events',
    actionId: 'schedule-event',
    keywords: ['schedule event', 'new event', 'create event', 'rsvp', 'community event'],
  },
  {
    id: 'cmd-create-campaign',
    title: 'Launch Recruitment Campaign',
    subtitle: 'Create a recruitment outreach campaign with source attribution',
    category: 'Commands',
    permissionRequired: 'applications.review',
    route: 'campaign-workspace',
    actionId: 'create-campaign',
    keywords: ['launch campaign', 'create campaign', 'new campaign', 'outreach', 'sourcing campaign'],
  },
  {
    id: 'cmd-generate-code',
    title: 'Generate Recruiter Code',
    subtitle: 'Create a new tracked referral invite code',
    category: 'Commands',
    permissionRequired: 'recruiterCodes.create',
    route: 'recruiter-codes',
    actionId: 'generate-code',
    keywords: ['generate code', 'create code', 'new recruiter code', 'referral link', 'invite code'],
  },
  {
    id: 'cmd-create-template',
    title: 'Create Message Template',
    subtitle: 'Design reusable message template for onboarding or announcements',
    category: 'Commands',
    permissionRequired: 'community.manage',
    route: 'templates',
    actionId: 'create-template',
    keywords: ['create template', 'new template', 'message template', 'reusable message'],
  },
  {
    id: 'cmd-create-reminder',
    title: 'Set Community Reminder',
    subtitle: 'Schedule a recurring or one-time notification reminder',
    category: 'Commands',
    permissionRequired: 'community.manage',
    route: 'engagement',
    actionId: 'create-reminder',
    keywords: ['create reminder', 'set reminder', 'new reminder', 'schedule reminder'],
  },
  {
    id: 'cmd-create-poll',
    title: 'Create Interactive Poll',
    subtitle: 'Collect member votes on questions or proposals',
    category: 'Commands',
    permissionRequired: 'community.manage',
    route: 'polls',
    actionId: 'create-poll',
    keywords: ['create poll', 'new poll', 'vote', 'survey', 'ballot'],
  },
  {
    id: 'cmd-create-automation',
    title: 'Create Automation Workflow',
    subtitle: 'Configure automated trigger-action pipeline for events or joins',
    category: 'Commands',
    permissionRequired: 'community.manage',
    route: 'automation',
    actionId: 'create-automation',
    keywords: ['create automation', 'new workflow', 'trigger', 'auto rule', 'pipeline'],
  },
  {
    id: 'cmd-ask-brain',
    title: 'Open Community Brain AI Assistant',
    subtitle: 'Ask AI questions, generate recruitment strategies, or summarize activity',
    category: 'Commands',
    permissionRequired: 'reports.view',
    route: 'ai',
    actionId: 'ask-brain',
    keywords: ['ask ai', 'community brain', 'ai assistant', 'consult ai', 'summarize'],
  },
  {
    id: 'cmd-sync-members',
    title: 'Sync Discord Members',
    subtitle: 'Trigger background synchronization with Discord Guild API',
    category: 'Commands',
    permissionRequired: 'users.manage',
    route: 'members',
    actionId: 'sync-members',
    keywords: ['sync members', 'discord sync', 'refresh members', 'reconcile guild'],
  },
  {
    id: 'cmd-sync-sheets',
    title: 'Sync Google Sheets',
    subtitle: 'Export synchronized recruiter & application records to Google Sheets',
    category: 'Commands',
    permissionRequired: 'settings.manage',
    route: 'spreadsheet',
    actionId: 'sync-sheets',
    keywords: ['sync sheets', 'google sheets sync', 'export spreadsheet', 'drive sync'],
  },
];

export class GlobalSearchService {
  /**
   * Performs authoritative, tenant-scoped, and permission-filtered search across community resources.
   */
  async searchCommunity(
    authContext: UserAuthContext,
    communityId: string,
    options: SearchQueryOptions
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    const rawQuery = options.query || '';
    const query = this.normalizeQuery(rawQuery);
    const limit = Math.min(Math.max(options.limit || 25, 1), 50);
    const cursor = Math.max(options.cursor || 0, 0);

    if (!communityId || typeof communityId !== 'string') {
      throw new BadRequestError('Community ID is required for community-scoped search');
    }

    // Check tenant boundary: non-platform owners can only query their authorized community
    if (authContext.communityId && authContext.communityId !== communityId && !isPlatformOwner(authContext)) {
      throw new ForbiddenError('Cross-tenant query violation: cannot search across unassigned communities');
    }

    const items: SearchResultItem[] = [];

    // 1. Navigation Routes Search
    if (options.includeNavigation !== false) {
      for (const nav of CANONICAL_NAVIGATION_ROUTES) {
        if (nav.permissionRequired && !hasPermission(authContext, nav.permissionRequired)) {
          continue;
        }
        const score = this.calculateMatchScore(query, nav.title, nav.subtitle, nav.keywords);
        if (score > 0 || query.length === 0) {
          items.push({
            id: `nav-${nav.id}`,
            resourceId: nav.id,
            type: 'navigation',
            category: 'Navigation',
            title: nav.title,
            subtitle: nav.subtitle,
            context: 'Navigation Destination',
            route: nav.route,
            permissionRequired: nav.permissionRequired,
            score: score > 0 ? score + 15 : 10,
          });
        }
      }
    }

    // 2. Commands & Safe Quick Actions Search
    if (options.includeCommands !== false) {
      for (const cmd of CANONICAL_COMMANDS) {
        if (cmd.permissionRequired && !hasPermission(authContext, cmd.permissionRequired)) {
          continue;
        }
        const score = this.calculateMatchScore(query, cmd.title, cmd.subtitle || '', cmd.keywords);
        if (score > 0 || query.length === 0) {
          items.push({
            id: `cmd-${cmd.id}`,
            resourceId: cmd.id,
            type: 'command',
            category: 'Commands',
            title: cmd.title,
            subtitle: cmd.subtitle,
            context: 'Contextual Command',
            route: cmd.route,
            permissionRequired: cmd.permissionRequired,
            score: score > 0 ? score + 10 : 5,
            metadata: { actionId: cmd.actionId },
          });
        }
      }
    }

    // If query is empty, return top navigation and commands immediately
    if (!query) {
      const paginated = items.slice(cursor, cursor + limit);
      return this.buildSearchResponse(query, paginated, items.length, startTime, cursor, limit);
    }

    // 3. Query Authorized Repositories in Parallel
    const queryPromises: Array<Promise<SearchResultItem[]>> = [];

    // Members
    if (hasPermission(authContext, 'users.view')) {
      queryPromises.push(this.searchMembers(communityId, query));
    }

    // Applications & Candidates
    if (hasPermission(authContext, 'applications.view')) {
      queryPromises.push(this.searchApplications(communityId, query));
    }

    // Recruiters
    if (hasPermission(authContext, 'recruiters.view')) {
      queryPromises.push(this.searchRecruiters(communityId, query));
    }

    // Recruiter Codes
    if (hasPermission(authContext, 'recruiterCodes.view')) {
      queryPromises.push(this.searchRecruiterCodes(communityId, query));
    }

    // Engagement: Announcements, Templates, Campaigns, Polls, Reminders
    if (hasPermission(authContext, 'community.view')) {
      queryPromises.push(this.searchEngagement(communityId, query));
    }

    // Events, Schedules, Automations
    if (hasPermission(authContext, 'community.view')) {
      queryPromises.push(this.searchEventsAndAutomation(communityId, query));
    }

    // Moderation: Warnings, Incidents, Restrictions, Blacklist
    if (hasPermission(authContext, 'community.manage') || hasPermission(authContext, 'settings.manage')) {
      queryPromises.push(this.searchModeration(communityId, query));
    }

    // Integrations & Settings
    if (hasPermission(authContext, 'settings.view') || hasPermission(authContext, 'community.view')) {
      queryPromises.push(this.searchIntegrationsAndSettings(communityId, query));
    }

    const resolvedResults = await Promise.all(queryPromises);
    for (const group of resolvedResults) {
      items.push(...group);
    }

    // Filter by type or category if specified
    let filteredItems = items;
    if (options.types && options.types.length > 0) {
      filteredItems = filteredItems.filter((it) => options.types!.includes(it.type));
    }
    if (options.category) {
      filteredItems = filteredItems.filter((it) => it.category === options.category);
    }

    // Deterministic ranking: Highest score first, then title alphabetically
    filteredItems.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.title.localeCompare(b.title);
    });

    const paginated = filteredItems.slice(cursor, cursor + limit);
    return this.buildSearchResponse(query, paginated, filteredItems.length, startTime, cursor, limit);
  }

  /**
   * Platform-level search for Platform Owners.
   */
  async searchPlatform(
    authContext: UserAuthContext,
    options: SearchQueryOptions
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    const rawQuery = options.query || '';
    const query = this.normalizeQuery(rawQuery);
    const limit = Math.min(Math.max(options.limit || 25, 1), 50);
    const cursor = Math.max(options.cursor || 0, 0);

    if (!isPlatformOwner(authContext)) {
      throw new ForbiddenError('Unauthorized: Platform search is strictly reserved for Platform Owners');
    }

    const items: SearchResultItem[] = [];

    // Platform Navigation
    const platformNav = [
      { id: 'pnav-overview', title: 'Platform Overview', subtitle: 'Global metrics, active guilds, and system status', route: 'overview' },
      { id: 'pnav-servers', title: 'Platform Server Directory', subtitle: 'Manage registered guilds, suspensions, and force syncs', route: 'servers' },
      { id: 'pnav-users', title: 'Platform User Directory', subtitle: 'Manage platform accounts, roles, and session revocations', route: 'users' },
      { id: 'pnav-analytics', title: 'Platform Analytics', subtitle: 'Cross-tenant aggregation, growth rate, and error trends', route: 'analytics' },
      { id: 'pnav-feedback', title: 'Feedback & Reports', subtitle: 'Review user submissions and feature requests', route: 'feedback' },
      { id: 'pnav-health', title: 'System Health & Incidents', subtitle: 'Dependency diagnostics, rate limits, and error center', route: 'health' },
      { id: 'pnav-settings', title: 'Master Platform Settings', subtitle: 'Global maintenance mode, feature flags, and defaults', route: 'settings' },
      { id: 'pnav-audit', title: 'Platform Audit Trail', subtitle: 'Authoritative administrative log records', route: 'audit' },
    ];

    for (const p of platformNav) {
      const score = this.calculateMatchScore(query, p.title, p.subtitle, [p.route, 'platform']);
      if (score > 0 || query.length === 0) {
        items.push({
          id: `pnav-${p.id}`,
          resourceId: p.id,
          type: 'navigation',
          category: 'Platform',
          title: p.title,
          subtitle: p.subtitle,
          context: 'Platform Navigation',
          route: p.route,
          score: score > 0 ? score + 10 : 5,
        });
      }
    }

    if (query) {
      // Query platform servers
      const servers = await platformServersRepository.list();
      for (const s of servers) {
        const score = this.calculateMatchScore(query, s.name || '', s.guildId || '', [s.id, s.status]);
        if (score > 0) {
          items.push({
            id: `psrv-${s.id}`,
            resourceId: s.id,
            type: 'platform_server',
            category: 'Platform',
            title: `Server: ${s.name}`,
            subtitle: `Guild ID: ${s.guildId} | Status: ${s.status || 'ACTIVE'}`,
            context: 'Platform Server Directory',
            route: 'servers',
            status: s.status || 'ACTIVE',
            score,
            metadata: { guildId: s.guildId, memberCount: s.memberCount },
          });
        }
      }

      // Query platform users
      const users = await platformUsersRepository.list();
      for (const u of users) {
        const score = this.calculateMatchScore(query, u.username || '', u.discordId || '', [u.id, u.globalRole || '']);
        if (score > 0) {
          items.push({
            id: `pusr-${u.id}`,
            resourceId: u.id,
            type: 'platform_user',
            category: 'Platform',
            title: `User: ${u.username}`,
            subtitle: `Role: ${u.globalRole || 'MEMBER'} | Discord ID: ${u.discordId || 'N/A'}`,
            context: 'Platform User Directory',
            route: 'users',
            score,
          });
        }
      }

      // Query platform incidents
      const incidents = await incidentsRepository.list();
      for (const inc of incidents) {
        const score = this.calculateMatchScore(query, inc.summary || '', inc.dependency || '', [inc.id, inc.category, inc.status]);
        if (score > 0) {
          items.push({
            id: `pinc-${inc.id}`,
            resourceId: inc.id,
            type: 'platform_incident',
            category: 'Platform',
            title: `Incident: ${inc.summary}`,
            subtitle: `Dependency: ${inc.dependency} | Severity: ${inc.severity} | Status: ${inc.status}`,
            context: 'System Observability',
            route: 'health',
            status: inc.status,
            score,
          });
        }
      }
    }

    items.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    const paginated = items.slice(cursor, cursor + limit);
    return this.buildSearchResponse(query, paginated, items.length, startTime, cursor, limit);
  }

  // =========================================================================
  // RESOURCE SEARCH IMPLEMENTATIONS (STRICT TENANT SCOPING & SANITIZATION)
  // =========================================================================

  private async searchMembers(communityId: string, query: string): Promise<SearchResultItem[]> {
    const results: SearchResultItem[] = [];
    const members = await discordMembersRepository.listForTenant(communityId);

    for (const m of members) {
      const title = (m as any).displayName || m.displayNameSnapshot || (m as any).username || m.usernameSnapshot || m.discordUserId;
      const username = (m as any).username || m.usernameSnapshot;
      const subtitle = username ? `@${username} (ID: ${m.discordUserId})` : `ID: ${m.discordUserId}`;
      const roles: string[] = (m as any).roles || m.discordRoleIds || [];
      const score = this.calculateMatchScore(query, title, subtitle, [m.discordUserId, ...roles]);

      if (score > 0) {
        results.push({
          id: `mem-${m.id}`,
          resourceId: m.discordUserId,
          type: 'member',
          category: 'Members',
          title: `Member: ${title}`,
          subtitle,
          context: `Roles: ${roles.slice(0, 3).join(', ') || 'General Member'}`,
          route: 'members',
          score,
          metadata: { discordUserId: m.discordUserId, roles },
        });
      }
    }
    return results;
  }

  private async searchApplications(communityId: string, query: string): Promise<SearchResultItem[]> {
    const results: SearchResultItem[] = [];
    const applications = await applicationsRepository.listForTenant(communityId);

    for (const app of applications) {
      const applicantName = app.applicantUsername || app.applicantUsernameSnapshot || app.applicantDiscordId || app.id;
      const sub = `App #${app.id.substring(0, 8)} | Recruiter: ${app.recruiterCodeUsed || 'Direct'}`;
      const score = this.calculateMatchScore(query, applicantName, sub, [app.id, app.status, app.applicantDiscordId || '']);

      if (score > 0) {
        results.push({
          id: `app-${app.id}`,
          resourceId: app.id,
          type: 'application',
          category: 'Recruitment',
          title: `Applicant: ${applicantName}`,
          subtitle: sub,
          context: `Status: ${app.status}`,
          route: 'applications',
          status: app.status,
          score,
          metadata: { applicationId: app.id, status: app.status },
        });
      }
    }
    return results;
  }

  private async searchRecruiters(communityId: string, query: string): Promise<SearchResultItem[]> {
    const results: SearchResultItem[] = [];
    const recruiters = await recruitersRepository.listForTenant(communityId);

    for (const rec of recruiters) {
      const name = rec.displayName || rec.displayNameSnapshot || rec.name || rec.recruiterCode || rec.discordUserId || rec.id;
      const sub = `Code: ${rec.recruiterCode || 'N/A'} | Status: ${rec.status || 'ACTIVE'}`;
      const score = this.calculateMatchScore(query, name, sub, [rec.recruiterCode || '', rec.discordUserId || '']);

      if (score > 0) {
        results.push({
          id: `rec-${rec.id}`,
          resourceId: rec.id,
          type: 'recruiter',
          category: 'Recruitment',
          title: `Recruiter: ${name}`,
          subtitle: sub,
          context: `Status: ${rec.status || 'ACTIVE'}`,
          route: 'recruiters',
          status: rec.status || 'ACTIVE',
          score,
          metadata: { recruiterCode: rec.recruiterCode },
        });
      }
    }
    return results;
  }

  private async searchRecruiterCodes(communityId: string, query: string): Promise<SearchResultItem[]> {
    const results: SearchResultItem[] = [];
    const codes = await recruiterCodesRepository.listForTenant(communityId);

    for (const c of codes) {
      const codeName = c.code;
      const ownerId = c.recruiterUserId || 'Unassigned';
      const sub = `Owner: ${ownerId} | Uses: ${c.totalUses || 0}`;
      const score = this.calculateMatchScore(query, codeName, sub, [c.code, c.id, c.status || '']);

      if (score > 0) {
        results.push({
          id: `rcode-${c.id}`,
          resourceId: c.id,
          type: 'recruiter_code',
          category: 'Recruitment',
          title: `Referral Code: ${codeName}`,
          subtitle: sub,
          context: `Status: ${c.status || 'ACTIVE'}`,
          route: 'recruiter-codes',
          status: c.status || 'ACTIVE',
          score,
          metadata: { code: c.code },
        });
      }
    }
    return results;
  }

  private async searchEngagement(communityId: string, query: string): Promise<SearchResultItem[]> {
    const results: SearchResultItem[] = [];

    // Announcements
    const announcements = await announcementsRepository.listForTenant(communityId);
    for (const ann of announcements) {
      const score = this.calculateMatchScore(query, ann.title || '', ann.content || '', [ann.id, ann.status || '']);
      if (score > 0) {
        results.push({
          id: `ann-${ann.id}`,
          resourceId: ann.id,
          type: 'announcement',
          category: 'Engagement',
          title: `Announcement: ${ann.title}`,
          subtitle: `Status: ${ann.status || 'DRAFT'} | Channel: ${ann.channelId || 'Default'}`,
          context: (ann.content || '').substring(0, 100),
          route: 'announcements',
          status: ann.status,
          score,
        });
      }
    }

    // Message Templates
    const templates = await messageTemplatesRepository.listForTenant(communityId);
    for (const tpl of templates) {
      const score = this.calculateMatchScore(query, tpl.name || '', tpl.content || '', [tpl.id, ...(tpl.variables || [])]);
      if (score > 0) {
        results.push({
          id: `tpl-${tpl.id}`,
          resourceId: tpl.id,
          type: 'template',
          category: 'Engagement',
          title: `Template: ${tpl.name}`,
          subtitle: `Variables: ${(tpl.variables || []).join(', ') || 'None'}`,
          context: (tpl.content || '').substring(0, 100),
          route: 'templates',
          score,
        });
      }
    }

    // Campaigns
    const campaigns = await campaignsRepository.listForTenant(communityId);
    for (const camp of campaigns) {
      const score = this.calculateMatchScore(query, camp.name || '', camp.message || '', [camp.id, camp.status || '', camp.targetAudience || '']);
      if (score > 0) {
        results.push({
          id: `camp-${camp.id}`,
          resourceId: camp.id,
          type: 'campaign',
          category: 'Engagement',
          title: `Campaign: ${camp.name}`,
          subtitle: `Audience: ${camp.targetAudience || 'ALL'} | Status: ${camp.status || 'ACTIVE'}`,
          context: (camp.message || '').substring(0, 100),
          route: 'campaigns',
          status: camp.status,
          score,
        });
      }
    }

    // Polls
    const polls = await pollsRepository.listForTenant(communityId);
    for (const poll of polls) {
      const score = this.calculateMatchScore(query, poll.question || '', '', [poll.id, poll.status || '']);
      if (score > 0) {
        results.push({
          id: `poll-${poll.id}`,
          resourceId: poll.id,
          type: 'poll',
          category: 'Engagement',
          title: `Poll: ${poll.question}`,
          subtitle: `Status: ${poll.status || 'ACTIVE'} | Channel: ${poll.channelId || 'Default'}`,
          context: 'Interactive Community Poll',
          route: 'polls',
          status: poll.status,
          score,
        });
      }
    }

    // Reminders
    const reminders = await remindersRepository.listForTenant(communityId);
    for (const rem of reminders) {
      const score = this.calculateMatchScore(query, `Reminder for ${rem.targetUser}`, rem.message || '', [rem.id, rem.status || '']);
      if (score > 0) {
        results.push({
          id: `rem-${rem.id}`,
          resourceId: rem.id,
          type: 'reminder',
          category: 'Engagement',
          title: `Reminder: ${rem.targetUser}`,
          subtitle: `Trigger: ${rem.triggerAt || 'Scheduled'} | Status: ${rem.status || 'PENDING'}`,
          context: (rem.message || '').substring(0, 100),
          route: 'engagement',
          status: rem.status,
          score,
        });
      }
    }

    return results;
  }

  private async searchEventsAndAutomation(communityId: string, query: string): Promise<SearchResultItem[]> {
    const results: SearchResultItem[] = [];

    // Events
    const events = await eventsRepository.listForTenant(communityId);
    for (const evt of events) {
      const score = this.calculateMatchScore(query, evt.title || '', evt.description || '', [evt.id, evt.status || '', evt.channelId || '']);
      if (score > 0) {
        results.push({
          id: `evt-${evt.id}`,
          resourceId: evt.id,
          type: 'event',
          category: 'Events & Automation',
          title: `Event: ${evt.title}`,
          subtitle: `Starts: ${evt.startAt || 'TBD'} | Organizer: ${evt.organizer || 'Community'}`,
          context: (evt.description || '').substring(0, 100),
          route: 'events',
          status: evt.status,
          score,
        });
      }
    }

    // Schedules
    const schedules = await schedulesRepository.listForTenant(communityId);
    for (const sch of schedules) {
      const score = this.calculateMatchScore(query, sch.name || '', sch.resourceType || '', [sch.id, sch.recurrence || '', sch.status || '']);
      if (score > 0) {
        results.push({
          id: `sch-${sch.id}`,
          resourceId: sch.id,
          type: 'schedule',
          category: 'Events & Automation',
          title: `Schedule: ${sch.name}`,
          subtitle: `Recurrence: ${sch.recurrence || 'ONCE'} | Type: ${sch.resourceType}`,
          context: `Status: ${sch.status || 'ACTIVE'}`,
          route: 'events-automation',
          status: sch.status,
          score,
        });
      }
    }

    // Automations
    const automations = await automationWorkflowsRepository.listForTenant(communityId);
    for (const auto of automations) {
      const triggerStr = typeof auto.trigger === 'string' ? auto.trigger : auto.triggerType || auto.trigger?.type || 'Event';
      const score = this.calculateMatchScore(query, auto.name || '', auto.description || '', [auto.id, triggerStr, auto.status || '']);
      if (score > 0) {
        results.push({
          id: `wf-${auto.id}`,
          resourceId: auto.id,
          type: 'automation',
          category: 'Events & Automation',
          title: `Automation: ${auto.name}`,
          subtitle: `Trigger: ${triggerStr} | Status: ${auto.status || 'ACTIVE'}`,
          context: (auto.description || '').substring(0, 100),
          route: 'automation',
          status: auto.status,
          score,
        });
      }
    }

    return results;
  }

  private async searchModeration(communityId: string, query: string): Promise<SearchResultItem[]> {
    const results: SearchResultItem[] = [];

    // Warnings
    const warnings = await moderationWarningsRepository.listForTenant(communityId);
    for (const w of warnings) {
      const score = this.calculateMatchScore(query, w.reason || '', `Target: ${w.discordUserId}`, [w.id, w.severity || '', w.status || '']);
      if (score > 0) {
        results.push({
          id: `wrn-${w.id}`,
          resourceId: w.id,
          type: 'warning',
          category: 'Moderation',
          title: `Warning: ${w.reason}`,
          subtitle: `Target: ${w.discordUserId} | Severity: ${w.severity || 'LOW'}`,
          context: `Status: ${w.status || 'ACTIVE'}`,
          route: 'warnings',
          status: w.status,
          score,
        });
      }
    }

    // Safety Incidents
    const incidents = await safetyIncidentsRepository.listForTenant(communityId);
    for (const inc of incidents) {
      const score = this.calculateMatchScore(query, inc.title || '', inc.description || '', [inc.id, inc.severity || '', inc.status || '']);
      if (score > 0) {
        results.push({
          id: `sinc-${inc.id}`,
          resourceId: inc.id,
          type: 'incident',
          category: 'Moderation',
          title: `Incident: ${inc.title}`,
          subtitle: `Severity: ${inc.severity || 'MEDIUM'} | Status: ${inc.status || 'OPEN'}`,
          context: (inc.description || '').substring(0, 100),
          route: 'incidents',
          status: inc.status,
          score,
        });
      }
    }

    // Restrictions
    const restrictions = await moderationRestrictionsRepository.listForTenant(communityId);
    for (const r of restrictions) {
      const score = this.calculateMatchScore(query, `Restriction: ${r.restrictionType}`, r.reason || '', [r.id, r.targetDiscordUserId]);
      if (score > 0) {
        results.push({
          id: `rst-${r.id}`,
          resourceId: r.id,
          type: 'restriction',
          category: 'Moderation',
          title: `Restriction: ${r.restrictionType} (${r.targetDiscordUserId})`,
          subtitle: `Reason: ${r.reason || 'Safety guideline infraction'}`,
          context: `Status: ${r.status || 'ACTIVE'}`,
          route: 'restrictions',
          status: r.status,
          score,
        });
      }
    }

    // Blacklist
    const blacklist = await blacklistEntriesRepository.listForTenant(communityId);
    for (const bl of blacklist) {
      const score = this.calculateMatchScore(query, `Blacklist: ${bl.discordUserId}`, bl.reason || '', [bl.id, bl.discordUserId]);
      if (score > 0) {
        results.push({
          id: `bl-${bl.id}`,
          resourceId: bl.id,
          type: 'blacklist',
          category: 'Moderation',
          title: `Blacklist: ${bl.discordUserId}`,
          subtitle: `Reason: ${bl.reason || 'Permanent exclusion'}`,
          context: `Status: ${bl.status || 'ACTIVE'}`,
          route: 'blacklist',
          status: bl.status,
          score,
        });
      }
    }

    return results;
  }

  private async searchIntegrationsAndSettings(communityId: string, query: string): Promise<SearchResultItem[]> {
    const results: SearchResultItem[] = [];

    const integrationCatalog = [
      { id: 'int-discord', title: 'Discord Gateway & Bot', subtitle: 'Manage guild linking, permissions matrix, and webhook delivery', route: 'discord-gateway', keywords: ['discord', 'gateway', 'bot', 'guild'] },
      { id: 'int-sheets', title: 'Google Sheets Integration', subtitle: 'Automate two-way spreadsheet synchronization of recruitment data', route: 'spreadsheet', keywords: ['google sheets', 'sheets', 'excel', 'spreadsheet', 'sync'] },
      { id: 'int-calendar', title: 'Google Calendar Integration', subtitle: 'Sync interviewer schedules, candidate screenings, and appointments', route: 'google-calendar', keywords: ['google calendar', 'calendar', 'interviews', 'scheduling'] },
      { id: 'int-forms', title: 'Google Forms Integration', subtitle: 'Capture external form submissions and map to candidate records', route: 'integrations', keywords: ['google forms', 'forms', 'survey', 'intake'] },
    ];

    for (const int of integrationCatalog) {
      const score = this.calculateMatchScore(query, int.title, int.subtitle, int.keywords);
      if (score > 0) {
        results.push({
          id: `int-${int.id}`,
          resourceId: int.id,
          type: 'integration',
          category: 'Integrations',
          title: `Integration: ${int.title}`,
          subtitle: int.subtitle,
          context: 'Connection Center',
          route: int.route,
          score: score + 5,
        });
      }
    }

    const settingsSections = [
      { id: 'set-general', title: 'General Server Configuration', subtitle: 'Server name, timezone, locale, and branding preferences', route: 'settings', keywords: ['general settings', 'server name', 'timezone', 'locale'] },
      { id: 'set-roles', title: 'Role Mapping & RBAC Permissions', subtitle: 'Configure Discord role mappings to platform roles', route: 'permissions', keywords: ['role mappings', 'permissions', 'rbac', 'access control'] },
      { id: 'set-recruitment', title: 'Recruitment Settings & Scoring', subtitle: 'Scoring thresholds, review workflow rules, and auto-pass criteria', route: 'recruitment-settings', keywords: ['recruitment settings', 'scoring', 'thresholds', 'screening rules'] },
      { id: 'set-notifications', title: 'Notification Preferences & Webhooks', subtitle: 'Configure alerts for applications, incidents, and events', route: 'notifications', keywords: ['notification settings', 'alerts', 'webhooks', 'emails'] },
    ];

    for (const sec of settingsSections) {
      const score = this.calculateMatchScore(query, sec.title, sec.subtitle, sec.keywords);
      if (score > 0) {
        results.push({
          id: `set-${sec.id}`,
          resourceId: sec.id,
          type: 'setting',
          category: 'Settings',
          title: `Setting: ${sec.title}`,
          subtitle: sec.subtitle,
          context: 'Settings Control Plane',
          route: sec.route,
          score: score + 5,
        });
      }
    }

    return results;
  }

  // =========================================================================
  // MATCHING, SCORING & NORMALIZATION HELPERS
  // =========================================================================

  private normalizeQuery(q: string): string {
    return q
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim();
  }

  private calculateMatchScore(query: string, title: string, subtitle: string, keywords: string[]): number {
    if (!query) return 0;
    const q = query.toLowerCase();
    const t = (title || '').toLowerCase();
    const s = (subtitle || '').toLowerCase();
    const safeKeywords = (keywords || []).filter(Boolean).map((k) => String(k).toLowerCase());

    // 1. Exact match on title or keywords
    if (t === q || safeKeywords.some((k) => k === q)) {
      return 100;
    }

    // 2. Starts with / Prefix match on title or keywords
    if (t.startsWith(q) || safeKeywords.some((k) => k.startsWith(q))) {
      return 80;
    }

    // 3. Word boundary / Token match
    const titleTokens = t.split(/\s+/);
    const queryTokens = q.split(/\s+/);
    const allTokensMatch = queryTokens.every((qt) =>
      titleTokens.some((tt) => tt.startsWith(qt)) ||
      safeKeywords.some((k) => k.includes(qt)) ||
      s.includes(qt)
    );
    if (allTokensMatch) {
      return 60;
    }

    // 4. Substring in title
    if (t.includes(q)) {
      return 40;
    }

    // 5. Substring in keywords or subtitle
    if (safeKeywords.some((k) => k.includes(q)) || s.includes(q)) {
      return 20;
    }

    return 0;
  }

  private buildSearchResponse(
    query: string,
    results: SearchResultItem[],
    total: number,
    startTime: number,
    cursor: number,
    limit: number
  ): SearchResponse {
    const groupedResults: Record<SearchCategory, SearchResultItem[]> = {
      Navigation: [],
      Members: [],
      Recruitment: [],
      Engagement: [],
      Moderation: [],
      'Events & Automation': [],
      Integrations: [],
      Settings: [],
      Platform: [],
      Commands: [],
    };

    for (const item of results) {
      if (!groupedResults[item.category]) {
        groupedResults[item.category] = [];
      }
      groupedResults[item.category].push(item);
    }

    const categories = (Object.keys(groupedResults) as SearchCategory[]).filter(
      (cat) => groupedResults[cat] && groupedResults[cat].length > 0
    );

    const hasMore = cursor + limit < total;
    const nextCursor = hasMore ? cursor + limit : undefined;

    return {
      success: true,
      query,
      total,
      groupedResults,
      results,
      categories,
      hasMore,
      nextCursor,
      searchTimeMs: Date.now() - startTime,
    };
  }
}

export const globalSearchService = new GlobalSearchService();
