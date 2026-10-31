import type { UserAuthContext } from '../../../shared/types/rbac.js';
import {
  AiAskRequest,
  AiCommunityContext,
  AiConfidence,
  AiPlannedAction,
  AiActionPlan,
  AiRecommendation,
  AiResponse,
} from '../../../shared/types/ai.js';
import { canAccessTenant, hasPermission } from '../../security/rbac.js';
import { ForbiddenError, BadRequestError } from '../../utils/errors.js';
import { AiSecurityPolicyService } from './aiSecurityPolicy.service.js';
import { AiSafetyService } from './aiSafety.service.js';
import { AiUsageService } from './aiUsage.service.js';
import { AiClassificationService } from './aiClassification.service.js';
import { AiContextService, BuildContextOptions } from './aiContext.service.js';
import { AiInsightsService } from './aiInsights.service.js';
import { AiRecommendationService } from './aiRecommendation.service.js';
import { AiActionPlannerService } from './aiActionPlanner.service.js';
import { AiConversationService } from './aiConversation.service.js';
import { AiAuditService } from './aiAudit.service.js';
import { AiTelemetryService } from './aiTelemetry.service.js';
import { AiError } from '../../utils/errors.js';

export class AiCommunityManagerService {
  /**
   * Primary facade for answering user AI queries within an authorized tenant context.
   * Strictly implements the Authoritative AI Data Pipeline with hardened AI Security (Task 21.6).
   */
  static async ask(
    communityId: string,
    userContext: UserAuthContext,
    request: AiAskRequest,
    meta?: { requestId?: string; ipAddress?: string }
  ): Promise<AiResponse> {
    const startTime = Date.now();

    // 1. INPUT VALIDATION & SECURITY CLASSIFICATION
    const validation = AiSecurityPolicyService.validateInput(request?.prompt, {
      communityId,
      userContext,
    });

    if (!validation.valid) {
      if (validation.classification === 'PROMPT_INJECTION' || validation.classification === 'SYSTEM_PROMPT_EXTRACTION') {
        await AiAuditService.logPromptInjectionBlocked({
          communityId,
          actorUserId: userContext.userId,
          actorRole: userContext.role,
          reason: validation.message || 'PROMPT_INJECTION_DETECTED',
          details: {
            classification: validation.classification,
            violations: validation.violations,
          },
          requestId: meta?.requestId,
          ipAddress: meta?.ipAddress,
        });
      } else if (
        validation.classification === 'UNSAFE_INSTRUCTION' ||
        validation.classification === 'ROLE_SPOOFING' ||
        validation.classification === 'CONFIRMATION_BYPASS' ||
        validation.classification === 'SECRET_EXTRACTION' ||
        validation.classification === 'CROSS_TENANT_MANIPULATION'
      ) {
        await AiAuditService.logUnsafeRequestBlocked({
          communityId,
          actorUserId: userContext.userId,
          actorRole: userContext.role,
          reason: validation.message || 'UNSAFE_REQUEST_BLOCKED',
          details: {
            classification: validation.classification,
            violations: validation.violations,
          },
          requestId: meta?.requestId,
        });
      }

      throw new BadRequestError(validation.message || 'Invalid query prompt');
    }

    // 2. TENANT AUTHORIZATION (Authoritative Server-Side Tenant Boundary Validation)
    if (!canAccessTenant(userContext, communityId)) {
      await AiAuditService.logContextBoundaryViolation({
        communityId,
        actorUserId: userContext.userId,
        actorRole: userContext.role,
        reason: 'CROSS_COMMUNITY_ACCESS_DENIED',
        details: { attemptedTenantId: communityId },
        requestId: meta?.requestId,
      });
      throw new ForbiddenError(
        `Cross-community access denied: User cannot consult AI for tenant ${communityId}`
      );
    }

    // Permission Check (requires reports viewing or community management privilege)
    const hasAnyAccess =
      hasPermission(userContext, 'reports.view') ||
      hasPermission(userContext, 'community.manage');

    if (!hasAnyAccess) {
      throw new ForbiddenError(
        'Missing required permission to access AI Community Manager (requires reports.view or community.manage)'
      );
    }

    // 3. ENTITLEMENT CHECK & QUOTA VERIFICATION (Task 21.7 Centralized Usage Control)
    const allowance = await AiUsageService.checkAllowance(communityId, 'ASK_QUERY', {
      userContext,
      requestId: meta?.requestId,
      ipAddress: meta?.ipAddress,
      inputChars: validation.sanitizedPrompt.length,
    });

    if (!allowance.allowed) {
      if (allowance.state === 'FEATURE_NOT_ENABLED' || allowance.state === 'BILLING_REQUIRED') {
        throw new ForbiddenError(allowance.reason || 'AI Assistant not entitled');
      }
      throw new BadRequestError(allowance.reason || 'Daily AI request quota reached for this community plan.');
    }

    try {
      // 4. QUESTION CLASSIFICATION
    const classification = AiClassificationService.classify(
      validation.sanitizedPrompt,
      request.scope
    );

    // 5. INSIGHTS QUERY & AUTHORITATIVE DATA CONTEXT
    const targetRange =
      request.dateRange || classification.inferredDateRange || 'LAST_30_DAYS';

    const context = await AiContextService.buildContext(communityId, {
      rangeType: targetRange,
      timezone: request.timezone,
      customStart: request.customStart,
      customEnd: request.customEnd,
    });

    // 5.1 CONTEXT BOUNDARY VALIDATION
    try {
      AiSecurityPolicyService.validateContextBoundary(context, communityId);
    } catch (err: any) {
      await AiAuditService.logContextBoundaryViolation({
        communityId,
        actorUserId: userContext.userId,
        actorRole: userContext.role,
        reason: err.message,
        requestId: meta?.requestId,
      });
      throw new ForbiddenError('Security Policy: Context boundary violation detected');
    }

    // 5.2 CONVERSATION & MEMORY INTEGRATION (Task 21.5)
    let activeConversation = undefined;
    let conversationMemory:
      | {
          summary?: string;
          recentTurns?: Array<{ role: string; content: string }>;
          relevantInsights?: string[];
        }
      | undefined = undefined;

    if (request.conversationId) {
      activeConversation = await AiConversationService.getConversation(
        communityId,
        userContext,
        request.conversationId
      );

      const recentTurns = (activeConversation.messages || []).slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      conversationMemory = {
        summary: activeConversation.contextSummary || activeConversation.summaryData?.summary,
        recentTurns,
        relevantInsights: activeConversation.relevantInsights,
      };
    }

    // 6. AI REASONING (Insights-Grounded Explanation Engine with Conversational Memory)
    const conversation = await AiConversationService.generateAnswer(
      validation.sanitizedPrompt,
      context,
      classification.category,
      conversationMemory
    );

    // 6.1 OUTPUT SECURITY VALIDATION
    const outputValidation = AiSecurityPolicyService.validateOutput(conversation.answer, context);
    if (!outputValidation.valid) {
      await AiAuditService.logOutputValidationFailed({
        communityId,
        actorUserId: userContext.userId,
        actorRole: userContext.role,
        reason: 'AI output failed security validation',
        violations: outputValidation.violations,
        requestId: meta?.requestId,
      });
    }

    let finalAnswer = outputValidation.sanitized;
    let totalRedactedSecrets = conversation.redactedSecretCount + outputValidation.redactedCount;
    if (totalRedactedSecrets > 0) {
      await AiAuditService.logSecretRedaction({
        communityId,
        actorUserId: userContext.userId,
        actorRole: userContext.role,
        reason: 'Secret patterns detected and redacted from AI consultation flow',
        redactedCount: totalRedactedSecrets,
        requestId: meta?.requestId,
      });
    }

    // 7. FACT VALIDATION
    const rawFacts = AiInsightsService.extractFacts(context);
    const facts = AiInsightsService.validateFacts(rawFacts);

    // 8. INSIGHT VALIDATION
    const rawInsights = AiInsightsService.generateInsights(context, classification.category);
    const insights = AiInsightsService.validateInsights(rawInsights);

    // 9. RECOMMENDATION GENERATION (Task 21.3 Prioritized & Grounded)
    const rawRecommendations = AiRecommendationService.generateRecommendations(context, facts, insights);
    // Enforce safety against guaranteed claims on recommendations
    const recommendations = rawRecommendations.filter(
      (rec) => !AiSafetyService.checkForGuaranteedClaims(rec.rationale) && !AiSafetyService.checkForGuaranteedClaims(rec.title)
    );
    const limitations = AiInsightsService.extractLimitations(context);

    // 10. ACTION PLANNING (Optional candidate drafts & structured AiActionPlan)
    let actionsPlanned: AiPlannedAction[] | undefined = undefined;
    let actionPlans: AiActionPlan[] | undefined = undefined;
    if (request.includePlannedActions !== false) {
      actionsPlanned = AiActionPlannerService.planCandidateActions(validation.sanitizedPrompt, context);
      if (recommendations.length > 0) {
        actionPlans = recommendations.slice(0, 3).map((rec) =>
          AiActionPlannerService.createActionPlan({ recommendation: rec }, context)
        );
      }
    }

    // 11. COMPUTE CONFIDENCE
    const confidence = this.computeConfidence(context, facts.length);

    const latencyMs = Date.now() - startTime;

    // 12. AUDIT LOGGING & STRUCTURED RESPONSE
    await AiAuditService.logQueryExecuted({
      communityId,
      actorUserId: userContext.userId,
      actorRole: userContext.role,
      promptSnippet: validation.sanitizedPrompt,
      latencyMs,
      model: conversation.model,
      success: true,
      requestId: meta?.requestId,
      ipAddress: meta?.ipAddress,
    });

    const aiResponse: AiResponse = {
      success: true,
      answer: finalAnswer,
      facts,
      insights,
      recommendations,
      limitations,
      confidence,
      classification: {
        category: classification.category,
        confidence: classification.confidence,
        explanation: classification.explanation,
      },
      actionsPlanned: actionsPlanned && actionsPlanned.length > 0 ? actionsPlanned : undefined,
      actionPlans: actionPlans && actionPlans.length > 0 ? actionPlans : undefined,
      conversationId: activeConversation ? activeConversation.id : undefined,
      metadata: {
        communityId,
        communityName: context.tenant.communityName,
        model: conversation.model,
        generatedAt: new Date().toISOString(),
        latencyMs,
        redactedSecretCount: totalRedactedSecrets,
        safetyPassed: outputValidation.valid,
        period: context.resolvedPeriod?.rangeType,
        rangeStart: context.resolvedPeriod?.rangeStart,
        rangeEnd: context.resolvedPeriod?.rangeEnd,
        comparisonRangeStart: context.resolvedPeriod?.previousRangeStart,
        comparisonRangeEnd: context.resolvedPeriod?.previousRangeEnd,
        timezone: context.resolvedPeriod?.timezone,
      },
      quotaSnapshot: {
        current: allowance.currentUsage + 1,
        limit: allowance.limit,
        remaining: Math.max(0, allowance.remaining - 1),
      },
    };

    // 13. RECORD CONSUMPTION IN CENTRALIZED AI USAGE SERVICE
    await AiUsageService.recordUsage({
      communityId,
      actorUserId: userContext.userId,
      actorRole: userContext.role,
      capability: 'ASK_QUERY',
      success: true,
      inputChars: validation.sanitizedPrompt.length,
      outputChars: finalAnswer.length,
      actionPlansCreated: actionPlans?.length || 0,
      conversationMessages: activeConversation ? 1 : 0,
      latencyMs,
      requestId: meta?.requestId,
    });

    // 14. PERSIST TURN IN CONVERSATION HISTORY (Task 21.5)
    if (activeConversation) {
      await AiConversationService.recordTurnInConversation(
        communityId,
        userContext,
        activeConversation.id,
        validation.sanitizedPrompt,
        aiResponse,
        classification.category
      );
    }

    return aiResponse;
    } catch (err: any) {
      AiUsageService.releaseSlot(communityId);
      const corrId = AiTelemetryService.getOrCreateCorrelationId(meta?.requestId);
      const normalized = AiTelemetryService.normalizeError(err, corrId);

      await AiUsageService.recordUsage({
        communityId,
        actorUserId: userContext?.userId,
        actorRole: userContext?.role,
        capability: 'ASK_QUERY',
        success: false,
        error: normalized.message,
        latencyMs: Date.now() - startTime,
        requestId: corrId,
      });

      await AiTelemetryService.recordEvent({
        communityId,
        actorUserId: userContext?.userId,
        actorRole: userContext?.role,
        action: 'AI_QUERY_FAILED',
        category: normalized.category,
        success: false,
        latencyMs: Date.now() - startTime,
        correlationId: corrId,
        error: normalized.message,
      });

      throw normalized;
    }
  }

