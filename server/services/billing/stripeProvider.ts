import crypto from 'crypto';
import {
  IBillingProvider,
  CheckoutSessionOptions,
  CheckoutSessionResult,
  ParsedWebhookEvent,
} from './billingProvider.interface.js';
import { PlanType } from '../entitlement.service.js';
import { logger } from '../../logging/logger.js';

export class StripeBillingProvider implements IBillingProvider {
  name = 'STRIPE';

  private secretKey?: string;
  private webhookSecret?: string;

  constructor() {
    this.secretKey = process.env.STRIPE_SECRET_KEY;
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  }

  isConfigured(): boolean {
    return Boolean(this.secretKey && this.secretKey.startsWith('sk_'));
  }

  async createCheckoutSession(options: CheckoutSessionOptions): Promise<CheckoutSessionResult> {
    if (!this.isConfigured()) {
      return {
        sessionId: '',
        status: 'BILLING_NOT_CONFIGURED',
        message: 'Stripe secret key is not configured in environment (STRIPE_SECRET_KEY).',
      };
    }

    try {
      // Call official Stripe REST API to create genuine Checkout Session
      const params = new URLSearchParams();
      params.append('payment_method_types[0]', 'card');
      params.append('mode', 'subscription');
      if (options.successUrl) params.append('success_url', options.successUrl);
      if (options.cancelUrl) params.append('cancel_url', options.cancelUrl);
      params.append('client_reference_id', options.workspaceId);
      params.append('metadata[workspaceId]', options.workspaceId);
      params.append('metadata[plan]', options.targetPlan);

      if (options.userEmail) {
        params.append('customer_email', options.userEmail);
      }

      const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errData: any = await response.json().catch(() => ({}));
        const errMsg = errData?.error?.message || `Stripe API error: ${response.statusText}`;
        logger.error(`[StripeBillingProvider] Checkout creation failed: ${errMsg}`);
        return {
          sessionId: '',
          status: 'BILLING_NOT_CONFIGURED',
          message: errMsg,
        };
      }

      const sessionData: any = await response.json();
      return {
        sessionId: sessionData.id,
        checkoutUrl: sessionData.url || `https://checkout.stripe.com/pay/${sessionData.id}`,
        status: 'REDIRECT_REQUIRED',
      };
    } catch (err: any) {
      logger.error(`[StripeBillingProvider] createCheckoutSession error: ${err.message}`);
      return {
        sessionId: '',
        status: 'BILLING_NOT_CONFIGURED',
        message: err.message,
      };
    }
  }

  async verifyWebhookSignature(rawBody: string | Buffer, signatureHeader: string): Promise<boolean> {
    if (!this.webhookSecret || !signatureHeader) {
      return false;
    }

    try {
      const parts = signatureHeader.split(',').reduce((acc: Record<string, string>, item) => {
        const [k, v] = item.trim().split('=');
        if (k && v) acc[k] = v;
        return acc;
      }, {});

      const timestamp = parts['t'];
      const signature = parts['v1'];

      if (!timestamp || !signature) {
        return false;
      }

      const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
      const payloadToSign = `${timestamp}.${bodyStr}`;
      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payloadToSign, 'utf-8')
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (err: any) {
      logger.warn(`[StripeBillingProvider] Webhook signature verification error: ${err.message}`);
      return false;
    }
  }

  async parseWebhookEvent(rawBody: string | Buffer, signatureHeader: string): Promise<ParsedWebhookEvent> {
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
    let json: any = {};
    try {
      json = JSON.parse(bodyStr);
    } catch {
      throw new Error('Invalid JSON webhook body');
    }

    const providerEventId = json.id || `evt_${Date.now()}`;
    const eventType = json.type || 'unknown';
    const dataObj = json.data?.object || json;

    return {
      providerEventId,
      eventType,
      workspaceId: dataObj.metadata?.workspaceId || json.workspaceId,
      subscriptionId: dataObj.subscription || dataObj.id,
      providerCustomerId: dataObj.customer,
      providerSubscriptionId: dataObj.subscription || dataObj.id,
      providerInvoiceId: dataObj.invoice || dataObj.id,
      plan: (dataObj.metadata?.plan || json.plan || 'PRO') as PlanType,
      amount: dataObj.amount_paid ? dataObj.amount_paid / 100 : dataObj.amount || 0,
      currency: dataObj.currency || 'usd',
      periodStart: dataObj.period_start ? new Date(dataObj.period_start * 1000).toISOString() : new Date().toISOString(),
      periodEnd: dataObj.period_end ? new Date(dataObj.period_end * 1000).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString(),
      payload: json,
    };
  }
}
