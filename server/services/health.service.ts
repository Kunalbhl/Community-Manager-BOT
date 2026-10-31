import { config, CANONICAL_PRODUCTION_URL } from '../config/env.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { googleSheetsService } from '../integrations/google/sheets.service.js';
import { secretsManager } from '../security/secrets.js';
import { quotaService } from './quota.service.js';
import { discordCapabilityService } from './discordCapability.service.js';
import { communitiesRepository } from '../repositories/index.js';
import { checkFirestoreReadiness, isRealPersistenceMode, getFirestoreDiagnostics } from '../repositories/firestore.repository.js';
import { DiscordRestVerificationService } from './discordRestVerification.service.js';
import { PRODUCT_RELEASE_LOCKED, getAuthoritativeReleaseManifest } from '../config/releaseLock.js';

export interface DetailedHealthReport {
  status: 'HEALTHY' | 'DEGRADED' | 'OPERATIONAL_SAFE';
  timestamp: string;
  freeMode: boolean;
  components: {
    application: {
      name: string;
      status: 'HEALTHY' | 'DEGRADED';
      nodeVersion: string;
      uptimeSeconds: number;
      memoryUsageMb: number;
      environment: string;
    };
    process: {
      name: string;
      status: 'HEALTHY' | 'DEGRADED';
      nodeVersion: string;
      uptimeSeconds: number;
      memoryUsageMb: number;
      environment: string;
    };
    database: {
      name: string;
      status: 'CONFIGURED' | 'SAFE_TRANSIENT_MEMORY' | 'DEGRADED';
      mode: string;
      details: string;
    };
    discordConfig: {
      name: string;
      status: 'CONFIGURED' | 'NOT_CONFIGURED';
      hasBotToken: boolean;
      hasApplicationId: boolean;
      hasPublicKey: boolean;
    };
    discordGateway: {
      name: string;
      status: string;
      botTag?: string;
      guildsCount: number;
      pingMs: number;
      lastHeartbeatAt?: string;
      connectedAt?: string;
      disconnectReason?: string;
    };
    discordGuild: {
      name: string;
      status: string;
      guildId?: string;
    };
    discordPermissions: {
      name: string;
      status: string;
      capabilitiesSummary: string;
    };
    discordChannels: {
      name: string;
      status: string;
      count: number;
    };
    discordRoles: {
      name: string;
      status: string;
    };
    discordCommands: {
      name: string;
      status: string;
      totalCommands: number;
    };
    googleSheets: {
      name: string;
      status: string;
      spreadsheetConfigured: boolean;
      templateSheetsCount: number;
    };
    googleCloud: {
      name: string;
      status: string;
      projectId?: string;
    };
    secretsManager: {
      name: string;
      status: 'HEALTHY';
      redactionEngineActive: boolean;
      leakageDetected: boolean;
    };
    aiEngine: {
      name: string;
      status: 'ACTIVE' | 'NOT_CONFIGURED';
      apiKeyConfigured: boolean;
      dailyQuotaRemaining: number;
    };
    freeFirstGuardrails: {
      name: string;
      status: 'ENFORCED';
      maxAiPerDay: number;
      maxAppsPerDay: number;
      maxSheetWritesPerDay: number;
    };
    freeModeSafeguards: {
      name: string;
      status: 'ENFORCED';
      maxAiPerDay: number;
      maxAppsPerDay: number;
      maxSheetWritesPerDay: number;
    };
  };
}

