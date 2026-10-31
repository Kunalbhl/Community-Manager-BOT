import type { UserAuthContext, Permission } from '../../../shared/types/rbac.js';
import {
  AiPlannedAction,
  AiActionPlan,
  AiActionPreview,
  AiActionLifecycleStatus,
  AiModuleType,
  AiActionPreviewRequest,
  AiActionConfirmRequest,
  AiActionExecuteRequest,
  AiActionExecutionResponse,
} from '../../../shared/types/ai.js';
import { canAccessTenant, hasPermission } from '../../security/rbac.js';
import { ForbiddenError, BadRequestError, NotFoundError } from '../../utils/errors.js';
import { AiAuditService } from './aiAudit.service.js';
import {
  communitiesRepository,
  announcementsRepository,
  messageTemplatesRepository,
  eventsRepository,
  campaignsRepository,
  remindersRepository,
  automationWorkflowsRepository,
} from '../../repositories/index.js';
import { EntitlementService } from '../entitlement.service.js';
import { AiUsageService } from './aiUsage.service.js';
import { discordService } from '../../integrations/discord/discord.service.js';
import { discordPermissionEngineService } from '../discordPermissionEngine.service.js';
import { DurableLockService } from '../automation.service.js';
import { logger } from '../../logging/logger.js';

export interface ExecuteActionOptions {
  dryRun?: boolean;
}

export interface DryRunResult {
  success: boolean;
  dryRun: boolean;
  actionId?: string;
  planId?: string;
  message: string;
  details?: Record<string, unknown>;
}

// List of strictly blocked destructive actions
const BLOCKED_DESTRUCTIVE_ACTIONS = new Set<string>([
  'BAN',
  'BAN_MEMBER',
  'KICK',
  'KICK_MEMBER',
  'BLACKLIST',
  'BLACKLIST_MEMBER',
  'MASS_ROLE_REMOVAL',
  'CANCEL_EVENT',
  'EVENT_CANCELLATION',
  'DELETE_WORKFLOW',
  'WORKFLOW_DELETION',
  'CHANGE_OWNERSHIP',
  'SECURITY_CHANGES',
  'DELETE_COMMUNITY',
  'TRANSFER_GUILD',
  'PRUNE_MEMBERS',
]);

// Allowed safe non-destructive actions
const SAFE_NON_DESTRUCTIVE_ACTIONS = new Set<string>([
  'CREATE_ANNOUNCEMENT',
  'CREATE_MESSAGE_TEMPLATE',
  'CREATE_EVENT_DRAFT',
  'CREATE_CAMPAIGN_DRAFT',
  'CREATE_REMINDER',
  'CREATE_AUTOMATION_DRAFT',
]);

// In-memory action preview and execution state store with tenant isolation
const actionStore = new Map<string, AiActionPreview>();

export class AiActionExecutorService {
  /**
   * Clears the in-memory action store (primarily for test resets)
   */
  static clearStore(): void {
    actionStore.clear();
  }

  /**
   * Helper to normalize action names
   */
  private static normalizeActionType(actionType: string): string {
    return (actionType || '').trim().toUpperCase().replace(/[-\s]+/g, '_');
  }

  /**
   * Generate an Action Preview with full authorization, entitlement, safety, and Discord verification.
   * Sets lifecycle status to READY_FOR_CONFIRMATION or BLOCKED.
   */
  static async generatePreview(
    communityId: string,
    userContext: UserAuthContext,
    request: AiActionPreviewRequest,
    options?: { requestId?: string }
  ): Promise<AiActionPreview> {
    // 1. Tenant boundary enforcement
    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError(`Cross-tenant action execution prohibited for tenant ${communityId}`);
    }

    if (!request || !request.actionType) {
      throw new BadRequestError('Action type is required to generate preview');
    }

    const normalizedAction = this.normalizeActionType(request.actionType);
    const community = await communitiesRepository.getById(communityId);
    if (!community) {
      throw new NotFoundError(`Community ${communityId} not found`);
    }

    // Determine target module
    const targetModule: AiModuleType = (request.targetModule as AiModuleType) || 'COMMUNITY';

