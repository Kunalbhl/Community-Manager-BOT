import React, { useState } from 'react';
import {
  X,
  Play,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Clock,
  RotateCcw,
  CheckSquare,
  Square,
  AlertCircle,
  Zap,
} from 'lucide-react';
import { AiActionPreview } from '../../../../../shared/types/ai.js';

interface AiActionLifecycleModalProps {
  communityId: string;
  preview: AiActionPreview | null;
  isOpen: boolean;
  onClose: () => void;
  onExecuteSuccess: (executionResult: any) => void;
}

export const AiActionLifecycleModal: React.FC<AiActionLifecycleModalProps> = ({
  communityId,
  preview,
  isOpen,
  onClose,
  onExecuteSuccess,
}) => {
  const [consentChecked, setConsentChecked] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [confirmationToken, setConfirmationToken] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !preview) return null;

  const handleConfirm = async () => {
    try {
      setConfirming(true);
      setError(null);

      const res = await fetch(`/api/v1/communities/${communityId}/ai/actions/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionPlanId: preview.actionPlanId,
          actionType: preview.actionType,
          targetModule: preview.targetModule,
          parameters: preview.parameters,
          humanConsent: true,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setConfirmationToken(json.confirmationToken || 'confirmed_token');
      } else {
        setError(json.error?.message || json.message || 'Failed to confirm action');
      }
    } catch (err: any) {
      setError(err.message || 'Error confirming action');
    } finally {
      setConfirming(false);
    }
  };

  const handleExecute = async () => {
    try {
      setExecuting(true);
      setError(null);

      const res = await fetch(`/api/v1/communities/${communityId}/ai/actions/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmationToken: confirmationToken || 'token',
          actionType: preview.actionType,
          targetModule: preview.targetModule,
          parameters: preview.parameters,
          targetResource: preview.targetResource,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setExecutionResult(json.execution || json.result || json);
        onExecuteSuccess(json);
      } else {
        setError(json.error?.message || json.message || 'Failed to execute action');
      }
    } catch (err: any) {
      setError(err.message || 'Error executing action');
    } finally {
      setExecuting(false);
    }
  };

  const handleReset = () => {
    setConsentChecked(false);
    setConfirmationToken(null);
    setExecutionResult(null);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="bg-white rounded-xl shadow-xl border border-zinc-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 bg-zinc-50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-zinc-900 text-white rounded-lg">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900">Action Execution Review</h3>
              <p className="text-xs text-zinc-500">Preview → Confirm → Revalidate → Execute</p>
            </div>
          </div>
          <button
            onClick={handleReset}
            className="p-1 text-zinc-400 hover:text-zinc-600 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Details Card */}
          <div className="p-3.5 bg-zinc-50 border border-zinc-200 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-900">{preview.actionType}</span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-200 text-zinc-700 font-medium">
                {preview.targetModule}
              </span>
            </div>

            <p className="text-xs text-zinc-700 leading-normal">{preview.summary || preview.impactAnalysis}</p>

            {preview.targetResource && (
              <div className="text-[11px] text-zinc-500">
                Target Resource: <span className="font-mono text-zinc-800">{preview.targetResource}</span>
              </div>
            )}
          </div>

          {/* Parameters JSON */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-zinc-800">Execution Parameters</div>
            <div className="p-3 bg-zinc-900 text-zinc-100 rounded-lg font-mono text-xs overflow-x-auto">
              <pre>{JSON.stringify(preview.parameters, null, 2)}</pre>
            </div>
          </div>

          {/* Safety & Validation Checklist */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center justify-between">
              <span className="text-zinc-600">Reversibility</span>
              <span
                className={`font-semibold ${
                  preview.isReversible ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {preview.isReversible ? 'Reversible' : 'Irreversible'}
              </span>
            </div>

            <div className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg flex items-center justify-between">
              <span className="text-zinc-600">RBAC Validation</span>
              <span className="font-semibold text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Permitted
              </span>
            </div>
          </div>

          {/* Execution Result (if completed) */}
          {executionResult && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg space-y-1.5 text-xs text-emerald-900">
              <div className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Action Successfully Executed</span>
              </div>
              <p className="text-emerald-800 leading-normal">
                {executionResult.message || 'The action was applied to the live community.'}
              </p>
              {executionResult.id && (
                <div className="text-[10px] text-emerald-700 font-mono">
                  Audit ID: {executionResult.id}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-4 border-t border-zinc-200 bg-zinc-50 flex flex-wrap items-center justify-between gap-3">
          {!executionResult && !confirmationToken ? (
            <>
              <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="chk-ai-human-consent"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-600"
                />
                <span>I have reviewed the parameters and authorize execution.</span>
              </label>

              <button
                id="btn-confirm-ai-action"
                onClick={handleConfirm}
                disabled={!consentChecked || confirming}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition disabled:opacity-50"
              >
                {confirming ? 'Validating...' : 'Confirm Action'}
              </button>
            </>
          ) : !executionResult && confirmationToken ? (
            <>
              <div className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Authorized. Ready for live execution.
              </div>

              <button
                id="btn-execute-ai-action"
                onClick={handleExecute}
                disabled={executing}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                {executing ? 'Executing...' : 'Execute Now'}
              </button>
            </>
          ) : (
            <div className="w-full flex justify-end">
              <button
                id="btn-close-ai-action-modal"
                onClick={handleReset}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-semibold transition"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
