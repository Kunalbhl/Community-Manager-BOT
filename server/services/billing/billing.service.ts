import {
  subscriptionsRepository,
  invoicesRepository,
  workspacesRepository,
  communitiesRepository,
} from '../../repositories/index.js';
import {
  SubscriptionDocument,
  InvoiceDocument,
  SubscriptionStatus,
  BillingStatus,
  PendingPlanChange,
} from '../../../shared/types/models.js';
import { PlanType, EntitlementService } from '../entitlement.service.js';
import { BillingProviderFactory } from './billingProviderFactory.js';
import { IBillingProvider, CheckoutSessionResult } from './billingProvider.interface.js';
import { auditService } from '../audit.service.js';
import { UserRole } from '../../../shared/types/rbac.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { isPlatformOwner } from '../../security/rbac.js';

export class BillingService {
  private provider: IBillingProvider;

  constructor() {
    this.provider = BillingProviderFactory.getProvider();
  }

  getProvider(): IBillingProvider {
    return this.provider;
  }

  /**
   * Helper to sync workspace's commercial entitlement to all bound communities.
   */
  async syncWorkspaceEntitlements(workspaceId: string, plan: PlanType): Promise<void> {
    const workspace = await workspacesRepository.getById(workspaceId);
    if (!workspace) return;

    for (const commId of workspace.communityIds || []) {
      try {
        await EntitlementService.setPlan(commId, plan);
      } catch (err) {
        console.error(`Failed to sync entitlement plan ${plan} for community ${commId}`, err);
      }
    }
  }

