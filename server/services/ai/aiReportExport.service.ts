import {
  AiReportData,
  AiReportExportRequest,
  AiReportExportResult,
  AiReportFormat,
  AiReportGenerationState,
  AiReportMetadata,
  AiReportTraceability,
  AiFact,
  AiInsight,
  AiRecommendation,
  AiLimitation,
  AiCommunityContext,
} from '../../../shared/types/ai.js';
import type { UserAuthContext } from '../../../shared/types/rbac.js';
import { canAccessTenant, hasPermission } from '../../security/rbac.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../utils/errors.js';
import { communitiesRepository } from '../../repositories/index.js';
import { auditService } from '../audit.service.js';
import { AiReportPdfGenerator } from './aiReportPdf.js';
import { AiSecurityPolicyService } from './aiSecurityPolicy.service.js';
import { AiUsageService } from './aiUsage.service.js';
import { AiConversationService } from './aiConversation.service.js';
import { AiCommunityManagerService } from './aiCommunityManager.service.js';
import { AiContextService } from './aiContext.service.js';
import { DateRangeType } from '../../../shared/types/insights.js';

export class AiReportExportService {
  /**
   * Generates a fully audited, tenant-isolated AI report in PDF, CSV, or JSON format.
   */
  static async exportReport(
    communityId: string,
    userContext: UserAuthContext,
    request: AiReportExportRequest,
    meta?: { requestId?: string; ipAddress?: string }
  ): Promise<AiReportExportResult> {
    if (!communityId) {
      throw new BadRequestError('Community ID is required');
    }

    if (!userContext || !userContext.userId) {
      throw new UnauthorizedError('Authentication is required to export AI reports');
    }

    // 1. Tenant Isolation
    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError('Tenant isolation: Access denied to community telemetry');
    }

    // 2. RBAC Enforcement
    const isAuthorized =
      hasPermission(userContext, 'reports.view') ||
      hasPermission(userContext, 'community.manage') ||
      userContext.role === 'OWNER';

    if (!isAuthorized) {
      throw new ForbiddenError('Permission required: user lacks reports.view entitlement');
    }

    // 3. Verify Community & Entitlement
    const community = await communitiesRepository.getById(communityId);
    if (!community) {
      throw new NotFoundError(`Community ${communityId} not found`);
    }


    if ((community as any).settings?.aiAnalysisEnabled === false) {
      return this.buildFeatureNotEnabledResult(communityId, community.name || 'Community', request, userContext);
    }


    // 4. Enforce Quota & Usage Controls
    const quotaCheck = await AiUsageService.checkAllowance(communityId, 'AI_REPORT_EXPORT', {
      userContext,
      requestId: meta?.requestId,
      ipAddress: meta?.ipAddress,
    });
    if (!quotaCheck.allowed) {
      throw new ForbiddenError(`AI Export limit reached: ${quotaCheck.reason || 'Quota exceeded'}`);
    }

    // Record usage
    await AiUsageService.recordUsage({
      communityId,
      actorUserId: userContext.userId,
      actorRole: userContext.role,
      capability: 'AI_REPORT_EXPORT',
      success: true,
      inputTokensEstimated: 50,
      outputTokensEstimated: 250,
      requestId: meta?.requestId,
    });

    // 5. Build Report Payload
    const reportData = await this.buildReportData(communityId, community.name || 'Community', userContext, request);

    // 6. Format Rendering (PDF, CSV, JSON)
    const format = (request.format || 'json').toLowerCase() as AiReportFormat;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeDomain = (request.domain || request.sourceType || 'intelligence').toLowerCase();
    const filename = `ai-report-${safeDomain}-${timestamp}.${format}`;

    let content: string | Buffer;
    let contentType: string;

    if (format === 'pdf') {
      const pdfGenerator = new AiReportPdfGenerator();
      content = pdfGenerator.generate(reportData);
      contentType = 'application/pdf';
    } else if (format === 'csv') {
      content = this.generateCsv(reportData);
      contentType = 'text/csv';
    } else {
      content = this.generateJson(reportData);
      contentType = 'application/json';
    }

    // 7. Authoritative Audit Logging
    await auditService.record({
      communityId,
      actorUserId: userContext.userId,
      actorRole: userContext.role,
      action: 'AI_REPORT_EXPORTED',
      targetType: 'AI_REPORT',
      targetId: reportData.reportId,
      metadata: {
        format,
        sourceType: request.sourceType,
        sourceId: request.conversationId || request.recommendationId || request.domain,
        generationState: reportData.generationState,
        observationPeriod: reportData.metadata.observationPeriod,
        dataCoverage: reportData.metadata.traceability.dataCoverage,
        factsCount: reportData.facts.length,
        insightsCount: reportData.insights.length,
        recommendationsCount: reportData.recommendations.length,
        redactedSecretCount: reportData.metadata.redactedSecretCount,
        filename,
      },
      ipAddressIfAvailable: meta?.ipAddress,
      requestId: meta?.requestId,
    });

