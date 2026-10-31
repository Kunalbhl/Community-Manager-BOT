export type DiscordGatewayState =
  | 'NOT_CONFIGURED'
  | 'AUTHENTICATION_REQUIRED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'RECONNECTING'
  | 'FAILED'
  | 'PERMISSION_REQUIRED';

export interface DiscordMessageResult {
  messageId: string;
  channelId: string;
  sentAt: string;
  success: boolean;
  failureReason?: string;
}

export interface DiscordGatewayDiagnostics {
  state: DiscordGatewayState;
  botTag?: string;
  botUserId?: string;
  guildsCount: number;
  pingMs: number;
  lastHeartbeatAt?: string;
  connectedAt?: string;
  disconnectReason?: string;
  intentsEnabled: string[];
  messageContentIntentActive: boolean;
}

export interface IDiscordService {
  isConfigured(): boolean;
  isConnected(): boolean;
  isReady(): boolean;
  getConnectionState(): DiscordGatewayState;
  getDiagnostics(): DiscordGatewayDiagnostics;
  getGuild(guildId: string): any;
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  sendDM(discordUserId: string, content: string): Promise<DiscordMessageResult>;
  sendChannelMessage(channelId: string, content: string, options?: { guildId?: string }): Promise<DiscordMessageResult>;
  editChannelMessage(channelId: string, messageId: string, content: string, options?: { guildId?: string; allowedMentions?: any }): Promise<DiscordMessageResult>;
  fetchChannelMessage(channelId: string, messageId: string, options?: { guildId?: string }): Promise<{ success: boolean; messageId?: string; content?: string; error?: string }>;
  assignRole(guildId: string, discordUserId: string, roleId: string): Promise<{ success: boolean; error?: string }>;
  removeRole(guildId: string, discordUserId: string, roleId: string): Promise<{ success: boolean; error?: string }>;
}

export interface DiscordProvider extends IDiscordService {
  client: any;
  createRole(guildId: string, options: { name: string; color?: string; mentionable?: boolean; hoist?: boolean }): Promise<{ success: boolean; role?: any; error?: string }>;
  updateRole(guildId: string, roleId: string, updates: { name?: string; color?: string; mentionable?: boolean; hoist?: boolean }): Promise<{ success: boolean; role?: any; error?: string }>;
  createChannel(guildId: string, options: { name: string; type?: number | string; parentId?: string; topic?: string }): Promise<{ success: boolean; channel?: any; error?: string }>;
  updateChannel(guildId: string, channelId: string, updates: { name?: string; topic?: string }): Promise<{ success: boolean; channel?: any; error?: string }>;
}

