import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Building2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldAlert,
  Calendar,
  DollarSign,
  ArrowUpRight,
  XCircle,
  FileText,
  Lock,
  Zap,
} from 'lucide-react';
import {
  SubscriptionDocument,
  InvoiceDocument,
  SubscriptionStatus,
  BillingStatus,
} from '../../../../shared/types/models.js';

interface BillingViewProps {
  workspaceId: string;
  canEdit?: boolean;
}

interface BillingStatusResponse {
  subscription: SubscriptionDocument;
  providerConfigured: boolean;
  providerName: string;
  planDetails: {
    id: string;
    name: string;
    description: string;
    features: string[];
    limits: Record<string, number>;
  };
  workspaceName: string;
  communityCount: number;
}

export const BillingView: React.FC<BillingViewProps> = ({ workspaceId, canEdit = true }) => {
  const [data, setData] = useState<BillingStatusResponse | null>(null);
  const [invoices, setInvoices] = useState<InvoiceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Upgrade Modal State
  const [selectedTargetPlan, setSelectedTargetPlan] = useState<'PRO' | 'BUSINESS' | 'ENTERPRISE' | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const fetchBillingInfo = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/billing/status?workspaceId=${workspaceId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }

      const invRes = await fetch(`/api/v1/billing/invoices?workspaceId=${workspaceId}`);
      const invJson = await invRes.json();
      if (invJson.success && Array.isArray(invJson.data)) {
        setInvoices(invJson.data);
      }
    } catch (err) {
      console.error('Failed fetching billing info', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingInfo();
  }, [workspaceId]);

  const handleRequestCheckout = async (targetPlan: 'PRO' | 'BUSINESS' | 'ENTERPRISE') => {
    try {
      setCheckoutLoading(true);
      setActionMessage(null);
      const res = await fetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, targetPlan }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        const checkout = json.data.checkout;
        if (checkout.status === 'REDIRECT_REQUIRED' && checkout.checkoutUrl) {
          window.location.href = checkout.checkoutUrl;
        } else {
          setActionMessage({
            type: 'error',
            text: checkout.message || 'Billing provider is not configured. Authoritative plan change requires payment confirmation.',
          });
          setSelectedTargetPlan(null);
        }
      } else {
        setActionMessage({ type: 'error', text: json.message || 'Failed initiating checkout request' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Error initiating checkout' });
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleCancelSubscription = async (immediate: boolean) => {
    try {
      setLoading(true);
      setActionMessage(null);
      const res = await fetch('/api/v1/billing/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, immediate }),
      });
      const json = await res.json();
      if (json.success) {
        setActionMessage({
          type: 'success',
          text: immediate
            ? 'Subscription cancelled immediately. Workspace downgraded to FREE plan.'
            : 'Subscription scheduled for cancellation at the end of current period.',
        });
        fetchBillingInfo();
      } else {
        setActionMessage({ type: 'error', text: json.message || 'Failed cancelling subscription' });
      }
    } catch (err) {
      setActionMessage({ type: 'error', text: 'Failed cancelling subscription' });
    } finally {
      setLoading(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-8 text-center text-slate-500 flex items-center justify-center gap-2">
        <RefreshCw className="h-5 w-5 animate-spin text-indigo-600" />
        <span>Loading production subscription details...</span>
      </div>
    );
  }

  if (!data) {
    return <div className="p-8 text-center text-slate-500">Failed to load subscription status</div>;
  }

  const { subscription, providerConfigured, providerName, planDetails, workspaceName, communityCount } = data;

  return (
    <div className="space-y-6">
      {/* Action Banner */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl text-sm font-medium flex items-center gap-2 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Unconfigured Provider Banner */}
      {!providerConfigured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-5 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-amber-900">Billing Not Configured</h4>
            <p className="text-xs text-amber-800 mt-1">
              Production billing provider is not configured for this environment. Features fall back to standard FREE mode entitlements safely. To enable live subscriptions, set up a payment gateway key.
            </p>
          </div>
        </div>
      )}

      {/* Current Subscription Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600">
              <CreditCard className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">{workspaceName} Subscription</h2>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  {communityCount} Bound Server{communityCount === 1 ? '' : 's'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Workspace ID: {workspaceId}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Current Plan</div>
              <div className="text-base font-extrabold text-indigo-600">{subscription.plan}</div>
            </div>

            <span
              className={`rounded-lg px-3 py-1 text-xs font-bold ${
                subscription.status === 'ACTIVE'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                  : subscription.status === 'PAYMENT_FAILED'
                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              {subscription.status}
            </span>
          </div>
        </div>

        {/* Period & Grace Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div className="text-slate-400 font-bold uppercase text-[10px]">Billing Provider</div>
            <div className="text-slate-800 font-semibold mt-1">{providerName}</div>
          </div>

          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div className="text-slate-400 font-bold uppercase text-[10px]">Current Billing Period</div>
            <div className="text-slate-800 font-semibold mt-1 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>
                {new Date(subscription.currentPeriodStart).toLocaleDateString()} —{' '}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <div className="text-slate-400 font-bold uppercase text-[10px]">Cancellation Status</div>
            <div className="text-slate-800 font-semibold mt-1">
              {subscription.cancelAtPeriodEnd ? 'Cancels at Period End' : 'Renews Automatically'}
            </div>
          </div>
        </div>

        {/* Grace Period Alert */}
        {subscription.status === 'PAYMENT_FAILED' && subscription.gracePeriodEndsAt && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>
                Payment failed. Grace period active until{' '}
                <strong>{new Date(subscription.gracePeriodEndsAt).toLocaleDateString()}</strong> before falling back to FREE.
              </span>
            </div>
          </div>
        )}

        {/* Actions: Upgrade / Downgrade / Cancel */}
        {canEdit && (
          <div className="pt-2 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100">
            <div className="flex gap-3">
              {subscription.plan !== 'PRO' && (
                <button
                  onClick={() => setSelectedTargetPlan('PRO')}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 transition"
                >
                  Upgrade to PRO
                </button>
              )}

              {subscription.plan !== 'BUSINESS' && (
                <button
                  onClick={() => setSelectedTargetPlan('BUSINESS')}
                  className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-900 transition"
                >
                  Upgrade to BUSINESS
                </button>
              )}
            </div>

            {subscription.plan !== 'FREE' && (
              <div className="flex gap-2">
                <button
                  onClick={() => handleCancelSubscription(false)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Cancel at Period End
                </button>
                <button
                  onClick={() => handleCancelSubscription(true)}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
                >
                  Cancel Immediately
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Authoritative Billing History / Invoices */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden space-y-0">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-400" />
            <span>Authoritative Billing History</span>
          </h3>
          <span className="text-xs text-slate-400 font-semibold">{invoices.length} Records</span>
        </div>

        {invoices.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 font-medium">
            No billing history available.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {invoices.map((inv) => (
              <div key={inv.id} className="p-4 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-slate-900">{inv.id}</div>
                  <div className="text-slate-500 text-[11px] mt-0.5">
                    Period: {new Date(inv.periodStart).toLocaleDateString()} — {new Date(inv.periodEnd).toLocaleDateString()}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="font-extrabold text-slate-900">
                    ${inv.amount.toFixed(2)} {inv.currency.toUpperCase()}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                      inv.status === 'CONFIRMED'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}
                  >
                    {inv.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upgrade Modal */}
      {selectedTargetPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Zap className="h-5 w-5 text-indigo-600" />
                <span>Upgrade to {selectedTargetPlan} Plan</span>
              </h3>
              <button
                onClick={() => setSelectedTargetPlan(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl border border-slate-100 bg-slate-50 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Current Plan:</span>
                <span className="font-bold text-slate-800">{subscription.plan}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Target Plan:</span>
                <span className="font-bold text-indigo-600">{selectedTargetPlan}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Provider Status:</span>
                <span className="font-semibold text-slate-700">
                  {providerConfigured ? 'Live Provider Connected' : 'Unconfigured'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Upgrading will update commercial entitlements across all communities bound to <strong>{workspaceName}</strong> upon payment confirmation.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setSelectedTargetPlan(null)}
                className="flex-1 rounded-lg border border-slate-200 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRequestCheckout(selectedTargetPlan)}
                disabled={checkoutLoading}
                className="flex-1 rounded-lg bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition flex items-center justify-center gap-1"
              >
                {checkoutLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Proceed to Checkout'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
