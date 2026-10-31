import {
  workspacesRepository,
  workspaceMembersRepository,
  workspaceInvitationsRepository,
  communitiesRepository,
} from '../repositories/index.js';
import {
  WorkspaceDocument,
  WorkspaceMemberDocument,
  WorkspaceInvitationDocument,
  WorkspaceRole,
  WorkspaceStatus,
  CommunityDocument,
} from '../../shared/types/models.js';
import { UserRole } from '../../shared/types/rbac.js';
import { auditService } from './audit.service.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { isPlatformOwner } from '../security/rbac.js';
import { config } from '../config/env.js';

export class WorkspaceService {
  /**
   * Creates a new Workspace and binds the creator as WORKSPACE_OWNER.
   */
  async createWorkspace(
    ownerUserId: string,
    ownerRole: UserRole,
    name: string,
    communityIds: string[] = []
  ): Promise<{ workspace: WorkspaceDocument; member: WorkspaceMemberDocument }> {
    if (!name || name.trim().length === 0) {
      throw new BadRequestError('Workspace name is required');
    }

    const nowStr = new Date().toISOString();
    const workspaceId = `ws_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Create Workspace Document
    const workspace = await workspacesRepository.create({
      id: workspaceId,
      name: name.trim(),
      ownerUserId,
      communityIds,
      status: 'ACTIVE',
      createdAt: nowStr,
      updatedAt: nowStr,
    });

    // Create Owner Member Document
    const memberId = `${workspaceId}_${ownerUserId}`;
    const member = await workspaceMembersRepository.create({
      id: memberId,
      workspaceId,
      userId: ownerUserId,
      role: 'WORKSPACE_OWNER',
      status: 'ACTIVE',
      createdAt: nowStr,
      updatedAt: nowStr,
    });

    // Bind specified communities
    for (const commId of communityIds) {
      const comm = await communitiesRepository.getById(commId);
      if (comm) {
        await communitiesRepository.update(commId, {
          workspaceId,
          updatedAt: nowStr,
        });
      }
    }

    await auditService.record({
      communityId: communityIds[0] || 'global',
      actorUserId: ownerUserId,
      actorRole: ownerRole,
      action: 'WORKSPACE_CREATED',
      targetType: 'workspace',
      targetId: workspaceId,
      metadata: { name: workspace.name, ownerUserId, communityCount: communityIds.length },
    });

    return { workspace, member };
  }

  /**
   * Lists all workspaces accessible to a given user.
   */
  async listUserWorkspaces(
    userId: string,
    role: UserRole
  ): Promise<Array<{ workspace: WorkspaceDocument; memberRole: WorkspaceRole }>> {
    if (isPlatformOwner({ userId, role } as any)) {
      const all = await workspacesRepository.list();
      return all.map((w) => ({
        workspace: w,
        memberRole: w.ownerUserId === userId ? 'WORKSPACE_OWNER' : 'WORKSPACE_ADMIN',
      }));
    }

    // Find memberships
    const memberships = await workspaceMembersRepository.list({
      where: [
        { field: 'userId', operator: '==', value: userId },
        { field: 'status', operator: '==', value: 'ACTIVE' },
      ],
    });

    const results: Array<{ workspace: WorkspaceDocument; memberRole: WorkspaceRole }> = [];

    for (const mem of memberships) {
      const ws = await workspacesRepository.getById(mem.workspaceId);
      if (ws && ws.status !== 'DELETION_REQUESTED') {
        results.push({ workspace: ws, memberRole: mem.role });
      }
    }

    return results;
  }

  /**
   * Retrieves a single workspace with server-side authorization check.
   */
  async getWorkspace(
    userId: string,
    role: UserRole,
    workspaceId: string
  ): Promise<{ workspace: WorkspaceDocument; memberRole: WorkspaceRole; members: WorkspaceMemberDocument[] }> {
    const ws = await workspacesRepository.getById(workspaceId);
    if (!ws) throw new NotFoundError(`Workspace ${workspaceId} not found`);

    if (isPlatformOwner({ userId, role } as any)) {
      const members = await workspaceMembersRepository.list({
        where: [{ field: 'workspaceId', operator: '==', value: workspaceId }],
      });
      return { workspace: ws, memberRole: 'WORKSPACE_OWNER', members };
    }

    const member = await workspaceMembersRepository.getById(`${workspaceId}_${userId}`);
    if (!member || member.status !== 'ACTIVE') {
      throw new ForbiddenError(`Access denied to workspace ${workspaceId}`);
    }

    const members = await workspaceMembersRepository.list({
      where: [{ field: 'workspaceId', operator: '==', value: workspaceId }],
    });

    return { workspace: ws, memberRole: member.role, members };
  }

  /**
   * Updates workspace details.
   */
  async updateWorkspace(
    actorUserId: string,
    actorRole: UserRole,
    workspaceId: string,
    updates: { name?: string }
  ): Promise<WorkspaceDocument> {
    const { workspace, memberRole } = await this.getWorkspace(actorUserId, actorRole, workspaceId);

    if (memberRole !== 'WORKSPACE_OWNER' && memberRole !== 'WORKSPACE_ADMIN' && !isPlatformOwner({ userId: actorUserId, role: actorRole } as any)) {
      throw new ForbiddenError('Only Workspace Owner or Admin can update workspace settings');
    }

    const nowStr = new Date().toISOString();
    const updated = await workspacesRepository.update(workspaceId, {
      ...(updates.name ? { name: updates.name.trim() } : {}),
      updatedAt: nowStr,
    });

    await auditService.record({
      communityId: workspace.communityIds[0] || 'global',
      actorUserId,
      actorRole,
      action: 'WORKSPACE_UPDATED',
      targetType: 'workspace',
      targetId: workspaceId,
      metadata: updates,
    });

    return updated;
  }

  /**
   * Dual-Requirement Authorization Check:
   * Requires BOTH Workspace Membership AND Community/Discord Ownership/Permission.
   */
  async validateCommunityAccess(
    userId: string,
    role: UserRole,
    communityId: string
  ): Promise<{ authorized: boolean; workspaceRole?: WorkspaceRole; reason?: string }> {
    if (isPlatformOwner({ userId, role } as any)) {
      return { authorized: true, workspaceRole: 'WORKSPACE_OWNER' };
    }

    let community = await communitiesRepository.getById(communityId);
    if (!community && communityId.startsWith('comm_')) {
      const targetGuildId = communityId.replace('comm_', '');
      const allComms = await communitiesRepository.list();
      community = allComms.find(
        (c) => c.guildId === targetGuildId || c.discordGuildId === targetGuildId
      ) || null;
    }
    if (!community) {
      return { authorized: false, reason: `Community ${communityId} not found` };
    }

    // 1. Workspace Authorization
    if (community.workspaceId) {
      const wsMember = await workspaceMembersRepository.getById(`${community.workspaceId}_${userId}`);
      if (!wsMember || wsMember.status !== 'ACTIVE') {
        return {
          authorized: false,
          reason: `User ${userId} is not a member of workspace ${community.workspaceId}`,
        };
      }

      if (wsMember.role === 'WORKSPACE_MEMBER') {
        const allowed = wsMember.allowedCommunityIds || [];
        if (!allowed.includes(communityId)) {
          return {
            authorized: false,
            reason: `User is restricted from accessing community ${communityId} in workspace`,
          };
        }
      }
    }

    // 2. Community Authorization
    const isSimulationAllowed = config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION' && config.DEV_SIMULATION_ENABLED && process.env.DEV_SIMULATION_ENABLED !== 'false';
    const isOwner =
      community.ownerUserId === userId ||
      community.verifiedOwnerDiscordUserId === userId ||
      role === 'OWNER' ||
      (isSimulationAllowed && (userId === 'usr_owner_dev' || userId.startsWith('usr_owner')));
    const isMemberRole = role === 'OWNER' || role === 'CONTROLLER' || role === 'INTERVIEWER' || role === 'RECRUITER';

    if (!isOwner && !isMemberRole) {
      return {
        authorized: false,
        reason: `User lacks Discord community role/permission for ${communityId}`,
      };
    }

    return { authorized: true };
  }

  /**
   * Binds an authorized Discord community to a workspace.
   */
  async addCommunityToWorkspace(
    actorUserId: string,
    actorRole: UserRole,
    workspaceId: string,
    communityId: string
  ): Promise<WorkspaceDocument> {
    const { workspace, memberRole } = await this.getWorkspace(actorUserId, actorRole, workspaceId);

    if (memberRole !== 'WORKSPACE_OWNER' && memberRole !== 'WORKSPACE_ADMIN' && !isPlatformOwner({ userId: actorUserId, role: actorRole } as any)) {
      throw new ForbiddenError('Only Workspace Owner or Admin can add communities');
    }

    const comm = await communitiesRepository.getById(communityId);
    if (!comm) throw new NotFoundError(`Community ${communityId} not found`);

    if (!workspace.communityIds.includes(communityId)) {
      const updatedCommIds = [...workspace.communityIds, communityId];
      const nowStr = new Date().toISOString();

      await communitiesRepository.update(communityId, {
        workspaceId,
        updatedAt: nowStr,
      });

      const updatedWs = await workspacesRepository.update(workspaceId, {
        communityIds: updatedCommIds,
        updatedAt: nowStr,
      });

      await auditService.record({
        communityId,
        actorUserId,
        actorRole,
        action: 'WORKSPACE_COMMUNITY_ADDED',
        targetType: 'workspace',
        targetId: workspaceId,
        metadata: { communityId, communityName: comm.name },
      });

      return updatedWs;
    }

    return workspace;
  }

  /**
   * Removes a community from a workspace.
   */
  async removeCommunityFromWorkspace(
    actorUserId: string,
    actorRole: UserRole,
    workspaceId: string,
    communityId: string
  ): Promise<WorkspaceDocument> {
    const { workspace, memberRole } = await this.getWorkspace(actorUserId, actorRole, workspaceId);

    if (memberRole !== 'WORKSPACE_OWNER' && memberRole !== 'WORKSPACE_ADMIN' && !isPlatformOwner({ userId: actorUserId, role: actorRole } as any)) {
      throw new ForbiddenError('Only Workspace Owner or Admin can remove communities');
    }

    const updatedCommIds = workspace.communityIds.filter((id) => id !== communityId);
    const nowStr = new Date().toISOString();

    const comm = await communitiesRepository.getById(communityId);
    if (comm && comm.workspaceId === workspaceId) {
      await communitiesRepository.update(communityId, {
        workspaceId: undefined,
        updatedAt: nowStr,
      });
    }

    const updatedWs = await workspacesRepository.update(workspaceId, {
      communityIds: updatedCommIds,
      updatedAt: nowStr,
    });

    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'WORKSPACE_COMMUNITY_REMOVED',
      targetType: 'workspace',
      targetId: workspaceId,
      metadata: { communityId },
    });

    return updatedWs;
  }

  /**
   * Invites a new user to join the workspace.
   */
  async inviteMember(
    actorUserId: string,
    actorRole: UserRole,
    workspaceId: string,
    payload: {
      invitedEmail: string;
      role: WorkspaceRole;
      allowedCommunityIds?: string[];
    }
  ): Promise<WorkspaceInvitationDocument> {
    const { workspace, memberRole } = await this.getWorkspace(actorUserId, actorRole, workspaceId);

    if (memberRole !== 'WORKSPACE_OWNER' && memberRole !== 'WORKSPACE_ADMIN' && !isPlatformOwner({ userId: actorUserId, role: actorRole } as any)) {
      throw new ForbiddenError('Only Workspace Owner or Admin can invite members');
    }

    if (payload.role === 'WORKSPACE_OWNER') {
      throw new BadRequestError('Cannot invite as WORKSPACE_OWNER. Use ownership transfer workflow.');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const invId = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const inv = await workspaceInvitationsRepository.create({
      id: invId,
      workspaceId,
      invitedEmail: payload.invitedEmail.toLowerCase().trim(),
      role: payload.role,
      allowedCommunityIds: payload.allowedCommunityIds || [],
      status: 'PENDING',
      expiresAt,
      createdBy: actorUserId,
      createdAt: now.toISOString(),
    });

    await auditService.record({
      communityId: workspace.communityIds[0] || 'global',
      actorUserId,
      actorRole,
      action: 'WORKSPACE_MEMBER_INVITED',
      targetType: 'workspace_invitation',
      targetId: invId,
      metadata: { invitedEmail: payload.invitedEmail, role: payload.role },
    });

    return inv;
  }

  /**
   * Accepts a pending workspace invitation.
   */
  async acceptInvitation(
    userId: string,
    userRole: UserRole,
    invitationId: string
  ): Promise<{ member: WorkspaceMemberDocument; workspace: WorkspaceDocument }> {
    const inv = await workspaceInvitationsRepository.getById(invitationId);
    if (!inv) throw new NotFoundError(`Invitation ${invitationId} not found`);

    if (inv.status !== 'PENDING') {
      throw new BadRequestError(`Invitation is ${inv.status}`);
    }

    if (new Date() > new Date(inv.expiresAt)) {
      await workspaceInvitationsRepository.update(invitationId, { status: 'EXPIRED' });
      throw new BadRequestError('Invitation has expired');
    }

    const nowStr = new Date().toISOString();

    // Mark invitation accepted
    await workspaceInvitationsRepository.update(invitationId, {
      status: 'ACCEPTED',
      acceptedAt: nowStr,
    });

    // Create or activate membership
    const memberId = `${inv.workspaceId}_${userId}`;
    let member = await workspaceMembersRepository.getById(memberId);

    if (member) {
      member = await workspaceMembersRepository.update(memberId, {
        role: inv.role,
        allowedCommunityIds: inv.allowedCommunityIds,
        status: 'ACTIVE',
        updatedAt: nowStr,
      });
    } else {
      member = await workspaceMembersRepository.create({
        id: memberId,
        workspaceId: inv.workspaceId,
        userId,
        role: inv.role,
        allowedCommunityIds: inv.allowedCommunityIds,
        status: 'ACTIVE',
        createdAt: nowStr,
        updatedAt: nowStr,
      });
    }

    const workspace = await workspacesRepository.getById(inv.workspaceId);

    await auditService.record({
      communityId: workspace?.communityIds[0] || 'global',
      actorUserId: userId,
      actorRole: userRole,
      action: 'WORKSPACE_MEMBER_ACCEPTED',
      targetType: 'workspace',
      targetId: inv.workspaceId,
      metadata: { invitationId, role: inv.role },
    });

    return { member, workspace: workspace! };
  }

  /**
   * Revokes a pending workspace invitation.
   */
  async revokeInvitation(
    actorUserId: string,
    actorRole: UserRole,
    workspaceId: string,
    invitationId: string
  ): Promise<WorkspaceInvitationDocument> {
    const { memberRole } = await this.getWorkspace(actorUserId, actorRole, workspaceId);

    if (memberRole !== 'WORKSPACE_OWNER' && memberRole !== 'WORKSPACE_ADMIN' && !isPlatformOwner({ userId: actorUserId, role: actorRole } as any)) {
      throw new ForbiddenError('Only Workspace Owner or Admin can revoke invitations');
    }

    const inv = await workspaceInvitationsRepository.getById(invitationId);
    if (!inv || inv.workspaceId !== workspaceId) {
      throw new NotFoundError(`Invitation ${invitationId} not found in workspace`);
    }

    const nowStr = new Date().toISOString();
    return workspaceInvitationsRepository.update(invitationId, {
      status: 'REVOKED',
      revokedAt: nowStr,
    });
  }

  /**
   * Updates workspace member role and allowed community scopes.
   */
  async updateMemberRole(
    actorUserId: string,
    actorRole: UserRole,
    workspaceId: string,
    targetUserId: string,
    newRole: WorkspaceRole,
    allowedCommunityIds?: string[]
  ): Promise<WorkspaceMemberDocument> {
    const { workspace, memberRole } = await this.getWorkspace(actorUserId, actorRole, workspaceId);

    if (memberRole !== 'WORKSPACE_OWNER' && !isPlatformOwner({ userId: actorUserId, role: actorRole } as any)) {
      throw new ForbiddenError('Only Workspace Owner can change member roles');
    }

    if (targetUserId === workspace.ownerUserId) {
      throw new BadRequestError('Cannot modify Workspace Owner role. Use transfer ownership workflow.');
    }

    if (newRole === 'WORKSPACE_OWNER') {
      throw new BadRequestError('Use transfer ownership workflow to assign WORKSPACE_OWNER.');
    }

    const memberId = `${workspaceId}_${targetUserId}`;
    const targetMem = await workspaceMembersRepository.getById(memberId);
    if (!targetMem) throw new NotFoundError(`Member ${targetUserId} not found in workspace`);

    const nowStr = new Date().toISOString();
    const updated = await workspaceMembersRepository.update(memberId, {
      role: newRole,
      allowedCommunityIds: allowedCommunityIds || targetMem.allowedCommunityIds,
      updatedAt: nowStr,
    });

    await auditService.record({
      communityId: workspace.communityIds[0] || 'global',
      actorUserId,
      actorRole,
      action: 'WORKSPACE_MEMBER_ROLE_CHANGED',
      targetType: 'workspace_member',
      targetId: targetUserId,
      metadata: { newRole, allowedCommunityIds },
    });

    return updated;
  }

  /**
   * Removes a member from the workspace.
   */
  async removeMember(
    actorUserId: string,
    actorRole: UserRole,
    workspaceId: string,
    targetUserId: string
  ): Promise<void> {
    const { workspace, memberRole } = await this.getWorkspace(actorUserId, actorRole, workspaceId);

    if (memberRole !== 'WORKSPACE_OWNER' && memberRole !== 'WORKSPACE_ADMIN' && !isPlatformOwner({ userId: actorUserId, role: actorRole } as any)) {
      throw new ForbiddenError('Only Workspace Owner or Admin can remove members');
    }

    if (targetUserId === workspace.ownerUserId) {
      throw new BadRequestError('Cannot remove Workspace Owner from workspace');
    }

    const memberId = `${workspaceId}_${targetUserId}`;
    await workspaceMembersRepository.delete(memberId);

    await auditService.record({
      communityId: workspace.communityIds[0] || 'global',
      actorUserId,
      actorRole,
      action: 'WORKSPACE_MEMBER_REMOVED',
      targetType: 'workspace_member',
      targetId: targetUserId,
      metadata: { workspaceId },
    });
  }

  /**
   * Transfers workspace ownership to an existing active member.
   */
  async transferOwnership(
    actorUserId: string,
    actorRole: UserRole,
    workspaceId: string,
    targetUserId: string
  ): Promise<WorkspaceDocument> {
    const { workspace, memberRole } = await this.getWorkspace(actorUserId, actorRole, workspaceId);

    const isOwner = memberRole === 'WORKSPACE_OWNER' || isPlatformOwner({ userId: actorUserId, role: actorRole } as any);
    if (!isOwner) {
      throw new ForbiddenError('Only the Workspace Owner can transfer ownership');
    }

    if (targetUserId === workspace.ownerUserId) {
      throw new BadRequestError('Target user is already Workspace Owner');
    }

    const targetMem = await workspaceMembersRepository.getById(`${workspaceId}_${targetUserId}`);
    if (!targetMem || targetMem.status !== 'ACTIVE') {
      throw new BadRequestError('Target user must be an active workspace member before transferring ownership');
    }

    const nowStr = new Date().toISOString();

    // Demote current owner to WORKSPACE_ADMIN
    const currentOwnerMemId = `${workspaceId}_${workspace.ownerUserId}`;
    await workspaceMembersRepository.update(currentOwnerMemId, {
      role: 'WORKSPACE_ADMIN',
      updatedAt: nowStr,
    });

    // Promote target member to WORKSPACE_OWNER
    await workspaceMembersRepository.update(`${workspaceId}_${targetUserId}`, {
      role: 'WORKSPACE_OWNER',
      updatedAt: nowStr,
    });

    // Update workspace document owner
    const updatedWs = await workspacesRepository.update(workspaceId, {
      ownerUserId: targetUserId,
      updatedAt: nowStr,
    });

    // Audit log immutable ownership transfer
    await auditService.record({
      communityId: workspace.communityIds[0] || 'global',
      actorUserId,
      actorRole,
      action: 'WORKSPACE_OWNER_CHANGED',
      targetType: 'workspace',
      targetId: workspaceId,
      metadata: { previousOwner: workspace.ownerUserId, newOwner: targetUserId },
    });

    return updatedWs;
  }

  /**
   * Protected Workspace Deletion Workflow:
   * REQUESTED -> CONFIRMATION_REQUIRED -> SCHEDULED -> COMPLETED / CANCELLED
   */
  async protectedDeletionWorkflow(
    actorUserId: string,
    actorRole: UserRole,
    workspaceId: string,
    action: 'REQUEST' | 'CONFIRM' | 'CANCEL'
  ): Promise<WorkspaceDocument> {
    const { workspace, memberRole } = await this.getWorkspace(actorUserId, actorRole, workspaceId);

    if (memberRole !== 'WORKSPACE_OWNER' && !isPlatformOwner({ userId: actorUserId, role: actorRole } as any)) {
      throw new ForbiddenError('Only Workspace Owner can initiate workspace deletion workflow');
    }

    const nowStr = new Date().toISOString();

    if (action === 'REQUEST') {
      const updated = await workspacesRepository.update(workspaceId, {
        status: 'DELETION_REQUESTED',
        updatedAt: nowStr,
      });

      await auditService.record({
        communityId: workspace.communityIds[0] || 'global',
        actorUserId,
        actorRole,
        action: 'WORKSPACE_DELETION_REQUESTED',
        targetType: 'workspace',
        targetId: workspaceId,
      });

      return updated;
    } else if (action === 'CONFIRM') {
      const scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const updated = await workspacesRepository.update(workspaceId, {
        status: 'SCHEDULED_FOR_DELETION',
        deletionScheduledAt: scheduledAt,
        updatedAt: nowStr,
      });

      await auditService.record({
        communityId: workspace.communityIds[0] || 'global',
        actorUserId,
        actorRole,
        action: 'WORKSPACE_DELETION_SCHEDULED',
        targetType: 'workspace',
        targetId: workspaceId,
        metadata: { scheduledAt },
      });

      return updated;
    } else if (action === 'CANCEL') {
      const updated = await workspacesRepository.update(workspaceId, {
        status: 'ACTIVE',
        deletionScheduledAt: undefined,
        updatedAt: nowStr,
      });

      await auditService.record({
        communityId: workspace.communityIds[0] || 'global',
        actorUserId,
        actorRole,
        action: 'WORKSPACE_DELETION_CANCELLED',
        targetType: 'workspace',
        targetId: workspaceId,
      });

      return updated;
    }

    throw new BadRequestError(`Invalid deletion action: ${action}`);
  }
}

export const workspaceService = new WorkspaceService();
