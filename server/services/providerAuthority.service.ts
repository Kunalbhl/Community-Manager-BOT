import { config, isProductionRuntime, isReleaseLocked } from '../config/env.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { discordAuthService } from './discordAuth.service.js';
import { activePersistenceProvider } from '../repositories/persistence.provider.js';
import { logger } from '../logging/logger.js';

export type ProviderHealthState = 'READY' | 'NOT_CONFIGURED' | 'UNAVAILABLE' | 'RESTRICTED' | 'ERROR';

export interface ProviderStatusReport {
  locked: boolean;
  runtimeMode: string;
  providers: {
    persistence: {
      name: string;
      isAuthoritative: boolean;
      status: ProviderHealthState;
      databaseId?: string;
    };
    discord: {
      name: string;
      isAuthoritative: boolean;
      status: ProviderHealthState;
      botConnected: boolean;
    };
    auth: {
      name: string;
      isAuthoritative: boolean;
      status: ProviderHealthState;
    };
    ai: {
      name: string;
      isAuthoritative: boolean;
      status: ProviderHealthState;
    };
  };
}

export class ProviderAuthorityService {
  private static instance: ProviderAuthorityService;

  private constructor() {
    this.assertIntegrity();
  }

  public static getInstance(): ProviderAuthorityService {
    if (!ProviderAuthorityService.instance) {
      ProviderAuthorityService.instance = new ProviderAuthorityService();
    }
    return ProviderAuthorityService.instance;
  }

  public assertIntegrity(): void {
    if (config.APP_RUNTIME_MODE === 'PRODUCTION') {
      const providerName = activePersistenceProvider?.constructor?.name || '';
      if (providerName.toLowerCase().includes('simulat') || providerName.toLowerCase().includes('memory')) {
        logger.error('[ProviderAuthority] VIOLATION: Non-authoritative persistence provider detected in production mode.');
        throw new Error('NON_AUTHORITATIVE_PERSISTENCE_PROVIDER_BLOCKED');
      }
    }
  }

  public async getProviderStatus(): Promise<ProviderStatusReport> {
    const isLocked = isReleaseLocked();
    const runtimeMode = config.APP_RUNTIME_MODE;

    // 1. Persistence Provider Evaluation
    const persistenceName = activePersistenceProvider?.constructor?.name || 'UnknownPersistence';
    const isPersistenceSimulated = persistenceName.toLowerCase().includes('simulat') || persistenceName.toLowerCase().includes('memory');
    let persistenceStatus: ProviderHealthState = 'READY';
    if (!config.FIRESTORE_DATABASE_ID && isProductionRuntime()) {
      persistenceStatus = 'NOT_CONFIGURED';
    } else if (isPersistenceSimulated && isProductionRuntime()) {
      persistenceStatus = 'ERROR';
    }

    // 2. Discord Provider Evaluation
    const hasBotToken = Boolean(config.DISCORD_BOT_TOKEN && config.DISCORD_BOT_TOKEN.length > 20);
    const isConnected = discordService.isConnected();
    let discordStatus: ProviderHealthState = 'READY';
    if (!hasBotToken) {
      discordStatus = 'NOT_CONFIGURED';
    } else if (!isConnected) {
      discordStatus = 'UNAVAILABLE';
    }

    // 3. Auth Provider Evaluation
    const hasSessionSecret = Boolean(config.SESSION_SECRET && config.SESSION_SECRET.length >= 32);
    let authStatus: ProviderHealthState = 'READY';
    if (!hasSessionSecret) {
      authStatus = 'NOT_CONFIGURED';
    }

    // 4. AI Provider Evaluation
    const hasAiKey = Boolean(process.env.GEMINI_API_KEY || config.GEMINI_API_KEY);
    let aiStatus: ProviderHealthState = 'READY';
    if (!hasAiKey) {
      aiStatus = 'NOT_CONFIGURED';
    }

    return {
      locked: isLocked,
      runtimeMode,
      providers: {
        persistence: {
          name: persistenceName,
          isAuthoritative: !isPersistenceSimulated,
          status: persistenceStatus,
          databaseId: config.FIRESTORE_DATABASE_ID,
        },
        discord: {
          name: 'AuthoritativeDiscordService',
          isAuthoritative: true,
          status: discordStatus,
          botConnected: isConnected,
        },
        auth: {
          name: 'AuthoritativeDiscordAuthService',
          isAuthoritative: true,
          status: authStatus,
        },
        ai: {
          name: 'AuthoritativeGeminiAIProvider',
          isAuthoritative: true,
          status: aiStatus,
        },
      },
    };
  }
}

export const providerAuthority = ProviderAuthorityService.getInstance();
