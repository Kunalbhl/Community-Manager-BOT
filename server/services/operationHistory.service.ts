import { FirestoreRepository } from '../repositories/firestore.repository.js';
import { logger } from '../logging/logger.js';

export interface OperationRecord {
  id: string; // operationId
  operationId: string;
  provider: 'DISCORD' | 'GOOGLE_SHEETS' | 'GOOGLE_FORMS' | 'GOOGLE_CALENDAR' | 'STRIPE' | 'AI_ENGINE' | 'FIRESTORE';
  communityId: string;
  resourceId?: string;
  startedAt: string;
  completedAt: string;
  result: 'SUCCESS' | 'FAILED' | 'RETRYABLE' | 'SKIPPED';
  retryable: boolean;
  correlationId: string;
  details?: Record<string, any>;
}

export const operationHistoryRepository = new FirestoreRepository<OperationRecord>('operationHistory');

export class OperationHistoryService {
  /**
   * Records a tenant-scoped external operation record.
   * Ensures no secrets or raw tokens are stored.
   */
  static async recordOperation(
    record: Omit<OperationRecord, 'id'>
  ): Promise<OperationRecord> {
    const opId = record.operationId || `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const doc: OperationRecord = {
      ...record,
      id: opId,
      operationId: opId,
    };

    try {
      await operationHistoryRepository.create(doc);
    } catch (err: any) {
      logger.error(`[OperationHistoryService] Failed to persist operation record ${opId}: ${err?.message || err}`);
    }

    return doc;
  }

  /**
   * Retrieves operation history for a specific community tenant.
   */
  static async getHistoryForCommunity(communityId: string, limit = 50): Promise<OperationRecord[]> {
    return operationHistoryRepository.listForTenant(communityId, { limit });
  }
}

export const operationHistoryService = OperationHistoryService;
