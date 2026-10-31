/**
 * Community Configuration Model & Visibility Foundation
 */

export type VisibilityLevel =
  | 'PUBLIC'
  | 'APPLICANT'
  | 'MEMBER'
  | 'RECRUITER'
  | 'INTERVIEWER'
  | 'CONTROLLER'
  | 'OWNER';

export interface SectionContent {
  title: string;
  body: string;
  visibility: VisibilityLevel;
  lastUpdated: string;
}

export interface CommunityConfiguration {
  id: string;
  communityId: string;
  communityName: string;
  description: string;
  mission: string;
  rules: string[];
  guidelines: string[];
  requirements: string[];

  // Functional toggles
  applicationEnabled: boolean;
  interviewEnabled: boolean;
  recruiterCodeRequired: boolean;
  automaticRecruiterCodeGeneration: boolean;
  manualRecruiterCodesAllowed: boolean;
  aiAnalysisEnabled: boolean;
  dmNotificationsEnabled: boolean;
  welcomeMessageEnabled: boolean;
  timezone?: string;

  // Discord Channel & Role Mappings
  welcomeChannelId?: string;
  welcomeChannelName?: string;
  rulesChannelId?: string;
  rulesChannelName?: string;
  intakeChannelId?: string;
  defaultChannelId?: string;
  announcementChannelId?: string;
  moderationLogChannelId?: string;
  verifiedRoleId?: string;
  recruiterRoleId?: string;
  interviewerRoleId?: string;

  // Personalized Recruiter Identity (Task 1.6)
  recruiterDisplayName?: string;
  recruiterWelcomeGreeting?: string;
  recruiterAvatarUrl?: string;
  recruiterPersonaEnabled?: boolean;

  // Visibility-scoped information containers
  publicInformation: SectionContent[];
  memberInformation: SectionContent[];
  applicantInformation: SectionContent[];
  recruiterInformation: SectionContent[];

  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface RecruiterIdentityConfig {
  recruiterDisplayName: string;
  recruiterWelcomeGreeting: string;
  recruiterAvatarUrl?: string;
  recruiterPersonaEnabled: boolean;
  recruiterCodeRequired?: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_RECRUITER_NAME = 'Community Recruiter';
export const DEFAULT_RECRUITER_GREETING = "Hi! I'm {{recruiterName}}. I'll help guide you through your application and recruitment process.";
