import {
  InterviewDocument,
  InterviewStatus,
  InterviewSessionDocument,
  InterviewParticipant,
  InterviewIntroductionConfig,
  QuestionInputType,
} from '../../shared/types/models.js';
import { UserRole } from '../../shared/types/rbac.js';
import {
  interviewsRepository,
  interviewSessionsRepository,
  interviewIntroductionsRepository,
  applicationsRepository,
  communitiesRepository,
} from '../repositories/index.js';
import { communityQuestionsService } from './communityQuestions.service.js';
import { notificationService } from './notification.service.js';
import { auditService } from './audit.service.js';
import { resolveUserCommunityRole } from './authorization.service.js';
import { discordService } from '../integrations/discord/discord.service.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors.js';

export interface ScheduleInterviewInput {
  communityId: string;
  applicationId: string;
  applicantDiscordUserId: string;
  interviewerUserId: string;
  interviewerDiscordUserId?: string;
  scheduledTime?: string;
  customQuestions?: Array<{
    questionId: string;
    questionText: string;
    questionType: QuestionInputType;
  }>;
  actorRole: UserRole;
}

export interface CompleteInterviewInput {
  interviewId: string;
  communityId: string;
  interviewerUserId: string;
  answers?: Array<{
    questionId: string;
    questionText: string;
    answerText: string;
  }>;
  notes?: string;
  transcriptSummary?: string;
  sentimentNotes?: string;
  actorRole: UserRole;
}

export interface JoinInterviewInput {
  interviewId: string;
  communityId?: string;
  discordUserId?: string;
  userId?: string;
  username?: string;
  displayName?: string;
  explicitRoleIds?: string[];
  userRoles?: string[];
  requestId?: string;
}

export interface LeaveInterviewInput {
  interviewId: string;
  communityId?: string;
  discordUserId?: string;
  userId?: string;
  requestId?: string;
}

export class InterviewService {
  /**
   * Schedules a real interview session for an application.
   */
  async scheduleInterview(
    input: ScheduleInterviewInput,
    requestId?: string
  ): Promise<{
    interview: InterviewDocument;
    discordChannelStatus: 'CREATED' | 'PERMISSION_REQUIRED' | 'DISCORD_LIMITATION' | 'NOT_CONFIGURED';
  }> {
    const {
      communityId,
      applicationId,
      applicantDiscordUserId,
      interviewerUserId,
      interviewerDiscordUserId,
      scheduledTime,
      actorRole,
    } = input;

    const app = await applicationsRepository.getById(applicationId);
    if (!app || app.communityId !== communityId) {
      throw new NotFoundError(`APPLICATION_NOT_FOUND: Application ${applicationId} not found in this community.`);
    }

    // Resolve questions: custom or configured interview questions
    let interviewQuestions = input.customQuestions || [];
    if (interviewQuestions.length === 0) {
      const configured = await communityQuestionsService.listInterviewQuestions(communityId);
      interviewQuestions = configured.map((q) => ({
        questionId: q.id,
        questionText: q.questionText,
        questionType: 'SHORT_TEXT',
      }));
    }

    const now = new Date().toISOString();

    // Check Discord capabilities for creating interview channel / thread
    let discordChannelStatus: 'CREATED' | 'PERMISSION_REQUIRED' | 'DISCORD_LIMITATION' | 'NOT_CONFIGURED' = 'NOT_CONFIGURED';
    let discordChannelId: string | undefined = undefined;

    const isConnected = discordService.isConnected();
    if (isConnected) {
      discordChannelStatus = 'PERMISSION_REQUIRED';
    } else {
      discordChannelStatus = 'NOT_CONFIGURED';
    }

    const interviewDoc = await interviewsRepository.create({
      communityId,
      applicationId,
      applicantDiscordUserId,
      applicantDiscordId: applicantDiscordUserId,
      interviewerUserId,
      interviewerDiscordUserId: interviewerDiscordUserId || 'disc_interviewer',
      scheduledTime: scheduledTime || now,
      scheduledAt: scheduledTime || now,
      status: 'SCHEDULED',
      questions: interviewQuestions,
      answers: [],
      notes: '',
      discordChannelId,
      participants: [],
      createdAt: now,
      updatedAt: now,
    });

    // Update application status to INTERVIEW_SCHEDULED
    await applicationsRepository.update(applicationId, {
      status: 'INTERVIEW_SCHEDULED',
      updatedAt: now,
    });

    // Audit log
    await auditService.record({
      communityId,
      actorUserId: interviewerUserId,
      actorRole,
      action: 'INTERVIEW_SCHEDULED',
      targetType: 'interview',
      targetId: interviewDoc.id,
      metadata: {
        applicationId,
        applicantDiscordUserId,
        scheduledTime: scheduledTime || now,
        questionsCount: interviewQuestions.length,
      },
      requestId,
    });

    // Notifications
    await notificationService.send({
      communityId,
      recipientUserId: app.applicantUserId,
      recipientDiscordId: applicantDiscordUserId,
      type: 'INTERVIEW_SCHEDULED',
      channel: 'DISCORD_DM',
      title: 'Interview Scheduled with {{recruiterName}}',
      body: `Hi {{applicantName}},\n\nYour recruitment interview has been scheduled for ${scheduledTime || 'soon'}. An interviewer will contact you.`,
      templateVariables: {
        applicantName: app.applicantUsernameSnapshot || app.applicantUsername,
        applicationId,
      },
    });

    return {
      interview: interviewDoc,
      discordChannelStatus,
    };
  }

