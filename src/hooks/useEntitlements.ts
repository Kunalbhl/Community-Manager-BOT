import { useState, useEffect, useCallback } from 'react';

export interface EntitlementItem {
  id: string;
  key: string;
  displayName: string;
  description: string;
  module: string;
  active: boolean;
  status: 'AVAILABLE' | 'FEATURE_NOT_ENABLED' | 'BILLING_REQUIRED' | 'LIMIT_REACHED';
  requiredPlan?: string;
}

export interface UsageMetricSnapshot {
  current: number;
  limit: number;
}

export interface EntitlementsState {
  plan: 'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE';
  subscriptionStatus: string;
  billingStatus: string;
  entitlements: EntitlementItem[];
  usage: Record<string, UsageMetricSnapshot>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updatePlan: (newPlan: string) => Promise<boolean>;
  resetUsage: (metricKey?: string) => Promise<boolean>;
  hasFeature: (featureKey: string) => boolean;
}

export function useEntitlements(communityId: string): EntitlementsState {
  const [plan, setPlan] = useState<'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE'>('FREE');
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('NOT_CONFIGURED');
  const [billingStatus, setBillingStatus] = useState<string>('NOT_CONFIGURED');
  const [entitlements, setEntitlements] = useState<EntitlementItem[]>([]);
  const [usage, setUsage] = useState<Record<string, UsageMetricSnapshot>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntitlements = useCallback(async () => {
    if (!communityId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/entitlements/status', {
        headers: {
          'x-community-id': communityId,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setPlan(json.plan || 'FREE');
          setSubscriptionStatus(json.subscriptionStatus || 'NOT_CONFIGURED');
          setBillingStatus(json.billingStatus || 'NOT_CONFIGURED');
          setEntitlements(json.entitlements || []);
          setUsage(json.usage || {});
        } else {
          setError(json.message || 'Failed to load entitlement status');
        }
      } else {
        setError(`Failed to fetch entitlements (${res.status})`);
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching entitlements');
    } finally {
      setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    fetchEntitlements();
  }, [fetchEntitlements]);

  const updatePlan = async (newPlan: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/v1/plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({ plan: newPlan }),
      });
      if (res.ok) {
        await fetchEntitlements();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const resetUsage = async (metricKey?: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/v1/usage/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({ metricKey }),
      });
      if (res.ok) {
        await fetchEntitlements();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const hasFeature = (featureKey: string): boolean => {
    const found = entitlements.find((e) => e.key === featureKey);
    return found ? found.active : false;
  };

  return {
    plan,
    subscriptionStatus,
    billingStatus,
    entitlements,
    usage,
    loading,
    error,
    refetch: fetchEntitlements,
    updatePlan,
    resetUsage,
    hasFeature,
  };
}
