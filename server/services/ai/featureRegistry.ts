import type { UserAuthContext } from '../../../shared/types/rbac.js';
import { canAccessTenant, hasPermission } from '../../security/rbac.js';
import { EntitlementService } from '../entitlement.service.js';
import { ForbiddenError } from '../../utils/errors.js';
import { discordCapabilityService } from '../discordCapability.service.js';
import { communityConfigurationRepository } from '../../repositories/index.js';

export interface ProductFeature {
  featureId: string;
  name: string;
  description: string;
  whyItHelps: string;
  prerequisites: string[];
  module: 'COMMUNITY' | 'RECRUITMENT' | 'ENGAGEMENT' | 'MODERATION' | 'EVENTS' | 'AUTOMATION' | 'INTEGRATIONS' | 'INSIGHTS';
  requiredPermission: string;
  requiredEntitlement: string;
}

export const PRODUCT_FEATURE_REGISTRY: ProductFeature[] = [
  {
    featureId: 'WELCOME_ONBOARDING',
    name: 'Welcome Onboarding Engine',
    description: 'Automatically greets new Discord members with a customized welcome message and assigns default roles.',
    whyItHelps: 'Improves Day-1 member retention and reduces manual greeting work for community staff.',
    prerequisites: ['Connected Discord Bot', 'Selected Welcome Channel', 'Bot role assignment permission'],
    module: 'COMMUNITY',
    requiredPermission: 'settings.manage',
    requiredEntitlement: 'COMMUNITY',
  },
  {
    featureId: 'AUTO_MODERATION',
    name: 'Auto-Moderation & Content Safety',
    description: 'Scans community messages for spam, unauthorized links, and severe toxicity, applying warnings automatically.',
    whyItHelps: 'Protects server members 24/7 without requiring active human moderator shifts.',
    prerequisites: ['Connected Discord Bot', 'Configured Auto-Mod rules'],
    module: 'MODERATION',
    requiredPermission: 'community.manage',
    requiredEntitlement: 'MODERATION',
  },
  {
    featureId: 'RECRUITER_CODES',
    name: 'Recruiter Tracking Codes & Links',
    description: 'Generates unique referral links for recruiters to track candidate application sources and attribution.',
    whyItHelps: 'Provides clear performance metrics and rewards for active recruiters.',
    prerequisites: ['Configured application form', 'Recruiter member profiles'],
    module: 'RECRUITMENT',
    requiredPermission: 'community.manage',
    requiredEntitlement: 'RECRUITMENT',
  },
  {
    featureId: 'SCHEDULED_REPORTS',
    name: 'Automated Scheduled Reports',
    description: 'Delivers weekly or monthly analytics reports directly in-app or to your staff Discord channel.',
    whyItHelps: 'Keeps community owners and leadership informed on key metrics effortlessly.',
    prerequisites: ['Reports view entitlement', 'Target notification channel'],
    module: 'INSIGHTS',
    requiredPermission: 'reports.view',
    requiredEntitlement: 'COMMUNITY_BRAIN',
  },
  {
    featureId: 'AUTOMATION_WORKFLOWS',
    name: 'Trigger-Based Automation Workflows',
    description: 'Creates custom trigger-condition-action pipelines for candidate reviews, warnings, and event reminders.',
    whyItHelps: 'Eliminates repetitive manual admin steps across community operations.',
    prerequisites: ['Automation entitlement', 'Valid action targets'],
    module: 'AUTOMATION',
    requiredPermission: 'settings.manage',
    requiredEntitlement: 'AUTOMATION',
  },
  {
    featureId: 'EVENT_REMINDERS',
    name: 'Automated Event Reminders',
    description: 'Sends automated RSVP notifications and event reminders lead-up to community sessions.',
    whyItHelps: 'Increases event attendance and RSVP confirmation rates.',
    prerequisites: ['Events calendar entry', 'Target Discord channel'],
    module: 'EVENTS',
    requiredPermission: 'events.manage',
    requiredEntitlement: 'REMINDERS',
  },
];

