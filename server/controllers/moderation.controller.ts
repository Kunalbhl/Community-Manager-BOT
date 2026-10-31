import { Request, Response, NextFunction } from 'express';
import {
  warningService,
  blacklistService,
  ruleService,
  safetyIncidentService,
  moderationLogService,
  autoModerationService,
  moderationActionService,
  restrictionService,
  moderationAuditService,
} from '../services/moderation.service.js';
import { EntitlementService } from '../services/entitlement.service.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { logger } from '../logging/logger.js';
import { communitiesRepository, blacklistEntriesRepository, moderationActionExecutionsRepository } from '../repositories/index.js';

function getCommunityId(req: Request): string {
  const communityId = req.header('x-community-id') || req.user?.communityId;
  if (!communityId) {
    throw new BadRequestError('Community tenant context is missing.');
  }
  return communityId;
}

/**
 * Ensures user has appropriate moderation roles.
 */
function assertModerator(req: Request) {
  if (!req.user) {
    throw new ForbiddenError('Authentication required');
  }
  const role = req.user.role;
  if (role === 'MEMBER' || role === 'APPLICANT' || role === 'RECRUITER') {
    throw new ForbiddenError('You are not authorized to perform moderation management actions.');
  }
}

function assertAdmin(req: Request) {
  if (!req.user) {
    throw new ForbiddenError('Authentication required');
  }
  const role = req.user.role;
  if (role !== 'OWNER' && role !== 'CONTROLLER' && req.user.role !== 'PLATFORM_OWNER') {
    throw new ForbiddenError('Only community owners or controllers can manage advanced settings.');
  }
}

/**
 * 1. WARNINGS HANDLERS
 */
export async function getWarningsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const targetUserId = req.query.discordUserId as string;

    const list = targetUserId
      ? await warningService.getWarningHistory(communityId, targetUserId)
      : await warningService.getWarningHistory(communityId, ''); // Fetch all by querying tenant if not targeted

    res.json({ success: true, warnings: list });
  } catch (error) {
    next(error);
  }
}

export async function createWarningHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertModerator(req);

    const hasFeature = await EntitlementService.hasFeature(communityId, 'WARNINGS');
    if (!hasFeature) {
      throw new ForbiddenError('WARNINGS feature limit reached or not available on this plan level.');
    }

    const { discordUserId, reason, severity, notes, expiresDays } = req.body;
    if (!discordUserId || !reason || !severity) {
      throw new BadRequestError('discordUserId, reason, and severity are required.');
    }

    const warning = await warningService.createWarning({
      communityId,
      discordUserId,
      reason,
      moderatorId: req.user?.userId || 'moderator',
      severity,
      expiresDays,
      notes,
    });

    res.status(201).json({ success: true, warning });
  } catch (error) {
    next(error);
  }
}

export async function revokeWarningHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertAdmin(req);

    const { id } = req.params;
    const { notes } = req.body;

    const updated = await warningService.revokeWarning({
      communityId,
      warningId: id,
      revokedBy: req.user?.userId || 'admin',
      notes,
    });

    res.json({ success: true, warning: updated });
  } catch (error) {
    next(error);
  }
}

/**
 * 2. MODERATION LOGS
 */
export async function getLogsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertModerator(req);

    const { member, actor, action, status } = req.query;

    const logs = await moderationLogService.getLogs(communityId, {
      member: member as string,
      actor: actor as string,
      action: action as string,
      status: status as string,
    });

    res.json({ success: true, logs });
  } catch (error) {
    next(error);
  }
}

/**
 * 3. BLACKLIST HANDLERS
 */
export async function getBlacklistHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertModerator(req);

    const list = await blacklistService.getActiveBlacklist(communityId);
    res.json({ success: true, blacklist: list });
  } catch (error) {
    next(error);
  }
}

export async function blacklistMemberHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertAdmin(req);

    const hasFeature = await EntitlementService.hasFeature(communityId, 'BLACKLIST');
    if (!hasFeature) {
      throw new ForbiddenError('BLACKLIST feature not available on your active plan.');
    }

    const { discordUserId, reason, notes, expiresDays } = req.body;
    if (!discordUserId || !reason) {
      throw new BadRequestError('discordUserId and reason are required.');
    }

    const entry = await blacklistService.blacklistMember({
      communityId,
      discordUserId,
      reason,
      actor: req.user?.userId || 'admin',
      expiresDays,
      notes,
    });

    res.status(201).json({ success: true, entry });
  } catch (error) {
    next(error);
  }
}

