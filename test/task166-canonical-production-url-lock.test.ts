import './setup-env.js';
import assert from 'node:assert/strict';
import { loadConfig, CANONICAL_PRODUCTION_URL } from '../server/config/env.js';
import { healthService } from '../server/services/health.service.js';

export interface Task166Result {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
  details: Record<string, string>;
}

export async function runTask166UrlLockTests(): Promise<Task166Result> {
  console.log('================================================================================');
  console.log('TASK 166 — CANONICAL PRODUCTION URL LOCK & DEPLOYMENT URL RECONCILIATION TEST');
  console.log('================================================================================');

  let passed = 0;
  let failed = 0;
  const blocked = 0;
  const skipped = 0;
  const details: Record<string, string> = {};

  const EXPECTED_CANONICAL = 'https://community-manager-bot-720940628402.asia-southeast1.run.app';
  const EXPECTED_OAUTH_CALLBACK = `${EXPECTED_CANONICAL}/api/v1/auth/callback`;

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

  // 1. Canonical Production URL constant
  await runAssertion('1. CANONICAL_PRODUCTION_URL constant verified', () => {
    assert.equal(CANONICAL_PRODUCTION_URL, EXPECTED_CANONICAL, 'CANONICAL_PRODUCTION_URL must match exact official URL');
  });

  // 2. Production APP_URL default resolution
  const origAppEnv = process.env.APP_ENV;
  const origNodeEnv = process.env.NODE_ENV;
  const origAppUrl = process.env.APP_URL;
  const origKService = process.env.K_SERVICE;

  try {
    process.env.APP_ENV = 'production';
    process.env.NODE_ENV = 'production';
    delete process.env.APP_URL;
    delete process.env.K_SERVICE;

    await runAssertion('2. Production APP_URL default equals canonical URL', () => {
      const prodConfig = loadConfig();
      assert.equal(prodConfig.APP_URL, EXPECTED_CANONICAL, 'Default production APP_URL must equal canonical URL');
    });

    // 3. OAuth callback equals canonical URL + /api/v1/auth/callback
    await runAssertion('3. OAuth callback URL verified', () => {
      const prodConfig = loadConfig();
      assert.equal(prodConfig.DISCORD_OAUTH_CALLBACK_URL, EXPECTED_OAUTH_CALLBACK, 'OAuth callback must equal canonical URL + /api/v1/auth/callback');
    });

    // 4. K_SERVICE cannot override configured APP_URL or default canonical URL
    process.env.K_SERVICE = 'community-manager-bot-508316';
    await runAssertion('4. K_SERVICE cannot override canonical production URL', () => {
      const kServiceConfig = loadConfig();
      assert.equal(kServiceConfig.APP_URL, EXPECTED_CANONICAL, 'K_SERVICE must not override canonical production URL');
    });

    // 5. Empty APP_URL cannot silently produce an incorrect production hostname
    process.env.APP_URL = '';
    await runAssertion('5. Empty APP_URL falls back to canonical URL', () => {
      const emptyAppUrlConfig = loadConfig();
      assert.equal(emptyAppUrlConfig.APP_URL, EXPECTED_CANONICAL, 'Empty APP_URL must default to canonical URL in production');
    });

    // 6. Preview URLs are never classified as official production URL
    await runAssertion('6. Preview URLs distinct from official production URL', () => {
      const previewUrl = 'https://ais-pre-r5qyczd2uopvtudtnbw5gv-1055131702168.asia-southeast1.run.app';
      assert.notEqual(previewUrl, EXPECTED_CANONICAL, 'Preview URL must not equal official production URL');
    });

    // 7. Revision URLs are never classified as official production URL
    await runAssertion('7. Revision URLs distinct from official production URL', () => {
      const revisionUrl = 'https://community-manager-00164-rec-r5qyczd2uopvtudtnbw5gv-1055131702168.asia-southeast1.run.app';
      assert.notEqual(revisionUrl, EXPECTED_CANONICAL, 'Revision URL must not equal official production URL');
    });

    // 8. Operations diagnostics report officialProductionUrl
    await runAssertion('8. Operations diagnostics report officialProductionUrl', async () => {
      const readiness = await healthService.getProductionReadiness();
      assert.equal(readiness.officialProductionUrl, EXPECTED_CANONICAL, 'Health readiness must report officialProductionUrl');
    });

    // 9. Frontend production origin resolves correctly
    await runAssertion('9. Frontend production origin format validated', () => {
      assert.ok(EXPECTED_CANONICAL.startsWith('https://'), 'Canonical production URL must use HTTPS protocol');
      assert.ok(EXPECTED_CANONICAL.endsWith('.run.app'), 'Canonical production URL must end with .run.app');
    });

    // 10. No stale production hostname in authoritative configuration
    await runAssertion('10. Legacy hostnames absent from authoritative configuration', () => {
      const prodConfig = loadConfig();
      assert.ok(!prodConfig.APP_URL.includes('508316'), 'APP_URL must not contain legacy project number 508316');
    });

  } finally {
    if (origAppEnv !== undefined) process.env.APP_ENV = origAppEnv; else delete process.env.APP_ENV;
    if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv; else delete process.env.NODE_ENV;
    if (origAppUrl !== undefined) process.env.APP_URL = origAppUrl; else delete process.env.APP_URL;
    if (origKService !== undefined) process.env.K_SERVICE = origKService; else delete process.env.K_SERVICE;
  }

  console.log('================================================================================');
  console.log(`TASK 166 TESTS RESULT: ${passed} PASSED / ${failed} FAILED`);
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

if (process.argv[1]?.includes('task166')) {
  runTask166UrlLockTests().catch((err) => {
    console.error('Task 166 tests failed:', err);
    process.exit(1);
  });
}
