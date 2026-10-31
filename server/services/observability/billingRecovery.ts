import { observabilityService } from './observability.service.js';
import { StandardError } from '../../utils/standardError.js';
import { logger } from '../../logging/logger.js';

export class BillingRecoveryHelper {
  static handleWebhookFailure(
    correlationId: string,
    reason: string,
    rawPayloadSnippet?: string
  ) {
    logger.logOperational({
      correlationId,
      operation: 'BILLING_WEBHOOK_VERIFY',
      status: 'FAILURE',
      errorCategory: 'WEBHOOK_FAILED',
      errorMessage: `Billing webhook verification failed: ${reason}`,
    });

    observabilityService.recordIncident({
      category: 'WEBHOOK_FAILED',
      dependency: 'Billing Provider Webhook',
      summary: `Billing webhook failed verification: ${reason}`,
      severity: 'HIGH',
      correlationId,
      recoveryInstructions: 'Verify STRIPE_WEBHOOK_SECRET and webhook endpoint signing configuration.',
    });

    throw new StandardError({
      message: `Billing webhook failed: ${reason}. Entitlement status unchanged.`,
      code: 'WEBHOOK_FAILED',
      statusCode: 400,
      retryable: false,
      correlationId,
      requiredAction: 'Re-configure webhook signing secret in Billing Dashboard.',
    });
  }
}
