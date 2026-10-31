import {
  auditLogsRepository,
  platformAuditLogsRepository,
  integrationEventsRepository,
  onboardingOperationsRepository,
} from '../repositories/index.js';

export interface GroupedErrorItem {
  id: string;
  category:
    | 'Discord'
    | 'Google Forms'
    | 'Google Calendar'
    | 'Google Sheets'
    | 'Firebase'
    | 'AI Engine'
    | 'Database'
    | 'Authentication'
    | 'Authorization'
    | 'Onboarding'
    | 'Application Workflow';
  operation: string;
  safeMessage: string;
  occurrenceCount: number;
  latestTimestamp: string;
  communityId?: string;
  retryable: boolean;
  correlationId: string;
}

export interface SecurityEventItem {
  id: string;
  severity: 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';
  category: 'AUTH_FAILURE' | 'CROSS_TENANT' | 'GUILD_MISMATCH' | 'INVALID_CODE' | 'REPLAY_ATTEMPT' | 'SUSPICIOUS_REQUEST';
  eventType?: string;
  actorUserId: string;
  communityId?: string;
  description: string;
  timestamp: string;
  metadata?: any;
}

export class ErrorCenterService {
  private inMemoryErrors: GroupedErrorItem[] = [];
  private inMemorySecurityEvents: SecurityEventItem[] = [];

  async recordError(
    error: Error | string,
    operation: string,
    context?: { communityId?: string; correlationId?: string; category?: GroupedErrorItem['category'] }
  ): Promise<GroupedErrorItem> {
    const errorMsg = typeof error === 'string' ? error : error.message || 'Unknown error occurred';
    const errorType = typeof error === 'string' ? 'Error' : error.name || 'Error';
    const category: GroupedErrorItem['category'] = context?.category || 'Database';
    const correlationId = context?.correlationId || `corr_rec_${Date.now()}`;
    const key = `${category}:${operation}:${errorMsg}`;

    const existing = this.inMemoryErrors.find(
      (e) => e.operation === operation && e.safeMessage === errorMsg && (!context?.communityId || e.communityId === context.communityId)
    );

    if (existing) {
      existing.occurrenceCount += 1;
      existing.latestTimestamp = new Date().toISOString();
      return existing;
    }

    const newError: GroupedErrorItem = {
      id: `err_rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      category,
      operation,
      safeMessage: errorMsg,
      occurrenceCount: 1,
      latestTimestamp: new Date().toISOString(),
      communityId: context?.communityId,
      retryable: true,
      correlationId,
      errorType,
    } as any;

    this.inMemoryErrors.unshift(newError);
    if (this.inMemoryErrors.length > 200) {
      this.inMemoryErrors.pop();
    }
    return newError;
  }

  async recordSecurityEvent(event: {
    eventType?: string;
    category?: SecurityEventItem['category'];
    severity: SecurityEventItem['severity'];
    ipAddress?: string;
    details?: string;
    actorUserId?: string;
    communityId?: string;
    metadata?: any;
  }): Promise<SecurityEventItem> {
    const category: SecurityEventItem['category'] = event.category ||
      (event.eventType === 'SUSPICIOUS_AUTH_ATTEMPT' ? 'AUTH_FAILURE' : (event.eventType as any) || 'SUSPICIOUS_REQUEST');

    const secItem: SecurityEventItem = {
      id: `sec_rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      severity: event.severity,
      category,
      eventType: event.eventType || category,
      actorUserId: event.actorUserId || 'ANONYMOUS',
      communityId: event.communityId,
      description: event.details || `Security event: ${event.eventType || category}`,
      timestamp: new Date().toISOString(),
      metadata: { ipAddress: event.ipAddress, ...event.metadata },
    };

    this.inMemorySecurityEvents.unshift(secItem);
    if (this.inMemorySecurityEvents.length > 200) {
      this.inMemorySecurityEvents.pop();
    }
    return secItem;
  }

