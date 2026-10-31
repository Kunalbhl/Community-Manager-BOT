import { config } from '../config/env.js';
import { isRealPersistenceMode, checkFirestoreReadiness } from '../repositories/firestore.repository.js';
import { discordService } from '../integrations/discord/discord.service.js';

export type ProviderStatus = 'REAL' | 'SIMULATION' | 'UNAVAILABLE' | 'UNKNOWN';

export interface ProviderAuthoritySnapshot {
  discordRestProvider: ProviderStatus;
  discordGatewayProvider: ProviderStatus;
  firestoreProvider: ProviderStatus;
  authProvider: ProviderStatus;
  schedulerProvider: ProviderStatus;
  engagementDeliveryProvider: ProviderStatus;
  sessionProvider: ProviderStatus;
  auditProvider: ProviderStatus;
}

export class ProductionProviderAuthorityService {
  public static async getSnapshot(): Promise<ProviderAuthoritySnapshot> {
    const isRealDB = isRealPersistenceMode();
    const isSimMode = config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION' || !isRealDB;

    // 1. Firestore Provider Status
    let firestoreProvider: ProviderStatus = 'SIMULATION';
    if (isRealDB) {
      const check = await checkFirestoreReadiness().catch(() => ({ isReady: false }));
      firestoreProvider = check.isReady ? 'REAL' : 'UNAVAILABLE';
    }

    // 2. Discord REST Provider Status
    let discordRestProvider: ProviderStatus = 'SIMULATION';
    if (!isSimMode) {
      const hasRealToken = config.DISCORD_BOT_TOKEN && !config.DISCORD_BOT_TOKEN.startsWith('mock_');
      discordRestProvider = hasRealToken ? 'REAL' : 'UNAVAILABLE';
    }

    // 3. Discord Gateway Provider Status
    let discordGatewayProvider: ProviderStatus = 'SIMULATION';
    if (!isSimMode) {
      discordGatewayProvider = discordService.isConnected() ? 'REAL' : 'UNAVAILABLE';
    }

    // 4. Auth Provider Status
    let authProvider: ProviderStatus = 'SIMULATION';
    if (!isSimMode) {
      const hasRealOauth = config.DISCORD_CLIENT_ID && config.DISCORD_CLIENT_SECRET && !config.DISCORD_CLIENT_SECRET.startsWith('mock_');
      authProvider = hasRealOauth ? 'REAL' : 'UNAVAILABLE';
    }

    // 5. Scheduler Provider Status
    const schedulerProvider: ProviderStatus = isRealDB ? 'REAL' : 'SIMULATION';

    // 6. Engagement Delivery Provider Status
    let engagementDeliveryProvider: ProviderStatus = 'SIMULATION';
    if (!isSimMode) {
      engagementDeliveryProvider = discordService.isConnected() ? 'REAL' : 'UNAVAILABLE';
    }

    // 7. Session Provider Status
    const sessionProvider: ProviderStatus = isRealDB ? 'REAL' : 'SIMULATION';

    // 8. Audit Provider Status
    const auditProvider: ProviderStatus = isRealDB ? 'REAL' : 'SIMULATION';

    return {
      discordRestProvider,
      discordGatewayProvider,
      firestoreProvider,
      authProvider,
      schedulerProvider,
      engagementDeliveryProvider,
      sessionProvider,
      auditProvider,
    };
  }
}
