import { logger } from '../../logging/logger.js';
import { AiAuditService } from './aiAudit.service.js';
import { AiUsageService } from './aiUsage.service.js';
import {
  AiFailureCategory,
  AiOperationalUiState,
} from '../../../shared/types/ai.js';
import {
  AiError,
  getGenericUserFacingMessageForCategory,
  getUiStateForCategory,
} from '../../utils/errors.js';
import type { UserRole } from '../../../shared/types/rbac.js';

export interface OperationalTelemetryEvent {
  communityId: string;
  actorUserId?: string;
  actorRole?: UserRole;
  action: string;
  category?: AiFailureCategory;
  success: boolean;
  latencyMs?: number;
  correlationId: string;
  details?: Record<string, unknown>;
  error?: string;
}

export class AiTelemetryService {
  /**
   * Generates or preserves a correlation ID across the entire processing pipeline.
   */
  static getOrCreateCorrelationId(providedId?: string): string {
    if (providedId && typeof providedId === 'string' && providedId.trim().length > 0) {
      return providedId.trim();
    }
    return `req_ai_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Enforces timeout limits on AI processing promises.
   */
  static async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operationName: string,
    correlationId?: string
  ): Promise<T> {
    const corrId = this.getOrCreateCorrelationId(correlationId);
    let timer: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new AiError({
            message: `Operation '${operationName}' timed out after ${timeoutMs}ms`,
            category: AiFailureCategory.TIMEOUT,
            statusCode: 504,
            retryable: true,
            correlationId: corrId,
            userMessage: `AI operation '${operationName}' timed out. Please retry your request.`,
            uiState: 'retry_available',
          })
        );
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      if (timer) clearTimeout(timer);
      return result;
    } catch (err) {
      if (timer) clearTimeout(timer);
      throw err;
    }
  }

  /**
   * Retries genuinely retryable operations with exponential backoff and idempotency protection.
   * NEVER retries authorization, security policy blocks, invalid inputs, or destructive confirm failures.
   */
  static async withRetry<T>(
    fn: (attempt: number) => Promise<T>,
    options?: {
      maxRetries?: number;
      initialBackoffMs?: number;
      operationName?: string;
      correlationId?: string;
      onRetry?: (attempt: number, error: Error) => void;
    }
  ): Promise<T> {
    const maxRetries = options?.maxRetries ?? 2;
    const initialBackoffMs = options?.initialBackoffMs ?? 300;
    const operationName = options?.operationName || 'AI_OPERATION';

    let attempt = 0;
    while (true) {
      attempt++;
      try {
        return await fn(attempt);
      } catch (err: any) {
        const isRetryable = this.isErrorRetryable(err);
        if (!isRetryable || attempt > maxRetries) {
          logger.warn(
            `[AiTelemetryService] ${operationName} failed (attempt ${attempt}/${maxRetries + 1}, retryable=${isRetryable}): ${err.message}`
          );
          throw err;
        }

        const backoff = initialBackoffMs * Math.pow(2, attempt - 1);
        logger.info(
          `[AiTelemetryService] Retrying ${operationName} (attempt ${attempt}/${maxRetries}) after ${backoff}ms backoff... Error: ${err.message}`
        );
        if (options?.onRetry) {
          options.onRetry(attempt, err);
        }
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
  }

  /**
   * Determines whether an error is genuinely retryable.
   */
  static isErrorRetryable(err: any): boolean {
    if (err instanceof AiError) {
      return err.retryable;
    }
    const cat = this.classifyError(err);
    return (
      cat === AiFailureCategory.TIMEOUT ||
      cat === AiFailureCategory.DEPENDENCY_UNAVAILABLE ||
      cat === AiFailureCategory.AI_PROCESSING_FAILED ||
      cat === AiFailureCategory.RATE_LIMITED
    );
  }

  /**
   * Classifies any error into a structured AiFailureCategory.
   */
  static classifyError(err: any): AiFailureCategory {
    if (err instanceof AiError) {
      return err.category;
    }

    const msg = String(err?.message || '').toLowerCase();
    const code = String(err?.code || '').toUpperCase();
    const name = String(err?.name || '');

    if (
      code === 'UNAUTHORIZED' ||
      msg.includes('authentication') ||
      msg.includes('unauthorized') ||
      err?.statusCode === 401
    ) {
      return AiFailureCategory.AUTHENTICATION_FAILED;
    }
    if (
      code === 'FORBIDDEN' ||
      msg.includes('permission') ||
      msg.includes('cross-community') ||
      err?.statusCode === 403
    ) {
      if (msg.includes('context boundary') || msg.includes('tenant')) {
        return AiFailureCategory.TENANT_CONTEXT_FAILED;
      }
      return AiFailureCategory.AUTHORIZATION_FAILED;
    }
    if (
      code === 'QUOTA_EXCEEDED' ||
      msg.includes('quota') ||
      msg.includes('daily limit') ||
      err?.statusCode === 429
    ) {
      return AiFailureCategory.QUOTA_EXCEEDED;
    }
    if (
      msg.includes('rate limit') ||
      msg.includes('too many requests') ||
      msg.includes('concurrency')
    ) {
      return AiFailureCategory.RATE_LIMITED;
    }
    if (
      msg.includes('security policy') ||
      msg.includes('prompt injection') ||
      msg.includes('unsafe request') ||
      msg.includes('secret')
    ) {
      return AiFailureCategory.SECURITY_BLOCKED;
    }
    if (
      code === 'BAD_REQUEST' ||
      msg.includes('invalid') ||
      msg.includes('too long') ||
      err?.statusCode === 400
    ) {
      return AiFailureCategory.INVALID_INPUT;
    }
    if (msg.includes('insufficient data') || msg.includes('no telemetry') || msg.includes('no facts')) {
      return AiFailureCategory.INSUFFICIENT_DATA;
    }
    if (msg.includes('context limit') || msg.includes('token limit')) {
      return AiFailureCategory.CONTEXT_LIMIT;
    }
    if (msg.includes('timed out') || msg.includes('timeout') || name.includes('Timeout')) {
      return AiFailureCategory.TIMEOUT;
    }
    if (
      msg.includes('network') ||
      msg.includes('fetch failed') ||
      msg.includes('econnrefused') ||
      msg.includes('overloaded') ||
      msg.includes('503')
    ) {
      return AiFailureCategory.DEPENDENCY_UNAVAILABLE;
    }
    if (msg.includes('output failed security validation') || msg.includes('guaranteed outcome')) {
      return AiFailureCategory.OUTPUT_VALIDATION_FAILED;
    }
    if (msg.includes('action failed') || msg.includes('execution failed')) {
      return AiFailureCategory.ACTION_FAILED;
    }
    if (msg.includes('export failed') || msg.includes('report')) {
      return AiFailureCategory.EXPORT_FAILED;
    }

    return AiFailureCategory.AI_PROCESSING_FAILED;
  }

  /**
   * Normalizes any error into a safe, non-leaking, classified AiError.
   */
  static normalizeError(err: any, correlationId?: string): AiError {
    const corrId = this.getOrCreateCorrelationId(correlationId || err?.correlationId);
    if (err instanceof AiError) {
      if (!err.correlationId) err.correlationId = corrId;
      return err;
    }

    const category = this.classifyError(err);
    const retryable = this.isErrorRetryable(err);
    const userMessage = getGenericUserFacingMessageForCategory(category);

    return new AiError({
      message: err?.message || 'AI processing failed',
      category,
      statusCode: err?.statusCode,
      retryable,
      userMessage,
      correlationId: corrId,
      uiState: getUiStateForCategory(category),
      details: err?.details,
    });
  }

  /**
   * Centralized telemetry recorder for all AI operational events.
   */
  static async recordEvent(event: OperationalTelemetryEvent): Promise<void> {
    const corrId = this.getOrCreateCorrelationId(event.correlationId);
    logger.info(
      `[AiTelemetry] [${event.action}] Community: ${event.communityId} | Success: ${event.success} | Latency: ${event.latencyMs || 0}ms | Category: ${event.category || 'N/A'} | CorrId: ${corrId}`
    );

    if (event.actorUserId && event.actorRole) {
      await AiAuditService.logOperationalEvent({
        communityId: event.communityId,
        actorUserId: event.actorUserId,
        actorRole: event.actorRole,
        action: event.action,
        category: event.category || 'AI_PROCESSING_FAILED',
        success: event.success,
        latencyMs: event.latencyMs,
        correlationId: corrId,
        error: event.error,
        details: event.details,
      });
    }
  }
}
