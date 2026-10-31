import { auditService } from '../audit.service.js';
import type { UserRole } from '../../../shared/types/rbac.js';
import { AuditAction } from '../../../shared/types/models.js';
import { logger } from '../../logging/logger.js';

export interface LogAiQueryParams {
  communityId: string;
  actorUserId: string;
  actorRole: UserRole;
  promptSnippet: string;
  latencyMs: number;
  model: string;
  success: boolean;
  requestId?: string;
  ipAddress?: string;
}

export interface LogAiSafetyViolationParams {
  communityId: string;
  actorUserId: string;
  actorRole: UserRole;
  reason: string;
  requestId?: string;
  ipAddress?: string;
}

export interface LogAiActionPlannedParams {
  communityId: string;
  actorUserId: string;
  actorRole: UserRole;
  actionType: string;
  actionId: string;
  module: string;
  requestId?: string;
}

export class AiAuditService {
  static async logQueryExecuted(params: LogAiQueryParams): Promise<void> {
    try {
      await auditService.record({
        communityId: params.communityId,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'AI_QUERY_EXECUTED',
        targetType: 'AI_CONSULTATION',
        targetId: `ai_query_${Date.now()}`,
        metadata: {
          promptSnippet: params.promptSnippet.substring(0, 100),
          latencyMs: params.latencyMs,
          model: params.model,
          success: params.success,
        },
        requestId: params.requestId,
        ipAddressIfAvailable: params.ipAddress,
      });
    } catch (err) {
      logger.warn('[AiAuditService] Failed to record AI_QUERY_EXECUTED audit log:', err);
    }
  }

  static async logSafetyViolation(params: LogAiSafetyViolationParams): Promise<void> {
    try {
      await auditService.record({
        communityId: params.communityId,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'AI_SAFETY_VIOLATION',
        targetType: 'AI_SECURITY_POLICY',
        targetId: `violation_${Date.now()}`,
        metadata: {
          reason: params.reason,
        },
        requestId: params.requestId,
        ipAddressIfAvailable: params.ipAddress,
      });
    } catch (err) {
      logger.warn('[AiAuditService] Failed to record AI_SAFETY_VIOLATION audit log:', err);
    }
  }

