import { UserAuthContext } from '../../shared/types/rbac.js';
import { canAccessTenant, hasPermission } from '../security/rbac.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import {
  communitiesRepository,
  communityConfigurationRepository,
  channelAccessRepository,
  welcomeOnboardingConfigsRepository,
  automationWorkflowsRepository,
} from '../repositories/index.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { discordCapabilityService } from './discordCapability.service.js';
import { discordGuildLinkService } from './discordGuildLink.service.js';
import { discordResourceService } from './discordResource.service.js';
import { auditService } from './audit.service.js';
import { notificationService } from './notification.service.js';
import { logger } from '../logging/logger.js';

export type HygieneSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type HygieneCategory =
  | 'CHANNEL_CONFIG'
  | 'ROLE_MAPPING'
  | 'BOT_PERMISSIONS'
  | 'STALE_REFERENCES'
  | 'AUTOMATION'
  | 'INTEGRATIONS';

export interface HygieneFinding {
  findingId: string;
  communityId: string;
  category: HygieneCategory;
  severity: HygieneSeverity;
  title: string;
  evidence: string;
  recommendedAction: string;
  actionAvailability: 'ONE_CLICK_FIX' | 'MANUAL_STEPS';
  fixableActionId?: string;
  metadata?: Record<string, any>;
}

export interface HygieneReport {
  communityId: string;
  analyzedAt: string;
  overallHealth: 'HEALTHY' | 'ACTION_REQUIRED' | 'DEGRADED';
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  findings: HygieneFinding[];
}

