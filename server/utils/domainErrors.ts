/**
 * Domain-specific Typed Errors for Community Manager.
 * Provides structured error codes and human-readable diagnostic messages
 * without exposing internal secrets or credentials.
 */

export type ErrorCode =
  | 'DISCORD_NOT_CONFIGURED'
  | 'DISCORD_AUTH_FAILED'
  | 'DISCORD_GATEWAY_FAILED'
  | 'DISCORD_PERMISSION_REQUIRED'
  | 'DISCORD_INTENT_REQUIRED'
  | 'DISCORD_CHANNEL_NOT_ALLOWED'
  | 'DISCORD_LIMITATION'
  | 'GOOGLE_NOT_CONFIGURED'
  | 'GOOGLE_AUTH_FAILED'
  | 'GOOGLE_SHEETS_SYNC_FAILED'
  | 'INCOMPLETE_MAPPING'
  | 'BILLING_REQUIRED'
  | 'SECRET_NOT_CONFIGURED'
  | 'SECRET_LEAKAGE_DETECTED'
  | 'RATE_LIMITED'
  | 'MANUAL_ACTION_REQUIRED'
  | 'TENANT_ACCESS_DENIED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: ErrorCode = 'INTERNAL_ERROR',
    statusCode = 500,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class DiscordNotConfiguredError extends AppError {
  constructor(message = 'Discord bot is not configured with required credentials') {
    super(message, 'DISCORD_NOT_CONFIGURED', 503);
  }
}

export class DiscordAuthFailedError extends AppError {
  constructor(message = 'Discord bot authentication failed. Verify DISCORD_BOT_TOKEN.') {
    super(message, 'DISCORD_AUTH_FAILED', 401);
  }
}

export class DiscordGatewayFailedError extends AppError {
  constructor(message = 'Discord Gateway connection failed or interrupted') {
    super(message, 'DISCORD_GATEWAY_FAILED', 502);
  }
}

export class DiscordPermissionRequiredError extends AppError {
  constructor(permission: string, action: string) {
    super(
      `Discord permission "${permission}" is required to ${action}.`,
      'DISCORD_PERMISSION_REQUIRED',
      403,
      { requiredPermission: permission, action }
    );
  }
}

export class DiscordIntentRequiredError extends AppError {
  constructor(intent: string, reason: string) {
    super(
      `Discord Gateway intent "${intent}" is required: ${reason}. Enable it in Discord Developer Portal.`,
      'DISCORD_INTENT_REQUIRED',
      403,
      { requiredIntent: intent, reason }
    );
  }
}

export class DiscordChannelNotAllowedError extends AppError {
  constructor(channelId: string, communityId: string) {
    super(
      `Channel ${channelId} is not in the authorized channel allowlist for community ${communityId}.`,
      'DISCORD_CHANNEL_NOT_ALLOWED',
      403,
      { channelId, communityId }
    );
  }
}

export class DiscordLimitationError extends AppError {
  constructor(feature: string, explanation: string) {
    super(
      `Discord API does not support automated ${feature}: ${explanation}. Manual review is required.`,
      'DISCORD_LIMITATION',
      400,
      { feature, explanation }
    );
  }
}

export class GoogleNotConfiguredError extends AppError {
  constructor(message = 'Google Cloud or Google Sheets credentials are not configured') {
    super(message, 'GOOGLE_NOT_CONFIGURED', 503);
  }
}

export class GoogleAuthFailedError extends AppError {
  constructor(message = 'Google API authentication failed') {
    super(message, 'GOOGLE_AUTH_FAILED', 401);
  }
}

export class GoogleSheetsSyncFailedError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'GOOGLE_SHEETS_SYNC_FAILED', 502, details);
  }
}

export class IncompleteMappingError extends AppError {
  constructor(missingFields: string[]) {
    super(
      `Spreadsheet column mapping is incomplete. Missing fields: ${missingFields.join(', ')}`,
      'INCOMPLETE_MAPPING',
      400,
      { missingFields }
    );
  }
}

export class BillingRequiredError extends AppError {
  constructor(resource: string) {
    super(
      `Operation halted: Free-First Policy active. Provisioning "${resource}" requires Google Cloud billing.`,
      'BILLING_REQUIRED',
      402,
      { resource }
    );
  }
}

export class SecretNotConfiguredError extends AppError {
  constructor(secretName: string) {
    super(
      `Required secret "${secretName}" is not configured in environment or Secret Manager.`,
      'SECRET_NOT_CONFIGURED',
      503,
      { secretName }
    );
  }
}

export class RateLimitedError extends AppError {
  constructor(limitName: string, limitValue: number) {
    super(
      `Free-tier limit reached for ${limitName} (${limitValue}/day). Operation queued for manual review.`,
      'RATE_LIMITED',
      429,
      { limitName, limitValue }
    );
  }
}

export class ManualActionRequiredError extends AppError {
  constructor(actionDescription: string, guidance: string) {
    super(
      `Manual action required: ${actionDescription}`,
      'MANUAL_ACTION_REQUIRED',
      400,
      { actionDescription, guidance }
    );
  }
}

export class TenantAccessDeniedError extends AppError {
  constructor(communityId: string) {
    super(
      `Access denied: You do not have permission to access resources in community ${communityId}.`,
      'TENANT_ACCESS_DENIED',
      403,
      { communityId }
    );
  }
}