  static async logSecurityEvent(params: {
    communityId: string;
    actorUserId: string;
    actorRole: UserRole;
    action:
      | 'AI_PROMPT_INJECTION_BLOCKED'
      | 'AI_SECRET_REDACTION'
      | 'AI_UNSAFE_REQUEST_BLOCKED'
      | 'AI_CONTEXT_BOUNDARY_VIOLATION'
      | 'AI_OUTPUT_VALIDATION_FAILED'
      | 'AI_SAFETY_VIOLATION';
    reason: string;
    details?: Record<string, unknown>;
    requestId?: string;
    ipAddress?: string;
  }): Promise<void> {
    try {
      await auditService.record({
        communityId: params.communityId,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: params.action as AuditAction,
        targetType: 'AI_SECURITY_POLICY',
        targetId: `sec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        metadata: {
          reason: params.reason,
          ...(params.details || {}),
        },
        requestId: params.requestId,
        ipAddressIfAvailable: params.ipAddress,
      });
    } catch (err) {
      logger.warn(`[AiAuditService] Failed to record ${params.action} audit log:`, err);
    }
  }

  static async logPromptInjectionBlocked(params: {
    communityId: string;
    actorUserId: string;
    actorRole: UserRole;
    reason: string;
    details?: Record<string, unknown>;
    requestId?: string;
    ipAddress?: string;
  }): Promise<void> {
    return this.logSecurityEvent({
      ...params,
      action: 'AI_PROMPT_INJECTION_BLOCKED',
    });
  }

  static async logSecretRedaction(params: {
    communityId: string;
    actorUserId: string;
    actorRole: UserRole;
    reason: string;
    redactedCount: number;
    details?: Record<string, unknown>;
    requestId?: string;
  }): Promise<void> {
    return this.logSecurityEvent({
      ...params,
      action: 'AI_SECRET_REDACTION',
      details: {
        ...(params.details || {}),
        redactedCount: params.redactedCount,
      },
    });
  }

  static async logUnsafeRequestBlocked(params: {
    communityId: string;
    actorUserId: string;
    actorRole: UserRole;
    reason: string;
    details?: Record<string, unknown>;
    requestId?: string;
  }): Promise<void> {
    return this.logSecurityEvent({
      ...params,
      action: 'AI_UNSAFE_REQUEST_BLOCKED',
    });
  }

  static async logContextBoundaryViolation(params: {
    communityId: string;
    actorUserId: string;
    actorRole: UserRole;
    reason: string;
    details?: Record<string, unknown>;
    requestId?: string;
  }): Promise<void> {
    return this.logSecurityEvent({
      ...params,
      action: 'AI_CONTEXT_BOUNDARY_VIOLATION',
    });
  }

  static async logOutputValidationFailed(params: {
    communityId: string;
    actorUserId: string;
    actorRole: UserRole;
    reason: string;
    violations: string[];
    requestId?: string;
  }): Promise<void> {
    return this.logSecurityEvent({
      ...params,
      action: 'AI_OUTPUT_VALIDATION_FAILED',
      details: {
        violations: params.violations,
      },
    });
  }

  static async logActionPlanned(params: LogAiActionPlannedParams): Promise<void> {
    try {
      await auditService.record({
        communityId: params.communityId,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'AI_ACTION_PLANNED',
        targetType: 'AI_PLANNED_ACTION',
        targetId: params.actionId,
        metadata: {
          actionType: params.actionType,
          module: params.module,
        },
        requestId: params.requestId,
      });
    } catch (err) {
      logger.warn('[AiAuditService] Failed to record AI_ACTION_PLANNED audit log:', err);
    }
  }

  static async logActionPreviewCreated(params: {
    communityId: string;
    actorUserId: string;
    actorRole: UserRole;
    actionId: string;
    actionType: string;
    targetResource?: string;
    requiredPermission?: string;
    requestId?: string;
  }): Promise<void> {
    try {
      await auditService.record({
        communityId: params.communityId,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'AI_ACTION_PREVIEW_CREATED',
        targetType: 'AI_ACTION',
        targetId: params.actionId,
        metadata: {
          actionType: params.actionType,
          targetResource: params.targetResource,
          requiredPermission: params.requiredPermission,
        },
        requestId: params.requestId,
      });
    } catch (err) {
      logger.warn('[AiAuditService] Failed to record AI_ACTION_PREVIEW_CREATED audit log:', err);
    }
  }

  static async logActionConfirmed(params: {
    communityId: string;
    actorUserId: string;
    actorRole: UserRole;
    actionId: string;
    actionType: string;
    confirmedAt: string;
    requestId?: string;
  }): Promise<void> {
    try {
      await auditService.record({
        communityId: params.communityId,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'AI_ACTION_CONFIRMED',
        targetType: 'AI_ACTION',
        targetId: params.actionId,
        metadata: {
          actionType: params.actionType,
          confirmedAt: params.confirmedAt,
        },
        requestId: params.requestId,
      });
    } catch (err) {
      logger.warn('[AiAuditService] Failed to record AI_ACTION_CONFIRMED audit log:', err);
    }
  }

  static async logActionExecuted(params: {
    communityId: string;
    actorUserId: string;
    actorRole: UserRole;
    actionId: string;
    actionType: string;
    resourceId?: string;
    resourceType?: string;
    details?: Record<string, unknown>;
    requestId?: string;
  }): Promise<void> {
    try {
      await auditService.record({
        communityId: params.communityId,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'AI_ACTION_EXECUTED',
        targetType: 'AI_ACTION',
        targetId: params.actionId,
        metadata: {
          actionType: params.actionType,
          resourceId: params.resourceId,
          resourceType: params.resourceType,
          details: params.details,
        },
        requestId: params.requestId,
      });
    } catch (err) {
      logger.warn('[AiAuditService] Failed to record AI_ACTION_EXECUTED audit log:', err);
    }
  }

  static async logActionFailed(params: {
    communityId: string;
    actorUserId: string;
    actorRole: UserRole;
    actionId: string;
    actionType: string;
    error: string;
    reason?: string;
    requestId?: string;
  }): Promise<void> {
    try {
      await auditService.record({
        communityId: params.communityId,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'AI_ACTION_FAILED',
        targetType: 'AI_ACTION',
        targetId: params.actionId,
        metadata: {
          actionType: params.actionType,
          error: params.error,
          reason: params.reason,
        },
        requestId: params.requestId,
      });
    } catch (err) {
      logger.warn('[AiAuditService] Failed to record AI_ACTION_FAILED audit log:', err);
    }
  }

  static async logActionBlocked(params: {
    communityId: string;
    actorUserId: string;
    actorRole: UserRole;
    actionId: string;
    actionType: string;
    reason: string;
    policyName?: string;
    requestId?: string;
  }): Promise<void> {
    try {
      await auditService.record({
        communityId: params.communityId,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'AI_ACTION_BLOCKED',
        targetType: 'AI_ACTION',
        targetId: params.actionId,
        metadata: {
          actionType: params.actionType,
          reason: params.reason,
          policyName: params.policyName || 'AI_SAFETY_POLICY',
        },
        requestId: params.requestId,
      });
    } catch (err) {
      logger.warn('[AiAuditService] Failed to record AI_ACTION_BLOCKED audit log:', err);
    }
  }

  static async logActionPermissionDenied(params: {
    communityId: string;
    actorUserId: string;
    actorRole: UserRole;
    actionId: string;
    actionType: string;
    requiredPermission: string;
    reason?: string;
    requestId?: string;
  }): Promise<void> {
    try {
      await auditService.record({
        communityId: params.communityId,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'AI_ACTION_PERMISSION_DENIED',
        targetType: 'AI_ACTION',
        targetId: params.actionId,
        metadata: {
          actionType: params.actionType,
          requiredPermission: params.requiredPermission,
          reason: params.reason,
        },
        requestId: params.requestId,
      });
    } catch (err) {
      logger.warn('[AiAuditService] Failed to record AI_ACTION_PERMISSION_DENIED audit log:', err);
    }
  }

  static async logQuotaChecked(params: {
    communityId: string;
    actorUserId: string;
    actorRole: UserRole;
    capability: string;
    allowed: boolean;
    currentUsage: number;
    limit: number;
    requestId?: string;
    ipAddress?: string;
  }): Promise<void> {
    try {
      await auditService.record({
        communityId: params.communityId,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'AI_QUOTA_CHECKED',
        targetType: 'AI_USAGE_QUOTA',
        targetId: `quota_${params.communityId}_${Date.now()}`,
        metadata: {
          capability: params.capability,
          allowed: params.allowed,
          currentUsage: params.currentUsage,
          limit: params.limit,
        },
        requestId: params.requestId,
        ipAddressIfAvailable: params.ipAddress,
      });
    } catch (err) {
      logger.warn('[AiAuditService] Failed to record AI_QUOTA_CHECKED audit log:', err);
    }
  }

  static async logQuotaExceeded(params: {
    communityId: string;
    actorUserId: string;
    actorRole: UserRole;
    capability: string;
    currentUsage: number;
    limit: number;
    reason: string;
    requestId?: string;
    ipAddress?: string;
  }): Promise<void> {
    try {
      await auditService.record({
        communityId: params.communityId,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'AI_QUOTA_EXCEEDED',
        targetType: 'AI_USAGE_QUOTA',
        targetId: `quota_exceeded_${params.communityId}_${Date.now()}`,
        metadata: {
          capability: params.capability,
          currentUsage: params.currentUsage,
          limit: params.limit,
          reason: params.reason,
        },
        requestId: params.requestId,
        ipAddressIfAvailable: params.ipAddress,
      });
    } catch (err) {
      logger.warn('[AiAuditService] Failed to record AI_QUOTA_EXCEEDED audit log:', err);
    }
  }

  static async logRateLimited(params: {
    communityId: string;
    actorUserId: string;
    actorRole: UserRole;
    capability: string;
    reason: string;
    requestId?: string;
    ipAddress?: string;
  }): Promise<void> {
    try {
      await auditService.record({
        communityId: params.communityId,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'AI_RATE_LIMITED',
        targetType: 'AI_USAGE_QUOTA',
        targetId: `rate_limit_${params.communityId}_${Date.now()}`,
        metadata: {
          capability: params.capability,
          reason: params.reason,
        },
        requestId: params.requestId,
        ipAddressIfAvailable: params.ipAddress,
      });
    } catch (err) {
      logger.warn('[AiAuditService] Failed to record AI_RATE_LIMITED audit log:', err);
    }
  }

  static async logFeatureBlocked(params: {
    communityId: string;
    actorUserId: string;
    actorRole: UserRole;
    featureKey: string;
    reason: string;
    requestId?: string;
    ipAddress?: string;
  }): Promise<void> {
    try {
      await auditService.record({
        communityId: params.communityId,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'AI_FEATURE_BLOCKED',
        targetType: 'AI_ENTITLEMENT',
        targetId: `feature_blocked_${params.communityId}_${Date.now()}`,
        metadata: {
          featureKey: params.featureKey,
          reason: params.reason,
        },
        requestId: params.requestId,
        ipAddressIfAvailable: params.ipAddress,
      });
    } catch (err) {
      logger.warn('[AiAuditService] Failed to record AI_FEATURE_BLOCKED audit log:', err);
    }
  }

  static async logOperationalEvent(params: {
    communityId: string;
    actorUserId: string;
    actorRole: UserRole;
    action: string;
    category: string;
    success: boolean;
    latencyMs?: number;
    correlationId: string;
    error?: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await auditService.record({
        communityId: params.communityId,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: 'AI_OPERATIONAL_EVENT' as AuditAction,
        targetType: 'AI_TELEMETRY',
        targetId: `op_${params.correlationId}`,
        metadata: {
          opAction: params.action,
          category: params.category,
          success: params.success,
          latencyMs: params.latencyMs || 0,
          error: params.error,
          details: params.details,
        },
        requestId: params.correlationId,
      });
    } catch (err) {
      logger.warn('[AiAuditService] Failed to record AI_OPERATIONAL_EVENT audit log:', err);
    }
  }
}

