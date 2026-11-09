/**
 * Per-server settings for the toolkit modules: tickets, warning rules, recruitment role rules
 * and application review rooms. One document per community, created with sensible defaults.
 */
import { FirestoreRepository } from '../../repositories/firestore.repository.js';
import { communitiesRepository } from '../../repositories/index.js';
import { discordService } from '../../integrations/discord/discord.service.js';

export interface TicketType {
  key: string; label: string; emoji: string; description: string; staffRoleIds: string[];
  /** Button colour when the panel uses buttons. */
  buttonStyle?: 'PRIMARY' | 'SECONDARY' | 'SUCCESS' | 'DANGER';
  /** Extra people and roles pinged when this type is opened. */
  pingRoleIds?: string[]; pingUserIds?: string[];
  /** First message inside the ticket. Variables: {member} {type} {number} {subject} {server}. */
  welcomeTitle?: string; welcomeMessage?: string;
}
export interface TicketEmbed {
  title: string; description: string; color: string; url?: string;
  authorName?: string; authorIcon?: string; thumbnail?: string; image?: string;
  footerText?: string; footerIcon?: string; timestamp?: boolean;
  /** Add the list of ticket types under the description. */
  listTypes: boolean;
}
export interface TicketPanel {
  style: 'DROPDOWN' | 'BUTTONS';
  placeholder: string;
  /** Text above the embed; mentions here notify people when the panel is posted. */
  content: string;
  embed: TicketEmbed;
  /** Ping the staff roles when a ticket opens. */
  pingStaff: boolean;
  channelId?: string; messageId?: string;
}
export interface WarningReason { key: string; label: string; points: number }
export type PunishAction = 'TIMEOUT' | 'KICK' | 'BAN';
export interface WarningThreshold { points: number; action: PunishAction; durationMinutes?: number }
export interface RoleRule {
  id: string;
  name: string;
  enabled: boolean;
  condition:
    | { type: 'ALWAYS' }
    | { type: 'ANSWER_CONTAINS'; question: string; value: string }
    | { type: 'RECRUITER_CODE'; code: string }
    | { type: 'ANY_RECRUITER_CODE' }
    | { type: 'SOURCE'; source: string };
  addRoleIds: string[];
  removeRoleIds: string[];
}
export const DEFAULT_TICKET_PANEL: TicketPanel = {
  style: 'DROPDOWN', placeholder: 'Choose what you need help with', content: '', pingStaff: true,
  embed: { title: '🎫 Need help? Open a ticket', description: 'Pick a type below and a private channel opens for you and our staff.', color: '#7c8cff', listTypes: true, timestamp: false },
};
export interface ReviewTier { name: string; roleIds: string[] }

export interface ToolkitConfig {
  id: string;
  communityId: string;
  tickets: { enabled: boolean; categoryId?: string; logChannelId?: string; staffRoleIds: string[]; types: TicketType[]; counter: number; panelPostedAt?: string; panel?: TicketPanel };
  warnings: { enabled: boolean; expiryDays: number; dmMember: boolean; reasons: WarningReason[]; thresholds: WarningThreshold[] };
  roleRules: { enabled: boolean; rules: RoleRule[] };
  reviewRooms: { enabled: boolean; categoryId?: string; applicantCanSee: boolean; tiers: ReviewTier[]; deleteAfterHours: number; specialMemberIds?: string[] };
  recruitment: RecruitmentDiscordConfig;
  updatedAt: string;
}

/** How recruitment runs inside Discord: where people apply, where staff review, and the messages sent. */
export interface RecruitmentDiscordConfig {
  applyEnabled: boolean;
  askRecruiterCode: boolean;
  /** When asking for a code, applicants must enter one. */
  codeRequired?: boolean;
  reviewChannelId?: string;
  logChannelId?: string;
  notifyRecruiter: boolean;
  sheetWebhookUrl?: string;
  sheetToken?: string;
  /** Link to open the Google Sheet (shown only to sheetRoleIds via /sheet). */
  sheetViewUrl?: string;
  sheetRoleIds?: string[];
  sheetLastSync?: { at: string; ok: boolean; error?: string };
  panelPostedAt?: string;
  pingRoleIds: string[];
  reviewerRoleIds: string[];
  dmOnReceived: boolean;
  announceChannelId?: string;
  messages: { received: string; approved: string; rejected: string; announce: string; panelTitle: string; panelText: string };
  /** Rules screening inside the private application chat. */
  screening: {
    mode: 'AUTO' | 'MANUAL';
    consentText: string;
    questions: ScreeningQuizQuestion[];
    onFail: 'GUIDE_AND_CONTINUE' | 'GUIDE_AND_HOLD';
  };
  /** Interview inside the private application chat. */
  interview: { mode: 'AUTO' | 'MANUAL' };
}

export interface ScreeningQuizQuestion { id: string; question: string; options: string[]; correct: number; explain: string }

export const DEFAULT_RECRUITMENT_MESSAGES = {
  received: '📥 Hi {applicant}, we received your application to **{server}**. Our team will review it soon and you will hear from us here.',
  approved: '🎉 Congratulations {applicant}! Your application to **{server}** was approved by {reviewer}. Welcome aboard!',
  rejected: 'Hi {applicant}, thank you for applying to **{server}**. This time your application was not approved.\nReason: {reason}',
  announce: '🎉 Please welcome {mention} to the team!',
  panelTitle: '📋 Join our team',
  panelText: 'Press **Apply** to fill in a short application. It only takes a few minutes, and you will get a DM when it is reviewed.',
};

