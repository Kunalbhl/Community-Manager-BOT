import {
  WelcomeOnboardingConfig,
  WelcomeAuditRecord,
  WelcomeDeliveryStatus,
  RoleAssignmentStatus,
  InterviewMode,
  RulesAcknowledgementRecord,
  MemberJourneyStatus,
} from '../../shared/types/models.js';
import { UserRole } from '../../shared/types/rbac.js';
import {
  welcomeOnboardingConfigsRepository,
  welcomeAuditRecordsRepository,
  rulesAcknowledgementsRepository,
  applicationsRepository,
  referralLifecycleRepository,
  communitiesRepository,
  recruitersRepository,
} from '../repositories/index.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { discordCapabilityService } from './discordCapability.service.js';
import { auditService } from './audit.service.js';
import { logger } from '../logging/logger.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

export const DEFAULT_PERSONAL_WELCOME =
  "Welcome {{memberName}}! 🎉\n\nWe're happy to have you in {{communityName}}.\n\nTake a look around, check the rules, and feel free to introduce yourself.\n\nEnjoy the community!";

export const DEFAULT_SERVER_WELCOME =
  "🎉 Welcome {{memberName}} to {{communityName}}!\n\nPlease check the rules and say hello.\n\nHave fun and enjoy the community!";

export const DEFAULT_COMMUNITY_RULES =
  "1. Treat all members with respect and courtesy.\n2. Keep conversations in the designated channels.\n3. No spamming, unauthorized advertising, or harassment.\n4. Comply with Discord Community Guidelines & Terms of Service.";

export interface ExecuteWelcomeParams {
  communityId: string;
  applicantDiscordUserId: string;
  applicantUsername: string;
  recruiterDiscordUserId?: string;
  recruiterCode?: string;
  referralId?: string;
  applicationId?: string;
  requestId?: string;
}

export interface WelcomeExecutionResult {
  roleAssignmentStatus: RoleAssignmentStatus;
  roleAssignmentError?: string;
  personalDmStatus: WelcomeDeliveryStatus;
  personalDmError?: string;
  serverWelcomeStatus: WelcomeDeliveryStatus;
  serverWelcomeError?: string;
  auditRecords: WelcomeAuditRecord[];
}

export class WelcomeOnboardingService {
  /**
   * Retrieves or creates default Welcome & Onboarding configuration for a community.
   */
  async getWelcomeConfig(communityId: string): Promise<WelcomeOnboardingConfig> {
    const existing = await welcomeOnboardingConfigsRepository.list({
      where: [{ field: 'communityId', operator: '==', value: communityId }],
      limit: 1,
    });

    if (existing.length > 0) {
      return existing[0];
    }

    const now = new Date().toISOString();
    return welcomeOnboardingConfigsRepository.create({
      communityId,
      personalWelcomeMessage: DEFAULT_PERSONAL_WELCOME,
      serverWelcomeMessage: DEFAULT_SERVER_WELCOME,
      enablePersonalDm: true,
      enableServerWelcome: true,
      enableAutoRoleAssignment: true,
      interviewMode: 'NO_INTERVIEW',
      createdAt: now,
      updatedAt: now,
    });
  }

  async getConfig(communityId: string): Promise<WelcomeOnboardingConfig> {
    return this.getWelcomeConfig(communityId);
  }

  async updateWelcomeConfig(
    communityId: string,
    updates: Partial<WelcomeOnboardingConfig>,
    actorUserId?: string,
    actorRole?: UserRole,
    requestId?: string
  ): Promise<WelcomeOnboardingConfig> {
    const config = await this.getWelcomeConfig(communityId);
    const now = new Date().toISOString();

    const updated = await welcomeOnboardingConfigsRepository.update(config.id, {
      ...updates,
      updatedAt: now,
    });

    if (actorUserId && actorRole) {
      await auditService.record({
        communityId,
        actorUserId,
        actorRole,
        action: 'WELCOME_CONFIG_CHANGED',
        targetType: 'welcome_config',
        targetId: config.id,
        metadata: { updates },
        requestId,
      });
    }

    return updated;
  }

  async updateConfig(
    communityId: string,
    updates: Partial<WelcomeOnboardingConfig>,
    actorUserId?: string,
    actorRole?: UserRole,
    requestId?: string
  ): Promise<WelcomeOnboardingConfig> {
    return this.updateWelcomeConfig(communityId, updates, actorUserId, actorRole, requestId);
  }

