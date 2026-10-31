import { config } from '../config/env.js';
import {
  featureDefinitionsRepository,
  featureEntitlementsRepository,
  communityPlansRepository,
  communityUsagesRepository,
} from '../repositories/index.js';
import {
  FeatureDefinition,
  FeatureEntitlement,
  CommunityPlan,
  CommunityUsage,
} from '../../shared/types/models.js';
import { BadRequestError } from '../utils/errors.js';

import { PlanType, PlanDefinition, AUTHORITATIVE_PLANS } from '../../shared/types/plans.js';
export type { PlanType, PlanDefinition };

const RAW_FEATURES: Omit<FeatureDefinition, 'id'>[] = [
  // COMMUNITY
  {
    key: 'COMMUNITY_OVERVIEW',
    module: 'COMMUNITY',
    displayName: 'Community Overview',
    description: 'Get dashboard overview of community and bot status.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['community.view'],
  },
  {
    key: 'MEMBER_DIRECTORY',
    module: 'COMMUNITY',
    displayName: 'Member Directory',
    description: 'View and manage all synchronized guild members.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['community.view'],
  },
  {
    key: 'MEMBER_SYNC',
    module: 'COMMUNITY',
    displayName: 'Member Sync',
    description: 'Manually trigger member synchronization with Discord.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['community.manage'],
  },
  {
    key: 'MEMBER_IMPORT',
    module: 'COMMUNITY',
    displayName: 'Bulk Import',
    description: 'Bulk import or invite members to community.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['community.manage'],
  },
  {
    key: 'MEMBER_EXPORT',
    module: 'COMMUNITY',
    displayName: 'CSV Export',
    description: 'Export member list in CSV format.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['community.view'],
  },
  {
    key: 'ROLE_MANAGEMENT',
    module: 'COMMUNITY',
    displayName: 'Roles & Access Management',
    description: 'Create and map Discord roles to app permissions.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['community.manage'],
  },
  {
    key: 'CHANNEL_MANAGEMENT',
    module: 'COMMUNITY',
    displayName: 'Channels Access Control',
    description: 'Map access of channels based on application rules.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['community.manage'],
  },
  {
    key: 'DISCORD_CONNECTION',
    module: 'COMMUNITY',
    displayName: 'Discord Bot Connection',
    description: 'Establish and verify authoritative bot connection to Guild.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['community.manage'],
  },
  {
    key: 'MULTI_COMMUNITY',
    module: 'COMMUNITY',
    displayName: 'Multi-Community Support',
    description: 'Manage multiple Discord servers under a single organization.',
    enabled: true,
    defaultAvailability: 'PRO',
    requiredPermissions: ['community.manage'],
  },
  {
    key: 'MULTI_ADMIN',
    module: 'COMMUNITY',
    displayName: 'Multi-Admin Governance',
    description: 'Role-based multi-administrator governance and audit delegation.',
    enabled: true,
    defaultAvailability: 'BUSINESS',
    requiredPermissions: ['community.manage'],
  },
  {
    key: 'DISCORD_OPERATIONS',
    module: 'COMMUNITY',
    displayName: 'Discord Operations & Server Control',
    description: 'Perform server management, role, channel, and permission operations.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['community.manage'],
  },
  {
    key: 'BULK_OPERATIONS',
    module: 'COMMUNITY',
    displayName: 'Bulk Operations Engine',
    description: 'Execute rate-limited bulk member role modifications safely.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['community.manage'],
  },
  {
    key: 'SERVER_HYGIENE',
    module: 'COMMUNITY',
    displayName: 'Server Hygiene & Blueprint Engine',
    description: 'Analyze Discord server configuration health and apply automated fixes.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['community.manage'],
  },
  {
    key: 'ADVANCED_DISCORD_AUTOMATION',
    module: 'COMMUNITY',
    displayName: 'Advanced Discord Automation',
    description: 'Automate role and channel provisioning workflows.',
    enabled: true,
    defaultAvailability: 'PRO',
    requiredPermissions: ['community.manage'],
  },

  // ENGAGEMENT
  {
    key: 'WELCOME_MESSAGES',
    module: 'ENGAGEMENT',
    displayName: 'Welcome Messages',
    description: 'Send custom interactive direct messages to new members.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['engagement.view'],
  },
  {
    key: 'ANNOUNCEMENTS',
    module: 'ENGAGEMENT',
    displayName: 'Server Announcements',
    description: 'Create and dispatch scheduled announcements to text channels.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['engagement.view'],
  },
  {
    key: 'SCHEDULED_MESSAGES',
    module: 'ENGAGEMENT',
    displayName: 'Scheduled Templates',
    description: 'Draft reusable message templates and schedule deliveries.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['engagement.view'],
  },
  {
    key: 'CAMPAIGNS',
    module: 'ENGAGEMENT',
    displayName: 'Engagement Campaigns',
    description: 'Target custom campaigns to segments of the guild.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['engagement.view'],
  },
  {
    key: 'REMINDERS',
    module: 'ENGAGEMENT',
    displayName: 'Reminders & Notifications',
    description: 'Add trigger date/time notifications for community tasks.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['engagement.view'],
  },
  {
    key: 'POLLS',
    module: 'ENGAGEMENT',
    displayName: 'Interactive Polls',
    description: 'Deploy real-time multiple choice questions in Discord.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['engagement.view'],
  },
  {
    key: 'MESSAGE_TEMPLATES',
    module: 'ENGAGEMENT',
    displayName: 'Message Templates',
    description: 'Create and reuse structured message layouts with variables.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['engagement.view'],
  },

  // RECRUITMENT
  {
    key: 'APPLICATIONS',
    module: 'RECRUITMENT',
    displayName: 'Join Applications',
    description: 'Receive and process custom member recruitment questionnaires.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['applications.view'],
    usageMetric: 'MAX_APPLICATIONS_PER_DAY',
  },
  {
    key: 'RECRUITERS',
    module: 'RECRUITMENT',
    displayName: 'Recruiter Management',
    description: 'Organize and oversee recruitment team and metrics.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['recruiters.view'],
  },
  {
    key: 'RECRUITER_CODES',
    module: 'RECRUITMENT',
    displayName: 'Recruiter Codes',
    description: 'Issue invite codes tied to recruiter attribution engine.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['recruiterCodes.view'],
  },
  {
    key: 'INTERVIEWS',
    module: 'RECRUITMENT',
    displayName: 'Scheduled Interviews',
    description: 'Arrange and conduct candidate interviews with evaluation rules.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['interviews.view'],
  },
  {
    key: 'BENEFITS',
    module: 'RECRUITMENT',
    displayName: 'Recruiter Benefit Claims',
    description: 'Track and fulfill benefit claims for recruiters.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['rewards.view'],
  },
  {
    key: 'REFERRALS',
    module: 'RECRUITMENT',
    displayName: 'Referral Pipeline',
    description: 'Audit verified join logs and recruitment paths.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['recruiters.view'],
  },

  // MODERATION
  {
    key: 'RULES',
    module: 'MODERATION',
    displayName: 'Community Rules & Versioning',
    description: 'Publish code of conduct and track member acknowledgement.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['moderation.view'],
  },
  {
    key: 'RULES_MANAGEMENT',
    module: 'MODERATION',
    displayName: 'Advanced Rules Management',
    description: 'Manage versioning and reordering of community rules.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['moderation.view'],
  },
  {
    key: 'WARNINGS',
    module: 'MODERATION',
    displayName: 'Warning Management',
    description: 'Issue formal warnings to users with status logs.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['moderation.view'],
  },
  {
    key: 'BLACKLIST',
    module: 'MODERATION',
    displayName: 'Global Blacklist',
    description: 'Ban or restrict problematic Discord IDs across tenants.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['moderation.view'],
  },
  {
    key: 'AUTO_MODERATION',
    module: 'MODERATION',
    displayName: 'Auto Moderation',
    description: 'Configure automated spam and flood rate guards.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['moderation.manage'],
  },
  {
    key: 'MODERATION_LOG',
    module: 'MODERATION',
    displayName: 'Moderation Event Logs',
    description: 'Maintain secure, auditable logs of all moderation actions.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['moderation.view'],
  },
  {
    key: 'MODERATION_LOGS',
    module: 'MODERATION',
    displayName: 'Unified Moderation Logs',
    description: 'Maintain unified, auditable logs of all moderation actions.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['moderation.view'],
  },
  {
    key: 'ADVANCED_MODERATION',
    module: 'MODERATION',
    displayName: 'Advanced Moderation Config',
    description: 'Manage threshold escalations and warning thresholds.',
    enabled: true,
    defaultAvailability: 'PRO',
    requiredPermissions: ['moderation.manage'],
  },
  {
    key: 'SAFETY_INCIDENTS',
    module: 'MODERATION',
    displayName: 'Safety & Incidents Engine',
    description: 'Track and coordinate safety incident reviews.',
    enabled: true,
    defaultAvailability: 'PRO',
    requiredPermissions: ['moderation.manage'],
  },
  {
    key: 'DISCORD_MODERATION_ACTIONS',
    module: 'MODERATION',
    displayName: 'Direct Discord Moderation',
    description: 'Execute Timeout, Kick, and Ban actions directly on Discord.',
    enabled: true,
    defaultAvailability: 'PRO',
    requiredPermissions: ['moderation.manage'],
  },
  {
    key: 'RESTRICTIONS',
    module: 'MODERATION',
    displayName: 'Member Restrictions',
    description: 'Enforce channel, timeout, role, and feature restrictions.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['moderation.view'],
  },
  {
    key: 'INCIDENTS',
    module: 'MODERATION',
    displayName: 'Incidents Engine',
    description: 'Track and coordinate safety incident reviews.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['moderation.view'],
  },
  {
    key: 'SECURITY_AUDIT',
    module: 'MODERATION',
    displayName: 'Security Audit',
    description: 'View deep moderation audit logs and tenant security timeline.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['moderation.view'],
  },
  {
    key: 'MODERATION_AUTOMATION',
    module: 'MODERATION',
    displayName: 'Moderation Automations',
    description: 'Automated warning escalations, quarantine rules, and ban triggers.',
    enabled: true,
    defaultAvailability: 'PRO',
    requiredPermissions: ['moderation.manage'],
  },

  // EVENTS
  {
    key: 'EVENTS',
    module: 'EVENTS',
    displayName: 'Events Calendar',
    description: 'Create and organize server events and calendar slots.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['events.view'],
  },
  {
    key: 'EVENT_REGISTRATION',
    module: 'EVENTS',
    displayName: 'Registration & Capacity',
    description: 'Track registrations, waitlists, and attendance lists.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['events.view'],
  },
  {
    key: 'EVENT_REMINDERS',
    module: 'EVENTS',
    displayName: 'Event Reminders',
    description: 'Send automated event notifications to channels or members.',
    enabled: true,
    defaultAvailability: 'PRO',
    requiredPermissions: ['events.view'],
  },
  {
    key: 'EVENT_ATTENDANCE',
    module: 'EVENTS',
    displayName: 'Event Attendance',
    description: 'Track active check-ins, moderator markers, and no-shows.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['events.view'],
  },
  {
    key: 'DISCORD_SCHEDULED_EVENTS',
    module: 'EVENTS',
    displayName: 'Discord Event Sync',
    description: 'Synchronize community events automatically to Discord.',
    enabled: true,
    defaultAvailability: 'PRO',
    requiredPermissions: ['events.view'],
  },
  {
    key: 'CALENDAR_EVENT_SYNC',
    module: 'EVENTS',
    displayName: 'Google Calendar Event Sync',
    description: 'Synchronize community events automatically to Google Calendar.',
    enabled: true,
    defaultAvailability: 'PRO',
    requiredPermissions: ['events.view'],
  },

  // AUTOMATION
  {
    key: 'AUTOMATION',
    module: 'AUTOMATION',
    displayName: 'Automation Engine',
    description: 'Define trigger-action workflows for automated guild management.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['automation.view'],
  },
  {
    key: 'COMMUNITY_AUTOMATIONS',
    module: 'AUTOMATION',
    displayName: 'Basic Community Automations',
    description: 'Create basic trigger-action workflows.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['automation.view'],
    usageMetric: 'MAX_AUTOMATION_EXECUTIONS_PER_DAY',
  },
  {
    key: 'ADVANCED_AUTOMATIONS',
    module: 'AUTOMATION',
    displayName: 'Advanced Automations',
    description: 'Create multi-condition and high-complexity workflows.',
    enabled: true,
    defaultAvailability: 'PRO',
    requiredPermissions: ['automation.view'],
    usageMetric: 'MAX_AUTOMATION_EXECUTIONS_PER_DAY',
  },
  {
    key: 'SCHEDULED_AUTOMATIONS',
    module: 'AUTOMATION',
    displayName: 'Scheduled Automations',
    description: 'Execute automation workflows based on scheduled times.',
    enabled: true,
    defaultAvailability: 'PRO',
    requiredPermissions: ['automation.view'],
  },
  {
    key: 'AUTOMATION_DISCORD_ACTIONS',
    module: 'AUTOMATION',
    displayName: 'Discord Automation Actions',
    description: 'Send Discord messages and assign/remove roles dynamically.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['automation.view'],
  },
  {
    key: 'AUTOMATION_MODERATION_ACTIONS',
    module: 'AUTOMATION',
    displayName: 'Moderation Automation Actions',
    description: 'Issue warnings, apply blacklists, and automate safety incidents.',
    enabled: true,
    defaultAvailability: 'PRO',
    requiredPermissions: ['automation.view'],
  },
  {
    key: 'AUTOMATION_EVENT_ACTIONS',
    module: 'AUTOMATION',
    displayName: 'Event Automation Actions',
    description: 'Schedule event reminders and trigger-action flows for meetups.',
    enabled: true,
    defaultAvailability: 'PRO',
    requiredPermissions: ['automation.view'],
  },

  // INSIGHTS
  {
    key: 'INSIGHTS',
    module: 'INSIGHTS',
    displayName: 'Community Insights Foundation',
    description: 'Real-time metrics, growth trends, and health overview.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['reports.view'],
  },
  {
    key: 'COMMUNITY_ANALYTICS',
    module: 'INSIGHTS',
    displayName: 'Growth & Engagement Insights',
    description: 'Detailed growth metrics, active users, and chat counts.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['reports.view'],
  },
  {
    key: 'ADVANCED_ANALYTICS',
    module: 'INSIGHTS',
    displayName: 'Advanced Analytics Intelligence',
    description: 'Deep funnel drop-off, time-series projections, and long-range trends.',
    enabled: true,
    defaultAvailability: 'PRO',
    requiredPermissions: ['reports.view'],
  },
  {
    key: 'RECRUITMENT_ANALYTICS',
    module: 'INSIGHTS',
    displayName: 'Recruitment & Recruiter Analytics',
    description: 'Attribution velocity, recruiter conversion ratios, and pipeline funnels.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['reports.view'],
  },
  {
    key: 'MODERATION_ANALYTICS',
    module: 'INSIGHTS',
    displayName: 'Moderation & Safety Analytics',
    description: 'Incident severity breakdown, automod performance, and blacklist aging.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['reports.view'],
  },
  {
    key: 'EVENT_ANALYTICS',
    module: 'INSIGHTS',
    displayName: 'Event & Attendance Analytics',
    description: 'Authoritative attendance rates, waitlist conversion, and RSVP trends.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['reports.view'],
  },
  {
    key: 'AUTOMATION_ANALYTICS',
    module: 'INSIGHTS',
    displayName: 'Automation Workflow Analytics',
    description: 'Execution performance, retry volumes, and action delivery reliability.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['reports.view'],
  },
  {
    key: 'ANALYTICS_EXPORTS',
    module: 'INSIGHTS',
    displayName: 'Analytics CSV/JSON Exports',
    description: 'Authorized data exports of tenant analytics and activity metrics.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['reports.view'],
    usageMetric: 'MAX_EXPORTS_PER_DAY',
  },
  {
    key: 'COMMUNITY_HEALTH',
    module: 'INSIGHTS',
    displayName: 'Community Health Indicator',
    description: 'Multi-signal transparent community health score and contributing factors.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['reports.view'],
  },

  // AI
  {
    key: 'AI_ASSISTANT',
    module: 'AI',
    displayName: 'Community Brain',
    description: 'Leverage server-side Community Brain for insights and content drafting.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['applications.view'],
    usageMetric: 'MAX_AI_REQUESTS_PER_DAY',
  },
  {
    key: 'COMMUNITY_BRAIN',
    module: 'AI',
    displayName: 'Community Brain AI Intelligence',
    description: 'Authoritative Community Brain AI queries with factual grounding.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['reports.view'],
    usageMetric: 'MAX_AI_REQUESTS_PER_DAY',
  },
  {
    key: 'ADVANCED_AI',
    module: 'AI',
    displayName: 'Advanced Community Brain',
    description: 'Access deep reasoning, long context analysis, and multi-agent coordination.',
    enabled: true,
    defaultAvailability: 'PRO',
    requiredPermissions: ['applications.view'],
    usageMetric: 'MAX_AI_REQUESTS_PER_DAY',
  },

  // INTEGRATIONS
  {
    key: 'GOOGLE_FORMS',
    module: 'INTEGRATIONS',
    displayName: 'Google Forms Integration',
    description: 'Import questionnaire responses cleanly from Google Forms.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['settings.manage'],
  },
  {
    key: 'GOOGLE_CALENDAR',
    module: 'INTEGRATIONS',
    displayName: 'Google Calendar Integration',
    description: 'Schedule recruiter interviews synchronously to Calendar.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['settings.manage'],
  },
  {
    key: 'GOOGLE_SHEETS',
    module: 'INTEGRATIONS',
    displayName: 'Google Sheets Integration',
    description: 'Append recruiter benefit claim sheets cleanly.',
    enabled: true,
    defaultAvailability: 'FREE',
    requiredPermissions: ['settings.manage'],
    usageMetric: 'MAX_SHEET_WRITES_PER_DAY',
  },
  {
    key: 'GOOGLE_INTEGRATIONS',
    module: 'INTEGRATIONS',
    displayName: 'Advanced Google Integrations',
    description: 'Full automated sync across Forms, Sheets, Calendar, and Drive.',
    enabled: true,
    defaultAvailability: 'PRO',
    requiredPermissions: ['settings.manage'],
  },
  {
    key: 'API_ACCESS',
    module: 'INTEGRATIONS',
    displayName: 'REST API Access',
    description: 'Programmatic REST API keys and webhook integrations.',
    enabled: true,
    defaultAvailability: 'BUSINESS',
    requiredPermissions: ['settings.manage'],
  },
  {
    key: 'PRIORITY_CAPABILITIES',
    module: 'PLATFORM',
    displayName: 'Priority Processing',
    description: 'Dedicated high-throughput priority queue for processing.',
    enabled: true,
    defaultAvailability: 'BUSINESS',
    requiredPermissions: ['community.view'],
  },
];

