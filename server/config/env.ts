import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { validateEnvironment } from './envValidation.js';
dotenv.config();

export interface AppConfig {
  NODE_ENV: 'development' | 'production' | 'test' | 'staging';
  APP_ENV: 'development' | 'production' | 'test' | 'staging';
  PORT: number;
  APP_URL: string;
  DISCORD_OAUTH_CALLBACK_URL: string;
  BOT_SINGLE_RUNTIME_ENABLED: boolean;

  // Free-First Architecture Controls
  FREE_MODE: boolean;
  MAX_AI_REQUESTS_PER_DAY: number;
  MAX_APPLICATIONS_PER_DAY: number;
  MAX_SHEET_WRITES_PER_DAY: number;
  MAX_AI_TOKENS_PER_REQUEST: number;

  // Session & Security
  SESSION_SECRET?: string;

  // Discord Bot & OAuth
  DISCORD_BOT_TOKEN?: string;
  DISCORD_APPLICATION_ID?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  DISCORD_REDIRECT_URI?: string;
  DISCORD_PUBLIC_KEY?: string;

  // Google Cloud & Firestore
  GOOGLE_CLOUD_PROJECT_ID?: string;
  GOOGLE_CLOUD_REGION?: string;
  FIRESTORE_DATABASE_ID?: string;

  // Community Brain AI & Sheets
  AI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GOOGLE_SHEETS_SPREADSHEET_ID?: string;

  // Billing Provider Controls
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;

  // Platform Administration (Configurable - never hardcoded in production)
  PLATFORM_OWNER_USER_ID?: string;
  PLATFORM_OWNER_EMAIL?: string;
  PLATFORM_ADMIN_KEY?: string;

  // Development Seeding Controls
  COMMUNITY_DEV_SEEDING_ENABLED: boolean;

  // Development Simulation Enabled
  DEV_SIMULATION_ENABLED: boolean;

  // Release Lock Control
  PRODUCT_RELEASE_LOCKED: boolean;

  // Runtime operational mode
  APP_RUNTIME_MODE: 'DEVELOPMENT_SIMULATION' | 'REAL_DISCORD_PREVIEW' | 'PRODUCTION';
}

export const CANONICAL_PRODUCTION_URL = 'https://community-manager.chaloone.com';

export const LEGACY_PRODUCTION_URL = 'https://community-manager-bot-720940628402.asia-southeast1.run.app';
/** The old Cloud Run address now lives at community-manager.chaloone.com: settings that still name it are moved over. */
function migrateLegacyUrl(name: string) {
  const v = process.env[name];
  if (v && v.includes(LEGACY_PRODUCTION_URL)) process.env[name] = v.split(LEGACY_PRODUCTION_URL).join(CANONICAL_PRODUCTION_URL);
}