export async function unblacklistMemberHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertAdmin(req);

    const { discordUserId } = req.params;
    const success = await blacklistService.unblacklistMember(communityId, discordUserId, req.user?.userId || 'admin');

    if (!success) {
      throw new NotFoundError('Blacklist entry not found.');
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

/**
 * 4. RULES HANDLERS
 */
export async function getRulesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    const rules = await ruleService.listAllRules(communityId);
    res.json({ success: true, rules });
  } catch (error) {
    next(error);
  }
}

export async function createRuleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertAdmin(req);

    const hasFeature = await EntitlementService.hasFeature(communityId, 'RULES_MANAGEMENT');
    if (!hasFeature) {
      throw new ForbiddenError('RULES_MANAGEMENT feature not available on your plan level.');
    }

    const { title, content, version, order } = req.body;
    if (!title || !content || !version) {
      throw new BadRequestError('title, content, and version are required.');
    }

    const rule = await ruleService.createRule({
      communityId,
      title,
      content,
      version,
      order: order || 0,
      createdBy: req.user?.userId || 'admin',
    });

    res.status(201).json({ success: true, rule });
  } catch (error) {
    next(error);
  }
}

export async function updateRuleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertAdmin(req);

    const { id } = req.params;
    const rule = await ruleService.updateRule({
      communityId,
      ruleId: id,
      updates: req.body,
      updatedBy: req.user?.userId || 'admin',
    });

    res.json({ success: true, rule });
  } catch (error) {
    next(error);
  }
}

export async function publishRulesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertAdmin(req);

    const { version } = req.body;
    if (!version) {
      throw new BadRequestError('version is required to publish rules.');
    }

    const success = await ruleService.publishRules(communityId, version, req.user?.userId || 'admin');
    res.json({ success });
  } catch (error) {
    next(error);
  }
}

/**
 * 5. AUTOMOD HANDLERS
 */
export async function getAutoModRulesHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertModerator(req);

    const rules = await autoModerationService.listRules(communityId);
    res.json({ success: true, rules });
  } catch (error) {
    next(error);
  }
}

export async function createAutoModRuleHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertAdmin(req);

    const hasFeature = await EntitlementService.hasFeature(communityId, 'AUTO_MODERATION');
    if (!hasFeature) {
      throw new ForbiddenError('AUTO_MODERATION feature is not enabled on your plan tier.');
    }

    const { name, ruleType, conditions, action, priority, cooldownSeconds } = req.body;
    if (!name || !ruleType || !action) {
      throw new BadRequestError('name, ruleType, and action are required.');
    }

    const rule = await autoModerationService.createRule({
      communityId,
      name,
      ruleType,
      conditions: conditions || {},
      action,
      priority: priority || 0,
      cooldownSeconds: cooldownSeconds || 60,
      createdBy: req.user?.userId || 'admin',
    });

    res.status(201).json({ success: true, rule });
  } catch (error) {
    next(error);
  }
}

export async function updateAutoModRuleStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertAdmin(req);

    const { id } = req.params;
    const { enabled } = req.body;

    const rule = await autoModerationService.updateRuleStatus(communityId, id, enabled, req.user?.userId || 'admin');
    res.json({ success: true, rule });
  } catch (error) {
    next(error);
  }
}

/**
 * 6. SAFETY INCIDENTS HANDLERS
 */
export async function getIncidentsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertModerator(req);

    const incidents = await safetyIncidentService.getIncidents(communityId);
    res.json({ success: true, incidents });
  } catch (error) {
    next(error);
  }
}

export async function createIncidentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertModerator(req);

    const hasFeature = await EntitlementService.hasFeature(communityId, 'SAFETY_INCIDENTS');
    if (!hasFeature) {
      throw new ForbiddenError('SAFETY_INCIDENTS feature not available on your plan tier.');
    }

    const { title, description, severity, affectedMembers } = req.body;
    if (!title || !description || !severity || !affectedMembers) {
      throw new BadRequestError('title, description, severity, and affectedMembers are required.');
    }

    const incident = await safetyIncidentService.createIncident({
      communityId,
      title,
      description,
      severity,
      affectedMembers,
      assignedModerator: req.user?.userId,
    });

    res.status(201).json({ success: true, incident });
  } catch (error) {
    next(error);
  }
}

export async function updateIncidentHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertModerator(req);

    const { id } = req.params;
    const updated = await safetyIncidentService.updateIncident({
      communityId,
      incidentId: id,
      updates: req.body,
      actor: req.user?.userId || 'moderator',
    });

    res.json({ success: true, incident: updated });
  } catch (error) {
    next(error);
  }
}

/**
 * 7. DISCORD MODERATION PIPELINE EXECUTION
 */
