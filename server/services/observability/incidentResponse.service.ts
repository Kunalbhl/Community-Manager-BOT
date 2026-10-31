import {
  incidentsRepository,
  escalationPoliciesRepository,
  escalationStatesRepository,
  alertRoutingDecisionsRepository,
  incidentCommunicationsRepository,
  maintenanceWindowsRepository,
  operationalNotificationsRepository,
  incidentTimelinesRepository,
} from '../../repositories/index.js';
import {
  IncidentDocument,
  IncidentTimelineEvent,
  IncidentTimelineEventType,
  EscalationPolicy,
  EscalationState,
  AlertRoutingDecision,
  IncidentCommunicationRecord,
  IncidentCommunicationType,
  MaintenanceWindow,
  OperationalNotificationRecord,
  IncidentSeverity,
} from '../../../shared/types/observability.js';
import { logger } from '../../logging/logger.js';
import { auditService } from '../audit.service.js';
import { secretsManager } from '../../security/secrets.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../utils/errors.js';

export class IncidentResponseService {
  private static instance: IncidentResponseService;
  private defaultPoliciesInitialized = false;

  private defaultPolicies: EscalationPolicy[] = [
    {
      id: 'pol_critical_default',
      policyId: 'pol_critical_default',
      name: 'Critical Incident Escalation Policy',
      enabled: true,
      severity: 'CRITICAL',
      component: 'ALL',
      initialDelayMs: 0, // Immediate
      repeatIntervalMs: 15 * 60 * 1000, // 15 minutes
      maxEscalations: 3,
      recipients: ['PLATFORM_OWNER', 'INCIDENT_OWNER'],
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    },
    {
      id: 'pol_warning_default',
      policyId: 'pol_warning_default',
      name: 'Warning Incident Escalation Policy',
      enabled: true,
      severity: 'WARNING',
      component: 'ALL',
      initialDelayMs: 10 * 60 * 1000, // 10 minutes delay
      repeatIntervalMs: 60 * 60 * 1000, // 60 minutes
      maxEscalations: 2,
      recipients: ['PLATFORM_OWNER'],
      createdAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    },
  ];

  public static getInstance(): IncidentResponseService {
    if (!IncidentResponseService.instance) {
      IncidentResponseService.instance = new IncidentResponseService();
    }
    return IncidentResponseService.instance;
  }

  /**
   * Ensure default policies are seeded into the repository
   */
  public async ensureDefaultPolicies(): Promise<void> {
    if (this.defaultPoliciesInitialized) return;
    try {
      for (const policy of this.defaultPolicies) {
        const existing = await escalationPoliciesRepository.getById(policy.id);
        if (!existing) {
          await escalationPoliciesRepository.create(policy);
        }
      }
      this.defaultPoliciesInitialized = true;
    } catch (err) {
      logger.warn('[IncidentResponseService] Failed to seed default policies:', err);
    }
  }

  // =========================================================================
  // 1. INCIDENT OWNERSHIP (ASSIGN, REASSIGN, UNASSIGN)
  // =========================================================================

  public async assignIncident(params: {
    incidentId: string;
    ownerId: string;
    ownerRole?: string;
    assignedBy: string;
    actorRole: string;
    correlationId?: string;
  }): Promise<IncidentDocument> {
    const correlationId = params.correlationId || `corr_assign_${Date.now()}`;
    const incident = await incidentsRepository.getById(params.incidentId);
    if (!incident) {
      throw new NotFoundError(`Incident ${params.incidentId} not found`);
    }

    if (!params.ownerId || typeof params.ownerId !== 'string' || !params.ownerId.trim()) {
      throw new BadRequestError('ownerId is required for assignment');
    }

    const previousOwnerId = incident.ownerId;
    const isReassignment = Boolean(previousOwnerId && previousOwnerId !== params.ownerId);

    incident.ownerId = params.ownerId.trim();
    incident.ownerRole = params.ownerRole || 'AUTHORIZED_OPERATOR';
    incident.assignedAt = new Date().toISOString();
    incident.assignedBy = params.assignedBy;
    incident.ownershipState = 'ASSIGNED';

    if (!incident.history) incident.history = [];
    incident.history.push({
      action: isReassignment ? 'INCIDENT_REASSIGNED' : 'INCIDENT_ASSIGNED',
      actorUserId: params.assignedBy,
      timestamp: new Date().toISOString(),
      details: isReassignment
        ? `Reassigned from ${previousOwnerId} to ${incident.ownerId}`
        : `Assigned to ${incident.ownerId}`,
    });

    const updated = await incidentsRepository.update(incident.id, incident);

    // Record timeline
    await this.recordTimelineEvent({
      incidentId: incident.id,
      event: isReassignment ? 'REASSIGNED' : 'ASSIGNED',
      actorId: params.assignedBy,
      actorRole: params.actorRole,
      message: isReassignment
        ? `Incident reassigned from ${previousOwnerId} to ${incident.ownerId}`
        : `Incident assigned to ${incident.ownerId}`,
      correlationId,
      details: { ownerId: incident.ownerId, ownerRole: incident.ownerRole, previousOwnerId },
    });

    // Audit
    await auditService.log({
      communityId: incident.communityId || 'SYSTEM',
      actorUserId: params.assignedBy,
      actorRole: params.actorRole as any,
      action: (isReassignment ? 'INCIDENT_REASSIGNED' : 'INCIDENT_ASSIGNED') as any,
      targetType: 'incident',
      targetId: incident.id,
      metadata: {
        incidentId: incident.id,
        ownerId: incident.ownerId,
        previousOwnerId,
        ownerRole: incident.ownerRole,
        correlationId,
      },
    });

    return updated;
  }

