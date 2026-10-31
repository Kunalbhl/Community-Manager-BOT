import { AIEngine } from './aiEngine.js';
import { config } from '../../config/env.js';
import { logger } from '../../logging/logger.js';
import {
  AiCommunityContext,
  AiQuestionCategory,
  AiConversationDocument,
  AiConversationMessage,
  AiResponse,
} from '../../../shared/types/ai.js';
import type { UserAuthContext } from '../../../shared/types/rbac.js';
import { canAccessTenant, hasPermission } from '../../security/rbac.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../utils/errors.js';
import { aiConversationsRepository } from '../../repositories/index.js';
import { AiPromptPolicyService } from './aiPromptPolicy.service.js';
import { AiSafetyService } from './aiSafety.service.js';
import { AiUsageService } from './aiUsage.service.js';

export interface ConversationResult {
  answer: string;
  model: string;
  isFallback: boolean;
  redactedSecretCount: number;
}

export class AiConversationService {
  private static readonly MAX_STORED_MESSAGES = 50;
  private static readonly MAX_TITLE_LENGTH = 80;

  /**
   * Generates a fact-grounded response via Community Brain AI Engine or falls back gracefully to a rule-based factual synthesizer.
   * Supports conversational memory and previous context continuity.
   */
  static async generateAnswer(
    userPrompt: string,
    context: AiCommunityContext,
    category?: AiQuestionCategory,
    conversationMemory?: {
      summary?: string;
      recentTurns?: Array<{ role: string; content: string }>;
      relevantInsights?: string[];
    }
  ): Promise<ConversationResult> {
    const provider = AIEngine.getActiveProvider();
    const systemInstruction = AiPromptPolicyService.buildSystemInstructions(context, category);
    const fullPrompt = AiPromptPolicyService.buildPrompt(
      userPrompt,
      context,
      category,
      conversationMemory
    );

    if (provider && provider.isConfigured()) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Community Brain request timed out (4000ms)')), 4000)
        );

        const genPromise = provider.generateText(fullPrompt, {
          systemInstruction,
          temperature: 0.2,
          maxTokens: config.MAX_AI_TOKENS_PER_REQUEST || 2048,
        });

        const result = await Promise.race([genPromise, timeoutPromise]);
        const { sanitized, redactedCount } = AiSafetyService.sanitizeOutput(result.text || '');

