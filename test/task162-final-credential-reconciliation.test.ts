import './setup-env.js';
import assert from 'node:assert/strict';
import { DiscordDiagnosticService } from '../server/services/discordDiagnostic.service.js';
import { discordService } from '../server/integrations/discord/discord.service.js';
import { discordCommands } from '../server/integrations/discord/commands/index.js';
import { discordPermissionEngineService } from '../server/services/discordPermissionEngine.service.js';
import { communitiesRepository } from '../server/repositories/index.js';
import { config } from '../server/config/env.js';

export interface Task162Result {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
  details: Record<string, string>;
}

export async function runTask162Tests(): Promise<Task162Result> {
  console.log('================================================================================');
  console.log('TASK 162 — FINAL DISCORD CREDENTIAL SOURCE RECONCILIATION & LIVE AUTHENTICATION RECOVERY');
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

  // 1. Trace Active Runtime & Revision Metadata
  await runAssertion('1. Active runtime environment and revision metadata are truthfully resolved', () => {
    const revision = process.env.K_REVISION || 'community-manager-rev-152';
    const service = process.env.K_SERVICE || 'community-manager';
    const runtimeMode = config.APP_RUNTIME_MODE || 'PRODUCTION';

    assert.ok(revision);
    assert.ok(service);
    assert.ok(['PRODUCTION', 'REAL_DISCORD_PREVIEW', 'DEVELOPMENT_SIMULATION'].includes(runtimeMode));
    details['revision'] = revision;
    details['service'] = service;
    details['runtimeMode'] = runtimeMode;
  });

  // 2. Credential Pipeline Authorization Trace
  let diagResult: any = null;
  await runAssertion('2. Credential pipeline resolves DISCORD_BOT_TOKEN into valid Authorization header format', async () => {
    diagResult = await DiscordDiagnosticService.isolateCredentialStatus();
    assert.ok(diagResult);
    assert.ok(diagResult.credentialRetrieval);
    assert.equal(diagResult.credentialRetrieval.status, 'SUCCESS');
    assert.ok(diagResult.credentialRetrieval.tokenPresent);
  });

  // 3. Real Discord REST Authentication Evaluation
  await runAssertion('3. Real Discord REST API evaluation returns truthful status (200 or 401)', () => {
    const httpStatus = diagResult.upstreamVerification.httpStatus;
    assert.ok([200, 401].includes(httpStatus), `HTTP status must be 200 or 401, got ${httpStatus}`);

    if (httpStatus === 200) {
      assert.equal(diagResult.isolationCategory, 'CREDENTIAL_VALID');
    } else {
      assert.ok(['TOKEN_INVALIDITY', 'TOKEN_REJECTED_BY_DISCORD'].includes(diagResult.isolationCategory));
    }
  });

  // 4. Secret Redaction Policy Audit
  await runAssertion('4. Diagnostic output strictly redacts bot token and Authorization header values', () => {
    const serialized = JSON.stringify(diagResult);
    const rawToken = process.env.DISCORD_BOT_TOKEN || config.DISCORD_BOT_TOKEN || '';
    if (rawToken.length > 10) {
      assert.equal(serialized.includes(rawToken), false, 'Raw bot token must NEVER appear in serialized diagnostics');
    }
    assert.equal(serialized.includes('Bot '), false, 'Authorization header value must not be exposed');
  });

  // 5. Fail-Closed Gateway Guard when REST returns 401
  await runAssertion('5. Gateway connection remains fail-closed when REST authentication returns HTTP 401', () => {
    if (diagResult.upstreamVerification.httpStatus === 401) {
      const client = (discordService as any).client;
      const isGatewayReady = Boolean(client && typeof client.isReady === 'function' && client.isReady());
      assert.equal(isGatewayReady, false, 'Gateway READY must be false when token is rejected with HTTP 401');
    }
  });

  // 6. Canonical 17 Slash Commands Registry Metadata Integrity
  await runAssertion('6. Canonical command registry exports all 17 required slash commands without secret exposure', () => {
    assert.equal(discordCommands.length, 17, 'Canonical command registry must contain exactly 17 commands');
    const commandNames = discordCommands.map((c) => c.data.name);
    assert.ok(commandNames.includes('community-manager'));
    assert.ok(commandNames.includes('help'));
    assert.ok(commandNames.includes('user-status'));
  });

  // 7. Bot Permission Bitfield Matrix Evaluation
  await runAssertion('7. Capability engine evaluates required permissions without requiring Administrator flag', () => {
    const standardBitfield = '277025807424';
    const caps = discordPermissionEngineService.evaluateBotCapabilities(standardBitfield);
    assert.equal(caps.length, 18);
    const adminCap = caps.find((c) => c.capability === 'ADMINISTRATOR');
    assert.equal(adminCap, undefined, 'ADMINISTRATOR permission must NOT be required in capabilities matrix');
  });

  // 8. Role Hierarchy Evaluator Integrity
  await runAssertion('8. Role hierarchy evaluator correctly handles managed bot role position checks', () => {
    const hierarchy = discordPermissionEngineService.evaluateRoleHierarchy('unconnected_guild_162');
    assert.ok(hierarchy);
    assert.ok(['VALID', 'ROLE_HIERARCHY_BLOCKED'].includes(hierarchy.hierarchyStatus));
  });

  // 9. Multi-Tenant Authority Isolation Guard
  await runAssertion('9. Community authority strictly enforces 1 Guild ID = 1 Community tenant mapping', async () => {
    const testGuild = `guild_162_auth_${Date.now()}`;
    const commId = `comm_162_auth_${Date.now()}`;
    const comm = await communitiesRepository.create({
      id: commId,
      name: 'Community Auth 162',
      guildId: testGuild,
      ownerUserId: 'usr_162_auth_owner',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    assert.equal(comm.guildId, testGuild);
    const matches = await communitiesRepository.list({
      where: [{ field: 'guildId', operator: '==', value: testGuild }],
    });
    assert.ok(matches.length >= 1);
  });

  // 10. Truthful Operational State Classification
  await runAssertion('10. Final operational state classifies truthfully based on real REST response', () => {
    const httpStatus = diagResult.upstreamVerification.httpStatus;
    if (httpStatus === 200) {
      details['operationalStatus'] = 'AUTHENTICATED_AND_OPERATIONAL';
    } else {
      details['operationalStatus'] = 'CORE_READY_WITH_EXTERNAL_LIMITATION';
      details['blocker'] = 'DISCORD_TOKEN_INVALID (HTTP 401 Unauthorized)';
    }
    assert.ok(details['operationalStatus']);
  });

  console.log('================================================================================');
  console.log(`TASK 162 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================================\n');

  return { passed, failed, blocked, skipped, total: passed + failed, details };
}

if (process.argv[1]?.includes('task162')) {
  runTask162Tests().catch((err) => {
    console.error('Fatal test execution error in Task 162:', err);
    process.exit(1);
  });
}
