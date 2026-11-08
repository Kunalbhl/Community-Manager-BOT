/**
 * Per-server settings for the toolkit modules: tickets, warning rules, recruitment role rules
 * and application review rooms. One document per community, created with sensible defaults.
 */
import { FirestoreRepository } from '../../repositories/firestore.repository.js';
import { communitiesRepository } from '../../repositories/index.js';
import { discordService } from '../../integrations/discord/discord.service.js';

export interface TicketType { key: string; label: string; emoji: string; description: string; staffRoleIds: string[] }
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
export interface ReviewTier { name: string; roleIds: string[] }

export interface ToolkitConfig {
  id: string;
  communityId: string;
  tickets: { enabled: boolean; categoryId?: string; logChannelId?: string; staffRoleIds: string[]; types: TicketType[]; counter: number };
  warnings: { enabled: boolean; expiryDays: number; dmMember: boolean; reasons: WarningReason[]; thresholds: WarningThreshold[] };
  roleRules: { enabled: boolean; rules: RoleRule[] };
  reviewRooms: { enabled: boolean; categoryId?: string; applicantCanSee: boolean; tiers: ReviewTier[]; deleteAfterHours: number };
  updatedAt: string;
}

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
    reviewRooms: { enabled: false, applicantCanSee: true, tiers: [{ name: 'Recruiters', roleIds: [] }, { name: 'Senior staff', roleIds: [] }, { name: 'Leadership', roleIds: [] }], deleteAfterHours: 24 },
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
