import { Request, Response, NextFunction } from 'express';
import { discordResourceService } from '../services/discordResource.service.js';
import { communitiesRepository } from '../repositories/index.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { resolveAuthorizedCommunityContext } from '../services/authorization.service.js';

export class DiscordResourcesController {
  /**
   * GET /api/discord/guilds
   * Lists all Discord guilds the connected bot is currently a member of.
   */
  static async getGuilds(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await discordResourceService.getGuilds();
      res.json({
        success: result.success,
        state: result.state,
        isLive: result.isLive,
        data: result.items,
        totalCount: result.totalCount,
        discoveredAt: result.discoveredAt,
        error: result.error,
        requestId: req.id,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/discord/guilds/:guildId/channels
   * Discovers live channels for a Discord guild directly from the Discord gateway.
   */
  static async getGuildChannels(req: Request, res: Response, next: NextFunction) {
    try {
      const { guildId } = req.params;
      const textOnly = req.query.textOnly === 'true';
      const typesQuery = req.query.types as string;
      const types = typesQuery ? (typesQuery.split(',') as any[]) : undefined;

      const result = await discordResourceService.getChannels(guildId, { textOnly, types });
      res.json({
        success: result.success,
        state: result.state,
        isLive: result.isLive,
        guildId: result.guildId,
        guildName: result.guildName,
        data: result.items,
        totalCount: result.totalCount,
        cached: result.cached,
        discoveredAt: result.discoveredAt,
        error: result.error,
        requestId: req.id,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/discord/guilds/:guildId/roles
   * Discovers live roles for a Discord guild directly from the Discord gateway.
   */
  static async getGuildRoles(req: Request, res: Response, next: NextFunction) {
    try {
      const { guildId } = req.params;
      const includeEveryone = req.query.includeEveryone === 'true';
      const unmanagedOnly = req.query.unmanagedOnly === 'true';

      const result = await discordResourceService.getRoles(guildId, { includeEveryone, unmanagedOnly });
      res.json({
        success: result.success,
        state: result.state,
        isLive: result.isLive,
        guildId: result.guildId,
        guildName: result.guildName,
        data: result.items,
        totalCount: result.totalCount,
        cached: result.cached,
        discoveredAt: result.discoveredAt,
        error: result.error,
        requestId: req.id,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/discord/guilds/:guildId/members
   * Discovers live members for a Discord guild directly from the Discord gateway.
   */
  static async getGuildMembers(req: Request, res: Response, next: NextFunction) {
    try {
      const { guildId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const query = req.query.query as string;
      const after = req.query.after as string;

      const result = await discordResourceService.getMembers(guildId, { limit, query, after });
      res.json({
        success: result.success,
        state: result.state,
        isLive: result.isLive,
        guildId: result.guildId,
        guildName: result.guildName,
        data: result.items,
        totalCount: result.totalCount,
        discoveredAt: result.discoveredAt,
        error: result.error,
        requestId: req.id,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/discord/communities/:communityId/resources
   * Discovers all live resources (channels, roles, bot status) scoped to a community workspace.
   */
  static async getCommunityResources(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const community = await communitiesRepository.getById(communityId);
      if (!community) {
        throw new NotFoundError(`Community ${communityId} not found`);
      }

      const guildId = community.guildId || community.discordGuildId;
      if (!guildId) {
        return res.json({
          success: true,
          communityId,
          guildId: null,
          isLive: false,
          state: 'NO_GUILD_LINKED',
          channels: [],
          roles: [],
          botConnected: discordService.isConnected(),
          requestId: req.id,
        });
      }

      const [channelsRes, rolesRes] = await Promise.all([
        discordResourceService.getChannels(guildId),
        discordResourceService.getRoles(guildId),
      ]);

      res.json({
        success: true,
        communityId,
        guildId,
        guildName: community.name,
        isLive: channelsRes.isLive && rolesRes.isLive,
        state: channelsRes.state,
        channels: channelsRes.items,
        roles: rolesRes.items,
        botConnected: discordService.isConnected(),
        discoveredAt: new Date().toISOString(),
        requestId: req.id,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/discord/communities/:communityId/channels
   * Discovers live channels scoped to a community's linked Discord guild.
   */
  static async getCommunityChannels(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const textOnly = req.query.textOnly === 'true';
      const community = await communitiesRepository.getById(communityId);
      if (!community) {
        throw new NotFoundError(`Community ${communityId} not found`);
      }

      const guildId = community.guildId || community.discordGuildId;
      if (!guildId) {
        return res.json({
          success: true,
          communityId,
          guildId: null,
          isLive: false,
          state: 'NO_GUILD_LINKED',
          data: [],
          totalCount: 0,
          requestId: req.id,
        });
      }

      const result = await discordResourceService.getChannels(guildId, { textOnly });
      res.json({
        success: result.success,
        state: result.state,
        isLive: result.isLive,
        guildId: result.guildId,
        guildName: result.guildName,
        communityId,
        source: result.cached ? 'CACHE' : 'DISCORD_LIVE',
        data: result.items,
        totalCount: result.totalCount,
        cached: result.cached,
        discoveredAt: result.discoveredAt,
        error: result.error,
        requestId: req.id,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/discord/communities/:communityId/roles
   * Discovers live roles scoped to a community's linked Discord guild.
   */
  static async getCommunityRoles(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const includeEveryone = req.query.includeEveryone === 'true';
      const unmanagedOnly = req.query.unmanagedOnly === 'true';

      const community = await communitiesRepository.getById(communityId);
      if (!community) {
        throw new NotFoundError(`Community ${communityId} not found`);
      }

      const guildId = community.guildId || community.discordGuildId;
      if (!guildId) {
        return res.json({
          success: true,
          communityId,
          guildId: null,
          isLive: false,
          state: 'NO_GUILD_LINKED',
          data: [],
          totalCount: 0,
          requestId: req.id,
        });
      }

      const result = await discordResourceService.getRoles(guildId, { includeEveryone, unmanagedOnly });
      res.json({
        success: result.success,
        state: result.state,
        isLive: result.isLive,
        guildId: result.guildId,
        guildName: result.guildName,
        communityId,
        source: result.cached ? 'CACHE' : 'DISCORD_LIVE',
        data: result.items,
        totalCount: result.totalCount,
        cached: result.cached,
        discoveredAt: result.discoveredAt,
        error: result.error,
        requestId: req.id,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/discord/communities/:communityId/members
   * Discovers live members scoped to a community's linked Discord guild.
   */
  static async getCommunityMembers(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const query = req.query.query as string;
      const after = req.query.after as string;

      const community = await communitiesRepository.getById(communityId);
      if (!community) {
        throw new NotFoundError(`Community ${communityId} not found`);
      }

      const guildId = community.guildId || community.discordGuildId;
      if (!guildId) {
        return res.json({
          success: true,
          communityId,
          guildId: null,
          isLive: false,
          state: 'NO_GUILD_LINKED',
          data: [],
          totalCount: 0,
          requestId: req.id,
        });
      }

      const result = await discordResourceService.getMembers(guildId, { limit, query, after });
      res.json({
        success: result.success,
        state: result.state,
        isLive: result.isLive,
        guildId: result.guildId,
        guildName: result.guildName,
        communityId,
        source: 'DISCORD_LIVE',
        data: result.items,
        totalCount: result.totalCount,
        discoveredAt: result.discoveredAt,
        error: result.error,
        requestId: req.id,
      });
    } catch (error) {
      next(error);
    }
  }
}