    // 2. Resolve required permission based on action and module
    let requiredPermission: Permission = 'community.manage';
    if (normalizedAction === 'CREATE_AUTOMATION_DRAFT' || targetModule === 'AUTOMATION') {
      requiredPermission = 'settings.manage';
    } else if (normalizedAction === 'CREATE_EVENT_DRAFT' || targetModule === 'EVENTS') {
      requiredPermission = 'community.manage';
    } else if (targetModule === 'MODERATION') {
      requiredPermission = 'community.manage';
    }

    const hasRbac = hasPermission(userContext, requiredPermission);

    // 3. Resolve Entitlement
    let featureKey = 'COMMUNITY';
    let featureName = 'Community Management';
    if (normalizedAction === 'CREATE_ANNOUNCEMENT') {
      featureKey = 'ANNOUNCEMENTS';
      featureName = 'Announcements Engine';
    } else if (normalizedAction === 'CREATE_MESSAGE_TEMPLATE') {
      featureKey = 'COMMUNITY';
      featureName = 'Message Templates';
    } else if (normalizedAction === 'CREATE_EVENT_DRAFT') {
      featureKey = 'EVENTS';
      featureName = 'Events Calendar';
    } else if (normalizedAction === 'CREATE_CAMPAIGN_DRAFT') {
      featureKey = 'CAMPAIGNS';
      featureName = 'Engagement Campaigns';
    } else if (normalizedAction === 'CREATE_REMINDER') {
      featureKey = 'REMINDERS';
      featureName = 'Scheduled Reminders';
    } else if (normalizedAction === 'CREATE_AUTOMATION_DRAFT') {
      featureKey = 'AUTOMATION';
      featureName = 'Automation Engine';
    }

    const isEntitled = await EntitlementService.hasFeature(communityId, featureKey);

    // 4. Resolve Discord Bot permissions and Diagnostics
    const botConnected = discordService.isConnected();
    let discordPermGranted = botConnected;
    const requiredDiscordPerms: string[] = ['View Channels', 'Send Messages'];
    let roleHierarchyValid = true;
    let discordDetails = botConnected ? 'Bot connected and functional' : 'Discord gateway disconnected';

    if (community.discordGuildId) {
      try {
        const diagnostics = await discordPermissionEngineService.getGuildDiagnostics(community.discordGuildId);
        roleHierarchyValid = diagnostics.roleHierarchyValid;
        if (!diagnostics.connected || !diagnostics.botInstalled) {
          discordPermGranted = false;
          discordDetails = String(diagnostics.details?.reason || 'Discord bot not installed or verified in guild');
        }
      } catch (err: any) {
        discordDetails = `Diagnostics check note: ${err.message}`;
      }
    }

    // 5. Evaluate Safety: Destructive vs Non-destructive
    const isDestructive = BLOCKED_DESTRUCTIVE_ACTIONS.has(normalizedAction);
    const isKnownSafe = SAFE_NON_DESTRUCTIVE_ACTIONS.has(normalizedAction);

    let safetyPassed = true;
    let blockedReason: string | undefined = undefined;
    const safetyNotes: string[] = [];

    if (isDestructive) {
      safetyPassed = false;
      blockedReason = `Destructive action [${normalizedAction}] blocked: AI is strictly prohibited from executing destructive operations (bans, kicks, blacklists, mass role removals, event cancellations, workflow deletions, or ownership changes).`;
      safetyNotes.push('Action violates AI Safety Policy on non-destructive constraints.');
    } else if (!isKnownSafe) {
      safetyPassed = false;
      blockedReason = `Unrecognized action type [${normalizedAction}]. Only vetted safe non-destructive actions are permitted.`;
      safetyNotes.push('Action not in vetted safe non-destructive allowlist.');
    }

    if (!hasRbac) {
      safetyNotes.push(`Current actor lacks required RBAC permission [${requiredPermission}].`);
    }
    if (!isEntitled) {
      safetyNotes.push(`Feature entitlement [${featureKey}] is not active for plan.`);
    }
    if (!botConnected) {
      safetyNotes.push('Discord gateway is currently offline.');
    }

    // Determine initial lifecycle status
    let lifecycleStatus: AiActionLifecycleStatus = 'READY_FOR_CONFIRMATION';
    if (!safetyPassed) {
      lifecycleStatus = 'BLOCKED';
    }

