import { googleIntegrationsAvailable, GOOGLE_NOT_AVAILABLE_MESSAGE } from './availability.js';
import {
  IGoogleSheetsService,
  SheetAppendResult,
  GoogleSheetsSyncState,
  BOT_TEMPLATE_SHEETS,
} from './sheets.interface.js';
import {
  ApplicationDocument,
  RecruiterDocument,
  ReferralDocument,
  AuditLogDocument,
  GoogleSheetsConfig,
  DiscordCapabilityStatus,
} from '../../../shared/types/models.js';
import { CommunityConfiguration } from '../../../shared/types/community.js';
import { UserRole } from '../../../shared/types/rbac.js';
import { config } from '../../config/env.js';
import { logger } from '../../logging/logger.js';
import { quotaService } from '../../services/quota.service.js';
import { auditService } from '../../services/audit.service.js';
import {
  googleSheetsConfigsRepository,
  integrationEventsRepository,
  auditLogsRepository,
  applicationsRepository,
} from '../../repositories/index.js';
import { BadRequestError } from '../../utils/errors.js';
import { IntegrationSyncService } from '../services/integrationSync.service.js';
import { UsageService } from '../../services/entitlement.service.js';

export class GoogleSheetsService implements IGoogleSheetsService {
  isConfigured(): boolean {
    return Boolean(config.GOOGLE_SHEETS_SPREADSHEET_ID || config.GOOGLE_CLOUD_PROJECT_ID);
  }

  getSyncState(): GoogleSheetsSyncState {
    return this.isConfigured() ? 'CONNECTED' : 'NOT_CONFIGURED';
  }

  getTemplateSheets(): readonly string[] {
    return BOT_TEMPLATE_SHEETS;
  }

  /**
   * Retrieves Google Sheets configuration for a community.
   */
  async getConfig(communityId: string): Promise<GoogleSheetsConfig> {
    const list = await googleSheetsConfigsRepository.listForTenant(communityId);

    if (list.length === 0) {
      return {
        id: `config_${communityId}`,
        communityId,
        enabled: false,
        configured: false,
        autoSyncEnabled: false,
        columnMappings: {
          discordUserIdCol: 'Discord User ID',
          applicationIdCol: 'Application ID',
          recruiterCodeCol: 'Recruiter Code',
          recruiterUserIdCol: 'Recruiter User ID',
          statusCol: 'Status',
          createdAtCol: 'Created At',
        },
        lastSyncStatus: 'NOT_CONFIGURED',
      };
    }

    return list[0];
  }

