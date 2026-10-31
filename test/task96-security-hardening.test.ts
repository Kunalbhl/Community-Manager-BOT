import assert from 'node:assert/strict';
import { resolveAuthorizedCommunityContext } from '../server/services/authorization.service.js';
import { communitiesRepository } from '../server/repositories/index.js';
import { config } from '../server/config/env.js';
import type { UserAuthContext } from '../shared/types/rbac.js';

let passed = 0;
let failed = 0;

async function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(err);
    failed++;
  }
}

export async function runTask96Tests(): Promise<{ passed: number; failed: number }> {
  passed = 0;
  failed = 0;
  console.log('\n======================================================================');
  console.log('TASK 96 — IDENTITY, TENANCY & PRODUCTION AUTHORITY HARDENING TESTS');
  console.log('======================================================================');

  const testCommunityId = `comm_t96_${Date.now()}`;
  const testGuildId = `guild_t96_${Date.now()}`;
  const ownerUserId = `usr_owner_t96_${Date.now()}`;

  // Create a real community in repo
  await communitiesRepository.create(testCommunityId, {
    id: testCommunityId,
    name: 'Task 96 Hardening Community',
    ownerUserId: ownerUserId,
    discordGuildId: testGuildId,
    guildId: testGuildId,
    plan: 'PRO',
    status: 'ACTIVE',
  } as any);

  await runTest('1. Secure Tenant Resolution via resolveAuthorizedCommunityContext()', async () => {
    // Standard validation
    const result = await resolveAuthorizedCommunityContext(ownerUserId, testCommunityId);
    assert.equal(result.community.id, testCommunityId);
    assert.equal(result.role, 'OWNER');
  });

  await runTest('2. Rejection on missing communityId', async () => {
    await assert.rejects(
      async () => {
        await resolveAuthorizedCommunityContext(ownerUserId, undefined);
      },
      /Community context is required/
    );
  });

  await runTest('3. Rejection of Cross-Tenant Privilege Escalation', async () => {
    // If a non-associated user tries to access a community, it should fail
    await assert.rejects(
      async () => {
        await resolveAuthorizedCommunityContext('usr_hacker_random', testCommunityId);
      },
      /Access denied: User is not associated with this community/
    );
  });

  await runTest('4. Absolute Rejection of Simulated Identities', async () => {
    const prevSimulationVal = process.env.DEV_SIMULATION_ENABLED;
    try {
      process.env.DEV_SIMULATION_ENABLED = 'false';
      
      await assert.rejects(
        async () => {
          await resolveAuthorizedCommunityContext('usr_owner_1', testCommunityId);
        },
        /Simulated identity usage is prohibited/
      );
    } finally {
      process.env.DEV_SIMULATION_ENABLED = prevSimulationVal;
    }
  });

  return { passed, failed };
}
