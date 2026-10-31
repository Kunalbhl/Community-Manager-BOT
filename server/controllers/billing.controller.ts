import { Request, Response, NextFunction } from 'express';
import { billingService } from '../services/billing/billing.service.js';
import { billingWebhookService } from '../services/billing/billingWebhook.service.js';
import { workspaceService } from '../services/workspace.service.js';
import { EntitlementService, PlanType } from '../services/entitlement.service.js';
import { ForbiddenError, BadRequestError } from '../utils/errors.js';
import { isPlatformOwner } from '../security/rbac.js';

export async function getBillingStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const workspaceId = (req.query.workspaceId || req.params.workspaceId) as string;
    if (!workspaceId) throw new BadRequestError('workspaceId query or param is required');

    // Workspace membership access check
    const wsDetails = await workspaceService.getWorkspace(user.userId, user.role, workspaceId);
    if (!wsDetails) throw new ForbiddenError('Access to workspace denied');

    const subscription = await billingService.getWorkspaceSubscription(workspaceId);
    const provider = billingService.getProvider();

    // Get current plan details and usage from EntitlementService
    const planDetails = await EntitlementService.getPlanDefinition(subscription.plan);

    res.json({
      success: true,
      data: {
        subscription,
        providerConfigured: provider.isConfigured(),
        providerName: provider.name,
        planDetails,
        workspaceName: wsDetails.workspace.name,
        communityCount: wsDetails.workspace.communityIds.length,
      },
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function getInvoices(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const workspaceId = (req.query.workspaceId || req.params.workspaceId) as string;
    if (!workspaceId) throw new BadRequestError('workspaceId is required');

    const wsDetails = await workspaceService.getWorkspace(user.userId, user.role, workspaceId);
    if (!wsDetails) throw new ForbiddenError('Access to workspace denied');

    const invoices = await billingService.getWorkspaceInvoices(workspaceId);

    res.json({
      success: true,
      data: invoices,
      count: invoices.length,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function requestCheckout(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { workspaceId, targetPlan } = req.body;
    if (!workspaceId || !targetPlan) {
      throw new BadRequestError('workspaceId and targetPlan are required');
    }

    const wsDetails = await workspaceService.getWorkspace(user.userId, user.role, workspaceId);
    if (
      wsDetails.memberRole !== 'WORKSPACE_OWNER' &&
      wsDetails.memberRole !== 'WORKSPACE_ADMIN' &&
      !isPlatformOwner(user)
    ) {
      throw new ForbiddenError('Only workspace owners or admins can modify billing plans');
    }

    const result = await billingService.requestPlanChange(
      user.userId,
      user.role,
      workspaceId,
      targetPlan as PlanType
    );

    res.json({
      success: true,
      data: result,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function cancelSubscription(req: Request, res: Response, next: NextFunction) {
  try {
    const user = req.user;
    if (!user) throw new ForbiddenError('Authentication required');

    const { workspaceId, immediate } = req.body;
    if (!workspaceId) throw new BadRequestError('workspaceId is required');

    const wsDetails = await workspaceService.getWorkspace(user.userId, user.role, workspaceId);
    if (
      wsDetails.memberRole !== 'WORKSPACE_OWNER' &&
      wsDetails.memberRole !== 'WORKSPACE_ADMIN' &&
      !isPlatformOwner(user)
    ) {
      throw new ForbiddenError('Only workspace owners or admins can cancel subscription');
    }

    const result = await billingService.cancelSubscription(
      user.userId,
      user.role,
      workspaceId,
      Boolean(immediate)
    );

    res.json({
      success: true,
      data: result,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}

export async function handleWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const rawBody = req.body;
    const signatureHeader =
      (req.headers['stripe-signature'] as string) ||
      (req.headers['x-signature'] as string) ||
      (req.headers['authorization'] as string) ||
      '';

    const result = await billingWebhookService.processWebhook(rawBody, signatureHeader);

    res.json({
      success: true,
      data: result,
      requestId: req.id,
    });
  } catch (error) {
    next(error);
  }
}
