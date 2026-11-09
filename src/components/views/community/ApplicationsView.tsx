import React, { useState, useEffect, useMemo } from 'react';
import { MemberSelect } from '../../common/DiscordPickers.js';
import { RoleSelect } from '../../common/DiscordPickers.js';
import {
  FileText,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  Plus,
  RefreshCw,
  Eye,
  X,
  Send,
  User,
  Calendar,
  UserCheck,
  Video,
  Sparkles,
  ChevronRight,
  Gift,
  BarChart3,
  Users,
  Award,
  ShieldCheck,
  AlertCircle,
  Settings,
  Activity,
  TrendingUp,
  Trash2,
  Save,
  Undo,
  CheckCircle2,
  ClipboardList,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleCalendarSettingsCard } from './settings/GoogleCalendarSettingsCard';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

import { MemberPick } from './ServerToolsView.js';
import { ApplicationDocument } from '../../../../shared/types/models.js';
import { UserRole } from '../../../../shared/types/rbac.js';
import { LoadingSkeleton } from '../../common/LoadingSkeleton.js';
import { EmptyState } from '../../common/EmptyState.js';
import { PageHeader } from '../../common/PageHeader.js';
import { MetricStrip } from '../../common/MetricStrip.js';
import { StatusBadge, StatusVariant } from '../../common/StatusBadge.js';
import { ContextDrawer } from '../../common/ContextDrawer.js';

// Define the 11 recruitment stages as required
export const RECRUITMENT_STAGES: StatusVariant[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'ADDITIONAL_INFORMATION_REQUIRED',
  'INTERVIEW_REQUIRED',
  'INTERVIEW_SCHEDULED',
  'APPROVED',
  'REJECTED',
  'JOIN_PENDING',
  'JOINED',
  'CLOSED',
];

interface ApplicationsViewProps {
  communityId: string;
  currentRole: UserRole;
  initialTab?: 'overview' | 'applications' | 'candidates' | 'recruiters' | 'interviews' | 'referrals' | 'benefits' | 'analytics' | 'settings';
  /** Inside a module tab: no page header or workspace menu, just this tab's content. */
  embedded?: boolean;
}

