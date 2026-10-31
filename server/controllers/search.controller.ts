import { Request, Response, NextFunction } from 'express';
import { globalSearchService } from '../services/search.service.js';
import { UserAuthContext, UserRole } from '../../shared/types/rbac.js';
import { SearchQueryOptions, SearchResourceType, SearchCategory } from '../../shared/types/search.js';
import { auditLogsRepository, platformAuditLogsRepository } from '../repositories/index.js';
import { logger } from '../logging/logger.js';
import { BadRequestError, ForbiddenError } from '../utils/errors.js';

function buildAuthContext(req: Request): UserAuthContext {
  const reqUser = (req as any).user;
  const roleHeader = (req.header('x-user-role') || req.header('x-role')) as UserRole | undefined;
  const communityIdHeader = req.header('x-community-id') || (req.query.communityId as string) || undefined;
  const userIdHeader = req.header('x-user-id');
  const isOwnerHeader = req.header('x-platform-owner') === 'true';

  const role: UserRole = roleHeader || reqUser?.role || (isOwnerHeader ? 'PLATFORM_OWNER' : 'OWNER');
  const userId = userIdHeader || reqUser?.userId || 'anonymous-user';
  const communityId = communityIdHeader || reqUser?.communityId;
  const isPlatformOwner = isOwnerHeader || role === 'PLATFORM_OWNER' || reqUser?.isPlatformOwner === true;

  return {
    userId,
    role,
    communityId,
    isPlatformOwner,
  };
}

export class SearchController {
  /**
   * GET /api/v1/search
   * Community-scoped global search and command palette lookup.
   */
  async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = (req.query.q as string) || '';
      const communityId =
        (req.query.communityId as string) ||
        req.header('x-community-id') ||
        (req as any).user?.communityId ||
        '';

      const scope = (req.query.scope as 'community' | 'platform') || 'community';
      const category = req.query.category as SearchCategory | undefined;
      const types = req.query.type
        ? ((Array.isArray(req.query.type) ? req.query.type : [req.query.type]) as SearchResourceType[])
        : undefined;

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 25;
      const cursor = req.query.cursor ? parseInt(req.query.cursor as string, 10) : 0;
      const includeCommands = req.query.includeCommands !== 'false';
      const includeNavigation = req.query.includeNavigation !== 'false';

      const authContext = buildAuthContext(req);

      const options: SearchQueryOptions = {
        query: q,
        communityId,
        scope,
        category,
        types,
        limit,
        cursor,
        includeCommands,
        includeNavigation,
      };

      const results = await globalSearchService.searchCommunity(authContext, communityId, options);
      res.json(results);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/platform/search
   * Platform Owner global search across platform servers, users, incidents, and master settings.
   */
  async platformSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = (req.query.q as string) || '';
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 25;
      const cursor = req.query.cursor ? parseInt(req.query.cursor as string, 10) : 0;

      const authContext = buildAuthContext(req);

      const options: SearchQueryOptions = {
        query: q,
        scope: 'platform',
        limit,
        cursor,
      };

      const results = await globalSearchService.searchPlatform(authContext, options);
      res.json(results);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/search/command
   * Logs or handles contextual command execution from the Universal Command Center.
   */
  async executeCommand(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { commandId, actionId, communityId, metadata } = req.body;
      const authContext = buildAuthContext(req);

      if (!commandId) {
        throw new BadRequestError('Command ID is required');
      }

      // Audit command execution
      const targetCommunity = communityId || authContext.communityId || 'system';
      await auditLogsRepository.create({
        communityId: targetCommunity,
        actorUserId: authContext.userId,
        actorRole: authContext.role,
        action: 'COMMAND_EXECUTED',
        targetType: 'COMMAND',
        targetId: commandId,
        metadata: { actionId, ...(metadata || {}) },
        timestamp: new Date().toISOString(),
      });

      logger.info(`[CommandCenter] Command ${commandId} (${actionId}) triggered by user ${authContext.userId}`);

      res.json({
        success: true,
        commandId,
        actionId,
        message: 'Command acknowledged and routed',
      });
    } catch (err) {
      next(err);
    }
  }
}

export const searchController = new SearchController();
