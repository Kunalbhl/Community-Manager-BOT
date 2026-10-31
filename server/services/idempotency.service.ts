import { idempotencyRecordsRepository, IdempotencyRecord } from '../repositories/index.js';
import { logger } from '../logging/logger.js';

export class IdempotencyService {
  private static instance: IdempotencyService;
  private inMemoryLocks = new Map<string, { lockedUntil: number }>();

  private constructor() {}

  public static getInstance(): IdempotencyService {
    if (!IdempotencyService.instance) {
      IdempotencyService.instance = new IdempotencyService();
    }
    return IdempotencyService.instance;
  }

  /**
   * Acquire execution rights for an idempotency key.
   * Returns:
   * - { status: 'CACHED', response: any }: previously completed execution result
   * - { status: 'LOCKED' }: currently being executed by another process
   * - { status: 'PROCEED' }: clean state, caller may execute and must call recordCompletion/recordFailure
   */
  public async acquire(
    key: string,
    operationType: string,
    communityId?: string,
    lockDurationMs: number = 30000
  ): Promise<{ status: 'CACHED' | 'LOCKED' | 'PROCEED'; response?: any }> {
    if (!key) {
      return { status: 'PROCEED' };
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // 1. In-memory fast lock check
    const existingMemLock = this.inMemoryLocks.get(key);
    if (existingMemLock && existingMemLock.lockedUntil > now) {
      return { status: 'LOCKED' };
    }

    // 2. Persistent store check
    try {
      const existing = await idempotencyRecordsRepository.getById(key);
      if (existing) {
        if (existing.status === 'COMPLETED') {
          return { status: 'CACHED', response: existing.responsePayload };
        }
        if (existing.status === 'PENDING' && existing.lockedUntil) {
          const lockTime = new Date(existing.lockedUntil).getTime();
          if (lockTime > now) {
            return { status: 'LOCKED' };
          }
        }
      }

      // 3. Establish lock
      const expiresAt = new Date(now + 86400000).toISOString(); // 24h retention
      const lockedUntil = new Date(now + lockDurationMs).toISOString();

      this.inMemoryLocks.set(key, { lockedUntil: now + lockDurationMs });

      await idempotencyRecordsRepository.upsert({
        id: key,
        communityId,
        operationType,
        status: 'PENDING',
        createdAt: nowIso,
        expiresAt,
        lockedUntil,
      });

      return { status: 'PROCEED' };
    } catch (err: any) {
      logger.warn(`[Idempotency] Storage check failed for key ${key}, falling back to memory lock: ${err.message}`);
      this.inMemoryLocks.set(key, { lockedUntil: now + lockDurationMs });
      return { status: 'PROCEED' };
    }
  }

  /**
   * Complete idempotent operation with saved response payload.
   */
  public async complete(key: string, responsePayload: any, resourceId?: string): Promise<void> {
    if (!key) return;
    this.inMemoryLocks.delete(key);
    try {
      await idempotencyRecordsRepository.update(key, {
        status: 'COMPLETED',
        responsePayload,
        resourceId,
        lockedUntil: undefined as any,
      });
    } catch (err: any) {
      logger.error(`[Idempotency] Failed to mark ${key} as COMPLETED: ${err.message}`);
    }
  }

  /**
   * Mark idempotent operation as failed, releasing the lock.
   */
  public async fail(key: string, errorReason?: string): Promise<void> {
    if (!key) return;
    this.inMemoryLocks.delete(key);
    try {
      await idempotencyRecordsRepository.update(key, {
        status: 'FAILED',
        responsePayload: { error: errorReason },
        lockedUntil: undefined as any,
      });
    } catch (err: any) {
      logger.error(`[Idempotency] Failed to mark ${key} as FAILED: ${err.message}`);
    }
  }
}

export const idempotencyService = IdempotencyService.getInstance();