  public async unassignIncident(params: {
    incidentId: string;
    unassignedBy: string;
    actorRole: string;
    correlationId?: string;
  }): Promise<IncidentDocument> {
    const correlationId = params.correlationId || `corr_unassign_${Date.now()}`;
    const incident = await incidentsRepository.getById(params.incidentId);
    if (!incident) {
      throw new NotFoundError(`Incident ${params.incidentId} not found`);
    }

    const previousOwnerId = incident.ownerId;
    delete incident.ownerId;
    delete incident.ownerRole;
    delete incident.assignedAt;
    delete incident.assignedBy;
    incident.ownershipState = 'UNASSIGNED';

    if (!incident.history) incident.history = [];
    incident.history.push({
      action: 'INCIDENT_UNASSIGNED',
      actorUserId: params.unassignedBy,
      timestamp: new Date().toISOString(),
      details: `Unassigned (previously assigned to ${previousOwnerId || 'unknown'})`,
    });

    const updated = await incidentsRepository.update(incident.id, incident);

    await this.recordTimelineEvent({
      incidentId: incident.id,
      event: 'UNASSIGNED',
      actorId: params.unassignedBy,
      actorRole: params.actorRole,
      message: `Incident unassigned (previously assigned to ${previousOwnerId || 'none'})`,
      correlationId,
      details: { previousOwnerId },
    });

    await auditService.log({
      communityId: incident.communityId || 'SYSTEM',
      actorUserId: params.unassignedBy,
      actorRole: params.actorRole as any,
      action: 'INCIDENT_UNASSIGNED' as any,
      targetType: 'incident',
      targetId: incident.id,
      metadata: { incidentId: incident.id, previousOwnerId, correlationId },
    });

    return updated;
  }

  // =========================================================================
  // 2. ACKNOWLEDGEMENT & RESOLUTION SEMANTICS
  // =========================================================================

  public async acknowledgeIncident(params: {
    incidentId: string;
    actorUserId: string;
    actorRole: string;
    correlationId?: string;
    note?: string;
  }): Promise<IncidentDocument> {
    const correlationId = params.correlationId || `corr_ack_${Date.now()}`;
    const incident = await incidentsRepository.getById(params.incidentId);
    if (!incident) {
      throw new NotFoundError(`Incident ${params.incidentId} not found`);
    }

    // Acknowledging an incident transitions status to ACKNOWLEDGED without resolving
    incident.status = 'ACKNOWLEDGED';
    incident.acknowledgedAt = new Date().toISOString();
    incident.acknowledgedBy = params.actorUserId;
    incident.acknowledgementCorrelationId = correlationId;

    if (params.note && params.note.trim()) {
      const sanitizedNote = secretsManager.redactString(params.note.trim());
      if (!incident.operatorNotes) incident.operatorNotes = [];
      incident.operatorNotes.push({
        noteId: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        authorUserId: params.actorUserId,
        note: sanitizedNote,
        createdAt: new Date().toISOString(),
      });
    }

    if (!incident.history) incident.history = [];
    incident.history.push({
      action: 'INCIDENT_ACKNOWLEDGED',
      actorUserId: params.actorUserId,
      timestamp: new Date().toISOString(),
      details: params.note ? secretsManager.redactString(params.note.trim()) : 'Incident acknowledged by operator',
    });

    const updated = await incidentsRepository.update(incident.id, incident);

    await this.recordTimelineEvent({
      incidentId: incident.id,
      event: 'ACKNOWLEDGED',
      actorId: params.actorUserId,
      actorRole: params.actorRole,
      message: `Incident acknowledged: ${incident.summary || incident.safeSummary}`,
      correlationId,
      details: { acknowledgedBy: params.actorUserId, note: params.note ? secretsManager.redactString(params.note) : undefined },
    });

    await auditService.log({
      communityId: incident.communityId || 'SYSTEM',
      actorUserId: params.actorUserId,
      actorRole: params.actorRole as any,
      action: 'INCIDENT_ACKNOWLEDGED' as any,
      targetType: 'incident',
      targetId: incident.id,
      metadata: { incidentId: incident.id, status: 'ACKNOWLEDGED', correlationId },
    });

    return updated;
  }

