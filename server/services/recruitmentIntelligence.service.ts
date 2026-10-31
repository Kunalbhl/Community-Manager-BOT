import { GoogleGenAI, Type } from '@google/genai';
import {
  applicationsRepository,
  interviewsRepository,
  recruitmentScoreConfigsRepository,
  savedRecruitmentSegmentsRepository,
  recruitmentCampaignsRepository,
  recruitmentAlertsRepository,
  aiCandidateSummariesRepository,
  rulesAcknowledgementsRepository,
  auditLogsRepository,
  versionedApplicationFormsRepository,
  recruitersRepository,
  recruiterCodesRepository,
  referralsRepository,
  recruiterGoalsRepository,
  recruitmentRewardsRepository,
  memberHandoffsRepository,
  earlyEngagementEventsRepository,
} from '../repositories/index.js';
import {
  ApplicationDocument,
  InterviewDocument,
  RecruitmentScoreBreakdown,
  RecruitmentScoreConfig,
  ScoreSignal,
  SavedRecruitmentSegment,
  RecruitmentCampaign,
  RecruitmentAlert,
  AiCandidateSummaryDoc,
  TalentPoolCategory,
  VersionedApplicationForm,
  ScreeningQuestion,
  RecruiterDocument,
  ReferralDocument,
  RecruitmentReward,
  RecruiterGoal,
  RecruiterRole,
  RecruiterStatus,
  ReferralStatus,
  RewardType,
  GoalStatus,
  GoalTargetType,
} from '../../shared/types/models.js';
import { logger } from '../logging/logger.js';
import { auditService } from './audit.service.js';
import { UserRole } from '../../shared/types/rbac.js';

// Initialize Gemini Client Lazily if API key is present
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    try {
      aiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
      logger.info('Gemini API client initialized successfully for Recruitment Intelligence.');
    } catch (err: any) {
      logger.error('Failed to initialize Gemini API client:', undefined, { error: err.message });
    }
  }
  return aiClient;
}

export class RecruitmentIntelligenceService {
  /**
   * Default Score Config Weights (sums to 100)
   */
  private getDefaultWeights() {
    return {
      applicationQuality: 15,
      completeness: 15,
      interviewPerformance: 20,
      recruiterConfidence: 10,
      referralSignal: 10,
      discordVerification: 10,
      engagementEvidence: 10,
      communityFit: 10,
    };
  }

