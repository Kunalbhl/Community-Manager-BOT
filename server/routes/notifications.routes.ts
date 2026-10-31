import { Router } from 'express';
import {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
  deleteNotification,
} from '../controllers/notifications.controller.js';

export const notificationsRouter = Router();

notificationsRouter.get('/unread-count', getUnreadNotificationCount);
notificationsRouter.get('/', listNotifications);
notificationsRouter.post('/mark-all-read', markAllNotificationsRead);
notificationsRouter.patch('/:id/read', markNotificationRead);
notificationsRouter.patch('/:id/unread', markNotificationUnread);
notificationsRouter.delete('/:id', deleteNotification);

export default notificationsRouter;