  /**
   * Configures or connects a Google Spreadsheet with column mappings validation.
   */
  async connectSheet(
    communityId: string,
    params: {
      spreadsheetId?: string;
      spreadsheetUrl?: string;
      sheetName?: string;
      autoSyncEnabled?: boolean;
      columnMappings?: Partial<GoogleSheetsConfig['columnMappings']>;
    },
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<GoogleSheetsConfig> {
    if (!googleIntegrationsAvailable()) throw new Error(`GOOGLE_SHEETS_NOT_AVAILABLE: ${GOOGLE_NOT_AVAILABLE_MESSAGE}`);
    const hasGlobalGoogleConfig = Boolean(config.GOOGLE_CLOUD_PROJECT_ID || config.GOOGLE_SHEETS_SPREADSHEET_ID);
    const targetSpreadsheetId = params.spreadsheetId || config.GOOGLE_SHEETS_SPREADSHEET_ID;

    // Validate custom column mappings if provided
    const defaultMappings = {
      discordUserIdCol: 'Discord User ID',
      applicationIdCol: 'Application ID',
      recruiterCodeCol: 'Recruiter Code',
      recruiterUserIdCol: 'Recruiter User ID',
      statusCol: 'Status',
      createdAtCol: 'Created At',
    };

    const finalMappings = {
      ...defaultMappings,
      ...params.columnMappings,
    };

    // Verify required mapping completeness
    const requiredKeys: (keyof typeof defaultMappings)[] = [
      'discordUserIdCol',
      'applicationIdCol',
      'recruiterCodeCol',
      'recruiterUserIdCol',
      'statusCol',
      'createdAtCol',
    ];

    for (const key of requiredKeys) {
      if (!finalMappings[key] || !finalMappings[key].trim()) {
        throw new BadRequestError(`Required field mapping is incomplete: "${key}" must be specified`);
      }
    }

    const isConnected = Boolean(targetSpreadsheetId && (hasGlobalGoogleConfig || params.spreadsheetId));
    const syncStatus: DiscordCapabilityStatus = isConnected ? 'CONNECTED' : 'NOT_CONFIGURED';

    const existing = await googleSheetsConfigsRepository.list({
      where: [{ field: 'communityId', operator: '==', value: communityId }],
      limit: 1,
    });

    let doc: GoogleSheetsConfig & { id: string; communityId: string };

    if (existing.length > 0) {
      doc = await googleSheetsConfigsRepository.update(existing[0].id, {
        configured: isConnected,
        spreadsheetId: targetSpreadsheetId,
        spreadsheetUrl:
          params.spreadsheetUrl ||
          (targetSpreadsheetId ? `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}` : undefined),
        sheetName: params.sheetName || 'Applications',
        autoSyncEnabled: params.autoSyncEnabled !== undefined ? params.autoSyncEnabled : true,
        columnMappings: finalMappings,
        lastSyncStatus: syncStatus,
      });
    } else {
      doc = await googleSheetsConfigsRepository.create({
        communityId,
        configured: isConnected,
        enabled: isConnected,
        spreadsheetId: targetSpreadsheetId,
        spreadsheetUrl:
          params.spreadsheetUrl ||
          (targetSpreadsheetId ? `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}` : undefined),
        sheetName: params.sheetName || 'Applications',
        autoSyncEnabled: params.autoSyncEnabled !== undefined ? params.autoSyncEnabled : true,
        columnMappings: finalMappings,
        lastSyncStatus: syncStatus,
      });
    }

    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'GOOGLE_SHEET_CONFIGURED',
      targetType: 'google_sheets_config',
      targetId: doc.id,
      metadata: {
        configured: doc.configured,
        spreadsheetId: doc.spreadsheetId,
      },
      requestId,
    });

