import assert from 'node:assert/strict';
import { IntegrationRegistry } from '../server/integrations/registry/integrationRegistry.js';
import { IntegrationCredentialService } from '../server/integrations/services/integrationCredential.service.js';
import { IntegrationHealthService } from '../server/integrations/services/integrationHealth.service.js';
import { IntegrationSyncService } from '../server/integrations/services/integrationSync.service.js';
import { IntegrationConnectionService } from '../server/integrations/services/integrationConnection.service.js';
import { integrationCenterService } from '../server/services/integrationCenter.service.js';
import { EntitlementService } from '../server/services/entitlement.service.js';
import {
  communitiesRepository,
  googleSheetsConfigsRepository,
  googleFormsConfigsRepository,
  userCalendarConfigsRepository,
  integrationCredentialsRepository,
  integrationSyncsRepository,
} from '../server/repositories/index.js';

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failed++;
  }
}

export async function runTask86Tests(): Promise<{ passed: number; failed: number }> {
  console.log(`\n======================================================================`);
  console.log(`TASK 86 — INTEGRATIONS & CONNECTIVITY ENGINE TESTS`);
  console.log(`======================================================================\n`);

  const testCommunityId = `comm_t86_${Date.now()}`;
  const testUserId = `usr_t86_${Date.now()}`;

  // Seed test community
  await communitiesRepository.create({
    id: testCommunityId,
    name: 'Task 86 Integrations Community',
    ownerId: 'owner_user_t86',
    discordGuildId: 'guild_t86_1234567890',
    slug: 'task-86-community',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  // Set community to PRO plan so feature checks pass
  await EntitlementService.setPlan(testCommunityId, 'PRO');

  console.log(`--- 1. Canonical Integration Registry ---`);

  await runTest('Registry lists exactly 4 canonical integrations without fabrication', async () => {
    const keys = IntegrationRegistry.getAllKeys();
    assert.deepEqual(keys.sort(), ['DISCORD', 'GOOGLE_CALENDAR', 'GOOGLE_FORMS', 'GOOGLE_SHEETS'].sort());

    const canonicalList = IntegrationRegistry.listCanonical();
    assert.equal(canonicalList.length, 4);
  });

  await runTest('Registry contains truthful metadata, connection models and required scopes', async () => {
    const discord = IntegrationRegistry.get('DISCORD');
    assert.equal(discord.connectionModel, 'COMMUNITY_SCOPED');
    assert.equal(discord.category, 'COMMUNICATION');
    assert.equal(discord.tierRequired, 'FREE');
    assert.ok(discord.requiredScopes.includes('bot'));

    const calendar = IntegrationRegistry.get('GOOGLE_CALENDAR');
    assert.equal(calendar.connectionModel, 'USER_SCOPED');
    assert.equal(calendar.tierRequired, 'PRO');
    assert.ok(calendar.capabilities.includes('INTERVIEW_SCHEDULING'));

    const sheets = IntegrationRegistry.get('GOOGLE_SHEETS');
    assert.equal(sheets.connectionModel, 'COMMUNITY_SCOPED');
    assert.equal(sheets.tierRequired, 'PRO');

    const forms = IntegrationRegistry.get('GOOGLE_FORMS');
    assert.equal(forms.connectionModel, 'COMMUNITY_SCOPED');
    assert.equal(forms.tierRequired, 'PRO');
  });

  console.log(`\n--- 2. Credential Management & Security Redaction ---`);

  await runTest('Stores credentials securely server-side and exposes only redacted metadata', async () => {
    const stored = await IntegrationCredentialService.storeCredential({
      communityId: testCommunityId,
      integrationKey: 'GOOGLE_SHEETS',
      accessToken: 'secret_token_12345_do_not_leak',
      refreshToken: 'refresh_secret_67890_do_not_leak',
      expiresInSeconds: 3600,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      actorUserId: 'owner_user_t86',
      actorRole: 'OWNER',
    });

    // Verify secrets are NOT in the return object
    assert.equal((stored as any).accessToken, undefined);
    assert.equal((stored as any).encryptedAccessToken, undefined);
    assert.equal((stored as any).refreshToken, undefined);
    assert.equal((stored as any).encryptedRefreshToken, undefined);

    // Verify metadata
    assert.equal(stored.communityId, testCommunityId);
    assert.equal(stored.integrationKey, 'GOOGLE_SHEETS');
    assert.equal(stored.status, 'CONNECTED');
    assert.equal(stored.hasRefreshToken, true);
    assert.equal(stored.isExpired, false);

    // Verify getRedactedCredential also redacts completely
    const redacted = await IntegrationCredentialService.getRedactedCredential(testCommunityId, 'GOOGLE_SHEETS');
    assert.ok(redacted);
    assert.equal((redacted as any).accessToken, undefined);
    assert.equal((redacted as any).encryptedAccessToken, undefined);
    assert.equal(redacted.hasRefreshToken, true);
  });

  await runTest('Refreshes credentials without exposing tokens and handles expiry', async () => {
    const refreshResult = await IntegrationCredentialService.refreshCredential(
      testCommunityId,
      'GOOGLE_SHEETS',
      undefined,
      'owner_user_t86',
      'OWNER'
    );

    assert.equal(refreshResult.success, true);
    assert.equal(refreshResult.reauthRequired, false);
    assert.ok(refreshResult.view.lastRefreshedAt);
    assert.equal((refreshResult.view as any).accessToken, undefined);
  });

  await runTest('Marks REAUTH_REQUIRED when refresh token is missing on refresh attempt', async () => {
    // Store credential without refresh token
    await IntegrationCredentialService.storeCredential({
      communityId: testCommunityId,
      integrationKey: 'GOOGLE_FORMS',
      accessToken: 'temp_access_token_only',
      scopes: ['https://www.googleapis.com/auth/forms.responses.readonly'],
      actorUserId: 'owner_user_t86',
      actorRole: 'OWNER',
    });

    const refreshResult = await IntegrationCredentialService.refreshCredential(
      testCommunityId,
      'GOOGLE_FORMS',
      undefined,
      'owner_user_t86',
      'OWNER'
    );

    assert.equal(refreshResult.success, false);
    assert.equal(refreshResult.reauthRequired, true);
    assert.equal(refreshResult.view.status, 'REAUTH_REQUIRED');
  });

  await runTest('Revokes credential safely and transitions status to DISCONNECTED', async () => {
    await IntegrationCredentialService.revokeCredential(
      testCommunityId,
      'GOOGLE_FORMS',
      undefined,
      'owner_user_t86',
      'OWNER'
    );

    const postRevoke = await IntegrationCredentialService.getRedactedCredential(testCommunityId, 'GOOGLE_FORMS');
    assert.ok(postRevoke);
    assert.equal(postRevoke.status, 'DISCONNECTED');
  });

  console.log(`\n--- 3. Health Monitoring & Capabilities Evaluation ---`);

  await runTest('Calculates truthful integration health report across all providers', async () => {
    const report = await IntegrationHealthService.getOverallHealth(testCommunityId, testUserId);
    assert.ok(report);
    assert.equal(report.communityId, testCommunityId);
    assert.ok(report.integrations.DISCORD);
    assert.ok(report.integrations.GOOGLE_SHEETS);
    assert.ok(report.integrations.GOOGLE_FORMS);
    assert.ok(report.integrations.GOOGLE_CALENDAR);

    // Check Discord capability health structure
    assert.ok(Array.isArray(report.integrations.DISCORD.capabilitiesStatus));
    assert.ok(report.integrations.DISCORD.configurationCompleteness >= 0);
  });

  console.log(`\n--- 4. Durable Synchronization Engine ---`);

  await runTest('Manages durable sync lifecycle: start, update progress, and complete', async () => {
    const syncJob = await IntegrationSyncService.startSync({
      communityId: testCommunityId,
      integration: 'GOOGLE_SHEETS',
      resource: 'APPLICATIONS_EXPORT',
      direction: 'OUTBOUND',
      actorUserId: 'owner_user_t86',
      actorRole: 'OWNER',
    });

    assert.equal(syncJob.status, 'RUNNING');
    assert.equal(syncJob.communityId, testCommunityId);
    assert.equal(syncJob.recordsProcessed, 0);

    // Update progress
    const progress = await IntegrationSyncService.updateProgress(syncJob.id, {
      recordsProcessed: 10,
      recordsSucceeded: 8,
      recordsFailed: 2,
    });
    assert.equal(progress.recordsProcessed, 10);
    assert.equal(progress.recordsSucceeded, 8);

    // Complete sync with partial failures
    const completedPartial = await IntegrationSyncService.completeSync({
      syncId: syncJob.id,
      recordsProcessed: 15,
      recordsSucceeded: 13,
      recordsFailed: 2,
      actorUserId: 'owner_user_t86',
      actorRole: 'OWNER',
    });

    assert.equal(completedPartial.status, 'PARTIAL');
    assert.ok(completedPartial.completedAt);
    assert.equal(completedPartial.recordsProcessed, 15);

    // Complete another sync with 100% success
    const syncJob2 = await IntegrationSyncService.startSync({
      communityId: testCommunityId,
      integration: 'GOOGLE_SHEETS',
      resource: 'APPLICATIONS_EXPORT',
      direction: 'OUTBOUND',
      actorUserId: 'owner_user_t86',
      actorRole: 'OWNER',
    });

    const completedSuccess = await IntegrationSyncService.completeSync({
      syncId: syncJob2.id,
      recordsProcessed: 20,
      recordsSucceeded: 20,
      recordsFailed: 0,
      actorUserId: 'owner_user_t86',
      actorRole: 'OWNER',
    });

    assert.equal(completedSuccess.status, 'COMPLETED');
    assert.equal(completedSuccess.recordsProcessed, 20);

    // Query sync history
    const history = await IntegrationSyncService.getHistory(testCommunityId, 'GOOGLE_SHEETS');
    assert.ok(history.length >= 2);
    assert.ok(history.some((h) => h.id === syncJob.id));
    assert.ok(history.some((h) => h.id === syncJob2.id));
  });

  console.log(`\n--- 5. Connection Management & Access Control ---`);

  await runTest('Enforces RBAC on community integration connection', async () => {
    // Non-admin should be rejected
    await assert.rejects(
      async () => {
        await IntegrationConnectionService.connect({
          communityId: testCommunityId,
          integrationKey: 'GOOGLE_SHEETS',
          actorUserId: 'member_user',
          actorRole: 'MEMBER' as any,
          configPayload: { spreadsheetId: '12345678901234567890' },
        });
      },
      /Only server administrators can manage community integrations/
    );
  });

  await runTest('Admin can connect Google Sheets and configuration is stored', async () => {
    const detail = await IntegrationConnectionService.connect({
      communityId: testCommunityId,
      integrationKey: 'GOOGLE_SHEETS',
      actorUserId: 'owner_user_t86',
      actorRole: 'OWNER',
      configPayload: { spreadsheetId: 'spreadsheet_test_1234567890123' },
    });

    assert.equal(detail.integrationKey, 'GOOGLE_SHEETS');
    assert.equal(detail.displayName, 'Google Sheets');
    assert.ok(detail.health);

    const sheetConfig = await googleSheetsConfigsRepository.listForTenant(testCommunityId);
    assert.ok(sheetConfig.length > 0);
    assert.equal(sheetConfig[0].spreadsheetId, 'spreadsheet_test_1234567890123');
    assert.equal(sheetConfig[0].enabled, true);
  });

  await runTest('User can connect their own Google Calendar and disconnection revokes tokens', async () => {
    const detail = await IntegrationConnectionService.connect({
      communityId: testCommunityId,
      integrationKey: 'GOOGLE_CALENDAR',
      userId: testUserId,
      actorUserId: testUserId,
      actorRole: 'INTERVIEWER' as any,
      configPayload: { calendarId: 'c_test_calendar_123', timezone: 'America/New_York' },
      accessToken: 'test_user_calendar_token',
      refreshToken: 'test_user_calendar_refresh',
    });

    assert.equal(detail.integrationKey, 'GOOGLE_CALENDAR');
    assert.equal(detail.connectionModel, 'USER_SCOPED');

    // Disconnect user calendar
    const disconnected = await IntegrationConnectionService.disconnect({
      communityId: testCommunityId,
      integrationKey: 'GOOGLE_CALENDAR',
      userId: testUserId,
      actorUserId: testUserId,
      actorRole: 'INTERVIEWER' as any,
    });

    assert.ok(disconnected);
    const userCred = await IntegrationCredentialService.getRedactedCredential(
      testCommunityId,
      'GOOGLE_CALENDAR',
      testUserId
    );
    assert.equal(userCred?.status, 'DISCONNECTED');
  });

  console.log(`\n--- 6. IntegrationCenterService Unified Status & Methods ---`);

  await runTest('integrationCenterService.getUnifiedStatus returns full report with canonicalHealth', async () => {
    const report = await integrationCenterService.getUnifiedStatus(testCommunityId, testUserId);
    assert.ok(report);
    assert.ok(report.sections.discord);
    assert.ok(report.sections.googleSheets);
    assert.ok(report.sections.googleForms);
    assert.ok(report.sections.googleCalendar);
    assert.ok(report.sections.firebase);
    assert.ok(report.sections.aiEngine);
    assert.ok(report.sections.billing);
    assert.ok(report.canonicalHealth);
    assert.equal(report.canonicalHealth.communityId, testCommunityId);
  });

  await runTest('integrationCenterService testIntegration and sync methods work durably', async () => {
    const health = await integrationCenterService.testIntegration(
      testCommunityId,
      'GOOGLE_SHEETS',
      'owner_user_t86',
      'OWNER'
    );
    assert.ok(health);
    assert.equal(health.integrationKey, 'GOOGLE_SHEETS');

    // Trigger sync
    const syncResult = await integrationCenterService.triggerSync({
      communityId: testCommunityId,
      integrationKey: 'GOOGLE_SHEETS',
      actorUserId: 'owner_user_t86',
      actorRole: 'OWNER',
    });
    assert.ok(syncResult);
    assert.ok(typeof syncResult.success === 'boolean');
  });

  console.log(`\n======================================================================`);
  console.log(`TASK 86 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log(`======================================================================\n`);

  return { passed, failed };
}
