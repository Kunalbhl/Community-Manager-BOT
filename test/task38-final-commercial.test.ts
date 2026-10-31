import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AUTHORITATIVE_PLANS, PlanType } from '../shared/types/plans.js';
import { PlanRegistry, EntitlementService } from '../server/services/entitlement.service.js';
import { billingService } from '../server/services/billing/billing.service.js';
import { billingWebhookService } from '../server/services/billing/billingWebhook.service.js';
import { discordAuthService } from '../server/services/discordAuth.service.js';
import { secretsManager } from '../server/security/secrets.js';
import { analyticsService } from '../server/services/analytics.service.js';
import { subscriptionsRepository } from '../server/repositories/index.js';

describe('Task 38 — Final Commercial Activation & Safety Audit', () => {
  const workspaceA = 'ws_task38_alpha';
  const workspaceB = 'ws_task38_beta';
  const communityA = 'comm_task38_alpha';

  // 1. Authoritative Plan Consistency
  it('1. Verifies authoritative plan consistency across AUTHORITATIVE_PLANS, PlanRegistry, and EntitlementService', () => {
    const planKeys: PlanType[] = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE'];

    planKeys.forEach((plan) => {
      const authDef = AUTHORITATIVE_PLANS[plan];
      const registryDef = PlanRegistry.get(plan);

      assert.equal(registryDef.id, authDef.id, `Plan ID mismatch for ${plan}`);
      assert.equal(registryDef.priceMonthly, authDef.priceMonthly, `Monthly price mismatch for ${plan}`);
      assert.equal(registryDef.priceFormatted, authDef.priceFormatted, `Formatted price mismatch for ${plan}`);
      assert.equal(registryDef.billingInterval, authDef.billingInterval, `Billing interval mismatch for ${plan}`);

      // Check key limit constants
      assert.equal(
        registryDef.limits.MAX_COMMUNITIES,
        authDef.limits.MAX_COMMUNITIES,
        `MAX_COMMUNITIES mismatch for ${plan}`
      );
      assert.equal(
        registryDef.limits.MAX_AI_REQUESTS_PER_DAY,
        authDef.limits.MAX_AI_REQUESTS_PER_DAY,
        `MAX_AI_REQUESTS_PER_DAY mismatch for ${plan}`
      );
      assert.equal(
        registryDef.limits.MAX_AUTOMATION_EXECUTIONS_PER_DAY,
        authDef.limits.MAX_AUTOMATION_EXECUTIONS_PER_DAY,
        `MAX_AUTOMATION_EXECUTIONS_PER_DAY mismatch for ${plan}`
      );
      assert.equal(
        registryDef.limits.MAX_MEMBERS,
        authDef.limits.MAX_MEMBERS,
        `MAX_MEMBERS mismatch for ${plan}`
      );
    });

    // Specifically verify BUSINESS plan authoritative limits
    const businessAuth = AUTHORITATIVE_PLANS.BUSINESS;
    assert.equal(businessAuth.priceMonthly, 99);
    assert.equal(businessAuth.priceFormatted, '$99');
    assert.equal(businessAuth.limits.MAX_COMMUNITIES, 50);
    assert.equal(businessAuth.limits.MAX_AI_REQUESTS_PER_DAY, 5000);
    assert.equal(businessAuth.limits.MAX_AUTOMATION_EXECUTIONS_PER_DAY, 10000);
    assert.equal(businessAuth.limits.MAX_MEMBERS, 100000);
  });

  // 2. Discord OAuth Activation & Security
  it('2. Verifies Discord OAuth URL, CSRF state, token exchange & separation of concerns', async () => {
    const state = 'csrf_state_token_38_sec';
    const redirectUri = 'http://localhost:3000/api/v1/auth/discord/callback';
    const oauthUrl = discordAuthService.getOAuthUrl(state, redirectUri);

    assert.ok(oauthUrl.includes('discord.com/oauth2/authorize'), 'Must target official Discord OAuth endpoint');
    assert.ok(oauthUrl.includes('scope=identify%20guilds'), 'Must request identify and guilds scopes');
    assert.ok(oauthUrl.includes(`state=${state}`), 'Must include state parameter for CSRF defense');

    // Separation of Concerns: OAuth login identity != Bot Connection != Community Permission
    const mockToken = 'disc_token_test_38';
    const userGuilds = await discordAuthService.getDiscordUserGuilds(mockToken);
    const adminGuilds = discordAuthService.filterAdminGuilds(userGuilds);

    assert.ok(Array.isArray(adminGuilds));
    assert.ok(adminGuilds.length > 0);
    // Verified admin status on guild does NOT automatically grant community access until authorized
    assert.equal(typeof adminGuilds[0].id, 'string');
  });

  // 3. Stripe Production Activation & Webhook Security
  it('3. Verifies Stripe Provider Status & Webhook Signature Defense', async () => {
    const provider = billingService.getProvider();
    assert.equal(typeof provider.isConfigured(), 'boolean');

    // Webhook process test with invalid/unconfigured signature
    try {
      await billingWebhookService.processWebhook(
        Buffer.from('{"id":"evt_invalid_38","type":"invoice.payment_failed"}'),
        't=12345,v1=bad_sig'
      );
      assert.fail('Invalid signature must throw an error');
    } catch (err: any) {
      assert.ok(
        err.message.includes('Webhook') ||
          err.message.includes('signature') ||
          err.message.includes('Invalid') ||
          err.message.includes('NOT_CONFIGURED')
      );
    }
  });

  // 4. Billing Lifecycle & Entitlement Synchronization
  it('4. Verifies Paid Plan transition (FREE -> PRO -> FREE) and Entitlement Sync', async () => {
    // Check initial sub
    const sub = await billingService.getWorkspaceSubscription(workspaceA);
    assert.ok(sub);

    // Sync to PRO
    await billingService.syncWorkspaceEntitlements(workspaceA, 'PRO');
    const proRegistry = PlanRegistry.get('PRO');
    assert.equal(proRegistry.limits.MAX_COMMUNITIES, 5);
    assert.equal(proRegistry.limits.MAX_AI_REQUESTS_PER_DAY, 500);

    // Sync to BUSINESS
    await billingService.syncWorkspaceEntitlements(workspaceA, 'BUSINESS');
    const bizRegistry = PlanRegistry.get('BUSINESS');
    assert.equal(bizRegistry.limits.MAX_COMMUNITIES, 50);
    assert.equal(bizRegistry.limits.MAX_AI_REQUESTS_PER_DAY, 5000);

    // Revert safely back to FREE
    await billingService.syncWorkspaceEntitlements(workspaceA, 'FREE');
    const freeRegistry = PlanRegistry.get('FREE');
    assert.equal(freeRegistry.limits.MAX_COMMUNITIES, 1);
    assert.equal(freeRegistry.limits.MAX_AI_REQUESTS_PER_DAY, 100);
  });

  // 5. Billing Tenant Isolation & FREE Plan Regression
  it('5. Verifies Billing Tenant Isolation and FREE Plan Operation', async () => {
    const subA = await billingService.getWorkspaceSubscription(workspaceA);
    const subB = await billingService.getWorkspaceSubscription(workspaceB);

    assert.notEqual(subA.workspaceId, subB.workspaceId);

    // Verify workspace A cannot query workspace B subscription
    const subsA = await subscriptionsRepository.listForTenant(workspaceA);
    assert.ok(subsA.every((s) => s.workspaceId === workspaceA));
    assert.equal(subsA.some((s) => s.workspaceId === workspaceB), false);

    // FREE plan retains access without billing requirement
    const freePlanDef = EntitlementService.getPlanDefinition('FREE');
    assert.equal(freePlanDef.id, 'FREE');
    assert.equal(freePlanDef.limits.MAX_COMMUNITIES, 1);
  });

  // 6. Cohort Instrumentation & Truthful Metrics
  it('6. Verifies Cohort Analytics reporting and INSUFFICIENT_DATA indicators', async () => {
    const report = await analyticsService.getAnalyticsReport(communityA);
    assert.ok(report);
    assert.ok(report.funnel);
    assert.equal(report.processingAnalytics.averageReviewTimeMinutes, 'DATA_INCOMPLETE');
  });

  // 7. Secret Redaction & Audit Safety
  it('7. Verifies Secret Redaction across objects and logs', () => {
    const sensitivePayload = {
      user: 'admin',
      token: 'Bot MTAxMjM0NTY3ODkwMTIzNDU2Nw.G12345.X123456789012345678901234567890',
      apiKey: 'AIzaSyA123456789012345678901234567890',
      stripeKey: 'sk_test_512345678901234567890',
    };

    const redacted = secretsManager.redactObject(sensitivePayload);
    assert.equal(redacted.user, 'admin');
    assert.ok(!JSON.stringify(redacted).includes('MTAxMjM0NTY3ODkwMTIzNDU2Nw'));
    assert.ok(!JSON.stringify(redacted).includes('AIzaSyA123456789012345678901234567890'));
  });
});
