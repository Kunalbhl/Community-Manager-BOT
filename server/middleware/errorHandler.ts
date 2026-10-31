import { Request, Response, NextFunction } from 'express';
import { StandardError, getSafeUserMessageForCategory } from '../utils/standardError.js';
import { AppError } from '../utils/errors.js';
import { OperationalErrorCategory } from '../../shared/types/observability.js';
import { logger } from '../logging/logger.js';
import { observabilityService } from '../services/observability/observability.service.js';
import { secretsManager } from '../security/secrets.js';

export function standardErrorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const correlationId =
    err.correlationId || (req.headers['x-correlation-id'] as string) || `corr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const requestId = req.id || `req_${Date.now()}`;

  let statusCode = 500;
  let code: OperationalErrorCategory = 'INTERNAL_ERROR';
  let userMessage = 'An unexpected server error occurred.';
  let retryable = false;
  let requiredAction = err.requiredAction;

  if (err instanceof StandardError) {
    statusCode = err.statusCode;
    code = err.code;
    userMessage = err.userMessage;
    retryable = err.retryable;
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = (err.code as OperationalErrorCategory) || (statusCode === 401 ? 'AUTHENTICATION_FAILED' : statusCode === 403 ? 'AUTHORIZATION_FAILED' : statusCode === 404 ? 'NOT_FOUND' : statusCode === 429 ? 'RATE_LIMITED' : 'VALIDATION_FAILED');
    userMessage = err.message || getSafeUserMessageForCategory(code);
  } else if (err.statusCode && typeof err.statusCode === 'number') {
    statusCode = err.statusCode;
    if (statusCode === 401) code = 'AUTHENTICATION_FAILED';
    else if (statusCode === 403) code = 'AUTHORIZATION_FAILED';
    else if (statusCode === 404) code = 'NOT_FOUND';
    else if (statusCode === 409) code = 'CONFLICT';
    else if (statusCode === 429) code = 'RATE_LIMITED';
    else if (statusCode === 400) code = 'VALIDATION_FAILED';
    userMessage = err.message || getSafeUserMessageForCategory(code);
  } else {
    userMessage = err?.message && !err.message.includes('stack') ? err.message : getSafeUserMessageForCategory('INTERNAL_ERROR');
  }

  // Record operational metrics by failure type
  if (code === 'AUTHENTICATION_FAILED' || statusCode === 401) {
    observabilityService.recordAuthFailure({ reason: err.message, correlationId });
  } else if (code === 'AUTHORIZATION_FAILED' || statusCode === 403) {
    observabilityService.recordAuthzFailure({ reason: err.message, correlationId });
  } else if (code === 'RATE_LIMITED' || statusCode === 429) {
    observabilityService.recordRateLimited({ operation: `${req.method} ${req.path}`, correlationId });
  }

  const durationMs = (req as any).startTime ? Date.now() - (req as any).startTime : 0;

  // Record request metric
  observabilityService.recordRequest(durationMs, true);

  // Redact any sensitive tokens, authorization headers, or secrets from messages
  const safeMessage = secretsManager.redactString(userMessage);

  // Structured Operational Logging
  logger.logOperational({
    correlationId,
    requestId,
    communityId: (req.query?.communityId || req.params?.communityId || req.body?.communityId) as string,
    workspaceId: (req.query?.workspaceId || req.params?.workspaceId || req.body?.workspaceId) as string,
    operation: `${req.method} ${req.path}`,
    status: 'FAILURE',
    durationMs,
    errorCategory: code,
    errorMessage: secretsManager.redactString(err.message || safeMessage),
  });

  // Record operational incident for 5xx errors or key dependency failures
  if (statusCode >= 500 || code === 'DISCORD_UNAVAILABLE' || code === 'DATABASE_UNAVAILABLE' || code === 'BILLING_FAILED') {
    observabilityService.recordIncident({
      category: code,
      type: code,
      dependency: code.includes('DISCORD') ? 'Discord' : code.includes('DATABASE') ? 'Database' : code.includes('BILLING') ? 'Billing' : 'Server',
      summary: `${req.method} ${req.path} failed: ${secretsManager.redactString(err.message || safeMessage)}`,
      correlationId,
      severity: statusCode >= 500 ? 'CRITICAL' : 'WARNING',
      recoveryInstructions: requiredAction ? secretsManager.redactString(requiredAction) : undefined,
    }).catch((e) => console.error('Failed to log incident:', e));
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: safeMessage,
      correlationId,
      retryable,
      ...(requiredAction ? { requiredAction: secretsManager.redactString(requiredAction) } : {}),
    },
    requestId,
  });
}

export const errorHandlerMiddleware = standardErrorHandler;
