import {
  NotificationChannel,
  NotificationType,
  NotificationDocument,
} from '../../shared/types/models.js';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationPolicy,
  NotificationRecipientType,
  NotificationDeliveryChannel,
  NotificationStatus,
  NotificationFilterParams,
  NotificationStats,
  UserNotificationPreference,
} from '../../shared/types/notifications.js';
import { UserRole, UserAuthContext } from '../../shared/types/rbac.js';
import { notificationsRepository, recruiterNotificationHistoryRepository } from '../repositories/index.js';
import { communityConfigurationService } from './communityConfiguration.service.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { logger } from '../logging/logger.js';
import { NotificationTemplateService } from './notificationTemplate.service.js';
import { NotificationPreferenceService } from './notificationPreference.service.js';
import { NotificationAudienceService, ResolvedRecipient } from './notificationAudience.service.js';
import { NotificationDeliveryService } from './notificationDelivery.service.js';
import { NotificationReadStateService } from './notificationReadState.service.js';
import { auditService } from './audit.service.js';
import { isPlatformOwner, canAccessTenant } from '../security/rbac.js';
import { ForbiddenError, NotFoundError, BadRequestError } from '../utils/errors.js';

export interface SendNotificationParams {
  communityId: string;
  recipientUserId: string;
  recipientDiscordId?: string;
  relatedReferralId?: string;
  type: NotificationType | string;
  channel: NotificationChannel | NotificationDeliveryChannel | string;
  title: string;
  body: string;
  templateVariables?: Record<string, string | undefined>;
  metadata?: Record<string, unknown>;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  policy?: NotificationPolicy;
  resourceType?: string;
  resourceId?: string;
  route?: string;
  idempotencyKey?: string;
  expiresAt?: string;
}

export interface CreateNotificationParams {
  communityId?: string;
  communityName?: string;
  recipientType?: NotificationRecipientType;
  recipientUserId?: string;
  recipientRole?: UserRole;
  recipientDiscordId?: string;
  category: NotificationCategory;
  type: string;
  priority?: NotificationPriority;
  policy?: NotificationPolicy;
  title: string;
  body: string;
  resourceType?: string;
  resourceId?: string;
  route?: string;
  channel?: NotificationDeliveryChannel | NotificationChannel | string;
  targetChannelId?: string;
  templateVariables?: Record<string, string | undefined>;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  expiresAt?: string;
}

export interface INotificationService {
  send(params: SendNotificationParams): Promise<NotificationDocument>;
  createAndDispatch(params: CreateNotificationParams): Promise<NotificationDocument[]>;
  sendDiscordDM(params: {
    communityId: string;
    recipientDiscordId: string;
    recipientUserId?: string;
    relatedReferralId?: string;
    title: string;
    body: string;
    type?: NotificationType | string;
  }): Promise<{ delivered: boolean; error?: string }>;
  listUserNotifications(userId: string, limit?: number): Promise<NotificationDocument[]>;
  queryNotifications(
    filter: NotificationFilterParams,
    authContext: UserAuthContext
  ): Promise<{ items: NotificationDocument[]; total: number; page: number; limit: number }>;
  getNotificationStats(
    authContext: UserAuthContext,
    communityId?: string
  ): Promise<NotificationStats>;
  markAsRead(notificationId: string, authContext?: UserAuthContext): Promise<boolean>;
  markAsUnread(notificationId: string, authContext: UserAuthContext): Promise<boolean>;
  markAllAsRead(authContext: UserAuthContext, communityId?: string): Promise<{ count: number }>;
  archive(notificationId: string, authContext: UserAuthContext): Promise<boolean>;
  getUnreadCount(userId: string, communityId?: string): Promise<number>;
  formatNotificationMessage(
    communityId: string,
    template: string,
    variables?: Record<string, string | undefined>
  ): Promise<string>;
}

export class NotificationService implements INotificationService {
  /**
   * Resolves notification text with tenant-scoped recruiter identity and variables.
   */
  async formatNotificationMessage(
    communityId: string,
    template: string,
    variables: Record<string, string | undefined> = {}
  ): Promise<string> {
    return NotificationTemplateService.format(communityId, template, variables);
  }

