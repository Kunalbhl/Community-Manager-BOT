import { EntitlementService } from '../entitlement.service.js';
import {
  AiQuotaSnapshot,
  AiQuotaState,
  AiUsageCapability,
  AiUsageRecord,
  AiUsageSnapshot,
  PlatformAiUsageOverview,
} from '../../../shared/types/ai.js';
import type { UserRole, UserAuthContext } from '../../../shared/types/rbac.js';
import { config } from '../../config/env.js';
import { aiUsageRecordsRepository, communitiesRepository } from '../../repositories/index.js';
import { AiAuditService } from './aiAudit.service.js';
import { logger } from '../../logging/logger.js';

export interface CheckAllowanceOptions {
  userContext?: UserAuthContext;
  requestId?: string;
  idempotencyKey?: string;
  ipAddress?: string;
  inputChars?: number;
  estimatedTokens?: number;
}

export interface AllowanceResult {
  allowed: boolean;
  state: AiQuotaState;
  reason?: string;
  currentUsage: number;
  limit: number;
  remaining: number;
  slotToken?: string;
  isIdempotentReplay?: boolean;
}

export interface RecordUsageParams {
  communityId: string;
  actorUserId?: string;
  actorRole?: UserRole;
  capability: AiUsageCapability;
  success: boolean;
  blocked?: boolean;
  blockedReason?: string;
  error?: string;
  inputChars?: number;
  outputChars?: number;
  inputTokensEstimated?: number;
  outputTokensEstimated?: number;
  actionPlansCreated?: number;
  actionExecutions?: number;
  conversationMessages?: number;
  latencyMs?: number;
  requestId?: string;
  idempotencyKey?: string;
}

export class AiUsageService {
  // Rate-limiting tracking (sliding 60-second window per community)
  private static requestTimestamps: Map<string, number[]> = new Map();

  // In-flight concurrency tracking (per community)
  private static inFlightRequests: Map<string, number> = new Map();

  // Idempotency cache: key -> { timestamp, state, result }
  private static idempotencyStore: Map<
    string,
    { timestamp: number; state: AiQuotaState; cachedResponse?: unknown }
  > = new Map();

  // Sliding latency telemetry for platform health metrics
  private static recentLatencies: number[] = [];

  private static getTodayKey(): string {
    return new Date().toISOString().split('T')[0];
  }

  private static getResetTimeIso(): string {
    const now = new Date();
    const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
    return tomorrow.toISOString();
  }

  /**
   * Validates if the tenant is entitled to use AI Community Manager features via FeatureRegistry + EntitlementService.
   */
  static async checkEntitlement(
    communityId: string,
    featureKey: string = 'AI_ASSISTANT'
  ): Promise<{
    allowed: boolean;
    state: AiQuotaState;
    limit: number;
    reason?: string;
  }> {
    const dailyLimit = config.MAX_AI_REQUESTS_PER_DAY;
    const hasFeature = await EntitlementService.hasFeature(communityId, featureKey);
    if (!hasFeature) {
      const planObj = await EntitlementService.getPlan(communityId);
      const isBillingIssue = planObj.subscriptionStatus === 'PAUSED' || planObj.subscriptionStatus === 'CANCELLED';
      const state: AiQuotaState = isBillingIssue ? 'BILLING_REQUIRED' : 'FEATURE_NOT_ENABLED';
      return {
        allowed: false,
        state,
        limit: 0,
        reason: isBillingIssue
          ? 'Subscription billing status requires update to use AI features.'
          : 'The AI Community Assistant is not enabled for this community plan.',
      };
    }
    return { allowed: true, state: 'AVAILABLE', limit: dailyLimit };
  }

  /**
   * Authoritatively checks if an AI capability invocation is permitted across:
   * - Feature Entitlements
   * - Daily Quotas
   * - Rate Limits
   * - In-flight Concurrency Limits
   * - Context Size / Token Bounds
   * - Idempotency
   */
  static async checkAllowance(
    communityId: string,
    capability: AiUsageCapability,
    options?: CheckAllowanceOptions
  ): Promise<AllowanceResult> {
    const today = this.getTodayKey();
    const actorUserId = options?.userContext?.userId || 'system';
    const actorRole = (options?.userContext?.role || 'OWNER') as UserRole;
    const idempotencyKey = options?.idempotencyKey || options?.requestId;

    // 1. IDEMPOTENCY / RETRY CHECK
    if (idempotencyKey) {
      const cached = this.idempotencyStore.get(`${communityId}:${idempotencyKey}`);
      if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
        // Cached recent execution within 10 minutes
        const usage = await this.getOrCreateUsageRecord(communityId, today);
        const limit = config.MAX_AI_REQUESTS_PER_DAY;
        return {
          allowed: cached.state === 'AVAILABLE',
          state: cached.state,
          reason: 'Idempotent request replayed',
          currentUsage: usage.requestsTotal,
          limit,
          remaining: Math.max(0, limit - usage.requestsTotal),
          isIdempotentReplay: true,
        };
      }
    }