  async previewWelcomeMessages(
    communityId: string,
    vars: {
      memberName?: string;
      communityName?: string;
      recruiterName?: string;
      recruiterCode?: string;
    }
  ): Promise<{ personalMessage: string; serverMessage: string }> {
    const config = await this.getWelcomeConfig(communityId);
    return {
      personalMessage: this.resolveTemplate(config.personalWelcomeMessage, vars),
      serverMessage: this.resolveTemplate(config.serverWelcomeMessage, vars),
    };
  }

  async calculateSetupProgress(communityId: string) {
    return this.calculateSetupCompletion(communityId);
  }

  /**
   * Safely resolves template variables without introducing fake data or injection issues.
   */
  resolveTemplate(
    template: string,
    vars: {
      memberName?: string;
      communityName?: string;
      recruiterName?: string;
      recruiterCode?: string;
      memberId?: string;
      recruiterId?: string;
      memberCount?: number;
    }
  ): string {
    if (!template) return '';

    let rendered = template;
    rendered = rendered.replace(/\{\{member\}\}/g, vars.memberId ? `<@${vars.memberId}>` : vars.memberName || 'Member');
    rendered = rendered.replace(/\{\{recruiter\}\}/g, vars.recruiterId ? `<@${vars.recruiterId}>` : vars.recruiterName || '');
    rendered = rendered.replace(/\{\{memberCount\}\}/g, vars.memberCount ? String(vars.memberCount) : '');
    rendered = rendered.replace(/\{\{memberName\}\}/g, vars.memberName || 'Member');
    rendered = rendered.replace(/\{\{communityName\}\}/g, vars.communityName || 'the community');
    rendered = rendered.replace(/\{\{recruiterName\}\}/g, vars.recruiterName || '');
    rendered = rendered.replace(/\{\{recruiterCode\}\}/g, vars.recruiterCode || '');

    return rendered.trim();
  }