export function loadConfig(): AppConfig {
  for (const k of ['APP_URL', 'DISCORD_REDIRECT_URI', 'CUSTOM_DOMAIN_URL', 'GOOGLE_REDIRECT_URI']) migrateLegacyUrl(k);
  const nodeEnv = (process.env.NODE_ENV as 'development' | 'production' | 'test' | 'staging') || 'development';
  const rawAppEnv = process.env.APP_ENV;
  const validEnvs = ['development', 'production', 'test', 'staging'];
  const appEnv = (rawAppEnv && validEnvs.includes(rawAppEnv.toLowerCase()))
    ? (rawAppEnv.toLowerCase() as 'development' | 'production' | 'test' | 'staging')
    : nodeEnv;

  const rawOwnerUserId = process.env.PLATFORM_OWNER_USER_ID;
  const rawOwnerEmail = process.env.PLATFORM_OWNER_EMAIL;

  let ownerUserId: string = rawOwnerUserId || '';
  let ownerEmail: string = rawOwnerEmail || '';

  if (ownerUserId && ownerUserId.includes('@')) {
    if (!ownerEmail) {
      ownerEmail = ownerUserId;
    }
    ownerUserId = ''; // Clear snowflake ID if value is an email address
  }
  const isProdOrStaging = appEnv === 'production' || appEnv === 'staging' || nodeEnv === 'production' || nodeEnv === 'staging';

  const rawRuntimeMode = process.env.APP_RUNTIME_MODE;
  let resolvedRuntimeMode: 'DEVELOPMENT_SIMULATION' | 'REAL_DISCORD_PREVIEW' | 'PRODUCTION' = 'PRODUCTION';

  const isSandbox = (() => {
    // AUTHORITATIVE production URL — always use the real Cloud Run URL in production
    // regardless of which host served the request (AI Studio, Cloud Run, etc.)
    const appUrl = process.env.APP_URL || process.env.AIS_APP_URL || process.env.SHARED_APP_URL || '';
    return (
      Boolean(process.env.AIS_APP_URL) ||
      Boolean(process.env.SHARED_APP_URL) ||
      appUrl.includes('ais-dev') ||
      appUrl.includes('ais-pre')
    );
  })();

  const hasCredentials = Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_CLIENT_SECRET);

  // Production only. Simulation / demo mode has been removed; preview is allowed only when asked for explicitly.
  if (rawRuntimeMode === 'real-preview' || rawRuntimeMode === 'REAL_DISCORD_PREVIEW') resolvedRuntimeMode = 'REAL_DISCORD_PREVIEW';
  void isSandbox; void hasCredentials; void isProdOrStaging;
  const devSimulationEnabled = false;

  const aiApiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || undefined;
  const parsedPort = Number(process.env.PORT || 3000);

  // Reject APP_URL values that are Discord OAuth URLs (a common misconfiguration)
  const rawAppUrl = process.env.APP_URL || process.env.CUSTOM_DOMAIN_URL || process.env.AIS_APP_URL || process.env.SHARED_APP_URL || '';
  const resolvedAppUrl = (rawAppUrl && !rawAppUrl.includes('discord.com') && !rawAppUrl.includes('oauth2/authorize'))
    ? rawAppUrl
    : (isProdOrStaging ? CANONICAL_PRODUCTION_URL : `http://localhost:${parsedPort}`);
  const rawRedirectUri = process.env.DISCORD_REDIRECT_URI;
  // A valid DISCORD_REDIRECT_URI must point to YOUR server's callback, not discord.com
  const isValidRedirectUri = rawRedirectUri &&
    rawRedirectUri.includes('/api/v1/auth/callback') &&
    !rawRedirectUri.includes('discord.com');
  const oauthCallbackUrl = isValidRedirectUri
    ? rawRedirectUri
    : (resolvedAppUrl ? `${resolvedAppUrl}/api/v1/auth/callback` : '');

  const appConfig: AppConfig = {
    NODE_ENV: nodeEnv,
    APP_ENV: appEnv,
    PORT: isNaN(parsedPort) ? 3000 : parsedPort,
    APP_URL: resolvedAppUrl,
    DISCORD_OAUTH_CALLBACK_URL: oauthCallbackUrl,
    BOT_SINGLE_RUNTIME_ENABLED: process.env.BOT_SINGLE_RUNTIME_ENABLED !== 'false',

    // Default to strict FREE_MODE
    FREE_MODE: process.env.FREE_MODE !== 'false',
    MAX_AI_REQUESTS_PER_DAY: parseInt(process.env.MAX_AI_REQUESTS_PER_DAY || '100', 10),
    MAX_APPLICATIONS_PER_DAY: parseInt(process.env.MAX_APPLICATIONS_PER_DAY || '50', 10),
    MAX_SHEET_WRITES_PER_DAY: parseInt(process.env.MAX_SHEET_WRITES_PER_DAY || '200', 10),
    MAX_AI_TOKENS_PER_REQUEST: parseInt(process.env.MAX_AI_TOKENS_PER_REQUEST || '2048', 10),

    // In production/staging, SESSION_SECRET must be explicitly supplied (no automatic generation)
    SESSION_SECRET: (() => {
      const raw = process.env.SESSION_SECRET;
      // Reject URL-shaped values (a common misconfiguration — someone put a URL in this field)
      if (raw && (raw.startsWith('http://') || raw.startsWith('https://'))) return undefined;
      if (raw) return raw;
      if (resolvedRuntimeMode === 'PRODUCTION' || resolvedRuntimeMode === 'REAL_DISCORD_PREVIEW') {
        // Fallback: securely auto-generate a persistent-like key so the server starts safely
        return crypto.randomBytes(32).toString('hex');
      }
      return 'community-manager-session-secret-dev-safe';
    })(),

    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || undefined,
    DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID || process.env.DISCORD_CLIENT_ID || undefined,
    DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID || process.env.DISCORD_APPLICATION_ID || undefined,
    DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET || undefined,
    DISCORD_REDIRECT_URI: isValidRedirectUri ? rawRedirectUri : undefined,
    DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY || undefined,

    GOOGLE_CLOUD_PROJECT_ID: (() => {
      let projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT;
      if (!projectId) {
        try {
          const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
          if (fs.existsSync(configPath)) {
            const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (parsed.projectId && typeof parsed.projectId === 'string') {
              projectId = parsed.projectId.trim();
            }
          }
        } catch {
          // Ignore
        }
      }
      return projectId || '';
    })(),
    GOOGLE_CLOUD_REGION: process.env.GOOGLE_CLOUD_REGION || 'asia-southeast1',
    FIRESTORE_DATABASE_ID: (() => {
      let dbId: string | undefined = undefined;
      // 1. Check firebase-applet-config.json as primary source of truth
      try {
        const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
        if (fs.existsSync(configPath)) {
          const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          if (parsed.firestoreDatabaseId && typeof parsed.firestoreDatabaseId === 'string') {
            const candidate = parsed.firestoreDatabaseId.trim();
            if (!candidate.startsWith('http://') && !candidate.startsWith('https://') && !candidate.includes('/')) {
              dbId = candidate;
            }
          }
        }
      } catch {
        // Ignore
      }

      // 2. Check process.env.FIRESTORE_DATABASE_ID if valid (reject URLs)
      if (!dbId && process.env.FIRESTORE_DATABASE_ID) {
        const candidate = process.env.FIRESTORE_DATABASE_ID.trim();
        if (!candidate.startsWith('http://') && !candidate.startsWith('https://') && !candidate.includes('/')) {
          dbId = candidate;
        }
      }

      const isProdOrStaging = process.env.NODE_ENV === 'production' || process.env.APP_RUNTIME_MODE === 'PRODUCTION' || process.env.APP_RUNTIME_MODE === 'REAL_DISCORD_PREVIEW';
      if (!dbId || (isProdOrStaging && dbId === '(default)')) {
        dbId = isProdOrStaging ? 'ai-studio-communitymanager-59f17f1d-8b74-490e-9248-bc41e69de7ef' : '(default)';
      }
      return dbId;
    })(),

    AI_API_KEY: aiApiKey,
    GEMINI_API_KEY: aiApiKey,
    GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || undefined,

    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || undefined,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || undefined,

    PLATFORM_OWNER_USER_ID: ownerUserId,
    PLATFORM_OWNER_EMAIL: ownerEmail,
    PLATFORM_ADMIN_KEY: process.env.PLATFORM_ADMIN_KEY || (isProdOrStaging ? undefined : 'community-admin-key-default'),

    COMMUNITY_DEV_SEEDING_ENABLED: isProdOrStaging ? false : (process.env.COMMUNITY_DEV_SEEDING_ENABLED === 'true'),
    DEV_SIMULATION_ENABLED: devSimulationEnabled,
    PRODUCT_RELEASE_LOCKED: process.env.PRODUCT_RELEASE_LOCKED !== 'false',
    APP_RUNTIME_MODE: resolvedRuntimeMode,
  };

  const validationResult = validateEnvironment(appConfig);
  (appConfig as any).startupErrors = validationResult.errors;
  (appConfig as any).isStartupValid = validationResult.valid;

  if (!validationResult.valid && validationResult.errors.length > 0) {
    console.warn('==================================================');
    console.warn('HARDENED FAIL-CLOSED OPERATIONAL STATE ACTIVE');
    console.warn(validationResult.errors.join('\n'));
    console.warn('==================================================');
  }

  return appConfig;
}

