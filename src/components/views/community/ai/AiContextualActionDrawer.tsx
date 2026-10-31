import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  X,
  Database,
  Lightbulb,
  Zap,
  TrendingUp,
  TrendingDown,
  ExternalLink,
  Play,
  Lock,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  Layers,
  ArrowRight,
} from 'lucide-react';
import {
  AiContextualActionRequest,
  AiContextualActionResponse,
  AiEvidenceType,
  AiRecommendation,
} from '../../../../../shared/types/ai.js';
import { AiExportButton } from './AiExportButton.js';


interface AiContextualActionDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  communityId: string;
  request: AiContextualActionRequest | null;
  onOpenInAssistant: (request: AiContextualActionRequest) => void;
  onPreviewAction?: (
    actionType: string,
    targetModule: string,
    parameters: Record<string, any>,
    targetResource?: string
  ) => void;
}

export const AiContextualActionDrawer: React.FC<AiContextualActionDrawerProps> = ({
  isOpen,
  onClose,
  communityId,
  request,
  onOpenInAssistant,
  onPreviewAction,
}) => {
  const [data, setData] = useState<AiContextualActionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && request && communityId) {
      fetchAnalysis();
    } else {
      setData(null);
      setError(null);
    }
  }, [isOpen, request, communityId]);

  const fetchAnalysis = async () => {
    if (!request || !communityId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/communities/${communityId}/ai/contextual-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error?.message || json.message || 'Failed to synthesize contextual analysis');
      }

      setData(json);
    } catch (err: any) {
      setError(err.message || 'Network error executing contextual analysis');
    } finally {
      setLoading(false);
    }
  };

  const renderEvidenceTypeBadge = (type?: AiEvidenceType) => {
    switch (type) {
      case 'VERIFIED_FACT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-2.5 h-2.5" /> Verified Fact
          </span>
        );
      case 'OBSERVED_CORRELATION':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <TrendingUp className="w-2.5 h-2.5" /> Observed Correlation
          </span>
        );
      case 'POSSIBLE_EXPLANATION':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <HelpCircle className="w-2.5 h-2.5" /> Possible Explanation
          </span>
        );
      case 'INSUFFICIENT_EVIDENCE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-2.5 h-2.5" /> Insufficient Evidence
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-zinc-100 text-zinc-700 border border-zinc-200">
            Authoritative Signal
          </span>
        );
    }
  };

  if (!isOpen || !request) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 border-l border-slate-200">
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 uppercase tracking-wider">
                {request.action ? request.action.replace(/_/g, ' ') : 'ACTION'}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Authoritative Task 20 Engine
              </span>
            </div>
            <h2 className="mt-1.5 text-lg font-black text-slate-900 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              {request.metricLabel || request.metricKey || 'Community Scope Analysis'}
            </h2>
            <p className="text-xs text-slate-500">
              Grounded synthesis across verified tenant telemetry for{' '}
              <span className="font-semibold text-slate-700">{request.dateRange || 'selected range'}</span>.
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {data && (
              <AiExportButton
                communityId={communityId}
                sourceType="INSIGHT_ANALYSIS"
                contextualActionRequest={request}
                domain={request.domain}
                dateRange={request.dateRange}
                title={`Insight Analysis - ${request.metricLabel || request.metricKey || request.action}`}
                label="Export"
              />
            )}
            <button
              onClick={fetchAnalysis}
              disabled={loading}
              title="Refresh analysis"
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Loading State */}
          {loading && (
            <div className="py-16 text-center space-y-3">
              <Sparkles className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
              <div className="text-sm font-semibold text-slate-800">
                Synthesizing authoritative Insights telemetry...
              </div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Correlating metric shifts, identifying root cause factors, and checking safety boundaries.
              </p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                Analysis Inquiry Notice
              </div>
              <div>{error}</div>
            </div>
          )}

          {/* Data Loaded View */}
          {data && !loading && (
            <div className="space-y-5">
              {/* Confidence & Period Banner */}
              <div className="flex items-center justify-between p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-xs">
                <div className="text-indigo-900 font-medium">
                  Observation Range: <span className="font-bold">{data.metadata?.period || 'Selected Period'}</span>
                </div>
                {data.confidence && (
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                      data.confidence.level === 'HIGH'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    Confidence: {data.confidence.level} ({Math.round(data.confidence.score * 100)}%)
                  </span>
                )}
              </div>

              {/* 1. Core Synthesized Answer */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Authoritative Analysis
                </div>
                <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                  {data.answer}
                </div>
              </div>

              {/* 2. Verified Data Telemetry */}
              {data.facts && data.facts.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
                    <Database className="w-3.5 h-3.5 text-indigo-600" />
                    Verified Telemetry Facts ({data.facts.length})
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {data.facts.map((fact, idx) => {
                      const val = fact.value !== undefined ? fact.value : (fact as any).currentValue;
                      const hasDelta = fact.delta !== undefined && fact.delta !== null;
                      const numDelta = typeof fact.delta === 'number' ? fact.delta : parseFloat(String(fact.delta || '0'));
                      const isPositive = numDelta > 0;

                      return (
                        <div
                          key={fact.id || idx}
                          className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs"
                        >
                          <div className="font-semibold text-slate-700 truncate">{fact.metric}</div>
                          <div className="flex items-baseline justify-between mt-1">
                            <span className="text-lg font-bold text-slate-900 font-mono">
                              {typeof val === 'number' ? val.toLocaleString() : String(val ?? '—')}
                            </span>
                            {hasDelta && (
                              <span
                                className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  isPositive
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : numDelta < 0
                                    ? 'bg-rose-50 text-rose-700'
                                    : 'bg-slate-200 text-slate-600'
                                }`}
                              >
                                {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {numDelta > 0 ? `+${numDelta}` : `${numDelta}`}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400">
                            Source: {fact.source || 'Task 20 Insights'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Deep Analytical Insights */}
              {data.insights && data.insights.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
                    <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                    Correlation & Causality Analysis
                  </div>

                  <div className="space-y-2">
                    {data.insights.map((insight, idx) => (
                      <div
                        key={insight.id || idx}
                        className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                          insight.severity === 'CRITICAL' || insight.severity === 'HIGH'
                            ? 'bg-rose-50/40 border-rose-200 text-rose-950'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{insight.observation}</span>
                          {renderEvidenceTypeBadge(insight.evidenceType)}
                        </div>
                        <div className="text-slate-700 space-y-1 leading-relaxed">
                          <div>
                            <strong className="text-slate-900">Evidence: </strong>
                            {insight.evidence}
                          </div>
                          {insight.whyItLikelyHappened && (
                            <div>
                              <strong className="text-slate-900">Root Cause Factor: </strong>
                              {insight.whyItLikelyHappened}
                            </div>
                          )}
                          {insight.opportunityOrRisk && (
                            <div>
                              <strong className="text-slate-900">Strategic Impact: </strong>
                              {insight.opportunityOrRisk}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Actionable Recommendations */}
              {data.recommendations && data.recommendations.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
                    <Zap className="w-3.5 h-3.5 text-indigo-600" />
                    Recommended Next Actions ({data.recommendations.length})
                  </div>

                  <div className="space-y-2">
                    {data.recommendations.map((rec) => {
                      const isActionable = Boolean(rec.suggestedAction || (rec as any).suggestedActionType);
                      const actionType = rec.suggestedAction?.actionType || (rec as any).suggestedActionType;
                      const targetMod = rec.affectedModule || (rec as any).targetModule || 'COMMUNITY';

                      return (
                        <div
                          key={rec.id}
                          className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2 shadow-xs"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-bold text-slate-900 text-xs">{rec.title}</div>
                              <p className="text-xs text-slate-600 mt-0.5">{rec.rationale || rec.description}</p>
                            </div>
                            {rec.priority && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {rec.priority}
                              </span>
                            )}
                          </div>

                          {rec.suggestedNextStep && (
                            <div className="text-[11px] text-indigo-700 font-medium">
                              <strong>Next Step: </strong> {rec.suggestedNextStep}
                            </div>
                          )}

                          {isActionable && actionType && onPreviewAction && (
                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Lock className="w-3 h-3 text-slate-400" />
                                Requires safe admin confirmation
                              </span>
                              <button
                                onClick={() =>
                                  onPreviewAction(
                                    actionType,
                                    targetMod,
                                    rec.suggestedAction?.parameters || (rec as any).actionParameters || {},
                                    (rec as any).targetResource
                                  )
                                }
                                className="inline-flex items-center gap-1 px-3 py-1 bg-zinc-900 hover:bg-zinc-800 text-white rounded-md text-xs font-semibold shadow-xs transition"
                              >
                                <Play className="w-3 h-3" /> Preview Safe Action
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Drawer Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition"
          >
            Close
          </button>

          <button
            onClick={() => {
              onClose();
              onOpenInAssistant(request);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
          >
            <Sparkles className="w-4 h-4" />
            <span>Open in Community Brain</span>
            <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
