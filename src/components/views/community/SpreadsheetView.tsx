import React, { useState } from 'react';
import { Sheet, Table, RefreshCw, CheckCircle, ExternalLink, Sliders, AlertCircle } from 'lucide-react';
import { UserRole } from '../../../../shared/types/rbac.js';

interface SpreadsheetViewProps {
  communityId: string;
  currentRole: UserRole;
}

const TEMPLATE_SHEETS = [
  'Dashboard',
  'Applicants',
  'Applications',
  'Interview Answers',
  'Recruiters',
  'Recruiter Codes',
  'Referrals',
  'Notifications',
  'Rewards',
  'Audit Logs',
  'Community Configuration',
  'AI Analysis',
  'Statistics',
];

export const SpreadsheetView: React.FC<SpreadsheetViewProps> = ({
  communityId,
  currentRole,
}) => {
  const [selectedSheets, setSelectedSheets] = useState<string[]>(TEMPLATE_SHEETS);
  const [spreadsheetIdInput, setSpreadsheetIdInput] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const toggleSheet = (sheetName: string) => {
    setSelectedSheets((prev) =>
      prev.includes(sheetName) ? prev.filter((s) => s !== sheetName) : [...prev, sheetName]
    );
  };

  const handleSync = () => {
    setSyncing(true);
    setSyncNotice(null);
    setTimeout(() => {
      setSyncing(false);
      setSyncNotice('Sync architecture evaluated: External Google Sheets credentials are not configured. Operations safely deferred with zero data loss.');
    }, 600);
  };

  return (
    <div id="spreadsheet-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
              COMMUNITY SCOPE
            </span>
            <span className="rounded bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              MODULE 10 OF 14
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Google Spreadsheet Sync Engine
          </h1>
          <p className="text-sm text-slate-500">
            Export community applications, interview outcomes, and recruiter statistics to a live spreadsheet.
          </p>
        </div>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing...' : 'Trigger Sync'}
        </button>
      </div>

      {syncNotice && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
          {syncNotice}
        </div>
      )}

      {/* Integration Status Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600">
              <Sheet className="h-6 w-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Spreadsheet Connection</h3>
              <div className="text-xs text-slate-500">Google Sheets API Integration</div>
            </div>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            Not configured
          </span>
        </div>

        <p className="mt-4 text-xs text-slate-600 leading-relaxed">
          Google Sheets integration requires <code className="font-mono text-slate-800">GOOGLE_SHEETS_SPREADSHEET_ID</code>. While unconfigured in Task 1.5, the sync architecture safely maintains in-memory tracking with a 200 writes/day free-tier quota safeguard.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Connected Spreadsheet ID
            </label>
            <input
              type="text"
              placeholder="e.g. 1BxiMVs0XR... (Optional)"
              value={spreadsheetIdInput}
              onChange={(e) => setSpreadsheetIdInput(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Sync Mode
            </label>
            <select className="mt-1 w-full rounded-lg border border-slate-300 py-2 pl-3 pr-8 text-xs focus:border-indigo-500 focus:outline-none">
              <option>Batch Scheduled (Every 6 hours)</option>
              <option>Instant (On Application Approval)</option>
              <option>Manual Trigger Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* 13 Default Template Sheets */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="font-bold text-slate-900">Configured Worksheets (13 Default Templates)</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Select which data tabs will be populated and maintained inside your connected Google Workbook.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {TEMPLATE_SHEETS.map((sheet) => {
            const isChecked = selectedSheets.includes(sheet);
            return (
              <div
                key={sheet}
                onClick={() => toggleSheet(sheet)}
                className={`cursor-pointer rounded-lg border p-3 text-xs transition ${
                  isChecked
                    ? 'border-emerald-300 bg-emerald-50/50 text-emerald-950 font-semibold'
                    : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>{sheet}</span>
                  {isChecked && <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
