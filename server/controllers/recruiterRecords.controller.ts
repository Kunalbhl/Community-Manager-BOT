import { Request, Response } from 'express';
import { recruiterRecordService } from '../services/recruiterRecord.service.js';
import { DEFAULT_INITIAL_TEMPLATE, DEFAULT_CLAIMED_TEMPLATE } from '../../shared/types/models.js';
import { recruiterRecordsRepository, communitiesRepository } from '../repositories/index.js';
import { UserRole } from '../../shared/types/rbac.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.js';

export class RecruiterRecordsController {
  private async resolveCommunityId(req: Request): Promise<string> {
    const communityId =
      (req.query.communityId as string) ||
      (req.body && req.body.communityId) ||
      req.user?.communityId ||
      (req.header('x-community-id') as string);

    if (!communityId) {
      throw new BadRequestError('Community context is required', 'COMMUNITY_CONTEXT_REQUIRED');
    }

    return communityId;
  }

  /**
   * GET /api/v1/recruiter-records
   */
  async listRecords(req: Request, res: Response) {
    const communityId = await this.resolveCommunityId(req);

    const limit = parseInt(req.query.limit as string) || 50;
    const recruiterDiscordUserId = req.query.recruiterDiscordUserId as string;
    const benefitStatus = req.query.benefitStatus as string;

    const where: Array<{ field: string; operator: '==' | '!='; value: any }> = [
      { field: 'communityId', operator: '==', value: communityId },
    ];

    if (recruiterDiscordUserId) {
      where.push({ field: 'recruiterDiscordUserId', operator: '==', value: recruiterDiscordUserId });
    }
    if (benefitStatus) {
      where.push({ field: 'benefitStatus', operator: '==', value: benefitStatus });
    }

    const items = await recruiterRecordsRepository.list({ where, limit });

    return res.json({
      success: true,
      data: items,
      total: items.length,
    });
  }

  /**
   * GET /api/v1/recruiter-records/reports
   */
  async getReports(req: Request, res: Response) {
    const communityId = await this.resolveCommunityId(req);

    const reports = await recruiterRecordService.getRecruiterReport(communityId, {
      recruiterDiscordUserId: req.query.recruiterDiscordUserId as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
    });

    return res.json({
      success: true,
      data: reports,
    });
  }

