import './setup-env.js';
import assert from 'node:assert/strict';
import { loadConfig, CANONICAL_PRODUCTION_URL } from '../server/config/env.js';
import { discordSessionRepository } from '../server/repositories/discordSession.repository.js';
import { discordAuthService } from '../server/services/discordAuth.service.js';
import { healthService } from '../server/services/health.service.js';

export interface Task168Result {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
  details: Record<string, string>;
}

export async function runTask168Tests(): Promise<Task168Result> {
  console.log('================================================================================');
  console.log('TASK 168 — CANONICAL CLOUD RUN AUTHORITY & FIRESTORE SESSION RECOVERY TEST');
  console.log('================================================================================');

  let passed = 0;
  let failed = 0;
  const blocked = 0;
  const skipped = 0;
  const details: Record<string, string> = {};

  const EXPECTED_CANONICAL = 'https://community-manager-bot-720940628402.asia-southeast1.run.app';

  async function runAssertion(name: string, fn: () => void | Promise<void>) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ Assertion FAILED: ${name}`);
      console.error(err);
      failed++;
    }
  }

  // 1. Canonical Production URL Lock
  await runAssertion('1. Canonical Production URL is locked to exact run.app endpoint', () => {
    assert.equal(CANONICAL_PRODUCTION_URL, EXPECTED_CANONICAL);
  });

  // 2. Missing session lookup returns null without throwing FIRESTORE_UNAVAILABLE
  await runAssertion('2. Missing session document lookup returns null without FIRESTORE_UNAVAILABLE exception', async () => {
    const nonExistentToken = 'sess_non_existent_token_999999999999';
    const result = await discordSessionRepository.getByToken(nonExistentToken);
    assert.equal(result, null, 'Missing session token lookup must return null, not throw error');
  });

  // 3. Service level session lookup for missing token returns undefined
  await runAssertion('3. Service level session lookup returns undefined for invalid session token', async () => {
    const nonExistentToken = 'sess_invalid_token_xyz_888';
    const session = await discordAuthService.getSessionByToken(nonExistentToken);
    assert.equal(session, undefined, 'Invalid session token must resolve to undefined');
  });

  // 4. Operations readiness reports officialProductionUrl separately
  await runAssertion('4. Operations readiness reports officialProductionUrl accurately', async () => {
    const readiness = await healthService.getProductionReadiness();
    assert.equal(readiness.officialProductionUrl, EXPECTED_CANONICAL);
    assert.ok(readiness.appUrl, 'appUrl field must be populated');
  });

  // 5. Config resolution locks production URL
  await runAssertion('5. Production environment loadConfig resolves canonical APP_URL', () => {
    const origAppEnv = process.env.APP_ENV;
    const origNodeEnv = process.env.NODE_ENV;
    const origAppUrl = process.env.APP_URL;

    try {
      process.env.APP_ENV = 'production';
      process.env.NODE_ENV = 'production';
      delete process.env.APP_URL;

      const cfg = loadConfig();
      assert.equal(cfg.APP_URL, EXPECTED_CANONICAL);
      assert.equal(cfg.DISCORD_OAUTH_CALLBACK_URL, `${EXPECTED_CANONICAL}/api/v1/auth/callback`);
    } finally {
      if (origAppEnv !== undefined) process.env.APP_ENV = origAppEnv; else delete process.env.APP_ENV;
      if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv; else delete process.env.NODE_ENV;
      if (origAppUrl !== undefined) process.env.APP_URL = origAppUrl; else delete process.env.APP_URL;
    }
  });

  console.log('================================================================================');
  console.log(`TASK 168 TESTS RESULT: ${passed} PASSED / ${failed} FAILED`);
  console.log('================================================================================');

  return {
    passed,
    failed,
    blocked,
    skipped,
    total: passed + failed + blocked + skipped,
    details,
  };
}

if (process.argv[1]?.includes('task168')) {
  runTask168Tests().catch((err) => {
    console.error('Task 168 tests failed:', err);
    process.exit(1);
  });
}
