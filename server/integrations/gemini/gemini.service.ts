import { communityBrainService } from '../../services/ai/communityBrain.service.js';
import {
  ApplicationAnalysisResult,
  InterviewAnalysisResult,
} from './gemini.interface.js';

export class GeminiService {
  isConfigured(): boolean {
    return communityBrainService.isConfigured();
  }

  async analyzeApplication(
    answers: Array<{ question: string; answer: string }>
  ): Promise<ApplicationAnalysisResult> {
    return communityBrainService.analyzeApplication(answers);
  }

  async analyzeInterview(transcript: string): Promise<InterviewAnalysisResult> {
    return communityBrainService.analyzeInterview(transcript);
  }

  async generateFollowUp(
    applicantAnswers: Array<{ question: string; answer: string }>
  ): Promise<string[]> {
    return communityBrainService.generateFollowUp(applicantAnswers);
  }

  async summarizeApplication(applicantInfo: Record<string, unknown>): Promise<string> {
    return communityBrainService.summarizeApplication(applicantInfo);
  }

  async classifyApplication(
    answers: Array<{ question: string; answer: string }>
  ): Promise<{ category: string; confidence: number }> {
    return communityBrainService.classifyApplication(answers);
  }
}

export const geminiService = new GeminiService();