    // 2. ENTITLEMENT CHECK
    const entitlement = await this.checkEntitlement(communityId, 'AI_ASSISTANT');
    if (!entitlement.allowed) {
      await AiAuditService.logFeatureBlocked({
        communityId,
        actorUserId,
        actorRole,
        featureKey: 'AI_ASSISTANT',
        reason: entitlement.reason || 'Feature not entitled',
        requestId: options?.requestId,
        ipAddress: options?.ipAddress,
      });

      return {
        allowed: false,
        state: entitlement.state,
        reason: entitlement.reason,
        currentUsage: 0,
        limit: 0,
        remaining: 0,
      };
    }

    // 3. RATE LIMITING (Sliding 1-Minute Window per community)
    const now = Date.now();
    const timestamps = this.requestTimestamps.get(communityId) || [];
    const recentTimestamps = timestamps.filter((t) => now - t < 60 * 1000);
    this.requestTimestamps.set(communityId, recentTimestamps);

    const rateLimitPerMinute = 10; // 10 requests per minute per community
    if (recentTimestamps.length >= rateLimitPerMinute) {
      await AiAuditService.logRateLimited({
        communityId,
        actorUserId,
        actorRole,
        capability,
        reason: `Rate limit exceeded: ${recentTimestamps.length}/${rateLimitPerMinute} requests per minute`,
        requestId: options?.requestId,
        ipAddress: options?.ipAddress,
      });

      return {
        allowed: false,
        state: 'RATE_LIMITED',
        reason: `Too many AI requests. Please slow down (${rateLimitPerMinute} req/min limit).`,
        currentUsage: recentTimestamps.length,
        limit: rateLimitPerMinute,
        remaining: 0,
      };
    }

    // 4. CONCURRENT REQUEST LIMITS
    const inFlight = this.inFlightRequests.get(communityId) || 0;
    const planObj = await EntitlementService.getPlan(communityId);
    const maxConcurrent = planObj.plan === 'FREE' ? 3 : 5;

    if (inFlight >= maxConcurrent) {
      await AiAuditService.logRateLimited({
        communityId,
        actorUserId,
        actorRole,
        capability,
        reason: `Concurrent AI request limit exceeded (${inFlight}/${maxConcurrent})`,
        requestId: options?.requestId,
        ipAddress: options?.ipAddress,
      });

      return {
        allowed: false,
        state: 'RATE_LIMITED',
        reason: `Too many concurrent AI requests (${inFlight}/${maxConcurrent} simultaneous requests).`,
        currentUsage: inFlight,
        limit: maxConcurrent,
        remaining: 0,
      };
    }

    // 5. CONTEXT / INPUT SIZE LIMITS
    const maxInputChars = 8000;
    if (options?.inputChars && options.inputChars > maxInputChars) {
      return {
        allowed: false,
        state: 'LIMIT_REACHED',
        reason: `Input prompt length (${options.inputChars} characters) exceeds maximum allowed length of ${maxInputChars} characters.`,
        currentUsage: options.inputChars,
        limit: maxInputChars,
        remaining: 0,
      };
    }

    // 6. DAILY USAGE LIMIT
    const usage = await this.getOrCreateUsageRecord(communityId, today);
    const dailyLimit = config.MAX_AI_REQUESTS_PER_DAY;

    // Capability specific limits
    if (capability === 'ACTION_PLAN') {
      const maxActionPlans = 10;
      if (usage.actionPlansCreated >= maxActionPlans) {
        await AiAuditService.logQuotaExceeded({
          communityId,
          actorUserId,
          actorRole,
          capability,
          currentUsage: usage.actionPlansCreated,
          limit: maxActionPlans,
          reason: `Daily action plan creation limit reached (${usage.actionPlansCreated}/${maxActionPlans})`,
          requestId: options?.requestId,
          ipAddress: options?.ipAddress,
        });

        return {
          allowed: false,
          state: 'LIMIT_REACHED',
          reason: `Daily action plan creation limit reached (${usage.actionPlansCreated}/${maxActionPlans}).`,
          currentUsage: usage.actionPlansCreated,
          limit: maxActionPlans,
          remaining: 0,
        };
      }
    }