  /**
   * Retrieves or initializes a workspace subscription.
   * Default plan is FREE. Default status is NOT_CONFIGURED (if provider unconfigured) or ACTIVE.
   */
  async getWorkspaceSubscription(workspaceId: string): Promise<SubscriptionDocument> {
    const existingList = await subscriptionsRepository.list({
      where: [{ field: 'workspaceId', operator: '==', value: workspaceId }],
    });
    if (existingList.length > 0) {
      const sub = existingList[0];
      // Check grace period expiry
      if (
        sub.status === 'PAYMENT_FAILED' &&
        sub.gracePeriodEndsAt &&
        new Date(sub.gracePeriodEndsAt).getTime() < Date.now()
      ) {
        sub.status = 'EXPIRED';
        sub.updatedAt = new Date().toISOString();
        await subscriptionsRepository.update(sub.id, sub);
        await this.syncWorkspaceEntitlements(workspaceId, 'FREE');
      }
      return sub;
    }

    // Initialize default subscription
    const now = new Date();
    const oneYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    const subId = `sub_${workspaceId}`;
    const initialStatus: SubscriptionStatus = this.provider.isConfigured() ? 'ACTIVE' : 'NOT_CONFIGURED';

    const newSub: SubscriptionDocument = {
      id: subId,
      workspaceId,
      plan: 'FREE',
      status: initialStatus,
      billingProvider: this.provider.name,
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: oneYear.toISOString(),
      cancelAtPeriodEnd: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const created = await subscriptionsRepository.create(newSub);
    await this.syncWorkspaceEntitlements(workspaceId, 'FREE');

    return created;
  }

  /**
   * Initiates an upgrade/downgrade plan change request.
   * Status transitions: REQUESTED -> PROVIDER_PENDING
   */
  async requestPlanChange(
    userId: string,
    userRole: UserRole,
    workspaceId: string,
    targetPlan: PlanType
  ): Promise<{ subscription: SubscriptionDocument; checkout: CheckoutSessionResult }> {
    const sub = await this.getWorkspaceSubscription(workspaceId);

    const pendingChange: PendingPlanChange = {
      targetPlan,
      status: 'REQUESTED',
      requestedAt: new Date().toISOString(),
    };

    sub.pendingPlanChange = pendingChange;
    sub.updatedAt = new Date().toISOString();
    await subscriptionsRepository.update(sub.id, sub);

    await auditService.log({
      communityId: workspaceId,
      actorUserId: userId,
      actorRole: userRole,
      action: 'PLAN_CHANGE_REQUESTED',
      targetType: 'subscription',
      targetId: sub.id,
      metadata: { currentPlan: sub.plan, targetPlan },
    });

    const checkoutResult = await this.provider.createCheckoutSession({
      workspaceId,
      targetPlan,
    });

    if (checkoutResult.status === 'REDIRECT_REQUIRED') {
      sub.pendingPlanChange.status = 'PROVIDER_PENDING';
      await subscriptionsRepository.update(sub.id, sub);
    }

    return { subscription: sub, checkout: checkoutResult };
  }

  /**
   * Authoritatively confirms plan change upon provider webhook or confirmation.
   * Flow: PROVIDER_PENDING -> CONFIRMED -> APPLIED
   */
  async confirmPlanChange(
    subscriptionId: string,
    targetPlan: PlanType,
    providerSubId?: string,
    providerCustomerId?: string
  ): Promise<SubscriptionDocument> {
    const sub = await subscriptionsRepository.getById(subscriptionId);
    if (!sub) {
      throw new NotFoundError(`Subscription ${subscriptionId} not found`);
    }

    const previousPlan = sub.plan;
    sub.plan = targetPlan;
    sub.status = 'ACTIVE';
    if (providerSubId) sub.providerSubscriptionId = providerSubId;
    if (providerCustomerId) sub.providerCustomerId = providerCustomerId;

    sub.pendingPlanChange = {
      targetPlan,
      status: 'CONFIRMED',
      requestedAt: sub.pendingPlanChange?.requestedAt || new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
      appliedAt: new Date().toISOString(),
    };

    sub.updatedAt = new Date().toISOString();
    await subscriptionsRepository.update(sub.id, sub);

    // Synchronize workspace entitlements across all bound communities
    await this.syncWorkspaceEntitlements(sub.workspaceId, targetPlan);

    await auditService.log({
      communityId: sub.workspaceId,
      actorUserId: 'SYSTEM_BILLING',
      actorRole: 'OWNER',
      action: 'PLAN_CHANGE_CONFIRMED',
      targetType: 'subscription',
      targetId: sub.id,
      metadata: { previousPlan, newPlan: targetPlan },
    });

    return sub;
  }

  /**
   * Cancels subscription (either immediately or at period end).
   */
  async cancelSubscription(
    userId: string,
    userRole: UserRole,
    workspaceId: string,
    immediate: boolean
  ): Promise<SubscriptionDocument> {
    const sub = await this.getWorkspaceSubscription(workspaceId);

    if (immediate) {
      sub.status = 'CANCELLED';
      sub.plan = 'FREE';
      sub.cancelAtPeriodEnd = false;
      await this.syncWorkspaceEntitlements(workspaceId, 'FREE');
    } else {
      sub.cancelAtPeriodEnd = true;
    }

    sub.updatedAt = new Date().toISOString();
    await subscriptionsRepository.update(sub.id, sub);

    await auditService.log({
      communityId: workspaceId,
      actorUserId: userId,
      actorRole: userRole,
      action: 'SUBSCRIPTION_CANCELLED',
      targetType: 'subscription',
      targetId: sub.id,
      metadata: { immediate, cancelAtPeriodEnd: sub.cancelAtPeriodEnd },
    });

    return sub;
  }

  /**
   * Handles payment failure and sets grace period (e.g., 7 days).
   */
  async handlePaymentFailure(workspaceId: string, subscriptionId: string): Promise<SubscriptionDocument> {
    const sub = await subscriptionsRepository.getById(subscriptionId);
    if (!sub) {
      throw new NotFoundError(`Subscription ${subscriptionId} not found`);
    }

    const gracePeriodDays = 7;
    const graceEndsAt = new Date(Date.now() + gracePeriodDays * 24 * 60 * 60 * 1000).toISOString();

    sub.status = 'PAYMENT_FAILED';
    sub.gracePeriodEndsAt = graceEndsAt;
    sub.updatedAt = new Date().toISOString();

    await subscriptionsRepository.update(sub.id, sub);

    await auditService.log({
      communityId: workspaceId,
      actorUserId: 'SYSTEM_BILLING',
      actorRole: 'OWNER',
      action: 'INVOICE_PAYMENT_FAILED',
      targetType: 'subscription',
      targetId: sub.id,
      metadata: { gracePeriodEndsAt: graceEndsAt },
    });

    await auditService.log({
      communityId: workspaceId,
      actorUserId: 'SYSTEM_BILLING',
      actorRole: 'OWNER',
      action: 'SUBSCRIPTION_PAST_DUE',
      targetType: 'subscription',
      targetId: sub.id,
      metadata: { gracePeriodEndsAt: graceEndsAt },
    });

    return sub;
  }

  /**
   * Retrieves authoritative billing history / invoices.
   */
  async getWorkspaceInvoices(workspaceId: string): Promise<InvoiceDocument[]> {
    return invoicesRepository.list({
      where: [{ field: 'workspaceId', operator: '==', value: workspaceId }],
    });
  }

  /**
   * Creates an authoritative invoice record.
   */
  async createInvoice(
    workspaceId: string,
    subscriptionId: string,
    amount: number,
    currency: string,
    status: BillingStatus,
    periodStart: string,
    periodEnd: string,
    providerInvoiceId?: string
  ): Promise<InvoiceDocument> {
    const invoiceId = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const invoice: InvoiceDocument = {
      id: invoiceId,
      workspaceId,
      subscriptionId,
      providerInvoiceId,
      amount,
      currency,
      status,
      periodStart,
      periodEnd,
      createdAt: new Date().toISOString(),
    };

    const created = await invoicesRepository.create(invoice);

    await auditService.log({
      communityId: workspaceId,
      actorUserId: 'SYSTEM_BILLING',
      actorRole: 'OWNER',
      action: 'INVOICE_CREATED',
      targetType: 'invoice',
      targetId: created.id,
      metadata: { amount, currency, status },
    });

    return created;
  }
}

export const billingService = new BillingService();
