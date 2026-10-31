import { Request, Response, NextFunction } from 'express';
import { discordMemberSyncService } from '../services/discordMemberSync.service.js';
import { communityMember360Service } from '../services/communityMember360.service.js';
import { notificationService } from '../services/notification.service.js';
import { discordMembersRepository, communitiesRepository } from '../repositories/index.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { canAccessTenant } from '../security/rbac.js';

export async function listMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = (req.query.communityId as string) || user.communityId || '';
    if (!communityId) throw new BadRequestError('communityId is required');
    const query = {
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      roleId: typeof req.query.roleId === 'string' ? req.query.roleId : undefined,
      membershipStatus: typeof req.query.membershipStatus === 'string' ? req.query.membershipStatus : undefined,
      recruitmentStatus: typeof req.query.recruitmentStatus === 'string' ? (req.query.recruitmentStatus as any) : undefined,
      warningStatus: typeof req.query.warningStatus === 'string' ? (req.query.warningStatus as any) : undefined,
      sortBy: typeof req.query.sortBy === 'string' ? (req.query.sortBy as any) : undefined,
      sortDirection: typeof req.query.sortDirection === 'string' ? (req.query.sortDirection as any) : undefined,
    };

    const paged = await communityMember360Service.listMembers(communityId, query, user);

    res.json({
      success: true,
      data: paged.items,
      count: paged.items.length,
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      totalPages: paged.totalPages,
      syncOverview: paged.syncOverview,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMemberDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { discordUserId } = req.params;
    const communityId = (req.query.communityId as string) || user.communityId || '';
    if (!communityId) throw new BadRequestError('communityId is required');

    const memberId = `${communityId}_${discordUserId}`;
    const member = await discordMembersRepository.getById(memberId);

    if (!member) {
      throw new NotFoundError(`Member ${discordUserId} not found in community ${communityId}`);
    }

    res.json({
      success: true,
      data: member,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMember360(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { discordUserId } = req.params;
    const communityId = (req.query.communityId as string) || user.communityId || '';
    if (!communityId) throw new BadRequestError('communityId is required');

    const profile = await communityMember360Service.getMember360Profile(communityId, discordUserId, user);

    res.json({
      success: true,
      data: profile,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function assignMemberRole(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { discordUserId } = req.params;
    const { roleId, communityId: bodyCommunityId } = req.body;

    if (!roleId || typeof roleId !== 'string') {
      throw new BadRequestError('roleId is required');
    }

    const communityId = bodyCommunityId || (req.query.communityId as string) || user.communityId || '';
    if (!communityId) throw new BadRequestError('communityId is required');

    const result = await communityMember360Service.assignMemberRole(communityId, discordUserId, roleId, user);

    res.json({
      success: true,
      data: result,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function removeMemberRole(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { discordUserId, roleId } = req.params;
    const communityId = (req.body?.communityId as string) || (req.query.communityId as string) || user.communityId || '';
    if (!communityId) throw new BadRequestError('communityId is required');

    const result = await communityMember360Service.removeMemberRole(communityId, discordUserId, roleId, user);

    res.json({
      success: true,
      data: result,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function syncSingleMember(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { discordUserId } = req.params;
    const communityId = (req.body?.communityId as string) || (req.query.communityId as string) || user.communityId || '';
    if (!communityId) throw new BadRequestError('communityId is required');

    const result = await communityMember360Service.syncSingleMember(communityId, discordUserId, user);

    res.json({
      success: true,
      data: result,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function notifyMember(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { discordUserId } = req.params;
    const { title, body, priority, communityId: bodyCommunityId } = req.body;

    if (!title || !body) {
      throw new BadRequestError('title and body are required for member notification');
    }

    const communityId = bodyCommunityId || user.communityId || '';
    if (!communityId) throw new BadRequestError('communityId is required');

    const notifs = await notificationService.createAndDispatch({
      communityId,
      recipientDiscordId: discordUserId,
      recipientUserId: user.userId,
      category: 'SYSTEM',
      type: 'DIRECT_MEMBER_ALERT',
      priority: (priority as any) || 'NORMAL',
      title,
      body,
      resourceType: 'MEMBER',
      resourceId: discordUserId,
    });

    res.json({
      success: true,
      data: notifs[0] || null,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function syncMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = (req.body?.communityId as string) || (req.query.communityId as string) || user.communityId;
    if (!communityId) throw new BadRequestError('communityId is required');
    if (!canAccessTenant(user, communityId)) {
      throw new ForbiddenError('Access denied: You are not authorized for this community tenant', 'UNAUTHORIZED_TENANT');
    }
    const community = await communitiesRepository.getById(communityId);
    if (!community) throw new NotFoundError(`Community ${communityId} not found`);
    const guildId = community.guildId || community.discordGuildId || '';

    const syncResult = await discordMemberSyncService.syncGuildMembers(communityId, guildId);

    res.json({
      success: true,
      data: syncResult,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function assignRecruiterCode(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { discordUserId } = req.params;
    const { recruiterCode, communityId: bodyCommunityId } = req.body;

    if (!recruiterCode || typeof recruiterCode !== 'string') {
      throw new BadRequestError('Recruiter code string is required');
    }

    const communityId = bodyCommunityId || user.communityId || '';
    if (!communityId) throw new BadRequestError('communityId is required');

    const updatedMember = await discordMemberSyncService.assignManualRecruiterCode({
      communityId,
      discordUserId,
      recruiterCode,
      actorUserId: user.userId,
      actorRole: user.role,
    });

    res.json({
      success: true,
      data: updatedMember,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function exportMembersCsv(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = (req.query.communityId as string) || user.communityId || '';
    if (!communityId) throw new BadRequestError('communityId is required');
    const csvContent = await discordMemberSyncService.exportMembersCsv(communityId);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="members_${communityId}.csv"`);
    res.send(csvContent);
  } catch (error) {
    next(error);
  }
}

export async function previewBulkImport(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { rows, communityId: bodyCommId } = req.body;
    if (!Array.isArray(rows)) {
      throw new BadRequestError('Rows array is required for bulk import preview');
    }

    const communityId = bodyCommId || user.communityId || '';
    if (!communityId) throw new BadRequestError('communityId is required');
    const preview = await discordMemberSyncService.previewBulkMemberImport(communityId, rows);

    res.json({
      success: true,
      data: preview,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function confirmBulkImport(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { rows, communityId: bodyCommId } = req.body;
    if (!Array.isArray(rows)) {
      throw new BadRequestError('Rows array is required for bulk import confirmation');
    }

    const communityId = bodyCommId || user.communityId || '';
    if (!communityId) throw new BadRequestError('communityId is required');
    const result = await discordMemberSyncService.confirmBulkMemberImport({
      communityId,
      rows,
      actorUserId: user.userId,
      actorRole: user.role,
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
