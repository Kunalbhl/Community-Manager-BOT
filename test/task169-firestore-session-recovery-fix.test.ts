import './setup-env.js';
import assert from 'node:assert/strict';
import { loadConfig, CANONICAL_PRODUCTION_URL } from '../server/config/env.js';
import { getFirestoreDiagnostics, getFirestoreDb, tryHandleDatabaseFallback, reinitializeWithDefaultDatabase, FirestoreRepository } from '../server/repositories/firestore.repository.js';
import { discordSessionRepository } from '../server/repositories/discordSession.repository.js';
import { discordAuthService } from '../server/services/discordAuth.service.js';
import { healthService } from '../server/services/health.service.js';

export interface Task169Result {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
  details: Record<string, string>;
}

export async function runTask169Tests(): Promise<Task169Result> {
  console.log('================================================================================');
  console.log('TASK 169 — DISCORD SECRET RECONCILIATION & FIRESTORE SESSION FAILURE FIX TEST');
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
      console.log(`  ✓ Assertion Passed: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ❌ Assertion Failed: ${name}`);
      console.error(err);
      failed++;
    }
  }

  // 1. Verify Canonical APP_URL continues to be locked
  await runAssertion('1. Canonical Production URL is locked to authoritative endpoint', () => {
    assert.equal(CANONICAL_PRODUCTION_URL, EXPECTED_CANONICAL);
  });

  // 2. Safe Diagnostics are exposed correctly with no sensitive keys
  await runAssertion('2. Safe diagnostics contain activeFirestoreDatabase and no credentials', () => {
    const diag = getFirestoreDiagnostics();
    assert.ok(diag.activeFirestoreDatabase);
    assert.ok(diag.firestoreProject !== undefined);
    assert.ok(diag.firestoreClientReady !== undefined);
    assert.ok(diag.databaseFallbackActivated !== undefined);
    assert.ok(diag.databaseFallbackReason !== undefined);
    assert.ok(diag.sessionStoreReady !== undefined);

    // Assert that no sensitive fields exist
    const keys = Object.keys(diag);
    assert.ok(!keys.includes('token'));
    assert.ok(!keys.includes('credential'));
    assert.ok(!keys.includes('key'));
  });

  // 3. Document NOT_FOUND on a valid database returns null, not FIRESTORE_UNAVAILABLE
  await runAssertion('3. getById() returns null on missing session document, never throwing FIRESTORE_UNAVAILABLE', async () => {
    const missingId = 'sess_absolutely_missing_token_1234567890';
    const result = await discordSessionRepository.getByToken(missingId);
    assert.equal(result, null, 'Lookup of a non-existent session token must cleanly return null');
  });

  // 4. database ID fallback logic
  await runAssertion('4. tryHandleDatabaseFallback reinitializes client to default database on 5 NOT_FOUND', () => {
    const mockError = { message: '5 NOT_FOUND: Database projects/community-manager-bot-508316/databases/invalid-db not found' };
    const reinitialized = tryHandleDatabaseFallback(mockError);
    // If we have already fallen back, it is sticky and return firestoreInstance
    assert.ok(reinitialized !== null || getFirestoreDiagnostics().databaseFallbackActivated);
  });

  // 5. Auth session retrieval
  await runAssertion('5. Auth service session resolution is unauthenticated for missing session token', async () => {
    const session = await discordAuthService.getSessionByToken('sess_invalid_token_456');
    assert.equal(session, undefined);
  });

  // 6. Test overall diagnostics reports are robust
  await runAssertion('6. Production readiness diagnostics correctly includes aiStudioPublishedUrl', async () => {
    const report = await healthService.getProductionReadiness();
    assert.equal(report.officialProductionUrl, EXPECTED_CANONICAL);
    assert.ok(report.aiStudioPublishedUrl !== undefined);
  });

  console.log('================================================================================');
  console.log(`TASK 169 TESTS RESULT: ${passed} PASSED / ${failed} FAILED`);
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

if (process.argv[1]?.includes('task169')) {
  runTask169Tests().catch((err) => {
    console.error('Task 169 tests failed:', err);
    process.exit(1);
  });
}
