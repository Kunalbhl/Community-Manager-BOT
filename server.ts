import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { config } from './server/config/env.js';
import { logger } from './server/logging/logger.js';
import { requestIdMiddleware } from './server/middleware/requestId.js';
import { authenticate } from './server/middleware/auth.js';
import { errorHandlerMiddleware } from './server/middleware/errorHandler.js';
import { v1Router } from './server/routes/v1.routes.js';
import { rateLimiter } from './server/security/rateLimiter.js';
import { communitiesRepository, communityMemberAccessRepository, discordMembersRepository } from './server/repositories/index.js';
import { httpSecurityMiddleware, sameOriginGuard } from './server/security/httpSecurity.js';
import { getHealth, getLiveness, getReadiness, getExternalDependenciesHealth, verifyFirestoreReadiness } from './server/controllers/health.controller.js';
import { discordService } from './server/integrations/discord/discord.service.js';
import { DEFAULT_ROLE_PERMISSIONS } from './shared/types/rbac.js';
import { ProductionRuntimeActivationService } from './server/services/productionRuntimeActivation.service.js';
import { startLeadership, stopLeadership, getLeadershipStatus, noteShutdownStarting } from './server/runtime/leadership.js';
import { leaderProxy } from './server/runtime/leaderProxy.js';
import { EngagementSchedulerService } from './server/services/engagement.service.js';
import { startReminderScheduler, stopReminderScheduler } from './server/services/reviewReminders.service.js';

// A 24/7 bot must never die from one stray error: log it and keep running.
process.on('unhandledRejection', (reason: any) => {
  logger.error('[Process] Unhandled promise rejection (kept alive):', undefined, { error: reason?.message || String(reason) });
});
process.on('uncaughtException', (err: Error) => {
  logger.error('[Process] Uncaught exception (kept alive):', undefined, { error: err?.message, stack: err?.stack });
});

async function connectDiscordBot() {
  if (!config.DISCORD_BOT_TOKEN) {
    logger.warn('[DiscordGateway] DISCORD_BOT_TOKEN not set — bot cannot log in. Dashboard will still run.');
    return;
  }
  try {
    const connected = await discordService.connect();
    if (!connected) {
      logger.error('[DiscordGateway] Connection failed. Check DISCORD_BOT_TOKEN and that Server Members Intent + Message Content Intent are enabled in the Discord Developer Portal.');
    }
  } catch (err) {
    logger.error('[DiscordGateway] Unexpected error connecting to Discord:', undefined, { error: (err as Error).message });
  }
}

