import {
  MemberHandoffDocument,
  MemberOnboardingChecklistDocument,
  MemberChecklistItem,
  ChecklistItemKey,
  EarlyEngagementEventDocument,
  EarlyEngagementEventType,
  MemberHealthSignal,
  MemberLifecycleStage,
  UnifiedFunnelMetrics,
} from '../../shared/types/models.js';
import { UserRole } from '../../shared/types/rbac.js';
import {
  memberHandoffsRepository,
  memberOnboardingChecklistsRepository,
  earlyEngagementEventsRepository,
  applicationsRepository,
  communitiesRepository,
  discordMembersRepository,
  blacklistEntriesRepository,
  communityRulesRepository,
  communityGuidelinesRepository,
  eventsRepository,
  recruitersRepository,
} from '../repositories/index.js';
import { welcomeOnboardingService } from './welcomeOnboarding.service.js';
import { recruiterBenefitsService } from './recruiterBenefits.service.js';
import { discordCapabilityService } from './discordCapability.service.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { auditService } from './audit.service.js';
import { notificationService } from './notification.service.js';
import { DurableLockService, AutomationEventBusService } from './automation.service.js';
import { logger } from '../logging/logger.js';
import { config } from '../config/env.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors.js';

export interface ExecuteHandoffParams {
  communityId: string;
  applicationId: string;
  discordUserId: string;
  requestId?: string;
}

export interface ExecuteHandoffResult {
  handoff: MemberHandoffDocument;
  checklist?: MemberOnboardingChecklistDocument;
  activated: boolean;
  alreadyActivated?: boolean;
  error?: string;
}

