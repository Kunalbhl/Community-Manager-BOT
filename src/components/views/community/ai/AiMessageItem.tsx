import React, { useState } from 'react';
import {
  Sparkles,
  User,
  Shield,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  FileText,
  Play,
  ArrowRight,
  Database,
  Lock,
  Zap,
  Info,
  ExternalLink,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react';
import {
  AiFact,
  AiInsight,
  AiRecommendation,
  AiLimitation,
  AiConfidence,
  AiActionPlan,
  AiPlannedAction,
  AiEvidenceType,
} from '../../../../../shared/types/ai.js';

export interface ChatMessageData {
  id: string;
  sender: 'USER' | 'ASSISTANT';
  text: string;
  facts?: AiFact[];
  insights?: AiInsight[];
  recommendations?: AiRecommendation[];
  actionPlans?: AiActionPlan[];
  actionsPlanned?: AiPlannedAction[];
  limitations?: AiLimitation[];
  confidence?: AiConfidence;
  period?: string;
  timestamp: string;
  canonicalDeepLink?: string;
}

interface AiMessageItemProps {
  message: ChatMessageData;
  onPreviewAction: (
    actionType: string,
    targetModule: string,
    parameters: Record<string, any>,
    targetResource?: string
  ) => void;
  onCreatePlanForRecommendation?: (rec: AiRecommendation) => void;
  onNavigateToInsights?: (tab?: string, deepLink?: string) => void;
  onAskContextualFollowUp?: (prompt: string) => void;
  loadingActionType?: string | null;
}

export const AiMessageItem: React.FC<AiMessageItemProps> = ({
  message,
  onPreviewAction,
  onCreatePlanForRecommendation,
  onNavigateToInsights,
  onAskContextualFollowUp,
  loadingActionType,
}) => {
  const [expandedSupportingData, setExpandedSupportingData] = useState<Record<string, boolean>>({});
  const [showAllFacts, setShowAllFacts] = useState(false);
  const isUser = message.sender === 'USER';

  const toggleSupportingData = (recId: string) => {
    setExpandedSupportingData((prev) => ({
      ...prev,
      [recId]: !prev[recId],
    }));
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

  if (isUser) {
    return (
      <div className="flex justify-end my-4">
        <div className="flex items-start gap-2.5 max-w-2xl">
          <div className="bg-zinc-900 text-white rounded-2xl rounded-tr-none px-4 py-2.5 text-sm shadow-sm">
            <p className="whitespace-pre-wrap leading-relaxed">{message.text}</p>
            <div className="mt-1 text-right">
              <span className="text-[10px] text-zinc-400">{message.timestamp}</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-full bg-zinc-800 text-white flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold">
            <User className="w-4 h-4" />
          </div>
        </div>
      </div>
    );
  }

  const hasFacts = message.facts && message.facts.length > 0;
  const hasInsights = message.insights && message.insights.length > 0;
  const hasRecommendations = message.recommendations && message.recommendations.length > 0;
  const hasActions = message.actionsPlanned && message.actionsPlanned.length > 0;
  const hasLimitations = message.limitations && message.limitations.length > 0;

  const displayedFacts = showAllFacts ? message.facts || [] : (message.facts || []).slice(0, 4);

  return (
    <div className="flex justify-start my-4">
      <div className="flex items-start gap-3 max-w-4xl w-full">
        <div className="w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
          <Sparkles className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0 bg-white border border-zinc-200 rounded-2xl rounded-tl-none p-4 shadow-sm space-y-4">
          {/* Header & Confidence */}
          <div className="flex items-center justify-between border-b border-zinc-100 pb-2 text-xs text-zinc-500">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-900">Community Brain</span>
              {message.period && (
                <span className="px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded text-[11px]">
                  Scope: {message.period}
                </span>
              )}
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                Task 20 Engine
              </span>
            </div>

            {message.confidence && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-zinc-400">Confidence:</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    message.confidence.level === 'HIGH'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : message.confidence.level === 'MEDIUM'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-zinc-100 text-zinc-700 border border-zinc-200'
                  }`}
                >
                  {message.confidence.level} ({Math.round(message.confidence.score * 100)}%)
                </span>
              </div>
            )}
          </div>

          {/* 1. Core Synthesized Answer */}
          <div className="text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap">
            {message.text}
          </div>

          {/* 2. Verified Data & Grounded Metrics */}
          {hasFacts && (
            <div className="bg-zinc-50/70 border border-zinc-200/80 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800">
                  <Database className="w-3.5 h-3.5 text-zinc-600" />
                  <span>Verified Telemetry ({message.facts!.length} Signals)</span>
                </div>
                {message.facts!.length > 4 && (
                  <button
                    onClick={() => setShowAllFacts(!showAllFacts)}
                    className="text-[11px] text-zinc-600 hover:text-zinc-900 font-medium flex items-center gap-0.5"
                  >
                    {showAllFacts ? 'Show Less' : `+${message.facts!.length - 4} More Signals`}
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {displayedFacts.map((fact, idx) => {
                  const val = fact.value !== undefined ? fact.value : (fact as any).currentValue;
                  const hasDelta = fact.delta !== undefined && fact.delta !== null;
                  const numDelta = typeof fact.delta === 'number' ? fact.delta : parseFloat(String(fact.delta || '0'));
                  const isPositive = numDelta > 0;

                  return (
                    <div
                      key={fact.id || idx}
                      className="bg-white border border-zinc-200 rounded-lg p-2.5 flex flex-col justify-between"
                    >
                      <div className="text-[11px] font-medium text-zinc-500 truncate" title={fact.metric}>
                        {fact.metric}
                      </div>
                      <div className="flex items-baseline justify-between mt-1">
                        <span className="text-base font-bold text-zinc-900 font-mono">
                          {typeof val === 'number' ? val.toLocaleString() : String(val ?? '—')}
                        </span>
                        {hasDelta && (
                          <span
                            className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1 py-0.5 rounded ${
                              isPositive
                                ? 'bg-emerald-50 text-emerald-700'
                                : numDelta < 0
                                ? 'bg-red-50 text-red-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {isPositive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                            {numDelta > 0 ? `+${numDelta}` : `${numDelta}`}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[9px] text-zinc-400">
                        <span className="truncate">{fact.source || 'Task 20 Insights'}</span>
                        {onNavigateToInsights && (
                          <button
                            onClick={() => onNavigateToInsights(fact.relevantModule || fact.category, fact.canonicalDeepLink)}
                            className="text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-0.5 ml-1"
                            title="View in Insights Engine"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Analytical Insights */}
          {hasInsights && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800">
                <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
                <span>Analytical Insights & Explanations</span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {message.insights!.map((insight, idx) => (
                  <div
                    key={insight.id || idx}
                    className={`border rounded-xl p-3.5 text-xs space-y-2 ${
                      insight.severity === 'CRITICAL' || insight.severity === 'HIGH'
                        ? 'bg-rose-50/40 border-rose-200 text-rose-950'
                        : insight.trend === 'POSITIVE'
                        ? 'bg-emerald-50/40 border-emerald-200 text-emerald-950'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-zinc-900">{insight.observation}</span>
                      <div className="flex items-center gap-1.5">
                        {renderEvidenceTypeBadge(insight.evidenceType)}
                        <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/80 border border-zinc-200 text-zinc-600">
                          {insight.category}
                        </span>
                      </div>
                    </div>

                    <div className="text-zinc-700 leading-relaxed space-y-1">
                      <div>
                        <strong className="text-zinc-800">Evidence: </strong>
                        {insight.evidence}
                      </div>
                      {insight.whyItLikelyHappened && (
                        <div>
                          <strong className="text-zinc-800">Root Cause Factor: </strong>
                          {insight.whyItLikelyHappened}
                        </div>
                      )}
                      {insight.opportunityOrRisk && (
                        <div>
                          <strong className="text-zinc-800">Strategic Impact: </strong>
                          {insight.opportunityOrRisk}
                        </div>
                      )}
                      {insight.recommendedAction && (
                        <div>
                          <strong className="text-zinc-800">Suggested Action: </strong>
                          {insight.recommendedAction}
                        </div>
                      )}
                    </div>

                    {/* Deep link to Insights & Follow-Up Context Actions */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-200/60">
                      {onNavigateToInsights && (
                        <button
                          onClick={() => onNavigateToInsights(insight.relevantModule || insight.category, insight.canonicalDeepLink)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 bg-white/90 border border-indigo-200 rounded px-2 py-0.5"
                        >
                          <ExternalLink className="w-3 h-3" /> View in Insights Dashboard
                        </button>
                      )}
                      {onAskContextualFollowUp && (
                        <button
                          onClick={() => onAskContextualFollowUp(`Explain likely causes for: ${insight.observation}`)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-700 hover:text-zinc-900 bg-white/90 border border-zinc-200 rounded px-2 py-0.5"
                        >
                          <Sparkles className="w-3 h-3 text-amber-500" /> Find Likely Causes
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Actionable Recommendations */}
          {hasRecommendations && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800">
                <Zap className="w-3.5 h-3.5 text-zinc-700" />
                <span>Recommendations & Next Steps</span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {message.recommendations!.map((rec) => {
                  const isExpanded = expandedSupportingData[rec.id];
                  const hasSupporting = rec.supportingFacts && rec.supportingFacts.length > 0;
                  const isActionable = Boolean(rec.suggestedAction || (rec as any).suggestedActionType);
                  const actionType = rec.suggestedAction?.actionType || (rec as any).suggestedActionType;
                  const targetMod = rec.affectedModule || (rec as any).targetModule || 'COMMUNITY';

                  return (
                    <div
                      key={rec.id}
                      className="bg-white border border-zinc-200 hover:border-zinc-300 rounded-xl p-3.5 space-y-2.5 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-zinc-900">{rec.title}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 font-medium">
                              {targetMod}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-600 leading-normal">{rec.rationale || rec.description}</p>
                          {rec.suggestedNextStep && (
                            <p className="text-[11px] text-indigo-700 font-medium">
                              <strong>Next Step: </strong> {rec.suggestedNextStep}
                            </p>
                          )}
                        </div>

                        {rec.priority && (
                          <span
                            className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded border ${
                              rec.priority === 'CRITICAL' || rec.priority === 'HIGH'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : rec.priority === 'MEDIUM'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-zinc-50 text-zinc-600 border-zinc-200'
                            }`}
                          >
                            {rec.priority}
                          </span>
                        )}
                      </div>

                      {/* Supporting Data Accordion */}
                      {hasSupporting && (
                        <div className="text-[11px] pt-1 border-t border-zinc-100">
                          <button
                            onClick={() => toggleSupportingData(rec.id)}
                            className="text-zinc-500 hover:text-zinc-800 flex items-center gap-1 font-medium"
                          >
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            {isExpanded ? 'Hide Supporting Evidence' : `View Supporting Evidence (${rec.supportingFacts.length})`}
                          </button>

                          {isExpanded && (
                            <div className="mt-1.5 p-2 bg-zinc-50 rounded border border-zinc-200 font-mono text-[10px] text-zinc-700 space-y-1">
                              {rec.supportingFacts.map((factStr, fIdx) => (
                                <div key={fIdx} className="flex items-center gap-1.5">
                                  <span className="text-indigo-500">•</span>
                                  <span>{factStr}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Deep Link to Insights and Action Preview Button */}
                      <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500 text-[11px] flex items-center gap-1">
                            <Lock className="w-3 h-3 text-zinc-400" />
                            Preview → Confirm → Revalidate → Execute
                          </span>
                          {onNavigateToInsights && rec.canonicalDeepLink && (
                            <button
                              onClick={() => onNavigateToInsights(targetMod, rec.canonicalDeepLink)}
                              className="text-indigo-600 hover:text-indigo-800 text-[11px] font-medium flex items-center gap-0.5 ml-2"
                            >
                              <ExternalLink className="w-3 h-3" /> View in Insights
                            </button>
                          )}
                        </div>

                        {isActionable && actionType && (
                          <button
                            id={`btn-preview-rec-${rec.id}`}
                            onClick={() =>
                              onPreviewAction(
                                actionType,
                                targetMod,
                                rec.suggestedAction?.parameters || (rec as any).actionParameters || {},
                                (rec as any).targetResource
                              )
                            }
                            disabled={loadingActionType === actionType}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-md text-xs font-medium transition shadow-sm disabled:opacity-50"
                          >
                            <Play className="w-3 h-3" />
                            Preview Action
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. Planned Actions List */}
          {hasActions && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800">
                <Layers className="w-3.5 h-3.5 text-zinc-700" />
                <span>Planned Action Sequence</span>
              </div>

              <div className="space-y-1.5">
                {message.actionsPlanned!.map((action, idx) => (
                  <div
                    key={action.id || idx}
                    className="flex items-center justify-between p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-zinc-200 text-zinc-700 flex items-center justify-center font-bold text-[10px]">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-semibold text-zinc-900">{action.actionType}</div>
                        <div className="text-[10px] text-zinc-500">Target: {action.module}</div>
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        onPreviewAction(
                          action.actionType,
                          action.module,
                          action.parameters || {},
                          (action as any).targetResource
                        )
                      }
                      className="px-2.5 py-1 bg-white border border-zinc-300 hover:border-zinc-400 text-zinc-800 rounded text-xs font-medium transition"
                    >
                      Preview
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 6. Context & Safety Boundaries */}
          {hasLimitations && (
            <div className="p-2.5 bg-zinc-50/80 border border-zinc-200 rounded-lg space-y-1 text-[11px] text-zinc-600">
              <div className="flex items-center gap-1 font-semibold text-zinc-700">
                <Info className="w-3 h-3 text-zinc-500" />
                <span>Authoritative Data Boundaries & Limitations</span>
              </div>
              <ul className="list-disc pl-4 space-y-0.5">
                {message.limitations!.map((lim, idx) => (
                  <li key={lim.id || idx}>
                    <strong>{lim.topic}: </strong> {lim.reason}
                    {lim.recommendation && (
                      <span className="text-zinc-500 block text-[10px]">
                        Suggested next step: {lim.recommendation}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Footer Timestamp */}
          <div className="text-right text-[10px] text-zinc-400">
            {message.timestamp}
          </div>
        </div>
      </div>
    </div>
  );
};
