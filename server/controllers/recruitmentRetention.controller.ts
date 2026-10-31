import { Request, Response, NextFunction } from 'express';
import { recruitmentRetentionService } from '../services/recruitmentRetention.service.js';
import { RecruitmentSourceType } from '../../shared/types/models.js';

export class RecruitmentRetentionController {
  // 1. Cohorts
  static async createCohort(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const { name, description, cohortType, filterCriteria } = req.body;
      const actorUserId = req.user?.userId || 'system';

      const cohort = await recruitmentRetentionService.createCohort(
        communityId,
        { name, description, cohortType, filterCriteria },
        actorUserId
      );
      res.status(201).json({ success: true, data: cohort, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  static async listCohorts(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const cohorts = await recruitmentRetentionService.listCohorts(communityId);
      res.json({ success: true, data: cohorts, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  static async getCohort(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, cohortId } = req.params;
      const cohort = await recruitmentRetentionService.getCohort(communityId, cohortId);
      if (!cohort) {
        return res.status(404).json({ success: false, error: 'Cohort not found', requestId: req.id });
      }
      res.json({ success: true, data: cohort, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  static async correctCohort(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, cohortId } = req.params;
      const { newCriteria, reason } = req.body;
      const actorUserId = req.user?.userId || 'system';

      if (!newCriteria || !reason) {
        return res.status(400).json({ success: false, error: 'newCriteria and reason are required', requestId: req.id });
      }

      const updated = await recruitmentRetentionService.correctCohort(
        communityId,
        cohortId,
        { newCriteria, reason },
        actorUserId
      );
      res.json({ success: true, data: updated, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  // 2. Retention Funnel
  static async getFunnel(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const cohortId = req.query.cohortId as string | undefined;
      const funnel = await recruitmentRetentionService.getRetentionFunnel(communityId, cohortId);
      res.json({ success: true, data: funnel, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  // 3. Recruiter Quality Analytics
  static async getRecruiterQuality(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const range = (req.query.range as any) || 'all';
      const data = await recruitmentRetentionService.getRecruiterQualityAnalytics(communityId, range);
      res.json({ success: true, data, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  // 4. Campaign Quality Analytics
  static async getCampaignQuality(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const data = await recruitmentRetentionService.getCampaignQualityAnalytics(communityId);
      res.json({ success: true, data, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  // 5. Source Quality Analytics & Correction
  static async getSourceQuality(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const data = await recruitmentRetentionService.getSourceQualityAnalytics(communityId);
      res.json({ success: true, data, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  static async correctRecruitmentSource(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const { applicationId, newSource, reason } = req.body;
      const actorUserId = req.user?.userId || 'system';

      if (!applicationId || !newSource || !reason) {
        return res.status(400).json({ success: false, error: 'applicationId, newSource, and reason are required', requestId: req.id });
      }

      const updated = await recruitmentRetentionService.correctRecruitmentSource(
        communityId,
        applicationId,
        newSource as RecruitmentSourceType,
        reason,
        actorUserId
      );
      res.json({ success: true, data: updated, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  // 6. Early Member Quality Signals
  static async getEarlySignals(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const data = await recruitmentRetentionService.getEarlyMemberQualitySignals(communityId);
      res.json({ success: true, data, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  // 7. Retention Alerts
  static async getAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const alerts = await recruitmentRetentionService.evaluateRetentionAlerts(communityId);
      res.json({ success: true, data: alerts, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  // 8. Onboarding Quality Analysis
  static async getOnboardingQuality(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const data = await recruitmentRetentionService.getOnboardingQualityAnalysis(communityId);
      res.json({ success: true, data, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  // 9. Crossovers
  static async getModerationCrossover(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const data = await recruitmentRetentionService.getModerationQualityCrossover(communityId);
      res.json({ success: true, data, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  static async getEventCrossover(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const data = await recruitmentRetentionService.getEventQualityCrossover(communityId);
      res.json({ success: true, data, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  static async getAutomationCrossover(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const data = await recruitmentRetentionService.getAutomationQualityCrossover(communityId);
      res.json({ success: true, data, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  // 10. Lifetime Value Foundation
  static async getLtvFoundation(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const data = recruitmentRetentionService.getLifetimeValueFoundation(communityId);
      res.json({ success: true, data, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  // 11. Executive Lifecycle Overview
  static async getExecutiveOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const data = await recruitmentRetentionService.getExecutiveLifecycleOverview(communityId);
      res.json({ success: true, data, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  // 12. Community Brain Q&A
  static async askBrain(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const { question } = req.body;
      if (!question) {
        return res.status(400).json({ success: false, error: 'Question is required', requestId: req.id });
      }
      const answer = await recruitmentRetentionService.askRetentionBrain(communityId, question);
      res.json({ success: true, data: answer, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  // 13. Individual Member Outcome Evidence
  static async getMemberEvidence(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, discordUserId } = req.params;
      const evidence = await recruitmentRetentionService.getMemberOutcomeEvidence(communityId, discordUserId);
      res.json({ success: true, data: evidence, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }
}
