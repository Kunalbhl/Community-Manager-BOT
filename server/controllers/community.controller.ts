import { Request, Response, NextFunction } from 'express';
import { communitiesRepository, communityConfigurationRepository } from '../repositories/index.js';
import { ForbiddenError, NotFoundError, BadRequestError } from '../utils/errors.js';
import { isPlatformOwner, canAccessTenant, hasPermission } from '../security/rbac.js';
import { communityConfigurationService } from '../services/communityConfiguration.service.js';

export async function listCommunities(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    let communities = await communitiesRepository.list();

    // Tenant Isolation: Non-platform users only see their own community if specified
    if (!isPlatformOwner(user) && user.communityId) {
      communities = communities.filter((c) => c.id === user.communityId);
    }

    res.json({
      success: true,
      data: communities,
      count: communities.length,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCommunity(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id } = req.params;

    if (!canAccessTenant(user, id)) {
      throw new ForbiddenError(`Access denied to community ${id}`);
    }

    let community = await communitiesRepository.getById(id);
    if (!community && id.startsWith('comm_')) {
      const targetGuildId = id.replace('comm_', '');
      const allComms = await communitiesRepository.list();
      community = allComms.find((c) => c.guildId === targetGuildId || c.discordGuildId === targetGuildId) || null;
    }
    const config = await communityConfigurationRepository.getById(community?.id || id);

    if (!community) {
      throw new NotFoundError(`Community ${id} not found`);
    }

    res.json({
      success: true,
      data: {
        ...community,
        configuration: config || null,
      },
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCommunity(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id } = req.params;

    if (!canAccessTenant(user, id)) {
      throw new ForbiddenError(`Access denied: Cross-community update prohibited`);
    }

    const { name, iconUrl, isActive } = req.body;
    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (name) updates.name = name;
    if (iconUrl !== undefined) updates.iconUrl = iconUrl;
    if (typeof isActive === 'boolean') updates.isActive = isActive;

    const existing = await communitiesRepository.getById(id);
    if (!existing) {
      throw new NotFoundError(`Community ${id} not found`);
    }

    const updated = await communitiesRepository.update(id, updates);

    res.json({
      success: true,
      data: updated,
      message: 'Community updated successfully',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieves the personalized recruiter identity for a specific community tenant.
 * Safe fallback guarantees "Community Recruiter" if unconfigured.
 */
export async function getRecruiterIdentity(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    if (!id) throw new BadRequestError('Community ID is required');

    const identity = await communityConfigurationService.getCommunityRecruiterIdentity(id);

    res.json({
      success: true,
      data: identity,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Updates the personalized recruiter identity (display name, greeting, persona toggle)
 * Strictly enforced: Only Community OWNER or CONTROLLER with settings/community permission.
 */
export async function updateRecruiterIdentity(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id } = req.params;
    if (!id) throw new BadRequestError('Community ID is required');

    // Tenant isolation check
    if (!canAccessTenant(user, id)) {
      throw new ForbiddenError(`Access denied: Cross-community recruiter identity update prohibited`);
    }

    // RBAC Authorization check
    const canManage =
      hasPermission(user, 'settings.manage') ||
      hasPermission(user, 'community.manage');

    if (!canManage) {
      throw new ForbiddenError('Insufficient permissions to modify community recruiter persona');
    }

    const { recruiterDisplayName, recruiterWelcomeGreeting, recruiterAvatarUrl, recruiterPersonaEnabled } = req.body;

    const updated = await communityConfigurationService.updateCommunityRecruiterIdentity(
      id,
      {
        recruiterDisplayName,
        recruiterWelcomeGreeting,
        recruiterAvatarUrl,
        recruiterPersonaEnabled,
      },
      user.userId,
      user.role,
      req.id
    );

    res.json({
      success: true,
      data: updated,
      message: 'Community recruiter persona updated successfully',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Resets community recruiter persona back to default ("Community Recruiter").
 */
export async function resetRecruiterIdentity(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id } = req.params;
    if (!id) throw new BadRequestError('Community ID is required');

    // Tenant isolation check
    if (!canAccessTenant(user, id)) {
      throw new ForbiddenError(`Access denied: Cross-community recruiter identity reset prohibited`);
    }

    // RBAC Authorization check
    const canManage =
      hasPermission(user, 'settings.manage') ||
      hasPermission(user, 'community.manage');

    if (!canManage) {
      throw new ForbiddenError('Insufficient permissions to reset community recruiter persona');
    }

    const reset = await communityConfigurationService.resetCommunityRecruiterIdentity(
      id,
      user.userId,
      user.role,
      req.id
    );

    res.json({
      success: true,
      data: reset,
      message: 'Community recruiter persona reset to default',
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

