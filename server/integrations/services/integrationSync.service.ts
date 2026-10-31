import {
  IntegrationKey,
  IntegrationSyncDirection,
  IntegrationSyncRecord,
  IntegrationSyncStatus,
} from '../../../shared/types/integrations.js';
import { integrationSyncsRepository } from '../../repositories/index.js';
import { auditService } from '../../services/audit.service.js';
import { UsageService } from '../../services/entitlement.service.js';
import { AutomationEventBusService } from '../../services/automation.service.js';
import { logger } from '../../logging/logger.js';
import { UserRole } from '../../../shared/types/rbac.js';

export interface StartSyncParams {
  communityId: string;
  integration: IntegrationKey;
  resource: string;
  direction?: IntegrationSyncDirection;
  cursor?: string;
  checkpoint?: Record<string, unknown>;
  actorUserId?: string;
  actorRole?: UserRole;
}

export interface CompleteSyncParams {
  syncId: string;
  recordsProcessed: number;
  recordsSucceeded: number;
  recordsFailed: number;
  errorSummary?: string;
  nextCursor?: string;
  checkpoint?: Record<string, unknown>;
  actorUserId?: string;
  actorRole?: UserRole;
}

export class IntegrationSyncService {
  /**
   * Begins a durable synchronization session.
   */
  static async startSync(params: StartSyncParams): Promise<IntegrationSyncRecord> {
    const now = new Date().toISOString();
    const syncId = `sync_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const syncRecord: IntegrationSyncRecord = {
      id: syncId,
      communityId: params.communityId,
      integration: params.integration,
      resource: params.resource,
      direction: params.direction || 'OUTBOUND',
      status: 'RUNNING',
      startedAt: now,
      recordsProcessed: 0,
      recordsSucceeded: 0,
      recordsFailed: 0,
      cursor: params.cursor,
      checkpoint: params.checkpoint,
      createdAt: now,
      updatedAt: now,
    };

    await integrationSyncsRepository.create(syncRecord);

    // Audit log sync start
    await auditService.record({
      communityId: params.communityId,
      actorUserId: params.actorUserId || 'SYSTEM',
      actorRole: params.actorRole || 'OWNER',
      action: 'INTEGRATION_SYNC_STARTED',
      targetType: 'integration_sync',
      targetId: syncId,
      metadata: {
        integration: params.integration,
        resource: params.resource,
        direction: syncRecord.direction,
      },
    });

    // Track usage metric
    await UsageService.recordUsage(params.communityId, 'INTEGRATION_SYNC_RUNS', 1);

    logger.info(
      `[IntegrationSyncService] Started sync ${syncId} (${params.integration} -> ${params.resource}) for ${params.communityId}`
    );

    return syncRecord;
  }

  /**
   * Updates intermediate progress during a running synchronization session.
   */
  static async updateProgress(
    syncId: string,
    progress: { recordsProcessed: number; recordsSucceeded: number; recordsFailed: number }
  ): Promise<IntegrationSyncRecord> {
    const sync = await integrationSyncsRepository.getById(syncId);
    if (!sync) {
      throw new Error(`Integration sync job '${syncId}' not found.`);
    }

    const updated = await integrationSyncsRepository.update(sync.id, {
      recordsProcessed: progress.recordsProcessed,
      recordsSucceeded: progress.recordsSucceeded,
      recordsFailed: progress.recordsFailed,
      updatedAt: new Date().toISOString(),
    });

    return updated;
  }

  /**
   * Finalizes a durable synchronization session, determining status and emitting metrics.
   */
  static async completeSync(params: CompleteSyncParams): Promise<IntegrationSyncRecord> {
    const sync = await integrationSyncsRepository.getById(params.syncId);
    if (!sync) {
      throw new Error(`Integration sync job '${params.syncId}' not found.`);
    }

    const now = new Date().toISOString();
    let finalStatus: IntegrationSyncStatus = 'COMPLETED';

    if (params.recordsFailed > 0 && params.recordsSucceeded > 0) {
      finalStatus = 'PARTIAL';
    } else if (params.recordsFailed > 0 && params.recordsSucceeded === 0 && params.recordsProcessed > 0) {
      finalStatus = 'FAILED';
    }

    const updated = await integrationSyncsRepository.update(sync.id, {
      status: finalStatus,
      completedAt: now,
      recordsProcessed: params.recordsProcessed,
      recordsSucceeded: params.recordsSucceeded,
      recordsFailed: params.recordsFailed,
      errorSummary: params.errorSummary,
      cursor: params.nextCursor || sync.cursor,
      checkpoint: params.checkpoint || sync.checkpoint,
      updatedAt: now,
    });

    // Determine audit action
    const auditAction =
      finalStatus === 'COMPLETED'
        ? 'INTEGRATION_SYNC_COMPLETED'
        : finalStatus === 'PARTIAL'
        ? 'INTEGRATION_SYNC_PARTIAL'
        : 'INTEGRATION_SYNC_FAILED';

    await auditService.record({
      communityId: sync.communityId,
      actorUserId: params.actorUserId || 'SYSTEM',
      actorRole: params.actorRole || 'OWNER',
      action: auditAction,
      targetType: 'integration_sync',
      targetId: sync.id,
      metadata: {
        integration: sync.integration,
        resource: sync.resource,
        status: finalStatus,
        recordsProcessed: params.recordsProcessed,
        recordsSucceeded: params.recordsSucceeded,
        recordsFailed: params.recordsFailed,
        errorSummary: params.errorSummary,
      },
    });

    // Track records usage metric
    if (params.recordsSucceeded > 0) {
      await UsageService.recordUsage(sync.communityId, 'INTEGRATION_SYNC_RECORDS', params.recordsSucceeded);
    }

    // Publish event into automation engine
    try {
      await AutomationEventBusService.publish({
        eventType: 'RECRUITMENT_RECORD_UPDATED',
        communityId: sync.communityId,
        resourceType: 'integration_sync',
        resourceId: sync.id,
        metadata: {
          integration: sync.integration,
          resource: sync.resource,
          status: finalStatus,
          recordsSucceeded: params.recordsSucceeded,
        },
      });
    } catch (err) {
      logger.warn('[IntegrationSyncService] Failed to emit automation event:', undefined, { error: (err as Error).message });
    }

    logger.info(
      `[IntegrationSyncService] Finalized sync ${sync.id} with status ${finalStatus} (${params.recordsSucceeded} succeeded, ${params.recordsFailed} failed)`
    );

    return updated;
  }

  /**
   * Retrieves sync history for a community tenant.
   */
  static async getHistory(communityId: string, integration?: IntegrationKey, limit = 20): Promise<IntegrationSyncRecord[]> {
    const list = await integrationSyncsRepository.listForTenant(communityId);
    let filtered = list;
    if (integration) {
      filtered = filtered.filter((s) => s.integration === integration);
    }
    return filtered
      .sort((a, b) => {
        const diff = new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
        if (diff !== 0) return diff;
        return (b.completedAt || b.updatedAt || '').localeCompare(a.completedAt || a.updatedAt || '');
      })
      .slice(0, limit);
  }

  /**
   * Retrieves the most recent sync record for an integration.
   */
  static async getLatestSync(communityId: string, integration: IntegrationKey): Promise<IntegrationSyncRecord | null> {
    const history = await this.getHistory(communityId, integration, 1);
    return history[0] || null;
  }
}
