import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Key,
  ShieldCheck,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Bot,
  UserCheck,
  BookOpen,
  Award,
  Send,
  RefreshCw,
  LogOut,
  User,
  Calendar,
  UploadCloud,
  FileCode,
  Info,
  HelpCircle,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { MemberJourneyStatus } from '../../../shared/types/models.js';
import { getDiscordLoginUrl } from '../../lib/discordUrls.js';

interface ApplicantPortalViewProps {
  onBackToAdmin?: () => void;
  communityId?: string;
}

export const ApplicantPortalView: React.FC<ApplicantPortalViewProps> = ({
  onBackToAdmin,
  communityId = '',
}) => {
  // Discord Connection State
  const [discordConnected, setDiscordConnected] = useState<boolean>(false);
  const [discordUserId, setDiscordUserId] = useState<string>('');
  const [discordUsername, setDiscordUsername] = useState<string>('');
  const [discordAvatarUrl, setDiscordAvatarUrl] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('APPLICANT');

  // Check authenticated Discord session on mount and when communityId changes
  useEffect(() => {
    let isMounted = true;
    const checkSession = async () => {
      try {
        const res = await fetch('/api/v1/auth/session', {
          credentials: 'include',
          headers: communityId
            ? {
                'x-community-id': communityId,
              }
            : undefined,
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data?.authenticated && json.data?.user) {
            const user = json.data.user;
            if (isMounted) {
              setDiscordConnected(true);
              setUserRole(user.role || 'APPLICANT');
              setDiscordUserId(user.discordUserId || user.userId || '');
              setDiscordUsername(user.username || user.globalName || user.discordUserId || 'Verified Member');
              if (user.avatarUrl) {
                setDiscordAvatarUrl(user.avatarUrl);
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to verify session in ApplicantPortal:', err);
      }
    };
    checkSession();
    return () => {
      isMounted = false;
    };
  }, [communityId]);

  // Assigned Recruiter snapshot
  const [recruiterName, setRecruiterName] = useState<string>('Community Recruiter');
  const [welcomeGreeting, setWelcomeGreeting] = useState<string>(
    "Hi! I'm {{recruiterName}}. I'll help guide you through your application and recruitment process."
  );

  // Form step controls (1: Basic Info, 2: Questions, 3: Review)
  const [formStep, setFormStep] = useState<number>(1);
  const [questions, setQuestions] = useState<Array<{ id: string; label: string; type: string; required?: boolean; options?: string[] }>>([]);
  const [formMeta, setFormMeta] = useState<{ id: string; name: string; description: string; version: string } | null>(null);

  // Application Fields
  const [recruiterCode, setRecruiterCode] = useState<string>('');
  const [source, setSource] = useState<string>('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activeRecruiterCodes, setActiveRecruiterCodes] = useState<Array<{ id: string; code: string; recruiterName: string; totalUses?: number }>>([]);
  const [recruiterCodeRequired, setRecruiterCodeRequired] = useState<boolean>(true);
  const [stepError, setStepError] = useState<string | null>(null);

  // Draft Syncing indicators
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Submission / Loading states
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loadingJourney, setLoadingJourney] = useState<boolean>(false);

  // Journey details
  const [journeyStatus, setJourneyStatus] = useState<MemberJourneyStatus | null>(null);
  const [activeApplication, setActiveApplication] = useState<any | null>(null);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [loadingInterviews, setLoadingInterviews] = useState<boolean>(false);

  // Additional Information Panel
  const [additionalAnswers, setAdditionalAnswers] = useState<Array<{ questionId: string; questionText: string; answerText: string }>>([
    { questionId: 'add_reason', questionText: 'Provide additional details or references requested', answerText: '' }
  ]);
  const [submittingAdditional, setSubmittingAdditional] = useState<boolean>(false);
  const [additionalMessage, setAdditionalMessage] = useState<string | null>(null);

  // File Upload State Simulation
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: string } | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Simulation State
  const [joiningServer, setJoiningServer] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'status' | 'messages' | 'rules'>('status');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState<boolean>(false);
  const [rulesInfo, setRulesInfo] = useState<{ rulesText: string; rulesVersion: string; rulesAcknowledgementEnabled: boolean; acknowledged: boolean; acknowledgedAt?: string } | null>(null);
  const [loadingRules, setLoadingRules] = useState<boolean>(false);
  const [acknowledgingRules, setAcknowledgingRules] = useState<boolean>(false);
  const [lastVerificationWarning, setLastVerificationWarning] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // TASK 51: Member Lifecycle & Onboarding State
  const [lifecycleProfile, setLifecycleProfile] = useState<any | null>(null);
  const [memberChecklist, setMemberChecklist] = useState<any | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);
  const [loadingLifecycle, setLoadingLifecycle] = useState<boolean>(false);
  const [completingItemKey, setCompletingItemKey] = useState<string | null>(null);

  // Fetch Member Lifecycle Data (Task 51)
  const fetchMemberLifecycle = async () => {
    if (!discordUserId) return;
    try {
      setLoadingLifecycle(true);
      const [profRes, eventsRes] = await Promise.all([
        fetch(`/api/v1/lifecycle/${discordUserId}/profile?communityId=${communityId}`),
        fetch(`/api/v1/lifecycle/${discordUserId}/upcoming-events?communityId=${communityId}`),
      ]);
      if (profRes.ok) {
        const json = await profRes.json();
        if (json.success && json.data) {
          setLifecycleProfile(json.data);
          if (json.data.checklist) {
            setMemberChecklist(json.data.checklist);
          }
        }
      }
      if (eventsRes.ok) {
        const json = await eventsRes.json();
        if (json.success && Array.isArray(json.data)) {
          setUpcomingEvents(json.data);
        }
      }
    } catch (err) {
      console.error('Error fetching member lifecycle:', err);
    } finally {
      setLoadingLifecycle(false);
    }
  };

  // Complete Onboarding Checklist Item (Task 51.5)
  const handleCompleteChecklistItem = async (itemKey: string) => {
    if (!discordUserId) return;
    try {
      setCompletingItemKey(itemKey);
      const res = await fetch(`/api/v1/lifecycle/${discordUserId}/checklist/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, itemKey }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setMemberChecklist(json.data);
          await fetchMemberLifecycle();
        }
      }
    } catch (err) {
      console.error('Error completing checklist item:', err);
    } finally {
      setCompletingItemKey(null);
    }
  };

  // Fetch candidate-directed notifications
  const fetchNotifications = async () => {
    try {
      setLoadingNotifications(true);
      const res = await fetch(`/api/v1/notifications?communityId=${communityId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setNotifications(json.data);
        }
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoadingNotifications(false);
    }
  };

  // Fetch community guidelines / rules
  const fetchCommunityRules = async () => {
    try {
      setLoadingRules(true);
      const res = await fetch(`/api/v1/community/rules?communityId=${communityId}&discordUserId=${discordUserId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setRulesInfo(json.data);
        }
      }
    } catch (err) {
      console.error('Error fetching rules:', err);
    } finally {
      setLoadingRules(false);
    }
  };

  // Acknowledge community guidelines / rules
  const handleAcknowledgeRules = async () => {
    try {
      setAcknowledgingRules(true);
      const res = await fetch('/api/v1/community/rules/acknowledge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          communityId,
          discordUserId,
        }),
      });

      if (res.ok) {
        // Refresh rules
        await fetchCommunityRules();
        // Refresh journey status to trigger transition to COMPLETED / RECRUITMENT_SUCCESSFUL
        const journeyRes = await fetch(
          `/api/v1/community/member-journey-status?communityId=${communityId}&discordUserId=${discordUserId}`
        );
        if (journeyRes.ok) {
          const json = await journeyRes.json();
          if (json.success && json.data) {
            setJourneyStatus(json.data);
          }
        }
      }
    } catch (err) {
      console.error('Error acknowledging rules:', err);
    } finally {
      setAcknowledgingRules(false);
    }
  };

  // Mark in-app notification as read
  const handleMarkNotificationRead = async (notificationId: string) => {
    try {
      const res = await fetch(`/api/v1/notifications/${notificationId}/read`, {
        method: 'PATCH',
      });
      if (res.ok) {
        // Update local state
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
        );
      }
    } catch (err) {
      console.error('Error marking notification read:', err);
    }
  };

  // Fetch data on active application / tab shift
  useEffect(() => {
    if (activeApplication) {
      fetchNotifications();
      fetchCommunityRules();
      if (activeApplication.status === 'JOINED') {
        fetchMemberLifecycle();
      }
    }
  }, [activeApplication, activeTab, discordUserId]);

  // Debounced Autosave effect
  const autosaveTimer = useRef<NodeJS.Timeout | null>(null);

  // Load Recruiter Identity & Public Form on mount
  useEffect(() => {
    let isMounted = true;
    const fetchPublicFormAndRecruiter = async () => {
      try {
        const [identityRes, formRes, codesRes] = await Promise.all([
          fetch(`/api/v1/community/${communityId}/recruiter-identity`),
          fetch(`/api/v1/applications/forms/public/${communityId}`),
          fetch(`/api/v1/recruitment/${communityId}/public-codes`),
        ]);

        if (identityRes.ok && isMounted) {
          const json = await identityRes.json();
          if (json.success && json.data) {
            setRecruiterName(json.data.recruiterDisplayName || 'Community Recruiter');
            if (json.data.recruiterWelcomeGreeting) {
              setWelcomeGreeting(json.data.recruiterWelcomeGreeting);
            }
            if (json.data.recruiterCodeRequired !== undefined) {
              setRecruiterCodeRequired(json.data.recruiterCodeRequired !== false);
            }
          }
        }

        if (codesRes.ok && isMounted) {
          const json = await codesRes.json();
          if (json.success && Array.isArray(json.data)) {
            setActiveRecruiterCodes(json.data);
          }
        }

        if (formRes.ok && isMounted) {
          const json = await formRes.json();
          if (json.success && json.data) {
            setFormMeta({
              id: json.data.id || 'form_default',
              name: json.data.name || 'Standard Membership Application',
              description: json.data.description || 'Apply to join our elite network.',
              version: json.data.version || '1.0',
            });
            const qList = json.data.questions || [];
            setQuestions(qList);

            // Populate empty answers map
            const initialAnswers: Record<string, string> = {};
            qList.forEach((q: any) => {
              initialAnswers[q.id] = '';
            });
            setAnswers((prev) => ({ ...initialAnswers, ...prev }));
          }
        }
      } catch (err) {
        console.error('Failed to load form / recruiter profile:', err);
      }
    };

    fetchPublicFormAndRecruiter();
    return () => {
      isMounted = false;
    };
  }, [communityId]);

  // Load Candidate Draft & Current Member Journey whenever Identity changes
  useEffect(() => {
    if (!discordConnected || !discordUserId) {
      setJourneyStatus(null);
      setActiveApplication(null);
      setInterviews([]);
      return;
    }

    const loadJourneyAndDraft = async () => {
      try {
        setLoadingJourney(true);
        // 1. Fetch Journey Status
        const journeyRes = await fetch(
          `/api/v1/community/member-journey-status?communityId=${communityId}&discordUserId=${discordUserId}`
        );

        if (journeyRes.ok) {
          const json = await journeyRes.json();
          if (json.success && json.data) {
            setJourneyStatus(json.data);

            // If has active application, load application details
            if (json.data.applicationId) {
              const appRes = await fetch(`/api/v1/applications/${json.data.applicationId}`);
              if (appRes.ok) {
                const appJson = await appRes.json();
                if (appJson.success) {
                  setActiveApplication(appJson.data);

                  // Fetch interviews for this application
                  fetchInterviews(json.data.applicationId);
                }
              }
            } else {
              // No active application, try fetching a saved DRAFT from the server
              const draftRes = await fetch(
                `/api/v1/applications/drafts/find?communityId=${communityId}&applicantDiscordId=${discordUserId}`
              );
              if (draftRes.ok) {
                const draftJson = await draftRes.json();
                if (draftJson.success && draftJson.data) {
                  const draft = draftJson.data;
                  if (draft.answers) {
                    setAnswers(draft.answers);
                  }
                  if (draft.recruiterCodeUsed) {
                    setRecruiterCode(draft.recruiterCodeUsed);
                  }
                  if (draft.source) {
                    setSource(draft.source);
                  }
                  setLastSaved(new Date(draft.updatedAt || draft.createdAt).toLocaleTimeString());
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to load journey/draft:', err);
      } finally {
        setLoadingJourney(false);
      }
    };

    loadJourneyAndDraft();
  }, [communityId, discordConnected, discordUserId]);

  // Fetch interviews list
  const fetchInterviews = async (appId: string) => {
    try {
      setLoadingInterviews(true);
      const res = await fetch(`/api/v1/applications/${appId}/interviews`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          setInterviews(json.data);
        }
      }
    } catch (err) {
      console.error('Error loading interviews:', err);
    } finally {
      setLoadingInterviews(false);
    }
  };

  // Debounced autosave implementation
  const triggerAutosave = (updatedAnswers: Record<string, string>, currentCode: string, currentSource: string) => {
    if (!discordConnected || !discordUserId) return;
    if (activeApplication && activeApplication.status !== 'DRAFT') return;

    if (autosaveTimer.current) {
      clearTimeout(autosaveTimer.current);
    }

    setIsSavingDraft(true);
    setSaveError(null);

    autosaveTimer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/v1/applications/drafts/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            communityId,
            applicantDiscordId: discordUserId,
            applicantUsername: discordUsername,
            answers: updatedAnswers,
            campaignId: 'campaign_organic_portal',
            formId: formMeta?.id || 'form_default',
            formVersion: formMeta?.version || '1.0',
            recruiterCodeUsed: currentCode || undefined,
            source: currentSource || undefined,
          }),
        });

        const json = await res.json();
        if (res.ok && json.success) {
          setLastSaved(new Date().toLocaleTimeString());
        } else {
          setSaveError(json.message || 'Auto-save failed');
        }
      } catch {
        setSaveError('Network error syncing draft');
      } finally {
        setIsSavingDraft(false);
      }
    }, 1500); // 1.5s debounce window
  };

  const handleFieldChange = (qId: string, value: string) => {
    const updatedAnswers = { ...answers, [qId]: value };
    setAnswers(updatedAnswers);
    triggerAutosave(updatedAnswers, recruiterCode, source);
  };

  const handleRecruiterCodeChange = (val: string) => {
    setRecruiterCode(val);
    triggerAutosave(answers, val, source);
  };

  const handleSourceChange = (val: string) => {
    setSource(val);
    triggerAutosave(answers, recruiterCode, val);
  };

  // Connect Discord simulation handler
  const handleConnectDiscord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!discordUsername.trim() || !discordUserId.trim()) return;
    setDiscordConnected(true);
  };

  const handleDisconnectDiscord = () => {
    setDiscordConnected(false);
    setDiscordUserId('');
    setDiscordUsername('');
    setJourneyStatus(null);
    setActiveApplication(null);
    setAnswers({});
    setRecruiterCode('');
    setSource('');
    setFormStep(1);
  };

  // Submit full application
  const handleSubmitApplication = async () => {
    if (!discordConnected || !discordUserId) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const formattedAnswers = Object.entries(answers).map(([qId, val]) => {
        const qInfo = questions.find((q) => q.id === qId);
        return {
          questionId: qId,
          questionText: qInfo?.label || 'Question',
          answerText: val,
        };
      });

      const res = await fetch('/api/v1/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          applicantDiscordId: discordUserId,
          applicantUsername: discordUsername,
          answers: formattedAnswers,
          campaignId: 'campaign_organic_portal',
          formId: formMeta?.id || 'form_default',
          formVersion: formMeta?.version || '1.0',
          recruiterCodeUsed: recruiterCode.trim() || undefined,
          source: source.trim() || undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || 'Failed to submit application');
      }

      // Refresh status immediately
      setJourneyStatus(json.data);
      setActiveApplication(json.data);
      // Reset form controls
      setFormStep(1);
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Submit missing details/additional information (Task 49.3)
  const handleAdditionalInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeApplication) return;
    setSubmittingAdditional(true);
    setAdditionalMessage(null);

    try {
      const res = await fetch(`/api/v1/applications/${activeApplication.id}/additional-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: additionalAnswers,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setAdditionalMessage('Success! Additional information recorded. Status updated.');
        setActiveApplication(json.data);
        if (journeyStatus) {
          setJourneyStatus({
            ...journeyStatus,
            applicationStatus: json.data.status,
          });
        }
      } else {
        throw new Error(json.message || 'Submission failed');
      }
    } catch (err: any) {
      setAdditionalMessage(`Error: ${err.message}`);
    } finally {
      setSubmittingAdditional(false);
    }
  };

  // Simulated File Upload triggers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      setSelectedFile({
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
      });
      // Simulate adding to answers
      const currentText = additionalAnswers[0].answerText;
      setAdditionalAnswers([
        {
          ...additionalAnswers[0],
          answerText: `${currentText}\n[Uploaded Reference File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)]`,
        }
      ]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFile({
        name: file.name,
        size: (file.size / 1024).toFixed(1) + ' KB',
      });
      const currentText = additionalAnswers[0].answerText;
      setAdditionalAnswers([
        {
          ...additionalAnswers[0],
          answerText: `${currentText}\n[Attached Reference Document: ${file.name} (${(file.size / 1024).toFixed(1)} KB)]`,
        }
      ]);
    }
  };

  // Run authoritative Join Server verification
  const handleVerifyDiscordJoin = async () => {
    if (!activeApplication) return;
    try {
      setJoiningServer(true);
      setVerificationError(null);
      setLastVerificationWarning(null);

      const res = await fetch(`/api/v1/applications/${activeApplication.id}/verify-join`, {
        method: 'POST',
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          if (json.joined) {
            // Successfully joined and verified! Let's refetch active application and journey status
            const [journeyRes, appRes] = await Promise.all([
              fetch(`/api/v1/community/member-journey-status?communityId=${communityId}&discordUserId=${discordUserId}`),
              fetch(`/api/v1/applications/${activeApplication.id}`),
            ]);

            if (journeyRes.ok) {
              const jJson = await journeyRes.json();
              if (jJson.success && jJson.data) {
                setJourneyStatus(jJson.data);
              }
            }
            if (appRes.ok) {
              const aJson = await appRes.json();
              if (aJson.success && aJson.data) {
                setActiveApplication(aJson.data);
              }
            }
            await fetchMemberLifecycle();
          } else {
            // User has not joined yet, or bot connection is missing
            setLastVerificationWarning(json.warningState);
            setVerificationError(json.message);
          }
        }
      } else {
        setVerificationError('Server connection issue while running automated verification.');
      }
    } catch (err: any) {
      console.error('Error verifying join:', err);
      setVerificationError(err.message || 'Failed to verify server join.');
    } finally {
      setJoiningServer(false);
    }
  };

  const handleSimulateDiscordJoin = handleVerifyDiscordJoin;

  const resolvedGreeting = (welcomeGreeting || '').replace(/{{\s*recruiterName\s*}}/g, recruiterName || 'Community Recruiter');

  const getTimelineCommunications = () => {
    const items: any[] = [];
    if (!activeApplication) return [];

    const formatTime = (dateStr?: string) => {
      return dateStr ? new Date(dateStr).toLocaleString() : new Date().toLocaleString();
    };

    // 1. Application Received
    items.push({
      id: '01-evt-received',
      title: 'Application Received',
      status: 'SUCCESS',
      message: 'Your registration was completed. Our platform has securely encrypted and logged your profile data.',
      timestamp: formatTime(activeApplication.submittedAt || activeApplication.createdAt),
    });

    // 2. Under Review
    if (['UNDER_REVIEW', 'ADDITIONAL_INFO_REQUIRED', 'ADDITIONAL_INFORMATION_REQUIRED', 'INTERVIEW', 'APPROVED', 'JOIN_PENDING', 'JOINED', 'RECRUITMENT_SUCCESSFUL'].includes(activeApplication.status)) {
      items.push({
        id: '02-evt-review',
        title: 'Evaluation Initiated',
        status: 'SUCCESS',
        message: 'Platform automated screening completed successfully. Candidacy placed in staff queue for manual scoring.',
        timestamp: formatTime(activeApplication.submittedAt || activeApplication.createdAt),
      });
    }

    // 3. Information Required
    if (activeApplication.status === 'ADDITIONAL_INFO_REQUIRED' || activeApplication.status === 'ADDITIONAL_INFORMATION_REQUIRED') {
      items.push({
        id: '03-evt-info-req',
        title: 'Information Required',
        status: 'ACTION_REQUIRED',
        message: `Our review team flagged your application for missing details: "${activeApplication.missingInformation || 'Supplemental information required.'}"`,
        timestamp: formatTime(activeApplication.updatedAt),
      });
    }

    // 4. Interview Scheduled
    if (activeApplication.status === 'INTERVIEW' || interviews.length > 0) {
      items.push({
        id: '04-evt-interview',
        title: 'Interview Scheduled',
        status: 'INFO',
        message: 'A Google Calendar invitation has been successfully compiled and synchronized for your panel review.',
        timestamp: formatTime(interviews[0]?.createdAt || activeApplication.updatedAt),
      });
    }

    // 5. Decision & Approval
    if (['APPROVED', 'JOIN_PENDING', 'JOINED', 'RECRUITMENT_SUCCESSFUL'].includes(activeApplication.status)) {
      items.push({
        id: '05-evt-approved',
        title: 'Recruitment Authorized',
        status: 'SUCCESS',
        message: 'Congratulations! Human review panel has authorized your candidacy for membership.',
        timestamp: formatTime(activeApplication.updatedAt),
      });
      items.push({
        id: '06-evt-join-instructions',
        title: 'Join Instructions Sent',
        status: 'INFO',
        message: 'Discord invitation token dispatched. Server entrance gate is open for your account.',
        timestamp: formatTime(activeApplication.updatedAt),
      });
    }

    // 6. Join Confirmed
    if (['JOINED', 'RECRUITMENT_SUCCESSFUL'].includes(activeApplication.status)) {
      items.push({
        id: '07-evt-joined',
        title: 'Guild Entrance Confirmed',
        status: 'SUCCESS',
        message: 'Authoritative server check complete. You are successfully registered inside our Discord guild.',
        timestamp: formatTime(activeApplication.updatedAt),
      });
    }

    // 7. Onboarding & Success
    if (journeyStatus?.rulesAcknowledgementStatus === 'ACKNOWLEDGED') {
      items.push({
        id: '08-evt-rules-ack',
        title: 'Code of Conduct Acknowledged',
        status: 'SUCCESS',
        message: 'Community guidelines and server regulations signed. Your rules acknowledgment record was persisted.',
        timestamp: formatTime(journeyStatus.rulesAcknowledgedAt),
      });
    }

    if (journeyStatus?.journeyState === 'COMPLETED' || activeApplication.status === 'JOINED') {
      items.push({
        id: '09-evt-success',
        title: 'Recruitment Successful',
        status: 'SUCCESS',
        message: 'Welcome! You have completed all onboarding stages. Roles and access permissions are fully sync\'d.',
        timestamp: formatTime(activeApplication.updatedAt),
      });
    }

    // If notifications contain custom items, append them cleanly to show a complete picture!
    notifications.forEach((n, index) => {
      if (!items.find((item) => item.message === n.message)) {
        items.push({
          id: `custom-notif-${index}-${n.id}`,
          title: n.title || 'System Notification',
          status: n.read ? 'INFO' : 'ACTION_REQUIRED',
          message: n.message,
          timestamp: formatTime(n.createdAt),
        });
      }
    });

    // Sort descending by id to get chronologically newest at the top
    return items.sort((a, b) => b.id.localeCompare(a.id));
  };

  // States Helper to evaluate status styles and descriptions
  const getStatusMetadata = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return { color: 'bg-amber-50 text-amber-800 border-amber-200', text: 'Draft Mode' };
      case 'SUBMITTED':
        return { color: 'bg-blue-50 text-blue-800 border-blue-200', text: 'Submitted & Pending Review' };
      case 'UNDER_REVIEW':
        return { color: 'bg-indigo-50 text-indigo-800 border-indigo-200', text: 'Under Staff Review' };
      case 'ADDITIONAL_INFORMATION_REQUIRED':
      case 'ADDITIONAL_INFO_REQUIRED':
        return { color: 'bg-purple-50 text-purple-800 border-purple-200', text: 'Additional Info Requested' };
      case 'INTERVIEW':
        return { color: 'bg-orange-50 text-orange-800 border-orange-200', text: 'Interview Stage' };
      case 'APPROVED':
        return { color: 'bg-teal-50 text-teal-800 border-teal-200', text: 'Approved (Awaiting Join)' };
      case 'JOIN_PENDING':
        return { color: 'bg-cyan-50 text-cyan-800 border-cyan-200', text: 'Join Pending' };
      case 'JOINED':
        return { color: 'bg-emerald-50 text-emerald-800 border-emerald-200', text: 'Joined & Fully Onboarded' };
      case 'REJECTED':
        return { color: 'bg-rose-50 text-rose-800 border-rose-200', text: 'Application Declined' };
      case 'WITHDRAWN':
        return { color: 'bg-slate-50 text-slate-800 border-slate-200', text: 'Withdrawn' };
      default:
        return { color: 'bg-slate-50 text-slate-800 border-slate-200', text: status };
    }
  };

  const computePortalState = () => {
    if (!activeApplication) return 'NO_APPLICATION';
    
    const status = activeApplication.status;
    
    if (status === 'DRAFT') return 'DRAFT';
    if (['SUBMITTED', 'UNDER_REVIEW'].includes(status)) return 'UNDER_REVIEW';
    if (['ADDITIONAL_INFORMATION_REQUIRED', 'ADDITIONAL_INFO_REQUIRED'].includes(status)) return 'ADDITIONAL_INFO_REQUIRED';
    if (status === 'INTERVIEW') return 'INTERVIEW';
    if (status === 'REJECTED') return 'REJECTED';
    if (status === 'WITHDRAWN') return 'WITHDRAWN';
    
    if (['APPROVED', 'JOIN_PENDING', 'JOIN_VERIFICATION_PENDING'].includes(status)) {
      if (journeyStatus) {
        if (journeyStatus.applicationStatus === 'JOINED' || journeyStatus.isMember) {
          return 'JOINED';
        } else {
          if (lastVerificationWarning === 'DISCORD_NOT_CONNECTED') {
            return 'DISCORD_NOT_CONNECTED';
          }
          if (lastVerificationWarning === 'DISCORD_LIMITATION') {
            return 'DISCORD_LIMITATION';
          }
          if (status === 'JOIN_VERIFICATION_PENDING') {
            return 'JOIN_VERIFICATION_PENDING';
          }
          return 'JOIN_ACTION_REQUIRED';
        }
      }
      return 'JOIN_ACTION_REQUIRED';
    }
    
    if (status === 'JOINED') {
      if (journeyStatus) {
        const isRolePending = journeyStatus.roleAssignmentStatus === 'ROLE_ASSIGNMENT_FAILED';
        const isRulesPending = journeyStatus.rulesAcknowledgementStatus === 'PENDING';
        
        if (isRulesPending || isRolePending) {
          return 'ONBOARDING_PENDING';
        }
        return 'RECRUITMENT_SUCCESSFUL';
      }
      return 'JOINED';
    }
    
    return status;
  };

  const getComputedStateMetadata = (state: string) => {
    switch (state) {
      case 'DRAFT':
        return {
          title: 'Draft Application',
          description: 'Your membership application is currently in draft. Complete and submit all required sections to initiate the review lifecycle.',
          badge: { text: 'Drafting', color: 'bg-slate-100 text-slate-700 border-slate-200' },
          icon: 'FileText',
          actionText: 'Complete and Submit Application',
        };
      case 'SUBMITTED':
        return {
          title: 'Application Submitted',
          description: 'Your details have been successfully received and placed into the automated screening queue. No immediate action is required.',
          badge: { text: 'Submitted', color: 'bg-blue-50 text-blue-800 border-blue-200' },
          icon: 'Clock',
          actionText: 'Awaiting Screening Result',
        };
      case 'UNDER_REVIEW':
        return {
          title: 'Under Staff Review',
          description: 'A senior community reviewer is actively analyzing your references, answers, and background credentials against our standards.',
          badge: { text: 'In Review', color: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
          icon: 'UserCheck',
          actionText: 'Awaiting Recruiter Feedback',
        };
      case 'ADDITIONAL_INFO_REQUIRED':
      case 'ADDITIONAL_INFORMATION_REQUIRED':
        return {
          title: 'Information Required',
          description: 'Our reviewers require supplemental information, credentials, or documentation to finalize their assessment. Please submit them below.',
          badge: { text: 'Action Required', color: 'bg-amber-50 text-amber-800 border-amber-200' },
          icon: 'Info',
          actionText: 'Submit Supplemental Details',
        };
      case 'INTERVIEW':
      case 'SCHEDULED':
        return {
          title: 'Private Panel Interview',
          description: 'You have been approved for a live private interview thread! Please accept the Google Calendar invitation and prepare.',
          badge: { text: 'Interview Stage', color: 'bg-orange-50 text-orange-800 border-orange-200' },
          icon: 'Calendar',
          actionText: 'Join voice channel on scheduled time',
        };
      case 'APPROVED':
      case 'JOIN_ACTION_REQUIRED':
        return {
          title: 'Join Discord Server',
          description: 'Your recruitment request has been authorized by our team! Please join our verified Discord guild below to receive your role credentials and begin onboarding.',
          badge: { text: 'Action Required', color: 'bg-amber-50 text-amber-800 border-amber-200' },
          icon: 'Bot',
          actionText: 'Connect to Discord Server',
        };
      case 'JOIN_PENDING':
        return {
          title: 'Guild Entrance Open',
          description: 'Your candidacy has been finalized. Join the server and click "Verify Server Join" to trigger role and permissions assignment.',
          badge: { text: 'Awaiting Join', color: 'bg-cyan-50 text-cyan-800 border-cyan-200' },
          icon: 'ExternalLink',
          actionText: 'Verify Server Join',
        };
      case 'JOIN_VERIFICATION_PENDING':
        return {
          title: 'Verifying Server Join',
          description: 'The recruitment backend is communicating with the Discord bot gateway to authoritatively verify your server presence. This is an active security check; do not submit falsified details.',
          badge: { text: 'Verifying...', color: 'bg-indigo-50 text-indigo-800 border-indigo-200' },
          icon: 'Loader2',
          actionText: 'Refresh Verification Status',
        };
      case 'JOINED':
        return {
          title: 'Server Joined Successfully',
          description: 'You have authoritatively joined our server. The recruitment bot is assigning roles and dispatcher welcome guides.',
          badge: { text: 'Joined', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
          icon: 'UserCheck',
          actionText: 'Complete Onboarding',
        };
      case 'JOIN_FAILED':
        return {
          title: 'Verification Failed',
          description: 'We were unable to locate your user ID inside the server. Ensure you join using the correct account and retry.',
          badge: { text: 'Join Failed', color: 'bg-rose-50 text-rose-800 border-rose-200' },
          icon: 'AlertCircle',
          actionText: 'Retry Verification',
        };
      case 'DISCORD_NOT_CONNECTED':
        return {
          title: 'Discord Bot Not Connected',
          description: 'The community Discord Bot gateway is currently unconfigured or offline. Staff human review is required to confirm your server presence and assign roles manually.',
          badge: { text: 'System Interruption', color: 'bg-rose-50 text-rose-800 border-rose-200' },
          icon: 'AlertTriangle',
          actionText: 'Retry Connection Check',
        };
      case 'DISCORD_PERMISSION_REQUIRED':
        return {
          title: 'Missing Bot Permissions',
          description: 'The Discord Bot lacks necessary permissions (e.g. Manage Roles) to process your account automatically. Staff are overriding manually.',
          badge: { text: 'Permission Error', color: 'bg-rose-50 text-rose-800 border-rose-200' },
          icon: 'ShieldAlert',
          actionText: 'Contact Community Support',
        };
      case 'DISCORD_LIMITATION':
        return {
          title: 'Discord Service Limitation',
          description: 'The Discord bot is connected, but has hit API limitations or connection issues. Your join status has been queued for automatic verification.',
          badge: { text: 'API Rate Limit', color: 'bg-amber-50 text-amber-800 border-amber-200' },
          icon: 'Clock',
          actionText: 'Retry Verification',
        };
      case 'ONBOARDING_PENDING':
        return {
          title: 'Onboarding Pending',
          description: 'You are successfully inside the Discord Server! To complete your recruitment journey, please complete the post-join onboarding actions below (e.g. acknowledge the Code of Conduct rules).',
          badge: { text: 'Onboarding', color: 'bg-blue-50 text-blue-800 border-blue-200' },
          icon: 'Sparkles',
          actionText: 'Complete Onboarding',
        };
      case 'RECRUITMENT_SUCCESSFUL':
        return {
          title: 'Recruitment Successful',
          description: 'Congratulations! Your recruitment journey is officially complete. You are verified, welcomed, fully role-assigned, and registered as a community member.',
          badge: { text: 'Completed', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
          icon: 'Award',
          actionText: 'Onboarding Finished',
        };
      case 'REJECTED':
        return {
          title: 'Application Declined',
          description: 'Thank you for your interest. After reviewing your response, we are unable to accept your membership application at this time.',
          badge: { text: 'Declined', color: 'bg-rose-50 text-rose-800 border-rose-200' },
          icon: 'AlertCircle',
          actionText: 'Declined',
        };
      case 'WITHDRAWN':
        return {
          title: 'Application Withdrawn',
          description: 'This application was withdrawn at your request or because of inactivity. You may submit a new application when ready.',
          badge: { text: 'Withdrawn', color: 'bg-slate-100 text-slate-750 border-slate-200' },
          icon: 'LogOut',
          actionText: 'Reapply',
        };
      default:
        return null;
    }
  };

  const renderStateIcon = (state: string) => {
    switch (state) {
      case 'DRAFT':
        return <FileText className="h-6 w-6 text-slate-500" />;
      case 'SUBMITTED':
      case 'UNDER_REVIEW':
        return <Clock className="h-6 w-6 text-indigo-500 animate-pulse" />;
      case 'ADDITIONAL_INFO_REQUIRED':
      case 'ADDITIONAL_INFORMATION_REQUIRED':
        return <Info className="h-6 w-6 text-amber-500 animate-pulse" />;
      case 'INTERVIEW':
      case 'SCHEDULED':
        return <Calendar className="h-6 w-6 text-orange-500" />;
      case 'APPROVED':
      case 'JOIN_ACTION_REQUIRED':
        return <Bot className="h-6 w-6 text-amber-600 animate-pulse" />;
      case 'JOIN_PENDING':
        return <ExternalLink className="h-6 w-6 text-cyan-600" />;
      case 'JOIN_VERIFICATION_PENDING':
        return <RefreshCw className="h-6 w-6 text-indigo-600 animate-spin" />;
      case 'DISCORD_NOT_CONNECTED':
      case 'DISCORD_PERMISSION_REQUIRED':
      case 'JOIN_FAILED':
        return <AlertCircle className="h-6 w-6 text-rose-600" />;
      case 'DISCORD_LIMITATION':
        return <Clock className="h-6 w-6 text-amber-600 animate-pulse" />;
      case 'ONBOARDING_PENDING':
        return <Sparkles className="h-6 w-6 text-blue-600 animate-pulse" />;
      case 'RECRUITMENT_SUCCESSFUL':
        return <Award className="h-6 w-6 text-emerald-600" />;
      default:
        return <Info className="h-6 w-6 text-slate-600" />;
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-2">
      {/* isolated environment warning */}
      <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-indigo-950">
                Secure Candidate Verification Environment
              </div>
              <p className="mt-0.5 text-[11px] text-indigo-800/80 leading-relaxed max-w-2xl">
                This sandbox displays the real candidate experience. All private staff discussions, metrics, and internal reviews are strictly filtered to maintain total candidates confidentiality.
              </p>
            </div>
          </div>
          {onBackToAdmin && userRole !== 'APPLICANT' && (
            <button
              onClick={onBackToAdmin}
              className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs px-3.5 py-2 transition shadow-xs active:scale-95 shrink-0"
              id="btn-return-to-management"
            >
              Back to Admin Panel
            </button>
          )}
        </div>
      </div>

      {/* Recruiter Representative & Intro Section */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col md:flex-row gap-5 items-start">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-indigo-600 text-white font-extrabold text-xl shadow-md border-2 border-white">
          {recruiterName.charAt(0).toUpperCase()}
        </div>
        <div className="space-y-1 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">
              Assigned Representative: <span className="text-indigo-600 font-extrabold">{recruiterName}</span>
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100/80 px-2.5 py-0.5 text-[10px] font-bold text-indigo-800">
              <Bot className="h-3 w-3" />
              Recruitment AI Host
            </span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed italic">
            "{resolvedGreeting}"
          </p>
        </div>
      </div>

      {/* DISCORD IDENTITY FLOW (Task 49.2 & 49.1) */}
      {!discordConnected ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm max-w-xl mx-auto space-y-6 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 mb-2">
            <UserCheck className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-slate-900">Discord Verification Required</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Our Recruitment Network is Discord-First. Please authorize your Discord identity to submit applications, check evaluation stages, or access private onboarding.
            </p>
          </div>

          <div className="space-y-4 max-w-sm mx-auto text-center">
            <a
              href={getDiscordLoginUrl()}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 px-4 transition shadow-xs active:scale-98"
            >
              <Sparkles className="h-4 w-4" />
              Login with Discord
            </a>
          </div>
        </div>
      ) : (
        /* DISCORD CONNECTED ACTIVE VIEW */
        <div className="space-y-6">
          {/* Identity Bar */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                <UserCheck className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Discord Identity</div>
                <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <span>{discordUsername}</span>
                  <span className="text-[10px] font-mono text-slate-400 font-normal">({discordUserId})</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Sync Status for Drafts */}
              {(!activeApplication || activeApplication.status === 'DRAFT') && (
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 border border-slate-100 bg-slate-50 rounded-md px-2.5 py-1">
                  {isSavingDraft ? (
                    <>
                      <RefreshCw className="h-3 w-3 text-indigo-500 animate-spin" />
                      <span>Syncing Cloud Draft...</span>
                    </>
                  ) : saveError ? (
                    <>
                      <AlertCircle className="h-3 w-3 text-rose-500" />
                      <span className="text-rose-600">{saveError}</span>
                    </>
                  ) : lastSaved ? (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Draft Saved at {lastSaved}</span>
                    </>
                  ) : (
                    <>
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                      <span>Autosave Idle</span>
                    </>
                  )}
                </div>
              )}

              <button
                onClick={handleDisconnectDiscord}
                className="rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold py-1.5 px-3 transition flex items-center gap-1.5"
              >
                <LogOut className="h-3.5 w-3.5" />
                Disconnect
              </button>
            </div>
          </div>

          {loadingJourney ? (
            <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500 space-y-3">
              <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin mx-auto" />
              <p className="text-xs">Connecting with Recruitment Cloud API...</p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {/* NO SUBMITTED APPLICATION - RENDER FORM (Task 49.4) */}
              {!activeApplication || activeApplication.status === 'DRAFT' ? (
                <motion.div
                  key="submission-form"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-6"
                >
                  {/* Step Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <FileText className="h-5 w-5 text-indigo-600" />
                        {formMeta?.name || 'Standard Membership Application'}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {formMeta?.description || 'Please complete the multi-step questionnaire below.'}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      {[1, 2, 3].map((step) => (
                        <div
                          key={step}
                          className={`h-2.5 w-8 rounded-full transition-colors ${
                            formStep >= step ? 'bg-indigo-600' : 'bg-slate-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Multi-step Content */}
                  <div className="py-2">
                    {formStep === 1 && (
                      <div className="space-y-4">
                        <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-3.5 text-xs text-indigo-950 flex gap-2">
                          <Sparkles className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                          <p>
                            <strong>Autosave Engaged:</strong> Your answers are live-synced to your secure Discord ID. You can leave this page and return at any time to submit.
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="block text-xs font-bold text-slate-700">
                                Recruiter Referral Code {recruiterCodeRequired && <span className="text-rose-500 font-bold">* (Required)</span>}
                              </label>
                              {activeRecruiterCodes.length > 0 && (
                                <span className="text-[10px] text-indigo-600 font-medium">
                                  {activeRecruiterCodes.length} active codes
                                </span>
                              )}
                            </div>

                            {activeRecruiterCodes.length > 0 ? (
                              <div className="space-y-2">
                                <select
                                  value={activeRecruiterCodes.some(c => c.code === recruiterCode) ? recruiterCode : (recruiterCode ? 'CUSTOM' : '')}
                                  onChange={(e) => {
                                    setStepError(null);
                                    if (e.target.value === 'CUSTOM') {
                                      handleRecruiterCodeChange('');
                                    } else {
                                      handleRecruiterCodeChange(e.target.value);
                                    }
                                  }}
                                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs font-mono bg-white focus:border-indigo-500 focus:outline-hidden"
                                >
                                  <option value="">-- Select Active Recruiter Code --</option>
                                  {activeRecruiterCodes.map((rc) => (
                                    <option key={rc.id || rc.code} value={rc.code}>
                                      {rc.code} — {rc.recruiterName}
                                    </option>
                                  ))}
                                  <option value="CUSTOM">+ Enter Custom Code</option>
                                </select>

                                {(!activeRecruiterCodes.some((rc) => rc.code === recruiterCode) || recruiterCode === '') && (
                                  <input
                                    type="text"
                                    value={recruiterCode}
                                    onChange={(e) => {
                                      setStepError(null);
                                      handleRecruiterCodeChange(e.target.value);
                                    }}
                                    placeholder="Type or paste referral code..."
                                    className="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono uppercase focus:border-indigo-500 focus:outline-hidden"
                                  />
                                )}
                              </div>
                            ) : (
                              <input
                                type="text"
                                value={recruiterCode}
                                onChange={(e) => {
                                  setStepError(null);
                                  handleRecruiterCodeChange(e.target.value);
                                }}
                                placeholder="e.g. ELITE-NEXUS-77"
                                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs font-mono uppercase focus:border-indigo-500 focus:outline-hidden"
                              />
                            )}
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 mb-1.5">
                              How did you hear about us? (Traffic Attribution)
                            </label>
                            <select
                              value={source}
                              onChange={(e) => handleSourceChange(e.target.value)}
                              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-indigo-500 focus:outline-hidden bg-white"
                            >
                              <option value="">-- Choose Option --</option>
                              <option value="Discord Guild List">Discord Guild List</option>
                              <option value="Twitter/X">Twitter / X</option>
                              <option value="Friend Referral">Friend Referral</option>
                              <option value="Web Search">Web Search</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                        </div>

                        {stepError && (
                          <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                            <span>{stepError}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {formStep === 2 && (
                      <div className="space-y-5">
                        {questions.length > 0 ? (
                          questions.map((q, idx) => (
                            <div key={q.id} className="space-y-1.5">
                              <label className="block text-xs font-bold text-slate-700">
                                Question {idx + 1}: {q.label} {q.required && <span className="text-rose-500">*</span>}
                              </label>

                              {q.type === 'SINGLE_SELECT' ? (
                                <select
                                  value={answers[q.id] || ''}
                                  onChange={(e) => handleFieldChange(q.id, e.target.value)}
                                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-indigo-500 focus:outline-hidden bg-white"
                                >
                                  <option value="">-- Select Answer --</option>
                                  {(q.options || []).map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                  ))}
                                </select>
                              ) : q.type === 'YES_NO' ? (
                                <div className="flex gap-4 pt-1">
                                  {['Yes', 'No'].map((opt) => (
                                    <label key={opt} className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                                      <input
                                        type="radio"
                                        name={`q_${q.id}`}
                                        value={opt}
                                        checked={answers[q.id] === opt}
                                        onChange={(e) => handleFieldChange(q.id, e.target.value)}
                                        className="text-indigo-600 focus:ring-indigo-500"
                                      />
                                      {opt}
                                    </label>
                                  ))}
                                </div>
                              ) : (
                                <textarea
                                  rows={3}
                                  value={answers[q.id] || ''}
                                  onChange={(e) => handleFieldChange(q.id, e.target.value)}
                                  placeholder="Type your structured response here..."
                                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-indigo-500 focus:outline-hidden"
                                />
                              )}
                            </div>
                          ))
                        ) : (
                          <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-700">
                              Tell us why you would be an amazing recruit <span className="text-rose-500">*</span>
                            </label>
                            <textarea
                              rows={4}
                              value={answers['q1'] || ''}
                              onChange={(e) => handleFieldChange('q1', e.target.value)}
                              placeholder="Write your background and aspirations here..."
                              className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-indigo-500 focus:outline-hidden"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {formStep === 3 && (
                      <div className="space-y-5">
                        <div className="rounded-lg bg-indigo-50/20 border border-indigo-100 p-4 space-y-3">
                          <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">Please Review Your Details</h4>
                          <p className="text-xs text-slate-500">
                            You are submitting your application for verified membership. All answers will be evaluated securely.
                          </p>
                        </div>

                        <div className="space-y-3 border border-slate-100 rounded-lg p-4 bg-slate-50/50">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <span className="text-slate-400 block font-medium">Recruiter Code</span>
                              <span className="font-mono font-bold text-indigo-600 mt-0.5 block">{recruiterCode || 'None (Organic)'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block font-medium">Attribution Source</span>
                              <span className="font-bold text-slate-700 mt-0.5 block">{source || 'Organic (Direct)'}</span>
                            </div>
                          </div>

                          <div className="border-t border-slate-200/60 pt-3 space-y-3">
                            <span className="text-slate-400 block text-xs font-medium">Application Answers</span>
                            {questions.length > 0 ? (
                              questions.map((q) => (
                                <div key={q.id} className="text-xs">
                                  <div className="text-slate-500 font-semibold">{q.label}</div>
                                  <div className="text-slate-800 mt-1 whitespace-pre-wrap pl-2.5 border-l-2 border-indigo-200">
                                    {answers[q.id] || <span className="text-slate-400 italic">No answer provided</span>}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="text-xs">
                                <div className="text-slate-500 font-semibold">Background Statement</div>
                                <div className="text-slate-800 mt-1 whitespace-pre-wrap pl-2.5 border-l-2 border-indigo-200">
                                  {answers['q1'] || <span className="text-slate-400 italic">No statement provided</span>}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {submitError && (
                          <div className="rounded-lg bg-rose-50 border border-rose-100 p-3.5 text-xs text-rose-800 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                            <span>{submitError}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Step Buttons */}
                  <div className="flex justify-between items-center border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      disabled={formStep === 1}
                      onClick={() => setFormStep((p) => p - 1)}
                      className="rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold py-2 px-4 transition disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1.5"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Back
                    </button>

                    {formStep < 3 ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (formStep === 1 && recruiterCodeRequired && !recruiterCode.trim()) {
                            setStepError('A valid recruiter code is required by the community to apply. Please select or enter an active recruiter code.');
                            return;
                          }
                          setStepError(null);
                          setFormStep((p) => p + 1);
                        }}
                        className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2 px-5 transition flex items-center gap-1.5"
                      >
                        Next Step
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={handleSubmitApplication}
                        className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold py-2.5 px-6 transition disabled:opacity-50 flex items-center gap-1.5 shadow-sm hover:shadow-md active:scale-98"
                      >
                        {submitting ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          <>
                            <Send className="h-3.5 w-3.5" />
                            Submit Final Application
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </motion.div>
              ) : (
                /* ACTIVE APPLICATION JOURNEY TRACKING (Task 49.3) */
                <motion.div
                  key="journey-tracking"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-6"
                >
                  {/* Status Banner */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Application Identification ID</div>
                      <div className="text-base font-extrabold font-mono text-slate-900">{activeApplication.id}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-500">Recruit Status:</span>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${
                        getStatusMetadata(activeApplication.status).color
                      }`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {getStatusMetadata(activeApplication.status).text}
                      </span>
                    </div>
                  </div>

                  {/* Tab Navigation (Task 50) */}
                  <div className="flex border border-slate-200 bg-white rounded-xl p-1 gap-1 shadow-xs">
                    <button
                      type="button"
                      onClick={() => setActiveTab('status')}
                      className={`flex-1 py-2 px-3 text-xs font-bold transition-all rounded-lg flex items-center justify-center gap-1.5 ${
                        activeTab === 'status'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <Award className="h-4 w-4" />
                      My Status & Journey
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('messages')}
                      className={`flex-1 py-2 px-3 text-xs font-bold transition-all rounded-lg flex items-center justify-center gap-1.5 ${
                        activeTab === 'messages'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <MessageSquare className="h-4 w-4" />
                      Communication Center
                      {notifications.filter(n => !n.read).length > 0 && (
                        <span className="bg-rose-500 text-white rounded-full px-1.5 py-0.5 text-[9px] font-bold">
                          {notifications.filter(n => !n.read).length}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('rules')}
                      className={`flex-1 py-2 px-3 text-xs font-bold transition-all rounded-lg flex items-center justify-center gap-1.5 ${
                        activeTab === 'rules'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      <BookOpen className="h-4 w-4" />
                      Code of Conduct
                    </button>
                  </div>

                  {/* TAB 1: STATUS & JOURNEY */}
                  {activeTab === 'status' && (
                    <div className="space-y-6">
                      {activeApplication.status === 'JOINED' ? (
                        /* ============================================================ */
                        /* TASK 51: MEMBER-FACING EXPERIENCE & ONBOARDING LIFECYCLE      */
                        /* ============================================================ */
                        <div className="space-y-6">
                          {/* 1. Welcome & Access Card */}
                          <div className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50/50 via-white to-emerald-50/20 p-6 shadow-xs space-y-4">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div className="flex items-center gap-3">
                                <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                                  <Award className="h-6 w-6" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="text-base font-extrabold text-slate-900">
                                      Welcome to the Community, {discordUsername}!
                                    </h3>
                                    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                      <ShieldCheck className="h-3 w-3" />
                                      VERIFIED MEMBER
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-600 mt-1">
                                    {welcomeGreeting || 'Your recruitment was successful and your community membership is now active.'}
                                  </p>
                                </div>
                              </div>

                              <div className="text-right text-xs">
                                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Member Activated</div>
                                <div className="font-semibold text-slate-800 mt-0.5">
                                  {lifecycleProfile?.activatedAt ? new Date(lifecycleProfile.activatedAt).toLocaleDateString() : 'Active'}
                                </div>
                              </div>
                            </div>

                            {/* Access & Role Status Breakdown */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                              <div className="rounded-lg bg-white border border-slate-200 p-3 text-xs space-y-1">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                                  Server Access
                                </div>
                                <div className="font-bold text-emerald-700 flex items-center gap-1">
                                  <span>✓</span> Discord Guild Joined
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  Verified via Bot Gateway
                                </div>
                              </div>

                              <div className="rounded-lg bg-white border border-slate-200 p-3 text-xs space-y-1">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                  <UserCheck className="h-3.5 w-3.5 text-indigo-600" />
                                  Role Status
                                </div>
                                <div className="font-bold text-slate-800">
                                  {lifecycleProfile?.roleAssignmentStatus === 'ASSIGNED' ? (
                                    <span className="text-emerald-700 flex items-center gap-1">
                                      <span>✓</span> {lifecycleProfile.roleNameSnapshot || 'Member Role Granted'}
                                    </span>
                                  ) : lifecycleProfile?.roleAssignmentStatus === 'BOT_PERMISSIONS_REQUIRED' ? (
                                    <span className="text-amber-700">Bot Role Permissions Required</span>
                                  ) : (
                                    <span className="text-slate-700">Standard Member Tier Active</span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400">
                                  Standard community access tier
                                </div>
                              </div>

                              <div className="rounded-lg bg-white border border-slate-200 p-3 text-xs space-y-1">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                                  Recruiter Attribution
                                </div>
                                <div className="font-bold text-slate-800 truncate">
                                  {journeyStatus?.recruiterAttribution?.recruiterCode ? (
                                    <span>Code: <span className="font-mono text-indigo-600">{journeyStatus.recruiterAttribution.recruiterCode}</span></span>
                                  ) : (
                                    <span>Organic / Direct</span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {recruiterName ? `Recruiter: ${recruiterName}` : 'Attributed to Sourcing'}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* 2. Member Onboarding Checklist (Task 51.5) */}
                          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
                              <div>
                                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                  <CheckCircle2 className="h-4 w-4 text-indigo-600" />
                                  Community Onboarding Checklist
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Complete these recommended milestones to get the most out of your membership.
                                </p>
                              </div>

                              {memberChecklist?.items && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-slate-700">
                                    {memberChecklist.items.filter((i: any) => i.status === 'COMPLETED').length} of{' '}
                                    {memberChecklist.items.filter((i: any) => i.status !== 'NOT_CONFIGURED').length} completed
                                  </span>
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    {memberChecklist.status}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Checklist Items List */}
                            <div className="space-y-3">
                              {(memberChecklist?.items || [
                                { key: 'rules', title: 'Read and acknowledge community guidelines', status: rulesInfo?.acknowledged ? 'COMPLETED' : 'IN_PROGRESS', required: true },
                                { key: 'profile', title: 'Complete your community profile and roles', status: 'IN_PROGRESS', required: false },
                                { key: 'introduction', title: 'Introduce yourself in the introductions channel', status: 'NOT_STARTED', required: false },
                                { key: 'channel_visit', title: 'Explore recommended community discussion channels', status: 'NOT_STARTED', required: false },
                                { key: 'events_review', title: 'Review upcoming community calendar & voice events', status: 'NOT_STARTED', required: false },
                              ]).map((item: any) => {
                                const isCompleted = item.status === 'COMPLETED';
                                const isBlocked = item.status === 'BLOCKED';
                                const isNotConfigured = item.status === 'NOT_CONFIGURED';

                                return (
                                  <div
                                    key={item.key}
                                    className={`rounded-lg border p-3.5 flex flex-wrap items-center justify-between gap-3 transition-colors ${
                                      isCompleted
                                        ? 'border-emerald-100 bg-emerald-50/30'
                                        : isBlocked
                                        ? 'border-rose-100 bg-rose-50/20'
                                        : isNotConfigured
                                        ? 'border-slate-100 bg-slate-50/50 opacity-60'
                                        : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                                  >
                                    <div className="flex items-start gap-3">
                                      <div className="mt-0.5">
                                        {isCompleted ? (
                                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                        ) : isBlocked ? (
                                          <AlertCircle className="h-5 w-5 text-rose-500" />
                                        ) : isNotConfigured ? (
                                          <Info className="h-5 w-5 text-slate-400" />
                                        ) : (
                                          <Clock className="h-5 w-5 text-indigo-600" />
                                        )}
                                      </div>
                                      <div className="space-y-0.5">
                                        <div className="flex items-center gap-2">
                                          <span className={`text-xs font-bold ${isCompleted ? 'text-slate-800 line-through text-slate-500' : 'text-slate-900'}`}>
                                            {item.title}
                                          </span>
                                          {item.required && (
                                            <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                              Required
                                            </span>
                                          )}
                                        </div>
                                        {item.description && (
                                          <p className="text-[11px] text-slate-500">{item.description}</p>
                                        )}
                                        {item.completedAt && (
                                          <div className="text-[10px] text-emerald-600 font-medium">
                                            Completed on {new Date(item.completedAt).toLocaleDateString()}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                          isCompleted
                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                            : item.status === 'IN_PROGRESS'
                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                            : isBlocked
                                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                                            : isNotConfigured
                                            ? 'bg-slate-50 text-slate-500 border-slate-200'
                                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                        }`}
                                      >
                                        {item.status}
                                      </span>

                                      {!isCompleted && !isNotConfigured && !isBlocked && (
                                        item.key === 'rules' ? (
                                          <button
                                            type="button"
                                            onClick={() => setActiveTab('rules')}
                                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1 rounded-md transition"
                                          >
                                            View Guidelines
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            disabled={completingItemKey === item.key}
                                            onClick={() => handleCompleteChecklistItem(item.key)}
                                            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1 rounded-md transition disabled:opacity-50 flex items-center gap-1"
                                          >
                                            {completingItemKey === item.key ? (
                                              <RefreshCw className="h-3 w-3 animate-spin" />
                                            ) : (
                                              <span>✓</span>
                                            )}
                                            Mark Done
                                          </button>
                                        )
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* 3. Upcoming Community Events (Task 51.14) */}
                          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                              <div>
                                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                  <Calendar className="h-4 w-4 text-indigo-600" />
                                  Upcoming Community Events
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Surface community gatherings, voice hangouts, and stage events. Participation is always voluntary.
                                </p>
                              </div>
                              <span className="text-xs font-bold text-slate-400">
                                {upcomingEvents.length} Event{upcomingEvents.length === 1 ? '' : 's'}
                              </span>
                            </div>

                            {upcomingEvents.length > 0 ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {upcomingEvents.map((evt: any) => (
                                  <div
                                    key={evt.id}
                                    className="rounded-lg border border-slate-200 p-4 space-y-2 hover:border-indigo-200 transition-colors bg-white"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="space-y-0.5">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                                          {evt.type || 'COMMUNITY EVENT'}
                                        </span>
                                        <h4 className="text-xs font-bold text-slate-900 mt-1">{evt.title}</h4>
                                      </div>
                                      <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                                        {evt.startTime ? new Date(evt.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'TBD'}
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-500 line-clamp-2">{evt.description}</p>
                                    <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-100">
                                      <span className="text-[11px] text-slate-400">
                                        {evt.channelName ? `#${evt.channelName}` : 'Discord Voice / Stage'}
                                      </span>
                                      <span className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer">
                                        Event Info →
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="rounded-lg bg-slate-50 border border-slate-100 p-5 text-center space-y-1">
                                <Calendar className="h-6 w-6 text-slate-400 mx-auto" />
                                <div className="text-xs font-bold text-slate-700">No Upcoming Events Right Now</div>
                                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                                  Check the community announcements channel in Discord for scheduled stage talks, game nights, and voice hangouts.
                                </p>
                              </div>
                            )}
                          </div>

                          {/* 4. Early Engagement Ledger & Retention Health (Tasks 51.6, 51.7 & 51.8) */}
                          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
                            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                              <Sparkles className="h-4 w-4 text-emerald-600" />
                              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                Member Health & Engagement Activity
                              </h4>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-1">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                  Early Activity
                                </div>
                                <div className="text-sm font-black text-slate-800">
                                  {lifecycleProfile?.firstMessageAt ? 'Active Participant' : 'Ready to Connect'}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {lifecycleProfile?.firstMessageAt
                                    ? `First message: ${new Date(lifecycleProfile.firstMessageAt).toLocaleDateString()}`
                                    : 'Join a conversation in general chat'}
                                </div>
                              </div>

                              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-1">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                  Channels Explored
                                </div>
                                <div className="text-sm font-black text-slate-800">
                                  {lifecycleProfile?.channelsVisited?.length || 1} Channel{(lifecycleProfile?.channelsVisited?.length || 1) === 1 ? '' : 's'}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  Verified channel interactions
                                </div>
                              </div>

                              <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-1">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                  Health Status
                                </div>
                                <div className="text-sm font-black text-emerald-600 flex items-center gap-1">
                                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                  {lifecycleProfile?.retentionStatus || 'HEALTHY'}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  Authoritative activity tracking
                                </div>
                              </div>
                            </div>

                            <div className="text-[11px] text-slate-400 italic pt-1">
                              Note: All metrics reflect real, non-fabricated Discord activity recorded via authoritative member lifecycle events.
                            </div>
                          </div>

                          {/* 5. Recommended Actions */}
                          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
                            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                              <ChevronRight className="h-4 w-4 text-indigo-600" />
                              Recommended Actions
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/50 space-y-1">
                                <div className="font-bold text-slate-800">Say Hello</div>
                                <p className="text-slate-500 text-[11px]">Drop an intro in the introductions channel to meet fellow members.</p>
                              </div>
                              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/50 space-y-1">
                                <div className="font-bold text-slate-800">Review Guidelines</div>
                                <p className="text-slate-500 text-[11px]">Keep our community safe and respectful by reading the Code of Conduct.</p>
                              </div>
                              <div className="p-3 rounded-lg border border-slate-100 bg-slate-50/50 space-y-1">
                                <div className="font-bold text-slate-800">Explore Discussions</div>
                                <p className="text-slate-500 text-[11px]">Jump into active voice stages and topic channels in Discord.</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* CANDIDATE EVALUATION & JOIN PIPELINE */
                        <div className="space-y-6">
                      {/* Active State Highlight (Task 50.1) */}
                      {getComputedStateMetadata(computePortalState()) && (
                        <div className="rounded-xl border border-indigo-100 bg-indigo-50/20 p-5 flex items-start gap-4">
                          <div className="h-10 w-10 rounded-full bg-indigo-100/50 flex items-center justify-center shrink-0">
                            {renderStateIcon(computePortalState())}
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-bold text-slate-900">{getComputedStateMetadata(computePortalState())?.title}</h4>
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold border ${getComputedStateMetadata(computePortalState())?.badge.color}`}>
                                {getComputedStateMetadata(computePortalState())?.badge.text}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 leading-relaxed">{getComputedStateMetadata(computePortalState())?.description}</p>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider pt-1">
                              Next Action: <span className="text-indigo-600 font-extrabold">{getComputedStateMetadata(computePortalState())?.actionText}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 11-State Recruitment Journey Roadmap */}
                      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 mb-4">
                      <Award className="h-4 w-4 text-indigo-600" />
                      Recruitment Process Checklist
                    </h3>

                    {/* Progress Checklist Steps */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="rounded-lg bg-emerald-50/50 border border-emerald-100 p-3 text-xs flex gap-2.5">
                        <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                        <div>
                          <div className="font-bold text-slate-800">1. Apply</div>
                          <div className="text-slate-500 mt-0.5">Form and referral code submitted in system</div>
                        </div>
                      </div>

                      <div className={`rounded-lg border p-3 text-xs flex gap-2.5 ${
                        activeApplication.status === 'REJECTED'
                          ? 'border-rose-100 bg-rose-50/50'
                          : ['SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFORMATION_REQUIRED', 'ADDITIONAL_INFO_REQUIRED', 'INTERVIEW'].includes(activeApplication.status)
                          ? 'border-indigo-100 bg-indigo-50/50'
                          : 'border-emerald-100 bg-emerald-50/50'
                      }`}>
                        {activeApplication.status === 'REJECTED' ? (
                          <AlertCircle className="h-5 w-5 text-rose-600 mt-0.5 shrink-0" />
                        ) : ['SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFORMATION_REQUIRED', 'ADDITIONAL_INFO_REQUIRED', 'INTERVIEW'].includes(activeApplication.status) ? (
                          <Clock className="h-5 w-5 text-indigo-600 mt-0.5 shrink-0 animate-pulse" />
                        ) : (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                        )}
                        <div>
                          <div className="font-bold text-slate-800">2. Staff Evaluation</div>
                          <div className="text-slate-500 mt-0.5">
                            {activeApplication.status === 'REJECTED'
                              ? 'Declined'
                              : ['SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_INFORMATION_REQUIRED', 'ADDITIONAL_INFO_REQUIRED'].includes(activeApplication.status)
                              ? 'Responses are being scored'
                              : 'Approved by reviewers'}
                          </div>
                        </div>
                      </div>

                      <div className={`rounded-lg border p-3 text-xs flex gap-2.5 ${
                        activeApplication.status === 'JOINED'
                          ? 'border-emerald-100 bg-emerald-50/50'
                          : ['APPROVED', 'JOIN_PENDING'].includes(activeApplication.status)
                          ? 'border-indigo-100 bg-indigo-50/50'
                          : 'border-slate-100 bg-slate-50 opacity-50'
                      }`}>
                        {activeApplication.status === 'JOINED' ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                        ) : (
                          <ExternalLink className="h-5 w-5 text-slate-400 mt-0.5 shrink-0" />
                        )}
                        <div>
                          <div className="font-bold text-slate-800">3. Server Entrance</div>
                          <div className="text-slate-500 mt-0.5">Verified member join & welcoming</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Benefit / Reward Visibility Card (Task 50.16) */}
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                      <Award className="h-4 w-4 text-emerald-600" />
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Eligible Recruitment Benefits & Rewards</h4>
                    </div>
                    <p className="text-xs text-slate-500">
                      Referral status and reward eligibility is locked directly to your verification status.
                    </p>
                    
                    {journeyStatus?.recruiterAttribution ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between text-xs p-3 rounded-lg bg-slate-50 border border-slate-100 flex-wrap gap-2">
                          <div>
                            <div className="font-bold text-slate-800">Referral Reward (Code: <span className="font-mono text-indigo-600">{journeyStatus.recruiterAttribution.recruiterCode}</span>)</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">Recruiter ID: {journeyStatus.recruiterAttribution.recruiterDiscordId || 'Verified Community Recruiter'}</div>
                          </div>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold border ${
                            journeyStatus.recruiterAttribution.referralStatus === 'RECRUITMENT_SUCCESSFUL' || activeApplication.status === 'JOINED'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}>
                            {journeyStatus.recruiterAttribution.referralStatus || 'PENDING'}
                          </span>
                        </div>

                        {/* Reward Timeline / Progress */}
                        <div className="grid grid-cols-5 gap-1 pt-1">
                          {[
                            { label: 'Applied', status: 'PENDING', active: true },
                            { label: 'Reviewed', status: 'PENDING', active: ['SUBMITTED', 'UNDER_REVIEW', 'INTERVIEW', 'APPROVED', 'JOIN_PENDING', 'JOINED', 'RECRUITMENT_SUCCESSFUL'].includes(activeApplication.status) },
                            { label: 'Verified Join', status: 'AVAILABLE', active: ['JOINED', 'RECRUITMENT_SUCCESSFUL'].includes(activeApplication.status) },
                            { label: 'Onboarded', status: 'CLAIMED', active: ['ONBOARDING_PENDING', 'RECRUITMENT_SUCCESSFUL'].includes(activeApplication.status) || (activeApplication.status === 'JOINED' && journeyStatus.rulesAcknowledgementStatus === 'ACKNOWLEDGED') },
                            { label: 'Fulfilled', status: 'FULFILLED', active: activeApplication.status === 'JOINED' && journeyStatus.journeyState === 'COMPLETED' }
                          ].map((step, idx) => (
                            <div key={idx} className="text-center">
                              <div className={`h-1.5 rounded-full ${step.active ? 'bg-emerald-500' : 'bg-slate-100'}`} />
                              <div className="text-[9px] font-semibold text-slate-500 mt-1 truncate">{step.label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic p-3 rounded-lg bg-slate-50 border border-slate-100 text-center">
                        No active referral reward code applied. Apply a referral code during draft setup to track custom reward eligibility.
                      </div>
                    )}
                  </div>

                  {/* CENTRAL TAB SWITCHER LOGIC */}

                  {/* 1. UNDER_REVIEW / SUBMITTED SUB-VIEW */}
                  {(activeApplication.status === 'SUBMITTED' || activeApplication.status === 'UNDER_REVIEW') && (
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs text-center max-w-lg mx-auto space-y-4">
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                        <Clock className="h-6 w-6 animate-spin" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-900">Application Under Direct Review</h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Your application has been received and logged onto the recruitment system. Referees, scores, and blacklist checks have run smoothly. Please allow up to 24 hours for staff response.
                      </p>
                    </div>
                  )}

                  {/* 2. REJECTED STATE */}
                  {activeApplication.status === 'REJECTED' && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50/30 p-6 shadow-xs max-w-xl mx-auto space-y-4 text-center">
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                        <AlertCircle className="h-6 w-6" />
                      </div>
                      <h4 className="text-sm font-bold text-rose-950">Application Status Update</h4>
                      <p className="text-xs text-rose-800 leading-relaxed">
                        Thank you for applying. After reviewing your response against current community standards, we are unable to accept your application at this time.
                      </p>
                      {activeApplication.rejectionReason && (
                        <div className="rounded-lg border border-rose-200 bg-white p-3.5 text-xs text-rose-950 font-medium max-w-md mx-auto italic">
                          "Feedback: {activeApplication.rejectionReason}"
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3. ADDITIONAL INFO REQUIRED SUB-VIEW (Task 49.3) */}
                  {(activeApplication.status === 'ADDITIONAL_INFORMATION_REQUIRED' || activeApplication.status === 'ADDITIONAL_INFO_REQUIRED') && (
                    <div className="rounded-xl border border-indigo-200 bg-white p-6 shadow-sm space-y-5">
                      <div className="flex gap-3">
                        <div className="h-10 w-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                          <Info className="h-5 w-5 animate-pulse" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-indigo-950">Additional Information Required</h4>
                          <p className="text-xs text-slate-500">
                            The reviewers have flagged your application as requiring supplementary details or attachments before a final decision can be made.
                          </p>
                        </div>
                      </div>

                      {activeApplication.missingInformation && (
                        <div className="rounded-lg bg-amber-50 border border-amber-200/60 p-4 text-xs text-amber-900 space-y-1.5">
                          <strong className="block font-bold">Specific request from staff:</strong>
                          <ul className="list-disc pl-4 space-y-1">
                            {Array.isArray(activeApplication.missingInformation) ? (
                              activeApplication.missingInformation.map((info: string, idx: number) => (
                                <li key={idx}>{info}</li>
                              ))
                            ) : (
                              <li>{activeApplication.missingInformation}</li>
                            )}
                          </ul>
                        </div>
                      )}

                      <form onSubmit={handleAdditionalInfoSubmit} className="space-y-4 border-t border-slate-100 pt-4">
                        <div className="space-y-1.5">
                          <label className="block text-xs font-bold text-slate-700">
                            Type your supplemental response below:
                          </label>
                          <textarea
                            rows={3}
                            required
                            value={additionalAnswers[0].answerText}
                            onChange={(e) => setAdditionalAnswers([{ ...additionalAnswers[0], answerText: e.target.value }])}
                            placeholder="Type supplementary descriptions, portfolios, or required credentials..."
                            className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-indigo-500 focus:outline-hidden"
                          />
                        </div>

                        {/* Interactive drag-and-drop file upload simulator */}
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-slate-700">
                            Upload Requested Document / Resume (Simulation)
                          </label>
                          <div
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition ${
                              isDragging
                                ? 'border-indigo-500 bg-indigo-50/50'
                                : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50/50'
                            }`}
                          >
                            <input
                              type="file"
                              ref={fileInputRef}
                              onChange={handleFileSelect}
                              className="hidden"
                            />
                            <div className="space-y-2">
                              <UploadCloud className="h-8 w-8 text-slate-400 mx-auto" />
                              <div className="text-xs font-bold text-slate-700">
                                Drag and drop your file, or <span className="text-indigo-600">browse local files</span>
                              </div>
                              <p className="text-[10px] text-slate-400">PDF, DOCX, or PNG formats supported (up to 10MB)</p>
                            </div>
                          </div>

                          {selectedFile && (
                            <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <FileCode className="h-4 w-4 text-emerald-600" />
                                <span className="text-xs font-bold text-slate-800">{selectedFile.name}</span>
                                <span className="text-[10px] text-slate-400">({selectedFile.size})</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSelectedFile(null)}
                                className="text-[10px] text-rose-500 font-bold hover:underline"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>

                        {additionalMessage && (
                          <div className={`rounded-lg p-3.5 text-xs font-medium ${
                            additionalMessage.startsWith('Success')
                              ? 'bg-emerald-50 border border-emerald-100 text-emerald-800'
                              : 'bg-rose-50 border border-rose-100 text-rose-800'
                          }`}>
                            {additionalMessage}
                          </div>
                        )}

                        <div className="flex justify-end pt-2">
                          <button
                            type="submit"
                            disabled={submittingAdditional}
                            className="flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-5 transition disabled:opacity-50"
                          >
                            {submittingAdditional ? (
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            Submit Missing Details
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* 4. INTERVIEW DETAILS PANEL (Task 49.3) */}
                  {(activeApplication.status === 'INTERVIEW' || activeApplication.status === 'SCHEDULED') && (
                    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
                      <div className="border-b border-slate-100 pb-4">
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <Calendar className="h-5 w-5 text-indigo-600" />
                          Private Recruitment Interview Scheduled
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Staff have approved you for the private panel evaluation.
                        </p>
                      </div>

                      {loadingInterviews ? (
                        <div className="py-4 text-center text-slate-400 text-xs">
                          <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2" />
                          Loading scheduled details...
                        </div>
                      ) : interviews.length > 0 ? (
                        interviews.map((iv) => (
                          <div key={iv.id} className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="rounded-xl border border-indigo-100 bg-indigo-50/20 p-4 space-y-4">
                              <div className="space-y-1">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Scheduled Interview Time</span>
                                <span className="text-sm font-bold text-slate-800 block">
                                  {iv.scheduledTime ? new Date(iv.scheduledTime).toLocaleString() : 'Date/Time TBD'}
                                </span>
                              </div>

                              <div className="space-y-1">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Google Calendar Invitation</span>
                                {iv.googleCalendarEventLink ? (
                                  <a
                                    href={iv.googleCalendarEventLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:underline"
                                  >
                                    <span>Accept Invitation & Open Calendar</span>
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                ) : (
                                  <span className="text-xs text-slate-500 italic block">Generating Calendar Event Link...</span>
                                )}
                              </div>
                            </div>

                            <div className="space-y-3">
                              <h5 className="text-xs font-bold text-slate-800">Preparation Directives</h5>
                              <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4 leading-relaxed">
                                <li>Ensure your Discord microphone and webcam (optional) are fully configured.</li>
                                <li>Have your portfolio references or developer code credentials readily accessible.</li>
                                <li>The interview thread is hosted safely inside a secure private channel.</li>
                                <li>Please join the Discord voice chamber at least 5 minutes prior to start.</li>
                              </ul>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-lg bg-slate-50 border border-slate-100 p-4 text-center text-xs text-slate-500">
                          Your interview is currently being scheduled on the Calendar. Please watch for a Discord DM invite.
                        </div>
                      )}
                    </div>
                  )}

                  {/* 5. APPROVED / JOIN_PENDING STATE - JOIN CONVERGENCE (Task 49.6) */}
                  {(activeApplication.status === 'APPROVED' || activeApplication.status === 'JOIN_PENDING') && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/20 p-6 shadow-sm space-y-5 text-center max-w-xl mx-auto">
                      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-xs animate-bounce">
                        <CheckCircle2 className="h-8 w-8" />
                      </div>
                      <div className="space-y-2">
                        <h4 className="text-lg font-black text-emerald-950">Congratulations Alex!</h4>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Your recruitment request has been authorized by <strong>{recruiterName}</strong>! Please join our verified Discord guild below to receive your role credentials and begin onboarding.
                        </p>
                      </div>

                      {/* Authoritative Server Membership Verification Check */}
                      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 text-left shadow-xs">
                        <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <Bot className="h-4 w-4 text-indigo-600" />
                          Authoritative Discord Server Join Check
                        </h5>
                        <p className="text-[11px] text-slate-500">
                          Clicking verification will check your actual Discord profile presence on our server. If you have not joined the guild yet, please use your Discord invite token before verifying.
                        </p>

                        <button
                          onClick={handleVerifyDiscordJoin}
                          disabled={joiningServer}
                          className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 px-4 transition disabled:opacity-50 shadow-xs hover:shadow-md"
                        >
                          {joiningServer ? (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              Verifying server presence with bot gateway...
                            </>
                          ) : (
                            <>
                              <ExternalLink className="h-4 w-4" />
                              Verify Discord Server Join (Authoritative Bot Call)
                            </>
                          )}
                        </button>

                        {verificationError && (
                          <div className="rounded-lg bg-rose-50 border border-rose-100 p-3 text-xs text-rose-800 font-medium">
                            Verification error: {verificationError}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: CANDIDATE COMMUNICATION CENTER */}
                  {activeTab === 'messages' && (
                    <div className="space-y-6">
                      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-6">
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-indigo-600" />
                            Chronological Communication Log
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            All candidate notifications, status assessments, and panel reviews are audited and archived here.
                          </p>
                        </div>

                        <div className="relative border-l-2 border-slate-100 pl-6 ml-3 space-y-6">
                          {getTimelineCommunications().map((item, idx) => (
                            <div key={item.id || idx} className="relative">
                              {/* Circle indicator */}
                              <span className={`absolute -left-[32px] top-1.5 h-4 w-4 rounded-full border-4 border-white flex items-center justify-center ${
                                item.status === 'SUCCESS' 
                                  ? 'bg-emerald-500' 
                                  : item.status === 'ACTION_REQUIRED' 
                                  ? 'bg-amber-500' 
                                  : 'bg-indigo-500'
                              }`} />
                              
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-4 flex-wrap">
                                  <span className="text-xs font-bold text-slate-900">{item.title}</span>
                                  <span className="text-[10px] text-slate-400 font-medium font-mono bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">{item.timestamp}</span>
                                </div>
                                <p className="text-xs text-slate-600 leading-relaxed">{item.message}</p>
                              </div>
                            </div>
                          ))}

                          {getTimelineCommunications().length === 0 && (
                            <div className="text-xs text-slate-500 italic text-center py-4">No logged communications recorded yet.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: COMMUNITY CODE OF CONDUCT */}
                  {activeTab === 'rules' && (
                    <div className="space-y-6">
                      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
                        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                          <div className="h-10 w-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                            <BookOpen className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-900">Community Rules & Guidelines</h3>
                            <p className="text-xs text-slate-500">
                              Our Code of Conduct regulates server decorum, anti-harassment standards, and recruitment procedures.
                            </p>
                          </div>
                        </div>

                        {/* Rules Body text rendering */}
                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-3 max-h-[300px] overflow-y-auto text-xs leading-relaxed text-slate-700">
                          {rulesInfo?.rulesText ? (
                            rulesInfo.rulesText.split('\n\n').map((para, idx) => (
                              <p key={idx} className="whitespace-pre-wrap">{para}</p>
                            ))
                          ) : (
                            <p className="italic text-slate-400 text-center py-4">Loading community code of conduct regulations...</p>
                          )}
                        </div>

                        {/* Signature/Acknowledgment form */}
                        <div className="border-t border-slate-100 pt-5">
                          {rulesInfo?.acknowledged || journeyStatus?.rulesAcknowledgementStatus === 'ACKNOWLEDGED' ? (
                            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3">
                              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                              <div className="text-xs">
                                <div className="font-bold text-emerald-900">Code of Conduct Signed & Registered</div>
                                <div className="text-emerald-700 mt-0.5">Your signature is active. Acknowledged on: {rulesInfo?.acknowledgedAt ? new Date(rulesInfo.acknowledgedAt).toLocaleString() : 'System Check Completed'}</div>
                              </div>
                            </div>
                          ) : activeApplication.status === 'JOINED' || computePortalState() === 'ONBOARDING_PENDING' ? (
                            <div className="space-y-4">
                              <p className="text-xs text-slate-600">
                                To unlock full roles, server access, and receive recruitment confirmation, please confirm you have read and agreed to the guidelines above.
                              </p>
                              
                              <button
                                type="button"
                                onClick={handleAcknowledgeRules}
                                disabled={acknowledgingRules}
                                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2.5 px-5 transition disabled:opacity-50"
                              >
                                {acknowledgingRules ? (
                                  <>
                                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                    Signing...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="h-4 w-4" />
                                    Acknowledge Rules & Sign Guidelines
                                  </>
                                )}
                              </button>
                            </div>
                          ) : (
                            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 flex items-center gap-3 text-xs text-amber-900">
                              <Info className="h-5 w-5 text-amber-600 shrink-0" />
                              <div>
                                <span className="font-bold">Guidelines Signature Locked:</span> You must first join our verified Discord server and complete automated join check-in to enable Code of Conduct signature.
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      )}
    </div>
  );
};
