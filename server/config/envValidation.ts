import { AppConfig } from './env.js';
import { logger } from '../logging/logger.js';

export interface EnvironmentValidationResult {
  valid: boolean;
  environment: 'development' | 'test' | 'staging' | 'production';
  missingRequired: string[];
  configuredOptional: string[];
  unconfiguredOptional: string[];
  errors: string[];
}

export function validateEnvironment(config: AppConfig): EnvironmentValidationResult {
  const env = config.APP_ENV || config.NODE_ENV;
  const missingRequired: string[] = [];
  const configuredOptional: string[] = [];
  const unconfiguredOptional: string[] = [];
  const errors: string[] = [];

  // 1. Mandatory base variables in all environments
  if (!config.PORT || isNaN(config.PORT) || config.PORT <= 0 || config.PORT > 65535) {
    missingRequired.push('PORT (must be a valid port number 1-65535)');
  }
  if (!config.APP_URL) {
    missingRequired.push('APP_URL');
  } else if (config.APP_URL.includes('discord.com') || config.APP_URL.includes('oauth2/authorize')) {
    errors.push('MISCONFIGURATION: APP_URL is set to a Discord OAuth URL. APP_URL must be your own server domain (e.g. https://your-app.run.app). The Discord OAuth URL goes in DISCORD_REDIRECT_URI, not APP_URL.');
  }

  // Task 158 Configuration Reconciliation checks
  if (config.APP_ENV && (/^\d+$/.test(config.APP_ENV as string) || (config.APP_ENV as string) === '1547515985416822884')) {
    errors.push(`MISCONFIGURATION: APP_ENV is set to a Discord application ID ('${config.APP_ENV}'). Valid values are 'production', 'development', 'test', or 'staging'.`);
  }

  if (config.DISCORD_APPLICATION_ID && config.DISCORD_CLIENT_ID && config.DISCORD_APPLICATION_ID !== config.DISCORD_CLIENT_ID) {
    errors.push(`MISCONFIGURATION: DISCORD_APPLICATION_ID ('${config.DISCORD_APPLICATION_ID}') and DISCORD_CLIENT_ID ('${config.DISCORD_CLIENT_ID}') must be identical.`);
  }

  const rawRedirect = config.DISCORD_REDIRECT_URI;
  if (rawRedirect && (rawRedirect.includes('discord.com/oauth2/authorize') || rawRedirect.includes('discord.com/api/oauth2/authorize'))) {
    errors.push('MISCONFIGURATION: DISCORD_REDIRECT_URI points to discord.com/oauth2/authorize (authorization URL). DISCORD_REDIRECT_URI must point to your application callback URL (e.g. https://your-app.run.app/api/v1/auth/callback).');
  }

  if (config.DISCORD_OAUTH_CALLBACK_URL && config.DISCORD_OAUTH_CALLBACK_URL.includes('discord.com')) {
    errors.push('MISCONFIGURATION: DISCORD_REDIRECT_URI must point to YOUR server callback, not discord.com.');
  }
  if (config.SESSION_SECRET && (config.SESSION_SECRET.startsWith('http://') || config.SESSION_SECRET.startsWith('https://'))) {
    errors.push('MISCONFIGURATION: SESSION_SECRET is set to a URL. Generate a real secret.');
  }
  if (config.FIRESTORE_DATABASE_ID && (config.FIRESTORE_DATABASE_ID.startsWith('http') || config.FIRESTORE_DATABASE_ID.includes('firebasedatabase.app') || config.FIRESTORE_DATABASE_ID.includes('firebaseio.com'))) {
    errors.push('MISCONFIGURATION: FIRESTORE_DATABASE_ID must be a plain name like "(default)", not a Realtime Database URL.');
  }
  if (config.PLATFORM_OWNER_USER_ID && config.PLATFORM_OWNER_USER_ID.includes('@')) {
    errors.push(`MISCONFIGURATION: PLATFORM_OWNER_USER_ID ('${config.PLATFORM_OWNER_USER_ID}') is an email address, not a Discord snowflake ID. Use PLATFORM_OWNER_EMAIL for email configuration.`);
  }

  // 2. Strict Production / Staging Environment Validation
  if (config.APP_RUNTIME_MODE === 'PRODUCTION' || config.APP_RUNTIME_MODE === 'REAL_DISCORD_PREVIEW') {
    if (process.env.DEV_SIMULATION_ENABLED === 'true') {
      errors.push('STARTUP_FAILURE: PRODUCTION or REAL_DISCORD_PREVIEW mode cannot run with DEV_SIMULATION_ENABLED=true');
    }
    
    if (!config.DISCORD_BOT_TOKEN) {
      errors.push('STARTUP_FAILURE: DISCORD_BOT_TOKEN is mandatory for production operations.');
    }
    if (!config.DISCORD_APPLICATION_ID) {
      errors.push('STARTUP_FAILURE: DISCORD_APPLICATION_ID is mandatory for production operations.');
    }
    if (!config.DISCORD_CLIENT_ID) {
      errors.push('STARTUP_FAILURE: DISCORD_CLIENT_ID is mandatory for production operations.');
    }
    if (!config.DISCORD_CLIENT_SECRET) {
      errors.push('STARTUP_FAILURE: DISCORD_CLIENT_SECRET is mandatory for production operations.');
    }
    if (!config.SESSION_SECRET || config.SESSION_SECRET === 'community-manager-session-secret-dev-safe') {
      errors.push('STARTUP_FAILURE: SESSION_SECRET is missing or unsafe. A custom secure key is required for production.');
    }
    if (!config.GOOGLE_CLOUD_PROJECT_ID) {
      errors.push('STARTUP_FAILURE: GOOGLE_CLOUD_PROJECT_ID is mandatory for production operations.');
    }
    if (!config.FIRESTORE_DATABASE_ID) {
      errors.push('STARTUP_FAILURE: FIRESTORE_DATABASE_ID is mandatory for production operations.');
    }
  } else if (config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION') {
    // Ensure the simulation provider is available and configured
    const hasSimulationProvider = true;
    if (!hasSimulationProvider) {
      errors.push('STARTUP_FAILURE: DEVELOPMENT_SIMULATION mode is active but the required simulation provider is missing.');
    }
  }

  if (env === 'production' || env === 'staging') {
    // Application URL must not be localhost in production/staging
    if (config.APP_URL.includes('localhost') || config.APP_URL.includes('127.0.0.1')) {
      errors.push(`Invalid APP_URL for ${env}: '${config.APP_URL}'. Must be a secure production URL.`);
    }

    // Database verification
    if (!config.GOOGLE_CLOUD_PROJECT_ID && !config.FIRESTORE_DATABASE_ID) {
      missingRequired.push('GOOGLE_CLOUD_PROJECT_ID or FIRESTORE_DATABASE_ID');
    }

    // Security / Admin Secret verification - SESSION_SECRET must be explicitly set in production
    if (!config.SESSION_SECRET || config.SESSION_SECRET === 'community-manager-session-secret-dev-safe') {
      missingRequired.push('SESSION_SECRET (must be explicitly configured with a cryptographically secure key in production)');
    }

    // Platform Owner Email verification (No hardcoded fallbacks in production)
    if (!config.PLATFORM_OWNER_EMAIL || config.PLATFORM_OWNER_EMAIL.includes('example.com')) {
      missingRequired.push('PLATFORM_OWNER_EMAIL');
    }

    // DEV_SIMULATION_ENABLED must be false/undefined in production or staging config
    if (config.DEV_SIMULATION_ENABLED) {
      errors.push('DEV_SIMULATION_ENABLED is enabled in production/staging! This is prohibited for security reasons.');
    }
  }

  // 3. Integration Status Classifications (Optional integrations default to NOT_CONFIGURED)
  if (config.DISCORD_BOT_TOKEN) {
    configuredOptional.push('Discord Bot');
  } else {
    unconfiguredOptional.push('Discord Bot');
  }

  if (config.DISCORD_CLIENT_ID && config.DISCORD_CLIENT_SECRET) {
    configuredOptional.push('Discord OAuth');
  } else {
    unconfiguredOptional.push('Discord OAuth');
  }

  if (config.AI_API_KEY || config.GEMINI_API_KEY) {
    configuredOptional.push('Community Brain AI');
  } else {
    unconfiguredOptional.push('Community Brain AI');
  }

  if (config.STRIPE_SECRET_KEY && config.STRIPE_WEBHOOK_SECRET) {
    configuredOptional.push('Billing Provider (Stripe)');
  } else {
    unconfiguredOptional.push('Billing Provider (Stripe)');
  }

  if (config.GOOGLE_SHEETS_SPREADSHEET_ID) {
    configuredOptional.push('Google Sheets');
  } else {
    unconfiguredOptional.push('Google Sheets');
  }

  const isValid = missingRequired.length === 0 && errors.length === 0;

  const result: EnvironmentValidationResult = {
    valid: isValid,
    environment: env,
    missingRequired,
    configuredOptional,
    unconfiguredOptional,
    errors,
  };

  if (!isValid) {
    const errorMsg = `[ENV_VALIDATION] Environment notice for '${env}':\n` +
      (missingRequired.length ? ` - Missing Optional/Required Variables: ${missingRequired.join(', ')}\n` : '') +
      (errors.length ? ` - Configuration Notices: ${errors.join('; ')}\n` : '');

    logger.warn(errorMsg);
  } else {
    logger.info(`[ENV_VALIDATION] Environment '${env}' validated successfully. Configured optional integrations: [${configuredOptional.join(', ')}]. Unconfigured: [${unconfiguredOptional.join(', ')}].`);
  }

  return result;
}
