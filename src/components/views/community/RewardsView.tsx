import React, { useState } from 'react';
import { Gift, Award, Plus, RefreshCw } from 'lucide-react';
import { UserRole } from '../../../../shared/types/rbac.js';

interface RewardsViewProps {
  communityId: string;
  currentRole: UserRole;
}

export const RewardsView: React.FC<RewardsViewProps> = ({ communityId, currentRole }) => {
  return (
    <div id="rewards-view" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              COMMUNITY SCOPE
            </span>
            <span className="rounded bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              MODULE 9 OF 14
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Recruiter Rewards & Incentive Tiers
          </h1>
          <p className="text-sm text-slate-500">
            Configure reward thresholds, milestones, and honor rolls for top community recruiters.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
        <Gift className="mx-auto h-12 w-12 text-slate-300" />
        <h3 className="mt-3 text-base font-semibold text-slate-900">
          No rewards configured yet
        </h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Set up milestone tiers (e.g., 5 successful referrals = Custom Recruiter Discord Role) to motivate community recruitment.
        </p>
      </div>
    </div>
  );
};
