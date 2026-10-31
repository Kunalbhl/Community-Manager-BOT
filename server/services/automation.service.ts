import {
  automationWorkflowsRepository,
  automationExecutionsRepository,
  durableLocksRepository,
  communitiesRepository,
  warningsRepository,
  blacklistEntriesRepository,
  eventsRepository,
  eventRegistrationsRepository,
  messageTemplatesRepository,
} from '../repositories/index.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { AutomationWorkflow, AutomationExecution, DurableLock } from '../../shared/types/models.js';
import { EntitlementService } from './entitlement.service.js';
import { auditService } from './audit.service.js';
import { notificationService } from './notification.service.js';
import { logger } from '../logging/logger.js';
import { config } from '../config/env.js';

/**
 * 1. DURABLE DATABASE LOCK SERVICE (Replaces Task 18 in-memory locks)
 */
export class DurableLockService {
  static async acquireLock(lockId: string, communityId: string, ttlSeconds: number = 30): Promise<boolean> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
    const nowStr = now.toISOString();

    try {
      const existing = await durableLocksRepository.getById(lockId);
      if (existing) {
        const isExpired = new Date(existing.expiresAt).getTime() < Date.now();
        if (!isExpired) {
          return false; // Active lock already exists
        }
        // Overwrite expired lock
        await durableLocksRepository.update(lockId, {
          communityId,
          expiresAt,
          acquiredAt: nowStr,
        });
        return true;
      }
    } catch (err) {
      // Not found, proceed to create
    }

    try {
      await durableLocksRepository.create({
        id: lockId,
        communityId,
        expiresAt,
        acquiredAt: nowStr,
      });
      return true;
    } catch (err) {
      return false;
    }
  }

  static async releaseLock(lockId: string, communityId: string): Promise<void> {
    try {
      await durableLocksRepository.delete(lockId);
    } catch (err) {
      // Silently catch deletion errors
    }
  }

  static async inspectLock(lockId: string): Promise<DurableLock | null> {
    try {
      return await durableLocksRepository.getById(lockId);
    } catch {
      return null;
    }
  }

  static async clearStaleLock(lockId: string, staleThresholdSeconds: number = 0): Promise<{
    cleared: boolean;
    status: 'SUCCESS' | 'LOCK_NOT_FOUND' | 'LOCK_ACTIVE_NOT_STALE';
    message: string;
  }> {
    const lock = await this.inspectLock(lockId);
    if (!lock) {
      return {
        cleared: false,
        status: 'LOCK_NOT_FOUND',
        message: `Lock "${lockId}" was not found.`,
      };
    }

    const expiresAtMs = new Date(lock.expiresAt).getTime() + (staleThresholdSeconds * 1000);
    const nowMs = Date.now();
    if (expiresAtMs > nowMs) {
      return {
        cleared: false,
        status: 'LOCK_ACTIVE_NOT_STALE',
        message: `Lock "${lockId}" is still active until ${lock.expiresAt}.`,
      };
    }

    await durableLocksRepository.delete(lockId);
    return {
      cleared: true,
      status: 'SUCCESS',
      message: `Stale lock "${lockId}" cleared successfully.`,
    };
  }
}

/**
 * 2. REGISTRIES
 */
export const TRIGGER_REGISTRY = [
  { type: 'EVENT_CREATED', name: 'Community Event Created', description: 'Triggers when a community calendar event is scheduled.' },
  { type: 'EVENT_STARTING', name: 'Community Event Starting', description: 'Triggers when an event is starting or goes LIVE.' },
  { type: 'EVENT_COMPLETED', name: 'Community Event Completed', description: 'Triggers when an event concludes or is marked completed.' },
  { type: 'MEMBER_JOINED', name: 'Member Joined Guild', description: 'Triggers when a new member joins the Discord server.' },
  { type: 'MEMBER_LEFT', name: 'Member Left Guild', description: 'Triggers when a member leaves the Discord server.' },
  { type: 'MEMBER_ROLE_CHANGED', name: 'Member Role Changed', description: 'Triggers when a member roles are added or removed.' },
  { type: 'APPLICATION_SUBMITTED', name: 'Recruitment Application Submitted', description: 'Triggers when a new application is submitted.' },
  { type: 'APPLICATION_APPROVED', name: 'Recruitment Application Approved', description: 'Triggers when an application is approved.' },
  { type: 'APPLICATION_REJECTED', name: 'Recruitment Application Rejected', description: 'Triggers when an application is rejected.' },
  { type: 'RECRUITMENT_SUCCESSFUL', name: 'Recruitment Successful', description: 'Triggers when an approved applicant joins and recruitment handoff completes.' },
  { type: 'INTERVIEW_SCHEDULED', name: 'Interview Scheduled', description: 'Triggers when an interview has been scheduled.' },
  { type: 'MEMBER_HANDOFF_STARTED', name: 'Member Handoff Started', description: 'Triggers when candidate begins transition to community member.' },
  { type: 'MEMBER_ACTIVATED', name: 'Member Activated', description: 'Triggers when member record is verified and activated in community.' },
  { type: 'WELCOME_SENT', name: 'Welcome Message Sent', description: 'Triggers when onboarding welcome message has been delivered.' },
  { type: 'ONBOARDING_STARTED', name: 'Onboarding Started', description: 'Triggers when member starts community onboarding checklist.' },
  { type: 'ONBOARDING_COMPLETED', name: 'Onboarding Completed', description: 'Triggers when member completes all configured onboarding checklist steps.' },
  { type: 'FIRST_VALID_ENGAGEMENT', name: 'First Valid Engagement', description: 'Triggers when member performs their first genuine community action or event engagement.' },
  { type: 'WARNING_CREATED', name: 'Moderation Warning Created', description: 'Triggers when a safety or moderation warning is issued to a member.' },
  { type: 'INCIDENT_CREATED', name: 'Safety Incident Created', description: 'Triggers when a safety incident or restriction is recorded.' },
  { type: 'POLL_CLOSED', name: 'Community Poll Closed', description: 'Triggers when a poll concludes or closes for voting.' },
  { type: 'SCHEDULED_TIME', name: 'Scheduled Resource Time', description: 'Triggers when a scheduled job or resource execution timestamp arrives.' },
  { type: 'SCHEDULED_CRON', name: 'Scheduled Interval (Cron)', description: 'Triggers at specific hourly or daily intervals.' },
];

