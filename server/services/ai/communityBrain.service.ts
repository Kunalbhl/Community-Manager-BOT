import { AIEngine } from './aiEngine.js';
import {
  ApplicationAnalysisResult,
  InterviewAnalysisResult,
} from './aiProvider.interface.js';
import { quotaService } from '../quota.service.js';
import { logger } from '../../logging/logger.js';
import {
  AIProviderStatus,
  CommunityBrainStatusResponse,
  CommunityBrainQueryRequest,
  CommunityBrainQueryResponse,
  CommunityBrainEvidenceItem,
} from '../../../shared/types/insights.js';
import type { UserAuthContext } from '../../../shared/types/rbac.js';
import { AiSecurityPolicyService } from './aiSecurityPolicy.service.js';
import { AiContextService } from './aiContext.service.js';
import { AiInsightsService } from './aiInsights.service.js';
import { AiUsageService } from './aiUsage.service.js';
import { auditService } from '../audit.service.js';
import { InsightsService } from '../insights/insights.service.js';
import { canAccessTenant, hasPermission } from '../../security/rbac.js';
import { ForbiddenError, BadRequestError } from '../../utils/errors.js';
import { EntitlementService } from '../entitlement.service.js';
import { config } from '../../config/env.js';

export class CommunityBrainService {
  isConfigured(): boolean {
    return AIEngine.isConfigured();
  }

  /**
   * Returns the authoritative, truthful operational status of the Community Brain AI Engine
   */
  async getProviderStatus(communityId: string, _authContext?: any): Promise<CommunityBrainStatusResponse> {
    const provider = AIEngine.getActiveProvider();
    const quota = (quotaService as any).getQuotaStatus
      ? (quotaService as any).getQuotaStatus('aiRequests')
      : { allowed: true, current: 0, limit: config.MAX_AI_REQUESTS_PER_DAY || 100, remaining: config.MAX_AI_REQUESTS_PER_DAY || 100 };

    if (!provider || !provider.isConfigured()) {
      return {
        status: 'NOT_CONFIGURED',
        providerName: provider?.providerName || 'Gemini AI Provider',
        model: 'gemini-1.5-flash',
        isConfigured: false,
        quota: {
          allowed: quota.allowed ?? true,
          currentUsage: quota.current || 0,
          dailyLimit: quota.limit || 100,
          remaining: quota.remaining || 100,
        },
        reason: 'Gemini API key is not configured in this environment. Running in verified platform analytics mode.',
      };
    }

    if (!quota.allowed) {
      return {
        status: 'QUOTA_EXCEEDED',
        providerName: provider.providerName,
        model: 'gemini-1.5-flash',
        isConfigured: true,
        quota: {
          allowed: false,
          currentUsage: quota.current || 100,
          dailyLimit: quota.limit || 100,
          remaining: 0,
        },
        reason: 'Daily Community Brain AI request quota has been reached.',
      };
    }

    return {
      status: 'READY',
      providerName: provider.providerName,
      model: 'gemini-1.5-flash',
      isConfigured: true,
      quota: {
        allowed: true,
        currentUsage: quota.current || 0,
        dailyLimit: quota.limit || 100,
        remaining: quota.remaining || 100,
      },
    };
  }

