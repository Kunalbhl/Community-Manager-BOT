import {
  ApplicationDocument,
} from '../../shared/types/models.js';
import { applicationsRepository } from '../repositories/index.js';
import { quotaService } from './quota.service.js';
import { auditService } from './audit.service.js';
import { BadRequestError, NotFoundError } from '../utils/errors.js';
import { UserRole } from '../../shared/types/rbac.js';

export interface AiScreeningResult {
  confidenceScore: number;
  recommendation: 'APPROVE' | 'INTERVIEW' | 'REJECT' | 'MANUAL_REVIEW_REQUIRED';
  cautionSignals: string[];
  summary: string;
  missingItems: string[];
  label: 'AI_ANALYSIS';
}

export class AiReviewService {
  /**
   * Performs an AI-assisted intake screening of an application.
   * STRICT SEPARATION: AI analysis provides advisory insights only.
   * It NEVER replaces human reviewer authorization or alters human decisions.
   */
  async analyzeApplication(
    communityId: string,
    applicationId: string,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string
  ): Promise<AiScreeningResult> {
    const app = await applicationsRepository.getById(applicationId);
    if (!app || app.communityId !== communityId) {
      throw new NotFoundError(`Application ${applicationId} not found in community ${communityId}`);
    }

    // 1. Enforce Free-First AI Quota
    const quotaCheck = quotaService.consumeQuota('aiRequests', communityId);
    if (!quotaCheck.allowed) {
      throw new BadRequestError(quotaCheck.message || 'Daily AI request quota reached.');
    }

    const answers = app.answers || [];
    const questions = app.questions || [];

    const missingItems: string[] = [];
    const cautionSignals: string[] = [];

    // Analyze answer completeness
    let answeredCount = 0;
    for (const q of questions) {
      const ans = answers.find((a) => a.questionId === q.questionId);
      if (!ans || !ans.answerText || ans.answerText.trim() === '' || ans.answerText === 'N/A') {
        if (q.isRequired) {
          missingItems.push(`Unanswered required question: "${q.questionText}"`);
        }
      } else {
        answeredCount++;
        // Content length and quality heuristics
        if (ans.answerText.trim().length < 5) {
          cautionSignals.push(`Very brief response to "${q.questionText}"`);
        }
      }
    }

    const totalQuestions = Math.max(questions.length, 1);
    const completenessRatio = answeredCount / totalQuestions;
    const confidenceScore = Math.round(completenessRatio * 100);

    let recommendation: 'APPROVE' | 'INTERVIEW' | 'REJECT' | 'MANUAL_REVIEW_REQUIRED' = 'MANUAL_REVIEW_REQUIRED';
    if (missingItems.length > 0) {
      recommendation = 'MANUAL_REVIEW_REQUIRED';
    } else if (cautionSignals.length > 2) {
      recommendation = 'INTERVIEW';
    } else if (confidenceScore >= 80) {
      recommendation = 'APPROVE';
    } else {
      recommendation = 'INTERVIEW';
    }

    const summary = `AI intake screening evaluated ${answeredCount}/${totalQuestions} answered questions. Overall completeness score is ${confidenceScore}%.`;

    const aiAnalysisResult: AiScreeningResult = {
      confidenceScore,
      recommendation,
      cautionSignals,
      summary,
      missingItems,
      label: 'AI_ANALYSIS',
    };

    // Persist analysis onto application document
    await applicationsRepository.update(applicationId, {
      aiAnalysis: aiAnalysisResult,
      aiScreeningScore: confidenceScore,
      updatedAt: new Date().toISOString(),
    });

    // Record audit trail
    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'APPLICATION_STATUS_CHANGED',
      targetType: 'application',
      targetId: applicationId,
      metadata: {
        analysisType: 'AI_SCREENING',
        confidenceScore,
        recommendation,
        cautionSignalsCount: cautionSignals.length,
      },
      requestId,
    });

    return aiAnalysisResult;
  }
}

export const aiReviewService = new AiReviewService();
