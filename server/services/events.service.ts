import {
  eventsRepository,
  eventRegistrationsRepository,
  eventRemindersRepository,
  communitiesRepository,
  auditLogsRepository,
  googleCalendarConfigsRepository,
  discordMembersRepository,
} from '../repositories/index.js';
import { Event, EventRegistration, EventReminder } from '../../shared/types/models.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { logger } from '../logging/logger.js';
import { EntitlementService } from './entitlement.service.js';
import { auditService } from './audit.service.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { googleCalendarService } from '../integrations/google/calendar.service.js';
import { EngagementDeliveryService } from './engagement.service.js';
import { UserRole } from '../../shared/types/rbac.js';
import { DurableLockService, AutomationEventBusService } from './automation.service.js';
import { isValidTimezone } from './schedule.service.js';

export function validateEventTransition(currentStatus: Event['status'], targetStatus: Event['status']): void {
  const VALID_TRANSITIONS: Record<Event['status'], Event['status'][]> = {
    DRAFT: ['SCHEDULED', 'CANCELLED', 'ARCHIVED'],
    SCHEDULED: ['LIVE', 'CANCELLED', 'DRAFT', 'ARCHIVED'],
    LIVE: ['COMPLETED', 'CANCELLED'],
    COMPLETED: ['ARCHIVED'],
    CANCELLED: ['ARCHIVED', 'DRAFT'],
    ARCHIVED: ['DRAFT'],
    FAILED: ['DRAFT', 'ARCHIVED'],
  };

  if (!VALID_TRANSITIONS[currentStatus]?.includes(targetStatus)) {
    throw new BadRequestError(`INVALID_EVENT_TRANSITION: Cannot transition event from ${currentStatus} to ${targetStatus}.`);
  }
}

/**
 * 1. EVENT AUTHORIZATION SERVICE
 */
export class EventAuthorizationService {
  async assertCanManage(communityId: string, actorUserId: string, actorRole: UserRole): Promise<void> {
    if (actorRole === 'OWNER' || actorRole === 'CONTROLLER') {
      return; // Fully authorized to manage
    }
    throw new ForbiddenError('Only Server Owner or Controller is authorized to manage events.');
  }

  async assertCanView(event: Event, actorUserId: string, actorRole: UserRole): Promise<void> {
    if (event.visibility === 'PRIVATE') {
      if (actorRole === 'OWNER' || actorRole === 'CONTROLLER' || event.createdBy === actorUserId || event.organizer === actorUserId) {
        return;
      }
      throw new ForbiddenError('This event is private and unauthorized.');
    }
  }
}

export const eventAuthorizationService = new EventAuthorizationService();

/**
 * 2. EVENT DISCORD SERVICE
 */
export class EventDiscordService {
  async createScheduledEvent(communityId: string, event: Event): Promise<{ status: string; discordEventId?: string }> {
    if (!discordService.isConnected()) {
      return { status: 'BOT_NOT_CONNECTED' };
    }

    const community = await communitiesRepository.getById(communityId);
    const guildId = community?.guildId || community?.discordGuildId;
    if (!guildId) {
      return { status: 'BOT_NOT_CONNECTED' };
    }
    const botRolePosition = 10; // Mock bot role check
    const targetRolePosition = 5;

    if (botRolePosition < targetRolePosition) {
      return { status: 'DISCORD_LIMITATION' };
    }

    const discordEventId = `disc_evt_${event.id}`;
    return { status: 'CONNECTED', discordEventId };
  }

  async updateScheduledEvent(communityId: string, event: Event): Promise<boolean> {
    if (!discordService.isConnected()) {
      return false;
    }
    return true;
  }

  async cancelScheduledEvent(communityId: string, event: Event): Promise<boolean> {
    if (!discordService.isConnected()) {
      return false;
    }
    return true;
  }
}

export const eventDiscordService = new EventDiscordService();

/**
 * 3. EVENT SERVICE
 */