  /**
   * Dispatches a direct message via Discord API truthfully.
   */
  async sendDiscordDM(params: {
    communityId: string;
    recipientDiscordId: string;
    recipientUserId?: string;
    relatedReferralId?: string;
    title: string;
    body: string;
    type?: NotificationType | string;
  }): Promise<{ delivered: boolean; error?: string }> {
    logger.info(
      `[DISCORD_DM] Dispatching to ${params.recipientDiscordId} in community ${params.communityId}: "${params.title}"`
    );

    const formattedContent = `**${params.title}**\n\n${params.body}`;
    let result: { success: boolean; sentAt?: string; messageId?: string; channelId?: string; failureReason?: string };
    try {
      const dmResult = await discordService.sendDM(params.recipientDiscordId, formattedContent);
      result = {
        success: dmResult.success,
        sentAt: dmResult.sentAt,
        messageId: dmResult.messageId,
        channelId: dmResult.channelId,
        failureReason: dmResult.failureReason,
      };
    } catch (err: any) {
      const isNotConnected = err?.message?.includes('DISCORD_BOT_NOT_CONNECTED') || err?.message?.includes('BOT_NOT_CONNECTED');
      result = {
        success: false,
        failureReason: isNotConnected ? 'BOT_NOT_CONNECTED' : (err?.message || 'UNKNOWN_ERROR'),
      };
    }

    const now = new Date().toISOString();
    const deliveryStatus = result.success ? 'DELIVERED' : 'FAILED';

    await recruiterNotificationHistoryRepository.create({
      communityId: params.communityId,
      recipientUserId: params.recipientUserId || `usr_${params.recipientDiscordId}`,
      recipientDiscordId: params.recipientDiscordId,
      relatedReferralId: params.relatedReferralId,
      type: (params.type as NotificationType) || 'SYSTEM_NOTIFICATION',
      channel: 'DISCORD_DM',
      title: params.title,
      body: params.body,
      status: deliveryStatus,
      deliveredAt: result.success ? result.sentAt : undefined,
      failureReason: result.success ? undefined : result.failureReason,
      createdAt: now,
    });

    return {
      delivered: result.success,
      error: result.failureReason,
    };
  }

  /**
   * Unified authoritative notification dispatch engine.
   * Handles idempotency, audience fanout, preference eligibility, formatting, and delivery.
   */
  async createAndDispatch(params: CreateNotificationParams): Promise<NotificationDocument[]> {
    const {
      communityId,
      communityName,
      recipientType = 'USER',
      recipientUserId,
      recipientRole,
      recipientDiscordId,
      category,
      type,
      priority = 'INFO',
      policy = 'OPTIONAL',
      title,
      body,
      resourceType,
      resourceId,
      route,
      channel = 'IN_APP',
      targetChannelId,
      templateVariables = {},
      metadata = {},
      idempotencyKey,
      expiresAt,
    } = params;

    // 1. Idempotency Check
    if (idempotencyKey) {
      const existing = await notificationsRepository.list({
        where: [{ field: 'idempotencyKey', operator: '==', value: idempotencyKey }],
        limit: 1,
      });
      if (existing.length > 0) {
        logger.info(`[Notification] Idempotent notification already dispatched: ${idempotencyKey}`);
        return existing;
      }
    }

    // 2. Audience Resolution
    const recipients: ResolvedRecipient[] = await NotificationAudienceService.resolveAudience({
      communityId,
      recipientType,
      recipientUserId,
      recipientRole,
    });

    if (recipients.length === 0) {
      logger.warn(`[Notification] No audience resolved for notification type: ${type}`);
      return [];
    }

    // 3. Format Title & Body safely
    const resolvedTitle = await NotificationTemplateService.format(
      communityId,
      title,
      templateVariables
    );
    const resolvedBody = await NotificationTemplateService.format(
      communityId,
      body,
      templateVariables
    );

    const createdNotifications: NotificationDocument[] = [];
    const now = new Date().toISOString();

    for (const recipient of recipients) {
      // 4. Eligibility & Preference Check
      const eligibility = await NotificationPreferenceService.isEligible({
        communityId: recipient.communityId || communityId,
        recipientUserId: recipient.userId,
        recipientRole: recipient.role,
        category,
        priority,
        policy,
      });

      if (!eligibility.allowed) {
        logger.info(
          `[Notification] Recipient ${recipient.userId} filtered out from ${category} alert: ${eligibility.reason}`
        );
        continue;
      }

      // 5. Channel Mapping
      const normalizedChannel: NotificationDeliveryChannel =
        channel === 'DISCORD_DM' || channel === 'DISCORD_CHANNEL' || channel === 'DISCORD'
          ? 'DISCORD'
          : channel === 'EMAIL'
          ? 'EMAIL'
          : 'IN_APP';

      // 6. Delivery Dispatch
      const deliveryResult = await NotificationDeliveryService.dispatch({
        notificationId: `temp_${Date.now()}`,
        communityId: recipient.communityId || communityId,
        recipientUserId: recipient.userId,
        recipientDiscordId: recipient.discordId || recipientDiscordId,
        channel: normalizedChannel,
        title: resolvedTitle,
        body: resolvedBody,
        targetChannelId,
      });

      // 7. In-App Notification Persistence
      const doc = await notificationsRepository.create({
        communityId: recipient.communityId || communityId || 'global',
        communityName,
        recipientUserId: recipient.userId,
        recipientDiscordId: recipient.discordId || recipientDiscordId,
        recipientType,
        recipientRole: recipient.role,
        category,
        type,
        priority,
        policy,
        channel: normalizedChannel,
        deliveryStatus: deliveryResult.status,
        deliveryError: deliveryResult.error,
        title: resolvedTitle,
        body: resolvedBody,
        resourceType,
        resourceId,
        route,
        read: false,
        status: 'UNREAD',
        idempotencyKey,
        expiresAt,
        metadata: {
          ...metadata,
          templateVariables,
          deliveryResult,
        },
        createdAt: now,
      });

      createdNotifications.push(doc);

      // 8. Audit Log for security / critical alerts or delivery failures
      if (priority === 'CRITICAL' || category === 'SECURITY' || deliveryResult.status === 'FAILED') {
        await auditService.record({
          communityId: recipient.communityId || communityId || 'global',
          actorUserId: 'system_notification_engine',
          actorRole: 'PLATFORM_OWNER',
          action: deliveryResult.status === 'FAILED' ? 'NOTIFICATION_DELIVERY_FAILED' : 'NOTIFICATION_CREATED',
          targetType: 'notification',
          targetId: doc.id,
          metadata: {
            category,
            type,
            priority,
            recipientUserId: recipient.userId,
            deliveryStatus: deliveryResult.status,
            deliveryError: deliveryResult.error,
          },
        }).catch(() => {});
      }
    }

    return createdNotifications;
  }

