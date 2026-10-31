import { config } from '../config/env.js';
import { logger } from '../logging/logger.js';

export type CredentialRetrievalStatus = 'SUCCESS' | 'MISSING_ENV_VAR' | 'MALFORMED_TOKEN_STRUCTURE';

export type DiagnosticIsolationCategory =
  | 'TOKEN_INVALIDITY'
  | 'CREDENTIAL_RETRIEVAL_ERROR'
  | 'CREDENTIAL_VALID'
  | 'NETWORK_ERROR';

export interface DiscordDiagnosticIsolationResult {
  applicationId: string;
  runtimeMode: string;
  serviceName: string;
  region: string;
  activeRevision: string;
  credentialRetrieval: {
    status: CredentialRetrievalStatus;
    tokenPresent: boolean;
    tokenLength: number;
    tokenStructureValid: boolean;
    isDelimitedFormat: boolean;
    hasWhitespace: boolean;
    source: 'CLOUD_RUN_ENVIRONMENT';
    details: string;
  };
  upstreamVerification: {
    endpoint: string;
    httpStatus: number;
    httpStatusText: string;
    discordErrorCode: number | null;
    discordErrorMessage: string | null;
    cloudflareRayId: string | null;
    discordServerTimestamp: string | null;
    latencyMs: number;
    botIdentity: {
      id: string;
      username: string;
      discriminator: string;
      bot: boolean;
      verified: boolean;
    } | null;
  };
  isolationCategory: DiagnosticIsolationCategory;
  rootCauseSummary: string;
  recommendedAction: string;
  verifiedAt: string;
}

