import { IntegrationErrorCode, IntegrationKey } from '../../../shared/types/integrations.js';
import { BadRequestError, ForbiddenError, NotFoundError, AppError } from '../../utils/errors.js';

export { BadRequestError, ForbiddenError, NotFoundError };

export class IntegrationError extends AppError {
  public readonly integrationKey?: IntegrationKey;
  public readonly code: IntegrationErrorCode;
  public readonly userFacingMessage: string;

  constructor(params: {
    integrationKey?: IntegrationKey;
    code: IntegrationErrorCode;
    statusCode?: number;
    message: string;
    userFacingMessage?: string;
  }) {
    super(params.message, params.statusCode || 500, params.code);
    this.name = 'IntegrationError';
    this.integrationKey = params.integrationKey;
    this.code = params.code;
    this.userFacingMessage = params.userFacingMessage || params.message;
  }
}

export class IntegrationNotFoundError extends IntegrationError {
  constructor(integrationKey: IntegrationKey) {
    super({
      integrationKey,
      code: 'INTEGRATION_NOT_FOUND',
      statusCode: 404,
      message: `Integration '${integrationKey}' was not found.`,
    });
  }
}

export class IntegrationNotConfiguredError extends IntegrationError {
  constructor(integrationKey: IntegrationKey, details?: string) {
    super({
      integrationKey,
      code: 'INTEGRATION_NOT_CONFIGURED',
      statusCode: 400,
      message: `Integration '${integrationKey}' is not configured.${details ? ` Details: ${details}` : ''}`,
      userFacingMessage: `The ${integrationKey} integration requires configuration before use.`,
    });
  }
}

export class IntegrationUnavailableError extends IntegrationError {
  constructor(integrationKey: IntegrationKey, reason: string) {
    super({
      integrationKey,
      code: 'INTEGRATION_UNAVAILABLE',
      statusCode: 503,
      message: `Integration '${integrationKey}' is currently unavailable: ${reason}`,
      userFacingMessage: `The ${integrationKey} service is currently unavailable. Please try again later.`,
    });
  }
}

export class IntegrationPermissionRequiredError extends IntegrationError {
  constructor(integrationKey: IntegrationKey, missingScopeOrPermission: string) {
    super({
      integrationKey,
      code: 'INTEGRATION_PERMISSION_REQUIRED',
      statusCode: 403,
      message: `Integration '${integrationKey}' requires missing permission or scope: ${missingScopeOrPermission}`,
      userFacingMessage: `Additional permissions are required to connect or operate ${integrationKey}.`,
    });
  }
}

export class IntegrationReauthRequiredError extends IntegrationError {
  constructor(integrationKey: IntegrationKey) {
    super({
      integrationKey,
      code: 'INTEGRATION_REAUTH_REQUIRED',
      statusCode: 401,
      message: `Integration '${integrationKey}' credentials have expired and require reauthorization.`,
      userFacingMessage: `Your authorization for ${integrationKey} has expired. Please reconnect your account.`,
    });
  }
}

export class IntegrationConnectionFailedError extends IntegrationError {
  constructor(integrationKey: IntegrationKey, reason: string) {
    super({
      integrationKey,
      code: 'INTEGRATION_CONNECTION_FAILED',
      statusCode: 502,
      message: `Failed to connect integration '${integrationKey}': ${reason}`,
      userFacingMessage: `Connection to ${integrationKey} failed.`,
    });
  }
}

export class IntegrationSyncFailedError extends IntegrationError {
  constructor(integrationKey: IntegrationKey, resource: string, reason: string) {
    super({
      integrationKey,
      code: 'INTEGRATION_SYNC_FAILED',
      statusCode: 500,
      message: `Synchronization failed for integration '${integrationKey}' on resource '${resource}': ${reason}`,
      userFacingMessage: `Sync operation failed for ${integrationKey}.`,
    });
  }
}

export class IntegrationConfigurationError extends IntegrationError {
  constructor(integrationKey: IntegrationKey, message: string) {
    super({
      integrationKey,
      code: 'INTEGRATION_NOT_CONFIGURED',
      statusCode: 400,
      message: `Configuration error for '${integrationKey}': ${message}`,
      userFacingMessage: message,
    });
  }
}