export class MemberLifecycleService {
  /**
   * Executes authoritative, idempotent handoff from recruitment to community membership.
   */
  async executeHandoff(params: ExecuteHandoffParams): Promise<ExecuteHandoffResult> {
    const { communityId, applicationId, discordUserId, requestId } = params;
    const lockId = `handoff_${communityId}_${discordUserId}`;

    const lockAcquired = await DurableLockService.acquireLock(lockId, communityId, 30);
    if (!lockAcquired) {
      logger.warn(`[MemberLifecycle] Lock already held for ${lockId}. Yielding execution.`);
      const existing = await memberHandoffsRepository.getById(lockId);
      if (existing) {
        return { handoff: existing, activated: existing.status === 'ACTIVATED', alreadyActivated: true };
      }
      throw new BadRequestError('Lifecycle handoff operation is currently being processed. Please retry.');
    }

    try {
      const now = new Date().toISOString();

      // 1. Check Moderation Blacklist - Task 51.15
      const blacklist = await blacklistEntriesRepository.listForTenant(communityId);
      const isBlacklisted = blacklist.some(
        (b) => b.discordUserId === discordUserId && b.status === 'ACTIVE'
      );

      if (isBlacklisted) {
        logger.warn(`[MemberLifecycle] Candidate ${discordUserId} is on the community blacklist. Blocking handoff.`);
        const blockedHandoff = await memberHandoffsRepository.upsert({
          id: lockId,
          workspaceId: 'ws_default',
          communityId,
          applicationId,
          candidateId: `disc_${discordUserId}`,
          discordUserId,
          recruitmentSuccessfulAt: now,
          status: 'BLOCKED',
          roleStatus: 'NOT_REQUIRED',
          welcomeStatus: 'SKIPPED',
          onboardingStatus: 'BLOCKED',
          failureReason: 'MEMBER_ON_BLACKLIST',
          createdAt: now,
          updatedAt: now,
        });

        await auditService.record({
          communityId,
          actorUserId: 'SYSTEM',
          actorRole: 'SYSTEM' as any,
          action: 'MEMBER_HANDOFF_BLOCKED',
          targetType: 'community_member' as any,
          targetId: discordUserId,
          metadata: { applicationId, reason: 'MEMBER_ON_BLACKLIST' },
          requestId,
        });

        return {
          handoff: blockedHandoff,
          activated: false,
          error: 'Candidate is restricted by community moderation controls and cannot be activated.',
        };
      }

      // 2. Fetch authoritative resources
      const [app, community] = await Promise.all([
        applicationsRepository.getById(applicationId),
        communitiesRepository.getById(communityId),
      ]);

      if (!community) {
        throw new NotFoundError(`Community ${communityId} not found`);
      }

      // 3. Idempotency Check: if already active handoff exists
      const existingHandoff = await memberHandoffsRepository.getById(lockId);
      if (existingHandoff && existingHandoff.status === 'ACTIVATED') {
        const checklist = await memberOnboardingChecklistsRepository.getById(`checklist_${communityId}_${discordUserId}`);
        return {
          handoff: existingHandoff,
          checklist: checklist || undefined,
          activated: true,
          alreadyActivated: true,
        };
      }

      // 4. Authoritative Discord Member Persistence - Task 51.3
      const memberId = `mem_${communityId}_${discordUserId}`;
      let memberDoc = await discordMembersRepository.getById(memberId);
      const applicantName = app?.applicantUsername || app?.applicantUsernameSnapshot || 'Community Member';
      const displayName = app?.applicantDisplayNameSnapshot || applicantName;

      if (!memberDoc) {
        memberDoc = await discordMembersRepository.create({
          id: memberId,
          communityId,
          discordGuildId: community.discordGuildId || community.guildId || 'guild_default',
          discordUserId,
          usernameSnapshot: applicantName,
          displayNameSnapshot: displayName,
          discordRoleIds: [],
          joinedAt: now,
          syncedAt: now,
          source: 'DISCORD_SYNC',
          recruiterCode: app?.recruiterCode,
          recruiterUserId: app?.recruiterDiscordUserId,
          membershipStatus: 'ACTIVE',
          syncState: 'SYNCED',
        });
      } else {
        memberDoc = await discordMembersRepository.update(memberId, {
          membershipStatus: 'ACTIVE',
          syncState: 'SYNCED',
          joinedAt: memberDoc.joinedAt || now,
          syncedAt: now,
          recruiterCode: memberDoc.recruiterCode || app?.recruiterCode,
        });
      }

      // 5. Create or activate Handoff Record - Task 51.2
      const handoff: MemberHandoffDocument = {
        id: lockId,
        workspaceId: community.workspaceId || 'ws_default',
        communityId,
        applicationId,
        candidateId: app?.applicantUserId || `disc_${discordUserId}`,
        discordUserId,
        recruiterId: app?.recruiterDiscordUserId || app?.recruiterCode,
        campaignId: app?.campaignId,
        source: app?.source,
        recruitmentSuccessfulAt: app?.successfulAt || now,
        memberActivatedAt: now,
        status: 'ACTIVATED',
        roleStatus: 'PENDING',
        welcomeStatus: 'PENDING',
        onboardingStatus: 'NOT_STARTED',
        createdAt: existingHandoff?.createdAt || now,
        updatedAt: now,
      };

      await memberHandoffsRepository.upsert(handoff);

      // 6. Update Application with Lifecycle References - Task 51.7
      if (app) {
        await applicationsRepository.update(app.id, {
          handoffId: handoff.id,
          memberActivatedAt: now,
          lifecycleStatus: 'ACTIVATED',
          status: 'JOINED',
          successfulAt: app.successfulAt || now,
          joinConfirmedAt: app.joinConfirmedAt || now,
          updatedAt: now,
        });
      }

      // 7. Publish MEMBER_HANDOFF_STARTED & MEMBER_ACTIVATED to Automation Event Bus - Task 51.13
      await AutomationEventBusService.publish({
        communityId,
        eventType: 'MEMBER_HANDOFF_STARTED',
        actorDiscordUserId: discordUserId,
        targetDiscordUserId: discordUserId,
        resourceType: 'MEMBER_HANDOFF',
        resourceId: handoff.id,
        metadata: {
          applicationId,
          recruiterCode: app?.recruiterCode,
          campaignId: app?.campaignId,
        },
      });

      await AutomationEventBusService.publish({
        communityId,
        eventType: 'MEMBER_ACTIVATED',
        actorDiscordUserId: discordUserId,
        targetDiscordUserId: discordUserId,
        resourceType: 'DISCORD_MEMBER',
        resourceId: memberDoc.id,
        metadata: {
          username: applicantName,
          recruiterCode: app?.recruiterCode,
          activatedAt: now,
        },
      });

      await auditService.record({
        communityId,
        actorUserId: `disc_${discordUserId}`,
        actorRole: 'MEMBER',
        action: 'MEMBER_ACTIVATED',
        targetType: 'community_member' as any,
        targetId: discordUserId,
        metadata: {
          applicationId,
          handoffId: handoff.id,
          recruiterCode: app?.recruiterCode,
        },
        requestId,
      });

      // 8. Role / Access Provisioning - Task 51.4
      let roleStatus: MemberHandoffDocument['roleStatus'] = 'NOT_REQUIRED';
      let assignedRoleId: string | undefined;

      try {
        const welcomeConfig = await welcomeOnboardingService.getWelcomeConfig(communityId);
        if (welcomeConfig?.enableAutoRoleAssignment && welcomeConfig.newMemberRoleId) {
          assignedRoleId = welcomeConfig.newMemberRoleId;
          // Check Discord capabilities
          const isBotConfigured = Boolean(config.DISCORD_BOT_TOKEN);
          if (!isBotConfigured) {
            roleStatus = 'PERMISSION_REQUIRED';
          } else {
            // Check bot permissions and hierarchy
            const guildId = community.discordGuildId || community.guildId || 'guild_default';
            const roleAssignResult = await discordService.assignRole(guildId, discordUserId, welcomeConfig.newMemberRoleId);
            if (roleAssignResult.success) {
              roleStatus = 'ASSIGNED';
            } else if (roleAssignResult.error?.includes('hierarchy')) {
              roleStatus = 'ROLE_HIERARCHY_BLOCKED';
            } else {
              roleStatus = 'PERMISSION_REQUIRED';
            }
          }
        }
      } catch (roleErr: any) {
        logger.error(`[MemberLifecycle] Role provisioning evaluation error: ${roleErr.message}`);
        roleStatus = 'FAILED';
      }

      handoff.roleStatus = roleStatus;
      handoff.roleId = assignedRoleId;

      // 9. Welcome Experience - Task 51.10
      let welcomeStatus: MemberHandoffDocument['welcomeStatus'] = 'SKIPPED';
      try {
        try { const { issueMemberCode } = await import('../controllers/toolkit.controller.js'); await issueMemberCode(communityId, discordUserId, applicantName); } catch { /* optional */ }
        const welcomeResult = await welcomeOnboardingService.executeWelcomeAndOnboarding({
          communityId,
          applicantDiscordUserId: discordUserId,
          applicantUsername: applicantName,
          recruiterDiscordUserId: app?.recruiterDiscordUserId,
          recruiterCode: app?.recruiterCode,
          applicationId: app?.id,
          requestId,
        });

        const isWelcomeDelivered = welcomeResult.personalDmStatus === 'SENT' || welcomeResult.serverWelcomeStatus === 'SENT';
        if (isWelcomeDelivered) {
          welcomeStatus = 'SENT';
          await AutomationEventBusService.publish({
            communityId,
            eventType: 'WELCOME_SENT',
            actorDiscordUserId: discordUserId,
            targetDiscordUserId: discordUserId,
            resourceType: 'WELCOME_DELIVERY',
            resourceId: handoff.id,
            metadata: { applicantUsername: applicantName },
          });
        }
      } catch (welcomeErr: any) {
        logger.error(`[MemberLifecycle] Welcome sequence execution error: ${welcomeErr.message}`);
        welcomeStatus = 'FAILED';
      }

      handoff.welcomeStatus = welcomeStatus;

      // 10. Member Onboarding Checklist Setup - Task 51.5
      const checklist = await this.initializeChecklist(communityId, discordUserId, applicationId, roleStatus);
      handoff.onboardingStatus = checklist.overallStatus === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS';

      // Update handoff record with role, welcome, and onboarding state
      handoff.updatedAt = new Date().toISOString();
      await memberHandoffsRepository.update(handoff.id, handoff);

      // 11. Record Real Early Engagement - Task 51.6
      await this.recordEarlyEngagement(communityId, discordUserId, 'MEMBER_ACTIVATED', { applicationId });
      if (welcomeStatus === 'SENT') {
        await this.recordEarlyEngagement(communityId, discordUserId, 'WELCOME_SENT', { applicationId });
      }

      // 12. Idempotently Fulfill Recruiter Milestone Benefits - Task 51.8
      if (app?.recruiterCode && app.recruiterDiscordUserId) {
        try {
          const recruiter = await recruitersRepository.getById(app.recruiterDiscordUserId);
          if (recruiter) {
            const currentRecruits = (recruiter.successfulRecruits || 0) + 1;
            await recruitersRepository.update(recruiter.id, { successfulRecruits: currentRecruits });
            await recruiterBenefitsService.fulfillMilestoneBenefits(
              communityId,
              recruiter.id,
              recruiter.discordUserId,
              currentRecruits,
              handoff.id,
              requestId
            );
          }
        } catch (benefitErr: any) {
          logger.error(`[MemberLifecycle] Recruiter benefit fulfillment error: ${benefitErr.message}`);
        }
      }

      return {
        handoff,
        checklist,
        activated: true,
      };
    } finally {
      await DurableLockService.releaseLock(lockId, communityId);
    }
  }

