import { Request, Response, NextFunction } from 'express';
import {
  eventService,
  eventAuthorizationService,
  eventRegistrationService,
  eventReminderService,
  eventAttendanceService,
  eventAnalyticsService,
} from '../services/events.service.js';
import { scheduleService } from '../services/schedule.service.js';
import { eventsRepository, eventRegistrationsRepository } from '../repositories/index.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { logger } from '../logging/logger.js';

function getCommunityId(req: Request): string {
  const communityId = req.header('x-community-id') || req.user?.communityId;
  if (!communityId) {
    throw new BadRequestError('Community tenant context is missing.');
  }
  return communityId;
}

function getActorInfo(req: Request) {
  if (!req.user) {
    throw new ForbiddenError('Authentication required');
  }
  return {
    userId: req.user.userId || 'anonymous',
    role: req.user.role || 'MEMBER',
    username: req.user.discordUserId || req.user.userId || 'unknown_member',
  };
}

/**
 * 1. EVENT CREATION AND ACTIONS
 */
export async function createEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);

    // Only managers (Owner, Controller) can create events by default
    await eventAuthorizationService.assertCanManage(communityId, actor.userId, actor.role);

    const { title, description, startAt, endAt, timezone, channelId, maxParticipants, capacity, registrationEnabled, visibility } = req.body;
    if (!title || !description || !startAt || !endAt) {
      throw new BadRequestError('title, description, startAt, and endAt are required.');
    }

    const event = await eventService.createEvent({
      communityId,
      title,
      description,
      startAt,
      endAt,
      timezone,
      organizer: actor.userId,
      createdBy: actor.userId,
      channelId,
      maxParticipants: maxParticipants !== undefined ? maxParticipants : capacity,
      registrationEnabled,
      visibility,
    });

    res.status(201).json({ success: true, event });
  } catch (error) {
    next(error);
  }
}

export async function editEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);
    const { eventId } = req.params;

    if (!eventId) {
      throw new BadRequestError('eventId is required.');
    }

    const updated = await eventService.editEvent(communityId, eventId, req.body, actor.userId, actor.role);
    res.json({ success: true, event: updated });
  } catch (error) {
    next(error);
  }
}

export async function duplicateEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);
    const { eventId } = req.params;

    if (!eventId) {
      throw new BadRequestError('eventId is required.');
    }

    const duplicated = await eventService.duplicateEvent(communityId, eventId, actor.userId, actor.role);
    res.status(201).json({ success: true, event: duplicated });
  } catch (error) {
    next(error);
  }
}

export async function publishEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);
    const { eventId } = req.params;
    const { syncDiscord, syncCalendar } = req.body;

    if (!eventId) {
      throw new BadRequestError('eventId is required.');
    }

    const published = await eventService.publishEvent(communityId, eventId, actor.userId, actor.role, {
      syncDiscord: !!syncDiscord,
      syncCalendar: !!syncCalendar,
    });

    res.json({ success: true, event: published });
  } catch (error) {
    next(error);
  }
}

export async function cancelEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);
    const { eventId } = req.params;

    if (!eventId) {
      throw new BadRequestError('eventId is required.');
    }

    const cancelled = await eventService.cancelEvent(communityId, eventId, actor.userId, actor.role);
    res.json({ success: true, event: cancelled });
  } catch (error) {
    next(error);
  }
}

export async function unpublishEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);
    const { eventId } = req.params;

    if (!eventId) {
      throw new BadRequestError('eventId is required.');
    }

    const unpublished = await eventService.unpublishEvent(communityId, eventId, actor.userId, actor.role);
    res.json({ success: true, event: unpublished });
  } catch (error) {
    next(error);
  }
}

export async function archiveEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);
    const { eventId } = req.params;

    if (!eventId) {
      throw new BadRequestError('eventId is required.');
    }

    const archived = await eventService.archiveEvent(communityId, eventId, actor.userId, actor.role);
    res.json({ success: true, event: archived });
  } catch (error) {
    next(error);
  }
}

export async function startEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);
    const { eventId } = req.params;

    if (!eventId) {
      throw new BadRequestError('eventId is required.');
    }

    await eventAuthorizationService.assertCanManage(communityId, actor.userId, actor.role);
    const started = await eventService.startEvent(communityId, eventId);
    res.json({ success: true, event: started });
  } catch (error) {
    next(error);
  }
}

export async function completeEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);
    const { eventId } = req.params;

    if (!eventId) {
      throw new BadRequestError('eventId is required.');
    }

    await eventAuthorizationService.assertCanManage(communityId, actor.userId, actor.role);
    const completed = await eventService.completeEvent(communityId, eventId);
    res.json({ success: true, event: completed });
  } catch (error) {
    next(error);
  }
}

export async function listEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);

    const list = await eventsRepository.listForTenant(communityId);

    // Filter events based on view authorization
    const authorizedList = [];
    for (const event of list) {
      try {
        await eventAuthorizationService.assertCanView(event, actor.userId, actor.role);
        authorizedList.push(event);
      } catch (err) {
        // Skip private/unauthorized events silently in lists
      }
    }

    res.json({ success: true, events: authorizedList });
  } catch (error) {
    next(error);
  }
}

