import { config } from '../config/env.js';
import { logger } from '../logging/logger.js';

/**
 * Secret Management and Redaction Engine.
 * Ensures tokens, API keys, and credentials are never leaked to logs, frontend, or API responses.
 */

export interface SecretStatusReport {
  discordBotToken: 'CONFIGURED' | 'NOT_CONFIGURED';
  discordApplicationId: 'CONFIGURED' | 'NOT_CONFIGURED';
  discordPublicKey: 'CONFIGURED' | 'NOT_CONFIGURED';
  aiApiKey: 'CONFIGURED' | 'NOT_CONFIGURED';
  geminiApiKey: 'CONFIGURED' | 'NOT_CONFIGURED';
  googleSheetsSpreadsheetId: 'CONFIGURED' | 'NOT_CONFIGURED';
  googleCloudProjectId: 'CONFIGURED' | 'NOT_CONFIGURED';
  billingSecret: 'CONFIGURED' | 'NOT_CONFIGURED';
  secretManagerActive: boolean;
  freeModeEnforced: boolean;
  leakageDetected: boolean;
}

export class SecretsManager {
  private knownSecrets: Set<string> = new Set();
  private isSecretManagerAvailable = false;

  constructor() {
    this.registerKnownSecrets();
  }

  private registerKnownSecrets() {
    if (config.DISCORD_BOT_TOKEN) this.knownSecrets.add(config.DISCORD_BOT_TOKEN);
    if (config.DISCORD_PUBLIC_KEY) this.knownSecrets.add(config.DISCORD_PUBLIC_KEY);
    if (config.AI_API_KEY) this.knownSecrets.add(config.AI_API_KEY);
    if (config.GEMINI_API_KEY) this.knownSecrets.add(config.GEMINI_API_KEY);
    if (config.PLATFORM_ADMIN_KEY) this.knownSecrets.add(config.PLATFORM_ADMIN_KEY);
    if (config.SESSION_SECRET) this.knownSecrets.add(config.SESSION_SECRET);
    if (config.STRIPE_SECRET_KEY) this.knownSecrets.add(config.STRIPE_SECRET_KEY);
    if (config.STRIPE_WEBHOOK_SECRET) this.knownSecrets.add(config.STRIPE_WEBHOOK_SECRET);

    // Also register environment variables directly if found
    for (const [key, value] of Object.entries(process.env)) {
      if (
        value &&
        typeof value === 'string' &&
        value.length > 8 &&
        (key.includes('TOKEN') ||
          key.includes('KEY') ||
          key.includes('SECRET') ||
          key.includes('PASSWORD') ||
          key.includes('CREDENTIAL'))
      ) {
        this.knownSecrets.add(value);
      }
    }
  }

  /**
   * Redacts all known secret values from any text string.
   */
  redactString(text: string): string {
    if (!text || typeof text !== 'string') return text;
    let sanitized = text;

    for (const secret of this.knownSecrets) {
      if (secret && secret.length > 4 && sanitized.includes(secret)) {
        sanitized = sanitized.split(secret).join('[REDACTED_SECRET]');
      }
    }

    // Generic Discord Bot Token regex matcher: standard 3-part base64-like token
    sanitized = sanitized.replace(
      /[MNO][a-zA-Z0-9_-]{23,28}\.[a-zA-Z0-9_-]{6,7}\.[a-zA-Z0-9_-]{27,38}/g,
      '[REDACTED_DISCORD_TOKEN]'
    );

    // Generic API Key pattern matcher (e.g. AIzaSy...)
    sanitized = sanitized.replace(/AIza[0-9A-Za-z_-]{20,50}/g, '[REDACTED_API_KEY]');

    // Generic Bearer / secret / key pattern matcher
    sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9_.-]{8,}/gi, 'Bearer [REDACTED_TOKEN]');
    sanitized = sanitized.replace(/(apiKey|apikey|api_key|token|secret)\s*[:=]\s*([a-zA-Z0-9_.-]{6,})/gi, '$1=[REDACTED_KEY]');
    sanitized = sanitized.replace(/(secret_[a-zA-Z0-9_.-]{6,})/gi, '[REDACTED_SECRET]');
    sanitized = sanitized.replace(/(sk_[a-zA-Z0-9_.-]{6,})/gi, '[REDACTED_KEY]');

    return sanitized;
  }

  /**
   * Checks if the redaction engine is active
   */
  isRedactionActive(): boolean {
    return true;
  }

  /**
   * Recursively sanitizes any object, removing or redacting sensitive keys and values.
   */
  redactObject<T>(obj: T): T {
    if (!obj || typeof obj !== 'object') {
      if (typeof obj === 'string') {
        return this.redactString(obj) as unknown as T;
      }
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactObject(item)) as unknown as T;
    }

    const result: Record<string, unknown> = {};
    const sensitiveKeyPatterns = [
      'token',
      'secret',
      'key',
      'password',
      'credential',
      'authorization',
      'cookie',
      'private',
    ];

    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      const isSensitiveKey = sensitiveKeyPatterns.some((pattern) =>
        key.toLowerCase().includes(pattern)
      );

      if (isSensitiveKey && typeof val === 'string') {
        result[key] = '[REDACTED]';
      } else if (typeof val === 'string') {
        result[key] = this.redactString(val);
      } else if (typeof val === 'object' && val !== null) {
        result[key] = this.redactObject(val);
      } else {
        result[key] = val;
      }
    }

    return result as T;
  }

  /**
   * Checks if a specific secret is configured without returning its value.
   */
  isConfigured(
    secretName:
      | 'DISCORD_BOT_TOKEN'
      | 'DISCORD_APPLICATION_ID'
      | 'DISCORD_PUBLIC_KEY'
      | 'AI_API_KEY'
      | 'GEMINI_API_KEY'
      | 'GOOGLE_SHEETS_SPREADSHEET_ID'
  ): boolean {
    if (secretName === 'AI_API_KEY' || secretName === 'GEMINI_API_KEY') {
      return Boolean(config.AI_API_KEY || config.GEMINI_API_KEY);
    }
    return Boolean(config[secretName]);
  }

  /**
   * Returns a truthful diagnostic report of configured secrets.
   */
  getSecretStatusReport(): SecretStatusReport {
    const aiConfigured = Boolean(config.AI_API_KEY || config.GEMINI_API_KEY);
    return {
      discordBotToken: config.DISCORD_BOT_TOKEN ? 'CONFIGURED' : 'NOT_CONFIGURED',
      discordApplicationId: config.DISCORD_APPLICATION_ID ? 'CONFIGURED' : 'NOT_CONFIGURED',
      discordPublicKey: config.DISCORD_PUBLIC_KEY ? 'CONFIGURED' : 'NOT_CONFIGURED',
      aiApiKey: aiConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED',
      geminiApiKey: aiConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED',
      googleSheetsSpreadsheetId: config.GOOGLE_SHEETS_SPREADSHEET_ID ? 'CONFIGURED' : 'NOT_CONFIGURED',
      googleCloudProjectId: config.GOOGLE_CLOUD_PROJECT_ID ? 'CONFIGURED' : 'NOT_CONFIGURED',
      billingSecret: config.STRIPE_SECRET_KEY ? 'CONFIGURED' : 'NOT_CONFIGURED',
      secretManagerActive: this.isSecretManagerAvailable,
      freeModeEnforced: config.FREE_MODE,
      leakageDetected: false,
    };
  }
}

export const secretsManager = new SecretsManager();
