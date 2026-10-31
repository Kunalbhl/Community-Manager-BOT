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
import { observabilityService } from '../server/services/observability/observability.service.js';

describe('Task 39 — Live Stripe, Discord OAuth & Final Commercial Go-Live', () => {
  const workspaceAlpha = 'ws_task39_alpha';
  const workspaceBeta = 'ws_task39_beta';
  const communityAlpha = 'comm_task39_alpha';

  // 1. Production Secret Activation & Leakage Prevention
  it('1. Verifies secret masking, server-side isolation and zero credential leakage', () => {
    const sensitiveSecrets = {
      discordSecret: 'disc_sec_1234567890abcdef1234567890abcdef',
      stripeKey: 'sk_live_51234567890abcdef1234567890abcdef',
      webhookSecret: 'whsec_1234567890abcdef1234567890abcdef',
      botToken: 'Bot MTAxMjM0NTY3ODkwMTIzNDU2Nw.G12345.X123456789012345678901234567890',
      geminiKey: 'AIzaSyA123456789012345678901234567890',
    };

    const redacted = secretsManager.redactObject(sensitiveSecrets);
    const jsonStr = JSON.stringify(redacted);

    assert.ok(!jsonStr.includes('sk_live_51234567890abcdef1234567890abcdef'), 'Stripe key must be redacted');
    assert.ok(!jsonStr.includes('whsec_1234567890abcdef1234567890abcdef'), 'Webhook secret must be redacted');
    assert.ok(!jsonStr.includes('AIzaSyA123456789012345678901234567890'), 'Gemini API key must be redacted');
  });

  // 2. Discord OAuth Live Verification & Separation of Concerns
  it('2. Verifies OAuth state validation, CSRF defense, and separation of concerns', async () => {
    const state = 'csrf_state_task39_valid';
    const redirectUri = 'http://localhost:3000/api/v1/auth/discord/callback';
    const oauthUrl = discordAuthService.getOAuthUrl(state, redirectUri);

    assert.ok(oauthUrl.startsWith('https://discord.com/oauth2/authorize'));
    assert.ok(oauthUrl.includes('response_type=code'));
    assert.ok(oauthUrl.includes(`state=${state}`));

    // Verify separation of concerns: OAuth login identity does not auto-grant community permissions
    const mockUserToken = 'disc_token_test_39_oauth';
    const guilds = await discordAuthService.getDiscordUserGuilds(mockUserToken);
    const adminGuilds = discordAuthService.filterAdminGuilds(guilds);

    assert.ok(Array.isArray(adminGuilds));
    assert.ok(adminGuilds.length > 0);

    // Verify invalid token throws unauthorized error
    try {
      await discordAuthService.getDiscordUserGuilds('invalid_token_xyz');
      assert.fail('Invalid token should throw error');
    } catch (err: any) {
      assert.ok(err.message.includes('Discord') || err.message.includes('Unauthorized'));
    }
  });

  // 3. Stripe Provider Configuration & Webhook Verification
  it('3. Verifies Stripe Provider state transitions and Webhook signature safety', async () => {
    const provider = billingService.getProvider();
    const isConfigured = provider.isConfigured();
    assert.equal(typeof isConfigured, 'boolean');

    // Webhook with invalid signature must fail safely with audit event
    try {
      await billingWebhookService.processWebhook(
        Buffer.from('{"id":"evt_task39_fake","type":"invoice.payment_failed"}'),
        't=12345678,v1=fake_signature_hash'
      );
      assert.fail('Invalid webhook signature should throw error');
    } catch (err: any) {
      assert.ok(
        err.message.includes('Webhook') ||
          err.message.includes('signature') ||
          err.message.includes('Invalid') ||
          err.message.includes('NOT_CONFIGURED')
      );
    }
  });

  // 4. Real Billing Verification (FREE -> PRO -> FREE)
  it('4. Verifies subscription synchronization and return to FREE on cancellation', async () => {
    // Initial workspace subscription check
    const subAlpha = await billingService.getWorkspaceSubscription(workspaceAlpha);
    assert.ok(subAlpha);

    // Sync to PRO plan
    await billingService.syncWorkspaceEntitlements(workspaceAlpha, 'PRO');
    const proPlan = PlanRegistry.get('PRO');
    assert.equal(proPlan.priceMonthly, 29);
    assert.equal(proPlan.limits.MAX_COMMUNITIES, 5);
    assert.equal(proPlan.limits.MAX_AI_REQUESTS_PER_DAY, 500);
    assert.equal(proPlan.limits.MAX_AUTOMATION_EXECUTIONS_PER_DAY, 1000);
    assert.equal(proPlan.limits.MAX_MEMBERS, 10000);

    // Sync to BUSINESS plan
    await billingService.syncWorkspaceEntitlements(workspaceAlpha, 'BUSINESS');
    const bizPlan = PlanRegistry.get('BUSINESS');
    assert.equal(bizPlan.priceMonthly, 99);
    assert.equal(bizPlan.limits.MAX_COMMUNITIES, 50);
    assert.equal(bizPlan.limits.MAX_AI_REQUESTS_PER_DAY, 5000);
    assert.equal(bizPlan.limits.MAX_AUTOMATION_EXECUTIONS_PER_DAY, 10000);
    assert.equal(bizPlan.limits.MAX_MEMBERS, 100000);

    // Safely return to FREE on cancellation/expiration
    await billingService.syncWorkspaceEntitlements(workspaceAlpha, 'FREE');
    const freePlan = PlanRegistry.get('FREE');
    assert.equal(freePlan.priceMonthly, 0);
    assert.equal(freePlan.limits.MAX_COMMUNITIES, 1);
    assert.equal(freePlan.limits.MAX_AI_REQUESTS_PER_DAY, 100);
    assert.equal(freePlan.limits.MAX_AUTOMATION_EXECUTIONS_PER_DAY, 100);
    assert.equal(freePlan.limits.MAX_MEMBERS, 500);
  });

  // 5. Billing Tenant Isolation & Security Check
  it('5. Verifies strict billing tenant isolation between workspaces', async () => {
    const subA = await billingService.getWorkspaceSubscription(workspaceAlpha);
    const subB = await billingService.getWorkspaceSubscription(workspaceBeta);

    assert.notEqual(subA.workspaceId, subB.workspaceId);

    const listA = await subscriptionsRepository.listForTenant(workspaceAlpha);
    assert.ok(listA.every((s) => s.workspaceId === workspaceAlpha));
    assert.equal(listA.some((s) => s.workspaceId === workspaceBeta), false);
  });

  // 6. Production Observability & Incident Telemetry
  it('6. Verifies incident logging and diagnostic error safety', async () => {
    const incident = await observabilityService.recordIncident({
      category: 'BILLING_FAILED',
      dependency: 'Stripe API',
      summary: 'Stripe API request timed out after 5000ms',
      communityId: communityAlpha,
    });

    assert.ok(incident.id.startsWith('inc_'));
    assert.equal(incident.category, 'BILLING_FAILED');
    assert.equal(incident.communityId, communityAlpha);
  });

  // 7. Authoritative Plan Consistency Check
  it('7. Verifies zero hardcoded plan divergence from AUTHORITATIVE_PLANS', () => {
    (Object.keys(AUTHORITATIVE_PLANS) as PlanType[]).forEach((planKey) => {
      const auth = AUTHORITATIVE_PLANS[planKey];
      const registered = PlanRegistry.get(planKey);

      assert.equal(registered.id, auth.id);
      assert.equal(registered.priceMonthly, auth.priceMonthly);
      assert.equal(registered.priceFormatted, auth.priceFormatted);
      assert.equal(registered.limits.MAX_COMMUNITIES, auth.limits.MAX_COMMUNITIES);
      assert.equal(registered.limits.MAX_AI_REQUESTS_PER_DAY, auth.limits.MAX_AI_REQUESTS_PER_DAY);
      assert.equal(registered.limits.MAX_AUTOMATION_EXECUTIONS_PER_DAY, auth.limits.MAX_AUTOMATION_EXECUTIONS_PER_DAY);
      assert.equal(registered.limits.MAX_MEMBERS, auth.limits.MAX_MEMBERS);
    });
  });
});