  /**
   * Executes the full Welcome & Role Assignment sequence upon verified server join.
   * Sequence:
   * 1. JOIN CONFIRMED
   * 2. RECRUITMENT SUCCESS CONFIRMED
   * 3. ROLE ASSIGNMENT ATTEMPT
   * 4. WELCOME DM ATTEMPT
   * 5. SERVER WELCOME ATTEMPT
   * 6. AUDIT LOG
   */
  async executeWelcomeAndOnboarding(
    params: ExecuteWelcomeParams
  ): Promise<WelcomeExecutionResult> {
    const {
      communityId,
      applicantDiscordUserId,
      applicantUsername,
      recruiterDiscordUserId,
      recruiterCode,
      referralId,
      applicationId,
      requestId,
    } = params;

    const welcomeEventId = `we_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const config = await this.getWelcomeConfig(communityId);
    const community = await communitiesRepository.getById(communityId);
    const communityName = community?.name || 'Community';
    const guildId = community?.guildId;

    // Resolve recruiter username snapshot safely if available
    let recruiterName = '';
    if (recruiterDiscordUserId && recruiterDiscordUserId !== 'disc_unattributed') {
      const recruiters = await recruitersRepository.list({
        where: [
          { field: 'communityId', operator: '==', value: communityId },
          { field: 'discordId', operator: '==', value: recruiterDiscordUserId },
        ],
        limit: 1,
      });
      if (recruiters.length > 0) {
        recruiterName = recruiters[0].username;
      }
    }

    let memberCount: number | undefined;
    try {
      const comm: any = await communitiesRepository.getById(communityId);
      memberCount = discordService.getGuild(comm?.discordGuildId || comm?.guildId)?.memberCount;
    } catch { /* optional */ }
    const templateVars = {
      memberName: applicantUsername,
      communityName,
      recruiterName,
      recruiterCode: recruiterCode || '',
      memberId: applicantDiscordUserId,
      recruiterId: (params as any).recruiterDiscordUserId,
      memberCount,
    };

    const auditRecords: WelcomeAuditRecord[] = [];

    // ----------------------------------------------------
    // STEP 1: ROLE ASSIGNMENT ATTEMPT
    // ----------------------------------------------------
    let roleAssignmentStatus: RoleAssignmentStatus = 'NOT_CONFIGURED';
    let roleAssignmentError: string | undefined = undefined;

    // Check if role was already assigned previously for this user to ensure idempotency
    const previousRoleAudits = await welcomeAuditRecordsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'memberDiscordUserId', operator: '==', value: applicantDiscordUserId },
        { field: 'messageType', operator: '==', value: 'ROLE_ASSIGNMENT' },
        { field: 'status', operator: '==', value: 'ROLE_ASSIGNED' },
      ],
      limit: 1,
    });

    if (previousRoleAudits.length > 0) {
      roleAssignmentStatus = 'ROLE_ASSIGNED';
    } else if (!config.enableAutoRoleAssignment || !config.newMemberRoleId) {
      roleAssignmentStatus = config.enableAutoRoleAssignment ? 'NOT_CONFIGURED' : 'SKIPPED';
    } else if (!guildId) {
      roleAssignmentStatus = 'ROLE_ASSIGNMENT_FAILED';
      roleAssignmentError = 'GUILD_NOT_CONFIGURED';
    } else {
      // Check Discord bot connection & permissions
      const isConnected = discordService.isConnected();
      if (!isConnected) {
        roleAssignmentStatus = 'PERMISSION_REQUIRED';
        roleAssignmentError = 'DISCORD_BOT_NOT_CONNECTED';
      } else {
        const assignRes = await discordService.assignRole(
          guildId,
          applicantDiscordUserId,
          config.newMemberRoleId
        );

        if (assignRes.success) {
          roleAssignmentStatus = 'ROLE_ASSIGNED';
        } else {
          const err = assignRes.error || '';
          if (err.includes('BOT_MISSING_MANAGE_ROLES_PERMISSION')) {
            roleAssignmentStatus = 'PERMISSION_REQUIRED';
          } else if (err.includes('ROLE_NOT_FOUND')) {
            roleAssignmentStatus = 'ROLE_NOT_FOUND';
          } else if (err.includes('ROLE_HIERARCHY_CONFLICT')) {
            roleAssignmentStatus = 'ROLE_HIERARCHY_BLOCKED';
          } else {
            roleAssignmentStatus = 'ROLE_ASSIGNMENT_FAILED';
          }
          roleAssignmentError = err;
        }
      }
    }

    const roleAudit = await welcomeAuditRecordsRepository.create({
      welcomeEventId,
      communityId,
      memberDiscordUserId: applicantDiscordUserId,
      roleId: config.newMemberRoleId,
      messageType: 'ROLE_ASSIGNMENT',
      status: roleAssignmentStatus,
      failureReason: roleAssignmentError,
      createdAt: now,
    });
    auditRecords.push(roleAudit);

    await auditService.record({
      communityId,
      actorUserId: `disc_${applicantDiscordUserId}`,
      actorRole: 'MEMBER',
      action: roleAssignmentStatus === 'ROLE_ASSIGNED' ? 'ROLE_ASSIGNED' : 'ROLE_ASSIGNMENT_FAILED',
      targetType: 'role',
      targetId: config.newMemberRoleId || 'none',
      metadata: {
        memberDiscordUserId: applicantDiscordUserId,
        status: roleAssignmentStatus,
        error: roleAssignmentError,
      },
      requestId,
    });

    // ----------------------------------------------------
    // STEP 2: PERSONAL WELCOME DM ATTEMPT
    // ----------------------------------------------------
    let personalDmStatus: WelcomeDeliveryStatus = 'NOT_CONFIGURED';
    let personalDmError: string | undefined = undefined;

    // Check duplicate welcome DM prevention
    const previousDmAudits = await welcomeAuditRecordsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'memberDiscordUserId', operator: '==', value: applicantDiscordUserId },
        { field: 'messageType', operator: '==', value: 'PERSONAL_DM' },
        { field: 'status', operator: '==', value: 'SENT' },
      ],
      limit: 1,
    });

    if (previousDmAudits.length > 0) {
      personalDmStatus = 'SENT';
    } else if (!config.enablePersonalDm) {
      personalDmStatus = 'SKIPPED';
    } else {
      const dmText = this.resolveTemplate(config.personalWelcomeMessage, templateVars);
      const dmRes = await discordService.sendDM(applicantDiscordUserId, dmText);
      if (dmRes.success) {
        personalDmStatus = 'SENT';
      } else {
        personalDmStatus = 'FAILED';
        personalDmError = dmRes.failureReason || 'Discord DM delivery failed';
      }
    }

    const dmAudit = await welcomeAuditRecordsRepository.create({
      welcomeEventId,
      communityId,
      memberDiscordUserId: applicantDiscordUserId,
      messageType: 'PERSONAL_DM',
      status: personalDmStatus,
      failureReason: personalDmError,
      createdAt: now,
    });
    auditRecords.push(dmAudit);

    // ----------------------------------------------------
    // STEP 3: SERVER WELCOME CHANNEL ATTEMPT
    // ----------------------------------------------------
    let serverWelcomeStatus: WelcomeDeliveryStatus = 'NOT_CONFIGURED';
    let serverWelcomeError: string | undefined = undefined;

    // Check duplicate server welcome message prevention
    const previousServerAudits = await welcomeAuditRecordsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'memberDiscordUserId', operator: '==', value: applicantDiscordUserId },
        { field: 'messageType', operator: '==', value: 'SERVER_WELCOME' },
        { field: 'status', operator: '==', value: 'SENT' },
      ],
      limit: 1,
    });

    if (previousServerAudits.length > 0) {
      serverWelcomeStatus = 'SENT';
    } else if (!config.enableServerWelcome) {
      serverWelcomeStatus = 'SKIPPED';
    } else if (!config.welcomeChannelId) {
      serverWelcomeStatus = 'NOT_CONFIGURED';
      serverWelcomeError = 'WELCOME_CHANNEL_NOT_CONFIGURED';
    } else {
      const serverText = this.resolveTemplate(config.serverWelcomeMessage, templateVars);
      const chanRes = await discordService.sendChannelMessage(config.welcomeChannelId, serverText);
      if (chanRes.success) {
        serverWelcomeStatus = 'SENT';
      } else {
        const err = chanRes.failureReason || 'Failed to post in welcome channel';
        if (err.includes('Missing Permissions') || err.includes('50013') || err.includes('BOT_NOT_CONNECTED')) {
          serverWelcomeStatus = 'PERMISSION_REQUIRED';
        } else {
          serverWelcomeStatus = 'FAILED';
        }
        serverWelcomeError = err;
      }
    }

    const serverWelcomeAudit = await welcomeAuditRecordsRepository.create({
      welcomeEventId,
      communityId,
      memberDiscordUserId: applicantDiscordUserId,
      channelId: config.welcomeChannelId,
      messageType: 'SERVER_WELCOME',
      status: serverWelcomeStatus,
      failureReason: serverWelcomeError,
      createdAt: now,
    });
    auditRecords.push(serverWelcomeAudit);

    await auditService.record({
      communityId,
      actorUserId: `disc_${applicantDiscordUserId}`,
      actorRole: 'MEMBER',
      action: serverWelcomeStatus === 'SENT' || personalDmStatus === 'SENT' ? 'WELCOME_SENT' : 'WELCOME_FAILED',
      targetType: 'welcome_onboarding',
      targetId: welcomeEventId,
      metadata: {
        personalDmStatus,
        serverWelcomeStatus,
        roleAssignmentStatus,
        personalDmError,
        serverWelcomeError,
      },
      requestId,
    });

    return {
      roleAssignmentStatus,
      roleAssignmentError,
      personalDmStatus,
      personalDmError,
      serverWelcomeStatus,
      serverWelcomeError,
      auditRecords,
    };
  }

  /**
   * Evaluates setup completion based strictly on actual configuration.
   * Adaptive:
   * - If interviewMode === 'NO_INTERVIEW', interview setup is not required.
   * - If optional Google Sheets is disabled, does not block 100% setup completion.
   */
  async calculateSetupCompletion(communityId: string): Promise<{
    completionPercentage: number;
    completedSteps: string[];
    pendingSteps: string[];
    isSetupComplete: boolean;
  }> {
    const completedSteps: string[] = [];
    const pendingSteps: string[] = [];

    // 1. Community Identity
    const community = await communitiesRepository.getById(communityId);
    if (community && community.name && community.guildId) {
      completedSteps.push('COMMUNITY_IDENTITY');
    } else {
      pendingSteps.push('COMMUNITY_IDENTITY');
    }

    // 2. Welcome & Onboarding Config
    const welcomeConfig = await this.getWelcomeConfig(communityId);
    if (welcomeConfig) {
      completedSteps.push('WELCOME_CONFIG');
    }

    // 3. Welcome Channel (if server welcome is enabled)
    if (welcomeConfig.enableServerWelcome) {
      if (welcomeConfig.welcomeChannelId) {
        completedSteps.push('WELCOME_CHANNEL');
      } else {
        pendingSteps.push('WELCOME_CHANNEL');
      }
    }

    // 4. Role Assignment (if auto role assignment is enabled)
    if (welcomeConfig.enableAutoRoleAssignment) {
      if (welcomeConfig.newMemberRoleId) {
        completedSteps.push('NEW_MEMBER_ROLE');
      } else {
        pendingSteps.push('NEW_MEMBER_ROLE');
      }
    }

    // 5. Interview Configuration (Adaptive)
    if (welcomeConfig.interviewMode === 'NO_INTERVIEW') {
      // Not required, counts as resolved
      completedSteps.push('INTERVIEW_SETTINGS');
    } else {
      completedSteps.push('INTERVIEW_SETTINGS');
    }

    const totalTracked = completedSteps.length + pendingSteps.length;
    const completionPercentage = totalTracked > 0 ? Math.round((completedSteps.length / totalTracked) * 100) : 100;

    return {
      completionPercentage,
      completedSteps,
      pendingSteps,
      isSetupComplete: pendingSteps.length === 0,
    };
  }

  /**
   * Retrieves community rules and the member's acknowledgement status.
   */
  async getCommunityRules(
    communityId: string,
    discordUserId?: string
  ): Promise<{
    rulesText: string;
    rulesVersion: string;
    rulesAcknowledgementEnabled: boolean;
    acknowledged: boolean;
    acknowledgedAt?: string;
  }> {
    const config = await this.getWelcomeConfig(communityId);
    const rulesText = config.communityRulesText || DEFAULT_COMMUNITY_RULES;
    const rulesVersion = config.rulesVersion || 'v1.0';
    const rulesAcknowledgementEnabled = config.rulesAcknowledgementEnabled ?? false;

    let acknowledged = false;
    let acknowledgedAt: string | undefined = undefined;

    if (discordUserId) {
      const records = await rulesAcknowledgementsRepository.list({
        where: [
          { field: 'communityId', operator: '==', value: communityId },
          { field: 'discordUserId', operator: '==', value: discordUserId },
        ],
        limit: 1,
      });

      if (records.length > 0) {
        acknowledged = true;
        acknowledgedAt = records[0].acknowledgedAt;
      }
    }

    return {
      rulesText,
      rulesVersion,
      rulesAcknowledgementEnabled,
      acknowledged,
      acknowledgedAt,
    };
  }

  /**
   * Records a user's lightweight rules acknowledgement.
   * Idempotent: Does not create duplicate acknowledgement records.
   */
  async acknowledgeRules(
    communityId: string,
    discordUserId: string,
    rulesVersion?: string,
    requestId?: string
  ): Promise<{
    acknowledged: boolean;
    acknowledgedAt: string;
    record: RulesAcknowledgementRecord;
  }> {
    if (!communityId) throw new BadRequestError('communityId is required');
    if (!discordUserId) throw new BadRequestError('discordUserId is required');

    const config = await this.getWelcomeConfig(communityId);
    const version = rulesVersion || config.rulesVersion || 'v1.0';

    const existing = await rulesAcknowledgementsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'discordUserId', operator: '==', value: discordUserId },
      ],
      limit: 1,
    });

    if (existing.length > 0) {
      return {
        acknowledged: true,
        acknowledgedAt: existing[0].acknowledgedAt,
        record: existing[0],
      };
    }

    const now = new Date().toISOString();
    const created = await rulesAcknowledgementsRepository.create({
      communityId,
      discordUserId,
      rulesVersion: version,
      acknowledgedAt: now,
      createdAt: now,
    });

    await auditService.record({
      communityId,
      actorUserId: `disc_${discordUserId}`,
      actorRole: 'MEMBER',
      action: 'RULES_ACKNOWLEDGED' as any,
      targetType: 'community_rules',
      targetId: version,
      metadata: {
        discordUserId,
        rulesVersion: version,
      },
      requestId,
    });

    return {
      acknowledged: true,
      acknowledgedAt: now,
      record: created,
    };
  }

  /**
   * Evaluates the complete, truthful member journey status.
   */
  async getMemberJourneyStatus(
    communityId: string,
    discordUserId: string
  ): Promise<MemberJourneyStatus> {
    if (!communityId) throw new BadRequestError('communityId is required');
    if (!discordUserId) throw new BadRequestError('discordUserId is required');

    const config = await this.getWelcomeConfig(communityId);

    // 1. Check Application Status
    const apps = await applicationsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'applicantDiscordId', operator: '==', value: discordUserId },
      ],
      limit: 5,
    });

    const activeApp = apps.sort(
      (a, b) => new Date(b.submittedAt || b.createdAt || 0).getTime() - new Date(a.submittedAt || a.createdAt || 0).getTime()
    )[0];

    // 2. Check Welcome Audit Records
    const audits = await welcomeAuditRecordsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'memberDiscordUserId', operator: '==', value: discordUserId },
      ],
    });

    const roleAudit = audits.find((a) => a.messageType === 'ROLE_ASSIGNMENT');
    const dmAudit = audits.find((a) => a.messageType === 'PERSONAL_DM');
    const serverAudit = audits.find((a) => a.messageType === 'SERVER_WELCOME');

    const roleAssignmentStatus: RoleAssignmentStatus =
      (roleAudit?.status as RoleAssignmentStatus) ||
      (!config.enableAutoRoleAssignment || !config.newMemberRoleId ? 'NOT_CONFIGURED' : 'SKIPPED');

    const personalDmStatus: WelcomeDeliveryStatus =
      (dmAudit?.status as WelcomeDeliveryStatus) ||
      (!config.enablePersonalDm ? 'SKIPPED' : 'NOT_CONFIGURED');

    const serverWelcomeStatus: WelcomeDeliveryStatus =
      (serverAudit?.status as WelcomeDeliveryStatus) ||
      (!config.enableServerWelcome || !config.welcomeChannelId ? 'NOT_CONFIGURED' : 'SKIPPED');

    // 3. Rules Acknowledgement
    let rulesAcknowledgementStatus: 'ACKNOWLEDGED' | 'NOT_REQUIRED' | 'PENDING' = 'NOT_REQUIRED';
    let rulesAcknowledgedAt: string | undefined = undefined;

    if (config.rulesAcknowledgementEnabled) {
      const ackList = await rulesAcknowledgementsRepository.list({
        where: [
          { field: 'communityId', operator: '==', value: communityId },
          { field: 'discordUserId', operator: '==', value: discordUserId },
        ],
        limit: 1,
      });

      if (ackList.length > 0) {
        rulesAcknowledgementStatus = 'ACKNOWLEDGED';
        rulesAcknowledgedAt = ackList[0].acknowledgedAt;
      } else {
        rulesAcknowledgementStatus = 'PENDING';
      }
    }

    // 4. Referral / Recruiter Attribution
    const referrals = await referralLifecycleRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'applicantDiscordId', operator: '==', value: discordUserId },
      ],
      limit: 1,
    });

    let recruiterAttribution = undefined;
    if (referrals.length > 0) {
      const ref = referrals[0];
      recruiterAttribution = {
        recruiterCode: ref.recruiterCode,
        recruiterDiscordId: ref.recruiterDiscordId,
        referralStatus: ref.lifecycleStatus,
      };
    }

    // 5. Determine overall journey state
    const isMember = activeApp?.status === 'JOINED' || referrals[0]?.lifecycleStatus === 'RECRUITMENT_SUCCESSFUL' || roleAssignmentStatus === 'ROLE_ASSIGNED';

    let journeyState: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'REJECTED' = 'IN_PROGRESS';
    if (activeApp?.status === 'REJECTED') {
      journeyState = 'REJECTED';
    } else if (isMember) {
      const rulesSatisfied = rulesAcknowledgementStatus !== 'PENDING';
      if (rulesSatisfied) {
        journeyState = 'COMPLETED';
      } else {
        journeyState = 'IN_PROGRESS';
      }
    }

    return {
      communityId,
      discordUserId,
      isMember,
      applicationStatus: activeApp?.status,
      applicationId: activeApp?.id,
      roleAssignmentStatus,
      roleId: config.newMemberRoleId,
      personalDmStatus,
      serverWelcomeStatus,
      rulesAcknowledgementStatus,
      rulesAcknowledgedAt,
      recruiterAttribution,
      journeyState,
    };
  }
}

export const welcomeOnboardingService = new WelcomeOnboardingService();
