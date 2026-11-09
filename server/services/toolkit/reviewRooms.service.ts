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
  /** Ranks whose part is finished: they no longer see the room. */
  doneTiers?: number[];
  /** Members given special access by a reviewer. */
  invited?: string[];
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
    const rec = (await getToolkit(app.communityId)).recruitment;
    const staff = [...new Set([...rolesUpTo(cfg.tiers, 0), ...rec.reviewerRoleIds])].filter((id) => isSnowflake(id) && guild.roles.cache.has(id));
    // Members with standing special access (set in the dashboard) join every application.
    const special = ((cfg as any).specialMemberIds || []).filter((id: string) => isSnowflake(id) && id !== applicantId && guild.members.cache.has(id));
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
        ...special.map((id) => ({ id, allow: VIEW })),
      ],
    });

    const room = await reviewRoomsRepository.create(applicationId, {
      communityId: app.communityId, guildId: guild.id, applicationId, applicantId, applicantName,
      channelId: channel.id, tier: 0, status: 'OPEN', invited: special, history: [{ at: new Date().toISOString(), by: 'system', event: 'Room opened' }],
      createdAt: new Date().toISOString(),
    } as any);

    const { applicationFlow } = await import('../recruitment/applicationFlow.service.js');
    await applicationFlow.begin(room.id, staff, Boolean(applicantInServer)).catch((err) => logger.warn(`[ReviewRooms] flow start failed: ${err?.message}`));
    if (special.length) {
      const thread: any = await applicationFlow.staffThread(room.id).catch(() => null);
      for (const id of special) await thread?.members.add(id).catch(() => undefined);
    }
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
    const { applicationFlow, staffPanel } = await import('../recruitment/applicationFlow.service.js');
    const thread: any = await applicationFlow.staffThread(roomId);
    await (thread || channel)?.send({
      content: `⬆️ <@${actor.id}> escalated this application to **${cfg.tiers[next].name}** ${nextRoles.map((r) => `<@&${r}>`).join(' ')}. Please review the chat above and decide, or take it to the next round.`,
      allowedMentions: { roles: nextRoles },
      components: thread ? staffPanel(updated as any, cfg.tiers.length) : buttons(updated as any, cfg.tiers.length),
    });
    return `Escalated to ${cfg.tiers[next].name}.`;
  },

  /** Lower ranks the actor may mark as done (below the actor's own rank, already in the room, not done yet). */
  async doneOptions(roomId: string, actor: any) {
    const room = await reviewRoomsRepository.getById(roomId);
    if (!room || room.status !== 'OPEN') throw new Error('This review room is closed.');
    const cfg = (await getToolkit(room.communityId)).reviewRooms;
    const actorTier = await this.memberTier(room.communityId, actor);
    if (actorTier < 1) throw new Error('Only a higher rank can mark a lower rank’s part as done.');
    return cfg.tiers.map((t, i) => ({ i, name: t.name })).filter((t) => t.i < actorTier && t.i <= room.tier && !(room.doneTiers || []).includes(t.i));
  },

  /** A higher rank marks lower ranks' work as done: those roles lose access to the room and the staff thread. */
  async markDone(roomId: string, actor: any, tiers: number[]): Promise<string> {
    const room = await reviewRoomsRepository.getById(roomId);
    if (!room || room.status !== 'OPEN') throw new Error('This review room is closed.');
    const cfg = (await getToolkit(room.communityId)).reviewRooms;
    const actorTier = await this.memberTier(room.communityId, actor);
    const pick = tiers.filter((i) => i < actorTier && i <= room.tier && cfg.tiers[i]);
    if (!pick.length) throw new Error('Pick a rank below yours.');
    const guild: any = await guildFor(room.communityId);
    const channel: any = guild?.channels.cache.get(room.channelId);
    const done = [...new Set([...(room.doneTiers || []), ...pick])];
    // Roles still needed = ranks not done (up to the current rank).
    const keep = new Set(cfg.tiers.slice(0, room.tier + 1).flatMap((t, i) => (done.includes(i) ? [] : t.roleIds)));
    const remove = [...new Set(pick.flatMap((i) => cfg.tiers[i].roleIds))].filter((id) => !keep.has(id));
    for (const id of remove) await channel?.permissionOverwrites.delete(id).catch(() => undefined);
    if (room.voiceChannelId) { const vc: any = guild?.channels.cache.get(room.voiceChannelId); for (const id of remove) await vc?.permissionOverwrites.delete(id).catch(() => undefined); }
    const { applicationFlow } = await import('../recruitment/applicationFlow.service.js');
    const thread: any = await applicationFlow.staffThread(roomId);
    if (thread) {
      const members = await thread.members.fetch().catch(() => null);
      for (const tm of members?.values?.() || []) {
        const m = tm.guildMember || guild.members.cache.get(tm.id);
        if (!m || m.user?.bot || (room.invited || []).includes(m.id) || m.permissions?.has?.(PermissionFlagsBits.ManageGuild)) continue;
        const stillNeeded = [...keep].some((id) => m.roles.cache.has(id));
        if (!stillNeeded && remove.some((id) => m.roles.cache.has(id))) await thread.members.remove(m.id).catch(() => undefined);
      }
    }
    const names = pick.map((i) => cfg.tiers[i].name).join(', ');
    await reviewRoomsRepository.update(roomId, { doneTiers: done, history: [...room.history, { at: new Date().toISOString(), by: actor.id, event: `Marked done: ${names}` }] } as any);
    await (thread || channel)?.send({ content: `✅ <@${actor.id}> marked **${names}** as done. They no longer see this application.`, allowedMentions: { parse: [] } }).catch(() => undefined);
    return `${names} marked as done.`;
  },

  /** Special access for one member; any reviewer can add, the current rank or higher can remove. */
  async invite(roomId: string, actor: any, userId: string, add: boolean): Promise<string> {
    const room = await reviewRoomsRepository.getById(roomId);
    if (!room || room.status !== 'OPEN') throw new Error('This review room is closed.');
    const actorTier = await this.memberTier(room.communityId, actor);
    if (actorTier < 0) throw new Error('Only reviewers can manage access.');
    if (!add && actorTier < room.tier) throw new Error('Only the current rank or higher can remove special access.');
    const guild: any = await guildFor(room.communityId);
    const channel: any = guild?.channels.cache.get(room.channelId);
    const { applicationFlow } = await import('../recruitment/applicationFlow.service.js');
    const thread: any = await applicationFlow.staffThread(roomId);
    let invited = room.invited || [];
    if (add) {
      if (userId === room.applicantId) throw new Error('The applicant already has their own chat.');
      await channel?.permissionOverwrites.edit(userId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => undefined);
      await thread?.members.add(userId).catch(() => undefined);
      invited = [...new Set([...invited, userId])];
    } else {
      await channel?.permissionOverwrites.delete(userId).catch(() => undefined);
      await thread?.members.remove(userId).catch(() => undefined);
      invited = invited.filter((x) => x !== userId);
    }
    await reviewRoomsRepository.update(roomId, { invited, history: [...room.history, { at: new Date().toISOString(), by: actor.id, event: `${add ? 'Invited' : 'Removed'} <@${userId}>` }] } as any);
    await thread?.send({ content: add ? `➕ <@${actor.id}> gave <@${userId}> special access to this application.` : `➖ <@${actor.id}> removed <@${userId}>’s special access.`, allowedMentions: { users: add ? [userId] : [] } }).catch(() => undefined);
    return add ? 'Access given.' : 'Access removed.';
  },

  async removeAccessFromDashboard(communityId: string, roomId: string, userId: string, by?: string) {
    const room = await reviewRoomsRepository.getById(roomId);
    if (!room || room.communityId !== communityId) throw new Error('Room not found.');
    const guild: any = await guildFor(communityId);
    await guild?.channels.cache.get(room.channelId)?.permissionOverwrites.delete(userId).catch(() => undefined);
    const { applicationFlow } = await import('../recruitment/applicationFlow.service.js');
    const thread: any = await applicationFlow.staffThread(roomId).catch(() => null);
    await thread?.members.remove(userId).catch(() => undefined);
    await thread?.send({ content: `➖ <@${userId}>’s special access was removed from the dashboard${by ? ` by <@${by}>` : ''}.`, allowedMentions: { parse: [] } }).catch(() => undefined);
    await reviewRoomsRepository.update(roomId, { invited: (room.invited || []).filter((x) => x !== userId), history: [...room.history, { at: new Date().toISOString(), by: by || 'dashboard', event: `Removed <@${userId}>` }] } as any);
    return { removed: true };
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
    const { applicationFlow } = await import('../recruitment/applicationFlow.service.js');
    await applicationFlow.markDecided(applicationId).catch(() => undefined);
    const thread: any = await applicationFlow.staffThread(applicationId).catch(() => null);
    await thread?.send({ content: `${decision === 'APPROVED' ? '✅ **Approved**' : '✖️ **Rejected**'} by <@${byId}>. The applicant was messaged. This chat closes in ${cfg.deleteAfterHours} hour(s).`, allowedMentions: { parse: [] } }).catch(() => undefined);
    await channel?.send({ content: `This application is now closed. Thank you! The decision has been sent to the applicant by DM.`, allowedMentions: { parse: [] } }).catch(() => undefined);
    if (channel) await channel.setName(`closed-${channel.name}`.slice(0, 100)).catch(() => undefined);
    await reviewRoomsRepository.update(applicationId, { status: 'CLOSED', decision, voiceChannelId: null, closedAt: new Date().toISOString(), history: [...room.history, { at: new Date().toISOString(), by: byId, event: decision }] } as any);
  },

  /** Applicant joined the server after applying: let them into their chat and start the guided flow. */
  async onApplicantJoined(communityId: string, discordUserId: string) {
    const rooms = await reviewRoomsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] }).catch(() => [] as ReviewRoomDoc[]);
    const room: any = rooms.find((x) => x.applicantId === discordUserId && x.status === 'OPEN');
    if (!room) return;
    const guild = await guildFor(communityId);
    const channel: any = guild?.channels.cache.get(room.channelId);
    if (!channel) return;
    await channel.permissionOverwrites.edit(discordUserId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true, EmbedLinks: true }).catch(() => undefined);
    const { applicationFlow } = await import('../recruitment/applicationFlow.service.js');
    if (!room.flow?.consentAt) await applicationFlow.askConsent(room.id);
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
