import {
  RecruiterBenefit,
  RecruiterRewardType,
  FulfillmentType,
  DiscordCapabilityStatus,
} from '../../shared/types/models.js';
import { UserRole } from '../../shared/types/rbac.js';
import {
  recruiterBenefitsRepository,
  recruitersRepository,
  rewardsRepository,
} from '../repositories/index.js';
import { auditService } from './audit.service.js';
import { notificationService } from './notification.service.js';
import { discordCapabilityService } from './discordCapability.service.js';
import { logger } from '../logging/logger.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

export interface ConfigureBenefitParams {
  communityId: string;
  name: string;
  description: string;
  threshold: number;
  rewardType: RecruiterRewardType;
  discordRoleId?: string;
  discordRoleNameSnapshot?: string;
  customPerkDetails?: string;
  fulfillmentType?: FulfillmentType;
  isActive?: boolean;
}

export interface BenefitEligibilityResult {
  benefitId: string;
  benefitName: string;
  threshold: number;
  rewardType: RecruiterRewardType;
  eligible: boolean;
  status: DiscordCapabilityStatus;
  fulfillmentNote: string;
}

export class RecruiterBenefitsService {
  /**
   * Lists all configured recruiter benefits for a community.
   */
  async listBenefits(communityId: string): Promise<RecruiterBenefit[]> {
    return recruiterBenefitsRepository.listForTenant(communityId);
  }

