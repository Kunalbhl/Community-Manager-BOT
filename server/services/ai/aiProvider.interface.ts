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

export interface AIProvider {
  /**
   * Safe provider identification name (e.g. "Community Brain Engine")
   */
  readonly providerName: string;

  /**
   * Checks whether the underlying provider has required credentials
   */
  isConfigured(): boolean;

  /**
   * Generates text content given a user prompt and optional parameters
   */
  generateText(
    prompt: string,
    options?: {
      systemInstruction?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<{ text: string; modelUsed: string }>;

  /**
   * Analyzes an applicant response questionnaire
   */
  analyzeApplication?(
    answers: Array<{ question: string; answer: string }>
  ): Promise<ApplicationAnalysisResult>;

  /**
   * Analyzes an interview transcript
   */
  analyzeInterview?(transcript: string): Promise<InterviewAnalysisResult>;

  /**
   * Generates recommended follow-up questions
   */
  generateFollowUp?(
    applicantAnswers: Array<{ question: string; answer: string }>
  ): Promise<string[]>;

  /**
   * Summarizes applicant details
   */
  summarizeApplication?(applicantInfo: Record<string, unknown>): Promise<string>;

  /**
   * Classifies application responses
   */
  classifyApplication?(
    answers: Array<{ question: string; answer: string }>
  ): Promise<{ category: string; confidence: number }>;
}
