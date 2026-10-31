export interface ApplicationAnalysisResult {
  screeningScore?: number;
  keyStrengths: string[];
  flagsOrConcerns: string[];
  recommendedFollowUps: string[];
  summary: string;
}

export interface InterviewAnalysisResult {
  sentimentSummary: string;
  keyThemes: string[];
  suggestedScore?: number;
  highlightQuotes: string[];
}

export interface IGeminiService {
  isConfigured(): boolean;
  analyzeApplication(answers: Array<{ question: string; answer: string }>): Promise<ApplicationAnalysisResult>;
  analyzeInterview(transcript: string): Promise<InterviewAnalysisResult>;
  generateFollowUp(applicantAnswers: Array<{ question: string; answer: string }>): Promise<string[]>;
  summarizeApplication(applicantInfo: Record<string, unknown>): Promise<string>;
  classifyApplication(answers: Array<{ question: string; answer: string }>): Promise<{ category: string; confidence: number }>;
}