async function startServer() {
  ProductionRuntimeActivationService.verifyStartup();
  const app = express();
  const PORT = Number(process.env.PORT || config.PORT || 3000);

  // Set trust proxy for Cloud Run & reverse proxies
  app.set('trust proxy', true);
  // The old Cloud Run address now lives at community-manager.chaloone.com. People who open the old address
  // in a browser are sent to the new one; API calls, health checks and requests from our own proxy are untouched.
  app.use((req, res, next) => {
    const host = (req.header('host') || '').toLowerCase();
    if (req.method === 'GET' && host.endsWith('.run.app') && !req.header('x-cm-proxy')
      && !req.path.startsWith('/api/') && !req.path.startsWith('/health')) {
      return res.redirect(301, `https://community-manager.chaloone.com${req.originalUrl}`);
    }
    next();
  });

  // Production Security Headers & Request ID
  app.use(requestIdMiddleware);
  app.use(httpSecurityMiddleware);

  // Root level health probes (for load balancers & orchestrators)
  app.get('/health', getHealth);
  app.get('/health/live', getLiveness);
  app.get('/health/ready', getReadiness);
  app.get('/health/external', getExternalDependenciesHealth);
  // 200 only on the instance actively running the bot (used by the VM's front door during handoffs).
  // Logged in to Discord (active or hot standby): the updater waits for this before stopping the old bot.
  app.get('/health/gateway', (_req: Request, res: Response) => {
    const ok = discordService.isReady();
    res.status(ok ? 200 : 503).json({ ok });
  });
  app.get('/health/active', (_req: Request, res: Response) => {
    const ok = getLeadershipStatus().isLeader && discordService.isReady();
    res.status(ok ? 200 : 503).json({ active: ok });
  });
  app.get('/health/leader', (_req: Request, res: Response) => {
    res.json({ ...getLeadershipStatus(), discord: discordService.getDiagnostics?.() });
  });

  // Standby instances forward API calls to the active bot (must run before body parsing).
  // Response timing: Server-Timing header on every API call, and a log line for slow ones.
  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    const writeHead = res.writeHead;
    (res as any).writeHead = function (this: Response, ...args: any[]) {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      try { this.setHeader('Server-Timing', `app;dur=${ms.toFixed(0)}`); } catch { /* headers already sent */ }
      if (ms > 1500) {
        console.warn(`[Slow API] ${req.method} ${req.originalUrl.split('?')[0]} ${ms.toFixed(0)} ms`);
        (globalThis as any).__cmSlow = [{ at: new Date().toISOString(), method: req.method, path: req.originalUrl.split('?')[0], ms: Math.round(ms), status: res.statusCode }, ...((globalThis as any).__cmSlow || [])].slice(0, 50);
      }
      return (writeHead as any).apply(this, args);
    };
    next();
  });
  app.use('/api', sameOriginGuard);
  app.use('/api', leaderProxy());

  // Body parsing & rate limiting
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(rateLimiter({ windowMs: 60 * 1000, maxRequests: 500 }));

  // Authenticate request context
  app.use(authenticate);
  // Platform-owner diagnostics: DB latency, connection pool use and the slowest recent requests.
  app.get('/api/v1/platform/perf', async (req: Request, res: Response) => {
    try {
      const { getPoolStats, pingDb, lockReport } = await import('./server/repositories/postgres.store.js');
      if (!(req as any).user?.isPlatformOwner) return res.status(403).json({ success: false, error: 'Platform owner only' });
      res.json({ success: true, data: { db: await pingDb(), pool: getPoolStats(), stuckTransactions: await lockReport(), lastSettingsSave: (globalThis as any).__cmSaveTrace || null, instance: process.env.BOT_INSTANCE_ROLE || 'cloudrun', slow: (globalThis as any).__cmSlow || [], uptimeSec: Math.round(process.uptime()), memoryMb: Math.round(process.memoryUsage().rss / 1048576) } });
    } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
  });


  // Mount versioned and unversioned API routes
  app.use('/api/v1', v1Router);

  // Fallback unversioned mapping for production-readiness check
  app.get('/api/production-readiness/verify-firestore', verifyFirestoreReadiness);
  app.use('/api', v1Router);

  // Catch unmatched API routes so they return JSON 404 rather than HTML
  app.all('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      code: 'NOT_FOUND',
      message: `API endpoint not found: ${req.method} ${req.originalUrl}`,
      requestId: req.id,
    });
  });

  // Centralized Error Handling for API routes
  app.use('/api', errorHandlerMiddleware);

  // Vite middleware for client in development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // Hashed build files never change, so browsers can keep them; index.html is always re-checked.
    app.use(express.static(distPath, {
      setHeaders: (res, file) => {
        if (/[\\/]assets[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Global fallback error handler
  app.use(errorHandlerMiddleware);

  const server = app.listen(PORT, '0.0.0.0', () => {
    logger.info(
      `Community Manager server running on port ${PORT} [env: ${config.NODE_ENV}, free_mode: ${config.FREE_MODE}]`
    );
  });

  // Hot standby (VM containers): log in to Discord right away but stay quiet until this instance is the
  // active bot. The handoff on deploy then only waits for the lease (~2 s), not for a fresh login.
  const hotStandby = String(process.env.BOT_HOT_STANDBY || '').toLowerCase() === 'true' && String(process.env.BOT_ENABLED ?? 'true').toLowerCase() !== 'false';
  if (hotStandby) {
    (globalThis as any).__cmBotActive = false;
    setTimeout(() => { void connectDiscordBot(); }, 1000);
  }

  startLeadership({
    onBecomeLeader: async () => {
      (globalThis as any).__cmBotActive = true;
      await connectDiscordBot();
      EngagementSchedulerService.startScheduler();
      startReminderScheduler();
      // Clear database locks left by a write that a restart cut short, now and every 5 minutes.
      { const tidy = () => import('./server/repositories/postgres.store.js').then(async (m) => { const n = await m.releaseOrphanLocks(); if (n) console.warn(`[DB] Released ${n} stuck transaction(s) holding locks.`); }).catch(() => undefined); tidy(); setInterval(tidy, 5 * 60_000); }
      setTimeout(() => { import('./server/services/brandSync.service.js').then((m) => m.syncBrandToDiscord()).catch(() => undefined); }, 90_000);
      // One-time workspace tidy-up per server (bold category on top, purpose messages, staff-role fix).
      setTimeout(async () => {
        try {
          const { refreshWorkspaceLook } = await import('./server/services/serverWorkspace.service.js');
          for (const g of ((discordService as any).client?.guilds?.cache?.values?.() || [])) await refreshWorkspaceLook(`comm_${g.id}`).catch(() => undefined);
        } catch { /* best effort */ }
      }, 120_000);
    },
    onLoseLeadership: async () => {
      EngagementSchedulerService.stopScheduler();
      stopReminderScheduler();
      if (hotStandby) { (globalThis as any).__cmBotActive = false; return; } // stay connected, quiet
      await discordService.disconnect();
    },
  }).catch((err) => logger.error('[Leadership] Failed to start:', undefined, { error: err?.message }));

  // Graceful Shutdown Handler
  const handleShutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    // 1. Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed to new connections.');
    });

    // 2. Force exit timeout after 10 seconds
    const timeoutTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out (10s), forcing process exit.');
      process.exit(1);
    }, 10000);

    try {
      EngagementSchedulerService.stopScheduler();
      stopReminderScheduler();
      await noteShutdownStarting();
      await discordService.disconnect();
      await stopLeadership();
      // 3. Flush log buffers and telemetry
      logger.info('Flushed operational telemetry and log buffers.');
      clearTimeout(timeoutTimer);
      process.exit(0);
    } catch (err: any) {
      logger.error('Error during graceful shutdown:', undefined, { error: err?.message });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
