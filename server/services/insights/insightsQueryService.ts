import { EntitlementService } from '../entitlement.service.js';
import { logger } from '../../logging/logger.js';

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
}

export class InsightsQueryService {
  private static cache = new Map<string, CacheEntry<unknown>>();
  private static DEFAULT_TTL_MS = 60 * 1000; // 60 seconds TTL

  /**
   * Generates a tenant-isolated cache key
   */
  static buildCacheKey(
    communityId: string,
    domain: string,
    rangeType: string,
    rangeStart: string,
    rangeEnd: string,
    timezone: string
  ): string {
    return `${communityId}:${domain}:${rangeType}:${rangeStart}_${rangeEnd}:${timezone}`;
  }

  /**
   * Retrieves data from cache if present and valid
   */
  static getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Saves data into cache with TTL
   */
  static setInCache<T>(key: string, data: T, ttlMs: number = this.DEFAULT_TTL_MS): void {
    // Prevent unbounded memory growth by pruning expired entries if cache is large
    if (this.cache.size > 500) {
      const now = Date.now();
      for (const [k, e] of this.cache.entries()) {
        if (now > e.expiresAt) {
          this.cache.delete(k);
        }
      }
    }

    this.cache.set(key, {
      data,
      cachedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Invalidate all cached analytics for a specific tenant
   */
  static invalidateTenant(communityId: string): void {
    const prefix = `${communityId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
    logger.debug(`[INSIGHTS_CACHE] Invalidate tenant ${communityId}`);
  }

  /**
   * Wrap an analytical fetch with tenant caching and authoritative entitlement usage tracking
   */
  static async executeCachedQuery<T>(
    communityId: string,
    domain: string,
    rangeType: string,
    rangeStart: string,
    rangeEnd: string,
    timezone: string,
    fetcher: () => Promise<T>,
    ttlMs: number = this.DEFAULT_TTL_MS
  ): Promise<T> {
    const cacheKey = this.buildCacheKey(communityId, domain, rangeType, rangeStart, rangeEnd, timezone);

    const cached = this.getFromCache<T>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Execute authoritative fetcher
    const data = await fetcher();

    // Cache the result
    this.setInCache(cacheKey, data, ttlMs);

    // Record usage asynchronously
    try {
      await EntitlementService.recordUsage(communityId, 'INSIGHTS_QUERIES', 1);
      if (rangeType === 'LAST_90_DAYS' || rangeType === 'CUSTOM') {
        await EntitlementService.recordUsage(communityId, 'ADVANCED_ANALYTICS_QUERIES', 1);
      }
    } catch (err) {
      logger.warn(`Failed to record insights usage for ${communityId}: ${err}`);
    }

    return data;
  }
}
