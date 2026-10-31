import React, { useState, useRef, useEffect } from 'react';
import { Download, FileText, Table, Code2, Loader2, CheckCircle, AlertCircle, ChevronDown } from 'lucide-react';
import {
  AiReportFormat,
  AiReportSourceType,
  AiContextualActionRequest,
  AiResponse,
} from '../../../../../shared/types/ai.js';
import { DateRangeType } from '../../../../../shared/types/insights.js';

interface AiExportButtonProps {
  communityId: string;
  sourceType: AiReportSourceType;
  conversationId?: string;
  contextualActionRequest?: AiContextualActionRequest;
  aiResponse?: AiResponse;
  recommendationId?: string;
  domain?: string;
  title?: string;
  dateRange?: DateRangeType;
  size?: 'sm' | 'md';
  label?: string;
}

export const AiExportButton: React.FC<AiExportButtonProps> = ({
  communityId,
  sourceType,
  conversationId,
  contextualActionRequest,
  aiResponse,
  recommendationId,
  domain,
  title,
  dateRange,
  size = 'sm',
  label = 'Export',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<AiReportFormat | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = async (format: AiReportFormat) => {
    setExportingFormat(format);
    setStatusMessage(null);

    try {
      const payload = {
        format,
        sourceType,
        conversationId,
        contextualActionRequest,
        aiResponse,
        recommendationId,
        domain,
        title,
        dateRange,
      };

      const res = await fetch(`/api/v1/communities/${communityId}/ai/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        const message = errorJson.error?.message || errorJson.message || 'Export failed';
        throw new Error(message);
      }

      // Extract filename from header or fallback
      let filename = `ai-report-${domain || 'community'}-${Date.now()}.${format}`;
      const disposition = res.headers.get('content-disposition');
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          filename = match[1];
        }
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setStatusMessage({ type: 'success', text: `Downloaded ${filename}` });
      setTimeout(() => setStatusMessage(null), 4000);
      setIsOpen(false);
    } catch (err: any) {
      console.error('AI Export failed:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Failed to generate export' });
    } finally {
      setExportingFormat(null);
    }
  };

  const isExporting = exportingFormat !== null;

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        type="button"
        id="ai-export-dropdown-trigger"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className={`inline-flex items-center gap-1.5 font-medium rounded-lg border transition-all shadow-sm ${
          size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
        } ${
          isOpen
            ? 'bg-zinc-100 border-zinc-300 text-zinc-900'
            : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900'
        } disabled:opacity-50`}
        title="Export verified AI analysis as PDF, CSV, or JSON"
      >
        {isExporting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
        ) : (
          <Download className="w-3.5 h-3.5 text-zinc-500" />
        )}
        <span>{isExporting ? `Exporting ${exportingFormat?.toUpperCase()}...` : label}</span>
        <ChevronDown className="w-3 h-3 text-zinc-400" />
      </button>

      {/* Status toast if active */}
      {statusMessage && (
        <div
          className={`absolute right-0 top-full mt-1 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs shadow-md border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
          )}
          <span className="truncate max-w-[200px]">{statusMessage.text}</span>
        </div>
      )}

      {/* Dropdown Menu */}
      {isOpen && !isExporting && (
        <div className="absolute right-0 top-full mt-1.5 w-56 rounded-lg bg-white shadow-lg ring-1 ring-black/5 border border-zinc-200 py-1 z-30 focus:outline-none animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-1.5 border-b border-zinc-100">
            <p className="text-[10px] font-semibold tracking-wider text-zinc-400 uppercase">Export Report</p>
            <p className="text-[11px] text-zinc-500 truncate">Authoritative Telemetry Only</p>
          </div>

          <button
            type="button"
            id="export-pdf-btn"
            onClick={() => handleExport('pdf')}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 text-left transition-colors"
          >
            <FileText className="w-4 h-4 text-rose-500 shrink-0" />
            <div className="flex flex-col">
              <span className="font-medium text-zinc-800">PDF Document</span>
              <span className="text-[10px] text-zinc-400">Executive summary & formatted tables</span>
            </div>
          </button>

          <button
            type="button"
            id="export-csv-btn"
            onClick={() => handleExport('csv')}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 text-left transition-colors"
          >
            <Table className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="flex flex-col">
              <span className="font-medium text-zinc-800">CSV Spreadsheet</span>
              <span className="text-[10px] text-zinc-400">Structured rows with metric deltas</span>
            </div>
          </button>

          <button
            type="button"
            id="export-json-btn"
            onClick={() => handleExport('json')}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 text-left transition-colors"
          >
            <Code2 className="w-4 h-4 text-blue-600 shrink-0" />
            <div className="flex flex-col">
              <span className="font-medium text-zinc-800">JSON Payload</span>
              <span className="text-[10px] text-zinc-400">Complete sanitized data model</span>
            </div>
          </button>

          <div className="px-3 py-1.5 border-t border-zinc-100 bg-zinc-50/50 mt-1">
            <p className="text-[10px] text-zinc-400 leading-tight">
              Preserves observation period & source metrics. Secrets & tokens are strictly excluded.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