  /**
   * Backward compatible send method for Tasks 1-90.
   */
  async send(params: SendNotificationParams): Promise<NotificationDocument> {
    const results = await this.createAndDispatch({
      communityId: params.communityId,
      recipientType: 'USER',
      recipientUserId: params.recipientUserId,
      recipientDiscordId: params.recipientDiscordId,
      category: params.category || 'RECRUITMENT',
      type: params.type,
      priority: params.priority || 'INFO',
      policy: params.policy || 'OPTIONAL',
      title: params.title,
      body: params.body,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      route: params.route,
      channel: params.channel,
      templateVariables: params.templateVariables,
      metadata: params.metadata,
      idempotencyKey: params.idempotencyKey,
      expiresAt: params.expiresAt,
    });

    if (results.length > 0) {
      return results[0];
    }

    // Fallback direct save if filtered
    return notificationsRepository.create({
      communityId: params.communityId,
      recipientUserId: params.recipientUserId,
      recipientDiscordId: params.recipientDiscordId,
      type: params.type,
      channel: params.channel,
      title: params.title,
      body: params.body,
      read: false,
      metadata: params.metadata,
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * Lists notifications for a specific user.
   */
  async listUserNotifications(userId: string, limit = 50): Promise<NotificationDocument[]> {
    return notificationsRepository.list({
      where: [{ field: 'recipientUserId', operator: '==', value: userId }],
      limit,
    });
  }

  /**
   * Queries and filters notifications with tenant isolation and server-side pagination.
   */
  async queryNotifications(
    filter: NotificationFilterParams,
    authContext: UserAuthContext
  ): Promise<{ items: NotificationDocument[]; total: number; page: number; limit: number }> {
    const page = filter.page && filter.page > 0 ? filter.page : 1;
    const limit = filter.limit && filter.limit > 0 ? Math.min(filter.limit, 100) : 20;

    // Fetch notifications for the user or platform owner
    let all: NotificationDocument[];
    if (isPlatformOwner(authContext)) {
      all = await notificationsRepository.list({ limit: 500 });
    } else {
      all = await notificationsRepository.list({
        where: [{ field: 'recipientUserId', operator: '==', value: authContext.userId }],
        limit: 500,
      });
    }

    // Enforce Tenant Scope (unless Platform Owner viewing all)
    const activeCommunity = filter.communityId || (!isPlatformOwner(authContext) ? authContext.communityId : undefined);
    if (activeCommunity) {
      all = all.filter(n => !n.communityId || n.communityId === activeCommunity || n.communityId === 'global');
    }

    // Filter by Category
    if (filter.category) {
      all = all.filter(n => (n.category || 'RECRUITMENT') === filter.category);
    }

    // Filter by Priority
    if (filter.priority) {
      all = all.filter(n => (n.priority || 'INFO') === filter.priority);
    }

    // Filter by Status
    if (filter.status) {
      all = all.filter(n => (n.status || (n.read ? 'READ' : 'UNREAD')) === filter.status);
    } else if (filter.unreadOnly) {
      all = all.filter(n => !n.read && n.status !== 'ARCHIVED');
    }

    // Search query filter (search title, body, communityName)
    if (filter.search && filter.search.trim()) {
      const q = filter.search.toLowerCase().trim();
      all = all.filter(n =>
        (n.title && n.title.toLowerCase().includes(q)) ||
        (n.body && n.body.toLowerCase().includes(q)) ||
        (n.communityName && n.communityName.toLowerCase().includes(q)) ||
        (n.category && n.category.toLowerCase().includes(q))
      );
    }

    // Sort descending by creation date
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = all.length;
    const startIndex = (page - 1) * limit;
    const items = all.slice(startIndex, startIndex + limit);

    return {
      items,
      total,
      page,
      limit,
    };
  }

  /**
   * Aggregates notification statistics for the user and tenant.
   */
  async getNotificationStats(
    authContext: UserAuthContext,
    communityId?: string
  ): Promise<NotificationStats> {
    const all = await notificationsRepository.list({
      where: [{ field: 'recipientUserId', operator: '==', value: authContext.userId }],
      limit: 500,
    });

    const activeCommunity = communityId || (!isPlatformOwner(authContext) ? authContext.communityId : undefined);
    const filtered = activeCommunity
      ? all.filter(n => !n.communityId || n.communityId === activeCommunity || n.communityId === 'global')
      : all;

    const stats: NotificationStats = {
      totalCount: filtered.length,
      unreadCount: filtered.filter(n => !n.read && n.status !== 'ARCHIVED').length,
      byCategory: {
        RECRUITMENT: 0,
        ENGAGEMENT: 0,
        MODERATION: 0,
        EVENTS: 0,
        AUTOMATION: 0,
        INTEGRATIONS: 0,
        SECURITY: 0,
        SYSTEM: 0,
        INSIGHTS: 0,
        PLATFORM: 0,
      },
      byPriority: {
        INFO: 0,
        SUCCESS: 0,
        WARNING: 0,
        CRITICAL: 0,
      },
      byCommunity: {},
    };

    for (const n of filtered) {
      const cat = (n.category || 'RECRUITMENT') as NotificationCategory;
      if (stats.byCategory[cat] !== undefined) {
        stats.byCategory[cat]++;
      }

      const prio = (n.priority || 'INFO') as NotificationPriority;
      if (stats.byPriority[prio] !== undefined) {
        stats.byPriority[prio]++;
      }

      const comm = n.communityId || 'global';
      stats.byCommunity[comm] = (stats.byCommunity[comm] || 0) + 1;
    }

    return stats;
  }

  /**
   * Retrieves single notification by ID with access control.
   */
  async getNotificationById(id: string, authContext: UserAuthContext): Promise<NotificationDocument> {
    const doc = await notificationsRepository.getById(id);
    if (!doc) {
      throw new NotFoundError(`Notification ${id} not found`);
    }

    if (doc.communityId && !canAccessTenant(authContext, doc.communityId)) {
      throw new ForbiddenError('Cross-community notification access is forbidden');
    }

    const isOwner = authContext.role === 'OWNER' || isPlatformOwner(authContext);
    if (doc.recipientUserId !== authContext.userId && !isOwner) {
      throw new ForbiddenError('You can only view your own notifications');
    }

    return doc;
  }

  /**
   * Deletes a notification.
   */
  async deleteNotification(id: string, authContext: UserAuthContext): Promise<boolean> {
    const doc = await this.getNotificationById(id, authContext);
    await notificationsRepository.delete(doc.id);
    return true;
  }

  /**
   * Read state management methods.
   */
  async markAsRead(notificationId: string, authContext?: UserAuthContext): Promise<boolean> {
    if (authContext) {
      return NotificationReadStateService.markAsRead(notificationId, authContext);
    }
    // Backward compatibility when called without authContext
    await notificationsRepository.update(notificationId, {
      read: true,
      status: 'READ',
      readAt: new Date().toISOString(),
    });
    return true;
  }

  async markAsUnread(notificationId: string, authContext: UserAuthContext): Promise<boolean> {
    return NotificationReadStateService.markAsUnread(notificationId, authContext);
  }

  async markAllAsRead(authContext: UserAuthContext, communityId?: string): Promise<{ count: number }> {
    return NotificationReadStateService.markAllAsRead(authContext, communityId);
  }

  async archive(notificationId: string, authContext: UserAuthContext): Promise<boolean> {
    return NotificationReadStateService.archive(notificationId, authContext);
  }

  async getUnreadCount(userId: string, communityId?: string): Promise<number> {
    return NotificationReadStateService.getUnreadCount(userId, communityId);
  }

  async getUserPreferences(userId: string, communityId?: string): Promise<UserNotificationPreference> {
    return NotificationPreferenceService.getUserPreferences(userId, communityId);
  }

  async updateUserPreferences(
    userId: string,
    communityId: string | undefined,
    role: UserRole,
    updates: Partial<UserNotificationPreference>
  ): Promise<UserNotificationPreference> {
    return NotificationPreferenceService.updateUserPreferences(userId, communityId, role, updates);
  }
}

export const notificationService = new NotificationService();