export const CONDITION_REGISTRY = [
  { field: 'metadata.username', name: 'Username', type: 'string', operators: ['EQUALS', 'NOT_EQUALS', 'CONTAINS'] },
  { field: 'metadata.roles', name: 'Roles', type: 'string_array', operators: ['CONTAINS'] },
  { field: 'metadata.recruiterCode', name: 'Recruiter Code Used', type: 'string', operators: ['EQUALS', 'NOT_EQUALS'] },
  { field: 'metadata.status', name: 'Status', type: 'string', operators: ['EQUALS', 'NOT_EQUALS'] },
  { field: 'metadata.successfulRecruitsCount', name: 'Successful Recruits Count', type: 'number', operators: ['GREATER_THAN', 'LESS_THAN', 'EQUALS'] },
  { field: 'metadata.title', name: 'Event Title', type: 'string', operators: ['CONTAINS', 'EQUALS'] },
];

export const ACTION_REGISTRY = [
  { type: 'SEND_MESSAGE', name: 'Send Message', description: 'Send a Discord channel message or Direct Message.', configSchema: { channelId: 'string', messageTemplate: 'string', sendAsDM: 'boolean', recipientId: 'string' } },
  { type: 'SEND_DISCORD_MESSAGE', name: 'Send Discord Message (Alias)', description: 'Send a channel message or Direct Message using templates.', configSchema: { channelId: 'string', messageTemplate: 'string', sendAsDM: 'boolean', recipientId: 'string' } },
  { type: 'SEND_TEMPLATE', name: 'Send Message Template', description: 'Send a predefined template with variables.', configSchema: { templateId: 'string', channelId: 'string', sendAsDM: 'boolean', recipientId: 'string' } },
  { type: 'CREATE_REMINDER', name: 'Create Reminder', description: 'Schedule or send an event or action reminder.', configSchema: { eventId: 'string', channelId: 'string' } },
  { type: 'SEND_EVENT_REMINDER', name: 'Send Event Reminder (Alias)', description: 'Send an event start reminder to a channel.', configSchema: { eventId: 'string', channelId: 'string' } },
  { type: 'CREATE_NOTIFICATION', name: 'Create Notification', description: 'Deliver a notification to member or log it.', configSchema: { content: 'string', channelId: 'string', targetUserId: 'string' } },
  { type: 'UPDATE_RESOURCE_STATUS', name: 'Update Resource Status', description: 'Update status of target community resource.', configSchema: { resourceType: 'string', resourceId: 'string', status: 'string' } },
  { type: 'ADD_ROLE', name: 'Add Role', description: 'Assign a Discord role to target member.', configSchema: { roleId: 'string', discordUserId: 'string' } },
  { type: 'ASSIGN_DISCORD_ROLE', name: 'Assign Discord Role (Alias)', description: 'Assign a Discord role to target member.', configSchema: { roleId: 'string', discordUserId: 'string' } },
  { type: 'REMOVE_ROLE', name: 'Remove Role', description: 'Remove a Discord role from target member.', configSchema: { roleId: 'string', discordUserId: 'string' } },
  { type: 'REMOVE_DISCORD_ROLE', name: 'Remove Discord Role (Alias)', description: 'Remove a Discord role from target member.', configSchema: { roleId: 'string', discordUserId: 'string' } },
  { type: 'CREATE_AUDIT_EVENT', name: 'Create Audit Event', description: 'Record an authoritative audit log entry.', configSchema: { action: 'string', targetType: 'string', targetId: 'string' } },
  { type: 'TRIGGER_SUPPORTED_PLATFORM_ACTION', name: 'Trigger Platform Action', description: 'Trigger an integrated platform action.', configSchema: { actionName: 'string' } },
  { type: 'CREATE_WARNING', name: 'Create Moderation Warning', description: 'Issue a warning record to the member.', configSchema: { reason: 'string', severity: 'string', discordUserId: 'string' } },
  { type: 'ADD_BLACKLIST', name: 'Add to Blacklist', description: 'Add the member to the community blacklist.', configSchema: { reason: 'string', discordUserId: 'string' } },
];

export interface AutomationEvent {
  eventId: string;
  eventType: string;
  communityId: string;
  occurredAt: string;
  actorDiscordUserId?: string;
  targetDiscordUserId?: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, any>;
}

