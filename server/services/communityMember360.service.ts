import {
  discordMembersRepository,
  communitiesRepository,
  applicationsRepository,
  memberHandoffsRepository,
  memberOnboardingChecklistsRepository,
  earlyEngagementEventsRepository,
  moderationWarningsRepository,
  warningsRepository,
  moderationRestrictionsRepository,
  applicantRestrictionsRepository,
  blacklistEntriesRepository,
  eventsRepository,
  eventRegistrationsRepository,
  interviewsRepository,
  auditLogsRepository,
  rolesRepository,
  recruitersRepository,
} from '../repositories/index.js';
import {
  Member360Profile,
  Member360Overview,
  Member360Discord,
  Member360Recruitment,
  Member360Engagement,
  Member360Moderation,
  Member360Events,
  Member360TimelineItem,
  Member360Retention,
  Member360ViewerPermissions,
  MemberRoleInfo,
  MemberListQuery,
  MemberListResponse,
} from '../../shared/types/member360.js';
import { DiscordMemberDocument, MemberSyncState } from '../../shared/types/models.js';
import { UserAuthContext } from '../../shared/types/rbac.js';
import { hasPermission } from '../security/rbac.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { discordMemberSyncService } from './discordMemberSync.service.js';
import { auditService } from './audit.service.js';
import { notificationService } from './notification.service.js';
import { logger } from '../logging/logger.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors.js';

export class CommunityMember360Service {
  /**
   * Helper to normalize and get member document by communityId and discordUserId
   */
  async getMemberDoc(communityId: string, discordUserId: string): Promise<DiscordMemberDocument | null> {
    const id1 = `${communityId}_${discordUserId}`;
    let doc = await discordMembersRepository.getById(id1);
    if (!doc) {
      const id2 = `mem_${communityId}_${discordUserId}`;
      doc = await discordMembersRepository.getById(id2);
    }
    return doc;
  }

  /**
   * Helper to resolve Discord roles for a community from live gateway or stored repository
   */
  async getCommunityRoles(communityId: string, guildId?: string): Promise<MemberRoleInfo[]> {
    let roles: MemberRoleInfo[] = [];

    if (discordService.isConnected() && guildId) {
      try {
        const client = (discordService as any).client;
        const guild = await client?.guilds?.fetch(guildId);
        if (guild) {
          const fetchedRoles = await guild.roles.fetch();
          roles = Array.from(fetchedRoles.values())
            .filter((r: any) => r.name !== '@everyone')
            .map((r: any) => ({
              id: r.id,
              name: r.name,
              color: r.hexColor !== '#000000' ? r.hexColor : undefined,
              position: r.position,
              managed: r.managed,
            }))
            .sort((a, b) => (b.position || 0) - (a.position || 0));
        }
      } catch (err: any) {
        logger.warn(`[Member360] Live discord roles fetch failed: ${err.message}`);
      }
    }

    if (roles.length === 0) {
      const stored = await rolesRepository.list({
        where: [{ field: 'communityId', operator: '==', value: communityId }],
      });
      if (stored.length > 0) {
        roles = stored.map((r: any) => ({
          id: r.discordRoleId || r.id,
          name: r.name,
          color: r.color,
          position: r.position,
          managed: r.isSystemRole || false,
        }));
      }
    }

    return roles;
  }

