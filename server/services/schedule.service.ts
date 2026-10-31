import { Schedule } from '../../shared/types/models.js';
import { UserRole } from '../../shared/types/rbac.js';
import { schedulesRepository, communitiesRepository } from '../repositories/index.js';
import { DurableLockService } from './automation.service.js';
import { auditService } from './audit.service.js';
import { EntitlementService } from './entitlement.service.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { logger } from '../logging/logger.js';

export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
}

export function computeNextExecutionTime(currentTimeIso: string, recurrence: Schedule['recurrence']): string {
  const current = new Date(currentTimeIso);
  if (isNaN(current.getTime())) {
    throw new BadRequestError('Invalid date format for execution calculation.');
  }

  const next = new Date(current.getTime());
  switch (recurrence) {
    case 'DAILY':
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case 'WEEKLY':
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case 'MONTHLY':
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case 'CUSTOM_RECURRENCE':
      // Default future extension: 1 day interval
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case 'ONCE':
    default:
      return currentTimeIso;
  }
  return next.toISOString();
}

export class ScheduleService {
  private executedKeys = new Set<string>();

  private assertCanManage(actorRole: UserRole): void {
    if (actorRole === 'OWNER' || actorRole === 'CONTROLLER') {
      return;
    }
    throw new ForbiddenError('Only Server Owner or Controller is authorized to manage schedules.');
  }

