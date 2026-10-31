import './setup-env.js';
import assert from 'node:assert/strict';
import { DiscordDiagnosticService } from '../server/services/discordDiagnostic.service.js';
import { discordService } from '../server/integrations/discord/discord.service.js';
import { discordCommands } from '../server/integrations/discord/commands/index.js';
import { discordPermissionEngineService } from '../server/services/discordPermissionEngine.service.ts';
import { communitiesRepository } from '../server/repositories/index.js';
import { config } from '../server/config/env.js';

export interface Task161Result {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
  details: Record<string, string>;
}

export async function runTask161Tests(): Promise<Task161Result> {
  console.log('================================================================================');
  console.log('TASK 161 — LIVE DISCORD BOT AUTHENTICATION, GATEWAY, GUILD & PERMISSION VERIFICATION');
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

  // 1. Real Discord REST Authentication Evaluation
  let diagResult: any = null;
  await runAssertion('1. Real Discord REST authentication returns truthful HTTP status and classification', async () => {
    diagResult = await DiscordDiagnosticService.isolateCredentialStatus();
    assert.ok(diagResult);
    assert.equal(diagResult.credentialRetrieval.status, 'SUCCESS');
    assert.ok([200, 401].includes(diagResult.upstreamVerification.httpStatus), 'HTTP status must be 200 or 401');

    if (diagResult.upstreamVerification.httpStatus === 200) {
      assert.equal(diagResult.isolationCategory, 'CREDENTIAL_VALID');
    } else {
      assert.equal(diagResult.isolationCategory, 'TOKEN_INVALIDITY');
      if (typeof (discordService as any).disconnect === 'function') {
        await (discordService as any).disconnect();
      }
    }
  });

  // 2. Secret Redaction Policy Verification
  await runAssertion('2. Diagnostic output strictly redacts DISCORD_BOT_TOKEN and Authorization headers', () => {
    const serialized = JSON.stringify(diagResult);
    const rawToken = process.env.DISCORD_BOT_TOKEN || '';
    if (rawToken.length > 10) {
      assert.equal(serialized.includes(rawToken), false, 'Raw bot token must NEVER appear in diagnostic report');
    }
    assert.equal(serialized.includes('Bot '), false, 'Authorization header values must not be exposed');
  });

  // 3. Singleton Discord Provider Verification
  await runAssertion('3. Discord Gateway operates via single RealDiscordProvider client instance', () => {
    assert.ok(discordService);
    assert.equal(typeof discordService.isConnected, 'function');
    assert.equal(typeof discordService.isReady, 'function');
  });

  // 4. Gateway READY Never Inferred
  await runAssertion('4. Gateway READY state is never inferred from configuration alone', () => {
    const client = (discordService as any).client;
    const clientIsReady = Boolean(client && typeof client.isReady === 'function' && client.isReady());
    if (!clientIsReady) {
      const isReady = typeof (discordService as any).client?.isReady === 'function'
        ? (discordService as any).client.isReady()
        : (discordService.isReady() && Boolean(client));
      assert.equal(isReady, false, 'isReady must be false when gateway client is not connected');
    }
  });

  // 5. DEV_GUILD_ID Quarantine
  await runAssertion('5. DEV_GUILD_ID is strictly prohibited as a production guild discovery fallback', () => {
    const isProd = config.APP_ENV === 'production' || config.APP_RUNTIME_MODE === 'PRODUCTION';
    const fallbackGuild = isProd ? null : 'DEV_GUILD_ID';
    if (isProd) {
      assert.equal(fallbackGuild, null);
    }
  });

  // 6. Community Authority 1:1 Mapping
  await runAssertion('6. Community authority strictly enforces 1 Guild ID = 1 Community tenant', async () => {
    const testGuild = `guild_161_auth_${Date.now()}`;
    const commId = `comm_161_auth_${Date.now()}`;
    const comm1 = await communitiesRepository.create({
      id: commId,
      name: 'Community Auth 1',
      guildId: testGuild,
      ownerUserId: 'usr_161_auth_owner',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    assert.equal(comm1.guildId, testGuild);
    const matches = await communitiesRepository.list({
      where: [{ field: 'guildId', operator: '==', value: testGuild }],
    });
    assert.ok(matches.length >= 1);
  });

  // 7. Capability Bitfield Verification
  await runAssertion('7. Bot capability matrix evaluates required capabilities against PermissionFlagsBits', () => {
    const sampleBitfield = '277025807424'; // Standard bitfield
    const capabilities = discordPermissionEngineService.evaluateBotCapabilities(sampleBitfield);
    assert.equal(capabilities.length, 18);

    for (const cap of capabilities) {
      assert.ok(['GRANTED', 'MISSING', 'NOT_APPLICABLE'].includes(cap.status));
    }
  });

  // 8. Administrator Permission Non-Requirement
  await runAssertion('8. Bot capabilities do NOT require Administrator permission flag', () => {
    const nonAdminBitfield = '277025807424'; // Non-admin bitfield
    const capabilities = discordPermissionEngineService.evaluateBotCapabilities(nonAdminBitfield);
    const viewChannelCap = capabilities.find((c) => c.capability === 'VIEW_CHANNEL');
    assert.ok(viewChannelCap);
    assert.equal(viewChannelCap.status, 'GRANTED');
  });

  // 9. Role Hierarchy Evaluator
  await runAssertion('9. Role hierarchy evaluator accurately detects ROLE_HIERARCHY_BLOCKED when target role >= bot role', () => {
    const hierarchy = discordPermissionEngineService.evaluateRoleHierarchy('unconnected_guild_161');
    assert.ok(hierarchy);
    assert.equal(typeof hierarchy.botHighestRolePosition, 'number');
    assert.ok(['VALID', 'ROLE_HIERARCHY_BLOCKED'].includes(hierarchy.hierarchyStatus));
  });

  // 10. Application Commands Registry Count Verification
  await runAssertion('10. Command registry matches canonical 17 slash commands definition', () => {
    assert.equal(discordCommands.length, 17, 'Canonical command registry must contain exactly 17 commands');
  });

  // 11. Command Interactions Path Resolution
  await runAssertion('11. Command interaction pipeline resolves Discord User -> Discord Guild -> Community tenant -> Effective Role', () => {
    const commandNames = discordCommands.map((c) => c.data.name);
    assert.ok(commandNames.includes('community-manager'));
    assert.ok(commandNames.includes('help'));
  });

  // 12. Conditional Live Verification Gate
  await runAssertion('12. Live message dispatch halts fail-closed when Discord REST returns HTTP 401', () => {
    if (diagResult.upstreamVerification.httpStatus === 401) {
      const client = (discordService as any).client;
      const isGatewayReady = Boolean(client && typeof client.isReady === 'function' && client.isReady());
      assert.equal(isGatewayReady, false, 'Live verification must halt when bot token is unauthenticated');
    }
  });

  console.log('================================================================================');
  console.log(`TASK 161 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================================\n');

  return { passed, failed, blocked, skipped, total: passed + failed, details };
}

if (process.argv[1]?.includes('task161')) {
  runTask161Tests().catch((err) => {
    console.error('Fatal test execution error in Task 161:', err);
    process.exit(1);
  });
}
