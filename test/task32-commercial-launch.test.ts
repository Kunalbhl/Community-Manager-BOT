import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EntitlementService, PlanRegistry, FeatureRegistry } from '../server/services/entitlement.service.js';
import { billingService } from '../server/services/billing/billing.service.js';

describe('Task 32 — Commercial Launch, Pricing & Entitlements Readiness', () => {
  const testCommunityId = 'comm_task32_commercial_test';
  const testWorkspaceId = 'ws_task32_commercial_test';

  it('1. Verifies authoritative PlanRegistry definitions for all 4 plans', () => {
    const plans = PlanRegistry.getAll();
    assert.equal(plans.length, 4, 'Should contain FREE, PRO, BUSINESS, ENTERPRISE plans');

    const freePlan = PlanRegistry.get('FREE');
    assert.ok(freePlan, 'FREE plan must exist');
    assert.equal(freePlan.isDefault, true, 'FREE plan must be default');
    assert.equal(freePlan.limits.MAX_COMMUNITIES, 1);
    assert.equal(freePlan.limits.MAX_AI_REQUESTS_PER_DAY, 100);

    const proPlan = PlanRegistry.get('PRO');
    assert.ok(proPlan, 'PRO plan must exist');
    assert.equal(proPlan.limits.MAX_COMMUNITIES, 5);
    assert.equal(proPlan.limits.MAX_AI_REQUESTS_PER_DAY, 500);

    const businessPlan = PlanRegistry.get('BUSINESS');
    assert.ok(businessPlan, 'BUSINESS plan must exist');
    assert.equal(businessPlan.limits.MAX_COMMUNITIES, 50);
    assert.equal(businessPlan.limits.MAX_AI_REQUESTS_PER_DAY, 5000);

    const enterprisePlan = PlanRegistry.get('ENTERPRISE');
    assert.ok(enterprisePlan, 'ENTERPRISE plan must exist');
    assert.equal(enterprisePlan.limits.MAX_COMMUNITIES, 999);
  });

  it('2. Verifies default FREE plan initialization for a new community', async () => {
    const planObj = await EntitlementService.getPlan(testCommunityId);
    assert.equal(planObj.plan, 'FREE');
    assert.equal(planObj.subscriptionStatus, 'NOT_CONFIGURED');
    assert.equal(planObj.billingStatus, 'NOT_CONFIGURED');
  });

  it('3. Verifies feature entitlement checks for FREE plan', async () => {
    // Member directory should be allowed on FREE
    const memberDirectory = await EntitlementService.checkEntitlement(testCommunityId, 'MEMBER_DIRECTORY');
    assert.equal(memberDirectory.allowed, true);
    assert.equal(memberDirectory.status, 'AVAILABLE');

    // Multi community should require PRO upgrade
    const multiCommunity = await EntitlementService.checkEntitlement(testCommunityId, 'MULTI_COMMUNITY');
    assert.equal(multiCommunity.allowed, false);
    assert.equal(multiCommunity.status, 'BILLING_REQUIRED');
    assert.equal(multiCommunity.requiredPlan, 'PRO');

    // API Access should require BUSINESS upgrade
    const apiAccess = await EntitlementService.checkEntitlement(testCommunityId, 'API_ACCESS');
    assert.equal(apiAccess.allowed, false);
    assert.equal(apiAccess.status, 'BILLING_REQUIRED');
    assert.equal(apiAccess.requiredPlan, 'BUSINESS');
  });

  it('4. Verifies authoritative usage limit enforcement', async () => {
    const allowedFirst = await EntitlementService.checkLimit(testCommunityId, 'MAX_AI_REQUESTS_PER_DAY', 1);
    assert.equal(allowedFirst, true, 'First request should be allowed');

    const usage = await EntitlementService.getUsage(testCommunityId);
    assert.ok(usage.ai_requests, 'AI requests snapshot present');
    assert.equal(usage.ai_requests.limit, 100);
  });

  it('5. Verifies billing status handles NOT_CONFIGURED gracefully', async () => {
    const sub = await billingService.getWorkspaceSubscription(testWorkspaceId);
    assert.ok(sub);
    assert.equal(sub.plan, 'FREE');
    assert.equal(sub.status, 'NOT_CONFIGURED');
  });

  it('6. Verifies checkout session when provider is unconfigured', async () => {
    const result = await billingService.requestPlanChange('usr_test_admin', 'OWNER', testWorkspaceId, 'PRO');
    assert.ok(result.checkout);
    assert.equal(result.checkout.status, 'BILLING_NOT_CONFIGURED');
    assert.ok(result.checkout.message, 'Message should be present when billing is unconfigured');
  });
});