  /**
   * Executes a direct contextual AI action from Insights (Explain metric, Explain change, Find causes, Identify risks, Find opportunities, Recommend actions).
   * Operates as a single unified system with Task 20 Insights Engine.
   */
  static async executeContextualAction(
    communityId: string,
    userContext: UserAuthContext,
    request: import('../../../shared/types/ai.js').AiContextualActionRequest,
    meta?: { requestId?: string; ipAddress?: string }
  ): Promise<import('../../../shared/types/ai.js').AiContextualActionResponse> {
    const startTime = Date.now();

    // 1. TENANT AUTHORIZATION
    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError(`Cross-community access denied: User cannot consult AI for tenant ${communityId}`);
    }

    const hasAnyAccess =
      hasPermission(userContext, 'reports.view') ||
      hasPermission(userContext, 'community.manage');

    if (!hasAnyAccess) {
      throw new ForbiddenError('Missing required permission to access AI Insights Integration');
    }

    // 2. CHECK ALLOWANCE
    const allowance = await AiUsageService.checkAllowance(communityId, 'ASK_QUERY', {
      userContext,
      requestId: meta?.requestId,
      ipAddress: meta?.ipAddress,
    });

    if (!allowance.allowed) {
      throw new BadRequestError(allowance.reason || 'AI request quota reached for this community.');
    }