  async getGroupedErrors(communityId?: string): Promise<GroupedErrorItem[]> {
    const [auditLogs, platformLogs, integrationEvents, onboardingOps] = await Promise.all([
      auditLogsRepository.list({ limit: 200 }),
      platformAuditLogsRepository.list({ limit: 200 }),
      integrationEventsRepository.list({ limit: 200 }),
      onboardingOperationsRepository.list({ limit: 200 }),
    ]);

    const errorMap = new Map<string, GroupedErrorItem>();

    // 1. Process failed onboarding operations
    for (const op of onboardingOps) {
      if (op.status !== 'FAILED') continue;
      if (communityId && op.communityId !== communityId) continue;

      let category: GroupedErrorItem['category'] = 'Onboarding';
      if (op.operationType === 'WELCOME_DM' || op.operationType === 'WELCOME_CHANNEL') {
        category = 'Discord';
      }

      const msg = op.failureReason || 'Onboarding operation failed';
      const key = `${category}:${op.operationType}:${msg}`;
      const correlationId = `corr_op_${op.id.slice(-8)}`;

      if (errorMap.has(key)) {
        const existing = errorMap.get(key)!;
        existing.occurrenceCount += 1;
        if (new Date(op.updatedAt) > new Date(existing.latestTimestamp)) {
          existing.latestTimestamp = op.updatedAt;
        }
      } else {
        errorMap.set(key, {
          id: `err_op_${op.id}`,
          category,
          operation: op.operationType,
          safeMessage: msg,
          occurrenceCount: 1,
          latestTimestamp: op.updatedAt || op.createdAt,
          communityId: op.communityId,
          retryable: op.attempts < 3,
          correlationId,
        });
      }
    }

    // 2. Process failed integration events
    for (const evt of integrationEvents) {
      if (evt.status !== 'FAILED') continue;
      if (communityId && evt.communityId !== communityId) continue;

      let category: GroupedErrorItem['category'] = 'Discord';
      if (evt.provider === 'GOOGLE_FORMS') category = 'Google Forms';
      else if (evt.provider === 'GOOGLE_CALENDAR') category = 'Google Calendar';
      else if (evt.provider === 'GOOGLE_SHEETS') category = 'Google Sheets';
      else if (evt.provider === 'FIREBASE') category = 'Firebase';

      const msg = evt.failureReason || `${evt.provider} integration failure`;
      const key = `${category}:${evt.eventType}:${msg}`;
      const correlationId = evt.correlationId || `corr_evt_${evt.id.slice(-8)}`;

      if (errorMap.has(key)) {
        const existing = errorMap.get(key)!;
        existing.occurrenceCount += 1;
        if (new Date(evt.receivedAt) > new Date(existing.latestTimestamp)) {
          existing.latestTimestamp = evt.receivedAt;
        }
      } else {
        errorMap.set(key, {
          id: `err_evt_${evt.id}`,
          category,
          operation: evt.eventType,
          safeMessage: msg,
          occurrenceCount: 1,
          latestTimestamp: evt.receivedAt,
          communityId: evt.communityId,
          retryable: evt.retryCount < 3,
          correlationId,
        });
      }
    }

    // 3. Process audit security/error events
    for (const log of auditLogs) {
      if (!log.action.includes('FAIL') && !log.action.includes('ERROR') && !log.action.includes('DENIED')) continue;
      if (communityId && log.communityId !== communityId) continue;

      let category: GroupedErrorItem['category'] = 'Application Workflow';
      if (log.action.includes('ROLE') || log.action.includes('WELCOME')) category = 'Discord';
      else if (log.action.includes('AUTH') || log.action.includes('DENIED')) category = 'Authorization';

      const msg = (log.metadata as any)?.errorMessage || (log.metadata as any)?.reason || `${log.action} error`;
      const key = `${category}:${log.action}:${msg}`;
      const correlationId = `corr_audit_${log.id.slice(-8)}`;

      if (errorMap.has(key)) {
        const existing = errorMap.get(key)!;
        existing.occurrenceCount += 1;
        if (new Date(log.timestamp) > new Date(existing.latestTimestamp)) {
          existing.latestTimestamp = log.timestamp;
        }
      } else {
        errorMap.set(key, {
          id: `err_audit_${log.id}`,
          category,
          operation: log.action,
          safeMessage: String(msg),
          occurrenceCount: 1,
          latestTimestamp: log.timestamp,
          communityId: log.communityId,
          retryable: false,
          correlationId,
        });
      }
    }

    // 4. Process in-memory recorded errors
    for (const memErr of this.inMemoryErrors) {
      if (communityId && memErr.communityId !== communityId) continue;
      const key = `${memErr.category}:${memErr.operation}:${memErr.safeMessage}`;
      if (errorMap.has(key)) {
        const existing = errorMap.get(key)!;
        existing.occurrenceCount += memErr.occurrenceCount;
        if (new Date(memErr.latestTimestamp) > new Date(existing.latestTimestamp)) {
          existing.latestTimestamp = memErr.latestTimestamp;
        }
      } else {
        errorMap.set(key, { ...memErr });
      }
    }

    return Array.from(errorMap.values()).sort(
      (a, b) => new Date(b.latestTimestamp).getTime() - new Date(a.latestTimestamp).getTime()
    );
  }

  async getSecurityEvents(communityId?: string): Promise<SecurityEventItem[]> {
    const [auditLogs, platformLogs] = await Promise.all([
      auditLogsRepository.list({ limit: 100 }),
      platformAuditLogsRepository.list({ limit: 100 }),
    ]);

    const events: SecurityEventItem[] = [];

    // In-memory security events
    for (const sec of this.inMemorySecurityEvents) {
      if (communityId && sec.communityId !== communityId) continue;
      events.push({ ...sec });
    }

    for (const log of auditLogs) {
      if (communityId && log.communityId !== communityId) continue;
      if (
        log.action.includes('DENIED') ||
        log.action.includes('SECURITY') ||
        log.action.includes('RESTRICTION') ||
        log.action.includes('UNAUTHORIZED')
      ) {
        let severity: SecurityEventItem['severity'] = 'WARNING';
        let category: SecurityEventItem['category'] = 'AUTH_FAILURE';

        if (log.action.includes('CROSS_TENANT') || log.action.includes('TENANT')) {
          severity = 'CRITICAL';
          category = 'CROSS_TENANT';
        } else if (log.action.includes('REPLAY')) {
          severity = 'HIGH';
          category = 'REPLAY_ATTEMPT';
        } else if (log.action.includes('RESTRICTION')) {
          severity = 'HIGH';
          category = 'SUSPICIOUS_REQUEST';
        }

        events.push({
          id: `sec_${log.id}`,
          severity,
          category,
          actorUserId: log.actorUserId,
          communityId: log.communityId,
          description: `${log.action} on ${log.targetType} (${log.targetId})`,
          timestamp: log.timestamp,
          metadata: log.metadata,
        });
      }
    }

    for (const log of platformLogs) {
      if (log.action === 'SECURITY_EVENT' || log.action.includes('SUSPENDED') || log.action.includes('DENIED')) {
        events.push({
          id: `sec_plat_${log.id}`,
          severity: log.action.includes('SUSPENDED') ? 'HIGH' : 'CRITICAL',
          category: 'SUSPICIOUS_REQUEST',
          actorUserId: log.actorUserId,
          description: `Platform Security Event: ${log.action} on ${log.targetType}`,
          timestamp: log.timestamp,
          metadata: log.metadata,
        });
      }
    }

    return events.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
}

export const errorCenterService = new ErrorCenterService();
