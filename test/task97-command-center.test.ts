import assert from 'node:assert/strict';
import { AiCommunityManagerController } from '../server/controllers/aiCommunityManager.controller.js';
import { communitiesRepository } from '../server/repositories/index.js';
import { resolveAuthorizedCommunityContext } from '../server/services/authorization.service.js';

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

export async function runTask97Tests(): Promise<{ passed: number; failed: number }> {
  passed = 0;
  failed = 0;
  console.log('\n======================================================================');
  console.log('TASK 97 — DISCORD COMMUNITY OPERATIONS COMMAND CENTER TESTS');
  console.log('======================================================================');

  const testCommunityId = `comm_t97_${Date.now()}`;
  const testGuildId = `guild_t97_${Date.now()}`;
  const ownerUserId = `usr_owner_t97_${Date.now()}`;

  // Seed community
  await communitiesRepository.create(testCommunityId, {
    id: testCommunityId,
    name: 'Command Center Testing Guild',
    ownerUserId: ownerUserId,
    discordGuildId: testGuildId,
    guildId: testGuildId,
    plan: 'PRO',
    status: 'ACTIVE',
  } as any);

  await runTest('1. Retrieve fully aggregated Command Center payload via controller', async () => {
    // Simulate req/res for getCommandCenter
    let responseData: any = null;
    let responseStatus: number | null = null;

    const req: any = {
      params: { communityId: testCommunityId },
      user: { userId: ownerUserId, role: 'OWNER' },
    };

    const res: any = {
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(data: any) {
        responseData = data;
        return this;
      },
    };

    await AiCommunityManagerController.getCommandCenter(req, res, () => {});

    assert.equal(responseData.success, true);
    assert.equal(responseData.community.id, testCommunityId);
    assert.equal(responseData.community.name, 'Command Center Testing Guild');

    // Verify all 11+ sections are defined (with real defaults or real data)
    assert.ok(responseData.serverHealth);
    assert.ok(responseData.needsAttention);
    assert.ok(responseData.today);
    assert.ok(responseData.memberActivity);
    assert.ok(responseData.workload);
    assert.ok(responseData.engagement);
    assert.ok(responseData.moderationSafety);
    assert.ok(responseData.integrations);
    assert.ok(responseData.notifications);
    assert.ok(responseData.recommendations);
    assert.ok(responseData.freshness);
  });

  await runTest('2. Enforce strict tenant validation on Command Center endpoint', async () => {
    // A random hacker user trying to read this community should trigger access validation error
    let responseData: any = null;
    let responseStatus: number | null = null;

    const req: any = {
      params: { communityId: testCommunityId },
      user: { userId: 'usr_hacker_random_97', role: 'MEMBER' },
    };

    const res: any = {
      status(code: number) {
        responseStatus = code;
        return this;
      },
      json(data: any) {
        responseData = data;
        return this;
      },
    };

    await AiCommunityManagerController.getCommandCenter(req, res, () => {});

    // Should return failure or unauthorized status
    assert.equal(responseData?.success, false);
    assert.equal(responseData?.errorCategory, 'AUTHORIZATION_FAILED');
  });

  return { passed, failed };
}