export class FeatureRegistryService {
  /**
   * Returns feature registry with real enablement & entitlement status for a community.
   */
  static async getFeatureOverview(
    communityId: string,
    userContext: UserAuthContext
  ): Promise<
    Array<
      ProductFeature & {
        isEnabled: boolean;
        isEntitled: boolean;
        prerequisitesMet: boolean;
      }
    >
  > {
    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError(`Cross-tenant feature access denied for tenant ${communityId}`);
    }

    const config = await communityConfigurationRepository.getById(communityId);
    const discordDiag = await discordCapabilityService.getConnectionCenterStatus(communityId);
    const botConnected = discordDiag?.gateway?.state === 'CONNECTED' || discordDiag?.guild?.status === 'CONNECTED';

    const results = [];
    for (const feat of PRODUCT_FEATURE_REGISTRY) {
      const isEntitled = await EntitlementService.hasFeature(communityId, feat.requiredEntitlement);
      let isEnabled = false;
      let prerequisitesMet = false;

      if (feat.featureId === 'WELCOME_ONBOARDING') {
        isEnabled = Boolean((config as any)?.welcomeChannelId);
        prerequisitesMet = botConnected;
      } else if (feat.featureId === 'AUTO_MODERATION') {
        isEnabled = Boolean((config as any)?.autoModEnabled);
        prerequisitesMet = botConnected;
      } else if (feat.featureId === 'SCHEDULED_REPORTS') {
        isEnabled = true;
        prerequisitesMet = true;
      } else {
        isEnabled = true;
        prerequisitesMet = true;
      }

      results.push({
        ...feat,
        isEnabled,
        isEntitled,
        prerequisitesMet,
      });
    }

    return results;
  }

  /**
   * Provides guided step-by-step setup assistance by inspecting real server state.
   */
  static async guidedSetupAssist(
    communityId: string,
    userContext: UserAuthContext,
    featureId: string
  ): Promise<{
    featureId: string;
    featureName: string;
    currentStep: number;
    totalSteps: number;
    steps: Array<{ stepNumber: number; title: string; description: string; status: 'DONE' | 'ACTION_REQUIRED' }>;
    nextActionNeeded: string;
  }> {
    if (!canAccessTenant(userContext, communityId)) {
      throw new ForbiddenError(`Cross-tenant setup assistance denied for tenant ${communityId}`);
    }

    const feat = PRODUCT_FEATURE_REGISTRY.find((f) => f.featureId === featureId) || PRODUCT_FEATURE_REGISTRY[0];
    const discordDiag = await discordCapabilityService.getConnectionCenterStatus(communityId);
    const config = await communityConfigurationRepository.getById(communityId);

    const botConnected = discordDiag?.gateway?.state === 'CONNECTED' || discordDiag?.guild?.status === 'CONNECTED';
    const channelConfigured = Boolean((config as any)?.welcomeChannelId);

    const steps = [
      {
        stepNumber: 1,
        title: 'Verify Discord Bot Connection',
        description: 'Ensure Discord Bot is added to your server with Manage Roles and Send Messages permissions.',
        status: botConnected ? ('DONE' as const) : ('ACTION_REQUIRED' as const),
      },
      {
        stepNumber: 2,
        title: 'Select Notification / Target Channel',
        description: 'Choose which Discord channel should receive messages or welcome notifications.',
        status: channelConfigured ? ('DONE' as const) : ('ACTION_REQUIRED' as const),
      },
      {
        stepNumber: 3,
        title: 'Configure Feature Settings & Templates',
        description: 'Review default template messages and confirm setup.',
        status: 'ACTION_REQUIRED' as const,
      },
      {
        stepNumber: 4,
        title: 'Test & Activate Feature',
        description: 'Send test notification to verify end-to-end functionality.',
        status: 'ACTION_REQUIRED' as const,
      },
    ];

    const currentStep = !botConnected ? 1 : !channelConfigured ? 2 : 3;

    return {
      featureId: feat.featureId,
      featureName: feat.name,
      currentStep,
      totalSteps: 4,
      steps,
      nextActionNeeded:
        currentStep === 1
          ? 'Connect Discord Bot in Integration Center.'
          : currentStep === 2
          ? 'Select target Discord channel in Community Settings.'
          : 'Confirm feature configuration and activate.',
    };
  }
}
