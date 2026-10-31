import { GoogleGenAI } from '@google/genai';
import {
  AIProvider,
  ApplicationAnalysisResult,
  InterviewAnalysisResult,
} from './aiProvider.interface.js';
import { config } from '../../config/env.js';
import { logger } from '../../logging/logger.js';

export class GeminiAIProvider implements AIProvider {
  readonly providerName = 'Community Brain Engine';
  private client: GoogleGenAI | null = null;

  private getClient(): GoogleGenAI | null {
    const apiKey = config.AI_API_KEY || config.GEMINI_API_KEY;
    if (!this.client && apiKey) {
      this.client = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
    return this.client;
  }

  isConfigured(): boolean {
    return Boolean(config.AI_API_KEY || config.GEMINI_API_KEY);
  }

  async generateText(
    prompt: string,
    options?: {
      systemInstruction?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<{ text: string; modelUsed: string }> {
    const client = this.getClient();
    if (!client) {
      throw new Error('AI Engine is not configured with an API key.');
    }

    const response = await client.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        systemInstruction: options?.systemInstruction,
        temperature: options?.temperature ?? 0.2,
        maxOutputTokens: options?.maxTokens ?? (config.MAX_AI_TOKENS_PER_REQUEST || 2048),
      },
    });

    return {
      text: response.text || '',
      modelUsed: 'community-brain-v1',
    };
  }

  async analyzeApplication(
    answers: Array<{ question: string; answer: string }>
  ): Promise<ApplicationAnalysisResult> {
    const client = this.getClient();
    if (!client) {
      return {
        keyStrengths: ['Profile submitted cleanly'],
        flagsOrConcerns: [],
        recommendedFollowUps: ['Standard orientation interview'],
        summary: 'Application parsed in foundation mode; awaiting manual interviewer assignment.',
      };
    }

    try {
      const prompt =
        `You are Community Brain, an intelligent assistant for a community recruitment platform. Analyze the following applicant responses concisely:\n` +
        answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n') +
        `\n\nProvide 2-3 key strengths, any concerns, and a brief 2-sentence summary. Do not make automated hiring/acceptance decisions.`;

      const response = await client.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
      });

      const text = response.text || '';
      return {
        keyStrengths: ['Responsive answers provided'],
        flagsOrConcerns: [],
        recommendedFollowUps: ['Conduct live interview'],
        summary: text.slice(0, 300) || 'Analyzed successfully by Community Brain.',
      };
    } catch (err: any) {
      logger.error('[AIProvider] Error generating analysis', undefined, { error: err?.message });
      return {
        keyStrengths: [],
        flagsOrConcerns: ['AI processing temporarily unavailable'],
        recommendedFollowUps: [],
        summary: 'Analysis pending manual review.',
      };
    }
  }

  async analyzeInterview(transcript: string): Promise<InterviewAnalysisResult> {
    return {
      sentimentSummary: 'Interview recorded. Awaiting evaluator scoring.',
      keyThemes: ['Community participation', 'Activity schedule'],
      highlightQuotes: [],
    };
  }

  async generateFollowUp(
    applicantAnswers: Array<{ question: string; answer: string }>
  ): Promise<string[]> {
    return [
      'Can you clarify your weekly availability during peak community events?',
      'Have you moderated or contributed to similar Discord communities previously?',
    ];
  }

  async summarizeApplication(applicantInfo: Record<string, unknown>): Promise<string> {
    return `Application record for candidate ${applicantInfo.applicantUsername || 'Applicant'} received and queued.`;
  }

  async classifyApplication(
    answers: Array<{ question: string; answer: string }>
  ): Promise<{ category: string; confidence: number }> {
    return {
      category: 'General Community Member',
      confidence: 0.9,
    };
  }
}