export const STABLE_FEATURES: FeatureDefinition[] = RAW_FEATURES.map(f => ({
  id: f.key,
  ...f,
}));

export class PlanRegistry {
  private static plans: Map<PlanType, PlanDefinition> = new Map();

  static initialize() {
    (Object.keys(AUTHORITATIVE_PLANS) as PlanType[]).forEach((planKey) => {
      const def = AUTHORITATIVE_PLANS[planKey];
      let featureKeys: string[] = [];
      if (planKey === 'FREE') {
        featureKeys = STABLE_FEATURES.filter(f => f.defaultAvailability === 'FREE').map(f => f.key);
      } else if (planKey === 'PRO') {
        featureKeys = STABLE_FEATURES.filter(f => f.defaultAvailability === 'FREE' || f.defaultAvailability === 'PRO').map(f => f.key);
      } else {
        featureKeys = STABLE_FEATURES.map(f => f.key);
      }

      this.plans.set(planKey, {
        ...def,
        features: featureKeys,
        limits: {
          ...def.limits,
          MAX_AI_REQUESTS_PER_DAY: planKey === 'FREE' ? (config.MAX_AI_REQUESTS_PER_DAY || 100) : def.limits.MAX_AI_REQUESTS_PER_DAY,
        },
      });
    });
  }

