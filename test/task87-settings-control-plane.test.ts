import assert from 'node:assert/strict';
import {
  SettingsService,
  SettingsValidationService,
  SettingsAuditService,
  SettingsVersionService,
  isValidTimezone,
  isValidLocale,
  sanitizeSettingsData,
} from '../server/services/settings.service.js';
import {
  communitiesRepository,
  communityConfigurationRepository,
  rolesRepository,
  recruiterRecordConfigsRepository,
  auditLogsRepository,
  googleCalendarConfigsRepository,
} from '../server/repositories/index.js';
import { EntitlementService } from '../server/services/entitlement.service.js';

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

export async function runTask87Tests(): Promise<{ passed: number; failed: number }> {
  console.log(`\n======================================================================`);
  console.log(`TASK 87 — SETTINGS & CONFIGURATION CONTROL PLANE TESTS`);
  console.log(`======================================================================\n`);

  const testCommunityId = `comm_t87_${Date.now()}`;
  const ownerUserId = `usr_owner_t87_${Date.now()}`;
  const controllerUserId = `usr_ctrl_t87_${Date.now()}`;
  const memberUserId = `usr_mem_t87_${Date.now()}`;

  // Seed test community
  await communitiesRepository.create({
    id: testCommunityId,
    name: 'Task 87 Test Community',
    ownerId: ownerUserId,
    discordGuildId: 'guild_t87_1234567890',
    discordGuildName: 'Task 87 Discord Server',
    slug: 'task-87-community',
    timezone: 'UTC',
    locale: 'en-US',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  // Set PRO plan
  await EntitlementService.setPlan(testCommunityId, 'PRO');

  console.log(`--- 1. Consolidated Settings Retrieval & Structure ---`);

  await runTest('Retrieves complete consolidated settings schema across all 7 sections', async () => {
    const settings = await SettingsService.getConsolidatedSettings(testCommunityId);
    assert.ok(settings, 'Settings must be returned');
    assert.equal(settings.communityId, testCommunityId);
    assert.ok(settings.general, 'Must have general section');
    assert.ok(settings.community, 'Must have community section');
    assert.ok(settings.permissions, 'Must have permissions section');
    assert.ok(settings.recruitment, 'Must have recruitment section');
    assert.ok(settings.notifications, 'Must have notifications section');
    assert.ok(settings.plansUsage, 'Must have plansUsage section');
    assert.ok(settings.security, 'Must have security section');
    assert.ok(settings.diagnostics, 'Must have diagnostics engine output');
    assert.equal(settings.general.displayName, 'Task 87 Test Community');
    assert.equal(settings.general.guildName, 'Task 87 Discord Server');
  });

  console.log(`--- 2. Validation Engine (Timezones, Locales, Values) ---`);

  await runTest('Validates IANA timezones and rejects invalid identifiers', () => {
    assert.equal(isValidTimezone('America/New_York'), true);
    assert.equal(isValidTimezone('Europe/London'), true);
    assert.equal(isValidTimezone('Asia/Tokyo'), true);
    assert.equal(isValidTimezone('UTC'), true);
    assert.equal(isValidTimezone('Mars/Phobos'), false);
    assert.equal(isValidTimezone('Invalid/Timezone'), false);
    assert.equal(isValidTimezone(''), false);

    const valResultInvalid = SettingsValidationService.validateGeneral({ timezone: 'Invalid/Zone' });
    assert.equal(valResultInvalid.valid, false);
    assert.ok(valResultInvalid.errors[0].includes('INVALID_TIMEZONE'));

    const valResultValid = SettingsValidationService.validateGeneral({ timezone: 'America/Chicago' });
    assert.equal(valResultValid.valid, true);
  });

  await runTest('Validates supported locales and rejects unsupported locales', () => {
    assert.equal(isValidLocale('en-US'), true);
    assert.equal(isValidLocale('fr-FR'), true);
    assert.equal(isValidLocale('ja-JP'), true);
    assert.equal(isValidLocale('xx-YY'), false);
    assert.equal(isValidLocale('invalid-locale'), false);

    const valResultInvalid = SettingsValidationService.validateGeneral({ locale: 'invalid-locale' });
    assert.equal(valResultInvalid.valid, false);
    assert.ok(valResultInvalid.errors[0].includes('INVALID_LOCALE'));
  });

  await runTest('Rejects out-of-bound screening thresholds and invalid mention policies', () => {
    const invalidThreshold = SettingsValidationService.validateRecruitment({ screeningThreshold: 150 });
    assert.equal(invalidThreshold.valid, false);

    const validThreshold = SettingsValidationService.validateRecruitment({ screeningThreshold: 80 });
    assert.equal(validThreshold.valid, true);

    const invalidPolicy = SettingsValidationService.validateSecurity({ massMentionPolicy: 'OPEN_TO_ALL' as any }, 'OWNER');
    assert.equal(invalidPolicy.valid, false);

    const validPolicy = SettingsValidationService.validateSecurity({ massMentionPolicy: 'RESTRICTED' }, 'OWNER');
    assert.equal(validPolicy.valid, true);
  });

  console.log(`--- 3. Role Security, Hierarchy & Permissions Protection ---`);

  await runTest('Rejects self-assignment of permissions in permission validation', () => {
    const permVal = SettingsValidationService.validatePermissions({ allowSelfAssignment: true }, 'OWNER');
    assert.equal(permVal.valid, false);
    assert.ok(permVal.errors[0].includes('Self-assignment'));
  });

  await runTest('Prevents non-owners (CONTROLLER) from modifying SERVER_OWNER role mapping', () => {
    const nonOwnerVal = SettingsValidationService.validatePermissions(
      {
        roleMappings: {
          OWNER: {
            role: 'OWNER',
            discordRoleName: 'Demoted Owner',
            isProtected: true,
            permissions: [],
            status: 'READY',
          },
        } as any,
      },
      'CONTROLLER'
    );
    assert.equal(nonOwnerVal.valid, false);
    assert.ok(nonOwnerVal.errors[0].includes('Only SERVER_OWNER'));
  });

  await runTest('Rejects unauthorized role (MEMBER) from updating community settings', async () => {
    await assert.rejects(
      async () => {
        await SettingsService.updateSettings(
          testCommunityId,
          { userId: memberUserId, role: 'MEMBER' },
          { general: { displayName: 'Hacked Community' } }
        );
      },
      /Insufficient permissions/
    );
  });

  console.log(`--- 4. Partial Updates, Atomic Persistence & Versioning ---`);

  await runTest('Updates General settings and persists to communities repository', async () => {
    const initial = await SettingsService.getConsolidatedSettings(testCommunityId);
    const initialVersion = initial.version;

    const updated = await SettingsService.updateSettings(
      testCommunityId,
      { userId: ownerUserId, role: 'OWNER' },
      {
        general: {
          displayName: 'Updated Elite Community',
          timezone: 'America/Los_Angeles',
          locale: 'en-US',
          description: 'A premier Discord gaming community',
        },
      }
    );

    assert.equal(updated.general.displayName, 'Updated Elite Community');
    assert.equal(updated.general.timezone, 'America/Los_Angeles');
    assert.equal(updated.general.description, 'A premier Discord gaming community');
    assert.equal(updated.version, initialVersion + 1);

    // Verify repository directly
    const commDoc = await communitiesRepository.getById(testCommunityId);
    assert.equal(commDoc?.name, 'Updated Elite Community');
    assert.equal(commDoc?.timezone, 'America/Los_Angeles');
  });

  await runTest('Updates Community and Recruitment settings with monotonic version increment', async () => {
    const current = await SettingsService.getConsolidatedSettings(testCommunityId);
    const currentVersion = current.version;

    const updated = await SettingsService.updateSettings(
      testCommunityId,
      { userId: ownerUserId, role: 'OWNER' },
      {
        community: {
          welcomeMessageEnabled: true,
          welcomeGreeting: 'Welcome aboard to {{communityName}}! Check {{rulesChannel}}.',
          rules: ['Respect everyone', 'No unauthorized advertising', 'Have fun!'],
        },
        recruitment: {
          screeningThreshold: 85,
          recruiterDisplayName: 'Commander Alpha',
          recruiterPersonaEnabled: true,
        },
      }
    );

    assert.equal(updated.community.welcomeGreeting, 'Welcome aboard to {{communityName}}! Check {{rulesChannel}}.');
    assert.equal(updated.community.rules.length, 3);
    assert.equal(updated.recruitment.screeningThreshold, 85);
    assert.equal(updated.recruitment.recruiterDisplayName, 'Commander Alpha');
    assert.equal(updated.version, currentVersion + 1);

    // Verify config doc in repository
    const configDoc = await communityConfigurationRepository.getById(testCommunityId);
    assert.equal(configDoc?.recruiterDisplayName, 'Commander Alpha');
  });

  console.log(`--- 5. Secret Redaction & Sanitization ---`);

  await runTest('sanitizeSettingsData redacts API keys, tokens, passwords and secrets', () => {
    const raw = {
      communityId: testCommunityId,
      botToken: 'DISCORD_SUPER_SECRET_TOKEN',
      clientSecret: 'GOOGLE_CLIENT_SECRET_XYZ',
      apiKey: 'AI_STUDIO_API_KEY_123',
      credentials: {
        refreshToken: 'REFRESH_TOKEN_456',
        password: 'SUPER_SAFE_PASSWORD',
      },
      normalField: 'Public Community Name',
    };

    const sanitized = sanitizeSettingsData(raw);
    assert.equal(sanitized.botToken, '[REDACTED]');
    assert.equal(sanitized.clientSecret, '[REDACTED]');
    assert.equal(sanitized.apiKey, '[REDACTED]');
    assert.equal(sanitized.credentials.refreshToken, '[REDACTED]');
    assert.equal(sanitized.credentials.password, '[REDACTED]');
    assert.equal(sanitized.normalField, 'Public Community Name');
  });

  console.log(`--- 6. Structured Audit Logging ---`);

  await runTest('Records structured audit logs for settings update operations', async () => {
    await SettingsService.updateSettings(
      testCommunityId,
      { userId: ownerUserId, role: 'OWNER' },
      {
        security: {
          moderationBaselineSeverity: 'HIGH',
          moderationLogChannel: '#security-alerts',
          suspiciousActivityAlerts: true,
        },
      }
    );

    const auditLogs = await auditLogsRepository.listForTenant(testCommunityId);
    const secLog = auditLogs.find((l) => l.action === 'SECURITY_SETTINGS_UPDATED');
    assert.ok(secLog, 'SECURITY_SETTINGS_UPDATED audit log must be recorded');
    assert.equal(secLog.actorUserId, ownerUserId);
    assert.equal(secLog.actorRole, 'OWNER');
    assert.equal(secLog.metadata?.section, 'security');
  });

  console.log(`--- 7. Diagnostics Engine & Dependency Verification ---`);

  await runTest('Evaluates configuration diagnostics and flags missing integrations', async () => {
    // When calendar requirement is enabled without Google Calendar connected
    await SettingsService.updateSettings(
      testCommunityId,
      { userId: ownerUserId, role: 'OWNER' },
      {
        recruitment: {
          calendarRequirementEnabled: true,
        },
      }
    );

    const diagnostics = await SettingsService.getDiagnostics(testCommunityId);
    assert.ok(diagnostics, 'Diagnostics must be evaluated');
    const calDiag = diagnostics.items.find((i) => i.settingKey === 'calendarRequirement');
    assert.ok(calDiag, 'Calendar requirement diagnostic item must exist');
    assert.equal(calDiag.status, 'INTEGRATION_REQUIRED');
    assert.ok(calDiag.remediation?.includes('Google Calendar'));

    // Now connect Google Calendar
    await googleCalendarConfigsRepository.create({
      id: testCommunityId,
      communityId: testCommunityId,
      status: 'CONNECTED',
      calendarId: 'primary',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    SettingsService.invalidateCache(testCommunityId);
    const refreshedDiag = await SettingsService.getDiagnostics(testCommunityId);
    const refreshedCalDiag = refreshedDiag.items.find((i) => i.settingKey === 'calendarRequirement');
    assert.equal(refreshedCalDiag?.status, 'READY');
  });

  console.log(`\n======================================================================`);
  console.log(`TASK 87 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log(`======================================================================\n`);

  return { passed, failed };
}
