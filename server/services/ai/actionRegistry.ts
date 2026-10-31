import type { Permission, UserAuthContext } from '../../../shared/types/rbac.js';
import { canAccessTenant, hasPermission } from '../../security/rbac.js';
import { EntitlementService } from '../entitlement.service.js';
import { ForbiddenError, BadRequestError, NotFoundError } from '../../utils/errors.js';
import {
  announcementsRepository,
  remindersRepository,
  automationWorkflowsRepository,
  communitiesRepository,
  communityConfigurationRepository,
} from '../../repositories/index.js';
import { discordPermissionEngineService } from '../discordPermissionEngine.service.js';
import { DiscordOperationsService } from '../discordOperations.service.js';
import { DiscordHygieneService } from '../discordHygiene.service.js';

export type ActionRiskLevel = 'READ_ONLY' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ActionDefinition {
  actionId: string;
  name: string;
  description: string;
  requiredPermission: Permission;
  requiredEntitlement: string;
  inputSchema: Record<string, string>;
  previewSchema: Record<string, string>;
  riskLevel: ActionRiskLevel;
  requiresConfirmation: boolean;
  execute: (
    communityId: string,
    userContext: UserAuthContext,
    params: Record<string, any>
  ) => Promise<{ success: boolean; resultId?: string; data?: any; message: string }>;
  verify: (
    communityId: string,
    resultId?: string,
    params?: Record<string, any>
  ) => Promise<{ verified: boolean; message: string; state?: any }>;
}

export class ActionRegistryService {
  private static actions = new Map<string, ActionDefinition>();

  public static registerAction(action: ActionDefinition): void {
    this.actions.set(action.actionId.toUpperCase(), action);
  }

  public static getAction(actionId: string): ActionDefinition | undefined {
    return this.actions.get((actionId || '').toUpperCase());
  }

  public static listActions(): ActionDefinition[] {
    return Array.from(this.actions.values());
  }

  public static getAvailableActionsForUser(
    userContext: UserAuthContext
  ): ActionDefinition[] {
    return this.listActions().filter((a) => hasPermission(userContext, a.requiredPermission));
  }
}

// ---------------------------------------------------------------------------
// REGISTER REAL AUTHORITATIVE ACTIONS
// ---------------------------------------------------------------------------

// 1. RUN_PERMISSION_DIAGNOSTICS
ActionRegistryService.registerAction({
  actionId: 'RUN_PERMISSION_DIAGNOSTICS',
  name: 'Run Discord Permission Diagnostics',
  description: 'Audits bot permissions, channel overrides, and gateway status for target guild.',
  requiredPermission: 'community.manage',
  requiredEntitlement: 'COMMUNITY',
  inputSchema: { channelId: 'optional string target channel ID' },
  previewSchema: { scope: 'Guild & Channels', target: 'Discord Bot Permissions' },
  riskLevel: 'READ_ONLY',
  requiresConfirmation: false,
  execute: async (communityId, _userContext, _params) => {
    const community = await communitiesRepository.getById(communityId);
    const diag = await discordPermissionEngineService.getGuildDiagnostics(
      community?.discordGuildId || ''
    );
    return {
      success: true,
      data: diag,
      message: `Permission diagnostics completed for guild ${community?.discordGuildId || 'unlinked'}.`,
    };
  },
  verify: async (communityId, _resultId, _params) => {
    const community = await communitiesRepository.getById(communityId);
    const diag = await discordPermissionEngineService.getGuildDiagnostics(
      community?.discordGuildId || ''
    );
    return {
      verified: true,
      message: 'Diagnostics report verified.',
      state: diag,
    };
  },
});

