/**
 * Levels and XP. Members earn random XP per message (with a cooldown), level up, and can unlock
 * reward roles. Level curve: XP needed for the next level = 5·L² + 50·L + 100.
 */
import { FirestoreRepository } from '../../repositories/firestore.repository.js';
import { logger } from '../../logging/logger.js';
import { getFeatures, fill } from './featuresConfig.js';

export interface MemberLevelDoc {
  id: string; // `${communityId}_${userId}`
  communityId: string;
  userId: string;
  username: string;
  xp: number; // total XP
  level: number;
  messages: number;
  lastXpAt: number;
  updatedAt: string;
}

export const memberLevelsRepository = new FirestoreRepository<MemberLevelDoc>('memberLevels');

export const xpForNext = (level: number) => 5 * level * level + 50 * level + 100;

/** Splits total XP into level + progress inside the current level. */
export function levelFromXp(total: number) {
  let level = 0;
  let rest = total;
  while (rest >= xpForNext(level)) { rest -= xpForNext(level); level++; }
  return { level, into: rest, needed: xpForNext(level) };
}

const cooldown = new Map<string, number>();

export const levels = {
  async onMessage(communityId: string, message: any) {
    const cfg = (await getFeatures(communityId)).levels;
    if (!cfg.enabled) return;
    if (cfg.noXpChannelIds.includes(message.channel.id)) return;
    if (cfg.noXpRoleIds.some((r) => message.member?.roles?.cache?.has(r))) return;

    const key = `${communityId}_${message.author.id}`;
    const now = Date.now();
    if (now - (cooldown.get(key) || 0) < cfg.cooldownSeconds * 1000) return;
    cooldown.set(key, now);

    const gain = Math.floor(cfg.minXp + Math.random() * (Math.max(cfg.maxXp, cfg.minXp) - cfg.minXp + 1));
    const doc = await memberLevelsRepository.getById(key).catch(() => null);
    const before = doc ? levelFromXp(doc.xp).level : 0;
    const xp = (doc?.xp || 0) + gain;
    const after = levelFromXp(xp).level;
    const data = { communityId, userId: message.author.id, username: message.member?.displayName || message.author.username, xp, level: after, messages: (doc?.messages || 0) + 1, lastXpAt: now, updatedAt: new Date().toISOString() };
    if (doc) await memberLevelsRepository.update(key, data as any);
    else await memberLevelsRepository.create(key, { id: key, ...data } as any);

    if (after > before) await this.onLevelUp(communityId, message, after).catch((err) => logger.warn(`[Levels] level-up failed: ${err?.message}`));
  },

  /** Adds XP to a member (messages or voice) and handles level-ups. `where` is the channel to announce in. */
  async grant(communityId: string, member: any, gain: number, where: any, source: 'message' | 'voice') {
    const key = `${communityId}_${member.id}`;
    const doc = await memberLevelsRepository.getById(key).catch(() => null);
    const before = doc ? levelFromXp(doc.xp).level : 0;
    const xp = (doc?.xp || 0) + gain;
    const after = levelFromXp(xp).level;
    const data: any = { communityId, userId: member.id, username: member.displayName || member.user?.username, xp, level: after, messages: doc?.messages || 0, voiceMinutes: (doc as any)?.voiceMinutes || 0, lastXpAt: Date.now(), updatedAt: new Date().toISOString() };
    if (source === 'voice') data.voiceMinutes += 1;
    if (doc) await memberLevelsRepository.update(key, data); else await memberLevelsRepository.create(key, { id: key, ...data });
    if (after > before) await this.onLevelUp(communityId, { member, author: member.user, guild: member.guild, channel: where }, after).catch((err) => logger.warn(`[Levels] level-up failed: ${err?.message}`));
  },

  /**
   * Voice XP, run every minute: members in voice channels earn XP per minute.
   * Discord doesn't let bots see who is talking without recording audio, so "active" means
   * not deafened (and, if chosen, not muted), with at least one other person in the channel.
   */
  async voiceTick(communityId: string, guild: any) {
    const cfg = (await getFeatures(communityId)).levels;
    const per = Number(cfg.voiceXpPerMinute) || 0;
    if (!cfg.enabled || per <= 0) return;
    for (const ch of guild.channels.cache.values()) {
      if (!(ch.type === 2 || ch.type === 13) || ch.id === guild.afkChannelId || cfg.noXpChannelIds.includes(ch.id)) continue;
      const humans = Array.from(ch.members.values()).filter((m: any) => !m.user.bot) as any[];
      if (cfg.voiceRequireOthers !== false && humans.length < 2) continue;
      for (const m of humans) {
        const v = m.voice;
        if (v.selfDeaf || v.serverDeaf) continue;
        if (cfg.voiceIgnoreMuted !== false && (v.selfMute || v.serverMute)) continue;
        if (cfg.noXpRoleIds.some((r) => m.roles.cache.has(r))) continue;
        await this.grant(communityId, m, per, ch, 'voice').catch(() => undefined);
      }
    }
  },

  async onLevelUp(communityId: string, message: any, level: number) {
    const cfg = (await getFeatures(communityId)).levels;
    const member = message.member;
    const earned = cfg.rewards.filter((r) => r.level <= level).sort((a, b) => a.level - b.level);
    const newest = earned.filter((r) => r.level === level);
    for (const r of newest) await member?.roles?.add(r.roleId, `Level ${level} reward`).catch(() => undefined);
    if (!cfg.keepOldRewards && newest.length) {
      for (const r of earned.filter((x) => x.level < level)) await member?.roles?.remove(r.roleId, 'Replaced by higher level reward').catch(() => undefined);
    }

    if (cfg.announce === 'OFF') return;
    const text = fill(cfg.message, { user: `<@${message.author.id}>`, username: member?.displayName || message.author.username, level, server: message.guild.name });
    const payload = { content: text, allowedMentions: { users: [message.author.id] } };
    if (cfg.announce === 'DM') await message.author.send(text).catch(() => undefined);
    else if (cfg.announce === 'CHANNEL' && cfg.channelId) await (message.guild.channels.cache.get(cfg.channelId) as any)?.send(payload).catch(() => undefined);
    else await message.channel.send(payload).catch(() => undefined);
  },

  async leaderboard(communityId: string, limit = 25) {
    const all = await memberLevelsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] });
    return all.sort((a, b) => b.xp - a.xp).slice(0, limit).map((d, i) => ({ rank: i + 1, userId: d.userId, username: d.username, xp: d.xp, messages: d.messages, ...levelFromXp(d.xp) }));
  },

  async rankOf(communityId: string, userId: string) {
    const all = await memberLevelsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] });
    const sorted = all.sort((a, b) => b.xp - a.xp);
    const i = sorted.findIndex((d) => d.userId === userId);
    if (i < 0) return null;
    return { rank: i + 1, total: sorted.length, xp: sorted[i].xp, messages: sorted[i].messages, ...levelFromXp(sorted[i].xp) };
  },

  /** Staff tool: set a member's XP (e.g. migrate from another bot). */
  async setXp(communityId: string, userId: string, username: string, xp: number) {
    const key = `${communityId}_${userId}`;
    const data = { communityId, userId, username, xp: Math.max(0, Math.round(xp)), level: levelFromXp(xp).level, updatedAt: new Date().toISOString() };
    const doc = await memberLevelsRepository.getById(key).catch(() => null);
    if (doc) return memberLevelsRepository.update(key, data as any);
    return memberLevelsRepository.create(key, { id: key, messages: 0, lastXpAt: 0, ...data } as any);
  },
};