  static get(plan: PlanType): PlanDefinition {
    if (!this.plans.has(plan)) {
      return this.plans.get('FREE')!;
    }
    return this.plans.get(plan)!;
  }

  static getAll(): PlanDefinition[] {
    return Array.from(this.plans.values());
  }

  static getLimit(plan: PlanType, limitKey: string): number {
    const p = this.get(plan);
    return p.limits[limitKey] ?? Infinity;
  }

  static hasFeature(plan: PlanType, featureKey: string): boolean {
    const p = this.get(plan);
    return p.features.includes(featureKey);
  }
}

PlanRegistry.initialize();

export class FeatureRegistry {
  private static features: Map<string, FeatureDefinition> = new Map();

  static initialize() {
    STABLE_FEATURES.forEach(f => {
      this.features.set(f.key, f);
    });
  }

  static register(feature: FeatureDefinition) {
    this.features.set(feature.key, feature);
  }

  static get(key: string): FeatureDefinition | undefined {
    return this.features.get(key);
  }

  static getAll(): FeatureDefinition[] {
    return Array.from(this.features.values());
  }
}

FeatureRegistry.initialize();

export class UsageService {
  /**
   * Authoritatively record usage for a community tenant
   */
  static async recordUsage(communityId: string, metricKey: string, amount: number = 1, date?: string): Promise<number> {
    const today = date || new Date().toISOString().split('T')[0];
    const trackingId = `${communityId}_${metricKey}_${today}`;

    let usageObj: CommunityUsage | null = null;
    try {
      usageObj = await communityUsagesRepository.getById(trackingId);
    } catch {
      usageObj = null;
    }

    const currentAmount = usageObj ? usageObj.amount : 0;
    const newTotal = currentAmount + amount;

    if (usageObj) {
      await communityUsagesRepository.update(trackingId, {
        amount: newTotal,
        updatedAt: new Date().toISOString(),
      });
    } else {
      await communityUsagesRepository.create({
        id: trackingId,
        communityId,
        metricKey,
        amount: newTotal,
        date: today,
        updatedAt: new Date().toISOString(),
      });
    }

    return newTotal;
  }

