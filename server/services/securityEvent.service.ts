import { auditLogsRepository, platformAuditLogsRepository } from '../repositories/index.js';
import { logger } from '../logging/logger.js';
import { observabilityService } from './observability/observability.service.js';

export type SecurityEventType =
  | 'TENANT_MISMATCH'
  | 'ROLE_SPOOF_ATTEMPT'
  | 'IDENTITY_SPOOF_ATTEMPT'
  | 'INVALID_SESSION'
  | 'EXPIRED_SESSION'
  | 'OAUTH_STATE_REPLAY'
  | 'OAUTH_STATE_MISMATCH'
  | 'PRODUCTION_SIMULATION_ATTEMPT'
  | 'RUNTIME_MODE_OVERRIDE_ATTEMPT'
  | 'UNAUTHORIZED_PLATFORM_OWNER_ACCESS'
  | 'INVALID_SIGNATURE_OR_CLAIM'
  | 'REPEATED_FAILED_AUTH';

export interface SecurityEventPayload {
  type: SecurityEventType;
  actorUserId?: string;
  communityId?: string;
  route?: string;
  ip?: string;
  reason: string;
  metadata?: Record<string, any>;
}

export class SecurityEventService {
  private static instance: SecurityEventService;

  private constructor() {}

  public static getInstance(): SecurityEventService {
    if (!SecurityEventService.instance) {
      SecurityEventService.instance = new SecurityEventService();
    }
    return SecurityEventService.instance;
  }

  public async recordEvent(payload: SecurityEventPayload): Promise<void> {
    const { type, actorUserId = 'anonymous', communityId = 'platform', route, reason, metadata = {} } = payload;
    const now = new Date().toISOString();
    const eventId = `sec_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 1. Structured log
    logger.warn(`[SECURITY_EVENT] [${type}] Actor: ${actorUserId}, Tenant: ${communityId}, Route: ${route || 'N/A'}, Reason: ${reason}`);

    // 2. Incident tracking for high-severity security events
    if (
      type === 'UNAUTHORIZED_PLATFORM_OWNER_ACCESS' ||
      type === 'RUNTIME_MODE_OVERRIDE_ATTEMPT' ||
      type === 'PRODUCTION_SIMULATION_ATTEMPT' ||
      type === 'TENANT_MISMATCH'
    ) {
      try {
        await observabilityService.recordIncident({
          category: 'AUTHORIZATION_FAILED',
          dependency: 'SecurityEngine',
          summary: `Security Event: ${type} - ${reason}`,
          severity: 'HIGH',
          recoveryInstructions: 'Review actor logs and verify tenant boundary integrity.',
        });
      } catch (err: any) {
        logger.error(`[SecurityEvent] Failed to record incident: ${err.message}`);
      }
    }

    // 3. Durable audit logging
    try {
      if (communityId && communityId !== 'platform') {
        await auditLogsRepository.create({
          id: eventId,
          communityId,
          actorUserId,
          actorRole: 'MEMBER',
          action: 'USER_ROLE_CHANGED',
          targetType: 'SYSTEM',
          targetId: 'security',
          metadata: {
            securityEventType: type,
            route,
            reason,
            ...metadata,
          },
          timestamp: now,
        });
      } else {
        await platformAuditLogsRepository.create({
          id: eventId,
          actorUserId,
          actorRole: 'OWNER',
          action: 'SECURITY_EVENT',
          targetType: 'SYSTEM_SETTINGS',
          targetId: 'security',
          metadata: {
            securityEventType: type,
            route,
            reason,
            ...metadata,
          },
          timestamp: now,
        });
      }
    } catch (err: any) {
      logger.error(`[SecurityEvent] Failed to persist audit record: ${err.message}`);
    }
  }
}

export const securityEventService = SecurityEventService.getInstance();
