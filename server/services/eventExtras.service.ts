/**
 * Events in Discord beyond the post:
 *  - a real Discord event (shows in the server's Events list, with "Interested")
 *  - one temporary registrations channel with a single roster message that updates itself
 *  - automatic start / finish at the set times, which also closes the roster channel
 */
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { eventsRepository, eventRegistrationsRepository } from '../repositories/index.js';
import { guildFor } from './toolkit/toolkitConfig.js';
import { logger } from '../logging/logger.js';

const ts = (iso: string, f = 'F') => `<t:${Math.floor(Date.parse(iso) / 1000)}:${f}>`;

async function regs(communityId: string, eventId: string) {
  const all = await eventRegistrationsRepository.listForTenant(communityId).catch(() => [] as any[]);
  return (all as any[]).filter((r) => r.eventId === eventId);
}

async function staffRoles(communityId: string): Promise<string[]> {
  const { staffRoleIds } = await import('./rewards/inviteRewards.service.js');
  return staffRoleIds(communityId).catch(() => []);
}

export const eventExtras = {
  /* ---------------- Discord's own Events list ---------------- */
  async syncDiscordEvent(communityId: string, e: any): Promise<string | null> {
    const guild: any = await guildFor(communityId);
    if (!guild) return null;
    if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageEvents)) throw new Error('The bot needs the Manage Events permission to add it to Discord’s Events list.');
    const ch: any = e.channelId ? guild.channels.cache.get(e.channelId) : null;
    const voice = ch && (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice);
    const data: any = {
      name: String(e.title).slice(0, 100),
      description: String(e.description || '').slice(0, 1000) || undefined,
      scheduledStartTime: new Date(Math.max(Date.parse(e.startAt), Date.now() + 60_000)),
      privacyLevel: 2,
      ...(voice
        ? { entityType: ch.type === ChannelType.GuildStageVoice ? 1 : 2, channel: ch.id }
        : { entityType: 3, scheduledEndTime: new Date(e.endAt), entityMetadata: { location: ch ? `#${ch.name} · ${guild.name}` : guild.name } }),
    };
    let id = e.discordEventId && /^\d{15,22}$/.test(e.discordEventId) ? e.discordEventId : null;
    const existing = id ? await guild.scheduledEvents.fetch(id).catch(() => null) : null;
    if (existing) await existing.edit(data);
    else { const created = await guild.scheduledEvents.create(data); id = created.id; }
    await eventsRepository.update(e.id, { discordEventId: id, discordEventUrl: `https://discord.com/events/${guild.id}/${id}` } as any).catch(() => undefined);
    return id;
  },

  async endDiscordEvent(communityId: string, e: any, cancelled: boolean) {
    if (!e?.discordEventId || !/^\d{15,22}$/.test(e.discordEventId)) return;
    const guild: any = await guildFor(communityId);
    const de: any = await guild?.scheduledEvents.fetch(e.discordEventId).catch(() => null);
    if (!de) return;
    if (cancelled || de.status === 1) await de.delete().catch(() => undefined); // scheduled → remove
    else if (de.status === 2) await de.setStatus(3).catch(() => undefined); // active → completed
  },

  /* ---------------- Registrations channel ---------------- */
  async openRoster(communityId: string, e: any) {
    if (!e.registrationEnabled || e.rosterChannelId) return this.refreshRoster(communityId, e.id);
    const guild: any = await guildFor(communityId);
    if (!guild?.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) return;
    const parent = e.channelId ? guild.channels.cache.get(e.channelId)?.parentId : undefined;
    const roles = (await staffRoles(communityId)).filter((id) => guild.roles.cache.has(id));
    // Private to staff: only this new channel gets these permissions; nothing else changes.
    const ch = await guild.channels.create({
      name: `📋・${String(e.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'event'}-registrations`,
      type: ChannelType.GuildText, parent,
      topic: `Registrations for ${e.title}. Removed automatically when the event finishes.`,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
        ...roles.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] })),
      ],
      reason: 'Event registrations',
    }).catch((err: any) => { logger.warn(`[Events] roster channel: ${err?.message}`); return null; });
    if (!ch) return;
    await eventsRepository.update(e.id, { rosterChannelId: ch.id } as any);
    await this.refreshRoster(communityId, e.id);
  },

  async refreshRoster(communityId: string, eventId: string) {
    const e: any = await eventsRepository.getById(eventId).catch(() => null);
    if (!e?.rosterChannelId) return;
    const guild: any = await guildFor(communityId);
    const ch: any = guild?.channels.cache.get(e.rosterChannelId);
    if (!ch) return;
    const list = await regs(communityId, eventId);
    const going = list.filter((r) => r.status === 'REGISTERED' || r.status === 'ATTENDED').sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    const left = list.filter((r) => r.status === 'CANCELLED');
    const lines = going.map((r, i) => `${i + 1}. <@${r.discordUserId}>${r.status === 'ATTENDED' ? ' ✅' : ''} · ${ts(r.createdAt || r.registeredAt || new Date().toISOString(), 'R')}`);
    const payload = {
      embeds: [{
        title: `📋 ${e.title} · registrations`,
        color: 0x7c8cff,
        description: `${ts(e.startAt)} (${ts(e.startAt, 'R')})\n**${going.length}${e.capacity ? ` / ${e.capacity}` : ''}** going${left.length ? ` · ${left.length} cancelled` : ''}\n\n${lines.join('\n').slice(0, 3500) || '_Nobody yet._'}`,
        footer: { text: 'Updates by itself. This channel is removed when the event finishes.' },
        timestamp: new Date().toISOString(),
      }],
      allowedMentions: { parse: [] as any[] },
    };
    const msg = e.rosterMessageId ? await ch.messages.fetch(e.rosterMessageId).catch(() => null) : null;
    if (msg) await msg.edit(payload).catch(() => undefined);
    else { const m = await ch.send(payload).catch(() => null); if (m) await eventsRepository.update(e.id, { rosterMessageId: m.id } as any).catch(() => undefined); }
  },

  /** Event over: save the final list on the event, then remove the channel. */
  async closeRoster(communityId: string, eventId: string) {
    const e: any = await eventsRepository.getById(eventId).catch(() => null);
    if (!e?.rosterChannelId) return;
    const list = await regs(communityId, eventId);
    await eventsRepository.update(e.id, { finalRoster: list.map((r) => ({ discordUserId: r.discordUserId, username: r.username, status: r.status, at: r.createdAt })), rosterChannelId: null, rosterMessageId: null } as any).catch(() => undefined);
    const guild: any = await guildFor(communityId);
    await guild?.channels.cache.get(e.rosterChannelId)?.delete('Event finished').catch(() => undefined);
  },

  /** Every minute: start events at their start time and finish them at their end time. */
  async tick() {
    const now = Date.now();
    const all: any[] = await eventsRepository.list({}).catch(() => []);
    const { eventService } = await import('./events.service.js') as any;
    for (const e of all) {
      try {
        if (e.status === 'SCHEDULED' && Date.parse(e.startAt) <= now) await eventService.startEvent(e.communityId, e.id);
        else if ((e.status === 'LIVE' || e.status === 'SCHEDULED') && e.endAt && Date.parse(e.endAt) <= now) {
          if (e.status === 'SCHEDULED') await eventService.startEvent(e.communityId, e.id).catch(() => undefined);
          await eventService.completeEvent(e.communityId, e.id);
        } else if ((e.status === 'COMPLETED' || e.status === 'CANCELLED') && e.rosterChannelId) await this.closeRoster(e.communityId, e.id);
      } catch (err: any) { logger.warn(`[Events] tick ${e.id}: ${err?.message}`); }
    }
  },
};