  /**
   * Get current usage count for tenant
   */
  static async getUsage(communityId: string, metricKey: string, date?: string): Promise<number> {
    const today = date || new Date().toISOString().split('T')[0];
    const trackingId = `${communityId}_${metricKey}_${today}`;

    try {
      const usageObj = await communityUsagesRepository.getById(trackingId);
      return usageObj ? usageObj.amount : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Check usage against plan limit
   */
  static async checkUsageLimit(
    communityId: string,
    metricKey: string,
    requestedAmount: number = 1,
    plan?: PlanType
  ): Promise<{ allowed: boolean; current: number; limit: number; status: 'AVAILABLE' | 'LIMIT_REACHED' }> {
    const current = await this.getUsage(communityId, metricKey);
    let effectivePlan: PlanType = plan || 'FREE';
    if (!plan) {
      try {
        const pObj = await EntitlementService.getPlan(communityId);
        effectivePlan = pObj.plan as PlanType;
      } catch {
        effectivePlan = 'FREE';
      }
    }
    const limit = PlanRegistry.getLimit(effectivePlan, metricKey);

    if (current + requestedAmount > limit) {
      return {
        allowed: false,
        current,
        limit,
        status: 'LIMIT_REACHED',
      };
    }

    return {
      allowed: true,
      current,
      limit,
      status: 'AVAILABLE',
    };
  }

  static async checkLimit(
    communityId: string,
    metricKey: string,
    requestedAmount: number = 1,
    plan: PlanType = 'FREE'
  ) {
    return this.checkUsageLimit(communityId, metricKey, requestedAmount, plan);
  }

  /**
   * Get complete usage snapshot for tenant
   */
  static async getUsageSnapshot(
    communityId: string,
    plan: PlanType = 'FREE'
  ): Promise<Record<string, { current: number; limit: number }>> {
    const today = new Date().toISOString().split('T')[0];
    const usages = await communityUsagesRepository.listForTenant(communityId);
    const todayUsages = usages.filter(u => u.date === today);

    const getValue = (key: string) => {
      const found = todayUsages.find(u => u.metricKey === key);
      return found ? found.amount : 0;
    };

    return {
      ai_requests: {
        current: getValue('MAX_AI_REQUESTS_PER_DAY'),
        limit: PlanRegistry.getLimit(plan, 'MAX_AI_REQUESTS_PER_DAY'),
      },
      automation_executions: {
        current: getValue('MAX_AUTOMATION_EXECUTIONS_PER_DAY'),
        limit: PlanRegistry.getLimit(plan, 'MAX_AUTOMATION_EXECUTIONS_PER_DAY'),
      },
      members: {
        current: getValue('MAX_MEMBERS'),
        limit: PlanRegistry.getLimit(plan, 'MAX_MEMBERS'),
      },
      communities: {
        current: getValue('MAX_COMMUNITIES'),
        limit: PlanRegistry.getLimit(plan, 'MAX_COMMUNITIES'),
      },
      exports: {
        current: getValue('MAX_EXPORTS_PER_DAY'),
        limit: PlanRegistry.getLimit(plan, 'MAX_EXPORTS_PER_DAY'),
      },
      scheduled_actions: {
        current: getValue('MAX_SCHEDULED_ACTIONS'),
        limit: PlanRegistry.getLimit(plan, 'MAX_SCHEDULED_ACTIONS'),
      },
      applications: {
        current: getValue('MAX_APPLICATIONS_PER_DAY'),
        limit: PlanRegistry.getLimit(plan, 'MAX_APPLICATIONS_PER_DAY'),
      },
      sheet_writes: {
        current: getValue('MAX_SHEET_WRITES_PER_DAY'),
        limit: PlanRegistry.getLimit(plan, 'MAX_SHEET_WRITES_PER_DAY'),
      },
    };
  }

  /**
   * Reset usage for testing or billing quota resets
   */
  static async resetUsage(communityId: string, metricKey?: string, date?: string): Promise<void> {
    const usages = await communityUsagesRepository.listForTenant(communityId);
    for (const u of usages) {
      if ((!metricKey || u.metricKey === metricKey) && (!date || u.date === date)) {
        await communityUsagesRepository.update(u.id, { amount: 0, updatedAt: new Date().toISOString() });
      }
    }
  }
}

export class EntitlementService {
  /**
   * Resolve plan for community (default: FREE, NOT_CONFIGURED)
   */
  static async getPlan(communityId: string): Promise<CommunityPlan> {
    const plans = await communityPlansRepository.listForTenant(communityId);
    if (plans.length > 0) {
      const p = plans[0];
      if (!['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'].includes(p.plan)) {
        p.plan = 'FREE';
      }
      return p;
    }

    // Default state: plan = FREE, subscriptionStatus = NOT_CONFIGURED, billingStatus = NOT_CONFIGURED
    const defaultPlan: CommunityPlan = {
      id: `plan_${communityId}`,
      communityId,
      plan: 'FREE',
      subscriptionStatus: 'NOT_CONFIGURED',
      billingStatus: 'NOT_CONFIGURED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await communityPlansRepository.create(defaultPlan);
    return defaultPlan;
  }

  /**
   * Set plan for community (validates allowed plan types)
   */
  static async setPlan(communityId: string, newPlan: string): Promise<CommunityPlan> {
    const validPlans: PlanType[] = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'];
    if (!validPlans.includes(newPlan as PlanType)) {
      throw new BadRequestError(`Invalid plan value [${newPlan}]. Must be one of: FREE, PRO, BUSINESS, ENTERPRISE`);
    }

    let planObj = await this.getPlan(communityId);
    planObj.plan = newPlan as PlanType;
    planObj.updatedAt = new Date().toISOString();

    await communityPlansRepository.update(planObj.id, {
      plan: newPlan as PlanType,
      updatedAt: planObj.updatedAt,
    });

    return planObj;
  }

  /**
   * Check if a feature is enabled and available in the community's plan
   */
  static async hasFeature(communityId: string, featureKey: string): Promise<boolean> {
    const check = await this.checkEntitlement(communityId, featureKey);
    return check.allowed;
  }

  /**
   * Synchronously checks if a plan grants a specific feature
   */
  static isFeatureEnabled(plan: PlanType, featureKey: string): boolean {
    return PlanRegistry.hasFeature(plan, featureKey);
  }

  /**
   * Comprehensive entitlement evaluation with reason and status codes
   */
  static async checkEntitlement(
    communityId: string,
    featureKey: string
  ): Promise<{
    allowed: boolean;
    status: 'AVAILABLE' | 'FEATURE_NOT_ENABLED' | 'BILLING_REQUIRED' | 'LIMIT_REACHED';
    reason?: string;
    requiredPlan?: string;
  }> {
    const definition = FeatureRegistry.get(featureKey);
    if (!definition || !definition.enabled) {
      return {
        allowed: false,
        status: 'FEATURE_NOT_ENABLED',
        reason: `Feature [${featureKey}] is disabled or not configured in platform`,
      };
    }

    const planObj = await this.getPlan(communityId);
    const plan = planObj.plan as PlanType;

    // Check custom overrides
    const overrides = await featureEntitlementsRepository.listForTenant(communityId);
    const override = overrides.find(o => o.featureKey === featureKey);
    if (override && !override.enabled) {
      return {
        allowed: false,
        status: 'FEATURE_NOT_ENABLED',
        reason: `Feature [${featureKey}] has been disabled for this community`,
      };
    }

    // Check plan membership
    const isGrantedByPlan = PlanRegistry.hasFeature(plan, featureKey);
    if (!isGrantedByPlan && !override?.enabled) {
      const requiredPlan = definition.defaultAvailability || 'PRO';
      return {
        allowed: false,
        status: 'BILLING_REQUIRED',
        reason: `Feature [${featureKey}] requires ${requiredPlan} plan upgrade.`,
        requiredPlan,
      };
    }

    // Check bound usage metric if present
    if (definition.usageMetric) {
      const limitCheck = await UsageService.checkUsageLimit(communityId, definition.usageMetric, 1, plan);
      if (!limitCheck.allowed) {
        return {
          allowed: false,
          status: 'LIMIT_REACHED',
          reason: `Usage limit reached for metric [${definition.usageMetric}] (${limitCheck.current}/${limitCheck.limit})`,
        };
      }
    }

    return {
      allowed: true,
      status: 'AVAILABLE',
    };
  }

  /**
   * Check dynamic usage limits (Authoritative Backend Enforcement)
   */
  static async checkLimit(communityId: string, usageKey: string, requestedAmount: number = 1): Promise<boolean> {
    const planObj = await this.getPlan(communityId);
    const check = await UsageService.checkUsageLimit(communityId, usageKey, requestedAmount, planObj.plan as PlanType);
    if (!check.allowed) {
      return false;
    }

    await UsageService.recordUsage(communityId, usageKey, requestedAmount);
    return true;
  }

  /**
   * Return entire list of features and entitlement statuses
   */
  static async getEntitlements(
    communityId: string
  ): Promise<
    Array<
      FeatureDefinition & {
        active: boolean;
        status: 'AVAILABLE' | 'FEATURE_NOT_ENABLED' | 'BILLING_REQUIRED' | 'LIMIT_REACHED';
        requiredPlan?: string;
      }
    >
  > {
    const features = FeatureRegistry.getAll();
    const result = [];

    for (const f of features) {
      const evalResult = await this.checkEntitlement(communityId, f.key);
      result.push({
        ...f,
        active: evalResult.allowed,
        status: evalResult.status,
        requiredPlan: evalResult.requiredPlan,
      });
    }

    return result;
  }

  /**
   * Get plan definition by plan type
   */
  static getPlanDefinition(plan: PlanType): PlanDefinition {
    return PlanRegistry.get(plan);
  }

  /**
   * Retrieve usage metrics snapshots
   */
  static async getUsage(communityId: string): Promise<Record<string, { current: number; limit: number }>> {
    const planObj = await this.getPlan(communityId);
    return UsageService.getUsageSnapshot(communityId, planObj.plan as PlanType);
  }

  /**
   * Authoritatively record metric usage
   */
  static async recordUsage(communityId: string, usageKey: string, amount: number = 1): Promise<void> {
    await UsageService.recordUsage(communityId, usageKey, amount);
  }
}