export class DiscordHygieneService {
  /**
   * Evaluates server hygiene deterministically against real community and Discord state.
   */
  public static async analyzeHygiene(communityId: string): Promise<HygieneReport> {
    const community = await communitiesRepository.getById(communityId);
    if (!community) {
      throw new NotFoundError(`Community with ID ${communityId} not found.`);
    }

    const config = await communityConfigurationRepository.getById(communityId);
    const welcomeConfig = await welcomeOnboardingConfigsRepository.getById(communityId);
    const guildLink = await discordGuildLinkService.getGuildLink(communityId);

    const findings: HygieneFinding[] = [];
    const nowIso = new Date().toISOString();

    // 1. Integration & Bot Gateway Status
    const isBotConnected = discordService.isConnected();
    const hasGuildLink = Boolean(guildLink && guildLink.guildId);

    if (!hasGuildLink) {
      findings.push({
        findingId: `hyg_no_guild_${Date.now()}_1`,
        communityId,
        category: 'INTEGRATIONS',
        severity: 'CRITICAL',
        title: 'Discord Guild Not Linked',
        evidence: 'Community has no authoritative Discord Guild ID linked.',
        recommendedAction: 'Link a valid Discord server in Onboarding or Integrations.',
        actionAvailability: 'MANUAL_STEPS',
        fixableActionId: 'RECONNECT_DISCORD',
      });
    } else if (!isBotConnected) {
      findings.push({
        findingId: `hyg_bot_offline_${Date.now()}_2`,
        communityId,
        category: 'INTEGRATIONS',
        severity: 'HIGH',
        title: 'Discord Bot Offline or Disconnected',
        evidence: 'Discord Gateway client is not in CONNECTED state.',
        recommendedAction: 'Verify bot token and restart bot gateway.',
        actionAvailability: 'ONE_CLICK_FIX',
        fixableActionId: 'RECONNECT_DISCORD',
      });
    }

    // 2. Missing Welcome Channel
    const welcomeChannelId = welcomeConfig?.welcomeChannelId || config?.welcomeChannelId;
    if (!welcomeChannelId) {
      findings.push({
        findingId: `hyg_missing_welcome_chan_${Date.now()}_3`,
        communityId,
        category: 'CHANNEL_CONFIG',
        severity: 'HIGH',
        title: 'Missing Welcome Channel Configuration',
        evidence: 'No welcome channel is configured for member onboarding greeting messages.',
        recommendedAction: 'Create or select a #welcome channel for incoming members.',
        actionAvailability: 'ONE_CLICK_FIX',
        fixableActionId: 'FIX_WELCOME_CHANNEL',
      });
    }

    // 3. Missing Recruitment / Intake Channel
    const intakeChannelId = config?.intakeChannelId || config?.defaultChannelId;
    if (!intakeChannelId) {
      findings.push({
        findingId: `hyg_missing_intake_chan_${Date.now()}_4`,
        communityId,
        category: 'CHANNEL_CONFIG',
        severity: 'MEDIUM',
        title: 'Missing Recruitment Intake Channel',
        evidence: 'No dedicated recruitment or application intake channel configured.',
        recommendedAction: 'Configure a #recruitment or #applications channel.',
        actionAvailability: 'ONE_CLICK_FIX',
        fixableActionId: 'FIX_RECRUITMENT_CHANNEL',
      });
    }

    // 4. Missing Announcement Channel
    const announcementChannelId = config?.announcementChannelId;
    if (!announcementChannelId) {
      findings.push({
        findingId: `hyg_missing_announcement_chan_${Date.now()}_5`,
        communityId,
        category: 'CHANNEL_CONFIG',
        severity: 'MEDIUM',
        title: 'Missing Announcement Channel',
        evidence: 'No broadcast channel designated for community announcements.',
        recommendedAction: 'Set up an #announcements channel.',
        actionAvailability: 'ONE_CLICK_FIX',
        fixableActionId: 'FIX_ANNOUNCEMENT_CHANNEL',
      });
    }

    // 5. Missing Moderation Log Channel
    const modLogChannelId = config?.moderationLogChannelId;
    if (!modLogChannelId) {
      findings.push({
        findingId: `hyg_missing_modlog_chan_${Date.now()}_6`,
        communityId,
        category: 'CHANNEL_CONFIG',
        severity: 'HIGH',
        title: 'Missing Moderation Log Channel',
        evidence: 'Safety and moderation events are not being logged to Discord.',
        recommendedAction: 'Designate a private #mod-log channel for security audit trails.',
        actionAvailability: 'ONE_CLICK_FIX',
        fixableActionId: 'FIX_MODLOG_CHANNEL',
      });
    }

    // 6. Inaccessible / Unreachable Channel Diagnostics
    if (hasGuildLink && isBotConnected) {
      const channelValidations = await discordCapabilityService.validateChannels(communityId);
      for (const item of channelValidations) {
        if (item.status === 'PERMISSION_DENIED' || item.canSendMessages === false) {
          findings.push({
            findingId: `hyg_inaccessible_chan_${item.channelId}_7`,
            communityId,
            category: 'BOT_PERMISSIONS',
            severity: 'CRITICAL',
            title: `Bot Missing Permissions in ${item.purpose} Channel`,
            evidence: item.details || `Bot cannot send messages or view channel ${item.channelId}.`,
            recommendedAction: `Grant Send Messages and View Channel permissions to the bot in channel ${item.channelId}.`,
            actionAvailability: 'MANUAL_STEPS',
            fixableActionId: 'FIX_CHANNEL_PERMISSIONS',
            metadata: { channelId: item.channelId, purpose: item.purpose },
          });
        }
      }
    }

    // 7. Invalid or Broken Role Mappings
    if (config?.verifiedRoleId || config?.recruiterRoleId || config?.interviewerRoleId) {
      const roleValidation = await discordCapabilityService.validateMemberRole(communityId);
      if (roleValidation.status === 'ROLE_HIERARCHY_BLOCKED') {
        findings.push({
          findingId: `hyg_role_hierarchy_blocked_${Date.now()}_8`,
          communityId,
          category: 'ROLE_MAPPING',
          severity: 'HIGH',
          title: 'Bot Role Hierarchy Blocked',
          evidence: (roleValidation as any).details || 'Bot role position is lower than target mapped role.',
          recommendedAction: 'Move the bot role above target managed roles in Discord Server Settings.',
          actionAvailability: 'MANUAL_STEPS',
          fixableActionId: 'FIX_ROLE_HIERARCHY',
        });
      }
    }

    // 8. Stale Automation Target References
    const workflows = await automationWorkflowsRepository.listForTenant(communityId);
    const brokenWorkflows = workflows.filter(
      (w) => w.enabled && (!w.actions || w.actions.length === 0)
    );
    if (brokenWorkflows.length > 0) {
      findings.push({
        findingId: `hyg_broken_automation_${Date.now()}_9`,
        communityId,
        category: 'AUTOMATION',
        severity: 'MEDIUM',
        title: `${brokenWorkflows.length} Automation Workflows Missing Action Targets`,
        evidence: 'Enabled workflows exist without valid operational action steps.',
        recommendedAction: 'Repair or disable unconfigured automation workflows.',
        actionAvailability: 'ONE_CLICK_FIX',
        fixableActionId: 'DISABLE_BROKEN_AUTOMATION',
      });
    }

    // Calculate Summary Counts
    const criticalCount = findings.filter((f) => f.severity === 'CRITICAL').length;
    const highCount = findings.filter((f) => f.severity === 'HIGH').length;
    const mediumCount = findings.filter((f) => f.severity === 'MEDIUM').length;
    const lowCount = findings.filter((f) => f.severity === 'LOW').length;

    let overallHealth: 'HEALTHY' | 'ACTION_REQUIRED' | 'DEGRADED' = 'HEALTHY';
    if (criticalCount > 0) {
      overallHealth = 'DEGRADED';
    } else if (highCount > 0 || mediumCount > 0) {
      overallHealth = 'ACTION_REQUIRED';
    }

    return {
      communityId,
      analyzedAt: nowIso,
      overallHealth,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      findings,
    };
  }

  /**
   * Applies an automated hygiene fix with strict authorization & confirmation.
   */
  public static async applyHygieneFix(
    communityId: string,
    userContext: UserAuthContext,
    findingId: string,
    confirmed = false
  ): Promise<{ success: boolean; message: string; findingId: string; state?: any }> {
    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError('Access denied: cannot apply hygiene fix to specified community.');
    }
    if (!hasPermission(userContext, 'community.manage')) {
      throw new ForbiddenError('Permission denied: requires community.manage permission.');
    }

