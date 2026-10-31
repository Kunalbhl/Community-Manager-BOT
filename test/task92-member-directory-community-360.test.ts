import assert from 'node:assert/strict';
import { communityMember360Service } from '../server/services/communityMember360.service.js';
import {
  discordMembersRepository,
  communitiesRepository,
  applicationsRepository,
  memberHandoffsRepository,
  memberOnboardingChecklistsRepository,
  earlyEngagementEventsRepository,
  moderationWarningsRepository,
  moderationRestrictionsRepository,
  blacklistEntriesRepository,
  eventRegistrationsRepository,
  eventsRepository,
  rolesRepository,
  auditLogsRepository,
} from '../server/repositories/index.js';
import { UserAuthContext } from '../shared/types/rbac.js';

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

export async function runTask92Tests() {
  console.log('\n--- Running Task 92: Member Directory & Community 360 Engine Tests ---');

  const commIdA = 'comm_task92_alpha';
  const commIdB = 'comm_task92_beta';
  const testGuildA = 'guild_task92_alpha';
  const testGuildB = 'guild_task92_beta';

  const ownerUser: UserAuthContext = {
    userId: 'usr_owner_92',
    role: 'OWNER',
    communityId: commIdA,
    discordUserId: 'discord_owner_92',
  };

  const adminUser: UserAuthContext = {
    userId: 'usr_admin_92',
    role: 'CONTROLLER' as any,
    communityId: commIdA,
    discordUserId: 'discord_admin_92',
  };

  const modUser: UserAuthContext = {
    userId: 'usr_mod_92',
    role: 'CONTROLLER' as any,
    communityId: commIdA,
    discordUserId: 'discord_mod_92',
  };

  const recruiterUser: UserAuthContext = {
    userId: 'usr_recruiter_92',
    role: 'RECRUITER',
    communityId: commIdA,
    discordUserId: 'discord_recruiter_92',
  };

  const regularMemberUser: UserAuthContext = {
    userId: 'usr_member_92',
    role: 'MEMBER',
    communityId: commIdA,
    discordUserId: 'discord_member_92_regular',
  };

  // Setup initial communities and members
  await runTest('Setup seed communities and roles for testing', async () => {
    await communitiesRepository.upsert({
      id: commIdA,
      name: 'Alpha Gaming Clan',
      slug: 'alpha-clan',
      ownerUserId: ownerUser.userId,
      guildId: testGuildA,
      discordGuildId: testGuildA,
      status: 'ACTIVE',
      plan: 'SCALE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    await communitiesRepository.upsert({
      id: commIdB,
      name: 'Beta Esports',
      slug: 'beta-esports',
      ownerUserId: 'usr_other',
      guildId: testGuildB,
      discordGuildId: testGuildB,
      status: 'ACTIVE',
      plan: 'FREE',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    // Setup stored roles in commIdA
    await rolesRepository.upsert({
      id: 'role_moderator_92',
      communityId: commIdA,
      discordRoleId: 'role_mod_id_1',
      name: 'Moderator',
      color: '#3b82f6',
      position: 10,
      isSystemRole: false,
      createdAt: new Date().toISOString(),
    } as any);

    await rolesRepository.upsert({
      id: 'role_vip_92',
      communityId: commIdA,
      discordRoleId: 'role_vip_id_2',
      name: 'VIP Member',
      color: '#eab308',
      position: 5,
      isSystemRole: false,
      createdAt: new Date().toISOString(),
    } as any);

    await rolesRepository.upsert({
      id: 'role_bot_managed_92',
      communityId: commIdA,
      discordRoleId: 'role_bot_id_3',
      name: 'Bot Integration',
      color: '#6b7280',
      position: 20,
      isSystemRole: true,
      createdAt: new Date().toISOString(),
    } as any);
  });

  // Seed members in commIdA
  const memberAliceId = '111111111111111111';
  const memberBobId = '222222222222222222';
  const memberCharlieId = '333333333333333333';
  const memberBetaUser = '999999999999999999';

  await runTest('Seed member records with rich multi-engine lineage', async () => {
    // Member Alice: Recruited, Active, Has Warnings, Registered for Event
    await discordMembersRepository.upsert({
      id: `${commIdA}_${memberAliceId}`,
      communityId: commIdA,
      discordGuildId: testGuildA,
      discordUserId: memberAliceId,
      usernameSnapshot: 'alice_gamer',
      displayNameSnapshot: 'Alice Valkyrie',
      discordRoleIds: ['role_vip_id_2'],
      joinedAt: new Date(Date.now() - 15 * 86400000).toISOString(), // 15 days ago
      syncedAt: new Date().toISOString(),
      source: 'DISCORD_SYNC',
      recruiterCode: 'ALPHAVIP',
      membershipStatus: 'ACTIVE',
      syncState: 'SYNCED',
    });

    // Member Bob: Organic, Left Guild
    await discordMembersRepository.upsert({
      id: `${commIdA}_${memberBobId}`,
      communityId: commIdA,
      discordGuildId: testGuildA,
      discordUserId: memberBobId,
      usernameSnapshot: 'bob_builder',
      displayNameSnapshot: 'Bob The Builder',
      discordRoleIds: [],
      joinedAt: new Date(Date.now() - 45 * 86400000).toISOString(),
      syncedAt: new Date().toISOString(),
      source: 'DISCORD_SYNC',
      membershipStatus: 'LEFT',
      syncState: 'SYNCED',
    });

    // Member Charlie: Just joined today
    await discordMembersRepository.upsert({
      id: `${commIdA}_${memberCharlieId}`,
      communityId: commIdA,
      discordGuildId: testGuildA,
      discordUserId: memberCharlieId,
      usernameSnapshot: 'charlie_newbie',
      displayNameSnapshot: 'Charlie Recruit',
      discordRoleIds: ['role_mod_id_1'],
      joinedAt: new Date().toISOString(),
      syncedAt: new Date().toISOString(),
      source: 'DISCORD_SYNC',
      membershipStatus: 'ACTIVE',
      syncState: 'SYNCED',
    });

    // Member in Community B (Tenant Isolation Test)
    await discordMembersRepository.upsert({
      id: `${commIdB}_${memberBetaUser}`,
      communityId: commIdB,
      discordGuildId: testGuildB,
      discordUserId: memberBetaUser,
      usernameSnapshot: 'beta_secret_user',
      displayNameSnapshot: 'Beta Spy',
      discordRoleIds: [],
      joinedAt: new Date().toISOString(),
      syncedAt: new Date().toISOString(),
      source: 'DISCORD_SYNC',
      membershipStatus: 'ACTIVE',
      syncState: 'SYNCED',
    });

    // Link application & handoff for Alice
    await applicationsRepository.upsert({
      id: `app_${commIdA}_${memberAliceId}`,
      communityId: commIdA,
      applicantDiscordUserId: memberAliceId,
      applicantUsername: 'alice_gamer',
      status: 'APPROVED',
      recruiterCode: 'ALPHAVIP',
      recruiterName: 'Recruiter Bob',
      source: 'WEBSITE_FORM',
      submittedAt: new Date(Date.now() - 16 * 86400000).toISOString(),
      approvedAt: new Date(Date.now() - 15 * 86400000).toISOString(),
      createdAt: new Date(Date.now() - 16 * 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    await memberHandoffsRepository.upsert({
      id: `handoff_${commIdA}_${memberAliceId}`,
      communityId: commIdA,
      discordUserId: memberAliceId,
      applicationId: `app_${commIdA}_${memberAliceId}`,
      status: 'COMPLETED',
      memberActivatedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
      createdAt: new Date().toISOString(),
    } as any);

    // Early engagement for Alice
    await earlyEngagementEventsRepository.upsert({
      id: `eng_1_${memberAliceId}`,
      communityId: commIdA,
      discordUserId: memberAliceId,
      eventType: 'FIRST_MESSAGE_SENT',
      timestamp: new Date(Date.now() - 14 * 86400000).toISOString(),
    } as any);

    await earlyEngagementEventsRepository.upsert({
      id: `eng_2_${memberAliceId}`,
      communityId: commIdA,
      discordUserId: memberAliceId,
      eventType: 'VOICE_CHANNEL_JOINED',
      timestamp: new Date(Date.now() - 10 * 86400000).toISOString(),
    } as any);

    // Warning for Alice
    await moderationWarningsRepository.upsert({
      id: `warn_alice_1`,
      communityId: commIdA,
      targetDiscordUserId: memberAliceId,
      reason: 'Spam in general channel',
      severity: 'LOW',
      status: 'ACTIVE',
      issuerRole: 'MODERATOR',
      createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    } as any);

    // Event Registration for Alice
    await eventsRepository.upsert({
      id: 'evt_tournament_92',
      communityId: commIdA,
      title: 'Grand Summer Tournament',
      status: 'COMPLETED',
      createdAt: new Date().toISOString(),
    } as any);

    await eventRegistrationsRepository.upsert({
      id: `reg_alice_evt_1`,
      communityId: commIdA,
      eventId: 'evt_tournament_92',
      discordUserId: memberAliceId,
      attendanceStatus: 'ATTENDED',
      registeredAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    } as any);
  });

  // Test 1: Paged Member Directory Listing
  await runTest('Member Directory returns server-side paginated list with sync overview', async () => {
    const res = await communityMember360Service.listMembers(commIdA, { page: 1, limit: 10 }, ownerUser);
    assert.equal(res.total >= 3, true);
    assert.equal(res.items.length >= 3, true);
    assert.equal(res.page, 1);
    assert.equal(res.syncOverview.totalMembers >= 3, true);
    assert.equal(res.syncOverview.activeMembers >= 2, true);
    assert.equal(res.syncOverview.linkedRecruits >= 1, true);

    const aliceItem = res.items.find((i) => i.discordUserId === memberAliceId);
    assert.ok(aliceItem);
    assert.equal(aliceItem?.displayNameSnapshot, 'Alice Valkyrie');
    assert.equal(aliceItem?.hasActiveWarnings, true);
    assert.equal(aliceItem?.recruiterCode, 'ALPHAVIP');
    assert.equal(aliceItem?.recruitmentStatus, 'RECRUITED');
  });

  // Test 2: Search Query Filtering
  await runTest('Member Directory filters by search term across display names and codes', async () => {
    const resByName = await communityMember360Service.listMembers(commIdA, { q: 'valkyrie' }, ownerUser);
    assert.equal(resByName.items.length, 1);
    assert.equal(resByName.items[0].discordUserId, memberAliceId);

    const resByCode = await communityMember360Service.listMembers(commIdA, { q: 'ALPHAVIP' }, ownerUser);
    assert.equal(resByCode.items.length, 1);
    assert.equal(resByCode.items[0].discordUserId, memberAliceId);

    const resByUserId = await communityMember360Service.listMembers(commIdA, { q: memberBobId.substring(0, 8) }, ownerUser);
    assert.equal(resByUserId.items.length, 1);
    assert.equal(resByUserId.items[0].discordUserId, memberBobId);
  });

  // Test 3: Role & Status Filtering
  await runTest('Member Directory filters by roleId and membership status', async () => {
    const resRole = await communityMember360Service.listMembers(commIdA, { roleId: 'role_mod_id_1' }, ownerUser);
    assert.equal(resRole.items.some((i) => i.discordUserId === memberCharlieId), true);
    assert.equal(resRole.items.every((i) => i.discordRoleIds.includes('role_mod_id_1')), true);

    const resLeft = await communityMember360Service.listMembers(commIdA, { membershipStatus: 'LEFT' }, ownerUser);
    assert.equal(resLeft.items.length, 1);
    assert.equal(resLeft.items[0].discordUserId, memberBobId);
  });

  // Test 4: Member 360 Full Profile Aggregation (Staff View)
  await runTest('Member 360 aggregates authorized Recruitment, Moderation, Events, and Engagement for Staff', async () => {
    const profile = await communityMember360Service.getMember360Profile(commIdA, memberAliceId, adminUser);
    assert.equal(profile.discordUserId, memberAliceId);
    assert.equal(profile.overview.displayName, 'Alice Valkyrie');
    assert.equal(profile.overview.healthSignal, 'ACTIVE');

    // Recruitment Check
    assert.ok(profile.recruitment);
    assert.equal(profile.recruitment?.applicationStatus, 'APPROVED');
    assert.equal(profile.recruitment?.recruiterCode, 'ALPHAVIP');

    // Moderation Check
    assert.ok(profile.moderation);
    assert.equal(profile.moderation?.activeWarningsCount, 1);
    assert.equal(profile.moderation?.warnings[0].reason, 'Spam in general channel');

    // Events Check
    assert.equal(profile.events.totalRegistrations, 1);
    assert.equal(profile.events.totalAttended, 1);
    assert.equal(profile.events.registrations[0].eventTitle, 'Grand Summer Tournament');
    assert.equal(profile.events.registrations[0].attendanceStatus, 'ATTENDED');

    // Unified Timeline Check
    assert.equal(profile.activityTimeline.length >= 4, true);
    const categories = new Set(profile.activityTimeline.map((t) => t.category));
    assert.equal(categories.has('DISCORD'), true);
    assert.equal(categories.has('RECRUITMENT'), true);
    assert.equal(categories.has('ENGAGEMENT'), true);
    assert.equal(categories.has('MODERATION'), true);
    assert.equal(categories.has('EVENTS'), true);
  });

  // Test 5: Retention Intelligence Milestones (Factual & Insufficient Data)
  await runTest('Retention Milestones truthfully calculate based on observation window', async () => {
    // Alice joined 15 days ago -> Day 1 & Day 7 evaluated, Day 30 & 90 must be INSUFFICIENT_DATA
    const profileAlice = await communityMember360Service.getMember360Profile(commIdA, memberAliceId, adminUser);
    assert.equal(profileAlice.retention.day1, true);
    assert.equal(profileAlice.retention.day7, true);
    assert.equal(profileAlice.retention.day30, 'INSUFFICIENT_DATA');
    assert.equal(profileAlice.retention.day90, 'INSUFFICIENT_DATA');

    // Charlie joined today (0 days) -> Day 1, 7, 30, 90 must all be INSUFFICIENT_DATA
    const profileCharlie = await communityMember360Service.getMember360Profile(commIdA, memberCharlieId, adminUser);
    assert.equal(profileCharlie.retention.day1, 'INSUFFICIENT_DATA');
    assert.equal(profileCharlie.retention.day7, 'INSUFFICIENT_DATA');
    assert.equal(profileCharlie.retention.day30, 'INSUFFICIENT_DATA');
    assert.equal(profileCharlie.retention.day90, 'INSUFFICIENT_DATA');
  });

  // Test 6: RBAC Protection on Member 360
  await runTest('Regular Member viewing another member cannot see private moderation or recruitment', async () => {
    const profile = await communityMember360Service.getMember360Profile(commIdA, memberAliceId, regularMemberUser);
    assert.equal(profile.discordUserId, memberAliceId);
    assert.equal(profile.overview.displayName, 'Alice Valkyrie');
    // Moderation must be null/empty
    assert.equal(profile.moderation, null);
    // Recruitment must be null
    assert.equal(profile.recruitment, null);
    // Timeline should not contain moderation records
    const timelineCategories = profile.activityTimeline.map((t) => t.category);
    assert.equal(timelineCategories.includes('MODERATION'), false);
  });

  // Test 7: Multi-Tenant Isolation
  await runTest('Strict multi-tenant isolation prevents accessing members across communities', async () => {
    const userFromCommB: UserAuthContext = {
      userId: 'usr_comm_b',
      role: 'CONTROLLER' as any,
      communityId: commIdB,
    };

    let forbiddenCaught = false;
    try {
      await communityMember360Service.getMember360Profile(commIdA, memberAliceId, userFromCommB);
    } catch (err: any) {
      if (err.statusCode === 403 || err.message?.includes('Cross-tenant')) {
        forbiddenCaught = true;
      }
    }
    assert.equal(forbiddenCaught, true, 'Cross-tenant access must be rejected with 403 Forbidden');
  });

  // Test 8: Discord Role Assignment & Managed Role Protection
  await runTest('Authoritative role assignment updates member doc and blocks managed bot roles', async () => {
    // 1. Assign VIP Role to Charlie
    const resAssign = await communityMember360Service.assignMemberRole(commIdA, memberCharlieId, 'role_vip_id_2', adminUser);
    assert.equal(resAssign.success, true);
    assert.equal(resAssign.roles.includes('role_vip_id_2'), true);

    const charlieDoc = await discordMembersRepository.getById(`${commIdA}_${memberCharlieId}`);
    assert.equal(charlieDoc?.discordRoleIds.includes('role_vip_id_2'), true);

    // Verify Audit log recorded
    const auditLogs = await auditLogsRepository.list({
      where: [
        { field: 'communityId', operator: '==', value: commIdA },
        { field: 'targetId', operator: '==', value: memberCharlieId },
      ],
    });
    assert.equal(auditLogs.some((l) => l.action === 'MEMBER_ROLE_ASSIGNED'), true);

    // 2. Attempt to assign managed system role -> Must fail
    let managedRoleBlocked = false;
    try {
      await communityMember360Service.assignMemberRole(commIdA, memberCharlieId, 'role_bot_id_3', adminUser);
    } catch (err: any) {
      if (err.message?.includes('managed')) {
        managedRoleBlocked = true;
      }
    }
    assert.equal(managedRoleBlocked, true, 'Managed system/bot roles must not be manually assignable');

    // 3. Remove VIP role
    const resRemove = await communityMember360Service.removeMemberRole(commIdA, memberCharlieId, 'role_vip_id_2', adminUser);
    assert.equal(resRemove.success, true);
    assert.equal(resRemove.roles.includes('role_vip_id_2'), false);
  });

  // Test 9: Single Member Sync
  await runTest('Single member sync refreshes member document timestamp and sync state', async () => {
    const syncedMember = await communityMember360Service.syncSingleMember(commIdA, memberAliceId, adminUser);
    assert.equal(syncedMember.discordUserId, memberAliceId);
    assert.equal(syncedMember.syncState, 'SYNCED');
    assert.ok(syncedMember.syncedAt);
  });

  console.log(`\nTask 92 Tests Completed: ${passed} passed, ${failed} failed.\n`);
  return { passed, failed };
}