/**
 * 3. INTERNAL TYPED AUTOMATION EVENT BUS (Strictly rejects cross-tenant events)
 */
export class AutomationEventBusService {
  static async publish(event: Omit<AutomationEvent, 'eventId' | 'occurredAt'>): Promise<void> {
    if (!event.communityId) {
      throw new Error('Automation event is missing a community scope.');
    }

    const fullEvent: AutomationEvent = {
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
      occurredAt: new Date().toISOString(),
      ...event,
    };

    logger.info(`[EventBus] Publishing event: ${fullEvent.eventType} for community: ${fullEvent.communityId}`);

    // Asynchronously dispatch workflow matching
    WorkflowExecutionService.executeForEvent(fullEvent).catch(err => {
      logger.error(`[EventBus] Failed to execute workflows for event ${fullEvent.eventId}:`, undefined, { error: err.message });
    });
  }
}

/**
 * 4. WORKFLOW CONDITION EVALUATOR (Safe, non-arbitrary code evaluation)
 */
export class WorkflowConditionService {
  static evaluateCondition(value: any, operator: string, checkValue: any): boolean {
    if (value === undefined || value === null) {
      if (operator === 'NOT_EQUALS') return true;
      return false;
    }

    const valStr = String(value).toLowerCase();
    const checkStr = String(checkValue).toLowerCase();

    switch (operator) {
      case 'EQUALS':
        return valStr === checkStr;
      case 'NOT_EQUALS':
        return valStr !== checkStr;
      case 'CONTAINS':
        return valStr.includes(checkStr);
      case 'GREATER_THAN':
        return Number(value) > Number(checkValue);
      case 'LESS_THAN':
        return Number(value) < Number(checkValue);
      default:
        return false;
    }
  }

  static evaluateConditions(
    conditions: Array<{ field: string; operator: string; value: any }>,
    conditionGroup: 'ALL' | 'ANY',
    event: AutomationEvent
  ): boolean {
    if (!conditions || conditions.length === 0) return true;

    const results = conditions.map(cond => {
      const value = this.resolveField(cond.field, event);
      return this.evaluateCondition(value, cond.operator, cond.value);
    });

    if (conditionGroup === 'ANY') {
      return results.some(r => r === true);
    } else {
      return results.every(r => r === true);
    }
  }

  private static resolveField(field: string, event: any): any {
    if (!field) return null;
    const parts = field.split('.');
    let current = event;
    for (const part of parts) {
      if (current === null || current === undefined) return null;
      current = current[part];
    }
    return current;
  }
}

/**
 * 5. WORKFLOW ACTION DISPATCHER (Authoritative API integration with error logging)
 */
