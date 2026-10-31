import { notificationsRepository } from '../repositories/index.js';
import { UserAuthContext } from '../../shared/types/rbac.js';
import { isPlatformOwner, canAccessTenant } from '../security/rbac.js';
import { ForbiddenError, NotFoundError, BadRequestError } from '../utils/errors.js';
import { logger } from '../logging/logger.js';

export class NotificationReadStateService {
  /**
   * Marks an individual notification as read with tenant and ownership validation.
   */
  static async markAsRead(notificationId: string, authContext: UserAuthContext): Promise<boolean> {
    if (!notificationId) {
      throw new BadRequestError('notificationId is required');
    }

    const doc = await notificationsRepository.getById(notificationId);
    if (!doc) {
      throw new NotFoundError(`Notification ${notificationId} not found`);
    }

    // Tenant Isolation Check
    if (doc.communityId && !canAccessTenant(authContext, doc.communityId)) {
      throw new ForbiddenError('Cross-community notification access is forbidden');
    }

    // Ownership check (only recipient or authorized admin can mark as read)
    const isOwner = authContext.role === 'OWNER' || isPlatformOwner(authContext);
    const isRecipient = doc.recipientUserId === authContext.userId;

    if (!isRecipient && !isOwner) {
      throw new ForbiddenError('You can only modify your own notifications');
    }

    const now = new Date().toISOString();
    await notificationsRepository.update(notificationId, {
      read: true,
      status: 'READ',
      readAt: now,
      updatedAt: now,
    });

    return true;
  }

  /**
   * Marks an individual notification as unread.
   */
  static async markAsUnread(notificationId: string, authContext: UserAuthContext): Promise<boolean> {
    if (!notificationId) {
      throw new BadRequestError('notificationId is required');
    }

    const doc = await notificationsRepository.getById(notificationId);
    if (!doc) {
      throw new NotFoundError(`Notification ${notificationId} not found`);
    }

    if (doc.communityId && !canAccessTenant(authContext, doc.communityId)) {
      throw new ForbiddenError('Cross-community notification access is forbidden');
    }

    const isOwner = authContext.role === 'OWNER' || isPlatformOwner(authContext);
    const isRecipient = doc.recipientUserId === authContext.userId;

    if (!isRecipient && !isOwner) {
      throw new ForbiddenError('You can only modify your own notifications');
    }

    const now = new Date().toISOString();
    await notificationsRepository.update(notificationId, {
      read: false,
      status: 'UNREAD',
      readAt: undefined,
      updatedAt: now,
    });

    return true;
  }

  /**
   * Archives a notification.
   */
  static async archive(notificationId: string, authContext: UserAuthContext): Promise<boolean> {
    if (!notificationId) {
      throw new BadRequestError('notificationId is required');
    }

    const doc = await notificationsRepository.getById(notificationId);
    if (!doc) {
      throw new NotFoundError(`Notification ${notificationId} not found`);
    }

    if (doc.communityId && !canAccessTenant(authContext, doc.communityId)) {
      throw new ForbiddenError('Cross-community notification access is forbidden');
    }

    const isOwner = authContext.role === 'OWNER' || isPlatformOwner(authContext);
    const isRecipient = doc.recipientUserId === authContext.userId;

    if (!isRecipient && !isOwner) {
      throw new ForbiddenError('You can only modify your own notifications');
    }

    const now = new Date().toISOString();
    await notificationsRepository.update(notificationId, {
      status: 'ARCHIVED',
      archivedAt: now,
      updatedAt: now,
    });

    return true;
  }

  /**
   * Marks all unread notifications for a user as read within their tenant scope.
   */
  static async markAllAsRead(authContext: UserAuthContext, communityId?: string): Promise<{ count: number }> {
    const userId = authContext.userId;
    if (!userId) {
      throw new BadRequestError('User ID is required');
    }

    // Build query conditions
    const targetCommunity = communityId || (isPlatformOwner(authContext) ? undefined : authContext.communityId);

    const allUserNotifications = await notificationsRepository.list({
      where: [{ field: 'recipientUserId', operator: '==', value: userId }],
      limit: 500,
    });

    const unread = allUserNotifications.filter(n => {
      if (n.read) return false;
      if (targetCommunity && n.communityId && n.communityId !== targetCommunity) return false;
      return true;
    });

    const now = new Date().toISOString();
    await Promise.all(
      unread.map(n =>
        notificationsRepository.update(n.id, {
          read: true,
          status: 'READ',
          readAt: now,
          updatedAt: now,
        })
      )
    );

    return { count: unread.length };
  }

  /**
   * Retrieves accurate unread count for user, safely isolated by community.
   */
  static async getUnreadCount(userId: string, communityId?: string): Promise<number> {
    if (!userId) return 0;

    const notifications = await notificationsRepository.list({
      where: [{ field: 'recipientUserId', operator: '==', value: userId }],
      limit: 500,
    });

    return notifications.filter(n => {
      if (n.read) return false;
      if (n.status === 'ARCHIVED') return false;
      if (communityId && n.communityId && n.communityId !== communityId) return false;
      return true;
    }).length;
  }
}