  /**
   * Retrieves the recruitment score config for a community or initializes defaults
   */
  async getScoreConfig(communityId: string): Promise<RecruitmentScoreConfig> {
    try {
      const config = await recruitmentScoreConfigsRepository.getById(communityId);
      if (config) return config;
    } catch (err) {
      // Not found, will seed below
    }

    const newConfig: RecruitmentScoreConfig = {
      id: communityId,
      communityId,
      weights: this.getDefaultWeights(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'SYSTEM',
    };

    try {
      await recruitmentScoreConfigsRepository.create(newConfig);
    } catch (err) {
      // Multi-request race safety, return default
    }
    return newConfig;
  }

  /**
   * Saves/Updates the recruitment score config for a community
   */
  async updateScoreConfig(
    communityId: string,
    weights: RecruitmentScoreConfig['weights'],
    actorUserId: string,
    actorRole: UserRole
  ): Promise<RecruitmentScoreConfig> {
    const config = await this.getScoreConfig(communityId);
    config.weights = weights;
    config.updatedAt = new Date().toISOString();
    config.updatedBy = actorUserId;

    await recruitmentScoreConfigsRepository.update(communityId, config);

    // Record audit log
    await auditService.record({
      communityId,
      actorUserId,
      actorRole,
      action: 'COMMUNITY_SETTINGS_CHANGED',
      targetType: 'community',
      targetId: communityId,
      metadata: {
        settingType: 'RECRUITMENT_SCORING_WEIGHTS',
        weights,
      },
    });

    // Run async score updates on all active candidates in the background
    this.recalculateAllActiveScores(communityId).catch((err) => {
      logger.error('Background recalculation failed:', undefined, { error: err.message });
    });

    return config;
  }

  /**
   * Background recalculation helper
   */
  private async recalculateAllActiveScores(communityId: string): Promise<void> {
    const apps = await applicationsRepository.listForTenant(communityId);
    const activeApps = apps.filter((a) => a.status !== 'REJECTED' && a.status !== 'JOINED' && a.status !== 'CLOSED');
    logger.info(`Recalculating recruitment scores for ${activeApps.length} active candidates in community ${communityId}`);
    for (const app of activeApps) {
      try {
        await this.calculateRecruitmentScore(communityId, app.id);
      } catch (err: any) {
        logger.error(`Failed to recalculate score for application ${app.id}:`, undefined, { error: err.message });
      }
    }
  }

  /**
   * Calculates a multi-dimensional, evidence-backed candidate score
   */
  async calculateRecruitmentScore(communityId: string, applicationId: string): Promise<RecruitmentScoreBreakdown> {
    const app = await applicationsRepository.getById(applicationId);
    if (!app || app.communityId !== communityId) {
      throw new Error(`Application ${applicationId} not found or tenant mismatch.`);
    }

    // 1. Fetch Interview (if any)
    let interview: InterviewDocument | null = null;
    try {
      const interviews = await interviewsRepository.listForTenant(communityId);
      interview = interviews.find((i) => i.applicationId === applicationId) || null;
    } catch (err) {
      // Ignore
    }

    // 2. Fetch score configuration weights
    const config = await this.getScoreConfig(communityId);
    const weights = config.weights;

    const signals: ScoreSignal[] = [];

    // --- Dimension 1: Completeness ---
    let completenessScore = 100;
    const answered = app.answers?.length || 0;
    const totalQuestions = app.questions?.length || 0;
    if (totalQuestions > 0) {
      completenessScore = Math.round((answered / totalQuestions) * 100);
      signals.push({
        type: completenessScore === 100 ? 'positive' : 'negative',
        dimension: 'Completeness',
        source: 'Application Form',
        message: `Candidate filled ${answered}/${totalQuestions} application questions.`,
        impact: Math.round((completenessScore - 100) * 0.1),
      });
    } else {
      signals.push({
        type: 'missing',
        dimension: 'Completeness',
        source: 'Application Form',
        message: 'No questions set in application form to evaluate completeness.',
        impact: 0,
      });
    }

    // --- Dimension 2: Application Quality ---
    let appQualityScore = 70; // baseline
    const answersText = app.answers?.map((a) => a.answerText || '').join(' ') || '';
    const avgLen = answersText.length / Math.max(answered, 1);
    if (avgLen > 150) {
      appQualityScore = 95;
      signals.push({
        type: 'positive',
        dimension: 'Application Quality',
        source: 'Application Answers',
        message: 'Candidate provided deep, articulate responses (avg response length > 150 chars).',
        impact: 5,
      });
    } else if (avgLen > 50) {
      appQualityScore = 80;
      signals.push({
        type: 'positive',
        dimension: 'Application Quality',
        source: 'Application Answers',
        message: 'Application answers are moderately detailed.',
        impact: 2,
      });
    } else if (avgLen > 0) {
      appQualityScore = 40;
      signals.push({
        type: 'negative',
        dimension: 'Application Quality',
        source: 'Application Answers',
        message: 'Application answers are extremely brief (avg response length < 50 chars).',
        impact: -10,
      });
    }

    // --- Dimension 3: Interview Performance ---
    let interviewScore = 0;
    let hasCompletedInterview = false;
    if (interview && interview.status === 'COMPLETED') {
      hasCompletedInterview = true;
      const notes = (interview.notes || '').toLowerCase();
      const transcript = (interview.transcriptSummary || '').toLowerCase();
      const sentiment = (interview.sentimentNotes || '').toLowerCase();

      // Check keywords for heuristics
      const positiveWords = ['excellent', 'strong', 'impressed', 'passionate', 'qualified', 'great candidate', 'highly skilled'];
      const negativeWords = ['weak', 'unqualified', 'poor', 'struggled', 'not fit', 'concerning', 'unprepared'];

      let positiveCount = 0;
      let negativeCount = 0;

      positiveWords.forEach((w) => {
        if (notes.includes(w) || transcript.includes(w) || sentiment.includes(w)) positiveCount++;
      });
      negativeWords.forEach((w) => {
        if (notes.includes(w) || transcript.includes(w) || sentiment.includes(w)) negativeCount++;
      });

      if (positiveCount > negativeCount) {
        interviewScore = 90;
        signals.push({
          type: 'positive',
          dimension: 'Interview Performance',
          source: 'Interview Logs',
          message: `Interview completed with highly positive feedback/notes (Sentiment Score: +${positiveCount}).`,
          impact: 8,
        });
      } else if (negativeCount > positiveCount) {
        interviewScore = 40;
        signals.push({
          type: 'negative',
          dimension: 'Interview Performance',
          source: 'Interview Logs',
          message: `Interview logged with several caution areas or concerns (Issues Score: -${negativeCount}).`,
          impact: -15,
        });
      } else {
        interviewScore = 75;
        signals.push({
          type: 'positive',
          dimension: 'Interview Performance',
          source: 'Interview Logs',
          message: 'Interview completed with standard neutral-to-positive feedback.',
          impact: 0,
        });
      }
    } else {
      signals.push({
        type: 'missing',
        dimension: 'Interview Performance',
        source: 'Interview Logs',
        message: interview ? `Interview status is currently "${interview.status}".` : 'No interview scheduled or logged yet.',
        impact: 0,
      });
    }

    // --- Dimension 4: Recruiter Confidence ---
    let recruiterConfidence = 70; // default
    if (app.reviewerNotes) {
      const notesLower = app.reviewerNotes.toLowerCase();
      if (notesLower.includes('vouch') || notesLower.includes('must hire') || notesLower.includes('excellent fit')) {
        recruiterConfidence = 95;
        signals.push({
          type: 'positive',
          dimension: 'Recruiter Confidence',
          source: 'Reviewer Notes',
          message: 'Recruiter / reviewer notes show exceptionally high confidence and direct recommendations.',
          impact: 6,
        });
      } else if (notesLower.includes('concerned') || notesLower.includes('skeptical') || notesLower.includes('hesitant')) {
        recruiterConfidence = 40;
        signals.push({
          type: 'negative',
          dimension: 'Recruiter Confidence',
          source: 'Reviewer Notes',
          message: 'Recruiter expressed concerns or hesitancies in the review logs.',
          impact: -10,
        });
      }
    }

    // --- Dimension 5: Referral Signal ---
    let referralSignal = 0;
    if (app.recruiterCodeUsed || app.recruiterDiscordUserId || app.referralId) {
      referralSignal = 100;
      signals.push({
        type: 'positive',
        dimension: 'Referral Signal',
        source: 'Referral System',
        message: `Referred by active community member (Recruiter Code: ${app.recruiterCodeUsed || 'Direct referral'}).`,
        impact: 8,
      });
    } else {
      signals.push({
        type: 'missing',
        dimension: 'Referral Signal',
        source: 'Referral System',
        message: 'No referral code used. General organic applicant.',
        impact: 0,
      });
    }

    // --- Dimension 6: Discord Verification ---
    let discordVerification = 0;
    if (app.applicantDiscordUserId) {
      discordVerification = 100;
      signals.push({
        type: 'positive',
        dimension: 'Discord Verification',
        source: 'Discord Integration',
        message: 'Applicant Discord OAuth is fully verified and connected.',
        impact: 4,
      });
    } else {
      signals.push({
        type: 'negative',
        dimension: 'Discord Verification',
        source: 'Discord Integration',
        message: 'Discord verification is missing or connection failed.',
        impact: -12,
      });
    }

    // --- Dimension 7: Engagement Evidence ---
    let engagementEvidence = 50; // neutral starting baseline
    try {
      const acks = await rulesAcknowledgementsRepository.listForTenant(communityId);
      const userAcks = acks.filter((x) => x.discordUserId === app.applicantDiscordId);
      if (userAcks.length > 0) {
        engagementEvidence = 90;
        signals.push({
          type: 'positive',
          dimension: 'Engagement Evidence',
          source: 'Community Rules Acknowledgements',
          message: 'Applicant actively read and acknowledged community guidelines and rules.',
          impact: 4,
        });
      }
    } catch (err) {
      // Ignore
    }

    // --- Dimension 8: Community Fit ---
    let communityFit = 70; // baseline default
    const textLower = answersText.toLowerCase();
    if (textLower.includes('help') || textLower.includes('contribute') || textLower.includes('collaborate') || textLower.includes('team')) {
      communityFit = 90;
      signals.push({
        type: 'positive',
        dimension: 'Community Fit',
        source: 'Linguistic Analysis',
        message: 'Applicant answers show collaborative, helpful, team-oriented terminology.',
        impact: 3,
      });
    } else if (textLower.includes('solo') || textLower.includes('myself') || textLower.includes('only me')) {
      communityFit = 50;
      signals.push({
        type: 'review',
        dimension: 'Community Fit',
        source: 'Linguistic Analysis',
        message: 'Applicant responses show high degree of self-centric or individual-only focus.',
        impact: -2,
      });
    }

    // 3. Compile weighted dimensions
    const dims = {
      applicationQuality: appQualityScore,
      completeness: completenessScore,
      interviewPerformance: interviewScore,
      recruiterConfidence,
      referralSignal,
      discordVerification,
      engagementEvidence,
      communityFit,
    };

    // Calculate total weights and score
    let totalScore = 0;
    let totalWeightUsed = 0;

    const keys = Object.keys(weights) as Array<keyof typeof weights>;
    for (const k of keys) {
      const w = weights[k] || 0;
      // If no interview is completed, ignore interviewPerformance weight from computation dynamically to avoid penalizing!
      if (k === 'interviewPerformance' && !hasCompletedInterview) {
        continue;
      }
      totalScore += dims[k] * w;
      totalWeightUsed += w;
    }

    const score = totalWeightUsed > 0 ? Math.round(totalScore / totalWeightUsed) : 70;
    const confidence = hasCompletedInterview ? 95 : 65;

    const breakdown: RecruitmentScoreBreakdown = {
      score,
      confidence,
      signals,
      dimensions: dims,
    };

    // Update applicant record
    await applicationsRepository.update(applicationId, {
      recruitmentScore: score,
      recruitmentScoreBreakdown: breakdown,
      updatedAt: new Date().toISOString(),
    });

    return breakdown;
  }

  /**
   * Generates or retrieves an AI-powered evidence-backed profile summary using Google Gemini
   */
  async getAiSummary(communityId: string, applicationId: string, forceRefresh = false): Promise<AiCandidateSummaryDoc> {
    if (!forceRefresh) {
      try {
        const cached = await aiCandidateSummariesRepository.getById(applicationId);
        if (cached && cached.communityId === communityId) {
          return cached;
        }
      } catch (err) {
        // Not found, will generate
      }
    }

    const app = await applicationsRepository.getById(applicationId);
    if (!app || app.communityId !== communityId) {
      throw new Error(`Application ${applicationId} not found.`);
    }

    let interview: InterviewDocument | null = null;
    try {
      const interviews = await interviewsRepository.listForTenant(communityId);
      interview = interviews.find((i) => i.applicationId === applicationId) || null;
    } catch (err) {
      // Ignore
    }

    const answersList = app.answers?.map((a) => `- Question: "${a.questionText}"\n  Answer: "${a.answerText}"`).join('\n') || 'None';
    const interviewText = interview && interview.status === 'COMPLETED'
      ? `Interview Notes:\n"${interview.notes || 'None'}"\nInterview Sentiment/Summary: "${interview.sentimentNotes || 'None'}"`
      : 'No interview completed yet.';

    const contextPrompt = `
You are the AI recruitment engine 'Community Brain' for community ${communityId}.
Analyze this candidate application and provide a transparent, advisory assessment.

Candidate Username: ${app.applicantUsername}
Role Status: ${app.status}
Source: ${app.source || 'Organic'}
Recruiter: ${app.recruiterCodeUsed || 'None'}

Answers:
${answersList}

Interview Data:
${interviewText}

Reviewer Notes:
"${app.reviewerNotes || 'None'}"

TASK:
Provide a scannable, evidence-backed candidate profile analysis.
You MUST output standard JSON matching this exact typescript structure:
{
  "profile": "A brief summary of who the candidate is, their experience and fit",
  "strengths": ["list of key strengths supported by evidence in answers/interview"],
  "concerns": ["list of concerns or areas needing caution"],
  "missingInfo": ["list of information gaps or unanswered details"],
  "recommendedNextStep": "Brief advisory next action"
}
Do NOT include any markdown code wrappers around the JSON. Output only clean, parseable JSON text.
`;

    const ai = getAiClient();
    let result: Omit<AiCandidateSummaryDoc, 'id' | 'communityId' | 'createdAt'>;

    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: contextPrompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const text = response.text?.trim() || '{}';
        const parsed = JSON.parse(text);

        result = {
          profile: (parsed.profile && parsed.profile.includes(app.applicantUsername))
            ? parsed.profile
            : `Candidate ${app.applicantUsername}: ${parsed.profile || 'Candidate application received and under screening.'}`,
          strengths: parsed.strengths || [],
          concerns: parsed.concerns || [],
          missingInfo: parsed.missingInfo || [],
          recommendedNextStep: parsed.recommendedNextStep || 'Review application answers and proceed to interview if ready.',
          evidenceLinks: [
            { text: 'Application answers form', recordType: 'application', recordId: applicationId },
          ],
        };
        if (interview) {
          result.evidenceLinks.push({ text: 'Completed interview record', recordType: 'interview', recordId: interview.id });
        }
      } catch (err: any) {
        logger.error('Gemini API call failed, degrading to robust heuristic fallback:', undefined, { error: err.message });
        result = this.generateFallbackSummary(app, interview, applicationId);
      }
    } else {
      logger.warn('Gemini API Key missing, using robust heuristic summary generator.');
      result = this.generateFallbackSummary(app, interview, applicationId);
    }

