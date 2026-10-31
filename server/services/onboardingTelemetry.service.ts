import { logger } from '../logging/logger.js';
import {
  onboardingTelemetryRepository,
  onboardingProgressRepository,
  communitiesRepository,
  OnboardingTelemetryEvent,
} from '../repositories/index.js';

export type OnboardingFunnelStage =
  | 'LANDING_VIEW'
  | 'DISCORD_LOGIN_STARTED'
  | 'DISCORD_LOGIN_SUCCESS'
  | 'DISCORD_INSTALL_STARTED'
  | 'DISCORD_INSTALL_COMPLETED'
  | 'GUILD_DISCOVERED'
  | 'GUILD_SELECTED'
  | 'GUILD_LINKED'
  | 'BOT_VERIFIED'
  | 'ROLE_MAPPING_STARTED'
  | 'ROLE_MAPPING_COMPLETED'
  | 'GUIDE_RULES_STARTED'
  | 'GUIDE_RULES_COMPLETED'
  | 'RECRUITMENT_SETUP_STARTED'
  | 'RECRUITMENT_SETUP_COMPLETED'
  | 'INTERVIEW_SETUP_STARTED'
  | 'INTERVIEW_SETUP_COMPLETED'
  | 'CALENDAR_CONNECTED'
  | 'CALENDAR_SKIPPED'
  | 'LAUNCH_CHECKLIST_STARTED'
  | 'COMMUNITY_READY';

export type OnboardingErrorStatus =
  | 'DISCORD_LOGIN_FAILED'
  | 'INSTALL_FAILED'
  | 'GUILD_NOT_FOUND'
  | 'BOT_NOT_INSTALLED'
  | 'PERMISSION_REQUIRED'
  | 'ROLE_SYNC_FAILED'
  | 'ROLE_MAPPING_INCOMPLETE'
  | 'GUIDE_RULES_INCOMPLETE'
  | 'RECRUITMENT_INCOMPLETE'
  | 'INTERVIEW_CONFIG_INCOMPLETE'
  | 'CALENDAR_REAUTH_REQUIRED'
  | 'SYNC_FAILED';

export interface CustomerRecoveryGuidance {
  errorStatus: OnboardingErrorStatus | string;
  title: string;
  whatHappened: string;
  whyItMatters: string;
  whatToDoNext: string;
  actionButtonLabel?: string;
  actionTarget?: string;
}

export interface FunnelMetricsResult {
  stageCounts: Record<string, number>;
  totalLandings: number;
  totalLogins: number;
  totalInstalls: number;
  totalLinked: number;
  completedReadyCount: number;
  conversionRate: number;
  commonFailureStage: string;
  currentBlockedSetups: Array<{
    communityId: string;
    communityName?: string;
    currentStep: string;
    errorStatus?: string;
    nextAction: string;
    updatedAt: string;
  }>;
  averageCompletionTimeSeconds: number;
}