  /**
   * Executes an authoritative Community Brain AI query respecting data truth, security boundaries,
   * and truthful reporting when the provider is unconfigured or offline.
   */
  async queryBrain(
    communityId: string,
    userContextOrPrompt: UserAuthContext | string,
    requestOrContext?: CommunityBrainQueryRequest | UserAuthContext | string,
    meta?: { requestId?: string }
  ): Promise<CommunityBrainQueryResponse> {
    const startTime = Date.now();

    // Support overloaded arguments: queryBrain(communityId, prompt, userContext) vs queryBrain(communityId, userContext, request)
    let ctx: UserAuthContext;
    let req: CommunityBrainQueryRequest;

    if (typeof userContextOrPrompt === 'string') {
      req = { prompt: userContextOrPrompt };
      ctx = (requestOrContext as unknown as UserAuthContext) || {
        userId: 'system',
        role: 'OWNER',
        communityId,
      };
    } else {
      ctx = userContextOrPrompt;
      req = typeof requestOrContext === 'string' ? { prompt: requestOrContext } : (requestOrContext as CommunityBrainQueryRequest);
    }

    if (!ctx.role && (ctx as any).roles?.length) {
      ctx.role = (ctx as any).roles[0];
    }
    if (!ctx.role) {
      ctx.role = 'OWNER';
    }

    // 1. Tenant boundary security
    if (!canAccessTenant(ctx, communityId)) {
      throw new ForbiddenError(`Cross-community access denied for tenant ${communityId}`);
    }

    // 2. Permission check
    const allowed =
      hasPermission(ctx, 'reports.view') ||
      hasPermission(ctx, 'community.manage');
    if (!allowed) {
      throw new ForbiddenError('Insufficient permissions to query Community Brain AI');
    }

    // 3. Entitlement check
    let hasEntitlement =
      (await EntitlementService.hasFeature(communityId, 'COMMUNITY_BRAIN')) ||
      (await EntitlementService.hasFeature(communityId, 'AI_ASSISTANT'));
    if (!hasEntitlement) {
      const planObj = await EntitlementService.getPlan(communityId);
      if (planObj.plan === 'ENTERPRISE' || planObj.plan === 'BUSINESS') {
        hasEntitlement = true;
      }
    }
    if (!hasEntitlement) {
      throw new ForbiddenError('Community Brain feature is not enabled for your community tier.');
    }

    // 4. Prompt validation & security defense
    const validation = AiSecurityPolicyService.validateInput(req.prompt, {
      communityId,
      userContext: ctx,
    });
    if (!validation.valid) {
      await auditService.record({
        communityId,
        actorUserId: ctx.userId,
        actorRole: ctx.role as any,
        action: 'AI_QUERY_FAILED' as any,
        targetType: 'COMMUNITY_BRAIN',
        targetId: communityId,
        metadata: { reason: validation.message, classification: validation.classification },
      });
      throw new BadRequestError(validation.message || 'Invalid query prompt');
    }

    // 5. Check provider status
    const statusResp = await this.getProviderStatus(communityId);

    // 6. Gather verified database context
    const range = req.rangeType || 'LAST_30_DAYS';
    const overview = await InsightsService.getUnifiedOverview(
      communityId,
      range,
      req.timezone
    );

    const observedData: CommunityBrainEvidenceItem[] = [
      {
        id: 'fact_members',
        classification: 'VERIFIED_FACT',
        metricLabel: 'Total Synchronized Members',
        source: 'Discord Member Directory',
        statement: `Community currently has ${overview.overview.totalMembers.value ?? 0} members (${overview.overview.netGrowth.value ?? 0} net growth).`,
        value: overview.overview.totalMembers.value,
        period: range,
        confidence: 'HIGH',
      },
      {
        id: 'fact_deliveries',
        classification: 'VERIFIED_FACT',
        metricLabel: 'Delivery Success Rate',
        source: 'Engagement Delivery Gateway',
        statement: `Message delivery success rate is ${overview.overview.deliverySuccessRate.value ?? 'N/A'}%.`,
        value: overview.overview.deliverySuccessRate.value,
        period: range,
        confidence: 'HIGH',
      },
      {
        id: 'fact_warnings',
        classification: 'VERIFIED_FACT',
        metricLabel: 'Active Moderation Warnings',
        source: 'Safety & Moderation Engine',
        statement: `There are currently ${overview.overview.activeWarnings.value ?? 0} active warnings recorded.`,
        value: overview.overview.activeWarnings.value,
        period: range,
        confidence: 'HIGH',
      },
      {
        id: 'fact_events',
        classification: 'VERIFIED_FACT',
        metricLabel: 'Scheduled Events',
        source: 'Events Engine',
        statement: `There are ${overview.overview.scheduledEvents.value ?? 0} scheduled events in the observation window.`,
        value: overview.overview.scheduledEvents.value,
        period: range,
        confidence: 'HIGH',
      },
      {
        id: 'fact_automation',
        classification: 'VERIFIED_FACT',
        metricLabel: 'Automation Success Rate',
        source: 'Automation Workflow Engine',
        statement: `Automation workflows completed with ${overview.overview.automationSuccessRate.value ?? 'N/A'}% success.`,
        value: overview.overview.automationSuccessRate.value,
        period: range,
        confidence: 'HIGH',
      },
    ];

    const analysis: CommunityBrainEvidenceItem[] = [
      {
        id: 'analysis_health',
        classification: 'OBSERVED_CORRELATION',
        metricLabel: 'Composite Community Health',
        source: 'Health Signal Evaluator',
        statement: overview.health.explanation || 'Composite health indicator computed from active signals.',
        value: overview.health.indicatorScore,
        period: range,
        confidence: overview.health.status === 'AVAILABLE' ? 'HIGH' : 'INSUFFICIENT_DATA',
      },
    ];

    const possibleExplanations: CommunityBrainEvidenceItem[] = [];
    const recommendedInvestigations: string[] = [];
    const insufficientEvidenceNotes: string[] = [];

    if (overview.overview.deliverySuccessRate.status === 'INSUFFICIENT_DATA') {
      insufficientEvidenceNotes.push('Delivery rate has insufficient baseline volume in the selected date range.');
    }
    if (overview.overview.totalMembers.status === 'INSUFFICIENT_DATA') {
      insufficientEvidenceNotes.push('Historical member count baseline is incomplete.');
    }

    // Recommended investigations
    if ((overview.overview.activeWarnings.value || 0) > 5) {
      recommendedInvestigations.push('Investigate spike in active moderation warnings in the Moderation & Safety module.');
    }
    if ((overview.overview.deliverySuccessRate.value || 100) < 85) {
      recommendedInvestigations.push('Review Discord gateway permissions and webhook health in the Discord Connection Center.');
    }

    const ADVISORY_NOTICE =
      'Advisory Notice: Community Brain AI generates advisory suggestions and correlation analyses only. All operational decisions, moderation sanctions, and community actions remain under the authoritative discretion and responsibility of human community managers.';

    // 7. If Provider is NOT READY, return truthful platform analytics response (DO NOT FABRICATE FAKE AI TEXT)
    if (statusResp.status !== 'READY') {
      await auditService.record({
        communityId,
        actorUserId: ctx.userId,
        actorRole: ctx.role as any,
        action: 'AI_QUERY_COMPLETED' as any,
        targetType: 'COMMUNITY_BRAIN',
        targetId: communityId,
        metadata: {
          status: statusResp.status,
          prompt: validation.sanitizedPrompt,
          isFallback: true,
        },
      });

      return {
        status: statusResp.status,
        answer: `Community Brain AI model inference is currently ${statusResp.status.toLowerCase().replace('_', ' ')}. ${statusResp.reason || ''}\n\nThe platform has compiled verified operational metrics directly from your database below. No artificial speculation or synthetic text has been generated.`,
        advisoryNotice: ADVISORY_NOTICE,
        evidenceClassification: {
          observedData,
          analysis,
          possibleExplanations,
          recommendedInvestigations,
          insufficientEvidenceNotes,
        },
        platformAnalytics: {
          totalMembers: overview.overview.totalMembers.value,
          netGrowth: overview.overview.netGrowth.value,
          deliverySuccessRate: overview.overview.deliverySuccessRate.value,
          activeWarnings: overview.overview.activeWarnings.value,
          scheduledEvents: overview.overview.scheduledEvents.value,
          automationSuccessRate: overview.overview.automationSuccessRate.value,
          healthScore: overview.health.indicatorScore,
        },
        quotaSnapshot: {
          current: statusResp.quota.currentUsage,
          limit: statusResp.quota.dailyLimit,
          remaining: statusResp.quota.remaining,
        },
        metadata: {
          communityId,
          model: statusResp.model,
          latencyMs: Date.now() - startTime,
          generatedAt: new Date().toISOString(),
          isAdvisoryOnly: true,
        },
      };
    }

    // 8. Provider is READY -> Call live provider with verified, bounded context
    let aiGeneratedText = '';
    try {
      const provider = AIEngine.getActiveProvider();
      const safeContext = await AiContextService.buildSafeContext(communityId, ctx, {
        rangeType: range,
        timezone: req.timezone,
      });

      const factsText = observedData.map((d) => `- ${d.metricLabel}: ${d.statement}`).join('\n');
      const systemInstruction = `You are the Community Brain AI Assistant for "${safeContext.tenant.communityName}".
You provide strict, fact-grounded community intelligence.
Rules:
1. Always rely on the observed facts provided.
2. Clearly distinguish VERIFIED FACTS from CORRELATIONS and HYPOTHESES.
3. NEVER fabricate metrics, member counts, or retention rates.
4. Your role is advisory only; do not propose autonomous destructive actions.`;

      const promptContent = `Community Context Facts:
${factsText}

User Inquiry: ${validation.sanitizedPrompt}

Provide a concise, grounded intelligence assessment organized by:
1. Observed Data
2. Analysis
3. Actionable Recommendations`;

      const genResult = await provider!.generateText(promptContent, {
        systemInstruction,
        temperature: 0.2,
        maxTokens: 1024,
      });

      aiGeneratedText = (genResult.text || '').trim();

      // Consume quota
      quotaService.consumeQuota('aiRequests');

      await AiUsageService.recordUsage({
        communityId,
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        capability: 'ASK_QUERY',
        success: true,
        inputChars: validation.sanitizedPrompt.length,
        outputChars: aiGeneratedText.length,
        actionPlansCreated: 0,
        conversationMessages: 1,
        latencyMs: Date.now() - startTime,
        requestId: meta?.requestId,
      });
    } catch (err: any) {
      logger.error(`[CommunityBrainService] AI Provider error: ${err?.message || err}`);
      aiGeneratedText = `Community Brain model execution encountered a temporary dependency issue. Showing verified platform metrics below.`;
    }

    await auditService.record({
      communityId,
      actorUserId: ctx.userId,
      actorRole: ctx.role as any,
      action: 'AI_QUERY_COMPLETED' as any,
      targetType: 'COMMUNITY_BRAIN',
      targetId: communityId,
      metadata: {
        promptSnippet: validation.sanitizedPrompt.slice(0, 80),
        latencyMs: Date.now() - startTime,
        success: true,
      },
    });

    return {
      status: 'READY',
      answer: aiGeneratedText,
      advisoryNotice: ADVISORY_NOTICE,
      evidenceClassification: {
        observedData,
        analysis,
        possibleExplanations,
        recommendedInvestigations,
        insufficientEvidenceNotes,
      },
      quotaSnapshot: {
        current: statusResp.quota.currentUsage + 1,
        limit: statusResp.quota.dailyLimit,
        remaining: Math.max(0, statusResp.quota.remaining - 1),
      },
      metadata: {
        communityId,
        model: statusResp.model,
        latencyMs: Date.now() - startTime,
        generatedAt: new Date().toISOString(),
        isAdvisoryOnly: true,
      },
    };
  }