export class DiscordDiagnosticService {
  /**
   * Diagnostic test that invokes the Discord /users/@me endpoint using currently active
   * environment credentials in production to isolate whether the 401 response is caused by
   * token invalidity or credential retrieval errors.
   */
  public static async isolateCredentialStatus(): Promise<DiscordDiagnosticIsolationResult> {
    const rawToken = process.env.DISCORD_BOT_TOKEN || config.DISCORD_BOT_TOKEN || '';
    const tokenPresent = Boolean(rawToken && rawToken.trim().length > 0);
    const tokenLength = rawToken.length;
    const hasWhitespace = /\s/.test(rawToken);
    const parts = rawToken.split('.');
    const isDelimitedFormat = parts.length === 3 && parts.every((p) => p.length > 0);
    const tokenStructureValid = tokenPresent && !hasWhitespace && isDelimitedFormat && tokenLength >= 50;

    const applicationId = config.DISCORD_APPLICATION_ID || config.DISCORD_CLIENT_ID || '1547515985416822884';
    const runtimeMode = config.APP_RUNTIME_MODE || 'PRODUCTION';
    const serviceName = process.env.K_SERVICE || 'community-manager';
    const region = 'asia-southeast1';
    const activeRevision = process.env.K_REVISION || 'community-manager-rev-152';

    let retrievalStatus: CredentialRetrievalStatus = 'SUCCESS';
    let retrievalDetails = 'Credential successfully retrieved from the active Cloud Run runtime environment.';

    if (!tokenPresent) {
      retrievalStatus = 'MISSING_ENV_VAR';
      retrievalDetails = 'DISCORD_BOT_TOKEN is not defined or is empty in the runtime environment.';
    } else if (!tokenStructureValid) {
      retrievalStatus = 'MALFORMED_TOKEN_STRUCTURE';
      retrievalDetails = `Token retrieved but fails structural validation (hasWhitespace=${hasWhitespace}, partsCount=${parts.length}, length=${tokenLength}).`;
    }

    // Default upstream response metadata
    let httpStatus = 0;
    let httpStatusText = 'UNEXECUTED';
    let discordErrorCode: number | null = null;
    let discordErrorMessage: string | null = null;
    let cloudflareRayId: string | null = null;
    let discordServerTimestamp: string | null = null;
    let latencyMs = 0;
    let botIdentity: any = null;
    let isolationCategory: DiagnosticIsolationCategory = 'CREDENTIAL_RETRIEVAL_ERROR';
    let rootCauseSummary = '';
    let recommendedAction = '';

    if (retrievalStatus !== 'SUCCESS') {
      isolationCategory = 'CREDENTIAL_RETRIEVAL_ERROR';
      rootCauseSummary = `Credential Retrieval Error: ${retrievalDetails}`;
      recommendedAction = 'Ensure the Cloud Run environment secret DISCORD_BOT_TOKEN is properly provisioned and mapped to the container.';
    } else {
      const startTime = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4500);

        const discordRes = await fetch('https://discord.com/api/v10/users/@me', {
          method: 'GET',
          headers: {
            Authorization: `Bot ${rawToken.trim()}`,
            'User-Agent': 'CommunityManagerBot (https://ais-pre-r5qyczd2uopvtudtnbw5gv-1055131702168.asia-southeast1.run.app, 1.0.0)',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        latencyMs = Date.now() - startTime;
        httpStatus = discordRes.status;
        httpStatusText = discordRes.statusText;
        cloudflareRayId = discordRes.headers.get('cf-ray');
        discordServerTimestamp = discordRes.headers.get('date');

        let resJson: any = null;
        try {
          resJson = await discordRes.json();
        } catch {
          resJson = null;
        }

        if (resJson) {
          discordErrorCode = typeof resJson.code === 'number' ? resJson.code : null;
          discordErrorMessage = resJson.message || null;
        }

        if (httpStatus === 200 && resJson) {
          isolationCategory = 'CREDENTIAL_VALID';
          botIdentity = {
            id: resJson.id || applicationId,
            username: resJson.username || 'CommunityBot',
            discriminator: resJson.discriminator || '0000',
            bot: resJson.bot === true,
            verified: resJson.verified === true,
          };
          rootCauseSummary = 'Credential Valid: Upstream Discord authentication accepted the bot token with HTTP 200 OK.';
          recommendedAction = 'Token is fully verified. Discord Gateway and live operations may proceed.';
        } else if (httpStatus === 401) {
          isolationCategory = 'TOKEN_INVALIDITY';
          rootCauseSummary = 'Token Invalidity Confirmed: Credential retrieval from Cloud Run succeeded without errors (token is present, non-empty, and structurally valid 3-part delimited format), but upstream Discord API rejected the token with HTTP 401 Unauthorized.';
          recommendedAction = 'Generate a new bot token in the Discord Developer Portal under Application ID 1547515985416822884 ("Bot" -> "Reset Token"), then update the DISCORD_BOT_TOKEN secret in Cloud Run.';
        } else {
          isolationCategory = 'TOKEN_INVALIDITY';
          rootCauseSummary = `Upstream Discord API returned unexpected HTTP ${httpStatus} (${httpStatusText}).`;
          recommendedAction = `Inspect Discord API response details (Error Code: ${discordErrorCode}, Message: ${discordErrorMessage}).`;
        }
      } catch (err: any) {
        latencyMs = Date.now() - startTime;
        isolationCategory = 'NETWORK_ERROR';
        httpStatus = 0;
        httpStatusText = 'NETWORK_EXCEPTION';
        rootCauseSummary = `Network Error: Failed to reach Discord API endpoint https://discord.com/api/v10/users/@me (${err.message}).`;
        recommendedAction = 'Verify outbound internet connectivity and firewall rules from the Cloud Run instance.';
      }
    }

    logger.info(`[DiscordDiagnosticService] Credential Isolation Result: ${isolationCategory} (HTTP ${httpStatus}, latency ${latencyMs}ms)`);

    return {
      applicationId,
      runtimeMode,
      serviceName,
      region,
      activeRevision,
      credentialRetrieval: {
        status: retrievalStatus,
        tokenPresent,
        tokenLength,
        tokenStructureValid,
        isDelimitedFormat,
        hasWhitespace,
        source: 'CLOUD_RUN_ENVIRONMENT',
        details: retrievalDetails,
      },
      upstreamVerification: {
        endpoint: 'https://discord.com/api/v10/users/@me',
        httpStatus,
        httpStatusText,
        discordErrorCode,
        discordErrorMessage,
        cloudflareRayId,
        discordServerTimestamp,
        latencyMs,
        botIdentity,
      },
      isolationCategory,
      rootCauseSummary,
      recommendedAction,
      verifiedAt: new Date().toISOString(),
    };
  }
}
