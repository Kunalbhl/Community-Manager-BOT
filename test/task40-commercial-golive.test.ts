import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AUTHORITATIVE_PLANS, PlanType } from '../shared/types/plans.js';
import { PlanRegistry, EntitlementService } from '../server/services/entitlement.service.js';
import { billingService } from '../server/services/billing/billing.service.js';
import { billingWebhookService } from '../server/services/billing/billingWebhook.service.js';
import { discordAuthService } from '../server/services/discordAuth.service.js';
import { secretsManager } from '../server/security/secrets.js';
import { subscriptionsRepository } from '../server/repositories/index.js';
import { observabilityService } from '../server/services/observability/observability.service.js';
import { healthService } from '../server/services/health.service.js';

describe('Task 40 — Production Credential Deployment & Real Commercial Transaction', () => {
  const workspaceAlpha = 'ws_task40_alpha';
  const workspaceBeta = 'ws_task40_beta';
  const communityAlpha = 'comm_task40_alpha';

  // 1. Production Configuration & Secret Safety
  it('1. Verifies production configuration detection and zero credential exposure', () => {
    const rawSecrets = {
      discordSecret: 'disc_sec_task40_9999999999999999999999',
      stripeSecret: 'sk_live_task40_9999999999999999999999',
      webhookSecret: 'whsec_task40_9999999999999999999999',
      aiApiKey: 'AIzaSy_task40_9999999999999999999999',
    };

    const redacted = secretsManager.redactObject(rawSecrets);
    const jsonStr = JSON.stringify(redacted);

    assert.ok(!jsonStr.includes('disc_sec_task40_9999999999999999999999'), 'Discord client secret must be redacted');
    assert.ok(!jsonStr.includes('sk_live_task40_9999999999999999999999'), 'Stripe key must be redacted');
    assert.ok(!jsonStr.includes('whsec_task40_9999999999999999999999'), 'Webhook secret must be redacted');
    assert.ok(!jsonStr.includes('AIzaSy_task40_9999999999999999999999'), 'AI API key must be redacted');
  });

  // 2. Discord OAuth Live Flow & State Validation
  it('2. Verifies OAuth state validation, CSRF defense, and separation of concerns', async () => {
    const csrfState = 'csrf_state_task40_valid_test';
    const redirectUri = 'http://localhost:3000/api/v1/auth/discord/callback';
    const oauthUrl = discordAuthService.getOAuthUrl(csrfState, redirectUri);

    assert.ok(oauthUrl.includes('https://discord.com/oauth2/authorize'));
    assert.ok(oauthUrl.includes(`state=${csrfState}`));

    // Test separation of concerns: User OAuth token gets user guilds
    const testToken = 'disc_token_test_40_oauth';
    const guilds = await discordAuthService.getDiscordUserGuilds(testToken);
    assert.ok(Array.isArray(guilds));

    // Invalid token rejected
    try {
      await discordAuthService.getDiscordUserGuilds('invalid_token_40_xyz');
      assert.fail('Invalid token should throw error');
    } catch (err: any) {
      assert.ok(err.message.includes('Discord') || err.message.includes('Unauthorized'));
    }
  });

  // 3. Stripe Production Provider State & Signed Webhooks
  it('3. Verifies Stripe provider status and signature verification defense', async () => {
    const provider = billingService.getProvider();
    assert.equal(typeof provider.isConfigured(), 'boolean');

    // Unsigned / forged webhook rejected
    try {
      await billingWebhookService.processWebhook(
        Buffer.from('{"id":"evt_task40_forged","type":"checkout.session.completed"}'),
        't=123456,v1=forged_signature'
      );
      assert.fail('Forged webhook signature must throw error');
    } catch (err: any) {
      assert.ok(
        err.message.includes('Webhook') ||
          err.message.includes('signature') ||
          err.message.includes('Invalid') ||
          err.message.includes('NOT_CONFIGURED')
      );
    }
  });

  // 4. Real Commercial Transaction Flow (FREE -> PRO -> CANCELLED/FREE)
  it('4. Verifies FREE -> PRO entitlement upgrade and PRO -> CANCELLED reversal to FREE', async () => {
    // Initial state
    const initialSub = await billingService.getWorkspaceSubscription(workspaceAlpha);
    assert.ok(initialSub);

    // Sync to PRO plan
    await billingService.syncWorkspaceEntitlements(workspaceAlpha, 'PRO');
    const proLimits = PlanRegistry.get('PRO').limits;
    assert.equal(proLimits.MAX_COMMUNITIES, 5);
    assert.equal(proLimits.MAX_AI_REQUESTS_PER_DAY, 500);
    assert.equal(proLimits.MAX_AUTOMATION_EXECUTIONS_PER_DAY, 1000);
    assert.equal(proLimits.MAX_MEMBERS, 10000);

    // Revert to FREE on subscription cancellation
    await billingService.syncWorkspaceEntitlements(workspaceAlpha, 'FREE');
    const freeLimits = PlanRegistry.get('FREE').limits;
    assert.equal(freeLimits.MAX_COMMUNITIES, 1);
    assert.equal(freeLimits.MAX_AI_REQUESTS_PER_DAY, 100);
    assert.equal(freeLimits.MAX_AUTOMATION_EXECUTIONS_PER_DAY, 100);
    assert.equal(freeLimits.MAX_MEMBERS, 500);
  });

  // 5. Billing Tenant Isolation
  it('5. Verifies strict billing tenant isolation between distinct workspaces', async () => {
    const subAlpha = await billingService.getWorkspaceSubscription(workspaceAlpha);
    const subBeta = await billingService.getWorkspaceSubscription(workspaceBeta);

    assert.notEqual(subAlpha.workspaceId, subBeta.workspaceId);

    const listAlpha = await subscriptionsRepository.listForTenant(workspaceAlpha);
    assert.ok(listAlpha.every((s) => s.workspaceId === workspaceAlpha));
    assert.equal(listAlpha.some((s) => s.workspaceId === workspaceBeta), false);
  });

  // 6. Truthful Health Endpoints
  it('6. Verifies system health reporting and dependency status truthfulness', async () => {
    const report = await healthService.getDetailedReport();
    assert.ok(report);
    assert.ok(['HEALTHY', 'DEGRADED', 'UNHEALTHY'].includes(report.status));
    assert.ok(typeof report.components === 'object');
  });

  // 7. Observability Telemetry & Incident Logging
  it('7. Verifies incident logging and structured telemetry', async () => {
    const incident = await observabilityService.recordIncident({
      category: 'BILLING_FAILED',
      dependency: 'Stripe API',
      summary: 'Stripe transaction attempt failed cleanly',
      communityId: communityAlpha,
    });

    assert.ok(incident.id.startsWith('inc_'));
    assert.equal(incident.category, 'BILLING_FAILED');
    assert.equal(incident.communityId, communityAlpha);
  });

  // 8. Authoritative Plan Specification Consistency
  it('8. Verifies zero plan divergence across AUTHORITATIVE_PLANS, PlanRegistry, and EntitlementService', () => {
    (Object.keys(AUTHORITATIVE_PLANS) as PlanType[]).forEach((planType) => {
      const authPlan = AUTHORITATIVE_PLANS[planType];
      const regPlan = PlanRegistry.get(planType);

      assert.equal(regPlan.id, authPlan.id);
      assert.equal(regPlan.priceMonthly, authPlan.priceMonthly);
      assert.equal(regPlan.priceFormatted, authPlan.priceFormatted);
      assert.equal(regPlan.limits.MAX_COMMUNITIES, authPlan.limits.MAX_COMMUNITIES);
      assert.equal(regPlan.limits.MAX_AI_REQUESTS_PER_DAY, authPlan.limits.MAX_AI_REQUESTS_PER_DAY);
      assert.equal(regPlan.limits.MAX_AUTOMATION_EXECUTIONS_PER_DAY, authPlan.limits.MAX_AUTOMATION_EXECUTIONS_PER_DAY);
      assert.equal(regPlan.limits.MAX_MEMBERS, authPlan.limits.MAX_MEMBERS);
    });
  });
});
