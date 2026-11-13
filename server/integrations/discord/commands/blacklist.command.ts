import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';

/**
 * /blacklist-check — anyone allowed (Ban Members, Manage Server, or a lookup role set in the dashboard)
 * types a Discord name, game name or ID and sees whether that person is on the server blacklist.
 * In a lookup channel the answer is posted for the team; elsewhere only the asker sees it.
 * /blacklist add — quick add by name or game name (Ban Members or Manage Server).
 */
export const blacklistCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Add people to the server blacklist (moderators)')
    .addSubcommand((sub) => sub.setName('add').setDescription('Add someone to the blacklist')
      .addStringOption((o) => o.setName('reason').setDescription('Why they are blacklisted').setRequired(true).setMaxLength(500))
      .addUserOption((o) => o.setName('member').setDescription('Their Discord account, if you know it'))
      .addStringOption((o) => o.setName('game_name').setDescription('Their in-game name(s), comma separated').setMaxLength(200))
      .addStringOption((o) => o.setName('discord_name').setDescription('Their Discord username, if they are not in the server').setMaxLength(64))
      .addBooleanOption((o) => o.setName('ban').setDescription('Also ban this Discord account now'))),
  category: 'SECURITY_MODERATION',
  minimumRole: 'MEMBER' as any,
  status: 'ACTIVE',

  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const g = await import('../../../services/blacklist/blacklistGuard.service.js');
    const s = await g.getSettings(context.communityId);
    const perms = interaction.memberPermissions;
    const isMod = !!(perms?.has(PermissionFlagsBits.BanMembers) || perms?.has(PermissionFlagsBits.ManageGuild) || ['PLATFORM_OWNER', 'OWNER', 'CONTROLLER'].includes(context.effectiveRole as any));
    const roles: any = (interaction.member as any)?.roles;
    const hasRole = s.lookupRoleIds.some((id) => roles?.cache?.has?.(id) || (Array.isArray(roles) && roles.includes(id)));
    const sub = interaction.options.getSubcommand();

    if (sub === 'check') {
      if (!isMod && !hasRole) { await interaction.reply({ content: '⛔ Only staff can search the blacklist.', ephemeral: true }); return; }
      const inLookup = s.lookupChannelIds.includes(interaction.channelId);
      if (s.lookupChannelIds.length && !inLookup && !isMod) { await interaction.reply({ content: `Use this in ${s.lookupChannelIds.map((id) => `<#${id}>`).join(', ')}.`, ephemeral: true }); return; }
      const q = interaction.options.getString('name', true);
      const hits = await g.search(context.communityId, q);
      const ephemeral = !inLookup;
      if (!hits.length) { await interaction.reply({ content: `✅ **${q}** is not on the blacklist.\n-# Searched Discord names, game names, aliases and IDs, including close spellings.`, ephemeral, allowedMentions: { parse: [] } }); return; }
      const embed = new EmbedBuilder().setColor(0xe11d48).setTitle(`🚫 ${hits.length === 1 ? 'Found on the blacklist' : `${hits.length} possible matches`}`).setDescription(`Search: **${q}**`);
      for (const h of hits.slice(0, 5)) {
        const e = h.entry;
        const known = [e.discordUserId && `ID \`${e.discordUserId}\``, (e.discordUsername || e.displayName) && `Discord **${e.displayName || e.discordUsername}**${e.discordUsername && e.displayName ? ` (@${e.discordUsername})` : ''}`, e.gameNames?.length && `Game: ${e.gameNames.join(', ')}`, e.aliases?.length && `Also: ${e.aliases.join(', ')}`].filter(Boolean).join(' · ');
        embed.addFields({ name: `${h.score >= 100 ? '🔴 Exact' : h.score >= 70 ? '🟠 Close' : '🟡 Similar'} · ${g.entryLabel(e)}${e.category ? ` · ${e.category}` : ''}`.slice(0, 250), value: `${known}\nMatched ${h.matched}\nReason: ${String(e.reason || '—').slice(0, 300)}${e.expiresAt ? `\nUntil <t:${Math.floor(Date.parse(e.expiresAt) / 1000)}:D>` : ''}`.slice(0, 1000) });
      }
      await interaction.reply({ embeds: [embed], ephemeral, allowedMentions: { parse: [] } });
      return;
    }

    if (!isMod) { await interaction.reply({ content: '⛔ You need Ban Members or Manage Server to add to the blacklist.', ephemeral: true }); return; }
    const user = interaction.options.getUser('member');
    const gameNames = (interaction.options.getString('game_name') || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10);
    const dname = (interaction.options.getString('discord_name') || '').trim().replace(/^@/, '');
    const reason = interaction.options.getString('reason', true);
    if (!user && !gameNames.length && !dname) { await interaction.reply({ content: 'Give at least one: **member**, **game_name** or **discord_name**.', ephemeral: true }); return; }
    const { blacklistEntriesRepository } = await import('../../../repositories/index.js');
    const now = new Date().toISOString();
    const c = context.communityId;
    const id = user ? `${c}_${user.id}` : `${c}_n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const cur: any = user ? await blacklistEntriesRepository.getById(id).catch(() => null) : null;
    if (cur && g.active(cur)) { await interaction.reply({ content: `${user} is already on the blacklist.`, ephemeral: true, allowedMentions: { parse: [] } }); return; }
    await blacklistEntriesRepository.create({
      id, communityId: c, discordUserId: user?.id || '', discordUsername: user?.username || dname, displayName: user?.globalName || '', avatarUrl: user?.displayAvatarURL({ size: 64 }) || '',
      gameNames, aliases: [], category: 'Other', reason, status: 'ACTIVE', actor: interaction.user.username, timestamp: now, createdAt: now, updatedAt: now,
      history: [{ at: now, by: interaction.user.username, what: 'Added from Discord' }],
    } as any);
    g.clearCache(c);
    let banned = '';
    if (user && interaction.options.getBoolean('ban')) banned = await interaction.guild!.bans.create(user.id, { reason: `Blacklisted: ${reason}`.slice(0, 500) }).then(() => ' and banned').catch(() => ' (the ban failed: check the bot’s Ban Members permission and role position)');
    await interaction.reply({ content: `🚫 Added **${user ? user.username : dname || gameNames[0]}** to the blacklist${banned}. They can’t apply, and staff are alerted if they join.`, ephemeral: true });
  },
};