        if (sanitized.trim().length > 0) {
          return {
            answer: sanitized.trim(),
            model: 'community-brain-v1',
            isFallback: false,
            redactedSecretCount: redactedCount,
          };
        }
      } catch (err: any) {
        logger.warn(
          `[AiConversationService] Community Brain Engine call failed, activating factual fallback: ${err?.message || err}`
        );
      }
    }

    // High-quality deterministic factual fallback synthesizer
    const fallbackAnswer = this.buildFactualFallback(userPrompt, context, category);
    const { sanitized, redactedCount } = AiSafetyService.sanitizeOutput(fallbackAnswer);

    return {
      answer: sanitized,
      model: 'rule-based-factual-synthesizer',
      isFallback: true,
      redactedSecretCount: redactedCount,
    };
  }

  /**
   * Creates a new conversation with strict tenant boundary and authenticated user association.
   */
  static async createConversation(
    communityId: string,
    userContext: UserAuthContext,
    data?: { title?: string; initialPrompt?: string }
  ): Promise<AiConversationDocument> {
    if (!userContext || !userContext.userId) {
      throw new UnauthorizedError('Authentication required to create conversation');
    }

    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError(
        `Cross-community access denied: User cannot create conversation in tenant ${communityId}`
      );
    }

    const hasViewOrManage =
      hasPermission(userContext, 'reports.view') || hasPermission(userContext, 'community.manage');
    if (!hasViewOrManage) {
      throw new ForbiddenError('Missing required permission to manage AI conversations');
    }

    const entitlement = await AiUsageService.checkEntitlement(communityId);
    if (!entitlement.allowed) {
      throw new ForbiddenError(entitlement.reason || 'AI Assistant not entitled for this community');
    }

    let initialTitle = 'New Conversation';
    if (data?.title && typeof data.title === 'string' && data.title.trim()) {
      const sanitized = AiSafetyService.redactSecrets(data.title.trim()).sanitized;
      initialTitle = sanitized.substring(0, this.MAX_TITLE_LENGTH);
    } else if (data?.initialPrompt && typeof data.initialPrompt === 'string' && data.initialPrompt.trim()) {
      const sanitized = AiSafetyService.redactSecrets(data.initialPrompt.trim()).sanitized;
      initialTitle = sanitized.length > 50 ? `${sanitized.substring(0, 47)}...` : sanitized;
    }

    const now = new Date().toISOString();
    const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const newConversation: AiConversationDocument = {
      id: conversationId,
      communityId,
      userId: userContext.userId, // Strictly server-side bound authenticated userId
      title: initialTitle,
      messages: [],
      contextSummary: '',
      summaryData: {
        summary: '',
        keyTopics: [],
        updatedAt: now,
      },
      relevantInsights: [],
      metadata: {
        totalMessages: 0,
        lastMessageAt: now,
      },
      createdAt: now,
      updatedAt: now,
    };

    await aiConversationsRepository.create(newConversation);
    return newConversation;
  }

  /**
   * Lists conversations for the current community with strict tenant isolation and user filtering.
   */
  static async listConversations(
    communityId: string,
    userContext: UserAuthContext,
    options?: { limit?: number; offset?: number }
  ): Promise<AiConversationDocument[]> {
    if (!userContext || !userContext.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError(`Cross-community access denied for tenant ${communityId}`);
    }

    const hasViewOrManage =
      hasPermission(userContext, 'reports.view') || hasPermission(userContext, 'community.manage');
    if (!hasViewOrManage) {
      throw new ForbiddenError('Missing required permission to view AI conversations');
    }

    const allConversations = await aiConversationsRepository.listForTenant(communityId);

    // Filter by ownership: regular users only list their own conversations; managers can list all in tenant
    const isManager =
      hasPermission(userContext, 'community.manage') ||
      userContext.role === 'OWNER' ||
      userContext.role === 'PLATFORM_OWNER';
    const userConversations = isManager
      ? allConversations
      : allConversations.filter((c) => c.userId === userContext.userId);

    // Sort descending by updatedAt
    const sorted = userConversations.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    return sorted.slice(offset, offset + limit);
  }

  /**
   * Retrieves a single conversation by ID with server-side ownership and tenant validation.
   */
  static async getConversation(
    communityId: string,
    userContext: UserAuthContext,
    conversationId: string
  ): Promise<AiConversationDocument> {
    if (!userContext || !userContext.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError(`Cross-community access denied for tenant ${communityId}`);
    }

    const conversation = await aiConversationsRepository.getById(conversationId);
    if (!conversation) {
      throw new NotFoundError(`Conversation with ID ${conversationId} not found`);
    }

    // Strict Tenant Isolation check
    if (conversation.communityId !== communityId) {
      throw new ForbiddenError(`Cross-community access denied: Conversation belongs to a different community`);
    }

    // Server-Side Ownership Enforcement
    const isManager =
      hasPermission(userContext, 'community.manage') ||
      userContext.role === 'OWNER' ||
      userContext.role === 'PLATFORM_OWNER';
    if (conversation.userId !== userContext.userId && !isManager) {
      throw new ForbiddenError(`Access denied: You do not own this conversation`);
    }

    return conversation;
  }

  /**
   * Renames a conversation.
   */
  static async renameConversation(
    communityId: string,
    userContext: UserAuthContext,
    conversationId: string,
    newTitle: string
  ): Promise<AiConversationDocument> {
    if (!newTitle || typeof newTitle !== 'string' || !newTitle.trim()) {
      throw new BadRequestError('Title is required and must be non-empty');
    }

    const conversation = await this.getConversation(communityId, userContext, conversationId);

    const sanitizedTitle = AiSafetyService.redactSecrets(newTitle.trim()).sanitized.substring(
      0,
      this.MAX_TITLE_LENGTH
    );
    conversation.title = sanitizedTitle;
    conversation.updatedAt = new Date().toISOString();

    await aiConversationsRepository.update(conversationId, conversation);
    return conversation;
  }

  /**
   * Deletes a conversation.
   */
  static async deleteConversation(
    communityId: string,
    userContext: UserAuthContext,
    conversationId: string
  ): Promise<{ success: boolean; conversationId: string }> {
    // Validates existence, tenant isolation, and ownership
    await this.getConversation(communityId, userContext, conversationId);

    await aiConversationsRepository.delete(conversationId);
    return { success: true, conversationId };
  }

  /**
   * Clears context and message history for an existing conversation.
   */
  static async clearConversationContext(
    communityId: string,
    userContext: UserAuthContext,
    conversationId: string
  ): Promise<AiConversationDocument> {
    const conversation = await this.getConversation(communityId, userContext, conversationId);

    const now = new Date().toISOString();
    conversation.messages = [];
    conversation.contextSummary = '';
    conversation.summaryData = {
      summary: '',
      keyTopics: [],
      updatedAt: now,
    };
    conversation.relevantInsights = [];
    conversation.metadata = {
      totalMessages: 0,
      lastMessageAt: now,
    };
    conversation.updatedAt = now;

    await aiConversationsRepository.update(conversationId, conversation);
    return conversation;
  }

  /**
   * Records a user question and AI response into the conversation history with context trimming & memory summarization.
   */
  static async recordTurnInConversation(
    communityId: string,
    userContext: UserAuthContext,
    conversationId: string,
    userPrompt: string,
    aiResponse: AiResponse,
    category?: AiQuestionCategory
  ): Promise<AiConversationDocument> {
    const conversation = await this.getConversation(communityId, userContext, conversationId);

    const now = new Date().toISOString();
    const sanitizedUserPrompt = AiSafetyService.redactSecrets(userPrompt).sanitized;
    const sanitizedAnswer = AiSafetyService.redactSecrets(aiResponse.answer).sanitized;

    const userMessage: AiConversationMessage = {
      id: `msg_${Date.now()}_user_${Math.random().toString(36).substring(2, 6)}`,
      role: 'user',
      content: sanitizedUserPrompt,
      timestamp: now,
      category,
    };

    const assistantMessage: AiConversationMessage = {
      id: `msg_${Date.now()}_assistant_${Math.random().toString(36).substring(2, 6)}`,
      role: 'assistant',
      content: sanitizedAnswer,
      timestamp: now,
      model: aiResponse.metadata.model,
      category: aiResponse.classification?.category || category,
      facts: aiResponse.facts,
      insights: aiResponse.insights,
      recommendations: aiResponse.recommendations,
      actionsPlanned: aiResponse.actionsPlanned,
      actionPlans: aiResponse.actionPlans,
      confidence: aiResponse.confidence,
      redactedSecretCount: aiResponse.metadata.redactedSecretCount || 0,
    };

    // Auto-update default title if title is "New Conversation" or generic
    if (!conversation.title || conversation.title === 'New Conversation') {
      const cleanSnippet = sanitizedUserPrompt.replace(/[^\w\s-]/g, '').trim();
      conversation.title =
        cleanSnippet.length > 45
          ? `${cleanSnippet.substring(0, 42)}...`
          : cleanSnippet || 'AI Consultation';
    }

    conversation.messages.push(userMessage, assistantMessage);

    // Context Management: Trimming & Memory Summarization
    this.trimAndSummarize(conversation, aiResponse);

    conversation.updatedAt = now;
    if (!conversation.metadata) {
      conversation.metadata = { totalMessages: conversation.messages.length, lastMessageAt: now };
    } else {
      conversation.metadata.totalMessages = conversation.messages.length;
      conversation.metadata.lastMessageAt = now;
      conversation.metadata.model = aiResponse.metadata.model;
    }

    await aiConversationsRepository.update(conversationId, conversation);
    return conversation;
  }

  /**
   * Trims message buffer when exceeding configured limits and builds rolling memory summary & insights.
   */
  private static trimAndSummarize(
    conversation: AiConversationDocument,
    latestResponse?: AiResponse
  ) {
    // 1. Accumulate relevant insights
    if (latestResponse?.insights && latestResponse.insights.length > 0) {
      if (!conversation.relevantInsights) {
        conversation.relevantInsights = [];
      }
      for (const ins of latestResponse.insights) {
        const text = ins.observation || ins.whatHappened || '';
        const sanitized = AiSafetyService.redactSecrets(text).sanitized;
        if (sanitized && !conversation.relevantInsights.includes(sanitized)) {
          conversation.relevantInsights.push(sanitized);
        }
      }
      // Cap at 10 high-value insights
      if (conversation.relevantInsights.length > 10) {
        conversation.relevantInsights = conversation.relevantInsights.slice(-10);
      }
    }

    // 2. Manage message limits and rolling summary
    const totalMsgs = conversation.messages.length;
    if (totalMsgs > this.MAX_STORED_MESSAGES) {
      // Retain the newest MAX_STORED_MESSAGES
      const overflowCount = totalMsgs - this.MAX_STORED_MESSAGES;
      const trimmed = conversation.messages.splice(0, overflowCount);

      // Extract topics and summary from trimmed messages
      const trimmedSummaries = trimmed
        .filter((m) => m.role === 'user')
        .map((m) => m.content.substring(0, 80));

      const newSummaryPart = `Prior inquiries addressed: ${trimmedSummaries.join('; ')}.`;
      if (conversation.contextSummary) {
        conversation.contextSummary = `${conversation.contextSummary} | ${newSummaryPart}`.substring(
          0,
          1000
        );
      } else {
        conversation.contextSummary = newSummaryPart;
      }

      if (!conversation.summaryData) {
        conversation.summaryData = {
          summary: conversation.contextSummary,
          keyTopics: trimmedSummaries.slice(0, 5),
          updatedAt: new Date().toISOString(),
        };
      } else {
        conversation.summaryData.summary = conversation.contextSummary;
        conversation.summaryData.updatedAt = new Date().toISOString();
      }
    } else if (totalMsgs >= 4) {
      // Build lightweight rolling summary for active multi-turn context
      const userQuestions = conversation.messages
        .filter((m) => m.role === 'user')
        .map((m) => m.content.substring(0, 60));
      conversation.contextSummary = `Active topics: ${userQuestions.join(' -> ')}`.substring(
        0,
        500
      );
      if (conversation.summaryData) {
        conversation.summaryData.summary = conversation.contextSummary;
        conversation.summaryData.updatedAt = new Date().toISOString();
      }
    }
  }


  /**
   * Generates a comprehensive, fact-grounded fallback response directly from verified context.
   * Adheres strictly to the analytical framework:
   * - What Happened
   * - What Changed
   * - Why It Likely Happened
   * - Where the Biggest Opportunity / Risk Exists
   * - What Action Should Be Considered
   */
  private static buildFactualFallback(
    prompt: string,
    context: AiCommunityContext,
    category?: AiQuestionCategory
  ): string {
    const p = prompt.toLowerCase();
    const name = context.tenant.communityName;
    const comp = context.metricComparisons || {};
    const period = context.resolvedPeriod?.rangeType || 'LAST_30_DAYS';

    // Helper formatting
    const formatDelta = (d: number | string | null | undefined, suffix = '') => {
      if (d === null || d === undefined) return 'No comparison baseline';
      const num = Number(d);
      return `${num >= 0 ? '+' : ''}${num}${suffix}`;
    };

    // 1. HEALTH INQUIRY
    if (category === 'HEALTH' || p.includes('how is my community doing') || p.includes('vital signs')) {
      const score = context.health.healthScore;
      const level = context.health.healthLevel || 'NORMAL';
      const risks = context.health.riskSignals;
      const positives = context.health.positiveSignals;

      return `### Community Health & Vital Assessment for **${name}**

#### What Happened
- **Health Index**: ${score !== null ? `${score}/100` : 'Insufficient baseline telemetry'} (${level})
- **Active Signals Observed**: ${positives.length} positive vital signal(s), ${risks.length} risk factor(s) identified.

#### What Changed
- Telemetry across recruitment, engagement, moderation, and retention was unified for observation period **${period}**.
- ${comp.healthScore?.previous !== null && comp.healthScore?.previous !== undefined ? `Score shifted by ${formatDelta(comp.healthScore.delta)} from ${comp.healthScore.previous}/100.` : 'Baseline established across connected Discord services.'}

#### Why It Likely Happened
- ${risks.length > 0 ? `Score is constrained primarily by: **${risks.join(', ')}**.` : 'All monitored telemetry domains are operating in stable bands without detected operational anomalies.'}
- ${positives.length > 0 ? `Key positive contributors include: ${positives.join(', ')}.` : ''}

#### Opportunity & Risk Assessment
- **Primary Risk**: ${risks.length > 0 ? `Friction in ${risks[0]} risks dampening community health.` : 'No critical operational risks detected.'}
- **Primary Opportunity**: ${positives.length > 0 ? `Build upon healthy metrics in ${positives[0]} to drive community initiatives.` : 'Establish steady event and recruitment routines.'}

#### Recommended Actions
1. ${risks.length > 0 ? `Investigate ${risks[0]} and adjust community procedures accordingly.` : 'Maintain regular server engagement broadcasts and monitor candidate flow.'}
2. Review weekly health trends to verify that operational adjustments yield sustained stability.`;
    }

    // 2. RECRUITMENT INQUIRY
    if (category === 'RECRUITMENT' || p.includes('applicant') || p.includes('recruitment')) {
      const total = context.recruitment.totalApplications ?? 0;
      const accepted = context.recruitment.accepted ?? 0;
      const pending = context.recruitment.pending ?? 0;
      const conv = context.recruitment.conversionRate;
      const cApps = comp.totalApplications;

      return `### Recruitment & Candidate Pipeline Analysis for **${name}**

#### What Happened
- **Total Applications Received**: ${total}
- **Accepted Candidates**: ${accepted}
- **Pending Review**: ${pending}
- **Conversion Rate**: ${conv !== null ? `${conv}%` : 'Pending volume threshold'}
- **Active Recruiters**: ${context.recruitment.activeRecruiters ?? 0}

#### What Changed
- **Applications Delta**: ${cApps?.previous !== null && cApps?.previous !== undefined ? `${total} vs ${cApps.previous} prior period (${formatDelta(cApps.delta)})` : 'Baseline period recorded.'}
- Pipeline status: ${pending > 0 ? `${pending} candidates currently queued in review.` : 'All submitted candidates have been resolved.'}

#### Why It Likely Happened
- ${pending > 3 ? `Review turnaround times may be bottlenecked, keeping ${pending} candidates in pending stages.` : 'Application intake is processing smoothly without significant backlog.'}
- ${total === 0 ? 'Recruitment links may need refreshed promotion or recruiter attribution codes require redistribution.' : 'Candidates are actively entering via recruiter attributions.'}

#### Opportunity & Risk Assessment
- **Opportunity**: ${conv !== null && conv >= 30 ? `Strong ${conv}% conversion indicates high quality among applicants reaching review.` : 'Streamlining application questions can lower drop-off.'}
- **Risk**: ${pending > 0 ? `Candidate interest drops if pending applications remain unaddressed for multiple days.` : 'Low pipeline volume can impact future member growth.'}

#### Recommended Actions
1. ${pending > 0 ? `Review the **${pending}** pending applicant(s) to accelerate intake velocity.` : 'Distribute active recruiter codes to top community members.'}
2. Ensure interviewer assignments are current across all guild departments.`;
    }

    // 3. GROWTH & RETENTION INQUIRY
    if (
      category === 'GROWTH' ||
      category === 'RETENTION' ||
      p.includes('growth') ||
      p.includes('members decline') ||
      p.includes('retention')
    ) {
      const total = context.overview.totalMembers ?? 'Not synchronized';
      const net = context.overview.netGrowth;
      const cNet = comp.netGrowth;
      const cNew = comp.newMembers;
      const cLeft = comp.membersLeft;

      return `### Member Trajectory & Retention Report for **${name}**

#### What Happened
- **Total Synchronized Members**: ${total}
- **Net Member Growth**: ${net !== null ? `${net >= 0 ? '+' : ''}${net}` : 'Calculating'}
- **New Joins**: ${cNew?.current ?? 'n/a'}
- **Departures**: ${cLeft?.current ?? 'n/a'}

#### What Changed
- **Net Growth Shift**: ${cNet?.previous !== null && cNet?.previous !== undefined ? `Prior period net was ${cNet.previous} (delta: ${formatDelta(cNet.delta)}).` : 'Baseline observation window.'}
- **Joins vs Departures**: Recorded ${cNew?.current ?? 0} join(s) and ${cLeft?.current ?? 0} departure(s) during this period.

#### Why It Likely Happened
- ${net !== null && net < 0 ? `Departures (${cLeft?.current ?? 0}) exceeded new joins (${cNew?.current ?? 0}), driving negative net growth.` : `Joins (${cNew?.current ?? 0}) outpaced departures (${cLeft?.current ?? 0}), producing net expansion.`}
- Correlated signals: Recruitment pipeline delivered ${context.recruitment.totalApplications ?? 0} applicant(s).

#### Opportunity & Risk Assessment
- **Risk**: ${net !== null && net < 0 ? 'Sustained net losses reduce active chat density and event attendance.' : 'Monitor 7-day member retention to verify onboarding stickiness.'}
- **Opportunity**: ${cNew?.current && Number(cNew.current) > 0 ? `Engage ${cNew.current} newly joined members with welcome announcements and role assignments.` : 'Re-engage dormant members via scheduled events.'}

#### Recommended Actions
1. ${net !== null && net < 0 ? 'Audit departure trends, review recent moderation actions, and launch targeted welcome campaigns.' : 'Set up automated welcome messages for incoming cohorts.'}
2. Coordinate with recruiters to maintain consistent join velocity.`;
    }

    // 4. ENGAGEMENT INQUIRY
    if (category === 'ENGAGEMENT' || p.includes('engagement') || p.includes('announcement')) {
      const sent = context.engagement.announcementsSent ?? 0;
      const rate = context.engagement.deliverySuccessRate;
      const cDeliv = comp.deliverySuccessRate;
      const cAnn = comp.announcementsSent;

      return `### Engagement & Broadcast Reliability for **${name}**

#### What Happened
- **Announcements Dispatched**: ${sent}
- **Delivery Success Rate**: ${rate !== null ? `${rate}%` : 'No broadcasts recorded'}
- **Active Campaigns**: ${context.engagement.activeCampaigns ?? 0}
- **Polls Executed**: ${context.engagement.pollsCount ?? 0}

#### What Changed
- **Broadcast Volume**: ${cAnn?.previous !== null && cAnn?.previous !== undefined ? `${sent} vs ${cAnn.previous} prior period (${formatDelta(cAnn.delta)})` : 'Baseline broadcast count.'}
- **Delivery Reliability**: ${cDeliv?.previous !== null && cDeliv?.previous !== undefined ? `${rate}% vs ${cDeliv.previous}% prior (${formatDelta(cDeliv.delta, '%')})` : 'Delivery tracking initialized.'}

#### Why It Likely Happened
- ${rate !== null && rate < 85 ? `Suboptimal delivery (${rate}%) indicates Discord bot channel permission restrictions or Discord API rate limiting.` : 'Broadcasting pipelines delivered messages without channel errors.'}
- ${sent === 0 ? 'No major broadcasts or campaigns were dispatched during this time window.' : 'Campaigns and announcements reached configured channels.'}

#### Opportunity & Risk Assessment
- **Risk**: ${rate !== null && rate < 85 ? 'Delivery failures mean critical server announcements fail to reach targeted member channels.' : 'Low announcement frequency can cause member disengagement.'}
- **Opportunity**: High-visibility announcements paired with interactive polls boost community interaction.

#### Recommended Actions
1. ${rate !== null && rate < 85 ? 'Audit bot Send Messages and Embed Links permissions across all target announcement channels.' : 'Schedule an interactive poll to gather member feedback on community topics.'}
2. Establish a consistent weekly announcement rhythm.`;
    }

    // 5. MODERATION INQUIRY
    if (category === 'MODERATION' || p.includes('moderation') || p.includes('safety')) {
      const warnings = context.moderation.warningsIssued ?? 0;
      const incidents = context.moderation.safetyIncidents ?? 0;
      const cInc = comp.safetyIncidents;

      return `### Moderation & Server Safety Report for **${name}**

#### What Happened
- **Warnings Issued**: ${warnings}
- **Safety Incidents**: ${incidents}
- **Blacklisted Members**: ${context.moderation.blacklistedUsers ?? 0}
- **Automod Triggers**: ${context.moderation.automodTriggers ?? 0}

#### What Changed
- **Incident Delta**: ${cInc?.previous !== null && cInc?.previous !== undefined ? `${incidents} vs ${cInc.previous} prior period (${formatDelta(cInc.delta)})` : 'Incident tracking baseline.'}
- Moderation workload reflects recorded infractions.

#### Why It Likely Happened
- ${incidents > 0 ? `Logged ${incidents} incident(s) requiring moderator review or user disciplinary actions.` : 'No critical safety incidents or automod rule breaches detected.'}

#### Opportunity & Risk Assessment
- **Risk**: ${incidents > 0 ? 'Unresolved violations disrupt server culture and promote toxicity.' : 'Under-configured automod rules can let spam slip through.'}
- **Opportunity**: Proactive moderation transparency builds member trust and safety.

#### Recommended Actions
1. ${incidents > 0 ? `Review the ${incidents} open incident(s) in the moderation log.` : 'Audit automod regex filters and blacklisted words.'}
2. Ensure moderation team roles have clear escalation channels.`;
    }

    // 6. EVENTS INQUIRY
    if (category === 'EVENTS' || p.includes('event') || p.includes('attendance')) {
      const scheduled = context.events.upcomingEventsCount ?? 0;
      const regs = context.events.totalRegistrations ?? 0;
      const attRate = context.events.attendanceRate;

      return `### Events & Calendar Turnout for **${name}**

#### What Happened
- **Upcoming Scheduled Events**: ${scheduled}
- **Total Registrations**: ${regs}
- **Attendance Rate**: ${attRate !== null ? `${attRate}%` : 'Awaiting completed event check-ins'}

#### What Changed
- Calendar shows ${scheduled} event(s) scheduled for upcoming dates.

#### Why It Likely Happened
- ${scheduled === 0 ? 'No events were placed on the community calendar for this timeframe.' : 'Events have been scheduled and are accepting member RSVPs.'}

#### Opportunity & Risk Assessment
- **Risk**: Lack of regular community gatherings weakens long-term retention.
- **Opportunity**: Well-timed events with automated 24-hour reminders produce higher turnout.

#### Recommended Actions
1. ${scheduled === 0 ? 'Schedule an upcoming orientation meetup or game night.' : 'Publish announcement reminders for upcoming events 24 hours in advance.'}
2. Track check-ins to measure actual attendance against RSVPs.`;
    }

    // 7. AUTOMATION INQUIRY
    if (category === 'AUTOMATION' || p.includes('workflow')) {
      const count = context.automation.activeWorkflowsCount ?? 0;
      const execs = context.automation.recentExecutions ?? 0;
      const rate = context.automation.executionSuccessRate;

      return `### Automation & Workflow Performance for **${name}**

#### What Happened
- **Active Workflows**: ${count}
- **Executions Recorded**: ${execs}
- **Execution Success Rate**: ${rate !== null ? `${rate}%` : 'No recent executions'}

#### What Changed
- Telemetry tracked across active workflow triggers and execution runs.

#### Why It Likely Happened
- ${rate !== null && rate < 90 ? 'Workflow failure rate indicates permission or action payload configuration issues.' : 'Configured triggers are firing and completing designated actions successfully.'}

#### Opportunity & Risk Assessment
- **Risk**: Failing workflows can prevent automated roles from being assigned to new members.
- **Opportunity**: Automated welcome and moderation triggers streamline community operations.

#### Recommended Actions
1. ${rate !== null && rate < 90 ? 'Inspect failed execution logs in the automation panel to fix failing steps.' : 'Verify that trigger parameters match current guild channel IDs.'}
2. Keep automation rules documented for moderators.`;
    }

    // 8. CROSS_DOMAIN / DEFAULT SYNTHESIS
    const score = context.health.healthScore;
    const totalMembers = context.overview.totalMembers !== null ? context.overview.totalMembers : 'Not synchronized';
    const pendingApps = context.recruitment.pending ?? 0;
    const deliveryRate = context.engagement.deliverySuccessRate !== null ? `${context.engagement.deliverySuccessRate}%` : 'No data';
    const scheduledEvents = context.events.upcomingEventsCount ?? 0;

    return `### Strategic Intelligence Briefing for **${name}**

#### What Happened
- **Community Health Index**: ${score !== null ? `${score}/100` : 'Establishing baseline'} (${context.health.healthLevel || 'NORMAL'})
- **Total Synchronized Members**: ${totalMembers}
- **Net Growth**: ${context.overview.netGrowth !== null ? `${context.overview.netGrowth >= 0 ? '+' : ''}${context.overview.netGrowth}` : 'Calculating'}
- **Recruitment Pipeline**: ${pendingApps} pending applicant(s)
- **Delivery Success Rate**: ${deliveryRate}
- **Events Scheduled**: ${scheduledEvents}

#### What Changed
- Telemetry across all operational domains has been synthesized for period **${period}**.
- Operational vital signs and funnel drop-offs have been evaluated against preceding period baselines.

#### Why It Likely Happened
- Performance is driven by the interaction between recruitment intake (${context.recruitment.totalApplications ?? 0} apps), broadcast reliability (${deliveryRate}), and member join/departure velocity.
- ${context.health.riskSignals.length > 0 ? `Observed risk factors: ${context.health.riskSignals.join(', ')}.` : 'Vital signs remain balanced across active domains.'}

#### Where the Biggest Opportunity & Risk Exists
- **Biggest Risk**: ${context.health.riskSignals.length > 0 ? `Operational bottleneck in **${context.health.riskSignals[0]}**.` : 'Inconsistent event scheduling or pending application stagnation.'}
- **Biggest Opportunity**: ${context.health.positiveSignals.length > 0 ? `Capitalize on **${context.health.positiveSignals[0]}** to scale server initiatives.` : 'Activate recruiter attributions and establish weekly calendar events.'}

#### Recommended Actions
1. ${pendingApps > 0 ? `Review the **${pendingApps}** pending applicant(s) to accelerate intake turnaround.` : 'Distribute active recruiter codes to contributors.'}
2. ${scheduledEvents === 0 ? 'Create an upcoming community event to stimulate member engagement.' : 'Verify announcement delivery permissions in all broadcast channels.'}`;
  }
}