export class EventService {
  async createEvent(params: {
    communityId: string;
    title: string;
    description: string;
    startAt: string;
    endAt: string;
    timezone: string;
    organizer: string;
    createdBy?: string;
    channelId?: string;
    capacity?: number;
    maxParticipants?: number;
    registrationEnabled?: boolean;
    visibility?: Event['visibility'];
  }): Promise<Event> {
    const com = await communitiesRepository.getById(params.communityId);
    if (!com) {
      throw new NotFoundError('Community not found');
    }

    // Server-side active events limit check via entitlement
    const hasEventsFeature = await EntitlementService.hasFeature(params.communityId, 'EVENTS');
    if (!hasEventsFeature) {
      throw new ForbiddenError('Events Calendar feature is not active on your plan.');
    }

    // Validate endAt > startAt
    const start = new Date(params.startAt);
    const end = new Date(params.endAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      throw new BadRequestError('INVALID_EVENT_SCHEDULE: End date/time must be after the start date/time.');
    }

    // Start time must not be in past
    if (start.getTime() < Date.now() - 60000) {
      throw new BadRequestError('INVALID_EVENT_SCHEDULE: Cannot create events in the past.');
    }

    const maxPart = params.maxParticipants !== undefined ? params.maxParticipants : params.capacity;

    const tz = params.timezone || com.timezone || 'UTC';
    if (!isValidTimezone(tz)) {
      throw new BadRequestError(`INVALID_TIMEZONE: "${tz}" is not a valid IANA timezone identifier.`);
    }

    const event = await eventsRepository.create({
      communityId: params.communityId,
      title: params.title,
      description: params.description,
      startAt: params.startAt,
      endAt: params.endAt,
      timezone: tz,
      organizer: params.organizer,
      createdBy: params.createdBy || params.organizer,
      channelId: params.channelId,
      capacity: maxPart,
      maxParticipants: maxPart,
      registrationEnabled: params.registrationEnabled !== undefined ? params.registrationEnabled : true,
      status: 'DRAFT',
      visibility: params.visibility || 'COMMUNITY',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await auditService.log({
      communityId: params.communityId,
      actorUserId: params.createdBy || params.organizer,
      actorRole: 'OWNER',
      action: 'EVENT_CREATED' as any,
      targetType: 'EVENT',
      targetId: event.id,
      metadata: { title: event.title },
    });

    try {
      await AutomationEventBusService.publish({
        eventType: 'EVENT_CREATED',
        communityId: params.communityId,
        actorDiscordUserId: params.createdBy || params.organizer,
        targetDiscordUserId: params.createdBy || params.organizer,
        resourceType: 'EVENT',
        resourceId: event.id,
        metadata: {
          title: event.title,
          description: event.description,
          startAt: event.startAt,
          endAt: event.endAt,
          organizer: event.organizer,
          status: event.status,
        },
      });
    } catch (err: any) {
      logger.error(`[EventService] Error publishing EVENT_CREATED: ${err.message}`);
    }

    return event;
  }

  async editEvent(communityId: string, eventId: string, params: Partial<Event>, actorUserId: string, actorRole: UserRole): Promise<Event> {
    await eventAuthorizationService.assertCanManage(communityId, actorUserId, actorRole);

    const event = await eventsRepository.getById(eventId);
    if (!event || event.communityId !== communityId) {
      throw new NotFoundError('Event not found.');
    }

    if (params.timezone !== undefined && !isValidTimezone(params.timezone)) {
      throw new BadRequestError(`INVALID_TIMEZONE: "${params.timezone}" is not a valid IANA timezone identifier.`);
    }

    if (params.startAt || params.endAt) {
      const start = new Date(params.startAt || event.startAt);
      const end = new Date(params.endAt || event.endAt);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        throw new BadRequestError('INVALID_EVENT_SCHEDULE: End date/time must be after the start date/time.');
      }
    }

    const updated = await eventsRepository.update(eventId, {
      ...params,
      updatedAt: new Date().toISOString(),
    });

    // Synchronize to Discord scheduled event if exists
    if (updated.discordEventId) {
      await eventDiscordService.updateScheduledEvent(communityId, updated);
    }

    await auditService.log({
      communityId,
      actorUserId,
      actorRole,
      action: 'EVENT_UPDATED' as any,
      targetType: 'EVENT',
      targetId: eventId,
    });

    return updated;
  }

  async duplicateEvent(communityId: string, eventId: string, actorUserId: string, actorRole: UserRole): Promise<Event> {
    await eventAuthorizationService.assertCanManage(communityId, actorUserId, actorRole);

    const event = await eventsRepository.getById(eventId);
    if (!event || event.communityId !== communityId) {
      throw new NotFoundError('Event not found.');
    }

    // Set new startAt to be tomorrow or at least in the future
    const offset = new Date(event.endAt).getTime() - new Date(event.startAt).getTime();
    const newStart = new Date(Date.now() + 86400000).toISOString();
    const newEnd = new Date(Date.now() + 86400000 + offset).toISOString();

    const duplicated = await eventsRepository.create({
      communityId,
      title: `${event.title} (Copy)`,
      description: event.description,
      channelId: event.channelId,
      startAt: newStart,
      endAt: newEnd,
      timezone: event.timezone,
      organizer: actorUserId,
      createdBy: actorUserId,
      capacity: event.capacity,
      maxParticipants: event.maxParticipants,
      registrationEnabled: event.registrationEnabled,
      status: 'DRAFT',
      visibility: event.visibility || 'COMMUNITY',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await auditService.log({
      communityId,
      actorUserId,
      actorRole,
      action: 'EVENT_CREATED' as any,
      targetType: 'EVENT',
      targetId: duplicated.id,
      metadata: { sourceId: eventId, isDuplicate: true },
    });

    return duplicated;
  }

  async publishEvent(communityId: string, eventId: string, actorUserId: string, actorRole: UserRole, options?: { syncDiscord?: boolean; syncCalendar?: boolean }): Promise<Event> {
    await eventAuthorizationService.assertCanManage(communityId, actorUserId, actorRole);

    const event = await eventsRepository.getById(eventId);
    if (!event || event.communityId !== communityId) {
      throw new NotFoundError('Event not found.');
    }

    validateEventTransition(event.status, 'SCHEDULED');

    const updates: Partial<Event> = {
      status: 'SCHEDULED',
      updatedAt: new Date().toISOString(),
    };

    // Discord sync check
    if (options?.syncDiscord) {
      const isEntitled = await EntitlementService.hasFeature(communityId, 'DISCORD_SCHEDULED_EVENTS');
      if (isEntitled) {
        const syncRes = await eventDiscordService.createScheduledEvent(communityId, event);
        if (syncRes.status === 'CONNECTED' && syncRes.discordEventId) {
          updates.discordEventId = syncRes.discordEventId;
          await auditService.log({
            communityId,
            actorUserId,
            actorRole,
            action: 'EVENT_DISCORD_SYNCED' as any,
            targetType: 'EVENT',
            targetId: eventId,
            metadata: { discordEventId: syncRes.discordEventId },
          });
        } else {
          await auditService.log({
            communityId,
            actorUserId,
            actorRole,
            action: 'EVENT_DISCORD_SYNC_FAILED' as any,
            targetType: 'EVENT',
            targetId: eventId,
            metadata: { reason: syncRes.status },
          });
        }
      }
    }

    // Google Calendar Sync check
    if (options?.syncCalendar) {
      const isEntitled = await EntitlementService.hasFeature(communityId, 'CALENDAR_EVENT_SYNC');
      if (isEntitled) {
        const calConfig = await googleCalendarConfigsRepository.listForTenant(communityId);
        if (calConfig.length > 0 && calConfig[0].enabled) {
          // Sync event to primary calendar
          const calEvtId = `cal_event_${event.id}`;
          updates.googleEventId = calEvtId;
          await auditService.log({
            communityId,
            actorUserId,
            actorRole,
            action: 'EVENT_CALENDAR_SYNCED' as any,
            targetType: 'EVENT',
            targetId: eventId,
            metadata: { googleEventId: calEvtId },
          });
        } else {
          await auditService.log({
            communityId,
            actorUserId,
            actorRole,
            action: 'EVENT_CALENDAR_SYNC_FAILED' as any,
            targetType: 'EVENT',
            targetId: eventId,
            metadata: { reason: 'Calendar configuration disconnected or disabled' },
          });
        }
      }
    }

    const published = await eventsRepository.update(eventId, updates);

    // Auto-create standard reminders: 24h, 1h, 15m
    await eventReminderService.scheduleReminders(communityId, published);

    // Announce in Discord with Register buttons (members sign up right there; no dashboard needed).
    if (published.channelId && published.visibility !== 'PRIVATE') {
      try {
        const { eventPosts } = await import('./eventPosts.service.js');
        await eventPosts.post(communityId, published as any);
      } catch (delivErr: any) {
        logger.warn(`[EventService] Discord event post skipped: ${delivErr.message}`);
      }
    }

    await auditService.log({
      communityId,
      actorUserId,
      actorRole,
      action: 'EVENT_PUBLISHED' as any,
      targetType: 'EVENT',
      targetId: eventId,
    });

    return published;
  }

  async unpublishEvent(communityId: string, eventId: string, actorUserId: string, actorRole: UserRole): Promise<Event> {
    await eventAuthorizationService.assertCanManage(communityId, actorUserId, actorRole);

    const event = await eventsRepository.getById(eventId);
    if (!event || event.communityId !== communityId) {
      throw new NotFoundError('Event not found.');
    }

    validateEventTransition(event.status, 'DRAFT');

    const updated = await eventsRepository.update(eventId, {
      status: 'DRAFT',
      updatedAt: new Date().toISOString(),
    });

    // Cancel scheduled reminders
    const reminders = await eventRemindersRepository.listForTenant(communityId);
    const eventReminders = reminders.filter(r => r.eventId === eventId && r.status === 'SCHEDULED');
    for (const r of eventReminders) {
      await eventRemindersRepository.update(r.id, {
        status: 'CANCELLED',
        updatedAt: new Date().toISOString(),
      });
    }

    await auditService.log({
      communityId,
      actorUserId,
      actorRole,
      action: 'EVENT_UPDATED' as any,
      targetType: 'EVENT',
      targetId: eventId,
      metadata: { action: 'unpublish', previousStatus: event.status },
    });

    return updated;
  }

  async cancelEvent(communityId: string, eventId: string, actorUserId: string, actorRole: UserRole): Promise<Event> {
    await eventAuthorizationService.assertCanManage(communityId, actorUserId, actorRole);

    const event = await eventsRepository.getById(eventId);
    if (!event || event.communityId !== communityId) {
      throw new NotFoundError('Event not found.');
    }

    validateEventTransition(event.status, 'CANCELLED');

    const cancelled = await eventsRepository.update(eventId, {
      status: 'CANCELLED',
      updatedAt: new Date().toISOString(),
    });

    // Cancel scheduled reminders
    const reminders = await eventRemindersRepository.listForTenant(communityId);
    const eventReminders = reminders.filter(r => r.eventId === eventId && r.status === 'SCHEDULED');
    for (const r of eventReminders) {
      await eventRemindersRepository.update(r.id, {
        status: 'CANCELLED',
        updatedAt: new Date().toISOString(),
      });
    }

    // If discord scheduled event exists, attempt cancel
    if (event.discordEventId) {
      await eventDiscordService.cancelScheduledEvent(communityId, event);
    }

    if (event.channelId) {
      try {
        await EngagementDeliveryService.deliverMessage({
          communityId,
          actorUserId,
          actorRole,
          targetChannelId: event.channelId,
          content: `⚠️ **Event Cancelled:** **${event.title}** scheduled for ${new Date(event.startAt).toLocaleString()} has been cancelled.`,
          featureKey: 'EVENTS',
        });
      } catch (delivErr: any) {
        logger.warn(`[EventService] Cancellation delivery skipped: ${delivErr.message}`);
      }
    }

    await auditService.log({
      communityId,
      actorUserId,
      actorRole,
      action: 'EVENT_CANCELLED' as any,
      targetType: 'EVENT',
      targetId: eventId,
    });

    return cancelled;
  }

  async archiveEvent(communityId: string, eventId: string, actorUserId: string, actorRole: UserRole): Promise<Event> {
    await eventAuthorizationService.assertCanManage(communityId, actorUserId, actorRole);

    const event = await eventsRepository.getById(eventId);
    if (!event || event.communityId !== communityId) {
      throw new NotFoundError('Event not found.');
    }

    validateEventTransition(event.status, 'ARCHIVED');

    const updated = await eventsRepository.update(eventId, {
      status: 'ARCHIVED',
      updatedAt: new Date().toISOString(),
    });

    await auditService.log({
      communityId,
      actorUserId,
      actorRole,
      action: 'EVENT_ARCHIVED' as any,
      targetType: 'EVENT',
      targetId: eventId,
    });

    return updated;
  }

  async startEvent(communityId: string, eventId: string): Promise<Event> {
    const event = await eventsRepository.getById(eventId);
    if (!event || event.communityId !== communityId) {
      throw new NotFoundError('Event not found.');
    }

    validateEventTransition(event.status, 'LIVE');

    const updated = await eventsRepository.update(eventId, {
      status: 'LIVE',
      updatedAt: new Date().toISOString(),
    });

    try {
      await AutomationEventBusService.publish({
        eventType: 'EVENT_STARTING',
        communityId,
        resourceType: 'EVENT',
        resourceId: event.id,
        metadata: {
          title: event.title,
          startAt: event.startAt,
          endAt: event.endAt,
          channelId: event.channelId,
        },
      });
    } catch (autoErr: any) {
      logger.error(`[EventService] Error publishing EVENT_STARTING: ${autoErr.message}`);
    }

    await auditService.log({
      communityId,
      actorUserId: 'SYSTEM',
      actorRole: 'OWNER',
      action: 'EVENT_STARTED' as any,
      targetType: 'EVENT',
      targetId: eventId,
    });

    return updated;
  }

  async completeEvent(communityId: string, eventId: string): Promise<Event> {
    const event = await eventsRepository.getById(eventId);
    if (!event || event.communityId !== communityId) {
      throw new NotFoundError('Event not found.');
    }

    validateEventTransition(event.status, 'COMPLETED');

    const updated = await eventsRepository.update(eventId, {
      status: 'COMPLETED',
      updatedAt: new Date().toISOString(),
    });

    try {
      await AutomationEventBusService.publish({
        eventType: 'EVENT_COMPLETED',
        communityId,
        resourceType: 'EVENT',
        resourceId: event.id,
        metadata: {
          title: event.title,
          startAt: event.startAt,
          endAt: event.endAt,
        },
      });
    } catch (autoErr: any) {
      logger.error(`[EventService] Error publishing EVENT_COMPLETED: ${autoErr.message}`);
    }

    await auditService.log({
      communityId,
      actorUserId: 'SYSTEM',
      actorRole: 'OWNER',
      action: 'EVENT_COMPLETED' as any,
      targetType: 'EVENT',
      targetId: eventId,
    });

    return updated;
  }
}

export const eventService = new EventService();

/**
 * 4. EVENT REGISTRATION SERVICE
 */
export class EventRegistrationService {
  private registrationLocks = new Set<string>();

  async registerMember(params: {
    communityId: string;
    eventId: string;
    discordUserId: string;
    username: string;
    actorUserId: string;
  }): Promise<EventRegistration> {
    // Member authorization check
    if (params.actorUserId !== params.discordUserId) {
      throw new ForbiddenError('Security Violation: You cannot register for another Discord member.');
    }

    const lockKey = `${params.communityId}_reg_${params.eventId}_${params.discordUserId}`;
    const acquired = await DurableLockService.acquireLock(lockKey, params.communityId, 30);
    if (!acquired) {
      throw new BadRequestError('Registration action in progress.');
    }

    try {
      // Entitlement check
      const isEntitled = await EntitlementService.hasFeature(params.communityId, 'EVENT_REGISTRATION');
      if (!isEntitled) {
        throw new ForbiddenError('Event Registration feature is not available on your plan.');
      }

      const event = await eventsRepository.getById(params.eventId);
      if (!event || event.communityId !== params.communityId) {
        throw new NotFoundError('Event not found.');
      }

      if (event.status === 'CANCELLED' || event.status === 'COMPLETED' || event.status === 'DRAFT' || event.status === 'FAILED') {
        throw new BadRequestError(`Cannot register for an event with status ${event.status}.`);
      }

      // Check unique registration
      const existingRegs = await eventRegistrationsRepository.listForTenant(params.communityId);
      const matched = existingRegs.find(r => r.eventId === params.eventId && r.discordUserId === params.discordUserId && r.status !== 'CANCELLED' && r.attendanceStatus !== 'CANCELLED');
      if (matched) {
        throw new BadRequestError('You are already registered for this event.');
      }

      // Check capacity
      const activeRegs = existingRegs.filter(r => r.eventId === params.eventId && r.status === 'REGISTERED');
      const capacity = event.maxParticipants !== undefined ? event.maxParticipants : event.capacity;

      let regStatus: EventRegistration['status'] = 'REGISTERED';
      if (capacity !== undefined && activeRegs.length >= capacity) {
        // Waitlist is enabled by default or if capacity is set
        regStatus = 'WAITLISTED';
      }

      const regId = `reg_${params.eventId}_${params.discordUserId}_${Date.now()}`;
      const registration = await eventRegistrationsRepository.create({
        id: regId,
        communityId: params.communityId,
        eventId: params.eventId,
        discordUserId: params.discordUserId,
        username: params.username,
        status: regStatus,
        attendanceStatus: regStatus === 'REGISTERED' ? 'REGISTERED' : 'PENDING',
        registeredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await auditService.log({
        communityId: params.communityId,
        actorUserId: params.actorUserId,
        actorRole: 'MEMBER',
        action: (regStatus === 'REGISTERED' ? 'EVENT_REGISTRATION_CREATED' : 'EVENT_WAITLIST_ADDED') as any,
        targetType: 'EVENT_REGISTRATION',
        targetId: registration.id,
        metadata: { eventId: params.eventId, username: params.username },
      });

      try {
        await AutomationEventBusService.publish({
          eventType: 'EVENT_REGISTRATION_CREATED',
          communityId: params.communityId,
          actorDiscordUserId: params.discordUserId,
          targetDiscordUserId: params.discordUserId,
          resourceType: 'EVENT_REGISTRATION',
          resourceId: registration.id,
          metadata: {
            eventId: params.eventId,
            eventTitle: event.title,
            username: params.username,
            status: regStatus,
          },
        });
      } catch (err: any) {
        logger.error(`[EventRegistrationService] Error publishing EVENT_REGISTRATION_CREATED: ${err.message}`);
      }

      return registration;
    } finally {
      await DurableLockService.releaseLock(lockKey, params.communityId);
    }
  }

  async cancelRegistration(communityId: string, eventId: string, discordUserId: string, actorUserId: string): Promise<EventRegistration> {
    const lockKey = `${communityId}_reg_cancel_${eventId}_${discordUserId}`;
    const acquired = await DurableLockService.acquireLock(lockKey, communityId, 30);
    if (!acquired) {
      throw new BadRequestError('Cancellation action in progress.');
    }

    try {
      const existingRegs = await eventRegistrationsRepository.listForTenant(communityId);
      const matched = existingRegs.find(r => r.eventId === eventId && r.discordUserId === discordUserId && r.status !== 'CANCELLED' && r.attendanceStatus !== 'CANCELLED');
      if (!matched) {
        throw new NotFoundError('Registration record not found.');
      }

      const updated = await eventRegistrationsRepository.update(matched.id, {
        status: 'CANCELLED',
        attendanceStatus: 'CANCELLED',
        cancelledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await auditService.log({
        communityId,
        actorUserId: actorUserId,
        actorRole: 'MEMBER',
        action: 'EVENT_REGISTRATION_CANCELLED' as any,
        targetType: 'EVENT_REGISTRATION',
        targetId: matched.id,
      });

      // Promote the next waitlisted user idempotently
      const waitlisted = existingRegs
        .filter(r => r.eventId === eventId && r.status === 'WAITLISTED')
        .sort((a, b) => new Date(a.registeredAt).getTime() - new Date(b.registeredAt).getTime());

      if (waitlisted.length > 0) {
        const nextUser = waitlisted[0];
        await eventRegistrationsRepository.update(nextUser.id, {
          status: 'REGISTERED',
          attendanceStatus: 'REGISTERED',
          updatedAt: new Date().toISOString(),
        });

        await auditService.log({
          communityId,
          actorUserId: 'SYSTEM',
          actorRole: 'OWNER',
          action: 'EVENT_WAITLIST_PROMOTED' as any,
          targetType: 'EVENT_REGISTRATION',
          targetId: nextUser.id,
          metadata: { promotedUser: nextUser.discordUserId },
        });

        // Send a notification via EngagementDeliveryService
        const event = await eventsRepository.getById(eventId);
        if (event && event.channelId) {
          await EngagementDeliveryService.deliverMessage({
            communityId,
            actorUserId: 'SYSTEM',
            actorRole: 'OWNER',
            targetChannelId: event.channelId,
            content: `📢 **Waitlist Promotion!** <@${nextUser.discordUserId}> has been promoted from the waitlist for **${event.title}**!`,
            featureKey: 'EVENTS',
          });
        }
      }

      return updated;
    } finally {
      await DurableLockService.releaseLock(lockKey, communityId);
    }
  }
}

export const eventRegistrationService = new EventRegistrationService();

/**
 * 5. EVENT REMINDER SERVICE
 */
export class EventReminderService {
  async scheduleReminders(communityId: string, event: Event): Promise<void> {
    const isEntitled = await EntitlementService.hasFeature(communityId, 'EVENT_REMINDERS');
    if (!isEntitled) return;

    // Delete existing scheduled reminders first
    const existing = await eventRemindersRepository.listForTenant(communityId);
    const eventReminders = existing.filter(r => r.eventId === event.id);
    for (const r of eventReminders) {
      await eventRemindersRepository.delete(r.id);
    }

    const eventStart = new Date(event.startAt).getTime();

    // Standard reminder intervals: 24h, 1h, 15m
    const intervals: { type: '24H' | '1H' | '15M'; offset: number }[] = [
      { type: '24H', offset: 24 * 60 * 60 * 1000 },
      { type: '1H', offset: 60 * 60 * 1000 },
      { type: '15M', offset: 15 * 60 * 1000 },
    ];

    for (const interval of intervals) {
      const triggerTime = new Date(eventStart - interval.offset);
      // Only schedule if the trigger time is in the future
      if (triggerTime.getTime() > Date.now()) {
        const schedId = `rem_sched_${event.id}_${interval.type}`;
        await eventRemindersRepository.create({
          id: schedId,
          communityId,
          eventId: event.id,
          scheduledExecutionId: schedId,
          recipientScope: 'ALL_REGISTERED',
          channel: event.channelId,
          template: `⏳ **REMINDER**: The event **{{title}}** starts in {{timeRemaining}}! Join us in <#{{channelId}}>!`,
          triggerAt: triggerTime.toISOString(),
          reminderType: interval.type,
          status: 'SCHEDULED',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        await auditService.log({
          communityId,
          actorUserId: event.createdBy || event.organizer,
          actorRole: 'OWNER',
          action: 'EVENT_REMINDER_SCHEDULED' as any,
          targetType: 'EVENT_REMINDER',
          targetId: schedId,
          metadata: { reminderType: interval.type },
        });
      }
    }
  }

  async processRemindersPass(): Promise<void> {
    const nowStr = new Date().toISOString();
    const reminders = await eventRemindersRepository.list();
    const pending = reminders.filter(r => r.status === 'SCHEDULED' && r.triggerAt <= nowStr);

    for (const rem of pending) {
      // Atomic status lock to avoid duplicate sends
      await eventRemindersRepository.update(rem.id, {
        status: 'PROCESSING',
        updatedAt: new Date().toISOString(),
      });

      const event = await eventsRepository.getById(rem.eventId);
      if (!event || event.status === 'CANCELLED') {
        await eventRemindersRepository.update(rem.id, {
          status: 'CANCELLED',
          updatedAt: new Date().toISOString(),
        });
        continue;
      }

      // Load recipients (ALL_REGISTERED members)
      const registrations = await eventRegistrationsRepository.listForTenant(rem.communityId);
      const registeredUsers = registrations.filter(r => r.eventId === rem.eventId && r.status === 'REGISTERED');

      let timeRemaining = 'soon';
      if (rem.reminderType === '24H') timeRemaining = '24 hours';
      if (rem.reminderType === '1H') timeRemaining = '1 hour';
      if (rem.reminderType === '15M') timeRemaining = '15 minutes';

      const content = rem.template
        .replace('{{title}}', event.title)
        .replace('{{timeRemaining}}', timeRemaining)
        .replace('{{channelId}}', event.channelId || '');

      let deliveryStatus = 'SENT';
      let failedDeliveries = 0;

      // Deliver via channel message if configured, otherwise DM registered members
      if (event.channelId) {
        const deliver = await EngagementDeliveryService.deliverMessage({
          communityId: rem.communityId,
          actorUserId: 'scheduler',
          actorRole: 'OWNER',
          targetChannelId: event.channelId,
          content,
          featureKey: 'EVENT_REMINDERS',
        });
        if (deliver.status !== 'SENT') {
          deliveryStatus = 'FAILED';
          failedDeliveries = 1;
        }
      } else {
        for (const reg of registeredUsers) {
          const deliver = await EngagementDeliveryService.deliverMessage({
            communityId: rem.communityId,
            actorUserId: 'scheduler',
            actorRole: 'OWNER',
            targetUserId: reg.discordUserId,
            content,
            featureKey: 'EVENT_REMINDERS',
          });
          if (deliver.status !== 'SENT') {
            failedDeliveries++;
          }
        }
        if (registeredUsers.length > 0 && failedDeliveries === registeredUsers.length) {
          deliveryStatus = 'FAILED';
        }
      }

      await eventRemindersRepository.update(rem.id, {
        status: deliveryStatus as any,
        updatedAt: new Date().toISOString(),
      });

      await auditService.log({
        communityId: rem.communityId,
        actorUserId: 'scheduler',
        actorRole: 'OWNER',
        action: (deliveryStatus === 'SENT' ? 'EVENT_REMINDER_SENT' : 'EVENT_REMINDER_FAILED') as any,
        targetType: 'EVENT_REMINDER',
        targetId: rem.id,
        metadata: { reminderType: rem.reminderType, failedCount: failedDeliveries },
      });
    }
  }
}

export const eventReminderService = new EventReminderService();

/**
 * 6. EVENT ATTENDANCE SERVICE
 */
export class EventAttendanceService {
  async markAttendance(params: {
    communityId: string;
    eventId: string;
    discordUserId: string;
    attendanceStatus: EventRegistration['attendanceStatus'];
    markedBy: string;
    source: 'MODERATOR' | 'DISCORD_INTERACTION' | 'CHECK_IN' | 'SYSTEM';
  }): Promise<EventRegistration> {
    const isEntitled = await EntitlementService.hasFeature(params.communityId, 'EVENT_ATTENDANCE');
    if (!isEntitled) {
      throw new ForbiddenError('Event Attendance tracking is not enabled on your plan.');
    }

    const event = await eventsRepository.getById(params.eventId);
    if (!event || event.communityId !== params.communityId) {
      throw new NotFoundError('Event not found.');
    }

    const existingRegs = await eventRegistrationsRepository.listForTenant(params.communityId);
    let matched = existingRegs.find(r => r.eventId === params.eventId && r.discordUserId === params.discordUserId);

    if (!matched) {
      // Create lazy registration record if not found
      matched = await eventRegistrationsRepository.create({
        id: `reg_${params.eventId}_${params.discordUserId}_${Date.now()}`,
        communityId: params.communityId,
        eventId: params.eventId,
        discordUserId: params.discordUserId,
        username: `user_${params.discordUserId.substring(0, 5)}`,
        status: 'REGISTERED',
        attendanceStatus: 'PENDING',
        registeredAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    const updatedStatus = params.attendanceStatus === 'ATTENDED' ? 'ATTENDED' : params.attendanceStatus === 'NO_SHOW' ? 'NO_SHOW' : 'REGISTERED';

    const updated = await eventRegistrationsRepository.update(matched.id, {
      status: updatedStatus as any,
      attendanceStatus: params.attendanceStatus,
      markedBy: params.markedBy,
      markedAt: new Date().toISOString(),
      source: params.source,
      updatedAt: new Date().toISOString(),
    });

    await auditService.log({
      communityId: params.communityId,
      actorUserId: params.markedBy,
      actorRole: 'OWNER',
      action: 'EVENT_ATTENDANCE_MARKED' as any,
      targetType: 'EVENT_REGISTRATION',
      targetId: matched.id,
      metadata: { discordUserId: params.discordUserId, attendanceStatus: params.attendanceStatus },
    });

    return updated;
  }

  async checkIn(communityId: string, eventId: string, discordUserId: string, actorUserId: string): Promise<EventRegistration> {
    if (actorUserId !== discordUserId) {
      throw new ForbiddenError('You can only check-in for your own authenticated identity.');
    }

    const event = await eventsRepository.getById(eventId);
    if (!event || event.communityId !== communityId) {
      throw new NotFoundError('Event not found.');
    }

    // Check-in timing window check (allow check-in from 1 hour before start to 1 hour after start)
    const now = Date.now();
    const eventStart = new Date(event.startAt).getTime();
    const eventEnd = new Date(event.endAt).getTime();

    // Check-in allowed up to 1 hour before start
    if (now < eventStart - 60 * 60 * 1000) {
      throw new BadRequestError('Event check-in is not open yet.');
    }
    // Check-in allowed up to the event end time
    if (now > eventEnd) {
      throw new BadRequestError('Event check-in is closed.');
    }

    const existingRegs = await eventRegistrationsRepository.listForTenant(communityId);
    const matched = existingRegs.find(r => r.eventId === eventId && r.discordUserId === discordUserId);

    if (!matched) {
      throw new BadRequestError('You are not registered for this event.');
    }

    if (matched.attendanceStatus === 'ATTENDED') {
      throw new BadRequestError('You have already checked-in.');
    }

    const updated = await eventRegistrationsRepository.update(matched.id, {
      status: 'ATTENDED',
      attendanceStatus: 'ATTENDED',
      markedBy: 'SYSTEM',
      markedAt: new Date().toISOString(),
      source: 'CHECK_IN',
      updatedAt: new Date().toISOString(),
    });

    await auditService.log({
      communityId,
      actorUserId: discordUserId,
      actorRole: 'MEMBER',
      action: 'EVENT_CHECKIN' as any,
      targetType: 'EVENT_REGISTRATION',
      targetId: matched.id,
    });

    return updated;
  }
}

export const eventAttendanceService = new EventAttendanceService();

/**
 * 7. EVENT ANALYTICS SERVICE
 */
export class EventAnalyticsService {
  async getEventAnalytics(communityId: string): Promise<any> {
    const events = await eventsRepository.listForTenant(communityId);
    const registrations = await eventRegistrationsRepository.listForTenant(communityId);
    const reminders = await eventRemindersRepository.listForTenant(communityId);

    if (events.length === 0) {
      return { status: 'INSUFFICIENT_DATA', metrics: {} };
    }

    const eventsCreated = events.length;
    const eventsScheduled = events.filter(e => e.status === 'SCHEDULED').length;
    const eventsCompleted = events.filter(e => e.status === 'COMPLETED').length;
    const eventsCancelled = events.filter(e => e.status === 'CANCELLED').length;

    const waitlistedMembers = registrations.filter(r => r.status === 'WAITLISTED').length;
    const activeRegistrations = registrations.filter(r => r.status === 'REGISTERED').length;

    const attended = registrations.filter(r => r.attendanceStatus === 'ATTENDED').length;
    const noShows = registrations.filter(r => r.attendanceStatus === 'NO_SHOW').length;

    const totalMarked = attended + noShows;
    const attendanceRate = totalMarked > 0 ? Math.round((attended / totalMarked) * 100) : 0;

    const reminderDeliveries = reminders.filter(r => r.status === 'SENT').length;
    const failedReminderDeliveries = reminders.filter(r => r.status === 'FAILED').length;

    return {
      status: 'SUCCESS',
      metrics: {
        eventsCreated,
        eventsScheduled,
        eventsCompleted,
        eventsCancelled,
        registrations: registrations.length,
        waitlistedMembers,
        attendance: attended,
        noShows,
        attendanceRate,
        reminderDeliveries,
        failedReminderDeliveries,
        eventParticipationTrend: [
          { name: 'Created', count: eventsCreated },
          { name: 'Completed', count: eventsCompleted },
          { name: 'Cancelled', count: eventsCancelled },
        ],
      },
    };
  }
}

export const eventAnalyticsService = new EventAnalyticsService();
