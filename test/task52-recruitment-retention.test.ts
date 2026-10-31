import assert from 'node:assert/strict';
import { recruitmentRetentionService } from '../server/services/recruitmentRetention.service.js';
import {
  applicationsRepository,
  communitiesRepository,
  memberHandoffsRepository,
  memberOnboardingChecklistsRepository,
  earlyEngagementEventsRepository,
  recruitersRepository,
  recruitmentCampaignsRepository,
  recruitmentCohortsRepository,
  warningsRepository,
  safetyIncidentsRepository,
  eventRegistrationsRepository,
  auditLogsRepository,
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

export async function runTask52Tests(): Promise<{ passed: number; failed: number }> {
  console.log('\n--- TASK 52: RECRUITMENT RETENTION & LIFECYCLE INTELLIGENCE TESTS ---');

  const communityId = `comm_retention_${Date.now()}`;
  const actorUserId = 'admin_user_task52';
  const recruiterDiscordId = `recruiter_${Date.now()}`;

  // 1. Setup Community and Seed Data
  await communitiesRepository.create(communityId, {
    id: communityId,
    workspaceId: 'ws_test52',
    name: 'Retention Intelligence Guild',
    discordGuildId: 'guild_retention_999',
    ownerUserId: actorUserId,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await recruitersRepository.create(`rec_${recruiterDiscordId}`, {
    id: `rec_${recruiterDiscordId}`,
    communityId,
    workspaceId: 'ws_test52',
    discordUserId: recruiterDiscordId,
    recruiterCode: 'RETENT52',
    displayName: 'Retention Lead Alpha',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Seed applications
  const now = Date.now();
  const candidateAId = `cand_a_${now}`;
  const candidateBId = `cand_b_${now}`;
  const candidateCId = `cand_c_${now}`;

  // Candidate A: Joined 40 days ago, activated, finished onboarding, active engagement
  const joined40DaysAgo = new Date(now - 40 * 86400000).toISOString();
  await applicationsRepository.create(`app_a_${now}`, {
    id: `app_a_${now}`,
    communityId,
    applicantDiscordUserId: candidateAId,
    recruiterDiscordUserId: recruiterDiscordId,
    recruitmentSource: 'RECRUITER',
    status: 'JOINED',
    createdAt: joined40DaysAgo,
    updatedAt: joined40DaysAgo,
  });

  await memberHandoffsRepository.create(`handoff_a_${now}`, {
    id: `handoff_a_${now}`,
    communityId,
    applicationId: `app_a_${now}`,
    discordUserId: candidateAId,
    activationStatus: 'ACTIVATED',
    lifecycleStage: 'ONBOARDING_COMPLETED',
    joinedAt: joined40DaysAgo,
    activatedAt: joined40DaysAgo,
    createdAt: joined40DaysAgo,
    updatedAt: joined40DaysAgo,
  });

  await memberOnboardingChecklistsRepository.create(`check_a_${now}`, {
    id: `check_a_${now}`,
    communityId,
    discordUserId: candidateAId,
    isComplete: true,
    startedAt: joined40DaysAgo,
    completedAt: new Date(new Date(joined40DaysAgo).getTime() + 3600000).toISOString(),
    items: [
      { key: 'RULES', title: 'Acknowledge Server Rules', completed: true },
      { key: 'ROLES', title: 'Select Member Roles', completed: true },
    ],
    updatedAt: joined40DaysAgo,
  });

  await earlyEngagementEventsRepository.create(`eng_a_${now}`, {
    id: `eng_a_${now}`,
    communityId,
    discordUserId: candidateAId,
    eventType: 'GENERAL_CHAT_MESSAGE',
    channelId: 'chan_general',
    recordedAt: joined40DaysAgo,
  });

  // Candidate B: Joined 3 days ago (< 7d observation window), pending onboarding
  const joined3DaysAgo = new Date(now - 3 * 86400000).toISOString();
  await applicationsRepository.create(`app_b_${now}`, {
    id: `app_b_${now}`,
    communityId,
    applicantDiscordUserId: candidateBId,
    recruiterDiscordUserId: recruiterDiscordId,
    recruitmentSource: 'RECRUITER',
    status: 'JOINED',
    createdAt: joined3DaysAgo,
    updatedAt: joined3DaysAgo,
  });

  await memberHandoffsRepository.create(`handoff_b_${now}`, {
    id: `handoff_b_${now}`,
    communityId,
    applicationId: `app_b_${now}`,
    discordUserId: candidateBId,
    activationStatus: 'ACTIVATED',
    lifecycleStage: 'ONBOARDING_IN_PROGRESS',
    joinedAt: joined3DaysAgo,
    activatedAt: joined3DaysAgo,
    createdAt: joined3DaysAgo,
    updatedAt: joined3DaysAgo,
  });

  await memberOnboardingChecklistsRepository.create(`check_b_${now}`, {
    id: `check_b_${now}`,
    communityId,
    discordUserId: candidateBId,
    isComplete: false,
    startedAt: joined3DaysAgo,
    items: [
      { key: 'RULES', title: 'Acknowledge Server Rules', completed: true },
      { key: 'ROLES', title: 'Select Member Roles', completed: false },
    ],
    updatedAt: joined3DaysAgo,
  });

  // Candidate C: Applied 5 days ago, approved, but has not joined yet
  const applied5DaysAgo = new Date(now - 5 * 86400000).toISOString();
  await applicationsRepository.create(`app_c_${now}`, {
    id: `app_c_${now}`,
    communityId,
    applicantDiscordUserId: candidateCId,
    recruiterDiscordUserId: recruiterDiscordId,
    recruitmentSource: 'RECRUITER',
    status: 'APPROVED',
    createdAt: applied5DaysAgo,
    updatedAt: applied5DaysAgo,
  });

  // ========================================================================
  // TEST 1: RECRUITMENT COHORT CREATION & IMMUTABILITY
  // ========================================================================
  let createdCohortId = '';
  await runTest('Creates immutable recruitment cohort with audited log', async () => {
    const cohort = await recruitmentRetentionService.createCohort(
      communityId,
      {
        name: 'Spring 2026 Test Recruits',
        description: 'Test cohort',
        cohortType: 'RECRUITER',
        filterCriteria: { recruiterDiscordUserId: recruiterDiscordId },
      },
      actorUserId
    );

    assert.ok(cohort.id);
    assert.strictEqual(cohort.isImmutable, true);
    assert.strictEqual(cohort.cohortType, 'RECRUITER');
    assert.strictEqual(cohort.memberCount, 3);
    createdCohortId = cohort.id;

    // Verify audit log
    const logs = await auditLogsRepository.findByQuery({ communityId, action: 'COHORT_CREATED' });
    assert.ok(logs.some((l) => l.targetId === cohort.id));
  });

  // ========================================================================
  // TEST 2: AUTHORIZED COHORT CORRECTION WITH AUDIT TRAIL
  // ========================================================================
  await runTest('Authorized cohort correction updates criteria and records audit history', async () => {
    const updated = await recruitmentRetentionService.correctCohort(
      communityId,
      createdCohortId,
      {
        newCriteria: { recruiterDiscordUserId: recruiterDiscordId, source: 'RECRUITER' },
        reason: 'Explicitly enforce RECRUITER source channel filter',
      },
      actorUserId
    );

    assert.strictEqual(updated.id, createdCohortId);
    assert.strictEqual(updated.correctionHistory.length, 1);
    assert.strictEqual(updated.correctionHistory[0].reason, 'Explicitly enforce RECRUITER source channel filter');

    const logs = await auditLogsRepository.findByQuery({ communityId, action: 'COHORT_CORRECTED' });
    assert.ok(logs.some((l) => l.targetId === createdCohortId));
  });

  // ========================================================================
  // TEST 3: EVIDENCE-BASED MEMBER OUTCOME & INSUFFICIENT_DATA HANDLING
  // ========================================================================
  await runTest('Member outcome returns ACTIVE for 7d/30d on Candidate A (40d tenure)', async () => {
    const evidence = await recruitmentRetentionService.getMemberOutcomeEvidence(communityId, candidateAId);

    assert.strictEqual(evidence.memberActivation, true);
    assert.strictEqual(evidence.onboardingCompletion, true);
    assert.strictEqual(evidence.firstValidEngagement, true);
    assert.strictEqual(evidence.retention7d, 'ACTIVE');
    assert.strictEqual(evidence.retention30d, 'ACTIVE');
    // Joined 40 days ago < 60 days
    assert.strictEqual(evidence.retention60d, 'INSUFFICIENT_DATA');
    assert.strictEqual(evidence.retention90d, 'INSUFFICIENT_DATA');
    assert.ok(evidence.evidenceSummary.includes('Activated'));
  });

  await runTest('Member outcome returns INSUFFICIENT_DATA for Candidate B (3d tenure < 7d window)', async () => {
    const evidence = await recruitmentRetentionService.getMemberOutcomeEvidence(communityId, candidateBId);

    assert.strictEqual(evidence.memberActivation, true);
    assert.strictEqual(evidence.onboardingCompletion, false);
    // Observation window is < 7 days
    assert.strictEqual(evidence.retention7d, 'INSUFFICIENT_DATA');
    assert.strictEqual(evidence.retention30d, 'INSUFFICIENT_DATA');
    assert.strictEqual(evidence.retention90d, 'INSUFFICIENT_DATA');
  });

  // ========================================================================
  // TEST 4: END-TO-END RETENTION FUNNEL CALCULATION
  // ========================================================================
  await runTest('Calculates full 9-stage retention funnel with proper stage conversion rates', async () => {
    const funnel = await recruitmentRetentionService.getRetentionFunnel(communityId);

    assert.strictEqual(funnel.stages.length, 9);
    assert.strictEqual(funnel.totalObserved, 3); // 3 apps

    const appStage = funnel.stages.find((s) => s.stageKey === 'APPLICATION')!;
    const approvedStage = funnel.stages.find((s) => s.stageKey === 'APPROVED')!;
    const joinedStage = funnel.stages.find((s) => s.stageKey === 'JOINED')!;
    const activatedStage = funnel.stages.find((s) => s.stageKey === 'MEMBER_ACTIVATED')!;
    const onboardedStage = funnel.stages.find((s) => s.stageKey === 'ONBOARDED')!;
    const stage7d = funnel.stages.find((s) => s.stageKey === '7_DAY_ACTIVE')!;
    const stage30d = funnel.stages.find((s) => s.stageKey === '30_DAY_ACTIVE')!;
    const stage90d = funnel.stages.find((s) => s.stageKey === '90_DAY_ACTIVE')!;

    assert.strictEqual(appStage.count, 3);
    assert.strictEqual(approvedStage.count, 3);
    assert.strictEqual(joinedStage.count, 2);
    assert.strictEqual(activatedStage.count, 2);
    assert.strictEqual(onboardedStage.count, 1);
    assert.strictEqual(stage7d.count, 1); // Only Cand A is eligible (> 7d) and active
    assert.strictEqual(stage30d.count, 1); // Only Cand A is eligible (> 30d) and active
    assert.strictEqual(stage90d.count, 0);
    assert.strictEqual(stage90d.status, 'INSUFFICIENT_DATA'); // No eligible candidates >= 90d
  });

  // ========================================================================
  // TEST 5: RECRUITER QUALITY ANALYTICS & CLASSIFICATION
  // ========================================================================
  await runTest('Recruiter analytics evaluates quality classification beyond raw volume', async () => {
    const recruiterMetrics = await recruitmentRetentionService.getRecruiterQualityAnalytics(communityId, 'all');
    assert.ok(recruiterMetrics.length >= 1);

    const rec = recruiterMetrics.find((r) => r.recruiterDiscordUserId === recruiterDiscordId)!;
    assert.strictEqual(rec.applications, 3);
    assert.strictEqual(rec.joined, 2);
    assert.strictEqual(rec.activated, 2);
    assert.strictEqual(rec.onboarded, 1);
    assert.strictEqual(rec.activationRate, 100); // 2 activated / 2 joined
    assert.strictEqual(rec.onboardingRate, 50); // 1 onboarded / 2 activated
    assert.ok(['BEST_PERFORMING', 'BALANCED'].includes(rec.qualityClassification));
    assert.ok(rec.explainableEvidence.length > 0);
  });

  // ========================================================================
  // TEST 6: APPLICATION SOURCE CORRECTION & AUDIT LOGGING
  // ========================================================================
  await runTest('Correcting recruitment source updates application and emits audit log', async () => {
    const updatedApp = await recruitmentRetentionService.correctRecruitmentSource(
      communityId,
      `app_c_${now}`,
      'PARTNER',
      'Candidate originated from collegiate partner initiative',
      actorUserId
    );

    assert.strictEqual(updatedApp.recruitmentSource, 'PARTNER');

    const appInRepo = await applicationsRepository.findById(`app_c_${now}`);
    assert.strictEqual(appInRepo?.recruitmentSource, 'PARTNER');

    const logs = await auditLogsRepository.findByQuery({
      communityId,
      action: 'RECRUITMENT_SOURCE_CORRECTED',
    });
    assert.ok(logs.some((l) => l.targetId === `app_c_${now}`));
  });

  // ========================================================================
  // TEST 7: ONBOARDING QUALITY & HIGH FRICTION STEP DETECTION
  // ========================================================================
  await runTest('Onboarding quality identifies checklist completion rate and friction step', async () => {
    const onboarding = await recruitmentRetentionService.getOnboardingQualityAnalysis(communityId);

    assert.strictEqual(onboarding.totalChecklists, 2);
    assert.strictEqual(onboarding.overallCompletionRate, 50); // 1 complete out of 2
    assert.ok(onboarding.stepMetrics.length >= 2);

    // Cand B abandoned ROLES step
    const rolesStep = onboarding.stepMetrics.find((s) => s.key === 'ROLES');
    assert.ok(rolesStep);
    assert.strictEqual(rolesStep.abandonedCount, 1);
  });

  // ========================================================================
  // TEST 8: RETENTION ALERTS ENGINE
  // ========================================================================
  await runTest('Retention alerts engine evaluates operational drop-off points safely', async () => {
    const alerts = await recruitmentRetentionService.evaluateRetentionAlerts(communityId);
    // Verified alerts output array without crashing
    assert.ok(Array.isArray(alerts));
  });

  // ========================================================================
  // TEST 9: MODERATION & EVENT QUALITY CROSSOVERS
  // ========================================================================
  await runTest('Moderation and Event crossovers correlate data with explicit OBSERVED_CORRELATION', async () => {
    const modCrossover = await recruitmentRetentionService.getModerationQualityCrossover(communityId);
    assert.ok(Array.isArray(modCrossover.sourceCorrelations));

    for (const corr of modCrossover.sourceCorrelations) {
      assert.ok(['OBSERVED_CORRELATION', 'INSUFFICIENT_DATA'].includes(corr.evidenceType));
    }

    const eventCrossover = await recruitmentRetentionService.getEventQualityCrossover(communityId);
    assert.ok(Array.isArray(eventCrossover.sourceBreakdown));
  });

  // ========================================================================
  // TEST 10: LIFETIME VALUE FOUNDATION UNCONFIGURED COMPLIANCE
  // ========================================================================
  await runTest('LTV foundation returns NOT_CONFIGURED to prevent fabricated financials', async () => {
    const ltv = recruitmentRetentionService.getLifetimeValueFoundation(communityId);
    assert.strictEqual(ltv.status, 'NOT_CONFIGURED');
    assert.strictEqual(ltv.financialLtv, 'NOT_CONFIGURED');
  });

  // ========================================================================
  // TEST 11: EXECUTIVE OVERVIEW
  // ========================================================================
  await runTest('Executive overview returns unified metrics and top source', async () => {
    const overview = await recruitmentRetentionService.getExecutiveLifecycleOverview(communityId);
    assert.strictEqual(overview.totalApplicants, 3);
    assert.strictEqual(overview.activeMembers, 2);
    assert.strictEqual(overview.retentionRate30d, 100);
  });

  return { passed, failed };
}