    try {
      // 3. BUILD AUTHORITATIVE CONTEXT
      const context = await AiContextService.buildContext(communityId, {
        rangeType: request.dateRange || 'LAST_30_DAYS',
        timezone: request.timezone,
        customStart: request.customStart,
        customEnd: request.customEnd,
      });

      AiSecurityPolicyService.validateContextBoundary(context, communityId);

      let answer = '';
      let targetDeepLink = `/communities/${communityId}/insights`;
      let facts: import('../../../shared/types/ai.js').AiFact[] = [];
      let insights: import('../../../shared/types/ai.js').AiInsight[] = [];
      let recommendations: import('../../../shared/types/ai.js').AiRecommendation[] = [];

      const metricKey = request.metricKey || 'overview';
      const metricLabel = request.metricLabel || metricKey;

      switch (request.action) {
        case 'EXPLAIN_METRIC': {
          const res = AiInsightsService.explainMetric(context, metricKey, {
            metricLabel,
            currentValue: request.currentValue,
            previousValue: request.previousValue,
            delta: request.delta,
          });
          answer = res.answer;
          facts = res.facts;
          insights = res.insights;
          targetDeepLink = res.deepLink;
          break;
        }

        case 'EXPLAIN_CHANGE': {
          const res = AiInsightsService.explainChange(context, metricKey, {
            metricLabel,
            currentValue: request.currentValue,
            previousValue: request.previousValue,
            delta: request.delta,
          });
          answer = res.answer;
          facts = res.facts;
          insights = res.insights;
          targetDeepLink = res.deepLink;
          break;
        }

        case 'FIND_CAUSES': {
          const res = AiInsightsService.findLikelyCauses(context, metricKey);
          answer = res.answer;
          facts = res.facts;
          insights = AiInsightsService.generateInsights(context);
          targetDeepLink = res.deepLink;
          break;
        }

        case 'IDENTIFY_RISKS': {
          insights = AiInsightsService.identifyRisks(context);
          facts = AiInsightsService.extractFacts(context);
          const allRecs = AiRecommendationService.generateRecommendations(context, facts, insights);
          const riskRecs = allRecs.filter((r) => r.type === 'RISK' || r.type === 'BOTTLENECK');
          recommendations = riskRecs.length > 0 ? riskRecs : allRecs;
          if (insights.length > 0) {
            answer = `**Identified Operational Risks (${insights.length})**:\n${insights
              .map((r, i) => `${i + 1}. **${r.observation}**\n   *Evidence*: ${r.evidence}\n   *Risk Assessment*: ${r.opportunityOrRisk || 'Potential friction'}\n   *Recommended Mitigation*: ${r.recommendedAction || 'Review logs'}`)
              .join('\n\n')}`;
          } else {
            answer = '**Operational Health Clear**: No critical or high-severity risk signals were detected in the authoritative telemetry for this observation window.';
          }
          targetDeepLink = `/communities/${communityId}/insights?tab=health`;
          break;
        }

        case 'FIND_OPPORTUNITIES': {
          insights = AiInsightsService.findOpportunities(context);
          facts = AiInsightsService.extractFacts(context);
          if (insights.length > 0) {
            answer = `**Identified Community Opportunities (${insights.length})**:\n${insights
              .map((o, i) => `${i + 1}. **${o.observation}**\n   *Lever*: ${o.opportunityOrRisk || 'High potential engagement'}\n   *Suggested Next Step*: ${o.recommendedAction || 'Engage members'}`)
              .join('\n\n')}`;
          } else {
            answer = '**Baseline Operational Rhythm**: Community metrics are operating steadily. Opportunities will be highlighted as engagement spikes or new member cohorts arrive.';
          }
          targetDeepLink = `/communities/${communityId}/insights?tab=overview`;
          break;
        }

        case 'RECOMMEND_ACTIONS': {
          facts = AiInsightsService.extractFacts(context);
          insights = AiInsightsService.generateInsights(context);
          recommendations = AiRecommendationService.generateRecommendations(context, facts, insights);
          if (recommendations.length > 0) {
            answer = `**Prioritized Community Recommendations (${recommendations.length})**:\n${recommendations
              .map((rec, i) => `${i + 1}. **${rec.title}** [${rec.priority}]\n   *Reason*: ${rec.reason}\n   *Next Step*: ${rec.suggestedNextStep}`)
              .join('\n\n')}`;
          } else {
            answer = 'No high-priority recommendations are currently needed based on the verified telemetry.';
          }
          targetDeepLink = `/communities/${communityId}/insights?tab=overview`;
          break;
        }
      }

      const limitations = AiInsightsService.extractLimitations(context);
      const confidence = this.computeConfidence(context, facts.length);
      const latencyMs = Date.now() - startTime;

      const outputValidation = AiSecurityPolicyService.validateOutput(answer, context);
      const finalAnswer = outputValidation.sanitized;

      const response: import('../../../shared/types/ai.js').AiContextualActionResponse = {
        success: true,
        answer: finalAnswer,
        facts: AiInsightsService.validateFacts(facts),
        insights: AiInsightsService.validateInsights(insights),
        recommendations,
        limitations,
        confidence,
        contextualAction: request.action,
        targetMetric: request.metricKey,
        targetDomain: request.domain || 'ALL',
        deepLink: targetDeepLink,
        canonicalDeepLink: targetDeepLink,
        metadata: {
          communityId,
          communityName: context.tenant.communityName,
          model: 'Task 20 Insights Intelligence Engine',
          generatedAt: new Date().toISOString(),
          latencyMs,
          redactedSecretCount: outputValidation.redactedCount,
          safetyPassed: outputValidation.valid,
          period: context.resolvedPeriod?.rangeType,
          rangeStart: context.resolvedPeriod?.rangeStart,
          rangeEnd: context.resolvedPeriod?.rangeEnd,
          comparisonRangeStart: context.resolvedPeriod?.previousRangeStart,
          comparisonRangeEnd: context.resolvedPeriod?.previousRangeEnd,
          timezone: context.resolvedPeriod?.timezone,
        },
        quotaSnapshot: {
          current: allowance.currentUsage + 1,
          limit: allowance.limit,
          remaining: Math.max(0, allowance.remaining - 1),
        },
      };

      // Record Turn in Conversation if requested
      if (request.conversationId) {
        await AiConversationService.recordTurnInConversation(
          communityId,
          userContext,
          request.conversationId,
          `[Contextual Action: ${request.action}] ${metricLabel}`,
          response as any,
          'CROSS_DOMAIN'
        );
      }

      await AiUsageService.recordUsage({
        communityId,
        actorUserId: userContext.userId,
        actorRole: userContext.role,
        capability: 'ASK_QUERY',
        success: true,
        inputChars: request.action.length + (metricLabel?.length || 0),
        outputChars: finalAnswer.length,
        actionPlansCreated: 0,
        conversationMessages: request.conversationId ? 1 : 0,
        latencyMs,
        requestId: meta?.requestId,
      });

      return response;
    } catch (err: any) {
      AiUsageService.releaseSlot(communityId);
      const corrId = AiTelemetryService.getOrCreateCorrelationId(meta?.requestId);
      const normalized = AiTelemetryService.normalizeError(err, corrId);

      await AiUsageService.recordUsage({
        communityId,
        actorUserId: userContext?.userId,
        actorRole: userContext?.role,
        capability: 'ASK_QUERY',
        success: false,
        error: normalized.message,
        latencyMs: Date.now() - startTime,
        requestId: corrId,
      });

      await AiTelemetryService.recordEvent({
        communityId,
        actorUserId: userContext?.userId,
        actorRole: userContext?.role,
        action: 'AI_CONTEXTUAL_ACTION_FAILED',
        category: normalized.category,
        success: false,
        latencyMs: Date.now() - startTime,
        correlationId: corrId,
        error: normalized.message,
      });

      throw normalized;
    }
  }

  /**
   * Retrieves the factual, tenant-authorized community context directly.
   */
  static async getContext(
    communityId: string,
    userContext: UserAuthContext,
    options?: BuildContextOptions
  ): Promise<AiCommunityContext> {
    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError(`Access denied to community context for ${communityId}`);
    }
    const context = await AiContextService.buildContext(communityId, options);
    AiSecurityPolicyService.validateContextBoundary(context, communityId);
    return context;
  }

  /**
   * Retrieves evidence-grounded recommendations for community leadership.
   */
  static async getRecommendations(
    communityId: string,
    userContext: UserAuthContext
  ): Promise<AiRecommendation[]> {
    const context = await this.getContext(communityId, userContext);
    const facts = AiInsightsService.extractFacts(context);
    const insights = AiInsightsService.generateInsights(context);
    return AiRecommendationService.generateRecommendations(context, facts, insights);
  }

  /**
   * Creates a structured AiActionPlan based on a recommendation or goal.
   * Actions remain strictly DRAFT / DRY-RUN.
   */
  static async createActionPlan(
    communityId: string,
    userContext: UserAuthContext,
    params: {
      recommendationId?: string;
      goal?: string;
      issue?: string;
      module?: any;
      prompt?: string;
    }
  ): Promise<AiActionPlan> {
    const context = await this.getContext(communityId, userContext);
    let rec: AiRecommendation | undefined = undefined;
    if (params.recommendationId) {
      const recs = await this.getRecommendations(communityId, userContext);
      rec = recs.find((r) => r.id === params.recommendationId);
    }
    return AiActionPlannerService.createActionPlan(
      {
        recommendation: rec,
        goal: params.goal,
        issue: params.issue,
        module: params.module,
        prompt: params.prompt,
      },
      context
    );
  }

  /**
   * Plans candidate dry-run actions for review.
   */
  static async planActions(
    communityId: string,
    userContext: UserAuthContext,
    prompt: string
  ): Promise<AiPlannedAction[]> {
    const context = await this.getContext(communityId, userContext);
    return AiActionPlannerService.planCandidateActions(prompt, context);
  }

  /**
   * Calculates a transparent, signal-backed confidence object.
   */
  private static computeConfidence(
    context: AiCommunityContext,
    factCount: number
  ): AiConfidence {
    const totalMetricsCount = 12;
    let availableCount = 0;

    if (context.overview.totalMembers !== null) availableCount++;
    if (context.overview.netGrowth !== null) availableCount++;
    if (context.overview.estimatedActiveMembers !== null) availableCount++;
    if (context.engagement.announcementsSent !== null) availableCount++;
    if (context.engagement.deliverySuccessRate !== null) availableCount++;
    if (context.recruitment.totalApplications !== null) availableCount++;
    if (context.recruitment.conversionRate !== null) availableCount++;
    if (context.moderation.warningsIssued !== null) availableCount++;
    if (context.moderation.safetyIncidents !== null) availableCount++;
    if (context.events.upcomingEventsCount !== null) availableCount++;
    if (context.automation.activeWorkflowsCount !== null) availableCount++;
    if (context.health.healthScore !== null) availableCount++;

    const dataCompleteness = Math.round((availableCount / totalMetricsCount) * 100) / 100;
    const domainCoverage = context.dataCoverage.coverageStatus === 'COMPLETE' ? 1.0 : 0.8;
    const recency = 1.0;

    const score = Math.round((dataCompleteness * 0.5 + domainCoverage * 0.3 + recency * 0.2) * 100) / 100;
    const level = score >= 0.75 ? 'HIGH' : score >= 0.5 ? 'MEDIUM' : 'LOW';

    let rationale = `High confidence backed by ${factCount} verified telemetry metrics.`;
    if (level === 'MEDIUM') {
      rationale = `Medium confidence; partial telemetry observed (${availableCount}/${totalMetricsCount} metrics available).`;
    } else if (level === 'LOW') {
      rationale = `Lower confidence due to sparse telemetry or recent tenant initialization.`;
    }

    return {
      score,
      level,
      rationale,
      factors: {
        dataCompleteness,
        domainCoverage,
        recency,
      },
    };
  }
}