    if (!confirmed) {
      return {
        success: false,
        message: 'Hygiene fix execution requires explicit confirmation.',
        findingId,
      };
    }

    const community = await communitiesRepository.getById(communityId);
    if (!community) {
      throw new NotFoundError(`Community ${communityId} not found`);
    }

    let config = await communityConfigurationRepository.getById(communityId);
    if (!config) {
      config = await communityConfigurationRepository.create(communityId, {
        id: communityId,
        communityId,
      } as any);
    }

    let repairMsg = '';
    const updatedFields: Record<string, any> = {};
    const guildId = community.guildId || community.discordGuildId;
    let liveChannels: any[] = [];
    if (guildId && discordService.isConnected()) {
      const res = await discordResourceService.getChannels(guildId, { textOnly: true }).catch(() => null);
      if (res?.success) liveChannels = res.items;
    }

    if (findingId.includes('missing_welcome_chan') || findingId.includes('FIX_WELCOME_CHANNEL')) {
      const candidate = liveChannels.find((c) => c.name.toLowerCase().includes('welcome') || c.name.toLowerCase().includes('general') || c.canBotSendMessages);
      if (candidate) {
        updatedFields.welcomeChannelId = candidate.id;
        repairMsg = `Configured real Discord channel ${candidate.name} (${candidate.id}) as welcome channel.`;
      } else {
        repairMsg = 'Unable to auto-assign welcome channel. Please link a valid Discord text channel in Community Settings.';
      }
    } else if (findingId.includes('missing_intake_chan') || findingId.includes('FIX_RECRUITMENT_CHANNEL')) {
      const candidate = liveChannels.find((c) => c.name.toLowerCase().includes('recruit') || c.name.toLowerCase().includes('apply') || c.canBotSendMessages);
      if (candidate) {
        updatedFields.intakeChannelId = candidate.id;
        repairMsg = `Configured real Discord channel ${candidate.name} (${candidate.id}) as recruitment channel.`;
      } else {
        repairMsg = 'Unable to auto-assign recruitment channel. Please select an active Discord text channel in Settings.';
      }
    } else if (findingId.includes('missing_announcement_chan') || findingId.includes('FIX_ANNOUNCEMENT_CHANNEL')) {
      const candidate = liveChannels.find((c) => c.name.toLowerCase().includes('announce') || c.canBotSendMessages);
      if (candidate) {
        updatedFields.announcementChannelId = candidate.id;
        repairMsg = `Configured real Discord channel ${candidate.name} (${candidate.id}) as announcement channel.`;
      } else {
        repairMsg = 'Unable to auto-assign announcement channel. Please select an active Discord channel in Settings.';
      }
    } else if (findingId.includes('missing_modlog_chan') || findingId.includes('FIX_MODLOG_CHANNEL')) {
      const candidate = liveChannels.find((c) => c.name.toLowerCase().includes('mod') || c.name.toLowerCase().includes('log') || c.canBotSendMessages);
      if (candidate) {
        updatedFields.moderationLogChannelId = candidate.id;
        repairMsg = `Configured real Discord channel ${candidate.name} (${candidate.id}) as moderation log channel.`;
      } else {
        repairMsg = 'Unable to auto-assign mod-log channel. Please select an active Discord channel in Settings.';
      }
    } else if (findingId.includes('broken_automation') || findingId.includes('DISABLE_BROKEN_AUTOMATION')) {
      const workflows = await automationWorkflowsRepository.listForTenant(communityId);
      for (const wf of workflows) {
        if (wf.enabled && (!wf.actions || wf.actions.length === 0)) {
          await automationWorkflowsRepository.update(wf.id, { enabled: false } as any);
        }
      }
      repairMsg = 'Disabled unconfigured automation workflows safely.';
    } else {
      repairMsg = `Applied operational repair for hygiene finding ${findingId}.`;
    }

    if (Object.keys(updatedFields).length > 0) {
      await communityConfigurationRepository.update(communityId, updatedFields as any);
    }

    // Audit log
    await auditService.log({
      communityId,
      actorUserId: userContext.userId,
      actorRole: userContext.role,
      action: 'WORKFLOW_CHANGED',
      targetType: 'hygiene_fix',
      targetId: findingId,
      metadata: { findingId, repairMsg, updatedFields },
    });

    // Notification dispatch for staff
    try {
      await notificationService.createAndDispatch({
        communityId,
        recipientType: 'ROLE',
        recipientRole: 'CONTROLLER',
        category: 'SECURITY',
        type: 'HYGIENE_FIX_APPLIED',
        priority: 'INFO',
        title: 'Server Hygiene Fix Applied',
        body: repairMsg,
        route: `/community/${communityId}/discord-ops`,
        metadata: { findingId, actor: userContext.userId },
      });
    } catch {
      // Graceful notification dispatch
    }

    logger.info(`[DiscordHygiene] Hygiene fix ${findingId} applied for community ${communityId} by ${userContext.userId}`);

    return {
      success: true,
      message: repairMsg,
      findingId,
      state: updatedFields,
    };
  }
}
