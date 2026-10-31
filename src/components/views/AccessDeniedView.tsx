import React from 'react';
import { ShieldAlert, ArrowLeft, LogIn, ExternalLink } from 'lucide-react';
import { UserRole } from '../../../shared/types/rbac.js';

interface AccessDeniedViewProps {
  currentRole: UserRole;
  requiredPermission?: string;
  isAuthenticated?: boolean;
  onLoginWithDiscord?: () => void;
  onGoHome: () => void;
  onGoToApplicantPortal?: () => void;
}

export const AccessDeniedView: React.FC<AccessDeniedViewProps> = ({
  currentRole,
  requiredPermission,
  isAuthenticated,
  onLoginWithDiscord,
  onGoHome,
  onGoToApplicantPortal,
}) => {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 shadow-inner">
        <ShieldAlert className="h-7 w-7" />
      </div>

      <h2 className="mt-5 text-xl font-bold text-slate-900">
        {!isAuthenticated ? 'Discord Authentication Required' : 'Community Management Authorization Required'}
      </h2>
      <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
        {!isAuthenticated
          ? 'Connect your Discord account to authenticate your guild membership, administrator rights, or recruiter assignments.'
          : `Your active role (${currentRole}) does not have permission to manage this community section.`}
      </p>

      {requiredPermission && (
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-mono text-slate-700 border border-slate-200">
          <span className="font-semibold text-slate-500">Required:</span> {requiredPermission}
        </div>
      )}

      <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
        {onLoginWithDiscord && !isAuthenticated && (
          <button
            onClick={onLoginWithDiscord}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-indigo-700 transition"
            id="btn-access-denied-login"
          >
            <LogIn className="h-4 w-4" />
            <span>Connect Discord Account</span>
          </button>
        )}

        {onGoToApplicantPortal && currentRole === 'APPLICANT' && (
          <button
            onClick={onGoToApplicantPortal}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-2.5 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 transition"
            id="btn-access-denied-applicant-portal"
          >
            <ExternalLink className="h-4 w-4" />
            <span>Go to Applicant Portal</span>
          </button>
        )}

        <button
          onClick={onGoHome}
          className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-slate-100 border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition"
          id="btn-access-denied-home"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Return Home</span>
        </button>
      </div>
    </div>
  );
};

