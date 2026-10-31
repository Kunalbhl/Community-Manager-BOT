import { Request, Response, NextFunction } from 'express';
import { observabilityService } from '../services/observability/observability.service.js';
import { operationalRecoveryService } from '../services/observability/recoveryAction.service.js';
import { incidentResponseService } from '../services/observability/incidentResponse.service.js';
import { DiscordRecoveryHelper } from '../services/observability/discordRecovery.js';
import { ForbiddenError, BadRequestError, NotFoundError } from '../utils/errors.js';
import { isPlatformOwner } from '../security/rbac.js';

export async function getSystemHealth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    // Platform operator check
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const health = await observabilityService.getSystemHealthOverview();
    const discordDiag = DiscordRecoveryHelper.diagnose(
      Boolean(process.env.DISCORD_BOT_TOKEN),
      true
    );

    res.json({
      success: true,
      data: {
        health,
        discordDiagnostic: discordDiag,
      },
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getIncidents(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const statusFilter = req.query.status as any;
    const incidents = await observabilityService.listIncidents(statusFilter);

    res.json({
      success: true,
      data: incidents,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getIncidentDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { id } = req.params;
    const incident = await observabilityService.getIncidentById(id);
    if (!incident) {
      throw new NotFoundError(`Incident with ID ${id} not found`);
    }

    res.json({
      success: true,
      data: incident,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function addIncidentNoteHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { id } = req.params;
    const { note } = req.body;
    if (!note || typeof note !== 'string' || !note.trim()) {
      throw new BadRequestError('Note content is required');
    }

    const updated = await observabilityService.addOperatorNote(id, note.trim(), user.userId);
    if (!updated) {
      throw new NotFoundError(`Incident with ID ${id} not found`);
    }

    res.json({
      success: true,
      data: updated,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateIncident(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { id } = req.params;
    const { status, operatorNote } = req.body;
    if (!status || !['OPEN', 'ACKNOWLEDGED', 'SUPPRESSED', 'RESOLVED'].includes(status)) {
      throw new BadRequestError('Valid status (OPEN, ACKNOWLEDGED, SUPPRESSED, RESOLVED) is required');
    }

    const updated = await observabilityService.updateIncidentStatus(id, status, user.userId, operatorNote);
    if (!updated) {
      throw new NotFoundError(`Incident with ID ${id} not found`);
    }

    res.json({
      success: true,
      data: updated,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getSchedulerStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const jobs = await observabilityService.getSchedulerStatuses();

    res.json({
      success: true,
      data: jobs,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getTenantHealth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = (req.query.communityId || req.params.communityId) as string;
    if (!communityId) throw new BadRequestError('communityId is required');

    const report = await observabilityService.getTenantHealthReport(communityId);

    res.json({
      success: true,
      data: report,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getProductionMetrics(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const metrics = await observabilityService.getProductionMetrics();

    res.json({
      success: true,
      data: metrics,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getTenantIncidentsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = (req.query.communityId || req.params.communityId) as string;
    if (!communityId) throw new BadRequestError('communityId is required');

    const statusFilter = req.query.status as any;
    const incidents = await observabilityService.listTenantIncidents(communityId, statusFilter);

    res.json({
      success: true,
      data: incidents,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function checkAlertConditionsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const detected = await observabilityService.detectAlertConditions();

    res.json({
      success: true,
      data: {
        detectedCount: detected.length,
        detectedIncidents: detected,
      },
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAvailableActionsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const actions = operationalRecoveryService.getAvailableActions();

    res.json({
      success: true,
      data: actions,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getActionHistoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const history = await operationalRecoveryService.getExecutionHistoryAsync();

    res.json({
      success: true,
      data: history,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function executeRecoveryActionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { actionId } = req.params;
    const { confirmed, idempotencyKey, parameters, incidentId } = req.body || {};

    const result = await operationalRecoveryService.executeAction({
      actionId,
      actorUserId: user.userId,
      confirmed: Boolean(confirmed),
      idempotencyKey,
      parameters,
      incidentId: incidentId || parameters?.incidentId,
      correlationId: (req.id as string) || undefined,
    });

    res.json({
      success: true,
      data: result,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

// =========================================================================
// TASK 134 — Observability, Health Snapshots, Latency, SLOs & Alert Handlers
// =========================================================================

export async function getHealthSnapshotsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const snapshots = await observabilityService.getLatestHealthSnapshots();
    res.json({
      success: true,
      data: snapshots,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getLatencyDistributionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const operation = req.query.operation as string;
    const distributions = await observabilityService.getLatencyDistribution(operation);
    res.json({
      success: true,
      data: distributions,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getAlertRulesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    res.json({
      success: true,
      data: observabilityService.ALERT_RULES,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getIncidentTimelineHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { id } = req.params;
    const timeline = await observabilityService.getIncidentTimeline(id);
    res.json({
      success: true,
      data: timeline,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getServiceLevelObjectivesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const slos = await observabilityService.calculateSLOs();
    res.json({
      success: true,
      data: slos,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getOperationalTrendsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const trends = await observabilityService.getOperationalTrends();
    res.json({
      success: true,
      data: trends,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getNotificationPreferencesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const prefs = await observabilityService.getNotificationPreferences(user.userId);
    res.json({
      success: true,
      data: prefs,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateNotificationPreferencesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const updates = req.body || {};
    const prefs = await observabilityService.updateNotificationPreferences(user.userId, updates);
    res.json({
      success: true,
      data: prefs,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function recordOperationalMetricHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { metricName, component, value, unit, status, communityId, actionId, incidentId, labels } = req.body || {};
    if (!metricName || typeof value !== 'number') {
      throw new BadRequestError('metricName and numeric value are required');
    }

    const recorded = await observabilityService.recordMetric({
      metricName,
      component: component || 'APPLICATION',
      value,
      unit: unit || 'count',
      status,
      communityId,
      actionId,
      incidentId,
      labels,
      correlationId: (req.id as string) || undefined,
    });

    res.json({
      success: true,
      data: recorded,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function listOperationalMetricsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { component, metricName, communityId, limit } = req.query;
    const metrics = await observabilityService.listMetrics({
      component: component as string,
      metricName: metricName as string,
      communityId: communityId as string,
      limit: limit ? Number(limit) : undefined,
    });

    res.json({
      success: true,
      data: metrics,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

// =========================================================================
// TASK 135 — Incident Response, Alert Routing & Maintenance Handlers
// =========================================================================

export async function acknowledgeIncidentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { id } = req.params;
    const { note } = req.body || {};

    const updated = await incidentResponseService.acknowledgeIncident({
      incidentId: id,
      actorUserId: user.userId,
      actorRole: user.role || 'PLATFORM_OWNER',
      note,
      correlationId: (req.id as string) || undefined,
    });

    res.json({
      success: true,
      data: updated,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function assignIncidentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { id } = req.params;
    const { ownerId, ownerRole } = req.body || {};
    if (!ownerId) throw new BadRequestError('ownerId is required');

    const updated = await incidentResponseService.assignIncident({
      incidentId: id,
      ownerId,
      ownerRole,
      assignedBy: user.userId,
      actorRole: user.role || 'PLATFORM_OWNER',
      correlationId: (req.id as string) || undefined,
    });

    res.json({
      success: true,
      data: updated,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function reassignIncidentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { id } = req.params;
    const { newOwnerId, newOwnerRole, ownerId, ownerRole } = req.body || {};
    const targetOwner = newOwnerId || ownerId;
    if (!targetOwner) throw new BadRequestError('newOwnerId is required');

    const updated = await incidentResponseService.assignIncident({
      incidentId: id,
      ownerId: targetOwner,
      ownerRole: newOwnerRole || ownerRole,
      assignedBy: user.userId,
      actorRole: user.role || 'PLATFORM_OWNER',
      correlationId: (req.id as string) || undefined,
    });

    res.json({
      success: true,
      data: updated,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function unassignIncidentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { id } = req.params;
    const updated = await incidentResponseService.unassignIncident({
      incidentId: id,
      unassignedBy: user.userId,
      actorRole: user.role || 'PLATFORM_OWNER',
      correlationId: (req.id as string) || undefined,
    });

    res.json({
      success: true,
      data: updated,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function resolveIncidentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { id } = req.params;
    const { resolutionReason, reason } = req.body || {};
    const resReason = resolutionReason || reason;
    if (!resReason || typeof resReason !== 'string' || !resReason.trim()) {
      throw new BadRequestError('resolutionReason is required to resolve an incident');
    }

    const updated = await incidentResponseService.resolveIncident({
      incidentId: id,
      resolvedBy: user.userId,
      actorRole: user.role || 'PLATFORM_OWNER',
      resolutionReason: resReason.trim(),
      correlationId: (req.id as string) || undefined,
    });

    res.json({
      success: true,
      data: updated,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function reopenIncidentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { id } = req.params;
    const { reason } = req.body || {};

    const updated = await incidentResponseService.reopenIncident({
      incidentId: id,
      reopenedBy: user.userId,
      actorRole: user.role || 'PLATFORM_OWNER',
      reason,
      correlationId: (req.id as string) || undefined,
    });

    res.json({
      success: true,
      data: updated,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getIncidentCommunicationsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { id } = req.params;
    const communications = await incidentResponseService.getCommunications(id);

    res.json({
      success: true,
      data: communications,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function addIncidentCommunicationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { id } = req.params;
    const { message, note, type } = req.body || {};
    const content = message || note;
    if (!content || typeof content !== 'string' || !content.trim()) {
      throw new BadRequestError('message is required');
    }

    const saved = await incidentResponseService.addCommunication({
      incidentId: id,
      actorId: user.userId,
      actorRole: user.role || 'PLATFORM_OWNER',
      message: content.trim(),
      type: type || 'NOTE',
      correlationId: (req.id as string) || undefined,
    });

    res.json({
      success: true,
      data: saved,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getIncidentEscalationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { id } = req.params;
    const escalationState = await incidentResponseService.getEscalationState(id);

    res.json({
      success: true,
      data: escalationState || { status: 'NOT_CONFIGURED', incidentId: id },
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function pauseEscalationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { id } = req.params;
    const updated = await incidentResponseService.pauseEscalation({
      incidentId: id,
      actorUserId: user.userId,
      actorRole: user.role || 'PLATFORM_OWNER',
      correlationId: (req.id as string) || undefined,
    });

    res.json({
      success: true,
      data: updated,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function resumeEscalationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { id } = req.params;
    const updated = await incidentResponseService.resumeEscalation({
      incidentId: id,
      actorUserId: user.userId,
      actorRole: user.role || 'PLATFORM_OWNER',
      correlationId: (req.id as string) || undefined,
    });

    res.json({
      success: true,
      data: updated,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function listMaintenanceWindowsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { status, communityId } = req.query;
    const windows = await incidentResponseService.listMaintenanceWindows({
      status: status as string,
      communityId: communityId as string,
    });

    res.json({
      success: true,
      data: windows,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function createMaintenanceWindowHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { name, description, startAt, endAt, timezone, components, rules, communityId } = req.body || {};

    const window = await incidentResponseService.createMaintenanceWindow({
      name,
      description,
      startAt,
      endAt,
      timezone,
      components,
      rules,
      createdBy: user.userId,
      actorRole: user.role || 'PLATFORM_OWNER',
      communityId,
      correlationId: (req.id as string) || undefined,
    });

    res.json({
      success: true,
      data: window,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function cancelMaintenanceWindowHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');
    if (!isPlatformOwner(user)) {
      throw new ForbiddenError('Access restricted to Platform Operators');
    }

    const { id } = req.params;
    const updated = await incidentResponseService.cancelMaintenanceWindow({
      maintenanceWindowId: id,
      cancelledBy: user.userId,
      actorRole: user.role || 'PLATFORM_OWNER',
      correlationId: (req.id as string) || undefined,
    });

    res.json({
      success: true,
      data: updated,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}
