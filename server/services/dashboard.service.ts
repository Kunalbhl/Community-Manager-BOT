import type { UserAuthContext, Permission } from '../../shared/types/rbac.js';
import { canAccessTenant, hasPermission } from '../security/rbac.js';
import { ForbiddenError, BadRequestError } from '../utils/errors.js';
import { communityConfigurationRepository } from '../repositories/index.js';
import { NeedsAttentionService } from './needsAttention.service.js';

export interface DashboardCardDefinition {
  cardId: string;
  title: string;
  description: string;
  metricSource: string;
  querySource: string;
  permissionRequirement: Permission;
  communityScope: string;
  refreshBehavior: 'LIVE' | 'POLL_5M' | 'MANUAL';
  emptyStateText: string;
  errorStateText: string;
}

export const DASHBOARD_CARDS_REGISTRY: DashboardCardDefinition[] = [
  {
    cardId: 'NEEDS_ATTENTION',
    title: 'Needs Attention Priority Signals',
    description: 'Deterministic operational alerts requiring immediate owner review.',
    metricSource: 'NeedsAttentionEngine',
    querySource: '/api/v1/communities/:communityId/ai/needs-attention',
    permissionRequirement: 'community.manage',
    communityScope: 'TENANT',
    refreshBehavior: 'LIVE',
    emptyStateText: 'All community systems are operating smoothly.',
    errorStateText: 'Unable to evaluate priority signals.',
  },
  {
    cardId: 'MEMBER_GROWTH',
    title: 'Member Growth & Synchronized Directory',
    description: 'Net member growth, active directory count, and join velocity.',
    metricSource: 'InsightsService',
    querySource: '/api/v1/insights/overview',
    permissionRequirement: 'reports.view',
    communityScope: 'TENANT',
    refreshBehavior: 'POLL_5M',
    emptyStateText: 'No member growth recorded in period.',
    errorStateText: 'Failed to retrieve member growth metrics.',
  },
  {
    cardId: 'APPLICATIONS_NEEDING_REVIEW',
    title: 'Applications Needing Review',
    description: 'Recruitment backlog of candidates awaiting reviewer scoring.',
    metricSource: 'RecruitmentAnalyticsService',
    querySource: '/api/v1/insights/recruitment/funnel',
    permissionRequirement: 'community.manage',
    communityScope: 'TENANT',
    refreshBehavior: 'LIVE',
    emptyStateText: 'No pending candidate applications.',
    errorStateText: 'Failed to load application queue.',
  },
  {
    cardId: 'INTERVIEW_QUEUE',
    title: 'Candidate Interview Queue',
    description: 'Interviews scheduled for today and assigned interviewer status.',
    metricSource: 'InterviewService',
    querySource: '/api/v1/interviews',
    permissionRequirement: 'community.manage',
    communityScope: 'TENANT',
    refreshBehavior: 'LIVE',
    emptyStateText: 'No interviews scheduled for today.',
    errorStateText: 'Failed to load interview queue.',
  },
  {
    cardId: 'RECRUITMENT_FUNNEL',
    title: 'Recruitment Conversion Funnel',
    description: 'Stage-by-stage candidate conversion rates and drop-off points.',
    metricSource: 'RecruitmentAnalyticsService',
    querySource: '/api/v1/insights/recruitment/funnel',
    permissionRequirement: 'reports.view',
    communityScope: 'TENANT',
    refreshBehavior: 'POLL_5M',
    emptyStateText: 'Insufficient recruitment funnel data.',
    errorStateText: 'Failed to load recruitment funnel metrics.',
  },
  {
    cardId: 'ENGAGEMENT_METRICS',
    title: 'Engagement & Message Delivery Rate',
    description: 'Delivery success rates across announcements, campaigns, and reminders.',
    metricSource: 'EngagementService',
    querySource: '/api/v1/insights/engagement',
    permissionRequirement: 'reports.view',
    communityScope: 'TENANT',
    refreshBehavior: 'POLL_5M',
    emptyStateText: 'No recent engagement activity.',
    errorStateText: 'Failed to retrieve engagement metrics.',
  },
  {
    cardId: 'MODERATION_ALERTS',
    title: 'Moderation Alerts & Active Warnings',
    description: 'Unresolved incidents, warning spikes, and auto-moderation actions.',
    metricSource: 'ModerationService',
    querySource: '/api/v1/insights/moderation',
    permissionRequirement: 'community.manage',
    communityScope: 'TENANT',
    refreshBehavior: 'LIVE',
    emptyStateText: 'No active warnings or incidents.',
    errorStateText: 'Failed to load moderation data.',
  },
  {
    cardId: 'EVENTS_UPCOMING',
    title: 'Upcoming Scheduled Events',
    description: 'Community sessions, calendar events, and RSVP participation counts.',
    metricSource: 'EventsService',
    querySource: '/api/v1/insights/events',
    permissionRequirement: 'reports.view',
    communityScope: 'TENANT',
    refreshBehavior: 'POLL_5M',
    emptyStateText: 'No upcoming scheduled events.',
    errorStateText: 'Failed to load events calendar.',
  },
  {
    cardId: 'AUTOMATION_FAILURES',
    title: 'Automation Workflow Health',
    description: 'Workflow execution success rates and error diagnostics.',
    metricSource: 'AutomationService',
    querySource: '/api/v1/insights/automation',
    permissionRequirement: 'settings.manage',
    communityScope: 'TENANT',
    refreshBehavior: 'LIVE',
    emptyStateText: 'All active workflows executing cleanly.',
    errorStateText: 'Failed to retrieve automation metrics.',
  },
  {
    cardId: 'INTEGRATION_HEALTH',
    title: 'Integration Connectivity Health',
    description: 'Status of Discord gateway, Google Workspace, and AI services.',
    metricSource: 'IntegrationCenterService',
    querySource: '/api/v1/integrations/summary',
    permissionRequirement: 'settings.manage',
    communityScope: 'TENANT',
    refreshBehavior: 'LIVE',
    emptyStateText: 'Integrations operational.',
    errorStateText: 'Failed to load integration status.',
  },
  {
    cardId: 'RETENTION_COHORTS',
    title: 'Member Retention & Onboarding Quality',
    description: 'Day-7 and Day-30 member retention cohorts and onboarding crossover.',
    metricSource: 'RetentionIntelligenceService',
    querySource: '/api/v1/insights/retention/cohorts',
    permissionRequirement: 'reports.view',
    communityScope: 'TENANT',
    refreshBehavior: 'POLL_5M',
    emptyStateText: 'Insufficient retention baseline data.',
    errorStateText: 'Failed to load retention metrics.',
  },
  {
    cardId: 'AI_RECOMMENDATIONS',
    title: 'Community Brain AI Recommendations',
    description: 'Evidence-backed operational suggestions generated by Community Brain.',
    metricSource: 'CommunityBrainService',
    querySource: '/api/v1/communities/:communityId/ai/recommendations',
    permissionRequirement: 'reports.view',
    communityScope: 'TENANT',
    refreshBehavior: 'POLL_5M',
    emptyStateText: 'No active recommendations at this time.',
    errorStateText: 'Failed to retrieve AI recommendations.',
  },
];