export async function getEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);
    const { eventId } = req.params;

    if (!eventId) {
      throw new BadRequestError('eventId is required.');
    }

    const event = await eventsRepository.getById(eventId);
    if (!event || event.communityId !== communityId) {
      throw new NotFoundError('Event not found.');
    }

    await eventAuthorizationService.assertCanView(event, actor.userId, actor.role);

    res.json({ success: true, event });
  } catch (error) {
    next(error);
  }
}

/**
 * 2. EVENT REGISTRATION
 */
export async function registerMember(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);
    const { eventId } = req.params;
    const { discordUserId, username } = req.body;

    if (!eventId) {
      throw new BadRequestError('eventId is required.');
    }

    // Set fallback values if missing
    const finalUserId = discordUserId || actor.userId;
    const finalUsername = username || actor.username;

    const registration = await eventRegistrationService.registerMember({
      communityId,
      eventId,
      discordUserId: finalUserId,
      username: finalUsername,
      actorUserId: actor.userId,
    });

    res.status(201).json({ success: true, registration });
  } catch (error) {
    next(error);
  }
}

export async function cancelRegistration(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);
    const { eventId } = req.params;
    const { discordUserId } = req.body;

    if (!eventId) {
      throw new BadRequestError('eventId is required.');
    }

    const finalUserId = discordUserId || actor.userId;

    const registration = await eventRegistrationService.cancelRegistration(
      communityId,
      eventId,
      finalUserId,
      actor.userId
    );

    res.json({ success: true, registration });
  } catch (error) {
    next(error);
  }
}

export async function getRegistrations(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);
    const { eventId } = req.params;

    if (!eventId) {
      throw new BadRequestError('eventId is required.');
    }

    const all = await eventRegistrationsRepository.listForTenant(communityId);
    const eventRegs = all.filter(r => r.eventId === eventId);

    res.json({ success: true, registrations: eventRegs });
  } catch (error) {
    next(error);
  }
}

/**
 * 3. ATTENDANCE & CHECK-IN
 */
export async function markAttendance(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);
    const { eventId } = req.params;
    const { discordUserId, attendanceStatus, source } = req.body;

    if (!eventId || !discordUserId || !attendanceStatus) {
      throw new BadRequestError('eventId, discordUserId, and attendanceStatus are required.');
    }

    // Only managers can mark others' attendance
    await eventAuthorizationService.assertCanManage(communityId, actor.userId, actor.role);

    const registration = await eventAttendanceService.markAttendance({
      communityId,
      eventId,
      discordUserId,
      attendanceStatus,
      markedBy: actor.userId,
      source: source || 'MODERATOR',
    });

    res.json({ success: true, registration });
  } catch (error) {
    next(error);
  }
}

export async function checkIn(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);
    const { eventId } = req.params;
    const { discordUserId } = req.body;

    if (!eventId) {
      throw new BadRequestError('eventId is required.');
    }

    const finalUserId = discordUserId || actor.userId;

    const registration = await eventAttendanceService.checkIn(
      communityId,
      eventId,
      finalUserId,
      actor.userId
    );

    res.json({ success: true, registration });
  } catch (error) {
    next(error);
  }
}

/**
 * 4. EVENT ANALYTICS
 */
export async function getEventAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);

    // Requires manage roles to view full analytics
    await eventAuthorizationService.assertCanManage(communityId, actor.userId, actor.role);

    const analytics = await eventAnalyticsService.getEventAnalytics(communityId);
    res.json({ success: true, analytics });
  } catch (error) {
    next(error);
  }
}

/**
 * 5. SCHEDULES MANAGEMENT
 */
export async function listSchedules(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const schedules = await scheduleService.listSchedules(communityId);
    res.json({ success: true, schedules });
  } catch (error) {
    next(error);
  }
}

export async function createSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);
    const { name, resourceType, resourceId, timezone, recurrence, nextExecutionAt, metadata } = req.body;

    const schedule = await scheduleService.createSchedule({
      communityId,
      name,
      resourceType,
      resourceId,
      timezone,
      recurrence,
      nextExecutionAt,
      metadata,
      actorUserId: actor.userId,
      actorRole: actor.role as any,
    });

    res.status(201).json({ success: true, schedule });
  } catch (error) {
    next(error);
  }
}

export async function getSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const { id } = req.params;
    const schedule = await scheduleService.getSchedule(communityId, id);
    res.json({ success: true, schedule });
  } catch (error) {
    next(error);
  }
}

export async function editSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);
    const { id } = req.params;

    const updated = await scheduleService.editSchedule(
      communityId,
      id,
      req.body,
      actor.userId,
      actor.role as any
    );

    res.json({ success: true, schedule: updated });
  } catch (error) {
    next(error);
  }
}

export async function pauseSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);
    const { id } = req.params;

    const updated = await scheduleService.pauseSchedule(communityId, id, actor.userId, actor.role as any);
    res.json({ success: true, schedule: updated });
  } catch (error) {
    next(error);
  }
}

export async function resumeSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);
    const { id } = req.params;

    const updated = await scheduleService.resumeSchedule(communityId, id, actor.userId, actor.role as any);
    res.json({ success: true, schedule: updated });
  } catch (error) {
    next(error);
  }
}

export async function cancelSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const actor = getActorInfo(req);
    const { id } = req.params;

    const updated = await scheduleService.cancelSchedule(communityId, id, actor.userId, actor.role as any);
    res.json({ success: true, schedule: updated });
  } catch (error) {
    next(error);
  }
}