  /**
   * List members with server-side pagination, search, role & status filters
   */
  async listMembers(
    communityId: string,
    query: MemberListQuery,
    authUser: UserAuthContext
  ): Promise<MemberListResponse> {
    if (!communityId) {
      throw new BadRequestError('communityId is required');
    }

    const community = await communitiesRepository.getById(communityId);
    if (!community) {
      throw new NotFoundError(`Community ${communityId} not found`);
    }

    const guildId = community.guildId || community.discordGuildId || '';
    let allMembers = await discordMembersRepository.listForTenant(communityId);

    // Initial sync if directory is empty
    if (allMembers.length === 0) {
      await discordMemberSyncService.syncGuildMembers(communityId, guildId);
      allMembers = await discordMembersRepository.listForTenant(communityId);
    }

    const availableRoles = await this.getCommunityRoles(communityId, guildId);
    const roleMap = new Map<string, MemberRoleInfo>(availableRoles.map((r) => [r.id, r]));

    // Check moderation visibility
    const canSeeModeration =
      hasPermission(authUser, 'community.view') ||
      ['OWNER', 'ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MANAGER', 'MODERATOR'].includes(authUser.role);

    // Preload active warnings if viewer is staff
    let activeWarningUserIds = new Set<string>();
    if (canSeeModeration) {
      const [modWarnings, legacyWarnings] = await Promise.all([
        moderationWarningsRepository.listForTenant(communityId),
        warningsRepository.listForTenant(communityId),
      ]);
      modWarnings
        .filter((w) => w.status === 'ACTIVE')
        .forEach((w) => activeWarningUserIds.add((w as any).targetDiscordUserId || w.discordUserId));
      legacyWarnings
        .filter((w) => (w as any).status === 'ACTIVE' || !(w as any).revoked)
        .forEach((w) => activeWarningUserIds.add(w.discordUserId || (w as any).userId));
    }

    // Filter by query parameters
    let filtered = allMembers;

    if (query.q) {
      const q = query.q.trim().toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.displayNameSnapshot?.toLowerCase().includes(q) ||
          m.usernameSnapshot?.toLowerCase().includes(q) ||
          m.nicknameSnapshot?.toLowerCase().includes(q) ||
          m.discordUserId?.includes(q) ||
          (m.recruiterCode && m.recruiterCode.toLowerCase().includes(q))
      );
    }

    if (query.roleId && query.roleId !== 'ALL') {
      filtered = filtered.filter((m) => m.discordRoleIds && m.discordRoleIds.includes(query.roleId!));
    }

    if (query.membershipStatus && query.membershipStatus !== 'ALL') {
      filtered = filtered.filter((m) => m.membershipStatus === query.membershipStatus);
    }

    if (query.recruitmentStatus && query.recruitmentStatus !== 'ALL') {
      if (query.recruitmentStatus === 'RECRUITED') {
        filtered = filtered.filter((m) => Boolean(m.recruiterCode));
      } else if (query.recruitmentStatus === 'ORGANIC') {
        filtered = filtered.filter((m) => !m.recruiterCode);
      }
    }

    if (query.warningStatus && query.warningStatus !== 'ALL' && canSeeModeration) {
      if (query.warningStatus === 'HAS_WARNINGS') {
        filtered = filtered.filter((m) => activeWarningUserIds.has(m.discordUserId));
      } else if (query.warningStatus === 'CLEAN') {
        filtered = filtered.filter((m) => !activeWarningUserIds.has(m.discordUserId));
      }
    }

