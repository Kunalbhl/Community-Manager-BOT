import { Request, Response, NextFunction } from 'express';
import { notificationService } from '../services/notification.service.js';
import {
  NotificationCategory,
  NotificationPriority,
  NotificationStatus,
  NotificationRecipientType,
} from '../../shared/types/notifications.js';
import { ForbiddenError, NotFoundError, BadRequestError } from '../utils/errors.js';
import { isPlatformOwner } from '../security/rbac.js';

/**
 * Lists notifications with pagination, tenant filtering, and keyword search.
 */
export async function listNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = (req.query.communityId as string) || (isPlatformOwner(user) ? undefined : user.communityId);
    const category = req.query.category as NotificationCategory | undefined;
    const priority = req.query.priority as NotificationPriority | undefined;
    const status = req.query.status as NotificationStatus | undefined;
    const unreadOnly = req.query.unreadOnly === 'true' || req.query.unread === 'true';
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
    const search = (req.query.search as string) || (req.query.q as string);

    const result = await notificationService.queryNotifications(
      {
        communityId,
        category,
        priority,
        status,
        unreadOnly,
        page,
        limit,
        search,
      },
      user
    );

    const unreadCount = await notificationService.getUnreadCount(user.userId, communityId);

    res.json({
      success: true,
      data: result.items,
      items: result.items, // alias for convenience
      total: result.total,
      page: result.page,
      limit: result.limit,
      unreadCount,
      count: result.items.length,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieves aggregate notification metrics (unread count, category breakdown, priority breakdown).
 */
export async function getNotificationStats(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = (req.query.communityId as string) || (isPlatformOwner(user) ? undefined : user.communityId);
    const stats = await notificationService.getNotificationStats(user, communityId);

    res.json({
      success: true,
      data: stats,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieves the rapid unread count for badge counters.
 */
export async function getUnreadNotificationCount(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) {
      return res.json({
        success: true,
        data: { unreadCount: 0 },
        unreadCount: 0,
        requestId: req.id,
      });
    }

    const communityId = (req.query.communityId as string) || (isPlatformOwner(user) ? undefined : user.communityId);
    const unreadCount = await notificationService.getUnreadCount(user.userId, communityId);

    res.json({
      success: true,
      data: { unreadCount },
      unreadCount,
      requestId: req.id,
    });
  } catch (error) {
    res.json({
      success: true,
      data: { unreadCount: 0 },
      unreadCount: 0,
      requestId: req.id,
    });
  }
}

/**
 * Retrieves notification preferences for the authenticated user.
 */
export async function getNotificationPreferences(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = (req.query.communityId as string) || user.communityId;
    const preferences = await notificationService.getUserPreferences(user.userId, communityId);

    res.json({
      success: true,
      data: preferences,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Updates notification preferences for the authenticated user.
 */
export async function updateNotificationPreferences(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.body.communityId || (req.query.communityId as string) || user.communityId;
    const updates = req.body;

    const updated = await notificationService.updateUserPreferences(
      user.userId,
      communityId,
      user.role,
      updates
    );

    res.json({
      success: true,
      data: updated,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Marks a notification as read.
 */
export async function markNotificationRead(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id } = req.params;
    await notificationService.markAsRead(id, user);

    res.json({
      success: true,
      data: { id, read: true, status: 'READ' },
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Marks a notification as unread.
 */
export async function markNotificationUnread(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id } = req.params;
    await notificationService.markAsUnread(id, user);

    res.json({
      success: true,
      data: { id, read: false, status: 'UNREAD' },
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Archives a notification.
 */
export async function archiveNotification(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id } = req.params;
    await notificationService.archive(id, user);

    res.json({
      success: true,
      data: { id, status: 'ARCHIVED' },
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Marks all notifications as read for the user in the active tenant.
 */
export async function markAllNotificationsRead(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.body?.communityId || (req.query.communityId as string) || (isPlatformOwner(user) ? undefined : user.communityId);
    const result = await notificationService.markAllAsRead(user, communityId);

    res.json({
      success: true,
      data: result,
      updatedCount: result.count,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Dispatches a new notification (for system triggers, automations, or authorized administrators).
 */
export async function dispatchNotification(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const payload = req.body;
    if (!payload.title || !payload.body || !payload.category) {
      throw new BadRequestError('title, body, and category are required');
    }

    const created = await notificationService.createAndDispatch({
      communityId: payload.communityId || user.communityId,
      communityName: payload.communityName,
      recipientType: (payload.recipientType as NotificationRecipientType) || 'USER',
      recipientUserId: payload.recipientUserId || user.userId,
      recipientRole: payload.recipientRole,
      recipientDiscordId: payload.recipientDiscordId,
      category: payload.category,
      type: payload.type || 'SYSTEM_NOTIFICATION',
      priority: payload.priority || 'INFO',
      policy: payload.policy || 'OPTIONAL',
      title: payload.title,
      body: payload.body,
      resourceType: payload.resourceType,
      resourceId: payload.resourceId,
      route: payload.route,
      channel: payload.channel || 'IN_APP',
      targetChannelId: payload.targetChannelId,
      templateVariables: payload.templateVariables,
      metadata: payload.metadata,
      idempotencyKey: payload.idempotencyKey,
      expiresAt: payload.expiresAt,
    });

    res.status(201).json({
      success: true,
      data: created,
      count: created.length,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Deletes a notification by ID.
 */
export async function deleteNotification(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id } = req.params;
    await notificationService.deleteNotification(id, user);

    res.json({
      success: true,
      data: { id, deleted: true },
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}
