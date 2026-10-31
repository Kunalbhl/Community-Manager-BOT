import {
  IntegrationHealthDetail,
  IntegrationHealthState,
  IntegrationKey,
  NormalizedConnectionState,
  OverallIntegrationHealthReport,
} from '../../../shared/types/integrations.js';
import {
  communitiesRepository,
  googleSheetsConfigsRepository,
  googleFormsConfigsRepository,
  userCalendarConfigsRepository,
  googleCalendarConfigsRepository,
} from '../../repositories/index.js';
import { discordService } from '../discord/discord.service.js';
import { IntegrationCredentialService } from './integrationCredential.service.js';
import { IntegrationSyncService } from './integrationSync.service.js';
import { auditService } from '../../services/audit.service.js';
import { config } from '../../config/env.js';
import { logger } from '../../logging/logger.js';
import { UserRole } from '../../../shared/types/rbac.js';

export class IntegrationHealthService {
  /**
   * Evaluates comprehensive, truthful health for a single integration.
   */
  static async checkIntegrationHealth(
    integrationKey: IntegrationKey,
    communityId: string,
    userId?: string
  ): Promise<IntegrationHealthDetail> {
    const now = new Date().toISOString();

    switch (integrationKey) {
      case 'DISCORD':
        return this.checkDiscordHealth(communityId, now);
      case 'GOOGLE_SHEETS':
        return this.checkSheetsHealth(communityId, now);
      case 'GOOGLE_FORMS':
        return this.checkFormsHealth(communityId, now);
      case 'GOOGLE_CALENDAR':
        return this.checkCalendarHealth(communityId, userId, now);
      default:
        throw new Error(`Unsupported integration key: ${integrationKey}`);
    }
  }

  /**
   * Aggregates overall health across all four canonical integrations for a tenant.
   */
  static async getOverallHealth(
    communityId: string,
    userId?: string,
    auditCheck = false,
    actorUserId?: string,
    actorRole?: UserRole
  ): Promise<OverallIntegrationHealthReport> {
    const now = new Date().toISOString();

    const [discordHealth, sheetsHealth, formsHealth, calendarHealth] = await Promise.all([
      this.checkDiscordHealth(communityId, now),
      this.checkSheetsHealth(communityId, now),
      this.checkFormsHealth(communityId, now),
      this.checkCalendarHealth(communityId, userId, now),
    ]);

    const integrations: Record<IntegrationKey, IntegrationHealthDetail> = {
      DISCORD: discordHealth,
      GOOGLE_SHEETS: sheetsHealth,
      GOOGLE_FORMS: formsHealth,
      GOOGLE_CALENDAR: calendarHealth,
    };

    // Calculate overall health roll-up
    let overallHealth: IntegrationHealthState = 'HEALTHY';
    const states = Object.values(integrations).map((i) => i.healthState);

    if (states.includes('ERROR')) {
      overallHealth = 'ERROR';
    } else if (states.includes('REAUTH_REQUIRED')) {
      overallHealth = 'REAUTH_REQUIRED';
    } else if (states.includes('DEGRADED')) {
      overallHealth = 'DEGRADED';
    } else if (states.every((s) => s === 'NOT_CONFIGURED')) {
      overallHealth = 'NOT_CONFIGURED';
    } else if (states.every((s) => s === 'DISCONNECTED' || s === 'NOT_CONFIGURED')) {
      overallHealth = 'DISCONNECTED';
    }

    if (auditCheck) {
      await auditService.record({
        communityId,
        actorUserId: actorUserId || 'SYSTEM',
        actorRole: actorRole || 'OWNER',
        action: 'INTEGRATION_HEALTH_CHECKED',
        targetType: 'integration_health_report',
        targetId: communityId,
        metadata: {
          overallHealth,
          states: {
            discord: discordHealth.status,
            sheets: sheetsHealth.status,
            forms: formsHealth.status,
            calendar: calendarHealth.status,
          },
        },
      });
    }

    return {
      communityId,
      timestamp: now,
      overallHealth,
      integrations,
    };
  }

