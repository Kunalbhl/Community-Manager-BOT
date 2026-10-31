import { AiQuestionCategory, AiScope } from '../../../shared/types/ai.js';
import { DateRangeType } from '../../../shared/types/insights.js';

export interface ClassificationResult {
  category: AiQuestionCategory;
  confidence: number;
  explanation: string;
  detectedSignals: string[];
  inferredDateRange?: DateRangeType;
}

export class AiClassificationService {
  /**
   * Fast, lightweight, deterministic question classifier for community analytics queries.
   * Does NOT affect tenant authorization; strictly guides factual context resolution.
   */
  static classify(prompt: string, explicitScope?: AiScope): ClassificationResult {
    const raw = prompt.trim();
    const p = raw.toLowerCase();
    const signals: string[] = [];

    // Check for explicit time references in prompt
    let inferredDateRange: DateRangeType | undefined = undefined;
    if (p.includes('today')) {
      inferredDateRange = 'TODAY';
    } else if (p.includes('7 days') || p.includes('past week') || p.includes('last week')) {
      inferredDateRange = 'LAST_7_DAYS';
    } else if (p.includes('90 days') || p.includes('past quarter') || p.includes('last quarter')) {
      inferredDateRange = 'LAST_90_DAYS';
    } else if (p.includes('30 days') || p.includes('past month') || p.includes('last month')) {
      inferredDateRange = 'LAST_30_DAYS';
    }

    // Detect multi-domain hits
    const domainHits: string[] = [];
    if (p.includes('recruit') || p.includes('applicant') || p.includes('candidate')) domainHits.push('recruitment');
    if (p.includes('engagement') || p.includes('announcement') || p.includes('poll') || p.includes('broadcast')) domainHits.push('engagement');
    if (p.includes('moderation') || p.includes('safety') || p.includes('incident') || p.includes('warn')) domainHits.push('moderation');
    if (p.includes('event') || p.includes('calendar') || p.includes('attendance')) domainHits.push('events');
    if (p.includes('automation') || p.includes('workflow')) domainHits.push('automation');
    if (p.includes('growth') || p.includes('retention') || p.includes('churn')) domainHits.push('growth_retention');

    // 1. CROSS_DOMAIN / OPPORTUNITY / RISK / COMPARISONS
    const isMultiDomainComparison =
      domainHits.length >= 2 &&
      (p.includes('compare') ||
        p.includes('comparing') ||
        p.includes('vs') ||
        p.includes('versus') ||
        p.includes('correlation') ||
        p.includes('full overview') ||
        p.includes('tradeoff'));

    if (
      isMultiDomainComparison ||
      p.includes('opportunity') ||
      p.includes('biggest opportunity') ||
      p.includes('biggest risk') ||
      p.includes('cross domain') ||
      p.includes('cross-domain') ||
      p.includes('tradeoff') ||
      p.includes('overall priority') ||
      p.includes('strategic priority') ||
      p.includes('full overview')
    ) {
      signals.push('cross_domain_opportunity_risk_pattern');
      return {
        category: 'CROSS_DOMAIN',
        confidence: 0.95,
        explanation: 'Query seeks cross-domain synthesis, comparison between domains, top opportunities, or strategic community risk factors.',
        detectedSignals: signals,
        inferredDateRange,
      };
    }

    // 2. HEALTH
    if (
      p.includes('how is my community doing') ||
      p.includes('how are we doing') ||
      p.includes('health') ||
      p.includes('vital signs') ||
      p.includes('server status') ||
      p.includes('community status') ||
      p.includes('overall score')
    ) {
      signals.push('health_vital_signs_pattern');
      return {
        category: 'HEALTH',
        confidence: 0.95,
        explanation: 'Query inquires about overall community health, vital index scores, and cross-cutting signals.',
        detectedSignals: signals,
        inferredDateRange,
      };
    }

    // 3. RETENTION vs GROWTH
    if (
      p.includes('retention') ||
      p.includes('churn') ||
      p.includes('leaving') ||
      p.includes('members left') ||
      p.includes('departures') ||
      p.includes('staying')
    ) {
      signals.push('retention_churn_pattern');
      return {
        category: 'RETENTION',
        confidence: 0.9,
        explanation: 'Query focuses on member retention, departures, and active member persistence.',
        detectedSignals: signals,
        inferredDateRange,
      };
    }

    if (
      p.includes('growth') ||
      p.includes('growing') ||
      p.includes('why did members decline') ||
      p.includes('members decline') ||
      p.includes('member decline') ||
      p.includes('joins') ||
      p.includes('new members') ||
      p.includes('net growth')
    ) {
      signals.push('member_growth_trajectory_pattern');
      return {
        category: 'GROWTH',
        confidence: 0.9,
        explanation: 'Query explores member growth trends, trajectory changes, joins, or net losses.',
        detectedSignals: signals,
        inferredDateRange,
      };
    }

    // 4. RECRUITMENT
    if (
      p.includes('applicant') ||
      p.includes('applicants') ||
      p.includes('application') ||
      p.includes('applications') ||
      p.includes('recruitment') ||
      p.includes('recruiter') ||
      p.includes('recruiters') ||
      p.includes('funnel') ||
      p.includes('interview') ||
      p.includes('interviews') ||
      p.includes('hiring') ||
      p.includes('conversion rate')
    ) {
      signals.push('recruitment_funnel_pattern');
      return {
        category: 'RECRUITMENT',
        confidence: 0.95,
        explanation: 'Query targets the recruitment pipeline, application stages, conversion, or recruiter performance.',
        detectedSignals: signals,
        inferredDateRange,
      };
    }

    // 5. ENGAGEMENT
    if (
      p.includes('engagement') ||
      p.includes('announcement') ||
      p.includes('announcements') ||
      p.includes('delivery') ||
      p.includes('campaign') ||
      p.includes('campaigns') ||
      p.includes('polls') ||
      p.includes('poll') ||
      p.includes('active members') ||
      p.includes('interaction')
    ) {
      signals.push('engagement_communications_pattern');
      return {
        category: 'ENGAGEMENT',
        confidence: 0.9,
        explanation: 'Query investigates community communication, announcement deliveries, polls, or engagement rates.',
        detectedSignals: signals,
        inferredDateRange,
      };
    }

    // 6. MODERATION
    if (
      p.includes('moderation') ||
      p.includes('incident') ||
      p.includes('incidents') ||
      p.includes('safety') ||
      p.includes('warning') ||
      p.includes('warnings') ||
      p.includes('blacklist') ||
      p.includes('ban') ||
      p.includes('automod') ||
      p.includes('violations')
    ) {
      signals.push('moderation_safety_pattern');
      return {
        category: 'MODERATION',
        confidence: 0.95,
        explanation: 'Query addresses moderation actions, safety incidents, automod filters, or warning trends.',
        detectedSignals: signals,
        inferredDateRange,
      };
    }

    // 7. EVENTS
    if (
      p.includes('event') ||
      p.includes('events') ||
      p.includes('calendar') ||
      p.includes('attendance') ||
      p.includes('registration') ||
      p.includes('registrations') ||
      p.includes('rsvp') ||
      p.includes('meetup')
    ) {
      signals.push('events_calendar_pattern');
      return {
        category: 'EVENTS',
        confidence: 0.95,
        explanation: 'Query investigates event scheduling, member registrations, or turnout attendance rates.',
        detectedSignals: signals,
        inferredDateRange,
      };
    }

    // 8. AUTOMATION
    if (
      p.includes('workflow') ||
      p.includes('workflows') ||
      p.includes('automation') ||
      p.includes('automations') ||
      p.includes('trigger') ||
      p.includes('execution') ||
      p.includes('failing workflow') ||
      p.includes('failing workflows')
    ) {
      signals.push('automation_workflow_pattern');
      return {
        category: 'AUTOMATION',
        confidence: 0.95,
        explanation: 'Query assesses workflow automations, execution status, failures, and trigger frequencies.',
        detectedSignals: signals,
        inferredDateRange,
      };
    }

    // 9. COMMUNITY (General membership structure)
    if (
      p.includes('community') ||
      p.includes('members') ||
      p.includes('total members') ||
      p.includes('server size') ||
      p.includes('guild')
    ) {
      signals.push('community_overview_pattern');
      return {
        category: 'COMMUNITY',
        confidence: 0.8,
        explanation: 'Query inquiries about general community demographics and server status.',
        detectedSignals: signals,
        inferredDateRange,
      };
    }

    // Explicit scope fallback if provided
    if (explicitScope && explicitScope !== 'ALL' && explicitScope !== 'OVERVIEW') {
      const scopeMap: Record<string, AiQuestionCategory> = {
        ENGAGEMENT: 'ENGAGEMENT',
        RECRUITMENT: 'RECRUITMENT',
        MODERATION: 'MODERATION',
        EVENTS: 'EVENTS',
        AUTOMATION: 'AUTOMATION',
      };
      if (scopeMap[explicitScope]) {
        return {
          category: scopeMap[explicitScope],
          confidence: 0.75,
          explanation: `Classified via explicitly specified request scope: ${explicitScope}.`,
          detectedSignals: ['explicit_scope'],
          inferredDateRange,
        };
      }
    }

    return {
      category: 'GENERAL',
      confidence: 0.5,
      explanation: 'General inquiry across community management domains.',
      detectedSignals: ['default_fallback'],
      inferredDateRange,
    };
  }
}
