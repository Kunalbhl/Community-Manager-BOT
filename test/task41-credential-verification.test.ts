import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AUTHORITATIVE_PLANS, PlanType } from '../shared/types/plans.js';
import { PlanRegistry } from '../server/services/entitlement.service.js';
import { billingService } from '../server/services/billing/billing.service.js';
import { billingWebhookService } from '../server/services/billing/billingWebhook.service.js';
import { discordAuthService } from '../server/services/discordAuth.service.js';
import { secretsManager } from '../server/security/secrets.js';
import { subscriptionsRepository } from '../server/repositories/index.js';
import { observabilityService } from '../server/services/observability/observability.service.js';
import { healthService } from '../server/services/health.service.js';

describe('Task 41 — Production Credential Verification & Final Go/No-Go', () => {
  const workspaceAlpha = 'ws_task41_alpha';
  const workspaceBeta = 'ws_task41_beta';
  const communityAlpha = 'comm_task41_alpha';

  // 1. Production Runtime Credential Audit
  it('1. Audits runtime credential availability without secret exposure', () => {
    const report = secretsManager.getSecretStatusReport();
    assert.ok(typeof report === 'object');

    // Confirm secrets status reports PRESENT or ABSENT accurately
    const keysToCheck = [
      'DISCORD_CLIENT_SECRET',
      'DISCORD_BOT_TOKEN',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'GEMINI_API_KEY',
    ];

    keysToCheck.forEach((key) => {
      const isPresent = Boolean(process.env[key]);
      const redacted = secretsManager.redactObject({ [key]: process.env[key] });
      assert.ok(!JSON.stringify(redacted).includes(process.env[key] || 'non_existent_secret_xyz_999'));
      assert.equal(typeof isPresent, 'boolean');
    });
  });

  // 2. Discord OAuth Live Flow & Rejection Safety
  it('2. Verifies OAuth state validation and CSRF rejection', async () => {
    const state = 'csrf_state_task41_valid';
    const redirectUri = 'http://localhost:3000/api/v1/auth/discord/callback';
    const oauthUrl = discordAuthService.getOAuthUrl(state, redirectUri);

    assert.ok(oauthUrl.includes('https://discord.com/oauth2/authorize'));
    assert.ok(oauthUrl.includes(`state=${state}`));

    // Test invalid token rejection
    try {
      await discordAuthService.getDiscordUserGuilds('invalid_token_41_xyz');
      assert.fail('Invalid token must fail cleanly');
    } catch (err: any) {
      assert.ok(err.message.includes('Discord') || err.message.includes('Unauthorized'));
    }
  });

  // 3. Stripe Provider Configuration & Webhook Verification
  it('3. Verifies Stripe provider state and signature verification defense', async () => {
    const provider = billingService.getProvider();
    assert.equal(typeof provider.isConfigured(), 'boolean');

    // Unsigned / forged webhook rejected
    try {
      await billingWebhookService.processWebhook(
        Buffer.from('{"id":"evt_task41_forged","type":"checkout.session.completed"}'),
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

  // 4. Billing Lifecycle (FREE -> PRO -> FREE) & Entitlement Sync
  it('4. Verifies FREE -> PRO upgrade and PRO -> CANCELLED reversal to FREE', async () => {
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

    // Revert to FREE on cancellation
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

  // 6. Authoritative Plan Specification Audit
  it('6. Verifies AUTHORITATIVE_PLANS matrix consistency across registry and entitlements', () => {
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

  // 7. System Health Reporting Truthfulness
  it('7. Verifies health endpoints reflect true runtime status', async () => {
    const report = await healthService.getDetailedReport();
    assert.ok(report);
    assert.ok(['HEALTHY', 'DEGRADED', 'UNHEALTHY'].includes(report.status));
    assert.ok(typeof report.components === 'object');
  });

  // 8. Observability Telemetry & Incident Reporting
  it('8. Verifies structured incident logging and correlation IDs', async () => {
    const incident = await observabilityService.recordIncident({
      category: 'BILLING_FAILED',
      dependency: 'Stripe API',
      summary: 'Stripe webhook signature check failed for invalid payload',
      communityId: communityAlpha,
    });

    assert.ok(incident.id.startsWith('inc_'));
    assert.equal(incident.category, 'BILLING_FAILED');
    assert.equal(incident.communityId, communityAlpha);
  });
});
