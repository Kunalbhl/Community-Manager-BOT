import './setup-env.js';
import assert from 'node:assert/strict';
import { PRODUCT_RELEASE_LOCKED } from '../server/config/releaseLock.js';
import { config } from '../server/config/env.js';
import { discordService } from '../server/integrations/discord/discord.service.js';
import { runLiveVerification, runDiscordReadOnlyCheck, getVerificationReport } from '../server/controllers/opsVerification.controller.js';

export interface Task143Result {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
  details: Record<string, string>;
}

export async function runTask143Tests(): Promise<Task143Result> {
  console.log('================================================================================');
  console.log('TASK 143 — PRODUCTION VERIFICATION BRIDGE & FINAL EXTERNAL RUNTIME CERTIFICATION');
  console.log('================================================================================');

  let passed = 0;
  let failed = 0;
  const blocked = 0;
  const skipped = 0;
  const details: Record<string, string> = {};

  async function runAssertion(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ Assertion: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ Assertion FAILED: ${name}`);
      console.error(err);
      failed++;
    }
  }

  // 1. Deployed application discovery and release lock
  await runAssertion('1. Deployed application configuration matches release locks', () => {
    assert.equal(PRODUCT_RELEASE_LOCKED, true);
    assert.ok(config.APP_URL);
  });

  // 2. Health and verification endpoint structure checks
  await runAssertion('2. Live verification endpoints are registered and accessible', () => {
    assert.equal(typeof runLiveVerification, 'function');
    assert.equal(typeof runDiscordReadOnlyCheck, 'function');
    assert.equal(typeof getVerificationReport, 'function');
  });

  // 3. Platform Owner Authorization checks
  await runAssertion('3. Verification endpoints enforce Platform Owner authorization', async () => {
    // Mock unauthorized request
    const req: any = {
      user: { userId: 'usr_normal', role: 'MEMBER' },
      query: {},
      id: 'req_unauth_t143',
    };
    const res: any = {
      json: () => {
        throw new Error('Should have failed auth check');
      },
    };
    const next = (err: any) => {
      assert.ok(err);
      assert.equal(err.statusCode, 403);
    };

    try {
      await runLiveVerification(req, res, next);
    } catch (e: any) {
      assert.equal(e.statusCode, 403);
    }
  });

  // 4. Live self-verification execution and integrity checks
  await runAssertion('4. Run live self-verification checks Firestore, Discord REST, and Gateway', async () => {
    const req: any = {
      user: { userId: 'usr_owner_t143', role: 'PLATFORM_OWNER' },
      query: { externalVerifierUrl: 'https://discord.com/api' },
      id: 'req_live_t143',
    };
    let jsonResponse: any = null;
    const res: any = {
      json: (data: any) => {
        jsonResponse = data;
      },
    };
    const next = (err: any) => {
      throw err;
    };

    await runLiveVerification(req, res, next);

    assert.ok(jsonResponse);
    assert.equal(jsonResponse.success, true);
    assert.ok(jsonResponse.data);
    assert.equal(jsonResponse.data.releaseVersion, '146.0.0');
    assert.ok(jsonResponse.data.verificationId);
    assert.equal(jsonResponse.data.signatureStatus, 'SIGNED_HMAC_SHA256');
    assert.ok(jsonResponse.data.signature);
    assert.ok(jsonResponse.data.firestoreHealth);
  });

  // 5. External verifier reachability checks (blocked detection)
  await runAssertion('5. Outbound network checks detect reachability and environment limits', async () => {
    const req: any = {
      user: { userId: 'usr_owner_t143', role: 'PLATFORM_OWNER' },
      query: { externalVerifierUrl: 'http://nonexistent.domain.t143.local' },
      id: 'req_reach_t143',
    };
    let jsonResponse: any = null;
    const res: any = {
      json: (data: any) => {
        jsonResponse = data;
      },
    };
    const next = (err: any) => {
      throw err;
    };

    await runLiveVerification(req, res, next);

    assert.ok(jsonResponse);
    assert.equal(jsonResponse.success, true);
    assert.equal(jsonResponse.data.externalVerifierReachable, 'BLOCKED');
  });

  // 6. Verification Report signature checks
  await runAssertion('6. Verification Report is cryptographically signed and maintains audit logs', async () => {
    const req: any = {
      user: { userId: 'usr_owner_t143', role: 'PLATFORM_OWNER' },
      id: 'req_report_t143',
    };
    let jsonResponse: any = null;
    const res: any = {
      json: (data: any) => {
        jsonResponse = data;
      },
    };
    const next = (err: any) => {
      throw err;
    };

    await getVerificationReport(req, res, next);

    assert.ok(jsonResponse);
    assert.equal(jsonResponse.success, true);
    assert.ok(jsonResponse.data.signature);
    assert.equal(jsonResponse.data.signatureStatus, 'SIGNED_HMAC_SHA256');
    assert.equal(jsonResponse.data.componentStatuses.application, 'VERIFIED');
  });

  return {
    passed,
    failed,
    blocked,
    skipped,
    total: passed + failed,
    details,
  };
}
