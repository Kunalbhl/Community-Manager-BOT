/**
 * Server stats counters: channels whose name shows a live number (members, a role's members,
 * boosts, voice activity ...). The bot renames the channel when the number changes.
 * Discord allows a channel to be renamed about twice per 10 minutes, so each channel is
 * updated at most once every 5 minutes.
 */
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { FirestoreRepository } from '../../repositories/firestore.repository.js';
import { logger } from '../../logging/logger.js';
import { guildFor, isSnowflake } from '../toolkit/toolkitConfig.js';

export type StatKind =
  | 'members' | 'humans' | 'bots' | 'online' | 'role' | 'roleOnline'
  | 'boosts' | 'boostTier' | 'inVoice' | 'channels' | 'roles' | 'joinedToday' | 'goal';

export const STAT_KINDS: { id: StatKind; label: string; example: string }[] = [
  { id: 'members', label: 'All members', example: '👥 · MEMBERS : {count}' },
  { id: 'humans', label: 'Members (no bots)', example: '🙋 · HUMANS : {count}' },
  { id: 'bots', label: 'Bots', example: '🤖 · BOTS : {count}' },
  { id: 'online', label: 'Online now', example: '🟢 · ONLINE : {count}' },
  { id: 'role', label: 'Members with a role', example: '🎮 · GTA V : {count}' },
  { id: 'inVoice', label: 'In voice now', example: '🔊 · IN VOICE : {count}' },
  { id: 'boosts', label: 'Server boosts', example: '🚀 · BOOSTS : {count}' },
  { id: 'boostTier', label: 'Boost level', example: '💎 · LEVEL : {count}' },
  { id: 'joinedToday', label: 'Joined in the last 24 hours', example: '📈 · NEW TODAY : {count}' },
  { id: 'goal', label: 'Members until a goal', example: '🎯 · GOAL : {count}/{goal}' },
  { id: 'channels', label: 'Channels', example: '#️⃣ · CHANNELS : {count}' },
  { id: 'roles', label: 'Roles', example: '🏷️ · ROLES : {count}' },
];

export interface StatCounter {
  id: string;
  communityId: string;
  kind: StatKind;
  template: string;
  roleId?: string;
  goal?: number;
  format: 'plain' | 'comma' | 'short';
  channelId: string;
  createdByBot?: boolean;
  enabled: boolean;
  lastName?: string;
  lastValue?: number;
  lastUpdatedAt?: string;
  lastError?: string;
  position?: number;
  createdAt: string;
}

export const statCountersRepository = new FirestoreRepository<StatCounter & { [k: string]: any }>('serverStatCounters');

const MIN_GAP_MS = 5 * 60_000;
const memberFetchAt = new Map<string, number>();

