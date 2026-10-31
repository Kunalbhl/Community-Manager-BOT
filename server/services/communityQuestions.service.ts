import {
  ApplicationQuestion,
  InterviewQuestion,
  CommunityGuideline,
  QuestionInputType,
} from '../../shared/types/models.js';
import { UserRole } from '../../shared/types/rbac.js';
import {
  applicationQuestionsRepository,
  interviewQuestionsRepository,
  communityGuidelinesRepository,
} from '../repositories/index.js';
import { auditService } from './audit.service.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';

export class CommunityQuestionsService {
  // ==========================================
  // APPLICATION QUESTIONS
  // ==========================================

  async listApplicationQuestions(communityId: string): Promise<ApplicationQuestion[]> {
    const list = await applicationQuestionsRepository.listForTenant(communityId);
    return list.sort((a, b) => a.order - b.order);
  }

  async createApplicationQuestion(
    communityId: string,
    params: {
      questionText: string;
      type: QuestionInputType;
      options?: string[];
      required?: boolean;
      order?: number;
      guidance?: string;
    },
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<ApplicationQuestion> {
    if (!params.questionText || !params.questionText.trim()) {
      throw new BadRequestError('Question text is required');
    }

    const now = new Date().toISOString();
    const created = await applicationQuestionsRepository.create({
      communityId,
      questionText: params.questionText.trim(),
      type: params.type,
      options: params.options || [],
      required: params.required !== false,
      order: params.order || 0,
      enabled: true,
      guidance: params.guidance?.trim(),
      createdAt: now,
      updatedAt: now,
    });

    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'COMMUNITY_SETTINGS_CHANGED',
      targetType: 'application_question',
      targetId: created.id,
      metadata: { questionText: created.questionText, type: created.type },
      requestId,
    });

    return created;
  }

  async deleteApplicationQuestion(
    communityId: string,
    questionId: string,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<void> {
    const question = await applicationQuestionsRepository.getById(questionId);
    if (!question || question.communityId !== communityId) {
      throw new NotFoundError('Application question not found');
    }

    await applicationQuestionsRepository.delete(questionId);

    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'COMMUNITY_SETTINGS_CHANGED',
      targetType: 'application_question',
      targetId: questionId,
      metadata: { action: 'DELETED' },
      requestId,
    });
  }

  // ==========================================
  // INTERVIEW QUESTIONS
  // ==========================================

  async listInterviewQuestions(communityId: string): Promise<InterviewQuestion[]> {
    const list = await interviewQuestionsRepository.listForTenant(communityId);
    return list.sort((a, b) => a.order - b.order);
  }

  async createInterviewQuestion(
    communityId: string,
    params: {
      stageName: string;
      questionText: string;
      scoringCriteria?: string;
      required?: boolean;
      order?: number;
    },
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<InterviewQuestion> {
    if (!params.questionText || !params.questionText.trim()) {
      throw new BadRequestError('Interview question text is required');
    }

    const now = new Date().toISOString();
    const created = await interviewQuestionsRepository.create({
      communityId,
      stageName: params.stageName?.trim() || 'General Interview',
      questionText: params.questionText.trim(),
      scoringCriteria: params.scoringCriteria?.trim(),
      required: params.required !== false,
      order: params.order || 0,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    return created;
  }

  async deleteInterviewQuestion(
    communityId: string,
    questionId: string,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<void> {
    const question = await interviewQuestionsRepository.getById(questionId);
    if (!question || question.communityId !== communityId) {
      throw new NotFoundError('Interview question not found');
    }

    await interviewQuestionsRepository.delete(questionId);

    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'COMMUNITY_SETTINGS_CHANGED',
      targetType: 'interview_question',
      targetId: questionId,
      metadata: { action: 'DELETED' },
      requestId,
    });
  }

  // ==========================================
  // COMMUNITY GUIDELINES
  // ==========================================

  async listGuidelines(communityId: string): Promise<CommunityGuideline[]> {
    const list = await communityGuidelinesRepository.listForTenant(communityId);
    return list.sort((a, b) => a.order - b.order);
  }

  async addGuideline(
    communityId: string,
    params: {
      title: string;
      category: 'RULE' | 'REQUIREMENT' | 'STANDARDS' | 'DISQUALIFYING' | 'ONBOARDING';
      description: string;
      order?: number;
    }
  ): Promise<CommunityGuideline> {
    if (!params.title || !params.title.trim()) {
      throw new BadRequestError('Guideline title is required');
    }

    return communityGuidelinesRepository.create({
      communityId,
      title: params.title.trim(),
      category: params.category,
      description: params.description?.trim() || '',
      order: params.order || 0,
      enabled: true,
    });
  }

  /**
   * Retrieves formulated guidelines for applicant assistant communication.
   * Never fabricates rules if none exist.
   */
  async getGuidelinesSummary(communityId: string): Promise<string> {
    const guidelines = await this.listGuidelines(communityId);
    if (guidelines.length === 0) {
      return 'No additional community-specific guideline has been configured.';
    }

    return guidelines
      .filter((g) => g.enabled)
      .map((g) => `• [${g.category}] ${g.title}: ${g.description}`)
      .join('\n');
  }
}

export const communityQuestionsService = new CommunityQuestionsService();
