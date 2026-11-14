import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';

/**
 * /recruiter-code-search — staff find codes by member, code or name. Only staff see the command
 * (Discord permission: Timeout Members), and the reply is private.
 */
export const recruiterCodeSearchCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('recruiter-code-search')
    .setDescription('Staff: find recruiter codes by member, code or name')
    .addUserOption((o) => o.setName('member').setDescription('Show the codes this member owns').setRequired(false))
    .addStringOption((o) => o.setName('search').setDescription('A code or part of it, or the owner’s name').setRequired(false).setMaxLength(60)) as any,
  category: 'RECRUITMENT_REFERRALS',
  minimumRole: 'MEMBER' as any,
  status: 'ACTIVE',
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    const user = interaction.options.getUser('member');
    const q = String(interaction.options.getString('search') || '').trim().toLowerCase();
    if (!user && !q) {
      await interaction.reply({ content: 'Pick a **member** or type something to **search** (a code like `MT30`, or a name).', ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const { recruiterCodesRepository } = await import('../../../repositories/index.js');
    const all: any[] = await (recruiterCodesRepository as any).listForTenant(context.communityId);
    const owner = (c: any) => c.recruiterDiscordId || c.recruiterUserId;
    const guild: any = interaction.guild;
    const nameOf = (id: string) => guild?.members.cache.get(id)?.displayName || '';
    const hits = all.filter((c) => {
      if (user && owner(c) !== user.id) return false;
      if (!q) return true;
      const hay = [c.code, c.recruiterName, nameOf(owner(c)), guild?.members.cache.get(owner(c))?.user?.username].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    }).sort((a, b) => (String(a.code).toLowerCase() === q ? -1 : String(b.code).toLowerCase() === q ? 1 : String(a.code).localeCompare(String(b.code))));
    if (!hits.length) {
      await interaction.editReply({ content: user ? `<@${user.id}> has no recruiter code${q ? ` matching “${q}”` : ''}.` : `No code or owner matches “${q}”.`, allowedMentions: { parse: [] } });
      return;
    }
    const line = (c: any) => {
      const active = (c.status || (c.isActive === false ? 'INACTIVE' : 'ACTIVE')) === 'ACTIVE' && c.isActive !== false;
      return `🎟️ **${c.code}** · ${owner(c) ? `<@${owner(c)}>` : 'no owner'} · ${active ? '🟢 active' : '🟠 paused'} · used ${c.totalUses || 0}×${c.usesRemaining ? ` (${c.usesRemaining} left)` : ''}${c.expiresAt ? ` · expires <t:${Math.floor(Date.parse(c.expiresAt) / 1000)}:D>` : ''}`;
    };
    const shown = hits.slice(0, 25);
    await interaction.editReply({
      embeds: [{
        title: `🔎 ${hits.length} recruiter code${hits.length === 1 ? '' : 's'}`,
        description: shown.map(line).join('\n').slice(0, 4000) + (hits.length > shown.length ? `\n…and ${hits.length - shown.length} more. Search more precisely to narrow it down.` : ''),
        color: 0x7c8cff,
      }],
      allowedMentions: { parse: [] },
    });
  },
};
