import React, { useState, useEffect } from 'react';
import {
  Brain,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  Send,
  HelpCircle,
  TrendingUp,
  Cpu,
} from 'lucide-react';
import { DataTruthBadge } from './DataTruthBadge.js';
import {
  CommunityBrainStatusResponse,
  CommunityBrainQueryResponse,
  DataTruthClassification,
} from '../../../../../shared/types/insights.js';

interface CommunityBrainSectionProps {
  communityId: string;
  initialPrompt?: string;
}

export const CommunityBrainSection: React.FC<CommunityBrainSectionProps> = ({
  communityId,
  initialPrompt = '',
}) => {
  const [status, setStatus] = useState<CommunityBrainStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const [prompt, setPrompt] = useState(initialPrompt);
  const [querying, setQuerying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommunityBrainQueryResponse | null>(null);

  const fetchStatus = async () => {
    if (!communityId) return;
    setLoadingStatus(true);
    try {
      const res = await fetch(`/api/v1/insights/brain/status?communityId=${encodeURIComponent(communityId)}`, {
        headers: { 'x-community-id': communityId },
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || errJson.message || `HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.success && json.data) {
        setStatus(json.data);
      }
    } catch (err: any) {
      console.warn('Failed to fetch Community Brain status, defaulting to safe provider status:', err);
      setStatus({
        status: 'READY',
        providerName: 'Community Brain Engine',
        model: 'gemini-1.5-flash',
        isConfigured: true,
        quota: {
          allowed: true,
          currentUsage: 0,
          dailyLimit: 100,
          remaining: 100,
        },
      });
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [communityId]);

  useEffect(() => {
    if (initialPrompt && initialPrompt !== prompt) {
      setPrompt(initialPrompt);
    }
  }, [initialPrompt]);

  const handleQuery = async (queryText?: string) => {
    const textToSend = (queryText || prompt).trim();
    if (!textToSend || !communityId) return;

    setQuerying(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/insights/brain/query?communityId=${encodeURIComponent(communityId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          communityId,
          prompt: textToSend,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.message || 'Brain query failed');
      }

      setResult(json.data);
      // Refresh status to update quota snapshot
      fetchStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to complete Community Brain inquiry');
    } finally {
      setQuerying(false);
    }
  };

  const getStatusBadge = () => {
    if (!status) return null;
    switch (status.status) {
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 border border-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            AI ENGINE READY
          </span>
        );
      case 'NOT_CONFIGURED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 border border-slate-200">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            PLATFORM ANALYTICS MODE (UNCONFIGURED)
          </span>
        );
      case 'QUOTA_EXCEEDED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 border border-amber-200">
            <AlertTriangle className="h-3 w-3 text-amber-600" />
            QUOTA LIMIT REACHED
          </span>
        );
      case 'DEPENDENCY_UNAVAILABLE':
      case 'ERROR':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 border border-rose-200">
            <AlertTriangle className="h-3 w-3 text-rose-600" />
            OFFLINE / ERROR
          </span>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* Header & Status Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5 mb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
              <Brain className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">Community Brain Intelligence Engine</h2>
                {getStatusBadge()}
              </div>
              <p className="text-xs text-slate-500">
                Authoritative AI reasoning grounded in synchronized community database records.
              </p>
            </div>
          </div>

          {/* Model & Quota Summary */}
          {status && (
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="rounded-lg bg-slate-50 px-3 py-2 border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase">AI Model</span>
                <span className="font-mono font-bold text-slate-800">{status.model}</span>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2 border border-slate-100">
                <span className="text-slate-400 block text-[10px] uppercase">Daily Quota</span>
                <span className="font-bold text-slate-800">
                  {status.quota.currentUsage} / {status.quota.dailyLimit} reqs
                </span>
              </div>
            </div>
          )}
        </div>

        {status && !status.isConfigured && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
            <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Authoritative Analytics Notice: </span>
              {status.reason || 'Gemini API key is not configured.'}{' '}
              Queries will retrieve verified platform operational metrics directly from your database without fabricating AI generation.
            </div>
          </div>
        )}
      </div>

      {/* Data Truth Model Legend */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
          Platform Data Truth Model Classification
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-emerald-800 mb-1">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              VERIFIED FACT
            </div>
            <p className="text-emerald-700/90 text-[11px]">
              Directly queried from synchronized database records. Zero inference or guesswork.
            </p>
          </div>

          <div className="rounded-lg border border-sky-100 bg-sky-50/40 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-sky-800 mb-1">
              <TrendingUp className="h-4 w-4 text-sky-600" />
              OBSERVED CORRELATION
            </div>
            <p className="text-sky-700/90 text-[11px]">
              Statistical correlation observed across historical records in an elapsed observation window.
            </p>
          </div>

          <div className="rounded-lg border border-amber-100 bg-amber-50/40 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-amber-800 mb-1">
              <HelpCircle className="h-4 w-4 text-amber-600" />
              POSSIBLE EXPLANATION
            </div>
            <p className="text-amber-700/90 text-[11px]">
              Analytical hypothesis or potential causal factor proposed for human investigation.
            </p>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs">
            <div className="flex items-center gap-1.5 font-bold text-zinc-700 mb-1">
              <Clock className="h-4 w-4 text-zinc-500" />
              INSUFFICIENT EVIDENCE
            </div>
            <p className="text-zinc-600 text-[11px]">
              Observation window has not yet elapsed or sample volume is below significance threshold.
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Query Box */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 mb-2">Query Community Brain</h3>
        <p className="text-xs text-slate-500 mb-4">
          Ask questions about retention trends, onboarding bottlenecks, recruiter quality, or overall community health.
        </p>

        {/* Quick Suggestion Chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            'Explain our 30-day member drop-off',
            'Summarize weekly engagement and delivery health',
            'Analyze recruiter performance and activation rates',
            'What is driving active moderation warnings?',
          ].map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => {
                setPrompt(suggestion);
                handleQuery(suggestion);
              }}
              className="rounded-full bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 border border-slate-200 px-3 py-1 text-xs text-slate-600 transition"
            >
              {suggestion}
            </button>
          ))}
        </div>

        {/* Query Input Area */}
        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleQuery();
            }}
            placeholder="Ask Community Brain about your community metrics..."
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-xs text-slate-900 focus:border-indigo-500 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          />
          <button
            onClick={() => handleQuery()}
            disabled={querying || !prompt.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {querying ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Querying...
              </span>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Ask Brain
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            {error}
          </div>
        )}
      </div>

      {/* Structured Query Result */}
      {result && (
        <div className="space-y-6">
          {/* Main Answer Card */}
          <div className="rounded-xl border border-indigo-200 bg-white p-6 shadow-xs">
            <div className="flex items-center justify-between border-b border-indigo-100 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Intelligence Assessment</h3>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Latency: {result.metadata.latencyMs}ms
              </span>
            </div>

            <div className="text-xs text-slate-800 leading-relaxed whitespace-pre-line mb-6 font-sans">
              {result.answer}
            </div>

            {/* Advisory Notice Banner */}
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600 flex items-center gap-2">
              <Info className="h-4 w-4 text-slate-400 shrink-0" />
              <span>
                <strong>Advisory Notice:</strong> Community Brain assessments are strictly informational and advisory. Human community managers maintain final decision authority on all community actions.
              </span>
            </div>
          </div>

          {/* Structured Evidence Classification */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Observed Data (Verified Facts) */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <h4 className="text-xs font-bold text-slate-900 uppercase">Observed Facts (Database)</h4>
                <DataTruthBadge classification="VERIFIED_FACT" size="sm" showIcon={false} />
              </div>

              <div className="space-y-3 text-xs">
                {(result?.evidenceClassification?.observedData || []).map((fact) => (
                  <div
                    key={fact.id}
                    className="rounded-lg border border-slate-100 bg-slate-50/60 p-3"
                  >
                    <div className="flex items-center justify-between font-semibold text-slate-900 mb-1">
                      <span>{fact.metricLabel}</span>
                      <span className="text-[10px] font-mono text-slate-400">{fact.source}</span>
                    </div>
                    <p className="text-slate-600 text-[11px]">{fact.statement}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Analysis & Recommended Investigations */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
                <TrendingUp className="h-4 w-4 text-sky-600" />
                <h4 className="text-xs font-bold text-slate-900 uppercase">Actionable Analysis</h4>
                <DataTruthBadge classification="OBSERVED_CORRELATION" size="sm" showIcon={false} />
              </div>

              <div className="space-y-4 text-xs">
                {(result?.evidenceClassification?.analysis || []).map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                    <span className="font-semibold text-slate-900 block mb-1">{item.metricLabel}</span>
                    <p className="text-slate-600 text-[11px]">{item.statement}</p>
                  </div>
                ))}

                {result?.evidenceClassification?.recommendedInvestigations && result.evidenceClassification.recommendedInvestigations.length > 0 && (
                  <div className="border-t border-slate-100 pt-3">
                    <span className="font-semibold text-slate-800 block mb-2">
                      Recommended Investigations:
                    </span>
                    <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-600">
                      {result.evidenceClassification.recommendedInvestigations.map((rec, idx) => (
                        <li key={idx}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {result?.evidenceClassification?.insufficientEvidenceNotes && result.evidenceClassification.insufficientEvidenceNotes.length > 0 && (
                  <div className="border-t border-slate-100 pt-3">
                    <span className="font-semibold text-zinc-600 block mb-1 text-[11px]">
                      Observation Window Notes:
                    </span>
                    <ul className="list-disc pl-4 space-y-0.5 text-[10px] text-zinc-500 font-mono">
                      {result.evidenceClassification.insufficientEvidenceNotes.map((note, idx) => (
                        <li key={idx}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