    return {
      reportId: reportData.reportId,
      filename,
      contentType,
      content,
      generationState: reportData.generationState,
      metadata: reportData.metadata,
    };
  }

  /**
   * Constructs the structured, verified report data object with strict secret redaction and traceability.
   */
  private static async buildReportData(
    communityId: string,
    communityName: string,
    userContext: UserAuthContext,
    request: AiReportExportRequest
  ): Promise<AiReportData> {
    const reportId = `rep_${communityId}_${Date.now()}`;
    const generatedAt = new Date().toISOString();

    let title = request.title || 'Community Manager Intelligence Report';
    let analysisQuestion = request.question;
    let summaryAnswer: string | undefined;
    let facts: AiFact[] = [];
    let insights: AiInsight[] = [];
    let recommendations: AiRecommendation[] = [];
    let dataLimitations: AiLimitation[] | string[] = [];
    let conversationMessages: Array<{ role: 'user' | 'assistant' | 'system'; content: string; timestamp: string }> | undefined;
    let observationPeriod = 'Last 30 Days';
    let comparisonPeriod = 'Prior 30-Day Window';
    let rangeStart: string | undefined;
    let rangeEnd: string | undefined;
    let comparisonRangeStart: string | undefined;
    let comparisonRangeEnd: string | undefined;
    let dataCoverage = 'FULL';
    let confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW' = 'HIGH';
    let isPartialData = false;

    // Load context for baseline telemetry
    let context: AiCommunityContext | null = null;
    try {
      context = await AiContextService.buildContext(communityId, {
        rangeType: request.dateRange || 'LAST_30_DAYS',
        customStart: request.customStart,
        customEnd: request.customEnd,
      });

      if (context.resolvedPeriod) {

        observationPeriod = `${context.resolvedPeriod.rangeStart} to ${context.resolvedPeriod.rangeEnd} (${context.resolvedPeriod.rangeType})`;
        comparisonPeriod = `${context.resolvedPeriod.previousRangeStart} to ${context.resolvedPeriod.previousRangeEnd}`;
        rangeStart = context.resolvedPeriod.rangeStart;
        rangeEnd = context.resolvedPeriod.rangeEnd;
        comparisonRangeStart = context.resolvedPeriod.previousRangeStart;
        comparisonRangeEnd = context.resolvedPeriod.previousRangeEnd;
      }
      dataCoverage = context.dataCoverage?.coverageStatus || 'FULL';
      isPartialData = dataCoverage === 'PARTIAL' || dataCoverage === 'LOW';
      if (context.limitations) {
        dataLimitations = context.limitations;
      }
    } catch {
      // Context build fallback
      isPartialData = true;
      dataCoverage = 'PARTIAL';
    }

    // Source 1: Conversation
    if (request.sourceType === 'CONVERSATION' && request.conversationId) {
      const conv = await AiConversationService.getConversation(communityId, userContext, request.conversationId);
      title = `AI Conversation: ${conv.title || 'Community Inquiries'}`;
      conversationMessages = conv.messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }));

      // Find last assistant message to pull structured facts/insights/recommendations
      const lastAssistantMsg = [...conv.messages].reverse().find((m) => m.role === 'assistant');
      if (lastAssistantMsg) {
        summaryAnswer = lastAssistantMsg.content;
        if (lastAssistantMsg.facts && lastAssistantMsg.facts.length > 0) {
          facts = lastAssistantMsg.facts;
        }
        if (lastAssistantMsg.insights && lastAssistantMsg.insights.length > 0) {
          insights = lastAssistantMsg.insights;
        }
        if (lastAssistantMsg.recommendations && lastAssistantMsg.recommendations.length > 0) {
          recommendations = lastAssistantMsg.recommendations;
        }
        if (lastAssistantMsg.confidence) {
          confidenceLevel = lastAssistantMsg.confidence.level;
        }
      }

      const firstUserMsg = conv.messages.find((m) => m.role === 'user');
      if (firstUserMsg && !analysisQuestion) {
        analysisQuestion = firstUserMsg.content;
      }
    }
    // Source 2: Insight Analysis
    else if (request.sourceType === 'INSIGHT_ANALYSIS' && request.contextualActionRequest) {
      const actRes = await AiCommunityManagerService.executeContextualAction(
        communityId,
        userContext,
        request.contextualActionRequest
      );
      title = `Insight Deep-Dive: ${request.contextualActionRequest.metricLabel || request.contextualActionRequest.action}`;
      analysisQuestion = `Contextual Analysis on ${request.contextualActionRequest.metricLabel || request.contextualActionRequest.metricKey || 'community metric'} (${request.contextualActionRequest.action})`;
      summaryAnswer = actRes.answer;
      facts = actRes.facts || [];
      insights = actRes.insights || [];
      recommendations = actRes.recommendations || [];
      if (actRes.limitations) {
        dataLimitations = actRes.limitations;
      }
      if (actRes.confidence) {
        confidenceLevel = actRes.confidence.level;
      }
    }
    // Source 3: Recommendation Analysis / Action Plan
    else if (request.sourceType === 'RECOMMENDATION_ANALYSIS' || request.sourceType === 'ACTION_PLAN') {
      const recRes = await AiCommunityManagerService.getRecommendations(communityId, userContext);
      title = 'Prioritized Strategic Recommendations';
      analysisQuestion = 'Generate prioritized next actions grounded in community telemetry';
      summaryAnswer = 'Comprehensive evaluation of community health signals, bottlenecks, and growth opportunities.';
      recommendations = recRes || [];
      if (context) {
        facts = this.extractFactsFromContext(context);
        insights = recommendations.map((r, i) => ({
          id: `ins_rec_${i}`,
          category: r.affectedModule as any,
          observation: r.title,
          evidence: r.supportingFacts.join('; '),
          evidenceType: 'VERIFIED_FACT',
          whyItLikelyHappened: r.rationale,
          opportunityOrRisk: r.type,
          recommendedAction: r.suggestedNextStep,
          severity: r.priority === 'CRITICAL' ? 'CRITICAL' : r.priority === 'HIGH' ? 'HIGH' : 'MEDIUM',
        }));
      }
    }
    // Source 4: Pre-computed response payload
    else if (request.aiResponse) {
      summaryAnswer = request.aiResponse.answer;
      facts = request.aiResponse.facts || [];
      insights = request.aiResponse.insights || [];
      recommendations = request.aiResponse.recommendations || [];
      if (request.aiResponse.limitations) {
        dataLimitations = request.aiResponse.limitations;
      }
      if (request.aiResponse.confidence) {
        confidenceLevel = request.aiResponse.confidence.level;
      }
      if (request.aiResponse.metadata?.period) {
        observationPeriod = request.aiResponse.metadata.period;
      }
    }

    // If facts are still empty but context exists, populate facts from context
    if (facts.length === 0 && context) {
      facts = this.extractFactsFromContext(context);
    }

    // Determine generation state
    let generationState: AiReportGenerationState = 'COMPLETED';
    let stateExplanation: string | undefined;

    if (facts.length === 0 && insights.length === 0 && !summaryAnswer) {
      generationState = 'INSUFFICIENT_DATA';
      stateExplanation = 'No community telemetry records available in the specified observation window.';
    }

    const traceability: AiReportTraceability = {
      metric: request.contextualActionRequest?.metricKey || request.domain,
      domain: request.domain || request.contextualActionRequest?.domain,
      dateRange: request.dateRange || 'LAST_30_DAYS',
      rangeStart,
      rangeEnd,
      comparisonPeriod,
      comparisonRangeStart,
      comparisonRangeEnd,
      confidence: confidenceLevel,
      dataCoverage,
      calculationScope: 'TENANT_EXACT_TELEMETRY',
      model: 'gemini-2.5-flash',
    };

    const metadata: AiReportMetadata = {
      communityId,
      communityName,
      observationPeriod,
      rangeStart,
      rangeEnd,
      comparisonPeriod,
      comparisonRangeStart,
      comparisonRangeEnd,
      dataScope: `Community ${communityName} (${communityId}) authoritative records`,
      generatedAt,
      generatedByUserId: userContext.userId,
      generatedByRole: userContext.role,
      sourceType: request.sourceType,
      sourceId: request.conversationId || request.recommendationId || request.domain,
      traceability,
      redactedSecretCount: 0,
      isPartialData,
    };

    const reportRaw: AiReportData = {
      reportId,
      title,
      analysisQuestion,
      summaryAnswer,
      metadata,
      facts,
      insights,
      recommendations,
      conversationMessages,
      dataLimitations,
      generationState,
      stateExplanation,
    };

    // Strict recursive secret sanitization
    const redaction = AiSecurityPolicyService.redactSecrets(reportRaw);
    redaction.sanitized.metadata.redactedSecretCount = redaction.redactedCount;

    return redaction.sanitized;
  }

  /**
   * Helper to extract real verified facts from an AiCommunityContext without simulation.
   */
  private static extractFactsFromContext(context: AiCommunityContext): AiFact[] {
    const facts: AiFact[] = [];

    if (context.overview.totalMembers !== null && context.overview.totalMembers !== undefined) {
      facts.push({
        id: 'fact_total_members',
        category: 'COMMUNITY',
        metric: 'Total Server Members',
        value: context.overview.totalMembers,
        source: 'Discord Member Directory',
        confidence: 'HIGH',
      });
    }

    if (context.overview.newMembers !== null && context.overview.newMembers !== undefined) {
      facts.push({
        id: 'fact_new_members',
        category: 'GROWTH',
        metric: 'New Members Joined',
        value: context.overview.newMembers,
        source: 'Growth Telemetry',
        confidence: 'HIGH',
      });
    }

    if (context.recruitment.totalApplications !== null && context.recruitment.totalApplications !== undefined) {
      facts.push({
        id: 'fact_applications',
        category: 'RECRUITMENT',
        metric: 'Total Applications',
        value: context.recruitment.totalApplications,
        source: 'Recruitment Workflow Database',
        confidence: 'HIGH',
      });
    }

    if (context.engagement.announcementsSent !== null && context.engagement.announcementsSent !== undefined) {
      facts.push({
        id: 'fact_announcements',
        category: 'ENGAGEMENT',
        metric: 'Announcements Delivered',
        value: context.engagement.announcementsSent,
        source: 'Engagement Delivery Logs',
        confidence: 'HIGH',
      });
    }

    if (context.moderation.warningsIssued !== null && context.moderation.warningsIssued !== undefined) {
      facts.push({
        id: 'fact_warnings',
        category: 'MODERATION',
        metric: 'Moderation Warnings Issued',
        value: context.moderation.warningsIssued,
        source: 'Moderation Audit Logs',
        confidence: 'HIGH',
      });
    }

    if (context.health.healthScore !== null && context.health.healthScore !== undefined) {
      facts.push({
        id: 'fact_health_score',
        category: 'HEALTH',
        metric: 'Community Health Score',
        value: `${context.health.healthScore}/100 (${context.health.healthLevel || 'Good'})`,
        source: 'Authoritative Health Calculator',
        confidence: 'HIGH',
      });
    }

    return facts;
  }

  /**
   * Generates a clean, professional CSV representation of the report.
   */
  private static generateCsv(report: AiReportData): string {
    const lines: string[] = [];

    // Header metadata lines
    lines.push('# COMMUNITY MANAGER INTELLIGENCE REPORT');
    lines.push(`# Report ID: ${report.reportId}`);
    lines.push(`# Community: ${report.metadata.communityName} (${report.metadata.communityId})`);
    lines.push(`# Generated At: ${report.metadata.generatedAt}`);
    lines.push(`# Observation Window: ${report.metadata.observationPeriod}`);
    lines.push(`# Comparison Window: ${report.metadata.comparisonPeriod || 'N/A'}`);
    lines.push(`# Data Coverage: ${report.metadata.traceability.dataCoverage || 'FULL'}`);
    lines.push(`# Status: ${report.generationState}`);
    lines.push('');

    // Question / Objective
    if (report.analysisQuestion) {
      lines.push('# INQUIRY / OBJECTIVE');
      lines.push(`"${report.analysisQuestion.replace(/"/g, '""')}"`);
      lines.push('');
    }

    // Summary Answer
    if (report.summaryAnswer) {
      lines.push('# SYNTHESIS & FINDINGS');
      lines.push(`"${report.summaryAnswer.replace(/"/g, '""')}"`);
      lines.push('');
    }

    // Table 1: Verified Facts
    lines.push('# SECTION: VERIFIED TELEMETRY FACTS');
    lines.push('Category,Metric,Current Value,Previous Value,Delta,Source,Confidence,Data Coverage');
    for (const fact of report.facts) {
      const cat = `"${(fact.category || '').replace(/"/g, '""')}"`;
      const met = `"${(fact.metric || '').replace(/"/g, '""')}"`;
      const val = `"${String(fact.value ?? '').replace(/"/g, '""')}"`;
      const prev = `"${String(fact.previousValue ?? '').replace(/"/g, '""')}"`;
      const delta = `"${String(fact.delta ?? '').replace(/"/g, '""')}"`;
      const src = `"${(fact.source || '').replace(/"/g, '""')}"`;
      const conf = `"${(fact.confidence || 'HIGH').replace(/"/g, '""')}"`;
      const cov = `"${(fact.dataCoverage || report.metadata.traceability.dataCoverage || 'FULL').replace(/"/g, '""')}"`;
      lines.push(`${cat},${met},${val},${prev},${delta},${src},${conf},${cov}`);
    }
    lines.push('');

    // Table 2: Supporting Insights
    lines.push('# SECTION: SUPPORTING INSIGHTS & CORRELATIONS');
    lines.push('Category,Evidence Type,Observation,Evidence,Likely Cause,Strategic Flag,Severity');
    for (const ins of report.insights) {
      const cat = `"${(ins.category || '').replace(/"/g, '""')}"`;
      const evType = `"${(ins.evidenceType || 'VERIFIED_FACT').replace(/"/g, '""')}"`;
      const obs = `"${(ins.observation || '').replace(/"/g, '""')}"`;
      const ev = `"${(ins.evidence || '').replace(/"/g, '""')}"`;
      const why = `"${(ins.whyItLikelyHappened || '').replace(/"/g, '""')}"`;
      const flag = `"${(ins.opportunityOrRisk || '').replace(/"/g, '""')}"`;
      const sev = `"${(ins.severity || 'INFO').replace(/"/g, '""')}"`;
      lines.push(`${cat},${evType},${obs},${ev},${why},${flag},${sev}`);
    }
    lines.push('');

    // Table 3: Recommendations
    lines.push('# SECTION: PRIORITIZED RECOMMENDATIONS');
    lines.push('Priority,Affected Module,Title,Rationale,Suggested Next Step,Confidence');
    for (const rec of report.recommendations) {
      const prio = `"${(rec.priority || 'MEDIUM').replace(/"/g, '""')}"`;
      const mod = `"${(rec.affectedModule || '').replace(/"/g, '""')}"`;
      const title = `"${(rec.title || '').replace(/"/g, '""')}"`;
      const rat = `"${(rec.rationale || rec.reason || '').replace(/"/g, '""')}"`;
      const next = `"${(rec.suggestedNextStep || '').replace(/"/g, '""')}"`;
      const conf = `"${(rec.confidence || 'HIGH').replace(/"/g, '""')}"`;
      lines.push(`${prio},${mod},${title},${rat},${next},${conf}`);
    }
    lines.push('');

    // Table 4: Limitations
    lines.push('# SECTION: DATA LIMITATIONS & PROHIBITIONS');
    lines.push('Item');
    const lims = report.dataLimitations || [];
    for (const l of lims) {
      const text = typeof l === 'string' ? l : `${l.topic}: ${l.reason}`;
      lines.push(`"${text.replace(/"/g, '""')}"`);
    }
    lines.push('"Discord tokens, OAuth credentials, and system prompts are strictly excluded from exports."');

    return lines.join('\n');
  }

  /**
   * Generates sanitized JSON output.
   */
  private static generateJson(report: AiReportData): string {
    return JSON.stringify(report, null, 2);
  }

  private static buildFeatureNotEnabledResult(
    communityId: string,
    communityName: string,
    request: AiReportExportRequest,
    userContext: UserAuthContext
  ): AiReportExportResult {
    const reportId = `rep_${communityId}_disabled`;
    const format = request.format || 'json';
    const metadata: AiReportMetadata = {
      communityId,
      communityName,
      observationPeriod: 'N/A',
      dataScope: 'FEATURE_DISABLED',
      generatedAt: new Date().toISOString(),
      generatedByUserId: userContext.userId,
      generatedByRole: userContext.role,
      sourceType: request.sourceType,
      traceability: {
        confidence: 'LOW',
        dataCoverage: 'NONE',
      },
      redactedSecretCount: 0,
    };

    const emptyReport: AiReportData = {
      reportId,
      title: 'AI Export Feature Disabled',
      metadata,
      facts: [],
      insights: [],
      recommendations: [],
      dataLimitations: ['AI analysis features are currently disabled in Community Settings.'],
      generationState: 'FEATURE_NOT_ENABLED',
      stateExplanation: 'AI Analysis is disabled in Community Settings.',
    };

    let content: string | Buffer;
    let contentType = 'application/json';

    if (format === 'pdf') {
      content = new AiReportPdfGenerator().generate(emptyReport);
      contentType = 'application/pdf';
    } else if (format === 'csv') {
      content = this.generateCsv(emptyReport);
      contentType = 'text/csv';
    } else {
      content = this.generateJson(emptyReport);
    }

    return {
      reportId,
      filename: `ai-report-disabled.${format}`,
      contentType,
      content,
      generationState: 'FEATURE_NOT_ENABLED',
      metadata,
    };
  }
}
