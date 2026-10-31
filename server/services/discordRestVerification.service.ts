import { config } from '../config/env.js';
import { logger } from '../logging/logger.js';
import { secretsManager } from '../security/secrets.js';

export type DiscordRestClassification =
  | 'NOT_CONFIGURED'
  | 'AUTHENTICATION_FAILED'
  | 'DISCORD_API_UNAVAILABLE'
  | 'NETWORK_BLOCKED'
  | 'RATE_LIMITED'
  | 'PERMISSION_REQUIRED'
  | 'SUCCESS';

export type ExternalVerificationOutcome =
  | 'VERIFIED'
  | 'BLOCKED_BY_ENVIRONMENT'
  | 'FAILED';

export interface DiscordRestVerificationResult {
  outcome: ExternalVerificationOutcome;
  classification: DiscordRestClassification;
  httpStatus?: number;
  discordErrorCode?: number;
  errorMessage?: string;
  botUserId?: string;
  botTag?: string;
  latencyMs: number;
  timestamp: string;
}

export class DiscordRestVerificationService {
  /**
   * Safely verifies real Discord REST API endpoint (/users/@me) using configured credentials.
   * Never logs or exposes raw tokens or sensitive headers.
   * Distinguishes truthful classifications:
   * - NOT_CONFIGURED (when token is missing or placeholder)
   * - AUTHENTICATION_FAILED (when Discord actually responds with 401 Unauthorized)
   * - PERMISSION_REQUIRED (when Discord responds with 403 Forbidden)
   * - RATE_LIMITED (when Discord responds with 429 Too Many Requests)
   * - DISCORD_API_UNAVAILABLE (when Discord responds with 5xx)
   * - NETWORK_BLOCKED (when fetch fails at the network/DNS layer before reaching Discord)
   * - SUCCESS (when 200 OK with expected authoritative bot ID)
   */
  static async verifyCurrentUser(customFetch?: typeof fetch): Promise<DiscordRestVerificationResult> {
    const fetchFn = customFetch || fetch;
    const timestamp = new Date().toISOString();
    const token = config.DISCORD_BOT_TOKEN;

    // 1. Proof of credential absence
    if (!token || token.trim() === '' || token.startsWith('mock_')) {
      logger.info('[DiscordRestVerification] DISCORD_BOT_TOKEN is not configured or mock placeholder in environment.');
      return {
        outcome: 'FAILED',
        classification: 'NOT_CONFIGURED',
        errorMessage: 'DISCORD_BOT_TOKEN is not configured in server environment.',
        latencyMs: 0,
        timestamp,
      };
    }

    const startTime = Date.now();
    try {
      const response = await fetchFn('https://discord.com/api/v10/users/@me', {
        headers: {
          Authorization: `Bot ${token}`,
          'User-Agent': 'CommunityManagerBot/2.5.0',
        },
        signal: AbortSignal.timeout(8000),
      });

      const latencyMs = Date.now() - startTime;
      const httpStatus = response.status;

      let bodyData: any = null;
      try {
        bodyData = await response.json();
      } catch {
        // Body was not JSON
      }

      const discordErrorCode = typeof bodyData?.code === 'number' ? bodyData.code : undefined;

      // Classify response from live Discord API
      if (httpStatus === 200) {
        const expectedAppId = config.DISCORD_APPLICATION_ID || '1547515985416822884';
        const isBot = Boolean(bodyData?.bot);
        const botUserId = bodyData?.id;
        const botTag = bodyData?.username ? `${bodyData.username}#${bodyData.discriminator || '0'}` : undefined;

        if (isBot && botUserId === expectedAppId) {
          logger.info(`[DiscordRestVerification] REST API verified successfully for bot ID: ${botUserId} (${latencyMs}ms)`);
          return {
            outcome: 'VERIFIED',
            classification: 'SUCCESS',
            httpStatus,
            botUserId,
            botTag,
            latencyMs,
            timestamp,
          };
        } else {
          logger.warn(`[DiscordRestVerification] Bot returned unexpected ID or is not a bot user (ID: ${botUserId}, expected: ${expectedAppId})`);
          return {
            outcome: 'FAILED',
            classification: 'AUTHENTICATION_FAILED',
            httpStatus,
            discordErrorCode,
            errorMessage: `Authenticated user (${botUserId}) does not match expected bot application (${expectedAppId}).`,
            botUserId,
            botTag,
            latencyMs,
            timestamp,
          };
        }
      }

      if (httpStatus === 401) {
        // Request reached Discord, but credentials were rejected.
        logger.warn(`[DiscordRestVerification] Discord API rejected credentials: HTTP 401 Unauthorized (code: ${discordErrorCode ?? 'none'}, latency: ${latencyMs}ms)`);
        return {
          outcome: 'FAILED',
          classification: 'AUTHENTICATION_FAILED',
          httpStatus,
          discordErrorCode,
          errorMessage: 'Discord API rejected authentication (HTTP 401 Unauthorized). Check DISCORD_BOT_TOKEN validity.',
          latencyMs,
          timestamp,
        };
      }

      if (httpStatus === 403) {
        logger.warn(`[DiscordRestVerification] Discord API permission denied: HTTP 403 Forbidden (code: ${discordErrorCode ?? 'none'})`);
        return {
          outcome: 'FAILED',
          classification: 'PERMISSION_REQUIRED',
          httpStatus,
          discordErrorCode,
          errorMessage: 'Discord API rejected request due to missing permissions (HTTP 403 Forbidden).',
          latencyMs,
          timestamp,
        };
      }

      if (httpStatus === 429) {
        logger.warn(`[DiscordRestVerification] Discord API rate limited: HTTP 429 (latency: ${latencyMs}ms)`);
        return {
          outcome: 'FAILED',
          classification: 'RATE_LIMITED',
          httpStatus,
          discordErrorCode,
          errorMessage: 'Discord API request was rate limited (HTTP 429). Retry after backoff.',
          latencyMs,
          timestamp,
        };
      }

      if (httpStatus >= 500) {
        logger.error(`[DiscordRestVerification] Discord API returned server error: HTTP ${httpStatus}`);
        return {
          outcome: 'FAILED',
          classification: 'DISCORD_API_UNAVAILABLE',
          httpStatus,
          discordErrorCode,
          errorMessage: `Discord API is currently unavailable or returned HTTP ${httpStatus}.`,
          latencyMs,
          timestamp,
        };
      }

      // Any other unexpected status code
      return {
        outcome: 'FAILED',
        classification: 'AUTHENTICATION_FAILED',
        httpStatus,
        discordErrorCode,
        errorMessage: `Discord API returned unexpected HTTP status ${httpStatus}.`,
        latencyMs,
        timestamp,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const rawError = err.message || 'Unknown network error';
      const safeError = secretsManager.redactString(rawError);

      // Independent evidence check: request never reached Discord
      logger.warn(`[DiscordRestVerification] Network failure reaching Discord API: ${safeError} (${latencyMs}ms)`);

      return {
        outcome: 'BLOCKED_BY_ENVIRONMENT',
        classification: 'NETWORK_BLOCKED',
        errorMessage: `Network error reaching Discord REST API: ${safeError}`,
        latencyMs,
        timestamp,
      };
    }
  }
}

export const discordRestVerificationService = DiscordRestVerificationService;
