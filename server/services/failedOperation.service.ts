import { failedOperationsRepository, FailedOperationRecord } from '../repositories/index.js';
import { logger } from '../logging/logger.js';

export interface RecordFailureOptions {
  operationId: string;
  communityId: string;
  resource: string;
  operationType: string;
  errorCode: string;
  errorMessage?: string;
  maxAttempts?: number;
  metadata?: Record<string, any>;
}

export class FailedOperationService {
  private static instance: FailedOperationService;

  private constructor() {}

  public static getInstance(): FailedOperationService {
    if (!FailedOperationService.instance) {
      FailedOperationService.instance = new FailedOperationService();
    }
    return FailedOperationService.instance;
  }

  /**
   * Determine whether an error is permanently non-retryable
   */
  public isPermanentFailure(errorCode: string): boolean {
    const permanentCodes = [
      'PERMISSION_REQUIRED',
      'PERMISSION_DENIED',
      'COMMUNITY_NOT_FOUND',
      'CHANNEL_NOT_FOUND',
      'USER_NOT_FOUND',
      'INVALID_PAYLOAD',
      'ENTITLEMENT_LIMIT_REACHED',
      '50007', // Discord Cannot send messages to this user (DMs closed/blocked)
      '50001', // Discord Missing Access
      '50013', // Discord Missing Permissions
      '10003', // Discord Unknown Channel
    ];
    return permanentCodes.includes(errorCode.toUpperCase()) || permanentCodes.some(c => errorCode.includes(c));
  }

  /**
   * Calculate exponential backoff duration with jitter in milliseconds
   */
  public calculateBackoffMs(attempt: number): number {
    const base = 2000; // 2 seconds
    const max = 60000; // 60 seconds
    const exponential = Math.min(max, base * Math.pow(2, attempt - 1));
    const jitter = Math.floor(Math.random() * 500);
    return exponential + jitter;
  }

  /**
   * Record a failure and determine whether it enters PENDING_RETRY or DEAD_LETTER status
   */
  public async recordFailure(options: RecordFailureOptions): Promise<FailedOperationRecord> {
    const {
      operationId,
      communityId,
      resource,
      operationType,
      errorCode,
      errorMessage,
      maxAttempts = 3,
      metadata = {},
    } = options;

    const now = new Date().toISOString();
    const existing = await failedOperationsRepository.getById(operationId);
    const attemptCount = (existing?.attemptCount || 0) + 1;

    const isPermanent = this.isPermanentFailure(errorCode);
    const isExhausted = attemptCount >= maxAttempts;

    let finalStatus: 'PENDING_RETRY' | 'EXHAUSTED' | 'DEAD_LETTER' = 'PENDING_RETRY';
    let nextRetryAt: string | undefined = undefined;

    if (isPermanent) {
      finalStatus = 'DEAD_LETTER';
    } else if (isExhausted) {
      finalStatus = 'EXHAUSTED';
    } else {
      const backoffMs = this.calculateBackoffMs(attemptCount);
      nextRetryAt = new Date(Date.now() + backoffMs).toISOString();
    }

    const record: FailedOperationRecord = {
      id: operationId,
      communityId,
      resource,
      operationType,
      attemptCount,
      lastErrorCode: errorCode,
      lastErrorMessage: errorMessage?.substring(0, 500),
      lastAttemptedAt: now,
      nextRetryAt,
      finalStatus,
      metadata,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    await failedOperationsRepository.upsert(record);
    logger.warn(`[FailedOperation] Recorded failure for ${operationId} (Attempt: ${attemptCount}, Status: ${finalStatus}, Error: ${errorCode})`);

    return record;
  }

  /**
   * Mark an operation as successfully resolved
   */
  public async markResolved(operationId: string): Promise<void> {
    const now = new Date().toISOString();
    await failedOperationsRepository.update(operationId, {
      finalStatus: 'RESOLVED',
      nextRetryAt: undefined,
      updatedAt: now,
    });
  }

  /**
   * List dead letter / exhausted operations for inspection
   */
  public async listDeadLetters(communityId?: string): Promise<FailedOperationRecord[]> {
    const all = await failedOperationsRepository.list();
    return all.filter(r => {
      const isDead = r.finalStatus === 'DEAD_LETTER' || r.finalStatus === 'EXHAUSTED';
      if (!isDead) return false;
      return communityId ? r.communityId === communityId : true;
    });
  }
}

export const failedOperationService = FailedOperationService.getInstance();
