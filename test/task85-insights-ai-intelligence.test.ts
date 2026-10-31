import assert from 'node:assert/strict';
import { communityInsightsService } from '../server/services/communityInsights.service.js';
import { recruitmentAnalyticsService } from '../server/services/recruitmentAnalytics.service.js';
import { retentionIntelligenceService } from '../server/services/retentionIntelligence.service.js';
import { communityBrainService } from '../server/services/ai/communityBrain.service.js';
import { EntitlementService } from '../server/services/entitlement.service.js';
import {
  communitiesRepository,
  memberHandoffsRepository,
  earlyEngagementEventsRepository,
  recruitersRepository,
  applicationsRepository,
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

export async function runTask85Tests(): Promise<{ passed: number; failed: number }> {
  console.log('\n======================================================================');
  console.log('TASK 85 — INSIGHTS & AI INTELLIGENCE ENGINE');
  console.log('======================================================================');

  const testCommunityId = `comm_t85_${Date.now()}`;
  await communitiesRepository.create(testCommunityId, {
    id: testCommunityId,
    name: 'Task 85 Analytics Community',
    ownerUserId: 'owner_user_t85',
    discordGuildId: 'guild_t85',
    plan: 'ENTERPRISE',
    status: 'ACTIVE',
  } as any);

  const authCtx = {
    userId: 'owner_user_t85',
    role: 'OWNER' as any,
    roles: ['OWNER'],
    communityId: testCommunityId,
  };

  // -------------------------------------------------------------------------
  // 1. Community Insights Overview Engine
  // -------------------------------------------------------------------------
  console.log('\n--- 1. Community Insights Service ---');

  await runTest('Unified overview delivers valid data structure and metadata', async () => {
    const overview = await communityInsightsService.getOverview(
      testCommunityId,
      'LAST_30_DAYS',
      authCtx
    );

    assert.ok(overview, 'Overview should not be null');
    assert.ok(overview.community, 'Should include community domain');
    assert.ok(overview.engagement, 'Should include engagement domain');
    assert.ok(overview.recruitment, 'Should include recruitment domain');
    assert.ok(overview.moderation, 'Should include moderation domain');
    assert.ok(overview.events, 'Should include events domain');
    assert.ok(overview.automation, 'Should include automation domain');
    assert.ok(overview.health, 'Should include health indicator');
    assert.ok(overview.metadata, 'Should include metadata');
    assert.equal(overview.metadata.communityId, testCommunityId);
  });

  await runTest('Enforces tenant isolation and permission check', async () => {
    const unauthorizedCtx = {
      userId: 'stranger_user',
      role: 'MEMBER' as any,
      roles: ['MEMBER'],
      communityId: 'other_community',
    };

    await assert.rejects(
      async () => {
        await communityInsightsService.getOverview(
          testCommunityId,
          'LAST_30_DAYS',
          unauthorizedCtx
        );
      },
      (err: any) => err.statusCode === 403 || err.message.includes('Forbidden') || err.message.includes('Access denied')
    );
  });

  // -------------------------------------------------------------------------
  // 2. Recruitment Analytics (9-Stage Funnel, Recruiters, Attribution)
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Recruitment Analytics Engine ---');

  await runTest('Calculates 9-stage funnel with zero fabrication', async () => {
    const funnel = await recruitmentAnalyticsService.get9StageFunnel(testCommunityId, authCtx);

    assert.ok(funnel, 'Funnel must exist');
    assert.equal(funnel.stages.length, 9, 'Must have exactly 9 lifecycle stages');
    assert.equal(funnel.stages[0].stageKey, 'APPLICATION');
    assert.equal(funnel.stages[1].stageKey, 'APPROVED');
    assert.equal(funnel.stages[2].stageKey, 'JOINED');
    assert.equal(funnel.stages[3].stageKey, 'MEMBER_ACTIVATED');
    assert.equal(funnel.stages[4].stageKey, 'ONBOARDED');
    assert.equal(funnel.stages[5].stageKey, 'FIRST_ENGAGEMENT');
    assert.equal(funnel.stages[6].stageKey, '7_DAY_ACTIVE');
    assert.equal(funnel.stages[7].stageKey, '30_DAY_ACTIVE');
    assert.equal(funnel.stages[8].stageKey, '90_DAY_ACTIVE');

    // Verify truth classification exists on all stages
    for (const stage of funnel.stages) {
      assert.ok(
        ['VERIFIED_FACT', 'OBSERVED_CORRELATION', 'INSUFFICIENT_EVIDENCE'].includes(
          stage.truthClassification
        ),
        `Stage ${stage.stageKey} must have valid truth classification`
      );
    }
  });

  await runTest('Calculates recruiter quality without fabricated stats', async () => {
    // Seed real recruiter and application
    await recruitersRepository.create(`rec_${Date.now()}`, {
      id: `rec_${Date.now()}`,
      communityId: testCommunityId,
      discordUserId: 'recruiter_123',
      isActive: true,
      createdAt: new Date().toISOString(),
    } as any);

    const appId = `app_${Date.now()}`;
    await applicationsRepository.create(appId, {
      id: appId,
      communityId: testCommunityId,
      recruiterDiscordUserId: 'recruiter_123',
      status: 'JOINED',
      createdAt: new Date().toISOString(),
    } as any);

    await memberHandoffsRepository.create(`handoff_${Date.now()}`, {
      id: `handoff_${Date.now()}`,
      communityId: testCommunityId,
      applicationId: appId,
      candidateId: 'cand_1',
      discordUserId: 'disc_user_1',
      recruiterId: 'recruiter_123',
      joinedAt: new Date().toISOString(),
      activationStatus: 'ACTIVATED',
      lifecycleStage: 'ACTIVE',
      createdAt: new Date().toISOString(),
    } as any);

    const recruiters = await recruitmentAnalyticsService.getRecruiterLeaderboard(
      testCommunityId,
      'all',
      authCtx
    );

    assert.ok(Array.isArray(recruiters), 'Recruiters must be an array');
    const targetRecruiter = recruiters.find((r) => r.recruiterDiscordUserId === 'recruiter_123');
    assert.ok(targetRecruiter, 'Recruiter 123 must appear in leaderboard');
    assert.ok(
      ['BEST_PERFORMING', 'BALANCED', 'HIGH_DROP_OFF', 'INSUFFICIENT_DATA'].includes(
        targetRecruiter.qualityClassification
      ),
      'Must assign authoritative quality tier'
    );
  });

  await runTest('Source attribution reports real sources and unattributed cleanly', async () => {
    const sources = await recruitmentAnalyticsService.getSourceAttribution(
      testCommunityId,
      authCtx
    );

    assert.ok(Array.isArray(sources), 'Sources must be an array');
    const directSource = sources.find((s) => s.source === 'DIRECT' || s.source === 'RECRUITER');
    assert.ok(directSource, 'Direct or recruiter source category should exist');
  });

  // -------------------------------------------------------------------------
  // 3. Retention Intelligence (Cohorts & Elapsed Observation Windows)
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Retention Intelligence Engine ---');

  await runTest('Generates cohort matrix and strictly guards unelapsed windows', async () => {
    // Create candidate who joined today (Day 30 cannot have elapsed)
    await memberHandoffsRepository.create(`recent_handoff_${Date.now()}`, {
      id: `recent_handoff_${Date.now()}`,
      communityId: testCommunityId,
      candidateId: 'cand_recent',
      discordUserId: 'disc_user_recent',
      joinedGuildAt: new Date().toISOString(), // Today!
      onboardingStatus: 'IN_PROGRESS',
      retained30d: false,
      createdAt: new Date().toISOString(),
    } as any);

    const cohortData = await retentionIntelligenceService.getCohortRetentionMatrix(
      testCommunityId,
      authCtx
    );

    assert.ok(cohortData, 'Cohort data must exist');
    assert.ok(cohortData.rows.length > 0, 'Should have at least 1 cohort row');
    assert.ok(cohortData.activityDefinition.includes('ACTIVE_MEMBER'), 'Must provide activity definition');

    // For today's cohort, day 30 and day 90 MUST be marked INSUFFICIENT_DATA (not elapsed)
    const currentCohort = cohortData.rows[0];
    assert.equal(
      currentCohort.day30.status,
      'INSUFFICIENT_DATA',
      'Day 30 status must be INSUFFICIENT_DATA when window has not elapsed'
    );
    assert.equal(
      currentCohort.day90.status,
      'INSUFFICIENT_DATA',
      'Day 90 status must be INSUFFICIENT_DATA when window has not elapsed'
    );
  });

  await runTest('Retention alerts and cross-system crossovers compute without error', async () => {
    const alerts = await retentionIntelligenceService.getRetentionAlerts(
      testCommunityId,
      authCtx
    );
    assert.ok(Array.isArray(alerts), 'Alerts must be an array');

    const crossovers = await retentionIntelligenceService.getCrossSystemCrossovers(
      testCommunityId,
      authCtx
    );
    assert.ok(crossovers.moderation, 'Must calculate moderation crossover');
    assert.ok(crossovers.events, 'Must calculate events crossover');
    assert.ok(crossovers.automation, 'Must calculate automation crossover');
  });

  // -------------------------------------------------------------------------
  // 4. Community Brain AI Engine & Data Truth Model
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Community Brain AI Engine ---');

  await runTest('Entitlement includes COMMUNITY_BRAIN capability', () => {
    const isEntitled = EntitlementService.isFeatureEnabled(
      'ENTERPRISE',
      'COMMUNITY_BRAIN' as any
    );
    assert.equal(isEntitled, true, 'Enterprise plan should be entitled to COMMUNITY_BRAIN');
  });

  await runTest('Provider status reports transparent engine readiness and quota', async () => {
    const status = await communityBrainService.getProviderStatus(testCommunityId, authCtx);

    assert.ok(status, 'Status object must exist');
    assert.ok(
      ['READY', 'NOT_CONFIGURED', 'DEPENDENCY_UNAVAILABLE', 'QUOTA_EXCEEDED', 'ERROR'].includes(
        status.status
      ),
      'Status must be a recognized provider state'
    );
    assert.ok(status.model, 'Model identifier must be reported');
    assert.ok(status.quota, 'Quota breakdown must be reported');
    assert.equal(typeof status.quota.currentUsage, 'number');
    assert.equal(typeof status.quota.dailyLimit, 'number');
  });

  await runTest('queryBrain returns structured evidence classification and advisory notice', async () => {
    const response = await communityBrainService.queryBrain(
      testCommunityId,
      'Explain recruitment drop-off and member onboarding status',
      authCtx
    );

    assert.ok(response, 'Response must exist');
    assert.ok(response.answer, 'Must include textual answer');
    assert.ok(response.evidenceClassification, 'Must include evidenceClassification');
    assert.ok(
      Array.isArray(response.evidenceClassification.observedData),
      'observedData must be an array'
    );
    assert.ok(
      Array.isArray(response.evidenceClassification.analysis),
      'analysis must be an array'
    );

    // Verify all observedData items are labeled VERIFIED_FACT
    for (const item of response.evidenceClassification.observedData) {
      assert.equal(
        item.classification,
        'VERIFIED_FACT',
        'Database observed metrics must be VERIFIED_FACT'
      );
    }

    // Verify advisory notice
    assert.ok(response.advisoryNotice, 'Must include explicit advisory notice');
    assert.ok(
      response.advisoryNotice.includes('advisory') ||
        response.advisoryNotice.includes('human'),
      'Notice must state advisory nature for human managers'
    );
  });

  return { passed, failed };
}