export interface DashboardConfigResponse {
  communityId: string;
  selectedCardIds: string[];
  availableCards: DashboardCardDefinition[];
  updatedAt: string;
}

export class DashboardService {
  /**
   * Returns list of allowed card definitions
   */
  static getCardsRegistry(): DashboardCardDefinition[] {
    return DASHBOARD_CARDS_REGISTRY;
  }

  /**
   * Fetches persisted dashboard card configuration for a community
   */
  static async getDashboardConfig(
    communityId: string,
    userContext: UserAuthContext
  ): Promise<DashboardConfigResponse> {
    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError(`Cross-tenant access denied for tenant ${communityId}`);
    }

    const config = await communityConfigurationRepository.getById(communityId);
    const savedCardIds: string[] = (config as any)?.dashboardConfig?.cardIds || [
      'NEEDS_ATTENTION',
      'MEMBER_GROWTH',
      'APPLICATIONS_NEEDING_REVIEW',
      'ENGAGEMENT_METRICS',
      'AI_RECOMMENDATIONS',
    ];

    // Filter available cards by user permissions
    const authorizedCards = DASHBOARD_CARDS_REGISTRY.filter((c) =>
      hasPermission(userContext, c.permissionRequirement)
    );

    const validCardIds = savedCardIds.filter((id) =>
      authorizedCards.some((c) => c.cardId === id)
    );