export class HealthService {
  async getDetailedReport(communityId = ''): Promise<DetailedHealthReport> {
    if (!communityId) {
      const comms = await communitiesRepository.list();
      communityId = comms[0]?.id || '';
    }
    const memory = process.memoryUsage();
    const discordDiag = discordService.getDiagnostics();
    const secretsReport = secretsManager.getSecretStatusReport();
    const capabilities = await discordCapabilityService.getMatrix(communityId);
    const guildVal = await discordCapabilityService.validateGuild(communityId);
    const channelsVal = await discordCapabilityService.validateChannels(communityId);
    const roleVal = await discordCapabilityService.validateMemberRole(communityId);
    const commandsVal = discordCapabilityService.validateSlashCommands();
    const quotaSnapshot = quotaService.getSnapshot(communityId);
    const firestoreCheck = await checkFirestoreReadiness();
    const isRealPersist = isRealPersistenceMode();

    const hasCriticalIssues = discordDiag.state === 'FAILED';

    const cleanFirestoreError = firestoreCheck.error ? firestoreCheck.error.split('\n')[0].replace(/at\s+.*$/, '').trim() : undefined;

    return {
      status: hasCriticalIssues ? 'DEGRADED' : 'HEALTHY',
      timestamp: new Date().toISOString(),
      freeMode: config.FREE_MODE,
      components: {
        application: {
          name: 'Community Manager Core Engine',
          status: 'HEALTHY',
          nodeVersion: process.version,
          uptimeSeconds: Math.floor(process.uptime()),
          memoryUsageMb: Math.round(memory.heapUsed / 1024 / 1024),
          environment: config.NODE_ENV,
        },
        process: {
          name: 'Community Manager Core Engine Process',
          status: 'HEALTHY',
          nodeVersion: process.version,
          uptimeSeconds: Math.floor(process.uptime()),
          memoryUsageMb: Math.round(memory.heapUsed / 1024 / 1024),
          environment: config.NODE_ENV,
        },
        database: {
          name: 'Firestore Database Layer',
          status: firestoreCheck.isReady
            ? 'CONFIGURED'
            : (isRealPersist ? 'DEGRADED' : 'SAFE_TRANSIENT_MEMORY'),
          mode: firestoreCheck.isReady
            ? 'Cloud Firestore Native'
            : (isRealPersist ? 'Unavailable (Fail-Closed)' : 'In-Memory Tenant-Isolated Store'),
          details: firestoreCheck.isReady
            ? `Targeting project ${config.GOOGLE_CLOUD_PROJECT_ID || 'default'} (db: ${config.FIRESTORE_DATABASE_ID || '(default)'})`
            : (cleanFirestoreError
                ? `Firestore check failed: ${cleanFirestoreError}`
                : (config.FIRESTORE_DATABASE_ID
                    ? `Targeting project ${config.GOOGLE_CLOUD_PROJECT_ID || 'default'} (db: ${config.FIRESTORE_DATABASE_ID})`
                    : 'Operating in tenant-isolated memory mode (zero external database cost)')),
        },
        discordConfig: {
          name: 'Discord Application Configuration',
          status: secretsReport.discordBotToken === 'CONFIGURED' ? 'CONFIGURED' : 'NOT_CONFIGURED',
          hasBotToken: secretsReport.discordBotToken === 'CONFIGURED',
          hasApplicationId: secretsReport.discordApplicationId === 'CONFIGURED',
          hasPublicKey: secretsReport.discordPublicKey === 'CONFIGURED',
        },
        discordGateway: {
          name: 'Discord Real Gateway Connection',
          status: discordDiag.state,
          botTag: discordDiag.botTag,
          guildsCount: discordDiag.guildsCount,
          pingMs: discordDiag.pingMs,
          lastHeartbeatAt: discordDiag.lastHeartbeatAt,
          connectedAt: discordDiag.connectedAt,
          disconnectReason: discordDiag.disconnectReason,
        },
        discordGuild: {
          name: 'Discord Server / Guild Target',
          status: guildVal.status,
          guildId: guildVal.guildId,
        },
        discordPermissions: {
          name: 'Discord Capability Matrix & Permissions',
          status: capabilities.overallHealth,
          capabilitiesSummary: `${capabilities.checks.filter((c) => c.granted).length}/${capabilities.checks.length} capabilities granted`,
        },
        discordChannels: {
          name: 'Discord Allowlisted Channels Validation',
          status: channelsVal.length > 0 ? 'CONFIGURED' : 'NOT_CONFIGURED',
          count: channelsVal.length,
        },
        discordRoles: {
          name: 'Discord Member Role Hierarchy & Assignment Validation',
          status: roleVal.status,
        },
        discordCommands: {
          name: 'Discord Slash Commands Registration Status',
          status: commandsVal.status,
          totalCommands: commandsVal.totalCommands,
        },
        googleSheets: {
          name: 'Google Sheets Integration',
          status: googleSheetsService.getSyncState(),
          spreadsheetConfigured: googleSheetsService.isConfigured(),
          templateSheetsCount: googleSheetsService.getTemplateSheets().length,
        },
        googleCloud: {
          name: 'Google Cloud Platform Foundation',
          status: config.GOOGLE_CLOUD_PROJECT_ID ? 'CONFIGURED' : 'NOT_CONFIGURED',
          projectId: config.GOOGLE_CLOUD_PROJECT_ID,
        },
        secretsManager: {
          name: 'Secrets Management & Redaction Engine',
          status: 'HEALTHY',
          redactionEngineActive: true,
          leakageDetected: secretsReport.leakageDetected,
        },
        aiEngine: {
          name: 'AI Engine',
          status: secretsReport.geminiApiKey === 'CONFIGURED' ? 'ACTIVE' : 'NOT_CONFIGURED',
          apiKeyConfigured: secretsReport.geminiApiKey === 'CONFIGURED',
          dailyQuotaRemaining: Math.max(0, config.MAX_AI_REQUESTS_PER_DAY - quotaSnapshot.quotas.aiRequests.current),
        },
        freeFirstGuardrails: {
          name: 'Free-First Cost Policy Enforcer',
          status: 'ENFORCED',
          maxAiPerDay: config.MAX_AI_REQUESTS_PER_DAY,
          maxAppsPerDay: config.MAX_APPLICATIONS_PER_DAY,
          maxSheetWritesPerDay: config.MAX_SHEET_WRITES_PER_DAY,
        },
        freeModeSafeguards: {
          name: 'Free-First Cost Policy Enforcer',
          status: 'ENFORCED',
          maxAiPerDay: config.MAX_AI_REQUESTS_PER_DAY,
          maxAppsPerDay: config.MAX_APPLICATIONS_PER_DAY,
          maxSheetWritesPerDay: config.MAX_SHEET_WRITES_PER_DAY,
        },
      },
    };
  }

