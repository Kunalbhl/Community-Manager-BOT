import assert from 'node:assert/strict';
import { DiscordOperationsService } from '../server/services/discordOperations.service.js';
import { DiscordHygieneService } from '../server/services/discordHygiene.service.js';
import { ActionRegistryService } from '../server/services/ai/actionRegistry.js';
import { communitiesRepository } from '../server/repositories/index.js';
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

export async function runTask95Tests(): Promise<{ passed: number; failed: number }> {
  passed = 0;
  failed = 0;
  console.log('\n======================================================================');
  console.log('TASK 95 — DISCORD OPERATIONS & SERVER CONTROL ENGINE TESTS');
  console.log('======================================================================');

  const testCommunityId = `comm_t95_${Date.now()}`;
  const testGuildId = `guild_t95_${Date.now()}`;
  const ownerUserId = `usr_owner_t95_${Date.now()}`;

  await communitiesRepository.create(testCommunityId, {
    id: testCommunityId,
    name: 'Task 95 Control Engine Guild',
    ownerUserId: ownerUserId,
    discordGuildId: testGuildId,
    guildId: testGuildId,
    plan: 'ENTERPRISE',
    status: 'ACTIVE',
  } as any);

  const ownerCtx: UserAuthContext = {
    userId: ownerUserId,
    role: 'OWNER',
    communityId: testCommunityId,
    customPermissions: ['community.manage', 'applications.view', 'applications.approve'],
  };

  const recruiterCtx: UserAuthContext = {
    userId: `usr_recruiter_t95`,
    role: 'RECRUITER',
    communityId: testCommunityId,
    customPermissions: ['applications.view'],
  };

  await runTest('1. Server Operations & Live Diagnostics', async () => {
    const serverInfo = await DiscordOperationsService.inspectServer(testCommunityId, ownerCtx);
    assert.equal(serverInfo.communityId, testCommunityId);
    assert.equal(serverInfo.guildId, testGuildId);
    assert.ok(typeof serverInfo.botPresent === 'boolean');
  });

  await runTest('2. Role Operations & Managed Bot Role Protection', async () => {
    const newRoleRes = await DiscordOperationsService.createRole(
      testCommunityId,
      ownerCtx,
      { name: 'Vetted Ops Member', color: '#3498db', mentionable: false, confirmed: true }
    );
    assert.ok(newRoleRes.success);
    assert.ok(newRoleRes.role.id);
    assert.equal(newRoleRes.role.name, 'Vetted Ops Member');

    await assert.rejects(
      async () => {
        await DiscordOperationsService.assignRole(
          testCommunityId,
          ownerCtx,
          { memberIdOrDiscordId: 'usr_member_1', roleId: 'role_bot_managed' }
        );
      },
      (err: any) => err.message.includes('managed') || err.message.includes('Forbidden')
    );
  });

  await runTest('3. Channel Operations & Human-Readable Permission Diagnostics', async () => {
    const newChanRes = await DiscordOperationsService.createChannel(
      testCommunityId,
      ownerCtx,
      { name: 'ops-welcome', type: 'GUILD_TEXT', topic: 'Operations Welcome Channel', confirmed: true }
    );
    assert.ok(newChanRes.success);
    assert.ok(newChanRes.channel.id);
    assert.equal(newChanRes.channel.name, 'ops-welcome');

    const diag = await DiscordOperationsService.getChannelPermissionDiagnostics(testCommunityId, newChanRes.channel.id, ownerCtx);
    assert.equal(diag.channelId, newChanRes.channel.id);
    assert.ok(diag.canView);
    assert.ok(diag.humanReadableMessage);
  });

  await runTest('4. Bounded Bulk Member Role Operations & Idempotency', async () => {
    const roleRes = await DiscordOperationsService.createRole(
      testCommunityId,
      ownerCtx,
      { name: 'Bulk Test Role', color: '#e74c3c', confirmed: true }
    );

    const bulkRes = await DiscordOperationsService.bulkMemberRoleOperation(
      testCommunityId,
      ownerCtx,
      {
        action: 'ASSIGN',
        roleId: roleRes.role.id,
        targetMemberIds: ['mbr_bulk_1', 'mbr_bulk_2', 'mbr_bulk_3'],
        confirmed: true,
      }
    );

    assert.ok(bulkRes.success);
    assert.equal(bulkRes.result?.action, 'ASSIGN');
    assert.equal(bulkRes.result?.totalTargeted, 3);
    assert.equal(bulkRes.result?.succeededCount, 3);
    assert.equal(bulkRes.result?.failedCount, 0);
  });

  await runTest('5. Deterministic Server Hygiene Analyzer & One-Click Repairs', async () => {
    const hygieneReport = await DiscordHygieneService.analyzeHygiene(testCommunityId);
    assert.equal(hygieneReport.communityId, testCommunityId);
    assert.ok(Array.isArray(hygieneReport.findings));
    assert.ok(['HEALTHY', 'ACTION_REQUIRED', 'DEGRADED'].includes(hygieneReport.overallHealth));

    const fixableFinding = hygieneReport.findings.find((f) => f.actionAvailability === 'ONE_CLICK_FIX');
    if (fixableFinding) {
      const fixResult = await DiscordHygieneService.applyHygieneFix(testCommunityId, ownerCtx, fixableFinding.findingId, true);
      assert.ok(fixResult.success);
      assert.ok(fixResult.message);
    }
  });

  await runTest('6. Operational Setup Blueprint Generator', async () => {
    const blueprint = await DiscordOperationsService.generateBlueprint(testCommunityId, ownerCtx);
    assert.equal(blueprint.communityId, testCommunityId);
    assert.ok(blueprint.modules.length > 0);
    assert.ok(typeof blueprint.overallCompletionPercentage === 'number');
  });

  await runTest('7. Action Registry Integration for AI Copilot', async () => {
    const registeredActions = ActionRegistryService.listActions();
    const task95Action = registeredActions.find((a) => a.actionId === 'APPLY_HYGIENE_FIX');
    assert.ok(task95Action, 'APPLY_HYGIENE_FIX action must be registered in ActionRegistryService');
    assert.equal(task95Action.requiredPermission, 'community.manage');
  });

  await runTest('8. Multi-Tenant Authorization & Role Hierarchy Protection', async () => {
    const otherCommId = `comm_other_${Date.now()}`;
    await assert.rejects(
      async () => {
        await DiscordOperationsService.inspectServer(otherCommId, ownerCtx);
      },
      (err: any) => err.message.includes('Access denied') || err.message.includes('Forbidden')
    );

    await assert.rejects(
      async () => {
        await DiscordOperationsService.createRole(testCommunityId, recruiterCtx, { name: 'Unauthorized Role' });
      },
      (err: any) => err.message.includes('Forbidden') || err.message.includes('community.manage')
    );
  });

  return { passed, failed };
}