  // --- DISCORD HEALTH CHECK ---
  private static async checkDiscordHealth(communityId: string, now: string): Promise<IntegrationHealthDetail> {
    const isBotConfigured = discordService.isConfigured();
    const isBotConnected = discordService.isConnected();
    const diagnostics = discordService.getDiagnostics();

    const community = await communitiesRepository.getById(communityId);
    const linkedGuildId = community?.discordGuildId;

    let status: NormalizedConnectionState = 'NOT_CONFIGURED';
    let healthState: IntegrationHealthState = 'NOT_CONFIGURED';
    let requiredAction: string | undefined;
    let completeness = 0;

    if (!isBotConfigured) {
      status = 'NOT_CONFIGURED';
      healthState = 'NOT_CONFIGURED';
      requiredAction = 'Configure DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID in server environment.';
      completeness = 0;
    } else if (!linkedGuildId) {
      status = 'CONNECTING';
      healthState = 'DEGRADED';
      requiredAction = 'Select and link a Discord server in Community Settings.';
      completeness = 40;
    } else if (!isBotConnected) {
      status = 'DISCONNECTED';
      healthState = 'DISCONNECTED';
      requiredAction = 'Discord gateway process is disconnected. Restart or verify network connectivity.';
      completeness = 60;
    } else {
      // Check guild presence in cache
      const guild = discordService.getGuild(linkedGuildId);
      if (!guild) {
        status = 'DEGRADED';
        healthState = 'DEGRADED';
        requiredAction = `Bot is not present in linked Discord Guild (${linkedGuildId}). Invite bot to server.`;
        completeness = 70;
      } else {
        status = 'CONNECTED';
        healthState = 'HEALTHY';
        completeness = 100;
      }
    }

    const capabilitiesStatus = [
      { name: 'GATEWAY_EVENTS', available: isBotConnected, reason: isBotConnected ? undefined : 'Gateway disconnected' },
      { name: 'SLASH_COMMANDS', available: isBotConnected, reason: isBotConnected ? undefined : 'Bot not active' },
      { name: 'ROLE_MANAGEMENT', available: isBotConnected && Boolean(linkedGuildId), reason: linkedGuildId ? undefined : 'No linked guild' },
      { name: 'DM_DISPATCH', available: isBotConnected, reason: isBotConnected ? undefined : 'Gateway offline' },
      { name: 'CHANNEL_ALERTS', available: isBotConnected && Boolean(linkedGuildId), reason: linkedGuildId ? undefined : 'Guild not linked' },
    ];

    return {
      integrationKey: 'DISCORD',
      displayName: 'Discord Gateway',
      connectionModel: 'COMMUNITY_SCOPED',
      status,
      healthState,
      lastChecked: now,
      lastSuccessfulOperation: isBotConnected ? diagnostics.connectedAt : undefined,
      configurationCompleteness: completeness,
      requiredAction,
      capabilitiesStatus,
      diagnostics: {
        ...diagnostics,
        linkedGuildId,
        guildFoundInCache: linkedGuildId ? Boolean(discordService.getGuild(linkedGuildId)) : false,
      },
    };
  }

