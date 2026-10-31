import React, { useState } from 'react';
import { Shield, Key, Lock, AlertCircle, CheckCircle, X } from 'lucide-react';

interface PlatformAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (verifiedKey: string) => void;
}

export const PlatformAuthModal: React.FC<PlatformAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [platformKey, setPlatformKey] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!platformKey.trim()) {
      setError('Platform Owner Secret Key is required');
      return;
    }

    setVerifying(true);
    setError(null);

    try {
      // Challenge server-side endpoint with provided platform key
      const res = await fetch('/api/v1/platform/health', {
        headers: {
          'x-platform-key': platformKey.trim(),
        },
      });

      if (res.status === 401 || res.status === 403) {
        setError('Authorization failed: Invalid Platform Owner key or unrecognized platform claim.');
        setVerifying(false);
        return;
      }

      const json = await res.json();
      if (json.success) {
        onSuccess(platformKey.trim());
      } else {
        setError(json.message || 'Verification rejected by server.');
      }
    } catch (err) {
      setError('Connection error while validating platform claim.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Platform Owner Verification</h3>
              <p className="text-xs text-slate-500">Authorized platform administration gate</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 text-xs text-slate-600 leading-relaxed">
          Platform-level administration operates above all individual Discord servers. Server owners cannot access platform controls. Enter your configured <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-slate-800 font-semibold">PLATFORM_ADMIN_KEY</code> to proceed.
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        <form onSubmit={handleVerify} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
              Platform Admin Secret Key
            </label>
            <div className="relative mt-1">
              <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                placeholder="Enter PLATFORM_ADMIN_KEY..."
                value={platformKey}
                onChange={(e) => setPlatformKey(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm font-mono focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              For initial development, the default key configured in the environment is <span className="font-mono text-slate-600">cr_platform_verified_claim_token</span>.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={verifying}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              <Lock className="h-3.5 w-3.5" />
              {verifying ? 'Authenticating...' : 'Verify Platform Access'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
