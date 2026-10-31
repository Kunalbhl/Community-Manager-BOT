/**
 * Task 170: Player-wise Recruitment Progress Board, Referral Rewards & Live Message Synchronization
 * Authoritative types, models, and template constants.
 */

export interface RankProgressionRule {
  threshold: number;
  rankName: string;
  discordRoleId: string;
  extraRoundsReward?: number;
  bonusPoints?: number;
}

export interface RecruitmentProgressBoardConfig {
  id: string; // `rpb_${communityId}`
  communityId: string;
  discordGuildId?: string;
  enabled: boolean;
  channelId?: string;
  channelNameSnapshot?: string;
  messageTemplate: string;
  rankProgressionRules: RankProgressionRule[];
  pointsPerInvite: number;
  extraRoundsPerInvite: number;
  rewardAdjustmentAllowedRoles: string[];
  claimWorkflowEnabled: boolean;
  supplierChannelId?: string;
  supplierChannelNameSnapshot?: string;
  lastSyncedAt?: string;
  lastSyncStatus?: 'IDLE' | 'SYNCED' | 'FAILED' | 'PARTIAL';
  lastErrorCode?: string;
  lastErrorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProgressMessageSyncStatus =
  | 'SYNCED'
  | 'FAILED'
  | 'PENDING'
  | 'MESSAGE_NOT_FOUND';

export interface PlayerProgressMessageDocument {
  id: string; // `ppm_${communityId}_${discordUserId}`
  communityId: string;
  discordGuildId: string;
  discordUserId: string;
  discordUsername?: string;
  channelId: string;
  discordMessageId: string;
  currentContent: string;
  contentVersion: number;
  actualInviteCount: number;
  achievedRankName: string;
  achievedRoleId: string;
  availableRewardBalance: number;
  totalRewardsEarned: number;
  totalRewardsClaimed: number;
  lastSyncedAt: string;
  lastSyncStatus: ProgressMessageSyncStatus;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export type RewardLedgerTransactionType =
  | 'EARNED'
  | 'DEDUCTED'
  | 'REDEEMED'
  | 'ADJUSTMENT'
  | 'REVERSED';

export interface RecruiterRewardLedgerEntry {
  id: string;
  communityId: string;
  playerDiscordUserId: string;
  transactionType: RewardLedgerTransactionType;
  amount: number; // delta (+ or -)
  balanceBefore: number;
  balanceAfter: number;
  reason: string;
  actorUserId: string;
  relatedId?: string;
  idempotencyKey: string;
  timestamp: string;
  result: 'SUCCESS' | 'REJECTED';
}

export type RewardClaimStatus = 'PENDING' | 'APPROVED' | 'FULFILLED' | 'REJECTED';

export interface RewardClaimDocument {
  id: string;
  communityId: string;
  playerDiscordUserId: string;
  amount: number;
  status: RewardClaimStatus;
  supplierChannelId?: string;
  supplierMessageId?: string;
  supplierNotified: boolean;
  supplierNotificationError?: string;
  idempotencyKey: string;
  actorUserId: string;
  claimNote?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlayerProgressSummary {
  communityId: string;
  discordUserId: string;
  discordUsername: string;
  actualInviteCount: number;
  achievedRankName: string;
  achievedRoleId: string;
  availableRewardBalance: number;
  totalRewardsEarned: number;
  totalRewardsClaimed: number;
  nextRewardCount: number;
  messageId?: string;
  syncStatus: ProgressMessageSyncStatus;
  lastSyncedAt?: string;
  lastErrorCode?: string;
}

export const ALLOWED_PROGRESS_BOARD_VARIABLES = [
  'playerMention',
  'playerName',
  'inviteCount',
  'rankName',
  'rankRoleMention',
  'rewardBalance',
  'nextRewardCount',
] as const;

export type ProgressBoardVariable = typeof ALLOWED_PROGRESS_BOARD_VARIABLES[number];

export const DEFAULT_PROGRESS_BOARD_TEMPLATE =
  '{{playerMention}}  Achieved  {{rankRoleMention}}  With  {{inviteCount}} Member Invite.  📌 Next extra rounds = {{rewardBalance}}';

export const DEFAULT_PROGRESS_BOARD_RANK_RULES: RankProgressionRule[] = [
  { threshold: 1, rankName: 'Novice Recruiter', discordRoleId: '', extraRoundsReward: 1 },
  { threshold: 3, rankName: 'Junior Recruiter', discordRoleId: '', extraRoundsReward: 1 },
  { threshold: 5, rankName: 'Established Recruiter', discordRoleId: '', extraRoundsReward: 2 },
  { threshold: 8, rankName: 'Senior Recruiter', discordRoleId: '', extraRoundsReward: 2 },
  { threshold: 12, rankName: 'Elite Recruiter', discordRoleId: '', extraRoundsReward: 3 },
  { threshold: 20, rankName: 'Master Recruiter', discordRoleId: '', extraRoundsReward: 5 },
];
