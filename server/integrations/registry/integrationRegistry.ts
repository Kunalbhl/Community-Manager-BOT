import {
  IntegrationKey,
  IntegrationRegistryEntry,
  NormalizedConnectionState,
} from '../../../shared/types/integrations.js';

export const CANONICAL_INTEGRATION_REGISTRY: Record<IntegrationKey, Omit<IntegrationRegistryEntry, 'status'>> = {
  DISCORD: {
    integrationKey: 'DISCORD',
    displayName: 'Discord Gateway',
    provider: 'Discord',
    category: 'COMMUNICATION',
    description:
      'Real-time bidirectional community gateway, member verification, roles, slash commands, moderation, and event reminders.',
    capabilities: [
      'GATEWAY_EVENTS',
      'SLASH_COMMANDS',
      'ROLE_MANAGEMENT',
      'DM_DISPATCH',
      'CHANNEL_ALERTS',
      'MEMBER_SYNC',
      'SMOKE_TEST',
    ],
    requiredScopes: ['bot', 'applications.commands', 'guilds', 'guilds.members.read'],
    connectionModel: 'COMMUNITY_SCOPED',
    healthStrategy: 'GATEWAY_AND_GUILD_CACHE',
    documentationUrl: 'https://discord.com/developers/docs/intro',
  },
  GOOGLE_SHEETS: {
    integrationKey: 'GOOGLE_SHEETS',
    displayName: 'Google Sheets',
    provider: 'Google Workspace',
    category: 'PRODUCTIVITY',
    description:
      'Durable recruitment export, candidate sync, recruiter statistics, and community configuration backup across 13 BOT_TEMPLATE sheets.',
    capabilities: [
      'APPLICATION_EXPORT',
      'RECRUITER_STATISTICS_SYNC',
      'AUDIT_LOG_EXPORT',
      'TEMPLATE_SHEET_MAPPING',
      'DURABLE_SYNC',
    ],
    requiredScopes: ['https://www.googleapis.com/auth/spreadsheets'],
    connectionModel: 'COMMUNITY_SCOPED',
    healthStrategy: 'SPREADSHEET_SCHEMA_AND_PERMISSION',
    documentationUrl: 'https://developers.google.com/sheets/api',
  },
  GOOGLE_FORMS: {
    integrationKey: 'GOOGLE_FORMS',
    displayName: 'Google Forms',
    provider: 'Google Workspace',
    category: 'RECRUITMENT',
    description:
      'Inbound application ingestion, form response parsing, applicant profile creation, and automated screening triggers.',
    capabilities: [
      'RESPONSE_INGESTION',
      'APPLICATION_CREATION',
      'FIELD_MAPPING',
      'TRIGGER_WORKFLOW',
    ],
    requiredScopes: ['https://www.googleapis.com/auth/forms.responses.readonly'],
    connectionModel: 'COMMUNITY_SCOPED',
    healthStrategy: 'FORM_SCHEMA_AND_CHECKPOINT',
    documentationUrl: 'https://developers.google.com/forms/api',
  },
  GOOGLE_CALENDAR: {
    integrationKey: 'GOOGLE_CALENDAR',
    displayName: 'Google Calendar',
    provider: 'Google Workspace',
    category: 'PRODUCTIVITY',
    description:
      'User-scoped interview scheduling, calendar event dispatch, reschedule workflows, candidate meeting reminders, and reauth resilience.',
    capabilities: [
      'INTERVIEW_SCHEDULING',
      'CALENDAR_SELECTION',
      'RESCHEDULE_EVENT',
      'CANCEL_EVENT',
      'USER_SCOPED_AUTH',
    ],
    requiredScopes: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
    connectionModel: 'USER_SCOPED',
    healthStrategy: 'USER_OAUTH_TOKEN_AND_PRIMARY_CALENDAR',
    documentationUrl: 'https://developers.google.com/calendar/api',
  },
};

export class IntegrationRegistry {
  static getAllKeys(): IntegrationKey[] {
    return Object.keys(CANONICAL_INTEGRATION_REGISTRY) as IntegrationKey[];
  }

  static get(key: IntegrationKey): Omit<IntegrationRegistryEntry, 'status'> & { tierRequired: string } {
    const entry = CANONICAL_INTEGRATION_REGISTRY[key];
    if (!entry) {
      throw new Error(`Unknown integration key: ${key}`);
    }
    const tierRequired = key === 'DISCORD' ? 'FREE' : 'PRO';
    return {
      ...entry,
      tierRequired,
    };
  }

  static listCanonical(): Array<Omit<IntegrationRegistryEntry, 'status'> & { tierRequired: string }> {
    return this.getAllKeys().map((key) => this.get(key));
  }

  static getEntitlementFeatureKey(key: IntegrationKey): string | null {
    switch (key) {
      case 'GOOGLE_SHEETS':
        return 'GOOGLE_SHEETS';
      case 'GOOGLE_FORMS':
        return 'GOOGLE_FORMS';
      case 'GOOGLE_CALENDAR':
        return 'GOOGLE_CALENDAR';
      case 'DISCORD':
      default:
        return null;
    }
  }

  static getBaseEntry(key: IntegrationKey): Omit<IntegrationRegistryEntry, 'status'> {
    const entry = CANONICAL_INTEGRATION_REGISTRY[key];
    if (!entry) {
      throw new Error(`Unknown integration key: ${key}`);
    }
    return entry;
  }

  static getEntryWithStatus(
    key: IntegrationKey,
    status: NormalizedConnectionState = 'NOT_CONFIGURED'
  ): IntegrationRegistryEntry {
    const base = this.getBaseEntry(key);
    return {
      ...base,
      status,
    };
  }

  static listAll(statusMap: Partial<Record<IntegrationKey, NormalizedConnectionState>> = {}): IntegrationRegistryEntry[] {
    return this.getAllKeys().map((key) => {
      const status = statusMap[key] || 'NOT_CONFIGURED';
      return this.getEntryWithStatus(key, status);
    });
  }
}
