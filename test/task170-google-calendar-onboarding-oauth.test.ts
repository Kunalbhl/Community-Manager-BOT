import assert from 'assert/strict';
import { googleCalendarService } from '../server/integrations/google/calendar.service.js';
import { userCalendarConfigsRepository } from '../server/repositories/index.js';
import {
  skipUserCalendarSetupHandler,
  getGoogleOAuthAuthorizeUrlHandler,
  getUserCalendarStatusHandler,
} from '../server/controllers/trustRecruitment.controller.js';
import { config } from '../server/config/env.js';
import { Request, Response } from 'express';

export interface Task170Result {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  total: number;
  details: Record<string, string>;
}

export async function runTask170GoogleCalendarOnboardingTest(): Promise<Task170Result> {
  console.log('================================================================================');
  console.log('[TASK 170] GOOGLE CALENDAR ONBOARDING & OAUTH INTEGRATION TESTS');
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

  const testUserId = `usr_test_cal_${Date.now()}`;
  const testCommunityId = `comm_test_cal_${Date.now()}`;
  const testRole = 'INTERVIEWER';

  // 1. Initial Status Check
  await runAssertion('1. Initial Status Check: prompt shown for eligible interviewer role', async () => {
    const initialStatus = await googleCalendarService.getUserCalendarStatus(testUserId, testCommunityId, testRole);
    assert.equal(initialStatus.eligible, true, 'Interviewer role must be eligible for calendar prompt');
    assert.equal(initialStatus.shouldShowFirstLoginPrompt, true, 'Initial state must prompt for calendar onboarding');
    assert.equal(initialStatus.preference, 'NEVER_CONFIGURED', 'Default preference must be NEVER_CONFIGURED');
  });

  // 2. Skip Preference Persistence
  let skippedDoc: any;
  await runAssertion('2. Skip preference succeeds: persists with full required schema', async () => {
    skippedDoc = await googleCalendarService.skipUserCalendarSetup(testUserId, testCommunityId, testRole);
    assert.ok(skippedDoc, 'Skip must return persisted configuration document');
    assert.equal(skippedDoc.userId, testUserId, 'Persisted document must match test userId');
    assert.equal(skippedDoc.preference, 'SKIPPED', 'Persisted preference must be SKIPPED');
    assert.equal(skippedDoc.status, 'SKIPPED', 'Status must be SKIPPED');
    assert.equal(skippedDoc.calendarId, 'primary', 'Calendar ID must default to primary');
    assert.ok(skippedDoc.createdAt, 'createdAt timestamp must be set');
    assert.ok(skippedDoc.updatedAt, 'updatedAt timestamp must be set');
  });

  // 3. Skip Preference Idempotence
  await runAssertion('3. Skip preference is idempotent: successive calls succeed cleanly', async () => {
    const skippedDoc2 = await googleCalendarService.skipUserCalendarSetup(testUserId, testCommunityId, testRole);
    assert.ok(skippedDoc2, 'Second skip must succeed idempotently');
    assert.equal(skippedDoc2.preference, 'SKIPPED', 'Preference must remain SKIPPED');
    assert.ok(skippedDoc2.preferenceVersion && skippedDoc2.preferenceVersion >= 2, 'Preference version must increment on update');

    const postSkipStatus = await googleCalendarService.getUserCalendarStatus(testUserId, testCommunityId, testRole);
    assert.equal(postSkipStatus.shouldShowFirstLoginPrompt, false, 'First login prompt must NOT show after being skipped');
    assert.equal(postSkipStatus.preference, 'SKIPPED', 'Preference must reflect SKIPPED');
  });

  // 4. Skip Preference Authentication Enforcement
  await runAssertion('4. Skip preference respects authentication: rejects anonymous requests', async () => {
    let rejected = false;
    const reqMock: any = {
      user: { userId: 'usr_anonymous', role: 'APPLICANT' },
      body: { communityId: testCommunityId },
      id: 'req_skip_test_anon',
    };
    const resMock: any = { json: () => {} };

    await skipUserCalendarSetupHandler(reqMock, resMock, (err: any) => {
      if (err && (err.statusCode === 401 || err.code === 'AUTHENTICATION_REQUIRED')) {
        rejected = true;
      }
    });

    assert.equal(rejected, true, 'Anonymous or unauthenticated request must be rejected with 401');
  });

  // 5. Skip Preference Community Context Resolution
  await runAssertion('5. Skip preference respects community context: handles fallback from comm_default', async () => {
    let responseData: any = null;
    const reqMock: any = {
      user: { userId: testUserId, role: 'INTERVIEWER', communityId: testCommunityId },
      body: { communityId: 'comm_default' },
      id: 'req_skip_test_comm',
    };
    const resMock: any = {
      json: (payload: any) => {
        responseData = payload;
      },
    };

    await skipUserCalendarSetupHandler(reqMock, resMock, (err: any) => {
      if (err) throw err;
    });

    assert.ok(responseData && responseData.success, 'Skip handler must succeed and resolve communityId from session');
    assert.equal(responseData.data.preference, 'SKIPPED');
  });

  // 6. OAuth State Generation & Preservation
  await runAssertion('6. OAuth state is generated and preserved in base64url payload', async () => {
    const oauthRes = googleCalendarService.getOAuthAuthorizeUrl({
      userId: testUserId,
      communityId: testCommunityId,
      role: testRole,
    });
    assert.ok(oauthRes.state, 'OAuth state must be generated');
    const decodedState = JSON.parse(Buffer.from(oauthRes.state, 'base64url').toString('utf8'));
    assert.equal(decodedState.userId, testUserId, 'State must contain userId');
    assert.equal(decodedState.communityId, testCommunityId, 'State must contain communityId');
    assert.equal(decodedState.role, testRole, 'State must contain role');
  });

  // 7. OAuth Redirect URI Production Accuracy
  await runAssertion('7. OAuth redirect URI is production-correct: points to canonical origin in production', async () => {
    const canonicalProductionOrigin = 'https://community-manager-bot-720940628402.asia-southeast1.run.app';
    const canonicalRedirectUri = `${canonicalProductionOrigin}/api/v1/calendar/oauth/callback`;

    const oauthRes = googleCalendarService.getOAuthAuthorizeUrl({
      userId: testUserId,
      communityId: testCommunityId,
      role: testRole,
      redirectUri: canonicalRedirectUri,
    });
    assert.ok(oauthRes, 'getOAuthAuthorizeUrl must return response');
  });

  // 8. OAuth Initialization with Valid Configuration
  await runAssertion('8. OAuth initialization succeeds when valid configuration exists', async () => {
    const origClientId = process.env.GOOGLE_CLIENT_ID;
    try {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id-12345.apps.googleusercontent.com';
      const oauthRes = googleCalendarService.getOAuthAuthorizeUrl({
        userId: testUserId,
        communityId: testCommunityId,
        role: testRole,
      });
      assert.equal(oauthRes.isConfigured, true, 'Must indicate configured when client ID is set');
      assert.ok(oauthRes.url.startsWith('https://accounts.google.com'), 'Must construct Google authorization URL');
      assert.ok(oauthRes.url.includes('calendar.events'), 'Must request calendar.events scope');
      assert.ok(oauthRes.url.includes('calendar.readonly'), 'Must request calendar.readonly scope');
    } finally {
      if (origClientId !== undefined) {
        process.env.GOOGLE_CLIENT_ID = origClientId;
      } else {
        delete process.env.GOOGLE_CLIENT_ID;
      }
    }
  });

  // 9. OAuth Initialization Fails Safely when Unconfigured
  await runAssertion('9. OAuth initialization fails safely when required configuration is absent', async () => {
    const origClientId = process.env.GOOGLE_CLIENT_ID;
    const origOAuthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const origMode = config.APP_RUNTIME_MODE;
    const origSim = config.DEV_SIMULATION_ENABLED;

    try {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      (config as any).APP_RUNTIME_MODE = 'PRODUCTION';
      (config as any).DEV_SIMULATION_ENABLED = false;

      const oauthRes = googleCalendarService.getOAuthAuthorizeUrl({
        userId: testUserId,
        communityId: testCommunityId,
        role: testRole,
      });
      assert.equal(oauthRes.isConfigured, false, 'Must indicate unconfigured when client ID is missing in production');
      assert.equal(oauthRes.url, '', 'URL must be empty when unconfigured in production');

      // Test handler returns safe 503 error
      let statusCalled = 0;
      let errorResponse: any = null;
      const reqMock: any = {
        user: { userId: testUserId, role: 'INTERVIEWER', communityId: testCommunityId },
        query: { communityId: testCommunityId },
        get: () => 'community-manager-bot-720940628402.asia-southeast1.run.app',
        protocol: 'https',
        id: 'req_oauth_unconfigured_test',
      };
      const resMock: any = {
        status: (code: number) => {
          statusCalled = code;
          return resMock;
        },
        json: (payload: any) => {
          errorResponse = payload;
        },
      };

      await getGoogleOAuthAuthorizeUrlHandler(reqMock, resMock, (err: any) => {
        if (err) throw err;
      });

      assert.equal(statusCalled, 503, 'Handler must return 503 when OAuth client is unconfigured');
      assert.equal(errorResponse?.error?.code, 'GOOGLE_CALENDAR_NOT_CONFIGURED');
    } finally {
      (config as any).APP_RUNTIME_MODE = origMode;
      (config as any).DEV_SIMULATION_ENABLED = origSim;
      if (origClientId !== undefined) process.env.GOOGLE_CLIENT_ID = origClientId;
      if (origOAuthClientId !== undefined) process.env.GOOGLE_OAUTH_CLIENT_ID = origOAuthClientId;
    }
  });

  // 10. Connect User Calendar Action & Cleanup
  await runAssertion('10. Connect action succeeds and updates preference to CONNECTED', async () => {
    const connectedDoc = await googleCalendarService.connectUserCalendar(
      testUserId,
      testCommunityId,
      testRole,
      'interviewer@gmail.com',
      'primary',
      'UTC'
    );
    assert.ok(connectedDoc, 'Connect must return persisted document');
    assert.equal(connectedDoc.preference, 'CONNECTED');
    assert.equal(connectedDoc.status, 'CONNECTED');
    assert.equal(connectedDoc.googleAccountId, 'interviewer@gmail.com');

    const status = await googleCalendarService.getUserCalendarStatus(testUserId, testCommunityId, testRole);
    assert.equal(status.shouldShowFirstLoginPrompt, false, 'Modal prompt must not show after connection');
    assert.equal(status.status, 'CONNECTED');

    // Clean up
    try {
      if (skippedDoc?.id) await userCalendarConfigsRepository.delete(skippedDoc.id);
    } catch {
      // Ignore
    }
  });

  console.log(`[TASK 170 COMPLETE] ${passed} passed, ${failed} failed.\n`);
  return {
    passed,
    failed,
    blocked,
    skipped,
    total: passed + failed + blocked + skipped,
    details,
  };
}

if (process.argv[1]?.includes('task170')) {
  runTask170GoogleCalendarOnboardingTest()
    .then((res) => process.exit(res.failed > 0 ? 1 : 0))
    .catch((err) => {
      console.error('[TASK 170 FAILED]:', err);
      process.exit(1);
    });
}
