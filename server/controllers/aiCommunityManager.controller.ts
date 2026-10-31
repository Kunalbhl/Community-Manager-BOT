import { Request, Response, NextFunction } from 'express';
import { AiCommunityManagerService } from '../services/ai/aiCommunityManager.service.js';
import { AiConversationService } from '../services/ai/aiConversation.service.js';
import { AiActionExecutorService } from '../services/ai/aiActionExecutor.service.js';
import { AiUsageService } from '../services/ai/aiUsage.service.js';
import { AiReportExportService } from '../services/ai/aiReportExport.service.js';
import { NeedsAttentionService } from '../services/needsAttention.service.js';
import { DashboardService } from '../services/dashboard.service.js';
import { ReportGeneratorService } from '../services/reports/reportGenerator.service.js';
import { ReportSchedulerService } from '../services/reports/reportScheduler.service.js';
import { AiWorkflowBuilderService } from '../services/ai/aiWorkflowBuilder.service.js';
import { FeatureRegistryService } from '../services/ai/featureRegistry.js';
import { BadRequestError, UnauthorizedError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { canAccessTenant } from '../security/rbac.js';
import { DateRangeType } from '../../shared/types/insights.js';
import {
  communitiesRepository,
  eventsRepository,
  remindersRepository,
  automationWorkflowsRepository,
  discordMembersRepository,
  applicationsRepository,
  interviewsRepository,
  recruitersRepository,
  recruiterCodesRepository,
  campaignsRepository,
  announcementsRepository,
  pollsRepository,
  warningsRepository,
  safetyIncidentsRepository,
  notificationsRepository,
} from '../repositories/index.js';
import { EntitlementService } from '../services/entitlement.service.js';
import { discordCapabilityService } from '../services/discordCapability.service.js';
import { integrationCenterService } from '../services/integrationCenter.service.js';
import { resolveAuthorizedCommunityContext } from '../services/authorization.service.js';
import { logger } from '../logging/logger.js';

export class AiCommunityManagerController {
  /**
   * POST /api/v1/communities/:communityId/ai/ask
   */
  static async ask(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!communityId) {
        throw new BadRequestError('Community ID is required in URL path');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required to consult AI Community Manager');
      }

      const { prompt, scope, dateRange, timezone, includePlannedActions, conversationId } =
        req.body || {};

      const response = await AiCommunityManagerService.ask(
        communityId,
        req.user,
        {
          prompt,
          scope,
          dateRange: dateRange as DateRangeType,
          timezone,
          includePlannedActions,
          conversationId,
        },
        {
          requestId: req.id,
          ipAddress: req.ip,
        }
      );

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/communities/:communityId/ai/contextual-action
   */
  static async executeContextualAction(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!communityId) {
        throw new BadRequestError('Community ID is required in URL path');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const {
        action,
        metricKey,
        metricLabel,
        currentValue,
        previousValue,
        delta,
        domain,
        dateRange,
        customStart,
        customEnd,
        timezone,
        conversationId,
      } = req.body || {};

      if (!action) {
        throw new BadRequestError('Contextual action type is required');
      }

      const response = await AiCommunityManagerService.executeContextualAction(
        communityId,
        req.user,
        {
          action,
          metricKey,
          metricLabel,
          currentValue,
          previousValue,
          delta,
          domain,
          dateRange,
          customStart,
          customEnd,
          timezone,
          conversationId,
        },
        {
          requestId: req.id,
          ipAddress: req.ip,
        }
      );

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/communities/:communityId/ai/conversations
   */
  static async createConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!communityId) {
        throw new BadRequestError('Community ID is required in URL path');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const { title, initialPrompt } = req.body || {};
      const conversation = await AiConversationService.createConversation(
        communityId,
        req.user,
        { title, initialPrompt }
      );

      res.status(201).json({
        success: true,
        conversation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/communities/:communityId/ai/conversations
   */
  static async listConversations(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!communityId) {
        throw new BadRequestError('Community ID is required in URL path');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

      const conversations = await AiConversationService.listConversations(
        communityId,
        req.user,
        { limit, offset }
      );

      res.status(200).json({
        success: true,
        communityId,
        conversations,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/communities/:communityId/ai/conversations/:conversationId
   */
  static async getConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      const conversationId = req.params.conversationId;
      if (!communityId || !conversationId) {
        throw new BadRequestError('Both communityId and conversationId are required');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const conversation = await AiConversationService.getConversation(
        communityId,
        req.user,
        conversationId
      );

      res.status(200).json({
        success: true,
        conversation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/communities/:communityId/ai/conversations/:conversationId/title
   * PATCH /api/v1/communities/:communityId/ai/conversations/:conversationId
   */
  static async renameConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      const conversationId = req.params.conversationId;
      if (!communityId || !conversationId) {
        throw new BadRequestError('Both communityId and conversationId are required');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const { title } = req.body || {};
      if (!title || typeof title !== 'string') {
        throw new BadRequestError('Title string is required');
      }

      const conversation = await AiConversationService.renameConversation(
        communityId,
        req.user,
        conversationId,
        title
      );

      res.status(200).json({
        success: true,
        conversation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/communities/:communityId/ai/conversations/:conversationId
   */
  static async deleteConversation(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      const conversationId = req.params.conversationId;
      if (!communityId || !conversationId) {
        throw new BadRequestError('Both communityId and conversationId are required');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const result = await AiConversationService.deleteConversation(
        communityId,
        req.user,
        conversationId
      );

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/communities/:communityId/ai/conversations/:conversationId/clear-context
   */
  static async clearConversationContext(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      const conversationId = req.params.conversationId;
      if (!communityId || !conversationId) {
        throw new BadRequestError('Both communityId and conversationId are required');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const conversation = await AiConversationService.clearConversationContext(
        communityId,
        req.user,
        conversationId
      );

      res.status(200).json({
        success: true,
        conversation,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/communities/:communityId/ai/conversations/:conversationId/messages
   */
  static async postConversationMessage(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      const conversationId = req.params.conversationId;
      if (!communityId || !conversationId) {
        throw new BadRequestError('Both communityId and conversationId are required');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const { prompt, scope, dateRange, timezone, includePlannedActions } = req.body || {};

      const response = await AiCommunityManagerService.ask(
        communityId,
        req.user,
        {
          prompt,
          scope,
          dateRange: dateRange as DateRangeType,
          timezone,
          includePlannedActions,
          conversationId,
        },
        {
          requestId: req.id,
          ipAddress: req.ip,
        }
      );

      res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  }


  /**
   * GET /api/v1/communities/:communityId/ai/context
   */
  static async getContext(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!communityId) {
        throw new BadRequestError('Community ID is required in URL path');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const rangeType = (req.query.rangeType || req.query.range || 'LAST_30_DAYS') as DateRangeType;
      const timezone = (req.query.timezone as string) || undefined;

      const context = await AiCommunityManagerService.getContext(communityId, req.user, {
        rangeType,
        timezone,
      });

      res.status(200).json({
        success: true,
        context,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/communities/:communityId/ai/recommendations
   */
  static async getRecommendations(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!communityId) {
        throw new BadRequestError('Community ID is required in URL path');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const recommendations = await AiCommunityManagerService.getRecommendations(
        communityId,
        req.user
      );

      res.status(200).json({
        success: true,
        communityId,
        recommendations,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/communities/:communityId/ai/actions/plan
   */
  static async planActions(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!communityId) {
        throw new BadRequestError('Community ID is required in URL path');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const { prompt } = req.body || {};
      if (!prompt || typeof prompt !== 'string') {
        throw new BadRequestError('Prompt string required to plan actions');
      }

      const actions = await AiCommunityManagerService.planActions(communityId, req.user, prompt);

      res.status(200).json({
        success: true,
        communityId,
        actions,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/communities/:communityId/ai/actions/dry-run
   */
  static async dryRunAction(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!communityId) {
        throw new BadRequestError('Community ID is required in URL path');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const { action } = req.body || {};
      if (!action) {
        throw new BadRequestError('Action payload required');
      }

      const result = await AiActionExecutorService.validateAndDryRun(
        communityId,
        req.user,
        action,
        { dryRun: true }
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/communities/:communityId/ai/actions/create-plan
   */
  static async createPlan(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!communityId) {
        throw new BadRequestError('Community ID is required in URL path');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const { recommendationId, goal, issue, module, prompt } = req.body || {};

      const plan = await AiCommunityManagerService.createActionPlan(
        communityId,
        req.user,
        {
          recommendationId,
          goal,
          issue,
          module,
          prompt,
        }
      );

      res.status(200).json({
        success: true,
        communityId,
        plan,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/communities/:communityId/ai/actions/preview
   */
  static async previewAction(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!communityId) {
        throw new BadRequestError('Community ID is required in URL path');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const preview = await AiActionExecutorService.generatePreview(
        communityId,
        req.user,
        req.body || {},
        { requestId: req.id }
      );

      res.status(200).json({
        success: true,
        preview,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/communities/:communityId/ai/actions/confirm
   */
  static async confirmAction(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!communityId) {
        throw new BadRequestError('Community ID is required in URL path');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const action = await AiActionExecutorService.confirmAction(
        communityId,
        req.user,
        req.body || {},
        { requestId: req.id }
      );

      res.status(200).json({
        success: true,
        action,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/communities/:communityId/ai/actions/execute
   */
  static async executeAction(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!communityId) {
        throw new BadRequestError('Community ID is required in URL path');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const result = await AiActionExecutorService.executeAction(
        communityId,
        req.user,
        req.body || {},
        { requestId: req.id }
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/communities/:communityId/ai/actions/:actionId
   */
  static async getAction(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      const actionId = req.params.actionId;
      if (!communityId || !actionId) {
        throw new BadRequestError('Both communityId and actionId are required');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      const action = await AiActionExecutorService.getAction(communityId, req.user, actionId);

      res.status(200).json({
        success: true,
        action,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/communities/:communityId/ai/usage
   * Task 21.7 Owner-facing AI usage, quota, and entitlement visibility.
   */
  static async getUsage(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!communityId) {
        throw new BadRequestError('Community ID is required in URL path');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required to access AI usage telemetry');
      }

      if (!canAccessTenant(req.user, communityId)) {
        throw new ForbiddenError(`Cross-community access denied for tenant ${communityId}`);
      }

      const snapshot = await AiUsageService.getUsageSnapshot(communityId);

      res.status(200).json({
        success: true,
        ...snapshot,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/communities/:communityId/ai/export
   * Task 21.10 Export AI analysis as PDF, CSV, or JSON.
   */
  static async exportReport(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!communityId) {
        throw new BadRequestError('Community ID is required in URL path');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required to export AI report');
      }

      const {
        format = 'json',
        sourceType = 'QUERY_RESPONSE',
        conversationId,
        contextualActionRequest,
        aiResponse,
        recommendationId,
        dateRange,
        customStart,
        customEnd,
        domain,
        title,
        question,
      } = req.body || {};

      const exportResult = await AiReportExportService.exportReport(
        communityId,
        req.user,
        {
          format,
          sourceType,
          conversationId,
          contextualActionRequest,
          aiResponse,
          recommendationId,
          dateRange,
          customStart,
          customEnd,
          domain,
          title,
          question,
        },
        {
          requestId: req.id,
          ipAddress: req.ip,
        }
      );

      // Support direct file download attachment or raw JSON metadata response
      if (req.query.download === 'false' || req.query.raw === 'true') {
        return res.status(200).json({
          success: true,
          reportId: exportResult.reportId,
          filename: exportResult.filename,
          contentType: exportResult.contentType,
          generationState: exportResult.generationState,
          metadata: exportResult.metadata,
          content:
            typeof exportResult.content === 'string'
              ? exportResult.content
              : exportResult.content.toString('base64'),
        });
      }

      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
      res.setHeader('Content-Type', exportResult.contentType);
      return res.send(exportResult.content);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/communities/:communityId/ai/needs-attention
   */
  static async getNeedsAttention(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const report = await NeedsAttentionService.evaluateSignals(communityId);
      return res.status(200).json({ success: true, report });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/communities/:communityId/ai/dashboard
   */
  static async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const config = await DashboardService.getDashboardConfig(communityId, req.user);
      return res.status(200).json({ success: true, ...config });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/communities/:communityId/ai/dashboard/update
   */
  static async updateDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const { cardIds } = req.body || {};
      const config = await DashboardService.updateDashboardConfig(communityId, req.user, cardIds);
      return res.status(200).json({ success: true, ...config });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/communities/:communityId/ai/dashboard/propose
   */
  static async proposeDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const { goalPrompt } = req.body || {};
      const proposal = await DashboardService.generateAIProposal(communityId, req.user, goalPrompt);
      return res.status(200).json({ success: true, proposal });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/communities/:communityId/ai/dashboard/cards
   */
  static async getDashboardCards(req: Request, res: Response, next: NextFunction) {
    try {
      const cards = DashboardService.getCardsRegistry();
      return res.status(200).json({ success: true, cards });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/communities/:communityId/ai/reports/generate
   */
  static async generateReport(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const { reportType, dateRange } = req.body || {};
      const report = await ReportGeneratorService.generateReport(
        communityId,
        req.user,
        reportType || 'WEEKLY_COMMUNITY',
        dateRange || 'LAST_30_DAYS'
      );
      return res.status(200).json({ success: true, report });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/communities/:communityId/ai/reports/schedule
   */
  static async scheduleReport(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const config = await ReportSchedulerService.scheduleReport(communityId, req.user, req.body || {});
      return res.status(201).json({ success: true, config });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/communities/:communityId/ai/reports/scheduled
   */
  static async listScheduledReports(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const reports = await ReportSchedulerService.listScheduledReports(communityId, req.user);
      return res.status(200).json({ success: true, reports });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/communities/:communityId/ai/workflow/propose
   */
  static async proposeWorkflow(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const { prompt } = req.body || {};
      const proposal = await AiWorkflowBuilderService.proposeWorkflow(communityId, req.user, prompt);
      return res.status(200).json({ success: true, proposal });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/communities/:communityId/ai/features
   */
  static async getFeatureOverview(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const features = await FeatureRegistryService.getFeatureOverview(communityId, req.user);
      return res.status(200).json({ success: true, features });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/communities/:communityId/ai/setup/guided
   */
  static async guidedSetup(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!req.user) throw new UnauthorizedError('Authentication required');
      const { featureId } = req.body || {};
      const guide = await FeatureRegistryService.guidedSetupAssist(communityId, req.user, featureId);
      return res.status(200).json({ success: true, guide });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/community/:communityId/command-center
   */
  static async getCommandCenter(req: Request, res: Response, next: NextFunction) {
    try {
      const communityId = req.params.communityId;
      if (!communityId) {
        throw new BadRequestError('Community ID is required in URL path');
      }

      if (!req.user) {
        throw new UnauthorizedError('Authentication required');
      }

      // Authoritative security, tenant context and role/permission validation
      const { community } = await resolveAuthorizedCommunityContext(req.user.userId, communityId);

      // 1b. Fetch Plan & Usage
      let plan: any = { plan: 'FREE', subscriptionStatus: 'ACTIVE', billingStatus: 'HEALTHY' };
      let usage: any = {};
      try {
        plan = await EntitlementService.getPlan(communityId);
        usage = await EntitlementService.getUsage(communityId);
      } catch (err) {
        logger.error('Error fetching entitlement plan/usage:', err);
      }

      // 2. Fetch Server Health (Discord connection & diagnostics)
      let serverHealth: any = null;
      try {
        serverHealth = await discordCapabilityService.getConnectionCenterStatus(communityId);
      } catch (err) {
        logger.error('Error fetching Discord connection center status:', err);
      }

      // 3. Fetch Needs Attention report
      let needsAttention: any = null;
      try {
        needsAttention = await NeedsAttentionService.evaluateSignals(communityId);
      } catch (err) {
        logger.error('Error fetching Needs Attention report:', err);
      }

      // 4. Fetch Today's Operations
      let today: any = { events: [], activeAutomations: [], reminders: [] };
      try {
        const [events, reminders, workflows] = await Promise.all([
          eventsRepository.listForTenant(communityId),
          remindersRepository.listForTenant(communityId),
          automationWorkflowsRepository.listForTenant(communityId),
        ]);

        today.events = (events || [])
          .filter((e: any) => e.status !== 'CANCELLED' && e.status !== 'ARCHIVED')
          .map((e: any) => ({
            id: e.id,
            title: e.title,
            scheduledAt: e.scheduledAt,
            status: e.status,
            type: e.type || 'COMMUNITY_MEETING',
          }))
          .sort((a: any, b: any) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
          .slice(0, 5);

        today.reminders = (reminders || [])
          .filter((r: any) => r.status === 'PENDING')
          .slice(0, 5);

        today.activeAutomations = (workflows || [])
          .filter((w: any) => w.status === 'ACTIVE')
          .slice(0, 5);
      } catch (err) {
        logger.error('Error fetching today\'s operations:', err);
      }

      // 5. Member Activity
      let memberActivity: any = { totalMembers: 0, activeMembers: 0, list: [] };
      try {
        const membersList = await discordMembersRepository.listForTenant(communityId, { limit: 10 });
        const allMembers = await discordMembersRepository.listForTenant(communityId);
        memberActivity.totalMembers = allMembers.length;
        memberActivity.activeMembers = allMembers.filter((m: any) => m.membershipStatus === 'ACTIVE').length;
        memberActivity.list = membersList.map((m: any) => ({
          id: m.id,
          username: m.username,
          discordUserId: m.discordUserId,
          membershipStatus: m.membershipStatus,
          joinedAt: m.joinedAt,
        }));
      } catch (err) {
        logger.error('Error fetching member activity:', err);
      }

      // 6. Recruitment Workload
      let workload: any = { pendingApplications: 0, totalApplications: 0, activeRecruiters: 0, scheduledInterviews: 0 };
      try {
        const [apps, intervs, recruiters, codes] = await Promise.all([
          applicationsRepository.listForTenant(communityId),
          interviewsRepository.listForTenant(communityId),
          recruitersRepository.listForTenant(communityId),
          recruiterCodesRepository.listForTenant(communityId),
        ]);

        workload.pendingApplications = (apps || []).filter((a: any) => a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW').length;
        workload.totalApplications = (apps || []).length;
        workload.scheduledInterviews = (intervs || []).filter((i: any) => i.status === 'SCHEDULED').length;
        workload.activeRecruiters = (recruiters || []).length;
        workload.activeCodes = (codes || []).length;
      } catch (err) {
        logger.error('Error fetching recruitment workload:', err);
      }

      // 7. Engagement Activity
      let engagement: any = { activeCampaigns: 0, activePolls: 0, pendingAnnouncements: 0 };
      try {
        const [campaigns, announcements, polls] = await Promise.all([
          campaignsRepository.listForTenant(communityId),
          announcementsRepository.listForTenant(communityId),
          pollsRepository.listForTenant(communityId),
        ]);

        engagement.activeCampaigns = (campaigns || []).filter((c: any) => c.status === 'ACTIVE').length;
        engagement.activePolls = (polls || []).filter((p: any) => p.status === 'ACTIVE' || !p.closed).length;
        engagement.pendingAnnouncements = (announcements || []).filter((a: any) => a.status === 'PENDING').length;
      } catch (err) {
        logger.error('Error fetching engagement activity:', err);
      }

      // 8. Moderation Safety
      let moderationSafety: any = { activeWarnings: 0, unresolvedIncidents: 0 };
      try {
        const [warnings, incidents] = await Promise.all([
          warningsRepository.listForTenant(communityId),
          safetyIncidentsRepository.listForTenant(communityId),
        ]);

        moderationSafety.activeWarnings = (warnings || []).filter((w: any) => w.status === 'ACTIVE').length;
        moderationSafety.unresolvedIncidents = (incidents || []).filter((i: any) => i.status === 'ACTIVE' || i.status === 'OPEN').length;
      } catch (err) {
        logger.error('Error fetching moderation safety metrics:', err);
      }

      // 9. Integration Health
      let integrations: any = null;
      try {
        integrations = await integrationCenterService.getUnifiedStatus(communityId);
      } catch (err) {
        logger.error('Error fetching integration center status:', err);
      }

      // 10. Fetch Recent Notification alerts
      let notifications: any[] = [];
      try {
        notifications = await notificationsRepository.listForTenant(communityId, {
          limit: 10,
        });
        notifications = notifications.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      } catch (err) {
        logger.error('Error fetching recent notifications:', err);
      }

      // 11. Community Brain AI Recommendations
      let recommendations: any[] = [];
      try {
        recommendations = await AiCommunityManagerService.getRecommendations(communityId, req.user);
      } catch (err) {
        logger.error('Error fetching Community Brain AI recommendations:', err);
      }

      // 12. Assemble Payload
      const responsePayload = {
        success: true,
        community: {
          id: community.id,
          name: community.name,
          guildId: community.guildId,
          connectionStatus: community.connectionStatus,
          createdAt: community.createdAt,
          plan: plan.plan,
          usage,
        },
        serverHealth,
        needsAttention,
        today,
        memberActivity,
        workload,
        engagement,
        moderationSafety,
        integrations,
        notifications,
        recommendations,
        freshness: new Date().toISOString(),
      };

      return res.status(200).json(responsePayload);
    } catch (error: any) {
      const isAuthError = error instanceof UnauthorizedError || error instanceof ForbiddenError || error?.name === 'UnauthorizedError' || error?.name === 'ForbiddenError' || error?.status === 401 || error?.status === 403;
      if (isAuthError) {
        return res.status(error?.status || 403).json({
          success: false,
          errorCategory: 'AUTHORIZATION_FAILED',
          errorMessage: error?.message || 'Access denied: Simulated identities are prohibited in this environment or user has no tenant clearance',
        });
      }
      next(error);
    }
  }
}