  // --- GOOGLE SHEETS HEALTH CHECK ---
  private static async checkSheetsHealth(communityId: string, now: string): Promise<IntegrationHealthDetail> {
    const list = await googleSheetsConfigsRepository.listForTenant(communityId);
    const sheetConfig = list[0];
    const latestSync = await IntegrationSyncService.getLatestSync(communityId, 'GOOGLE_SHEETS');

    let status: NormalizedConnectionState = 'NOT_CONFIGURED';
    let healthState: IntegrationHealthState = 'NOT_CONFIGURED';
    let requiredAction: string | undefined;
    let completeness = 0;

    if (!sheetConfig || (!sheetConfig.configured && !sheetConfig.spreadsheetId)) {
      status = 'NOT_CONFIGURED';
      healthState = 'NOT_CONFIGURED';
      requiredAction = 'Configure spreadsheet ID and column mappings in Integration Center.';
      completeness = 0;
    } else if (!sheetConfig.enabled) {
      status = 'DISCONNECTED';
      healthState = 'DISCONNECTED';
      requiredAction = 'Google Sheets sync is disabled by administrator.';
      completeness = 50;
    } else {
      completeness += 50;
      // Check column mappings completeness
      const requiredCols = ['discordUserIdCol', 'applicationIdCol', 'recruiterCodeCol', 'statusCol'];
      const mappings = sheetConfig.columnMappings || {};
      const missing = requiredCols.filter((col) => !mappings[col as keyof typeof mappings]);

      if (missing.length > 0) {
        status = 'DEGRADED';
        healthState = 'DEGRADED';
        requiredAction = `Incomplete column mappings: missing ${missing.join(', ')}.`;
        completeness += 20;
      } else {
        completeness += 50;
        status = 'CONNECTED';
        healthState = latestSync?.status === 'FAILED' ? 'DEGRADED' : 'HEALTHY';
        if (latestSync?.status === 'FAILED') {
          requiredAction = `Last sync failed: ${latestSync.errorSummary || 'Unknown error'}. Check permissions.`;
        }
      }
    }

    const capabilitiesStatus = [
      { name: 'APPLICATION_EXPORT', available: status === 'CONNECTED' },
      { name: 'RECRUITER_STATISTICS_SYNC', available: status === 'CONNECTED' },
      { name: 'AUDIT_LOG_EXPORT', available: status === 'CONNECTED' },
      { name: 'DURABLE_SYNC', available: status === 'CONNECTED' },
    ];

    return {
      integrationKey: 'GOOGLE_SHEETS',
      displayName: 'Google Sheets',
      connectionModel: 'COMMUNITY_SCOPED',
      status,
      healthState,
      lastChecked: now,
      lastSuccessfulOperation: sheetConfig?.lastSyncTime || latestSync?.completedAt,
      lastFailure: latestSync?.status === 'FAILED' ? latestSync.errorSummary : undefined,
      configurationCompleteness: completeness,
      requiredAction,
      capabilitiesStatus,
      diagnostics: {
        configured: sheetConfig?.configured || false,
        spreadsheetId: sheetConfig?.spreadsheetId ? `${sheetConfig.spreadsheetId.substring(0, 6)}...` : undefined,
        autoSyncEnabled: sheetConfig?.autoSyncEnabled || false,
        lastSyncStatus: sheetConfig?.lastSyncStatus || 'NONE',
        recordsProcessed: sheetConfig?.recordsProcessed,
      },
    };
  }

  // --- GOOGLE FORMS HEALTH CHECK ---
  private static async checkFormsHealth(communityId: string, now: string): Promise<IntegrationHealthDetail> {
    const list = await googleFormsConfigsRepository.listForTenant(communityId);
    const formConfig = list[0];
    const latestSync = await IntegrationSyncService.getLatestSync(communityId, 'GOOGLE_FORMS');

    let status: NormalizedConnectionState = 'NOT_CONFIGURED';
    let healthState: IntegrationHealthState = 'NOT_CONFIGURED';
    let requiredAction: string | undefined;
    let completeness = 0;

    if (!formConfig || !formConfig.formId) {
      status = 'NOT_CONFIGURED';
      healthState = 'NOT_CONFIGURED';
      requiredAction = 'Configure Google Form ID in Integration Center to ingest candidate responses.';
      completeness = 0;
    } else if (!formConfig.enabled) {
      status = 'DISCONNECTED';
      healthState = 'DISCONNECTED';
      requiredAction = 'Google Forms response ingestion is disabled.';
      completeness = 50;
    } else {
      status = 'CONNECTED';
      healthState = 'HEALTHY';
      completeness = 100;
    }

    const capabilitiesStatus = [
      { name: 'RESPONSE_INGESTION', available: status === 'CONNECTED' },
      { name: 'APPLICATION_CREATION', available: status === 'CONNECTED' },
      { name: 'FIELD_MAPPING', available: status === 'CONNECTED' },
    ];

    return {
      integrationKey: 'GOOGLE_FORMS',
      displayName: 'Google Forms',
      connectionModel: 'COMMUNITY_SCOPED',
      status,
      healthState,
      lastChecked: now,
      lastSuccessfulOperation: formConfig?.lastSyncAt || latestSync?.completedAt,
      configurationCompleteness: completeness,
      requiredAction,
      capabilitiesStatus,
      diagnostics: {
        formId: formConfig?.formId ? `${formConfig.formId.substring(0, 6)}...` : undefined,
        formTitle: formConfig?.formTitleSnapshot,
        enabled: formConfig?.enabled || false,
        lastSyncStatus: formConfig?.lastSyncStatus || 'NONE',
      },
    };
  }

