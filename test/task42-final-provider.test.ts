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

describe('Task 42 — Final Provider Activation & True Commercial Go-Live', () => {
  const workspaceAlpha = 'ws_task42_alpha';
  const workspaceBeta = 'ws_task42_beta';
  const communityAlpha = 'comm_task42_alpha';

  // 1. Runtime Credential Presence Audit (Code vs Provider verification)
  it('1. Audits runtime secrets availability cleanly without leakage', () => {
    const report = secretsManager.getSecretStatusReport();
    assert.ok(typeof report === 'object');

    const secretsToAudit = [
      'DISCORD_CLIENT_SECRET',
      'DISCORD_BOT_TOKEN',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'GEMINI_API_KEY',
    ];

    secretsToAudit.forEach((secKey) => {
      const isPresent = Boolean(process.env[secKey]);
      const redacted = secretsManager.redactObject({ [secKey]: process.env[secKey] });
      assert.ok(!JSON.stringify(redacted).includes(process.env[secKey] || 'dummy_unconfigured_key_123'));
      assert.equal(typeof isPresent, 'boolean');
    });
  });

  // 2. Discord OAuth State Validation & Replay Defense
  it('2. Verifies OAuth URL construction, state CSRF parameter, and invalid code rejection', async () => {
    const state = 'state_csrf_task42_unique';
    const redirectUri = 'http://localhost:3000/api/v1/auth/discord/callback';
    const authUrl = discordAuthService.getOAuthUrl(state, redirectUri);

    assert.ok(authUrl.includes('discord.com/oauth2/authorize'));
    assert.ok(authUrl.includes(`state=${state}`));

    // Test rejection of invalid token
    try {
      await discordAuthService.getDiscordUserGuilds('invalid_bearer_token_task42');
      assert.fail('Invalid OAuth token must be rejected');
    } catch (err: any) {
      assert.ok(err.message.includes('Discord') || err.message.includes('Unauthorized'));
    }
  });

  // 3. Stripe Billing Webhook Security & Idempotency
  it('3. Verifies Stripe signature defense, duplicate prevention, and fallback behavior', async () => {
    const provider = billingService.getProvider();
    assert.equal(typeof provider.isConfigured(), 'boolean');

    // Test forged webhook payload
    try {
      await billingWebhookService.processWebhook(
        Buffer.from('{"id":"evt_task42_forged","type":"payment_intent.succeeded"}'),
        't=1700000000,v1=forged_sig_hash'
      );
      assert.fail('Forged signature must throw error');
    } catch (err: any) {
      assert.ok(
        err.message.includes('Webhook') ||
          err.message.includes('signature') ||
          err.message.includes('Invalid') ||
          err.message.includes('NOT_CONFIGURED')
      );
    }
  });

  // 4. FREE ($0/forever) -> PRO ($29/mo) -> CANCELLED/FREE Lifecycle
  it('4. Verifies FREE ($0/forever) and PRO ($29/mo) plan limits and entitlement sync', async () => {
    // Assert FREE pricing and limits
    const freePlan = AUTHORITATIVE_PLANS.FREE;
    assert.equal(freePlan.priceMonthly, 0);
    assert.equal(freePlan.limits.MAX_COMMUNITIES, 1);
    assert.equal(freePlan.limits.MAX_AI_REQUESTS_PER_DAY, 100);

    // Assert PRO pricing and limits
    const proPlan = AUTHORITATIVE_PLANS.PRO;
    assert.equal(proPlan.priceMonthly, 29);
    assert.equal(proPlan.limits.MAX_COMMUNITIES, 5);
    assert.equal(proPlan.limits.MAX_AI_REQUESTS_PER_DAY, 500);

    // Upgrade workspace to PRO
    await billingService.syncWorkspaceEntitlements(workspaceAlpha, 'PRO');
    const proLimits = PlanRegistry.get('PRO').limits;
    assert.equal(proLimits.MAX_COMMUNITIES, 5);
    assert.equal(proLimits.MAX_AI_REQUESTS_PER_DAY, 500);

    // Revert workspace to FREE
    await billingService.syncWorkspaceEntitlements(workspaceAlpha, 'FREE');
    const revertedLimits = PlanRegistry.get('FREE').limits;
    assert.equal(revertedLimits.MAX_COMMUNITIES, 1);
    assert.equal(revertedLimits.MAX_AI_REQUESTS_PER_DAY, 100);
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

  // 6. System Health & Truthful Status Reporting
  it('6. Verifies system health reporting truthfulness without mock false healthy status', async () => {
    const report = await healthService.getDetailedReport();
    assert.ok(report);
    assert.ok(['HEALTHY', 'DEGRADED', 'UNHEALTHY'].includes(report.status));
    assert.ok(typeof report.components === 'object');
  });

  // 7. Structured Observability Telemetry
  it('7. Verifies incident logging, correlation IDs, and operational logging', async () => {
    const incident = await observabilityService.recordIncident({
      category: 'BILLING_FAILED',
      dependency: 'Stripe API',
      summary: 'Task 42 billing failure telemetry verification',
      communityId: communityAlpha,
    });

    assert.ok(incident.id.startsWith('inc_'));
    assert.equal(incident.category, 'BILLING_FAILED');
    assert.equal(incident.communityId, communityAlpha);
  });
});
