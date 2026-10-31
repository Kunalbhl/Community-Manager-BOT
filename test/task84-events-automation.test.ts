import assert from 'node:assert/strict';
import {
  eventService,
  eventRegistrationService,
  validateEventTransition,
} from '../server/services/events.service.js';
import {
  scheduleService,
  isValidTimezone,
} from '../server/services/schedule.service.js';
import {
  WorkflowExecutionService,
  AutomationEventBusService,
  DurableLockService,
} from '../server/services/automation.service.js';
import {
  automationWorkflowsRepository,
  communitiesRepository,
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

export async function runTask84Tests(): Promise<{ passed: number; failed: number }> {
  console.log('\n======================================================================');
  console.log('TASK 84 — EVENTS & AUTOMATION ENGINE');
  console.log('======================================================================');

  const testCommunityId = `comm_t84_${Date.now()}`;
  await communitiesRepository.create(testCommunityId, {
    id: testCommunityId,
    name: 'Task 84 Community',
    ownerUserId: 'owner_user_t84',
    discordGuildId: 'guild_t84',
    plan: 'ENTERPRISE',
    status: 'ACTIVE',
  } as any);

  // 1. Timezone Validation
  console.log('\n--- 1. Timezone Validation Engine ---');
  await runTest('Accepts valid standard IANA timezones', () => {
    assert.equal(isValidTimezone('UTC'), true);
    assert.equal(isValidTimezone('America/New_York'), true);
    assert.equal(isValidTimezone('Europe/London'), true);
    assert.equal(isValidTimezone('Asia/Tokyo'), true);
  });

  await runTest('Rejects invalid or malformed timezones', () => {
    assert.equal(isValidTimezone('Mars/Olympus_Mons'), false);
    assert.equal(isValidTimezone('Fake/Timezone'), false);
    assert.equal(isValidTimezone(''), false);
  });

  // 2. Event Lifecycle State Transitions
  console.log('\n--- 2. Event State Machine Transitions ---');
  await runTest('Validates authorized state transitions', () => {
    assert.doesNotThrow(() => validateEventTransition('DRAFT', 'SCHEDULED'));
    assert.doesNotThrow(() => validateEventTransition('SCHEDULED', 'LIVE'));
    assert.doesNotThrow(() => validateEventTransition('LIVE', 'COMPLETED'));
    assert.doesNotThrow(() => validateEventTransition('COMPLETED', 'ARCHIVED'));
    assert.doesNotThrow(() => validateEventTransition('SCHEDULED', 'DRAFT')); // unpublish
    assert.doesNotThrow(() => validateEventTransition('SCHEDULED', 'CANCELLED'));
  });

  await runTest('Blocks invalid illegal state transitions', () => {
    assert.throws(() => validateEventTransition('DRAFT', 'COMPLETED'));
    assert.throws(() => validateEventTransition('DRAFT', 'LIVE'));
    assert.throws(() => validateEventTransition('COMPLETED', 'LIVE'));
    assert.throws(() => validateEventTransition('ARCHIVED', 'LIVE'));
  });

  // 3. End-to-End Event Lifecycle Execution
  console.log('\n--- 3. Event CRUD & Full Lifecycle Service ---');
  let createdEventId = '';
  await runTest('Creates event in DRAFT state with timezone enforcement', async () => {
    const startAt = new Date(Date.now() + 3600000).toISOString();
    const endAt = new Date(Date.now() + 7200000).toISOString();

    const event = await eventService.createEvent({
      communityId: testCommunityId,
      title: 'Task 84 Recruiter Workshop',
      description: 'Comprehensive Discord automation & events briefing',
      startAt,
      endAt,
      timezone: 'America/New_York',
      organizer: 'owner_user_t84',
      capacity: 2,
      registrationEnabled: true,
    });

    assert.ok(event.id);
    assert.equal(event.status, 'DRAFT');
    assert.equal(event.capacity, 2);
    createdEventId = event.id;
  });

  await runTest('Publishes event to SCHEDULED state', async () => {
    const published = await eventService.publishEvent(
      testCommunityId,
      createdEventId,
      'owner_user_t84',
      'OWNER'
    );
    assert.equal(published.status, 'SCHEDULED');
  });

  await runTest('Unpublishes event back to DRAFT state', async () => {
    const unpublished = await eventService.unpublishEvent(
      testCommunityId,
      createdEventId,
      'owner_user_t84',
      'OWNER'
    );
    assert.equal(unpublished.status, 'DRAFT');

    // Re-publish for next lifecycle tests
    await eventService.publishEvent(
      testCommunityId,
      createdEventId,
      'owner_user_t84',
      'OWNER'
    );
  });

  await runTest('Enforces capacity limits and waitlisting during member registration', async () => {
    // Register 1st attendee
    const reg1 = await eventRegistrationService.registerMember({
      communityId: testCommunityId,
      eventId: createdEventId,
      discordUserId: 'disc_user_1',
      username: 'attendee_1',
      actorUserId: 'disc_user_1',
    });
    assert.equal(reg1.status, 'REGISTERED');

    // Register 2nd attendee (fills capacity of 2)
    const reg2 = await eventRegistrationService.registerMember({
      communityId: testCommunityId,
      eventId: createdEventId,
      discordUserId: 'disc_user_2',
      username: 'attendee_2',
      actorUserId: 'disc_user_2',
    });
    assert.equal(reg2.status, 'REGISTERED');

    // 3rd attendee should be WAITLISTED because capacity is 2
    const reg3 = await eventRegistrationService.registerMember({
      communityId: testCommunityId,
      eventId: createdEventId,
      discordUserId: 'disc_user_3',
      username: 'attendee_3',
      actorUserId: 'disc_user_3',
    });
    assert.equal(reg3.status, 'WAITLISTED');
  });

  await runTest('Starts event transitioning to LIVE and completes to COMPLETED', async () => {
    const started = await eventService.startEvent(testCommunityId, createdEventId);
    assert.equal(started.status, 'LIVE');

    const completed = await eventService.completeEvent(testCommunityId, createdEventId);
    assert.equal(completed.status, 'COMPLETED');
  });

  await runTest('Archives completed event', async () => {
    const archived = await eventService.archiveEvent(
      testCommunityId,
      createdEventId,
      'owner_user_t84',
      'OWNER'
    );
    assert.equal(archived.status, 'ARCHIVED');
  });

  // 4. Recurring Schedule Engine
  console.log('\n--- 4. Schedule Engine Management ---');
  let scheduleId = '';
  await runTest('Creates recurring schedule with nextExecutionAt calculation', async () => {
    const nextExecutionAt = new Date(Date.now() + 86400000).toISOString();
    const sched = await scheduleService.createSchedule({
      communityId: testCommunityId,
      name: 'Weekly AMA Reminder',
      resourceType: 'EVENT',
      resourceId: createdEventId,
      timezone: 'UTC',
      recurrence: 'WEEKLY',
      nextExecutionAt,
      actorUserId: 'owner_user_t84',
      actorRole: 'OWNER',
    });

    assert.ok(sched.id);
    assert.equal(sched.status, 'ACTIVE');
    assert.equal(sched.recurrence, 'WEEKLY');
    scheduleId = sched.id;
  });

  await runTest('Pauses and resumes recurring schedule', async () => {
    const paused = await scheduleService.pauseSchedule(testCommunityId, scheduleId, 'owner_user_t84', 'OWNER');
    assert.equal(paused.status, 'PAUSED');

    const resumed = await scheduleService.resumeSchedule(testCommunityId, scheduleId, 'owner_user_t84', 'OWNER');
    assert.equal(resumed.status, 'ACTIVE');
  });

  await runTest('Cancels schedule safely', async () => {
    const cancelled = await scheduleService.cancelSchedule(testCommunityId, scheduleId, 'owner_user_t84', 'OWNER');
    assert.equal(cancelled.status, 'CANCELLED');
  });

  // 5. Automation Workflow Execution & Loop Protection
  console.log('\n--- 5. Workflow Execution, Loop & Recursion Protection ---');
  await runTest('Workflow loop protection halts runaway depth cascades (limit = 3)', async () => {
    const runawayWorkflowId = `wf_loop_${Date.now()}`;
    const wf = await automationWorkflowsRepository.create(runawayWorkflowId, {
      id: runawayWorkflowId,
      communityId: testCommunityId,
      name: 'Runaway Cascade Workflow',
      triggerType: 'EVENT_STARTING',
      conditionGroup: 'ALL',
      conditions: [],
      actions: [
        {
          type: 'TRIGGER_WORKFLOW',
          config: { workflowId: runawayWorkflowId },
        },
      ],
      enabled: true,
      status: 'ACTIVE',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const executionResult = await WorkflowExecutionService.runWorkflow(
      wf,
      {
        eventId: 'evt_sim_1',
        eventType: 'EVENT_STARTING',
        communityId: testCommunityId,
        occurredAt: new Date().toISOString(),
        resourceType: 'EVENT',
        resourceId: createdEventId,
      },
      false,
      3, // at max depth
      [runawayWorkflowId]
    );

    assert.equal(executionResult.status, 'SKIPPED');
    assert.ok(executionResult.errorDetails?.includes('AUTOMATION_LOOP_BLOCKED'));
  });

  await runTest('DurableLockService prevents concurrent executions of same workflow-resource key', async () => {
    const lockKey = `wf_lock_${Date.now()}`;
    const acquired1 = await DurableLockService.acquireLock(lockKey, testCommunityId, 5);
    assert.equal(acquired1, true, 'First lock acquisition should succeed');

    const acquired2 = await DurableLockService.acquireLock(lockKey, testCommunityId, 5);
    assert.equal(acquired2, false, 'Simultaneous lock acquisition on same key must fail');

    await DurableLockService.releaseLock(lockKey, testCommunityId);
    const acquired3 = await DurableLockService.acquireLock(lockKey, testCommunityId, 5);
    assert.equal(acquired3, true, 'Lock acquisition should succeed after release');
    await DurableLockService.releaseLock(lockKey, testCommunityId);
  });

  await runTest('Automation Event Bus dispatches events to listening workflows without error', async () => {
    await assert.doesNotReject(async () => {
      await AutomationEventBusService.publish({
        eventType: 'MEMBER_JOINED',
        communityId: testCommunityId,
        resourceType: 'MEMBER',
        resourceId: 'member_test_bus',
        metadata: { username: 'NewCandidate' },
      });
    });
  });

  console.log(`\n======================================================================`);
  console.log(`TASK 84 TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log(`======================================================================\n`);

  return { passed, failed };
}

if (process.argv[1]?.endsWith('task84-events-automation.test.ts')) {
  runTask84Tests().then(({ failed }) => {
    if (failed > 0) process.exit(1);
    else process.exit(0);
  });
}
