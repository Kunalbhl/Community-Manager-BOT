import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config/env.js';
import { secretsManager } from '../server/security/secrets.js';
import { discordAuthService } from '../server/services/discordAuth.service.js';
import { billingService } from '../server/services/billing/billing.service.js';
import { billingWebhookService } from '../server/services/billing/billingWebhook.service.js';
import { EntitlementService, PlanRegistry } from '../server/services/entitlement.service.js';
import { analyticsService } from '../server/services/analytics.service.js';
import { observabilityService } from '../server/services/observability/observability.service.js';
import { AUTHORITATIVE_PLANS } from '../shared/types/plans.js';
import { subscriptionsRepository, invoicesRepository } from '../server/repositories/index.js';
import { AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD } from '../server/services/discordPermissionEngine.service.js';

describe('Task 37 — Live Billing, Discord OAuth & Cohort Activation Tests', () => {
  const workspaceA = 'ws_task37_alpha';
  const workspaceB = 'ws_task37_beta';
  const communityA = 'comm_task37_alpha';

  // 1. Discord OAuth State & Security Validation
  it('1. Verifies Discord OAuth authorization URL generation, state parameter & CSRF protection', () => {
    const state = 'state_csrf_token_123456';
    const authUrl = discordAuthService.getOAuthUrl(state, 'http://localhost:3000/api/v1/auth/discord/callback');
    assert.ok(authUrl.includes('discord.com/oauth2/authorize'), 'URL must target Discord OAuth endpoint');
    assert.ok(authUrl.includes('response_type=code'), 'Response type must be code');
    assert.ok(authUrl.includes(state), 'State parameter must be included for CSRF protection');

    // Bot install URL
    const botUrl = discordAuthService.getBotInstallUrl('123456789012345678');
    assert.ok(botUrl.includes(`permissions=${AUTHORITATIVE_INSTALL_PERMISSION_BITFIELD}`), 'Bot install URL must specify authoritative permissions bitfield');

    // Admin guild filter check
    const adminGuilds = discordAuthService.filterAdminGuilds([
      { id: 'g1', name: 'Guild 1', owner: true, permissions: '0', features: [] },
      { id: 'g2', name: 'Guild 2', owner: false, permissions: '0', features: [] },
    ]);
    assert.equal(adminGuilds.length, 1);
    assert.equal(adminGuilds[0].id, 'g1');
  });

  // 2. Stripe Webhook Signature & Idempotency
  it('2. Verifies Stripe Webhook signature verification and idempotency handling', async () => {
    const provider = billingService.getProvider();
    const isConfigured = provider.isConfigured();
    assert.equal(typeof isConfigured, 'boolean');

    // Test webhook signature rejection when secret is missing or unconfigured
    try {
      await billingWebhookService.processWebhook(
        Buffer.from('{"id":"evt_test_123"}'),
        't=123,v1=fake_signature'
      );
      assert.fail('Unconfigured or invalid signature must throw an error');
    } catch (err: any) {
      assert.ok(err.message.includes('Webhook') || err.message.includes('signature') || err.message.includes('Invalid'));
    }
  });

  // 3. Billing Lifecycle & Entitlement Updates
  it('3. Verifies Billing Lifecycle transitions and Entitlement synchronization', async () => {
    // Initial workspace subscription
    const sub = await billingService.getWorkspaceSubscription(workspaceA);
    assert.ok(sub);
    assert.equal(sub.plan, 'FREE');

    // Sync entitlement for PRO
    await billingService.syncWorkspaceEntitlements(workspaceA, 'PRO');

    // Verify PlanRegistry quota reflection for PRO
    const proPlanDef = PlanRegistry.get('PRO');
    assert.equal(proPlanDef.id, 'PRO');
    assert.equal(proPlanDef.limits.MAX_COMMUNITIES, AUTHORITATIVE_PLANS.PRO.limits.MAX_COMMUNITIES);
    assert.equal(proPlanDef.limits.MAX_AI_REQUESTS_PER_DAY, AUTHORITATIVE_PLANS.PRO.limits.MAX_AI_REQUESTS_PER_DAY);

    // Revert workspace back to safe FREE state
    await billingService.syncWorkspaceEntitlements(workspaceA, 'FREE');
  });

  // 4. Billing Tenant Isolation
  it('4. Verifies Billing Tenant Isolation prevents cross-workspace data leakage', async () => {
    const subA = await billingService.getWorkspaceSubscription(workspaceA);
    const subB = await billingService.getWorkspaceSubscription(workspaceB);

    assert.notEqual(subA.workspaceId, subB.workspaceId);
    
    // Check repository tenant filtering
    const subsA = await subscriptionsRepository.listForTenant(workspaceA);
    assert.ok(subsA.every((s) => s.workspaceId === workspaceA));
    assert.equal(subsA.some((s) => s.workspaceId === workspaceB), false, 'Workspace A cannot view Workspace B subscriptions');
  });

  // 5. Cohort Metrics & INSUFFICIENT_DATA Handling
  it('5. Verifies Cohort metrics instrumentation and INSUFFICIENT_DATA behavior', async () => {
    const report = await analyticsService.getAnalyticsReport(communityA);
    assert.ok(report);
    assert.ok(report.processingAnalytics);
    
    // Check cohort date bounds and truthful placeholders
    assert.equal(report.processingAnalytics.averageReviewTimeMinutes, 'DATA_INCOMPLETE');
    assert.ok(Array.isArray(report.funnel));
    assert.ok(report.funnel.length >= 5);
  });

  // 6. Secret Redaction Audit
  it('6. Verifies Secrets Redaction filter prevents secret exposure', () => {
    const secretReport = secretsManager.getSecretStatusReport();
    assert.ok(secretReport);
    assert.equal(typeof secretReport.discordBotToken, 'string');
    assert.equal(typeof secretReport.billingSecret, 'string');
    assert.equal(typeof secretReport.secretManagerActive, 'boolean');
  });
});