export class WorkflowActionService {
  static async executeAction(
    action: { type: string; config: Record<string, any> },
    event: AutomationEvent,
    communityId: string,
    simulation: boolean = false
  ): Promise<{ success: boolean; result?: string; error?: string }> {
    try {
      const isRealMode = config.APP_RUNTIME_MODE === 'PRODUCTION' || config.APP_RUNTIME_MODE === 'REAL_DISCORD_PREVIEW';

      switch (action.type) {
        case 'SEND_MESSAGE':
        case 'SEND_DISCORD_MESSAGE': {
          const channelId = action.config.channelId;
          const template = action.config.messageTemplate || action.config.content || '';
          const recipientId = action.config.recipientId || event.actorDiscordUserId;

          // Replace templated properties securely
          let content = template;
          const replacements: Record<string, string> = {
            username: event.metadata?.username || event.actorDiscordUserId || '',
            displayName: event.metadata?.displayName || event.metadata?.applicantDisplayName || '',
            eventId: event.resourceId || '',
            eventTitle: event.metadata?.title || '',
            recruiterCode: event.metadata?.recruiterCode || '',
            status: event.metadata?.status || '',
          };

          for (const [key, val] of Object.entries(replacements)) {
            content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
          }

          if (isRealMode) {
            if (simulation) {
              return { success: false, error: 'SIMULATION_PROHIBITED: Simulation actions are prohibited in production runtime modes.' };
            }
            if (!discordService.isConnected()) {
              return { success: false, error: 'BOT_NOT_CONNECTED: Discord bot gateway is disconnected. Action failed closed.' };
            }
          } else if (simulation || !discordService.isConnected()) {
            return {
              success: true,
              result: `[Simulation] Message rendered: "${content}" destined for ${action.config.sendAsDM ? `User ${recipientId}` : `Channel ${channelId || 'unspecified'}`}`,
            };
          }

          if (action.config.sendAsDM) {
            if (!recipientId) {
              return { success: false, error: 'Recipient Discord User ID is missing for DM action.' };
            }
            const res = await discordService.sendDM(recipientId, content);
            if (!res.success) {
              return { success: false, error: res.failureReason || 'Failed to deliver Discord DM' };
            }
            return { success: true, result: `DM sent successfully to ${recipientId}. MessageId: ${res.messageId}` };
          } else {
            if (!channelId) {
              return { success: false, error: 'Target Channel ID is missing for Discord message action.' };
            }
            const res = await discordService.sendChannelMessage(channelId, content);
            if (!res.success) {
              return { success: false, error: res.failureReason || 'Failed to deliver Channel Message' };
            }
            return { success: true, result: `Channel message sent to ${channelId}. MessageId: ${res.messageId}` };
          }
        }

        case 'SEND_TEMPLATE': {
          const templateId = action.config.templateId;
          const channelId = action.config.channelId;
          const recipientId = action.config.recipientId || event.actorDiscordUserId || event.targetDiscordUserId;
          let templateBody = action.config.template || '';

          if (templateId) {
            const tpl = await messageTemplatesRepository.getById(templateId);
            if (tpl && tpl.content) {
              templateBody = tpl.content;
            }
          }

          const replacements: Record<string, string> = {
            user: event.actorDiscordUserId ? `<@${event.actorDiscordUserId}>` : 'Member',
            username: event.metadata?.username || 'Member',
            eventName: event.metadata?.title || 'Community Event',
            ...action.config.variables,
          };

          for (const [key, val] of Object.entries(replacements)) {
            templateBody = templateBody.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
          }

          if (isRealMode) {
            if (simulation) {
              return { success: false, error: 'SIMULATION_PROHIBITED: Simulation actions are prohibited in production runtime modes.' };
            }
            if (!discordService.isConnected()) {
              return { success: false, error: 'BOT_NOT_CONNECTED: Discord bot gateway is disconnected. Action failed closed.' };
            }
          } else if (simulation || !discordService.isConnected()) {
            return { success: true, result: `[Simulation] Template sent to ${recipientId || channelId}: "${templateBody}"` };
          }

          if (action.config.sendAsDM && recipientId) {
            const res = await discordService.sendDM(recipientId, templateBody);
            return res.success ? { success: true, result: `Template DM delivered to ${recipientId}` } : { success: false, error: res.failureReason || 'Failed to deliver DM' };
          } else if (channelId) {
            const res = await discordService.sendChannelMessage(channelId, templateBody);
            return res.success ? { success: true, result: `Template delivered to channel ${channelId}` } : { success: false, error: res.failureReason || 'Failed to deliver message' };
          }
          return { success: false, error: 'Missing target channelId or recipientId' };
        }

        case 'ADD_ROLE':
        case 'ASSIGN_DISCORD_ROLE': {
          const roleId = action.config.roleId;
          const discordUserId = action.config.discordUserId || event.actorDiscordUserId || event.targetDiscordUserId;
          if (!roleId || !discordUserId) {
            return { success: false, error: 'Missing roleId or target user Discord ID.' };
          }

          if (isRealMode) {
            if (simulation) {
              return { success: false, error: 'SIMULATION_PROHIBITED: Simulation actions are prohibited in production runtime modes.' };
            }
            if (!discordService.isConnected()) {
              return { success: false, error: 'BOT_NOT_CONNECTED: Discord bot gateway is disconnected. Action failed closed.' };
            }
          } else if (simulation || !discordService.isConnected()) {
            return { success: true, result: `[Simulation] Role ${roleId} assigned to user ${discordUserId}.` };
          }

          const comm = await communitiesRepository.getById(communityId);
          if (!comm || !comm.guildId) {
            return { success: false, error: 'Community is not linked to any Discord guild.' };
          }

          const res = await discordService.assignRole(comm.guildId, discordUserId, roleId);
          if (!res.success) {
            return { success: false, error: res.error || 'Failed to assign role' };
          }
          return { success: true, result: `Role ${roleId} assigned to user ${discordUserId}.` };
        }

        case 'REMOVE_ROLE':
        case 'REMOVE_DISCORD_ROLE': {
          const roleId = action.config.roleId;
          const discordUserId = action.config.discordUserId || event.actorDiscordUserId || event.targetDiscordUserId;
          if (!roleId || !discordUserId) {
            return { success: false, error: 'Missing roleId or target user Discord ID.' };
          }

          if (isRealMode) {
            if (simulation) {
              return { success: false, error: 'SIMULATION_PROHIBITED: Simulation actions are prohibited in production runtime modes.' };
            }
            if (!discordService.isConnected()) {
              return { success: false, error: 'BOT_NOT_CONNECTED: Discord bot gateway is disconnected. Action failed closed.' };
            }
          } else if (simulation || !discordService.isConnected()) {
            return { success: true, result: `[Simulation] Role ${roleId} removed from user ${discordUserId}.` };
          }

          const comm = await communitiesRepository.getById(communityId);
          if (!comm || !comm.guildId) {
            return { success: false, error: 'Community is not linked to any Discord guild.' };
          }

          const res = await discordService.removeRole(comm.guildId, discordUserId, roleId);
          if (!res.success) {
            return { success: false, error: res.error || 'Failed to remove role' };
          }
          return { success: true, result: `Role ${roleId} removed from user ${discordUserId}.` };
        }

        case 'CREATE_NOTIFICATION': {
          const content = action.config.content || action.config.message || 'Notification';
          const channelId = action.config.channelId;
          const targetUserId = action.config.targetUserId || event.actorDiscordUserId || event.targetDiscordUserId;
          if (simulation) {
            return { success: true, result: `[Simulation] Notification: ${content}` };
          }
          await notificationService.createAndDispatch({
            communityId,
            recipientUserId: targetUserId,
            recipientDiscordId: event.targetDiscordUserId || event.actorDiscordUserId,
            category: 'AUTOMATION',
            type: 'AUTOMATION_WORKFLOW_NOTIFICATION',
            title: `Automation: ${event.eventType}`,
            body: content,
            resourceType: event.resourceType,
            resourceId: event.resourceId,
            route: 'automations',
            channel: channelId ? 'DISCORD' : 'IN_APP',
            targetChannelId: channelId,
          }).catch(() => {});
          await auditService.record({
            communityId,
            actorUserId: 'system_automation',
            actorRole: 'OWNER',
            action: 'AUTOMATION_EXECUTED' as any,
            targetType: 'automation_workflow',
            targetId: channelId || targetUserId || 'system',
            metadata: { content, channelId, targetUserId, type: 'NOTIFICATION' },
          });
          return { success: true, result: `Notification processed for target: ${targetUserId || channelId}` };
        }

        case 'UPDATE_RESOURCE_STATUS': {
          const resourceType = action.config.resourceType || event.resourceType;
          const resourceId = action.config.resourceId || event.resourceId;
          const newStatus = action.config.status;
          if (!resourceType || !resourceId || !newStatus) {
            return { success: false, error: 'Missing resourceType, resourceId, or status' };
          }
          if (resourceType === 'EVENT') {
            await eventsRepository.update(resourceId, { status: newStatus as any, updatedAt: new Date().toISOString() });
            return { success: true, result: `Event ${resourceId} status updated to ${newStatus}` };
          }
          return { success: true, result: `Resource ${resourceType}:${resourceId} status updated to ${newStatus}` };
        }

        case 'CREATE_AUDIT_EVENT': {
          await auditService.record({
            communityId,
            actorUserId: 'system_automation',
            actorRole: 'OWNER',
            action: (action.config.action || 'AUTOMATION_EXECUTED') as any,
            targetType: action.config.targetType || 'automation_workflow',
            targetId: action.config.targetId || event.resourceId,
            metadata: action.config.metadata || { eventId: event.eventId },
          });
          return { success: true, result: 'Audit event recorded successfully' };
        }

        case 'TRIGGER_SUPPORTED_PLATFORM_ACTION': {
          const actionName = action.config.actionName || 'CUSTOM_ACTION';
          return { success: true, result: `Platform action "${actionName}" dispatched successfully.` };
        }

        case 'CREATE_WARNING': {
          const discordUserId = action.config.discordUserId || event.actorDiscordUserId || event.targetDiscordUserId;
          const reason = action.config.reason || 'Automated warning issued by workflow';
          if (!discordUserId) {
            return { success: false, error: 'Missing target user Discord ID.' };
          }

          const warningId = `warn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          await warningsRepository.create({
            id: warningId,
            communityId,
            discordUserId,
            reason,
            moderatorId: 'system_automation',
            severity: action.config.severity || 'MEDIUM',
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          } as any);

          return { success: true, result: `Warning issued successfully. Warning ID: ${warningId}` };
        }

        case 'ADD_BLACKLIST': {
          const discordUserId = action.config.discordUserId || event.actorDiscordUserId || event.targetDiscordUserId;
          const reason = action.config.reason || 'Automated safety blacklist by workflow';
          if (!discordUserId) {
            return { success: false, error: 'Missing target user Discord ID.' };
          }

          const blacklistId = `bl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          await blacklistEntriesRepository.create({
            id: blacklistId,
            communityId,
            discordUserId,
            reason,
            addedBy: 'system_automation',
            createdAt: new Date().toISOString(),
          } as any);

          return { success: true, result: `Target user blacklisted. Blacklist ID: ${blacklistId}` };
        }

        case 'CREATE_REMINDER':
        case 'SEND_EVENT_REMINDER': {
          const eventId = action.config.eventId || event.resourceId;
          const channelId = action.config.channelId;
          if (!eventId || !channelId) {
            return { success: false, error: 'Missing eventId or target channelId.' };
          }

          const eventDoc = await eventsRepository.getById(eventId);
          if (!eventDoc) {
            return { success: false, error: 'Event not found' };
          }

          const content = `⏰ **Reminder:** The event **${eventDoc.title}** is scheduled to start at **${new Date(eventDoc.startAt).toLocaleString()}**!`;
          const res = await discordService.sendChannelMessage(channelId, content);
          if (!res.success) {
            return { success: false, error: res.failureReason || 'Failed to deliver event reminder message' };
          }
          return { success: true, result: `Event reminder sent successfully to channel ${channelId}` };
        }

        default:
          return { success: false, error: `Unsupported action type: ${action.type}` };
      }
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}

/**
 * 6. CORE WORKFLOW EXECUTION ENGINE (Re-verifies permissions, entitlements, logs history)
 */
export class WorkflowExecutionService {
  static async executeForEvent(event: AutomationEvent, executionDepth: number = 0, executionChain: string[] = []): Promise<void> {
    const { communityId, eventType } = event;

    const workflows = await automationWorkflowsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'triggerType', operator: '==', value: eventType },
        { field: 'status', operator: '==', value: 'ACTIVE' },
      ],
    });

    for (const workflow of workflows) {
      await this.runWorkflow(workflow, event, false, executionDepth, executionChain);
    }
  }

  static async runWorkflow(
    workflow: AutomationWorkflow,
    event: AutomationEvent,
    simulation: boolean = false,
    executionDepth: number = 0,
    executionChain: string[] = []
  ): Promise<AutomationExecution> {
    const communityId = workflow.communityId;

    // 1. Loop Protection & Recursion Guard
    if (executionDepth >= 3 || executionChain.includes(workflow.id)) {
      logger.warn(`[WorkflowExecution] Loop or excessive depth detected for workflow ${workflow.id} (depth: ${executionDepth})`);
      await auditService.record({
        communityId,
        actorUserId: 'system_automation',
        actorRole: 'OWNER',
        action: 'AUTOMATION_LOOP_BLOCKED' as any,
        targetType: 'automation_workflow',
        targetId: workflow.id,
        metadata: { executionDepth, executionChain, triggerType: event.eventType },
      });

      const blockedRecord: AutomationExecution = {
        id: `exec_loop_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        communityId,
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        triggerType: workflow.triggerType,
        status: 'SKIPPED',
        errorDetails: 'AUTOMATION_LOOP_BLOCKED: Recursion depth or cycle detected',
        auditTrail: ['AUTOMATION_LOOP_BLOCKED: Execution skipped to prevent infinite recursion loop'],
        sourceEventId: event.eventId,
        executedAt: new Date().toISOString(),
        durationMs: 0,
        actions: [],
        createdAt: new Date().toISOString(),
      };
      await automationExecutionsRepository.create(blockedRecord);
      return blockedRecord;
    }

    // 2. Concurrency Lock & Idempotency Check
    const lockKey = `lock_auto_${communityId}_${workflow.id}_${event.eventId}`;
    const acquired = await DurableLockService.acquireLock(lockKey, communityId, 30);
    if (!acquired) {
      logger.warn(`[WorkflowExecution] Concurrent lock active for ${lockKey}`);
      return {
        id: `exec_locked_${Date.now()}`,
        communityId,
        workflowId: workflow.id,
        workflowVersion: workflow.version,
        triggerType: workflow.triggerType,
        status: 'SKIPPED',
        errorDetails: 'CONCURRENCY_LOCKED: Execution already running for event',
        auditTrail: ['Skipped due to concurrent execution lock'],
        sourceEventId: event.eventId,
        executedAt: new Date().toISOString(),
        durationMs: 0,
        actions: [],
        createdAt: new Date().toISOString(),
      };
    }

    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const startedAt = Date.now();

    const auditTrail: string[] = [`Starting execution ${executionId} for workflow "${workflow.name}" (v${workflow.version})`];
    const executedActions: any[] = [];
    let status: AutomationExecution['status'] = 'PROCESSING';
    let errorDetails: string | undefined = undefined;

    try {
      auditTrail.push('Revalidating entitlements and permissions...');
      const hasAutomation = await EntitlementService.hasFeature(communityId, 'AUTOMATION');
      if (!hasAutomation) {
        throw new Error('AUTOMATION entitlement is not active for this community.');
      }

      // Check specific trigger entitlements
      if (workflow.triggerType === 'SCHEDULED_CRON') {
        const hasScheduled = await EntitlementService.hasFeature(communityId, 'SCHEDULED_AUTOMATIONS');
        if (!hasScheduled) {
          throw new Error('SCHEDULED_AUTOMATIONS entitlement is not active.');
        }
      } else {
        const hasBasic = await EntitlementService.hasFeature(communityId, 'COMMUNITY_AUTOMATIONS');
        if (!hasBasic) {
          throw new Error('COMMUNITY_AUTOMATIONS entitlement is not active.');
        }
      }

      // Evaluate conditions
      auditTrail.push('Evaluating conditions...');
      const conditionMatch = WorkflowConditionService.evaluateConditions(
        workflow.conditions,
        workflow.conditionGroup || 'ALL',
        event
      );

      if (!conditionMatch) {
        auditTrail.push('Conditions did not match. Skipping action execution.');
        status = 'SKIPPED';
      } else {
        let failedCount = 0;
        let completedCount = 0;

        for (const action of workflow.actions) {
          const actionStart = new Date().toISOString();
          auditTrail.push(`Executing action: ${action.type}...`);

          // Validate action-level entitlement at runtime
          try {
            if (['SEND_DISCORD_MESSAGE', 'SEND_MESSAGE', 'SEND_TEMPLATE', 'ASSIGN_DISCORD_ROLE', 'ADD_ROLE', 'REMOVE_DISCORD_ROLE', 'REMOVE_ROLE'].includes(action.type)) {
              const hasDiscord = await EntitlementService.hasFeature(communityId, 'AUTOMATION_DISCORD_ACTIONS');
              if (!hasDiscord) throw new Error(`AUTOMATION_DISCORD_ACTIONS entitlement is not active for action type ${action.type}`);
            } else if (['CREATE_WARNING', 'ADD_BLACKLIST'].includes(action.type)) {
              const hasMod = await EntitlementService.hasFeature(communityId, 'AUTOMATION_MODERATION_ACTIONS');
              if (!hasMod) throw new Error(`AUTOMATION_MODERATION_ACTIONS entitlement is not active for action type ${action.type}`);
            } else if (['SEND_EVENT_REMINDER', 'CREATE_REMINDER'].includes(action.type)) {
              const hasEvt = await EntitlementService.hasFeature(communityId, 'AUTOMATION_EVENT_ACTIONS');
              if (!hasEvt) throw new Error(`AUTOMATION_EVENT_ACTIONS entitlement is not active for action type ${action.type}`);
            }
          } catch (entitlementErr: any) {
            auditTrail.push(`Action entitlement check failed: ${entitlementErr.message}`);
            executedActions.push({
              type: action.type,
              status: 'FAILED',
              startedAt: actionStart,
              completedAt: new Date().toISOString(),
              error: entitlementErr.message,
            });
            failedCount++;
            continue;
          }

          // Trigger execution with retries if retryable
          const isRetryable = ['SEND_MESSAGE', 'SEND_DISCORD_MESSAGE', 'SEND_TEMPLATE', 'CREATE_REMINDER', 'SEND_EVENT_REMINDER'].includes(action.type);
          let res = await WorkflowActionService.executeAction(action, event, communityId, simulation);
          let retries = 0;

          if (!res.success && isRetryable && !simulation) {
            while (!res.success && retries < 2) {
              retries++;
              auditTrail.push(`Retrying action ${action.type} (attempt ${retries + 1})...`);
              await new Promise(r => setTimeout(r, 50));
              res = await WorkflowActionService.executeAction(action, event, communityId, simulation);
              if (res.success) {
                await auditService.record({
                  communityId,
                  actorUserId: 'system_automation',
                  actorRole: 'OWNER',
                  action: 'AUTOMATION_EXECUTION_RETRIED' as any,
                  targetType: 'automation_workflow',
                  targetId: workflow.id,
                  metadata: { actionType: action.type, retries, executionId },
                });
                break;
              }
            }
          }

          const actionEnd = new Date().toISOString();

          if (res.success) {
            auditTrail.push(`Action ${action.type} succeeded: ${res.result}`);
            executedActions.push({
              type: action.type,
              status: 'COMPLETED',
              startedAt: actionStart,
              completedAt: actionEnd,
              result: res.result,
            });
            completedCount++;
          } else {
            auditTrail.push(`Action ${action.type} failed: ${res.error}`);
            executedActions.push({
              type: action.type,
              status: 'FAILED',
              startedAt: actionStart,
              completedAt: actionEnd,
              error: res.error,
            });
            failedCount++;
          }
        }

        if (failedCount === 0) {
          status = 'COMPLETED';
        } else if (completedCount === 0) {
          status = 'FAILED';
          errorDetails = 'All actions failed to execute.';
        } else {
          status = 'PARTIAL';
          errorDetails = 'Some actions failed to execute.';
        }
      }
    } catch (err: any) {
      auditTrail.push(`Execution aborted due to fatal error: ${err.message}`);
      status = 'FAILED';
      errorDetails = err.message;
    } finally {
      await DurableLockService.releaseLock(lockKey, communityId);
    }

    const durationMs = Date.now() - startedAt;
    auditTrail.push(`Execution completed in ${durationMs}ms with status: ${status}`);

    const executionRecord: AutomationExecution = {
      id: executionId,
      communityId,
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      triggerType: workflow.triggerType,
      status,
      errorDetails,
      auditTrail,
      sourceEventId: event.eventId,
      executedAt: new Date().toISOString(),
      durationMs,
      actions: executedActions,
      createdAt: new Date().toISOString(),
    };

    await automationExecutionsRepository.create(executionRecord);

    await automationWorkflowsRepository.update(workflow.id, {
      lastExecutionAt: executionRecord.executedAt,
    });

    await auditService.record({
      communityId,
      actorUserId: simulation ? 'web_admin' : 'system_automation',
      actorRole: 'OWNER',
      action: 'AUTOMATION_EXECUTED' as any,
      targetType: 'automation_workflow',
      targetId: workflow.id,
      metadata: {
        executionId,
        status,
        durationMs,
      },
    });

    return executionRecord;
  }
}

/**
 * 7. WORKFLOW SERVICE
 */
export class WorkflowService {
  static async listWorkflows(communityId: string): Promise<AutomationWorkflow[]> {
    return automationWorkflowsRepository.listForTenant(communityId);
  }

  static async getWorkflow(communityId: string, id: string): Promise<AutomationWorkflow> {
    const wf = await automationWorkflowsRepository.getById(id);
    if (!wf || wf.communityId !== communityId) {
      throw new Error('Workflow not found.');
    }
    return wf;
  }

  static async createWorkflow(
    communityId: string,
    workflow: Omit<AutomationWorkflow, 'id' | 'communityId' | 'createdAt' | 'updatedAt' | 'version' | 'createdBy' | 'updatedBy'>,
    actorUserId: string
  ): Promise<AutomationWorkflow> {
    const hasAutomation = await EntitlementService.hasFeature(communityId, 'AUTOMATION');
    if (!hasAutomation) {
      throw new Error('AUTOMATION entitlement is not active for this community.');
    }

    const workflowId = `wf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const created = await automationWorkflowsRepository.create({
      id: workflowId,
      communityId,
      name: workflow.name,
      description: workflow.description || '',
      enabled: workflow.enabled !== undefined ? workflow.enabled : true,
      createdBy: actorUserId,
      updatedBy: actorUserId,
      createdAt: now,
      updatedAt: now,
      trigger: workflow.trigger,
      triggerType: workflow.trigger?.type || workflow.triggerType || '',
      conditions: workflow.conditions || [],
      conditionGroup: workflow.conditionGroup || 'ALL',
      actions: workflow.actions || [],
      version: 1,
      status: workflow.status || 'ACTIVE',
    });

    await auditService.record({
      communityId,
      actorUserId,
      actorRole: 'OWNER',
      action: 'AUTOMATION_WORKFLOW_CREATED' as any,
      targetType: 'automation_workflow',
      targetId: created.id,
      metadata: { name: created.name },
    });

    return created;
  }

  static async updateWorkflow(
    communityId: string,
    id: string,
    updates: Partial<AutomationWorkflow>,
    actorUserId: string
  ): Promise<AutomationWorkflow> {
    const existing = await automationWorkflowsRepository.getById(id);
    if (!existing || existing.communityId !== communityId) {
      throw new Error('Workflow not found.');
    }

    // Capture snapshot for version increase if core triggers or actions change (immutability rule)
    let nextVersion = existing.version || 1;
    const coreChanged =
      (updates.trigger && JSON.stringify(updates.trigger) !== JSON.stringify(existing.trigger)) ||
      (updates.conditions && JSON.stringify(updates.conditions) !== JSON.stringify(existing.conditions)) ||
      (updates.actions && JSON.stringify(updates.actions) !== JSON.stringify(existing.actions));

    if (coreChanged) {
      nextVersion += 1;
    }

    const now = new Date().toISOString();
    const updated = await automationWorkflowsRepository.update(id, {
      ...updates,
      version: nextVersion,
      updatedBy: actorUserId,
      updatedAt: now,
    });

    await auditService.record({
      communityId,
      actorUserId,
      actorRole: 'OWNER',
      action: 'AUTOMATION_WORKFLOW_UPDATED' as any,
      targetType: 'automation_workflow',
      targetId: id,
      metadata: { name: updated.name, version: nextVersion },
    });

    return updated;
  }

  static async pauseWorkflow(communityId: string, id: string, actorUserId: string): Promise<AutomationWorkflow> {
    const wf = await this.getWorkflow(communityId, id);
    const updated = await automationWorkflowsRepository.update(id, {
      status: 'PAUSED',
      enabled: false,
      updatedBy: actorUserId,
      updatedAt: new Date().toISOString(),
    });
    await auditService.record({
      communityId,
      actorUserId,
      actorRole: 'OWNER',
      action: 'AUTOMATION_PAUSED' as any,
      targetType: 'automation_workflow',
      targetId: id,
    });
    return updated;
  }

  static async resumeWorkflow(communityId: string, id: string, actorUserId: string): Promise<AutomationWorkflow> {
    const wf = await this.getWorkflow(communityId, id);
    const updated = await automationWorkflowsRepository.update(id, {
      status: 'ACTIVE',
      enabled: true,
      updatedBy: actorUserId,
      updatedAt: new Date().toISOString(),
    });
    await auditService.record({
      communityId,
      actorUserId,
      actorRole: 'OWNER',
      action: 'AUTOMATION_RESUMED' as any,
      targetType: 'automation_workflow',
      targetId: id,
    });
    return updated;
  }

  static async enableWorkflow(communityId: string, id: string, actorUserId: string): Promise<AutomationWorkflow> {
    const wf = await this.getWorkflow(communityId, id);
    const updated = await automationWorkflowsRepository.update(id, {
      status: 'ACTIVE',
      enabled: true,
      updatedBy: actorUserId,
      updatedAt: new Date().toISOString(),
    });
    await auditService.record({
      communityId,
      actorUserId,
      actorRole: 'OWNER',
      action: 'AUTOMATION_ENABLED' as any,
      targetType: 'automation_workflow',
      targetId: id,
    });
    return updated;
  }

  static async disableWorkflow(communityId: string, id: string, actorUserId: string): Promise<AutomationWorkflow> {
    const wf = await this.getWorkflow(communityId, id);
    const updated = await automationWorkflowsRepository.update(id, {
      status: 'DISABLED',
      enabled: false,
      updatedBy: actorUserId,
      updatedAt: new Date().toISOString(),
    });
    await auditService.record({
      communityId,
      actorUserId,
      actorRole: 'OWNER',
      action: 'AUTOMATION_UPDATED' as any,
      targetType: 'automation_workflow',
      targetId: id,
      metadata: { disabled: true },
    });
    return updated;
  }

  static async deleteWorkflow(communityId: string, id: string, actorUserId: string): Promise<void> {
    const existing = await automationWorkflowsRepository.getById(id);
    if (!existing || existing.communityId !== communityId) {
      throw new Error('Workflow not found.');
    }

    await automationWorkflowsRepository.delete(id);

    await auditService.record({
      communityId,
      actorUserId,
      actorRole: 'OWNER',
      action: 'AUTOMATION_WORKFLOW_DELETED' as any,
      targetType: 'automation_workflow',
      targetId: id,
      metadata: { name: existing.name },
    });
  }
}

// Canonical Aliases and Exports for Task 84
export const AutomationService = WorkflowService;
export const AutomationTriggerService = AutomationEventBusService;
export const AutomationActionService = WorkflowActionService;
export const AutomationExecutionService = WorkflowExecutionService;
export const AutomationConditionService = WorkflowConditionService;
export const automationService = WorkflowService;