  // --- GOOGLE CALENDAR HEALTH CHECK ---
  private static async checkCalendarHealth(
    communityId: string,
    userId: string | undefined,
    now: string
  ): Promise<IntegrationHealthDetail> {
    let userConfig = null;
    if (userId) {
      const userConfigs = await userCalendarConfigsRepository.listForTenant(userId);
      userConfig = userConfigs[0] || (await userCalendarConfigsRepository.getById(userId));
    }

    // Community calendar fallback
    const commCalendarConfigs = await googleCalendarConfigsRepository.listForTenant(communityId);
    const commConfig = commCalendarConfigs[0];

    const credential = userId
      ? await IntegrationCredentialService.getRedactedCredential(communityId, 'GOOGLE_CALENDAR', userId)
      : null;

    let status: NormalizedConnectionState = 'NOT_CONFIGURED';
    let healthState: IntegrationHealthState = 'NOT_CONFIGURED';
    let requiredAction: string | undefined;
    let completeness = 0;

    if (userConfig) {
      if (userConfig.status === 'CONNECTED' || userConfig.preference === 'CONNECTED') {
        completeness = 100;
        if (credential?.isExpired && !credential.hasRefreshToken) {
          status = 'REAUTH_REQUIRED';
          healthState = 'REAUTH_REQUIRED';
          requiredAction = 'Google Calendar access token expired. Please re-authenticate your Google Account.';
        } else {
          status = 'CONNECTED';
          healthState = 'HEALTHY';
        }
      } else if (userConfig.status === 'DISCONNECTED') {
        status = 'DISCONNECTED';
        healthState = 'DISCONNECTED';
        requiredAction = 'Calendar disconnected. Reconnect in your Profile or Integration Center.';
        completeness = 50;
      } else if (userConfig.preference === 'SKIPPED') {
        status = 'NOT_CONFIGURED';
        healthState = 'NOT_CONFIGURED';
        requiredAction = 'Calendar setup was skipped. Connect your personal Google Calendar for interview invites.';
        completeness = 20;
      } else {
        status = 'NOT_CONFIGURED';
        healthState = 'NOT_CONFIGURED';
        requiredAction = 'Connect your Google Calendar to enable automated interview scheduling.';
        completeness = 0;
      }
    } else if (commConfig && commConfig.enabled && commConfig.status === 'CONNECTED') {
      // Community fallback active
      status = 'CONNECTED';
      healthState = 'HEALTHY';
      completeness = 80;
    } else {
      status = 'NOT_CONFIGURED';
      healthState = 'NOT_CONFIGURED';
      requiredAction = 'No Google Calendar connected. Connect your calendar to enable automated interview scheduling.';
      completeness = 0;
    }

    const capabilitiesStatus = [
      { name: 'INTERVIEW_SCHEDULING', available: status === 'CONNECTED' },
      { name: 'CALENDAR_SELECTION', available: status === 'CONNECTED' },
      { name: 'RESCHEDULE_EVENT', available: status === 'CONNECTED' },
    ];

    return {
      integrationKey: 'GOOGLE_CALENDAR',
      displayName: 'Google Calendar',
      connectionModel: 'USER_SCOPED',
      status,
      healthState,
      lastChecked: now,
      lastSuccessfulOperation: userConfig?.lastSyncAt,
      lastFailure: userConfig?.lastError,
      configurationCompleteness: completeness,
      requiredAction,
      capabilitiesStatus,
      diagnostics: {
        userId,
        calendarId: userConfig?.calendarId || commConfig?.calendarId || 'primary',
        timezone: userConfig?.timezone || commConfig?.timezone || 'UTC',
        preference: userConfig?.preference || 'NEVER_CONFIGURED',
        isTokenExpired: credential?.isExpired || false,
      },
    };
  }
}
