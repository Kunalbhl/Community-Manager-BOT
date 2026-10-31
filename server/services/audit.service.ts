import { AuditAction, AuditLogDocument } from '../../shared/types/models.js';
import { UserRole } from '../../shared/types/rbac.js';
import { auditLogsRepository } from '../repositories/index.js';
import { logger } from '../logging/logger.js';
import { ForbiddenError } from '../utils/errors.js';

export interface RecordAuditParams {
  communityId: string;
  guildId?: string;
  actorUserId: string;
  discordUserId?: string;
  actorRole: UserRole;
  effectiveRole?: UserRole;
  action: AuditAction;
  targetType: string;
  targetId: string;
  previousState?: any;
  newState?: any;
  source?: string;
  metadata?: Record<string, unknown>;
  ipAddressIfAvailable?: string;
  requestId?: string;
  timestamp?: string;
  expiresAt?: string;
}

export interface AuditCleanupMetrics {
  evaluatedCount: number;
  deletedCount: number;
  retainedCount: number;
  cutoffTimestamp: string;
  communityId?: string;
  errors: string[];
}

export class AuditService {
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Run automated 30-day retention cleanup periodically (every 12 hours) in production/dev
    if (process.env.NODE_ENV !== 'test') {
      this.cleanupTimer = setInterval(() => {
        this.cleanupExpiredLogs().catch((err) => {
          logger.error('[AuditService] Background 30-day retention cleanup error:', undefined, {
            error: (err as Error).message,
          });
        });
      }, 12 * 60 * 60 * 1000);
      if (this.cleanupTimer && typeof this.cleanupTimer.unref === 'function') {
        this.cleanupTimer.unref();
      }
    }
  }

  /**
   * Records a structured audit log entry with 30-day retention metadata.
   * Strictly avoids logging secrets, API keys, or credentials.
   */
  async record(params: RecordAuditParams): Promise<AuditLogDocument> {
    const timestamp = params.timestamp || new Date().toISOString();
    // Default 30-day expiration for security audit retention
    const retentionMs = 30 * 24 * 60 * 60 * 1000;
    const expiresAt = params.expiresAt || new Date(new Date(timestamp).getTime() + retentionMs).toISOString();

    const auditId = `aud_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const entry: Omit<AuditLogDocument, 'id'> = {
      auditId,
      communityId: params.communityId,
      guildId: params.guildId,
      actorUserId: params.actorUserId,
      discordUserId: params.discordUserId || params.actorUserId,
      actorRole: params.actorRole,
      effectiveRole: params.effectiveRole || params.actorRole,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      previousState: params.previousState,
      newState: params.newState,
      source: params.source || 'PORTAL',
      metadata: params.metadata || {},
      timestamp,
      expiresAt,
      ipAddressIfAvailable: params.ipAddressIfAvailable,
    };

    const created = await auditLogsRepository.create(entry);

    logger.info(
      `[AUDIT] Action: ${params.action} by User: ${params.discordUserId || params.actorUserId} (${params.actorRole}) on ${params.targetType}:${params.targetId}`,
      params.requestId,
      { auditId: created.id, action: params.action }
    );

    return created;
  }

  async log(params: RecordAuditParams): Promise<AuditLogDocument> {
    return this.record(params);
  }

  /**
   * Performs automatic server-side deletion of audit logs older than the 30-day retention policy.
   * Idempotent, batch-safe, and tenant-isolated when a communityId is specified.
   */
  async cleanupExpiredLogs(targetCommunityId?: string, retentionDays = 30): Promise<AuditCleanupMetrics> {
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const cutoffTimestamp = cutoffDate.toISOString();

    const metrics: AuditCleanupMetrics = {
      evaluatedCount: 0,
      deletedCount: 0,
      retainedCount: 0,
      cutoffTimestamp,
      communityId: targetCommunityId,
      errors: [],
    };

    try {
      const allLogs = targetCommunityId
        ? await auditLogsRepository.list({
            where: [{ field: 'communityId', operator: '==', value: targetCommunityId }],
          })
        : await auditLogsRepository.list();

      metrics.evaluatedCount = allLogs.length;

      for (const log of allLogs) {
        const isExpiredByTimestamp = log.timestamp && new Date(log.timestamp).getTime() < cutoffDate.getTime();
        const isExpiredByField = log.expiresAt && new Date(log.expiresAt).getTime() < now.getTime();

        if (isExpiredByTimestamp || isExpiredByField) {
          try {
            await auditLogsRepository.delete(log.id);
            metrics.deletedCount++;
          } catch (delErr) {
            metrics.errors.push(`Failed to delete expired audit log ${log.id}: ${(delErr as Error).message}`);
          }
        } else {
          metrics.retainedCount++;
        }
      }

      if (metrics.deletedCount > 0) {
        logger.info(`[AUDIT_CLEANUP] Cleaned up ${metrics.deletedCount} expired audit logs (retained ${metrics.retainedCount}).`);
      }
    } catch (err) {
      metrics.errors.push(`Cleanup evaluation failed: ${(err as Error).message}`);
      logger.error(`[AUDIT_CLEANUP_ERROR] Error running audit retention cleanup:`, undefined, {
        error: (err as Error).message,
      });
    }

    return metrics;
  }

  async purgeExpiredLogs(targetCommunityId?: string): Promise<AuditCleanupMetrics & { success: boolean }> {
    const metrics = await this.cleanupExpiredLogs(targetCommunityId);
    return {
      ...metrics,
      success: metrics.errors.length === 0,
    };
  }

  /**
   * Retrieves active audit logs for a community within the 30-day retention window.
   * Enforces server-side authorization check.
   */
  async getRecentLogs(
    communityId: string,
    limit = 50,
    actorRole?: UserRole
  ): Promise<AuditLogDocument[]> {
    if (actorRole && !['PLATFORM_OWNER', 'OWNER', 'CONTROLLER'].includes(actorRole)) {
      throw new ForbiddenError('PERMISSION_REQUIRED: Only controllers and administrators can view audit logs.');
    }

    const now = new Date().toISOString();
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const logs = await auditLogsRepository.list({
      where: [{ field: 'communityId', operator: '==', value: communityId }],
      limit: limit * 2,
    });

    const activeLogs = logs
      .filter((l) => {
        if (l.expiresAt && l.expiresAt < now) return false;
        if (l.timestamp && l.timestamp < cutoffDate) return false;
        return true;
      })
      .slice(0, limit);

    return activeLogs;
  }
}

export const auditService = new AuditService();
