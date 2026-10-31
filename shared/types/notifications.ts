import { UserRole } from './rbac.js';

export type NotificationCategory =
  | 'RECRUITMENT'
  | 'ENGAGEMENT'
  | 'MODERATION'
  | 'EVENTS'
  | 'AUTOMATION'
  | 'INTEGRATIONS'
  | 'SECURITY'
  | 'SYSTEM'
  | 'INSIGHTS'
  | 'PLATFORM';

export type NotificationPriority = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

export type NotificationRecipientType = 'USER' | 'ROLE' | 'COMMUNITY' | 'PLATFORM_OWNER';

export type NotificationStatus = 'UNREAD' | 'READ' | 'ARCHIVED' | 'EXPIRED';

export type NotificationDeliveryChannel = 'IN_APP' | 'DISCORD' | 'EMAIL';

export type NotificationDeliveryState =
  | 'PENDING'
  | 'PROCESSING'
  | 'DELIVERED'
  | 'FAILED'
  | 'RETRYABLE'
  | 'CANCELLED'
  | 'NOT_CONFIGURED'
  | 'PERMISSION_REQUIRED'
  | 'RATE_LIMITED';

export type NotificationPolicy = 'REQUIRED' | 'OPTIONAL';

export interface UnifiedNotification {
  id: string;
  communityId?: string; // Tenant isolation (undefined only for global platform owner notifications)
  communityName?: string;
  recipientType: NotificationRecipientType;
  recipientUserId: string; // The explicit authoritative user ID
  recipientRole?: UserRole;
  recipientDiscordId?: string;
  category: NotificationCategory;
  type: string;
  priority: NotificationPriority;
  policy: NotificationPolicy;
  title: string;
  body: string;
  resourceType?: string; // e.g. 'application', 'interview', 'moderation_incident', 'event', 'integration', 'security'
  resourceId?: string;
  route?: string; // UI target navigation route (e.g. 'applications', 'moderation', 'settings', 'events')
  channel: NotificationDeliveryChannel;
  deliveryStatus: NotificationDeliveryState;
  deliveryError?: string;
  read: boolean;
  status: NotificationStatus;
  readAt?: string;
  archivedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface UserNotificationPreference {
  userId: string;
  communityId?: string;
  categories: Record<
    NotificationCategory,
    {
      enabled: boolean;
      channels: NotificationDeliveryChannel[];
    }
  >;
  emailNotificationsEnabled: boolean;
  discordDmEnabled: boolean;
  inAppEnabled: boolean;
  updatedAt: string;
}

export interface NotificationFilterParams {
  communityId?: string;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  status?: NotificationStatus;
  unreadOnly?: boolean;
  page?: number;
  limit?: number;
  search?: string;
}

export interface NotificationStats {
  totalCount: number;
  unreadCount: number;
  byCategory: Record<NotificationCategory, number>;
  byPriority: Record<NotificationPriority, number>;
  byCommunity: Record<string, number>;
}
