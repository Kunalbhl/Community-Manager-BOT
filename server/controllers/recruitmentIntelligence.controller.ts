import { Request, Response, NextFunction } from 'express';
import { recruitmentIntelligenceService } from '../services/recruitmentIntelligence.service.js';
import { applicationsRepository } from '../repositories/index.js';
import { ForbiddenError, NotFoundError, BadRequestError } from '../utils/errors.js';
import { isPlatformOwner } from '../security/rbac.js';
import { UserRole } from '../../shared/types/rbac.js';

export class RecruitmentIntelligenceController {
  /**
   * Retrieves community recruitment score configuration
   */
  static async getScoreConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const config = await recruitmentIntelligenceService.getScoreConfig(communityId);
      res.json({ success: true, data: config, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Updates recruitment score config
   */
  static async updateScoreConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const { weights } = req.body;
      const user = req.user;

      if (!user) {
        throw new ForbiddenError('Authentication required');
      }
      if (!weights) {
        throw new BadRequestError('Weights payload is required');
      }

      const updated = await recruitmentIntelligenceService.updateScoreConfig(
        communityId,
        weights,
        user.userId,
        user.role as UserRole
      );

      res.json({ success: true, data: updated, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Recalculates candidate's score
   */
  static async recalculateScore(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, applicationId } = req.params;
      const breakdown = await recruitmentIntelligenceService.calculateRecruitmentScore(communityId, applicationId);
      res.json({ success: true, data: breakdown, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Fetches candidate's score breakdown
   */
  static async getScoreBreakdown(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, applicationId } = req.params;
      const breakdown = await recruitmentIntelligenceService.calculateRecruitmentScore(communityId, applicationId);
      res.json({ success: true, data: breakdown, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Retrieves candidate's advisory AI summary from Community Brain
   */
  static async getAiSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, applicationId } = req.params;
      const summary = await recruitmentIntelligenceService.getAiSummary(communityId, applicationId, false);
      res.json({ success: true, data: summary, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Forces recalculation of candidate's AI summary
   */
  static async refreshAiSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, applicationId } = req.params;
      const summary = await recruitmentIntelligenceService.getAiSummary(communityId, applicationId, true);
      res.json({ success: true, data: summary, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Lists segments
   */
  static async listSegments(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const segments = await recruitmentIntelligenceService.listSegments(communityId);
      res.json({ success: true, data: segments, count: segments.length, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Creates a saved segment
   */
  static async createSegment(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const segmentData = req.body;
      const created = await recruitmentIntelligenceService.createSegment(communityId, segmentData);
      res.json({ success: true, data: created, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Deletes a segment
   */
  static async deleteSegment(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, segmentId } = req.params;
      await recruitmentIntelligenceService.deleteSegment(communityId, segmentId);
      res.json({ success: true, message: 'Segment deleted successfully', requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Lists active alerts
   */
  static async listAlerts(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const alerts = await recruitmentIntelligenceService.listAlerts(communityId);
      res.json({ success: true, data: alerts, count: alerts.length, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Resolves an active alert
   */
  static async resolveAlert(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, alertId } = req.params;
      await recruitmentIntelligenceService.resolveAlert(communityId, alertId);
      res.json({ success: true, message: 'Alert resolved successfully', requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Lists recruitment campaigns
   */
  static async listCampaigns(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const campaigns = await recruitmentIntelligenceService.listCampaigns(communityId);
      res.json({ success: true, data: campaigns, count: campaigns.length, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Creates a recruitment campaign
   */
  static async createCampaign(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const campaignData = req.body;
      const user = req.user;

      if (!user) {
        throw new ForbiddenError('Authentication required');
      }

      const created = await recruitmentIntelligenceService.createCampaign(
        communityId,
        campaignData,
        user.userId,
        user.role as UserRole
      );
      res.json({ success: true, data: created, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Updates a campaign
   */
  static async updateCampaign(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, campaignId } = req.params;
      const campaignData = req.body;
      const user = req.user;

      if (!user) {
        throw new ForbiddenError('Authentication required');
      }

      const updated = await recruitmentIntelligenceService.updateCampaign(
        communityId,
        campaignId,
        campaignData,
        user.userId,
        user.role as UserRole
      );
      res.json({ success: true, data: updated, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Updates campaign status
   */
  static async updateCampaignStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, campaignId } = req.params;
      const { status } = req.body;
      const user = req.user;

      if (!user) {
        throw new ForbiddenError('Authentication required');
      }
      if (!status) {
        throw new BadRequestError('Status field is required');
      }

      const updated = await recruitmentIntelligenceService.updateCampaignStatus(
        communityId,
        campaignId,
        status,
        user.userId,
        user.role as UserRole
      );
      res.json({ success: true, data: updated, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Gets details and analytics for a single campaign
   */
  static async getCampaignDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, campaignId } = req.params;
      const details = await recruitmentIntelligenceService.getCampaignDetailsWithAnalytics(communityId, campaignId);
      res.json({ success: true, data: details, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Audited manual attribution correction
   */
  static async correctAttribution(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, applicationId } = req.params;
      const attributionData = req.body;
      const user = req.user;

      if (!user) {
        throw new ForbiddenError('Authentication required');
      }

      const updatedApp = await recruitmentIntelligenceService.correctAttribution(
        communityId,
        applicationId,
        attributionData,
        user.userId,
        user.role as UserRole
      );
      res.json({ success: true, data: updatedApp, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Conclude recruitment conversion successfully (idempotent)
   */
  static async recordSuccess(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, applicationId } = req.params;
      await recruitmentIntelligenceService.recordRecruitmentSuccess(communityId, applicationId);
      res.json({ success: true, message: 'Recruitment success recorded', requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Lists versioned application forms
   */
  static async listForms(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const forms = await recruitmentIntelligenceService.listForms(communityId);
      res.json({ success: true, data: forms, count: forms.length, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Gets details of a versioned form
   */
  static async getForm(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, formId } = req.params;
      const form = await recruitmentIntelligenceService.getForm(communityId, formId);
      res.json({ success: true, data: form, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Creates an application form version draft
   */
  static async createForm(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const formData = req.body;
      const created = await recruitmentIntelligenceService.createForm(communityId, formData);
      res.json({ success: true, data: created, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Updates an application form details
   */
  static async updateForm(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, formId } = req.params;
      const formData = req.body;
      const updated = await recruitmentIntelligenceService.updateForm(communityId, formId, formData);
      res.json({ success: true, data: updated, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Updates an application form's publish/archived status
   */
  static async updateFormStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, formId } = req.params;
      const { status } = req.body;
      const user = req.user;

      if (!user) {
        throw new ForbiddenError('Authentication required');
      }
      if (!status) {
        throw new BadRequestError('Status is required');
      }

      const updated = await recruitmentIntelligenceService.updateFormStatus(
        communityId,
        formId,
        status,
        user.userId,
        user.role as UserRole
      );
      res.json({ success: true, data: updated, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Gets workload analytics
   */
  static async getWorkload(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const workload = await recruitmentIntelligenceService.getRecruiterWorkload(communityId);
      res.json({ success: true, data: workload, count: workload.length, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Assigns a reviewer to a candidate application
   */
  static async assignReviewer(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, applicationId } = req.params;
      const { reviewerId, reviewerUsername } = req.body;

      const app = await applicationsRepository.getById(applicationId);
      if (!app || app.communityId !== communityId) {
        throw new NotFoundError(`Application ${applicationId} not found`);
      }

      await applicationsRepository.update(applicationId, {
        assignedReviewerId: reviewerId,
        assignedReviewerUsername: reviewerUsername,
        updatedAt: new Date().toISOString(),
      });

      res.json({ success: true, message: 'Reviewer assigned successfully', requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Updates candidate tags
   */
  static async updateTags(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, applicationId } = req.params;
      const { tags } = req.body;

      const app = await applicationsRepository.getById(applicationId);
      if (!app || app.communityId !== communityId) {
        throw new NotFoundError(`Application ${applicationId} not found`);
      }

      await applicationsRepository.update(applicationId, {
        tags: tags || [],
        updatedAt: new Date().toISOString(),
      });

      res.json({ success: true, data: tags, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Updates candidate talent pool
   */
  static async updateTalentPool(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, applicationId } = req.params;
      const { talentPool } = req.body;

      const app = await applicationsRepository.getById(applicationId);
      if (!app || app.communityId !== communityId) {
        throw new NotFoundError(`Application ${applicationId} not found`);
      }

      await applicationsRepository.update(applicationId, {
        talentPool,
        updatedAt: new Date().toISOString(),
      });

      res.json({ success: true, data: talentPool, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  // --- Task 48 Recruiter Network API Actions ---

  static async listRecruiters(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const recruiters = await recruitmentIntelligenceService.listRecruiters(communityId);
      res.json({ success: true, data: recruiters, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  static async getRecruiterDetails(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, recruiterId } = req.params;
      const details = await recruitmentIntelligenceService.getRecruiterDetails(communityId, recruiterId);
      res.json({ success: true, data: details, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  static async createRecruiter(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const { discordUserId, displayNameSnapshot, role, recruiterCode, workspaceId } = req.body;
      const recruiter = await recruitmentIntelligenceService.createRecruiter(communityId, workspaceId, {
        discordUserId,
        displayNameSnapshot,
        role,
        recruiterCode,
      });
      res.status(211).json({ success: true, data: recruiter, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  static async updateRecruiter(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, recruiterId } = req.params;
      const actorUserId = (req as any).authContext?.discordUserId || (req as any).user?.discordUserId || 'SYSTEM';
      const actorRole = (req as any).authContext?.effectiveRole || (req as any).user?.role || 'MEMBER';
      const recruiter = await recruitmentIntelligenceService.updateRecruiter(communityId, recruiterId, req.body, actorUserId, actorRole);
      res.json({ success: true, data: recruiter, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  // --- Referral Ecosystem API ---

  static async listReferrals(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const referrals = await recruitmentIntelligenceService.listReferrals(communityId);
      res.json({ success: true, data: referrals, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  static async createReferral(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const { recruiterId, code, source, campaignId, expiresAt, workspaceId } = req.body;
      const referral = await recruitmentIntelligenceService.createReferral(communityId, workspaceId, {
        recruiterId,
        code,
        source,
        campaignId,
        expiresAt,
      });
      res.status(211).json({ success: true, data: referral, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  static async updateReferralStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, referralId } = req.params;
      const { status } = req.body;
      const actorUserId = (req as any).authContext?.discordUserId || (req as any).user?.discordUserId || 'SYSTEM';
      const actorRole = (req as any).authContext?.effectiveRole || (req as any).user?.role || 'MEMBER';
      const referral = await recruitmentIntelligenceService.updateReferralStatus(communityId, referralId, status, actorUserId, actorRole);
      res.json({ success: true, data: referral, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  // --- Rewards Engine API ---

  static async listRewards(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const rewards = await recruitmentIntelligenceService.listRewards(communityId);
      res.json({ success: true, data: rewards, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  static async createReward(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const { source, reason, applicationId, recruiterId, rewardType, workspaceId } = req.body;
      const reward = await recruitmentIntelligenceService.createReward(communityId, workspaceId, {
        source,
        reason,
        applicationId,
        recruiterId,
        rewardType,
      });
      res.status(211).json({ success: true, data: reward, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  static async claimReward(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, rewardId } = req.params;
      const actorUserId = (req as any).authContext?.discordUserId || (req as any).user?.discordUserId || 'SYSTEM';
      const actorRole = (req as any).authContext?.effectiveRole || (req as any).user?.role || 'MEMBER';
      const reward = await recruitmentIntelligenceService.claimReward(communityId, rewardId, actorUserId, actorRole);
      res.json({ success: true, data: reward, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  // --- Recruiter Goals API ---

  static async listGoals(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const goals = await recruitmentIntelligenceService.listGoals(communityId);
      res.json({ success: true, data: goals, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  static async createGoal(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const { recruiterId, targetType, targetValue, startAt, endAt, workspaceId } = req.body;
      const goal = await recruitmentIntelligenceService.createGoal(communityId, workspaceId, {
        recruiterId,
        targetType,
        targetValue,
        startAt,
        endAt,
      });
      res.status(211).json({ success: true, data: goal, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  static async updateGoalProgress(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId, goalId } = req.params;
      const { currentValue } = req.body;
      const goal = await recruitmentIntelligenceService.updateGoalProgress(communityId, goalId, currentValue);
      res.json({ success: true, data: goal, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  // --- Leaderboard & Abuse API ---

  static async getLeaderboard(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const { range } = req.query;
      const leaderboard = await recruitmentIntelligenceService.getLeaderboard(communityId, range as string);
      res.json({ success: true, data: leaderboard, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  static async detectAbuse(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const results = await recruitmentIntelligenceService.detectDuplicatesAndAbuse(communityId);
      res.json({ success: true, data: results, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  // --- Overview Dashboard & Community Brain AI API ---

  static async getOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const overview = await recruitmentIntelligenceService.getTalentAcquisitionOverview(communityId);
      res.json({ success: true, data: overview, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }

  static async askCommunityBrain(req: Request, res: Response, next: NextFunction) {
    try {
      const { communityId } = req.params;
      const { question } = req.body;
      const answer = await recruitmentIntelligenceService.askRecruitmentBrain(communityId, question);
      res.json({ success: true, data: answer, requestId: req.id });
    } catch (err) {
      next(err);
    }
  }
}
