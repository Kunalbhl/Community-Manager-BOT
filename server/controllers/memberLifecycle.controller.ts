import { Request, Response } from 'express';
import { memberLifecycleService } from '../services/memberLifecycle.service.js';
import { eventsRepository } from '../repositories/index.js';
import { UserAuthContext } from '../../shared/types/rbac.js';
import { ChecklistItemKey, EarlyEngagementEventType } from '../../shared/types/models.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.js';

export interface AuthenticatedRequest extends Request {
  user?: UserAuthContext;
  communityId?: string;
}

export class MemberLifecycleController {
  async getProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
    const communityId = req.communityId || req.query.communityId as string;
    const { discordUserId } = req.params;

    if (!communityId) {
      throw new BadRequestError('communityId is required');
    }

    // RBAC: Member can view self, or admins/reviewers can view members
    const isSelf = req.user?.discordUserId === discordUserId || req.user?.userId === discordUserId;
    const isStaff = ['ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MANAGER', 'MODERATOR', 'REVIEWER'].includes(req.user?.role || '');

    if (!isSelf && !isStaff) {
      throw new ForbiddenError('Unauthorized to view member lifecycle profile');
    }

    const profile = await memberLifecycleService.getMemberLifecycleProfile(communityId, discordUserId);
    res.json({ success: true, data: profile });
  }

  async getChecklist(req: AuthenticatedRequest, res: Response): Promise<void> {
    const communityId = req.communityId || req.query.communityId as string;
    const { discordUserId } = req.params;

    if (!communityId) {
      throw new BadRequestError('communityId is required');
    }

    const isSelf = req.user?.discordUserId === discordUserId || req.user?.userId === discordUserId;
    const isStaff = ['ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MANAGER', 'MODERATOR', 'REVIEWER'].includes(req.user?.role || '');

    if (!isSelf && !isStaff) {
      throw new ForbiddenError('Unauthorized to view onboarding checklist');
    }

    const checklist = await memberLifecycleService.initializeChecklist(communityId, discordUserId);
    res.json({ success: true, data: checklist });
  }

  async completeChecklistItem(req: AuthenticatedRequest, res: Response): Promise<void> {
    const communityId = req.communityId || req.body.communityId;
    const { discordUserId } = req.params;
    const { itemKey } = req.body;

    if (!communityId || !itemKey) {
      throw new BadRequestError('communityId and itemKey are required');
    }

    const isSelf = req.user?.discordUserId === discordUserId || req.user?.userId === discordUserId;
    const isStaff = ['ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MANAGER'].includes(req.user?.role || '');

    if (!isSelf && !isStaff) {
      throw new ForbiddenError('Unauthorized to complete checklist items for this member');
    }

    const updated = await memberLifecycleService.completeChecklistItem(
      communityId,
      discordUserId,
      itemKey as ChecklistItemKey
    );

    res.json({ success: true, data: updated });
  }

  async retryHandoff(req: AuthenticatedRequest, res: Response): Promise<void> {
    const communityId = req.communityId || req.body.communityId;
    const { handoffId } = req.body;

    if (!communityId || !handoffId) {
      throw new BadRequestError('communityId and handoffId are required');
    }

    const isStaff = ['ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MANAGER'].includes(req.user?.role || '');
    if (!isStaff) {
      throw new ForbiddenError('Only staff can retry member lifecycle handoffs');
    }

    const handoff = await memberLifecycleService.retryHandoff(
      communityId,
      handoffId,
      req.user?.userId || 'STAFF',
      req.user?.role as any || 'ADMIN'
    );

    res.json({ success: true, data: handoff });
  }

  async recordEngagement(req: AuthenticatedRequest, res: Response): Promise<void> {
    const communityId = req.communityId || req.body.communityId;
    const { discordUserId } = req.params;
    const { eventType, metadata } = req.body;

    if (!communityId || !eventType) {
      throw new BadRequestError('communityId and eventType are required');
    }

    const isSelf = req.user?.discordUserId === discordUserId || req.user?.userId === discordUserId;
    const isStaff = ['ADMIN', 'SUPER_ADMIN', 'COMMUNITY_MANAGER'].includes(req.user?.role || '');

    if (!isSelf && !isStaff) {
      throw new ForbiddenError('Unauthorized to record early engagement');
    }

    const record = await memberLifecycleService.recordEarlyEngagement(
      communityId,
      discordUserId,
      eventType as EarlyEngagementEventType,
      metadata
    );

    res.json({ success: true, data: record });
  }

  async getUnifiedFunnel(req: AuthenticatedRequest, res: Response): Promise<void> {
    const communityId = req.communityId || req.query.communityId as string;
    const range = (req.query.range as string) || '30d';

    if (!communityId) {
      throw new BadRequestError('communityId is required');
    }

    const funnel = await memberLifecycleService.getUnifiedFunnel(communityId, range);
    res.json({ success: true, data: funnel });
  }

  async getUpcomingEvents(req: AuthenticatedRequest, res: Response): Promise<void> {
    const communityId = req.communityId || req.query.communityId as string;
    if (!communityId) {
      throw new BadRequestError('communityId is required');
    }

    const allEvents = await eventsRepository.listForTenant(communityId);
    const now = new Date().toISOString();
    const upcoming = allEvents
      .filter((e) => e.status !== 'CANCELLED' && (e.startAt ? e.startAt >= now : true))
      .sort((a, b) => new Date(a.startAt || 0).getTime() - new Date(b.startAt || 0).getTime())
      .slice(0, 5);

    res.json({ success: true, data: upcoming });
  }
}

export const memberLifecycleController = new MemberLifecycleController();
