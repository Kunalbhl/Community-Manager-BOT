import { Request, Response, NextFunction } from 'express';
import { interviewsRepository } from '../repositories/index.js';
import { interviewService } from '../services/interview.service.js';
import { isPlatformOwner } from '../security/rbac.js';
import { ForbiddenError, NotFoundError, BadRequestError } from '../utils/errors.js';

export async function listInterviews(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const targetCommunityId = (req.query.communityId as string) || user.communityId;
    if (!targetCommunityId && !isPlatformOwner(user)) {
      throw new BadRequestError('Community ID is required');
    }

    if (!isPlatformOwner(user) && user.communityId && targetCommunityId !== user.communityId) {
      throw new ForbiddenError('Cross-community data access is strictly prohibited');
    }

    const interviews = targetCommunityId
      ? await interviewsRepository.listForTenant(targetCommunityId)
      : await interviewsRepository.list();

    res.json({
      success: true,
      data: interviews,
      count: interviews.length,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function getInterview(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id } = req.params;
    const interview = await interviewsRepository.getById(id);
    if (!interview) {
      throw new NotFoundError(`Interview ${id} not found`);
    }

    if (!isPlatformOwner(user) && user.communityId && interview.communityId !== user.communityId) {
      throw new ForbiddenError('Cross-community data access is strictly prohibited');
    }

    res.json({
      success: true,
      data: interview,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function scheduleInterviewHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const {
      communityId,
      applicationId,
      applicantDiscordUserId,
      scheduledTime,
      customQuestions,
    } = req.body;

    const targetCommunityId = communityId || user.communityId;
    if (!targetCommunityId) {
      throw new BadRequestError('Community ID is required');
    }

    if (!isPlatformOwner(user) && user.communityId && targetCommunityId !== user.communityId) {
      throw new ForbiddenError('Cross-community data access is strictly prohibited');
    }

    const result = await interviewService.scheduleInterview(
      {
        communityId: targetCommunityId,
        applicationId,
        applicantDiscordUserId: applicantDiscordUserId || 'disc_applicant',
        interviewerUserId: user.userId,
        interviewerDiscordUserId: user.userId,
        scheduledTime,
        customQuestions,
        actorRole: user.role,
      },
      req.id
    );

    res.status(201).json({
      success: true,
      data: result.interview,
      discordChannelStatus: result.discordChannelStatus,
      message: 'Interview scheduled successfully',
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function startInterviewHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id } = req.params;
    const interview = await interviewsRepository.getById(id);
    if (!interview) throw new NotFoundError(`Interview ${id} not found`);

    if (!isPlatformOwner(user) && user.communityId && interview.communityId !== user.communityId) {
      throw new ForbiddenError('Cross-community data access is strictly prohibited');
    }

    const updated = await interviewService.startInterview(
      id,
      interview.communityId,
      user.userId,
      user.role,
      req.id
    );

    res.json({
      success: true,
      data: updated,
      message: 'Interview started',
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function joinInterviewHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id } = req.params;
    const interview = await interviewsRepository.getById(id);
    if (!interview) throw new NotFoundError(`Interview ${id} not found`);

    const result = await interviewService.joinInterview({
      interviewId: id,
      communityId: interview.communityId,
      discordUserId: req.body.discordUserId || (user as any).discordId || user.userId,
      username: (user as any).username || (user as any).name || 'Authority',
      displayName: (user as any).displayName || (user as any).name,
      explicitRoleIds: req.body.explicitRoleIds,
      requestId: req.id,
    });

    res.json({
      success: true,
      data: result,
      message: result.announcementMessage,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function leaveInterviewHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id } = req.params;
    const interview = await interviewsRepository.getById(id);
    if (!interview) throw new NotFoundError(`Interview ${id} not found`);

    const result = await interviewService.leaveInterview({
      interviewId: id,
      communityId: interview.communityId,
      discordUserId: req.body.discordUserId || (user as any).discordId || user.userId,
      requestId: req.id,
    });

    res.json({
      success: true,
      data: result,
      message: result.announcementMessage,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function getInterviewSessionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id } = req.params;
    const interview = await interviewsRepository.getById(id);
    if (!interview) throw new NotFoundError(`Interview ${id} not found`);

    const session = await interviewService.getInterviewSession(id, interview.communityId);

    res.json({
      success: true,
      data: session,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function getInterviewIntroductionsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.params.communityId || user.communityId;
    if (!communityId) throw new BadRequestError('Community ID is required');

    const config = await interviewService.getIntroductionsConfig(communityId);

    res.json({
      success: true,
      data: config,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateInterviewIntroductionsHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const communityId = req.params.communityId || user.communityId;
    if (!communityId) throw new BadRequestError('Community ID is required');

    const updated = await interviewService.updateIntroductionsConfig(
      communityId,
      req.body,
      user.userId,
      user.role,
      req.id
    );

    res.json({
      success: true,
      data: updated,
      message: 'Interview introductions updated successfully',
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function completeInterviewHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id } = req.params;
    const { answers, notes, transcriptSummary, sentimentNotes } = req.body;

    const interview = await interviewsRepository.getById(id);
    if (!interview) throw new NotFoundError(`Interview ${id} not found`);

    if (!isPlatformOwner(user) && user.communityId && interview.communityId !== user.communityId) {
      throw new ForbiddenError('Cross-community data access is strictly prohibited');
    }

    const updated = await interviewService.completeInterview(
      {
        interviewId: id,
        communityId: interview.communityId,
        interviewerUserId: user.userId,
        answers,
        notes,
        transcriptSummary,
        sentimentNotes,
        actorRole: user.role,
      },
      req.id
    );

    res.json({
      success: true,
      data: updated,
      message: 'Interview marked as completed',
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function cancelInterviewHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id } = req.params;
    const { reason } = req.body;

    const interview = await interviewsRepository.getById(id);
    if (!interview) throw new NotFoundError(`Interview ${id} not found`);

    if (!isPlatformOwner(user) && user.communityId && interview.communityId !== user.communityId) {
      throw new ForbiddenError('Cross-community data access is strictly prohibited');
    }

    const updated = await interviewService.cancelInterview(
      id,
      interview.communityId,
      user.userId,
      user.role,
      reason,
      req.id
    );

    res.json({
      success: true,
      data: updated,
      message: 'Interview cancelled',
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}