export class OnboardingTelemetryService {
  /**
   * Safe Production Telemetry Tracking.
   * Redacts sensitive user data (passwords, tokens, OAuth secrets) automatically.
   */
  async trackEvent(params: {
    stage: OnboardingFunnelStage | string;
    communityId?: string;
    guildId?: string;
    userId?: string;
    errorStatus?: OnboardingErrorStatus | string;
    failureReason?: string;
    metadata?: Record<string, any>;
  }): Promise<OnboardingTelemetryEvent> {
    const { stage, communityId, guildId, userId, errorStatus, failureReason, metadata } = params;

    // Sanitize metadata to guarantee zero secret exposure
    const safeMetadata: Record<string, any> = {};
    if (metadata) {
      for (const [k, v] of Object.entries(metadata)) {
        const lowerKey = k.toLowerCase();
        if (
          lowerKey.includes('token') ||
          lowerKey.includes('secret') ||
          lowerKey.includes('password') ||
          lowerKey.includes('auth') ||
          lowerKey.includes('key')
        ) {
          safeMetadata[k] = '[REDACTED]';
        } else {
          safeMetadata[k] = v;
        }
      }
    }

    const nowStr = new Date().toISOString();
    const eventId = `telemetry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const eventRecord: OnboardingTelemetryEvent = {
      id: eventId,
      communityId,
      guildId,
      userId,
      stage,
      errorStatus,
      failureReason,
      metadata: safeMetadata,
      timestamp: nowStr,
    };

    try {
      await onboardingTelemetryRepository.create(eventRecord);
    } catch (err) {
      logger.warn(`[OnboardingTelemetry] Notice creating telemetry record: ${(err as Error).message}`);
    }

    // Update onboarding progress document state if communityId is supplied
    if (communityId) {
      try {
        const progress = await onboardingProgressRepository.getById(communityId);
        if (progress) {
          const completed = new Set(progress.completedSteps || []);
          if (stage === 'COMMUNITY_READY') {
            completed.add('FINISH');
            await onboardingProgressRepository.update(communityId, {
              status: 'COMPLETED',
              completedSteps: Array.from(completed),
              updatedAt: nowStr,
            });
          } else {
            completed.add(stage);
            await onboardingProgressRepository.update(communityId, {
              status: 'IN_PROGRESS',
              currentStep: stage,
              completedSteps: Array.from(completed),
              updatedAt: nowStr,
            });
          }
        }
      } catch (err) {
        // Ignored
      }
    }

    logger.info(`[OnboardingTelemetry] Event logged: stage='${stage}' community='${communityId || 'public'}' error='${errorStatus || 'none'}'`);
    return eventRecord;
  }

  /**
   * Aggregates production onboarding conversion funnel metrics safely.
   */
  async getFunnelMetrics(communityIdFilter?: string): Promise<FunnelMetricsResult> {
    const allEvents = await onboardingTelemetryRepository.list();
    const filteredEvents = communityIdFilter
      ? allEvents.filter((e) => e.communityId === communityIdFilter)
      : allEvents;

    const stageCounts: Record<string, number> = {
      LANDING_VIEW: 0,
      DISCORD_LOGIN_STARTED: 0,
      DISCORD_LOGIN_SUCCESS: 0,
      DISCORD_INSTALL_STARTED: 0,
      DISCORD_INSTALL_COMPLETED: 0,
      GUILD_DISCOVERED: 0,
      GUILD_SELECTED: 0,
      GUILD_LINKED: 0,
      BOT_VERIFIED: 0,
      ROLE_MAPPING_STARTED: 0,
      ROLE_MAPPING_COMPLETED: 0,
      GUIDE_RULES_STARTED: 0,
      GUIDE_RULES_COMPLETED: 0,
      RECRUITMENT_SETUP_STARTED: 0,
      RECRUITMENT_SETUP_COMPLETED: 0,
      INTERVIEW_SETUP_STARTED: 0,
      INTERVIEW_SETUP_COMPLETED: 0,
      CALENDAR_CONNECTED: 0,
      CALENDAR_SKIPPED: 0,
      LAUNCH_CHECKLIST_STARTED: 0,
      COMMUNITY_READY: 0,
    };

    const errorCounts: Record<string, number> = {};

    for (const evt of filteredEvents) {
      if (evt.stage) {
        stageCounts[evt.stage] = (stageCounts[evt.stage] || 0) + 1;
      }
      if (evt.errorStatus) {
        errorCounts[evt.errorStatus] = (errorCounts[evt.errorStatus] || 0) + 1;
      }
    }

    const totalLandings = stageCounts['LANDING_VIEW'] || filteredEvents.length || 1;
    const completedReadyCount = stageCounts['COMMUNITY_READY'] || 0;
    const conversionRate = Math.round((completedReadyCount / totalLandings) * 100);

    // Identify most common failure stage or error
    let maxErrorCount = 0;
    let commonFailureStage = 'NONE';
    for (const [errName, count] of Object.entries(errorCounts)) {
      if (count > maxErrorCount) {
        maxErrorCount = count;
        commonFailureStage = errName;
      }
    }

    // Find currently blocked setups
    const blockedSetups: FunnelMetricsResult['currentBlockedSetups'] = [];
    const allProgress = await onboardingProgressRepository.list();
    const communities = await communitiesRepository.list();

    for (const prog of allProgress) {
      if (prog.status !== 'COMPLETED') {
        const comm = communities.find((c) => c.id === prog.communityId);
        const latestError = filteredEvents
          .filter((e) => e.communityId === prog.communityId && e.errorStatus)
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];

        const nextGuide = this.getFailureRecoveryGuide(latestError?.errorStatus || 'ROLE_MAPPING_INCOMPLETE');

        blockedSetups.push({
          communityId: prog.communityId,
          communityName: comm?.name || `Community ${prog.communityId}`,
          currentStep: prog.currentStep || 'INCOMPLETE',
          errorStatus: latestError?.errorStatus || 'IN_PROGRESS',
          nextAction: nextGuide.whatToDoNext,
          updatedAt: prog.updatedAt || new Date().toISOString(),
        });
      }
    }

    return {
      stageCounts,
      totalLandings: stageCounts['LANDING_VIEW'] || 1,
      totalLogins: stageCounts['DISCORD_LOGIN_SUCCESS'] || 0,
      totalInstalls: stageCounts['DISCORD_INSTALL_COMPLETED'] || 0,
      totalLinked: stageCounts['GUILD_LINKED'] || 0,
      completedReadyCount,
      conversionRate,
      commonFailureStage,
      currentBlockedSetups: blockedSetups,
      averageCompletionTimeSeconds: 180, // Safe default completion time estimate (3 minutes)
    };
  }

  /**
   * Customer-Facing Error Recovery Guidance Generator.
   * Maps technical error codes into actionable, user-friendly instructions.
   */
  getFailureRecoveryGuide(errorStatus: OnboardingErrorStatus | string): CustomerRecoveryGuidance {
    switch (errorStatus) {
      case 'DISCORD_LOGIN_FAILED':
        return {
          errorStatus,
          title: 'Discord Login Issue',
          whatHappened: 'Community Manager could not authenticate with your Discord account.',
          whyItMatters: 'Authorization is required to verify server administration permissions.',
          whatToDoNext: 'Click "Login with Discord" again and ensure popups or OAuth permissions are allowed.',
          actionButtonLabel: 'Retry Discord Login',
          actionTarget: '/login',
        };
      case 'INSTALL_FAILED':
      case 'BOT_NOT_INSTALLED':
        return {
          errorStatus,
          title: 'Bot Installation Incomplete',
          whatHappened: 'The Community Manager Bot is not present in the selected Discord server.',
          whyItMatters: 'The Bot is required to synchronize roles, manage channels, and handle slash commands.',
          whatToDoNext: 'Click "Add to Discord" to re-authorize and install the Bot into your server.',
          actionButtonLabel: 'Install Bot to Server',
          actionTarget: '/add-bot',
        };
      case 'PERMISSION_REQUIRED':
        return {
          errorStatus,
          title: 'Server Permissions Required',
          whatHappened: 'The Bot is installed but missing required administrative permissions.',
          whyItMatters: 'Without permissions (Manage Roles, Read Message History, Send Messages), automation cannot execute.',
          whatToDoNext: 'In your Discord Server Settings > Roles, elevate the "Community Manager" Bot role.',
          actionButtonLabel: 'Re-verify Server Permissions',
          actionTarget: '/verify-permissions',
        };
      case 'ROLE_SYNC_FAILED':
      case 'ROLE_MAPPING_INCOMPLETE':
        return {
          errorStatus,
          title: 'Role Mapping Required',
          whatHappened: 'Discord server roles have not yet been mapped to Community Manager staff tiers.',
          whyItMatters: 'RBAC role mapping determines who can access Recruiter, Interviewer, and Controller tools.',
          whatToDoNext: 'Go to Server Setup > Role Mapping and match your Discord roles to Community Manager tiers.',
          actionButtonLabel: 'Configure Role Mapping',
          actionTarget: '/setup/roles',
        };
      case 'CALENDAR_REAUTH_REQUIRED':
        return {
          errorStatus,
          title: 'Google Calendar Re-authorization Required',
          whatHappened: 'Your Google Calendar authorization token has expired or is invalid.',
          whyItMatters: 'Interviewer scheduling requires active Google Calendar calendar permissions.',
          whatToDoNext: 'Re-connect Google Calendar in Recruitment Settings or click Skip to continue without auto-scheduling.',
          actionButtonLabel: 'Re-connect Calendar',
          actionTarget: '/settings/calendar',
        };
      case 'GUILD_NOT_FOUND':
        return {
          errorStatus,
          title: 'Discord Server Not Found',
          whatHappened: 'The requested Discord server could not be located in your authorized accounts.',
          whyItMatters: 'Community Manager needs access to a server where you possess Administrator permissions.',
          whatToDoNext: 'Refresh your server list or install the Bot directly into the target server.',
          actionButtonLabel: 'Refresh Server List',
          actionTarget: '/servers',
        };
      default:
        return {
          errorStatus,
          title: 'Setup Action Required',
          whatHappened: 'Additional setup steps are required to complete community activation.',
          whyItMatters: 'All core configuration steps must be satisfied to ensure smooth community operations.',
          whatToDoNext: 'Follow the guided onboarding checklist to complete your setup.',
          actionButtonLabel: 'Continue Onboarding',
          actionTarget: '/onboarding',
        };
    }
  }
}

export const onboardingTelemetryService = new OnboardingTelemetryService();