  public async resolveIncident(params: {
    incidentId: string;
    resolvedBy: string;
    actorRole: string;
    resolutionReason: string;
    correlationId?: string;
  }): Promise<IncidentDocument> {
    const correlationId = params.correlationId || `corr_resolve_${Date.now()}`;
    const incident = await incidentsRepository.getById(params.incidentId);
    if (!incident) {
      throw new NotFoundError(`Incident ${params.incidentId} not found`);
    }

    if (!params.resolutionReason || typeof params.resolutionReason !== 'string' || !params.resolutionReason.trim()) {
      throw new BadRequestError('Resolution reason is strictly required to resolve an incident');
    }

    const sanitizedReason = secretsManager.redactString(params.resolutionReason.trim());

    incident.status = 'RESOLVED';
    incident.resolvedAt = new Date().toISOString();
    incident.resolvedBy = params.resolvedBy;
    incident.resolutionReason = sanitizedReason;
    incident.resolutionCorrelationId = correlationId;

    if (!incident.history) incident.history = [];
    incident.history.push({
      action: 'INCIDENT_RESOLVED',
      actorUserId: params.resolvedBy,
      timestamp: new Date().toISOString(),
      details: `Resolved: ${sanitizedReason}`,
    });

    const updated = await incidentsRepository.update(incident.id, incident);

    // Update escalation state to COMPLETED
    await this.completeEscalationForIncident(incident.id);

    await this.recordTimelineEvent({
      incidentId: incident.id,
      event: 'RESOLVED',
      actorId: params.resolvedBy,
      actorRole: params.actorRole,
      message: `Incident resolved: ${sanitizedReason}`,
      correlationId,
      details: { resolutionReason: sanitizedReason, resolvedBy: params.resolvedBy },
    });

    await auditService.log({
      communityId: incident.communityId || 'SYSTEM',
      actorUserId: params.resolvedBy,
      actorRole: params.actorRole as any,
      action: 'INCIDENT_RESOLVED' as any,
      targetType: 'incident',
      targetId: incident.id,
      metadata: { incidentId: incident.id, resolutionReason: sanitizedReason, correlationId },
    });

    return updated;
  }

  public async reopenIncident(params: {
    incidentId: string;
    reopenedBy: string;
    actorRole: string;
    reason?: string;
    correlationId?: string;
  }): Promise<IncidentDocument> {
    const correlationId = params.correlationId || `corr_reopen_${Date.now()}`;
    const incident = await incidentsRepository.getById(params.incidentId);
    if (!incident) {
      throw new NotFoundError(`Incident ${params.incidentId} not found`);
    }

    const sanitizedReason = secretsManager.redactString(params.reason?.trim() || 'Reopened by operator or recurring trigger');

    incident.status = 'OPEN';
    incident.reopenedAt = new Date().toISOString();
    incident.reopenedBy = params.reopenedBy;
    delete incident.resolvedAt;
    delete incident.resolvedBy;
    delete incident.resolutionReason;
    delete incident.resolutionCorrelationId;

    incident.occurrenceCount = (incident.occurrenceCount || 1) + 1;
    incident.lastSeenAt = new Date().toISOString();

    if (!incident.history) incident.history = [];
    incident.history.push({
      action: 'INCIDENT_REOPENED',
      actorUserId: params.reopenedBy,
      timestamp: new Date().toISOString(),
      details: `Reopened: ${sanitizedReason}`,
    });

    const updated = await incidentsRepository.update(incident.id, incident);

    await this.recordTimelineEvent({
      incidentId: incident.id,
      event: 'REOPENED',
      actorId: params.reopenedBy,
      actorRole: params.actorRole,
      message: `Incident reopened: ${sanitizedReason}`,
      correlationId,
      details: { reason: sanitizedReason, reopenedBy: params.reopenedBy },
    });

    await auditService.log({
      communityId: incident.communityId || 'SYSTEM',
      actorUserId: params.reopenedBy,
      actorRole: params.actorRole as any,
      action: 'INCIDENT_REOPENED' as any,
      targetType: 'incident',
      targetId: incident.id,
      metadata: { incidentId: incident.id, reason: sanitizedReason, correlationId },
    });

    // Re-evaluate escalation
    await this.evaluateRoutingAndEscalation(updated, correlationId);

    return updated;
  }

  // =========================================================================
  // 3. INCIDENT COMMUNICATION LOG (APPEND-ONLY, SANITIZED)
  // =========================================================================

