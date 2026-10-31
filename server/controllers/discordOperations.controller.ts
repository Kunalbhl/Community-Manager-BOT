import { Request, Response, NextFunction } from 'express';
import { DiscordOperationsService } from '../services/discordOperations.service.js';
import { DiscordHygieneService } from '../services/discordHygiene.service.js';
import { UserAuthContext, UserRole } from '../../shared/types/rbac.js';
import { config } from '../config/env.js';

function buildAuthContext(req: Request): UserAuthContext {
  const reqUser = (req as any).user;
  const isSimulation = config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION' && config.DEV_SIMULATION_ENABLED;
  
  const roleHeader = isSimulation ? ((req.header('x-user-role') || req.header('x-role')) as UserRole | undefined) : undefined;
  const communityIdHeader = req.params.communityId || (req.query.communityId as string) || req.header('x-community-id') || undefined;
  const userIdHeader = isSimulation ? req.header('x-user-id') : undefined;
  const isOwnerHeader = isSimulation && req.header('x-platform-owner') === 'true';

  const role: UserRole = reqUser?.role || roleHeader || (isOwnerHeader ? 'PLATFORM_OWNER' : 'APPLICANT');
  const userId = reqUser?.userId || userIdHeader || 'anonymous-user';
  const communityId = reqUser?.communityId || communityIdHeader;
  const isPlatformOwner = reqUser?.isPlatformOwner === true || reqUser?.role === 'PLATFORM_OWNER' || (isSimulation && (isOwnerHeader || role === 'PLATFORM_OWNER'));

  return {
    userId,
    role,
    communityId,
    isPlatformOwner,
  };
}

export async function inspectServer(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId } = req.params;
    const authCtx = buildAuthContext(req);
    const data = await DiscordOperationsService.inspectServer(communityId, authCtx);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function syncServerData(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId } = req.params;
    const authCtx = buildAuthContext(req);
    const data = await DiscordOperationsService.syncServerData(communityId, authCtx);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function listRoles(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId } = req.params;
    const authCtx = buildAuthContext(req);
    const data = await DiscordOperationsService.listRoles(communityId, authCtx);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId } = req.params;
    const authCtx = buildAuthContext(req);
    const result = await DiscordOperationsService.createRole(communityId, authCtx, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function renameRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId, roleId } = req.params;
    const authCtx = buildAuthContext(req);
    const result = await DiscordOperationsService.renameRole(communityId, authCtx, {
      roleId,
      newName: req.body.newName,
      confirmed: req.body.confirmed,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function updateRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId, roleId } = req.params;
    const authCtx = buildAuthContext(req);
    const result = await DiscordOperationsService.updateRole(communityId, authCtx, {
      roleId,
      updates: req.body.updates || req.body,
      confirmed: req.body.confirmed,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function assignRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId } = req.params;
    const authCtx = buildAuthContext(req);
    const result = await DiscordOperationsService.assignRole(communityId, authCtx, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function removeRole(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId } = req.params;
    const authCtx = buildAuthContext(req);
    const result = await DiscordOperationsService.removeRole(communityId, authCtx, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getRoleDiagnostics(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId } = req.params;
    const authCtx = buildAuthContext(req);
    const data = await DiscordOperationsService.getRoleHierarchyDiagnostics(communityId, authCtx);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function applyRoleTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId } = req.params;
    const authCtx = buildAuthContext(req);
    const result = await DiscordOperationsService.applyRoleTemplate(communityId, authCtx, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listChannels(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId } = req.params;
    const authCtx = buildAuthContext(req);
    const data = await DiscordOperationsService.listChannels(communityId, authCtx);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function createChannel(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId } = req.params;
    const authCtx = buildAuthContext(req);
    const result = await DiscordOperationsService.createChannel(communityId, authCtx, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function renameChannel(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId, channelId } = req.params;
    const authCtx = buildAuthContext(req);
    const result = await DiscordOperationsService.renameChannel(communityId, authCtx, {
      channelId,
      newName: req.body.newName,
      confirmed: req.body.confirmed,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function applyChannelTemplate(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId } = req.params;
    const authCtx = buildAuthContext(req);
    const result = await DiscordOperationsService.applyChannelTemplate(communityId, authCtx, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getChannelDiagnostics(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId, channelId } = req.params;
    const authCtx = buildAuthContext(req);
    const data = await DiscordOperationsService.getChannelPermissionDiagnostics(communityId, channelId, authCtx);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function bulkMemberRoleOperation(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId } = req.params;
    const authCtx = buildAuthContext(req);
    const result = await DiscordOperationsService.bulkMemberRoleOperation(communityId, authCtx, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function analyzeHygiene(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId } = req.params;
    const data = await DiscordHygieneService.analyzeHygiene(communityId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function applyHygieneFix(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId } = req.params;
    const authCtx = buildAuthContext(req);
    const result = await DiscordHygieneService.applyHygieneFix(
      communityId,
      authCtx,
      req.body.findingId,
      req.body.confirmed
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function generateBlueprint(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId } = req.params;
    const authCtx = buildAuthContext(req);
    const data = await DiscordOperationsService.generateBlueprint(communityId, authCtx);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function applyBlueprint(req: Request, res: Response, next: NextFunction) {
  try {
    const { communityId } = req.params;
    const authCtx = buildAuthContext(req);
    const result = await DiscordOperationsService.applyBlueprint(
      communityId,
      authCtx,
      req.body.selectedModules || [],
      req.body.confirmed
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}