  async createSchedule(params: {
    communityId: string;
    name: string;
    resourceType: Schedule['resourceType'];
    resourceId: string;
    timezone: string;
    recurrence: Schedule['recurrence'];
    nextExecutionAt: string;
    metadata?: Record<string, any>;
    actorUserId: string;
    actorRole: UserRole;
  }): Promise<Schedule> {
    this.assertCanManage(params.actorRole);

    const community = await communitiesRepository.getById(params.communityId);
    if (!community) {
      throw new NotFoundError('Community not found');
    }

    if (!params.name || !params.name.trim()) {
      throw new BadRequestError('Schedule name is required.');
    }

    if (!params.resourceType || !params.resourceId) {
      throw new BadRequestError('Resource type and resource ID are required.');
    }

    const tz = params.timezone || community.timezone || 'UTC';
    if (!isValidTimezone(tz)) {
      throw new BadRequestError(`INVALID_TIMEZONE: "${tz}" is not a recognized IANA timezone.`);
    }

    const execTime = new Date(params.nextExecutionAt);
    if (isNaN(execTime.getTime())) {
      throw new BadRequestError('INVALID_SCHEDULE_DATETIME: nextExecutionAt must be a valid ISO datetime.');
    }

    // Must be in future (allow 10 second grace period)
    if (execTime.getTime() < Date.now() - 10000) {
      throw new BadRequestError('INVALID_SCHEDULE_DATETIME: nextExecutionAt must be scheduled in the future.');
    }

    const validRecurrences = ['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM_RECURRENCE'];
    if (!validRecurrences.includes(params.recurrence)) {
      throw new BadRequestError(`Unsupported recurrence pattern: ${params.recurrence}`);
    }

    const scheduleId = `sched_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const schedule: Schedule = {
      id: scheduleId,
      communityId: params.communityId,
      name: params.name.trim(),
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      timezone: tz,
      recurrence: params.recurrence,
      nextExecutionAt: execTime.toISOString(),
      status: 'ACTIVE',
      metadata: params.metadata || {},
      createdBy: params.actorUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const created = await schedulesRepository.create(schedule);

    await auditService.log({
      communityId: params.communityId,
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      action: 'SCHEDULE_CREATED' as any,
      targetType: 'SCHEDULE' as any,
      targetId: created.id,
      metadata: {
        name: created.name,
        resourceType: created.resourceType,
        resourceId: created.resourceId,
        recurrence: created.recurrence,
        timezone: created.timezone,
      },
    });

    return created;
  }

  async listSchedules(communityId: string): Promise<Schedule[]> {
    return schedulesRepository.listForTenant(communityId);
  }

  async getSchedule(communityId: string, scheduleId: string): Promise<Schedule> {
    const schedule = await schedulesRepository.getById(scheduleId);
    if (!schedule || schedule.communityId !== communityId) {
      throw new NotFoundError('Schedule not found.');
    }
    return schedule;
  }

  async editSchedule(
    communityId: string,
    scheduleId: string,
    params: Partial<Pick<Schedule, 'name' | 'timezone' | 'recurrence' | 'nextExecutionAt' | 'metadata'>>,
    actorUserId: string,
    actorRole: UserRole
  ): Promise<Schedule> {
    this.assertCanManage(actorRole);

    const schedule = await this.getSchedule(communityId, scheduleId);

    if (schedule.status === 'COMPLETED' || schedule.status === 'CANCELLED') {
      throw new BadRequestError(`Cannot modify schedule with status ${schedule.status}.`);
    }

    const updates: Partial<Schedule> = {
      updatedAt: new Date().toISOString(),
    };

    if (params.name !== undefined) {
      if (!params.name.trim()) throw new BadRequestError('Schedule name cannot be empty.');
      updates.name = params.name.trim();
    }

    if (params.timezone !== undefined) {
      if (!isValidTimezone(params.timezone)) {
        throw new BadRequestError(`INVALID_TIMEZONE: "${params.timezone}" is not a valid IANA timezone.`);
      }
      updates.timezone = params.timezone;
    }

    if (params.recurrence !== undefined) {
      const validRecurrences = ['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM_RECURRENCE'];
      if (!validRecurrences.includes(params.recurrence)) {
        throw new BadRequestError(`Unsupported recurrence pattern: ${params.recurrence}`);
      }
      updates.recurrence = params.recurrence;
    }

    if (params.nextExecutionAt !== undefined) {
      const execTime = new Date(params.nextExecutionAt);
      if (isNaN(execTime.getTime())) {
        throw new BadRequestError('Invalid nextExecutionAt timestamp.');
      }
      updates.nextExecutionAt = execTime.toISOString();
    }

    if (params.metadata !== undefined) {
      updates.metadata = { ...schedule.metadata, ...params.metadata };
    }

    const updated = await schedulesRepository.update(scheduleId, updates);

    await auditService.log({
      communityId,
      actorUserId,
      actorRole,
      action: 'SCHEDULE_UPDATED' as any,
      targetType: 'SCHEDULE' as any,
      targetId: scheduleId,
      metadata: { updates },
    });

    return updated;
  }

  async pauseSchedule(communityId: string, scheduleId: string, actorUserId: string, actorRole: UserRole): Promise<Schedule> {
    this.assertCanManage(actorRole);
    const schedule = await this.getSchedule(communityId, scheduleId);

    if (schedule.status !== 'ACTIVE') {
      throw new BadRequestError(`Cannot pause schedule with status ${schedule.status}. Must be ACTIVE.`);
    }

    const updated = await schedulesRepository.update(scheduleId, {
      status: 'PAUSED',
      updatedAt: new Date().toISOString(),
    });

    await auditService.log({
      communityId,
      actorUserId,
      actorRole,
      action: 'SCHEDULE_PAUSED' as any,
      targetType: 'SCHEDULE' as any,
      targetId: scheduleId,
    });

    return updated;
  }

  async resumeSchedule(communityId: string, scheduleId: string, actorUserId: string, actorRole: UserRole): Promise<Schedule> {
    this.assertCanManage(actorRole);
    const schedule = await this.getSchedule(communityId, scheduleId);

    if (schedule.status !== 'PAUSED') {
      throw new BadRequestError(`Cannot resume schedule with status ${schedule.status}. Must be PAUSED.`);
    }

    // If nextExecutionAt has passed while paused, advance it to future or now
    let nextExec = schedule.nextExecutionAt;
    if (new Date(nextExec).getTime() <= Date.now()) {
      nextExec = new Date(Date.now() + 60000).toISOString();
    }

    const updated = await schedulesRepository.update(scheduleId, {
      status: 'ACTIVE',
      nextExecutionAt: nextExec,
      updatedAt: new Date().toISOString(),
    });

    await auditService.log({
      communityId,
      actorUserId,
      actorRole,
      action: 'SCHEDULE_RESUMED' as any,
      targetType: 'SCHEDULE' as any,
      targetId: scheduleId,
    });

    return updated;
  }

  async cancelSchedule(communityId: string, scheduleId: string, actorUserId: string, actorRole: UserRole): Promise<Schedule> {
    this.assertCanManage(actorRole);
    const schedule = await this.getSchedule(communityId, scheduleId);

    if (schedule.status === 'CANCELLED' || schedule.status === 'COMPLETED') {
      throw new BadRequestError(`Schedule is already ${schedule.status}.`);
    }

    const updated = await schedulesRepository.update(scheduleId, {
      status: 'CANCELLED',
      updatedAt: new Date().toISOString(),
    });

    await auditService.log({
      communityId,
      actorUserId,
      actorRole,
      action: 'SCHEDULE_CANCELLED' as any,
      targetType: 'SCHEDULE' as any,
      targetId: scheduleId,
    });

    return updated;
  }

  async deleteSchedule(communityId: string, scheduleId: string, actorUserId: string, actorRole: UserRole): Promise<boolean> {
    this.assertCanManage(actorRole);
    const schedule = await this.getSchedule(communityId, scheduleId);

    await schedulesRepository.delete(scheduleId);

    await auditService.log({
      communityId,
      actorUserId,
      actorRole,
      action: 'SCHEDULE_CANCELLED' as any,
      targetType: 'SCHEDULE' as any,
      targetId: scheduleId,
      metadata: { deleted: true, name: schedule.name },
    });

    return true;
  }

  /**
   * Periodic scheduler execution pass
   * Reuses the persistent background worker loop
   */
  async processPendingSchedules(): Promise<void> {
    const nowStr = new Date().toISOString();
    const allSchedules = await schedulesRepository.list();
    const pending = allSchedules.filter(s => s.status === 'ACTIVE' && s.nextExecutionAt && s.nextExecutionAt <= nowStr);

    for (const schedule of pending) {
      const scheduledExecutionId = `sched_exec_${schedule.id}_${schedule.nextExecutionAt}`;
      const idempotencyKey = `${schedule.communityId}_${schedule.id}_${schedule.nextExecutionAt}`;

      if (this.executedKeys.has(idempotencyKey)) {
        continue;
      }

      // Concurrency lock
      const lockKey = `lock_sched_${schedule.id}`;
      const acquired = await DurableLockService.acquireLock(lockKey, schedule.communityId, 30);
      if (!acquired) {
        continue;
      }

      try {
        this.executedKeys.add(idempotencyKey);

        const executionTimestamp = new Date().toISOString();
        let nextStatus: Schedule['status'] = 'ACTIVE';
        let nextExecutionTime = schedule.nextExecutionAt;

        if (schedule.recurrence === 'ONCE') {
          nextStatus = 'COMPLETED';
        } else {
          nextExecutionTime = computeNextExecutionTime(schedule.nextExecutionAt, schedule.recurrence);
        }

        // Update schedule state atomically
        await schedulesRepository.update(schedule.id, {
          lastExecutionAt: executionTimestamp,
          nextExecutionAt: nextExecutionTime,
          status: nextStatus,
          updatedAt: executionTimestamp,
        });

        // Dispatch action based on resource type
        if (schedule.resourceType === 'AUTOMATION') {
          try {
            const { AutomationEventBusService } = await import('./automation.service.js');
            await AutomationEventBusService.publish({
              eventType: 'SCHEDULED_TIME',
              communityId: schedule.communityId,
              resourceType: 'SCHEDULE',
              resourceId: schedule.id,
              metadata: {
                scheduleId: schedule.id,
                name: schedule.name,
                targetWorkflowId: schedule.resourceId,
                scheduledExecutionId,
                timezone: schedule.timezone,
                recurrence: schedule.recurrence,
              },
            });
          } catch (autoErr: any) {
            logger.error(`[ScheduleService] Error dispatching automation for schedule ${schedule.id}: ${autoErr.message}`);
          }
        }

        await auditService.log({
          communityId: schedule.communityId,
          actorUserId: 'system_scheduler',
          actorRole: 'OWNER',
          action: 'SCHEDULE_EXECUTED' as any,
          targetType: 'SCHEDULE' as any,
          targetId: schedule.id,
          metadata: {
            scheduledExecutionId,
            resourceType: schedule.resourceType,
            resourceId: schedule.resourceId,
            nextStatus,
            nextExecutionTime,
          },
        });
      } catch (err: any) {
        logger.error(`[ScheduleService] Failed to execute schedule ${schedule.id}: ${err.message}`);
        await schedulesRepository.update(schedule.id, {
          status: 'FAILED',
          updatedAt: new Date().toISOString(),
        });
      } finally {
        await DurableLockService.releaseLock(lockKey, schedule.communityId);
      }
    }
  }
}

export const scheduleService = new ScheduleService();
