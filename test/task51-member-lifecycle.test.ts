import assert from 'node:assert/strict';
import { applicationWorkflowService } from '../server/services/applicationWorkflow.service.js';
import { memberLifecycleService } from '../server/services/memberLifecycle.service.js';
import {
  applicationsRepository,
  communitiesRepository,
  communityGuidelinesRepository,
  eventsRepository,
  memberHandoffsRepository,
  memberOnboardingChecklistsRepository,
  earlyEngagementEventsRepository,
  blacklistEntriesRepository,
} from '../server/repositories/index.js';

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

export async function runTask51Tests() {
  console.log('\n--- TASK 51: RECRUITMENT-TO-MEMBER LIFECYCLE & ONBOARDING HANDOFF TESTS ---');

  const communityId = `comm_lifecycle_${Date.now()}`;
  const recruiterDiscordId = 'recruiter_discord_101';
  const applicantDiscordId = `candidate_${Date.now()}`;

  // Seed community with configured channels
  await communitiesRepository.create({
    id: communityId,
    workspaceId: 'ws_test',
    name: 'Lifecycle Test Community',
    guildId: 'guild_lifecycle_123',
    discordGuildId: 'guild_lifecycle_123',
    ownerUserId: 'owner_user_1',
    isActive: true,
    defaultChannels: {
      recruitmentChannelId: 'chan_recruitment_001',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Seed guidelines for community
  await communityGuidelinesRepository.create({
    communityId,
    title: 'Respect All Members',
    description: 'Treat everyone with kindness and respect.',
    category: 'RULE',
    order: 1,
    enabled: true,
  });

  // Seed event for community
  await eventsRepository.create({
    communityId,
    title: 'Weekly Community Hangout',
    description: 'Come say hi in voice lounge.',
    startAt: new Date(Date.now() + 86400000).toISOString(),
    endAt: new Date(Date.now() + 90000000).toISOString(),
    timezone: 'UTC',
    organizer: 'owner_user_1',
    registrationEnabled: false,
    status: 'SCHEDULED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  let createdAppId = '';

  await runTest('1. Candidate Application and Approval in Pipeline', async () => {
    const app = await applicationsRepository.create({
      communityId,
      applicantUserId: `usr_${applicantDiscordId}`,
      applicantDiscordUserId: applicantDiscordId,
      applicantDiscordId: applicantDiscordId,
      applicantUsername: 'AceCandidate',
      applicantUsernameSnapshot: 'AceCandidate',
      status: 'APPROVED',
      recruiterCode: 'RC-ELITE',
      recruiterDiscordUserId: recruiterDiscordId,
      source: 'RECRUITER_INVITE',
      submittedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    createdAppId = app.id;
    assert.ok(createdAppId, 'Application must be created with ID');
    assert.equal(app.status, 'APPROVED');
  });

  await runTest('2. Real Join Event triggers confirmDiscordJoin and Member Handoff Orchestration', async () => {
    const updatedApp = await applicationWorkflowService.confirmDiscordJoin(communityId, applicantDiscordId);
    assert.ok(updatedApp, 'Application should be returned upon join confirmation');
    assert.equal(updatedApp.status, 'JOINED', 'Application status must transition to JOINED');
    assert.ok(updatedApp.joinConfirmedAt, 'joinConfirmedAt must be stamped');
    assert.ok(updatedApp.handoffId, 'handoffId must be stamped on application');

    // Verify Handoff Document was created
    const handoff = await memberLifecycleService.getHandoffByDiscordUser(communityId, applicantDiscordId);
    assert.ok(handoff, 'MemberHandoffDocument must be created');
    assert.equal(handoff.status, 'ACTIVATED', 'Handoff status must be ACTIVATED');
    assert.equal(handoff.discordUserId, applicantDiscordId);
    assert.equal(handoff.applicationId, createdAppId);
  });

  await runTest('3. Idempotency: Duplicate join confirmation does not duplicate handoff or corrupt state', async () => {
    const secondCallApp = await applicationWorkflowService.confirmDiscordJoin(communityId, applicantDiscordId);
    assert.ok(secondCallApp, 'Second call should return existing application');
    assert.equal(secondCallApp.status, 'JOINED');

    const handoffResult = await memberLifecycleService.executeHandoff({
      communityId,
      applicationId: createdAppId,
      discordUserId: applicantDiscordId,
    });

    assert.ok(handoffResult.handoff, 'Handoff should resolve gracefully');
    assert.equal(handoffResult.handoff.status, 'ACTIVATED');
    assert.equal(handoffResult.alreadyActivated, true);

    // Count handoffs for this tenant to ensure no duplication
    const allHandoffs = await memberHandoffsRepository.listForTenant(communityId);
    const userHandoffs = allHandoffs.filter((h) => h.discordUserId === applicantDiscordId);
    assert.equal(userHandoffs.length, 1, 'Only exactly 1 handoff document should exist for candidate');
  });

  await runTest('4. Checklist Initialization: Respects configured items and schema', async () => {
    const checklist = await memberLifecycleService.initializeChecklist(communityId, applicantDiscordId, createdAppId);
    assert.ok(checklist, 'Checklist should be initialized');
    assert.equal(checklist.communityId, communityId);
    assert.equal(checklist.discordUserId, applicantDiscordId);
    assert.ok(checklist.overallStatus === 'IN_PROGRESS' || checklist.overallStatus === 'NOT_STARTED');
    assert.ok(checklist.items.length >= 4, 'Checklist should have standard items');

    const configuredKeys = checklist.items.filter((i) => i.configured).map((i) => i.key);
    assert.ok(configuredKeys.includes('READ_RULES'), 'Must configure READ_RULES when community rules exist');
    assert.ok(configuredKeys.includes('COMPLETE_PROFILE'), 'Must configure COMPLETE_PROFILE');
    assert.ok(configuredKeys.includes('REVIEW_UPCOMING_EVENTS'), 'Must configure REVIEW_UPCOMING_EVENTS when events exist');
  });

  await runTest('5. Step-by-Step Checklist Completion progressing to COMPLETED', async () => {
    const checklist = await memberOnboardingChecklistsRepository.getById(`checklist_${communityId}_${applicantDiscordId}`);
    assert.ok(checklist);

    // Complete each configured item
    const configuredItems = checklist.items.filter((i) => i.configured && i.status !== 'COMPLETED');
    for (const item of configuredItems) {
      await memberLifecycleService.completeChecklistItem(communityId, applicantDiscordId, item.key);
    }

    const completedChecklist = await memberOnboardingChecklistsRepository.getById(`checklist_${communityId}_${applicantDiscordId}`);
    assert.ok(completedChecklist);
    assert.equal(completedChecklist.overallStatus, 'COMPLETED', 'Checklist overallStatus must be COMPLETED');

    // Verify Handoff Document reflected the onboarding status
    const handoff = await memberLifecycleService.getHandoffByDiscordUser(communityId, applicantDiscordId);
    assert.ok(handoff);
    assert.equal(handoff.onboardingStatus, 'COMPLETED', 'Handoff onboardingStatus must be COMPLETED');
  });

  await runTest('6. Early Engagement Event Tracking & Health Signal Evaluation', async () => {
    // Record first message
    const msgEvent = await memberLifecycleService.recordEarlyEngagement(
      communityId,
      applicantDiscordId,
      'FIRST_COMMUNITY_ACTION',
      { channelId: 'general', action: 'message_sent' }
    );
    assert.ok(msgEvent);
    assert.equal(msgEvent.eventType, 'FIRST_COMMUNITY_ACTION');

    // Record event attended
    await memberLifecycleService.recordEarlyEngagement(
      communityId,
      applicantDiscordId,
      'FIRST_EVENT_PARTICIPATION',
      { eventId: 'event_weekly_meetup' }
    );

    // Record valid engagement
    await memberLifecycleService.recordEarlyEngagement(
      communityId,
      applicantDiscordId,
      'FIRST_VALID_ENGAGEMENT',
      { type: 'discussion_thread' }
    );

    const profile = await memberLifecycleService.getMemberLifecycleProfile(communityId, applicantDiscordId);
    assert.ok(profile, 'Member lifecycle profile should resolve');
    assert.equal(profile.lifecycleStage, 'ACTIVE', 'Member stage should transition to ACTIVE once onboarding is complete');
    assert.equal(profile.healthSignal, 'ONBOARDING_COMPLETE');
    assert.ok(profile.engagements.length >= 3, 'Should list at least 3 engagement events');
    assert.ok(profile.recruitmentContext, 'Should include authorized recruitment context');
    assert.equal(profile.recruitmentContext.recruiterCode, 'RC-ELITE');
  });

  await runTest('7. Blacklist Safety Guard: Blacklisted applicant handoff is blocked', async () => {
    const blacklistedCandidateId = `blocked_${Date.now()}`;

    // Add entry to blacklist
    await blacklistEntriesRepository.create({
      communityId,
      discordUserId: blacklistedCandidateId,
      reason: 'Spam violation',
      status: 'ACTIVE',
      actor: 'mod_1',
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Create approved application
    const blockedApp = await applicationsRepository.create({
      communityId,
      applicantUserId: `usr_${blacklistedCandidateId}`,
      applicantDiscordUserId: blacklistedCandidateId,
      applicantDiscordId: blacklistedCandidateId,
      applicantUsername: 'BadActorCandidate',
      applicantUsernameSnapshot: 'BadActorCandidate',
      status: 'APPROVED',
      submittedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Execute handoff
    const handoffResult = await memberLifecycleService.executeHandoff({
      communityId,
      applicationId: blockedApp.id,
      discordUserId: blacklistedCandidateId,
    });

    assert.equal(handoffResult.handoff.status, 'BLOCKED', 'Blacklisted candidate handoff must be BLOCKED');
    assert.equal(handoffResult.handoff.onboardingStatus, 'BLOCKED');
    assert.equal(handoffResult.handoff.failureReason, 'MEMBER_ON_BLACKLIST');
    assert.equal(handoffResult.activated, false);
  });

  await runTest('8. Unified Funnel & Retention Metrics across the entire pipeline', async () => {
    const funnel = await memberLifecycleService.getUnifiedFunnel(communityId, '30d');
    assert.ok(funnel, 'Unified funnel metrics should be computed');
    assert.ok(funnel.stages.applications >= 2, 'Should count submitted applications');
    assert.ok(funnel.stages.joined >= 1, 'Should count joined members');
    assert.ok(funnel.stages.memberActivated >= 1, 'Should count activated members');
    assert.ok(funnel.stages.firstEngagement >= 1, 'Should count first engagement members');
    assert.ok(funnel.conversionRates.endToEndFunnelRate !== undefined, 'Conversion rates must exist');
    assert.ok(funnel.sourceBreakdown.length >= 1, 'Source breakdown must be populated');
  });

  console.log(`\nTask 51 Test Summary: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

if (process.argv[1]?.endsWith('task51-member-lifecycle.test.ts')) {
  runTask51Tests().then((res) => {
    if (res.failed > 0) process.exit(1);
    else process.exit(0);
  });
}
