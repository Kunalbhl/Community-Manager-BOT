import {
  IBillingProvider,
  CheckoutSessionOptions,
  CheckoutSessionResult,
  ParsedWebhookEvent,
} from './billingProvider.interface.js';

export class UnconfiguredBillingProvider implements IBillingProvider {
  name = 'UNCONFIGURED';

  isConfigured(): boolean {
    return false;
  }

  async createCheckoutSession(options: CheckoutSessionOptions): Promise<CheckoutSessionResult> {
    return {
      sessionId: '',
      status: 'BILLING_NOT_CONFIGURED',
      message: 'Production billing provider is not configured for this environment.',
    };
  }

  async verifyWebhookSignature(rawBody: string | Buffer, signatureHeader: string): Promise<boolean> {
    // If webhook secret isn't set, reject webhooks truthfully
    return false;
  }

  async parseWebhookEvent(rawBody: string | Buffer, signatureHeader: string): Promise<ParsedWebhookEvent> {
    throw new Error('Billing provider is not configured.');
  }
}
