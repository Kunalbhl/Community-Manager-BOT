export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details?: unknown;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Invalid request parameters', code = 'BAD_REQUEST', details?: unknown) {
    super(message, 400, code, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', code = 'UNAUTHORIZED', details?: unknown) {
    super(message, 401, code, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied: insufficient permissions', code = 'FORBIDDEN', details?: unknown) {
    super(message, 403, code, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND', details?: unknown) {
    super(message, 404, code, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', code = 'CONFLICT', details?: unknown) {
    super(message, 409, code, details);
  }
}

export class QuotaExceededError extends AppError {
  constructor(
    message = 'Daily free-mode quota exceeded. Operation routed to manual queue.',
    code = 'QUOTA_EXCEEDED',
    details?: unknown
  ) {
    super(message, 429, code, details);
  }
}

export class NotImplementedError extends AppError {
  public module: string;

  constructor(module: string, message = 'This module will be implemented in a later development task.') {
    super(message, 501, 'MODULE_NOT_IMPLEMENTED', { module, phase: 'TASK_1_FOUNDATION' });
    this.module = module;
  }
}

import type { AiFailureCategory, AiOperationalUiState } from '../../shared/types/ai.js';

export function getUiStateForCategory(category: AiFailureCategory): AiOperationalUiState {
  switch (category) {
    case 'RATE_LIMITED':
    case 'TIMEOUT':
    case 'DEPENDENCY_UNAVAILABLE':
    case 'AI_PROCESSING_FAILED':
      return 'retry_available';
    case 'SECURITY_BLOCKED':
    case 'AUTHENTICATION_FAILED':
    case 'AUTHORIZATION_FAILED':
    case 'TENANT_CONTEXT_FAILED':
      return 'blocked';
    case 'INSUFFICIENT_DATA':
      return 'insufficient_data';
    case 'QUOTA_EXCEEDED':
      return 'temporarily_unavailable';
    default:
      return 'failed';
  }
}

export function getGenericUserFacingMessageForCategory(category: AiFailureCategory): string {
  switch (category) {
    case 'AUTHENTICATION_FAILED':
      return 'Authentication required to access AI Assistant features.';
    case 'AUTHORIZATION_FAILED':
      return 'You do not have permission to access AI features for this community.';
    case 'TENANT_CONTEXT_FAILED':
      return 'Unable to verify community tenant context.';
    case 'QUOTA_EXCEEDED':
      return 'Daily AI usage limit reached for this community. Usage resets tomorrow.';
    case 'RATE_LIMITED':
      return 'Requests sent too quickly. Please pause briefly before trying again.';
    case 'SECURITY_BLOCKED':
      return 'Request blocked due to security policy rules.';
    case 'INVALID_INPUT':
      return 'Input text is invalid or exceeds maximum length limits.';
    case 'INSUFFICIENT_DATA':
      return 'Insufficient community telemetry available to perform analysis.';
    case 'CONTEXT_LIMIT':
      return 'Analysis context size limit exceeded. Please narrow your query date range.';
    case 'AI_PROCESSING_FAILED':
      return 'AI Assistant experienced a temporary processing issue. Retry is available.';
    case 'OUTPUT_VALIDATION_FAILED':
      return 'AI response did not pass security validation filters.';
    case 'ACTION_FAILED':
      return 'The requested community action could not be completed.';
    case 'EXPORT_FAILED':
      return 'Failed to generate report export file.';
    case 'TIMEOUT':
      return 'AI processing request timed out. Please try again.';
    case 'DEPENDENCY_UNAVAILABLE':
      return 'AI service dependencies are temporarily unavailable. Retry shorty.';
    default:
      return 'AI Assistant encountered an operational error.';
  }
}

export function sanitizeUserErrorMessage(message: string, category: AiFailureCategory): string {
  if (!message) return getGenericUserFacingMessageForCategory(category);
  let sanitized = String(message)
    .replace(/Gemini/gi, 'AI Assistant')
    .replace(/GoogleGenAI/gi, 'AI Assistant')
    .replace(/Google/gi, 'AI Assistant');

  // Strip potential stack traces, internal paths, raw file names
  if (
    sanitized.includes('At ') ||
    sanitized.includes('evalmachine') ||
    sanitized.includes('.ts:') ||
    sanitized.includes('TypeError:') ||
    sanitized.includes('ReferenceError:')
  ) {
    sanitized = getGenericUserFacingMessageForCategory(category);
  }
  return sanitized;
}

export function isRetryableCategory(category: AiFailureCategory): boolean {
  switch (category) {
    case 'TIMEOUT':
    case 'RATE_LIMITED':
    case 'AI_PROCESSING_FAILED':
    case 'DEPENDENCY_UNAVAILABLE':
      return true;
    default:
      return false;
  }
}

export class AiError extends AppError {
  public category: AiFailureCategory;
  public retryable: boolean;
  public userMessage: string;
  public correlationId: string;
  public uiState: AiOperationalUiState;

  constructor(params: {
    message: string;
    category: AiFailureCategory;
    statusCode?: number;
    retryable?: boolean;
    userMessage?: string;
    correlationId?: string;
    uiState?: AiOperationalUiState;
    details?: unknown;
  }) {
    const statusCode =
      params.statusCode ||
      (params.category === 'AUTHORIZATION_FAILED' ||
      params.category === 'TENANT_CONTEXT_FAILED' ||
      params.category === 'SECURITY_BLOCKED'
        ? 403
        : params.category === 'AUTHENTICATION_FAILED'
        ? 401
        : params.category === 'INVALID_INPUT' ||
          params.category === 'INSUFFICIENT_DATA' ||
          params.category === 'CONTEXT_LIMIT'
        ? 400
        : params.category === 'QUOTA_EXCEEDED' || params.category === 'RATE_LIMITED'
        ? 429
        : params.category === 'TIMEOUT'
        ? 504
        : params.category === 'DEPENDENCY_UNAVAILABLE'
        ? 503
        : 500);

    super(params.message, statusCode, params.category, params.details);
    this.name = 'AiError';
    this.category = params.category;
    this.retryable = params.retryable ?? isRetryableCategory(params.category);
    this.correlationId =
      params.correlationId || `req_ai_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.userMessage = params.userMessage || sanitizeUserErrorMessage(params.message, params.category);
    this.uiState = params.uiState || getUiStateForCategory(params.category);
  }
}

// Task 86: Canonical Integration Error Classes
export class IntegrationError extends AppError {
  public integrationKey?: string;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTEGRATION_ERROR',
    integrationKey?: string,
    details?: unknown
  ) {
    super(message, statusCode, code, details);
    this.name = this.constructor.name;
    this.integrationKey = integrationKey;
  }
}

export class IntegrationNotFoundError extends IntegrationError {
  constructor(integrationKey: string, message?: string) {
    super(
      message || `Integration '${integrationKey}' was not found in the registry.`,
      404,
      'INTEGRATION_NOT_FOUND',
      integrationKey
    );
  }
}

export class IntegrationNotConfiguredError extends IntegrationError {
  constructor(integrationKey: string, message?: string) {
    super(
      message || `Integration '${integrationKey}' is not configured for this community.`,
      400,
      'INTEGRATION_NOT_CONFIGURED',
      integrationKey
    );
  }
}

export class IntegrationUnavailableError extends IntegrationError {
  constructor(integrationKey: string, message?: string) {
    super(
      message || `Integration '${integrationKey}' is currently unavailable or disabled by administrator.`,
      503,
      'INTEGRATION_UNAVAILABLE',
      integrationKey
    );
  }
}

export class IntegrationPermissionRequiredError extends IntegrationError {
  constructor(integrationKey: string, message?: string) {
    super(
      message || `Missing required permissions or OAuth scopes for integration '${integrationKey}'.`,
      403,
      'INTEGRATION_PERMISSION_REQUIRED',
      integrationKey
    );
  }
}

export class IntegrationReauthRequiredError extends IntegrationError {
  constructor(integrationKey: string, message?: string) {
    super(
      message || `Integration '${integrationKey}' token has expired or revoked. Reauthorization required.`,
      401,
      'INTEGRATION_REAUTH_REQUIRED',
      integrationKey
    );
  }
}

export class IntegrationConnectionFailedError extends IntegrationError {
  constructor(integrationKey: string, message?: string, details?: unknown) {
    super(
      message || `Failed to establish connection to integration '${integrationKey}'.`,
      502,
      'INTEGRATION_CONNECTION_FAILED',
      integrationKey,
      details
    );
  }
}

export class IntegrationSyncFailedError extends IntegrationError {
  constructor(integrationKey: string, message?: string, details?: unknown) {
    super(
      message || `Durable synchronization failed for integration '${integrationKey}'.`,
      500,
      'INTEGRATION_SYNC_FAILED',
      integrationKey,
      details
    );
  }
}

export class IntegrationSyncPartialError extends IntegrationError {
  constructor(integrationKey: string, message?: string, details?: unknown) {
    super(
      message || `Synchronization partially succeeded with warnings for integration '${integrationKey}'.`,
      207,
      'INTEGRATION_SYNC_PARTIAL',
      integrationKey,
      details
    );
  }
}

export class IntegrationResourceNotFoundError extends IntegrationError {
  constructor(integrationKey: string, resource: string, message?: string) {
    super(
      message || `Resource '${resource}' not found in integration '${integrationKey}'.`,
      404,
      'INTEGRATION_RESOURCE_NOT_FOUND',
      integrationKey,
      { resource }
    );
  }
}

export class RateLimitedError extends IntegrationError {
  constructor(integrationKey?: string, message?: string, retryAfterSeconds?: number) {
    super(
      message || 'Request was rate limited. Please back off before retrying.',
      429,
      'RATE_LIMITED',
      integrationKey,
      { retryAfterSeconds }
    );
  }
}

