import assert from 'assert';
import { loadConfig } from '../server/config/env.js';
import { validateEnvironment } from '../server/config/envValidation.js';
import { verifyPlatformClaim } from '../server/middleware/auth.js';
import { getLiveness, getReadiness } from '../server/controllers/health.controller.js';
import { healthService } from '../server/services/health.service.js';

export async function runTask53aTests(): Promise<{ passed: number; failed: number }> {
  console.log('\n==================================================');
  console.log('TASK 53A — PRODUCTION SECURITY & CLOUD RUN SUITE');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    return (async () => {
      try {
        await fn();
        console.log(`  [PASS] ${name}`);
        passed++;
      } catch (err: any) {
        console.error(`  [FAIL] ${name}: ${err.message}`);
        failed++;
      }
    })();
  }

  // 1. CLOUD RUN PORT TESTING
  await test('1.1 Honors process.env.PORT when specified (e.g. 8080)', () => {
    const originalPort = process.env.PORT;
    try {
      process.env.PORT = '8080';
      const config = loadConfig();
      assert.strictEqual(config.PORT, 8080, 'Must parse and honor PORT=8080');
    } finally {
      process.env.PORT = originalPort;
    }
  });

  await test('1.2 Falls back to 3000 when PORT is not set', () => {
    const originalPort = process.env.PORT;
    try {
      delete process.env.PORT;
      const config = loadConfig();
      assert.strictEqual(config.PORT, 3000, 'Must fall back to 3000');
    } finally {
      process.env.PORT = originalPort;
    }
  });

  // 2. PRODUCTION SESSION_SECRET VALIDATION
  await test('2.1 Rejects missing or weak SESSION_SECRET in production', () => {
    const dummyProdConfig: any = {
      NODE_ENV: 'production',
      PORT: 8080,
      APP_URL: 'https://ais-pre-r5qyczd2uopvtudtnbw5gv-1055131702168.asia-southeast1.run.app',
      GOOGLE_CLOUD_PROJECT_ID: 'community-manager-bot-508316',
      FIRESTORE_DATABASE_ID: 'ai-studio-communityrecruit-59f17f1d-8b74-490e-9248-bc41e69de7ef',
      PLATFORM_OWNER_EMAIL: 'kunalpareekusa@gmail.com',
      SESSION_SECRET: undefined, // Missing
    };

    const result = validateEnvironment(dummyProdConfig);
    assert.strictEqual(result.valid, false, 'Validation must fail when SESSION_SECRET is missing in production');
    assert.ok(
      result.missingRequired.some((v) => v.includes('SESSION_SECRET')),
      'Must report missing SESSION_SECRET'
    );
  });

  await test('2.2 Validates cleanly when secure SESSION_SECRET is configured in production', () => {
    const dummyProdConfig: any = {
      NODE_ENV: 'production',
      PORT: 8080,
      APP_URL: 'https://ais-pre-r5qyczd2uopvtudtnbw5gv-1055131702168.asia-southeast1.run.app',
      GOOGLE_CLOUD_PROJECT_ID: 'community-manager-bot-508316',
      FIRESTORE_DATABASE_ID: 'ai-studio-communityrecruit-59f17f1d-8b74-490e-9248-bc41e69de7ef',
      PLATFORM_OWNER_EMAIL: 'kunalpareekusa@gmail.com',
      SESSION_SECRET: 'crypto-secure-secret-key-32-chars-long-prod',
    };

    const result = validateEnvironment(dummyProdConfig);
    assert.strictEqual(result.valid, true, 'Validation must pass when secure config is provided');
  });

  // 3. PLATFORM OWNER / ADMIN KEY VERIFICATION
  await test('3.1 Rejects dev platform claim token in production', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const dummyReq: any = {
        header: (name: string) => (name === 'x-platform-key' ? 'cr_platform_verified_claim_token' : undefined),
      };
      const isClaimValid = verifyPlatformClaim(dummyReq);
      assert.strictEqual(isClaimValid, false, 'Dev claim token must be rejected in production');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  await test('3.2 Rejects client x-user-id header from claiming platform owner in production', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const dummyReq: any = {
        header: (name: string) => (name === 'x-user-id' ? 'kunalpareekusa' : undefined),
      };
      // Without resolved authenticated session (resolvedUserId is undefined), verification must fail
      const isClaimValid = verifyPlatformClaim(dummyReq, undefined);
      assert.strictEqual(isClaimValid, false, 'Unauthenticated x-user-id header must not grant platform owner');
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  // 4. HEALTH & READINESS PROBE SEMANTICS
  await test('4.1 Liveness probe reports process UP independently of external services', () => {
    let statusCode = 0;
    let body: any = null;
    const dummyReq: any = {};
    const dummyRes: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => {
            body = data;
          },
        };
      },
    };

    getLiveness(dummyReq, dummyRes);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(body.status, 'UP');
    assert.ok(typeof body.uptimeSeconds === 'number');
  });

  await test('4.2 Readiness probe returns READY with accurate component breakdown', async () => {
    let statusCode = 0;
    let body: any = null;
    const dummyReq: any = {};
    const dummyRes: any = {
      status: (code: number) => {
        statusCode = code;
        return {
          json: (data: any) => {
            body = data;
          },
        };
      },
    };

    await getReadiness(dummyReq, dummyRes);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(body.status, 'READY');
    assert.ok(body.checks, 'Checks breakdown must be present');
  });

  console.log('\n==================================================');
  console.log(`TASK 53A TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  if (failed > 0 && process.argv[1]?.includes('task53a-security-hardening')) {
    process.exit(1);
  }
  return { passed, failed };
}

if (process.argv[1]?.includes('task53a-security-hardening')) {
  runTask53aTests().catch((err) => {
    console.error('Fatal test error:', err);
    process.exit(1);
  });
}
