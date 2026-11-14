import { Request, Response, NextFunction } from 'express';
import { recruiterCodesRepository, recruitersRepository, communitiesRepository } from '../repositories/index.js';
import { ForbiddenError, NotFoundError, BadRequestError } from '../utils/errors.js';
import { isPlatformOwner } from '../security/rbac.js';
import { auditService } from '../services/audit.service.js';
import { RecruiterCodeStatus } from '../../shared/types/models.js';

export async function listRecruiterCodes(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const targetCommunityId = (req.query.communityId as string) || user.communityId || (req.header('x-community-id') as string);
    if (!targetCommunityId && !isPlatformOwner(user)) {
      throw new BadRequestError('Community ID is required', 'COMMUNITY_CONTEXT_REQUIRED');
    }

    if (!isPlatformOwner(user) && user.communityId && targetCommunityId !== user.communityId) {
      throw new ForbiddenError('Cross-community recruiter codes access is prohibited');
    }

    let codes = targetCommunityId
      ? await recruiterCodesRepository.listForTenant(targetCommunityId)
      : await recruiterCodesRepository.list();

    // If recruiter role without manage permission, only show their own codes
    if (user.role === 'RECRUITER') {
      codes = codes.filter((c) => c.recruiterUserId === user.userId);
    }

    res.json({
      success: true,
      data: codes,
      count: codes.length,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function createRecruiterCode(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { code, communityId, maxUses } = req.body;
    const targetCommunityId = communityId || user.communityId;

    if (!targetCommunityId) {
      throw new BadRequestError('Community ID is required');
    }

    if (!code || typeof code !== 'string') {
      throw new BadRequestError('A valid code string is required');
    }

    const cleanCode = code.trim().toUpperCase();

    // Check if code already exists in this community
    const existing = await recruiterCodesRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: targetCommunityId },
        { field: 'code', operator: '==', value: cleanCode },
      ],
      limit: 1,
    });

    if (existing.length > 0) {
      throw new BadRequestError(`Recruiter code "${cleanCode}" already exists in this community.`);
    }

    const now = new Date().toISOString();
    const newCode = await recruiterCodesRepository.create({
      communityId: targetCommunityId,
      recruiterUserId: user.userId,
      code: cleanCode,
      status: 'ACTIVE',
      totalUses: 0,
      usesRemaining: maxUses ? parseInt(maxUses, 10) : undefined,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    void import('../services/recruitment/recruiterBoards.service.js').then(({ recruiterBoards }) => recruiterBoards.syncCode(targetCommunityId, newCode.id)).catch(() => undefined);

    await auditService.record({
      communityId: targetCommunityId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: 'RECRUITER_CODE_CREATED',
      targetType: 'recruiter_code',
      targetId: newCode.id,
      metadata: { code: cleanCode },
      requestId: req.id,
    });

    res.status(201).json({
      success: true,
      data: newCode,
      message: `Recruiter code ${newCode.code} created successfully`,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function updateRecruiterCodeStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { id } = req.params;
    const { action } = req.body; // 'ACTIVATE' | 'DEACTIVATE' | 'REVOKE'

    const codeDoc = await recruiterCodesRepository.getById(id);
    if (!codeDoc) {
      throw new NotFoundError(`Recruiter code ${id} not found`);
    }

    if (!isPlatformOwner(user) && user.communityId && codeDoc.communityId !== user.communityId) {
      throw new ForbiddenError('Cross-community modification is prohibited');
    }

    if (user.role === 'RECRUITER' && codeDoc.recruiterUserId !== user.userId) {
      throw new ForbiddenError('Recruiters cannot modify another recruiter code');
    }

    // Check if previously revoked
    if (codeDoc.status === 'REVOKED' && action !== 'REVOKE') {
      throw new BadRequestError('REVOKED_CODE_PERMANENT: Revoked codes cannot be reactivated.');
    }

    let newStatus: RecruiterCodeStatus = 'ACTIVE';
    let isActive = true;
    let auditAction: 'RECRUITER_CODE_ACTIVATED' | 'RECRUITER_CODE_DEACTIVATED' | 'RECRUITER_CODE_REVOKED' = 'RECRUITER_CODE_ACTIVATED';

    if (action === 'DEACTIVATE') {
      newStatus = 'INACTIVE';
      isActive = false;
      auditAction = 'RECRUITER_CODE_DEACTIVATED';
    } else if (action === 'REVOKE') {
      newStatus = 'REVOKED';
      isActive = false;
      auditAction = 'RECRUITER_CODE_REVOKED';
    } else if (action === 'ACTIVATE') {
      newStatus = 'ACTIVE';
      isActive = true;
      auditAction = 'RECRUITER_CODE_ACTIVATED';
    } else {
      throw new BadRequestError(`Invalid action: ${action}. Must be ACTIVATE, DEACTIVATE, or REVOKE.`);
    }

    const now = new Date().toISOString();
    const updated = await recruiterCodesRepository.update(id, {
      status: newStatus,
      isActive,
      updatedAt: now,
    });
    void import('../services/recruitment/recruiterBoards.service.js').then(({ recruiterBoards }) => recruiterBoards.syncCode(codeDoc.communityId, id)).catch(() => undefined);

    await auditService.record({
      communityId: codeDoc.communityId,
      actorUserId: user.userId,
      actorRole: user.role,
      action: auditAction,
      targetType: 'recruiter_code',
      targetId: id,
      metadata: { previousStatus: codeDoc.status, newStatus, code: codeDoc.code },
      requestId: req.id,
    });

    res.json({
      success: true,
      data: updated,
      message: `Recruiter code ${updated.code} is now ${newStatus}`,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function revokeRecruiterCode(req: Request, res: Response, next: NextFunction) {
  req.body = { action: 'REVOKE' };
  return updateRecruiterCodeStatus(req, res, next);
}

/**
 * Public/Applicant retrieval of active recruiter codes for easy dropdown selection during application intake.
 */
export async function getPublicActiveRecruiterCodes(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = req.params.communityId || (req.query.communityId as string) || '';
    if (!communityId) {
      throw new BadRequestError('communityId is required');
    }
    
    // Fetch active codes for community
    const allCodes = await recruiterCodesRepository.listForTenant(communityId);
    const activeCodes = allCodes.filter((c) => c.status === 'ACTIVE' && c.isActive !== false);

    // Also get recruiter names
    const recruiters = await recruitersRepository.listForTenant(communityId);
    const recruiterMap = new Map<string, string>();
    for (const r of recruiters) {
      const rec = r as any;
      recruiterMap.set(rec.userId || rec.discordUserId || rec.id, rec.displayName || rec.usernameSnapshot || rec.discordUsername || 'Community Recruiter');
    }

    const payload = activeCodes.map((c) => ({
      id: c.id,
      code: c.code,
      recruiterUserId: c.recruiterUserId,
      recruiterName: recruiterMap.get(c.recruiterUserId) || 'Verified Recruiter',
      totalUses: c.totalUses || 0,
      usesRemaining: c.usesRemaining,
    }));

    res.json({
      success: true,
      data: payload,
      count: payload.length,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

