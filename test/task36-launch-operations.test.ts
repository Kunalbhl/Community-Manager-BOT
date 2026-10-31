import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config/env.js';
import { platformFeedbackRepository, incidentsRepository } from '../server/repositories/index.js';
import { EntitlementService } from '../server/services/entitlement.service.js';
import { analyticsService } from '../server/services/analytics.service.js';
import { observabilityService } from '../server/services/observability/observability.service.js';
import { AUTHORITATIVE_PLANS } from '../shared/types/plans.js';

describe('Task 36 — Launch Operations, Feedback & Growth Readiness', () => {
  const workspaceA = 'ws_task36_alpha';
  const workspaceB = 'ws_task36_beta';
  const communityA = 'comm_task36_alpha';

  it('1. Verifies feedback system tenant isolation and customer-scoped view', async () => {
    // Create feedback for Workspace A
    const fbA = await platformFeedbackRepository.create({
      userId: 'usr_owner_alpha',
      workspaceId: workspaceA,
      communityId: communityA,
      category: 'BUG_REPORT',
      title: 'Sync Delay',
      description: 'Discord role sync delay during peak events',
      message: 'Discord role sync delay during peak events',
      priority: 'HIGH',
      status: 'NEW',
      submittedByUserId: 'usr_owner_alpha',
      correlationId: 'corr_fb_alpha_1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Create feedback for Workspace B
    const fbB = await platformFeedbackRepository.create({
      userId: 'usr_owner_beta',
      workspaceId: workspaceB,
      category: 'FEATURE_SUGGESTION',
      title: 'Dark Mode',
      description: 'Add dark mode to customer portal',
      message: 'Add dark mode to customer portal',
      priority: 'MEDIUM',
      status: 'NEW',
      submittedByUserId: 'usr_owner_beta',
      correlationId: 'corr_fb_beta_1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Workspace A list
    const listA = await platformFeedbackRepository.listForTenant(workspaceA);
    assert.ok(listA.some((item) => item.id === fbA.id), 'Workspace A must see its own feedback');
    assert.equal(listA.some((item) => item.id === fbB.id), false, 'Workspace A MUST NOT see Workspace B feedback');

    // Workspace B list
    const listB = await platformFeedbackRepository.listForTenant(workspaceB);
    assert.ok(listB.some((item) => item.id === fbB.id), 'Workspace B must see its own feedback');
    assert.equal(listB.some((item) => item.id === fbA.id), false, 'Workspace B MUST NOT see Workspace A feedback');
  });

  it('2. Verifies Platform Owner feedback aggregation across all workspaces', async () => {
    const allFeedback = await platformFeedbackRepository.list();
    assert.ok(allFeedback.length >= 2, 'Platform owner can aggregate all feedback');
  });

  it('3. Verifies customer funnel and activation metrics', async () => {
    const analyticsReport = await analyticsService.getAnalyticsReport(communityA);
    assert.ok(analyticsReport);
    assert.ok(Array.isArray(analyticsReport.funnel), 'Funnel must be an array');
    
    // Check funnel step structure
    for (const step of analyticsReport.funnel) {
      assert.ok(typeof step.key === 'string');
      assert.ok(typeof step.label === 'string');
      assert.ok(typeof step.count === 'number');
      assert.ok(typeof step.conversionRate === 'string');
    }
  });

  it('4. Verifies INSUFFICIENT_DATA and DATA_INCOMPLETE behavior for sparse metrics', async () => {
    const sparseCommunityId = 'comm_sparse_new_999';
    const report = await analyticsService.getAnalyticsReport(sparseCommunityId);
    assert.ok(report);
    assert.equal(report.processingAnalytics.averageReviewTimeMinutes, 'DATA_INCOMPLETE');
    assert.equal(report.processingAnalytics.medianReviewTimeMinutes, 'DATA_INCOMPLETE');
  });

  it('5. Verifies incident creation and deduplication', async () => {
    const inc1 = await observabilityService.recordIncident({
      category: 'DATABASE_UNAVAILABLE',
      dependency: 'Firestore',
      summary: 'Firestore read timeout during peak query',
      severity: 'HIGH',
      correlationId: 'corr_inc_test_1',
      communityId: communityA,
      workspaceId: workspaceA,
    });

    assert.ok(inc1.id);
    assert.equal(inc1.category, 'DATABASE_UNAVAILABLE');

    // Duplicate incident
    const inc2 = await observabilityService.recordIncident({
      category: 'DATABASE_UNAVAILABLE',
      dependency: 'Firestore',
      summary: 'Firestore read timeout again',
      severity: 'HIGH',
      correlationId: 'corr_inc_test_2',
      communityId: communityA,
      workspaceId: workspaceA,
    });

    // Should deduplicate to the same open incident
    assert.equal(inc2.id, inc1.id, 'Recurring incident with same category and dependency must deduplicate');
  });

  it('6. Verifies Authoritative Plans alignment', () => {
    assert.equal(AUTHORITATIVE_PLANS.FREE.priceFormatted, '$0');
    assert.equal(AUTHORITATIVE_PLANS.PRO.priceFormatted, '$29');
    assert.equal(AUTHORITATIVE_PLANS.BUSINESS.priceFormatted, '$99');
    assert.equal(AUTHORITATIVE_PLANS.ENTERPRISE.priceFormatted, 'Custom');
  });
});
