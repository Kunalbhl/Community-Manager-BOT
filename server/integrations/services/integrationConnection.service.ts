import {
  IntegrationKey,
  NormalizedConnectionState,
  IntegrationHealthDetail,
  RedactedCredentialView,
  IntegrationSyncRecord,
} from '../../../shared/types/integrations.js';
import { IntegrationRegistry } from '../registry/integrationRegistry.js';
import { IntegrationCredentialService } from './integrationCredential.service.js';
import { IntegrationHealthService } from './integrationHealth.service.js';
import { IntegrationSyncService } from './integrationSync.service.js';
import { EntitlementService } from '../../services/entitlement.service.js';
import {
  BadRequestError,
  ForbiddenError,
  IntegrationConfigurationError,
} from '../errors/integration.errors.js';
import { logger } from '../../logging/logger.js';
import { UserRole } from '../../../shared/types/rbac.js';
import {
  googleSheetsConfigsRepository,
  googleFormsConfigsRepository,
  userCalendarConfigsRepository,
  communitiesRepository,
} from '../../repositories/index.js';
import { discordService } from '../discord/discord.service.js';
import { googleSheetsService } from '../google/sheets.service.js';

export interface IntegrationDetailView {
  integrationKey: IntegrationKey;
  displayName: string;
  category: string;
  connectionModel: 'COMMUNITY_SCOPED' | 'USER_SCOPED';
  authType: string;
  documentationUrl: string;
  requiredScopes: string[];
  capabilities: string[];
  status: NormalizedConnectionState;
  health: IntegrationHealthDetail;
  credential?: RedactedCredentialView | null;
  latestSync?: IntegrationSyncRecord | null;
  entitlement: {
    enabled: boolean;
    tierRequired: string;
  };
}

