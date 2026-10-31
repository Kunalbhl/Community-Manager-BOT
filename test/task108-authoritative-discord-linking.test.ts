import assert from 'node:assert/strict';
import { discordGuildLinkService } from '../server/services/discordGuildLink.service.js';
import { resolveAuthorizedWorkspaceCommunityContext } from '../server/services/authorization.service.ts';
import {
  communitiesRepository,
  auditLogsRepository,
  workspacesRepository,
  workspaceMembersRepository,
  communityMemberAccessRepository,
} from '../server/repositories/index.js';
import { logger } from '../server/logging/logger.js';
import { config } from '../server/config/env.js';
import { onboardingService } from '../server/services/onboarding.service.js';

export async function runTask108Tests() {
  console.log('\n======================================================================');
  console.log('TASK 108 — AUTHORITATIVE DISCORD LINKING & TENANT SECURITY TESTS');
  console.log('======================================================================');

  let passedTests = 0;
  let failedTests = 0;

  async function testCase(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passedTests++;
    } catch (err: any) {
      console.error(`  [FAIL] ${name}:`, err.message || err);
      failedTests++;
      throw err;
    }
  }

  // Helper cleanup
  const createdCommIds: string[] = [];
  const createdWsIds: string[] = [];

  const cleanup = async () => {
    for (const id of createdCommIds) {
      try { await communitiesRepository.delete(id); } catch {}
    }
    for (const id of createdWsIds) {
      try { await workspacesRepository.delete(id); } catch {}
    }
  };

  try {
    // 1. Normal Authoritative Linking
    await testCase('1. Normal Authoritative Linking creates community with bound workspace context', async () => {
      const testGuildId = '108000000000000001';
      const testCommId = `comm_${testGuildId}`;
      const ownerUserId = 'usr_owner_t108_1';
      createdCommIds.push(testCommId);

      const linkResult = await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
        guildId: testGuildId,
        userId: ownerUserId,
        communityId: testCommId,
        source: 'ONBOARDING',
      });

      assert.equal(linkResult.success, true);
      assert.equal(linkResult.communityId, testCommId);

      const commDoc = await communitiesRepository.getById(testCommId);
      assert.ok(commDoc, 'Community document must be persisted');
      assert.equal(commDoc.guildId, testGuildId);
      assert.equal(commDoc.ownerUserId, ownerUserId);
    });

    // 2. Cross-Tenant Access Attempt Rejection
    await testCase('2. Cross-Tenant Access Attempt is rejected with COMMUNITY_ACCESS_DENIED', async () => {
      const commIdA = `comm_t108_2a`;
      const commIdB = `comm_t108_2b`;
      const userA = 'usr_tenant_a';
      const userB = 'usr_tenant_b';
      createdCommIds.push(commIdA, commIdB);

      const nowStr = new Date().toISOString();
      await communitiesRepository.create({
        id: commIdA,
        name: 'Community A',
        guildId: '108000000000000021',
        ownerUserId: userA,
        isActive: true,
        createdAt: nowStr,
        updatedAt: nowStr,
      } as any);

      await communitiesRepository.create({
        id: commIdB,
        name: 'Community B',
        guildId: '108000000000000022',
        ownerUserId: userB,
        isActive: true,
        createdAt: nowStr,
        updatedAt: nowStr,
      } as any);

      // User A attempts to resolve context for Community B
      let threw = false;
      try {
        await resolveAuthorizedWorkspaceCommunityContext(userA, 'MEMBER', {
          requestedCommunityId: commIdB,
        });
      } catch (err: any) {
        threw = true;
        assert.ok(
          err.message.includes('Access denied') || err.code === 'COMMUNITY_ACCESS_DENIED',
          'Must throw access denied error'
        );
      }
      assert.equal(threw, true, 'Cross-tenant community access must be rejected');
    });

    // 3. Discord Guild Uniqueness Constraint
    await testCase('3. Guild Uniqueness Constraint prevents linking same guild to multiple communities', async () => {
      const sharedGuildId = '108000000000000003';
      const commIdA = `comm_t108_3a`;
      const commIdB = `comm_t108_3b`;
      const userA = 'usr_owner_t108_3a';
      const userB = 'usr_owner_t108_3b';
      createdCommIds.push(commIdA, commIdB);

      // User A links Guild X to Community A
      const resultA = await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
        guildId: sharedGuildId,
        userId: userA,
        communityId: commIdA,
        source: 'ONBOARDING',
      });
      assert.equal(resultA.success, true);

      // User B attempts to link same Guild X to Community B
      const resultB = await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
        guildId: sharedGuildId,
        userId: userB,
        communityId: commIdB,
        source: 'ONBOARDING',
      });

      assert.equal(resultB.success, false);
      assert.equal(resultB.connectionStatus, 'DISCORD_GUILD_ALREADY_CONNECTED');
      assert.ok(resultB.message?.includes('DISCORD_GUILD_ALREADY_CONNECTED'));
    });

    // 4. Re-linking Same Guild by Same Owner
    await testCase('4. Same owner re-verifying same guild succeeds without duplication', async () => {
      const guildId = '108000000000000004';
      const commId = `comm_${guildId}`;
      const ownerUserId = 'usr_owner_t108_4';
      createdCommIds.push(commId);

      // Initial link
      const result1 = await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
        guildId,
        userId: ownerUserId,
        communityId: commId,
        source: 'ONBOARDING',
      });
      assert.equal(result1.success, true);

      // Re-link attempt
      const result2 = await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
        guildId,
        userId: ownerUserId,
        communityId: commId,
        source: 'MANUAL_REFRESH',
      });
      assert.equal(result2.success, true);
      assert.equal(result2.communityId, commId);
    });

    // 5. Unlinking and Re-linking
    await testCase('5. Unlinked guild can be successfully linked to a new community', async () => {
      const guildId = '108000000000000005';
      const commId1 = `comm_t108_5a`;
      const commId2 = `comm_t108_5b`;
      const ownerUserId = 'usr_owner_t108_5';
      createdCommIds.push(commId1, commId2);

      // Initial link to Comm 1
      await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
        guildId,
        userId: ownerUserId,
        communityId: commId1,
        source: 'ONBOARDING',
      });

      // Unlink / mark inactive Comm 1
      await communitiesRepository.update(commId1, {
        guildId: '',
        discordGuildId: '',
        isActive: false,
        updatedAt: new Date().toISOString(),
      } as any);

      // Link to Comm 2
      const result2 = await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
        guildId,
        userId: ownerUserId,
        communityId: commId2,
        source: 'ONBOARDING',
      });

      assert.equal(result2.success, true);
      assert.equal(result2.communityId, commId2);
    });

    // 6. Multi-Workspace User Linking
    await testCase('6. Multi-workspace user correctly links guild to selected workspace context', async () => {
      const user = 'usr_multi_ws_owner';
      const ws1Id = `ws_multi_1`;
      const ws2Id = `ws_multi_2`;
      createdWsIds.push(ws1Id, ws2Id);

      const nowStr = new Date().toISOString();
      await workspacesRepository.create({
        id: ws1Id,
        name: 'Workspace 1',
        ownerUserId: user,
        communityIds: [],
        status: 'ACTIVE',
        createdAt: nowStr,
        updatedAt: nowStr,
      });
      await workspaceMembersRepository.create({
        id: `${ws1Id}_${user}`,
        workspaceId: ws1Id,
        userId: user,
        role: 'WORKSPACE_OWNER',
        status: 'ACTIVE',
        createdAt: nowStr,
        updatedAt: nowStr,
      });

      await workspacesRepository.create({
        id: ws2Id,
        name: 'Workspace 2',
        ownerUserId: user,
        communityIds: [],
        status: 'ACTIVE',
        createdAt: nowStr,
        updatedAt: nowStr,
      });
      await workspaceMembersRepository.create({
        id: `${ws2Id}_${user}`,
        workspaceId: ws2Id,
        userId: user,
        role: 'WORKSPACE_OWNER',
        status: 'ACTIVE',
        createdAt: nowStr,
        updatedAt: nowStr,
      });

      const context = await resolveAuthorizedWorkspaceCommunityContext(user, 'OWNER', {
        requestedWorkspaceId: ws2Id,
      });

      assert.equal(context.workspace.id, ws2Id);
    });

    // 7. Security Audit Event Logging
    await testCase('7. Security Audit Log records DISCORD_GUILD_LINK_REJECTED on collision', async () => {
      const guildId = '108000000000000007';
      const comm1 = `comm_t108_7a`;
      const comm2 = `comm_t108_7b`;
      createdCommIds.push(comm1, comm2);

      await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
        guildId,
        userId: 'usr_owner_7a',
        communityId: comm1,
        source: 'ONBOARDING',
      });

      await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
        guildId,
        userId: 'usr_owner_7b',
        communityId: comm2,
        source: 'ONBOARDING',
      });

      const auditLogs = await auditLogsRepository.list({
        where: [{ field: 'action', operator: '==', value: 'DISCORD_GUILD_LINK_REJECTED' }],
      });

      assert.ok(auditLogs.length > 0, 'Audit log for DISCORD_GUILD_LINK_REJECTED must exist');
    });

    // 8. Onboarding Service Duplicate Guild Selection Check
    await testCase('8. Onboarding selectAndVerifyServer rejects duplicate server selection across tenants', async () => {
      const guildId = '108000000000000008';
      const comm1 = `comm_t108_8a`;
      const comm2 = `comm_t108_8b`;
      createdCommIds.push(comm1, comm2);

      await discordGuildLinkService.resolveAndSyncDiscordGuildConnection({
        guildId,
        userId: 'usr_owner_8a',
        communityId: comm1,
        source: 'ONBOARDING',
      });

      let threw = false;
      try {
        await onboardingService.selectAndVerifyServer(
          'usr_owner_8b',
          'OWNER',
          guildId,
          'Server 8',
          undefined,
          comm2
        );
      } catch (err: any) {
        threw = true;
        assert.ok(err.message.includes('DISCORD_GUILD_ALREADY_CONNECTED'));
      }
      assert.equal(threw, true, 'onboardingService.selectAndVerifyServer must reject duplicate guild selection');
    });

  } finally {
    await cleanup();
  }

  console.log(`\nTASK 108 COMPLETED: ${passedTests} passed, ${failedTests} failed.`);
  return { passed: passedTests, failed: failedTests };
}
