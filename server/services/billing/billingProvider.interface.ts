import { PlanType } from '../entitlement.service.js';

export interface CheckoutSessionOptions {
  workspaceId: string;
  targetPlan: PlanType;
  userEmail?: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  checkoutUrl?: string;
  status: 'REDIRECT_REQUIRED' | 'BILLING_NOT_CONFIGURED';
  message?: string;
}

export interface ParsedWebhookEvent {
  providerEventId: string;
  eventType: string; // e.g. 'checkout.session.completed', 'invoice.payment_succeeded', 'invoice.payment_failed', 'customer.subscription.deleted'
  workspaceId?: string;
  subscriptionId?: string;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  providerInvoiceId?: string;
  plan?: PlanType;
  amount?: number;
  currency?: string;
  periodStart?: string;
  periodEnd?: string;
  payload: Record<string, any>;
}

export interface IBillingProvider {
  name: string;
  isConfigured(): boolean;
  createCheckoutSession(options: CheckoutSessionOptions): Promise<CheckoutSessionResult>;
  verifyWebhookSignature(rawBody: string | Buffer, signatureHeader: string): Promise<boolean>;
  parseWebhookEvent(rawBody: string | Buffer, signatureHeader: string): Promise<ParsedWebhookEvent>;
}
