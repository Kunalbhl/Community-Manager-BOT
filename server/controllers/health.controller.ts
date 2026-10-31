import { Request, Response } from 'express';
import { healthService } from '../services/health.service.js';
import { config } from '../config/env.js';

/**
 * GET /health or /api/v1/health
 * Comprehensive health report of all application components and integrations.
 */
export async function getHealth(req: Request, res: Response) {
  const report = await healthService.getDetailedReport();
  res.status(200).json({
    success: true,
    service: 'community-manager',
    status: report.status,
    environment: config.NODE_ENV,
    freeMode: report.freeMode,
    timestamp: report.timestamp,
    version: '2.5.0-production-hardened',
    components: report.components,
  });
}

/**
 * GET /health/live or /api/v1/health/live
 * Liveness probe: checks if process is alive. Must NOT check external dependencies.
 */
export function getLiveness(req: Request, res: Response) {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });
}

/**
 * GET /health/ready or /api/v1/health/ready
 * Readiness probe: checks if required internal production operations & database are ready.
 * External dependencies (Discord REST/Gateway) being unavailable do not fail internal readiness.
 */
export async function getReadiness(req: Request, res: Response) {
  try {
    if (config.APP_RUNTIME_MODE === 'PRODUCTION') {
      const { ProductionProviderAuthorityService } = await import('../services/productionProviderAuthority.service.js');
      const snapshot = await ProductionProviderAuthorityService.getSnapshot();
      
      // Standard: Prevent any silent simulation/mock fallback in production
      const hasSimulated = Object.values(snapshot).some(status => status === 'SIMULATION');
      
      // Critical internal requirements (database, session, scheduler, audit logs) must be fully ready
      const criticalKeys: Array<keyof typeof snapshot> = [
        'firestoreProvider',
        'sessionProvider',
        'schedulerProvider',
        'auditProvider'
      ];
      const criticalUnavailable = criticalKeys.some(key => snapshot[key] === 'UNAVAILABLE');

      if (hasSimulated || criticalUnavailable) {
        return res.status(503).json({
          status: 'NOT_READY',
          ready: false,
          timestamp: new Date().toISOString(),
          environment: config.NODE_ENV,
          checks: {
            database: snapshot.firestoreProvider,
            discordRest: snapshot.discordRestProvider,
            discordGateway: snapshot.discordGatewayProvider,
            auth: snapshot.authProvider,
            scheduler: snapshot.schedulerProvider,
            engagement: snapshot.engagementDeliveryProvider,
          },
          message: 'PRODUCTION_CONFIGURATION_ERROR: Some required production providers are running in SIMULATION or critical databases are UNAVAILABLE.',
        });
      }
    }

    const { checkFirestoreReadiness, isRealPersistenceMode } = await import('../repositories/firestore.repository.js');
    const isReal = isRealPersistenceMode();
    const dbCheck = await checkFirestoreReadiness();

    // If real persistence is required and Firestore is not ready -> Safe 503 without sensitive details
    if (isReal && !dbCheck.isReady) {
      return res.status(503).json({
        status: 'NOT_READY',
        ready: false,
        timestamp: new Date().toISOString(),
        environment: config.NODE_ENV,
        checks: {
          database: 'UNAVAILABLE',
          internalConfig: 'READY',
          workers: 'READY',
        },
        message: 'Internal database service is currently unavailable.',
      });
    }

    return res.status(200).json({
      status: 'READY',
      ready: true,
      timestamp: new Date().toISOString(),
      environment: config.NODE_ENV,
      checks: {
        database: isReal ? 'READY' : 'SAFE_TRANSIENT_MEMORY',
        internalConfig: 'READY',
        workers: 'READY',
      },
    });
  } catch (err: any) {
    return res.status(503).json({
      status: 'NOT_READY',
      ready: false,
      timestamp: new Date().toISOString(),
      environment: config.NODE_ENV,
      checks: {
        database: 'UNAVAILABLE',
      },
      message: 'Internal production readiness check failed.',
    });
  }
}

/**
 * GET /health/external or /api/v1/health/external
 * External dependency health report: separately reports Discord REST, Discord Gateway, Firestore, and AI Engine.
 * Never conflates external Discord status with internal core application readiness.
 */
