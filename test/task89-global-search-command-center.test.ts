import assert from 'node:assert/strict';
import { globalSearchService } from '../server/services/search.service.js';
import {
  discordMembersRepository,
  applicationsRepository,
  recruitersRepository,
  recruiterCodesRepository,
  announcementsRepository,
  messageTemplatesRepository,
  campaignsRepository,
  pollsRepository,
  remindersRepository,
  eventsRepository,
  schedulesRepository,
  automationWorkflowsRepository,
  moderationWarningsRepository,
  safetyIncidentsRepository,
  moderationRestrictionsRepository,
  blacklistEntriesRepository,
  platformServersRepository,
  platformUsersRepository,
  incidentsRepository,
  auditLogsRepository,
} from '../server/repositories/index.js';
import { UserAuthContext } from '../shared/types/rbac.js';
import { searchController } from '../server/controllers/search.controller.js';

export async function runTask89Tests() {
  console.log('\n--- Running Task 89: Global Search & Universal Command Center Tests ---');
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
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

  const COMM_ALPHA = 'comm_search_alpha_89';
  const COMM_BETA = 'comm_search_beta_89';

  // Seed test data for multi-tenant isolation testing
  await discordMembersRepository.create({
    id: 'mem_alpha_01',
    communityId: COMM_ALPHA,
    discordGuildId: 'guild_alpha',
    discordUserId: 'discord_usr_alice',
    usernameSnapshot: 'alice_in_alpha',
    displayNameSnapshot: 'Alice Alpha',
    discordRoleIds: ['Recruiter', 'Veteran'],
    syncedAt: new Date().toISOString(),
    source: 'DISCORD_SYNC',
    membershipStatus: 'ACTIVE',
    syncState: 'SYNCED',
    joinedAt: new Date().toISOString(),
  });

  await discordMembersRepository.create({
    id: 'mem_beta_01',
    communityId: COMM_BETA,
    discordGuildId: 'guild_beta',
    discordUserId: 'discord_usr_bob',
    usernameSnapshot: 'bob_in_beta',
    displayNameSnapshot: 'Bob Beta',
    discordRoleIds: ['Moderator'],
    syncedAt: new Date().toISOString(),
    source: 'DISCORD_SYNC',
    membershipStatus: 'ACTIVE',
    syncState: 'SYNCED',
    joinedAt: new Date().toISOString(),
  });

  await applicationsRepository.create({
    id: 'app_alpha_01',
    communityId: COMM_ALPHA,
    applicantUserId: 'usr_charlie_01',
    applicantDiscordUserId: 'discord_charlie_01',
    applicantDiscordId: 'discord_charlie_01',
    applicantUsernameSnapshot: 'Candidate Charlie Alpha',
    applicantUsername: 'Candidate Charlie Alpha',
    status: 'SUBMITTED',
    answers: {},
    submittedAt: new Date().toISOString(),
    recruiterCodeUsed: 'ALPHA_REF',
  });

  await applicationsRepository.create({
    id: 'app_beta_01',
    communityId: COMM_BETA,
    applicantUserId: 'usr_david_02',
    applicantDiscordUserId: 'discord_david_02',
    applicantDiscordId: 'discord_david_02',
    applicantUsernameSnapshot: 'Candidate David Beta',
    applicantUsername: 'Candidate David Beta',
    status: 'APPROVED',
    answers: {},
    submittedAt: new Date().toISOString(),
    recruiterCodeUsed: 'BETA_REF',
  });

  await announcementsRepository.create({
    id: 'ann_alpha_01',
    communityId: COMM_ALPHA,
    title: 'Alpha Tournament Announcement',
    content: 'Registration is now live for all guild champions!',
    status: 'SENT',
    channelId: 'announcements-channel',
    createdBy: 'usr_admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await eventsRepository.create({
    id: 'evt_alpha_01',
    communityId: COMM_ALPHA,
    title: 'Alpha Community Game Night',
    description: 'Join voice channel 1 for guild matches',
    status: 'SCHEDULED',
    startAt: new Date().toISOString(),
    endAt: new Date().toISOString(),
    timezone: 'UTC',
    organizer: 'Guild Leader',
    registrationEnabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await moderationWarningsRepository.create({
    id: 'wrn_alpha_01',
    communityId: COMM_ALPHA,
    discordUserId: 'discord_usr_troublemaker',
    reason: 'Spamming excessive emote links in general chat',
    severity: 'MEDIUM',
    status: 'ACTIVE',
    moderatorId: 'usr_mod_alpha',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await platformServersRepository.create({
    id: 'psrv_test_89',
    name: 'Platform Server Aurora',
    guildId: '987654321098765432',
    ownerUserId: 'usr_owner_aurora',
    ownerDiscordTag: 'AuroraOwner#0001',
    status: 'ACTIVE',
    botStatus: 'CONNECTED',
    configurationStatus: 'CONFIGURED',
    applicationCount: 12,
    recruiterCount: 3,
    memberCount: 520,
    installedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  });

  await platformUsersRepository.create({
    id: 'pusr_test_89',
    username: 'superadmin_valkyrie',
    discordId: '554433221100998877',
    globalRole: 'PLATFORM_OWNER',
    firstSeenAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    communitiesUsed: [COMM_ALPHA],
    applicationCount: 0,
    isRecruiter: false,
    status: 'ACTIVE',
  });

  await incidentsRepository.create({
    id: 'inc_test_89',
    category: 'DISCORD_UNAVAILABLE',
    severity: 'MEDIUM',
    status: 'OPEN',
    correlationId: 'corr_inc_test_89',
    dependency: 'DISCORD_API',
    summary: 'Discord Webhook Delivery Latency Spike',
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    occurrenceCount: 1,
  });

  // TEST SUITE

  await test('1. Multi-Tenant Isolation: Community A search never leaks Community B records', async () => {
    const ownerAuth: UserAuthContext = {
      userId: 'usr_owner_alpha',
      role: 'OWNER',
      communityId: COMM_ALPHA,
    };

    const res = await globalSearchService.searchCommunity(ownerAuth, COMM_ALPHA, {
      query: 'Alpha',
    });

    assert.ok(res.success, 'Search query should succeed');
    assert.ok(res.results.length > 0, 'Should find Alpha resources');
    
    // Ensure no Beta resources leaked
    const hasBetaLeaked = res.results.some(
      (it) => it.title.includes('Beta') || it.subtitle?.includes('Beta') || it.resourceId === 'app_beta_01'
    );
    assert.strictEqual(hasBetaLeaked, false, 'No Beta tenant resources should leak to Alpha search');
  });

  await test('2. Cross-Tenant Query Prevention: Cannot search across unassigned community', async () => {
    const intruderAuth: UserAuthContext = {
      userId: 'usr_member_intruder',
      role: 'MEMBER',
      communityId: COMM_ALPHA,
    };

    await assert.rejects(
      async () => {
        await globalSearchService.searchCommunity(intruderAuth, COMM_BETA, {
          query: 'Bob',
        });
      },
      /Cross-tenant query violation/i,
      'Cross-tenant queries must throw a forbidden violation'
    );
  });

  await test('3. Role-Based Authorization: MEMBER role cannot view private moderation warnings or applicants', async () => {
    const memberAuth: UserAuthContext = {
      userId: 'usr_regular_member',
      role: 'MEMBER',
      communityId: COMM_ALPHA,
    };

    const res = await globalSearchService.searchCommunity(memberAuth, COMM_ALPHA, {
      query: 'Spamming',
    });

    // MEMBER does not have moderation/users view permissions, so warnings shouldn't appear
    const foundWarning = res.results.some((it) => it.type === 'warning');
    assert.strictEqual(foundWarning, false, 'Regular member must not receive moderation warnings');
  });

  await test('4. Role-Based Authorization: OWNER role receives authorized warnings and applications', async () => {
    const ownerAuth: UserAuthContext = {
      userId: 'usr_owner_alpha',
      role: 'OWNER',
      communityId: COMM_ALPHA,
    };

    const res = await globalSearchService.searchCommunity(ownerAuth, COMM_ALPHA, {
      query: 'Spamming',
    });

    const foundWarning = res.results.some((it) => it.type === 'warning');
    assert.strictEqual(foundWarning, true, 'Community OWNER must receive matched moderation warnings');
  });

  await test('5. Platform Owner Global Search: Only PLATFORM_OWNER can search platform entities', async () => {
    const normalUserAuth: UserAuthContext = {
      userId: 'usr_normal_owner',
      role: 'OWNER',
      communityId: COMM_ALPHA,
    };

    await assert.rejects(
      async () => {
        await globalSearchService.searchPlatform(normalUserAuth, { query: 'Aurora' });
      },
      /Unauthorized.*Platform Owners/i,
      'Non-platform owners cannot query platform search'
    );

    const platformOwnerAuth: UserAuthContext = {
      userId: 'usr_plat_owner',
      role: 'PLATFORM_OWNER',
      isPlatformOwner: true,
    };

    const res = await globalSearchService.searchPlatform(platformOwnerAuth, {
      query: 'Aurora',
    });

    assert.ok(res.success, 'Platform search should succeed for Platform Owner');
    const foundServer = res.results.some((it) => it.title.includes('Aurora'));
    assert.strictEqual(foundServer, true, 'Platform Owner should find platform servers');
  });

  await test('6. Deterministic Match Scoring & Ranking: Exact match ranks higher than prefix/substring', async () => {
    const ownerAuth: UserAuthContext = {
      userId: 'usr_owner_alpha',
      role: 'OWNER',
      communityId: COMM_ALPHA,
    };

    const res = await globalSearchService.searchCommunity(ownerAuth, COMM_ALPHA, {
      query: 'Alice Alpha',
    });

    assert.ok(res.results.length > 0, 'Should find results');
    assert.strictEqual(res.results[0].title.includes('Alice Alpha'), true, 'Exact match must rank top');
    assert.ok(res.results[0].score >= 80, 'Match score for exact/prefix must be >= 80');
  });

  await test('7. Navigation and Safe Commands Search: Top results return safe navigation and actions', async () => {
    const ownerAuth: UserAuthContext = {
      userId: 'usr_owner_alpha',
      role: 'OWNER',
      communityId: COMM_ALPHA,
    };

    const res = await globalSearchService.searchCommunity(ownerAuth, COMM_ALPHA, {
      query: 'announcement',
    });

    const navOrCmd = res.results.filter((it) => it.type === 'navigation' || it.type === 'command');
    assert.ok(navOrCmd.length > 0, 'Should include matched navigation routes and commands');
  });

  await test('8. Sensitive Data Protection: Credentials and tokens are strictly excluded from search', async () => {
    const ownerAuth: UserAuthContext = {
      userId: 'usr_owner_alpha',
      role: 'OWNER',
      communityId: COMM_ALPHA,
    };

    const res = await globalSearchService.searchCommunity(ownerAuth, COMM_ALPHA, {
      query: 'token',
    });

    // Check all returned items and metadata for accidental leaks of secrets
    for (const item of res.results) {
      const serialized = JSON.stringify(item).toLowerCase();
      assert.strictEqual(serialized.includes('bot_token_secret'), false);
      assert.strictEqual(serialized.includes('client_secret_xyz'), false);
      assert.strictEqual(serialized.includes('password'), false);
    }
  });

  await test('9. Search Controller API: End-to-end GET /api/v1/search endpoint execution', async () => {
    const mockReq: any = {
      query: { q: 'Tournament', communityId: COMM_ALPHA },
      header: (name: string) => {
        if (name === 'x-community-id') return COMM_ALPHA;
        if (name === 'x-role') return 'OWNER';
        return undefined;
      },
    };

    let responseData: any = null;
    const mockRes: any = {
      json: (data: any) => {
        responseData = data;
      },
    };

    await searchController.search(mockReq, mockRes, (err) => {
      if (err) throw err;
    });

    assert.ok(responseData, 'Controller should return JSON response');
    assert.strictEqual(responseData.success, true);
    assert.ok(responseData.results.some((it: any) => it.title.includes('Tournament')));
  });

  await test('10. Command Execution Audit: Triggering command records audit log entry', async () => {
    const mockReq: any = {
      body: {
        commandId: 'cmd-create-announcement',
        actionId: 'create-announcement',
        communityId: COMM_ALPHA,
      },
      header: (name: string) => {
        if (name === 'x-community-id') return COMM_ALPHA;
        if (name === 'x-role') return 'OWNER';
        if (name === 'x-user-id') return 'usr_owner_alpha';
        return undefined;
      },
    };

    let responseData: any = null;
    const mockRes: any = {
      json: (data: any) => {
        responseData = data;
      },
    };

    await searchController.executeCommand(mockReq, mockRes, (err) => {
      if (err) throw err;
    });

    assert.ok(responseData?.success, 'Command execution should succeed');

    const logs = await auditLogsRepository.listForTenant(COMM_ALPHA);
    const cmdLog = logs.find((l) => l.action === 'COMMAND_EXECUTED' && l.targetId === 'cmd-create-announcement');
    assert.ok(cmdLog, 'Audit log entry should be recorded for command execution');
  });

  console.log(`Task 89 Tests finished: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}
