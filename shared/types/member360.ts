import { MemberSyncState, AttributionType } from './models.js';

export interface MemberRoleInfo {
  id: string;
  name: string;
  color?: string;
  position?: number;
  managed?: boolean;
}

export interface Member360Overview {
  discordUserId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  joinedAt?: string;
  membershipStatus: 'ACTIVE' | 'LEFT' | 'BANNED' | 'KICKED' | 'UNKNOWN' | 'SYNC_REQUIRED';
  syncState: MemberSyncState;
  lastSyncedAt: string;
  roles: MemberRoleInfo[];
  recruiterCode?: string;
  recruitmentStatus?: string;
  healthSignal: 'ACTIVE' | 'LOW_ACTIVITY' | 'AT_RISK' | 'ONBOARDING_COMPLETE' | 'INSUFFICIENT_DATA';
  moderationSummary?: {
    activeWarnings: number;
    activeRestrictions: number;
    isBlacklisted: boolean;
  };
}

export interface Member360Discord {
  guildId: string;
  guildName: string;
  joinedAt?: string;
  roles: MemberRoleInfo[];
  nickname?: string;
  isBot: boolean;
  syncState: MemberSyncState;
  lastSyncedAt: string;
}

export interface Member360Recruitment {
  hasApplication: boolean;
  applicationId?: string;
  applicationStatus?: string;
  submittedAt?: string;
  recruiterName?: string;
  recruiterCode?: string;
  recruiterDiscordUserId?: string;
  referralSource?: string;
  interviewStatus?: string;
  interviewScheduledAt?: string;
  handoffStatus?: string;
  onboardingStatus?: string;
  checklistProgress?: {
    completed: number;
    total: number;
    percentage: number;
  };
  activationDate?: string;
}

export interface Member360Engagement {
  healthSignal: 'ACTIVE' | 'LOW_ACTIVITY' | 'AT_RISK' | 'ONBOARDING_COMPLETE' | 'INSUFFICIENT_DATA';
  earlyEngagementEvents: {
    eventType: string;
    timestamp: string;
    metadata?: Record<string, any>;
  }[];
  campaignParticipationCount: number;
  pollVotesCount: number;
  announcementsInteractedCount: number;
  eventsAttendedCount: number;
}

export interface Member360Moderation {
  isAuthorized: boolean;
  activeWarningsCount: number;
  activeRestrictionsCount: number;
  isBlacklisted: boolean;
  blacklistReason?: string;
  warnings: {
    id: string;
    reason: string;
    severity: string;
    createdAt: string;
    issuerRole?: string;
  }[];
  restrictions: {
    id: string;
    restrictionType: string;
    reason: string;
    status: string;
    createdAt: string;
  }[];
}

export interface Member360EventRegistration {
  eventId: string;
  eventTitle: string;
  registeredAt: string;
  attendanceStatus: 'REGISTERED' | 'ATTENDED' | 'NO_SHOW' | 'CANCELLED';
}

export interface Member360Events {
  totalRegistrations: number;
  totalAttended: number;
  totalNoShow: number;
  registrations: Member360EventRegistration[];
}

export interface Member360TimelineItem {
  id: string;
  timestamp: string;
  category: 'DISCORD' | 'RECRUITMENT' | 'ENGAGEMENT' | 'MODERATION' | 'EVENTS' | 'SYSTEM';
  eventType: string;
  title: string;
  description: string;
  result?: string;
  metadata?: Record<string, any>;
}

export interface Member360Retention {
  day1: boolean | 'INSUFFICIENT_DATA';
  day7: boolean | 'INSUFFICIENT_DATA';
  day30: boolean | 'INSUFFICIENT_DATA';
  day90: boolean | 'INSUFFICIENT_DATA';
  observationDays: number;
}

export interface Member360ViewerPermissions {
  canManageRoles: boolean;
  canModerate: boolean;
  canViewRecruitment: boolean;
  canViewModeration: boolean;
  canSendNotification: boolean;
  canRetryHandoff: boolean;
  canExport: boolean;
}

export interface Member360Profile {
  communityId: string;
  discordUserId: string;
  overview: Member360Overview;
  discord: Member360Discord;
  recruitment: Member360Recruitment | null;
  engagement: Member360Engagement;
  moderation: Member360Moderation | null;
  events: Member360Events;
  activityTimeline: Member360TimelineItem[];
  retention: Member360Retention;
  viewerPermissions: Member360ViewerPermissions;
}

export interface MemberListQuery {
  page?: number;
  limit?: number;
  q?: string;
  roleId?: string;
  membershipStatus?: string;
  recruitmentStatus?: 'ALL' | 'RECRUITED' | 'ORGANIC' | 'ACTIVE_APP';
  warningStatus?: 'ALL' | 'HAS_WARNINGS' | 'CLEAN';
  sortBy?: 'joinedAt' | 'displayName' | 'lastSyncedAt';
  sortDirection?: 'asc' | 'desc';
}

export interface MemberListSyncOverview {
  lastSyncedAt: string;
  syncState: MemberSyncState;
  totalMembers: number;
  activeMembers: number;
  linkedRecruits: number;
  guildConnected: boolean;
  guildName?: string;
}

export interface MemberListResponse {
  items: {
    id: string;
    communityId: string;
    discordGuildId: string;
    discordUserId: string;
    usernameSnapshot: string;
    displayNameSnapshot: string;
    nicknameSnapshot?: string;
    avatarSnapshot?: string;
    discordRoleIds: string[];
    roleDetails?: MemberRoleInfo[];
    joinedAt?: string;
    syncedAt: string;
    source: 'DISCORD_SYNC' | 'MANUAL_ADD' | 'BULK_IMPORT';
    recruiterCode?: string;
    membershipStatus: 'ACTIVE' | 'LEFT' | 'BANNED' | 'KICKED' | 'UNKNOWN' | 'SYNC_REQUIRED';
    syncState: MemberSyncState;
    hasActiveWarnings?: boolean;
    recruitmentStatus?: string;
  }[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  syncOverview: MemberListSyncOverview;
}
