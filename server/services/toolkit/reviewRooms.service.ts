/**
 * Application review rooms.
 *
 * Every new application gets a private text channel where reviewers (and optionally the applicant)
 * discuss it. Buttons in the room:
 *   🎙️ Voice room   -> creates a temporary voice channel with the same access (deleted when empty)
 *   ⬆️ Escalate     -> opens the room to the next reviewer rank and pings them
 *   ✅ Approve / ❌ Reject -> decides through the normal application workflow (roles, DMs, audit)
 * Closed rooms lose applicant access immediately and are deleted after `deleteAfterHours`.
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits } from 'discord.js';
import { FirestoreRepository } from '../../repositories/firestore.repository.js';
import { applicationsRepository } from '../../repositories/index.js';
import { logger } from '../../logging/logger.js';
import { getToolkit, saveToolkit, guildFor, isSnowflake } from './toolkitConfig.js';

export interface ReviewRoomDoc {
  id: string; // = applicationId
  communityId: string;
  guildId: string;
  applicationId: string;
  applicantId: string;
  applicantName: string;
  channelId: string;
  voiceChannelId?: string;
  voiceEmptySince?: number;
  tier: number;
  status: 'OPEN' | 'CLOSED' | 'ARCHIVED';
  decision?: 'APPROVED' | 'REJECTED';
  history: { at: string; by: string; event: string }[];
  createdAt: string;
  closedAt?: string;
}

export const reviewRoomsRepository = new FirestoreRepository<ReviewRoomDoc>('reviewRooms');

const VIEW = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks];
const VOICE = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream, PermissionFlagsBits.UseVAD];

function buttons(room: ReviewRoomDoc, tierCount: number) {
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`cm:room:voice:${room.id}`).setLabel(room.voiceChannelId ? 'End voice room' : 'Voice room').setEmoji('🎙️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cm:room:escalate:${room.id}`).setLabel('Escalate').setEmoji('⬆️').setStyle(ButtonStyle.Secondary).setDisabled(room.tier >= tierCount - 1),
    new ButtonBuilder().setCustomId(`cm:room:approve:${room.id}`).setLabel('Approve').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`cm:room:reject:${room.id}`).setLabel('Reject').setEmoji('❌').setStyle(ButtonStyle.Danger),
  )];
}

/** Role ids of tiers 0..tier (everyone up to the current rank can see the room). */
function rolesUpTo(tiers: { roleIds: string[] }[], tier: number) {
  return [...new Set(tiers.slice(0, tier + 1).flatMap((t) => t.roleIds))];
}

