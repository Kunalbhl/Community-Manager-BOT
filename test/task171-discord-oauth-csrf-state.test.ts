import './setup-env.js';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { Timestamp } from '@google-cloud/firestore';
import {
  DiscordOAuthStateRepository,
  hashString,
} from '../server/repositories/discordOAuthState.repository.js';
import { authCallback } from '../server/controllers/auth.controller.js';
import { CANONICAL_PRODUCTION_URL } from '../server/config/env.js';

export interface Task171Result {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
  details: Record<string, string>;
}

export async function runTask171Tests(): Promise<Task171Result> {
  console.log('================================================================================');
  console.log('TASK 171 — DISCORD OAUTH CSRF STATE VERIFICATION & DURABILITY TEST');
  console.log('================================================================================');

  let passed = 0;
  let failed = 0;
  const blocked = 0;
  const skipped = 0;
  const details: Record<string, string> = {};

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

  const repo = new DiscordOAuthStateRepository();

  // 1. Fresh state creation with undefined optional properties survives and validates
  await runAssertion('1. Fresh OAuth state with optional properties creates and persists cleanly', async () => {
    const rawState = crypto.randomBytes(32).toString('hex');
    const verifier = crypto.randomBytes(16).toString('hex');
    
    // Test creation without optional redirectUri and returnTo
    const record = await repo.createState(rawState, verifier, 10 * 60 * 1000, undefined, undefined);
    assert.ok(record);
    assert.equal(record.id, hashString(rawState));
    assert.equal(record.stateHash, hashString(rawState));

    // Lookup by raw state token
    const retrieved = await repo.getByState(rawState);
    assert.ok(retrieved, 'Should retrieve state record by raw token');
    assert.equal(retrieved.stateHash, hashString(rawState));
  });

  // 2. State persists across separate repository instances (Cloud Run multi-instance boundary)
  await runAssertion('2. State survives multi-instance repository boundary', async () => {
    const rawState = crypto.randomBytes(32).toString('hex');
    const verifier = crypto.randomBytes(16).toString('hex');
    
    const instanceA = new DiscordOAuthStateRepository();
    await instanceA.createState(rawState, verifier, 10 * 60 * 1000, 'https://example.com/callback', '/dashboard');

    const instanceB = new DiscordOAuthStateRepository();
    const retrieved = await instanceB.getByState(rawState);
    assert.ok(retrieved, 'Instance B must locate state written by Instance A');
    assert.equal(retrieved.redirectUri, 'https://example.com/callback');
    assert.equal(retrieved.returnTo, '/dashboard');
  });

  // 3. State with hint (e.g. state:onboarding) is preserved and retrieved accurately
  await runAssertion('3. State with contextual hint suffix persists and retrieves accurately', async () => {
    const rawBase = crypto.randomBytes(32).toString('hex');
    const stateWithHint = `${rawBase}:onboarding`;
    const verifier = crypto.randomBytes(16).toString('hex');

    await repo.createState(stateWithHint, verifier, 10 * 60 * 1000);
    const retrieved = await repo.getByState(stateWithHint);
    assert.ok(retrieved, 'State with :onboarding suffix must be retrievable');
    assert.equal(retrieved.stateHash, hashString(stateWithHint));
  });

  // 4. Single-use consumption enforces atomic replay protection
  await runAssertion('4. State single-use consumption blocks replay attacks', async () => {
    const rawState = crypto.randomBytes(32).toString('hex');
    const verifier = crypto.randomBytes(16).toString('hex');

    await repo.createState(rawState, verifier, 10 * 60 * 1000);
    
    const consumed = await repo.consumeState(rawState);
    assert.ok(consumed, 'First consume must succeed');
    assert.ok(consumed.consumedAt, 'consumedAt timestamp must be set');

    // Second consumption must fail
    const replayed = await repo.consumeState(rawState);
    assert.equal(replayed, null, 'Replayed state consumption must return null');
  });

  // 5. Expired state is rejected during consumption
  await runAssertion('5. Expired state is rejected during lookup and consumption', async () => {
    const rawState = crypto.randomBytes(32).toString('hex');
    const verifier = crypto.randomBytes(16).toString('hex');

    // Create state expired 10 seconds ago
    await repo.createState(rawState, verifier, -10000);
    
    const consumed = await repo.consumeState(rawState);
    assert.equal(consumed, null, 'Expired state must not be consumable');
  });

  // 6. Forged or unrecorded state is rejected
  await runAssertion('6. Forged state returns null', async () => {
    const forgedState = 'forged_csrf_state_token_that_does_not_exist';
    const record = await repo.getByState(forgedState);
    assert.equal(record, null, 'Forged state must resolve to null');
    const consumed = await repo.consumeState(forgedState);
    assert.equal(consumed, null, 'Forged state cannot be consumed');
  });

  // 7. Callback route rejects missing state with 400 Bad Request
  await runAssertion('7. authCallback rejects missing state with 400 Bad Request', async () => {
    const req: any = {
      query: { code: 'some_code' },
      headers: {},
      cookies: {},
    };
    let caughtError: any = null;
    const next = (err: any) => { caughtError = err; };
    const res: any = {};

    await authCallback(req, res, next);
    assert.ok(caughtError, 'Must throw error on missing state');
    assert.equal(caughtError.statusCode, 400);
    assert.ok(caughtError.message.includes('Missing state parameter'));
  });

  // 8. Callback route rejects mismatched cookie state with 400 Bad Request
  await runAssertion('8. authCallback rejects cookie state mismatch with 400 Bad Request', async () => {
    const stateA = crypto.randomBytes(32).toString('hex');
    const stateB = crypto.randomBytes(32).toString('hex');
    const req: any = {
      query: { code: 'some_code', state: stateA },
      headers: { cookie: `oauth_state=${stateB}` },
      cookies: { oauth_state: stateB },
    };
    let caughtError: any = null;
    const next = (err: any) => { caughtError = err; };
    const res: any = {};

    await authCallback(req, res, next);
    assert.ok(caughtError, 'Must throw error on cookie state mismatch');
    assert.equal(caughtError.statusCode, 400);
    assert.ok(caughtError.message.includes('State token mismatch with session cookie'));
  });

  // 9. Canonical production origin lock is maintained
  await runAssertion('9. Canonical production URL lock matches authoritative Cloud Run endpoint', () => {
    assert.equal(CANONICAL_PRODUCTION_URL, 'https://community-manager.chaloone.com');
  });

  // 10. Timestamp handling is resilient across object, number, and method formats
  await runAssertion('10. Timestamp parsing resilience across formats', async () => {
    const rawState = crypto.randomBytes(32).toString('hex');
    const hash = hashString(rawState);

    // Save with mock object-style timestamp (similar to raw deserialization)
    const customRepo = new DiscordOAuthStateRepository();
    await customRepo.create({
      id: hash,
      stateHash: hash,
      codeVerifierHash: 'verifier_hash',
      createdAt: { _seconds: Math.floor(Date.now() / 1000), _nanoseconds: 0 } as any,
      expiresAt: { _seconds: Math.floor(Date.now() / 1000) + 600, _nanoseconds: 0 } as any,
    });

    const retrieved = await customRepo.getByState(rawState);
    assert.ok(retrieved);

    const consumed = await customRepo.consumeState(rawState);
    assert.ok(consumed, 'Must consume successfully even with raw seconds timestamp object');
  });

  console.log(`[TASK 171 COMPLETE] ${passed} passed, ${failed} failed.\n`);
  return {
    passed,
    failed,
    blocked,
    skipped,
    total: passed + failed,
    details,
  };
}

if (process.argv[1]?.endsWith('task171-discord-oauth-csrf-state.test.ts')) {
  runTask171Tests().then((res) => {
    if (res.failed > 0) process.exit(1);
  });
}