  /**
   * GET /api/v1/recruiter-records/benefits/pending
   */
  async getPendingBenefits(req: Request, res: Response) {
    const communityId = await this.resolveCommunityId(req);

    const items = await recruiterRecordsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'benefitStatus', operator: '==', value: 'PENDING' },
      ],
    });

    return res.json({
      success: true,
      data: items,
      total: items.length,
    });
  }

  /**
   * GET /api/v1/recruiter-records/recruiter/:recruiterDiscordUserId
   */
  async getByRecruiter(req: Request, res: Response) {
    const communityId = await this.resolveCommunityId(req);
    const { recruiterDiscordUserId } = req.params;

    const items = await recruiterRecordsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'recruiterDiscordUserId', operator: '==', value: recruiterDiscordUserId },
      ],
    });

    const attributedApplicants = await recruiterRecordService.getAttributedApplicants(communityId, recruiterDiscordUserId);

    return res.json({
      success: true,
      data: items,
      attributedApplicants,
    });
  }

  /**
   * GET /api/v1/recruiter-records/code/:recruiterCode
   */
  async getByCode(req: Request, res: Response) {
    const communityId = await this.resolveCommunityId(req);
    const { recruiterCode } = req.params;

    const items = await recruiterRecordsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: communityId },
        { field: 'recruiterCode', operator: '==', value: recruiterCode.toUpperCase() },
      ],
    });

    const attributedApplicants = await recruiterRecordService.getAttributedApplicants(communityId, recruiterCode);

    return res.json({
      success: true,
      data: items,
      attributedApplicants,
    });
  }

  /**
   * GET /api/v1/recruiter-records/:id
   */
  async getById(req: Request, res: Response) {
    const { id } = req.params;
    const communityId = (req.query.communityId as string) || req.user?.communityId;

    const item = await recruiterRecordsRepository.getById(id);
    if (!item || (communityId && item.communityId !== communityId)) {
      throw new NotFoundError(`Recruiter record ${id} not found.`);
    }

    return res.json({
      success: true,
      data: item,
    });
  }

  /**
   * POST /api/v1/recruiter-records/:id/claim-benefit
   */
  async claimBenefit(req: Request, res: Response) {
    const { id } = req.params;
    const communityId = req.body.communityId || req.user?.communityId;
    if (!communityId) {
      throw new BadRequestError('communityId is required.');
    }

    const actorUserId = req.user?.userId || 'usr_admin';
    const actorRole = req.user?.role || 'OWNER';

    const updated = await recruiterRecordService.claimBenefit(
      communityId,
      id,
      actorUserId,
      actorRole,
      req.body.claimReference,
      'CLAIMED'
    );

    return res.json({
      success: true,
      data: updated,
      message: 'Recruiter benefit successfully claimed.',
    });
  }

  /**
   * POST /api/v1/recruiter-records/:id/fulfill-benefit
   */
  async fulfillBenefit(req: Request, res: Response) {
    const { id } = req.params;
    const communityId = req.body.communityId || req.user?.communityId;
    if (!communityId) {
      throw new BadRequestError('communityId is required.');
    }

    const actorUserId = req.user?.userId || 'usr_admin';
    const actorRole = req.user?.role || 'OWNER';

    const updated = await recruiterRecordService.claimBenefit(
      communityId,
      id,
      actorUserId,
      actorRole,
      req.body.claimReference,
      'FULFILLED'
    );

    return res.json({
      success: true,
      data: updated,
      message: 'Recruiter benefit successfully fulfilled.',
    });
  }

  /**
   * POST /api/v1/recruiter-records/:id/retry-message
   */
  async retryMessage(req: Request, res: Response) {
    const { id } = req.params;
    const communityId = req.body.communityId || req.user?.communityId;
    if (!communityId) {
      throw new BadRequestError('communityId is required.');
    }

    const actorUserId = req.user?.userId || 'usr_admin';

    const updated = await recruiterRecordService.retryRecordMessage(communityId, id, actorUserId);

    return res.json({
      success: true,
      data: updated,
      message: 'Record message retried.',
    });
  }

  /**
   * GET /api/v1/community/recruiter-record-config
   */
  async getConfig(req: Request, res: Response) {
    const communityId = await this.resolveCommunityId(req);

    const config = await recruiterRecordService.getOrCreateConfig(communityId);
    return res.json({
      success: true,
      data: config,
    });
  }

  /**
   * PUT /api/v1/community/recruiter-record-config
   */
  async updateConfig(req: Request, res: Response) {
    const communityId = await this.resolveCommunityId(req);

    const actorUserId = req.user?.userId || 'usr_admin';
    const actorRole = req.user?.role || 'OWNER';

    const updated = await recruiterRecordService.updateConfig(
      communityId,
      req.body,
      actorUserId,
      actorRole,
      req.headers['x-request-id'] as string
    );

    return res.json({
      success: true,
      data: updated,
      message: 'Recruiter record channel configuration updated.',
    });
  }

  /**
   * POST /api/v1/community/recruiter-record-config/test-message
   */
  async testMessage(req: Request, res: Response) {
    const { template, context } = req.body;
    if (!template) {
      throw new BadRequestError('template string is required.');
    }

    const validation = recruiterRecordService.validateTemplateVariables(template);
    const sampleContext = {
      recruiterName: 'Ashish Anubhav',
      recruiterMention: '@Ashish',
      recruiterCode: 'ASHISH',
      applicantName: 'Sufiyan',
      applicantDiscordUserId: '—',
      applicationId: '(example)',
      applicationStatus: 'JOINED',
      joinedAt: new Date().toISOString(),
      benefit: 'Custom Recruiter Role Perk',
      benefitCount: 1,
      benefitStatus: 'PENDING',
      successfulRecruitmentCount: 5,
      pendingBenefitCount: 1,
      communityName: 'Your server',
      claimedBy: '@Kunal',
      claimedAt: new Date().toISOString(),
      ...context,
    };

    const rendered = recruiterRecordService.renderTemplate(template, sampleContext);

    return res.json({
      success: true,
      validation,
      preview: rendered,
    });
  }

  /**
   * GET /api/v1/community/recruiter-record-report
   */
  async getCommunityReport(req: Request, res: Response) {
    const communityId = await this.resolveCommunityId(req);

    const reports = await recruiterRecordService.getRecruiterReport(communityId);
    return res.json({
      success: true,
      data: reports,
    });
  }

  /**
   * GET /api/v1/community/recruiter-code-report
   */
  async getCodeReport(req: Request, res: Response) {
    const communityId = await this.resolveCommunityId(req);

    const codeReport = await recruiterRecordService.getRecruiterCodeReport(communityId);
    return res.json({
      success: true,
      data: codeReport,
    });
  }

  /**
   * POST /api/v1/community/recruiter-records/sync-sheets
   */
  async syncSheets(req: Request, res: Response) {
    const communityId = await this.resolveCommunityId(req);

    const actorUserId = req.user?.userId || 'usr_admin';

    const result = await recruiterRecordService.syncAllSheets(communityId, actorUserId);

    return res.json({
      success: true,
      status: result.status,
      syncedCount: result.syncedCount,
    });
  }
}

export const recruiterRecordsController = new RecruiterRecordsController();