    // Build target entity descriptor
    const rawTarget =
      request.targetResource ||
      request.parameters?.targetChannel ||
      request.parameters?.channelId ||
      request.parameters?.title ||
      request.parameters?.name;
    const targetResourceDisplay = typeof rawTarget === 'string' ? rawTarget : `Community #${community.name}`;

    const actionId = `ai_act_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const confirmationToken = `conf_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
    const now = new Date().toISOString();

    const preview: AiActionPreview = {
      actionId,
      action: normalizedAction,
      actionType: normalizedAction,
      community: {
        id: communityId,
        name: community.name,
        guildId: community.discordGuildId,
      },
      target: {
        module: targetModule,
        entityType: (request.parameters?.entityType as any) || 'community',
        entityId: (request.parameters?.entityId as string) || undefined,
        entityName: targetResourceDisplay,
      },
      targetResource: targetResourceDisplay,
      exactChanges: request.parameters || {},
      requiredPermission,
      entitlement: {
        featureKey,
        featureName,
        active: isEntitled,
      },
      discordPermission: {
        required: requiredDiscordPerms,
        granted: discordPermGranted,
        botConnected,
        details: discordDetails,
        roleHierarchyValid,
      },
      safetyStatus: {
        isSafe: !isDestructive && isKnownSafe,
        isDestructive,
        blockedReason,
        passed: safetyPassed,
        safetyNotes,
      },
      lifecycleStatus,
      confirmationToken: lifecycleStatus === 'READY_FOR_CONFIRMATION' ? confirmationToken : undefined,
      requiresConfirmation: true,
      createdAt: now,
      updatedAt: now,
    };

    // Store in-memory registry
    actionStore.set(actionId, preview);

    // Audit logging
    if (lifecycleStatus === 'BLOCKED') {
      await AiAuditService.logActionBlocked({
        communityId,
        actorUserId: userContext.userId,
        actorRole: userContext.role,
        actionId,
        actionType: normalizedAction,
        reason: blockedReason || 'Action safety check failed',
        requestId: options?.requestId,
      });
    } else {
      await AiAuditService.logActionPreviewCreated({
        communityId,
        actorUserId: userContext.userId,
        actorRole: userContext.role,
        actionId,
        actionType: normalizedAction,
        targetResource: targetResourceDisplay,
        requiredPermission,
        requestId: options?.requestId,
      });
    }