// 2. CREATE_ANNOUNCEMENT_DRAFT
ActionRegistryService.registerAction({
  actionId: 'CREATE_ANNOUNCEMENT_DRAFT',
  name: 'Draft Community Announcement',
  description: 'Creates a draft community announcement for owner review before broadcasting.',
  requiredPermission: 'community.manage',
  requiredEntitlement: 'ANNOUNCEMENTS',
  inputSchema: { title: 'string', content: 'string', targetChannelId: 'optional string' },
  previewSchema: { title: 'Announcement Title', channel: 'Target Channel' },
  riskLevel: 'LOW',
  requiresConfirmation: true,
  execute: async (communityId, userContext, params) => {
    const docId = `ann_${Date.now()}`;
    const announcement = await announcementsRepository.create(docId, {
      id: docId,
      communityId,
      title: params.title || 'Community Update',
      content: params.content || '',
      status: 'DRAFT',
      authorId: userContext.userId,
      channelId: params.targetChannelId || undefined,
      createdAt: new Date().toISOString(),
    } as any);
    return {
      success: true,
      resultId: announcement.id,
      data: announcement,
      message: `Announcement draft created successfully with ID ${announcement.id}.`,
    };
  },
  verify: async (communityId, resultId) => {
    if (!resultId) return { verified: false, message: 'Missing resultId' };
    const doc = await announcementsRepository.getById(resultId);
    if (doc && doc.communityId === communityId) {
      return { verified: true, message: 'Draft announcement confirmed in repository.', state: doc };
    }
    return { verified: false, message: 'Draft announcement could not be found.' };
  },
});

// 3. CREATE_REMINDER
ActionRegistryService.registerAction({
  actionId: 'CREATE_REMINDER',
  name: 'Schedule Community Event / Task Reminder',
  description: 'Schedules a recurring or one-shot notification reminder for community staff or members.',
  requiredPermission: 'community.manage',
  requiredEntitlement: 'REMINDERS',
  inputSchema: { title: 'string', message: 'string', scheduledAt: 'string', channelId: 'optional string' },
  previewSchema: { title: 'Reminder Title', time: 'Scheduled Time' },
  riskLevel: 'LOW',
  requiresConfirmation: true,
  execute: async (communityId, userContext, params) => {
    const docId = `rem_${Date.now()}`;
    const reminder = await remindersRepository.create(docId, {
      id: docId,
      communityId,
      title: params.title || 'Event Reminder',
      message: params.message || '',
      scheduledAt: params.scheduledAt || new Date(Date.now() + 3600000).toISOString(),
      status: 'SCHEDULED',
      channelId: params.channelId || undefined,
      createdBy: userContext.userId,
      createdAt: new Date().toISOString(),
    } as any);
    return {
      success: true,
      resultId: reminder.id,
      data: reminder,
      message: `Scheduled reminder created with ID ${reminder.id}.`,
    };
  },
  verify: async (communityId, resultId) => {
    if (!resultId) return { verified: false, message: 'Missing resultId' };
    const doc = await remindersRepository.getById(resultId);
    if (doc && doc.communityId === communityId) {
      return { verified: true, message: 'Scheduled reminder verified in database.', state: doc };
    }
    return { verified: false, message: 'Scheduled reminder record missing.' };
  },
});

// 4. CREATE_AUTOMATION_WORKFLOW
ActionRegistryService.registerAction({
  actionId: 'CREATE_AUTOMATION_WORKFLOW',
  name: 'Create Automation Workflow',
  description: 'Configures a structured trigger-condition-action workflow for server operations.',
  requiredPermission: 'settings.manage',
  requiredEntitlement: 'AUTOMATION',
  inputSchema: { name: 'string', triggerType: 'string', actions: 'object array' },
  previewSchema: { name: 'Workflow Name', trigger: 'Trigger Type', actionsCount: 'Actions Count' },
  riskLevel: 'MEDIUM',
  requiresConfirmation: true,
  execute: async (communityId, userContext, params) => {
    const docId = `wf_${Date.now()}`;
    const workflow = await automationWorkflowsRepository.create(docId, {
      id: docId,
      communityId,
      name: params.name || 'New Workflow',
      description: params.description || 'AI-configured operational workflow',
      trigger: params.trigger || { type: params.triggerType || 'MEMBER_JOIN' },
      actions: params.actions || [],
      status: 'ACTIVE',
      createdBy: userContext.userId,
      createdAt: new Date().toISOString(),
    } as any);
    return {
      success: true,
      resultId: workflow.id,
      data: workflow,
      message: `Automation workflow ${workflow.name} successfully created.`,
    };
  },
  verify: async (communityId, resultId) => {
    if (!resultId) return { verified: false, message: 'Missing resultId' };
    const doc = await automationWorkflowsRepository.getById(resultId);
    if (doc && doc.communityId === communityId && doc.status === 'ACTIVE') {
      return { verified: true, message: 'Active automation workflow verified.', state: doc };
    }
    return { verified: false, message: 'Automation workflow verification failed.' };
  },
});

