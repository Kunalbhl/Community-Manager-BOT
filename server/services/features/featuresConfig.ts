/**
 * Per-server settings for community features: levels, server logs, starboard, birthdays,
 * verification and custom commands. (Giveaways and button-role panels are stored as their own records.)
 */
import { FirestoreRepository } from '../../repositories/firestore.repository.js';

export interface LevelReward { level: number; roleId: string }
export interface CustomCommand { name: string; response: string; embed: boolean; deleteTrigger: boolean }

export interface FeaturesConfig {
  id: string;
  communityId: string;
  levels: {
    enabled: boolean; minXp: number; maxXp: number; cooldownSeconds: number;
    announce: 'SAME_CHANNEL' | 'CHANNEL' | 'DM' | 'OFF'; channelId?: string; message: string;
    noXpChannelIds: string[]; noXpRoleIds: string[]; rewards: LevelReward[]; keepOldRewards: boolean;
    /** XP per minute spent in voice (0 = off). */ voiceXpPerMinute?: number; voiceRequireOthers?: boolean; voiceIgnoreMuted?: boolean;
  };
  logs: {
    enabled: boolean; channelId?: string;
    events: { memberJoin: boolean; memberLeave: boolean; messageDelete: boolean; messageEdit: boolean; roleChange: boolean; nicknameChange: boolean; moderation: boolean };
  };
  starboard: { enabled: boolean; channelId?: string; emoji: string; threshold: number; allowSelfStar: boolean };
  birthdays: { enabled: boolean; channelId?: string; roleId?: string; message: string; hour: number; timezone: string; lastRunDate?: string; askOnJoin?: boolean };
  verification: { enabled: boolean; roleId?: string; removeRoleId?: string; mode: 'BUTTON' | 'MATH'; message: string };
  customCommands: { enabled: boolean; prefix: string; commands: CustomCommand[] };
  updatedAt: string;
}

export const featuresRepository = new FirestoreRepository<FeaturesConfig>('serverFeatureConfigs');

export function defaultFeatures(communityId: string): FeaturesConfig {
  return {
    id: communityId,
    communityId,
    levels: {
      enabled: false, minXp: 15, maxXp: 25, cooldownSeconds: 60,
      announce: 'SAME_CHANNEL', message: '🎉 {user} just reached **level {level}**!',
      noXpChannelIds: [], noXpRoleIds: [], rewards: [], keepOldRewards: true,
    },
    logs: {
      enabled: false,
      events: { memberJoin: true, memberLeave: true, messageDelete: true, messageEdit: true, roleChange: true, nicknameChange: true, moderation: true },
    },
    starboard: { enabled: false, emoji: '⭐', threshold: 3, allowSelfStar: false },
    birthdays: { enabled: false, message: '🎂 Happy birthday {user}! Have a great day!', hour: 9, timezone: 'Asia/Kolkata' },
    verification: { enabled: false, mode: 'BUTTON', message: 'Welcome! Press **Verify** to unlock the server.' },
    customCommands: { enabled: false, prefix: '!', commands: [] },
    updatedAt: new Date().toISOString(),
  };
}

const cache = new Map<string, { at: number; cfg: FeaturesConfig }>();

export async function getFeatures(communityId: string, fresh = false): Promise<FeaturesConfig> {
  const hit = cache.get(communityId);
  if (!fresh && hit && Date.now() - hit.at < 30_000) return hit.cfg;
  const saved = await featuresRepository.getById(communityId).catch(() => null);
  const d = defaultFeatures(communityId);
  const cfg: FeaturesConfig = saved ? {
    ...d, ...saved,
    levels: { ...d.levels, ...(saved.levels || {}) },
    logs: { ...d.logs, ...(saved.logs || {}), events: { ...d.logs.events, ...(saved.logs?.events || {}) } },
    starboard: { ...d.starboard, ...(saved.starboard || {}) },
    birthdays: { ...d.birthdays, ...(saved.birthdays || {}) },
    verification: { ...d.verification, ...(saved.verification || {}) },
    customCommands: { ...d.customCommands, ...(saved.customCommands || {}) },
  } : d;
  cache.set(communityId, { at: Date.now(), cfg });
  return cfg;
}

export async function saveFeatures(communityId: string, patch: Partial<FeaturesConfig>): Promise<FeaturesConfig> {
  const current = await getFeatures(communityId, true);
  const next: FeaturesConfig = { ...current, ...patch, id: communityId, communityId, updatedAt: new Date().toISOString() };
  const exists = await featuresRepository.getById(communityId).catch(() => null);
  if (exists) await featuresRepository.update(communityId, next as any);
  else await featuresRepository.create(communityId, next);
  cache.set(communityId, { at: Date.now(), cfg: next });
  return next;
}

/** Fills {user}, {username}, {server}, {level} placeholders. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
