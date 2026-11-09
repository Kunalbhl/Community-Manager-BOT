/**
 * Gateway handlers for community features: XP, custom commands, server logs and starboard.
 * Kept separate from the core handlers so a failure here never affects recruitment flows.
 */
import { Client, Events } from 'discord.js';
import { logger } from '../../logging/logger.js';
import { communityForGuild } from '../../services/toolkit/toolkitConfig.js';
import { levels } from '../../services/features/levels.service.js';
import { serverLogs, starboard, customCommands } from '../../services/features/community.service.js';

const communityCache = new Map<string, { at: number; id: string }>();
async function communityOf(guildId: string): Promise<string> {
  const hit = communityCache.get(guildId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.id;
  const id = await communityForGuild(guildId);
  communityCache.set(guildId, { at: Date.now(), id });
  return id;
}

const safe = (where: string, fn: () => Promise<unknown>) => fn().catch((err) => logger.warn(`[Features] ${where}: ${err?.message}`));
const ts = (ms?: number | null) => (ms ? `<t:${Math.floor(ms / 1000)}:R>` : 'unknown');

/** Called from the main MessageCreate handler for every human message in a server. */
export async function onFeatureMessage(message: any) {
  const communityId = await communityOf(message.guild.id);
  const handled = await customCommands.onMessage(communityId, message).catch(() => false);
  if (!handled) await safe('levels', () => levels.onMessage(communityId, message));
}

export function attachFeatureHandlers(client: Client) {
  client.on(Events.GuildMemberAdd, (member: any) => safe('log join', async () => {
    const c = await communityOf(member.guild.id);
    await serverLogs.send(c, member.guild, 'memberJoin', '📥 Member joined', `<@${member.id}> · ${member.user.username}`, [{ name: 'Account created', value: ts(member.user.createdTimestamp), inline: true }, { name: 'Members', value: String(member.guild.memberCount), inline: true }]);
  }));

  // Bots that join get the bot role chosen in Members & onboarding.
  client.on(Events.GuildMemberAdd, (member: any) => safe('bot role', async () => {
    if (!member.user.bot) return;
    const { getToolkit } = await import('../../services/toolkit/toolkitConfig.js');
    const roleId = ((await getToolkit(await communityOf(member.guild.id))).roleRules as any).botRoleId;
    if (roleId && member.guild.roles.cache.has(roleId)) await member.roles.add(roleId, 'Community Manager: role for bots').catch(() => undefined);
  }));

  // Optional: ask new members for their birthday in a DM (they can skip; nothing is required).
  client.on(Events.GuildMemberAdd, (member: any) => safe('birthday ask', async () => {
    if (member.user.bot) return;
    const c = await communityOf(member.guild.id);
    const cfg = (await (await import('../../services/features/featuresConfig.js')).getFeatures(c)).birthdays;
    if (!cfg.enabled || !cfg.askOnJoin) return;
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
    await new Promise((r) => setTimeout(r, 15_000)); // after the welcome, not on top of it
    await member.send({
      content: `👋 Welcome to **${member.guild.name}**! Would you like the server to celebrate your birthday? It’s completely optional; only the day and month are saved.`,
      components: [new ActionRowBuilder<any>().addComponents(
        new ButtonBuilder().setCustomId(`cm:bday:ask:${member.guild.id}`).setLabel('Share my birthday').setEmoji('🎂').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`cm:bday:skip:${member.guild.id}`).setLabel('No thanks').setStyle(ButtonStyle.Secondary),
      )],
    }).catch(() => undefined); // DMs closed: nothing to do
  }));

  client.on(Events.GuildMemberRemove, (member: any) => safe('log leave', async () => {
    const c = await communityOf(member.guild.id);
    const roles = member.roles?.cache ? Array.from(member.roles.cache.values()).filter((r: any) => r.id !== member.guild.id).map((r: any) => `<@&${r.id}>`).join(' ') : '';
    await serverLogs.send(c, member.guild, 'memberLeave', '📤 Member left', `<@${member.id}> · ${member.user?.username || member.id}`, [{ name: 'Joined', value: ts(member.joinedTimestamp), inline: true }, { name: 'Roles', value: roles || 'None' }]);
  }));

  client.on(Events.MessageDelete, (message: any) => safe('log delete', async () => {
    if (!message.guild || message.author?.bot) return;
    const c = await communityOf(message.guild.id);
    await serverLogs.send(c, message.guild, 'messageDelete', '🗑️ Message deleted', message.content || '*(content not cached)*', [{ name: 'Author', value: message.author ? `<@${message.author.id}>` : 'unknown', inline: true }, { name: 'Channel', value: `<#${message.channel.id}>`, inline: true }]);
  }));

  client.on(Events.MessageUpdate, (before: any, after: any) => safe('log edit', async () => {
    if (!after.guild || after.author?.bot || before.content === after.content || !before.content) return;
    const c = await communityOf(after.guild.id);
    await serverLogs.send(c, after.guild, 'messageEdit', '✏️ Message edited', `[Jump to message](${after.url})`, [{ name: 'Before', value: before.content }, { name: 'After', value: after.content || '—' }, { name: 'Author', value: `<@${after.author.id}>`, inline: true }, { name: 'Channel', value: `<#${after.channel.id}>`, inline: true }]);
  }));

  client.on(Events.GuildMemberUpdate, (before: any, after: any) => safe('log member update', async () => {
    const c = await communityOf(after.guild.id);
    if (before.nickname !== after.nickname) {
      await serverLogs.send(c, after.guild, 'nicknameChange', '🏷️ Nickname changed', `<@${after.id}>`, [{ name: 'Before', value: before.nickname || '*(none)*', inline: true }, { name: 'After', value: after.nickname || '*(none)*', inline: true }]);
    }
    if (!before.roles?.cache || !after.roles?.cache) return;
    const added = after.roles.cache.filter((r: any) => !before.roles.cache.has(r.id));
    const removed = before.roles.cache.filter((r: any) => !after.roles.cache.has(r.id));
    if (added.size || removed.size) {
      await serverLogs.send(c, after.guild, 'roleChange', '🎭 Roles changed', `<@${after.id}>`, [
        ...(added.size ? [{ name: 'Added', value: added.map((r: any) => `<@&${r.id}>`).join(' ') }] : []),
        ...(removed.size ? [{ name: 'Removed', value: removed.map((r: any) => `<@&${r.id}>`).join(' ') }] : []),
      ]);
    }
  }));

  client.on(Events.MessageReactionAdd, (reaction: any, user: any) => safe('starboard', async () => {
    if (user.bot) return;
    const guild = reaction.message?.guild;
    if (!guild) return;
    await starboard.onReaction(await communityOf(guild.id), reaction, user);
  }));

  logger.info('[Features] Levels, logs, starboard and custom commands are listening.');
}
