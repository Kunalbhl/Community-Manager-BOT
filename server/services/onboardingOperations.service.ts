import {
  OnboardingOperation,
  OnboardingOperationType,
  OnboardingOperationStatus,
} from '../../shared/types/models.js';
import {
  onboardingOperationsRepository,
  welcomeOnboardingConfigsRepository,
  communitiesRepository,
} from '../repositories/index.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { logger } from '../logging/logger.js';

export interface RetryOperationsResult {
  communityId: string;
  totalEvaluated: number;
  retriedCount: number;
  succeededCount: number;
  failedCount: number;
  operations: OnboardingOperation[];
}

export class OnboardingOperationsService {
  /**
   * Records or retrieves an onboarding operation for tracking durable execution.
   */
  async recordOperation(
    communityId: string,
    applicantDiscordUserId: string,
    operationType: OnboardingOperationType,
    initialStatus: OnboardingOperationStatus = 'PENDING',
    applicationId?: string
  ): Promise<OnboardingOperation> {
    const existing = await onboardingOperationsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'applicantDiscordUserId', operator: '==', value: applicantDiscordUserId },
        { field: 'operationType', operator: '==', value: operationType },
      ],
      limit: 1,
    });

    const now = new Date().toISOString();
    if (existing.length > 0) {
      return existing[0];
    }

    return await onboardingOperationsRepository.create({
      communityId,
      applicantDiscordUserId,
      applicationId,
      operationType,
      status: initialStatus,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * Updates operation status after attempt.
   */
  async updateOperationStatus(
    operationId: string,
    status: OnboardingOperationStatus,
    details?: { failureReason?: string; resultDetails?: string }
  ): Promise<OnboardingOperation> {
    const op = await onboardingOperationsRepository.getById(operationId);
    if (!op) {
      throw new Error(`Onboarding operation ${operationId} not found.`);
    }

    const now = new Date().toISOString();
    return await onboardingOperationsRepository.update(operationId, {
      status,
      attempts: op.attempts + 1,
      lastAttemptAt: now,
      failureReason: details?.failureReason,
      resultDetails: details?.resultDetails,
      updatedAt: now,
    });
  }

  /**
   * Lists operations for a community with optional status filter.
   */
  async listOperations(communityId: string, status?: OnboardingOperationStatus): Promise<OnboardingOperation[]> {
    const whereClause: { field: string; operator: '=='; value: string }[] = [
      { field: 'communityId', operator: '==', value: communityId },
    ];
    if (status) {
      whereClause.push({ field: 'status', operator: '==', value: status });
    }

    return await onboardingOperationsRepository.list({
      where: whereClause,
    });
  }

  /**
   * Retries failed onboarding operations idempotently.
   */
  async retryFailedOperations(
    communityId: string,
    targetDiscordUserId?: string
  ): Promise<RetryOperationsResult> {
    logger.info(`[OnboardingOps] Retrying failed operations for community ${communityId} (User filter: ${targetDiscordUserId || 'ALL'})`);

    const where: { field: string; operator: '=='; value: string }[] = [
      { field: 'communityId', operator: '==', value: communityId },
    ];
    if (targetDiscordUserId) {
      where.push({ field: 'applicantDiscordUserId', operator: '==', value: targetDiscordUserId });
    }

    const allOps = await onboardingOperationsRepository.list({ where });
    const failedOps = allOps.filter((op) => op.status === 'FAILED' || op.status === 'PERMISSION_REQUIRED');

    let retriedCount = 0;
    let succeededCount = 0;
    let failedCount = 0;
    const updatedOps: OnboardingOperation[] = [];

    const communityList = await communitiesRepository.list({
      where: [{ field: 'id', operator: '==', value: communityId }],
      limit: 1,
    });
    const guildId = communityList.length > 0 ? communityList[0].guildId : undefined;

    const configs = await welcomeOnboardingConfigsRepository.list({
      where: [{ field: 'communityId', operator: '==', value: communityId }],
      limit: 1,
    });
    const config = configs.length > 0 ? configs[0] : undefined;

    for (const op of failedOps) {
      retriedCount++;
      const now = new Date().toISOString();

      try {
        if (op.operationType === 'ROLE_ASSIGNMENT') {
          if (!guildId || !config?.newMemberRoleId) {
            const updated = await this.updateOperationStatus(op.id, 'NOT_CONFIGURED', {
              failureReason: 'Guild or Member Role ID not configured',
            });
            updatedOps.push(updated);
            failedCount++;
            continue;
          }

          const result = await discordService.assignRole(guildId, op.applicantDiscordUserId, config.newMemberRoleId);
          if (result.success) {
            const updated = await this.updateOperationStatus(op.id, 'SUCCESS', {
              resultDetails: `Successfully assigned role ${config.newMemberRoleId}`,
            });
            updatedOps.push(updated);
            succeededCount++;
          } else {
            const status = result.error?.includes('PERMISSION') || result.error?.includes('HIERARCHY')
              ? 'PERMISSION_REQUIRED'
              : 'FAILED';
            const updated = await this.updateOperationStatus(op.id, status, {
              failureReason: result.error,
            });
            updatedOps.push(updated);
            failedCount++;
          }
        } else if (op.operationType === 'WELCOME_DM') {
          if (!config?.personalWelcomeMessage) {
            const updated = await this.updateOperationStatus(op.id, 'NOT_CONFIGURED', {
              failureReason: 'Personal DM message text not configured',
            });
            updatedOps.push(updated);
            failedCount++;
            continue;
          }

          const dmResult = await discordService.sendDM(op.applicantDiscordUserId, config.personalWelcomeMessage);
          if (dmResult.success) {
            const updated = await this.updateOperationStatus(op.id, 'SUCCESS', {
              resultDetails: `DM delivered, messageId: ${dmResult.messageId}`,
            });
            updatedOps.push(updated);
            succeededCount++;
          } else {
            const updated = await this.updateOperationStatus(op.id, 'FAILED', {
              failureReason: dmResult.failureReason,
            });
            updatedOps.push(updated);
            failedCount++;
          }
        } else if (op.operationType === 'WELCOME_CHANNEL') {
          if (!config?.welcomeChannelId || !config?.serverWelcomeMessage) {
            const updated = await this.updateOperationStatus(op.id, 'NOT_CONFIGURED', {
              failureReason: 'Welcome channel ID or message text not configured',
            });
            updatedOps.push(updated);
            failedCount++;
            continue;
          }

          const msgResult = await discordService.sendChannelMessage(config.welcomeChannelId, config.serverWelcomeMessage);
          if (msgResult.success) {
            const updated = await this.updateOperationStatus(op.id, 'SUCCESS', {
              resultDetails: `Channel message delivered to ${config.welcomeChannelId}`,
            });
            updatedOps.push(updated);
            succeededCount++;
          } else {
            const updated = await this.updateOperationStatus(op.id, 'FAILED', {
              failureReason: msgResult.failureReason,
            });
            updatedOps.push(updated);
            failedCount++;
          }
        } else {
          // RULES_ACKNOWLEDGEMENT or other
          const updated = await this.updateOperationStatus(op.id, 'SKIPPED', {
            resultDetails: 'No retry action needed for this operation type',
          });
          updatedOps.push(updated);
          succeededCount++;
        }
      } catch (err) {
        const updated = await this.updateOperationStatus(op.id, 'FAILED', {
          failureReason: (err as Error).message,
        });
        updatedOps.push(updated);
        failedCount++;
      }
    }

    return {
      communityId,
      totalEvaluated: allOps.length,
      retriedCount,
      succeededCount,
      failedCount,
      operations: updatedOps,
    };
  }
}

export const onboardingOperationsService = new OnboardingOperationsService();