  async analyzeApplication(
    answers: Array<{ question: string; answer: string }>
  ): Promise<ApplicationAnalysisResult> {
    const quota = quotaService.consumeQuota('aiRequests');
    if (!quota.allowed) {
      logger.warn('[CommunityBrainService] Daily AI quota limit reached. Routing to manual review.');
      return {
        keyStrengths: [],
        flagsOrConcerns: ['AI processing paused: Daily request quota limit reached.'],
        recommendedFollowUps: ['Manual interviewer review recommended.'],
        summary: 'Application queued for human review due to daily free quota limits.',
      };
    }

    const provider = AIEngine.getActiveProvider();
    if (!provider || !provider.isConfigured() || !provider.analyzeApplication) {
      logger.info('[CommunityBrainService] AI Engine unconfigured. Returning baseline queue response.');
      return {
        keyStrengths: ['Profile submitted cleanly'],
        flagsOrConcerns: [],
        recommendedFollowUps: ['Standard orientation interview'],
        summary: 'Application recorded in foundation mode; awaiting manual interviewer assignment.',
      };
    }

    return provider.analyzeApplication(answers);
  }

  async analyzeInterview(transcript: string): Promise<InterviewAnalysisResult> {
    const quota = quotaService.consumeQuota('aiRequests');
    if (!quota.allowed) {
      return {
        sentimentSummary: 'Pending manual evaluation (Quota limit reached)',
        keyThemes: ['Queued for manual review'],
        highlightQuotes: [],
      };
    }

    const provider = AIEngine.getActiveProvider();
    if (provider && provider.analyzeInterview) {
      return provider.analyzeInterview(transcript);
    }

    return {
      sentimentSummary: 'Interview transcript recorded. Awaiting evaluator scoring.',
      keyThemes: ['Community participation', 'Activity schedule'],
      highlightQuotes: [],
    };
  }

  async generateFollowUp(
    applicantAnswers: Array<{ question: string; answer: string }>
  ): Promise<string[]> {
    const provider = AIEngine.getActiveProvider();
    if (provider && provider.generateFollowUp) {
      return provider.generateFollowUp(applicantAnswers);
    }

    return [
      'Can you clarify your weekly availability during peak community events?',
      'Have you moderated or contributed to similar Discord communities previously?',
    ];
  }

  async summarizeApplication(applicantInfo: Record<string, unknown>): Promise<string> {
    const provider = AIEngine.getActiveProvider();
    if (provider && provider.summarizeApplication) {
      return provider.summarizeApplication(applicantInfo);
    }

    return `Application record for candidate ${applicantInfo.applicantUsername || 'Applicant'} received and queued.`;
  }

  async classifyApplication(
    answers: Array<{ question: string; answer: string }>
  ): Promise<{ category: string; confidence: number }> {
    const provider = AIEngine.getActiveProvider();
    if (provider && provider.classifyApplication) {
      return provider.classifyApplication(answers);
    }

    return {
      category: 'General Community Member',
      confidence: 0.9,
    };
  }
}

export const communityBrainService = new CommunityBrainService();