  public async addCommunication(params: {
    incidentId: string;
    actorId: string;
    actorRole: string;
    message: string;
    type: IncidentCommunicationType;
    correlationId?: string;
  }): Promise<IncidentCommunicationRecord> {
    const correlationId = params.correlationId || `corr_comm_${Date.now()}`;
    const incident = await incidentsRepository.getById(params.incidentId);
    if (!incident) {
      throw new NotFoundError(`Incident ${params.incidentId} not found`);
    }

    if (!params.message || typeof params.message !== 'string' || !params.message.trim()) {
      throw new BadRequestError('Communication message is required');
    }

    // HTML / Script tag sanitization + secret scrubbing
    const sanitizedMsg = secretsManager
      .redactString(params.message.trim())
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<[^>]*>?/gm, ''); // Strip html tags

    const commRecord: IncidentCommunicationRecord = {
      id: `comm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      incidentId: incident.id,
      actorId: params.actorId,
      actorRole: params.actorRole,
      message: sanitizedMsg,
      type: params.type || 'NOTE',
      createdAt: new Date().toISOString(),
      correlationId,
    };

    const saved = await incidentCommunicationsRepository.create(commRecord);

    // Also update incident operatorNotes for backward compatibility
    if (!incident.operatorNotes) incident.operatorNotes = [];
    incident.operatorNotes.push({
      noteId: saved.id,
      authorUserId: params.actorId,
      note: sanitizedMsg,
      createdAt: saved.createdAt,
    });
    await incidentsRepository.update(incident.id, incident);

    // Timeline event
    await this.recordTimelineEvent({
      incidentId: incident.id,
      event: 'NOTE_ADDED',
      actorId: params.actorId,
      actorRole: params.actorRole,
      message: `Note added [${params.type}]: ${sanitizedMsg}`,
      correlationId,
      details: { communicationId: saved.id, type: params.type },
    });

    // Audit
    await auditService.log({
      communityId: incident.communityId || 'SYSTEM',
      actorUserId: params.actorId,
      actorRole: params.actorRole as any,
      action: 'INCIDENT_NOTE_ADDED' as any,
      targetType: 'incident',
      targetId: incident.id,
      metadata: { incidentId: incident.id, communicationId: saved.id, type: params.type, correlationId },
    });

    return saved;
  }

  public async getCommunications(incidentId: string): Promise<IncidentCommunicationRecord[]> {
    const list = await incidentCommunicationsRepository.list();
    return list
      .filter((c) => c.incidentId === incidentId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  // =========================================================================
  // 4. MAINTENANCE WINDOWS & SUPPRESSION
  // =========================================================================

  public isValidTimezone(tz: string): boolean {
    if (!tz || typeof tz !== 'string') return false;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }

  public async createMaintenanceWindow(params: {
    name: string;
    description: string;
    startAt: string;
    endAt: string;
    timezone: string;
    components: string[];
    rules?: string[];
    createdBy: string;
    actorRole: string;
    communityId?: string;
    correlationId?: string;
  }): Promise<MaintenanceWindow> {
    const correlationId = params.correlationId || `corr_maint_${Date.now()}`;

    if (!params.name || typeof params.name !== 'string' || !params.name.trim()) {
      throw new BadRequestError('Maintenance window name is required');
    }
    if (!params.startAt || !params.endAt) {
      throw new BadRequestError('startAt and endAt timestamps are required');
    }
    if (!this.isValidTimezone(params.timezone)) {
      throw new BadRequestError(`Invalid timezone: ${params.timezone}`);
    }

    const startDate = new Date(params.startAt);
    const endDate = new Date(params.endAt);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestError('Invalid date format for startAt or endAt');
    }
    if (endDate.getTime() <= startDate.getTime()) {
      throw new BadRequestError('endAt must be strictly after startAt');
    }
    if (!params.components || !Array.isArray(params.components) || params.components.length === 0) {
      throw new BadRequestError('At least one component must be specified for the maintenance window');
    }

    const now = Date.now();
    let status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' = 'SCHEDULED';
    if (now >= startDate.getTime() && now <= endDate.getTime()) {
      status = 'ACTIVE';
    } else if (now > endDate.getTime()) {
      status = 'COMPLETED';
    }

    const windowId = `maint_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const window: MaintenanceWindow = {
      id: windowId,
      maintenanceWindowId: windowId,
      name: secretsManager.redactString(params.name.trim()),
      description: secretsManager.redactString(params.description?.trim() || ''),
      startAt: startDate.toISOString(),
      endAt: endDate.toISOString(),
      timezone: params.timezone,
      components: params.components,
      rules: params.rules || [],
      createdBy: params.createdBy,
      createdAt: new Date().toISOString(),
      status,
      communityId: params.communityId,
    };

    const saved = await maintenanceWindowsRepository.create(window);

    await auditService.log({
      communityId: params.communityId || 'SYSTEM',
      actorUserId: params.createdBy,
      actorRole: params.actorRole as any,
      action: 'MAINTENANCE_CREATED' as any,
      targetType: 'maintenance_window',
      targetId: saved.id,
      metadata: {
        maintenanceWindowId: saved.id,
        name: saved.name,
        components: saved.components,
        startAt: saved.startAt,
        endAt: saved.endAt,
        correlationId,
      },
    });

    return saved;
  }

