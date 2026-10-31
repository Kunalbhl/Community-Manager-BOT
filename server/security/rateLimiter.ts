import { Request, Response, NextFunction } from 'express';
import { quotaService, QuotaType } from '../services/quota.service.js';
import { QuotaExceededError } from '../utils/errors.js';
import { config } from '../config/env.js';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

const ipBuckets = new Map<string, RateLimitRecord>();

// Periodically clean up expired records
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipBuckets.entries()) {
    if (now > record.resetTime) {
      ipBuckets.delete(ip);
    }
  }
}, 60000);

/**
 * Standard in-memory rate limiting middleware per IP with environment-aware thresholds.
 */
export function rateLimiter(options: { windowMs: number; maxRequests: number }) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Exclude health, telemetry, static assets, and readiness endpoints from rate limiting
    const path = req.path || req.url || '';
    if (
      path.startsWith('/health') ||
      path.startsWith('/telemetry') ||
      path.startsWith('/@') ||
      path.startsWith('/src/') ||
      path.startsWith('/node_modules/') ||
      path.endsWith('.js') ||
      path.endsWith('.css') ||
      path.endsWith('.svg') ||
      path.endsWith('.png') ||
      path.endsWith('.ico')
    ) {
      return next();
    }

    // In development or development simulation mode, provide generous headroom
    const isDev = config.NODE_ENV !== 'production' || config.APP_RUNTIME_MODE === 'DEVELOPMENT_SIMULATION';
    const effectiveLimit = isDev ? Math.max(options.maxRequests * 10, 2000) : options.maxRequests;

    const ip = req.ip || req.socket.remoteAddress || 'unknown-ip';
    const now = Date.now();

    const record = ipBuckets.get(ip);
    if (!record || now > record.resetTime) {
      ipBuckets.set(ip, { count: 1, resetTime: now + options.windowMs });
      return next();
    }

    if (record.count >= effectiveLimit) {
      res.setHeader('Retry-After', Math.ceil((record.resetTime - now) / 1000));
      return res.status(429).json({
        success: false,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please slow down.',
        requestId: (req as Request & { id?: string }).id,
      });
    }

    record.count++;
    next();
  };
}

/**
 * Daily free-mode quota enforcement middleware.
 */
export function enforceQuota(type: QuotaType) {
  return (req: Request, res: Response, next: NextFunction) => {
    const communityId = (req.params.communityId || req.query.communityId || 'default') as string;
    const check = quotaService.consumeQuota(type, communityId);

    if (!check.allowed) {
      // In accordance with Section 2: never silently fallback to paid APIs.
      // Gracefully signal manual review or queueing.
      return next(new QuotaExceededError(check.message));
    }

    next();
  };
}
