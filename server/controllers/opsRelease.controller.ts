import { Request, Response, NextFunction } from 'express';
import { productionReleaseControlService } from '../services/observability/productionReleaseControl.service.js';
import { productionAcceptanceService } from '../services/observability/productionAcceptance.service.js';
import { productionReleaseAttestationService } from '../services/observability/productionReleaseAttestation.service.js';
import { postReleaseOperationsLockService } from '../services/observability/postReleaseOperationsLock.service.js';
import { ForbiddenError } from '../utils/errors.js';
import { isPlatformOwner } from '../security/rbac.js';

function checkPlatformOwner(req: Request) {
  const user = req.user;
  if (!user) throw new ForbiddenError('Authentication required');
  if (!isPlatformOwner(user)) {
    throw new ForbiddenError('Access restricted to Platform Owners');
  }
  return user;
}

export async function getReleaseStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    checkPlatformOwner(req);
    const correlationId = (req.query.correlationId as string) || req.id;
    const status = await productionReleaseControlService.getReleaseStatus(correlationId);
    res.json({
      success: true,
      data: status,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function executePostDeploymentValidationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = checkPlatformOwner(req);
    const correlationId = req.body?.correlationId || (req.query?.correlationId as string) || req.id;

    const record = await productionReleaseControlService.executePostDeploymentValidation({
      actorUserId: user.userId,
      actorRole: user.role || 'PLATFORM_OWNER',
      correlationId,
    });

    res.json({
      success: true,
      data: record,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function getValidationHistoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    checkPlatformOwner(req);
    const history = await productionReleaseControlService.getValidationHistory();
    res.json({
      success: true,
      data: history,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function getRollbackReadinessHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = checkPlatformOwner(req);
    const correlationId = (req.query.correlationId as string) || req.id;

    const readiness = await productionReleaseControlService.executeRollbackReadinessCheck({
      actorUserId: user.userId,
      actorRole: user.role || 'PLATFORM_OWNER',
      correlationId,
    });

    res.json({
      success: true,
      data: readiness,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function getReleaseHandoffHandler(req: Request, res: Response, next: NextFunction) {
  try {
    checkPlatformOwner(req);
    let handoff = await productionReleaseControlService.getLatestReleaseHandoff();
    if (!handoff) {
      const user = req.user!;
      handoff = await productionReleaseControlService.createReleaseHandoff({
        actorUserId: user.userId,
        actorRole: user.role || 'PLATFORM_OWNER',
        correlationId: req.id,
      });
    }

    res.json({
      success: true,
      data: handoff,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function createReleaseHandoffHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = checkPlatformOwner(req);
    const correlationId = req.body?.correlationId || req.id;

    const handoff = await productionReleaseControlService.createReleaseHandoff({
      actorUserId: user.userId,
      actorRole: user.role || 'PLATFORM_OWNER',
      correlationId,
    });

    res.json({
      success: true,
      data: handoff,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function getPostReleaseMonitoringHandler(req: Request, res: Response, next: NextFunction) {
  try {
    checkPlatformOwner(req);
    const summary = await productionReleaseControlService.getPostReleaseMonitoringSummary();
    res.json({
      success: true,
      data: summary,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function executeProductionAcceptanceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = checkPlatformOwner(req);
    const correlationId = req.body?.correlationId || (req.query?.correlationId as string) || req.id;

    const record = await productionAcceptanceService.executeProductionAcceptance({
      actorUserId: user.userId,
      actorRole: user.role || 'PLATFORM_OWNER',
      correlationId,
    });

    res.json({
      success: true,
      data: record,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function getLatestAcceptanceRecordHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = checkPlatformOwner(req);
    const record = await productionAcceptanceService.getLatestAcceptanceRecord({
      actorUserId: user.userId,
      actorRole: user.role || 'PLATFORM_OWNER',
    });

    res.json({
      success: true,
      data: record,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function getAcceptanceHistoryHandler(req: Request, res: Response, next: NextFunction) {
  try {
    checkPlatformOwner(req);
    const history = await productionAcceptanceService.getAcceptanceHistory();

    res.json({
      success: true,
      data: history,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function getAttestationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    checkPlatformOwner(req);
    let evidence = await productionReleaseAttestationService.getLatestEvidencePackage();
    if (!evidence) {
      const user = req.user!;
      evidence = await productionReleaseAttestationService.createReleaseEvidencePackage({
        actorUserId: user.userId,
        actorRole: user.role || 'PLATFORM_OWNER',
        correlationId: req.id,
      });
    }

    res.json({
      success: true,
      data: evidence,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function createAttestationHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = checkPlatformOwner(req);
    const correlationId = req.body?.correlationId || req.id;

    const evidence = await productionReleaseAttestationService.createReleaseEvidencePackage({
      actorUserId: user.userId,
      actorRole: user.role || 'PLATFORM_OWNER',
      correlationId,
    });

    res.json({
      success: true,
      data: evidence,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function getEvidenceHandler(req: Request, res: Response, next: NextFunction) {
  try {
    checkPlatformOwner(req);
    const list = await productionReleaseAttestationService.listEvidencePackages();
    res.json({
      success: true,
      data: list,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function listChangeControlHandler(req: Request, res: Response, next: NextFunction) {
  try {
    checkPlatformOwner(req);
    const changes = await postReleaseOperationsLockService.listChangeRecords();
    res.json({
      success: true,
      data: changes,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function requestChangeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = checkPlatformOwner(req);
    const correlationId = req.body?.correlationId || req.id;

    const change = await postReleaseOperationsLockService.requestChange({
      requestedBy: user.userId,
      changeType: req.body?.changeType || 'MAINTENANCE',
      riskLevel: req.body?.riskLevel || 'LOW',
      reason: req.body?.reason || 'Scheduled maintenance change',
      rollbackPlan: req.body?.rollbackPlan,
      correlationId,
    });

    res.json({
      success: true,
      data: change,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function approveChangeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = checkPlatformOwner(req);
    const changeId = req.params.id;
    const correlationId = req.body?.correlationId || req.id;

    const change = await postReleaseOperationsLockService.approveChange({
      changeId,
      authorizedBy: user.userId,
      correlationId,
    });

    res.json({
      success: true,
      data: change,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function rejectChangeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = checkPlatformOwner(req);
    const changeId = req.params.id;
    const correlationId = req.body?.correlationId || req.id;

    const change = await postReleaseOperationsLockService.rejectChange({
      changeId,
      authorizedBy: user.userId,
      reason: req.body?.reason,
      correlationId,
    });

    res.json({
      success: true,
      data: change,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function executeChangeHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = checkPlatformOwner(req);
    const changeId = req.params.id;
    const correlationId = req.body?.correlationId || req.id;

    const change = await postReleaseOperationsLockService.executeChange({
      changeId,
      authorizedBy: user.userId,
      correlationId,
    });

    res.json({
      success: true,
      data: change,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function getPostReleaseLockHandler(req: Request, res: Response, next: NextFunction) {
  try {
    checkPlatformOwner(req);
    const lock = await postReleaseOperationsLockService.getLockState();
    res.json({
      success: true,
      data: lock,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}

export async function setPostReleaseLockHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const user = checkPlatformOwner(req);
    const correlationId = req.body?.correlationId || req.id;

    const lock = await postReleaseOperationsLockService.setLockState({
      state: req.body?.state || 'ACTIVE',
      updatedBy: user.userId,
      reason: req.body?.reason,
      correlationId,
    });

    res.json({
      success: true,
      data: lock,
      requestId: req.id,
    });
  } catch (err) {
    next(err);
  }
}