    // Sort
    const sortBy = query.sortBy || 'joinedAt';
    const sortDir = query.sortDirection === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      if (sortBy === 'displayName') {
        return (a.displayNameSnapshot || '').localeCompare(b.displayNameSnapshot || '') * sortDir;
      }
      if (sortBy === 'lastSyncedAt') {
        return (new Date(a.syncedAt).getTime() - new Date(b.syncedAt).getTime()) * sortDir;
      }
      const timeA = a.joinedAt ? new Date(a.joinedAt).getTime() : 0;
      const timeB = b.joinedAt ? new Date(b.joinedAt).getTime() : 0;
      return (timeA - timeB) * sortDir;
    });

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const pageItems = filtered.slice(startIndex, startIndex + limit);

    // Map items with role info and moderation flag
    const items = pageItems.map((m) => ({
      id: m.id,
      communityId: m.communityId,
      discordGuildId: m.discordGuildId,
      discordUserId: m.discordUserId,
      usernameSnapshot: m.usernameSnapshot,
      displayNameSnapshot: m.displayNameSnapshot,
      nicknameSnapshot: m.nicknameSnapshot,
      avatarSnapshot: m.avatarSnapshot,
      discordRoleIds: m.discordRoleIds || [],
      roleDetails: (m.discordRoleIds || []).map((id) => roleMap.get(id) || { id, name: id }),
      joinedAt: m.joinedAt,
      syncedAt: m.syncedAt,
      source: m.source,
      recruiterCode: m.recruiterCode,
      membershipStatus: m.membershipStatus,
      syncState: m.syncState,
      hasActiveWarnings: canSeeModeration ? activeWarningUserIds.has(m.discordUserId) : undefined,
      recruitmentStatus: m.recruiterCode ? 'RECRUITED' : 'ORGANIC',
    }));

    // Generate accurate sync overview
    const activeCount = allMembers.filter((m) => m.membershipStatus === 'ACTIVE').length;
    const recruitedCount = allMembers.filter((m) => Boolean(m.recruiterCode)).length;
    const latestSync = allMembers.reduce((latest, m) => {
      return !latest || new Date(m.syncedAt) > new Date(latest) ? m.syncedAt : latest;
    }, '');

    const syncOverview = {
      lastSyncedAt: latestSync || new Date().toISOString(),
      syncState: (allMembers[0]?.syncState as MemberSyncState) || 'SYNCED',
      totalMembers: allMembers.length,
      activeMembers: activeCount,
      linkedRecruits: recruitedCount,
      guildConnected: discordService.isConnected(),
      guildName: community.name || 'Discord Community',
    };

    return {
      items,
      total,
      page,
      limit,
      totalPages,
      syncOverview,
    };
  }

  /**
   * Retrieves canonical Member Profile / Community 360 view aggregating authorized engines
   */
  async getMember360Profile(
    communityId: string,
    discordUserId: string,
    authUser: UserAuthContext
  ): Promise<Member360Profile> {
    if (!communityId || !discordUserId) {
      throw new BadRequestError('communityId and discordUserId are required');
    }

    // Cross-tenant verification
    if (authUser.communityId && authUser.communityId !== communityId && (authUser.role as string) !== 'PLATFORM_OWNER' && (authUser.role as string) !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Cross-tenant member access is forbidden');
    }

    const isSelf = authUser.discordUserId === discordUserId || authUser.userId === discordUserId;
    const isStaff = ['OWNER', 'CONTROLLER', 'ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MANAGER', 'MODERATOR', 'RECRUITER', 'INTERVIEWER', 'REVIEWER'].includes(authUser.role as string);

    // Permission flags
    const viewerPermissions: Member360ViewerPermissions = {
      canManageRoles: hasPermission(authUser, 'users.manage') || ['OWNER', 'CONTROLLER', 'ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MANAGER'].includes(authUser.role as string),
      canModerate: ['OWNER', 'CONTROLLER', 'ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MANAGER', 'MODERATOR'].includes(authUser.role as string),
      canViewRecruitment: ['OWNER', 'CONTROLLER', 'ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MANAGER', 'RECRUITER', 'INTERVIEWER', 'REVIEWER'].includes(authUser.role as string) || isSelf,
      canViewModeration: ['OWNER', 'CONTROLLER', 'ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MANAGER', 'MODERATOR'].includes(authUser.role as string),
      canSendNotification: ['OWNER', 'CONTROLLER', 'ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MANAGER'].includes(authUser.role as string),
      canRetryHandoff: ['OWNER', 'CONTROLLER', 'ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MANAGER'].includes(authUser.role as string),
      canExport: ['OWNER', 'CONTROLLER', 'ADMIN', 'SUPER_ADMIN'].includes(authUser.role as string),
    };

    if (!isSelf && !isStaff && !viewerPermissions.canViewRecruitment && !viewerPermissions.canViewModeration) {
      // Basic member viewing another member: allowed basic profile only
    }

    const community = await communitiesRepository.getById(communityId);
    if (!community) {
      throw new NotFoundError(`Community ${communityId} not found`);
    }

    const guildId = community.guildId || community.discordGuildId || '';
    let memberDoc = await this.getMemberDoc(communityId, discordUserId);

    // If not found in local repo, try to fetch or construct fallback
    if (!memberDoc) {
      memberDoc = {
        id: `${communityId}_${discordUserId}`,
        communityId,
        discordGuildId: guildId,
        discordUserId,
        usernameSnapshot: `User_${discordUserId.substring(0, 6)}`,
        displayNameSnapshot: `Member ${discordUserId.substring(0, 6)}`,
        discordRoleIds: [],
        syncedAt: new Date().toISOString(),
        source: 'DISCORD_SYNC',
        membershipStatus: 'UNKNOWN',
        syncState: 'SYNC_REQUIRED',
      };
    }

    const communityRoles = await this.getCommunityRoles(communityId, guildId);
    const roleMap = new Map<string, MemberRoleInfo>(communityRoles.map((r) => [r.id, r]));
    const memberRoles = (memberDoc.discordRoleIds || []).map((id) => roleMap.get(id) || { id, name: id });

    // 1. Parallel data fetch from existing authoritative repositories
    const [
      handoff,
      checklist,
      engagements,
      allApplications,
      interviews,
      modWarnings,
      legacyWarnings,
      modRestrictions,
      legacyRestrictions,
      blacklistEntries,
      eventRegistrations,
      allEvents,
    ] = await Promise.all([
      memberHandoffsRepository.getById(`handoff_${communityId}_${discordUserId}`),
      memberOnboardingChecklistsRepository.getById(`checklist_${communityId}_${discordUserId}`),
      earlyEngagementEventsRepository.list({
        where: [
          { field: 'communityId', operator: '==', value: communityId },
          { field: 'discordUserId', operator: '==', value: discordUserId },
        ],
        limit: 50,
      }),
      viewerPermissions.canViewRecruitment
        ? applicationsRepository.listForTenant(communityId)
        : Promise.resolve([]),
      viewerPermissions.canViewRecruitment
        ? interviewsRepository.listForTenant(communityId)
        : Promise.resolve([]),
      viewerPermissions.canViewModeration
        ? moderationWarningsRepository.listForTenant(communityId)
        : Promise.resolve([]),
      viewerPermissions.canViewModeration
        ? warningsRepository.listForTenant(communityId)
        : Promise.resolve([]),
      viewerPermissions.canViewModeration
        ? moderationRestrictionsRepository.listForTenant(communityId)
        : Promise.resolve([]),
      viewerPermissions.canViewModeration
        ? applicantRestrictionsRepository.listForTenant(communityId)
        : Promise.resolve([]),
      viewerPermissions.canViewModeration
        ? blacklistEntriesRepository.listForTenant(communityId)
        : Promise.resolve([]),
      eventRegistrationsRepository.list({
        where: [
          { field: 'communityId', operator: '==', value: communityId },
          { field: 'discordUserId', operator: '==', value: discordUserId },
        ],
        limit: 50,
      }),
      eventsRepository.listForTenant(communityId),
    ]);

    // 2. Resolve Recruitment Context
    let recruitment: Member360Recruitment | null = null;
    let targetApp: any = null;

    if (viewerPermissions.canViewRecruitment) {
      targetApp =
        (handoff?.applicationId ? allApplications.find((a) => a.id === handoff.applicationId) : null) ||
        allApplications.find(
          (a) =>
            a.applicantDiscordUserId === discordUserId ||
            a.applicantDiscordId === discordUserId ||
            a.applicantUserId === discordUserId
        );

      const targetInterview = targetApp
        ? interviews.find((i) => i.applicationId === targetApp.id)
        : null;

      const configuredItems = checklist?.items?.filter((i) => i.configured) || [];
      const completedItems = configuredItems.filter((i) => i.status === 'COMPLETED');
      const progressPercent =
        configuredItems.length > 0 ? Math.round((completedItems.length / configuredItems.length) * 100) : 0;

      recruitment = {
        hasApplication: Boolean(targetApp),
        applicationId: targetApp?.id,
        applicationStatus: targetApp?.status,
        submittedAt: targetApp?.submittedAt || targetApp?.createdAt,
        recruiterName: targetApp?.recruiterName,
        recruiterCode: targetApp?.recruiterCode || memberDoc.recruiterCode,
        recruiterDiscordUserId: targetApp?.recruiterDiscordUserId,
        referralSource: targetApp?.source,
        interviewStatus: targetInterview?.status,
        interviewScheduledAt: targetInterview?.scheduledAt,
        handoffStatus: handoff?.status,
        onboardingStatus: handoff?.onboardingStatus || checklist?.overallStatus,
        checklistProgress: configuredItems.length > 0 ? {
          completed: completedItems.length,
          total: configuredItems.length,
          percentage: progressPercent,
        } : undefined,
        activationDate: handoff?.memberActivatedAt,
      };
    }

    // 3. Resolve Moderation Context
    let moderation: Member360Moderation | null = null;
    const memberBlacklist = blacklistEntries.find(
      (b) => b.discordUserId === discordUserId && b.status === 'ACTIVE'
    );

    const userWarnings = [
      ...modWarnings.filter((w) => (w.targetDiscordUserId === discordUserId || w.discordUserId === discordUserId) && w.status === 'ACTIVE').map((w) => ({
        id: w.id,
        reason: w.reason,
        severity: w.severity || 'MEDIUM',
        createdAt: w.createdAt,
        issuerRole: w.issuerRole,
      })),
      ...legacyWarnings.filter((w) => (w.discordUserId === discordUserId || (w as any).userId === discordUserId) && ((w as any).status === 'ACTIVE' || !(w as any).revoked)).map((w) => ({
        id: w.id,
        reason: w.reason,
        severity: (w as any).severity || 'MEDIUM',
        createdAt: w.createdAt || (w as any).timestamp,
        issuerRole: 'STAFF',
      })),
    ];

    const userRestrictions = [
      ...modRestrictions.filter((r) => r.targetDiscordUserId === discordUserId && r.status === 'ACTIVE').map((r) => ({
        id: r.id,
        restrictionType: r.restrictionType,
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt,
      })),
      ...legacyRestrictions.filter((r) => (r.discordUserId === discordUserId || r.applicantId === discordUserId) && r.status === 'ACTIVE').map((r) => ({
        id: r.id,
        restrictionType: r.type || 'RESTRICTION',
        reason: r.reason,
        status: r.status,
        createdAt: r.createdAt,
      })),
    ];

    if (viewerPermissions.canViewModeration) {
      moderation = {
        isAuthorized: true,
        activeWarningsCount: userWarnings.length,
        activeRestrictionsCount: userRestrictions.length,
        isBlacklisted: Boolean(memberBlacklist),
        blacklistReason: memberBlacklist?.reason,
        warnings: userWarnings,
        restrictions: userRestrictions,
      };
    }

    // 4. Resolve Events Context
    const eventMap = new Map<string, any>(allEvents.map((e) => [e.id, e]));
    const memberRegistrations = eventRegistrations.map((reg) => {
      const event = eventMap.get(reg.eventId);
      return {
        eventId: reg.eventId,
        eventTitle: event?.title || 'Community Event',
        registeredAt: reg.registeredAt || (reg as any).createdAt || new Date().toISOString(),
        attendanceStatus: (reg.attendanceStatus || (reg.attended ? 'ATTENDED' : 'REGISTERED')) as
          | 'REGISTERED'
          | 'ATTENDED'
          | 'NO_SHOW'
          | 'CANCELLED',
      };
    });

    const attendedCount = memberRegistrations.filter((r) => r.attendanceStatus === 'ATTENDED').length;
    const noShowCount = memberRegistrations.filter((r) => r.attendanceStatus === 'NO_SHOW').length;

    const events: Member360Events = {
      totalRegistrations: memberRegistrations.length,
      totalAttended: attendedCount,
      totalNoShow: noShowCount,
      registrations: memberRegistrations,
    };

    // 5. Derive Health Signal & Engagement
    let healthSignal: Member360Overview['healthSignal'] = 'INSUFFICIENT_DATA';
    if (checklist && checklist.overallStatus === 'COMPLETED') {
      healthSignal = 'ONBOARDING_COMPLETE';
    } else if (engagements.length >= 2) {
      healthSignal = 'ACTIVE';
    } else if (engagements.length === 1) {
      healthSignal = 'LOW_ACTIVITY';
    } else if (memberDoc.joinedAt) {
      const daysSinceJoin = (Date.now() - new Date(memberDoc.joinedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceJoin > 7) {
        healthSignal = 'AT_RISK';
      } else {
        healthSignal = 'INSUFFICIENT_DATA';
      }
    }

    const engagement: Member360Engagement = {
      healthSignal,
      earlyEngagementEvents: engagements.map((e) => ({
        eventType: e.eventType,
        timestamp: e.timestamp,
        metadata: e.metadata,
      })),
      campaignParticipationCount: 0,
      pollVotesCount: 0,
      announcementsInteractedCount: 0,
      eventsAttendedCount: attendedCount,
    };

    // 6. Build Unified Activity Timeline
    const timelineItems: Member360TimelineItem[] = [];

    if (memberDoc.joinedAt) {
      timelineItems.push({
        id: `tl_join_${discordUserId}`,
        timestamp: memberDoc.joinedAt,
        category: 'DISCORD',
        eventType: 'MEMBER_JOINED',
        title: 'Joined Discord Server',
        description: `${memberDoc.displayNameSnapshot} joined the community server.`,
      });
    }

    if (targetApp) {
      if (targetApp.submittedAt || targetApp.createdAt) {
        timelineItems.push({
          id: `tl_app_sub_${targetApp.id}`,
          timestamp: targetApp.submittedAt || targetApp.createdAt,
          category: 'RECRUITMENT',
          eventType: 'APPLICATION_SUBMITTED',
          title: 'Application Submitted',
          description: `Applied via ${targetApp.source || 'Community Form'} (Code: ${targetApp.recruiterCode || 'None'})`,
          result: targetApp.status,
        });
      }
      if (targetApp.approvedAt) {
        timelineItems.push({
          id: `tl_app_appr_${targetApp.id}`,
          timestamp: targetApp.approvedAt,
          category: 'RECRUITMENT',
          eventType: 'APPLICATION_APPROVED',
          title: 'Application Approved',
          description: `Application approved by recruitment staff.`,
        });
      }
    }

    if (handoff?.memberActivatedAt) {
      timelineItems.push({
        id: `tl_handoff_act_${handoff.id}`,
        timestamp: handoff.memberActivatedAt,
        category: 'RECRUITMENT',
        eventType: 'MEMBER_ACTIVATED',
        title: 'Member Onboarded & Activated',
        description: `Successfully transitioned from candidate to active community member.`,
      });
    }

    engagements.forEach((eng) => {
      timelineItems.push({
        id: `tl_eng_${eng.id}`,
        timestamp: eng.timestamp,
        category: 'ENGAGEMENT',
        eventType: eng.eventType,
        title: eng.eventType.replace(/_/g, ' '),
        description: `Early engagement recorded: ${eng.eventType}`,
        metadata: eng.metadata,
      });
    });

    if (viewerPermissions.canViewModeration) {
      userWarnings.forEach((w) => {
        timelineItems.push({
          id: `tl_warn_${w.id}`,
          timestamp: w.createdAt,
          category: 'MODERATION',
          eventType: 'MEMBER_WARNED',
          title: `Warning Issued (${w.severity})`,
          description: w.reason,
        });
      });

      userRestrictions.forEach((r) => {
        timelineItems.push({
          id: `tl_rest_${r.id}`,
          timestamp: r.createdAt,
          category: 'MODERATION',
          eventType: 'RESTRICTION_APPLIED',
          title: `Restriction: ${r.restrictionType}`,
          description: r.reason,
        });
      });

      if (memberBlacklist) {
        timelineItems.push({
          id: `tl_bl_${memberBlacklist.id}`,
          timestamp: memberBlacklist.createdAt || memberBlacklist.addedAt,
          category: 'MODERATION',
          eventType: 'MEMBER_BLACKLISTED',
          title: 'Added to Moderation Blacklist',
          description: memberBlacklist.reason,
        });
      }
    }

    memberRegistrations.forEach((reg, idx) => {
      timelineItems.push({
        id: `tl_evt_${reg.eventId}_${idx}`,
        timestamp: reg.registeredAt,
        category: 'EVENTS',
        eventType: 'EVENT_REGISTRATION',
        title: `Registered: ${reg.eventTitle}`,
        description: `Attendance Status: ${reg.attendanceStatus}`,
      });
    });

    // Chronological descending sort
    timelineItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // 7. Calculate Retention Milestones (Day 1, 7, 30, 90)
    const joinTime = memberDoc.joinedAt ? new Date(memberDoc.joinedAt).getTime() : 0;
    const nowTime = Date.now();
    const observationDays = joinTime > 0 ? Math.floor((nowTime - joinTime) / (1000 * 60 * 60 * 24)) : 0;

    const hasActivityAfter = (minDays: number, maxDays: number) => {
      if (joinTime === 0) return false;
      const minMs = joinTime + minDays * 86400000;
      const maxMs = joinTime + maxDays * 86400000;
      return engagements.some((e) => {
        const t = new Date(e.timestamp).getTime();
        return t >= minMs && t <= maxMs;
      });
    };

    const retention: Member360Retention = {
      observationDays,
      day1: observationDays >= 1 ? (hasActivityAfter(1, 3) || engagements.length > 0) : 'INSUFFICIENT_DATA',
      day7: observationDays >= 7 ? (hasActivityAfter(7, 14) || engagements.length >= 2) : 'INSUFFICIENT_DATA',
      day30: observationDays >= 30 ? (hasActivityAfter(30, 45) || engagements.length >= 3) : 'INSUFFICIENT_DATA',
      day90: observationDays >= 90 ? (hasActivityAfter(90, 105) || engagements.length >= 4) : 'INSUFFICIENT_DATA',
    };

    // 8. Overview & Discord models
    const overview: Member360Overview = {
      discordUserId: memberDoc.discordUserId,
      username: memberDoc.usernameSnapshot,
      displayName: memberDoc.displayNameSnapshot,
      avatarUrl: memberDoc.avatarSnapshot,
      joinedAt: memberDoc.joinedAt,
      membershipStatus: memberDoc.membershipStatus,
      syncState: memberDoc.syncState,
      lastSyncedAt: memberDoc.syncedAt,
      roles: memberRoles,
      recruiterCode: memberDoc.recruiterCode,
      recruitmentStatus: memberDoc.recruiterCode ? 'RECRUITED' : 'ORGANIC',
      healthSignal,
      moderationSummary: viewerPermissions.canViewModeration
        ? {
            activeWarnings: userWarnings.length,
            activeRestrictions: userRestrictions.length,
            isBlacklisted: Boolean(memberBlacklist),
          }
        : undefined,
    };

    const discord: Member360Discord = {
      guildId,
      guildName: community.name || 'Discord Server',
      joinedAt: memberDoc.joinedAt,
      roles: memberRoles,
      nickname: memberDoc.nicknameSnapshot,
      isBot: false,
      syncState: memberDoc.syncState,
      lastSyncedAt: memberDoc.syncedAt,
    };

    return {
      communityId,
      discordUserId,
      overview,
      discord,
      recruitment,
      engagement,
      moderation,
      events,
      activityTimeline: timelineItems,
      retention,
      viewerPermissions,
    };
  }

  /**
   * Authoritatively assigns a Discord role to a member with hierarchy & permission validation
   */
  async assignMemberRole(
    communityId: string,
    discordUserId: string,
    roleId: string,
    authUser: UserAuthContext
  ): Promise<{ success: boolean; roles: string[] }> {
    const isAuthorized =
      hasPermission(authUser, 'users.manage') ||
      ['OWNER', 'CONTROLLER', 'ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MANAGER'].includes(authUser.role as string);

    if (!isAuthorized) {
      throw new ForbiddenError('Permission required to assign member roles');
    }

    const community = await communitiesRepository.getById(communityId);
    if (!community) {
      throw new NotFoundError(`Community ${communityId} not found`);
    }

    const guildId = community.guildId || community.discordGuildId || '';
    const memberDoc = await this.getMemberDoc(communityId, discordUserId);
    if (!memberDoc) {
      throw new NotFoundError(`Member ${discordUserId} not found in community ${communityId}`);
    }

    // Role Hierarchy & Managed Role Protection
    const communityRoles = await this.getCommunityRoles(communityId, guildId);
    const targetRole = communityRoles.find((r) => r.id === roleId);

    if (targetRole && targetRole.managed) {
      throw new BadRequestError('Cannot manually assign managed integration or bot roles');
    }

    // Attempt Discord API Role assignment
    let discordSuccess = true;
    if (discordService.isConnected()) {
      const result = await discordService.assignRole(guildId, discordUserId, roleId);
      if (!result.success) {
        if (result.error?.includes('HIERARCHY')) {
          throw new BadRequestError(`Role assignment failed: ${result.error}`);
        }
        logger.warn(`[Member360] Discord live role assign error: ${result.error}`);
        discordSuccess = false;
      }
    }

    // Update local member record idempotently
    const currentRoles = new Set(memberDoc.discordRoleIds || []);
    currentRoles.add(roleId);
    const updatedRoles = Array.from(currentRoles);

    await discordMembersRepository.update(memberDoc.id, {
      discordRoleIds: updatedRoles,
      syncedAt: new Date().toISOString(),
    });

    await auditService.record({
      communityId,
      actorUserId: authUser.userId,
      actorRole: authUser.role,
      action: 'MEMBER_ROLE_ASSIGNED',
      targetType: 'community_member' as any,
      targetId: discordUserId,
      metadata: { roleId, roleName: targetRole?.name, discordSuccess },
    });

    // Send notification
    try {
      await notificationService.createAndDispatch({
        communityId,
        recipientDiscordId: discordUserId,
        recipientUserId: authUser.userId,
        category: 'SYSTEM',
        type: 'ROLE_ASSIGNED',
        priority: 'INFO',
        title: 'Community Role Assigned',
        body: `You were assigned the ${targetRole?.name || roleId} role in ${community.name}.`,
        resourceType: 'DISCORD_ROLE',
        resourceId: roleId,
      });
    } catch (notifErr: any) {
      logger.warn(`[Member360] Role assignment notification error: ${notifErr.message}`);
    }

    return { success: true, roles: updatedRoles };
  }

  /**
   * Authoritatively removes a Discord role from a member
   */
  async removeMemberRole(
    communityId: string,
    discordUserId: string,
    roleId: string,
    authUser: UserAuthContext
  ): Promise<{ success: boolean; roles: string[] }> {
    const isAuthorized =
      hasPermission(authUser, 'users.manage') ||
      ['OWNER', 'CONTROLLER', 'ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MANAGER'].includes(authUser.role as string);

    if (!isAuthorized) {
      throw new ForbiddenError('Permission required to remove member roles');
    }

    const community = await communitiesRepository.getById(communityId);
    if (!community) {
      throw new NotFoundError(`Community ${communityId} not found`);
    }

    const guildId = community.guildId || community.discordGuildId || '';
    const memberDoc = await this.getMemberDoc(communityId, discordUserId);
    if (!memberDoc) {
      throw new NotFoundError(`Member ${discordUserId} not found in community ${communityId}`);
    }

    if (discordService.isConnected()) {
      await discordService.removeRole(guildId, discordUserId, roleId);
    }

    const currentRoles = (memberDoc.discordRoleIds || []).filter((id) => id !== roleId);

    await discordMembersRepository.update(memberDoc.id, {
      discordRoleIds: currentRoles,
      syncedAt: new Date().toISOString(),
    });

    await auditService.record({
      communityId,
      actorUserId: authUser.userId,
      actorRole: authUser.role,
      action: 'MEMBER_ROLE_REMOVED',
      targetType: 'community_member' as any,
      targetId: discordUserId,
      metadata: { roleId },
    });

    return { success: true, roles: currentRoles };
  }

  /**
   * Performs manual sync for a specific member from Discord
   */
  async syncSingleMember(
    communityId: string,
    discordUserId: string,
    authUser: UserAuthContext
  ): Promise<DiscordMemberDocument> {
    const community = await communitiesRepository.getById(communityId);
    if (!community) {
      throw new NotFoundError(`Community ${communityId} not found`);
    }

    const guildId = community.guildId || community.discordGuildId || '';
    let memberDoc = await this.getMemberDoc(communityId, discordUserId);
    const now = new Date().toISOString();

    if (discordService.isConnected()) {
      try {
        const client = (discordService as any).client;
        const guild = await client?.guilds?.fetch(guildId);
        if (guild) {
          const guildMember = await guild.members.fetch(discordUserId);
          if (guildMember) {
            const updated: DiscordMemberDocument = {
              id: `${communityId}_${discordUserId}`,
              communityId,
              discordGuildId: guildId,
              discordUserId,
              usernameSnapshot: guildMember.user?.username || memberDoc?.usernameSnapshot || 'DiscordMember',
              displayNameSnapshot: guildMember.displayName || memberDoc?.displayNameSnapshot || 'Discord Member',
              nicknameSnapshot: guildMember.nickname || undefined,
              avatarSnapshot: guildMember.user?.displayAvatarURL?.() || undefined,
              discordRoleIds: (Array.from(guildMember.roles.cache.keys()) as string[]).filter((k) => k !== guildId),
              joinedAt: guildMember.joinedAt?.toISOString() || memberDoc?.joinedAt || now,
              syncedAt: now,
              source: 'DISCORD_SYNC',
              recruiterCode: memberDoc?.recruiterCode,
              membershipStatus: 'ACTIVE',
              syncState: 'SYNCED',
            };

            await discordMembersRepository.upsert(updated);
            return updated;
          }
        }
      } catch (err: any) {
        logger.warn(`[Member360] Live member fetch failed for ${discordUserId}: ${err.message}`);
      }
    }

    if (memberDoc) {
      await discordMembersRepository.update(memberDoc.id, {
        syncedAt: now,
        syncState: 'SYNCED',
      });
      return { ...memberDoc, syncedAt: now, syncState: 'SYNCED' };
    }

    throw new NotFoundError(`Member ${discordUserId} could not be located in Discord guild or repository`);
  }
}

export const communityMember360Service = new CommunityMember360Service();
