import { Request, Response, NextFunction } from 'express';
import { onboardingTelemetryService } from '../services/onboardingTelemetry.service.js';

export async function trackTelemetryEvent(req: Request, res: Response, next: NextFunction) {
  try {
    const { stage, communityId, guildId, errorStatus, failureReason, metadata } = req.body;
    const userId = req.user?.discordUserId || req.user?.userId;

    const record = await onboardingTelemetryService.trackEvent({
      stage,
      communityId,
      guildId,
      userId,
      errorStatus,
      failureReason,
      metadata,
    });

    res.json({
      success: true,
      data: record,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getOnboardingFunnel(req: Request, res: Response, next: NextFunction) {
  try {
    const communityId = typeof req.query.communityId === 'string' ? req.query.communityId : undefined;
    const metrics = await onboardingTelemetryService.getFunnelMetrics(communityId);

    res.json({
      success: true,
      data: metrics,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getRecoveryGuidance(req: Request, res: Response, next: NextFunction) {
  try {
    const errorStatus = req.params.errorStatus || 'ROLE_MAPPING_INCOMPLETE';
    const guidance = onboardingTelemetryService.getFailureRecoveryGuide(errorStatus);

    res.json({
      success: true,
      data: guidance,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}