    if (capability === 'ACTION_EXECUTION') {
      const maxActionExecutions = 20;
      if (usage.actionExecutions >= maxActionExecutions) {
        await AiAuditService.logQuotaExceeded({
          communityId,
          actorUserId,
          actorRole,
          capability,
          currentUsage: usage.actionExecutions,
          limit: maxActionExecutions,
          reason: `Daily action execution limit reached (${usage.actionExecutions}/${maxActionExecutions})`,
          requestId: options?.requestId,
          ipAddress: options?.ipAddress,
        });

        return {
          allowed: false,
          state: 'LIMIT_REACHED',
          reason: `Daily action execution limit reached (${usage.actionExecutions}/${maxActionExecutions}).`,
          currentUsage: usage.actionExecutions,
          limit: maxActionExecutions,
          remaining: 0,
        };
      }
    }

    // General daily request check
    if (usage.requestsTotal >= dailyLimit) {
      await AiAuditService.logQuotaExceeded({
        communityId,
        actorUserId,
        actorRole,
        capability,
        currentUsage: usage.requestsTotal,
        limit: dailyLimit,
        reason: `Daily AI request quota reached (${usage.requestsTotal}/${dailyLimit})`,
        requestId: options?.requestId,
        ipAddress: options?.ipAddress,
      });

      return {
        allowed: false,
        state: 'LIMIT_REACHED',
        reason: `Daily AI request quota reached for this community plan (${usage.requestsTotal}/${dailyLimit}).`,
        currentUsage: usage.requestsTotal,
        limit: dailyLimit,
        remaining: 0,
      };
    }

    // 7. SUCCESSFUL ALLOWANCE & SLOT ACQUISITION
    this.inFlightRequests.set(communityId, inFlight + 1);
    recentTimestamps.push(now);
    this.requestTimestamps.set(communityId, recentTimestamps);