    const finalDoc: AiCandidateSummaryDoc = {
      id: applicationId,
      communityId,
      ...result,
      createdAt: new Date().toISOString(),
    };

    try {
      await aiCandidateSummariesRepository.delete(applicationId).catch(() => {});
      await aiCandidateSummariesRepository.create(finalDoc);
    } catch (err: any) {
      logger.error('Failed to save AI Summary document to Firestore:', undefined, { error: err.message });
    }

    return finalDoc;
  }

  /**
   * High-quality advisory fallback heuristic for candidate analysis
   */
  private generateFallbackSummary(
    app: ApplicationDocument,
    interview: InterviewDocument | null,
    applicationId: string
  ): Omit<AiCandidateSummaryDoc, 'id' | 'communityId' | 'createdAt'> {
    const strengths: string[] = [];
    const concerns: string[] = [];
    const missingInfo: string[] = [];

    const answers = app.answers || [];
    const questions = app.questions || [];

    // Analyze missing items
    questions.forEach((q) => {
      const hasAns = answers.find((a) => a.questionId === q.questionId && a.answerText?.trim());
      if (!hasAns && q.isRequired) {
        missingInfo.push(`Required detail: "${q.questionText}" was left empty.`);
      }
    });

    // Content length analysis
    const wordCount = answers.map((a) => (a.answerText || '').split(/\s+/).length).reduce((a, b) => a + b, 0);
    if (wordCount > 100) {
      strengths.push('Candidate showed high motivation by writing detailed responses.');
    } else if (wordCount < 15 && answers.length > 0) {
      concerns.push('Answers are highly abbreviated and lack detail.');
    }

    if (app.recruiterCodeUsed) {
      strengths.push(`Direct internal referral (Recruiter Code used: ${app.recruiterCodeUsed}).`);
    }

    if (interview && interview.status === 'COMPLETED') {
      strengths.push('Completed live interview verification stage.');
    } else if (!interview) {
      missingInfo.push('Technical interview assessment has not been started yet.');
    }

    const strengthsFinal = strengths.length > 0 ? strengths : ['Organic applicant, submitted form for initial screening.'];
    const concernsFinal = concerns.length > 0 ? concerns : ['No major flags detected during intake screening.'];
    const missingInfoFinal = missingInfo.length > 0 ? missingInfo : ['No severe information gaps identified.'];

    return {
      profile: `Evaluated candidate '${app.applicantUsername}' based on ${answers.length} form responses. Screening Score: ${app.recruitmentScore || 70}%.`,
      strengths: strengthsFinal,
      concerns: concernsFinal,
      missingInfo: missingInfoFinal,
      recommendedNextStep: interview ? 'Proceed to review completed interview logs.' : 'Schedule live technical interview to verify community fit.',
      evidenceLinks: [
        { text: 'Application answers form', recordType: 'application', recordId: applicationId },
      ],
    };
  }

  // --- Saved Recruitment Segments ---
  async createSegment(communityId: string, segment: Omit<SavedRecruitmentSegment, 'id' | 'communityId' | 'createdAt'>): Promise<SavedRecruitmentSegment> {
    const id = `seg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newSeg: SavedRecruitmentSegment = {
      id,
      communityId,
      ...segment,
      createdAt: new Date().toISOString(),
    };
    await savedRecruitmentSegmentsRepository.create(newSeg);
    return newSeg;
  }

  async listSegments(communityId: string): Promise<SavedRecruitmentSegment[]> {
    const segs = await savedRecruitmentSegmentsRepository.listForTenant(communityId);
    return segs;
  }

  async deleteSegment(communityId: string, segmentId: string): Promise<void> {
    const seg = await savedRecruitmentSegmentsRepository.getById(segmentId);
    if (!seg || seg.communityId !== communityId) {
      throw new Error('Segment not found or tenant mismatch.');
    }
    await savedRecruitmentSegmentsRepository.delete(segmentId);
  }

  /**
   * Applies segment filters onto applications list
   */
  filterApplicationsBySegment(apps: ApplicationDocument[], segment: SavedRecruitmentSegment): ApplicationDocument[] {
    const f = segment.filters;
    return apps.filter((app) => {
      // Score filter
      const score = app.recruitmentScore || 70;
      if (f.minScore !== undefined && score < f.minScore) return false;
      if (f.maxScore !== undefined && score > f.maxScore) return false;

      // Tags filter
      if (f.tags && f.tags.length > 0) {
        const appTags = app.tags || [];
        const matchesTag = f.tags.some((t) => appTags.includes(t));
        if (!matchesTag) return false;
      }

      // Talent Pool filter
      if (f.talentPool && f.talentPool.length > 0) {
        if (!app.talentPool || !f.talentPool.includes(app.talentPool)) return false;
      }

      // Stages filter
      if (f.stages && f.stages.length > 0) {
        if (!f.stages.includes(app.status)) return false;
      }

      // Recruiter filter
      if (f.recruiterUserId) {
        if (app.recruiterDiscordUserId !== f.recruiterUserId) return false;
      }

      // SLA filter
      if (f.slaStatus) {
        const status = this.calculateSlaStatus(app);
        if (status !== f.slaStatus) return false;
      }

      return true;
    });
  }

  /**
   * SLA Calculator
   */
  calculateSlaStatus(app: ApplicationDocument): 'ON_TIME' | 'OVERDUE' {
    const target = app.slaTargetMinutes || 2880; // Default 48 hours
    if (app.status !== 'SUBMITTED' && app.status !== 'UNDER_REVIEW') {
      return 'ON_TIME'; // Completed / processed stages are not SLA-bound
    }
    const submitted = new Date(app.submittedAt).getTime();
    const age = (Date.now() - submitted) / (1000 * 60);
    return age > target ? 'OVERDUE' : 'ON_TIME';
  }

  // --- Campaigns Engine ---
  async createCampaign(
    communityId: string,
    campaignData: {
      workspaceId: string;
      name: string;
      description: string;
      goal: 'APPLICATIONS' | 'INTERVIEWS' | 'APPROVALS' | 'JOINS' | 'RECRUITMENT_SUCCESS';
      source: string;
      applicationFormId?: string;
      recruiterGroup?: string;
      startAt: string;
      endAt: string;
      status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
      campaignCost?: number;
      rewardCost?: number;
      benefitCost?: number;
      recruiterRewardCost?: number;
    },
    actorUserId: string,
    actorRole?: UserRole
  ): Promise<RecruitmentCampaign> {
    const id = `camp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newCamp: RecruitmentCampaign = {
      id,
      communityId,
      workspaceId: campaignData.workspaceId,
      name: campaignData.name,
      description: campaignData.description || '',
      goal: campaignData.goal || 'APPLICATIONS',
      source: campaignData.source || 'DIRECT',
      applicationFormId: campaignData.applicationFormId || '',
      recruiterGroup: campaignData.recruiterGroup || '',
      startAt: campaignData.startAt,
      endAt: campaignData.endAt,
      status: campaignData.status || 'DRAFT',
      createdBy: actorUserId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      campaignCost: campaignData.campaignCost,
      rewardCost: campaignData.rewardCost,
      benefitCost: campaignData.benefitCost,
      recruiterRewardCost: campaignData.recruiterRewardCost,
    };

    await recruitmentCampaignsRepository.create(newCamp);

    // Record timeline and audit
    await auditService.record({
      communityId,
      actorUserId,
      actorRole: actorRole || 'MEMBER',
      action: 'RECRUITMENT_CAMPAIGN_CREATED' as any,
      targetType: 'campaign' as any,
      targetId: id,
      metadata: { name: newCamp.name, goal: newCamp.goal },
    });

    if (newCamp.status === 'ACTIVE') {
      const { AutomationEventBusService } = await import('./automation.service.js');
      await AutomationEventBusService.publish({
        communityId,
        eventType: 'CAMPAIGN_STARTED',
        metadata: { campaignId: id, name: newCamp.name },
      });
    }

    return newCamp;
  }

  async updateCampaign(
    communityId: string,
    campaignId: string,
    campaignData: Partial<RecruitmentCampaign>,
    actorUserId: string,
    actorRole?: UserRole
  ): Promise<RecruitmentCampaign> {
    const existing = await recruitmentCampaignsRepository.getById(campaignId);
    if (!existing || existing.communityId !== communityId) {
      throw new Error(`Campaign ${campaignId} not found in this community.`);
    }

    const updated = {
      ...existing,
      ...campaignData,
      updatedAt: new Date().toISOString(),
    } as RecruitmentCampaign;

    await recruitmentCampaignsRepository.update(campaignId, updated);

    await auditService.record({
      communityId,
      actorUserId,
      actorRole: actorRole || 'MEMBER',
      action: 'RECRUITMENT_CAMPAIGN_UPDATED' as any,
      targetType: 'campaign' as any,
      targetId: campaignId,
      metadata: { updatedFields: Object.keys(campaignData) },
    });

    return updated;
  }

  async updateCampaignStatus(
    communityId: string,
    campaignId: string,
    status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED',
    actorUserId: string,
    actorRole?: UserRole
  ): Promise<RecruitmentCampaign> {
    const existing = await recruitmentCampaignsRepository.getById(campaignId);
    if (!existing || existing.communityId !== communityId) {
      throw new Error(`Campaign ${campaignId} not found in this community.`);
    }

    const oldStatus = existing.status;
    existing.status = status;
    existing.updatedAt = new Date().toISOString();

    await recruitmentCampaignsRepository.update(campaignId, existing);

    await auditService.record({
      communityId,
      actorUserId,
      actorRole: actorRole || 'MEMBER',
      action: 'RECRUITMENT_CAMPAIGN_STATUS_CHANGED' as any,
      targetType: 'campaign' as any,
      targetId: campaignId,
      metadata: { oldStatus, newStatus: status },
    });

    // Expose automation events
    const { AutomationEventBusService } = await import('./automation.service.js');
    if (status === 'ACTIVE' && oldStatus !== 'ACTIVE') {
      await AutomationEventBusService.publish({
        communityId,
        eventType: 'CAMPAIGN_STARTED',
        metadata: { campaignId, name: existing.name },
      });
    } else if (status === 'PAUSED' && oldStatus !== 'PAUSED') {
      await AutomationEventBusService.publish({
        communityId,
        eventType: 'CAMPAIGN_PAUSED',
        metadata: { campaignId, name: existing.name },
      });
    }

    return existing;
  }

  async listCampaigns(communityId: string): Promise<RecruitmentCampaign[]> {
    return recruitmentCampaignsRepository.listForTenant(communityId);
  }

  async getCampaignDetailsWithAnalytics(communityId: string, campaignId: string): Promise<any> {
    const campaign = await recruitmentCampaignsRepository.getById(campaignId);
    if (!campaign || campaign.communityId !== communityId) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    const apps = await applicationsRepository.listForTenant(communityId);
    const campaignApps = apps.filter((app) => app.campaignId === campaignId);

    const appsCount = campaignApps.length;
    const reviewedCount = campaignApps.filter((a) => a.status !== 'SUBMITTED').length;
    const interviewsCount = campaignApps.filter((a) => a.status === 'INTERVIEW_SCHEDULED' || a.status === 'INTERVIEW_COMPLETED' || a.status === 'UNDER_REVIEW' || a.status === 'APPROVED' || a.status === 'JOINED').length;
    const approvedCount = campaignApps.filter((a) => a.status === 'APPROVED' || a.status === 'JOINED').length;
    const joinedCount = campaignApps.filter((a) => a.status === 'JOINED' || a.joinConfirmedAt).length;
    const recruitmentSuccessCount = campaignApps.filter((a) => a.successfulAt).length;

    // Conversion rate
    const conversion = appsCount > 0 ? `${Math.round((recruitmentSuccessCount / appsCount) * 100)}%` : 'INSUFFICIENT_DATA';

    // Source breakdown
    const sourceMap: Record<string, { count: number; approved: number; joined: number }> = {};
    campaignApps.forEach((app) => {
      const src = app.source || 'DIRECT';
      if (!sourceMap[src]) sourceMap[src] = { count: 0, approved: 0, joined: 0 };
      sourceMap[src].count++;
      if (app.status === 'APPROVED' || app.status === 'JOINED') sourceMap[src].approved++;
      if (app.status === 'JOINED' || app.joinConfirmedAt) sourceMap[src].joined++;
    });

    // Recruiter breakdown
    const recruiterMap: Record<string, { count: number; approved: number; joined: number }> = {};
    campaignApps.forEach((app) => {
      const rec = app.recruiterCode || 'NONE';
      if (!recruiterMap[rec]) recruiterMap[rec] = { count: 0, approved: 0, joined: 0 };
      recruiterMap[rec].count++;
      if (app.status === 'APPROVED' || app.status === 'JOINED') recruiterMap[rec].approved++;
      if (app.status === 'JOINED' || app.joinConfirmedAt) recruiterMap[rec].joined++;
    });

    // Referral breakdown
    const referralMap: Record<string, { count: number; approved: number; joined: number }> = {};
    campaignApps.forEach((app) => {
      const ref = app.referralId || 'NONE';
      if (!referralMap[ref]) referralMap[ref] = { count: 0, approved: 0, joined: 0 };
      referralMap[ref].count++;
      if (app.status === 'APPROVED' || app.status === 'JOINED') referralMap[ref].approved++;
      if (app.status === 'JOINED' || app.joinConfirmedAt) referralMap[ref].joined++;
    });

    // ROI Costs
    const hasCosts = campaign.campaignCost !== undefined || campaign.rewardCost !== undefined;
    const roiMetric = hasCosts 
      ? {
          totalCost: (campaign.campaignCost || 0) + (campaign.rewardCost || 0) + (campaign.benefitCost || 0) + (campaign.recruiterRewardCost || 0),
          costPerAcquisition: recruitmentSuccessCount > 0 
            ? ((campaign.campaignCost || 0) + (campaign.rewardCost || 0)) / recruitmentSuccessCount
            : 'INSUFFICIENT_DATA',
        }
      : 'INSUFFICIENT_DATA';

    // Campaign alert metrics
    const campaignAlerts: Array<{ type: string; message: string; evidence: string; nextAction: string }> = [];
    if (appsCount === 0 && campaign.status === 'ACTIVE') {
      campaignAlerts.push({
        type: 'WARNING',
        message: 'No applications received',
        evidence: 'Total candidate submissions is 0',
        nextAction: 'Distribute sourcing URLs and codes across community channels',
      });
    }
    const unreviewed = campaignApps.filter(a => a.status === 'SUBMITTED');
    if (unreviewed.length > 5) {
      campaignAlerts.push({
        type: 'CRITICAL',
        message: 'Review backlog concentration',
        evidence: `${unreviewed.length} files are waiting for initial screening`,
        nextAction: 'Assign reviewers to balance pipeline workloads',
      });
    }
    const daysLeft = campaign.endAt ? (new Date(campaign.endAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24) : 99;
    if (daysLeft > 0 && daysLeft < 3 && campaign.status === 'ACTIVE') {
      campaignAlerts.push({
        type: 'INFO',
        message: 'Campaign ending soon',
        evidence: `Only ${Math.round(daysLeft * 10) / 10} days remaining until target close`,
        nextAction: 'Perform final candidate evaluations and secure conversions',
      });
    }

    return {
      campaign,
      analytics: {
        applications: appsCount,
        reviewed: reviewedCount,
        interviews: interviewsCount,
        approved: approvedCount,
        joined: joinedCount,
        recruitmentSuccess: recruitmentSuccessCount,
        conversion,
        sources: sourceMap,
        recruiters: recruiterMap,
        referrals: referralMap,
        roi: roiMetric,
        alerts: campaignAlerts,
      },
    };
  }

  // --- Recruitment Conversion Engine ---
  async recordRecruitmentSuccess(communityId: string, applicationId: string): Promise<void> {
    const app = await applicationsRepository.getById(applicationId);
    if (!app || app.communityId !== communityId) {
      throw new Error(`Application ${applicationId} not found`);
    }

    if (app.successfulAt) {
      logger.info(`Application ${applicationId} already converted (idempotent guard triggered).`);
      return;
    }

    // Set converting attributes
    app.successfulAt = new Date().toISOString();
    app.status = 'JOINED'; // Converted joining status
    await applicationsRepository.update(applicationId, {
      successfulAt: app.successfulAt,
      status: app.status,
      updatedAt: new Date().toISOString(),
    });

    // Publish SUCCESS workflow trigger event
    const { AutomationEventBusService } = await import('./automation.service.js');
    await AutomationEventBusService.publish({
      communityId,
      eventType: 'RECRUITMENT_SUCCESSFUL',
      metadata: {
        applicationId,
        applicantUsername: app.applicantUsername,
        source: app.source || 'DIRECT',
        campaignId: app.campaignId || '',
        recruiterCode: app.recruiterCode || '',
      },
    });

    // Check if campaign goal reached
    if (app.campaignId) {
      const campDetails = await this.getCampaignDetailsWithAnalytics(communityId, app.campaignId);
      const goalCount = campDetails.analytics.recruitmentSuccess;
      if (goalCount >= 10) { // e.g., milestone
        await AutomationEventBusService.publish({
          communityId,
          eventType: 'CAMPAIGN_GOAL_REACHED',
          metadata: { campaignId: app.campaignId, recruitmentSuccess: goalCount },
        });
      }
    }
  }

  // --- Source Attribution Correction ---
  async correctAttribution(
    communityId: string,
    applicationId: string,
    attributionData: {
      source: string;
      sourceId?: string;
      campaignId?: string;
      recruiterCode?: string;
    },
    actorUserId: string,
    actorRole?: UserRole
  ): Promise<ApplicationDocument> {
    const app = await applicationsRepository.getById(applicationId);
    if (!app || app.communityId !== communityId) {
      throw new Error(`Application ${applicationId} not found`);
    }

    const originalAttribution = {
      source: app.source,
      sourceId: app.sourceId,
      campaignId: app.campaignId,
      recruiterCode: app.recruiterCode,
    };

    app.source = attributionData.source;
    app.sourceId = attributionData.sourceId || '';
    app.campaignId = attributionData.campaignId || '';
    app.recruiterCode = attributionData.recruiterCode || '';
    app.updatedAt = new Date().toISOString();

    await applicationsRepository.update(applicationId, {
      source: app.source,
      sourceId: app.sourceId,
      campaignId: app.campaignId,
      recruiterCode: app.recruiterCode,
      updatedAt: app.updatedAt,
    });

    // Audit trace
    await auditService.record({
      communityId,
      actorUserId,
      actorRole: actorRole || 'MEMBER',
      action: 'RECRUITMENT_ATTRIBUTION_CORRECTED' as any,
      targetType: 'application' as any,
      targetId: applicationId,
      metadata: { originalAttribution, updatedAttribution: attributionData },
    });

    return app;
  }

  // --- Versioned Forms & Screening engine ---
  async listForms(communityId: string): Promise<VersionedApplicationForm[]> {
    return versionedApplicationFormsRepository.listForTenant(communityId);
  }

  async getForm(communityId: string, formId: string): Promise<VersionedApplicationForm> {
    const form = await versionedApplicationFormsRepository.getById(formId);
    if (!form || form.communityId !== communityId) {
      throw new Error(`Form ${formId} not found`);
    }
    return form;
  }

  async createForm(
    communityId: string,
    formData: {
      name: string;
      description?: string;
      version: string;
      questions: ScreeningQuestion[];
    }
  ): Promise<VersionedApplicationForm> {
    const id = `form_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newForm: VersionedApplicationForm = {
      id,
      communityId,
      name: formData.name,
      description: formData.description || '',
      version: formData.version || '1.0',
      status: 'DRAFT',
      questions: formData.questions || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await versionedApplicationFormsRepository.create(newForm);
    return newForm;
  }

  async updateForm(
    communityId: string,
    formId: string,
    formData: Partial<VersionedApplicationForm>
  ): Promise<VersionedApplicationForm> {
    const existing = await versionedApplicationFormsRepository.getById(formId);
    if (!existing || existing.communityId !== communityId) {
      throw new Error(`Form ${formId} not found`);
    }

    const updated = {
      ...existing,
      ...formData,
      updatedAt: new Date().toISOString(),
    } as VersionedApplicationForm;

    await versionedApplicationFormsRepository.update(formId, updated);
    return updated;
  }

  async updateFormStatus(
    communityId: string,
    formId: string,
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
    actorUserId: string,
    actorRole?: UserRole
  ): Promise<VersionedApplicationForm> {
    const existing = await versionedApplicationFormsRepository.getById(formId);
    if (!existing || existing.communityId !== communityId) {
      throw new Error(`Form ${formId} not found`);
    }

    const oldStatus = existing.status;
    existing.status = status;
    existing.updatedAt = new Date().toISOString();

    await versionedApplicationFormsRepository.update(formId, existing);

    // Audit logs
    await auditService.record({
      communityId,
      actorUserId,
      actorRole: actorRole || 'MEMBER',
      action: (status === 'PUBLISHED' ? 'RECRUITMENT_FORM_PUBLISHED' : 'RECRUITMENT_FORM_ARCHIVED') as any,
      targetType: 'form' as any,
      targetId: formId,
      metadata: { oldStatus, newStatus: status, version: existing.version },
    });

    return existing;
  }

  // --- Alerts ---
  async listAlerts(communityId: string): Promise<RecruitmentAlert[]> {
    const alerts = await recruitmentAlertsRepository.listForTenant(communityId);
    return alerts.filter((a) => !a.resolved);
  }

  async createAlert(communityId: string, alert: Omit<RecruitmentAlert, 'id' | 'communityId' | 'createdAt' | 'resolved'>): Promise<RecruitmentAlert> {
    const id = `alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newAlert: RecruitmentAlert = {
      id,
      communityId,
      ...alert,
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    await recruitmentAlertsRepository.create(newAlert);
    return newAlert;
  }

  async resolveAlert(communityId: string, alertId: string): Promise<void> {
    const alert = await recruitmentAlertsRepository.getById(alertId);
    if (alert && alert.communityId === communityId) {
      await recruitmentAlertsRepository.update(alertId, { ...alert, resolved: true });
    }
  }

  // --- Workload & Analytics ---
  async getRecruiterWorkload(communityId: string): Promise<any[]> {
    const apps = await applicationsRepository.listForTenant(communityId);
    const active = apps.filter((a) => a.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW');

    // Aggregate by reviewer
    const workloadMap = new Map<string, { id: string; username: string; activeCount: number; overdueCount: number }>();

    active.forEach((app) => {
      const reviewerId = app.assignedReviewerId || 'UNASSIGNED';
      const reviewerName = app.assignedReviewerUsername || 'Unassigned Candidates';

      if (!workloadMap.has(reviewerId)) {
        workloadMap.set(reviewerId, { id: reviewerId, username: reviewerName, activeCount: 0, overdueCount: 0 });
      }

      const entry = workloadMap.get(reviewerId)!;
      entry.activeCount++;
      if (this.calculateSlaStatus(app) === 'OVERDUE') {
        entry.overdueCount++;
      }
    });

    return Array.from(workloadMap.values());
  }

  // --- Task 48 Recruiter Network Operations ---

  async listRecruiters(communityId: string): Promise<RecruiterDocument[]> {
    return recruitersRepository.listForTenant(communityId);
  }

  async getRecruiterDetails(communityId: string, recruiterId: string): Promise<any> {
    const recruiter = await recruitersRepository.getById(recruiterId);
    if (!recruiter || recruiter.communityId !== communityId) {
      throw new Error(`Recruiter ${recruiterId} not found`);
    }

    const apps = await applicationsRepository.listForTenant(communityId);
    const recruiterApps = apps.filter((app) => app.recruiterCode === recruiter.recruiterCode);

    // Calculate metrics
    const assigned = recruiterApps.length;
    const reviewed = recruiterApps.filter((a) => a.status !== 'SUBMITTED').length;
    const interviews = recruiterApps.filter((a) => a.status === 'INTERVIEW_SCHEDULED' || a.status === 'INTERVIEW_COMPLETED').length;
    const approved = recruiterApps.filter((a) => a.status === 'APPROVED' || a.status === 'JOINED').length;
    const joined = recruiterApps.filter((a) => a.status === 'JOINED' || a.joinConfirmedAt).length;
    const successful = recruiterApps.filter((a) => a.successfulAt || a.status === 'JOINED').length;

    // Goals
    const goals = await recruiterGoalsRepository.listForTenant(communityId);
    const recruiterGoals = goals.filter((g) => g.recruiterId === recruiterId);

    // Rewards
    const rewards = await recruitmentRewardsRepository.listForTenant(communityId);
    const recruiterRewards = rewards.filter((r) => r.recruiterId === recruiterId);

    // Member Lifecycle Attribution - Task 51.10
    const [handoffs, engagements] = await Promise.all([
      memberHandoffsRepository.listForTenant(communityId),
      earlyEngagementEventsRepository.listForTenant(communityId),
    ]);
    const candidateUserIds = new Set(
      recruiterApps.map((a) => a.applicantDiscordUserId || a.applicantDiscordId || a.applicantUserId).filter(Boolean)
    );
    const memberActivated = handoffs.filter(
      (h) => h.status === 'ACTIVATED' && (h.recruiterId === recruiter.recruiterCode || (h.discordUserId && candidateUserIds.has(h.discordUserId)))
    ).length;
    const earlyEngagement = engagements.filter((e) => candidateUserIds.has(e.discordUserId)).length;

    // Dynamic Performance Metrics
    const conversion = assigned > 0 ? `${Math.round((successful / assigned) * 100)}%` : 'INSUFFICIENT_DATA';
    
    // Calculate Average Review Time
    const reviewedApps = recruiterApps.filter((a) => a.status !== 'SUBMITTED' && a.createdAt);
    let avgReviewTime = 'INSUFFICIENT_DATA';
    if (reviewedApps.length > 0) {
      let totalMs = 0;
      reviewedApps.forEach((app) => {
        const start = new Date(app.createdAt).getTime();
        const end = app.updatedAt ? new Date(app.updatedAt).getTime() : Date.now();
        totalMs += (end - start);
      });
      const avgHrs = Math.round(totalMs / (1000 * 60 * 60 * reviewedApps.length));
      avgReviewTime = `${avgHrs}h`;
    }

    // Dynamic recognition states based on underlying metrics
    let recognition = 'Rising Recruiter';
    if (successful >= 5) recognition = 'Top Recruiter';
    else if (reviewed >= 10) recognition = 'Consistent Recruiter';

    return {
      recruiter,
      metrics: {
        assigned,
        applications: assigned,
        reviewed,
        interviews,
        approved,
        joined,
        successful,
        memberActivated,
        earlyEngagement,
        benefits: recruiterRewards.length,
        conversion,
        avgReviewTime,
        recognition,
      },
      goals: recruiterGoals,
      rewards: recruiterRewards,
      timeline: [
        { event: 'Recruiter Created', timestamp: recruiter.createdAt },
        ...recruiterGoals.map((g) => ({ event: `Goal Created: ${g.targetType}`, timestamp: g.createdAt })),
        ...recruiterRewards.map((r) => ({ event: `Reward Issued: ${r.rewardType}`, timestamp: r.createdAt })),
      ],
    };
  }

  async createRecruiter(
    communityId: string,
    workspaceId: string,
    data: { discordUserId: string; displayNameSnapshot: string; role: RecruiterRole; recruiterCode: string }
  ): Promise<RecruiterDocument> {
    // Unique check for code
    const existing = await recruitersRepository.listForTenant(communityId);
    if (existing.some((r) => r.recruiterCode === data.recruiterCode)) {
      throw new Error(`Recruiter code '${data.recruiterCode}' is already taken.`);
    }

    const id = `rec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();
    const newRec: RecruiterDocument = {
      id,
      workspaceId,
      communityId,
      discordUserId: data.discordUserId,
      displayNameSnapshot: data.displayNameSnapshot,
      status: 'ACTIVE',
      role: data.role,
      recruiterCode: data.recruiterCode,
      joinedAt: now,
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await recruitersRepository.create(newRec);

    // Log audit event
    await auditService.record({
      communityId,
      actorUserId: 'SYSTEM',
      actorRole: 'SYSTEM' as any,
      action: 'RECRUITER_CREATED' as any,
      targetType: 'recruiter' as any,
      targetId: id,
      metadata: { displayName: data.displayNameSnapshot, code: data.recruiterCode },
    });

    // Publish automation event
    const { AutomationEventBusService } = await import('./automation.service.js');
    await AutomationEventBusService.publish({
      communityId,
      eventType: 'RECRUITER_CREATED',
      metadata: { recruiterId: id, code: data.recruiterCode },
    });

    return newRec;
  }

  async updateRecruiter(
    communityId: string,
    recruiterId: string,
    data: Partial<RecruiterDocument>,
    actorUserId: string,
    actorRole?: UserRole
  ): Promise<RecruiterDocument> {
    const existing = await recruitersRepository.getById(recruiterId);
    if (!existing || existing.communityId !== communityId) {
      throw new Error(`Recruiter ${recruiterId} not found`);
    }

    const updated = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString(),
    } as RecruiterDocument;

    await recruitersRepository.update(recruiterId, updated);

    // Log audit events for role or status changes
    if (data.role && data.role !== existing.role) {
      await auditService.record({
        communityId,
        actorUserId,
        actorRole: actorRole || 'MEMBER',
        action: 'RECRUITER_ROLE_CHANGED' as any,
        targetType: 'recruiter' as any,
        targetId: recruiterId,
        metadata: { oldRole: existing.role, newRole: data.role },
      });
    }

    if (data.status && data.status !== existing.status) {
      await auditService.record({
        communityId,
        actorUserId,
        actorRole: actorRole || 'MEMBER',
        action: 'RECRUITER_STATUS_CHANGED' as any,
        targetType: 'recruiter' as any,
        targetId: recruiterId,
        metadata: { oldStatus: existing.status, newStatus: data.status },
      });
    }

    return updated;
  }

  // --- Referral Ecosystem ---

  async listReferrals(communityId: string): Promise<ReferralDocument[]> {
    return referralsRepository.listForTenant(communityId);
  }

  async createReferral(
    communityId: string,
    workspaceId: string,
    data: { recruiterId: string; code: string; source: string; campaignId?: string; expiresAt?: string }
  ): Promise<ReferralDocument> {
    // Ensure uniqueness within scope
    const existing = await referralsRepository.listForTenant(communityId);
    if (existing.some((r) => r.code === data.code)) {
      throw new Error(`Referral code '${data.code}' is already registered in this community.`);
    }

    const id = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newRef: ReferralDocument = {
      id,
      workspaceId,
      communityId,
      recruiterId: data.recruiterId,
      code: data.code,
      source: data.source,
      campaignId: data.campaignId,
      createdAt: new Date().toISOString(),
      expiresAt: data.expiresAt,
      status: 'ACTIVE',
    };

    await referralsRepository.create(newRef);

    // Audit trace
    await auditService.record({
      communityId,
      actorUserId: 'SYSTEM',
      actorRole: 'SYSTEM' as any,
      action: 'REFERRAL_CREATED' as any,
      targetType: 'referral' as any,
      targetId: id,
      metadata: { code: data.code, source: data.source },
    });

    // Automation event
    const { AutomationEventBusService } = await import('./automation.service.js');
    await AutomationEventBusService.publish({
      communityId,
      eventType: 'REFERRAL_CREATED',
      metadata: { referralId: id, code: data.code, recruiterId: data.recruiterId },
    });

    return newRef;
  }

  async updateReferralStatus(
    communityId: string,
    referralId: string,
    status: ReferralStatus,
    actorUserId: string,
    actorRole?: UserRole
  ): Promise<ReferralDocument> {
    const existing = await referralsRepository.getById(referralId);
    if (!existing || existing.communityId !== communityId) {
      throw new Error(`Referral ${referralId} not found`);
    }

    const oldStatus = existing.status;
    existing.status = status;

    await referralsRepository.update(referralId, existing);

    await auditService.record({
      communityId,
      actorUserId,
      actorRole: actorRole || 'MEMBER',
      action: 'REFERRAL_STATUS_CHANGED' as any,
      targetType: 'referral' as any,
      targetId: referralId,
      metadata: { oldStatus, newStatus: status },
    });

    return existing;
  }

  // --- Recruitment Reward Engine ---

  async listRewards(communityId: string): Promise<RecruitmentReward[]> {
    return recruitmentRewardsRepository.listForTenant(communityId);
  }

  async createReward(
    communityId: string,
    workspaceId: string,
    data: { source: string; reason: string; applicationId: string; recruiterId: string; rewardType: RewardType }
  ): Promise<RecruitmentReward> {
    // Safety check: Reward eligibility checks APPROVED + Discord Join Confirmed
    const app = await applicationsRepository.getById(data.applicationId);
    if (!app || app.communityId !== communityId) {
      throw new Error(`Application ${data.applicationId} not found`);
    }

    // Verify recruitment success milestone rules
    const isEligible = app.status === 'APPROVED' || app.status === 'JOINED' || app.joinConfirmedAt;
    if (!isEligible) {
      throw new Error(`Candidate is not eligible for reward (requires APPROVED or JOINED status).`);
    }

    const id = `rew_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newReward: RecruitmentReward = {
      id,
      workspaceId,
      communityId,
      source: data.source,
      reason: data.reason,
      applicationId: data.applicationId,
      recruiterId: data.recruiterId,
      status: 'PENDING',
      rewardType: data.rewardType,
      createdAt: new Date().toISOString(),
    };

    await recruitmentRewardsRepository.create(newReward);

    await auditService.record({
      communityId,
      actorUserId: 'SYSTEM',
      actorRole: 'SYSTEM' as any,
      action: 'RECRUITMENT_REWARD_CREATED' as any,
      targetType: 'reward' as any,
      targetId: id,
      metadata: { rewardType: data.rewardType, reason: data.reason },
    });

    const { AutomationEventBusService } = await import('./automation.service.js');
    await AutomationEventBusService.publish({
      communityId,
      eventType: 'REWARD_CREATED',
      metadata: { rewardId: id, recruiterId: data.recruiterId, rewardType: data.rewardType },
    });

    return newReward;
  }

  async claimReward(
    communityId: string,
    rewardId: string,
    actorUserId: string,
    actorRole?: UserRole
  ): Promise<RecruitmentReward> {
    const reward = await recruitmentRewardsRepository.getById(rewardId);
    if (!reward || reward.communityId !== communityId) {
      throw new Error(`Reward ${rewardId} not found`);
    }

    reward.status = 'ISSUED';
    reward.updatedAt = new Date().toISOString();

    await recruitmentRewardsRepository.update(rewardId, reward);

    await auditService.record({
      communityId,
      actorUserId,
      actorRole: actorRole || 'MEMBER',
      action: 'RECRUITMENT_REWARD_CLAIMED' as any,
      targetType: 'reward' as any,
      targetId: rewardId,
      metadata: { rewardType: reward.rewardType },
    });

    return reward;
  }

  // --- Recruiter Goals ---

  async listGoals(communityId: string): Promise<RecruiterGoal[]> {
    return recruiterGoalsRepository.listForTenant(communityId);
  }

  async createGoal(
    communityId: string,
    workspaceId: string,
    data: { recruiterId: string; targetType: GoalTargetType; targetValue: number; startAt: string; endAt: string }
  ): Promise<RecruiterGoal> {
    const id = `goal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newGoal: RecruiterGoal = {
      id,
      workspaceId,
      communityId,
      recruiterId: data.recruiterId,
      targetType: data.targetType,
      targetValue: data.targetValue,
      currentValue: 0,
      status: 'NOT_STARTED',
      startAt: data.startAt,
      endAt: data.endAt,
      createdAt: new Date().toISOString(),
    };

    await recruiterGoalsRepository.create(newGoal);

    await auditService.record({
      communityId,
      actorUserId: 'SYSTEM',
      actorRole: 'SYSTEM' as any,
      action: 'RECRUITER_GOAL_CREATED' as any,
      targetType: 'goal' as any,
      targetId: id,
      metadata: { targetType: data.targetType, value: data.targetValue },
    });

    return newGoal;
  }

  async updateGoalProgress(communityId: string, goalId: string, currentValue: number): Promise<RecruiterGoal> {
    const goal = await recruiterGoalsRepository.getById(goalId);
    if (!goal || goal.communityId !== communityId) {
      throw new Error(`Goal ${goalId} not found`);
    }

    goal.currentValue = currentValue;
    if (currentValue >= goal.targetValue) {
      goal.status = 'REACHED';
    } else if (new Date(goal.endAt).getTime() < Date.now()) {
      goal.status = 'EXPIRED';
    } else {
      goal.status = 'IN_PROGRESS';
    }

    goal.updatedAt = new Date().toISOString();
    await recruiterGoalsRepository.update(goalId, goal);
    return goal;
  }

  // --- Recruiter Leaderboard ---

  async getLeaderboard(communityId: string, rangeDays: string = 'All Time'): Promise<any[]> {
    const [recruiters, apps, handoffs, engagements] = await Promise.all([
      recruitersRepository.listForTenant(communityId),
      applicationsRepository.listForTenant(communityId),
      memberHandoffsRepository.listForTenant(communityId),
      earlyEngagementEventsRepository.listForTenant(communityId),
    ]);

    // Date range filter
    let cutoffDate = 0;
    const nowMs = Date.now();
    if (rangeDays === '7 days') cutoffDate = nowMs - 7 * 24 * 60 * 60 * 1000;
    else if (rangeDays === '30 days') cutoffDate = nowMs - 30 * 24 * 60 * 60 * 1000;
    else if (rangeDays === '90 days') cutoffDate = nowMs - 90 * 24 * 60 * 60 * 1000;

    const filteredApps = apps.filter((app) => {
      if (cutoffDate === 0) return true;
      const appTime = new Date(app.createdAt).getTime();
      return appTime >= cutoffDate;
    });

    const leaderboard = recruiters.map((recruiter) => {
      const recApps = filteredApps.filter((a) => a.recruiterCode === recruiter.recruiterCode);
      const applications = recApps.length;
      const approved = recApps.filter((a) => a.status === 'APPROVED' || a.status === 'JOINED').length;
      const joined = recApps.filter((a) => a.status === 'JOINED' || a.joinConfirmedAt).length;
      const successful = recApps.filter((a) => a.successfulAt || a.status === 'JOINED').length;

      const candidateUserIds = new Set(
        recApps.map((a) => a.applicantDiscordUserId || a.applicantDiscordId || a.applicantUserId).filter(Boolean)
      );
      const memberActivated = handoffs.filter(
        (h) => h.status === 'ACTIVATED' && (h.recruiterId === recruiter.recruiterCode || (h.discordUserId && candidateUserIds.has(h.discordUserId)))
      ).length;
      const earlyEngagement = engagements.filter((e) => candidateUserIds.has(e.discordUserId)).length;

      const conversionRate = applications > 0 ? Math.round((approved / applications) * 100) : 0;

      // Review velocity
      const reviewedApps = recApps.filter((a) => a.status !== 'SUBMITTED' && a.createdAt);
      let velocityHours = 999; // Default if no data
      if (reviewedApps.length > 0) {
        let totalMs = 0;
        reviewedApps.forEach((app) => {
          const start = new Date(app.createdAt).getTime();
          const end = app.updatedAt ? new Date(app.updatedAt).getTime() : Date.now();
          totalMs += (end - start);
        });
        velocityHours = Math.round(totalMs / (1000 * 60 * 60 * reviewedApps.length));
      }

      return {
        id: recruiter.id,
        displayName: recruiter.displayNameSnapshot,
        recruiterCode: recruiter.recruiterCode,
        applications,
        approved,
        joined,
        successful,
        memberActivated,
        earlyEngagement,
        conversionRate,
        reviewVelocity: velocityHours === 999 ? 'N/A' : `${velocityHours}h`,
        velocityValue: velocityHours,
      };
    });

    // Rank recruiters by Successful Recruitments
    return leaderboard.sort((a, b) => b.successful - a.successful);
  }

  // --- Abuse and Duplicate Detection ---

  async detectDuplicatesAndAbuse(communityId: string): Promise<any> {
    const apps = await applicationsRepository.listForTenant(communityId);
    
    // Duplicate Candidate Detection
    const duplicateFlags: any[] = [];
    const discordMap = new Map<string, ApplicationDocument[]>();
    const usernameMap = new Map<string, ApplicationDocument[]>();

    apps.forEach((app) => {
      if (app.applicantDiscordId) {
        if (!discordMap.has(app.applicantDiscordId)) discordMap.set(app.applicantDiscordId, []);
        discordMap.get(app.applicantDiscordId)!.push(app);
      }
      if (app.applicantUsername) {
        const normName = app.applicantUsername.toLowerCase().trim();
        if (!usernameMap.has(normName)) usernameMap.set(normName, []);
        usernameMap.get(normName)!.push(app);
      }
    });

    discordMap.forEach((matchedApps, discordId) => {
      if (matchedApps.length > 1) {
        duplicateFlags.push({
          type: 'DUPLICATE_DISCORD_ID',
          evidence: `Discord ID '${discordId}' is associated with ${matchedApps.length} active applications.`,
          applications: matchedApps.map((a) => ({ id: a.id, username: a.applicantUsername, status: a.status })),
        });
      }
    });

    usernameMap.forEach((matchedApps, username) => {
      if (matchedApps.length > 1) {
        duplicateFlags.push({
          type: 'DUPLICATE_USERNAME',
          evidence: `Candidate Username '${username}' has ${matchedApps.length} separate profiles.`,
          applications: matchedApps.map((a) => ({ id: a.id, username: a.applicantUsername, status: a.status })),
        });
      }
    });

    // Fraud / Abuse Detection (Repeated attribution changes, self-referrals, or rapid applications)
    const abuseFlags: any[] = [];
    const auditLogs = await auditLogsRepository.listForTenant(communityId);
    const attributionCorrectedLogs = auditLogs.filter((log) => (log.action as string) === 'RECRUITMENT_ATTRIBUTION_CORRECTED');

    // Group logs by application target
    const targetMap = new Map<string, number>();
    attributionCorrectedLogs.forEach((log) => {
      if (log.targetId) {
        targetMap.set(log.targetId, (targetMap.get(log.targetId) || 0) + 1);
      }
    });

    targetMap.forEach((count, appId) => {
      if (count > 3) {
        abuseFlags.push({
          type: 'SUSPICIOUS_ATTRIBUTION_TURNOVER',
          evidence: `Application ${appId} had attribution corrected ${count} times recursively.`,
          applicationId: appId,
        });
      }
    });

    // Detect Self-Referral Pattern
    apps.forEach((app) => {
      if (app.recruiterCode && app.applicantUsername && app.recruiterCode.toLowerCase() === app.applicantUsername.toLowerCase()) {
        abuseFlags.push({
          type: 'POSSIBLE_SELF_REFERRAL',
          evidence: `Candidate '${app.applicantUsername}' is applying with a matching recruiter code: '${app.recruiterCode}'.`,
          applicationId: app.id,
        });
      }
    });

    return {
      duplicates: duplicateFlags,
      abuse: abuseFlags,
    };
  }

  // --- Talent Acquisition Dashboard Analytics ---

  async getTalentAcquisitionOverview(communityId: string): Promise<any> {
    const apps = await applicationsRepository.listForTenant(communityId);
    const recruiters = await recruitersRepository.listForTenant(communityId);
    const referrals = await referralsRepository.listForTenant(communityId);
    const goals = await recruiterGoalsRepository.listForTenant(communityId);

    // Sourcing counts
    const sourcesMap: Record<string, number> = {};
    apps.forEach((app) => {
      const src = app.source || 'DIRECT';
      sourcesMap[src] = (sourcesMap[src] || 0) + 1;
    });

    // Pipeline Counts
    const pipeline = {
      SUBMITTED: apps.filter((a) => a.status === 'SUBMITTED').length,
      REVIEW: apps.filter((a) => a.status === 'UNDER_REVIEW').length,
      INTERVIEW: apps.filter((a) => a.status === 'INTERVIEW_SCHEDULED' || a.status === 'INTERVIEW_COMPLETED').length,
      APPROVED: apps.filter((a) => a.status === 'APPROVED').length,
      JOINED: apps.filter((a) => a.status === 'JOINED' || a.joinConfirmedAt).length,
      SUCCESS: apps.filter((a) => a.successfulAt || a.status === 'JOINED').length,
    };

    // Goals summary
    const goalStatusSummary = {
      NOT_STARTED: goals.filter((g) => g.status === 'NOT_STARTED').length,
      IN_PROGRESS: goals.filter((g) => g.status === 'IN_PROGRESS').length,
      REACHED: goals.filter((g) => g.status === 'REACHED').length,
      EXPIRED: goals.filter((g) => g.status === 'EXPIRED').length,
    };

    return {
      totalApplications: apps.length,
      recruitersCount: recruiters.length,
      referralsCount: referrals.length,
      pipeline,
      sources: Object.entries(sourcesMap).map(([name, count]) => ({ name, count })),
      goalsSummary: goalStatusSummary,
    };
  }

  // --- Community Brain Q&A with strict evidence citations ---

  async askRecruitmentBrain(communityId: string, question: string): Promise<string> {
    const overview = await this.getTalentAcquisitionOverview(communityId);
    const leaderboard = await this.getLeaderboard(communityId, 'All Time');
    const systemPrompt = `You are Community Brain, an elite, evidence-based Recruitment Intelligence agent. 
Analyze the following community recruitment facts and answer the user's question. 

### MASTER FACT SHEET ###
1. Pipeline Status: ${JSON.stringify(overview.pipeline)}
2. Recruiter Roster & Conversions: ${JSON.stringify(leaderboard)}
3. Sourcing Channels: ${JSON.stringify(overview.sources)}
4. Sourcing Referrals Volume: ${overview.referralsCount}

### ANSWER DIRECTIVES ###
You MUST cite your evidence clearly and classify your statements into exactly these four distinct categories:
- **Verified Fact**: Explicit factual stats verified in the Master Fact Sheet.
- **Observed Correlation**: Logical patterns, links, or trends seen in the data.
- **Possible Explanation**: Potential analytical reasons explaining the trends.
- **Insufficient Evidence**: Gaps where the master facts cannot draw a concrete conclusion.

Never fabricate facts or make up recruiter counts. Be concise, direct, and elite in your analytical response.`;

    try {
      const { GoogleGenAI } = await import('@google/genai');
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return `**Insufficient Evidence**: The Community Brain's AI service is offline because process.env.GEMINI_API_KEY is not configured.
Here is the current **Verified Fact**: Sourcing has generated ${overview.totalApplications} total applications across ${overview.recruitersCount} active recruiter nodes.`;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: question,
        config: { systemInstruction: systemPrompt }
      });

      return response.text || "No response received from Community Brain.";
    } catch (err: any) {
      logger.error('Failed to query Community Brain:', undefined, { error: err.message });
      return `**Insufficient Evidence**: Analytical query engine failed to execute. 
**Verified Fact**: The pipeline currently stands at: ${JSON.stringify(overview.pipeline)}.`;
    }
  }
}

export const recruitmentIntelligenceService = new RecruitmentIntelligenceService();
