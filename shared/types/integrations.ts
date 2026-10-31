/**
 * Canonical Integration Types & Contracts
 * Task 86: Integration & Connectivity Engine
 */

export type IntegrationKey =
  | 'DISCORD'
  | 'GOOGLE_SHEETS'
  | 'GOOGLE_FORMS'
  | 'GOOGLE_CALENDAR';

export type NormalizedConnectionState =
  | 'NOT_CONFIGURED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DEGRADED'
  | 'REAUTH_REQUIRED'
  | 'DISCONNECTED'
  | 'ERROR'
  | 'UNAVAILABLE';

export type IntegrationHealthState =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'REAUTH_REQUIRED'
  | 'NOT_CONFIGURED'
  | 'DISCONNECTED'
  | 'UNAVAILABLE'
  | 'ERROR';

export type IntegrationConnectionModel = 'COMMUNITY_SCOPED' | 'USER_SCOPED';

export type IntegrationCategory = 'COMMUNICATION' | 'PRODUCTIVITY' | 'RECRUITMENT';

export interface IntegrationRegistryEntry {
  integrationKey: IntegrationKey;
  displayName: string;
  provider: string;
  category: IntegrationCategory;
  description: string;
  capabilities: string[];
  requiredScopes: string[];
  connectionModel: IntegrationConnectionModel;
  status: NormalizedConnectionState;
  healthStrategy: string;
  documentationUrl?: string;
}

export interface IntegrationHealthCapability {
  name: string;
  available: boolean;
  reason?: string;
}

export interface IntegrationHealthDetail {
  integrationKey: IntegrationKey;
  displayName: string;
  connectionModel: IntegrationConnectionModel;
  status: NormalizedConnectionState;
  healthState: IntegrationHealthState;
  lastChecked: string;
  lastSuccessfulOperation?: string;
  lastFailure?: string;
  configurationCompleteness: number; // 0 - 100 percentage
  requiredAction?: string;
  capabilitiesStatus: IntegrationHealthCapability[];
  diagnostics: Record<string, unknown>;
}

export interface OverallIntegrationHealthReport {
  communityId: string;
  timestamp: string;
  overallHealth: IntegrationHealthState;
  integrations: Record<IntegrationKey, IntegrationHealthDetail>;
}

export type IntegrationSyncStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED';

export type IntegrationSyncDirection = 'INBOUND' | 'OUTBOUND';

export interface IntegrationSyncRecord {
  id: string;
  communityId: string;
  integration: IntegrationKey;
  resource: string;
  direction: IntegrationSyncDirection;
  status: IntegrationSyncStatus;
  startedAt: string;
  completedAt?: string;
  recordsProcessed: number;
  recordsSucceeded: number;
  recordsFailed: number;
  errorSummary?: string;
  cursor?: string;
  checkpoint?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SecureIntegrationCredential {
  id: string;
  communityId: string;
  integrationKey: IntegrationKey;
  userId?: string; // For USER_SCOPED integrations like Google Calendar
  encryptedAccessToken?: string;
  encryptedRefreshToken?: string;
  tokenExpiresAt?: string;
  scopes: string[];
  lastRefreshedAt?: string;
  lastRefreshError?: string;
  status: NormalizedConnectionState;
  createdAt: string;
  updatedAt: string;
}

export type IntegrationErrorCode =
  | 'INTEGRATION_NOT_FOUND'
  | 'INTEGRATION_NOT_CONFIGURED'
  | 'INTEGRATION_UNAVAILABLE'
  | 'INTEGRATION_PERMISSION_REQUIRED'
  | 'INTEGRATION_REAUTH_REQUIRED'
  | 'INTEGRATION_CONNECTION_FAILED'
  | 'INTEGRATION_SYNC_FAILED'
  | 'INTEGRATION_SYNC_PARTIAL'
  | 'INTEGRATION_RESOURCE_NOT_FOUND'
  | 'RATE_LIMITED';

export interface RedactedCredentialView {
  id: string;
  communityId: string;
  integrationKey: IntegrationKey;
  userId?: string;
  scopes: string[];
  status: NormalizedConnectionState;
  tokenExpiresAt?: string;
  lastRefreshedAt?: string;
  isExpired: boolean;
  hasRefreshToken: boolean;
  createdAt: string;
  updatedAt: string;
}