  async getProductionReadiness() {
    const discordDiag = discordService.getDiagnostics();
    const secretsReport = secretsManager.getSecretStatusReport();
    const firestoreCheck = await checkFirestoreReadiness();
    const isRealPersist = isRealPersistenceMode();

    const isBotConfigured = Boolean(config.DISCORD_BOT_TOKEN && !config.DISCORD_BOT_TOKEN.startsWith('mock_'));
    const isOauthConfigured = Boolean(config.DISCORD_CLIENT_ID && config.DISCORD_CLIENT_SECRET);
    const isAiConfigured = Boolean(config.AI_API_KEY || config.GEMINI_API_KEY);
    const isStripeConfigured = Boolean(config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET);

    const isBotConnected = discordService.isConnected();
    const isBotReady = isBotConnected && (discordDiag.state === 'CONNECTED' || (config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION' && isBotConnected));
    const isDatabaseReady = firestoreCheck.isReady;

    const discordRestVerification = await DiscordRestVerificationService.verifyCurrentUser();
    const isCoreReady = (config as any).isStartupValid !== false && (!isRealPersist || isDatabaseReady);

    let databaseStatus = 'READY';
    if (isRealPersist) {
      if (isDatabaseReady) {
        databaseStatus = 'READY';
      } else if (firestoreCheck.error?.includes('PERMISSION_DENIED')) {
        databaseStatus = 'BLOCKED_BY_INFRASTRUCTURE';
      } else {
        databaseStatus = 'UNAVAILABLE';
      }
    } else {
      databaseStatus = isDatabaseReady ? 'READY' : 'SAFE_TRANSIENT_MEMORY';
    }

    const cleanFirestoreError = firestoreCheck.error ? firestoreCheck.error.split('\n')[0].replace(/at\s+.*$/, '').trim() : undefined;

    return {
      environment: config.APP_ENV.toUpperCase(),
      appEnv: config.APP_ENV,
      nodeEnv: config.NODE_ENV,
      appUrl: config.APP_URL,
      officialProductionUrl: CANONICAL_PRODUCTION_URL,
      aiStudioPublishedUrl: process.env.AIS_APP_URL || process.env.SHARED_APP_URL || '',
      oauthCallbackUrl: config.DISCORD_OAUTH_CALLBACK_URL,
      overallStatus: isCoreReady ? 'CORE_APPLICATION_READY' : 'DEGRADED',
      coreApplicationReady: isCoreReady,
      productReleaseLocked: PRODUCT_RELEASE_LOCKED,
      releaseManifest: getAuthoritativeReleaseManifest(),
      externalDiscordVerified: discordRestVerification.outcome,
      externalDiscordClassification: discordRestVerification.classification,
      externalDiscordDetails: {
        httpStatus: discordRestVerification.httpStatus,
        discordErrorCode: discordRestVerification.discordErrorCode,
        errorMessage: discordRestVerification.errorMessage,
        botUserId: discordRestVerification.botUserId,
        latencyMs: discordRestVerification.latencyMs,
      },
      isStartupValid: (config as any).isStartupValid !== false,
      startupErrors: (config as any).startupErrors || [],
      singleBotRuntimeSafety: {
        enabled: config.BOT_SINGLE_RUNTIME_ENABLED,
        status: config.BOT_SINGLE_RUNTIME_ENABLED ? 'SINGLE_RUNTIME_ENFORCED' : 'MULTI_RUNTIME_ALLOWED',
      },
      databaseReadiness: {
        isReady: firestoreCheck.isReady,
        status: databaseStatus,
        error: cleanFirestoreError,
        projectId: config.GOOGLE_CLOUD_PROJECT_ID,
        databaseId: config.FIRESTORE_DATABASE_ID,
        ...getFirestoreDiagnostics(),
      },
      statuses: {
        Application: isCoreReady ? 'READY' : 'DEGRADED',
        Database: databaseStatus,
        DiscordOAuth: isOauthConfigured ? 'READY' : 'NOT_CONFIGURED',
        DiscordBot: isBotReady ? 'READY' : (isBotConfigured ? 'DEGRADED (DISCONNECTED)' : 'NOT_CONFIGURED'),
        Gateway: isBotReady ? 'READY' : (discordDiag.state === 'CONNECTING' ? 'CONNECTING' : (isBotConfigured ? 'DEGRADED (DISCONNECTED)' : 'NOT_CONFIGURED')),
        REST: discordRestVerification.classification,
        GuildLinking: isBotReady ? 'READY' : 'DEGRADED',
        RoleSync: isBotReady ? 'READY' : 'DEGRADED',
        Workers: 'READY',
        Telemetry: 'READY',
        CommunityBrain: isAiConfigured ? 'READY' : 'NOT_CONFIGURED',
        GoogleCalendar: 'OPTIONAL',
        Stripe: isStripeConfigured ? 'READY' : 'NOT_CONFIGURED',
      },
      timestamp: new Date().toISOString(),
    };
  }
}

export const healthService = new HealthService();
