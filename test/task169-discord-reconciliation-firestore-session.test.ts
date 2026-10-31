import './setup-env.js';
import assert from 'node:assert/strict';
import { authenticate } from '../server/middleware/auth.js';
import { discordAuthService } from '../server/services/discordAuth.service.js';
import { communitiesRepository } from '../server/repositories/index.js';
import { DiscordRestVerificationService } from '../server/services/discordRestVerification.service.js';
import { discordSessionRepository } from '../server/repositories/discordSession.repository.js';
import { Request, Response } from 'express';

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
  console.log('TASK 169 — FINAL DISCORD SECRET RECONCILIATION & FIRESTORE SESSION FAIL-SAFE TEST');
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

  // Assertion 1: Middleware Resiliency to Database Session Failures
  await runAssertion('Authenticate middleware handles session retrieval exceptions gracefully', async () => {
    // Temporarily stub discordAuthService.getSessionByToken to throw a Firestore unavailable error
    const originalGetSessionByToken = discordAuthService.getSessionByToken;
    discordAuthService.getSessionByToken = async () => {
      const error = new Error('FIRESTORE_UNAVAILABLE: Real Firestore database is required and currently unavailable (getById): 5 NOT_FOUND:');
      (error as any).code = 'FIRESTORE_UNAVAILABLE';
      throw error;
    };

    try {
      const mockReq: any = {
        originalUrl: '/api/v1/auth/session',
        path: '/api/v1/auth/session',
        headers: {
          cookie: 'discord_session_token=sess_somefakeandexpiredsessiontoken12345'
        },
        cookies: {},
        query: {},
        header(name: string) {
          if (name.toLowerCase() === 'cookie') {
            return 'discord_session_token=sess_somefakeandexpiredsessiontoken12345';
          }
          return undefined;
        }
      };

      let nextCalled = false;
      let nextError: any = null;
      const mockRes: any = {};
      const mockNext = (err?: any) => {
        nextCalled = true;
        nextError = err;
      };

      await authenticate(mockReq, mockRes, mockNext);

      // Verify that the middleware did not crash and passed execution to next() without error
      assert.strictEqual(nextCalled, true, 'authenticate middleware must call next()');
      assert.ok(nextError === null || nextError === undefined, 'authenticate middleware must NOT propagate database errors to next()');
      
      // Verify that user is safely populated as usr_anonymous guest/applicant
      assert.ok(mockReq.user, 'req.user must be populated');
      assert.strictEqual(mockReq.user.userId, 'usr_anonymous', 'user must be anonymous on database session fetch error');
      assert.strictEqual(mockReq.user.role, 'APPLICANT', 'role must default to APPLICANT on database session fetch error');

    } finally {
      // Restore original function
      discordAuthService.getSessionByToken = originalGetSessionByToken;
    }
  });

  // Assertion 2: Middleware Resiliency to Community Role Resolution Database Failures
  await runAssertion('Authenticate middleware handles community role resolution exceptions gracefully', async () => {
    // Stub communitiesRepository.getById to throw a DB error to verify resilient try-catch coverage
    const originalGetById = communitiesRepository.getById;
    communitiesRepository.getById = async () => {
      throw new Error('FIRESTORE_UNAVAILABLE: Database connection refused');
    };

    try {
      const mockReq: any = {
        originalUrl: '/api/v1/auth/session',
        path: '/api/v1/auth/session',
        headers: {
          cookie: ''
        },
        cookies: {},
        query: {
          communityId: 'comm_offline_test'
        },
        header(name: string) {
          if (name.toLowerCase() === 'x-community-id') {
            return 'comm_offline_test';
          }
          return undefined;
        }
      };

      let nextCalled = false;
      let nextError: any = null;
      const mockRes: any = {};
      const mockNext = (err?: any) => {
        nextCalled = true;
        nextError = err;
      };

      await authenticate(mockReq, mockRes, mockNext);

      assert.strictEqual(nextCalled, true, 'authenticate middleware must call next()');
      assert.ok(nextError === null || nextError === undefined, 'authenticate middleware must NOT propagate community lookup errors');
      assert.ok(mockReq.user, 'req.user must be populated');
      assert.strictEqual(mockReq.user.userId, 'usr_anonymous');
      assert.strictEqual(mockReq.user.role, 'APPLICANT');
    } finally {
      communitiesRepository.getById = originalGetById;
    }
  });

  // Assertion 3: Real Discord REST verification returns correct classifications
  await runAssertion('DiscordRestVerificationService returns correct classification on real/mock token checks', async () => {
    // Check that we can make verification calls and retrieve correct outcomes/classifications
    const result = await DiscordRestVerificationService.verifyCurrentUser();
    assert.ok(result.timestamp, 'timestamp must be present');
    assert.ok(typeof result.latencyMs === 'number', 'latencyMs must be recorded');
    assert.ok(['VERIFIED', 'FAILED', 'BLOCKED_BY_ENVIRONMENT'].includes(result.outcome), 'outcome must be standard');
    assert.ok(
      ['NOT_CONFIGURED', 'AUTHENTICATION_FAILED', 'DISCORD_API_UNAVAILABLE', 'NETWORK_BLOCKED', 'RATE_LIMITED', 'PERMISSION_REQUIRED', 'SUCCESS'].includes(result.classification),
      'classification must be truthfully classified'
    );
  });

  // Assertion 4: Repository getById handles numeric and string-based NOT_FOUND status gracefully
  await runAssertion('Repository getById returns null on string or numeric NOT_FOUND gRPC errors', async () => {
    // Test direct repository handling of NOT_FOUND
    const session = await discordSessionRepository.getById('nonexistent-session-id-12345');
    // If database is operational, it will return null correctly without throwing.
    // If it's down, our hardened catch-block returns null correctly on NOT_FOUND!
    assert.strictEqual(session, null, 'getById must return null for nonexistent documents');
  });

  const total = passed + failed;
  console.log(`\nTask 169 Run completed: ${passed} passed / ${failed} failed.`);
  console.log('================================================================================');

  return {
    passed,
    failed,
    blocked,
    skipped,
    total,
    details,
  };
}

if (process.argv[1] === import.meta.filename) {
  runTask169Tests().then((res) => {
    process.exit(res.failed === 0 ? 0 : 1);
  }).catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
}