    const slotToken = `slot_${communityId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    await AiAuditService.logQuotaChecked({
      communityId,
      actorUserId,
      actorRole,
      capability,
      allowed: true,
      currentUsage: usage.requestsTotal,
      limit: dailyLimit,
      requestId: options?.requestId,
      ipAddress: options?.ipAddress,
    });

    return {
      allowed: true,
      state: 'AVAILABLE',
      currentUsage: usage.requestsTotal,
      limit: dailyLimit,
      remaining: Math.max(0, dailyLimit - usage.requestsTotal),
      slotToken,
    };
  }

  /**
   * Releases an in-flight execution slot.
   */
  static releaseSlot(communityId: string): void {
    const inFlight = this.inFlightRequests.get(communityId) || 0;
    if (inFlight > 0) {
      this.inFlightRequests.set(communityId, inFlight - 1);
    }
  }

  /**
   * Authoritatively records AI usage metrics to durable tenant storage.
   */
  static async recordUsage(params: RecordUsageParams): Promise<AiUsageRecord> {
    const today = this.getTodayKey();
    const recordId = `ai_usage_${params.communityId}_${today}`;

    // Decrement in-flight slot unconditionally
    this.releaseSlot(params.communityId);

    // Track latency telemetry if present
    if (params.latencyMs !== undefined) {
      this.recentLatencies.push(params.latencyMs);
      if (this.recentLatencies.length > 100) {
        this.recentLatencies.shift();
      }
    }

    // Estimate tokens if not provided: ~4 characters per token
    const inputChars = params.inputChars || 0;
    const outputChars = params.outputChars || 0;
    const inputTokens = params.inputTokensEstimated || Math.ceil(inputChars / 4);
    const outputTokens = params.outputTokensEstimated || Math.ceil(outputChars / 4);
    const totalTokens = inputTokens + outputTokens;

    let record = await this.getOrCreateUsageRecord(params.communityId, today);

    // Increment counters
    record.requestsTotal += 1;
    if (params.success) {
      record.requestsSuccessful += 1;
    } else if (params.blocked) {
      record.requestsBlocked += 1;
      const reason = params.blockedReason || 'SECURITY_POLICY_BLOCKED';
      record.blockedReasons[reason] = (record.blockedReasons[reason] || 0) + 1;
    } else {
      record.requestsFailed += 1;
      const errorKey = params.error || 'INTERNAL_ERROR';
      record.failedReasons[errorKey] = (record.failedReasons[errorKey] || 0) + 1;
    }

    record.inputTokensEstimated += inputTokens;
    record.outputTokensEstimated += outputTokens;
    record.totalTokensEstimated += totalTokens;

    if (params.actionPlansCreated) {
      record.actionPlansCreated += params.actionPlansCreated;
    }
    if (params.actionExecutions) {
      record.actionExecutions += params.actionExecutions;
    }
    if (params.conversationMessages) {
      record.conversationMessages += params.conversationMessages;
    }

    const capKey = params.capability;
    record.usageByCapability[capKey] = (record.usageByCapability[capKey] || 0) + 1;
    record.lastRequestAt = new Date().toISOString();
    record.updatedAt = new Date().toISOString();

    try {
      await aiUsageRecordsRepository.update(recordId, record);
    } catch {
      await aiUsageRecordsRepository.create(record);
    }

    // Synchronize with existing EntitlementService metric tracking for backwards-compatibility
    try {
      await EntitlementService.recordUsage(params.communityId, 'MAX_AI_REQUESTS_PER_DAY', 1);
    } catch (err) {
      logger.warn('[AiUsageService] Failed to sync EntitlementService usage metric:', err);
    }

    // Cache idempotency outcome if key exists
    const idempotencyKey = params.idempotencyKey || params.requestId;
    if (idempotencyKey) {
      this.idempotencyStore.set(`${params.communityId}:${idempotencyKey}`, {
        timestamp: Date.now(),
        state: params.success ? 'AVAILABLE' : params.blocked ? 'LIMIT_REACHED' : 'TEMPORARILY_UNAVAILABLE',
      });
    }

    return record;
  }

  /**
   * Retrieves comprehensive, owner-facing AI usage visibility for a community.
   */
  static async getUsageSnapshot(communityId: string): Promise<AiUsageSnapshot> {
    const today = this.getTodayKey();
    const planObj = await EntitlementService.getPlan(communityId);
    const hasFeature = await EntitlementService.hasFeature(communityId, 'AI_ASSISTANT');
    const record = await this.getOrCreateUsageRecord(communityId, today);

    const dailyLimit = config.MAX_AI_REQUESTS_PER_DAY;
    const maxActionPlans = 10;
    const maxActionExecutions = 20;
    const maxConcurrent = planObj.plan === 'FREE' ? 2 : 5;
    const rateLimitPerMinute = 20;
    const maxTokensPerRequest = config.MAX_AI_TOKENS_PER_REQUEST;
    const maxContextLengthChars = 32000;

    let state: AiQuotaState = 'AVAILABLE';
    if (!hasFeature) {
      state = planObj.subscriptionStatus === 'PAUSED' || planObj.subscriptionStatus === 'CANCELLED' ? 'BILLING_REQUIRED' : 'FEATURE_NOT_ENABLED';
    } else if (record.requestsTotal >= dailyLimit) {
      state = 'LIMIT_REACHED';
    }

    return {
      communityId,
      state,
      plan: planObj.plan,
      current: {
        requestsTotal: record.requestsTotal,
        requestsSuccessful: record.requestsSuccessful,
        requestsBlocked: record.requestsBlocked,
        requestsFailed: record.requestsFailed,
        tokensEstimated: record.totalTokensEstimated,
        actionPlans: record.actionPlansCreated,
        actionExecutions: record.actionExecutions,
        conversationMessages: record.conversationMessages,
      },
      limits: {
        dailyRequests: dailyLimit,
        rateLimitPerMinute,
        maxConcurrent,
        maxTokensPerRequest,
        maxActionPlansPerDay: maxActionPlans,
        maxActionExecutionsPerDay: maxActionExecutions,
        maxContextLengthChars,
      },
      remaining: {
        requests: Math.max(0, dailyLimit - record.requestsTotal),
        actionPlans: Math.max(0, maxActionPlans - record.actionPlansCreated),
        actionExecutions: Math.max(0, maxActionExecutions - record.actionExecutions),
      },
      resetPeriod: 'DAILY',
      resetsAt: this.getResetTimeIso(),
      blockedSummary: {
        total: record.requestsBlocked,
        reasons: record.blockedReasons,
      },
      usageByCapability: record.usageByCapability,
    };
  }

  /**
   * Retrieves platform-level aggregate AI usage and health visibility without leaking any private community content.
   */
  static async getPlatformAiUsage(): Promise<PlatformAiUsageOverview> {
    const today = this.getTodayKey();
    const allRecords = await aiUsageRecordsRepository.list();
    const todayRecords = allRecords.filter((r) => r.date === today);

    let totalAiRequests = 0;
    let successfulRequests = 0;
    let blockedRequests = 0;
    let failedRequests = 0;
    let totalTokensEstimated = 0;

    const usageByCapability: Record<string, number> = {};
    const blockedReasonsBreakdown: Record<string, number> = {};

    const communitySummaries: Array<{
      communityId: string;
      communityName: string;
      requestsTotal: number;
      tokensEstimated: number;
      state: AiQuotaState;
      plan: string;
    }> = [];

    // Aggregate metrics
    for (const rec of todayRecords) {
      totalAiRequests += rec.requestsTotal || 0;
      successfulRequests += rec.requestsSuccessful || 0;
      blockedRequests += rec.requestsBlocked || 0;
      failedRequests += rec.requestsFailed || 0;
      totalTokensEstimated += rec.totalTokensEstimated || 0;

      // Capabilities
      for (const [cap, count] of Object.entries(rec.usageByCapability || {})) {
        usageByCapability[cap] = (usageByCapability[cap] || 0) + (Number(count) || 0);
      }

      // Blocked reasons
      for (const [reason, count] of Object.entries(rec.blockedReasons || {})) {
        blockedReasonsBreakdown[reason] = (blockedReasonsBreakdown[reason] || 0) + (Number(count) || 0);
      }

      let commName = rec.communityId;
      try {
        const comm = await communitiesRepository.getById(rec.communityId);
        if (comm) commName = comm.name;
      } catch {
        // use id
      }

      const isExceeded = (rec.requestsTotal || 0) >= config.MAX_AI_REQUESTS_PER_DAY;
      communitySummaries.push({
        communityId: rec.communityId,
        communityName: commName,
        requestsTotal: rec.requestsTotal || 0,
        tokensEstimated: rec.totalTokensEstimated || 0,
        state: isExceeded ? 'LIMIT_REACHED' : 'AVAILABLE',
        plan: 'STANDARD',
      });
    }

    // Sort top usage
    communitySummaries.sort((a, b) => b.requestsTotal - a.requestsTotal);

    // Compute health metrics
    const errorRatePercent =
      totalAiRequests > 0 ? Math.round((failedRequests / totalAiRequests) * 10000) / 100 : 0;
    const rateLimitedPercent =
      totalAiRequests > 0 ? Math.round((blockedRequests / totalAiRequests) * 10000) / 100 : 0;

    const latencies = this.recentLatencies;
    const avgLatencyMs =
      latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 120;

    const status = errorRatePercent > 15 ? 'CRITICAL' : errorRatePercent > 5 ? 'DEGRADED' : 'HEALTHY';

    return {
      totalAiRequests,
      successfulRequests,
      blockedRequests,
      failedRequests,
      totalTokensEstimated,
      activeAiCommunitiesCount: todayRecords.length,
      topUsageCommunities: communitySummaries.slice(0, 10),
      usageByCapability,
      blockedReasonsBreakdown,
      health: {
        avgLatencyMs,
        errorRatePercent,
        rateLimitedPercent,
        status,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Helper to fetch or create the tenant's daily usage record safely.
   */
  private static async getOrCreateUsageRecord(communityId: string, date: string): Promise<AiUsageRecord> {
    const recordId = `ai_usage_${communityId}_${date}`;
    try {
      const existing = await aiUsageRecordsRepository.getById(recordId);
      if (existing) {
        // Ensure map structures exist
        existing.usageByCapability = existing.usageByCapability || {};
        existing.blockedReasons = existing.blockedReasons || {};
        existing.failedReasons = existing.failedReasons || {};
        return existing;
      }
    } catch {
      // not found
    }

    const newRecord: AiUsageRecord = {
      id: recordId,
      communityId,
      date,
      requestsTotal: 0,
      requestsSuccessful: 0,
      requestsBlocked: 0,
      requestsFailed: 0,
      inputTokensEstimated: 0,
      outputTokensEstimated: 0,
      totalTokensEstimated: 0,
      actionPlansCreated: 0,
      actionExecutions: 0,
      conversationMessages: 0,
      usageByCapability: {},
      blockedReasons: {},
      failedReasons: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await aiUsageRecordsRepository.create(newRecord);
    } catch {
      // created concurrently
    }

    return newRecord;
  }

  /**
   * Legacy method for backwards compatibility.
   */
  static async checkAndConsumeQuota(communityId: string): Promise<{
    allowed: boolean;
    snapshot: AiQuotaSnapshot;
  }> {
    const allowance = await this.checkAllowance(communityId, 'ASK_QUERY');
    const snapshot = await this.getQuotaSnapshot(communityId);
    return {
      allowed: allowance.allowed,
      snapshot,
    };
  }

  /**
   * Legacy method for backwards compatibility.
   */
  static async getQuotaSnapshot(communityId: string): Promise<AiQuotaSnapshot> {
    const usage = await this.getUsageSnapshot(communityId);
    return {
      current: usage.current.requestsTotal,
      limit: usage.limits.dailyRequests,
      remaining: usage.remaining.requests,
    };
  }
}