  /**
   * Starts an in-progress interview.
   */
  async startInterview(
    interviewId: string,
    communityId: string,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<InterviewDocument> {
    const interview = await interviewsRepository.getById(interviewId);
    if (!interview || interview.communityId !== communityId) {
      throw new NotFoundError(`INTERVIEW_NOT_FOUND: Interview ${interviewId} not found.`);
    }

    const now = new Date().toISOString();
    const updated = await interviewsRepository.update(interviewId, {
      status: 'IN_PROGRESS',
      startedAt: now,
      updatedAt: now,
    });

    // Ensure session exists
    await this.createOrGetInterviewSession(interviewId, communityId);

    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'INTERVIEW_STARTED',
      targetType: 'interview',
      targetId: interviewId,
      metadata: { applicationId: interview.applicationId },
      requestId,
    });

    return updated;
  }

  /**
   * Retrieves or initializes an InterviewSessionDocument for multi-participant tracking.
   */
  async createOrGetInterviewSession(
    interviewId: string,
    communityId: string
  ): Promise<InterviewSessionDocument> {
    const existing = await interviewSessionsRepository.getById(interviewId);
    if (existing && existing.communityId === communityId) {
      return existing;
    }

    const interview = await interviewsRepository.getById(interviewId);
    if (!interview) {
      throw new NotFoundError(`INTERVIEW_NOT_FOUND: Interview ${interviewId} not found.`);
    }

    const community = await communitiesRepository.getById(communityId);
    const now = new Date().toISOString();

    const sessionDoc: InterviewSessionDocument = {
      id: interviewId,
      sessionId: interviewId,
      interviewId,
      applicationId: interview.applicationId,
      candidateId: interview.applicantDiscordId || interview.applicantDiscordUserId || 'unknown',
      communityId,
      guildId: community?.guildId || 'unknown',
      channelId: interview.discordChannelId,
      threadId: interview.discordThreadId,
      status: 'IN_PROGRESS',
      startedAt: interview.startedAt || now,
      participants: interview.participants || [],
      createdAt: now,
      updatedAt: now,
    };

    return interviewSessionsRepository.create(sessionDoc);
  }

  /**
   * Resolves the configured introduction message for an authorized authority.
   * Order: User-Specific -> Role-Specific -> Community Default -> Standard Template.
   */
  async resolveIntroductionMessage(
    communityId: string,
    discordUserId: string,
    effectiveRole: UserRole,
    displayName?: string,
    applicantName?: string
  ): Promise<string> {
    const name = displayName || 'Staff Member';
    const roleName = effectiveRole.charAt(0) + effectiveRole.slice(1).toLowerCase().replace('_', ' ');
    const candidateName = applicantName || 'Audit Applicant';

    let introTemplate: string | null = null;

    try {
      const configDoc = await interviewIntroductionsRepository.getById(communityId);
      const conf = (configDoc as any)?.config || configDoc;
      if (conf) {
        const userMap = conf.userOverrides || conf.userSpecific;
        const roleMap = conf.roleTemplates || conf.roleDefaults;
        const commDef = conf.communityDefaultTemplate || conf.communityDefault;

        if (userMap && userMap[discordUserId]) {
          introTemplate = userMap[discordUserId];
        } else if (roleMap && roleMap[effectiveRole]) {
          introTemplate = roleMap[effectiveRole];
        } else if (commDef) {
          introTemplate = commDef;
        }
      }
    } catch {
      // Fallback if no custom config stored
    }

    if (!introTemplate) {
      introTemplate = `Hello, I'm {{name}}.\nI'm joining this interview as a {{role}}.\n\nI'll be participating in the recruitment discussion today.\nPlease answer the questions clearly and honestly.`;
    }

    return introTemplate
      .replace(/\{\{?name\}?\}/g, name)
      .replace(/\{\{?role\}?\}/g, roleName)
      .replace(/\{\{?displayName\}?\}/g, candidateName)
      .replace(/\{\{?applicantName\}?\}/g, candidateName)
      .replace(/\{\{?communityName\}?\}/g, 'our community');
  }

  /**
   * Authoritatively joins a live interview session.
   * Performs server-side role resolution, ensures idempotency, and records audit trails.
   */
  async joinInterview(
    input: JoinInterviewInput
  ): Promise<{
    joined: boolean;
    effectiveRole: UserRole;
    totalParticipants: number;
    interview: InterviewDocument;
    session: InterviewSessionDocument;
    participant: InterviewParticipant;
    announcementMessage: string;
    introductionMessage: string;
    isFirstJoin: boolean;
  }> {
    const { interviewId, username, displayName, requestId } = input;
    const discordUserId = input.discordUserId || input.userId || 'unknown';
    const explicitRoleIds = input.explicitRoleIds || input.userRoles;

    const interview = await interviewsRepository.getById(interviewId);
    if (!interview) {
      throw new NotFoundError(`INTERVIEW_NOT_FOUND: Interview ${interviewId} not found.`);
    }

    const communityId = input.communityId || interview.communityId;
    if (interview.communityId !== communityId) {
      throw new NotFoundError(`INTERVIEW_NOT_FOUND: Interview ${interviewId} not found in this community.`);
    }

    // Authoritative Server-Side Role Check
    const access = await resolveUserCommunityRole(discordUserId, communityId, explicitRoleIds);
    const authorizedRoles: UserRole[] = ['PLATFORM_OWNER', 'OWNER', 'CONTROLLER', 'INTERVIEWER'];

    if (!authorizedRoles.includes(access.role)) {
      // Record permission denied audit event
      await auditService.record({
        communityId,
        actorUserId: `usr_${discordUserId}`,
        discordUserId,
        actorRole: access.role,
        effectiveRole: access.role,
        action: 'PERMISSION_DENIED',
        targetType: 'interview',
        targetId: interviewId,
        metadata: {
          attemptedAction: 'JOIN_INTERVIEW',
          reason: 'Insufficient role hierarchy authority',
          discordUserId,
        },
        requestId,
      });

      throw new ForbiddenError(
        `PERMISSION_REQUIRED: Only authorized interviewers, controllers, and administrators can join live interview sessions.`
      );
    }

    const session = await this.createOrGetInterviewSession(interviewId, communityId);
    const now = new Date().toISOString();
    const effectiveName = displayName || username || 'Staff Member';

    // Resolve Introduction Message
    const candidateName = interview.candidateName || interview.applicantDiscordId || 'Audit Applicant';
    const introMsg = await this.resolveIntroductionMessage(
      communityId,
      discordUserId,
      access.role,
      effectiveName,
      candidateName
    );

    // Check if participant is already actively joined (Idempotency)
    const existingIndex = (session.participants || []).findIndex((p) => p.discordUserId === discordUserId || p.userId === discordUserId || p.userId === `usr_${discordUserId}`);
    if (existingIndex >= 0 && session.participants[existingIndex].isActive) {
      const activeParticipant = session.participants[existingIndex];
      return {
        joined: true,
        effectiveRole: access.role,
        totalParticipants: (session.participants || []).filter((p) => p.isActive).length,
        interview,
        session,
        participant: activeParticipant,
        announcementMessage: introMsg,
        introductionMessage: activeParticipant.introductionMessage || introMsg,
        isFirstJoin: false,
      };
    }

    const newParticipant: InterviewParticipant = {
      userId: `usr_${discordUserId}`,
      discordUserId,
      username: username || effectiveName,
      displayName: effectiveName,
      role: access.role,
      joinedAt: now,
      isActive: true,
      introductionMessage: introMsg,
      introductionSent: true,
    };

    let updatedParticipants: InterviewParticipant[] = [];
    if (existingIndex >= 0) {
      updatedParticipants = [...session.participants];
      updatedParticipants[existingIndex] = newParticipant;
    } else {
      updatedParticipants = [...(session.participants || []), newParticipant];
    }

    // Persist to session repository
    const updatedSession = await interviewSessionsRepository.update(interviewId, {
      participants: updatedParticipants,
      status: 'IN_PROGRESS',
      updatedAt: now,
    });

    // Also update interview document participants
    const updatedInterview = await interviewsRepository.update(interviewId, {
      participants: updatedParticipants,
      status: interview.status === 'SCHEDULED' ? 'IN_PROGRESS' : interview.status,
      updatedAt: now,
    });

    // Record authoritative audit trail
    await auditService.record({
      communityId,
      guildId: session.guildId,
      actorUserId: `usr_${discordUserId}`,
      discordUserId,
      actorRole: access.role,
      effectiveRole: access.role,
      action: 'INTERVIEW_JOIN',
      targetType: 'interview',
      targetId: interviewId,
      metadata: {
        username,
        displayName: effectiveName,
        role: access.role,
        source: 'AUTHORITATIVE_DISCORD_JOIN',
        participantsCount: updatedParticipants.filter((p) => p.isActive).length,
      },
      requestId,
    });

    return {
      joined: true,
      effectiveRole: access.role,
      totalParticipants: updatedParticipants.filter((p) => p.isActive).length,
      interview: updatedInterview,
      session: updatedSession,
      participant: newParticipant,
      announcementMessage: introMsg,
      introductionMessage: introMsg,
      isFirstJoin: true,
    };
  }

  /**
   * Leaves an ongoing live interview session.
   */
  async leaveInterview(
    input: LeaveInterviewInput
  ): Promise<{
    left: boolean;
    remainingParticipants: number;
    interview: InterviewDocument;
    session: InterviewSessionDocument;
    participant?: InterviewParticipant;
    announcementMessage: string;
  }> {
    const { interviewId, requestId } = input;
    const discordUserId = input.discordUserId || input.userId || '';

    const interview = await interviewsRepository.getById(interviewId);
    if (!interview) {
      throw new NotFoundError(`INTERVIEW_NOT_FOUND: Interview ${interviewId} not found.`);
    }

    const communityId = input.communityId || interview.communityId;
    if (interview.communityId !== communityId) {
      throw new NotFoundError(`INTERVIEW_NOT_FOUND: Interview ${interviewId} not found in this community.`);
    }

    const session = await this.createOrGetInterviewSession(interviewId, communityId);
    const now = new Date().toISOString();

    const participants = session.participants || [];
    const index = participants.findIndex((p) => p.discordUserId === discordUserId || p.userId === discordUserId || p.userId === `usr_${discordUserId}`);

    if (index === -1) {
      return {
        left: true,
        remainingParticipants: participants.filter((p) => p.isActive).length,
        interview,
        session,
        announcementMessage: `User was not active in the interview session.`,
      };
    }

    const leavingParticipant = {
      ...participants[index],
      isActive: false,
      leftAt: now,
    };

    const updatedParticipants = [...participants];
    updatedParticipants[index] = leavingParticipant;

    const updatedSession = await interviewSessionsRepository.update(interviewId, {
      participants: updatedParticipants,
      updatedAt: now,
    });

    const updatedInterview = await interviewsRepository.update(interviewId, {
      participants: updatedParticipants,
      updatedAt: now,
    });

    const announcementMessage = `${leavingParticipant.displayName || leavingParticipant.username} has left the interview.`;

    // Record leave audit trail
    await auditService.record({
      communityId,
      guildId: session.guildId,
      actorUserId: `usr_${discordUserId}`,
      discordUserId,
      actorRole: leavingParticipant.role,
      effectiveRole: leavingParticipant.role,
      action: 'INTERVIEW_LEAVE',
      targetType: 'interview',
      targetId: interviewId,
      metadata: {
        username: leavingParticipant.username,
        displayName: leavingParticipant.displayName,
        role: leavingParticipant.role,
        remainingActiveCount: updatedParticipants.filter((p) => p.isActive).length,
      },
      requestId,
    });

    return {
      left: true,
      remainingParticipants: updatedParticipants.filter((p) => p.isActive).length,
      interview: updatedInterview,
      session: updatedSession,
      participant: leavingParticipant,
      announcementMessage,
    };
  }

  /**
   * Retrieves live interview participants and session details.
   */
  async getInterviewSession(
    interviewId: string,
    communityId?: string
  ): Promise<InterviewSessionDocument & { activeEvaluators: InterviewParticipant[]; totalHistoricalParticipants: number }> {
    let resolvedCommId = communityId;
    if (!resolvedCommId) {
      const interview = await interviewsRepository.getById(interviewId);
      resolvedCommId = interview?.communityId || 'default';
    }
    const session = await this.createOrGetInterviewSession(interviewId, resolvedCommId);
    return {
      ...session,
      activeEvaluators: (session.participants || []).filter((p) => p.isActive).map((p) => ({
        ...p,
        userId: p.discordUserId || p.userId.replace('usr_', ''),
      })),
      totalHistoricalParticipants: (session.participants || []).length,
    };
  }

  /**
   * Gets the configured interview introductions for a community.
   */
  async getIntroductionsConfig(
    communityId: string
  ): Promise<InterviewIntroductionConfig> {
    const doc = await interviewIntroductionsRepository.getById(communityId);
    return (
      doc?.config || {
        communityDefault: `Hello, I'm {{name}}.\nI'm joining this interview as a {{role}}.\n\nI'll be participating in the recruitment discussion today.\nPlease answer the questions clearly and honestly.`,
        roleDefaults: {},
        userSpecific: {},
      }
    );
  }

  /**
   * Saves or updates interview introductions config for a community.
   */
  async updateIntroductionsConfig(
    communityId: string,
    config: InterviewIntroductionConfig,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<InterviewIntroductionConfig> {
    const isAllowed = ['PLATFORM_OWNER', 'OWNER', 'CONTROLLER'].includes(actorRole);
    if (!isAllowed) {
      throw new ForbiddenError(
        'PERMISSION_REQUIRED: Only controllers and administrators can configure interview introductions.'
      );
    }

    const existing = await interviewIntroductionsRepository.getById(communityId);
    if (existing) {
      await interviewIntroductionsRepository.update(communityId, {
        communityId,
        config,
      });
    } else {
      await interviewIntroductionsRepository.create({
        id: communityId,
        communityId,
        config,
      });
    }

    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'COMMUNITY_SETTINGS_CHANGED',
      targetType: 'interviewIntroductions',
      targetId: communityId,
      metadata: { updatedSections: Object.keys(config) },
      requestId,
    });

    return config;
  }

  /**
   * Completes an interview and stores authentic evaluator feedback & answers.
   */
  async completeInterview(
    input: CompleteInterviewInput,
    requestId?: string
  ): Promise<InterviewDocument> {
    const {
      interviewId,
      communityId,
      interviewerUserId,
      answers,
      notes,
      transcriptSummary,
      sentimentNotes,
      actorRole,
    } = input;

    const interview = await interviewsRepository.getById(interviewId);
    if (!interview || interview.communityId !== communityId) {
      throw new NotFoundError(`INTERVIEW_NOT_FOUND: Interview ${interviewId} not found.`);
    }

    const now = new Date().toISOString();
    const updated = await interviewsRepository.update(interviewId, {
      status: 'COMPLETED',
      answers: answers || interview.answers || [],
      notes: notes || interview.notes,
      transcriptSummary: transcriptSummary || interview.transcriptSummary,
      sentimentNotes: sentimentNotes || interview.sentimentNotes,
      completedAt: now,
      updatedAt: now,
    });

    // Update application to INTERVIEW_COMPLETED
    await applicationsRepository.update(interview.applicationId, {
      status: 'INTERVIEW_COMPLETED',
      reviewerNotes: notes || interview.notes,
      updatedAt: now,
    });

    // Close session
    try {
      await interviewSessionsRepository.update(interviewId, {
        status: 'COMPLETED',
        updatedAt: now,
      });
    } catch {
      // Session might not be initialized
    }

    // Audit log
    await auditService.record({
      communityId,
      actorUserId: interviewerUserId,
      actorRole,
      action: 'INTERVIEW_COMPLETED',
      targetType: 'interview',
      targetId: interviewId,
      metadata: {
        applicationId: interview.applicationId,
        answersRecorded: (answers || []).length,
      },
      requestId,
    });

    // Notification
    await notificationService.send({
      communityId,
      recipientUserId: interview.applicantDiscordId ? `usr_${interview.applicantDiscordId}` : 'usr_applicant',
      recipientDiscordId: interview.applicantDiscordId,
      type: 'INTERVIEW_COMPLETED',
      channel: 'DISCORD_DM',
      title: 'Interview Completed',
      body: 'Hi, your recruitment evaluation has been completed and submitted for final review.',
    });

    return updated;
  }

  /**
   * Cancels an interview.
   */
  async cancelInterview(
    interviewId: string,
    communityId: string,
    actorUserId: string,
    actorRole: UserRole,
    reason?: string,
    requestId?: string
  ): Promise<InterviewDocument> {
    const interview = await interviewsRepository.getById(interviewId);
    if (!interview || interview.communityId !== communityId) {
      throw new NotFoundError(`INTERVIEW_NOT_FOUND: Interview ${interviewId} not found.`);
    }

    const now = new Date().toISOString();
    const updated = await interviewsRepository.update(interviewId, {
      status: 'CANCELLED',
      notes: reason ? `Cancelled: ${reason}` : 'Cancelled by administrator',
      updatedAt: now,
    });

    try {
      await interviewSessionsRepository.update(interviewId, {
        status: 'CLOSED',
        updatedAt: now,
      });
    } catch {
      // Ignore if session does not exist
    }

    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'INTERVIEW_CANCELLED',
      targetType: 'interview',
      targetId: interviewId,
      metadata: { reason },
      requestId,
    });

    return updated;
  }
}

export const interviewService = new InterviewService();