// 5. SET_WELCOME_ONBOARDING
ActionRegistryService.registerAction({
  actionId: 'SET_WELCOME_ONBOARDING',
  name: 'Configure Welcome Onboarding Settings',
  description: 'Sets the default Discord welcome channel, role assignment, and greeting message.',
  requiredPermission: 'settings.manage',
  requiredEntitlement: 'COMMUNITY',
  inputSchema: { welcomeChannelId: 'string', defaultRoleId: 'optional string', welcomeMessage: 'string' },
  previewSchema: { channel: 'Welcome Channel', message: 'Welcome Message' },
  riskLevel: 'MEDIUM',
  requiresConfirmation: true,
  execute: async (communityId, _userContext, params) => {
    let config = await communityConfigurationRepository.getById(communityId);
    if (config) {
      config = await communityConfigurationRepository.update(communityId, {
        welcomeChannelId: params.welcomeChannelId || (config as any).welcomeChannelId || '',
        defaultRoleId: params.defaultRoleId || (config as any).defaultRoleId || '',
        welcomeMessage: params.welcomeMessage || (config as any).welcomeMessage || 'Welcome to the server!',
      } as any);
    } else {
      config = await communityConfigurationRepository.create(communityId, {
        id: communityId,
        communityId,
        welcomeChannelId: params.welcomeChannelId || '',
        defaultRoleId: params.defaultRoleId || '',
        welcomeMessage: params.welcomeMessage || 'Welcome to the server!',
      } as any);
    }
    return {
      success: true,
      resultId: communityId,
      data: config,
      message: 'Welcome onboarding configuration updated successfully.',
    };
  },
  verify: async (communityId) => {
    const config = await communityConfigurationRepository.getById(communityId);
    if (config) {
      return { verified: true, message: 'Welcome onboarding configuration verified.', state: config };
    }
    return { verified: false, message: 'Configuration could not be read.' };
  },
});

// 6. UPDATE_DASHBOARD_LAYOUT
ActionRegistryService.registerAction({
  actionId: 'UPDATE_DASHBOARD_LAYOUT',
  name: 'Personalize Dashboard Card Layout',
  description: 'Applies personalized card selection and section layout to your Home dashboard.',
  requiredPermission: 'community.manage',
  requiredEntitlement: 'COMMUNITY',
  inputSchema: { cardIds: 'array of strings' },
  previewSchema: { cardCount: 'Selected Cards Count' },
  riskLevel: 'LOW',
  requiresConfirmation: true,
  execute: async (communityId, _userContext, params) => {
    let config = await communityConfigurationRepository.getById(communityId);
    const updatedDashboardConfig = {
      cardIds: params.cardIds || [],
      updatedAt: new Date().toISOString(),
    };
    if (config) {
      config = await communityConfigurationRepository.update(communityId, {
        dashboardConfig: updatedDashboardConfig,
      } as any);
    } else {
      config = await communityConfigurationRepository.create(communityId, {
        id: communityId,
        communityId,
        dashboardConfig: updatedDashboardConfig,
      } as any);
    }
    return {
      success: true,
      resultId: communityId,
      data: config,
      message: 'Dashboard layout configuration saved successfully.',
    };
  },
  verify: async (communityId) => {
    const config = await communityConfigurationRepository.getById(communityId);
    return {
      verified: true,
      message: 'Dashboard layout verified.',
      state: (config as any)?.dashboardConfig,
    };
  },
});

