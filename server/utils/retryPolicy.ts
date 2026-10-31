import { logger } from '../logging/logger.js';
import { StandardError, isCategoryRetryable } from './standardError.js';
import { OperationalErrorCategory } from '../../shared/types/observability.js';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  isDestructive?: boolean;
  isIdempotent?: boolean;
  correlationId?: string;
  operationName?: string;
}

export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 100;
  const maxDelayMs = options.maxDelayMs ?? 3000;
  const backoffFactor = options.backoffFactor ?? 2;
  const correlationId = options.correlationId || `corr_${Date.now()}`;
  const opName = options.operationName || 'AnonymousOperation';

  // Safety Gate: Never automatically retry destructive operations unless explicitly idempotent
  if (options.isDestructive && !options.isIdempotent) {
    try {
      return await fn();
    } catch (err) {
      logger.logOperational({
        correlationId,
        operation: opName,
        status: 'FAILURE',
        errorMessage: `Destructive non-idempotent operation failed without auto-retry: ${err instanceof Error ? err.message : String(err)}`,
      });
      throw err;
    }
  }

  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;

      // Evaluate if error category is retryable
      let category: OperationalErrorCategory = err.code || 'INTERNAL_ERROR';
      let retryable = err.retryable !== undefined ? err.retryable : isCategoryRetryable(category);

      if (!retryable || attempt > maxRetries) {
        logger.logOperational({
          correlationId,
          operation: opName,
          status: 'FAILURE',
          errorCategory: category,
          errorMessage: `Operation failed permanently after attempt ${attempt}: ${err.message}`,
        });
        throw err;
      }

      // Calculate exponential delay with full jitter
      const jitter = Math.random() * 0.5 + 0.75; // 0.75x to 1.25x jitter
      const actualDelay = Math.min(Math.round(delay * jitter), maxDelayMs);

      logger.logOperational({
        correlationId,
        operation: opName,
        status: 'RETRYING',
        errorCategory: category,
        errorMessage: `Transient error on attempt ${attempt}/${maxRetries}. Retrying in ${actualDelay}ms... (${err.message})`,
      });

      await new Promise((resolve) => setTimeout(resolve, actualDelay));
      delay *= backoffFactor;
    }
  }

  throw new StandardError({
    message: `Operation ${opName} failed after ${maxRetries} retries`,
    code: 'TIMEOUT',
    statusCode: 504,
    retryable: true,
    correlationId,
  });
}
