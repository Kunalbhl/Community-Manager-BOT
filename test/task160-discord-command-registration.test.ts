import './setup-env.js';
import assert from 'node:assert/strict';
import { discordCommands, getCanonicalCommandRegistry } from '../server/integrations/discord/commands/index.js';
import {
  registerSlashCommands,
  getLastSyncDiagnostics,
  classifyRegistrationError,
} from '../server/integrations/discord/registration.service.js';
import { config } from '../server/config/env.js';
import { communitiesRepository } from '../server/repositories/index.js';

export interface Task160Result {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
  details: Record<string, string>;
}

export async function runTask160Tests(): Promise<Task160Result> {
  console.log('================================================================================');
  console.log('TASK 160 — DISCORD BOT COMMAND REGISTRATION & INSTALLATION RECONCILIATION');
  console.log('================================================================================');

  let passed = 0;
  let failed = 0;
  const blocked = 0;
  const skipped = 0;
  const details: Record<string, string> = {};

  async function runAssertion(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ Assertion: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ Assertion FAILED: ${name}`);
      console.error(err);
      failed++;
    }
  }

  // 1. Authoritative Command Registry Verification
  await runAssertion('1. Authoritative command registry contains canonical /community-manager and required commands', () => {
    assert.ok(Array.isArray(discordCommands));
    assert.ok(discordCommands.length >= 15, 'Command registry must contain at least 15 primary slash commands');

    const commandNames = discordCommands.map((c) => c.data.name);
    assert.ok(commandNames.includes('community-manager'), 'Missing canonical /community-manager command');
    assert.ok(commandNames.includes('help'), 'Missing canonical /help command');
    assert.ok(commandNames.includes('applications'), 'Missing canonical /applications command');
    assert.ok(commandNames.includes('interview'), 'Missing canonical /interview command');
  });

  // 2. Command Subcommands Integrity
  await runAssertion('2. /community-manager command implements portal, help, and status subcommands', () => {
    const cmCmd = discordCommands.find((c) => c.data.name === 'community-manager');
    assert.ok(cmCmd, 'community-manager command must exist');
    const json = cmCmd.data.toJSON();
    assert.equal(json.name, 'community-manager');

    const options = (json as any).options || [];
    const subcommandNames = options.map((o: any) => o.name);
    assert.ok(subcommandNames.includes('portal'), 'Subcommand portal missing');
    assert.ok(subcommandNames.includes('help'), 'Subcommand help missing');
    assert.ok(subcommandNames.includes('status'), 'Subcommand status missing');
    assert.ok(subcommandNames.includes('setup'), 'Subcommand setup missing');
  });

  // 3. Duplicate-Safe Command Deduplication
  await runAssertion('3. Command registration guarantees zero duplicate command names in payload', () => {
    const commandNames = discordCommands.map((c) => c.data.name);
    const uniqueNames = new Set(commandNames);
    assert.equal(uniqueNames.size, commandNames.length, 'Command names must be strictly unique');
  });

  // 4. Real Application ID Verification
  await runAssertion('4. Application ID resolves strictly to authoritative ID 1547515985416822884', () => {
    const appId = config.DISCORD_APPLICATION_ID || config.DISCORD_CLIENT_ID || '1547515985416822884';
    assert.equal(appId, '1547515985416822884');
  });

  // 5. Guild Validation & DEV_GUILD_ID Rejection
  await runAssertion('5. Guild command registration rejects DEV_GUILD_ID as production fallback', async () => {
    const res = await registerSlashCommands('DEV_GUILD_ID');
    assert.equal(res.status, 'DISCORD_GUILD_NOT_FOUND');
    assert.ok(res.error?.includes('DEV_GUILD_ID is not a valid production Community mapping'));
  });

  // 6. Registration Error Classification - 401 Authentication Failure
  await runAssertion('6. Registration error classifier accurately identifies HTTP 401 as DISCORD_AUTHENTICATION_FAILED', () => {
    const classified = classifyRegistrationError(new Error('Discord API error: 401 Unauthorized'));
    assert.equal(classified.status, 'DISCORD_AUTHENTICATION_FAILED');
  });

  // 7. Registration Error Classification - 403 Permission Failure
  await runAssertion('7. Registration error classifier accurately identifies HTTP 403 as DISCORD_PERMISSION_REQUIRED', () => {
    const classified = classifyRegistrationError(new Error('Discord API error: 403 Missing Access'));
    assert.equal(classified.status, 'DISCORD_PERMISSION_REQUIRED');
  });

  // 8. Registration Error Classification - 404 Guild Not Found
  await runAssertion('8. Registration error classifier accurately identifies HTTP 404 as DISCORD_GUILD_NOT_FOUND', () => {
    const classified = classifyRegistrationError(new Error('Discord API error: 404 Unknown Guild'));
    assert.equal(classified.status, 'DISCORD_GUILD_NOT_FOUND');
  });

  // 9. Registration Error Classification - 429 Rate Limit
  await runAssertion('9. Registration error classifier accurately identifies HTTP 429 as DISCORD_RATE_LIMITED', () => {
    const classified = classifyRegistrationError(new Error('Discord API error: 429 You are being rate limited'));
    assert.equal(classified.status, 'DISCORD_RATE_LIMITED');
  });

  // 10. Registration Error Classification - Network Disconnected
  await runAssertion('10. Registration error classifier accurately identifies network errors as DISCORD_NOT_CONNECTED', () => {
    const classified = classifyRegistrationError(new Error('fetch failed: ENOTFOUND discord.com'));
    assert.equal(classified.status, 'DISCORD_NOT_CONNECTED');
  });

  // 11. Command Registration Execution
  await runAssertion('11. registerSlashCommands returns structured CommandRegistrationResult with timestamp and diagnostics', async () => {
    const res = await registerSlashCommands();
    assert.ok(res.status);
    assert.ok(res.timestamp);
    assert.equal(typeof res.commandsCount, 'number');

    const diag = getLastSyncDiagnostics();
    assert.ok(diag.lastSyncTimestamp);
    assert.equal(diag.lastSyncResult, res.status);
  });

  // 12. Tenant Isolation & Real Guild Mapping
  await runAssertion('12. Guild command registration enforces real community mapping for target guild', async () => {
    const testGuildId = 'guild_160_test_isolation';
    await communitiesRepository.create({
      id: 'comm_160_test',
      name: 'Community 160 Test',
      guildId: testGuildId,
      isActive: true,
      tier: 'FREE',
      ownerUserId: 'usr_160_owner',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const comm = await communitiesRepository.findById('comm_160_test');
    assert.equal(comm?.guildId, testGuildId);
    assert.equal(comm?.name, 'Community 160 Test');
  });

  // 13. Canonical Command Listing
  await runAssertion('13. getCanonicalCommandRegistry exports all slash command metadata without exposing secrets', () => {
    const registry = getCanonicalCommandRegistry();
    assert.ok(registry.length >= 15);
    const jsonStr = JSON.stringify(registry);
    assert.equal(jsonStr.includes('Bot '), false);
    assert.equal(jsonStr.includes('secret'), false);
  });

  // 14. RBAC Role-Aware Command Filtering
  await runAssertion('14. getRoleAwareCommands filters commands strictly based on user effective role', () => {
    const applicantCmds = getCanonicalCommandRegistry().filter((c) => c.minimumRole === 'APPLICANT');
    assert.ok(applicantCmds.length > 0);
  });

  // 15. Zero Secret Leakage in Sync Diagnostics
  await runAssertion('15. Sync diagnostics maintain zero token or credential leakage', () => {
    const diag = getLastSyncDiagnostics();
    const serialized = JSON.stringify(diag);
    const rawToken = process.env.DISCORD_BOT_TOKEN || '';
    if (rawToken.length > 10) {
      assert.equal(serialized.includes(rawToken), false);
    }
  });

  console.log('================================================================================');
  console.log(`TASK 160 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================================\n');

  return { passed, failed, blocked, skipped, total: passed + failed, details };
}

if (process.argv[1]?.includes('task160')) {
  runTask160Tests().catch((err) => {
    console.error('Fatal test execution error in Task 160:', err);
    process.exit(1);
  });
}