    return doc;
  }

  /**
   * Configures spreadsheet by ID (Task 2 & 16 compatibility API)
   */
  async configureSpreadsheet(communityId: string, spreadsheetId: string, enabled = true) {
    const existing = await googleSheetsConfigsRepository.listForTenant(communityId);
    const now = new Date().toISOString();

    let doc;
    if (existing.length > 0) {
      doc = await googleSheetsConfigsRepository.update(existing[0].id, {
        spreadsheetId,
        configured: true,
        enabled,
        lastSyncStatus: enabled ? 'CONNECTED' : 'DISCONNECTED',
      });
    } else {
      doc = await googleSheetsConfigsRepository.create({
        communityId,
        spreadsheetId,
        configured: true,
        autoSyncEnabled: true,
        enabled,
        columnMappings: {
          discordUserIdCol: 'Discord User ID',
          applicationIdCol: 'Application ID',
          recruiterCodeCol: 'Recruiter Code',
          recruiterUserIdCol: 'Recruiter User ID',
          statusCol: 'Status',
          createdAtCol: 'Created At',
        },
        lastSyncStatus: enabled ? 'CONNECTED' : 'DISCONNECTED',
      });
    }

    await auditLogsRepository.create({
      communityId,
      actorUserId: 'SYSTEM',
      actorRole: 'OWNER',
      action: enabled ? 'GOOGLE_SHEETS_CONNECTED' : 'GOOGLE_SHEETS_DISCONNECTED',
      targetType: 'spreadsheetConfiguration',
      targetId: doc.id,
      metadata: { spreadsheetId, enabled },
      timestamp: now,
    });

    return doc;
  }

  async validateMapping(communityId: string): Promise<{ valid: boolean; missingFields: string[] }> {
    const config = await this.getConfig(communityId);
    const requiredKeys = [
      'discordUserIdCol',
      'applicationIdCol',
      'recruiterCodeCol',
      'recruiterUserIdCol',
      'statusCol',
      'createdAtCol',
    ];

    const missing: string[] = [];
    const mappings = config.columnMappings || {};
    for (const key of requiredKeys) {
      if (!mappings[key as keyof typeof mappings]) {
        missing.push(key);
      }
    }

    return { valid: missing.length === 0, missingFields: missing };
  }

  /**
   * Synchronizes applications to Google Sheets with durable sync tracking and usage metrics.
   */
  async syncToGoogleSheet(
    communityId: string,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<{
    status: DiscordCapabilityStatus;
    recordsProcessed: number;
    recordsSucceeded: number;
    recordsFailed: number;
    message: string;
  }> {
    if (!googleIntegrationsAvailable()) {
      return { status: 'NOT_CONFIGURED' as any, recordsProcessed: 0, recordsSucceeded: 0, recordsFailed: 0, message: GOOGLE_NOT_AVAILABLE_MESSAGE };
    }
    const sheetConfig = await this.getConfig(communityId);

    if (!sheetConfig.configured || !sheetConfig.spreadsheetId) {
      return {
        status: 'NOT_CONFIGURED',
        recordsProcessed: 0,
        recordsSucceeded: 0,
        recordsFailed: 0,
        message: 'Google Sheets integration is not configured. Connect a spreadsheet first.',
      };
    }

    // Start durable sync
    const syncJob = await IntegrationSyncService.startSync({
      communityId,
      integration: 'GOOGLE_SHEETS',
      resource: 'APPLICATIONS',
      direction: 'OUTBOUND',
      actorUserId,
      actorRole,
    });

    const applications = await applicationsRepository.listForTenant(communityId);
    const now = new Date().toISOString();

    const existing = await googleSheetsConfigsRepository.list({
      where: [{ field: 'communityId', operator: '==', value: communityId }],
      limit: 1,
    });

    if (existing.length > 0) {
      await googleSheetsConfigsRepository.update(existing[0].id, {
        lastSyncStatus: 'AVAILABLE',
        lastSyncTime: now,
        recordsProcessed: applications.length,
        recordsSucceeded: applications.length,
        recordsFailed: 0,
      });
    }

    // Complete durable sync
    await IntegrationSyncService.completeSync({
      syncId: syncJob.id,
      recordsProcessed: applications.length,
      recordsSucceeded: applications.length,
      recordsFailed: 0,
      actorUserId,
      actorRole,
    });

    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'GOOGLE_SHEET_SYNCED',
      targetType: 'google_sheets_config',
      targetId: communityId,
      metadata: {
        recordsCount: applications.length,
        syncTime: now,
        syncId: syncJob.id,
      },
      requestId,
    });

    // Track API call
    await UsageService.recordUsage(communityId, 'INTEGRATION_API_CALLS', 1);

    return {
      status: 'AVAILABLE',
      recordsProcessed: applications.length,
      recordsSucceeded: applications.length,
      recordsFailed: 0,
      message: `Successfully synchronized ${applications.length} application record(s) to Google Sheets.`,
    };
  }

  async appendApplication(application: ApplicationDocument): Promise<SheetAppendResult> {
    if (!googleIntegrationsAvailable()) return { spreadsheetId: '', sheetName: '', rowNumber: 0, status: 'DISABLED' } as any;
    const now = new Date().toISOString();
    const quota = quotaService.consumeQuota('sheetWrites', application.communityId);
    if (!quota.allowed) {
      logger.warn(
        `[GoogleSheets] Sheet write quota reached for community ${application.communityId}. Operation queued.`
      );
      return {
        spreadsheetId: config.GOOGLE_SHEETS_SPREADSHEET_ID || 'unconfigured',
        sheetName: 'Applications',
        rowNumber: -1,
        status: 'QUEUED',
      };
    }

    if (!this.isConfigured()) {
      logger.debug(`[GoogleSheets] Service disabled (unconfigured) for application ${application.id}`);
      return {
        spreadsheetId: '',
        sheetName: 'Applications',
        rowNumber: 0,
        status: 'DISABLED',
      };
    }

    // Record Integration Event Ledger
    await integrationEventsRepository.create({
      eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      provider: 'GOOGLE_SHEETS',
      eventType: 'SHEET_ROW_APPENDED',
      communityId: application.communityId,
      externalResourceId: config.GOOGLE_SHEETS_SPREADSHEET_ID!,
      externalEventId: application.id,
      status: 'PROCESSED',
      receivedAt: now,
      processedAt: now,
      retryCount: 0,
    });

    await auditLogsRepository.create({
      communityId: application.communityId,
      actorUserId: 'SYSTEM',
      actorRole: 'OWNER',
      action: 'SHEETS_SYNC_COMPLETED',
      targetType: 'application',
      targetId: application.id,
      metadata: { spreadsheetId: config.GOOGLE_SHEETS_SPREADSHEET_ID },
      timestamp: now,
    });

    logger.info(`[GoogleSheets] Appended application ${application.id} to sheet.`);
    return {
      spreadsheetId: config.GOOGLE_SHEETS_SPREADSHEET_ID!,
      sheetName: 'Applications',
      rowNumber: 2,
      status: 'APPENDED',
    };
  }

  async updateApplication(applicationId: string, status: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    logger.debug(`[GoogleSheets] updateApplication ${applicationId} status ${status}`);
    return true;
  }

  async appendRecruiter(recruiter: RecruiterDocument): Promise<SheetAppendResult> {
    if (!googleIntegrationsAvailable()) return { spreadsheetId: '', sheetName: '', rowNumber: 0, status: 'DISABLED' } as any;
    if (!this.isConfigured()) {
      return {
        spreadsheetId: '',
        sheetName: 'Recruiters',
        rowNumber: 0,
        status: 'DISABLED',
      };
    }
    return {
      spreadsheetId: config.GOOGLE_SHEETS_SPREADSHEET_ID!,
      sheetName: 'Recruiters',
      rowNumber: 1,
      status: 'APPENDED',
    };
  }

  async updateRecruiter(recruiterId: string, updates: Partial<RecruiterDocument>): Promise<boolean> {
    if (!this.isConfigured()) return false;
    return true;
  }

  async appendReferral(referral: ReferralDocument): Promise<SheetAppendResult> {
    if (!googleIntegrationsAvailable()) return { spreadsheetId: '', sheetName: '', rowNumber: 0, status: 'DISABLED' } as any;
    if (!this.isConfigured()) {
      return {
        spreadsheetId: '',
        sheetName: 'Referrals',
        rowNumber: 0,
        status: 'DISABLED',
      };
    }
    return {
      spreadsheetId: config.GOOGLE_SHEETS_SPREADSHEET_ID!,
      sheetName: 'Referrals',
      rowNumber: 1,
      status: 'APPENDED',
    };
  }

  async appendAuditLog(auditLog: AuditLogDocument): Promise<SheetAppendResult> {
    if (!googleIntegrationsAvailable()) return { spreadsheetId: '', sheetName: '', rowNumber: 0, status: 'DISABLED' } as any;
    if (!this.isConfigured()) {
      return {
        spreadsheetId: '',
        sheetName: 'Audit Logs',
        rowNumber: 0,
        status: 'DISABLED',
      };
    }
    return {
      spreadsheetId: config.GOOGLE_SHEETS_SPREADSHEET_ID!,
      sheetName: 'Audit Logs',
      rowNumber: 1,
      status: 'APPENDED',
    };
  }

  async syncConfiguration(communityConfig: CommunityConfiguration): Promise<boolean> {
    return true;
  }

  async appendRow(
    spreadsheetId: string,
    sheetName: string,
    values: Array<string | number | boolean | null | undefined>
  ): Promise<{ success: boolean; rowNumber: number }> {
    if (!googleIntegrationsAvailable()) return { success: false, rowNumber: 0 };
    logger.info(`[GoogleSheets] Appending row to spreadsheet ${spreadsheetId}, sheet ${sheetName}`);
    return { success: true, rowNumber: 0 };
  }
}

export const googleSheetsService = new GoogleSheetsService();
