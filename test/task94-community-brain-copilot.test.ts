import assert from 'node:assert/strict';
import { NeedsAttentionService } from '../server/services/needsAttention.service.js';
import { ActionRegistryService } from '../server/services/ai/actionRegistry.js';
import { DashboardService } from '../server/services/dashboard.service.js';
import { ReportGeneratorService } from '../server/services/reports/reportGenerator.service.js';
import { ReportSchedulerService } from '../server/services/reports/reportScheduler.service.js';
import { AiWorkflowBuilderService } from '../server/services/ai/aiWorkflowBuilder.service.js';
import { FeatureRegistryService } from '../server/services/ai/featureRegistry.js';
import { EntitlementService } from '../server/services/entitlement.service.js';
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

export async function runTask94Tests(): Promise<{ passed: number; failed: number }> {
  console.log('\n======================================================================');
  console.log('TASK 94 — COMMUNITY BRAIN COPILOT & ADAPTIVE OPERATIONS ENGINE TESTS');
  console.log('======================================================================');

  const testCommunityId = `comm_t94_${Date.now()}`;
  await communitiesRepository.create(testCommunityId, {
    id: testCommunityId,
    name: 'Task 94 Copilot Community',
    ownerUserId: 'owner_user_t94',
    discordGuildId: 'guild_t94',
    plan: 'ENTERPRISE',
    status: 'ACTIVE',
  } as any);

  const authCtx: UserAuthContext = {
    userId: 'owner_user_t94',
    role: 'OWNER',
    communityId: testCommunityId,
  };

  // -------------------------------------------------------------------------
  // 1. Needs Attention Engine
  // -------------------------------------------------------------------------
  console.log('\n--- 1. Needs Attention Engine ---');

  await runTest('NeedsAttentionService evaluates deterministic priority signals', async () => {
    const report = await NeedsAttentionService.evaluateSignals(testCommunityId);
    assert.equal(report.communityId, testCommunityId);
    assert.ok(Array.isArray(report.signals));
    assert.ok(report.status === 'HEALTHY' || report.status === 'NEEDS_ATTENTION');
  });

  // -------------------------------------------------------------------------
  // 2. Action Registry & Authoritative Safety Execution
  // -------------------------------------------------------------------------
  console.log('\n--- 2. Action Registry & Verification ---');

  await runTest('ActionRegistryService lists registered safe actions', () => {
    const actions = ActionRegistryService.listActions();
    assert.ok(actions.length >= 5);
    const diagAction = ActionRegistryService.getAction('RUN_PERMISSION_DIAGNOSTICS');
    assert.ok(diagAction);
    assert.equal(diagAction?.riskLevel, 'READ_ONLY');
  });

  await runTest('ActionRegistry executes and verifies CREATE_ANNOUNCEMENT_DRAFT', async () => {
    const action = ActionRegistryService.getAction('CREATE_ANNOUNCEMENT_DRAFT');
    assert.ok(action);

    const result = await action.execute(testCommunityId, authCtx, {
      title: 'Test Copilot Announcement',
      content: 'This is a test update from Community Brain.',
    });
    assert.ok(result.success);
    assert.ok(result.resultId);

    const verification = await action.verify(testCommunityId, result.resultId);
    assert.ok(verification.verified);
  });

  // -------------------------------------------------------------------------
  // 3. Personalized Dashboard Engine
  // -------------------------------------------------------------------------
  console.log('\n--- 3. Personalized Dashboard Engine ---');

  await runTest('DashboardService retrieves card registry & user configuration', async () => {
    const cards = DashboardService.getCardsRegistry();
    assert.ok(cards.length >= 10);

    const config = await DashboardService.getDashboardConfig(testCommunityId, authCtx);
    assert.equal(config.communityId, testCommunityId);
    assert.ok(config.selectedCardIds.length > 0);
  });

  await runTest('DashboardService updates layout and generates AI proposal', async () => {
    const updated = await DashboardService.updateDashboardConfig(testCommunityId, authCtx, [
      'NEEDS_ATTENTION',
      'MEMBER_GROWTH',
      'APPLICATIONS_NEEDING_REVIEW',
    ]);
    assert.deepEqual(updated.selectedCardIds, ['NEEDS_ATTENTION', 'MEMBER_GROWTH', 'APPLICATIONS_NEEDING_REVIEW']);

    const proposal = await DashboardService.generateAIProposal(
      testCommunityId,
      authCtx,
      'Show me hiring queue and member retention'
    );
    assert.ok(proposal.proposedCardIds.length > 0);
    assert.equal(proposal.requiresConfirmation, true);
  });

  // -------------------------------------------------------------------------
  // 4. Report Generator & Scheduler
  // -------------------------------------------------------------------------
  console.log('\n--- 4. Report Generator & Scheduler ---');

  await runTest('ReportGeneratorService builds factual reports from domain services', async () => {
    const report = await ReportGeneratorService.generateReport(
      testCommunityId,
      authCtx,
      'WEEKLY_COMMUNITY'
    );
    assert.equal(report.communityId, testCommunityId);
    assert.ok(report.summary.length > 0);
    assert.ok(report.metrics.totalMembers);
  });

  await runTest('ReportSchedulerService schedules and executes automated report', async () => {
    const scheduled = await ReportSchedulerService.scheduleReport(testCommunityId, authCtx, {
      reportType: 'WEEKLY_COMMUNITY',
      schedule: 'EVERY_MONDAY_0900',
      deliveryChannel: 'IN_APP',
    });
    assert.equal(scheduled.communityId, testCommunityId);
    assert.equal(scheduled.status, 'ACTIVE');

    const execResult = await ReportSchedulerService.executeScheduledReport(scheduled.id);
    assert.ok(execResult.success);
  });

  // -------------------------------------------------------------------------
  // 5. AI Workflow Designer & Safety
  // -------------------------------------------------------------------------
  console.log('\n--- 5. AI Workflow Designer ---');

  await runTest('AiWorkflowBuilderService converts prompt into validated proposal', async () => {
    const proposal = await AiWorkflowBuilderService.proposeWorkflow(
      testCommunityId,
      authCtx,
      'When someone submits an application notify recruiters and set reminder'
    );
    assert.equal(proposal.communityId, testCommunityId);
    assert.equal(proposal.trigger.type, 'APPLICATION_SUBMITTED');
    assert.ok(proposal.explanation.whenItRuns);
    assert.equal(proposal.proposedAction.actionId, 'CREATE_AUTOMATION_WORKFLOW');
  });

  // -------------------------------------------------------------------------
  // 6. Feature Discovery & Guided Setup
  // -------------------------------------------------------------------------
  console.log('\n--- 6. Feature Discovery & Guided Setup ---');

  await runTest('FeatureRegistryService returns product capabilities and guided setup', async () => {
    const overview = await FeatureRegistryService.getFeatureOverview(testCommunityId, authCtx);
    assert.ok(overview.length >= 5);

    const guide = await FeatureRegistryService.guidedSetupAssist(
      testCommunityId,
      authCtx,
      'WELCOME_ONBOARDING'
    );
    assert.equal(guide.featureId, 'WELCOME_ONBOARDING');
    assert.ok(guide.steps.length === 4);
    assert.ok(guide.nextActionNeeded);
  });

  console.log(`\nTask 94 Tests Completed: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}
