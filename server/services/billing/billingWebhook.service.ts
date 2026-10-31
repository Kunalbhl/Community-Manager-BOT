import { webhookEventsRepository } from '../../repositories/index.js';
import { WebhookEventDocument } from '../../../shared/types/models.js';
import { billingService } from './billing.service.js';
import { auditService } from '../audit.service.js';
import { BadRequestError } from '../../utils/errors.js';

export class BillingWebhookService {
  async processWebhook(
    rawBody: string | Buffer,
    signatureHeader: string
  ): Promise<{ status: string; eventId?: string; idempotent?: boolean }> {
    const provider = billingService.getProvider();

    // 1. Signature Verification
    const isValid = await provider.verifyWebhookSignature(rawBody, signatureHeader);
    if (!isValid) {
      await auditService.log({
        communityId: 'SYSTEM',
        actorUserId: 'WEBHOOK_PROVIDER',
        actorRole: 'OWNER',
        action: 'BILLING_WEBHOOK_REJECTED',
        targetType: 'webhook',
        targetId: 'unknown',
        metadata: { reason: 'Signature verification failed' },
      });
      throw new BadRequestError('Invalid webhook signature');
    }

    // 2. Parse Webhook Event
    const event = await provider.parseWebhookEvent(rawBody, signatureHeader);

    // 3. Idempotency & Replay Protection
    const existingEvents = await webhookEventsRepository.list({
      where: [{ field: 'providerEventId', operator: '==', value: event.providerEventId }],
    });
    if (existingEvents.length > 0) {
      const prev = existingEvents[0];
      return { status: prev.status, eventId: prev.id, idempotent: true };
    }

    // Record Event initial state
    const eventRecord: WebhookEventDocument = {
      id: `evt_log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      providerEventId: event.providerEventId,
      provider: provider.name,
      eventType: event.eventType,
      payload: event.payload,
      status: 'PROCESSED',
      createdAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    };

    const workspaceId = event.workspaceId || 'ws_default';

    // 4. Process Business Event
    try {
      if (
        event.eventType === 'checkout.session.completed' ||
        event.eventType === 'customer.subscription.created' ||
        event.eventType === 'customer.subscription.updated'
      ) {
        const sub = await billingService.getWorkspaceSubscription(workspaceId);
        const targetPlan = event.plan || 'PRO';

        await billingService.confirmPlanChange(
          sub.id,
          targetPlan,
          event.providerSubscriptionId,
          event.providerCustomerId
        );

        if (event.amount && event.amount > 0) {
          await billingService.createInvoice(
            workspaceId,
            sub.id,
            event.amount,
            event.currency || 'usd',
            'CONFIRMED',
            event.periodStart || new Date().toISOString(),
            event.periodEnd || new Date().toISOString(),
            event.providerInvoiceId
          );
        }
      } else if (event.eventType === 'invoice.payment_succeeded') {
        const sub = await billingService.getWorkspaceSubscription(workspaceId);
        sub.status = 'ACTIVE';
        sub.updatedAt = new Date().toISOString();

        if (event.amount && event.amount > 0) {
          await billingService.createInvoice(
            workspaceId,
            sub.id,
            event.amount,
            event.currency || 'usd',
            'CONFIRMED',
            event.periodStart || new Date().toISOString(),
            event.periodEnd || new Date().toISOString(),
            event.providerInvoiceId
          );
        }
      } else if (event.eventType === 'invoice.payment_failed') {
        const sub = await billingService.getWorkspaceSubscription(workspaceId);
        await billingService.handlePaymentFailure(workspaceId, sub.id);

        await billingService.createInvoice(
          workspaceId,
          sub.id,
          event.amount || 0,
          event.currency || 'usd',
          'FAILED',
          event.periodStart || new Date().toISOString(),
          event.periodEnd || new Date().toISOString(),
          event.providerInvoiceId
        );
      } else if (
        event.eventType === 'customer.subscription.deleted' ||
        event.eventType === 'subscription.cancelled'
      ) {
        await billingService.cancelSubscription(
          'WEBHOOK_PROVIDER',
          'OWNER',
          workspaceId,
          true // immediate cancellation
        );
      }

      await webhookEventsRepository.create(eventRecord);

      await auditService.log({
        communityId: workspaceId,
        actorUserId: 'WEBHOOK_PROVIDER',
        actorRole: 'OWNER',
        action: 'BILLING_WEBHOOK_RECEIVED',
        targetType: 'webhook_event',
        targetId: eventRecord.id,
        metadata: { providerEventId: event.providerEventId, eventType: event.eventType },
      });

      return { status: 'PROCESSED', eventId: eventRecord.id, idempotent: false };
    } catch (err: any) {
      eventRecord.status = 'FAILED';
      eventRecord.errorMessage = err.message;
      await webhookEventsRepository.create(eventRecord);
      throw err;
    }
  }
}

export const billingWebhookService = new BillingWebhookService();
