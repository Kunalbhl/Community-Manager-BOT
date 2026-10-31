import React, { useState } from 'react';
import { Settings, Save, CheckCircle, Sliders, Shield } from 'lucide-react';
import { UserRole } from '../../../../shared/types/rbac.js';

interface CommunityConfigViewProps {
  communityId: string;
  currentRole: UserRole;
}

export const CommunityConfigView: React.FC<CommunityConfigViewProps> = ({
  communityId,
  currentRole,
}) => {
  const [mission, setMission] = useState('Build an organized and welcoming community.');
  const [rules, setRules] = useState('1. Follow Discord Terms of Service\n2. Respect all members\n3. No unsolicited advertising');
  const [requirements, setRequirements] = useState('Age 16+, English speaking, Active Discord account');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div id="community-config-view" className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              COMMUNITY SCOPE
            </span>
            <span className="rounded bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              MODULE 7 OF 14
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Community Rules & Guidelines Configuration
          </h1>
          <p className="text-sm text-slate-500">
            Configure server mission, candidate requirements, and guidelines presented to applicants.
          </p>
        </div>

        <button
          onClick={handleSave}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
        >
          <Save className="h-4 w-4" />
          Save Configuration
        </button>
      </div>

      {saved && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
          <CheckCircle className="h-4 w-4" />
          Community configuration saved successfully.
        </div>
      )}

      <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
            Community Mission Statement
          </label>
          <textarea
            rows={2}
            value={mission}
            onChange={(e) => setMission(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
            Server Rules (Applicant Acknowledgment)
          </label>
          <textarea
            rows={4}
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
            Minimum Candidate Requirements
          </label>
          <textarea
            rows={3}
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
};
