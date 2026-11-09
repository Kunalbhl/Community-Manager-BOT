import { Request, Response, NextFunction } from 'express';
import {
  recruitersRepository,
  recruiterCodesRepository,
  referralsRepository,
  rewardsRepository,
} from '../repositories/index.js';
import { ForbiddenError, NotFoundError, BadRequestError } from '../utils/errors.js';
import { isPlatformOwner } from '../security/rbac.js';

export async function listRecruiters(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const targetCommunityId = (req.query.communityId as string) || user.communityId;
    if (!targetCommunityId && !isPlatformOwner(user)) {
      throw new BadRequestError('Community ID is required');
    }

    if (!isPlatformOwner(user) && user.communityId && targetCommunityId !== user.communityId) {
      throw new ForbiddenError('Cross-community recruiter access is prohibited');
    }

    let recruiters = targetCommunityId
      ? await recruitersRepository.listForTenant(targetCommunityId)
      : await recruitersRepository.list();

    // Recruiter Isolation: Recruiter can only see their own profile unless they have management privileges
    if (user.role === 'RECRUITER') {
      recruiters = recruiters.filter((r) => r.userId === user.userId);
    }

    res.json({
      success: true,
      data: recruiters,
      count: recruiters.length,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getRecruiter(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id } = req.params;
    const recruiter = await recruitersRepository.getById(id);
    if (!recruiter) {
      throw new NotFoundError(`Recruiter ${id} not found`);
    }

    // Tenant Isolation
    if (!isPlatformOwner(user) && user.communityId && recruiter.communityId !== user.communityId) {
      throw new ForbiddenError('Cross-community recruiter access is prohibited');
    }

    // Recruiter Isolation
    if (user.role === 'RECRUITER' && recruiter.userId !== user.userId) {
      throw new ForbiddenError('Recruiters cannot view another recruiter private profile');
    }

    res.json({
      success: true,
      data: recruiter,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getRecruiterMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const targetCommunityId = user.communityId || (req.query.communityId as string);
    if (!targetCommunityId) {
      throw new BadRequestError('Community ID is required');
    }

    let recruiters = await recruitersRepository.listForTenant(targetCommunityId);
    let myProfile = recruiters.find((r) => r.userId === user.userId);

    // If profile doesn't exist yet, return safe empty/default representation
    const codes = await recruiterCodesRepository.listForTenant(targetCommunityId, {
      where: [{ field: 'recruiterUserId', operator: '==', value: user.userId }],
    });

    // Referral history comes from real applications that used one of this recruiter's codes.
    const stored = await referralsRepository.listForTenant(targetCommunityId, {
      where: [{ field: 'recruiterUserId', operator: '==', value: user.userId }],
    });
    const myCodes = new Set((codes as any[]).map((c) => String(c.code).toUpperCase()));
    const { applicationsRepository } = await import('../repositories/index.js');
    const apps: any[] = myCodes.size ? await (applicationsRepository as any).listForTenant(targetCommunityId) : [];
    const fromApps = apps
      .filter((a) => myCodes.has(String(a.recruiterCodeUsed || a.recruiterCode || '').toUpperCase()))
      .map((a) => ({
        id: `app_${a.id}`,
        code: String(a.recruiterCodeUsed || a.recruiterCode).toUpperCase(),
        referredUserId: a.applicantDisplayNameSnapshot || a.applicantUsername || a.applicantDiscordUserId,
        status: a.status === 'APPROVED' ? 'CONVERTED' : a.status === 'REJECTED' ? 'REVOKED' : 'PENDING',
        createdAt: a.createdAt,
      }));
    const seen = new Set(fromApps.map((r) => r.code + r.referredUserId));
    const referrals = [...fromApps, ...(stored as any[]).filter((r) => !seen.has(String(r.code).toUpperCase() + r.referredUserId))]
      .sort((x: any, y: any) => String(y.createdAt).localeCompare(String(x.createdAt)));

    const rewards = await rewardsRepository.listForTenant(targetCommunityId, {
      where: [{ field: 'recruiterUserId', operator: '==', value: user.userId }],
    });

    res.json({
      success: true,
      data: {
        profile: myProfile || null,
        codes,
        referrals,
        rewards,
      },
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}