    return preview;
  }

  /**
   * Retrieve an existing action preview
   */
  static async getAction(communityId: string, userContext: UserAuthContext, actionId: string): Promise<AiActionPreview> {
    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError(`Cross-tenant access prohibited for tenant ${communityId}`);
    }

    const action = actionStore.get(actionId);
    if (!action || action.community.id !== communityId) {
      throw new NotFoundError(`AI Action [${actionId}] not found in community ${communityId}`);
    }

    return action;
  }

  /**
   * Operator confirmation step: Transitions action from READY_FOR_CONFIRMATION -> CONFIRMED
   */
  static async confirmAction(
    communityId: string,
    userContext: UserAuthContext,
    request: AiActionConfirmRequest,
    options?: { requestId?: string }
  ): Promise<AiActionPreview> {
    // 1. Tenant boundary enforcement
    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError(`Cross-tenant action confirmation prohibited for tenant ${communityId}`);
    }

    const { actionId, confirmationToken, confirmed } = request;
    if (!actionId || !confirmationToken) {
      throw new BadRequestError('Both actionId and confirmationToken are required for confirmation');
    }

    const action = actionStore.get(actionId);
    if (!action || action.community.id !== communityId) {
      throw new NotFoundError(`Action ${actionId} not found in this community`);
    }

    if (action.lifecycleStatus !== 'READY_FOR_CONFIRMATION') {
      throw new BadRequestError(`Action cannot be confirmed. Current status: ${action.lifecycleStatus}`);
    }

    if (action.confirmationToken !== confirmationToken) {
      throw new BadRequestError('Invalid or mismatched confirmation token');
    }

    if (!confirmed) {
      throw new BadRequestError('Explicit confirmed: true flag is required to confirm action');
    }

    // Verify operator has permission to confirm
    if (!hasPermission(userContext, action.requiredPermission as Permission)) {
      await AiAuditService.logActionPermissionDenied({
        communityId,
        actorUserId: userContext.userId,
        actorRole: userContext.role,
        actionId,
        actionType: action.actionType,
        requiredPermission: action.requiredPermission,
        reason: 'Operator attempted confirmation without required RBAC permission',
        requestId: options?.requestId,
      });
      throw new ForbiddenError(`Operator lacks required permission [${action.requiredPermission}] to confirm action`);
    }

    const now = new Date().toISOString();
    action.lifecycleStatus = 'CONFIRMED';
    action.confirmedBy = {
      userId: userContext.userId,
      confirmedAt: now,
    };
    action.updatedAt = now;

    // Log confirmation audit
    await AiAuditService.logActionConfirmed({
      communityId,
      actorUserId: userContext.userId,
      actorRole: userContext.role,
      actionId,
      actionType: action.actionType,
      confirmedAt: now,
      requestId: options?.requestId,
    });

    return action;
  }

  /**
   * Live Safe Execution Step: Re-verifies all 8 criteria, enforces locking & idempotency,
   * executes non-destructive action, and logs audit events.
   */
  static async executeAction(
    communityId: string,
    userContext: UserAuthContext,
    request: AiActionExecuteRequest,
    options?: { requestId?: string }
  ): Promise<AiActionExecutionResponse> {
    // 1. Authenticated identity check
    if (!userContext || !userContext.userId) {
      throw new ForbiddenError('Authenticated identity required for action execution');
    }

    // 2. Tenant access check
    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError(`Cross-tenant action execution prohibited for tenant ${communityId}`);
    }

    const { actionId, confirmationToken, idempotencyKey } = request;
    if (!actionId || !confirmationToken) {
      throw new BadRequestError('ActionId and confirmationToken are required for execution');
    }

    const action = actionStore.get(actionId);
    if (!action || action.community.id !== communityId) {
      throw new NotFoundError(`Action ${actionId} not found in community ${communityId}`);
    }

    // Idempotency check: Return existing result if already COMPLETED
    if (action.lifecycleStatus === 'COMPLETED' && action.executionResult) {
      return {
        success: true,
        actionId,
        lifecycleStatus: 'COMPLETED',
        result: {
          resourceId: action.executionResult.resourceId,
          resourceType: action.executionResult.resourceType,
          details: action.executionResult.details,
        },
        executedAt: action.executionResult.executedAt,
      };
    }

    // 3. Concurrency Protection via DurableLockService
    const lockId = `ai_action_lock_${actionId}`;
    const acquired = await DurableLockService.acquireLock(lockId, communityId, 30);
    if (!acquired) {
      throw new BadRequestError('Concurrent execution detected: An execution is already in progress for this action.');
    }

    try {
      // 4. Require explicit confirmation
      if (action.lifecycleStatus !== 'CONFIRMED') {
        throw new BadRequestError(
          `Confirmation is missing or invalid. Current action status: ${action.lifecycleStatus}. Human confirmation is strictly required.`
        );
      }

      if (action.confirmationToken !== confirmationToken) {
        throw new BadRequestError('Confirmation token mismatch. Execution rejected.');
      }

      // 5. Server-side re-check: RBAC Permission
      if (!hasPermission(userContext, action.requiredPermission as Permission)) {
        action.lifecycleStatus = 'BLOCKED';
        await AiAuditService.logActionPermissionDenied({
          communityId,
          actorUserId: userContext.userId,
          actorRole: userContext.role,
          actionId,
          actionType: action.actionType,
          requiredPermission: action.requiredPermission,
          reason: 'Permission revoked or missing at execution time',
          requestId: options?.requestId,
        });
        throw new ForbiddenError(
          `Pre-execution permission re-check failed: Operator missing [${action.requiredPermission}]`
        );
      }

      // 6. Server-side re-check: Entitlement
      const hasEntitlement = await EntitlementService.hasFeature(communityId, action.entitlement.featureKey);
      if (!hasEntitlement) {
        action.lifecycleStatus = 'BLOCKED';
        await AiAuditService.logActionBlocked({
          communityId,
          actorUserId: userContext.userId,
          actorRole: userContext.role,
          actionId,
          actionType: action.actionType,
          reason: `Feature entitlement [${action.entitlement.featureKey}] is not active at execution time`,
          requestId: options?.requestId,
        });
        throw new ForbiddenError(`Entitlement inactive for feature [${action.entitlement.featureKey}]`);
      }

      // 7. Server-side re-check: Discord Bot Connection & Permissions
      const requiresLiveDiscord =
        action.actionType === 'SEND_DIRECT_MESSAGE' ||
        action.actionType === 'PUBLISH_LIVE_ANNOUNCEMENT' ||
        action.actionType === 'SYNC_DISCORD_ROLES';
      if (requiresLiveDiscord && !discordService.isConnected()) {
        action.lifecycleStatus = 'FAILED';
        await AiAuditService.logActionFailed({
          communityId,
          actorUserId: userContext.userId,
          actorRole: userContext.role,
          actionId,
          actionType: action.actionType,
          error: 'Discord gateway is unavailable at execution time',
          reason: 'DISCORD_UNAVAILABLE',
          requestId: options?.requestId,
        });
        throw new BadRequestError('Discord service is currently unavailable. Action execution aborted for safety.');
      }

      // 8. Server-side re-check: Safety & Guild Ownership protection
      if (BLOCKED_DESTRUCTIVE_ACTIONS.has(action.actionType)) {
        action.lifecycleStatus = 'BLOCKED';
        await AiAuditService.logActionBlocked({
          communityId,
          actorUserId: userContext.userId,
          actorRole: userContext.role,
          actionId,
          actionType: action.actionType,
          reason: 'Destructive action blocked during execution safety guard',
          requestId: options?.requestId,
        });
        throw new ForbiddenError('Execution blocked: Destructive action prohibited.');
      }

      // 8.1 Server-side re-check: AI Usage & Action Execution Quotas (Task 21.7)
      const executionAllowance = await AiUsageService.checkAllowance(communityId, 'ACTION_EXECUTION', {
        userContext,
        requestId: options?.requestId,
        idempotencyKey,
      });

      if (!executionAllowance.allowed) {
        action.lifecycleStatus = 'BLOCKED';
        await AiAuditService.logActionBlocked({
          communityId,
          actorUserId: userContext.userId,
          actorRole: userContext.role,
          actionId,
          actionType: action.actionType,
          reason: executionAllowance.reason || 'Daily action execution quota reached',
          requestId: options?.requestId,
        });
        throw new BadRequestError(executionAllowance.reason || 'Daily action execution quota reached.');
      }

      // Transition to EXECUTING
      action.lifecycleStatus = 'EXECUTING';
      action.idempotencyKey = idempotencyKey;
      action.updatedAt = new Date().toISOString();

      let createdResourceId: string = '';
      let resourceType: string = '';
      const resultDetails: Record<string, unknown> = {};

      // Execute specific non-destructive action safely
      switch (action.actionType) {
        case 'CREATE_ANNOUNCEMENT': {
          resourceType = 'ANNOUNCEMENT';
          const title = (action.exactChanges.title as string) || 'Community Announcement';
          const content =
            (action.exactChanges.content as string) ||
            (action.exactChanges.message as string) ||
            'Important community update.';
          const targetChannelId =
            (action.exactChanges.targetChannelId as string) ||
            (action.exactChanges.channelId as string) ||
            'announcements';

          const announcement = await announcementsRepository.create({
            id: `ann_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            communityId,
            title,
            content,
            channelId: targetChannelId,
            status: 'DRAFT',
            scheduledAt: (action.exactChanges.scheduledAt as string) || (action.exactChanges.scheduledFor as string) || undefined,
            createdBy: userContext.userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          createdResourceId = announcement.id;
          resultDetails.title = announcement.title;
          resultDetails.channel = targetChannelId;
          break;
        }

        case 'CREATE_MESSAGE_TEMPLATE': {
          resourceType = 'MESSAGE_TEMPLATE';
          const name =
            (action.exactChanges.name as string) ||
            (action.exactChanges.title as string) ||
            'AI Community Welcome Template';
          const content =
            (action.exactChanges.content as string) ||
            (action.exactChanges.message as string) ||
            'Welcome {{applicantName}} to {{communityName}}!';

          const template = await messageTemplatesRepository.create({
            id: `tmpl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            communityId,
            name,
            content,
            variables: (action.exactChanges.variables as string[]) || ['applicantName', 'communityName'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          createdResourceId = template.id;
          resultDetails.name = template.name;
          break;
        }

        case 'CREATE_EVENT_DRAFT': {
          resourceType = 'EVENT';
          const title = (action.exactChanges.title as string) || 'Community Strategy Session';
          const description =
            (action.exactChanges.description as string) || 'AI-recommended event draft to improve member engagement.';
          const startAt =
            (action.exactChanges.startAt as string) || new Date(Date.now() + 86400000).toISOString();
          const endAt =
            (action.exactChanges.endAt as string) || new Date(Date.now() + 90000000).toISOString();

          const event = await eventsRepository.create({
            id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            communityId,
            title,
            description,
            startAt,
            endAt,
            timezone: (action.exactChanges.timezone as string) || 'UTC',
            organizer: userContext.userId,
            createdBy: userContext.userId,
            channelId: (action.exactChanges.channelId as string) || undefined,
            capacity: (action.exactChanges.capacity as number) || 50,
            maxParticipants: (action.exactChanges.capacity as number) || 50,
            registrationEnabled: true,
            status: 'DRAFT',
            visibility: 'COMMUNITY',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          createdResourceId = event.id;
          resultDetails.title = event.title;
          resultDetails.startAt = event.startAt;
          break;
        }

        case 'CREATE_CAMPAIGN_DRAFT': {
          resourceType = 'CAMPAIGN';
          const name =
            (action.exactChanges.name as string) ||
            (action.exactChanges.title as string) ||
            'Community Re-engagement Campaign';
          const message =
            (action.exactChanges.message as string) ||
            (action.exactChanges.content as string) ||
            'Hello! We noticed you haven’t visited in a while. Check out our upcoming events!';

          const rawAudience = (action.exactChanges.targetAudience as any);
          const audience: 'ALL' | 'MEMBERS' | 'RECRUITERS' | 'APPLICANTS' =
            rawAudience === 'ALL' || rawAudience === 'RECRUITERS' || rawAudience === 'APPLICANTS'
              ? rawAudience
              : 'MEMBERS';

          const campaign = await campaignsRepository.create({
            id: `cmp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            communityId,
            name,
            message,
            targetAudience: audience,
            status: 'DRAFT',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          createdResourceId = campaign.id;
          resultDetails.name = campaign.name;
          break;
        }

        case 'CREATE_REMINDER': {
          resourceType = 'REMINDER';
          const message =
            (action.exactChanges.message as string) ||
            (action.exactChanges.content as string) ||
            'Reminder: The upcoming event is starting soon!';
          const triggerAt =
            (action.exactChanges.triggerAt as string) ||
            (action.exactChanges.scheduledAt as string) ||
            new Date(Date.now() + 3600000).toISOString();
          const targetUser =
            (action.exactChanges.targetUser as string) ||
            (action.exactChanges.targetUserId as string) ||
            userContext.userId;

          const reminder = await remindersRepository.create({
            id: `rem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            communityId,
            message,
            triggerAt,
            targetUser,
            status: 'PENDING',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          createdResourceId = reminder.id;
          resultDetails.message = reminder.message;
          resultDetails.triggerAt = reminder.triggerAt;
          break;
        }

        case 'CREATE_AUTOMATION_DRAFT': {
          resourceType = 'AUTOMATION_WORKFLOW';
          const name =
            (action.exactChanges.name as string) ||
            (action.exactChanges.title as string) ||
            'New Member Welcome Automation';
          const description =
            (action.exactChanges.description as string) || 'Draft automation created via AI Action Planner';

          const workflow = await automationWorkflowsRepository.create({
            id: `wf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            communityId,
            name,
            description,
            enabled: false,
            status: 'DRAFT',
            triggerType: (action.exactChanges.triggerType as string) || 'APPLICATION_SUBMITTED',
            trigger: (action.exactChanges.trigger as any) || { type: 'APPLICATION_SUBMITTED' },
            conditions: (action.exactChanges.conditions as any[]) || [],
            conditionGroup: 'ALL',
            actions: (action.exactChanges.actions as any[]) || [],
            version: 1,
            createdBy: userContext.userId,
            updatedBy: userContext.userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          createdResourceId = workflow.id;
          resultDetails.name = workflow.name;
          break;
        }

        default:
          throw new BadRequestError(`Unsupported action type for execution: ${action.actionType}`);
      }

      const executedAt = new Date().toISOString();
      action.lifecycleStatus = 'COMPLETED';
      action.executionResult = {
        success: true,
        executedAt,
        resourceId: createdResourceId,
        resourceType,
        details: resultDetails,
      };
      action.updatedAt = executedAt;

      // Log successful execution audit
      await AiAuditService.logActionExecuted({
        communityId,
        actorUserId: userContext.userId,
        actorRole: userContext.role,
        actionId,
        actionType: action.actionType,
        resourceId: createdResourceId,
        resourceType,
        details: resultDetails,
        requestId: options?.requestId,
      });

      // Record usage in Centralized AI Usage Service
      await AiUsageService.recordUsage({
        communityId,
        actorUserId: userContext.userId,
        actorRole: userContext.role,
        capability: 'ACTION_EXECUTION',
        success: true,
        actionExecutions: 1,
        requestId: options?.requestId,
        idempotencyKey,
      });

      return {
        success: true,
        actionId,
        lifecycleStatus: 'COMPLETED',
        result: {
          resourceId: createdResourceId,
          resourceType,
          details: resultDetails,
        },
        executedAt,
      };
    } catch (err: any) {
      AiUsageService.releaseSlot(communityId);
      action.lifecycleStatus = 'FAILED';
      action.executionResult = {
        success: false,
        executedAt: new Date().toISOString(),
        error: err.message,
      };
      action.updatedAt = new Date().toISOString();

      await AiAuditService.logActionFailed({
        communityId,
        actorUserId: userContext.userId,
        actorRole: userContext.role,
        actionId,
        actionType: action.actionType,
        error: err.message,
        reason: 'EXECUTION_EXCEPTION',
        requestId: options?.requestId,
      });

      throw err;
    } finally {
      // Always release distributed lock
      await DurableLockService.releaseLock(lockId, communityId);
    }
  }

  /**
   * Validates and performs dry-run verification of a planned AI action or structured AiActionPlan.
   * Kept for backward-compatibility with Task 21.3 callers.
   */
  static async validateAndDryRun(
    communityId: string,
    userContext: UserAuthContext,
    target: (
      | AiPlannedAction
      | AiActionPlan
      | { actionId?: string; id?: string; module?: string; affectedModule?: string; [key: string]: any }
    ),
    options?: ExecuteActionOptions
  ): Promise<DryRunResult> {
    // 1. Tenant boundary enforcement
    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError(`Cross-tenant action execution prohibited for tenant ${communityId}`);
    }

    if (!target) {
      throw new BadRequestError('Action payload or plan required');
    }

    // Determine target module
    const targetModule =
      (target as AiPlannedAction).module ||
      (target as AiActionPlan).affectedModule ||
      (target as any).targetModule ||
      'COMMUNITY';

    // 2. Permission verification based on module
    let requiredPermission: Permission = 'community.manage';
    if (targetModule === 'ENGAGEMENT') requiredPermission = 'community.manage';
    if (targetModule === 'EVENTS') requiredPermission = 'community.manage';
    if (targetModule === 'MODERATION') requiredPermission = 'community.manage';
    if (targetModule === 'AUTOMATION') requiredPermission = 'settings.manage';
    if (targetModule === 'RECRUITMENT') requiredPermission = 'community.manage';

    if (!hasPermission(userContext, requiredPermission)) {
      throw new ForbiddenError(`Missing required permission: ${requiredPermission}`);
    }

    const id = target.id || (target as any).actionId || 'plan_draft';

    // 3. Log audit event
    await AiAuditService.logActionPlanned({
      communityId,
      actorUserId: userContext.userId,
      actorRole: userContext.role,
      actionType: (target as any).actionType || 'VALIDATE_ACTION_PLAN',
      actionId: id,
      module: targetModule as any,
    });

    return {
      success: true,
      dryRun: true,
      actionId: id,
      planId: (target as any).associatedRecommendationId ? id : undefined,
      message: `Action/Plan [${(target as any).title || (target as any).goal || id}] validated successfully in dry-run mode.`,
      details: {
        tenantId: communityId,
        module: targetModule,
        status: 'DRY_RUN_PASSED',
        verifiedPermissions: [requiredPermission],
        timestamp: new Date().toISOString(),
      },
    };
  }
}
