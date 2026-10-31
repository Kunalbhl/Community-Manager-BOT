export type DiscordChannelType =
  | 'GUILD_TEXT'
  | 'DM'
  | 'GUILD_VOICE'
  | 'GROUP_DM'
  | 'GUILD_CATEGORY'
  | 'GUILD_ANNOUNCEMENT'
  | 'ANNOUNCEMENT'
  | 'ANNOUNCEMENT_THREAD'
  | 'PUBLIC_THREAD'
  | 'PRIVATE_THREAD'
  | 'GUILD_STAGE_VOICE'
  | 'GUILD_DIRECTORY'
  | 'GUILD_FORUM'
  | 'GUILD_MEDIA'
  | 'TEXT'
  | 'VOICE'
  | 'CATEGORY'
  | 'UNKNOWN';

export interface DiscordGuildResource {
  id: string;
  name: string;
  iconURL?: string | null;
  memberCount: number;
  ownerId?: string;
  permissions?: string;
  isAvailable: boolean;
}

export interface DiscordChannelPermissionsSummary {
  view: boolean;
  send: boolean;
  embed: boolean;
  history: boolean;
  manageMessages?: boolean;
  addReactions?: boolean;
  attachFiles?: boolean;
}

export interface DiscordChannelResource {
  id: string;
  name: string;
  type: DiscordChannelType;
  rawType: number | string;
  position?: number;
  parentId?: string | null;
  parentName?: string;
  topic?: string | null;
  isTextBased: boolean;
  isVoiceBased: boolean;
  canBotSendMessages?: boolean;
  canBotView?: boolean;
  canBotEmbed?: boolean;
  canBotReadHistory?: boolean;
  canBotManageMessages?: boolean;
  canBotAddReactions?: boolean;
  canBotAttachFiles?: boolean;
  permissionsSummary?: DiscordChannelPermissionsSummary;
}

export interface DiscordRoleResource {
  id: string;
  name: string;
  color?: string;
  hexColor?: string;
  position: number;
  managed: boolean;
  mentionable: boolean;
  hoist: boolean;
  permissions: string[];
  permissionsBitfield?: string;
  isSystemRole?: boolean;
  isBotRole?: boolean;
  botManageable?: boolean;
  isHigherThanBot?: boolean;
}

export interface DiscordMemberResource {
  id: string;
  discordUserId: string;
  username: string;
  discriminator?: string;
  globalName?: string | null;
  displayName: string;
  nickname?: string | null;
  avatarUrl?: string | null;
  roleIds: string[];
  joinedAt?: string | null;
  isBot: boolean;
  isOwner?: boolean;
  premiumSince?: string | null;
}

export type DiscordDiscoveryState =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'NOT_CONFIGURED'
  | 'GUILD_NOT_FOUND'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'RATE_LIMITED'
  | 'ERROR';

export interface DiscordResourceDiscoveryResult<T> {
  success: boolean;
  state: DiscordDiscoveryState;
  isLive: boolean;
  guildId?: string;
  guildName?: string;
  items: T[];
  totalCount: number;
  cached?: boolean;
  discoveredAt: string;
  error?: string;
}