export const toolkitRepository = new FirestoreRepository<ToolkitConfig>('serverToolkitConfigs');

export function defaultToolkit(communityId: string): ToolkitConfig {
  return {
    id: communityId,
    communityId,
    tickets: {
      enabled: true,
      staffRoleIds: [],
      counter: 0,
      types: [
        { key: 'report', label: 'Report a member', emoji: '🚩', description: 'Report rule breaking, harassment or scams', staffRoleIds: [] },
        { key: 'help', label: 'Get help', emoji: '🙋', description: 'Questions about the server or the bot', staffRoleIds: [] },
        { key: 'appeal', label: 'Appeal a punishment', emoji: '⚖️', description: 'Ask staff to review a warning, timeout or ban', staffRoleIds: [] },
        { key: 'bug', label: 'Report a bug', emoji: '🐞', description: 'Something is broken', staffRoleIds: [] },
        { key: 'business', label: 'Business or partnership', emoji: '🤝', description: 'Collaborations, sponsorships and partnerships', staffRoleIds: [] },
      ],
    },
    warnings: {
      enabled: true,
      expiryDays: 30,
      dmMember: true,
      reasons: [
        { key: 'spam', label: 'Spam or flooding', points: 1 },
        { key: 'offtopic', label: 'Off-topic or wrong channel', points: 1 },
        { key: 'language', label: 'Inappropriate language', points: 2 },
        { key: 'harassment', label: 'Harassment or bullying', points: 3 },
        { key: 'nsfw', label: 'NSFW content', points: 4 },
        { key: 'scam', label: 'Scam or malicious link', points: 5 },
      ],
      thresholds: [
        { points: 3, action: 'TIMEOUT', durationMinutes: 60 },
        { points: 5, action: 'TIMEOUT', durationMinutes: 24 * 60 },
        { points: 8, action: 'KICK' },
        { points: 10, action: 'BAN' },
      ],
    },
    roleRules: { enabled: true, rules: [] },
    reviewRooms: { enabled: true, applicantCanSee: true, tiers: [{ name: 'Recruiters', roleIds: [] }, { name: 'Senior staff', roleIds: [] }, { name: 'Leadership', roleIds: [] }], deleteAfterHours: 24 },
    recruitment: {
      applyEnabled: true, askRecruiterCode: true, notifyRecruiter: true, pingRoleIds: [], reviewerRoleIds: [], dmOnReceived: true, messages: { ...DEFAULT_RECRUITMENT_MESSAGES },
      screening: { mode: 'AUTO', onFail: 'GUIDE_AND_CONTINUE', questions: [], consentText: 'Before we continue, please read our rules and guide below carefully. Press **I have read and agree** when you are done.' },
      interview: { mode: 'MANUAL' },
    },
    updatedAt: new Date().toISOString(),
  };
}

export async function getToolkit(communityId: string): Promise<ToolkitConfig> {
  const saved = await toolkitRepository.getById(communityId).catch(() => null);
  const d = defaultToolkit(communityId);
  if (!saved) return d;
  return {
    ...d,
    ...saved,
    tickets: { ...d.tickets, ...(saved.tickets || {}) },
    warnings: { ...d.warnings, ...(saved.warnings || {}) },
    roleRules: { ...d.roleRules, ...(saved.roleRules || {}) },
    reviewRooms: { ...d.reviewRooms, ...(saved.reviewRooms || {}) },
    recruitment: { ...d.recruitment, ...((saved as any).recruitment || {}), messages: { ...d.recruitment.messages, ...((saved as any).recruitment?.messages || {}) }, screening: { ...d.recruitment.screening, ...((saved as any).recruitment?.screening || {}) }, interview: { ...d.recruitment.interview, ...((saved as any).recruitment?.interview || {}) } },
  };
}

export async function saveToolkit(communityId: string, patch: Partial<ToolkitConfig>): Promise<ToolkitConfig> {
  const current = await getToolkit(communityId);
  const next: ToolkitConfig = { ...current, ...patch, id: communityId, communityId, updatedAt: new Date().toISOString() };
  const exists = await toolkitRepository.getById(communityId).catch(() => null);
  if (exists) await toolkitRepository.update(communityId, next as any);
  else await toolkitRepository.create(communityId, next);
  return next;
}

/** communityId -> live discord.js Guild (null when the bot is not connected or not in the server). */
export async function guildFor(communityId: string): Promise<any | null> {
  const client: any = discordService.client;
  if (!client || !discordService.isConnected()) return null;
  const community: any = await communitiesRepository.getById(communityId).catch(() => null);
  const guildId = community?.guildId || communityId.replace(/^comm_/, '');
  return client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
}

export async function communityForGuild(guildId: string): Promise<string> {
  const list = await communitiesRepository.list({ where: [{ field: 'guildId', operator: '==', value: guildId }], limit: 1 });
  return list[0]?.id || `comm_${guildId}`;
}

export const isSnowflake = (v: unknown): v is string => typeof v === 'string' && /^\d{15,21}$/.test(v);