  public async cancelMaintenanceWindow(params: {
    maintenanceWindowId: string;
    cancelledBy: string;
    actorRole: string;
    correlationId?: string;
  }): Promise<MaintenanceWindow> {
    const correlationId = params.correlationId || `corr_maint_cancel_${Date.now()}`;
    const window = await maintenanceWindowsRepository.getById(params.maintenanceWindowId);
    if (!window) {
      throw new NotFoundError(`Maintenance window ${params.maintenanceWindowId} not found`);
    }

    window.status = 'CANCELLED';
    window.cancelledAt = new Date().toISOString();
    window.cancelledBy = params.cancelledBy;

    const updated = await maintenanceWindowsRepository.update(window.id, window);

    await auditService.log({
      communityId: window.communityId || 'SYSTEM',
      actorUserId: params.cancelledBy,
      actorRole: params.actorRole as any,
      action: 'MAINTENANCE_CANCELLED' as any,
      targetType: 'maintenance_window',
      targetId: window.id,
      metadata: { maintenanceWindowId: window.id, cancelledBy: params.cancelledBy, correlationId },
    });

    return updated;
  }

  public async listMaintenanceWindows(params?: { status?: string; communityId?: string }): Promise<MaintenanceWindow[]> {
    const list = await maintenanceWindowsRepository.list();
    const now = Date.now();

    // Dynamically update status if expired
    const result: MaintenanceWindow[] = [];
    for (const w of list) {
      if (w.status === 'SCHEDULED' && now >= new Date(w.startAt).getTime() && now <= new Date(w.endAt).getTime()) {
        w.status = 'ACTIVE';
        await maintenanceWindowsRepository.update(w.id, w);
      } else if ((w.status === 'SCHEDULED' || w.status === 'ACTIVE') && now > new Date(w.endAt).getTime()) {
        w.status = 'COMPLETED';
        await maintenanceWindowsRepository.update(w.id, w);
      }

      if (params?.status && w.status !== params.status) continue;
      if (params?.communityId && w.communityId && w.communityId !== params.communityId) continue;
      result.push(w);
    }

    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async getActiveMaintenanceWindows(now: Date = new Date()): Promise<MaintenanceWindow[]> {
    const list = await maintenanceWindowsRepository.list();
    const nowTime = now.getTime();
    return list.filter((w) => {
      if (w.status === 'CANCELLED') return false;
      const start = new Date(w.startAt).getTime();
      const end = new Date(w.endAt).getTime();
      return nowTime >= start && nowTime <= end;
    });
  }

  public async isSuppressedByMaintenance(
    component: string,
    ruleId?: string,
    now: Date = new Date()
  ): Promise<{ suppressed: boolean; window?: MaintenanceWindow }> {
    const activeWindows = await this.getActiveMaintenanceWindows(now);
    for (const w of activeWindows) {
      const componentMatches = w.components.includes('ALL') || w.components.includes(component);
      const ruleMatches = !w.rules || w.rules.length === 0 || (ruleId ? w.rules.includes(ruleId) : true);
      if (componentMatches && ruleMatches) {
        return { suppressed: true, window: w };
      }
    }
    return { suppressed: false };
  }

  // =========================================================================
  // 5. ALERT ROUTING & ESCALATION POLICIES
  // =========================================================================

  public async evaluateRoutingAndEscalation(incident: IncidentDocument, correlationId?: string): Promise<AlertRoutingDecision> {
    await this.ensureDefaultPolicies();
    const corrId = correlationId || incident.correlationId || `corr_route_${Date.now()}`;

    // 1. Check Maintenance Suppression (Non-critical alerts only)
    if (incident.severity !== 'CRITICAL') {
      const maintCheck = await this.isSuppressedByMaintenance(incident.component || 'APPLICATION', incident.type);
      if (maintCheck.suppressed && maintCheck.window) {
        const decision: AlertRoutingDecision = {
          id: `route_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          incidentId: incident.id,
          recipientType: 'SUPPRESSED',
          decision: 'SUPPRESSED_MAINTENANCE',
          reason: `Suppressed by active maintenance window: ${maintCheck.window.name}`,
          timestamp: new Date().toISOString(),
          correlationId: corrId,
        };
        await alertRoutingDecisionsRepository.create(decision);

        incident.status = 'SUPPRESSED';
        incident.suppressionReason = `SUPPRESSED_BY_MAINTENANCE: ${maintCheck.window.name}`;
        incident.suppressedAt = new Date().toISOString();
        incident.suppressedUntil = maintCheck.window.endAt;
        await incidentsRepository.update(incident.id, incident);

      await this.recordTimelineEvent({
        incidentId: incident.id,
        event: 'SUPPRESSION_STARTED',
        actorId: 'SYSTEM_MAINTENANCE',
        message: `Alert suppressed by active maintenance window: ${maintCheck.window.name}`,
        correlationId: corrId,
        details: { maintenanceWindowId: maintCheck.window.id },
      });

      await auditService.log({
        communityId: incident.communityId || 'SYSTEM',
        actorUserId: 'SYSTEM_MAINTENANCE',
        actorRole: 'OWNER',
        action: 'INCIDENT_SUPPRESSED' as any,
        targetType: 'incident',
        targetId: incident.id,
        metadata: { maintenanceWindowId: maintCheck.window.id, windowName: maintCheck.window.name, correlationId: corrId },
      });

      return decision;
    }
  }

    // 2. Find matching escalation policy
    const policies = await escalationPoliciesRepository.list();
    const matchingPolicy = policies.find(
      (p) =>
        p.enabled &&
        (p.severity === incident.severity || p.severity === 'ALL') &&
        (p.component === incident.component || p.component === 'ALL')
    ) || policies[0] || this.defaultPolicies[0];

    incident.escalationPolicyId = matchingPolicy.policyId;
    await incidentsRepository.update(incident.id, incident);

    // 3. Create or update EscalationState
    let escState = (await escalationStatesRepository.list()).find((e) => e.incidentId === incident.id);
    const now = Date.now();
    const nextEscTime = new Date(now + matchingPolicy.initialDelayMs).toISOString();

    if (!escState) {
      escState = {
        id: `esc_${incident.id}`,
        incidentId: incident.id,
        policyId: matchingPolicy.policyId,
        currentLevel: 0,
        escalationCount: 0,
        nextEscalationAt: nextEscTime,
        status: matchingPolicy.initialDelayMs === 0 ? 'ESCALATED' : 'PENDING',
        updatedAt: new Date().toISOString(),
      };
      if (matchingPolicy.initialDelayMs === 0) {
        escState.currentLevel = 1;
        escState.escalationCount = 1;
        escState.lastEscalatedAt = new Date().toISOString();
        escState.nextEscalationAt = new Date(now + matchingPolicy.repeatIntervalMs).toISOString();
      }
      await escalationStatesRepository.create(escState);
    } else {
      escState.policyId = matchingPolicy.policyId;
      escState.updatedAt = new Date().toISOString();
      if (matchingPolicy.initialDelayMs === 0 && escState.escalationCount === 0) {
        escState.currentLevel = 1;
        escState.escalationCount = 1;
        escState.status = 'ESCALATED';
        escState.lastEscalatedAt = new Date().toISOString();
        escState.nextEscalationAt = new Date(now + matchingPolicy.repeatIntervalMs).toISOString();
      }
      await escalationStatesRepository.update(escState.id, escState);
    }

    // 4. Record routing decision
    const routingDecision: AlertRoutingDecision = {
      id: `route_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      incidentId: incident.id,
      policyId: matchingPolicy.policyId,
      recipientType: matchingPolicy.recipients.join(','),
      recipientContext: `Severity: ${incident.severity}, Component: ${incident.component}`,
      decision: 'ROUTED',
      reason: `Routed according to policy ${matchingPolicy.name}`,
      timestamp: new Date().toISOString(),
      correlationId: corrId,
    };
    await alertRoutingDecisionsRepository.create(routingDecision);

    // 5. Emit operational notification record (truthful, NOT_CONFIGURED if no external provider)
    await this.dispatchOperationalNotification({
      incidentId: incident.id,
      recipients: matchingPolicy.recipients,
      severity: incident.severity,
      correlationId: corrId,
    });

    return routingDecision;
  }

  // =========================================================================
  // 6. NOTIFICATION CENTER & DISPATCH INTEGRITY
  // =========================================================================

  public async dispatchOperationalNotification(params: {
    incidentId: string;
    recipients: string[];
    severity: IncidentSeverity;
    correlationId: string;
  }): Promise<OperationalNotificationRecord[]> {
    const records: OperationalNotificationRecord[] = [];

    for (const recipient of params.recipients) {
      const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      // In this deployment, external channels like SMS/PagerDuty are NOT_CONFIGURED
      const status = 'NOT_CONFIGURED';

      const notif: OperationalNotificationRecord = {
        id: notifId,
        notificationId: notifId,
        incidentId: params.incidentId,
        recipient,
        context: `Incident Severity: ${params.severity}`,
        channel: 'NOTIFICATION_CENTER',
        status,
        failureCode: 'EXTERNAL_PROVIDER_NOT_CONFIGURED',
        createdAt: new Date().toISOString(),
        correlationId: params.correlationId,
      };

      const saved = await operationalNotificationsRepository.create(notif);
      records.push(saved);
    }

    return records;
  }

  // =========================================================================
  // 7. ESCALATION WORKER, PAUSE & RESUME
  // =========================================================================

  public async pauseEscalation(params: {
    incidentId: string;
    actorUserId: string;
    actorRole: string;
    correlationId?: string;
  }): Promise<EscalationState> {
    const correlationId = params.correlationId || `corr_pause_${Date.now()}`;
    const incident = await incidentsRepository.getById(params.incidentId);
    if (!incident) {
      throw new NotFoundError(`Incident ${params.incidentId} not found`);
    }

    let escState = (await escalationStatesRepository.list()).find((e) => e.incidentId === incident.id);
    if (!escState) {
      throw new NotFoundError(`Escalation state for incident ${params.incidentId} not found`);
    }

    escState.status = 'PAUSED';
    escState.updatedAt = new Date().toISOString();
    const updated = await escalationStatesRepository.update(escState.id, escState);

    incident.escalationPaused = true;
    incident.escalationPausedAt = new Date().toISOString();
    incident.escalationPausedBy = params.actorUserId;
    await incidentsRepository.update(incident.id, incident);

    await this.recordTimelineEvent({
      incidentId: incident.id,
      event: 'STATUS_UPDATED',
      actorId: params.actorUserId,
      actorRole: params.actorRole,
      message: 'Escalation paused by operator',
      correlationId,
      details: { status: 'PAUSED' },
    });

    await auditService.log({
      communityId: incident.communityId || 'SYSTEM',
      actorUserId: params.actorUserId,
      actorRole: params.actorRole as any,
      action: 'ESCALATION_PAUSED' as any,
      targetType: 'incident',
      targetId: incident.id,
      metadata: { incidentId: incident.id, correlationId },
    });

    return updated;
  }

  public async resumeEscalation(params: {
    incidentId: string;
    actorUserId: string;
    actorRole: string;
    correlationId?: string;
  }): Promise<EscalationState> {
    const correlationId = params.correlationId || `corr_resume_${Date.now()}`;
    const incident = await incidentsRepository.getById(params.incidentId);
    if (!incident) {
      throw new NotFoundError(`Incident ${params.incidentId} not found`);
    }

    let escState = (await escalationStatesRepository.list()).find((e) => e.incidentId === incident.id);
    if (!escState) {
      throw new NotFoundError(`Escalation state for incident ${params.incidentId} not found`);
    }

    const policy = (await escalationPoliciesRepository.getById(escState.policyId)) || this.defaultPolicies[0];

    // Recalculate next escalation from authoritative timestamp
    escState.status = 'PENDING';
    escState.nextEscalationAt = new Date(Date.now() + policy.repeatIntervalMs).toISOString();
    escState.updatedAt = new Date().toISOString();
    const updated = await escalationStatesRepository.update(escState.id, escState);

    incident.escalationPaused = false;
    delete incident.escalationPausedAt;
    delete incident.escalationPausedBy;
    await incidentsRepository.update(incident.id, incident);

    await this.recordTimelineEvent({
      incidentId: incident.id,
      event: 'STATUS_UPDATED',
      actorId: params.actorUserId,
      actorRole: params.actorRole,
      message: 'Escalation resumed by operator',
      correlationId,
      details: { status: 'PENDING', nextEscalationAt: escState.nextEscalationAt },
    });

    await auditService.log({
      communityId: incident.communityId || 'SYSTEM',
      actorUserId: params.actorUserId,
      actorRole: params.actorRole as any,
      action: 'ESCALATION_RESUMED' as any,
      targetType: 'incident',
      targetId: incident.id,
      metadata: { incidentId: incident.id, nextEscalationAt: escState.nextEscalationAt, correlationId },
    });

    return updated;
  }

  public async completeEscalationForIncident(incidentId: string): Promise<void> {
    const escState = (await escalationStatesRepository.list()).find((e) => e.incidentId === incidentId);
    if (escState && escState.status !== 'COMPLETED') {
      escState.status = 'COMPLETED';
      escState.updatedAt = new Date().toISOString();
      await escalationStatesRepository.update(escState.id, escState);
    }
  }

  public async processEscalationWorkerRun(): Promise<{ processedCount: number; escalatedCount: number }> {
    const list = await escalationStatesRepository.list();
    const now = Date.now();
    let processed = 0;
    let escalated = 0;

    for (const esc of list) {
      if (esc.status !== 'PENDING') continue;
      if (!esc.nextEscalationAt || new Date(esc.nextEscalationAt).getTime() > now) continue;

      processed++;
      const incident = await incidentsRepository.getById(esc.incidentId);
      if (!incident || incident.status === 'RESOLVED') {
        esc.status = 'COMPLETED';
        esc.updatedAt = new Date().toISOString();
        await escalationStatesRepository.update(esc.id, esc);
        continue;
      }

      const policy = (await escalationPoliciesRepository.getById(esc.policyId)) || this.defaultPolicies[0];
      if (esc.escalationCount >= policy.maxEscalations) {
        esc.status = 'COMPLETED';
        esc.updatedAt = new Date().toISOString();
        await escalationStatesRepository.update(esc.id, esc);
        continue;
      }

      // Perform escalation step with idempotency key
      const idempotencyKey = `esc_${esc.incidentId}_lvl_${esc.currentLevel + 1}`;
      if (esc.idempotencyKey === idempotencyKey) {
        // Prevent duplicate execution on restart
        continue;
      }

      esc.currentLevel += 1;
      esc.escalationCount += 1;
      esc.lastEscalatedAt = new Date().toISOString();
      esc.nextEscalationAt = new Date(now + policy.repeatIntervalMs).toISOString();
      esc.status = 'ESCALATED';
      esc.idempotencyKey = idempotencyKey;
      esc.updatedAt = new Date().toISOString();

      await escalationStatesRepository.update(esc.id, esc);
      escalated++;

      const correlationId = `corr_esc_worker_${Date.now()}`;

      await this.recordTimelineEvent({
        incidentId: incident.id,
        event: 'ESCALATION_SENT',
        actorId: 'SYSTEM_ESCALATION_WORKER',
        message: `Escalation level ${esc.currentLevel} triggered according to policy ${policy.name}`,
        correlationId,
        details: { level: esc.currentLevel, policyId: policy.policyId },
      });

      await auditService.log({
        communityId: incident.communityId || 'SYSTEM',
        actorUserId: 'SYSTEM_ESCALATION_WORKER',
        actorRole: 'OWNER',
        action: 'INCIDENT_ESCALATED' as any,
        targetType: 'incident',
        targetId: incident.id,
        metadata: { incidentId: incident.id, level: esc.currentLevel, policyId: policy.policyId, correlationId },
      });
    }

    return { processedCount: processed, escalatedCount: escalated };
  }

  public async getEscalationState(incidentId: string): Promise<EscalationState | null> {
    const list = await escalationStatesRepository.list();
    return list.find((e) => e.incidentId === incidentId) || null;
  }

  // =========================================================================
  // 8. TIMELINE HELPER & RETENTION
  // =========================================================================

  public async recordTimelineEvent(params: {
    incidentId: string;
    event: IncidentTimelineEventType;
    actorId: string;
    actorRole?: string;
    message: string;
    correlationId?: string;
    details?: Record<string, any>;
  }): Promise<IncidentTimelineEvent> {
    const event: IncidentTimelineEvent = {
      id: `tl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      incidentId: params.incidentId,
      timestamp: new Date().toISOString(),
      event: params.event,
      actorId: params.actorId,
      actorRole: params.actorRole,
      message: secretsManager.redactString(params.message),
      correlationId: params.correlationId,
      details: params.details,
    };

    return await incidentTimelinesRepository.create(event);
  }

  public async getIncidentTimeline(incidentId: string): Promise<IncidentTimelineEvent[]> {
    const list = await incidentTimelinesRepository.list();
    return list
      .filter((t) => t.incidentId === incidentId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  public async listEscalationPolicies(): Promise<EscalationPolicy[]> {
    await this.ensureDefaultPolicies();
    return await escalationPoliciesRepository.list();
  }

  public async getRoutingDecisions(incidentId?: string): Promise<AlertRoutingDecision[]> {
    const list = await alertRoutingDecisionsRepository.list();
    if (incidentId) {
      return list.filter((d) => d.incidentId === incidentId);
    }
    return list;
  }

  public async listNotifications(incidentId?: string): Promise<OperationalNotificationRecord[]> {
    const list = await operationalNotificationsRepository.list();
    if (incidentId) {
      return list.filter((n) => n.incidentId === incidentId);
    }
    return list;
  }

  public async isComponentInMaintenance(component: string): Promise<boolean> {
    const res = await this.isSuppressedByMaintenance(component);
    return res.suppressed;
  }

  public async processPendingEscalations(): Promise<{ processedCount: number; escalatedCount: number }> {
    return await this.processEscalationWorkerRun();
  }

  public async applyIncidentRetention(retentionDays: number = 90): Promise<{ retainedCount: number; archivedCount: number }> {
    const list = await incidentsRepository.list();
    const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let retained = 0;
    let archived = 0;

    for (const inc of list) {
      // Never delete active or unresolved incidents
      if (inc.status !== 'RESOLVED') {
        retained++;
        continue;
      }
      const resolvedTime = inc.resolvedAt ? new Date(inc.resolvedAt).getTime() : 0;
      if (resolvedTime < cutoffTime) {
        // Safe retention handler - preserves auditability
        archived++;
      } else {
        retained++;
      }
    }

    return { retainedCount: retained, archivedCount: archived };
  }
}

export const incidentResponseService = IncidentResponseService.getInstance();
