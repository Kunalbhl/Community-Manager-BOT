import {
  ApplicationDocument,
  RecruiterDocument,
  ReferralDocument,
  AuditLogDocument,
} from '../../../shared/types/models.js';
import { CommunityConfiguration } from '../../../shared/types/community.js';

export type GoogleSheetsStructureType = 'BOT_TEMPLATE' | 'CUSTOM_STRUCTURE';

export type GoogleSheetsSyncState =
  | 'NOT_CONFIGURED'
  | 'AUTHENTICATION_REQUIRED'
  | 'CONNECTED'
  | 'SYNCING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'DISCONNECTED';

export interface SheetAppendResult {
  spreadsheetId: string;
  sheetName: string;
  rowNumber: number;
  status: 'APPENDED' | 'QUEUED' | 'DISABLED';
  error?: string;
}

export const BOT_TEMPLATE_SHEETS = [
  'Dashboard',
  'Applicants',
  'Applications',
  'Interview Answers',
  'Recruiters',
  'Recruiter Codes',
  'Referrals',
  'Notifications',
  'Rewards',
  'Audit Logs',
  'Community Configuration',
  'AI Analysis',
  'Statistics',
] as const;

export type BotTemplateSheetName = (typeof BOT_TEMPLATE_SHEETS)[number];

export interface IGoogleSheetsService {
  isConfigured(): boolean;
  getSyncState(): GoogleSheetsSyncState;
  appendApplication(application: ApplicationDocument): Promise<SheetAppendResult>;
  updateApplication(applicationId: string, status: string): Promise<boolean>;
  appendRecruiter(recruiter: RecruiterDocument): Promise<SheetAppendResult>;
  updateRecruiter(recruiterId: string, updates: Partial<RecruiterDocument>): Promise<boolean>;
  appendReferral(referral: ReferralDocument): Promise<SheetAppendResult>;
  appendAuditLog(auditLog: AuditLogDocument): Promise<SheetAppendResult>;
  syncConfiguration(config: CommunityConfiguration): Promise<boolean>;
}