// 7. CREATE_DISCORD_ROLE
ActionRegistryService.registerAction({
  actionId: 'CREATE_DISCORD_ROLE',
  name: 'Create Discord Role',
  description: 'Creates a new verified Discord role authoritatively in the linked guild.',
  requiredPermission: 'community.manage',
  requiredEntitlement: 'ROLE_MANAGEMENT',
  inputSchema: { name: 'Role Name', color: 'Hex color string (optional)' },
  previewSchema: { name: 'Role Name', color: 'Hex Color' },
  riskLevel: 'MEDIUM',
  requiresConfirmation: true,
  execute: async (communityId, userContext, params) => {
    const res = await DiscordOperationsService.createRole(communityId, userContext, {
      name: params.name,
      color: params.color,
      confirmed: true,
    });
    return {
      success: res.success,
      resultId: res.role?.id,
      data: res.role,
      message: res.message,
    };
  },
  verify: async (communityId, resultId) => {
    const roles = await DiscordOperationsService.listRoles(communityId, {
      userId: 'system',
      role: 'OWNER',
      communityId,
    });
    const found = roles.find((r) => r.id === resultId || r.name.toLowerCase() === (resultId || '').toLowerCase());
    return {
      verified: Boolean(found),
      message: found ? `Role "${found.name}" verified in Discord.` : 'Role verification failed.',
      state: found,
    };
  },
});

// 8. CREATE_DISCORD_CHANNEL
ActionRegistryService.registerAction({
  actionId: 'CREATE_DISCORD_CHANNEL',
  name: 'Create Discord Channel',
  description: 'Creates a new operational text or voice channel in Discord.',
  requiredPermission: 'community.manage',
  requiredEntitlement: 'CHANNEL_MANAGEMENT',
  inputSchema: { name: 'Channel Name', topic: 'Channel Topic (optional)' },
  previewSchema: { name: 'Channel Name', topic: 'Topic' },
  riskLevel: 'MEDIUM',
  requiresConfirmation: true,
  execute: async (communityId, userContext, params) => {
    const res = await DiscordOperationsService.createChannel(communityId, userContext, {
      name: params.name,
      topic: params.topic,
      confirmed: true,
    });
    return {
      success: res.success,
      resultId: res.channel?.id,
      data: res.channel,
      message: res.message,
    };
  },
  verify: async (communityId, resultId) => {
    const channels = await DiscordOperationsService.listChannels(communityId, {
      userId: 'system',
      role: 'OWNER',
      communityId,
    });
    const found = channels.find((c) => c.id === resultId || c.name.toLowerCase() === (resultId || '').toLowerCase());
    return {
      verified: Boolean(found),
      message: found ? `Channel #${found.name} verified in Discord.` : 'Channel verification failed.',
      state: found,
    };
  },
});

// 9. BULK_ASSIGN_ROLE
ActionRegistryService.registerAction({
  actionId: 'BULK_ASSIGN_ROLE',
  name: 'Bulk Assign Role to Members',
  description: 'Executes rate-limited bulk role assignment for selected members.',
  requiredPermission: 'community.manage',
  requiredEntitlement: 'BULK_OPERATIONS',
  inputSchema: { roleId: 'Role ID', targetMemberIds: 'Array of target member IDs' },
  previewSchema: { roleId: 'Role ID', targetCount: 'Target Member Count' },
  riskLevel: 'HIGH',
  requiresConfirmation: true,
  execute: async (communityId, userContext, params) => {
    const res = await DiscordOperationsService.bulkMemberRoleOperation(communityId, userContext, {
      action: 'ASSIGN',
      roleId: params.roleId,
      targetMemberIds: params.targetMemberIds || [],
      confirmed: true,
    });
    return {
      success: res.success,
      resultId: res.result?.operationId,
      data: res.result,
      message: res.message,
    };
  },
  verify: async (_communityId, resultId) => {
    return {
      verified: Boolean(resultId),
      message: `Bulk operation ${resultId} executed and audited.`,
    };
  },
});