    return {
      communityId,
      selectedCardIds: validCardIds.length > 0 ? validCardIds : ['NEEDS_ATTENTION', 'MEMBER_GROWTH'],
      availableCards: authorizedCards,
      updatedAt: (config as any)?.dashboardConfig?.updatedAt || new Date().toISOString(),
    };
  }

  /**
   * Persists updated dashboard card configuration server-side
   */
  static async updateDashboardConfig(
    communityId: string,
    userContext: UserAuthContext,
    cardIds: string[]
  ): Promise<DashboardConfigResponse> {
    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError(`Cross-tenant layout update denied for tenant ${communityId}`);
    }

    if (!hasPermission(userContext, 'community.manage')) {
      throw new ForbiddenError('Permission community.manage required to personalize dashboard');
    }

    const authorizedCards = DASHBOARD_CARDS_REGISTRY.filter((c) =>
      hasPermission(userContext, c.permissionRequirement)
    );

    const validCardIds = (cardIds || []).filter((id) =>
      authorizedCards.some((c) => c.cardId === id)
    );

    if (validCardIds.length === 0) {
      throw new BadRequestError('At least one valid dashboard card must be selected');
    }

    const nowIso = new Date().toISOString();
    let config = await communityConfigurationRepository.getById(communityId);
    if (config) {
      await communityConfigurationRepository.update(communityId, {
        dashboardConfig: {
          cardIds: validCardIds,
          updatedAt: nowIso,
        },
      } as any);
    } else {
      await communityConfigurationRepository.create(communityId, {
        id: communityId,
        communityId,
        dashboardConfig: {
          cardIds: validCardIds,
          updatedAt: nowIso,
        },
      } as any);
    }

    return {
      communityId,
      selectedCardIds: validCardIds,
      availableCards: authorizedCards,
      updatedAt: nowIso,
    };
  }

  /**
   * Generates a personalized AI dashboard layout proposal based on user prompt and real conditions.
   * Requires explicit user confirmation ("Apply Dashboard").
   */
  static async generateAIProposal(
    communityId: string,
    userContext: UserAuthContext,
    goalPrompt: string
  ): Promise<{
    communityId: string;
    proposedCardIds: string[];
    explanation: string;
    requiresConfirmation: true;
  }> {
    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError(`Cross-tenant proposal denied for tenant ${communityId}`);
    }

    const lower = (goalPrompt || '').toLowerCase();
    let proposedCardIds: string[] = ['NEEDS_ATTENTION'];

    if (lower.includes('morning') || lower.includes('daily') || lower.includes('review')) {
      proposedCardIds = [
        'NEEDS_ATTENTION',
        'APPLICATIONS_NEEDING_REVIEW',
        'INTERVIEW_QUEUE',
        'MODERATION_ALERTS',
        'AUTOMATION_FAILURES',
        'EVENTS_UPCOMING',
      ];
    } else if (lower.includes('recruit') || lower.includes('hiring') || lower.includes('applicant')) {
      proposedCardIds = [
        'APPLICATIONS_NEEDING_REVIEW',
        'INTERVIEW_QUEUE',
        'RECRUITMENT_FUNNEL',
        'RETENTION_COHORTS',
        'NEEDS_ATTENTION',
      ];
    } else if (lower.includes('mod') || lower.includes('safety') || lower.includes('incident')) {
      proposedCardIds = [
        'MODERATION_ALERTS',
        'NEEDS_ATTENTION',
        'MEMBER_GROWTH',
        'INTEGRATION_HEALTH',
      ];
    } else {
      proposedCardIds = [
        'NEEDS_ATTENTION',
        'MEMBER_GROWTH',
        'ENGAGEMENT_METRICS',
        'EVENTS_UPCOMING',
        'AI_RECOMMENDATIONS',
      ];
    }

    const authorizedCards = DASHBOARD_CARDS_REGISTRY.filter((c) =>
      hasPermission(userContext, c.permissionRequirement)
    );

    proposedCardIds = proposedCardIds.filter((id) =>
      authorizedCards.some((c) => c.cardId === id)
    );

    return {
      communityId,
      proposedCardIds,
      explanation: `Proposed ${proposedCardIds.length}-card layout tailored to "${goalPrompt}". Click "Apply Dashboard" to confirm layout update.`,
      requiresConfirmation: true,
    };
  }
}