export class IntegrationConnectionService {
  /**
   * Connects or updates configuration for an integration.
   * Enforces feature gating and RBAC permissions.
   */
  static async connect(params: {
    communityId: string;
    integrationKey: IntegrationKey;
    userId?: string;
    actorUserId: string;
    actorRole: UserRole;
    accessToken?: string;
    refreshToken?: string;
    expiresInSeconds?: number;
    scopes?: string[];
    configPayload?: Record<string, any>;
  }): Promise<IntegrationDetailView> {
    const { communityId, integrationKey, userId, actorUserId, actorRole, configPayload } = params;

    // RBAC Check
    if (integrationKey === 'GOOGLE_CALENDAR' && userId) {
      // User can connect their own calendar if they are the user or an admin
      if (
        actorUserId !== userId &&
        actorRole !== 'OWNER' &&
        actorRole !== 'CONTROLLER' &&
        actorRole !== 'PLATFORM_OWNER'
      ) {
        throw new ForbiddenError('You can only connect your own Google Calendar.');
      }
    } else {
      // Community-scoped integrations require OWNER, CONTROLLER, or PLATFORM_OWNER
      if (
        actorRole !== 'OWNER' &&
        actorRole !== 'CONTROLLER' &&
        actorRole !== 'PLATFORM_OWNER'
      ) {
        throw new ForbiddenError('Only server administrators can manage community integrations.');
      }
    }

    // Entitlement Check
    const entitlementFeatureKey = IntegrationRegistry.getEntitlementFeatureKey(integrationKey);
    if (entitlementFeatureKey) {
      const allowed = await EntitlementService.hasFeature(communityId, entitlementFeatureKey);
      if (!allowed) {
        throw new ForbiddenError(
          `Integration '${integrationKey}' is not enabled for your community tier. Please upgrade your plan.`
        );
      }
    }

    // Secure Token Storage if provided
    if (params.accessToken) {
      await IntegrationCredentialService.storeToken({
        communityId,
        integrationKey,
        userId,
        accessToken: params.accessToken,
        refreshToken: params.refreshToken,
        expiresInSeconds: params.expiresInSeconds,
        scopes: params.scopes,
        actorUserId,
        actorRole,
      });
    }

    // Provider-specific config repository record updates
    switch (integrationKey) {
      case 'DISCORD': {
        if (configPayload?.guildId) {
          await communitiesRepository.update(communityId, {
            discordGuildId: configPayload.guildId,
          });
        }
        break;
      }

      case 'GOOGLE_SHEETS': {
        if (!configPayload?.spreadsheetId) {
          throw new BadRequestError('Spreadsheet ID is required to connect Google Sheets.');
        }
        const existing = await googleSheetsConfigsRepository.listForTenant(communityId);
        if (existing.length > 0) {
          await googleSheetsConfigsRepository.update(existing[0].id, {
            spreadsheetId: configPayload.spreadsheetId,
            configured: true,
            enabled: true,
            lastSyncStatus: 'CONNECTED',
          });
        } else {
          await googleSheetsConfigsRepository.create({
            communityId,
            spreadsheetId: configPayload.spreadsheetId,
            configured: true,
            enabled: true,
            autoSyncEnabled: true,
            columnMappings: {
              discordUserIdCol: 'A',
              applicationIdCol: 'B',
              recruiterCodeCol: 'C',
              recruiterUserIdCol: 'D',
              statusCol: 'E',
              createdAtCol: 'F',
            },
            lastSyncStatus: 'CONNECTED',
          });
        }
        break;
      }

      case 'GOOGLE_FORMS': {
        if (!configPayload?.formId) {
          throw new BadRequestError('Google Form ID is required to connect Google Forms.');
        }
        const existing = await googleFormsConfigsRepository.listForTenant(communityId);
        if (existing.length > 0) {
          await googleFormsConfigsRepository.update(existing[0].id, {
            formId: configPayload.formId,
            formTitleSnapshot: configPayload.formTitleSnapshot || 'Recruiter Application Form',
            enabled: true,
            lastSyncStatus: 'CONNECTED',
            updatedAt: new Date().toISOString(),
          });
        } else {
          await googleFormsConfigsRepository.create({
            communityId,
            formId: configPayload.formId,
            formTitleSnapshot: configPayload.formTitleSnapshot || 'Recruiter Application Form',
            enabled: true,
            lastSyncStatus: 'CONNECTED',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        break;
      }

      case 'GOOGLE_CALENDAR': {
        if (userId) {
          const targetUserConfigs = await userCalendarConfigsRepository.listForTenant(userId);
          const existingUserConfig = targetUserConfigs[0] || (await userCalendarConfigsRepository.getById(userId));
          const nowIso = new Date().toISOString();

          if (existingUserConfig) {
            await userCalendarConfigsRepository.update(existingUserConfig.id, {
              status: 'CONNECTED',
              preference: 'CONNECTED',
              calendarId: configPayload?.calendarId || 'primary',
              timezone: configPayload?.timezone || 'UTC',
              lastSyncAt: nowIso,
              updatedAt: nowIso,
            });
          } else {
            await userCalendarConfigsRepository.create({
              id: `cal_usr_${userId}`,
              userId,
              communityId,
              status: 'CONNECTED',
              preference: 'CONNECTED',
              calendarId: configPayload?.calendarId || 'primary',
              timezone: configPayload?.timezone || 'UTC',
              lastSyncAt: nowIso,
              createdAt: nowIso,
              updatedAt: nowIso,
            });
          }
        }
        break;
      }
    }

    // Trigger Health Check
    await IntegrationHealthService.checkIntegrationHealth(integrationKey, communityId, userId);

    return this.getIntegrationDetail(communityId, integrationKey, userId);
  }

  /**
   * Disconnects an integration and revokes credentials.
   */
  static async disconnect(params: {
    communityId: string;
    integrationKey: IntegrationKey;
    userId?: string;
    actorUserId: string;
    actorRole: UserRole;
  }): Promise<IntegrationDetailView> {
    const { communityId, integrationKey, userId, actorUserId, actorRole } = params;

    // RBAC Check
    if (integrationKey === 'GOOGLE_CALENDAR' && userId) {
      if (
        actorUserId !== userId &&
        actorRole !== 'OWNER' &&
        actorRole !== 'CONTROLLER' &&
        actorRole !== 'PLATFORM_OWNER'
      ) {
        throw new ForbiddenError('You can only disconnect your own Google Calendar.');
      }
    } else {
      if (
        actorRole !== 'OWNER' &&
        actorRole !== 'CONTROLLER' &&
        actorRole !== 'PLATFORM_OWNER'
      ) {
        throw new ForbiddenError('Only server administrators can disconnect community integrations.');
      }
    }

    // Provider-specific safe disable/disconnect
    switch (integrationKey) {
      case 'DISCORD': {
        // Disconnecting Discord does not destroy the bot, just unlinks the guild
        await communitiesRepository.update(communityId, {
          discordGuildId: '',
        });
        break;
      }

      case 'GOOGLE_SHEETS': {
        const existing = await googleSheetsConfigsRepository.listForTenant(communityId);
        if (existing.length > 0) {
          await googleSheetsConfigsRepository.update(existing[0].id, {
            configured: false,
            enabled: false,
            lastSyncStatus: 'DISCONNECTED',
          });
        }
        break;
      }

      case 'GOOGLE_FORMS': {
        const existing = await googleFormsConfigsRepository.listForTenant(communityId);
        if (existing.length > 0) {
          await googleFormsConfigsRepository.update(existing[0].id, {
            enabled: false,
            lastSyncStatus: 'DISCONNECTED',
          });
        }
        break;
      }

      case 'GOOGLE_CALENDAR': {
        if (userId) {
          const userConfigs = await userCalendarConfigsRepository.listForTenant(userId);
          const userConfig = userConfigs[0] || (await userCalendarConfigsRepository.getById(userId));
          if (userConfig) {
            await userCalendarConfigsRepository.update(userConfig.id, {
              status: 'DISCONNECTED',
              preference: 'SKIPPED',
              updatedAt: new Date().toISOString(),
            });
          }
        }
        break;
      }
    }

    // Revoke and clear stored credentials
    await IntegrationCredentialService.revokeToken(
      communityId,
      integrationKey,
      userId,
      actorUserId,
      actorRole
    );

    // Re-verify health state post-disconnection
    await IntegrationHealthService.checkIntegrationHealth(integrationKey, communityId, userId);

    return this.getIntegrationDetail(communityId, integrationKey, userId);
  }

  /**
   * Tests connection for an integration immediately.
   */
  static async testConnection(
    communityId: string,
    integrationKey: IntegrationKey,
    actorUserId: string,
    actorRole: UserRole,
    userId?: string
  ): Promise<IntegrationHealthDetail> {
    // RBAC
    if (integrationKey === 'GOOGLE_CALENDAR' && userId) {
      if (
        actorUserId !== userId &&
        actorRole !== 'OWNER' &&
        actorRole !== 'CONTROLLER' &&
        actorRole !== 'PLATFORM_OWNER'
      ) {
        throw new ForbiddenError('You can only test your own Google Calendar connection.');
      }
    }

    return IntegrationHealthService.checkIntegrationHealth(integrationKey, communityId, userId);
  }

  /**
   * Retrieves full details for a single canonical integration.
   */
  static async getIntegrationDetail(
    communityId: string,
    integrationKey: IntegrationKey,
    userId?: string
  ): Promise<IntegrationDetailView> {
    const meta = IntegrationRegistry.get(integrationKey);
    if (!meta) {
      throw new BadRequestError(`Unknown integration: ${integrationKey}`);
    }

    const [health, credential, latestSync] = await Promise.all([
      IntegrationHealthService.checkIntegrationHealth(integrationKey, communityId, userId),
      IntegrationCredentialService.getRedactedCredential(communityId, integrationKey, userId),
      IntegrationSyncService.getLatestSync(communityId, integrationKey),
    ]);

    const entitlementKey = IntegrationRegistry.getEntitlementFeatureKey(integrationKey);
    const enabled = entitlementKey
      ? await EntitlementService.hasFeature(communityId, entitlementKey)
      : true;

    return {
      integrationKey: meta.integrationKey,
      displayName: meta.displayName,
      category: meta.category,
      connectionModel: meta.connectionModel,
      authType: meta.connectionModel === 'USER_SCOPED' ? 'USER_OAUTH' : 'SERVER_OAUTH_BOT',
      documentationUrl: meta.documentationUrl,
      requiredScopes: meta.requiredScopes,
      capabilities: meta.capabilities,
      status: health.status,
      health,
      credential,
      latestSync,
      entitlement: {
        enabled,
        tierRequired: meta.tierRequired,
      },
    };
  }

  /**
   * Lists all canonical integrations with full detailed status.
   */
  static async listAll(communityId: string, userId?: string): Promise<IntegrationDetailView[]> {
    const all = IntegrationRegistry.listCanonical();
    return Promise.all(
      all.map((item) => this.getIntegrationDetail(communityId, item.integrationKey, userId))
    );
  }
}
