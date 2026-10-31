import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Send,
  RefreshCw,
} from 'lucide-react';
import { PlatformFeedback, FeedbackCategory, FeedbackPriority, FeedbackStatus } from '../../../../shared/types/models.js';

interface PlatformFeedbackViewProps {
  platformKey: string;
}

export const PlatformFeedbackView: React.FC<PlatformFeedbackViewProps> = ({ platformKey }) => {
  const [feedbackList, setFeedbackList] = useState<PlatformFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<PlatformFeedback | null>(null);

  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<FeedbackCategory>('FEATURE_SUGGESTION');
  const [newPriority, setNewPriority] = useState<FeedbackPriority>('MEDIUM');
  const [submitting, setSubmitting] = useState(false);

  // Admin notes
  const [adminNotes, setAdminNotes] = useState('');
  const [adminStatus, setAdminStatus] = useState<FeedbackStatus>('UNDER_REVIEW');
  const [updating, setUpdating] = useState(false);

  const fetchFeedback = async () => {
    setLoading(true);
    try {
      let url = '/api/v1/platform/feedback';
      if (statusFilter !== 'ALL') url += `?status=${statusFilter}`;

      const res = await fetch(url, {
        headers: { 'x-platform-key': platformKey || 'cr_platform_verified_claim_token' },
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        setFeedbackList(json.data);
      }
    } catch (err) {
      console.error('Failed to load feedback', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedback();
  }, [statusFilter, platformKey]);

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newDescription) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/platform/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-platform-key': platformKey || 'cr_platform_verified_claim_token',
        },
        body: JSON.stringify({
          title: newTitle,
          description: newDescription,
          category: newCategory,
          priority: newPriority,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setNewTitle('');
        setNewDescription('');
        setShowSubmitModal(false);
        fetchFeedback();
      }
    } catch (err) {
      console.error('Failed to submit feedback', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateFeedback = async () => {
    if (!selectedFeedback) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/v1/platform/feedback/${selectedFeedback.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-platform-key': platformKey || 'cr_platform_verified_claim_token',
        },
        body: JSON.stringify({
          status: adminStatus,
          adminNotes,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSelectedFeedback(null);
        fetchFeedback();
      }
    } catch (err) {
      console.error('Failed to update feedback', err);
    } finally {
      setUpdating(false);
    }
  };

  const openAdminModal = (item: PlatformFeedback) => {
    setSelectedFeedback(item);
    setAdminStatus(item.status);
    setAdminNotes(item.adminNotes || '');
  };

  return (
    <div id="platform-feedback-view" className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
              PLATFORM LEVEL
            </span>
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              USER VOICE
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
            Platform Feedback & Suggestions
          </h1>
          <p className="text-sm text-slate-500">
            Review community owner suggestions, feature requests, and issue reports across the bot platform.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSubmitModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Submit Feedback
          </button>
          <button
            onClick={fetchFeedback}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Filter Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="NEW">New</option>
            <option value="UNDER_REVIEW">Under Review</option>
            <option value="PLANNED">Planned</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
            <option value="DECLINED">Declined</option>
          </select>
        </div>
        <span className="text-xs text-slate-500">{feedbackList.length} items recorded</span>
      </div>

      {/* Feedback List */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
            <span className="ml-2 text-sm text-slate-500">Loading feedback records...</span>
          </div>
        ) : feedbackList.length === 0 ? (
          <div className="py-16 text-center">
            <MessageSquare className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-3 text-base font-semibold text-slate-900">
              No feedback has been submitted yet
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Community owners and users can submit feature suggestions, bug reports, and UX feedback. Use the "Submit Feedback" button to create an entry.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {feedbackList.map((item) => (
              <div
                key={item.id}
                onClick={() => openAdminModal(item)}
                className="cursor-pointer p-4 transition-colors hover:bg-slate-50/80"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {(item.category || 'GENERAL').replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${
                          item.priority === 'CRITICAL' || item.priority === 'HIGH'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        {item.priority}
                      </span>
                      <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        {(item.status || 'OPEN').replace(/_/g, ' ')}
                      </span>
                    </div>
                    <h4 className="mt-1 text-base font-semibold text-slate-900">{item.title}</h4>
                    <p className="mt-1 text-sm text-slate-600 line-clamp-2">{item.description}</p>
                    {item.adminNotes && (
                      <div className="mt-2 rounded bg-indigo-50/60 p-2 text-xs text-indigo-900">
                        <span className="font-semibold">Platform Owner Note:</span> {item.adminNotes}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs text-slate-400 shrink-0">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submission Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Submit Platform Feedback</h3>
              <button
                onClick={() => setShowSubmitModal(false)}
                className="rounded p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitFeedback} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Category
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as FeedbackCategory)}
                  className="mt-1 w-full rounded-lg border border-slate-300 py-2 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="FEATURE_SUGGESTION">Feature Suggestion</option>
                  <option value="BUG_REPORT">Bug Report</option>
                  <option value="FEEDBACK">General Feedback</option>
                  <option value="IMPROVEMENT_REQUEST">Improvement Request</option>
                  <option value="PROBLEM_REPORT">Problem Report</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Priority
                </label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as FeedbackPriority)}
                  className="mt-1 w-full rounded-lg border border-slate-300 py-2 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="Summary of suggestion or issue"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Description
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Provide context and details..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {submitting ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Review / Update Modal */}
      {selectedFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">Manage Feedback Item</h3>
              <button
                onClick={() => setSelectedFeedback(null)}
                className="rounded p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <div className="text-xs font-semibold text-slate-500">Title</div>
                <div className="text-base font-bold text-slate-900">{selectedFeedback.title}</div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-500">Details</div>
                <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                  {selectedFeedback.description}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Update Status
                </label>
                <select
                  value={adminStatus}
                  onChange={(e) => setAdminStatus(e.target.value as FeedbackStatus)}
                  className="mt-1 w-full rounded-lg border border-slate-300 py-2 pl-3 pr-8 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="NEW">New</option>
                  <option value="UNDER_REVIEW">Under Review</option>
                  <option value="PLANNED">Planned</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                  <option value="DECLINED">Declined</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Platform Admin Notes
                </label>
                <textarea
                  rows={3}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Notes for roadmap or internal tracking..."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedFeedback(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={updating}
                  onClick={handleUpdateFeedback}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {updating ? 'Saving...' : 'Save Updates'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