  /**
   * Creates or updates a community recruiter reward benefit.
   */
  async configureBenefit(
    params: ConfigureBenefitParams,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<RecruiterBenefit> {
    if (!params.name || !params.name.trim()) {
      throw new BadRequestError('Benefit name is required');
    }
    if (params.threshold < 1) {
      throw new BadRequestError('Threshold must be at least 1 successful recruitment');
    }

    const now = new Date().toISOString();
    const record = await recruiterBenefitsRepository.create({
      communityId: params.communityId,
      name: params.name.trim(),
      description: params.description?.trim() || '',
      threshold: params.threshold,
      rewardType: params.rewardType,
      discordRoleId: params.discordRoleId?.trim(),
      discordRoleNameSnapshot: params.discordRoleNameSnapshot?.trim(),
      customPerkDetails: params.customPerkDetails?.trim(),
      fulfillmentType: params.fulfillmentType || 'MANUAL',
      isActive: params.isActive !== false,
      createdAt: now,
      updatedAt: now,
    });

    await auditService.record({
      communityId: params.communityId,
      actorUserId,
      actorRole,
      action: 'RECRUITER_BENEFIT_CONFIGURED',
      targetType: 'recruiter_benefit',
      targetId: record.id,
      metadata: {
        name: record.name,
        threshold: record.threshold,
        rewardType: record.rewardType,
      },
      requestId,
    });

    return record;
  }

  /**
   * Evaluates earned and pending benefits for a recruiter given their actual confirmed successful recruitments.
   */
  async evaluateRecruiterBenefits(
    communityId: string,
    successfulRecruitsCount: number
  ): Promise<{
    currentRecruits: number;
    benefits: BenefitEligibilityResult[];
    nextThreshold: number | null;
    nextBenefitName: string | null;
  }> {
    const allBenefits = await this.listBenefits(communityId);
    const activeBenefits = allBenefits.filter((b) => b.isActive).sort((a, b) => a.threshold - b.threshold);

    const results: BenefitEligibilityResult[] = [];
    let nextThreshold: number | null = null;
    let nextBenefitName: string | null = null;

    for (const benefit of activeBenefits) {
      const isEligible = successfulRecruitsCount >= benefit.threshold;

      let status: DiscordCapabilityStatus = 'AVAILABLE';
      let fulfillmentNote = '';

      if (isEligible) {
        if (benefit.rewardType === 'DISCORD_ROLE') {
          if (benefit.fulfillmentType === 'AUTOMATIC' && benefit.discordRoleId) {
            status = 'CONNECTED';
            fulfillmentNote = `Automatic Discord role assignment configured for role ${benefit.discordRoleNameSnapshot || benefit.discordRoleId}`;
          } else {
            status = 'MANUAL_ACTION_REQUIRED';
            fulfillmentNote = 'Manual Discord role assignment required by community administrator';
          }
        } else {
          status = 'MANUAL_ACTION_REQUIRED';
          fulfillmentNote = `Manual fulfillment required for ${benefit.rewardType}: ${benefit.customPerkDetails || benefit.description}`;
        }
      } else {
        status = 'NOT_CONFIGURED';
        fulfillmentNote = `Requires ${benefit.threshold - successfulRecruitsCount} more successful recruitment(s)`;

        if (nextThreshold === null) {
          nextThreshold = benefit.threshold;
          nextBenefitName = benefit.name;
        }
      }

      results.push({
        benefitId: benefit.id,
        benefitName: benefit.name,
        threshold: benefit.threshold,
        rewardType: benefit.rewardType,
        eligible: isEligible,
        status,
        fulfillmentNote,
      });
    }

    return {
      currentRecruits: successfulRecruitsCount,
      benefits: results,
      nextThreshold,
      nextBenefitName,
    };
  }

  /**
   * Evaluates and idempotently fulfills earned benefits for a recruiter.
   * Prevents duplicate milestone fulfillment via immutable reward ledger records.
   */
  async fulfillMilestoneBenefits(
    communityId: string,
    recruiterUserId: string,
    recruiterDiscordId: string,
    successfulRecruitsCount: number,
    sourceEventId?: string,
    requestId?: string
  ): Promise<{
    fulfilledBenefits: Array<{
      benefitId: string;
      benefitName: string;
      rewardType: RecruiterRewardType;
      status: DiscordCapabilityStatus;
      rewardId: string;
    }>;
  }> {
    const allBenefits = await this.listBenefits(communityId);
    const activeBenefits = allBenefits.filter((b) => b.isActive && successfulRecruitsCount >= b.threshold);

    const fulfilled: Array<{
      benefitId: string;
      benefitName: string;
      rewardType: RecruiterRewardType;
      status: DiscordCapabilityStatus;
      rewardId: string;
    }> = [];

    for (const benefit of activeBenefits) {
      // Idempotency check: check if this benefit was already awarded to this recruiter in this community
      const existingRewards = await rewardsRepository.list({
        where: [
          { field: 'communityId', operator: '==', value: communityId },
          { field: 'recruiterUserId', operator: '==', value: recruiterUserId },
          { field: 'tierName', operator: '==', value: benefit.name },
        ],
        limit: 1,
      });

      if (existingRewards.length > 0) {
        // Already granted; skip to preserve idempotency
        continue;
      }

      const now = new Date().toISOString();
      let status: DiscordCapabilityStatus = 'AVAILABLE';

      // 1. Evaluate fulfillment based on benefit type
      if (benefit.rewardType === 'DISCORD_ROLE') {
        if (benefit.fulfillmentType === 'AUTOMATIC' && benefit.discordRoleId) {
          const caps = discordCapabilityService.checkCapabilities();
          const canManageRoles = caps.find((c) => c.permissionName === 'ManageRoles');

          if (canManageRoles && canManageRoles.status === 'CONNECTED') {
            status = 'CONNECTED';
          } else {
            status = 'PERMISSION_REQUIRED';
          }
        } else {
          status = 'MANUAL_ACTION_REQUIRED';
        }
      } else if (benefit.rewardType === 'SPECIAL_CHANNEL') {
        const caps = discordCapabilityService.checkCapabilities();
        const canManageChannels = caps.find((c) => c.permissionName === 'ManageChannels');
        if (canManageChannels && canManageChannels.status === 'CONNECTED') {
          status = 'CONNECTED';
        } else {
          status = 'MANUAL_ACTION_REQUIRED';
        }
      } else {
        status = 'CONNECTED';
      }

      // 2. Create immutable reward ledger entry
      const rewardDoc = await rewardsRepository.create({
        communityId,
        recruiterUserId,
        tierName: benefit.name,
        pointsEarned: benefit.threshold * 10,
        description: `Milestone reward for reaching ${benefit.threshold} successful recruits (${benefit.name})`,
        claimed: status === 'CONNECTED',
        createdAt: now,
      });

      // 3. Audit trail
      await auditService.record({
        communityId,
        actorUserId: recruiterUserId,
        actorRole: 'RECRUITER',
        action: status === 'CONNECTED' ? 'BENEFIT_FULFILLED' : 'BENEFIT_EARNED',
        targetType: 'reward',
        targetId: rewardDoc.id,
        metadata: {
          benefitId: benefit.id,
          benefitName: benefit.name,
          rewardType: benefit.rewardType,
          threshold: benefit.threshold,
          fulfillmentStatus: status,
          recruiterDiscordId,
        },
        requestId,
      });

      // 4. Notification
      await notificationService.send({
        communityId,
        recipientUserId: recruiterUserId,
        recipientDiscordId: recruiterDiscordId,
        type: 'BENEFIT_EARNED',
        channel: 'DISCORD_DM',
        title: 'New Recruiter Milestone Benefit Earned!',
        body: `Congratulations! You have reached the milestone of ${benefit.threshold} confirmed recruits and earned: ${benefit.name}.`,
        templateVariables: {
          recruiterName: 'Recruiter',
        },
      });

      fulfilled.push({
        benefitId: benefit.id,
        benefitName: benefit.name,
        rewardType: benefit.rewardType,
        status,
        rewardId: rewardDoc.id,
      });
    }

    return { fulfilledBenefits: fulfilled };
  }

  /**
   * Deactivates or removes a benefit.
   */
  async deleteBenefit(
    communityId: string,
    benefitId: string,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<void> {
    const existing = await recruiterBenefitsRepository.getById(benefitId);
    if (!existing || existing.communityId !== communityId) {
      throw new NotFoundError('Recruiter benefit not found');
    }

    await recruiterBenefitsRepository.delete(benefitId);

    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'RECRUITER_BENEFIT_CONFIGURED',
      targetType: 'recruiter_benefit',
      targetId: benefitId,
      metadata: { action: 'DELETED', name: existing.name },
      requestId,
    });
  }
}

export const recruiterBenefitsService = new RecruiterBenefitsService();
