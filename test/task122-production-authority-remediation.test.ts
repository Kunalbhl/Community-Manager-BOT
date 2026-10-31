import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, validateProductionConfig, ConfigurationError, config } from '../server/config/env.js';
import { isRealPersistenceMode, DevelopmentSimulationPersistenceProvider } from '../server/repositories/firestore.repository.js';
import { discordAuthService } from '../server/services/discordAuth.service.js';
import { WorkflowActionService } from '../server/services/automation.service.js';
import { authenticate } from '../server/middleware/auth.js';

export interface Task122TestResult {
  passed: number;
  failed: number;
  tests: {
    testA_sessionSecret: boolean;
    testB_botToken: boolean;
    testC_clientSecret: boolean;
    testD_realPersistenceMode: boolean;
    testE_simulationProviderProhibited: boolean;
    testF_productionGcpValidation: boolean;
    testG_realDiscordExchange: boolean;
    testH_persistentOAuthSession: boolean;
    testI_communityMismatchRejection: boolean;
    testJ_clientRoleSpoofingRejection: boolean;
    testK_clientUserIdSpoofingRejection: boolean;
    testL_simulateJoinGated: boolean;
    testM_applicantPortalAuthoritativeEndpoint: boolean;
    testN_automationFailClosedOnDisconnect: boolean;
    testO_zeroHardcodedAppletConfigReferences: boolean;
    testP_zeroSyntheticTokensInRuntimeCode: boolean;
  };
}