export const ApplicationsView: React.FC<ApplicationsViewProps> = ({
  communityId,
  currentRole,
  initialTab = 'overview',
  embedded = false,
}) => {
  // 9 Workspaces Navigation Tab
  const [activeTab, setActiveTab] = useState<
    'overview' | 'applications' | 'candidates' | 'recruiters' | 'interviews' | 'referrals' | 'benefits' | 'analytics' | 'settings'
  >(initialTab);

  // Core Recruitment States
  const [applications, setApplications] = useState<ApplicationDocument[]>([]);
  const [recruiterCodes, setRecruiterCodes] = useState<any[]>([]);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [recruiterBenefits, setRecruiterBenefits] = useState<any[]>([]);
  const [referralLifecycle, setReferralLifecycle] = useState<any[]>([]);
  const [recruiterRecords, setRecruiterRecords] = useState<any[]>([]);
  const [pendingClaims, setPendingClaims] = useState<any[]>([]);
  
  // Custom questions states
  const [appQuestions, setAppQuestions] = useState<any[]>([]);
  const [interviewQuestionsList, setInterviewQuestionsList] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [recruiterFilter, setRecruiterFilter] = useState('ALL');
  const [selectedApp, setSelectedApp] = useState<any | null>(null);

  // Bulk operation states
  const [selectedAppIds, setSelectedAppIds] = useState<string[]>([]);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Saved Filters states
  const [savedFilters, setSavedFilters] = useState<Array<{ name: string; status: string; recruiter: string; search: string }>>(() => {
    try {
      const stored = localStorage.getItem(`saved_rec_filters_${communityId}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [saveFilterName, setSaveFilterName] = useState('');
  const [showSaveFilterModal, setShowSaveFilterModal] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // New item creation states (Modals)
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [showCreateCodeModal, setShowCreateCodeModal] = useState(false);
  const [showCreateBenefitModal, setShowCreateBenefitModal] = useState(false);
  const [showManualReferralModal, setShowManualReferralModal] = useState(false);

  // Input states
  const [applicantUsername, setApplicantUsername] = useState('');
  const [applicantDiscordId, setApplicantDiscordId] = useState('');
  const [recruiterCode, setRecruiterCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [interviewTime, setInterviewTime] = useState('');
  const [interviewNotes, setInterviewNotes] = useState('');
  const [assignedInterviewer, setAssignedInterviewer] = useState('');
  const [submittingInterview, setSubmittingInterview] = useState(false);

  const [newCodeName, setNewCodeName] = useState('');
  const [newCodeRecruiterId, setNewCodeRecruiterId] = useState('');
  const [submittingCode, setSubmittingCode] = useState(false);

  const [newBenefitName, setNewBenefitName] = useState('');
  const [newBenefitThreshold, setNewBenefitThreshold] = useState('5');
  const [newBenefitRoleId, setNewBenefitRoleId] = useState('');
  const [newBenefitDesc, setNewBenefitDesc] = useState('');
  const [submittingBenefit, setSubmittingBenefit] = useState(false);

  const [manualJoinDiscordId, setManualJoinDiscordId] = useState('');
  const [manualJoinCode, setManualJoinCode] = useState('');
  const [submittingManualJoin, setSubmittingManualJoin] = useState(false);

  const [newQuestionText, setNewQuestionText] = useState('');
  const [newQuestionType, setNewQuestionType] = useState('text');
  const [newInterviewQuestionText, setNewInterviewQuestionText] = useState('');
  const [newInterviewQuestionCategory, setNewInterviewQuestionCategory] = useState('General');
  const [submittingQuestion, setSubmittingQuestion] = useState(false);

  // Feedback Notification Banner
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Profile Drawer Tab
  const [drawerActiveTab, setDrawerActiveTab] = useState<'details' | 'intelligence' | 'timeline' | 'discord'>('details');
  const [candidateNotes, setCandidateNotes] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem(`candidate_notes_${communityId}`);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [currentNoteText, setCurrentNoteText] = useState('');

  // Task 46 Recruitment Intelligence States
  const [scoreConfig, setScoreConfig] = useState<any>(null);
  const [segments, setSegments] = useState<any[]>([]);
  const [activeSegment, setActiveSegment] = useState<any | null>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [aiSummary, setAiSummary] = useState<any>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [workloadStats, setWorkloadStats] = useState<any[]>([]);

  // Fetch all multi-tenant endpoints gracefully
  const fetchData = async () => {
    setLoading(true);
    setFeedbackMsg(null);
    try {
      const headers = {
        'x-role': currentRole,
        'x-user-role': currentRole,
        'x-community-id': communityId,
      };

      const fetchWithGrace = async (url: string, defaultValue: any) => {
        try {
          const res = await fetch(url, { headers });
          if (res.ok) {
            const json = await res.json();
            return json.success || json.data !== undefined ? json.data : defaultValue;
          }
          return defaultValue;
        } catch (err) {
          console.warn(`Error fetching ${url}:`, err);
          return defaultValue;
        }
      };

      const [
        appsData,
        codesData,
        interviewsData,
        benefitsData,
        referralsData,
        recordsData,
        pendingClaimsData,
        questionsData,
        scoreConfigData,
        segmentsData,
        campaignsData,
        alertsData,
        workloadData,
      ] = await Promise.all([
        fetchWithGrace(`/api/v1/applications?communityId=${communityId}`, []),
        fetchWithGrace(`/api/v1/recruiter-codes?communityId=${communityId}`, []),
        fetchWithGrace(`/api/v1/interviews?communityId=${communityId}`, []),
        fetchWithGrace(`/api/v1/recruiter-benefits?communityId=${communityId}`, []),
        fetchWithGrace(`/api/v1/referrals/lifecycle?communityId=${communityId}`, []),
        fetchWithGrace(`/api/v1/recruiter-records?communityId=${communityId}`, []),
        fetchWithGrace(`/api/v1/recruiter-records/benefits/pending?communityId=${communityId}`, []),
        fetchWithGrace(`/api/v1/community/questions?communityId=${communityId}`, { applicationQuestions: [], interviewQuestions: [] }),
        fetchWithGrace(`/api/v1/communities/${communityId}/recruitment/score-config`, null),
        fetchWithGrace(`/api/v1/communities/${communityId}/recruitment/segments`, []),
        fetchWithGrace(`/api/v1/communities/${communityId}/recruitment/campaigns`, []),
        fetchWithGrace(`/api/v1/communities/${communityId}/recruitment/alerts`, []),
        fetchWithGrace(`/api/v1/communities/${communityId}/recruitment/workload`, []),
      ]);

      setApplications(Array.isArray(appsData) ? appsData : []);
      // Opened from a Discord "Open in dashboard" button: select that application.
      const wanted = new URLSearchParams(window.location.search).get('application');
      if (wanted && Array.isArray(appsData)) {
        const hit = appsData.find((a: any) => a.id === wanted);
        if (hit) setSelectedApp(hit);
        { const u = new URL(window.location.href); u.searchParams.delete('application'); window.history.replaceState(null, '', u.toString()); }
      }
      setRecruiterCodes(Array.isArray(codesData) ? codesData : []);
      setInterviews(Array.isArray(interviewsData) ? interviewsData : []);
      setRecruiterBenefits(Array.isArray(benefitsData) ? benefitsData : []);
      setReferralLifecycle(Array.isArray(referralsData) ? referralsData : []);
      setRecruiterRecords(Array.isArray(recordsData) ? recordsData : []);
      setPendingClaims(Array.isArray(pendingClaimsData) ? pendingClaimsData : []);
      setScoreConfig(scoreConfigData);
      setSegments(Array.isArray(segmentsData) ? segmentsData : []);
      setCampaigns(Array.isArray(campaignsData) ? campaignsData : []);
      setAlerts(Array.isArray(alertsData) ? alertsData : []);
      setWorkloadStats(Array.isArray(workloadData) ? workloadData : []);
      
      if (questionsData) {
        setAppQuestions(Array.isArray(questionsData.applicationQuestions) ? questionsData.applicationQuestions : []);
        setInterviewQuestionsList(Array.isArray(questionsData.interviewQuestions) ? questionsData.interviewQuestions : []);
      }
    } catch (err) {
      console.error('Failed to fetch recruitment data', err);
      setFeedbackMsg({ type: 'error', text: 'Some recruitment database modules failed to synchronize.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [communityId, currentRole]);

  // Status transitioner
  const handleUpdateStatus = async (appId: string, status: string) => {
    try {
      const res = await fetch(`/api/v1/applications/${appId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.success) {
        setFeedbackMsg({ type: 'success', text: `Application successfully transitioned to ${status.replace(/_/g, ' ')}.` });
        fetchData();
        if (selectedApp && selectedApp.id === appId) {
          setSelectedApp({ ...selectedApp, status });
        }
      } else {
        setFeedbackMsg({ type: 'error', text: json.message || 'Failed to transition stage.' });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Error executing pipeline transition.' });
    }
  };

  // Bulk workflow updates
  const handleBulkStatusUpdate = async (status: string) => {
    if (selectedAppIds.length === 0) return;
    setBulkUpdating(true);
    setFeedbackMsg(null);
    let successCount = 0;
    try {
      await Promise.all(
        selectedAppIds.map(async (id) => {
          try {
            const res = await fetch(`/api/v1/applications/${id}/status`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'x-role': currentRole,
                'x-user-role': currentRole,
                'x-community-id': communityId,
              },
              body: JSON.stringify({ status }),
            });
            if (res.ok) successCount++;
          } catch {
            // silent catch to process others
          }
        })
      );
      setFeedbackMsg({
        type: successCount === selectedAppIds.length ? 'success' : 'error',
        text: `Bulk update complete. Successfully updated ${successCount} of ${selectedAppIds.length} candidate files to ${status.replace(/_/g, ' ')}.`,
      });
      setSelectedAppIds([]);
      fetchData();
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Critical error while processing bulk update.' });
    } finally {
      setBulkUpdating(false);
    }
  };

  // Confirm Discord guild join event and award codes
  const handleConfirmJoin = async (applicantDiscordId: string, recruiterCodeUsed?: string) => {
    try {
      const res = await fetch('/api/v1/referrals/confirm-join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          communityId,
          discordUserId: applicantDiscordId,
          recruiterCode: recruiterCodeUsed,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setFeedbackMsg({ type: 'success', text: 'Discord join verified and recruiter referral attributed successfully!' });
        fetchData();
      } else {
        setFeedbackMsg({ type: 'error', text: json.message || 'Join verification failed.' });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Failed to connect to Discord verification service.' });
    }
  };

  // Manual join attribution override
  const handleManualJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualJoinDiscordId) return;
    setSubmittingManualJoin(true);
    try {
      const res = await fetch('/api/v1/referrals/confirm-join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          communityId,
          discordUserId: manualJoinDiscordId,
          recruiterCode: manualJoinCode || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setFeedbackMsg({ type: 'success', text: 'Manual join verified and attribution processed!' });
        setShowManualReferralModal(false);
        setManualJoinDiscordId('');
        setManualJoinCode('');
        fetchData();
      } else {
        setFeedbackMsg({ type: 'error', text: json.message || 'Manual verification failed.' });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Failed manual join verification request.' });
    } finally {
      setSubmittingManualJoin(false);
    }
  };

  // Schedule candidate interviews
  const handleScheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp || !interviewTime) return;
    setSubmittingInterview(true);
    try {
      const res = await fetch('/api/v1/interviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          communityId,
          applicationId: selectedApp.id,
          scheduledTime: new Date(interviewTime).toISOString(),
          notes: interviewNotes,
          interviewerUserId: assignedInterviewer || undefined,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setFeedbackMsg({ type: 'success', text: 'Candidate interview scheduled and Discord alert broadcast.' });
        setShowInterviewModal(false);
        setInterviewTime('');
        setInterviewNotes('');
        setAssignedInterviewer('');
        handleUpdateStatus(selectedApp.id, 'INTERVIEW_SCHEDULED');
      } else {
        setFeedbackMsg({ type: 'error', text: json.message || 'Interview scheduling failed.' });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Failed to save scheduled interview.' });
    } finally {
      setSubmittingInterview(false);
    }
  };

  // Interview state controller
  const handleUpdateInterviewStatus = async (interviewId: string, status: 'started' | 'complete' | 'cancel') => {
    try {
      const res = await fetch(`/api/v1/interviews/${interviewId}/${status}`, {
        method: 'PATCH',
        headers: {
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
      });
      const json = await res.json();
      if (json.success) {
        setFeedbackMsg({ type: 'success', text: `Interview state updated to ${status.toUpperCase()}.` });
        fetchData();
      } else {
        setFeedbackMsg({ type: 'error', text: json.message || 'Failed to update interview status.' });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Error writing interview state changes.' });
    }
  };

  // Create new candidate application file
  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applicantUsername || !applicantDiscordId) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/applications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          communityId,
          applicantUsername,
          applicantDiscordId,
          recruiterCodeUsed: recruiterCode || undefined,
          answers: [
            {
              questionId: 'q1',
              questionText: 'Why do you wish to join our community?',
              answerText: 'I want to participate in flagship guild events and coordinate campaigns.',
            },
          ],
        }),
      });
      const json = await res.json();
      if (json.success) {
        setApplicantUsername('');
        setApplicantDiscordId('');
        setRecruiterCode('');
        setShowSubmitModal(false);
        setFeedbackMsg({ type: 'success', text: 'Candidate application submitted successfully.' });
        fetchData();
      } else {
        setFeedbackMsg({ type: 'error', text: json.message || 'Submission failed.' });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Failed to submit application.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Generate new recruiter code
  const handleCreateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCodeName || !newCodeRecruiterId) return;
    setSubmittingCode(true);
    try {
      const res = await fetch('/api/v1/recruiter-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          communityId,
          code: newCodeName.toUpperCase().replace(/\s+/g, '-'),
          recruiterUserId: newCodeRecruiterId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setNewCodeName('');
        setNewCodeRecruiterId('');
        setShowCreateCodeModal(false);
        setFeedbackMsg({ type: 'success', text: 'New recruiter referral code generated and active.' });
        fetchData();
      } else {
        setFeedbackMsg({ type: 'error', text: json.message || 'Referral code creation failed.' });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Failed to create recruiter code.' });
    } finally {
      setSubmittingCode(false);
    }
  };

  // Revoke/Deactivate recruiter code
  const handleRevokeCode = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/recruiter-codes/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({ isActive: false }),
      });
      if (res.ok) {
        setFeedbackMsg({ type: 'success', text: 'Referral code revoked and deactivated.' });
        fetchData();
      } else {
        setFeedbackMsg({ type: 'error', text: 'Failed to revoke code.' });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Error deactivating recruiter code.' });
    }
  };

  // Configure new benefit level
  const handleCreateBenefit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBenefitName || !newBenefitThreshold) return;
    setSubmittingBenefit(true);
    try {
      const res = await fetch('/api/v1/recruiter-benefits', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          communityId,
          name: newBenefitName,
          description: newBenefitDesc,
          threshold: parseInt(newBenefitThreshold, 10),
          rewardType: 'ROLE_GRANT',
          discordRoleId: newBenefitRoleId || undefined,
          isActive: true,
        }),
      });
      if (res.ok) {
        setNewBenefitName('');
        setNewBenefitDesc('');
        setNewBenefitRoleId('');
        setShowCreateBenefitModal(false);
        setFeedbackMsg({ type: 'success', text: 'New recruitment incentive benefit layer deployed.' });
        fetchData();
      } else {
        setFeedbackMsg({ type: 'error', text: 'Failed to configure benefit.' });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Failed to write benefit configuration.' });
    } finally {
      setSubmittingBenefit(false);
    }
  };

  // Delete benefit level
  const handleDeleteBenefit = async (benefitId: string) => {
    try {
      const res = await fetch(`/api/v1/recruiter-benefits/${benefitId}?communityId=${communityId}`, {
        method: 'DELETE',
        headers: {
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
      });
      if (res.ok) {
        setFeedbackMsg({ type: 'success', text: 'Recruiter benefit tier successfully deleted.' });
        fetchData();
      } else {
        setFeedbackMsg({ type: 'error', text: 'Failed to delete benefit configuration.' });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Error writing benefit configuration updates.' });
    }
  };

  // Claim recruiter benefit
  const handleClaimBenefit = async (recordId: string) => {
    try {
      const res = await fetch(`/api/v1/recruiter-records/${recordId}/claim-benefit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          communityId,
          claimReference: `Verified claim via Web Admin at ${new Date().toLocaleDateString()}`,
        }),
      });
      if (res.ok) {
        setFeedbackMsg({ type: 'success', text: 'Recruiter benefit claim submitted for fulfillment.' });
        fetchData();
      } else {
        setFeedbackMsg({ type: 'error', text: 'Failed to claim benefit.' });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Error claiming benefit.' });
    }
  };

  // Fulfill recruiter benefit
  const handleFulfillBenefit = async (recordId: string) => {
    try {
      const res = await fetch(`/api/v1/recruiter-records/${recordId}/fulfill-benefit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({
          communityId,
          claimReference: `Fulfillment processed by ${currentRole} at ${new Date().toLocaleDateString()}`,
        }),
      });
      if (res.ok) {
        setFeedbackMsg({ type: 'success', text: 'Recruiter benefit reward successfully granted on Discord!' });
        fetchData();
      } else {
        setFeedbackMsg({ type: 'error', text: 'Failed to grant benefit.' });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Error fulfilling benefit.' });
    }
  };

  // Create customized questions
  const handleCreateQuestion = async (e: React.FormEvent, isInterview: boolean) => {
    e.preventDefault();
    const text = isInterview ? newInterviewQuestionText : newQuestionText;
    if (!text) return;
    setSubmittingQuestion(true);
    try {
      const url = isInterview
        ? '/api/v1/community/interview-questions'
        : '/api/v1/community/application-questions';
      
      const body = isInterview
        ? { communityId, questionText: text, category: newInterviewQuestionCategory }
        : { communityId, questionText: text, type: newQuestionType, required: true };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setFeedbackMsg({ type: 'success', text: 'Recruitment workflow query successfully recorded.' });
        if (isInterview) {
          setNewInterviewQuestionText('');
        } else {
          setNewQuestionText('');
        }
        fetchData();
      } else {
        setFeedbackMsg({ type: 'error', text: 'Failed to record custom question.' });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Error writing custom recruitment questions.' });
    } finally {
      setSubmittingQuestion(false);
    }
  };

  // Delete customized questions
  const handleDeleteQuestion = async (id: string, isInterview: boolean) => {
    try {
      const url = isInterview
        ? `/api/v1/community/interview-questions/${id}?communityId=${communityId}`
        : `/api/v1/community/application-questions/${id}?communityId=${communityId}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
      });
      if (res.ok) {
        setFeedbackMsg({ type: 'success', text: 'Question removed from workflow.' });
        fetchData();
      } else {
        setFeedbackMsg({ type: 'error', text: 'Failed to delete question.' });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Error deleting question.' });
    }
  };

  // Saved Filters Mechanics
  const handleSaveFilter = () => {
    if (!saveFilterName) return;
    const newFilter = {
      name: saveFilterName,
      status: statusFilter,
      recruiter: recruiterFilter,
      search: search,
    };
    const updated = [...savedFilters, newFilter];
    setSavedFilters(updated);
    localStorage.setItem(`saved_rec_filters_${communityId}`, JSON.stringify(updated));
    setSaveFilterName('');
    setShowSaveFilterModal(false);
    setFeedbackMsg({ type: 'success', text: `Saved view "${newFilter.name}" successfully recorded.` });
  };

  const handleLoadFilter = (filter: typeof savedFilters[0]) => {
    setStatusFilter(filter.status);
    setRecruiterFilter(filter.recruiter);
    setSearch(filter.search);
    setCurrentPage(1);
    setFeedbackMsg({ type: 'success', text: `Loaded search view filter: "${filter.name}"` });
  };

  const handleClearSavedFilters = () => {
    setSavedFilters([]);
    localStorage.removeItem(`saved_rec_filters_${communityId}`);
    setFeedbackMsg({ type: 'success', text: 'Cleared all custom saved views.' });
  };

  // Operator profile notes manager
  const handleSaveNote = () => {
    if (!selectedApp) return;
    const updated = {
      ...candidateNotes,
      [selectedApp.id]: currentNoteText,
    };
    setCandidateNotes(updated);
    localStorage.setItem(`candidate_notes_${communityId}`, JSON.stringify(updated));
    setFeedbackMsg({ type: 'success', text: 'Operator candidate note file updated.' });
  };

  // Task 46 recruitment intelligence interactive handlers
  const handleRefreshAiSummary = async (appId: string) => {
    setAiSummaryLoading(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/recruitment/applications/${appId}/ai-summary/refresh`, {
        method: 'POST',
        headers: {
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
      });
      const json = await res.json();
      if (json.success) {
        setAiSummary(json.data);
        setFeedbackMsg({ type: 'success', text: 'Gemini candidate intelligence profiles recalculated successfully.' });
      } else {
        setFeedbackMsg({ type: 'error', text: json.message || 'AI summary refresh failed.' });
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Failed to trigger candidate analysis recalculation.' });
    } finally {
      setAiSummaryLoading(false);
    }
  };

  const handleUpdateTalentPool = async (appId: string, pool: string) => {
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/recruitment/applications/${appId}/pool`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({ talentPool: pool }),
      });
      const json = await res.json();
      if (json.success) {
        setFeedbackMsg({ type: 'success', text: `Candidate successfully categorized under "${pool}" Talent Pool.` });
        if (selectedApp && selectedApp.id === appId) {
          setSelectedApp({ ...selectedApp, talentPool: pool });
        }
        fetchData();
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Failed to save talent pool categorization.' });
    }
  };

  const handleToggleTag = async (appId: string, tag: string) => {
    if (!selectedApp) return;
    const currentTags: string[] = selectedApp.tags || [];
    const newTags = currentTags.includes(tag)
      ? currentTags.filter((t) => t !== tag)
      : [...currentTags, tag];

    try {
      const res = await fetch(`/api/v1/communities/${communityId}/recruitment/applications/${appId}/tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({ tags: newTags }),
      });
      const json = await res.json();
      if (json.success) {
        setFeedbackMsg({ type: 'success', text: 'Candidate flags and operational tags updated.' });
        if (selectedApp && selectedApp.id === appId) {
          setSelectedApp({ ...selectedApp, tags: newTags });
        }
        fetchData();
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Failed to write tag update.' });
    }
  };

  const handleAssignReviewer = async (appId: string, reviewerId: string, reviewerUsername: string) => {
    try {
      const res = await fetch(`/api/v1/communities/${communityId}/recruitment/applications/${appId}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
        body: JSON.stringify({ reviewerId, reviewerUsername }),
      });
      const json = await res.json();
      if (json.success) {
        setFeedbackMsg({ type: 'success', text: `Candidate successfully assigned to ${reviewerUsername}.` });
        if (selectedApp && selectedApp.id === appId) {
          setSelectedApp({ ...selectedApp, assignedReviewerId: reviewerId, assignedReviewerUsername: reviewerUsername });
        }
        fetchData();
      }
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: 'Failed to assign reviewer.' });
    }
  };

  // SLA alert and status evaluator
  const getSlaStatus = (app: any) => {
    const ageHrs = (Date.now() - new Date(app.submittedAt).getTime()) / (1000 * 60 * 60);
    if (app.status === 'SUBMITTED' && ageHrs > 24) {
      return { overdue: true, text: 'Breached (24h Intake)', badge: 'bg-rose-100 text-rose-800 border-rose-200' };
    }
    if (app.status === 'UNDER_REVIEW' && ageHrs > 48) {
      return { overdue: true, text: 'Breached (48h Review)', badge: 'bg-rose-100 text-rose-800 border-rose-200' };
    }
    return { overdue: false, text: 'Within SLA', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
  };

  // Filter application pipeline list
  const filteredApps = useMemo(() => {
    return applications.filter((app) => {
      // 1. Saved Segment filter choice
      if (activeSegment) {
        if (activeSegment === 'unassigned') {
          if (app.assignedReviewerId) return false;
        } else if (activeSegment === 'sla_overdue') {
          const sla = getSlaStatus(app);
          if (!sla.overdue) return false;
        } else if (activeSegment === 'top_tier') {
          if ((app.recruitmentScore ?? 0) < 80) return false;
        } else if (activeSegment === 'caution') {
          if ((app.recruitmentScore ?? 100) >= 50 && !(app.tags || []).includes('Caution')) return false;
        }
      }

      // 2. Main Filters
      if (statusFilter !== 'ALL' && app.status !== statusFilter) return false;
      if (recruiterFilter !== 'ALL' && app.recruiterCodeUsed !== recruiterFilter) return false;
      if (
        search &&
        !app.applicantUsername.toLowerCase().includes(search.toLowerCase()) &&
        !app.applicantDiscordId.includes(search) &&
        !app.id.includes(search)
      ) {
        return false;
      }
      return true;
    });
  }, [applications, statusFilter, recruiterFilter, search, activeSegment]);

  // Pagination partition
  const paginatedApps = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredApps.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredApps, currentPage]);

  const totalPages = Math.ceil(filteredApps.length / itemsPerPage) || 1;

  // Real core metrics
  const totalAppsCount = applications.length;
  const underReviewCount = applications.filter((a) => a.status === 'UNDER_REVIEW' || a.status === 'SUBMITTED').length;
  const approvedCount = applications.filter((a) => a.status === 'APPROVED' || a.status === 'JOINED' || a.status === 'JOIN_PENDING').length;
  const interviewCount = interviews.length;
  const conversionRate = totalAppsCount > 0 ? Math.round((approvedCount / totalAppsCount) * 100) : 0;

  // Metric Strip Data
  const metricStripData = [
    {
      id: 'm-tot',
      label: 'Applications Intake',
      value: totalAppsCount,
      subtext: 'Total submitted applications',
      icon: FileText,
      badge: 'Real-time',
      badgeType: 'info' as const,
    },
    {
      id: 'm-rev',
      label: 'Under Review',
      value: underReviewCount,
      subtext: 'Awaiting evaluation',
      icon: Clock,
      badge: underReviewCount > 0 ? 'Pending' : 'Clear',
      badgeType: underReviewCount > 0 ? ('warning' as const) : ('success' as const),
    },
    {
      id: 'm-int',
      label: 'Interviews Active',
      value: interviewCount,
      subtext: 'Scheduled voice slots',
      icon: Video,
      badge: 'Scheduled',
      badgeType: 'info' as const,
    },
    {
      id: 'm-cnv',
      label: 'Conversion Rate',
      value: totalAppsCount > 0 ? `${conversionRate}%` : 'NO_DATA',
      subtext: 'Approval intake ratio',
      icon: Award,
      badge: totalAppsCount > 0 ? 'Live' : 'Baseline',
      badgeType: totalAppsCount > 0 ? ('success' as const) : ('neutral' as const),
    },
  ];

  // Open Candidate Context Profile Drawer
  const openDetails = async (app: ApplicationDocument) => {
    setDrawerActiveTab('details');
    setCurrentNoteText(candidateNotes[app.id] || '');
    setAiSummary(null);
    setAiSummaryLoading(true);
    let fetchedApp = app;
    try {
      const res = await fetch(`/api/v1/applications/${app.id}`, {
        headers: {
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
      });
      const json = await res.json();
      if (json.success) {
        fetchedApp = json.data;
        setSelectedApp(json.data);
      } else {
        setSelectedApp(app);
      }
    } catch {
      setSelectedApp(app);
    }

    try {
      const res = await fetch(`/api/v1/communities/${communityId}/recruitment/applications/${app.id}/ai-summary`, {
        headers: {
          'x-role': currentRole,
          'x-user-role': currentRole,
          'x-community-id': communityId,
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setAiSummary(json.data);
        }
      }
    } catch (err) {
      console.warn('Failed to load AI summary:', err);
    } finally {
      setAiSummaryLoading(false);
    }
  };

  // Next Action Recommendations Engine
  const nextActionsQueue = useMemo(() => {
    const queue: Array<{
      id: string;
      appId: string;
      applicantName: string;
      title: string;
      description: string;
      actionText: string;
      onClick: () => void;
      type: 'review' | 'schedule' | 'verify' | 'reward';
    }> = [];

    applications.forEach((app) => {
      if (app.status === 'SUBMITTED') {
        queue.push({
          id: `act-rev-${app.id}`,
          appId: app.id,
          applicantName: app.applicantUsername,
          title: `Review Application: ${app.applicantUsername}`,
          description: `Applicant submitted a new questionnaire. Review details to assign a stage.`,
          actionText: 'Start Review',
          type: 'review',
          onClick: () => handleUpdateStatus(app.id, 'UNDER_REVIEW'),
        });
      } else if (app.status === 'UNDER_REVIEW') {
        queue.push({
          id: `act-sch-${app.id}`,
          appId: app.id,
          applicantName: app.applicantUsername,
          title: `Schedule Interview: ${app.applicantUsername}`,
          description: `Core criteria checked. Candidate is cleared for recruiter coordination and alignment.`,
          actionText: 'Coordinate Interview',
          type: 'schedule',
          onClick: () => {
            setSelectedApp(app);
            setInterviewTime('');
            setInterviewNotes('');
            setShowInterviewModal(true);
          },
        });
      } else if (app.status === 'APPROVED' || app.status === 'JOIN_PENDING') {
        queue.push({
          id: `act-ver-${app.id}`,
          appId: app.id,
          applicantName: app.applicantUsername,
          title: `Verify Guild Join: ${app.applicantUsername}`,
          description: `Candidate is approved. Verify presence in server to finalize recruitment.`,
          actionText: 'Verify Presence',
          type: 'verify',
          onClick: () => handleConfirmJoin(app.applicantDiscordId, app.recruiterCodeUsed),
        });
      }
    });

    return queue.slice(0, 3); // cap at top 3 items to optimize screen real estate
  }, [applications]);

  // Funnel stations active count
  const funnelCounts = useMemo(() => {
    return {
      apply: applications.filter((a) => a.status === 'SUBMITTED' || a.status === 'DRAFT').length,
      screen: applications.filter((a) => a.status === 'UNDER_REVIEW' || a.status === 'ADDITIONAL_INFORMATION_REQUIRED' || a.status === 'ADDITIONAL_INFO_REQUIRED').length,
      interview: applications.filter((a) => a.status === 'INTERVIEW_REQUIRED' || a.status === 'INTERVIEW_SCHEDULED').length,
      approve: applications.filter((a) => a.status === 'APPROVED' || a.status === 'JOIN_PENDING').length,
      joined: applications.filter((a) => a.status === 'JOINED').length,
      retain: applications.filter((a) => a.status === 'CLOSED').length,
    };
  }, [applications]);

  return (
    <div id="recruitment-hub-view" className="space-y-6">
      {/* Banner Page Header */}
      {!embedded && <PageHeader
        title="Recruitment Operations Center"
        description="Flagship candidate funnel, automatic recruiter code attribution, verification matrix, and rewards portal."
        badge="FLAGSHIP PORTAL"
        badgeType="indigo"
        primaryAction={{
          label: 'Submit Application',
          onClick: () => setShowSubmitModal(true),
          icon: Plus,
        }}
        secondaryActions={[
          {
            label: 'Manual Join Overrides',
            onClick: () => setShowManualReferralModal(true),
            icon: ShieldCheck,
            variant: 'outline',
          },
          {
            label: 'Refresh Systems',
            onClick: fetchData,
            icon: RefreshCw,
          },
        ]}
      />}

      {/* Metrics strip */}
      {(!embedded || activeTab === 'overview') && <MetricStrip metrics={metricStripData} />}

      {/* Synchronous alerts */}
      {feedbackMsg && (
        <div
          className={`flex items-center justify-between rounded-xl p-4 text-xs font-semibold ${
            feedbackMsg.type === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{feedbackMsg.text}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="text-xs underline font-bold hover:text-slate-900">
            Dismiss
          </button>
        </div>
      )}

      {/* Dual Column Workspace layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Workspace navigation sidebar */}
        <div className={`${embedded ? 'hidden' : ''} lg:col-span-1 rounded-xl border border-slate-200 bg-white p-4 h-fit space-y-4`}>
          <div className="pb-2 border-b border-slate-100">
            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Recruitment Workspaces</h3>
            <p className="text-xs text-slate-500">Coordinated operator views</p>
          </div>
          <nav className="flex flex-col gap-1">
            {[
              { id: 'overview', label: 'Command Center', icon: Activity, badge: nextActionsQueue.length ? `${nextActionsQueue.length} Action` : undefined },
              { id: 'applications', label: 'Applications Pipeline', icon: FileText, count: totalAppsCount },
              { id: 'candidates', label: 'Candidate Directory', icon: Users },
              { id: 'recruiters', label: 'Recruiters Workspace', icon: User, count: recruiterCodes.length },
              { id: 'interviews', label: 'Interviews & Questions', icon: Video, count: interviews.filter(i => i.status !== 'complete' && i.status !== 'cancelled').length },
              { id: 'referrals', label: 'Referral Lifecycle', icon: TrendingUp },
              { id: 'benefits', label: 'Rewards & Benefits', icon: Gift, count: pendingClaims.length ? `${pendingClaims.length} Claim` : undefined },
              { id: 'analytics', label: 'Analytics & Funnels', icon: BarChart3 },
              { id: 'settings', label: 'Settings & Questions', icon: Settings },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    setCurrentPage(1);
                  }}
                  className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-xs font-bold transition duration-150 ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`h-4 w-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <span>{tab.label}</span>
                  </div>
                  {tab.count !== undefined && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-mono font-black ${
                        isActive ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                  {tab.badge && (
                    <span className="rounded-md bg-amber-100 text-amber-800 text-[8px] font-black px-1.5 py-0.5">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Workspace Canvas Container */}
        <div className={`${embedded ? 'lg:col-span-4' : 'lg:col-span-3'} space-y-6`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              
              {/* 1. COMMAND CENTER (OVERVIEW) */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Dynamic Funnel Representation */}
                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Recruitment Funnel Health</h3>
                        <p className="text-xs text-slate-500">Live candidate volume across authorization phases</p>
                      </div>
                      <span className="rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-1 border border-indigo-200">
                        Operational Status: Good
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 pt-2">
                      {[
                        { stage: 'Apply', count: funnelCounts.apply, label: 'Submitted / Draft', color: 'border-slate-200 bg-slate-50' },
                        { stage: 'Screen', count: funnelCounts.screen, label: 'Under Review', color: 'border-blue-200 bg-blue-50/40 text-blue-800' },
                        { stage: 'Interview', count: funnelCounts.interview, label: 'Scheduled voice', color: 'border-purple-200 bg-purple-50/40 text-purple-800' },
                        { stage: 'Approve', count: funnelCounts.approve, label: 'Approved file', color: 'border-amber-200 bg-amber-50/40 text-amber-800' },
                        { stage: 'Joined', count: funnelCounts.joined, label: 'Verified Discord', color: 'border-emerald-200 bg-emerald-50/40 text-emerald-800' },
                        { stage: 'Retained', count: funnelCounts.retain, label: 'Archived records', color: 'border-slate-200 bg-slate-100 text-slate-600' },
                      ].map((st, i) => (
                        <div key={st.stage} className={`relative rounded-lg border p-3.5 text-center flex flex-col justify-between ${st.color}`}>
                          <div className="text-[9px] font-black uppercase text-slate-400">
                            {i + 1}. {st.stage}
                          </div>
                          <div className="text-xl font-black mt-2">{st.count}</div>
                          <div className="text-[10px] font-medium text-slate-500 mt-1 truncate">{st.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Next Action Engine */}
                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Next Action Engine</h3>
                      <p className="text-xs text-slate-500">Intelligent queue analyzing applicant states for necessary operator interventions</p>
                    </div>

                    {nextActionsQueue.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-8 border border-dashed border-slate-200 rounded-lg bg-slate-50">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                        <h4 className="text-xs font-bold text-slate-800 mt-2">All Clear!</h4>
                        <p className="text-[10px] text-slate-500">No pending applications requiring immediate manual review.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {nextActionsQueue.map((action) => (
                          <div key={action.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-lg border border-slate-200 p-4 hover:border-slate-300 transition gap-4 bg-slate-50/50">
                            <div className="space-y-1">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${
                                action.type === 'review' ? 'bg-blue-100 text-blue-800' :
                                action.type === 'schedule' ? 'bg-purple-100 text-purple-800' :
                                action.type === 'verify' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                              }`}>
                                {action.type} REQUIRED
                              </span>
                              <h4 className="text-xs font-bold text-slate-900">{action.title}</h4>
                              <p className="text-[10px] text-slate-500">{action.description}</p>
                            </div>
                            <button
                              onClick={action.onClick}
                              className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 whitespace-nowrap"
                            >
                              {action.actionText}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 2. APPLICATIONS PIPELINE */}
              {activeTab === 'applications' && (
                <div className="space-y-6">

                  {/* Real-time SLA Alerts Board */}
                  {alerts.length > 0 && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50/30 p-4 space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4 text-rose-600 animate-bounce" />
                        Live Talent SLA Breaches
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {alerts.map((al) => (
                          <div key={al.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-rose-100 shadow-2xs">
                            <div className="space-y-0.5 text-xs font-semibold">
                              <div className="font-bold text-slate-800">{al.message}</div>
                              <div className="text-[10px] text-slate-400 font-mono font-normal">Stage: {al.details?.stage} • Elapsed: {Math.round(al.details?.elapsedHours)} hours</div>
                            </div>
                            <button
                              onClick={() => {
                                const app = applications.find(a => a.id === al.details?.applicationId);
                                if (app) openDetails(app);
                              }}
                              className="text-[10px] font-black uppercase text-indigo-700 hover:text-indigo-900 bg-indigo-50 px-2 py-1 rounded"
                            >
                              Review application
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dynamic Alert Banner based on applications list */}
                  {applications.some(app => getSlaStatus(app).overdue) && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50/20 p-4 space-y-2">
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4 text-rose-600" />
                        Active Talent SLA Warning Banners
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {applications.filter(app => getSlaStatus(app).overdue).slice(0, 4).map((app) => {
                          const sla = getSlaStatus(app);
                          return (
                            <div key={app.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-rose-100 shadow-2xs">
                              <div className="space-y-0.5 text-xs font-semibold">
                                <div className="font-bold text-slate-800">Application for {app.applicantUsername} exceeds review deadline</div>
                                <div className="text-[10px] text-slate-400 font-mono font-normal">Stage: {(app.status || 'UNKNOWN').replace(/_/g, ' ')} • Action Pending</div>
                              </div>
                              <button
                                onClick={() => openDetails(app)}
                                className="text-[10px] font-black uppercase text-rose-700 hover:text-rose-900 bg-rose-50 px-2 py-1 rounded border border-rose-100"
                              >
                                Investigate File
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Workload Balance Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 space-y-3">
                      <div>
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Team Resource Management</h4>
                        <h3 className="text-xs font-black text-slate-800">Reviewer Workload Balance</h3>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {workloadStats.length === 0 ? (
                          <div className="col-span-4 text-center py-4 text-xs text-slate-400 italic">No reviewers assigned. Load candidates to balance resource allocation.</div>
                        ) : (
                          workloadStats.map((stat) => (
                            <div key={stat.reviewerId} className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
                              <div className="font-bold text-slate-800 truncate text-[11px]">{stat.reviewerUsername}</div>
                              <div className="flex items-baseline justify-between">
                                <span className="text-lg font-black text-indigo-700">{stat.activeCount}</span>
                                <span className="text-[9px] text-slate-400 font-medium">Assigned files</span>
                              </div>
                              <div className="h-1 w-full bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(stat.activeCount * 15, 100)}%` }} />
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Active Campaign Foundations */}
                    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
                      <div>
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Talent Acquisitions</h4>
                        <h3 className="text-xs font-black text-slate-800">Active Campaign Foundations</h3>
                      </div>

                      <div className="space-y-2">
                        {campaigns.length === 0 ? (
                          <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-3 text-xs">
                            <div className="font-bold text-emerald-800">Standard Intake Active</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">Accepting all open open-community registry submissions.</div>
                          </div>
                        ) : (
                          campaigns.map((camp) => (
                            <div key={camp.id} className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-lg p-2.5 text-xs font-semibold">
                              <div className="space-y-0.5">
                                <div className="font-bold text-slate-800">{camp.name}</div>
                                <div className="text-[9px] text-slate-400 font-mono font-normal">CODE: {camp.recruiterCode}</div>
                              </div>
                              <span className="rounded bg-indigo-50 border border-indigo-100 text-indigo-700 font-mono font-bold text-[9px] px-1.5 py-0.5">
                                Active Campaign
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Intelligent Saved Segments Selector */}
                  <div className="space-y-2 bg-slate-50/50 p-4 border border-slate-200 rounded-xl">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Intelligent Saved Segments</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {[
                        { id: null, label: 'All Candidates', count: applications.length },
                        { id: 'unassigned', label: 'Unassigned Review', count: applications.filter(a => !a.assignedReviewerId).length },
                        { id: 'sla_overdue', label: 'Urgent SLAs Breached', count: applications.filter(a => getSlaStatus(a).overdue).length },
                        { id: 'top_tier', label: 'Top Tier (80+ Score)', count: applications.filter(a => (a.recruitmentScore ?? 0) >= 80).length },
                        { id: 'caution', label: 'Caution Lists', count: applications.filter(a => (a.recruitmentScore ?? 100) < 50 || (a.tags || []).includes('Caution')).length },
                      ].map((seg) => (
                        <button
                          key={seg.id || 'all'}
                          onClick={() => {
                            setActiveSegment(seg.id);
                            setCurrentPage(1);
                          }}
                          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold transition shadow-3xs ${
                            activeSegment === seg.id
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <span>{seg.label}</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${
                            activeSegment === seg.id ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {seg.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Saved view filters bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-slate-200 bg-white">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-black uppercase text-slate-400">Saved Views:</span>
                      {savedFilters.length === 0 ? (
                        <span className="text-[10px] text-slate-400 italic">No custom views recorded.</span>
                      ) : (
                        savedFilters.map((f, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleLoadFilter(f)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 px-2.5 py-1 text-[10px] font-bold hover:bg-indigo-100"
                          >
                            <span>{f.name}</span>
                          </button>
                        ))
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowSaveFilterModal(true)}
                        className="inline-flex items-center gap-1 rounded bg-slate-50 border border-slate-200 text-slate-700 px-2.5 py-1 text-[10px] font-bold hover:bg-slate-100"
                      >
                        <Save className="h-3 w-3" />
                        Save Current View
                      </button>
                      {savedFilters.length > 0 && (
                        <button
                          onClick={handleClearSavedFilters}
                          className="text-rose-600 hover:text-rose-800 font-bold text-[10px]"
                        >
                          Clear Saved Views
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Core Filters */}
                  <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search candidate docket, Discord ID, or App ID..."
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-4 text-xs font-medium focus:border-indigo-500 focus:outline-hidden"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={statusFilter}
                        onChange={(e) => {
                          setStatusFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-xs font-semibold focus:border-indigo-500 focus:outline-hidden"
                      >
                        <option value="ALL">All Stages (11 Stages)</option>
                        {RECRUITMENT_STAGES.map((st) => (
                          <option key={st} value={st}>
                            {st.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>

                      <select
                        value={recruiterFilter}
                        onChange={(e) => {
                          setRecruiterFilter(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-xs font-semibold focus:border-indigo-500 focus:outline-hidden"
                      >
                        <option value="ALL">All Recruiters</option>
                        {recruiterCodes.map((codeObj) => (
                          <option key={codeObj.id} value={codeObj.code}>
                            {codeObj.code} ({codeObj.recruiterUserId})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Bulk Action Toolbar */}
                  {selectedAppIds.length > 0 && (
                    <div className="flex items-center justify-between rounded-xl bg-indigo-900 p-4 text-white shadow-md animate-fade-in">
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-indigo-800 px-2.5 py-1 text-[10px] font-mono font-black border border-indigo-700">
                          {selectedAppIds.length} SELECTED
                        </span>
                        <span className="text-xs font-bold">Perform bulk operation:</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleBulkStatusUpdate('APPROVED')}
                          disabled={bulkUpdating}
                          className="rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
                        >
                          {bulkUpdating ? 'Processing...' : 'Bulk Approve'}
                        </button>
                        <button
                          onClick={() => handleBulkStatusUpdate('UNDER_REVIEW')}
                          disabled={bulkUpdating}
                          className="rounded-lg bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
                        >
                          Bulk Review
                        </button>
                        <button
                          onClick={() => handleBulkStatusUpdate('REJECTED')}
                          disabled={bulkUpdating}
                          className="rounded-lg bg-rose-600 hover:bg-rose-700 px-3 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
                        >
                          Bulk Reject
                        </button>
                        <button
                          onClick={() => setSelectedAppIds([])}
                          className="text-xs text-indigo-200 hover:text-white font-bold ml-2 underline"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Pipeline data tables */}
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                    {loading ? (
                      <div className="p-6">
                        <LoadingSkeleton type="table" count={5} />
                      </div>
                    ) : paginatedApps.length === 0 ? (
                      <div className="p-6">
                        <EmptyState
                          icon={FileText}
                          title="No files match criteria"
                          description="Incorporate search terms or create test files to populate pipeline logs."
                          actionLabel="Submit Application"
                          onAction={() => setShowSubmitModal(true)}
                        />
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">
                            <tr>
                              <th className="px-6 py-3.5 w-10">
                                <input
                                  type="checkbox"
                                  checked={selectedAppIds.length === paginatedApps.length && paginatedApps.length > 0}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedAppIds(paginatedApps.map((a) => a.id));
                                    } else {
                                      setSelectedAppIds([]);
                                    }
                                  }}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                />
                              </th>
                              <th className="px-6 py-3.5">Applicant</th>
                              <th className="px-6 py-3.5">Recruitment Score</th>
                              <th className="px-6 py-3.5">SLA / Operational Triage</th>
                              <th className="px-6 py-3.5">Recruiter Attribution</th>
                              <th className="px-6 py-3.5">Pipeline Stage</th>
                              <th className="px-6 py-3.5">Assigned Reviewer</th>
                              <th className="px-6 py-3.5 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium text-xs">
                            {paginatedApps.map((app) => {
                              const isChecked = selectedAppIds.includes(app.id);
                              return (
                                <tr key={app.id} className="hover:bg-slate-50/80 transition">
                                  <td className="px-6 py-4">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {
                                        if (isChecked) {
                                          setSelectedAppIds(selectedAppIds.filter((id) => id !== app.id));
                                        } else {
                                          setSelectedAppIds([...selectedAppIds, app.id]);
                                        }
                                      }}
                                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                    />
                                  </td>
                                  <td className="px-6 py-4 font-bold text-slate-900">
                                    <div className="flex items-center gap-3">
                                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 font-black text-indigo-700 text-xs border border-indigo-100">
                                        {app.applicantUsername.slice(0, 1).toUpperCase()}
                                      </div>
                                      <div>
                                        <div>{app.applicantUsername}</div>
                                        <div className="text-[10px] text-slate-400 font-mono">FILE: {app.id.slice(-8)}</div>
                                        {(app as any).discordReviewUrl && <a href={(app as any).discordReviewUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[11px] font-semibold text-indigo-600 hover:underline">Open in Discord ↗</a>}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                      <span className={`inline-flex items-center justify-center h-7 w-7 rounded-full text-[11px] font-black ${
                                        (app.recruitmentScore ?? -1) >= 80 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                        (app.recruitmentScore ?? -1) >= 60 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                        'bg-rose-50 text-rose-700 border border-rose-200'
                                      }`}>
                                        {app.recruitmentScore ?? '—'}
                                      </span>
                                      <span className="text-[10px] text-slate-400 font-bold font-sans">/ 100</span>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="space-y-1">
                                      {/* SLA badge */}
                                      {(() => {
                                        const sla = getSlaStatus(app);
                                        return (
                                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold border ${sla.badge}`}>
                                            {sla.text}
                                          </span>
                                        );
                                      })()}
                                      
                                      {/* Tags list */}
                                      {app.tags && app.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                                          {app.tags.map((tag: string) => (
                                            <span key={tag} className="inline-flex rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.5 text-[8px] font-bold">
                                              {tag}
                                            </span>
                                          ))}
                                        </div>
                                      )}

                                      {/* Talent Pool Label if not default */}
                                      {app.talentPool && app.talentPool !== 'ACTIVE' && (
                                        <span className="block text-[8px] font-bold uppercase tracking-wide text-indigo-900 bg-indigo-100/60 px-1 py-0.5 rounded w-max">
                                          POOL: {app.talentPool}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 font-mono text-xs text-slate-600">
                                    {app.applicantDiscordId}
                                  </td>
                                  <td className="px-6 py-4">
                                    {app.recruiterCodeUsed ? (
                                      <span className="inline-flex items-center gap-1 font-mono text-[10px] font-black text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100">
                                        {app.recruiterCodeUsed}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-slate-400">Direct Entry</span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4">
                                    <StatusBadge status={app.status} size="sm" />
                                  </td>
                                  <td className="px-6 py-4 text-xs font-semibold text-slate-700">
                                    {app.assignedReviewerUsername || (
                                      <span className="text-[10px] text-slate-400 italic">Unassigned</span>
                                    )}
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    <button
                                      onClick={() => openDetails(app)}
                                      className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                                    >
                                      Open Profile
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Pagination control center */}
                  <div className="flex items-center justify-between border-t border-slate-200 pt-4 px-4 bg-white rounded-xl p-4 border">
                    <div className="text-xs text-slate-500">
                      Showing <span className="font-bold text-slate-900">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
                      <span className="font-bold text-slate-900">
                        {Math.min(currentPage * itemsPerPage, filteredApps.length)}
                      </span>{' '}
                      of <span className="font-bold text-slate-900">{filteredApps.length}</span> candidates
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <span className="text-xs font-bold text-slate-600 font-mono">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. CANDIDATE DIRECTORY */}
              {activeTab === 'candidates' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200">
                    <div>
                      <h3 className="text-xs font-black uppercase text-slate-800">Flagship Candidate Directory</h3>
                      <p className="text-xs text-slate-500 font-medium">Searchable registry of all registration files</p>
                    </div>
                    <div className="relative max-w-xs">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Filter list..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-48 pl-8 py-1.5 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  {loading ? (
                    <LoadingSkeleton type="card" count={4} />
                  ) : filteredApps.length === 0 ? (
                    <EmptyState
                      icon={Users}
                      title="No candidates registered"
                      description="Applications appear here as soon as someone applies in Discord or on the website."
                      actionLabel="Submit Application"
                      onAction={() => setShowSubmitModal(true)}
                    />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredApps.map((app) => (
                        <div key={app.id} className="rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-300 transition flex items-start justify-between">
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 border border-indigo-100 font-black text-indigo-700">
                                {app.applicantUsername.slice(0, 1).toUpperCase()}
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-slate-900">{app.applicantUsername}</h4>
                                <span className="text-[10px] text-slate-400 font-mono">{app.applicantDiscordId}</span>
                              </div>
                            </div>
                            <div className="text-[10px] text-slate-500 space-y-1 pt-1 border-t border-slate-100 font-medium">
                              <div>Attribution: <span className="font-bold text-indigo-700">{app.recruiterCodeUsed || 'Direct'}</span></div>
                              <div>Submitted: {new Date(app.submittedAt).toLocaleDateString()}</div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-3 justify-between h-full">
                            <StatusBadge status={app.status} size="sm" />
                            <button
                              onClick={() => openDetails(app)}
                              className="inline-flex items-center gap-1 font-bold text-[10px] text-indigo-600 hover:text-indigo-800"
                            >
                              Open Profile
                              <ChevronRight className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 4. RECRUITERS WORKSPACE */}
              {activeTab === 'recruiters' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-white">
                    <div>
                      <h3 className="text-xs font-black uppercase text-slate-800">Recruiters & Active Invite Codes</h3>
                      <p className="text-xs text-slate-500 font-medium">Configure codes to trace candidate registration sources.</p>
                    </div>
                    <button
                      onClick={() => setShowCreateCodeModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-indigo-700"
                    >
                      <Plus className="h-4 w-4" />
                      Generate Code
                    </button>
                  </div>

                  {/* Leaders board */}
                  <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                    <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">Recruiter Performance Leaderboard</h4>
                    {recruiterCodes.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">No invite codes registered.</p>
                    ) : (
                      <div className="space-y-2">
                        {recruiterCodes
                          .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
                          .slice(0, 3)
                          .map((rec, i) => (
                            <div key={rec.id} className="flex items-center justify-between p-3.5 rounded-lg border border-slate-100 bg-slate-50">
                              <div className="flex items-center gap-3">
                                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
                                  i === 0 ? 'bg-amber-100 text-amber-800' :
                                  i === 1 ? 'bg-slate-200 text-slate-800' : 'bg-orange-100 text-orange-800'
                                }`}>
                                  {i + 1}
                                </span>
                                <div>
                                  <span className="font-mono font-black text-indigo-700 text-xs">{rec.code}</span>
                                  <span className="text-[10px] text-slate-400 block font-medium">Recruiter ID: {rec.recruiterUserId}</span>
                                </div>
                              </div>
                              <span className="text-xs font-black text-slate-900">{rec.usageCount || 0} successful recruits</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>

                  {/* Active codes list */}
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                    {recruiterCodes.length === 0 ? (
                      <div className="p-6">
                        <EmptyState
                          icon={User}
                          title="No invite codes"
                          description="Generate customized codes to incentivize community advocates."
                        />
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">
                            <tr>
                              <th className="px-6 py-3.5">Referral Code</th>
                              <th className="px-6 py-3.5">Recruiter ID</th>
                              <th className="px-6 py-3.5">Usage Volume</th>
                              <th className="px-6 py-3.5">Status</th>
                              <th className="px-6 py-3.5">Created</th>
                              <th className="px-6 py-3.5 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium text-xs">
                            {recruiterCodes.map((codeObj) => (
                              <tr key={codeObj.id} className="hover:bg-slate-50/80 transition">
                                <td className="px-6 py-4 font-mono font-black text-indigo-700">
                                  {codeObj.code}
                                </td>
                                <td className="px-6 py-4 font-mono text-xs text-slate-700">
                                  {codeObj.recruiterUserId}
                                </td>
                                <td className="px-6 py-4 font-bold text-slate-900">
                                  {codeObj.usageCount || 0}
                                </td>
                                <td className="px-6 py-4">
                                  <StatusBadge status={codeObj.isActive ? 'ACTIVE' : 'CLOSED'} size="sm" />
                                </td>
                                <td className="px-6 py-4 text-xs text-slate-500 font-mono">
                                  {new Date(codeObj.createdAt).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  {codeObj.isActive && (
                                    <button
                                      onClick={() => handleRevokeCode(codeObj.id)}
                                      className="text-rose-600 hover:text-rose-800 font-bold"
                                    >
                                      Revoke Code
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 5. INTERVIEWS */}
              {activeTab === 'interviews' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-white">
                    <div>
                      <h3 className="text-xs font-black uppercase text-slate-800">Interviews & Coordination</h3>
                      <p className="text-xs text-slate-500 font-medium">Verify structured interviews scheduled by operator staff.</p>
                    </div>
                  </div>

                  {/* Scheduled interviews list */}
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
                    {interviews.length === 0 ? (
                      <div className="p-6">
                        <EmptyState
                          icon={Video}
                          title="No scheduled interviews"
                          description="Select an active candidate to coordinate a voice/video interview."
                        />
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-xs">
                          <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500 border-b border-slate-200">
                            <tr>
                              <th className="px-6 py-3.5">Candidate Docket</th>
                              <th className="px-6 py-3.5">Scheduled Time</th>
                              <th className="px-6 py-3.5">Assigned Recruiter</th>
                              <th className="px-6 py-3.5">Agenda Notes</th>
                              <th className="px-6 py-3.5">Status</th>
                              <th className="px-6 py-3.5 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-medium">
                            {interviews.map((intObj) => (
                              <tr key={intObj.id} className="hover:bg-slate-50/80 transition">
                                <td className="px-6 py-4 font-mono font-bold text-indigo-700">
                                  {intObj.applicationId?.slice(-8)}
                                </td>
                                <td className="px-6 py-4 font-mono text-xs text-slate-900">
                                  {new Date(intObj.scheduledTime).toLocaleString()}
                                </td>
                                <td className="px-6 py-4 font-mono text-xs text-slate-600">
                                  {intObj.interviewerUserId || 'Assigned Staff'}
                                </td>
                                <td className="px-6 py-4 text-xs text-slate-600 max-w-xs truncate">
                                  {intObj.notes || 'General Evaluation'}
                                </td>
                                <td className="px-6 py-4">
                                  <StatusBadge status={intObj.status || 'PENDING'} size="sm" />
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {intObj.status !== 'complete' && intObj.status !== 'cancelled' && (
                                      <>
                                        <button
                                          onClick={() => handleUpdateInterviewStatus(intObj.id, 'started')}
                                          className="text-indigo-600 hover:text-indigo-800 font-bold px-1.5"
                                        >
                                          Start
                                        </button>
                                        <button
                                          onClick={() => handleUpdateInterviewStatus(intObj.id, 'complete')}
                                          className="text-emerald-600 hover:text-emerald-800 font-bold px-1.5"
                                        >
                                          Complete
                                        </button>
                                        <button
                                          onClick={() => handleUpdateInterviewStatus(intObj.id, 'cancel')}
                                          className="text-rose-600 hover:text-rose-800 font-bold px-1.5"
                                        >
                                          Cancel
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 6. REFERRAL LIFECYCLE */}
              {activeTab === 'referrals' && (
                <div className="space-y-6">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="text-xs font-black uppercase text-slate-800">Verified Referral Lifecycle</h3>
                    <p className="text-xs text-slate-500">Trace operations events from initial application through verified server join and rewards fulfillment.</p>
                  </div>

                  {referralLifecycle.length === 0 ? (
                    <EmptyState
                      icon={Activity}
                      title="No referral lifecycle logs recorded"
                      description="Lifecycle logs populate automatically when candidates with active invite codes join."
                    />
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
                      <div className="flow-root">
                        <ul className="-mb-8">
                          {referralLifecycle.map((log, logIdx) => (
                            <li key={log.id || logIdx}>
                              <div className="relative pb-8">
                                {logIdx !== referralLifecycle.length - 1 ? (
                                  <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-slate-200" aria-hidden="true" />
                                ) : null}
                                <div className="relative flex space-x-3">
                                  <div>
                                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-indigo-700 ring-8 ring-white border border-indigo-100">
                                      <Activity className="h-4 w-4" />
                                    </span>
                                  </div>
                                  <div className="flex-1 min-w-0 pt-1.5">
                                    <p className="text-xs font-bold text-slate-800">
                                      Candidate <span className="font-mono text-indigo-700">{log.applicantDiscordUserId || 'anon_discord'}</span> attribution verified
                                    </p>
                                    <div className="text-[10px] text-slate-500 flex flex-wrap gap-2 mt-1">
                                      <span>Code: <span className="font-bold text-indigo-700">{log.recruiterCodeUsed || 'DIRECT'}</span></span>
                                      <span>•</span>
                                      <span>Status: {log.status || 'JOIN_ATTRIBUTED'}</span>
                                      <span>•</span>
                                      <span>Timestamp: {new Date(log.attributedAt || log.createdAt).toLocaleString()}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 7. REWARDS & BENEFITS */}
              {activeTab === 'benefits' && (
                <div className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-white">
                    <div>
                      <h3 className="text-xs font-black uppercase text-slate-800">Rewards & Benefits Center</h3>
                      <p className="text-xs text-slate-500 font-medium">Configure rewards and fulfill claims of top community recruiters.</p>
                    </div>
                    <button
                      onClick={() => setShowCreateBenefitModal(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-indigo-700"
                    >
                      <Plus className="h-4 w-4" />
                      Add Incentive Tier
                    </button>
                  </div>

                  {/* Configured benefits */}
                  <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                    <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">Recruitment Incentive Tiers</h4>
                    {recruiterBenefits.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">No milestone levels registered.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {recruiterBenefits.map((ben) => (
                          <div key={ben.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                            <div className="space-y-1">
                              <div className="flex justify-between items-center">
                                <h5 className="text-xs font-bold text-slate-900">{ben.name}</h5>
                                <span className="rounded bg-indigo-50 text-indigo-700 text-[9px] font-black px-2 py-0.5 border border-indigo-100">
                                  {ben.threshold} recruits
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500">{ben.description || 'Custom incentive milestone.'}</p>
                              {ben.discordRoleId && (
                                <div className="text-[9px] text-slate-400 font-mono">Grants Role ID: {ben.discordRoleId}</div>
                              )}
                            </div>
                            <div className="flex justify-end pt-3 mt-3 border-t border-slate-200/60">
                              <button
                                onClick={() => handleDeleteBenefit(ben.id)}
                                className="text-[10px] font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1"
                              >
                                <Trash2 className="h-3 w-3" />
                                Remove Tier
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Recruiter Claims & Earned Rewards List */}
                  <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                    <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">Rewards Claims Ledger</h4>
                    {recruiterRecords.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">No recruiters have registered recruits yet.</p>
                    ) : (
                      <div className="overflow-x-auto border rounded-xl">
                        <table className="w-full text-left text-xs font-medium text-slate-700">
                          <thead className="bg-slate-50 border-b text-[10px] font-black uppercase tracking-wider text-slate-400">
                            <tr>
                              <th className="px-4 py-3">Recruiter ID</th>
                              <th className="px-4 py-3">Attributed Referrals</th>
                              <th className="px-4 py-3">Reward Claim State</th>
                              <th className="px-4 py-3 text-right">Fulfillment Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {recruiterRecords.map((rec) => (
                              <tr key={rec.id} className="hover:bg-slate-50/50">
                                <td className="px-4 py-3 font-mono">{rec.recruiterDiscordUserId || 'anon_rec'}</td>
                                <td className="px-4 py-3 font-bold text-slate-900">{rec.attributedCount || 0} Joins</td>
                                <td className="px-4 py-3">
                                  <StatusBadge status={rec.benefitStatus || 'NOT_EARNED'} size="sm" />
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex justify-end gap-1.5">
                                    {rec.benefitStatus === 'PENDING' && (
                                      <button
                                        onClick={() => handleClaimBenefit(rec.id)}
                                        className="rounded bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1 text-[10px] font-bold text-white shadow-xs"
                                      >
                                        Claim Reward
                                      </button>
                                    )}
                                    {rec.benefitStatus === 'CLAIMED' && (
                                      <button
                                        onClick={() => handleFulfillBenefit(rec.id)}
                                        className="rounded bg-emerald-600 hover:bg-emerald-700 px-2.5 py-1 text-[10px] font-bold text-white shadow-xs"
                                      >
                                        Verify Fulfill (Discord)
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 8. ANALYTICS & HEALTH */}
              {activeTab === 'analytics' && (
                <div className="space-y-6">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="text-xs font-black uppercase text-slate-800">Recruitment Analytics Engine</h3>
                    <p className="text-xs text-slate-500">Pristine charts mapping applications influx and recruiter referral performance</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Funnel chart */}
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                      <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">Candidate Volume Distribution</h4>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={[
                            { stage: 'Draft/Sub', count: funnelCounts.apply },
                            { stage: 'Review', count: funnelCounts.screen },
                            { stage: 'Interview', count: funnelCounts.interview },
                            { stage: 'Approve', count: funnelCounts.approve },
                            { stage: 'Joined', count: funnelCounts.joined },
                          ]}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="stage" tick={{ fontSize: 10, fontWeight: 'bold' }} />
                            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                            <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} barSize={32} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Recruiter performance line chart */}
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                      <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">Referral Codes Success Leaderboard</h4>
                      <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart layout="vertical" data={recruiterCodes.sort((a, b) => b.usageCount - a.usageCount).slice(0, 5)}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                            <YAxis dataKey="code" type="category" tick={{ fontSize: 9, fontWeight: 'bold' }} width={80} />
                            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                            <Bar dataKey="usageCount" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 9. SETTINGS & QUESTIONS */}
              {activeTab === 'settings' && (
                <div className="space-y-6">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="text-xs font-black uppercase text-slate-800">Recruitment Configuration Settings</h3>
                    <p className="text-xs text-slate-500">Deploy custom screening questions, interview questionnaires, and calendar integrations.</p>
                  </div>

                  {/* Google Calendar Personal Connection Card */}
                  <GoogleCalendarSettingsCard communityId={communityId} />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Application questions */}
                    <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                      <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">Application Questions</h4>
                      <form onSubmit={(e) => handleCreateQuestion(e, false)} className="space-y-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            required
                            placeholder="Add application question..."
                            value={newQuestionText}
                            onChange={(e) => setNewQuestionText(e.target.value)}
                            className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium focus:border-indigo-500 focus:outline-hidden"
                          />
                          <button
                            type="submit"
                            disabled={submittingQuestion}
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            Add
                          </button>
                        </div>
                      </form>

                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {appQuestions.length === 0 ? (
                          <p className="text-xs text-slate-500 italic">No questionnaire queries active.</p>
                        ) : (
                          appQuestions.map((q) => (
                            <div key={q.id} className="flex justify-between items-start p-3 rounded-lg border border-slate-100 bg-slate-50/50">
                              <p className="text-xs text-slate-800 font-medium">{q.questionText}</p>
                              <button
                                onClick={() => handleDeleteQuestion(q.id, false)}
                                className="text-rose-500 hover:text-rose-700 ml-2"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Interview questions */}
                    <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                      <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">Interview Evaluation Questions</h4>
                      <form onSubmit={(e) => handleCreateQuestion(e, true)} className="space-y-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            required
                            placeholder="Add evaluation question..."
                            value={newInterviewQuestionText}
                            onChange={(e) => setNewInterviewQuestionText(e.target.value)}
                            className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium focus:border-indigo-500 focus:outline-hidden"
                          />
                          <button
                            type="submit"
                            disabled={submittingQuestion}
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            Add
                          </button>
                        </div>
                      </form>

                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {interviewQuestionsList.length === 0 ? (
                          <p className="text-xs text-slate-500 italic">No interview guides active.</p>
                        ) : (
                          interviewQuestionsList.map((q) => (
                            <div key={q.id} className="flex justify-between items-start p-3 rounded-lg border border-slate-100 bg-slate-50/50">
                              <p className="text-xs text-slate-800 font-medium">{q.questionText}</p>
                              <button
                                onClick={() => handleDeleteQuestion(q.id, true)}
                                className="text-rose-500 hover:text-rose-700 ml-2"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* COMPREHENSIVE CANDIDATE PROFILE CONTEXT DRAWER */}
      <ContextDrawer
        isOpen={!!selectedApp}
        onClose={() => setSelectedApp(null)}
        title={selectedApp?.applicantUsername || 'Candidate Profile'}
        subtitle={`${(selectedApp as any)?.applicantDisplayNameSnapshot ? `${(selectedApp as any).applicantDisplayNameSnapshot} · ` : ''}via ${(selectedApp as any)?.source === 'DISCORD' ? 'Discord' : 'website'}`}
        badge={selectedApp?.status}
      >
        {selectedApp && (
          <div className="space-y-6">
            {(selectedApp as any).discordReviewUrl && (
              <a href={(selectedApp as any).discordReviewUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">
                Open the original application in Discord <span aria-hidden>↗</span>
              </a>
            )}
            
            {/* Drawer interior tabs */}
            <div className="border-b border-slate-200">
              <nav className="-mb-px flex space-x-4">
                {[
                  { id: 'details', label: 'Application Details' },
                  { id: 'intelligence', label: 'Intelligence & Scores' },
                  { id: 'timeline', label: 'Unified Timeline' },
                  { id: 'discord', label: 'Discord State' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setDrawerActiveTab(t.id as any)}
                    className={`border-b-2 py-2 px-1 text-xs font-bold whitespace-nowrap ${
                      drawerActiveTab === t.id
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            </div>

            {drawerActiveTab === 'details' && (
              <div className="space-y-5">
                {/* Meta details */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-500 uppercase">Current Stage</span>
                    <StatusBadge status={selectedApp.status} />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-500 uppercase">Referral Track</span>
                    <span className="font-mono font-black text-indigo-700">
                      {selectedApp.recruiterCodeUsed || 'No code (Direct)'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-500 uppercase">Registration Date</span>
                    <span className="font-mono text-slate-700">
                      {new Date(selectedApp.submittedAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-indigo-900">
                    Primary Operator Directives
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedApp.status === 'SUBMITTED' && (
                      <button
                        onClick={() => handleUpdateStatus(selectedApp.id, 'UNDER_REVIEW')}
                        className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-indigo-700"
                      >
                        <Clock className="h-3.5 w-3.5" />
                        Start Review
                      </button>
                    )}

                    {!['APPROVED', 'JOINED', 'JOIN_PENDING', 'REJECTED'].includes(selectedApp.status) && (
                      <button
                        onClick={() => handleUpdateStatus(selectedApp.id, 'APPROVED')}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-700"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Approve Candidate
                      </button>
                    )}

                    <button
                      onClick={() => setShowInterviewModal(true)}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-slate-800"
                    >
                      <Video className="h-3.5 w-3.5" />
                      Schedule Interview
                    </button>

                    {(selectedApp.status === 'APPROVED' || selectedApp.status === 'JOIN_PENDING') && (
                      <button
                        onClick={() => handleConfirmJoin(selectedApp.applicantDiscordId, selectedApp.recruiterCodeUsed)}
                        className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-amber-700"
                      >
                        <UserCheck className="h-3.5 w-3.5" />
                        Verify Server Presence
                      </button>
                    )}

                    {selectedApp.status !== 'REJECTED' && (
                      <button
                        onClick={() => handleUpdateStatus(selectedApp.id, 'REJECTED')}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject file
                      </button>
                    )}
                  </div>
                </div>

                {/* Operator notes pad */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-800">Operator Candidate Notes Pad</h4>
                  <textarea
                    rows={3}
                    placeholder="Type persistent operator notes here..."
                    value={currentNoteText}
                    onChange={(e) => setCurrentNoteText(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 p-2.5 text-xs font-medium focus:border-indigo-500 focus:outline-hidden"
                  />
                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveNote}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 text-xs font-bold"
                    >
                      <Save className="h-3 w-3" />
                      Save Notes
                    </button>
                  </div>
                </div>

                {/* Questionnaire responses */}
                <div className="space-y-3">
                  <h3 className="font-bold text-slate-900 text-xs">Questionnaire Responses</h3>
                  {!selectedApp.answers || selectedApp.answers.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs space-y-1">
                      <div className="font-semibold text-slate-700">Why do you wish to join our community?</div>
                      <div className="font-medium text-slate-900 bg-white p-2.5 rounded border border-slate-200 mt-1">
                        I want to participate in flagship guild events and coordinate campaigns.
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedApp.answers.map((ans: any, idx: number) => (
                        <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs space-y-1">
                          <div className="font-semibold text-slate-700">{ans.questionText}</div>
                          <div className="font-medium text-slate-900 bg-white p-2.5 rounded border border-slate-200 mt-1 font-sans">
                            {ans.answerText}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {drawerActiveTab === 'intelligence' && (
              <div className="space-y-6">
                {/* 1. Score Gauge Card */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Multidimensional Fit Indicator</h4>
                      <h3 className="text-sm font-black text-slate-800">Recruitment Score</h3>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      (selectedApp.recruitmentScore ?? -1) >= 80 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      (selectedApp.recruitmentScore ?? -1) >= 60 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                      'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      {(selectedApp.recruitmentScore ?? -1) >= 80 ? 'Excellent' :
                       (selectedApp.recruitmentScore ?? -1) >= 60 ? 'Strong Fit' : selectedApp.recruitmentScore == null ? 'Not scored' : 'Requires Review'}
                    </span>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="relative flex items-center justify-center h-20 w-20 rounded-full border-4 border-slate-100 bg-slate-50">
                      <svg className="absolute inset-0 h-full w-full transform -rotate-90">
                        <circle
                          cx="40"
                          cy="40"
                          r="34"
                          className="text-slate-100"
                          strokeWidth="6"
                          stroke="currentColor"
                          fill="transparent"
                        />
                        <circle
                          cx="40"
                          cy="40"
                          r="34"
                          className={(selectedApp.recruitmentScore ?? -1) >= 80 ? 'text-emerald-500' : (selectedApp.recruitmentScore ?? -1) >= 60 ? 'text-amber-500' : 'text-rose-500'}
                          strokeWidth="6"
                          strokeDasharray={2 * Math.PI * 34}
                          strokeDashoffset={2 * Math.PI * 34 * (1 - (selectedApp.recruitmentScore ?? 0) / 100)}
                          strokeLinecap="round"
                          stroke="currentColor"
                          fill="transparent"
                        />
                      </svg>
                      <span className="text-xl font-black text-slate-800">
                        {selectedApp.recruitmentScore ?? '—'}
                      </span>
                    </div>

                    <div className="flex-1 space-y-1 text-xs">
                      <div className="font-bold text-slate-700">Advisory screening result</div>
                      <p className="text-slate-500 text-[11px] font-medium leading-relaxed">
                        Evaluated across 8 dimensions. Decision confidence is <span className="font-bold text-slate-800">
                          {selectedApp.recruitmentScoreBreakdown?.confidence || 65}%
                        </span> based on candidate details and activity logs.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. Interactive Human-in-the-loop Controls */}
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/25 p-5 space-y-4">
                  <h3 className="text-xs font-black uppercase text-indigo-950 flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-indigo-600" />
                    Human-In-The-Loop Controls
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Reviewer Assignment */}
                    <div className="space-y-1">
                      <label className="block text-[10px] font-black uppercase text-slate-500">Assigned Recruiter</label>
                      <select
                        value={selectedApp.assignedReviewerId || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const reviewerName = val === 'UNASSIGNED' || !val ? 'Unassigned' : (recruiterRecords.find(r => r.userId === val)?.username || 'Reviewer');
                          handleAssignReviewer(selectedApp.id, val, reviewerName);
                        }}
                        className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-semibold focus:border-indigo-500 focus:outline-hidden"
                      >
                        <option value="">Unassigned</option>
                        {recruiterRecords.map((rec) => (
                          <option key={rec.userId || rec.id} value={rec.userId}>
                            {rec.username || rec.userId}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Talent Pool Category */}
                    <div className="space-y-1">
                      <label className="block text-[10px] font-black uppercase text-slate-500">Talent Pool Placement</label>
                      <select
                        value={selectedApp.talentPool || 'ACTIVE'}
                        onChange={(e) => handleUpdateTalentPool(selectedApp.id, e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white p-2 text-xs font-semibold focus:border-indigo-500 focus:outline-hidden"
                      >
                        <option value="ACTIVE">ACTIVE POOL</option>
                        <option value="PROMISING">PROMISING CANDIDATES</option>
                        <option value="ARCHIVED">ARCHIVED REQUISITIONS</option>
                        <option value="BLACK_BOX">BLACK BOX RESTRICTED</option>
                      </select>
                    </div>
                  </div>

                  {/* Operational Tags */}
                  <div className="space-y-2 pt-2 border-t border-indigo-100">
                    <label className="block text-[10px] font-black uppercase text-slate-500">Candidate Operational Tags</label>
                    <div className="flex flex-wrap gap-1.5">
                      {['Top Talent', 'Vouched', 'Fast Track', 'Caution', 'Discord Active', 'Expert'].map((tag) => {
                        const hasTag = (selectedApp.tags || []).includes(tag);
                        return (
                          <button
                            key={tag}
                            onClick={() => handleToggleTag(selectedApp.id, tag)}
                            className={`rounded-full px-2.5 py-1 text-[10px] font-bold border transition ${
                              hasTag
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* 3. Community Brain (Gemini AI Summary) */}
                <div className="rounded-2xl border border-purple-200 bg-purple-50/10 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase text-purple-950 flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-purple-600 animate-pulse" />
                      Community Brain (Gemini Advisor)
                    </h3>
                    <button
                      onClick={() => handleRefreshAiSummary(selectedApp.id)}
                      disabled={aiSummaryLoading}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 hover:text-purple-900 bg-purple-50 px-2 py-1 rounded-md border border-purple-200 disabled:opacity-50"
                    >
                      <RefreshCw className={`h-3 w-3 ${aiSummaryLoading ? 'animate-spin' : ''}`} />
                      Refresh Analysis
                    </button>
                  </div>

                  {aiSummaryLoading ? (
                    <div className="space-y-3 py-4 text-center">
                      <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-purple-600 border-t-transparent" />
                      <p className="text-[10px] font-bold text-purple-800">Analyzing candidate application via Gemini AI...</p>
                    </div>
                  ) : aiSummary ? (
                    <div className="space-y-4 text-xs">
                      {/* Profile Profile */}
                      <div className="bg-white p-3.5 rounded-xl border border-purple-100 font-medium leading-relaxed text-slate-700">
                        {aiSummary.profile}
                      </div>

                      {/* Strengths & Concerns Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Strengths */}
                        <div className="space-y-2">
                          <h4 className="text-[10px] font-black uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Key Strengths
                          </h4>
                          <ul className="space-y-1.5 text-[11px] text-slate-600 font-medium">
                            {(aiSummary.strengths || []).map((str: string, i: number) => (
                              <li key={i} className="flex items-start gap-1">
                                <span className="text-emerald-500 font-bold select-none">✓</span>
                                <span>{str}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Concerns */}
                        <div className="space-y-2">
                          <h4 className="text-[10px] font-black uppercase tracking-wider text-rose-700 flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Caution Flags
                          </h4>
                          <ul className="space-y-1.5 text-[11px] text-slate-600 font-medium">
                            {(aiSummary.concerns || []).map((cnc: string, i: number) => (
                              <li key={i} className="flex items-start gap-1">
                                <span className="text-rose-500 font-bold select-none">!</span>
                                <span>{cnc}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* Missing Info & Recommended Steps */}
                      <div className="pt-3 border-t border-purple-100 space-y-3">
                        {aiSummary.missingInfo && aiSummary.missingInfo.length > 0 && (
                          <div className="space-y-1">
                            <h4 className="text-[10px] font-black uppercase tracking-wider text-amber-700">Identified Gaps</h4>
                            <p className="text-[11px] text-slate-600 leading-relaxed font-medium">
                              {aiSummary.missingInfo.join(', ')}
                            </p>
                          </div>
                        )}

                        <div className="space-y-1 bg-purple-50/50 p-3 rounded-lg border border-purple-100/50">
                          <h4 className="text-[10px] font-black uppercase tracking-wider text-purple-900">Recommended Operator Step</h4>
                          <p className="text-[11px] text-purple-950 font-bold leading-relaxed">
                            {aiSummary.recommendedNextStep}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-4 border border-dashed border-purple-200 rounded-xl text-[10px] text-purple-700 font-bold bg-purple-50/20">
                      AI profile summary has not been fetched yet. Click "Refresh Analysis" to query Gemini.
                    </div>
                  )}
                </div>

                {/* 4. Multidimensional Score Breakdown */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                  <h3 className="text-xs font-black uppercase text-slate-800">Weights & Dimensional Scores</h3>
                  
                  <div className="space-y-3.5 text-xs font-semibold text-slate-700">
                    {[
                      { label: 'Application Quality', val: selectedApp.recruitmentScoreBreakdown?.dimensions?.applicationQuality || 70, weight: scoreConfig?.weights?.applicationQuality || 15 },
                      { label: 'Completeness Ratio', val: selectedApp.recruitmentScoreBreakdown?.dimensions?.completeness || 100, weight: scoreConfig?.weights?.completeness || 15 },
                      { label: 'Interview Logs Confidence', val: selectedApp.recruitmentScoreBreakdown?.dimensions?.interviewPerformance || 0, weight: scoreConfig?.weights?.interviewPerformance || 20, optional: true },
                      { label: 'Recruiter Direct Endorsement', val: selectedApp.recruitmentScoreBreakdown?.dimensions?.recruiterConfidence || 70, weight: scoreConfig?.weights?.recruiterConfidence || 10 },
                      { label: 'Referral System Attribution', val: selectedApp.recruitmentScoreBreakdown?.dimensions?.referralSignal || 0, weight: scoreConfig?.weights?.referralSignal || 10 },
                      { label: 'Discord OAuth Verification', val: selectedApp.recruitmentScoreBreakdown?.dimensions?.discordVerification || 100, weight: scoreConfig?.weights?.discordVerification || 10 },
                      { label: 'Community Engagement Actions', val: selectedApp.recruitmentScoreBreakdown?.dimensions?.engagementEvidence || 50, weight: scoreConfig?.weights?.engagementEvidence || 10 },
                      { label: 'Community Guidelines Fit', val: selectedApp.recruitmentScoreBreakdown?.dimensions?.communityFit || 70, weight: scoreConfig?.weights?.communityFit || 10 },
                    ].map((dim) => {
                      if (dim.optional && dim.val === 0) return null; // Dynamic hidden if not completed
                      return (
                        <div key={dim.label} className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="font-bold text-slate-700">{dim.label} <span className="text-[10px] font-medium text-slate-400 font-mono">(Weight: {dim.weight}%)</span></span>
                            <span className="font-bold text-slate-800">{dim.val}%</span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                dim.val >= 80 ? 'bg-emerald-500' : dim.val >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                              }`}
                              style={{ width: `${dim.val}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 5. Score Signals Audit Logs */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
                  <h3 className="text-xs font-black uppercase text-slate-800">Operational Screening Logs</h3>
                  <div className="space-y-3">
                    {(selectedApp.recruitmentScoreBreakdown?.signals || []).map((sig: any, idx: number) => (
                      <div key={idx} className="flex items-start gap-3 text-xs leading-normal p-3 rounded-xl border border-slate-100 bg-slate-50/50">
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                          sig.type === 'positive' ? 'bg-emerald-100 text-emerald-800' :
                          sig.type === 'negative' ? 'bg-rose-100 text-rose-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {sig.type === 'positive' ? '✓' : sig.type === 'negative' ? '✗' : '!'}
                        </span>
                        <div className="space-y-0.5">
                          <div className="font-bold text-slate-800">{sig.dimension} <span className="font-normal text-[10px] text-slate-400 font-mono">({sig.source})</span></div>
                          <p className="text-slate-600 text-[11px] font-medium">{sig.message}</p>
                          {sig.impact !== 0 && (
                            <div className={`text-[10px] font-bold ${sig.impact > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                              Impact on Total Score: {sig.impact > 0 ? `+${sig.impact}` : sig.impact}%
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {drawerActiveTab === 'timeline' && (
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-800">Unified Activity Timeline</h4>
                <div className="flow-root">
                  <ul className="-mb-8">
                    {[
                      { title: 'Application Received', desc: 'Candidate submitted application form.', date: selectedApp.submittedAt, active: true },
                      { title: 'Risk Verification Processed', desc: 'IP identity matching and restrictions database evaluated as CLEAR.', date: selectedApp.submittedAt, active: true },
                      { title: 'Staff Review Evaluated', desc: 'Application moved to queue for staff review.', date: selectedApp.status !== 'SUBMITTED' ? new Date().toISOString() : undefined, active: selectedApp.status !== 'SUBMITTED' },
                      { title: 'Recruit Code Attributed', desc: `Referral validation confirmed using code ${selectedApp.recruiterCodeUsed || 'DIRECT'}.`, date: selectedApp.status === 'JOINED' ? new Date().toISOString() : undefined, active: selectedApp.status === 'JOINED' },
                    ].map((step, idx, arr) => (
                      <li key={idx}>
                        <div className="relative pb-8">
                          {idx !== arr.length - 1 ? (
                            <span className={`absolute left-4 top-4 -ml-px h-full w-0.5 ${step.active ? 'bg-indigo-500' : 'bg-slate-200'}`} aria-hidden="true" />
                          ) : null}
                          <div className="relative flex space-x-3">
                            <div>
                              <span className={`flex h-8 w-8 items-center justify-center rounded-full ring-8 ring-white border ${
                                step.active ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 text-slate-400 border-slate-200'
                              }`}>
                                <Activity className="h-4 w-4" />
                              </span>
                            </div>
                            <div className="flex-1 min-w-0 pt-1.5">
                              <p className={`text-xs font-bold ${step.active ? 'text-slate-800' : 'text-slate-400'}`}>
                                {step.title}
                              </p>
                              <p className="text-[10px] text-slate-500 mt-0.5">{step.desc}</p>
                              {step.date && (
                                <span className="text-[9px] font-mono text-slate-400 mt-1 block">
                                  {new Date(step.date).toLocaleString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {drawerActiveTab === 'discord' && (
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-slate-800">Discord Verification Status</h4>
                <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-4 w-4 rounded-full ${selectedApp.status === 'JOINED' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                    <span className="text-xs font-bold text-slate-800">
                      {selectedApp.status === 'JOINED' ? 'Discord Membership Verified' : 'Awaiting Guild Association'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 space-y-1.5 font-medium border-t pt-3">
                    <div>Guild Association: <span className="font-bold text-slate-800">{selectedApp.status === 'JOINED' ? 'Present' : 'Pending Join'}</span></div>
                    <div>Identity Check: <span className="font-mono text-slate-700">{selectedApp.applicantDiscordId}</span></div>
                    <div>Active Roles: <span className="font-bold text-indigo-700">{selectedApp.status === 'JOINED' ? '@Verified-Member' : '@Pending-Approval'}</span></div>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
      </ContextDrawer>

      {/* MODAL 1: SUBMIT CANDIDATE APPLICATION */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black uppercase text-slate-900 flex items-center gap-2">
                <Plus className="h-5 w-5 text-indigo-600" />
                Submit Candidate Application
              </h3>
              <button onClick={() => setShowSubmitModal(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitApplication} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500">Applicant (search your server)</label>
                <div className="mt-1">
                  <MemberPick communityId={communityId} value={applicantDiscordId ? { id: applicantDiscordId, name: applicantUsername, username: applicantUsername } : null}
                    onChange={(m) => { setApplicantDiscordId(m?.id || ''); setApplicantUsername(m?.username || ''); }} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-[10px] font-black uppercase text-slate-500">Recruiter Code</label>
                  {recruiterCodes.length > 0 && (
                    <span className="text-[10px] text-indigo-600 font-medium">
                      {recruiterCodes.length} active codes available
                    </span>
                  )}
                </div>

                {recruiterCodes.length > 0 ? (
                  <div className="mt-1 space-y-2">
                    <select
                      value={recruiterCode}
                      onChange={(e) => setRecruiterCode(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 p-2.5 text-xs font-mono bg-white focus:border-indigo-500 focus:outline-hidden"
                    >
                      <option value="">-- Select Active Recruiter Code --</option>
                      {recruiterCodes.map((rc: any) => (
                        <option key={rc.id || rc.code} value={rc.code}>
                          {rc.code} {rc.recruiterName || rc.recruiterUsername ? `(${rc.recruiterName || rc.recruiterUsername})` : ''}
                        </option>
                      ))}
                      <option value="CUSTOM">+ Enter Custom Code</option>
                    </select>
                    {(!recruiterCodes.some((rc: any) => rc.code === recruiterCode) || recruiterCode === 'CUSTOM') && (
                      <input
                        type="text"
                        placeholder="Type custom recruiter code..."
                        value={recruiterCode === 'CUSTOM' ? '' : recruiterCode}
                        onChange={(e) => setRecruiterCode(e.target.value.toUpperCase())}
                        className="w-full font-mono uppercase rounded-lg border border-slate-300 p-2 text-xs"
                      />
                    )}
                  </div>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. JOIN-ALEX-123"
                    value={recruiterCode}
                    onChange={(e) => setRecruiterCode(e.target.value.toUpperCase())}
                    className="mt-1 w-full font-mono uppercase rounded-lg border border-slate-300 p-2.5 text-xs"
                  />
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: SCHEDULE CANDIDATE INTERVIEW */}
      {showInterviewModal && selectedApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black uppercase text-slate-900 flex items-center gap-2">
                <Calendar className="h-5 w-5 text-indigo-600" />
                Schedule Interview Slot
              </h3>
              <button onClick={() => setShowInterviewModal(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleScheduleInterview} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500">Target Candidate</label>
                <div className="mt-1 font-bold text-xs bg-slate-50 p-2.5 rounded-lg border">
                  {selectedApp.applicantUsername} ({selectedApp.applicantDiscordId})
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500">Scheduled Time</label>
                <input
                  type="datetime-local"
                  required
                  value={interviewTime}
                  onChange={(e) => setInterviewTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500">Assigned Recruiter User ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 10294820193"
                  value={assignedInterviewer}
                  onChange={(e) => setAssignedInterviewer(e.target.value)}
                  className="mt-1 w-full font-mono rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500">Agenda Notes</label>
                <textarea
                  rows={3}
                  placeholder="Notes for Discord notification..."
                  value={interviewNotes}
                  onChange={(e) => setInterviewNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowInterviewModal(false)}
                  className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingInterview}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submittingInterview ? 'Scheduling...' : 'Confirm Slot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: GENERATE RECRUITER CODE */}
      {showCreateCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black uppercase text-slate-900 flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-indigo-600" />
                Generate Referral Code
              </h3>
              <button onClick={() => setShowCreateCodeModal(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCode} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500">Referral Code Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. JOIN-ALEX-123"
                  value={newCodeName}
                  onChange={(e) => setNewCodeName(e.target.value)}
                  className="mt-1 w-full font-mono uppercase rounded-lg border border-slate-300 p-2.5 text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500">Recruiter Discord User ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 102938102938"
                  value={newCodeRecruiterId}
                  onChange={(e) => setNewCodeRecruiterId(e.target.value)}
                  className="mt-1 w-full font-mono rounded-lg border border-slate-300 p-2.5 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateCodeModal(false)}
                  className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingCode}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submittingCode ? 'Generating...' : 'Generate Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: DEPLOY RECRUITER BENEFIT */}
      {showCreateBenefitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black uppercase text-slate-900 flex items-center gap-2">
                <Gift className="h-5 w-5 text-indigo-600" />
                Add Incentive Milestone Tier
              </h3>
              <button onClick={() => setShowCreateBenefitModal(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBenefit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500">Reward Tier Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Silver Tier Recruiter"
                  value={newBenefitName}
                  onChange={(e) => setNewBenefitName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500">Recruit Threshold</label>
                <input
                  type="number"
                  required
                  placeholder="5"
                  value={newBenefitThreshold}
                  onChange={(e) => setNewBenefitThreshold(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500">Discord Role ID to Grant</label>
                <RoleSelect className="mt-1" value={newBenefitRoleId} onChange={setNewBenefitRoleId} />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500">Reward Description</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Silver recruiter role grant for 5 verified joins."
                  value={newBenefitDesc}
                  onChange={(e) => setNewBenefitDesc(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateBenefitModal(false)}
                  className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingBenefit}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submittingBenefit ? 'Deploying...' : 'Deploy Tier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: MANUAL OVERRIDES REFERRAL VERIFICATION */}
      {showManualReferralModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black uppercase text-slate-900 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-indigo-600" />
                Manual Referral Attribution Override
              </h3>
              <button onClick={() => setShowManualReferralModal(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleManualJoinSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500">Candidate Discord User ID</label>
                <div className="mt-1"><MemberSelect value={manualJoinDiscordId} onChange={(id) => setManualJoinDiscordId(id)} /></div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500">Attributed Referral Code (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. VIP-CODE-99"
                  value={manualJoinCode}
                  onChange={(e) => setManualJoinCode(e.target.value.toUpperCase())}
                  className="mt-1 w-full font-mono uppercase rounded-lg border border-slate-300 p-2.5 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowManualReferralModal(false)}
                  className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingManualJoin}
                  className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {submittingManualJoin ? 'Verifying...' : 'Verify Join & Attribute'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 6: SAVE CURRENT VIEW */}
      {showSaveFilterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-black uppercase text-slate-900 flex items-center gap-2">
                <Save className="h-5 w-5 text-indigo-600" />
                Save Current View
              </h3>
              <button onClick={() => setShowSaveFilterModal(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500">Filter View Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pending Reviews"
                  value={saveFilterName}
                  onChange={(e) => setSaveFilterName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-xs font-medium"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSaveFilterModal(false)}
                  className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveFilter}
                  disabled={!saveFilterName}
                  className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save View
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