function fmt(n: number, f: StatCounter['format']) {
  if (f === 'comma') return n.toLocaleString('en-IN');
  if (f === 'short') {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k`;
  }
  return String(n);
}

/** Loads all members once every 10 minutes so role counts are exact. */
async function ensureMembers(guild: any) {
  const last = memberFetchAt.get(guild.id) || 0;
  if (Date.now() - last < 10 * 60_000 && guild.members.cache.size >= (guild.memberCount || 0) - 2) return;
  memberFetchAt.set(guild.id, Date.now());
  await guild.members.fetch().catch(() => undefined);
}

async function valueOf(guild: any, c: Pick<StatCounter, 'kind' | 'roleId' | 'goal'>): Promise<number> {
  switch (c.kind) {
    case 'members': return guild.memberCount || guild.members.cache.size;
    case 'humans': await ensureMembers(guild); return guild.members.cache.filter((m: any) => !m.user.bot).size;
    case 'bots': await ensureMembers(guild); return guild.members.cache.filter((m: any) => m.user.bot).size;
    case 'online': {
      const g = await guild.client.guilds.fetch({ guild: guild.id, withCounts: true, force: true }).catch(() => null);
      return g?.approximatePresenceCount ?? 0;
    }
    case 'role': case 'roleOnline': {
      if (!c.roleId) return 0;
      await ensureMembers(guild);
      const role = guild.roles.cache.get(c.roleId);
      return role ? role.members.size : 0;
    }
    case 'inVoice': return guild.voiceStates.cache.filter((v: any) => v.channelId && !v.member?.user?.bot).size;
    case 'boosts': return guild.premiumSubscriptionCount || 0;
    case 'boostTier': return Number(guild.premiumTier) || 0;
    case 'joinedToday': {
      await ensureMembers(guild);
      const since = Date.now() - 86_400_000;
      return guild.members.cache.filter((m: any) => (m.joinedTimestamp || 0) >= since).size;
    }
    case 'goal': return Math.max(0, (c.goal || 0) - (guild.memberCount || 0));
    case 'channels': return guild.channels.cache.filter((ch: any) => ch.type !== ChannelType.GuildCategory).size;
    case 'roles': return Math.max(0, guild.roles.cache.size - 1); // without @everyone
    default: return 0;
  }
}

function render(c: Pick<StatCounter, 'template' | 'format' | 'goal'>, value: number, guild: any) {
  const t = c.template || '{count}';
  return t
    .replace(/\{count\}/gi, fmt(value, c.format))
    .replace(/\{goal\}/gi, fmt(c.goal || 0, c.format))
    .replace(/\{server\}/gi, guild?.name || '')
    .slice(0, 100) || fmt(value, c.format);
}

const clean = (b: any): Partial<StatCounter> => ({
  kind: (STAT_KINDS.some((k) => k.id === b.kind) ? b.kind : 'members') as StatKind,
  template: String(b.template || '').trim().slice(0, 100) || '{count}',
  roleId: isSnowflake(b.roleId) ? b.roleId : undefined,
  goal: Math.max(0, Math.min(10_000_000, Math.round(Number(b.goal) || 0))) || undefined,
  format: (['plain', 'comma', 'short'].includes(b.format) ? b.format : 'plain') as StatCounter['format'],
  enabled: b.enabled !== false,
});

export const serverStats = {
  kinds: STAT_KINDS,

  async list(communityId: string) {
    const rows = await statCountersRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] });
    const guild = await guildFor(communityId).catch(() => null);
    return rows
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.createdAt.localeCompare(b.createdAt))
      .map((r) => {
        const ch = guild?.channels.cache.get(r.channelId);
        return { ...r, channelName: ch?.name || null, channelMissing: Boolean(guild) && !ch };
      });
  },

  /** What the name would look like right now, without saving. */
  async preview(communityId: string, body: any) {
    const guild = await guildFor(communityId);
    if (!guild) throw new Error('The bot is not connected to this server right now.');
    const c = clean(body) as StatCounter;
    if (c.kind === 'role' && !c.roleId) throw new Error('Pick the role to count.');
    const value = await valueOf(guild, c);
    return { value, name: render(c, value, guild) };
  },

  /** Lists channels that look like counters already (a name with a number) so they can be linked. */
  async suggestExisting(communityId: string) {
    const guild = await guildFor(communityId);
    if (!guild) return [];
    const used = new Set((await statCountersRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] })).map((r) => r.channelId));
    return guild.channels.cache
      .filter((ch: any) => (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) && /\d/.test(ch.name) && !used.has(ch.id))
      .map((ch: any) => ({ id: ch.id, name: ch.name, template: ch.name.replace(/\d[\d,.]*\s*[kKmM]?(?!.*\d)/, '{count}'), parent: ch.parent?.name || null }));
  },

  async save(communityId: string, body: any) {
    const guild = await guildFor(communityId);
    if (!guild) throw new Error('The bot is not connected to this server right now.');
    const data = clean(body);
    if (data.kind === 'role' && !data.roleId) throw new Error('Pick the role to count.');
    if (data.kind === 'goal' && !data.goal) throw new Error('Set the member goal.');
    if (!/\{count\}/i.test(data.template!)) throw new Error('The name needs {count} where the number should go.');

    if (body.id) {
      const existing = await statCountersRepository.getById(String(body.id)).catch(() => null);
      if (!existing || existing.communityId !== communityId) throw new Error('Counter not found.');
      const saved = await statCountersRepository.update(existing.id, { ...data, lastError: '' } as any);
      await this.refreshOne(saved, guild, true);
      return saved;
    }

    // Link an existing channel: its permissions are left exactly as the admins set them.
    let channelId: string | undefined = isSnowflake(body.channelId) ? body.channelId : undefined;
    let createdByBot = false;
    if (channelId) {
      if (!guild.channels.cache.get(channelId)) throw new Error('That channel no longer exists.');
      const taken = await statCountersRepository.list({ where: [{ field: 'channelId', operator: '==', value: channelId }] });
      if (taken.length) throw new Error('That channel already shows a counter.');
    } else {
      const me = guild.members.me;
      if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) throw new Error('The bot needs the Manage Channels permission to create counter channels.');
      let parentId: string | undefined = isSnowflake(body.categoryId) ? body.categoryId : undefined;
      if (!parentId && body.newCategoryName) {
        // Reuse a stats category with the same name instead of making a second one.
        const wanted = String(body.newCategoryName).slice(0, 100);
        const same: any = guild.channels.cache.find((c: any) => c.type === ChannelType.GuildCategory && c.name === wanted);
        // Only the bot's own overwrite, so it can always see and rename its counters. @everyone is untouched.
        const cat = same || await guild.channels.create({ name: wanted, type: ChannelType.GuildCategory, position: 0, reason: 'Server stats',
          permissionOverwrites: [{ id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels] }] });
        parentId = cat.id;
      }
      const value = await valueOf(guild, data as StatCounter);
      const name = render(data as StatCounter, value, guild);
      // Only the new channel gets an overwrite: members can see it but not join it.
      // Nothing else on the server is changed.
      const overwrites = body.lock === false ? [] : [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect] },
        { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.ManageChannels] },
      ];
      const ch = await guild.channels.create({ name, type: ChannelType.GuildVoice, parent: parentId, permissionOverwrites: overwrites, reason: 'Server stats counter' });
      channelId = ch.id;
      createdByBot = true;
    }

    const saved = await statCountersRepository.create({
      ...data, communityId, channelId: channelId!, createdByBot, position: Date.now(), createdAt: new Date().toISOString(),
    } as any);
    await this.refreshOne(saved, guild, true);
    return saved;
  },

  async remove(communityId: string, id: string, deleteChannel: boolean) {
    const c = await statCountersRepository.getById(id).catch(() => null);
    if (!c || c.communityId !== communityId) throw new Error('Counter not found.');
    if (deleteChannel) {
      const guild = await guildFor(communityId);
      const ch: any = guild?.channels.cache.get(c.channelId);
      if (ch) await ch.delete('Server stats counter removed').catch((e: any) => { throw new Error(`Could not delete the channel: ${e?.message}`); });
    }
    await statCountersRepository.delete(c.id);
    return { deleted: true };
  },

  async refreshOne(c: StatCounter, guild: any, force = false) {
    if (!c.enabled) return c;
    const ch: any = guild.channels.cache.get(c.channelId);
    if (!ch) { if (c.lastError !== 'missing') await statCountersRepository.update(c.id, { lastError: 'missing' } as any).catch(() => undefined); return c; }
    const value = await valueOf(guild, c);
    const name = render(c, value, guild);
    if (ch.name === name) {
      if (c.lastValue !== value) await statCountersRepository.update(c.id, { lastValue: value, lastName: name, lastError: '' } as any).catch(() => undefined);
      return c;
    }
    const since = c.lastUpdatedAt ? Date.now() - Date.parse(c.lastUpdatedAt) : Infinity;
    if (!force && since < MIN_GAP_MS) return c;
    let accessNote = '';
    { const { ensureSelfPerms } = await import('../../integrations/discord/selfAccess.js'); accessNote = await ensureSelfPerms(ch, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels], 'update the stats counter'); }
    try {
      // setName can wait a long time when Discord rate-limits; don't block the loop for it.
      await Promise.race([ch.setName(name, 'Server stats'), new Promise((_, rej) => setTimeout(() => rej(new Error('Discord is limiting renames; it will update shortly.')), 15_000))]);
      await statCountersRepository.update(c.id, { lastValue: value, lastName: name, lastUpdatedAt: new Date().toISOString(), lastError: '' } as any);
    } catch (e: any) {
      const raw = String(e?.message || e);
      const { explainAccess } = await import('../../integrations/discord/selfAccess.js');
      const msg = /Missing Access|50001|Missing Permissions|50013/.test(raw)
        ? (explainAccess(ch, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels]) || accessNote || 'The bot needs View Channel and Manage Channels on this channel.')
        : raw.slice(0, 200);
      await statCountersRepository.update(c.id, { lastError: msg.slice(0, 900), lastUpdatedAt: new Date().toISOString() } as any).catch(() => undefined);
    }
    return c;
  },

  async refreshCommunity(communityId: string) {
    const guild = await guildFor(communityId);
    if (!guild) throw new Error('The bot is not connected to this server right now.');
    const rows = await statCountersRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] });
    for (const r of rows) await this.refreshOne(r, guild, true).catch(() => undefined);
    return this.list(communityId);
  },

  /** Called every minute from the scheduler on the active bot. */
  async tick() {
    const rows = await statCountersRepository.list({}).catch(() => [] as StatCounter[]);
    const byCommunity = new Map<string, StatCounter[]>();
    for (const r of rows) if (r.enabled) byCommunity.set(r.communityId, [...(byCommunity.get(r.communityId) || []), r]);
    for (const [communityId, list] of byCommunity) {
      const guild = await guildFor(communityId).catch(() => null);
      if (!guild) continue;
      for (const c of list) await this.refreshOne(c, guild).catch((e) => logger.warn(`[ServerStats] ${c.id}: ${e?.message}`));
    }
  },
};
