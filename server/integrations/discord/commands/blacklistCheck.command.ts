import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';

/**
 * /blacklist-check — anyone can check whether a name or ID is on the server blacklist.
 * Members see whether it matches and why; moderators also see the IDs and other names on file.
 * In a lookup channel the answer is posted for everyone there, elsewhere only the asker sees it.
 */
export const blacklistCheckCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('blacklist-check')
    .setDescription('Is this person on the server blacklist? Search a Discord name, game name or ID')
    .addStringOption((o) => o.setName('name').setDescription('Discord name, in-game name or Discord user ID').setRequired(true).setMaxLength(64)),
  category: 'SECURITY_MODERATION',
  minimumRole: 'MEMBER' as any,
  status: 'ACTIVE',
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext): Promise<void> {
    const g = await import('../../../services/blacklist/blacklistGuard.service.js');
    const s = await g.getSettings(context.communityId);
    const perms = interaction.memberPermissions;
    const isMod = !!(perms?.has(PermissionFlagsBits.ModerateMembers) || perms?.has(PermissionFlagsBits.BanMembers) || perms?.has(PermissionFlagsBits.ManageGuild));
    const roles: any = (interaction.member as any)?.roles;
    const isLookup = isMod || s.lookupRoleIds.some((id) => roles?.cache?.has?.(id));
    const ephemeral = !s.lookupChannelIds.includes(interaction.channelId);
    const q = interaction.options.getString('name', true);
    const hits = await g.search(context.communityId, q);
    if (!hits.length) { await interaction.reply({ content: `✅ **${q}** is not on the blacklist.`, ephemeral, allowedMentions: { parse: [] } }); return; }
    const embed = new EmbedBuilder().setColor(0xe11d48).setTitle(hits[0].score >= 100 ? '🚫 On the blacklist' : '⚠️ Possible match on the blacklist').setDescription(`Search: **${q}**${isLookup ? '' : '\nPlease don’t play with or invite this person. Tell a moderator if you think it’s a mistake.'}`);
    for (const h of hits.slice(0, isLookup ? 5 : 3)) {
      const e = h.entry;
      const known = isLookup
        ? [e.discordUserId && `ID \`${e.discordUserId}\``, (e.discordUsername || e.displayName || e.discordUserId) && `Discord ${e.discordUserId ? `<@${e.discordUserId}> ` : ''}**${e.displayName || e.discordUsername || ''}**`, e.gameNames?.length && `Game: ${e.gameNames.join(', ')}`, e.aliases?.length && `Also: ${e.aliases.join(', ')}`].filter(Boolean).join(' · ')
        : '';
      embed.addFields({ name: `${h.score >= 100 ? '🔴 Exact' : h.score >= 70 ? '🟠 Close' : '🟡 Similar'} · ${g.entryLabel(e)}${e.category ? ` · ${e.category}` : ''}`.slice(0, 250), value: `${known ? `${known}\n` : ''}Matched ${h.matched}\nReason: ${String(e.reason || '—').slice(0, 300)}`.slice(0, 1000) });
    }
    await interaction.reply({ embeds: [embed], ephemeral, allowedMentions: { parse: [] } });
  },
};