export const reviewRooms = {
  /** Highest tier index the member belongs to; -1 if none. Server managers count as the top tier. */
  async memberTier(communityId: string, member: any): Promise<number> {
    const cfg = (await getToolkit(communityId)).reviewRooms;
    if (member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)) return cfg.tiers.length - 1;
    let best = -1;
    cfg.tiers.forEach((t, i) => { if (t.roleIds.some((r) => member?.roles?.cache?.has(r))) best = i; });
    return best;
  },

  async openForApplication(applicationId: string): Promise<ReviewRoomDoc | null> {
    const app: any = await applicationsRepository.getById(applicationId);
    if (!app) return null;
    const cfg = (await getToolkit(app.communityId)).reviewRooms;
    if (!cfg.enabled) return null;
    const existing = await reviewRoomsRepository.getById(applicationId).catch(() => null);
    if (existing) return existing;
    const guild = await guildFor(app.communityId);
    if (!guild) return null;

    let categoryId = cfg.categoryId;
    if (!categoryId || !guild.channels.cache.get(categoryId)) {
      const cat = await guild.channels.create({ name: 'Application Reviews', type: ChannelType.GuildCategory, permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }] });
      categoryId = cat.id;
      await saveToolkit(app.communityId, { reviewRooms: { ...cfg, categoryId } });
    }
    const applicantId = app.applicantDiscordUserId || app.applicantDiscordId;
    const applicantName = app.applicantUsernameSnapshot || app.applicantUsername || 'applicant';
    const staff = rolesUpTo(cfg.tiers, 0).filter((id) => isSnowflake(id) && guild.roles.cache.has(id));
    const applicantInServer = cfg.applicantCanSee && isSnowflake(applicantId) && (await guild.members.fetch(applicantId).catch(() => null));

    const channel = await guild.channels.create({
      name: `app-${String(applicantName).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'applicant'}`,
      type: ChannelType.GuildText,
      parent: categoryId,
      topic: `Application ${applicationId} · ${applicantName}`,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: guild.members.me.id, allow: [...VIEW, PermissionFlagsBits.ManageChannels] },
        ...staff.map((id) => ({ id, allow: VIEW })),
        ...(applicantInServer ? [{ id: applicantId, allow: VIEW }] : []),
      ],
    });

    const room = await reviewRoomsRepository.create(applicationId, {
      communityId: app.communityId, guildId: guild.id, applicationId, applicantId, applicantName,
      channelId: channel.id, tier: 0, status: 'OPEN', history: [{ at: new Date().toISOString(), by: 'system', event: 'Room opened' }],
      createdAt: new Date().toISOString(),
    } as any);

    const answers = Array.isArray(app.answers)
      ? app.answers.slice(0, 10).map((a: any) => ({ name: String(a.questionText || a.questionId).slice(0, 256), value: String(a.answerText || (a.answerValues || []).join(', ') || '—').slice(0, 1024) }))
      : [];
    await channel.send({
      content: `${staff.map((r) => `<@&${r}>`).join(' ')} New application to review${applicantInServer ? ` · <@${applicantId}> welcome, staff will talk with you here.` : ''}`,
      allowedMentions: { roles: staff, users: applicantInServer ? [applicantId] : [] },
      embeds: [{
        title: `📥 Application · ${applicantName}`,
        color: 0x7c8cff,
        fields: [
          { name: 'Reviewer rank', value: cfg.tiers[0]?.name || 'Reviewers', inline: true },
          { name: 'Recruiter code', value: String(app.recruiterCodeUsed || app.recruiterCode || '—'), inline: true },
          ...answers,
        ],
        footer: { text: 'Use the buttons below. Escalate to bring in the next rank.' },
      }],
      components: buttons(room, cfg.tiers.length),
    });
    return room;
  },

  async toggleVoice(roomId: string, actor: any): Promise<string> {
    const room = await reviewRoomsRepository.getById(roomId);
    if (!room || room.status !== 'OPEN') throw new Error('This review room is closed.');
    if ((await this.memberTier(room.communityId, actor)) < 0) throw new Error('Only reviewers can manage the voice room.');
    const guild = await guildFor(room.communityId);
    if (!guild) throw new Error('Server not reachable right now.');
    if (room.voiceChannelId && guild.channels.cache.get(room.voiceChannelId)) {
      await guild.channels.cache.get(room.voiceChannelId)?.delete('Voice room ended').catch(() => undefined);
      await reviewRoomsRepository.update(roomId, { voiceChannelId: null, voiceEmptySince: null, history: [...room.history, { at: new Date().toISOString(), by: actor.id, event: 'Voice room ended' }] } as any);
      return '🎙️ Voice room ended.';
    }
    const text: any = guild.channels.cache.get(room.channelId);
    const overwrites = text
      ? Array.from(text.permissionOverwrites.cache.values()).map((o: any) => ({ id: o.id, type: o.type, deny: o.id === guild.roles.everyone.id ? [PermissionFlagsBits.ViewChannel] : [], allow: o.id === guild.roles.everyone.id ? [] : o.id === guild.members.me.id ? [...VOICE, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] : VOICE }))
      : [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }];
    const vc = await guild.channels.create({ name: `🎙️ interview-${room.applicantName}`.slice(0, 90), type: ChannelType.GuildVoice, parent: text?.parentId, permissionOverwrites: overwrites });
    await reviewRoomsRepository.update(roomId, { voiceChannelId: vc.id, voiceEmptySince: Date.now(), history: [...room.history, { at: new Date().toISOString(), by: actor.id, event: 'Voice room created' }] } as any);
    return `🎙️ Voice room ready: <#${vc.id}>. Only people in this room can join. It is deleted automatically 10 minutes after everyone leaves.`;
  },

  async escalate(roomId: string, actor: any): Promise<string> {
    const room = await reviewRoomsRepository.getById(roomId);
    if (!room || room.status !== 'OPEN') throw new Error('This review room is closed.');
    const cfg = (await getToolkit(room.communityId)).reviewRooms;
    const actorTier = await this.memberTier(room.communityId, actor);
    if (actorTier < 0) throw new Error('Only reviewers can escalate.');
    const next = room.tier + 1;
    if (next >= cfg.tiers.length) throw new Error('Already at the highest rank.');
    const guild = await guildFor(room.communityId);
    const channel: any = guild?.channels.cache.get(room.channelId);
    const nextRoles = cfg.tiers[next].roleIds.filter((id) => isSnowflake(id) && guild?.roles.cache.has(id));
    for (const id of nextRoles) await channel?.permissionOverwrites.edit(id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => undefined);
    if (room.voiceChannelId) {
      const vc: any = guild?.channels.cache.get(room.voiceChannelId);
      for (const id of nextRoles) await vc?.permissionOverwrites.edit(id, { ViewChannel: true, Connect: true, Speak: true }).catch(() => undefined);
    }
    const updated = await reviewRoomsRepository.update(roomId, { tier: next, history: [...room.history, { at: new Date().toISOString(), by: actor.id, event: `Escalated to ${cfg.tiers[next].name}` }] } as any);
    await applicationsRepository.update(room.applicationId, { status: 'ESCALATED', escalationTier: next, escalationTierName: cfg.tiers[next].name, updatedAt: new Date().toISOString() } as any).catch(() => undefined);
    await channel?.send({
      content: `⬆️ <@${actor.id}> escalated this application to **${cfg.tiers[next].name}** ${nextRoles.map((r) => `<@&${r}>`).join(' ')}. Please review and decide or take it to the next round.`,
      allowedMentions: { roles: nextRoles },
      components: buttons(updated as any, cfg.tiers.length),
    });
    return `Escalated to ${cfg.tiers[next].name}.`;
  },

  /** Called after any approve/reject (dashboard, slash command or room button). */
  async closeForApplication(applicationId: string, decision: 'APPROVED' | 'REJECTED', byId: string) {
    const room = await reviewRoomsRepository.getById(applicationId).catch(() => null);
    if (!room || room.status === 'CLOSED') return;
    const cfg = (await getToolkit(room.communityId)).reviewRooms;
    const guild = await guildFor(room.communityId);
    const channel: any = guild?.channels.cache.get(room.channelId);
    if (room.voiceChannelId) await guild?.channels.cache.get(room.voiceChannelId)?.delete('Application decided').catch(() => undefined);
    if (channel && isSnowflake(room.applicantId)) await channel.permissionOverwrites.delete(room.applicantId).catch(() => undefined);
    await channel?.send({ content: `${decision === 'APPROVED' ? '✅ **Approved**' : '❌ **Rejected**'} by <@${byId}>. This room closes in ${cfg.deleteAfterHours} hour(s).`, allowedMentions: { parse: [] } }).catch(() => undefined);
    if (channel) await channel.setName(`closed-${channel.name}`.slice(0, 100)).catch(() => undefined);
    await reviewRoomsRepository.update(applicationId, { status: 'CLOSED', decision, voiceChannelId: null, closedAt: new Date().toISOString(), history: [...room.history, { at: new Date().toISOString(), by: byId, event: decision }] } as any);
  },

  /** Every minute on the active bot: delete empty voice rooms and expired closed rooms. */
  async housekeeping() {
    const rooms = await reviewRoomsRepository.list({ where: [{ field: 'status', operator: 'in', value: ['OPEN', 'CLOSED'] }] }).catch(() => [] as ReviewRoomDoc[]);
    for (const room of rooms) {
      try {
        const guild = await guildFor(room.communityId);
        if (!guild) continue;
        if (room.status === 'OPEN' && room.voiceChannelId) {
          const vc: any = guild.channels.cache.get(room.voiceChannelId);
          if (!vc) { await reviewRoomsRepository.update(room.id, { voiceChannelId: null } as any); continue; }
          if (vc.members.size > 0) { if (room.voiceEmptySince) await reviewRoomsRepository.update(room.id, { voiceEmptySince: null } as any); }
          else if (!room.voiceEmptySince) await reviewRoomsRepository.update(room.id, { voiceEmptySince: Date.now() } as any);
          else if (Date.now() - room.voiceEmptySince > 10 * 60_000) {
            await vc.delete('Voice room empty for 10 minutes').catch(() => undefined);
            await reviewRoomsRepository.update(room.id, { voiceChannelId: null, voiceEmptySince: null } as any);
          }
        }
        if (room.status === 'CLOSED' && room.closedAt) {
          const cfg = (await getToolkit(room.communityId)).reviewRooms;
          if (Date.now() - Date.parse(room.closedAt) > cfg.deleteAfterHours * 3_600_000) {
            await guild.channels.cache.get(room.channelId)?.delete('Review room expired').catch(() => undefined);
            await reviewRoomsRepository.update(room.id, { status: 'ARCHIVED' } as any);
          }
        }
      } catch (err: any) {
        logger.warn(`[ReviewRooms] housekeeping ${room.id}: ${err?.message}`);
      }
    }
  },

  async list(communityId: string) {
    const all = await reviewRoomsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] });
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
  },
};
