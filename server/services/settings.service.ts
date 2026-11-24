import {
  ConsolidatedCommunitySettings,
  GeneralSettings,
  CommunityCustomSettings,
  PermissionsSettings,
  RecruitmentSettingsSection,
  NotificationsSettingsSection,
  PlansUsageSettingsSection,
  SecuritySettingsSection,
  CommunitySettingsDiagnostics,
  DiagnosticItem,
  UpdateCommunitySettingsPayload,
  ConfigurationDiagnosticStatus,
  SettingsSectionKey,
  RolePermissionConfig,
  NotificationCategoryConfig,
} from '../../shared/types/settings.js';
import { UserRole, DEFAULT_ROLE_PERMISSIONS, ALL_COMMUNITY_PERMISSIONS } from '../../shared/types/rbac.js';
import {
  communitiesRepository,
  communityConfigurationRepository,
  rolesRepository,
  recruiterRecordConfigsRepository,
  googleCalendarConfigsRepository,
  googleSheetsConfigsRepository,
  auditLogsRepository,
} from '../repositories/index.js';
import { auditService } from './audit.service.js';
import { EntitlementService, UsageService } from './entitlement.service.js';
import { AutomationEventBusService } from './automation.service.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { logger } from '../logging/logger.js';
import { isValidTimezone as checkTimezone } from './schedule.service.js';

export const SUPPORTED_LOCALES = [
  'en-US',
  'en-GB',
  'en-CA',
  'en-AU',
  'es-ES',
  'fr-FR',
  'de-DE',
  'ja-JP',
  'pt-BR',
  'hi-IN',
  'zh-CN',
  'ko-KR',
  'it-IT',
  'nl-NL',
  'ru-RU',
];

export function isValidTimezone(tz: string): boolean {
  return checkTimezone(tz);
}

export function isValidLocale(loc: string): boolean {
  if (!loc || typeof loc !== 'string') return false;
  return SUPPORTED_LOCALES.includes(loc.trim());
}

/**
 * Strips any sensitive properties (credentials, tokens, secrets) before serialization/auditing.
 */
export function sanitizeSettingsData<T extends Record<string, any>>(data: T): T {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeSettingsData(item)) as any;
  }
  const clone = { ...data } as any;
  const sensitiveKeys = [
    'token',
    'secret',
    'refreshtoken',
    'accesstoken',
    'apikey',
    'password',
    'clientsecret',
    'bottoken',
    'privatekey',
  ];
  for (const key of Object.keys(clone)) {
    const val = clone[key];
    const lowerKey = key.toLowerCase();
    if (typeof val === 'object' && val !== null) {
      clone[key] = sanitizeSettingsData(val);
    } else if (sensitiveKeys.some((s) => lowerKey.includes(s))) {
      clone[key] = '[REDACTED]';
    }
  }
  return clone;
}

