import { OperationalErrorCategory } from '../../shared/types/observability.js';

export class StandardError extends Error {
  public statusCode: number;
  public code: OperationalErrorCategory;
  public userMessage: string;
  public retryable: boolean;
  public requiredAction?: string;
  public correlationId: string;

  constructor(param: {
    message: string;
    code?: OperationalErrorCategory;
    statusCode?: number;
    userMessage?: string;
    retryable?: boolean;
    requiredAction?: string;
    correlationId?: string;
  }) {
    super(param.message);
    this.name = 'StandardError';
    this.code = param.code || 'INTERNAL_ERROR';
    this.statusCode = param.statusCode || 500;
    this.userMessage = param.userMessage || getSafeUserMessageForCategory(this.code);
    this.retryable = param.retryable !== undefined ? param.retryable : isCategoryRetryable(this.code);
    this.requiredAction = param.requiredAction;
    this.correlationId = param.correlationId || `corr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  }
}

export function isCategoryRetryable(category: OperationalErrorCategory): boolean {
  switch (category) {
    case 'TIMEOUT':
    case 'RATE_LIMITED':
    case 'DISCORD_UNAVAILABLE':
    case 'DATABASE_UNAVAILABLE':
    case 'AI_PROCESSING_FAILED':
    case 'DEPENDENCY_UNAVAILABLE':
      return true;
    default:
      return false;
  }
}

export function getSafeUserMessageForCategory(category: OperationalErrorCategory): string {
  switch (category) {
    case 'AUTHENTICATION_FAILED':
      return 'Authentication failed or session expired. Please log in again.';
    case 'AUTHORIZATION_FAILED':
      return 'Access denied. You do not have permission to perform this action.';
    case 'TENANT_CONTEXT_FAILED':
      return 'Unable to verify community or workspace organization context.';
    case 'VALIDATION_FAILED':
      return 'Invalid request payload or missing required parameters.';
    case 'NOT_FOUND':
      return 'The requested resource could not be found.';
    case 'CONFLICT':
      return 'Request conflicted with an existing resource or concurrent update.';
    case 'RATE_LIMITED':
      return 'Requests sent too quickly. Please pause briefly before retrying.';
    case 'DISCORD_UNAVAILABLE':
      return 'Discord connection or API service is currently unavailable.';
    case 'DISCORD_PERMISSION_FAILED':
      return 'Discord bot lacks required server or channel permissions.';
    case 'DATABASE_UNAVAILABLE':
      return 'Persistence storage service is temporarily unavailable.';
    case 'AI_PROCESSING_FAILED':
      return 'AI assistant processing encountered a transient error.';
    case 'BILLING_FAILED':
      return 'Billing provider error or unconfirmed payment transaction.';
    case 'WEBHOOK_FAILED':
      return 'Webhook delivery or signature verification failed.';
    case 'AUTOMATION_FAILED':
      return 'Automation workflow execution failed.';
    case 'TIMEOUT':
      return 'Operation timed out waiting for upstream dependency.';
    case 'DEPENDENCY_UNAVAILABLE':
      return 'External integration dependency is temporarily unavailable.';
    default:
      return 'An unexpected server error occurred. Please try again later.';
  }
}