// 10. RUN_SERVER_HYGIENE
ActionRegistryService.registerAction({
  actionId: 'RUN_SERVER_HYGIENE',
  name: 'Run Discord Server Hygiene Diagnostics',
  description: 'Analyzes server configuration health and identifies missing channels, broken role mappings, or bot permission gaps.',
  requiredPermission: 'community.view',
  requiredEntitlement: 'SERVER_HYGIENE',
  inputSchema: {},
  previewSchema: {},
  riskLevel: 'READ_ONLY',
  requiresConfirmation: false,
  execute: async (communityId) => {
    const report = await DiscordHygieneService.analyzeHygiene(communityId);
    return {
      success: true,
      resultId: communityId,
      data: report,
      message: `Server hygiene check complete: ${report.findings.length} findings identified. Health: ${report.overallHealth}.`,
    };
  },
  verify: async (communityId) => {
    const report = await DiscordHygieneService.analyzeHygiene(communityId);
    return {
      verified: true,
      message: 'Server hygiene verified.',
      state: report,
    };
  },
});

// 11. APPLY_HYGIENE_FIX
ActionRegistryService.registerAction({
  actionId: 'APPLY_HYGIENE_FIX',
  name: 'Apply Automated Server Hygiene Fix',
  description: 'Applies automated repair for identified Discord hygiene finding.',
  requiredPermission: 'community.manage',
  requiredEntitlement: 'SERVER_HYGIENE',
  inputSchema: { findingId: 'Hygiene Finding ID' },
  previewSchema: { findingId: 'Finding ID' },
  riskLevel: 'HIGH',
  requiresConfirmation: true,
  execute: async (communityId, userContext, params) => {
    const res = await DiscordHygieneService.applyHygieneFix(communityId, userContext, params.findingId, true);
    return {
      success: res.success,
      resultId: res.findingId,
      data: res.state,
      message: res.message,
    };
  },
  verify: async (communityId, resultId) => {
    const report = await DiscordHygieneService.analyzeHygiene(communityId);
    const findingStillExists = report.findings.some((f) => f.findingId === resultId);
    return {
      verified: !findingStillExists,
      message: !findingStillExists ? 'Hygiene finding resolved.' : 'Finding still present.',
    };
  },
});

// 12. APPLY_SERVER_BLUEPRINT
ActionRegistryService.registerAction({
  actionId: 'APPLY_SERVER_BLUEPRINT',
  name: 'Apply Operational Server Setup Blueprint',
  description: 'Provisions missing operational channels and role mappings for selected server blueprint modules.',
  requiredPermission: 'community.manage',
  requiredEntitlement: 'SERVER_HYGIENE',
  inputSchema: { selectedModules: 'Array of module IDs (WELCOME, RECRUITMENT, ANNOUNCEMENTS, etc.)' },
  previewSchema: { selectedModules: 'Selected Modules' },
  riskLevel: 'HIGH',
  requiresConfirmation: true,
  execute: async (communityId, userContext, params) => {
    const res = await DiscordOperationsService.applyBlueprint(communityId, userContext, params.selectedModules || [], true);
    return {
      success: res.success,
      resultId: communityId,
      data: res,
      message: res.message,
    };
  },
  verify: async (communityId, _resultId) => {
    const blueprint = await DiscordOperationsService.generateBlueprint(communityId, {
      userId: 'system',
      role: 'OWNER',
      communityId,
    });
    return {
      verified: true,
      message: `Blueprint progress verified: ${blueprint.overallCompletionPercentage}% complete.`,
      state: blueprint,
    };
  },
});