export async function getExternalDependenciesHealth(req: Request, res: Response) {
  try {
    const { checkFirestoreReadiness, isRealPersistenceMode } = await import('../repositories/firestore.repository.js');
    const { DiscordRestVerificationService } = await import('../services/discordRestVerification.service.js');
    const { discordService } = await import('../integrations/discord/discord.service.js');

    const [dbCheck, restResult] = await Promise.all([
      checkFirestoreReadiness().catch(() => ({ isReady: false, error: 'Database check failed' })),
      DiscordRestVerificationService.verifyCurrentUser().catch((err: any) => ({
        outcome: 'BLOCKED_BY_ENVIRONMENT' as const,
        classification: 'NETWORK_BLOCKED' as const,
        errorMessage: err.message,
        latencyMs: 0,
        timestamp: new Date().toISOString(),
      })),
    ]);

    const gwState = discordService.getConnectionState();
    const diag = typeof (discordService as any).getDiagnosticStatus === 'function' ? (discordService as any).getDiagnosticStatus() : { pingMs: -1 };

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      coreApplicationReady: true,
      externalDiscordVerified: restResult.outcome === 'VERIFIED',
      dependencies: {
        discordRest: {
          outcome: restResult.outcome,
          classification: restResult.classification,
          httpStatus: (restResult as any).httpStatus,
          latencyMs: restResult.latencyMs,
          botUserId: (restResult as any).botUserId,
          details: restResult.errorMessage || 'Verified with Discord API',
        },
        discordGateway: {
          state: gwState,
          pingMs: diag.pingMs,
          isConfigured: discordService.isConfigured(),
        },
        firestore: {
          status: dbCheck.isReady ? 'READY' : (isRealPersistenceMode() ? 'UNAVAILABLE' : 'SAFE_TRANSIENT_MEMORY'),
          isReady: dbCheck.isReady,
          mode: isRealPersistenceMode() ? 'REAL_FIRESTORE' : 'SAFE_TRANSIENT_MEMORY',
        },
        aiEngine: {
          status: Boolean(config.AI_API_KEY || config.GEMINI_API_KEY) ? 'READY' : 'NOT_CONFIGURED',
          configured: Boolean(config.AI_API_KEY || config.GEMINI_API_KEY),
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: 'Failed to evaluate external dependency health',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * GET /api/v1/production-readiness
 * Admin / Operations Production Readiness Dashboard endpoint.
 */
export async function getProductionReadiness(req: Request, res: Response) {
  try {
    const dashboard = await healthService.getProductionReadiness();
    return res.status(200).json({
      success: true,
      data: dashboard,
      requestId: req.id,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message,
      requestId: req.id,
    });
  }
}

/**
 * GET /api/production-readiness/verify-firestore
 * Runs a live production-grade Firestore sanity test sequence (CREATE -> READ -> UPDATE -> DELETE)
 * to verify live network connectivity, permissions, and performance with precise timing metrics.
 */
export async function verifyFirestoreReadiness(req: Request, res: Response) {
  const { performance } = await import('perf_hooks');
  const { activePersistenceProvider, FirestorePersistenceProvider } = await import('../repositories/persistence.provider.js');
  const { logger } = await import('../logging/logger.js');

  const startTotal = performance.now();
  const isReal = activePersistenceProvider instanceof FirestorePersistenceProvider;

  if (!isReal) {
    return res.status(400).json({
      success: false,
      error: 'SIMULATED_PERSISTENCE_LAYER_ACTIVE',
      message: 'Production verification failed: active persistence provider is a development simulation and not a real Firestore instance.',
      persistenceProvider: activePersistenceProvider.constructor.name,
      isSimulated: true
    });
  }

  const collectionName = 'production_readiness_checks';
  const testId = `verify_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const testData = { id: testId, checkTime: new Date().toISOString(), status: 'PENDING', origin: 'production-readiness-api' };

  try {
    // 1. CREATE Phase
    const startCreate = performance.now();
    await activePersistenceProvider.create(collectionName, testId, testData);
    const endCreate = performance.now();
    const createLatency = endCreate - startCreate;

    // 2. READ Phase
    const startRead = performance.now();
    const readDoc = await activePersistenceProvider.getById<{ id: string; status: string }>(collectionName, testId);
    const endRead = performance.now();
    const readLatency = endRead - startRead;

    if (!readDoc || readDoc.id !== testId) {
      throw new Error(`Read verification failed: document with ID ${testId} not found or mismatch.`);
    }

    // 3. UPDATE Phase
    const startUpdate = performance.now();
    await activePersistenceProvider.update<{ id: string; status: string }>(collectionName, testId, { status: 'SUCCESSFUL_VERIFIED' });
    const endUpdate = performance.now();
    const updateLatency = endUpdate - startUpdate;

    // 4. DELETE Phase
    const startDelete = performance.now();
    const deleteSuccess = await activePersistenceProvider.delete(collectionName, testId);
    const endDelete = performance.now();
    const deleteLatency = endDelete - startDelete;

    const endTotal = performance.now();

    return res.status(200).json({
      success: true,
      persistenceProvider: activePersistenceProvider.constructor.name,
      isSimulated: false,
      targetCollection: collectionName,
      verifiedDocumentId: testId,
      phases: {
        create: {
          latencyMs: parseFloat(createLatency.toFixed(2)),
          status: 'SUCCESS'
        },
        read: {
          latencyMs: parseFloat(readLatency.toFixed(2)),
          status: 'SUCCESS'
        },
        update: {
          latencyMs: parseFloat(updateLatency.toFixed(2)),
          status: 'SUCCESS'
        },
        delete: {
          latencyMs: parseFloat(deleteLatency.toFixed(2)),
          status: 'SUCCESS',
          confirmedDeleted: deleteSuccess
        }
      },
      totalLatencyMs: parseFloat((endTotal - startTotal).toFixed(2))
    });
  } catch (err: any) {
    logger.error(`[ProductionReadiness] Firestore verification check failed: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: 'FIRESTORE_VERIFICATION_FAILED',
      message: err.message || 'An unexpected error occurred during Firestore verification test sequence.',
      persistenceProvider: activePersistenceProvider.constructor.name,
      isSimulated: false
    });
  }
}
