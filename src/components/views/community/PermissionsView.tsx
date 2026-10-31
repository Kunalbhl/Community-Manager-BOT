import React from 'react';
import { Shield, Lock, Check, X as Cross, UserCheck } from 'lucide-react';
import { UserRole } from '../../../../shared/types/rbac.js';

interface PermissionsViewProps {
  communityId: string;
  currentRole: UserRole;
}

const ROLES = [
  {
    role: 'OWNER',
    name: 'Community Owner',
    desc: 'Full administrative authority over this server community.',
    admin: true,
  },
  {
    role: 'ADMIN',
    name: 'Administrator',
    desc: 'Server administrator with configuration privileges.',
    admin: true,
  },
  {
    role: 'RECRUITER_MANAGER',
    name: 'Recruiter Manager (Controller)',
    desc: 'Lead recruiter managing recruiter codes, applications, and rewards.',
    admin: false,
  },
  {
    role: 'RECRUITER',
    name: 'Recruiter',
    desc: 'Community recruiter with personal codes and referral dashboard.',
    admin: false,
  },
  {
    role: 'INTERVIEWER',
    name: 'Interviewer',
    desc: 'Conducts voice interviews and submits evaluations.',
    admin: false,
  },
  {
    role: 'MEMBER',
    name: 'Community Member',
    desc: 'Standard verified member in the community Discord server.',
    admin: false,
  },
  {
    role: 'APPLICANT',
    name: 'Applicant',
    desc: 'Prospective member with least-privilege personal portal access.',
    admin: false,
  },
];

export const PermissionsView: React.FC<PermissionsViewProps> = ({
  communityId,
  currentRole,
}) => {
  return (
    <div id="permissions-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              COMMUNITY SCOPE
            </span>
            <span className="rounded bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              MODULE 13 OF 14
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Roles & Permission Matrix
          </h1>
          <p className="text-sm text-slate-500">
            Role-based access control (RBAC) hierarchy and permissions within this server.
          </p>
        </div>
      </div>

      {/* Controller Pattern Explanation */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-indigo-700 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-bold text-indigo-950">
              Controller Role: Non-Admin Operational Access
            </div>
            <p className="mt-1 text-xs text-indigo-900 leading-relaxed">
              In Community Manager, trusted members (such as Recruiter Managers and Head Interviewers) can operate recruitment pipelines without granting them destructive Discord Administrator roles. Note: A Community Owner or Controller can never access Platform Admin controls.
            </p>
          </div>
        </div>
      </div>

      {/* Roles List */}
      <div className="space-y-3">
        {ROLES.map((r) => (
          <div
            key={r.role}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900">{r.name}</span>
                <span className="font-mono text-xs text-slate-400">({r.role})</span>
                {r.admin && (
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    SERVER ADMIN
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">{r.desc}</p>
            </div>
            <div className="text-xs font-semibold text-indigo-600">
              {r.role === currentRole ? 'Your Current Simulated Role' : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