// In-memory cache for fast consolidated settings access with invalidation
const settingsCache = new Map<string, { data: ConsolidatedCommunitySettings; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

export class SettingsValidationService {
  static validateGeneral(general: Partial<GeneralSettings>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (general.displayName !== undefined) {
      if (typeof general.displayName !== 'string' || general.displayName.trim().length === 0) {
        errors.push('Display name cannot be empty.');
      } else if (general.displayName.trim().length > 100) {
        errors.push('Display name cannot exceed 100 characters.');
      }
    }
    if (general.timezone !== undefined) {
      if (!isValidTimezone(general.timezone)) {
        errors.push(`INVALID_TIMEZONE: "${general.timezone}" is not a valid IANA timezone identifier.`);
      }
    }
    if (general.locale !== undefined) {
      if (!isValidLocale(general.locale)) {
        errors.push(`INVALID_LOCALE: "${general.locale}" is not a supported locale identifier.`);
      }
    }
    if (general.dateTimeFormat !== undefined) {
      if (!['12_HOUR', '24_HOUR'].includes(general.dateTimeFormat)) {
        errors.push('dateTimeFormat must be 12_HOUR or 24_HOUR.');
      }
    }
    if (general.defaultLandingContext !== undefined) {
      if (!['OVERVIEW', 'APPLICATIONS', 'ENGAGEMENT', 'EVENTS'].includes(general.defaultLandingContext)) {
        errors.push('defaultLandingContext must be OVERVIEW, APPLICATIONS, ENGAGEMENT, or EVENTS.');
      }
    }
    return { valid: errors.length === 0, errors };
  }

  static validateCommunity(community: Partial<CommunityCustomSettings>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (community.massMentionPolicy !== undefined) {
      if (!['DISABLED', 'RESTRICTED', 'ADMIN_ONLY'].includes(community.massMentionPolicy)) {
        errors.push('massMentionPolicy must be DISABLED, RESTRICTED, or ADMIN_ONLY.');
      }
    }
    if (community.welcomeMessageEnabled && (!community.welcomeGreeting || community.welcomeGreeting.trim().length < 3)) {
      errors.push('Welcome greeting must be at least 3 characters when welcome messages are enabled.');
    }
    if (community.rules !== undefined && !Array.isArray(community.rules)) {
      errors.push('rules must be an array of strings.');
    }
    if (community.guidelines !== undefined && !Array.isArray(community.guidelines)) {
      errors.push('guidelines must be an array of strings.');
    }
    return { valid: errors.length === 0, errors };
  }

  static validatePermissions(
    permissions: Partial<PermissionsSettings>,
    actorRole: UserRole
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (permissions.allowSelfAssignment === true) {
      errors.push('Self-assignment of privileged roles is strictly forbidden.');
    }

    if (permissions.roleMappings) {
      // Protect OWNER role from being tampered with by non-owners
      if (actorRole !== 'OWNER' && actorRole !== 'PLATFORM_OWNER') {
        const ownerMapping = permissions.roleMappings.OWNER;
        if (ownerMapping) {
          errors.push('Only SERVER_OWNER / PLATFORM_OWNER can modify SERVER_OWNER role mappings.');
        }
      }

      for (const [roleKey, roleConfig] of Object.entries(permissions.roleMappings)) {
        if (!['OWNER', 'CONTROLLER', 'INTERVIEWER', 'RECRUITER', 'MEMBER', 'APPLICANT', 'PLATFORM_OWNER'].includes(roleKey)) {
          errors.push(`Unrecognized role "${roleKey}" in roleMappings.`);
        }
        if (roleConfig.permissions && Array.isArray(roleConfig.permissions)) {
          for (const perm of roleConfig.permissions) {
            if (!(ALL_COMMUNITY_PERMISSIONS as readonly string[]).includes(perm)) {
              errors.push(`Invalid community permission "${perm}".`);
            }
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  static validateRecruitment(recruitment: Partial<RecruitmentSettingsSection>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (recruitment.screeningThreshold !== undefined) {
      if (typeof recruitment.screeningThreshold !== 'number' || recruitment.screeningThreshold < 0 || recruitment.screeningThreshold > 100) {
        errors.push('screeningThreshold must be a number between 0 and 100.');
      }
    }
    if (recruitment.recruiterDisplayName !== undefined) {
      if (typeof recruitment.recruiterDisplayName !== 'string' || recruitment.recruiterDisplayName.trim().length < 2) {
        errors.push('recruiterDisplayName must be at least 2 characters.');
      }
    }
    return { valid: errors.length === 0, errors };
  }

  static validateNotifications(notifications: Partial<NotificationsSettingsSection>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (notifications.summaryFrequency !== undefined) {
      if (!['INSTANT', 'DAILY', 'WEEKLY'].includes(notifications.summaryFrequency)) {
        errors.push('summaryFrequency must be INSTANT, DAILY, or WEEKLY.');
      }
    }
    if (notifications.categories) {
      for (const [key, cat] of Object.entries(notifications.categories)) {
        if (!['DISCORD', 'NOTIFICATION_CENTER', 'EMAIL'].includes(cat.destination)) {
          errors.push(`Invalid destination "${cat.destination}" for category ${key}.`);
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  static validateSecurity(security: Partial<SecuritySettingsSection>, actorRole: UserRole): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (security.massMentionPolicy !== undefined) {
      if (!['DISABLED', 'RESTRICTED', 'ADMIN_ONLY'].includes(security.massMentionPolicy)) {
        errors.push('massMentionPolicy must be DISABLED, RESTRICTED, or ADMIN_ONLY.');
      }
      if (security.massMentionPolicy !== 'DISABLED' && actorRole !== 'OWNER' && actorRole !== 'PLATFORM_OWNER') {
        errors.push('Enabling mass mentions requires SERVER_OWNER authorization.');
      }
    }
    if (security.moderationBaselineSeverity !== undefined) {
      if (!['LOW', 'MEDIUM', 'HIGH'].includes(security.moderationBaselineSeverity)) {
        errors.push('moderationBaselineSeverity must be LOW, MEDIUM, or HIGH.');
      }
    }
    return { valid: errors.length === 0, errors };
  }

  static async evaluateDiagnostics(
    communityId: string,
    settings: Omit<ConsolidatedCommunitySettings, 'diagnostics'>
  ): Promise<CommunitySettingsDiagnostics> {
    const items: DiagnosticItem[] = [];

    // 1. General checks
    if (!settings.general.timezone || settings.general.timezone === 'UTC') {
      items.push({
        category: 'GENERAL',
        settingKey: 'timezone',
        status: 'READY',
        message: `Active timezone: ${settings.general.timezone || 'UTC'}.`,
      });
    } else {
      items.push({
        category: 'GENERAL',
        settingKey: 'timezone',
        status: 'READY',
        message: `Configured IANA timezone: ${settings.general.timezone}.`,
      });
    }

    // 2. Welcome Message Dependency
    if (settings.community.welcomeMessageEnabled) {
      if (!settings.community.welcomeChannelName && !settings.community.welcomeChannelId) {
        items.push({
          category: 'COMMUNITY',
          settingKey: 'welcomeChannel',
          status: 'CONFIGURATION_REQUIRED',
          message: 'Welcome message is enabled but no target welcome channel is configured.',
          remediation: 'Configure a valid Discord welcome channel name or ID.',
        });
      } else {
        items.push({
          category: 'COMMUNITY',
          settingKey: 'welcomeMessage',
          status: 'READY',
          message: `Welcome messages active for ${settings.community.welcomeChannelName || 'configured channel'}.`,
        });
      }
    }

    // 3. Calendar Dependency for Recruitment
    if (settings.recruitment.calendarRequirementEnabled) {
      const calConfig = await googleCalendarConfigsRepository.getById(communityId);
      if (!calConfig || calConfig.status !== 'CONNECTED') {
        items.push({
          category: 'RECRUITMENT',
          settingKey: 'calendarRequirement',
          status: 'INTEGRATION_REQUIRED',
          message: 'Interview calendar requirement is enabled, but Google Calendar integration is not connected.',
          remediation: 'Connect Google Calendar integration in the Integrations hub.',
        });
      } else {
        items.push({
          category: 'RECRUITMENT',
          settingKey: 'calendarRequirement',
          status: 'READY',
          message: 'Google Calendar integration connected and verified.',
        });
      }
    }

    // 4. Recruiter Record Dependency
    if (settings.recruitment.recordEnabled) {
      if (!settings.recruitment.recordChannelName) {
        items.push({
          category: 'RECRUITMENT',
          settingKey: 'recordChannel',
          status: 'CONFIGURATION_REQUIRED',
          message: 'Recruiter records are enabled but no announcement channel is set.',
          remediation: 'Specify a channel for publishing verified recruiter records (e.g. #recruiter-records).',
        });
      } else {
        items.push({
          category: 'RECRUITMENT',
          settingKey: 'recruiterRecords',
          status: 'READY',
          message: `Recruiter records routing to ${settings.recruitment.recordChannelName}.`,
        });
      }
    }

    // 5. Discord Role Mappings
    for (const [role, config] of Object.entries(settings.permissions.roleMappings)) {
      if ((role === 'CONTROLLER' || role === 'INTERVIEWER' || role === 'RECRUITER') && !config.discordRoleId && !config.discordRoleName) {
        items.push({
          category: 'PERMISSIONS',
          settingKey: `roleMapping_${role}`,
          status: 'CONFIGURATION_REQUIRED',
          message: `Discord role mapping for ${role} is not configured.`,
          remediation: `Map a Discord role to ${role} in Permissions settings.`,
        });
      }
    }

    // 6. Moderation Log Channel
    if (settings.security.moderationLogChannel) {
      items.push({
        category: 'SECURITY',
        settingKey: 'moderationLogs',
        status: 'READY',
        message: `Moderation events routed to ${settings.security.moderationLogChannel}.`,
      });
    }

    // Calculate summary
    const readyCount = items.filter((i) => i.status === 'READY').length;
    const warningCount = items.filter(
      (i) => i.status === 'CONFIGURATION_REQUIRED' || i.status === 'INTEGRATION_REQUIRED' || i.status === 'PERMISSION_REQUIRED'
    ).length;
    const errorCount = items.filter((i) => i.status === 'ERROR' || i.status === 'DISCORD_LIMITATION').length;

    let overallStatus: ConfigurationDiagnosticStatus = 'READY';
    if (errorCount > 0) {
      overallStatus = 'ERROR';
    } else if (items.some((i) => i.status === 'INTEGRATION_REQUIRED')) {
      overallStatus = 'INTEGRATION_REQUIRED';
    } else if (warningCount > 0) {
      overallStatus = 'CONFIGURATION_REQUIRED';
    }

    return {
      overallStatus,
      readyCount,
      warningCount,
      errorCount,
      items,
      evaluatedAt: new Date().toISOString(),
    };
  }
}

export class SettingsAuditService {
  static async auditSettingChange(params: {
    communityId: string;
    actorUserId: string;
    actorRole: UserRole;
    action:
      | 'SETTING_CREATED'
      | 'SETTING_UPDATED'
      | 'SETTING_RESET'
      | 'SETTING_VALIDATION_FAILED'
      | 'COMMUNITY_SETTINGS_UPDATED'
      | 'PERMISSION_SETTINGS_UPDATED'
      | 'RECRUITMENT_SETTINGS_UPDATED'
      | 'NOTIFICATION_SETTINGS_UPDATED'
      | 'SECURITY_SETTINGS_UPDATED';
    section: SettingsSectionKey | 'ALL';
    previousSummary: Record<string, any>;
    newSummary: Record<string, any>;
    result?: string;
  }): Promise<void> {
    try {
      await auditService.record({
        communityId: params.communityId,
        actorUserId: params.actorUserId,
        actorRole: params.actorRole,
        action: params.action,
        targetType: 'community_settings',
        targetId: `${params.communityId}:${params.section}`,
        metadata: {
          section: params.section,
          previousState: sanitizeSettingsData(params.previousSummary),
          newState: sanitizeSettingsData(params.newSummary),
          result: params.result || 'SUCCESS',
        },
      });
    } catch (err: any) {
      logger.error(`Failed to write settings audit log: ${err?.message || err}`);
    }
  }
}

export class SettingsVersionService {
  static incrementVersion(currentVersion: number = 1): number {
    return (currentVersion || 1) + 1;
  }
}

export class SettingsService {
  /**
   * Invalidate in-memory cached settings for a community.
   */
  static invalidateCache(communityId: string): void {
    settingsCache.delete(communityId);
  }

  /**
   * Retrieves the unified, consolidated configuration control plane for a tenant community.
   */
  static async getConsolidatedSettings(communityId: string): Promise<ConsolidatedCommunitySettings> {
    if (!communityId) {
      throw new BadRequestError('communityId is required');
    }

    const cached = settingsCache.get(communityId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    // 1. Fetch community document & configuration document
    const [community, configDoc, recordConfigs, roleDocs, planData] = await Promise.all([
      communitiesRepository.getById(communityId),
      communityConfigurationRepository.getById(communityId),
      recruiterRecordConfigsRepository.listForTenant(communityId),
      rolesRepository.listForTenant(communityId),
      EntitlementService.getPlan(communityId).catch(() => ({ plan: 'FREE' as const, status: 'NOT_CONFIGURED' as const })),
    ]);

    if (!community && !configDoc) {
      throw new NotFoundError(`Community ${communityId} not found.`);
    }

    const now = new Date().toISOString();
    const existingRecordConfig = recordConfigs && recordConfigs.length > 0 ? recordConfigs[0] : null;

    // 2. Build General Settings
    const general: GeneralSettings = {
      displayName: community?.name || configDoc?.communityName || 'Discord Community',
      guildName: (community as any)?.discordGuildName || community?.name || 'Discord Guild',
      timezone: community?.timezone || configDoc?.timezone || 'UTC',
      locale: (community as any)?.locale || 'en-US',
      dateTimeFormat: (configDoc as any)?.generalExtra?.dateTimeFormat === '24_HOUR' ? '24_HOUR' : '12_HOUR',
      description: configDoc?.description || (community as any)?.description || 'Community recruiting and engagement management.',
      defaultLandingContext: (['OVERVIEW', 'APPLICATIONS', 'ENGAGEMENT', 'EVENTS'].includes((configDoc as any)?.generalExtra?.defaultLandingContext) ? (configDoc as any).generalExtra.defaultLandingContext : 'OVERVIEW'),
    };

    // 3. Build Community Custom Settings
    const communitySection: CommunityCustomSettings = {
      welcomeMessageEnabled: configDoc?.welcomeMessageEnabled !== false,
      welcomeGreeting: configDoc?.recruiterWelcomeGreeting || "Welcome to the community! We're thrilled to have you here.",
      welcomeChannelName: configDoc?.welcomeChannelName || '#general',
      welcomeChannelId: configDoc?.welcomeChannelId,
      onboardingRulesLink: (configDoc as any)?.communityExtra?.onboardingRulesLink ?? 'https://discord.com/guidelines',
      codeOfConductLink: (configDoc as any)?.communityExtra?.codeOfConductLink ?? 'https://discord.com/terms',
      rulesChannelName: configDoc?.rulesChannelName || '#rules',
      rulesChannelId: configDoc?.rulesChannelId,
      massMentionPolicy: (configDoc as any)?.communityExtra?.massMentionPolicy || 'DISABLED',
      dmNotificationsEnabled: configDoc?.dmNotificationsEnabled !== false,
      rules: configDoc?.rules || ['Be respectful', 'No spamming', 'Follow community guidelines'],
      guidelines: configDoc?.guidelines || ['Participate constructively', 'Support your fellow members'],
    };

    // 4. Build Permissions Settings
    const roleMappings: Record<UserRole, RolePermissionConfig> = {
      PLATFORM_OWNER: {
        role: 'PLATFORM_OWNER',
        description: 'Global system platform administration.',
        isProtected: true,
        permissions: [...DEFAULT_ROLE_PERMISSIONS.PLATFORM_OWNER],
        status: 'READY',
      },
      OWNER: {
        role: 'OWNER',
        discordRoleName: 'Server Owner / Administrator',
        description: 'Complete authoritative owner of the Discord community.',
        isProtected: true,
        permissions: [...DEFAULT_ROLE_PERMISSIONS.OWNER],
        status: 'READY',
      },
      CONTROLLER: {
        role: 'CONTROLLER',
        discordRoleName: 'Admin / Moderator',
        description: 'Community leadership, operational management and review.',
        isProtected: false,
        permissions: [...DEFAULT_ROLE_PERMISSIONS.CONTROLLER],
        status: 'READY',
      },
      INTERVIEWER: {
        role: 'INTERVIEWER',
        discordRoleName: 'Interviewer',
        description: 'Conducts candidate screening, interviews, and reviews.',
        isProtected: false,
        permissions: [...DEFAULT_ROLE_PERMISSIONS.INTERVIEWER],
        status: 'READY',
      },
      RECRUITER: {
        role: 'RECRUITER',
        discordRoleName: 'Recruiter',
        description: 'Generates recruiter codes, invites applicants, tracks rewards.',
        isProtected: false,
        permissions: [...DEFAULT_ROLE_PERMISSIONS.RECRUITER],
        status: 'READY',
      },
      MEMBER: {
        role: 'MEMBER',
        discordRoleName: '@everyone',
        description: 'Synchronized verified community member.',
        isProtected: false,
        permissions: [...DEFAULT_ROLE_PERMISSIONS.MEMBER],
        status: 'READY',
      },
      APPLICANT: {
        role: 'APPLICANT',
        discordRoleName: 'Applicant',
        description: 'Prospective member in application or interview workflow.',
        isProtected: false,
        permissions: [...DEFAULT_ROLE_PERMISSIONS.APPLICANT],
        status: 'READY',
      },
    };

    // Apply any customized stored role overrides from rolesRepository
    if (roleDocs && roleDocs.length > 0) {
      for (const rDoc of roleDocs) {
        const roleKey = ((rDoc as any).role || rDoc.canonicalRole || rDoc.type) as UserRole;
        if (roleKey && roleMappings[roleKey]) {
          const target = roleMappings[roleKey];
          if (rDoc.discordRoleId) target.discordRoleId = rDoc.discordRoleId;
          if ((rDoc as any).discordRoleName || rDoc.name) target.discordRoleName = (rDoc as any).discordRoleName || rDoc.name;
          if (rDoc.permissions && Array.isArray(rDoc.permissions) && !target.isProtected) {
            target.permissions = rDoc.permissions;
          }
        }
      }
    }

    const permissions: PermissionsSettings = {
      roleMappings,
      allowSelfAssignment: false,
      hierarchyEnforced: true,
      status: 'READY',
    };

    // 5. Build Recruitment Settings
    const recruitment: RecruitmentSettingsSection = {
      applicationEnabled: configDoc?.applicationEnabled !== false,
      interviewEnabled: configDoc?.interviewEnabled !== false,
      screeningThreshold: (configDoc as any)?.screeningThreshold !== undefined ? (configDoc as any).screeningThreshold : 75,
      recruiterCodeRequired: configDoc?.recruiterCodeRequired !== false,
      automaticRecruiterCodeGeneration: configDoc?.automaticRecruiterCodeGeneration !== false,
      manualRecruiterCodesAllowed: configDoc?.manualRecruiterCodesAllowed !== false,
      recruiterPersonaEnabled: configDoc?.recruiterPersonaEnabled !== false,
      recruiterDisplayName: configDoc?.recruiterDisplayName || 'Community Recruiter',
      recruiterWelcomeGreeting: (configDoc as any)?.recruiterIntroMessage || "Hi! I'm {{recruiterName}}. I'll help guide you through the process.",
      recordEnabled: existingRecordConfig ? (existingRecordConfig as any).enabled !== false : true,
      recordChannelName: (existingRecordConfig as any)?.channelName || (existingRecordConfig as any)?.channelId || '#recruiter-records',
      recordChannelId: (existingRecordConfig as any)?.channelId,
      recordTemplate: (existingRecordConfig as any)?.messageTemplate || (existingRecordConfig as any)?.initialMessageTemplate || '🎉 **Recruitment Verified!** Recruiter {{recruiterMention}} invited {{applicantName}}!',
      blacklistEnforcementEnabled: (configDoc as any)?.blacklistEnforcementEnabled !== false,
      calendarRequirementEnabled: (configDoc as any)?.calendarRequirementEnabled === true,
    };

    // 6. Build Notification Settings
    const notifications: NotificationsSettingsSection = {
      categories: {
        recruitment: {
          category: 'recruitment',
          name: 'Recruitment & Applications',
          enabled: true,
          destination: 'DISCORD',
          channelName: '#recruitment-alerts',
          minimumRole: 'RECRUITER',
          status: 'READY',
        },
        engagement: {
          category: 'engagement',
          name: 'Member Engagement & Welcome',
          enabled: true,
          destination: 'DISCORD',
          channelName: '#general',
          minimumRole: 'MEMBER',
          status: 'READY',
        },
        moderation: {
          category: 'moderation',
          name: 'Moderation & Safety Alerts',
          enabled: true,
          destination: 'DISCORD',
          channelName: '#mod-logs',
          minimumRole: 'CONTROLLER',
          status: 'READY',
        },
        events: {
          category: 'events',
          name: 'Events & Automations',
          enabled: true,
          destination: 'NOTIFICATION_CENTER',
          minimumRole: 'CONTROLLER',
          status: 'READY',
        },
        integrations: {
          category: 'integrations',
          name: 'Integration Synchronization Health',
          enabled: true,
          destination: 'NOTIFICATION_CENTER',
          minimumRole: 'CONTROLLER',
          status: 'READY',
        },
        security: {
          category: 'security',
          name: 'Security & Access Warnings',
          enabled: true,
          destination: 'DISCORD',
          channelName: '#security-logs',
          minimumRole: 'OWNER',
          status: 'READY',
        },
        system: {
          category: 'system',
          name: 'System Announcements',
          enabled: true,
          destination: 'NOTIFICATION_CENTER',
          minimumRole: 'MEMBER',
          status: 'READY',
        },
      },
      dmDeliveryFallback: true,
      summaryFrequency: 'INSTANT',
    };
    // Apply what the owner saved (the defaults above are only the starting point).
    const savedNotif = (configDoc as any)?.notificationSettings;
    if (savedNotif) {
      if (typeof savedNotif.dmDeliveryFallback === 'boolean') notifications.dmDeliveryFallback = savedNotif.dmDeliveryFallback;
      if (['INSTANT', 'DAILY', 'WEEKLY'].includes(savedNotif.summaryFrequency)) notifications.summaryFrequency = savedNotif.summaryFrequency;
      for (const [k, v] of Object.entries<any>(savedNotif.categories || {})) {
        if (notifications.categories[k] && v) notifications.categories[k] = { ...notifications.categories[k], ...v, category: notifications.categories[k].category, name: notifications.categories[k].name, status: 'READY' };
      }
    }

    // 7. Build Plans & Usage Section
    const rawUsage = await UsageService.getUsageSnapshot(communityId).catch(() => ({}));
    const rawEntitlements = await EntitlementService.getEntitlements(communityId).catch(() => ({}));

    const plansUsage: PlansUsageSettingsSection = {
      plan: (planData as any)?.plan || 'FREE',
      billingStatus: (planData as any)?.status || 'ACTIVE',
      currentPeriodEnd: (planData as any)?.currentPeriodEnd,
      quotas: {
        members: { used: (rawUsage as any)?.members?.current || 0, limit: 1000, remaining: 1000 },
        recruiters: { used: (rawUsage as any)?.recruiters?.current || 0, limit: 50, remaining: 50 },
        aiQueries: { used: (rawUsage as any)?.aiQueries?.current || 0, limit: 500, remaining: 500 },
        automations: { used: (rawUsage as any)?.automations?.current || 0, limit: 100, remaining: 100 },
      },
      featureAccess: {
        aiIntelligence: true,
        advancedIntegrations: true,
        customBranding: true,
        eventAutomation: true,
      },
      isOverLimit: false,
    };

    // 8. Build Security Settings
    const security: SecuritySettingsSection = {
      massMentionPolicy: (configDoc as any)?.securitySettings?.massMentionPolicy || 'DISABLED',
      moderationBaselineSeverity: (configDoc as any)?.securitySettings?.moderationBaselineSeverity || 'MEDIUM',
      moderationLogChannel: (configDoc as any)?.securitySettings?.moderationLogChannel ?? '#mod-logs',
      blacklistEnforcement: (configDoc as any)?.securitySettings?.blacklistEnforcement !== false,
      suspiciousActivityAlerts: (configDoc as any)?.securitySettings?.suspiciousActivityAlerts !== false,
      auditRetentionDays: 30,
      auditRetentionPolicyNotice: 'Platform security policy enforces a 30-day immutable audit trail for security compliance.',
      securityNotificationsEnabled: (configDoc as any)?.securitySettings?.securityNotificationsEnabled !== false,
    };

    // 9. Run Diagnostics
    const baseSettings = {
      communityId,
      version: (configDoc as any)?.settingsVersion || 1,
      updatedAt: configDoc?.updatedAt || community?.updatedAt || now,
      updatedBy: configDoc?.updatedBy || 'system',
      general,
      community: communitySection,
      permissions,
      recruitment,
      notifications,
      plansUsage,
      security,
    };

    const diagnostics = await SettingsValidationService.evaluateDiagnostics(communityId, baseSettings);

    const consolidated: ConsolidatedCommunitySettings = {
      ...baseSettings,
      diagnostics,
    };

    // Cache result
    settingsCache.set(communityId, { data: consolidated, expiresAt: Date.now() + CACHE_TTL_MS });

    return consolidated;
  }

  /**
   * Applies partial configuration updates to community settings with full atomic updates,
   * dependency validation, secret redaction, audit logging, and event bus notification.
   */
  static async updateSettings(
    communityId: string,
    actor: { userId: string; role: UserRole },
    payload: UpdateCommunitySettingsPayload
  ): Promise<ConsolidatedCommunitySettings> {
    if (!communityId) {
      throw new BadRequestError('communityId is required');
    }

    // Role safety check
    if (actor.role !== 'OWNER' && actor.role !== 'CONTROLLER' && actor.role !== 'PLATFORM_OWNER') {
      throw new ForbiddenError('Insufficient permissions to modify community settings.');
    }

    const current = await this.getConsolidatedSettings(communityId);
    const now = new Date().toISOString();

    // 1. Validate payloads
    if (payload.general) {
      const v = SettingsValidationService.validateGeneral(payload.general);
      if (!v.valid) throw new BadRequestError(v.errors.join(' '));
    }
    if (payload.community) {
      const v = SettingsValidationService.validateCommunity(payload.community);
      if (!v.valid) throw new BadRequestError(v.errors.join(' '));
    }
    if (payload.permissions) {
      const v = SettingsValidationService.validatePermissions(payload.permissions, actor.role);
      if (!v.valid) throw new BadRequestError(v.errors.join(' '));
    }
    if (payload.recruitment) {
      const v = SettingsValidationService.validateRecruitment(payload.recruitment);
      if (!v.valid) throw new BadRequestError(v.errors.join(' '));
    }
    if (payload.notifications) {
      const v = SettingsValidationService.validateNotifications(payload.notifications);
      if (!v.valid) throw new BadRequestError(v.errors.join(' '));
    }
    if (payload.security) {
      const v = SettingsValidationService.validateSecurity(payload.security, actor.role);
      if (!v.valid) throw new BadRequestError(v.errors.join(' '));
    }

    const nextVersion = SettingsVersionService.incrementVersion(current.version);

    // 2. Persist to authoritative stores
    // A. Communities repository (displayName, timezone, locale)
    if (payload.general) {
      const commPatch: Record<string, any> = { updatedAt: now };
      if (payload.general.displayName !== undefined) commPatch.name = payload.general.displayName.trim();
      if (payload.general.timezone !== undefined) commPatch.timezone = payload.general.timezone.trim();
      if (payload.general.locale !== undefined) commPatch.locale = payload.general.locale.trim();
      if (payload.general.description !== undefined) commPatch.description = payload.general.description.trim();

      const existingComm = await communitiesRepository.getById(communityId);
      if (existingComm) {
        await communitiesRepository.update(communityId, commPatch);
      }
    }

    // B. Community Configuration document (rules, welcome, recruiter identity, settingsVersion)
    const configPatch: Record<string, any> = {
      updatedAt: now,
      updatedBy: actor.userId,
      settingsVersion: nextVersion,
    };

    if (payload.general?.timezone) configPatch.timezone = payload.general.timezone.trim();
    if (payload.community) {
      if (payload.community.welcomeMessageEnabled !== undefined)
        configPatch.welcomeMessageEnabled = payload.community.welcomeMessageEnabled;
      if (payload.community.welcomeGreeting !== undefined)
        configPatch.recruiterWelcomeGreeting = payload.community.welcomeGreeting;
      if (payload.community.welcomeChannelId !== undefined)
        configPatch.welcomeChannelId = payload.community.welcomeChannelId;
      if (payload.community.welcomeChannelName !== undefined)
        configPatch.welcomeChannelName = payload.community.welcomeChannelName;
      if (payload.community.rulesChannelId !== undefined)
        configPatch.rulesChannelId = payload.community.rulesChannelId;
      if (payload.community.rulesChannelName !== undefined)
        configPatch.rulesChannelName = payload.community.rulesChannelName;
      if (payload.community.rules !== undefined) configPatch.rules = payload.community.rules;
      if (payload.community.guidelines !== undefined) configPatch.guidelines = payload.community.guidelines;
      if (payload.community.dmNotificationsEnabled !== undefined)
        configPatch.dmNotificationsEnabled = payload.community.dmNotificationsEnabled;
    }
    if (payload.recruitment) {
      if (payload.recruitment.applicationEnabled !== undefined)
        configPatch.applicationEnabled = payload.recruitment.applicationEnabled;
      if (payload.recruitment.interviewEnabled !== undefined)
        configPatch.interviewEnabled = payload.recruitment.interviewEnabled;
      if (payload.recruitment.recruiterCodeRequired !== undefined)
        configPatch.recruiterCodeRequired = payload.recruitment.recruiterCodeRequired;
      if (payload.recruitment.automaticRecruiterCodeGeneration !== undefined)
        configPatch.automaticRecruiterCodeGeneration = payload.recruitment.automaticRecruiterCodeGeneration;
      if (payload.recruitment.manualRecruiterCodesAllowed !== undefined)
        configPatch.manualRecruiterCodesAllowed = payload.recruitment.manualRecruiterCodesAllowed;
      if (payload.recruitment.recruiterDisplayName !== undefined)
        configPatch.recruiterDisplayName = payload.recruitment.recruiterDisplayName;
      if (payload.recruitment.recruiterPersonaEnabled !== undefined)
        configPatch.recruiterPersonaEnabled = payload.recruitment.recruiterPersonaEnabled;
      if (payload.recruitment.screeningThreshold !== undefined)
        configPatch.screeningThreshold = payload.recruitment.screeningThreshold;
      if (payload.recruitment.calendarRequirementEnabled !== undefined)
        configPatch.calendarRequirementEnabled = payload.recruitment.calendarRequirementEnabled;
    }

    // Sections that only live in the configuration document: store them so they survive a reload.
    if (payload.general && (payload.general.dateTimeFormat !== undefined || payload.general.defaultLandingContext !== undefined)) {
      configPatch.generalExtra = {
        dateTimeFormat: payload.general.dateTimeFormat ?? current.general.dateTimeFormat,
        defaultLandingContext: payload.general.defaultLandingContext ?? current.general.defaultLandingContext,
      };
    }
    if (payload.community && (payload.community.onboardingRulesLink !== undefined || payload.community.codeOfConductLink !== undefined || payload.community.massMentionPolicy !== undefined)) {
      configPatch.communityExtra = {
        onboardingRulesLink: payload.community.onboardingRulesLink ?? current.community.onboardingRulesLink,
        codeOfConductLink: payload.community.codeOfConductLink ?? current.community.codeOfConductLink,
        massMentionPolicy: payload.community.massMentionPolicy ?? current.community.massMentionPolicy,
      };
    }
    if (payload.recruitment?.recruiterWelcomeGreeting !== undefined) configPatch.recruiterIntroMessage = payload.recruitment.recruiterWelcomeGreeting;
    if (payload.recruitment?.blacklistEnforcementEnabled !== undefined) configPatch.blacklistEnforcementEnabled = payload.recruitment.blacklistEnforcementEnabled;
    if (payload.notifications) {
      const n: any = payload.notifications;
      const categories: Record<string, any> = {};
      for (const [k, base] of Object.entries<any>(current.notifications.categories)) {
        const c: any = (n.categories || {})[k] || {};
        categories[k] = {
          enabled: c.enabled ?? base.enabled, destination: c.destination ?? base.destination, minimumRole: c.minimumRole ?? base.minimumRole,
          channelName: 'channelName' in c ? c.channelName : base.channelName, channelId: 'channelId' in c ? c.channelId : base.channelId,
        };
      }
      configPatch.notificationSettings = {
        dmDeliveryFallback: n.dmDeliveryFallback ?? current.notifications.dmDeliveryFallback,
        summaryFrequency: n.summaryFrequency ?? current.notifications.summaryFrequency,
        categories,
      };
    }
    if (payload.security) {
      const sec: any = payload.security;
      configPatch.securitySettings = {
        massMentionPolicy: sec.massMentionPolicy ?? current.security.massMentionPolicy,
        moderationBaselineSeverity: sec.moderationBaselineSeverity ?? current.security.moderationBaselineSeverity,
        moderationLogChannel: sec.moderationLogChannel ?? current.security.moderationLogChannel,
        blacklistEnforcement: sec.blacklistEnforcement ?? current.security.blacklistEnforcement,
        suspiciousActivityAlerts: sec.suspiciousActivityAlerts ?? current.security.suspiciousActivityAlerts,
        securityNotificationsEnabled: sec.securityNotificationsEnabled ?? current.security.securityNotificationsEnabled,
      };
    }

    const existingConfig = await communityConfigurationRepository.getById(communityId);
    if (existingConfig) {
      await communityConfigurationRepository.update(communityId, configPatch);
    } else {
      await communityConfigurationRepository.create({
        id: communityId,
        communityId,
        communityName: payload.general?.displayName || 'Discord Community',
        description: payload.general?.description || '',
        mission: '',
        rules: payload.community?.rules || ['Be respectful'],
        guidelines: payload.community?.guidelines || ['Be constructive'],
        requirements: ['Verified account'],
        applicationEnabled: payload.recruitment?.applicationEnabled !== false,
        interviewEnabled: payload.recruitment?.interviewEnabled !== false,
        recruiterCodeRequired: payload.recruitment?.recruiterCodeRequired !== false,
        automaticRecruiterCodeGeneration: true,
        manualRecruiterCodesAllowed: true,
        aiAnalysisEnabled: true,
        dmNotificationsEnabled: true,
        welcomeMessageEnabled: true,
        publicInformation: [],
        memberInformation: [],
        applicantInformation: [],
        recruiterInformation: [],
        createdAt: now,
        updatedAt: now,
        ...configPatch,
      });
    }

    // C. Recruiter Record configuration
    if (payload.recruitment && (payload.recruitment.recordEnabled !== undefined || payload.recruitment.recordChannelName || payload.recruitment.recordChannelId || payload.recruitment.recordTemplate)) {
      const records = await recruiterRecordConfigsRepository.listForTenant(communityId);
      if (records.length > 0) {
        const patch: Record<string, any> = { updatedAt: now, updatedBy: actor.userId };
        if (payload.recruitment.recordEnabled !== undefined) patch.enabled = payload.recruitment.recordEnabled;
        if (payload.recruitment.recordChannelName !== undefined) {
          patch.channelName = payload.recruitment.recordChannelName;
        }
        if (payload.recruitment.recordChannelId !== undefined) {
          patch.channelId = payload.recruitment.recordChannelId;
        } else if (payload.recruitment.recordChannelName !== undefined && !records[0].channelId) {
          patch.channelId = payload.recruitment.recordChannelName;
        }
        if (payload.recruitment.recordTemplate !== undefined) {
          patch.messageTemplate = payload.recruitment.recordTemplate;
          patch.initialMessageTemplate = payload.recruitment.recordTemplate;
        }
        await recruiterRecordConfigsRepository.update(records[0].id, patch);
      } else {
        await recruiterRecordConfigsRepository.create({
          id: `rec_cfg_${communityId}_${Date.now()}`,
          communityId,
          enabled: payload.recruitment.recordEnabled !== false,
          channelName: payload.recruitment.recordChannelName || '#recruiter-records',
          channelId: payload.recruitment.recordChannelId || payload.recruitment.recordChannelName || '#recruiter-records',
          initialMessageTemplate: payload.recruitment.recordTemplate || '🎉 **Recruitment Verified!**',
          claimedMessageTemplate: '🎉 **Application Claimed!**',
          mentionRecruiter: true,
          showApplicantName: true,
          showRecruiterCode: true,
          showApplicationStatus: true,
          showBenefit: false,
          showBenefitCount: false,
          showBenefitStatus: false,
          showRemainingPending: false,
          messageUpdateMode: 'EDIT_ORIGINAL' as any,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // D. Roles & Permissions overrides
    if (payload.permissions?.roleMappings) {
      for (const [roleKey, roleConfig] of Object.entries(payload.permissions.roleMappings)) {
        if (roleConfig.isProtected && roleKey === 'OWNER') continue;
        const tenantRoles = await rolesRepository.listForTenant(communityId);
        const existingRole = tenantRoles.find(
          (r: any) => (r.role || r.canonicalRole || r.type || r.name) === roleKey
        );
        if (existingRole) {
          await rolesRepository.update(existingRole.id, {
            discordRoleId: roleConfig.discordRoleId,
            name: roleConfig.discordRoleName || roleKey,
            permissions: roleConfig.permissions as any,
          });
        } else {
          await rolesRepository.create({
            id: `role_${communityId}_${roleKey}_${Date.now()}`,
            communityId,
            name: roleConfig.discordRoleName || roleKey,
            type: roleKey as UserRole,
            canonicalRole: roleKey,
            discordRoleId: roleConfig.discordRoleId,
            permissions: roleConfig.permissions as any,
            createdAt: now,
          });
        }
      }
    }

    // 3. Invalidate Cache
    this.invalidateCache(communityId);

    // 4. Record Structured Audit Logs
    const sectionKeys: SettingsSectionKey[] = Object.keys(payload) as SettingsSectionKey[];
    for (const section of sectionKeys) {
      let auditAction: any = 'SETTING_UPDATED';
      if (section === 'community') auditAction = 'COMMUNITY_SETTINGS_UPDATED';
      else if (section === 'permissions') auditAction = 'PERMISSION_SETTINGS_UPDATED';
      else if (section === 'recruitment') auditAction = 'RECRUITMENT_SETTINGS_UPDATED';
      else if (section === 'notifications') auditAction = 'NOTIFICATION_SETTINGS_UPDATED';
      else if (section === 'security') auditAction = 'SECURITY_SETTINGS_UPDATED';

      // Recorded in the background so saving doesn't wait for the audit trail.
      void SettingsAuditService.auditSettingChange({
        communityId,
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: auditAction,
        section,
        previousSummary: (current as any)[section] || {},
        newSummary: (payload as any)[section] || {},
      }).catch((e: any) => logger.warn(`Settings audit failed: ${e?.message}`));
    }

    // 5. Emit Event Bus notification (background)
    void AutomationEventBusService.publish({
      communityId,
      eventType: 'COMMUNITY_SETTINGS_UPDATED',
      metadata: {
        updatedSections: sectionKeys,
        version: nextVersion,
        actorUserId: actor.userId,
        actorRole: actor.role,
      },
    }).catch((e) => logger.warn(`Failed to publish settings updated event: ${e?.message}`));

    return await this.getConsolidatedSettings(communityId);
  }

  /**
   * Diagnostic health inspection of all community settings.
   */
  static async getDiagnostics(communityId: string): Promise<CommunitySettingsDiagnostics> {
    const settings = await this.getConsolidatedSettings(communityId);
    return settings.diagnostics;
  }
}

export const communitySettingsService = SettingsService;
export const settingsService = SettingsService;