export async function executeDiscordActionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertAdmin(req);

    const { actionType, targetDiscordUserId, reason, requestId } = req.body;
    if (!actionType || !targetDiscordUserId || !reason) {
      throw new BadRequestError('actionType, targetDiscordUserId, and reason are required.');
    }

    const execution = await moderationActionService.executeDiscordAction({
      communityId,
      actionType,
      targetDiscordUserId,
      actorDiscordUserId: req.user?.userId || 'admin',
      reason,
      requestId,
    });

    res.json({ success: true, execution });
  } catch (error) {
    next(error);
  }
}

export async function executeBulkDiscordActionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertAdmin(req);

    const { actionType, targetDiscordUserIds, reason } = req.body;
    if (!actionType || !targetDiscordUserIds || !reason) {
      throw new BadRequestError('actionType, targetDiscordUserIds, and reason are required.');
    }

    const response = await moderationActionService.executeBulkAction({
      communityId,
      actionType,
      targetDiscordUserIds,
      actorDiscordUserId: req.user?.userId || 'admin',
      reason,
    });

    res.json({ success: true, ...response });
  } catch (error) {
    next(error);
  }
}

/**
 * 8. MODERATION ANALYTICS EXPOSURE
 */
export async function getModerationAnalyticsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertModerator(req);

    const warnings = await warningService.getWarningHistory(communityId, '');
    const activeWarnings = warnings.filter((w) => w.status === 'ACTIVE').length;
    const revokedWarnings = warnings.filter((w) => w.status === 'REVOKED').length;

    const blacklist = await blacklistService.getActiveBlacklist(communityId);
    const blacklistRemovals = (await blacklistEntriesRepository.listForTenant(communityId)).filter((b) => b.status === 'REMOVED').length;

    const logs = await moderationLogService.getLogs(communityId);
    const timeouts = logs.filter((l) => l.action === 'TIMEOUT_APPLIED').length;
    const kicks = logs.filter((l) => l.action === 'KICK_EXECUTED').length;
    const bans = logs.filter((l) => l.action === 'BAN_EXECUTED').length;
    const automodTriggers = logs.filter((l) => l.action === 'AUTOMOD_TRIGGERED').length;

    const incidents = await safetyIncidentService.getIncidents(communityId);
    const openIncidents = incidents.filter((i) => i.status === 'OPEN' || i.status === 'INVESTIGATING').length;
    const resolvedIncidents = incidents.filter((i) => i.status === 'RESOLVED').length;

    const failedActions = (await moderationActionExecutionsRepository.listForTenant(communityId)).filter((e) => e.status === 'FAILED').length;

    res.json({
      success: true,
      metrics: {
        warningsIssued: warnings.length,
        warningsRevoked: revokedWarnings,
        activeWarnings,
        blacklistedMembers: blacklist.length,
        blacklistRemovals,
        timeouts,
        kicks,
        bans,
        automodTriggers,
        openIncidents,
        resolvedIncidents,
        failedModerationActions: failedActions,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * 9. RESTRICTIONS HANDLERS
 */
export async function getRestrictionsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertModerator(req);

    const targetUserId = req.query.discordUserId as string;
    const restrictions = await restrictionService.getRestrictions(communityId, targetUserId);
    res.json({ success: true, restrictions });
  } catch (error) {
    next(error);
  }
}

export async function createRestrictionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertModerator(req);

    const { targetDiscordUserId, restrictionType, reason, expiresDays, notes } = req.body;
    if (!targetDiscordUserId || !restrictionType || !reason) {
      throw new BadRequestError('targetDiscordUserId, restrictionType, and reason are required.');
    }

    const restriction = await restrictionService.createRestriction({
      communityId,
      targetDiscordUserId,
      restrictionType,
      reason,
      createdBy: req.user?.userId || 'moderator',
      expiresDays,
      notes,
    });

    res.status(201).json({ success: true, restriction });
  } catch (error) {
    next(error);
  }
}

export async function revokeRestrictionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertAdmin(req);

    const { id } = req.params;
    const { notes } = req.body;

    const updated = await restrictionService.revokeRestriction({
      communityId,
      restrictionId: id,
      revokedBy: req.user?.userId || 'admin',
      notes,
    });

    res.json({ success: true, restriction: updated });
  } catch (error) {
    next(error);
  }
}

/**
 * 10. SECURITY AUDIT HANDLER
 */
export async function getSecurityAuditHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = getCommunityId(req);
    assertModerator(req);

    const { actor, target, action, severity, startDate, endDate, result } = req.query;

    const audit = await moderationAuditService.getSecurityAudit(communityId, {
      actor: actor as string,
      target: target as string,
      action: action as string,
      severity: severity as string,
      startDate: startDate as string,
      endDate: endDate as string,
      result: result as string,
    });

    res.json({ success: true, audit });
  } catch (error) {
    next(error);
  }
}