export const config = loadConfig();

export class ConfigurationError extends Error {
  public code: string;
  constructor(message: string, code: string = 'CONFIGURATION_ERROR') {
    super(message);
    this.name = 'ConfigurationError';
    this.code = code;
  }
}

export function validateProductionConfig(config: AppConfig, options?: { requireFirestore?: boolean }): void {
  if (config.APP_RUNTIME_MODE === 'PRODUCTION' || config.APP_RUNTIME_MODE === 'REAL_DISCORD_PREVIEW') {
    if (!config.SESSION_SECRET || config.SESSION_SECRET.trim().length < 32 || config.SESSION_SECRET === 'community-manager-session-secret-dev-safe') {
      throw new ConfigurationError('CONFIGURATION_ERROR: SESSION_SECRET is required in production modes and must be at least 32 characters long.', 'INVALID_SESSION_SECRET');
    }
    if (!config.DISCORD_BOT_TOKEN || config.DISCORD_BOT_TOKEN.trim() === '') {
      throw new ConfigurationError('CONFIGURATION_ERROR: DISCORD_BOT_TOKEN is required in production modes.', 'MISSING_DISCORD_BOT_TOKEN');
    }
    if (!config.DISCORD_CLIENT_SECRET || config.DISCORD_CLIENT_SECRET.trim() === '') {
      throw new ConfigurationError('CONFIGURATION_ERROR: DISCORD_CLIENT_SECRET is required in production modes.', 'MISSING_DISCORD_CLIENT_SECRET');
    }
    if (!config.DISCORD_APPLICATION_ID && !config.DISCORD_CLIENT_ID) {
      throw new ConfigurationError('CONFIGURATION_ERROR: DISCORD_APPLICATION_ID or DISCORD_CLIENT_ID is required in production modes.', 'MISSING_DISCORD_CLIENT_ID');
    }
    if (!config.DISCORD_REDIRECT_URI || (!config.DISCORD_REDIRECT_URI.startsWith('http://') && !config.DISCORD_REDIRECT_URI.startsWith('https://'))) {
      throw new ConfigurationError('CONFIGURATION_ERROR: DISCORD_REDIRECT_URI must be a valid absolute URL in production modes.', 'INVALID_DISCORD_REDIRECT_URI');
    }
    if (options?.requireFirestore || config.APP_RUNTIME_MODE === 'PRODUCTION') {
      const explicitGcp = (config as any).GCP_PROJECT_ID;
      const gcpProject = explicitGcp !== undefined ? explicitGcp : (config.GOOGLE_CLOUD_PROJECT_ID || '');
      if (!gcpProject || gcpProject.trim() === '') {
        throw new ConfigurationError('CONFIGURATION_ERROR: GOOGLE_CLOUD_PROJECT_ID is required in production modes.', 'MISSING_GCP_PROJECT_ID');
    }
      if (!config.FIRESTORE_DATABASE_ID || config.FIRESTORE_DATABASE_ID.trim() === '') {
        throw new ConfigurationError('CONFIGURATION_ERROR: FIRESTORE_DATABASE_ID is required in PRODUCTION mode.', 'MISSING_FIRESTORE_DATABASE_ID');
      }
    }
  }
}

export function isReleaseLocked(): boolean {
  return config.PRODUCT_RELEASE_LOCKED === true;
}

export function isProductionRuntime(): boolean {
  return config.APP_RUNTIME_MODE === 'PRODUCTION' || config.NODE_ENV === 'production' || config.APP_ENV === 'production';
}