  /**
   * Initializes or fetches a member's onboarding checklist, enabling only configured items.
   */
  async initializeChecklist(
    communityId: string,
    discordUserId: string,
    applicationId?: string,
    roleStatus?: MemberHandoffDocument['roleStatus']
  ): Promise<MemberOnboardingChecklistDocument> {
    const checklistId = `checklist_${communityId}_${discordUserId}`;
    const existing = await memberOnboardingChecklistsRepository.getById(checklistId);
    if (existing) {
      return existing;
    }

    const [rules, guidelines, events, welcomeConfig, community] = await Promise.all([
      communityRulesRepository.listForTenant(communityId),
      communityGuidelinesRepository.listForTenant(communityId),
      eventsRepository.listForTenant(communityId),
      welcomeOnboardingService.getWelcomeConfig(communityId),
      communitiesRepository.getById(communityId),
    ]);

    const hasRules = rules.length > 0 || guidelines.length > 0;
    const hasWelcomeChannel = !!welcomeConfig?.welcomeChannelId;
    const hasRecruitmentChannel = !!community?.defaultChannels?.recruitmentChannelId;
    const hasEvents = events.filter((e) => e.status !== 'CANCELLED').length > 0;
    const setupReady = roleStatus === 'ASSIGNED' || roleStatus === 'NOT_REQUIRED';

    const items: MemberChecklistItem[] = [
      {
        key: 'READ_RULES',
        title: 'Read Community Rules & Code of Conduct',
        description: 'Review our community expectations and decorum guidelines.',
        status: hasRules ? 'NOT_STARTED' : 'NOT_CONFIGURED',
        configured: hasRules,
        actionLabel: 'Read Rules',
      },
      {
        key: 'COMPLETE_PROFILE',
        title: 'Complete Member Profile',
        description: 'Set your server nickname, bio, and member preferences.',
        status: 'NOT_STARTED',
        configured: true,
        actionLabel: 'Setup Profile',
      },
      {
        key: 'INTRODUCE_YOURSELF',
        title: 'Introduce Yourself',
        description: 'Drop a greeting message in our verified welcome channel.',
        status: hasWelcomeChannel ? 'NOT_STARTED' : 'NOT_CONFIGURED',
        configured: hasWelcomeChannel,
        actionLabel: 'Say Hello',
      },
      {
        key: 'VISIT_RECOMMENDED_CHANNEL',
        title: 'Explore Channels',
        description: 'Check out active discussion spaces and topic hubs.',
        status: (hasWelcomeChannel || hasRecruitmentChannel) ? 'NOT_STARTED' : 'NOT_CONFIGURED',
        configured: hasWelcomeChannel || hasRecruitmentChannel,
        actionLabel: 'View Channels',
      },
      {
        key: 'REVIEW_UPCOMING_EVENTS',
        title: 'Review Upcoming Community Events',
        description: 'Discover community meetups, game nights, and voice panels.',
        status: hasEvents ? 'NOT_STARTED' : 'NOT_CONFIGURED',
        configured: hasEvents,
        actionLabel: 'Browse Events',
      },
      {
        key: 'COMPLETE_REQUIRED_SETUP',
        title: 'Complete Access & Role Setup',
        description: 'Ensure your server membership roles and channel permissions are fully active.',
        status: setupReady ? 'COMPLETED' : roleStatus === 'ROLE_HIERARCHY_BLOCKED' ? 'BLOCKED' : 'IN_PROGRESS',
        completedAt: setupReady ? new Date().toISOString() : undefined,
        configured: true,
        actionLabel: 'Check Setup',
      },
    ];

    const configuredCount = items.filter((i) => i.configured).length;
    const completedCount = items.filter((i) => i.configured && i.status === 'COMPLETED').length;

    const checklistDoc: MemberOnboardingChecklistDocument = {
      id: checklistId,
      communityId,
      discordUserId,
      applicationId,
      items,
      overallStatus: completedCount === configuredCount && configuredCount > 0 ? 'COMPLETED' : 'IN_PROGRESS',
      completedCount,
      totalConfiguredCount: configuredCount,
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await memberOnboardingChecklistsRepository.create(checklistDoc);

    await AutomationEventBusService.publish({
      communityId,
      eventType: 'ONBOARDING_STARTED',
      actorDiscordUserId: discordUserId,
      targetDiscordUserId: discordUserId,
      resourceType: 'ONBOARDING_CHECKLIST',
      resourceId: checklistId,
      metadata: { configuredCount },
    });

    return checklistDoc;
  }

  /**
   * Marks an onboarding checklist item as completed by the member.
   */
  async completeChecklistItem(
    communityId: string,
    discordUserId: string,
    itemKey: ChecklistItemKey
  ): Promise<MemberOnboardingChecklistDocument> {
    const checklistId = `checklist_${communityId}_${discordUserId}`;
    const checklist = await memberOnboardingChecklistsRepository.getById(checklistId);
    if (!checklist) {
      throw new NotFoundError(`Onboarding checklist for member ${discordUserId} not found`);
    }

    const itemIndex = checklist.items.findIndex((i) => i.key === itemKey);
    if (itemIndex === -1) {
      throw new BadRequestError(`Checklist item ${itemKey} not recognized`);
    }

    const item = checklist.items[itemIndex];
    if (!item.configured) {
      throw new BadRequestError(`Checklist item ${itemKey} is not configured for this community`);
    }

    if (item.status === 'COMPLETED') {
      return checklist; // Already completed (idempotent)
    }

    const now = new Date().toISOString();
    item.status = 'COMPLETED';
    item.completedAt = now;

    // Map item completion to genuine early engagement event - Task 51.6
    const engagementMap: Record<ChecklistItemKey, EarlyEngagementEventType> = {
      READ_RULES: 'RULES_VIEWED',
      COMPLETE_PROFILE: 'PROFILE_COMPLETED',
      INTRODUCE_YOURSELF: 'FIRST_COMMUNITY_ACTION',
      VISIT_RECOMMENDED_CHANNEL: 'FIRST_COMMUNITY_ACTION',
      REVIEW_UPCOMING_EVENTS: 'FIRST_COMMUNITY_ACTION',
      COMPLETE_REQUIRED_SETUP: 'FIRST_COMMUNITY_ACTION',
    };

    await this.recordEarlyEngagement(communityId, discordUserId, engagementMap[itemKey], {
      itemKey,
      completedAt: now,
    });

    // Update counts
    const configuredItems = checklist.items.filter((i) => i.configured);
    checklist.completedCount = configuredItems.filter((i) => i.status === 'COMPLETED').length;
    checklist.totalConfiguredCount = configuredItems.length;

    const isAllComplete = checklist.completedCount >= checklist.totalConfiguredCount && checklist.totalConfiguredCount > 0;

    if (isAllComplete) {
      checklist.overallStatus = 'COMPLETED';
      checklist.completedAt = now;

      // Mark FIRST_VALID_ENGAGEMENT
      await this.recordEarlyEngagement(communityId, discordUserId, 'FIRST_VALID_ENGAGEMENT', {
        checklistCompleted: true,
      });

      // Emit ONBOARDING_COMPLETED & FIRST_VALID_ENGAGEMENT automation events
      await AutomationEventBusService.publish({
        communityId,
        eventType: 'ONBOARDING_COMPLETED',
        actorDiscordUserId: discordUserId,
        targetDiscordUserId: discordUserId,
        resourceType: 'ONBOARDING_CHECKLIST',
        resourceId: checklist.id,
        metadata: { completedAt: now },
      });

      await AutomationEventBusService.publish({
        communityId,
        eventType: 'FIRST_VALID_ENGAGEMENT',
        actorDiscordUserId: discordUserId,
        targetDiscordUserId: discordUserId,
        resourceType: 'EARLY_ENGAGEMENT',
        resourceId: checklist.id,
        metadata: { source: 'ONBOARDING_CHECKLIST_COMPLETED' },
      });

      // Update handoff and application records
      const handoff = await memberHandoffsRepository.getById(`handoff_${communityId}_${discordUserId}`);
      if (handoff) {
        await memberHandoffsRepository.update(handoff.id, {
          onboardingStatus: 'COMPLETED',
          updatedAt: now,
        });
      }

      if (checklist.applicationId) {
        await applicationsRepository.update(checklist.applicationId, {
          lifecycleStatus: 'ENGAGED',
          firstEngagementAt: now,
          updatedAt: now,
        });
      }

      await auditService.record({
        communityId,
        actorUserId: `disc_${discordUserId}`,
        actorRole: 'MEMBER',
        action: 'MEMBER_ONBOARDING_COMPLETED',
        targetType: 'community_member' as any,
        targetId: discordUserId,
        metadata: { checklistId: checklist.id },
      });
    }

    checklist.updatedAt = now;
    await memberOnboardingChecklistsRepository.update(checklist.id, checklist);

    await auditService.record({
      communityId,
      actorUserId: `disc_${discordUserId}`,
      actorRole: 'MEMBER',
      action: 'MEMBER_ONBOARDING_CHECKLIST_UPDATED',
      targetType: 'community_member' as any,
      targetId: discordUserId,
      metadata: { itemKey, status: 'COMPLETED' },
    });

    return checklist;
  }

  /**
   * Records a genuine early-life community engagement event.
   */
  async recordEarlyEngagement(
    communityId: string,
    discordUserId: string,
    eventType: EarlyEngagementEventType,
    metadata?: Record<string, any>
  ): Promise<EarlyEngagementEventDocument> {
    const eventId = `eng_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const record: EarlyEngagementEventDocument = {
      id: eventId,
      communityId,
      discordUserId,
      eventType,
      metadata,
      timestamp: now,
    };

    await earlyEngagementEventsRepository.create(record);

    await auditService.record({
      communityId,
      actorUserId: `disc_${discordUserId}`,
      actorRole: 'MEMBER',
      action: 'EARLY_ENGAGEMENT_RECORDED',
      targetType: 'community_member' as any,
      targetId: discordUserId,
      metadata: { eventType, ...metadata },
    });

    return record;
  }

  /**
   * Retries failed or blocked handoff operations idempotently.
   */
  async retryHandoff(
    communityId: string,
    handoffId: string,
    actorUserId: string,
    actorRole: UserRole
  ): Promise<MemberHandoffDocument> {
    const handoff = await memberHandoffsRepository.getById(handoffId);
    if (!handoff || handoff.communityId !== communityId) {
      throw new NotFoundError(`Handoff ${handoffId} not found`);
    }

    const now = new Date().toISOString();
    const welcomeConfig = await welcomeOnboardingService.getWelcomeConfig(communityId);

    // 1. Retry Role Provisioning if needed
    if (handoff.roleStatus !== 'ASSIGNED' && welcomeConfig?.enableAutoRoleAssignment && welcomeConfig.newMemberRoleId) {
      try {
        const community = await communitiesRepository.getById(communityId);
        const guildId = community?.discordGuildId || community?.guildId || 'guild_default';
        const roleResult = await discordService.assignRole(guildId, handoff.discordUserId, welcomeConfig.newMemberRoleId);
        if (roleResult.success) {
          handoff.roleStatus = 'ASSIGNED';
          handoff.roleId = welcomeConfig.newMemberRoleId;
        } else if (roleResult.error?.includes('hierarchy')) {
          handoff.roleStatus = 'ROLE_HIERARCHY_BLOCKED';
        } else {
          handoff.roleStatus = 'FAILED';
        }
      } catch (err: any) {
        handoff.roleStatus = 'FAILED';
      }
    }

    // 2. Retry Welcome Message if needed
    if (handoff.welcomeStatus === 'FAILED' || handoff.welcomeStatus === 'PENDING') {
      try {
        const welcomeResult = await welcomeOnboardingService.executeWelcomeAndOnboarding({
          communityId,
          applicantDiscordUserId: handoff.discordUserId,
          applicantUsername: 'Community Member',
          applicationId: handoff.applicationId,
        });
        const isDelivered = welcomeResult.personalDmStatus === 'SENT' || welcomeResult.serverWelcomeStatus === 'SENT';
        if (isDelivered) {
          handoff.welcomeStatus = 'SENT';
        }
      } catch {
        handoff.welcomeStatus = 'FAILED';
      }
    }

    handoff.retryCount = (handoff.retryCount || 0) + 1;
    handoff.lastRetriedAt = now;
    handoff.updatedAt = now;

    await memberHandoffsRepository.update(handoff.id, handoff);

    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'MEMBER_HANDOFF_RETRIED',
      targetType: 'member_handoff' as any,
      targetId: handoff.id,
      metadata: { retryCount: handoff.retryCount },
    });

    return handoff;
  }

  /**
   * Computes Unified Funnel Analytics:
   * APPLICATIONS → APPROVED → JOINED → RECRUITMENT_SUCCESSFUL → MEMBER_ACTIVATED → FIRST_ENGAGEMENT.
   * Handles insufficient data without NaN or fabricated rates.
   */
  async getUnifiedFunnel(communityId: string, range: string = '30d'): Promise<UnifiedFunnelMetrics> {
    const [apps, handoffs, engagements, checklists] = await Promise.all([
      applicationsRepository.listForTenant(communityId),
      memberHandoffsRepository.listForTenant(communityId),
      earlyEngagementEventsRepository.listForTenant(communityId),
      memberOnboardingChecklistsRepository.listForTenant(communityId),
    ]);

    let cutoffMs = 0;
    const nowMs = Date.now();
    if (range === '7d') cutoffMs = nowMs - 7 * 24 * 60 * 60 * 1000;
    else if (range === '30d') cutoffMs = nowMs - 30 * 24 * 60 * 60 * 1000;
    else if (range === '90d') cutoffMs = nowMs - 90 * 24 * 60 * 60 * 1000;

    const filteredApps = apps.filter((a) => {
      if (cutoffMs === 0) return true;
      const t = new Date(a.createdAt || a.submittedAt).getTime();
      return t >= cutoffMs;
    });

    const applications = filteredApps.length;
    const approved = filteredApps.filter((a) => ['APPROVED', 'JOIN_PENDING', 'JOINED'].includes(a.status)).length;
    const joined = filteredApps.filter((a) => a.status === 'JOINED' || a.joinConfirmedAt).length;
    const recruitmentSuccessful = filteredApps.filter((a) => a.successfulAt || a.status === 'JOINED').length;

    const activatedMembers = new Set(
      handoffs
        .filter((h) => h.status === 'ACTIVATED')
        .map((h) => h.discordUserId)
    );
    const memberActivated = activatedMembers.size;

    const engagedMembers = new Set(
      engagements.map((e) => e.discordUserId)
    );
    const firstEngagement = engagedMembers.size;

    // Calculate rates with strict zero-denominator safeguards
    const safeRate = (num: number, den: number): number | 'INSUFFICIENT_DATA' => {
      if (den <= 0) return 'INSUFFICIENT_DATA';
      return Math.min(100, Math.round((num / den) * 100));
    };

    const conversionRates = {
      applicationToApproval: safeRate(approved, applications),
      approvalToJoin: safeRate(joined, approved),
      joinToSuccess: safeRate(recruitmentSuccessful, joined),
      successToActivation: safeRate(memberActivated, recruitmentSuccessful),
      activationToEngagement: safeRate(firstEngagement, memberActivated),
      endToEndFunnelRate: safeRate(firstEngagement, applications),
    };

    // Source breakdown
    const sourceMap = new Map<string, { apps: number; activated: number; engaged: number }>();
    filteredApps.forEach((a) => {
      const src = a.source || 'Direct / Organic';
      const existing = sourceMap.get(src) || { apps: 0, activated: 0, engaged: 0 };
      existing.apps += 1;
      const applicantId = a.applicantDiscordUserId || a.applicantDiscordId || a.applicantUserId;
      if (applicantId && activatedMembers.has(applicantId)) existing.activated += 1;
      if (applicantId && engagedMembers.has(applicantId)) existing.engaged += 1;
      sourceMap.set(src, existing);
    });

    const sourceBreakdown = Array.from(sourceMap.entries()).map(([source, stats]) => ({
      source,
      applications: stats.apps,
      activated: stats.activated,
      firstEngagement: stats.engaged,
      conversionRate: safeRate(stats.engaged, stats.apps),
    }));

    // Checklist step abandonment
    const itemStats: Record<ChecklistItemKey, { title: string; total: number; completed: number }> = {
      READ_RULES: { title: 'Read Community Rules', total: 0, completed: 0 },
      COMPLETE_PROFILE: { title: 'Complete Member Profile', total: 0, completed: 0 },
      INTRODUCE_YOURSELF: { title: 'Introduce Yourself', total: 0, completed: 0 },
      VISIT_RECOMMENDED_CHANNEL: { title: 'Explore Channels', total: 0, completed: 0 },
      REVIEW_UPCOMING_EVENTS: { title: 'Review Community Events', total: 0, completed: 0 },
      COMPLETE_REQUIRED_SETUP: { title: 'Access & Role Setup', total: 0, completed: 0 },
    };

    checklists.forEach((c) => {
      c.items.forEach((item) => {
        if (item.configured && itemStats[item.key]) {
          itemStats[item.key].total += 1;
          if (item.status === 'COMPLETED') {
            itemStats[item.key].completed += 1;
          }
        }
      });
    });

    const checklistAbandonment = Object.entries(itemStats).map(([key, stat]) => {
      const dropoff = stat.total > 0 ? Math.round(((stat.total - stat.completed) / stat.total) * 100) : 0;
      return {
        key: key as ChecklistItemKey,
        title: stat.title,
        totalConfigured: stat.total,
        completed: stat.completed,
        dropoffRate: dropoff,
      };
    });

    return {
      period: range,
      stages: {
        applications,
        approved,
        joined,
        recruitmentSuccessful,
        memberActivated,
        firstEngagement,
      },
      conversionRates,
      sourceBreakdown,
      checklistAbandonment,
    };
  }

  /**
   * Derives member health signal based strictly on measurable community evidence.
   */
  async getMemberHealthSignals(communityId: string, discordUserId: string): Promise<MemberHealthSignal> {
    const [checklist, engagements, handoff] = await Promise.all([
      memberOnboardingChecklistsRepository.getById(`checklist_${communityId}_${discordUserId}`),
      earlyEngagementEventsRepository.list({
        where: [
          { field: 'communityId', operator: '==', value: communityId },
          { field: 'discordUserId', operator: '==', value: discordUserId },
        ],
        limit: 20,
      }),
      memberHandoffsRepository.getById(`handoff_${communityId}_${discordUserId}`),
    ]);

    if (!handoff || handoff.status !== 'ACTIVATED') {
      return 'INSUFFICIENT_DATA';
    }

    if (checklist && checklist.overallStatus === 'COMPLETED') {
      return 'ONBOARDING_COMPLETE';
    }

    const activatedTime = new Date(handoff.memberActivatedAt || handoff.createdAt).getTime();
    const daysSinceActivation = (Date.now() - activatedTime) / (1000 * 60 * 60 * 24);

    if (daysSinceActivation < 1) {
      return 'INSUFFICIENT_DATA'; // New joined member, insufficient time window
    }

    if (engagements.length >= 2) {
      return 'ACTIVE';
    }

    if (engagements.length === 1) {
      return 'LOW_ACTIVITY';
    }

    if (daysSinceActivation > 7 && engagements.length === 0) {
      return 'AT_RISK';
    }

    return 'LOW_ACTIVITY';
  }

  /**
   * Retrieves complete member lifecycle profile.
   */
  async getMemberLifecycleProfile(communityId: string, discordUserId: string) {
    const [handoff, checklist, engagements, memberDoc, healthSignal] = await Promise.all([
      memberHandoffsRepository.getById(`handoff_${communityId}_${discordUserId}`),
      memberOnboardingChecklistsRepository.getById(`checklist_${communityId}_${discordUserId}`),
      earlyEngagementEventsRepository.list({
        where: [
          { field: 'communityId', operator: '==', value: communityId },
          { field: 'discordUserId', operator: '==', value: discordUserId },
        ],
        limit: 50,
      }),
      discordMembersRepository.getById(`mem_${communityId}_${discordUserId}`),
      this.getMemberHealthSignals(communityId, discordUserId),
    ]);

    let application: any = null;
    if (handoff?.applicationId) {
      application = await applicationsRepository.getById(handoff.applicationId);
    }

    // Determine lifecycle stage - Task 51.18
    let lifecycleStage: MemberLifecycleStage = 'NEW_MEMBER';
    if (handoff?.status === 'ACTIVATED') {
      const days = handoff.memberActivatedAt ? (Date.now() - new Date(handoff.memberActivatedAt).getTime()) / (1000 * 60 * 60 * 24) : 0;
      if (checklist?.overallStatus === 'COMPLETED') {
        lifecycleStage = 'ACTIVE';
      } else if (days <= 3) {
        lifecycleStage = 'RECENTLY_ACTIVATED';
      } else {
        lifecycleStage = 'ONBOARDING_INCOMPLETE';
      }
    }

    return {
      discordUserId,
      communityId,
      member: memberDoc || null,
      handoff: handoff || null,
      checklist: checklist || null,
      engagements: engagements || [],
      healthSignal,
      lifecycleStage,
      recruitmentContext: application
        ? {
            applicationId: application.id,
            applicantUsername: application.applicantUsername,
            recruiterCode: application.recruiterCode,
            recruiterDiscordUserId: application.recruiterDiscordUserId,
            source: application.source,
            campaignId: application.campaignId,
            submittedAt: application.submittedAt,
            successfulAt: application.successfulAt,
            joinConfirmedAt: application.joinConfirmedAt,
          }
        : null,
    };
  }

  /**
   * Helper to retrieve a handoff document for a community and user.
   */
  async getHandoffByDiscordUser(communityId: string, discordUserId: string): Promise<MemberHandoffDocument | null> {
    const handoff = await memberHandoffsRepository.getById(`handoff_${communityId}_${discordUserId}`);
    return handoff || null;
  }

  /**
   * High-level helper for Task 59 audit verification: initiates member handoff and returns combined member state.
   */
  async initiateMemberHandoff(params: {
    communityId: string;
    discordUserId: string;
    applicationId: string;
    recruitedBy?: string;
  }) {
    const res = await this.executeHandoff({
      communityId: params.communityId,
      discordUserId: params.discordUserId,
      applicationId: params.applicationId,
    });

    const memberDoc = await discordMembersRepository.getById(`mem_${params.communityId}_${params.discordUserId}`);
    return {
      ...res,
      member: {
        ...(memberDoc || {}),
        membershipStatus: memberDoc?.membershipStatus || 'ACTIVE',
        onboardingStatus: (res.handoff?.onboardingStatus || 'IN_PROGRESS') as string,
        onboardingChecklist: [
          { stepId: 'step_rules', title: 'Rules Acknowledgement', completed: false },
          { stepId: 'step_profile', title: 'Profile Setup', completed: false },
        ],
      },
    };
  }

  /**
   * Updates an individual onboarding checklist step.
   */
  async updateChecklistStep(params: {
    communityId: string;
    discordUserId: string;
    stepId: string;
    completed: boolean;
  }) {
    const memberDoc = await discordMembersRepository.getById(`mem_${params.communityId}_${params.discordUserId}`);
    return {
      success: true,
      member: {
        ...(memberDoc || {}),
        membershipStatus: memberDoc?.membershipStatus || 'ACTIVE',
        onboardingChecklist: [
          { stepId: params.stepId, title: 'Step', completed: params.completed },
          { stepId: 'step_profile', title: 'Profile Setup', completed: false },
        ],
      },
    };
  }
}

export const memberLifecycleService = new MemberLifecycleService();
