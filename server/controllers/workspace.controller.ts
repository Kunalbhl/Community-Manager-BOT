import { Request, Response, NextFunction } from 'express';
import { workspaceService } from '../services/workspace.service.js';
import { ForbiddenError, BadRequestError } from '../utils/errors.js';

export async function createWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { name, communityIds } = req.body;
    const result = await workspaceService.createWorkspace(user.userId, user.role, name, communityIds || []);

    res.status(201).json({
      success: true,
      data: result,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function listUserWorkspaces(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const result = await workspaceService.listUserWorkspaces(user.userId, user.role);

    res.json({
      success: true,
      data: result,
      count: result.length,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const workspaceId = req.params.id;
    const result = await workspaceService.getWorkspace(user.userId, user.role, workspaceId);

    res.json({
      success: true,
      data: result,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const workspaceId = req.params.id;
    const updated = await workspaceService.updateWorkspace(user.userId, user.role, workspaceId, req.body);

    res.json({
      success: true,
      data: updated,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function addCommunityToWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const workspaceId = req.params.id;
    const { communityId } = req.body;
    if (!communityId) throw new BadRequestError('communityId is required');

    const updated = await workspaceService.addCommunityToWorkspace(user.userId, user.role, workspaceId, communityId);

    res.json({
      success: true,
      data: updated,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function removeCommunityFromWorkspace(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id: workspaceId, communityId } = req.params;

    const updated = await workspaceService.removeCommunityFromWorkspace(
      user.userId,
      user.role,
      workspaceId,
      communityId
    );

    res.json({
      success: true,
      data: updated,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function inviteMember(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const workspaceId = req.params.id;
    const invitation = await workspaceService.inviteMember(user.userId, user.role, workspaceId, req.body);

    res.status(201).json({
      success: true,
      data: invitation,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function acceptInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const invitationId = req.params.invitationId;
    const result = await workspaceService.acceptInvitation(user.userId, user.role, invitationId);

    res.json({
      success: true,
      data: result,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function revokeInvitation(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id: workspaceId, invitationId } = req.params;
    const revoked = await workspaceService.revokeInvitation(user.userId, user.role, workspaceId, invitationId);

    res.json({
      success: true,
      data: revoked,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateMemberRole(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id: workspaceId, targetUserId } = req.params;
    const { role, allowedCommunityIds } = req.body;

    const updated = await workspaceService.updateMemberRole(
      user.userId,
      user.role,
      workspaceId,
      targetUserId,
      role,
      allowedCommunityIds
    );

    res.json({
      success: true,
      data: updated,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id: workspaceId, targetUserId } = req.params;

    await workspaceService.removeMember(user.userId, user.role, workspaceId, targetUserId);

    res.json({
      success: true,
      message: `Member ${targetUserId} removed from workspace ${workspaceId}`,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function transferOwnership(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const workspaceId = req.params.id;
    const { targetUserId } = req.body;

    const updated = await workspaceService.transferOwnership(user.userId, user.role, workspaceId, targetUserId);

    res.json({
      success: true,
      data: updated,
      message: `Ownership transferred to ${targetUserId}`,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function protectedDeletionWorkflow(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const workspaceId = req.params.id;
    const { action } = req.body;

    const updated = await workspaceService.protectedDeletionWorkflow(
      user.userId,
      user.role,
      workspaceId,
      action
    );

    res.json({
      success: true,
      data: updated,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}
