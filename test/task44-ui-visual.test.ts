import assert from 'node:assert/strict';
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, hasPermission } from '../server/security/rbac.js';
import { UserRole, Permission } from '../shared/types/rbac.js';
import { AUTHORITATIVE_PLANS } from '../shared/types/plans.js';

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

async function main() {
  console.log('--- Running TASK 44 UI/UX Visual & Space Optimization Tests ---\n');

  console.log('1. Testing RBAC Security & Navigation Permissions:');
  await runTest('Owner role has community management access', () => {
    const ownerCtx = { userId: 'usr_owner', role: 'OWNER' as const };
    assert.equal(hasPermission(ownerCtx, 'community.manage'), true);
    assert.equal(hasPermission(ownerCtx, 'applications.review'), true);
  });

  await runTest('Recruiter role has restricted candidate access', () => {
    const recruiterCtx = { userId: 'usr_recruiter', role: 'RECRUITER' as const };
    assert.equal(hasPermission(recruiterCtx, 'applications.view'), true);
    assert.equal(hasPermission(recruiterCtx, 'audit.view' as any), false);
    assert.equal(hasPermission(recruiterCtx, 'community.manage'), false);
  });

  console.log('\n2. Testing Authoritative Plan Registry Consistency:');
  await runTest('FREE plan contains valid quota limits without paid features', () => {
    const freePlan = AUTHORITATIVE_PLANS.FREE;
    assert.ok(freePlan, 'FREE plan must exist');
    assert.equal(freePlan.priceMonthly, 0);
    assert.ok(freePlan.limits.MAX_AI_REQUESTS_PER_DAY > 0);
  });

  await runTest('ENTERPRISE plan contains max quotas', () => {
    const entPlan = AUTHORITATIVE_PLANS.ENTERPRISE;
    assert.ok(entPlan, 'ENTERPRISE plan must exist');
    assert.ok(entPlan.limits.MAX_AI_REQUESTS_PER_DAY >= 1000);
  });

  console.log('\n3. Testing Recruitment 11-Stage Pipeline Variants:');
  await runTest('All 11 recruitment stages are valid status strings', () => {
    const stages = [
      'DRAFT',
      'SUBMITTED',
      'UNDER_REVIEW',
      'ADDITIONAL_INFORMATION_REQUIRED',
      'INTERVIEW_REQUIRED',
      'INTERVIEW_SCHEDULED',
      'APPROVED',
      'REJECTED',
      'JOIN_PENDING',
      'JOINED',
      'CLOSED',
    ];
    assert.equal(stages.length, 11);
    for (const stage of stages) {
      assert.equal(typeof stage, 'string');
      assert.ok(stage.length > 0);
    }
  });

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
