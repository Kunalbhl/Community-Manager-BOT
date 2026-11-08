/**
 * Events in Discord: the announcement post with Register / Can't go buttons and a live count.
 * Who can register: COMMUNITY = approved members only (Member role when Secure Setup is on),
 * PUBLIC = anyone in the server, PRIVATE = not announced (staff add people from the dashboard).
 */
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { eventsRepository, eventRegistrationsRepository } from '../repositories/index.js';
import { guildFor } from './toolkit/toolkitConfig.js';

async function count(communityId: string, eventId: string) {
  const regs = await eventRegistrationsRepository.listForTenant(communityId).catch(() => [] as any[]);
  return (regs as any[]).filter((r) => r.eventId === eventId && r.status === 'REGISTERED').length;
}

function view(e: any, going: number) {
  const start = Math.floor(Date.parse(e.startAt) / 1000);
  const end = e.endAt ? Math.floor(Date.parse(e.endAt) / 1000) : null;
  const full = e.capacity && going >= e.capacity;
  return {
    embeds: [{
      title: `📅 ${e.title}`,
      description: e.description || '',
      color: 0x7c8cff,
      fields: [
        { name: 'When', value: `<t:${start}:F>${end ? ` – <t:${end}:t>` : ''}\n<t:${start}:R>`, inline: true },
        { name: 'Going', value: `${going}${e.capacity ? ` / ${e.capacity}` : ''}${full ? ' · full' : ''}`, inline: true },
        { name: 'Who can join', value: e.visibility === 'PUBLIC' ? 'Everyone in the server' : 'Members', inline: true },
      ],
      footer: { text: 'You will get a reminder before it starts.' },
    }],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`cm:evt:join:${e.id}`).setLabel(full ? 'Full' : 'Register').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(Boolean(full) || e.status === 'CANCELLED' || e.status === 'COMPLETED'),
      new ButtonBuilder().setCustomId(`cm:evt:leave:${e.id}`).setLabel('Can’t go').setStyle(ButtonStyle.Secondary).setDisabled(e.status === 'CANCELLED' || e.status === 'COMPLETED'),
    )],
    allowedMentions: { parse: [] as any[] },
  };
}

export const eventPosts = {
  async post(communityId: string, e: any) {
    const guild = await guildFor(communityId);
    const ch: any = guild?.channels.cache.get(e.channelId);
    if (!ch) throw new Error('Event channel not found.');
    const msg = await ch.send(view(e, await count(communityId, e.id)));
    await eventsRepository.update(e.id, { discordPostChannelId: ch.id, discordPostMessageId: msg.id } as any).catch(() => undefined);
  },

  async refresh(communityId: string, eventId: string) {
    const e: any = await eventsRepository.getById(eventId).catch(() => null);
    if (!e?.discordPostMessageId) return;
    const guild = await guildFor(communityId);
    const ch: any = guild?.channels.cache.get(e.discordPostChannelId);
    const msg = await ch?.messages.fetch(e.discordPostMessageId).catch(() => null);
    await msg?.edit(view(e, await count(communityId, eventId))).catch(() => undefined);
  },

  /** Register / Can't go buttons. */
  async press(interaction: any, communityId: string, eventId: string, join: boolean): Promise<string> {
    const e: any = await eventsRepository.getById(eventId).catch(() => null);
    if (!e || e.communityId !== communityId) return '⚠️ This event no longer exists.';
    if (join && e.visibility !== 'PUBLIC') {
      const { getGate } = await import('./recruitment/secureGate.service.js');
      const gate = await getGate(communityId);
      if (gate.memberRoleId && !interaction.member?.roles?.cache?.has(gate.memberRoleId)) return '🔒 This event is for members only.';
    }
    const { eventRegistrationService } = await import('./events.service.js');
    try {
      if (join) {
        await eventRegistrationService.registerMember({ communityId, eventId, discordUserId: interaction.user.id, username: interaction.member?.displayName || interaction.user.username, actorUserId: interaction.user.id });
      } else {
        await eventRegistrationService.cancelRegistration(communityId, eventId, interaction.user.id, interaction.user.id);
      }
    } catch (err: any) {
      return `⚠️ ${String(err?.message || err).replace(/^[A-Z_]+:\s*/, '')}`;
    }
    await this.refresh(communityId, eventId);
    return join ? `✅ You’re registered for **${e.title}**. You’ll get a reminder before <t:${Math.floor(Date.parse(e.startAt) / 1000)}:R>.` : `👋 You’re no longer registered for **${e.title}**.`;
  },
};