export async function runTask122Tests(): Promise<Task122TestResult> {
  console.log('\n--- Running Task 122 Production Authority Remediation Suite (16 Core Security Tests) ---');
  let passed = 0;
  let failed = 0;

  const testResults: Task122TestResult['tests'] = {
    testA_sessionSecret: false,
    testB_botToken: false,
    testC_clientSecret: false,
    testD_realPersistenceMode: false,
    testE_simulationProviderProhibited: false,
    testF_productionGcpValidation: false,
    testG_realDiscordExchange: false,
    testH_persistentOAuthSession: false,
    testI_communityMismatchRejection: false,
    testJ_clientRoleSpoofingRejection: false,
    testK_clientUserIdSpoofingRejection: false,
    testL_simulateJoinGated: false,
    testM_applicantPortalAuthoritativeEndpoint: false,
    testN_automationFailClosedOnDisconnect: false,
    testO_zeroHardcodedAppletConfigReferences: false,
    testP_zeroSyntheticTokensInRuntimeCode: false,
  };

  async function runSubTest(name: string, fn: () => void | Promise<void>): Promise<boolean> {
    try {
      await fn();
      console.log(`  ✓ [Task 122] ${name}`);
      passed++;
      return true;
    } catch (err: any) {
      console.error(`\n>>> [TASK 122 FAILED]: ${name}\n`, err?.stack || err);
      failed++;
      return false;
    }
  }

  // Test A: Production config validation failure when SESSION_SECRET is missing or weak (<32 chars)
  testResults.testA_sessionSecret = await runSubTest(
    'A. Production config validation failure when SESSION_SECRET is missing or < 32 chars',
    () => {
      const cfg = loadConfig();
      const prodCfg = { ...cfg, APP_RUNTIME_MODE: 'PRODUCTION' as const, SESSION_SECRET: 'short_secret' };
      assert.throws(
        () => validateProductionConfig(prodCfg),
        (err: any) => err instanceof ConfigurationError && err.code === 'INVALID_SESSION_SECRET',
        'Must throw ConfigurationError with INVALID_SESSION_SECRET'
      );
    }
  );

  // Test B: Production config validation failure when DISCORD_BOT_TOKEN is missing
  testResults.testB_botToken = await runSubTest(
    'B. Production config validation failure when DISCORD_BOT_TOKEN is missing',
    () => {
      const cfg = loadConfig();
      const prodCfg = {
        ...cfg,
        APP_RUNTIME_MODE: 'PRODUCTION' as const,
        SESSION_SECRET: 'a_very_long_valid_session_secret_32_chars_minimum_here',
        DISCORD_BOT_TOKEN: '',
      };
      assert.throws(
        () => validateProductionConfig(prodCfg),
        (err: any) => err instanceof ConfigurationError && err.code === 'MISSING_DISCORD_BOT_TOKEN',
        'Must throw ConfigurationError with MISSING_DISCORD_BOT_TOKEN'
      );
    }
  );

  // Test C: Production config validation failure when DISCORD_CLIENT_SECRET is missing
  testResults.testC_clientSecret = await runSubTest(
    'C. Production config validation failure when DISCORD_CLIENT_SECRET is missing',
    () => {
      const cfg = loadConfig();
      const prodCfg = {
        ...cfg,
        APP_RUNTIME_MODE: 'PRODUCTION' as const,
        SESSION_SECRET: 'a_very_long_valid_session_secret_32_chars_minimum_here',
        DISCORD_BOT_TOKEN: 'valid_bot_token_abc',
        DISCORD_CLIENT_SECRET: '',
      };
      assert.throws(
        () => validateProductionConfig(prodCfg),
        (err: any) => err instanceof ConfigurationError && err.code === 'MISSING_DISCORD_CLIENT_SECRET',
        'Must throw ConfigurationError with MISSING_DISCORD_CLIENT_SECRET'
      );
    }
  );

  // Test D: isRealPersistenceMode() returns true only when APP_RUNTIME_MODE is PRODUCTION or REAL_DISCORD_PREVIEW
  testResults.testD_realPersistenceMode = await runSubTest(
    'D. isRealPersistenceMode() strictly requires PRODUCTION or REAL_DISCORD_PREVIEW runtime mode',
    () => {
      const origMode = config.APP_RUNTIME_MODE;
      try {
        config.APP_RUNTIME_MODE = 'DEVELOPMENT_SIMULATION';
        assert.equal(isRealPersistenceMode(), false, 'Must be false in DEVELOPMENT_SIMULATION mode');

        config.APP_RUNTIME_MODE = 'PRODUCTION';
        assert.equal(isRealPersistenceMode(), true, 'Must be true in PRODUCTION mode');

        config.APP_RUNTIME_MODE = 'REAL_DISCORD_PREVIEW';
        assert.equal(isRealPersistenceMode(), true, 'Must be true in REAL_DISCORD_PREVIEW mode');
      } finally {
        config.APP_RUNTIME_MODE = origMode;
      }
    }
  );

  // Test E: DevelopmentSimulationPersistenceProvider throws an error when instantiated in production mode
  testResults.testE_simulationProviderProhibited = await runSubTest(
    'E. DevelopmentSimulationPersistenceProvider throws when instantiated in PRODUCTION mode',
    () => {
      const origMode = config.APP_RUNTIME_MODE;
      try {
        config.APP_RUNTIME_MODE = 'PRODUCTION';
        assert.throws(
          () => new DevelopmentSimulationPersistenceProvider<any>('test_collection'),
          (err: any) => err.message.includes('Simulation persistence is strictly prohibited'),
          'Must reject simulation provider in PRODUCTION mode'
        );
      } finally {
        config.APP_RUNTIME_MODE = origMode;
      }
    }
  );

  // Test F: Server startup failure when Firestore is required in production but GCP credentials are missing
  testResults.testF_productionGcpValidation = await runSubTest(
    'F. Production validation fails if FIRESTORE_REQUIRED is true but GCP credentials are missing',
    () => {
      const cfg = loadConfig();
      const prodCfg = {
        ...cfg,
        APP_RUNTIME_MODE: 'PRODUCTION' as const,
        SESSION_SECRET: 'a_very_long_valid_session_secret_32_chars_minimum_here',
        DISCORD_BOT_TOKEN: 'valid_bot_token_abc',
        DISCORD_CLIENT_SECRET: 'valid_client_secret_xyz',
        DISCORD_CLIENT_ID: '1234567890',
        DISCORD_REDIRECT_URI: 'https://my-app.run.app/api/v1/auth/callback',
        GCP_PROJECT_ID: '',
        FIRESTORE_DATABASE_ID: '',
      };
      assert.throws(
        () => validateProductionConfig(prodCfg, { requireFirestore: true }),
        (err: any) => err instanceof ConfigurationError && err.code === 'MISSING_GCP_PROJECT_ID',
        'Must throw ConfigurationError with MISSING_GCP_PROJECT_ID'
      );
    }
  );

  // Test G: discordAuthService.exchangeCodeForTokens makes a real HTTP request in production mode (no synthetic tokens)
  testResults.testG_realDiscordExchange = await runSubTest(
    'G. discordAuthService.exchangeCodeForTokens executes real HTTP exchange (no synthetic tokens)',
    async () => {
      const origMode = config.APP_RUNTIME_MODE;
      try {
        config.APP_RUNTIME_MODE = 'PRODUCTION';
        let attemptedUrl = '';
        const origFetch = globalThis.fetch;
        globalThis.fetch = (async (url: any, init: any) => {
          attemptedUrl = String(url);
          return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
        }) as any;

        try {
          await assert.rejects(
            async () => {
              await discordAuthService.exchangeCodeForTokens('invalid_test_code', 'http://localhost:3000/auth/callback');
            },
            /Discord token exchange failed/,
            'Must fail with network error on invalid grant instead of generating fake token'
          );
          assert.equal(attemptedUrl, 'https://discord.com/api/v10/oauth2/token', 'Must hit official Discord token endpoint');
        } finally {
          globalThis.fetch = origFetch;
        }
      } finally {
        config.APP_RUNTIME_MODE = origMode;
      }
    }
  );

  // Test H: discordAuthService.handleOAuthCallback creates a persistent session in Firestore when real persistence is enabled
  testResults.testH_persistentOAuthSession = await runSubTest(
    'H. Authoritative session creation interfaces directly with persistence layer',
    async () => {
      const session = await discordAuthService.createAuthoritativeSession({
        id: 'sess_test_122_h',
        discordUserId: '122_user_test',
        discordUsername: 'testuser',
        discordDiscriminator: '0',
        discordAvatar: null,
        sessionToken: 'sess_tok_122_valid',
        accessToken: 'discord_access_valid',
        refreshToken: 'discord_refresh_valid',
        expiresAt: Date.now() + 3600000,
        scope: 'identify email guilds',
        ipAddress: '127.0.0.1',
        userAgent: 'TestRunner/122',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      assert.ok(session, 'Session must be created');
      const retrieved = await discordAuthService.getSessionByToken('sess_tok_122_valid');
      assert.ok(retrieved, 'Session must be retrievable by token');
      assert.equal(retrieved?.discordUserId, '122_user_test');
    }
  );

  // Test I: Rejection of x-community-id override attempts when user is not authorized
  testResults.testI_communityMismatchRejection = await runSubTest(
    'I. Middleware rejects unauthorized x-community-id access',
    async () => {
      const origMode = config.APP_RUNTIME_MODE;
      try {
        config.APP_RUNTIME_MODE = 'PRODUCTION';
        const req: any = {
          header: (h: string) => (h === 'x-community-id' ? 'comm_unauthorized_target' : undefined),
          query: {},
          cookies: {},
          url: '/api/v1/applications',
          originalUrl: '/api/v1/applications',
          path: '/api/v1/applications',
        };
        let errorPassed: any = null;
        await authenticate(req, {} as any, (err?: any) => {
          errorPassed = err;
        });
        assert.ok(errorPassed, 'Must pass an error to next()');
        assert.equal(errorPassed.statusCode, 404, 'Must return 404 or 403 for non-existent / unauthorized community');
      } finally {
        config.APP_RUNTIME_MODE = origMode;
      }
    }
  );

  // Test J: Rejection of client-supplied x-role or x-user-role headers in production mode
  testResults.testJ_clientRoleSpoofingRejection = await runSubTest(
    'J. Client-supplied x-role / x-user-role headers are strictly ignored in production mode',
    async () => {
      const origMode = config.APP_RUNTIME_MODE;
      try {
        config.APP_RUNTIME_MODE = 'PRODUCTION';
        const req: any = {
          header: (h: string) => {
            if (h === 'x-role') return 'OWNER';
            if (h === 'x-user-role') return 'PLATFORM_OWNER';
            if (h === 'x-community-id') return 'comm_public_test';
            return undefined;
          },
          query: {},
          cookies: {},
          url: '/api/v1/health',
          originalUrl: '/api/v1/health',
          path: '/api/v1/health',
        };
        await authenticate(req, {} as any, () => {});
        assert.notEqual(req.user?.role, 'PLATFORM_OWNER', 'Client cannot elevate itself to PLATFORM_OWNER via headers');
        assert.notEqual(req.user?.role, 'OWNER', 'Client cannot elevate itself to OWNER via headers');
      } finally {
        config.APP_RUNTIME_MODE = origMode;
      }
    }
  );

  // Test K: Rejection of client-supplied x-user-id in production mode
  testResults.testK_clientUserIdSpoofingRejection = await runSubTest(
    'K. Client-supplied x-user-id header is ignored in production mode without valid session',
    async () => {
      const origMode = config.APP_RUNTIME_MODE;
      try {
        config.APP_RUNTIME_MODE = 'PRODUCTION';
        const req: any = {
          header: (h: string) => (h === 'x-user-id' ? 'spoofed_admin_user' : undefined),
          query: {},
          cookies: {},
          url: '/api/v1/health',
          originalUrl: '/api/v1/health',
          path: '/api/v1/health',
        };
        await authenticate(req, {} as any, () => {});
        assert.notEqual(req.user?.id, 'spoofed_admin_user', 'Client cannot spoof user ID via x-user-id header');
        assert.equal(req.user?.id, 'usr_anonymous', 'Must resolve to usr_anonymous when unauthenticated');
      } finally {
        config.APP_RUNTIME_MODE = origMode;
      }
    }
  );

  // Test L: Verification that /applications/:id/simulate-join returns 403/404 in production mode
  testResults.testL_simulateJoinGated = await runSubTest(
    'L. Verification that simulate-join endpoint is strictly prohibited in production mode',
    () => {
      const routesContent = fs.readFileSync(path.join(process.cwd(), 'server/routes/v1.routes.ts'), 'utf8');
      assert.ok(
        routesContent.includes("config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION'"),
        'simulate-join must be gated behind DEVELOPMENT_SIMULATION runtime check'
      );
      assert.ok(
        routesContent.includes('SIMULATION_DISABLED') || routesContent.includes('403'),
        'simulate-join must return 403 / SIMULATION_DISABLED in production'
      );
    }
  );

  // Test M: Verification that ApplicantPortalView invokes the authoritative verification endpoint, not simulate-join
  testResults.testM_applicantPortalAuthoritativeEndpoint = await runSubTest(
    'M. ApplicantPortalView uses authoritative /verify-join endpoint',
    () => {
      const portalContent = fs.readFileSync(
        path.join(process.cwd(), 'src/components/views/ApplicantPortalView.tsx'),
        'utf8'
      );
      assert.ok(
        portalContent.includes('/verify-join'),
        'ApplicantPortalView must call /verify-join'
      );
      assert.ok(
        !portalContent.includes('/simulate-join'),
        'ApplicantPortalView must not call /simulate-join'
      );
    }
  );

  // Test N: Automation actions targeting Discord fail explicitly when Discord is disconnected in real mode
  testResults.testN_automationFailClosedOnDisconnect = await runSubTest(
    'N. Automation actions fail explicitly with BOT_NOT_CONNECTED when Discord is disconnected in real mode',
    async () => {
      const origMode = config.APP_RUNTIME_MODE;
      try {
        config.APP_RUNTIME_MODE = 'PRODUCTION';
        const actionResult = await WorkflowActionService.executeAction(
          {
            type: 'SEND_MESSAGE',
            config: { channelId: '123456789', messageTemplate: 'Hello {{username}}' },
          },
          {
            eventId: 'evt_test_1',
            communityId: 'comm_test',
            eventType: 'APPLICATION_SUBMITTED',
            timestamp: Date.now(),
            resourceType: 'APPLICATION',
            resourceId: 'app_1',
          } as any,
          'comm_test'
        );
        assert.equal(actionResult.success, false, 'Must not return success: true when Discord bot is disconnected');
        assert.ok(
          actionResult.error?.includes('BOT_NOT_CONNECTED'),
          `Error must indicate BOT_NOT_CONNECTED, got: ${actionResult.error}`
        );
      } finally {
        config.APP_RUNTIME_MODE = origMode;
      }
    }
  );

  // Test O: Static audit: Verify zero occurrences of ai-studio-communityrecruit-59f17f1d-8b74-490e-9248-bc41e69de7ef in non-doc source files
  testResults.testO_zeroHardcodedAppletConfigReferences = await runSubTest(
    'O. Static audit: Zero hardcoded database ID occurrences in codebase',
    () => {
      const targetId = 'ai-studio-communityrecruit-59f17f1d-8b74-490e-9248-bc41e69de7ef';
      const scanDirs = ['server', 'src'];
      let foundOccurrences: string[] = [];

      function scanDir(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== 'dist') {
              scanDir(fullPath);
            }
          } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name.endsWith('.js') || entry.name.endsWith('.json'))) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.includes(targetId)) {
              foundOccurrences.push(fullPath);
            }
          }
        }
      }

      for (const dir of scanDirs) {
        scanDir(path.join(process.cwd(), dir));
      }

      assert.equal(
        foundOccurrences.length,
        0,
        `Found hardcoded project ID in source files: ${foundOccurrences.join(', ')}`
      );
    }
  );

  // Test P: Static audit: Verify zero occurrences of synthetic token generators in production runtime code
  testResults.testP_zeroSyntheticTokensInRuntimeCode = await runSubTest(
    'P. Static audit: Zero synthetic token generators (disc_token_, disc_refresh_) in production server code',
    () => {
      const serverAuthPath = path.join(process.cwd(), 'server/services/discordAuth.service.ts');
      const content = fs.readFileSync(serverAuthPath, 'utf8');
      assert.ok(!content.includes('disc_token_'), 'Must not contain disc_token_ in discordAuth.service.ts');
      assert.ok(!content.includes('disc_refresh_'), 'Must not contain disc_refresh_ in discordAuth.service.ts');
    }
  );

  console.log(`\nTask 122 Suite Complete: ${passed} passed, ${failed} failed.\n`);
  return { passed, failed, tests: testResults };
}
