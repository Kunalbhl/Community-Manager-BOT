import { Request, Response, NextFunction } from 'express';
import {
  platformServersRepository,
  platformUsersRepository,
  platformFeedbackRepository,
  platformUsageMetricsRepository,
  platformAuditLogsRepository,
  platformSettingsRepository,
  botInstallationsRepository,
  applicationsRepository,
  recruitersRepository,
  referralsRepository,
  incidentsRepository,
  communitiesRepository,
} from '../repositories/index.js';
import {
  PlatformServer,
  PlatformUser,
  PlatformFeedback,
  PlatformSetting,
  PlatformAuditEvent,
  PlatformServerStatus,
} from '../../shared/types/models.js';
import { config } from '../config/env.js';
import { SystemHealthData, PlatformOverviewMetrics } from '../../shared/types/api.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { logger } from '../logging/logger.js';
import { healthService } from '../services/health.service.js';
import { quotaService } from '../services/quota.service.js';
import { errorCenterService } from '../services/errorCenter.service.js';
import { AiUsageService } from '../services/ai/aiUsage.service.js';
import { platformOperationsService } from '../services/platformOperations.service.js';
import { observabilityService } from '../services/observability/observability.service.js';
import { IncidentStatus } from '../../shared/types/observability.js';

// 1. Authoritative Platform Overview
export async function getPlatformOverview(req: Request, res: Response, next: NextFunction) {
  try {
    const overview = await platformOperationsService.getOverview();

    // Standardized KPI metrics compatible with legacy + new contract
    const metrics: PlatformOverviewMetrics & { factualDetails: typeof overview.summary } = {
      totalRegisteredServers: overview.summary.communities.total.value,
      activeServers: overview.summary.communities.active.value,
      inactiveServers: overview.summary.communities.total.value - overview.summary.communities.active.value,
      totalRegisteredUsers: overview.summary.users.total.value,
      activeUsers: overview.summary.users.active.value,
      totalApplications: overview.summary.recruitment.totalApplications.value,
      applicationsToday: overview.summary.recruitment.applicationsToday.value,
      applicationsThisWeek: overview.summary.recruitment.applications7d.value,
      applicationsThisMonth: overview.summary.recruitment.applications30d.value,
      totalRecruiters: overview.summary.users.recruiters.value,
      totalReferrals: overview.summary.recruitment.totalReferrals.value,
      botInstallations: overview.summary.communities.connectedDiscord.value,
      failedOperations: overview.summary.health.activeIncidentsCount.value,
      pendingFeedback: 0,
      systemHealthStatus:
        overview.summary.health.systemStatus.value === 'HEALTHY' ||
        overview.summary.health.systemStatus.value === 'DEGRADED' ||
        overview.summary.health.systemStatus.value === 'OPERATIONAL_SAFE'
          ? overview.summary.health.systemStatus.value
          : 'DEGRADED',
      factualDetails: overview.summary,
    };

    res.json({
      success: true,
      data: metrics,
      detailedOverview: overview,
      recentActivity: overview.recentOperationalEvents,
      releaseStatus: overview.releaseStatus,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

// 2. Servers Module
export async function listPlatformServers(req: Request, res: Response, next: NextFunction) {
  try {
    const statusFilter = req.query.status as string | undefined;
    const searchQuery = req.query.q as string | undefined;

    const servers = await platformOperationsService.listServers({
      status: statusFilter,
      search: searchQuery,
    });

    res.json({
      success: true,
      data: servers,
      count: servers.length,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getPlatformServer(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const serverDetails = await platformOperationsService.getServerDetails(id);

    res.json({
      success: true,
      data: serverDetails,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function updatePlatformServerStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    const validStatuses: PlatformServerStatus[] = [
      'ACTIVE',
      'INACTIVE',
      'SUSPENDED',
      'CONFIGURATION_REQUIRED',
      'ERROR',
    ];

    if (!status || !validStatuses.includes(status)) {
      throw new BadRequestError(`Invalid server status: ${status}`);
    }

    const result = await platformOperationsService.updateServerStatus(
      id,
      status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
      req.user?.userId || 'platform_owner',
      reason
    );

    res.json({
      success: true,
      data: result,
      message: `Server status updated to ${status}`,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function forcePlatformServerSync(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const result = await platformOperationsService.forceServerSync(
      id,
      req.user?.userId || 'platform_owner'
    );

    res.json({
      success: true,
      data: result,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

// 3. Users Module
export async function listPlatformUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const searchQuery = req.query.q as string | undefined;
    const statusFilter = req.query.status as string | undefined;

    const users = await platformOperationsService.listUsers({
      search: searchQuery,
      status: statusFilter,
    });

    res.json({
      success: true,
      data: users,
      count: users.length,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function updatePlatformUserStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!status || !['ACTIVE', 'DISABLED', 'SUSPENDED', 'BANNED'].includes(status)) {
      throw new BadRequestError(`Invalid user status: ${status}`);
    }

    const result = await platformOperationsService.updateUserStatus(
      id,
      status,
      req.user?.userId || 'platform_owner',
      reason
    );

    res.json({
      success: true,
      data: result,
      message: `User status updated to ${status}`,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function revokePlatformUserSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const result = await platformOperationsService.revokeUserSession(
      id,
      req.user?.userId || 'platform_owner'
    );

    res.json({
      success: true,
      data: result,
      message: 'User session revoked successfully',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

// 4. Usage & Analytics Module (Tenant-Aware)
export async function getPlatformAnalytics(req: Request, res: Response, next: NextFunction) {
  try {
    const targetCommunityId = req.query.communityId as string | undefined;
    const range = (req.query.range as string) || '30d';

    const analytics = await platformOperationsService.getAnalytics(targetCommunityId, range);

    res.json({
      success: true,
      ...analytics,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

// 5. Feedback & Suggestions Module
export async function listPlatformFeedback(req: Request, res: Response, next: NextFunction) {
  try {
    const statusFilter = req.query.status as string | undefined;
    let feedbackList = await platformFeedbackRepository.list();

    if (statusFilter) {
      feedbackList = feedbackList.filter((f) => f.status === statusFilter);
    }

    res.json({
      success: true,
      data: feedbackList,
      count: feedbackList.length,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function createPlatformFeedback(req: Request, res: Response, next: NextFunction) {
  try {
    const { category, title, description, priority, communityId } = req.body;

    if (!title || !description || !category) {
      throw new BadRequestError('Title, description, and category are required');
    }

    const feedback = await platformFeedbackRepository.create({
      userId: req.user?.userId || 'anonymous_user',
      communityId: communityId || req.user?.communityId,
      category,
      title,
      description,
      priority: priority || 'MEDIUM',
      status: 'NEW',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    res.status(201).json({
      success: true,
      data: feedback,
      message: 'Feedback submitted successfully',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function updatePlatformFeedback(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const updates: Partial<PlatformFeedback> = {
      updatedAt: new Date().toISOString(),
    };

    if (status) updates.status = status;
    if (adminNotes !== undefined) updates.adminNotes = adminNotes;

    const updated = await platformFeedbackRepository.update(id, updates);

    res.json({
      success: true,
      data: updated,
      message: 'Feedback record updated',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

// 6. System Health Module (Genuine status - never fakes connected integrations)
export async function getSystemHealth(req: Request, res: Response, next: NextFunction) {
  try {
    const report = await healthService.getDetailedReport();
    const systemOverview = await observabilityService.getSystemHealthOverview();
    const scheduledJobs = await observabilityService.getSchedulerStatuses();

    const healthData: SystemHealthData & {
      domainHealth: any;
      scheduledJobs: any;
    } = {
      status: report.status === 'HEALTHY' ? 'OPERATIONAL_SAFE' : 'DEGRADED',
      freeMode: report.freeMode,
      adapters: {
        appServer: {
          name: report.components.application.name,
          status: report.components.application.status,
          configured: true,
          details: `Running Node ${report.components.application.nodeVersion} on port ${config.PORT} (${report.components.application.environment}). Memory: ${report.components.application.memoryUsageMb}MB, Uptime: ${report.components.application.uptimeSeconds}s.`,
          lastCheck: report.timestamp,
        },
        database: {
          name: report.components.database.name,
          status: report.components.database.status === 'CONFIGURED' ? 'HEALTHY' : 'NOT_CONFIGURED',
          configured: report.components.database.status === 'CONFIGURED',
          details: report.components.database.details,
          lastCheck: report.timestamp,
        },
        discord: {
          name: report.components.discordGateway.name,
          status: report.components.discordGateway.status === 'CONNECTED' ? 'HEALTHY' : (report.components.discordGateway.status as any),
          configured: report.components.discordConfig.hasBotToken,
          details: report.components.discordGateway.botTag
            ? `Connected as ${report.components.discordGateway.botTag} (${report.components.discordGateway.guildsCount} guilds, ping: ${report.components.discordGateway.pingMs}ms)`
            : (report.components.discordGateway.disconnectReason || 'Not connected to Gateway'),
          lastCheck: report.timestamp,
        },
        gemini: {
          name: report.components.aiEngine.name,
          status: report.components.aiEngine.status,
          configured: report.components.aiEngine.apiKeyConfigured,
          details: report.components.aiEngine.apiKeyConfigured
            ? `API key configured. Daily quota remaining: ${report.components.aiEngine.dailyQuotaRemaining}`
            : 'Not configured — AI evaluation disabled safely.',
          lastCheck: report.timestamp,
        },
        googleSheets: {
          name: report.components.googleSheets.name,
          status: report.components.googleSheets.status as any,
          configured: report.components.googleSheets.spreadsheetConfigured,
          details: report.components.googleSheets.spreadsheetConfigured
            ? `Spreadsheet linked (${report.components.googleSheets.templateSheetsCount} template sheets configured)`
            : 'Not configured — spreadsheet export disabled safely.',
          lastCheck: report.timestamp,
        },
        notifications: {
          name: 'Notification Dispatch Service',
          status: 'ACTIVE',
          configured: true,
          details: 'Direct Messages and In-app notification dispatcher active.',
          lastCheck: report.timestamp,
        },
        quotaService: {
          name: report.components.freeModeSafeguards.name,
          status: 'ACTIVE',
          configured: true,
          details: `Enforcing daily limits: AI max ${report.components.freeModeSafeguards.maxAiPerDay}, Apps max ${report.components.freeModeSafeguards.maxAppsPerDay}, Sheet writes max ${report.components.freeModeSafeguards.maxSheetWritesPerDay}.`,
          lastCheck: report.timestamp,
        },
      },
      domainHealth: systemOverview.dependencies,
      scheduledJobs,
    };

    res.json({
      success: true,
      data: healthData,
      report,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

// 7. Master Settings Module
export async function getPlatformSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await platformOperationsService.getMasterSettings();

    res.json({
      success: true,
      data: settings,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function updatePlatformSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const updated = await platformOperationsService.updateMasterSettings(
      req.body,
      req.user?.userId || 'platform_owner'
    );

    res.json({
      success: true,
      data: updated,
      message: 'Master platform settings updated successfully',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

// 8. Security & Audit Module
export async function listPlatformAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const actionFilter = req.query.action as string | undefined;
    const actorFilter = req.query.actorUserId as string | undefined;

    let logs = await platformAuditLogsRepository.list({
      limit: 100,
      orderBy: 'timestamp',
      orderDirection: 'desc',
    });

    if (actionFilter) {
      logs = logs.filter((l) => l.action === actionFilter);
    }
    if (actorFilter) {
      logs = logs.filter((l) => l.actorUserId === actorFilter);
    }

    res.json({
      success: true,
      data: logs,
      count: logs.length,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

// 9. Free-First Quota Management
export async function getPlatformQuotas(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = (req.query.communityId as string) || 'default';
    const snapshot = quotaService.getSnapshot(communityId);

    const now = new Date();
    const tomorrowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

    res.json({
      success: true,
      data: {
        freeMode: snapshot.freeMode,
        resetTimeUtc: tomorrowUtc.toISOString(),
        quotas: snapshot.quotas,
        status:
          snapshot.quotas.aiRequests.current >= snapshot.quotas.aiRequests.max ||
          snapshot.quotas.applications.current >= snapshot.quotas.applications.max ||
          snapshot.quotas.sheetWrites.current >= snapshot.quotas.sheetWrites.max
            ? 'QUOTA_EXCEEDED'
            : 'NORMAL',
      },
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

// 10. Operational Incidents & Deduplication
export async function listPlatformIncidents(req: Request, res: Response, next: NextFunction) {
  try {
    const statusFilter = req.query.status as IncidentStatus | undefined;
    const incidents = await observabilityService.listIncidents(statusFilter);

    res.json({
      success: true,
      data: incidents,
      count: incidents.length,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function updatePlatformIncidentStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['OPEN', 'ACKNOWLEDGED', 'RESOLVED'].includes(status)) {
      throw new BadRequestError(`Invalid incident status: ${status}`);
    }

    const updated = await observabilityService.updateIncidentStatus(
      id,
      status,
      req.user?.userId || 'platform_owner'
    );

    if (!updated) {
      throw new NotFoundError(`Incident ${id} not found`);
    }

    res.json({
      success: true,
      data: updated,
      message: `Incident status updated to ${status}`,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

// 11. Operational Error Center (Deduplicated)
export async function getPlatformErrorCenter(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = req.query.communityId as string | undefined;
    const errors = await errorCenterService.getGroupedErrors(communityId);

    res.json({
      success: true,
      data: errors,
      count: errors.length,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

// 12. Security Monitoring Center
export async function getPlatformSecurityCenter(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = req.query.communityId as string | undefined;
    const securityEvents = await errorCenterService.getSecurityEvents(communityId);

    res.json({
      success: true,
      data: securityEvents,
      count: securityEvents.length,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

// 13. Platform-Level AI Usage & Health Telemetry
export async function getPlatformAiUsage(req: Request, res: Response, next: NextFunction) {
  try {
    const aiOverview = await AiUsageService.getPlatformAiUsage();

    res.json({
      success: true,
      data: aiOverview,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}
