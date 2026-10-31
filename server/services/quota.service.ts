import { config } from '../config/env.js';

interface DailyQuotaUsage {
  date: string; // YYYY-MM-DD
  aiRequests: number;
  applications: number;
  sheetWrites: number;
}

export type QuotaType = 'aiRequests' | 'applications' | 'sheetWrites';

export interface QuotaCheckResult {
  allowed: boolean;
  current: number;
  max: number;
  freeModeActive: boolean;
  fallbackToManualQueue: boolean;
  message?: string;
}

export class QuotaService {
  private dailyUsage: Map<string, DailyQuotaUsage> = new Map();

  private getTodayKey(): string {
    return new Date().toISOString().split('T')[0];
  }

  private getTodayUsage(key: string): DailyQuotaUsage {
    let usage = this.dailyUsage.get(key);
    if (!usage) {
      usage = { date: key, aiRequests: 0, applications: 0, sheetWrites: 0 };
      this.dailyUsage.set(key, usage);
    }
    return usage;
  }

  /**
   * Checks if an action is within free mode limits.
   * Never falls back to paid APIs; signals manual queue fallback when exhausted.
   */
  checkQuota(type: QuotaType, communityId = 'default'): QuotaCheckResult {
    const today = this.getTodayKey();
    const trackerKey = `${communityId}:${today}`;
    const usage = this.getTodayUsage(trackerKey);

    let current = 0;
    let max = 0;

    switch (type) {
      case 'aiRequests':
        current = usage.aiRequests;
        max = config.MAX_AI_REQUESTS_PER_DAY;
        break;
      case 'applications':
        current = usage.applications;
        max = config.MAX_APPLICATIONS_PER_DAY;
        break;
      case 'sheetWrites':
        current = usage.sheetWrites;
        max = config.MAX_SHEET_WRITES_PER_DAY;
        break;
    }

    if (!config.FREE_MODE) {
      return {
        allowed: true,
        current,
        max,
        freeModeActive: false,
        fallbackToManualQueue: false,
      };
    }

    if (current >= max) {
      return {
        allowed: false,
        current,
        max,
        freeModeActive: true,
        fallbackToManualQueue: true,
        message: `Free quota exhausted for ${type} (${current}/${max}). Routed to manual queue.`,
      };
    }

    return {
      allowed: true,
      current,
      max,
      freeModeActive: true,
      fallbackToManualQueue: false,
    };
  }

  /**
   * Consumes one quota unit if allowed.
   */
  consumeQuota(type: QuotaType, communityId = 'default'): QuotaCheckResult {
    const check = this.checkQuota(type, communityId);
    if (!check.allowed) {
      return check;
    }

    const today = this.getTodayKey();
    const trackerKey = `${communityId}:${today}`;
    const usage = this.getTodayUsage(trackerKey);

    switch (type) {
      case 'aiRequests':
        usage.aiRequests += 1;
        break;
      case 'applications':
        usage.applications += 1;
        break;
      case 'sheetWrites':
        usage.sheetWrites += 1;
        break;
    }

    return {
      ...check,
      current: check.current + 1,
    };
  }

  getSnapshot(communityId = 'default') {
    const today = this.getTodayKey();
    const trackerKey = `${communityId}:${today}`;
    const usage = this.getTodayUsage(trackerKey);

    return {
      date: today,
      freeMode: config.FREE_MODE,
      quotas: {
        aiRequests: { current: usage.aiRequests, max: config.MAX_AI_REQUESTS_PER_DAY },
        applications: { current: usage.applications, max: config.MAX_APPLICATIONS_PER_DAY },
        sheetWrites: { current: usage.sheetWrites, max: config.MAX_SHEET_WRITES_PER_DAY },
        maxAiTokensPerRequest: config.MAX_AI_TOKENS_PER_REQUEST,
      },
    };
  }
}

export const quotaService = new QuotaService();
