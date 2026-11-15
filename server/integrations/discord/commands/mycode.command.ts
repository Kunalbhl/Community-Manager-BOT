import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';

/** /mycode — shows only the codes that belong to the person asking. The reply is private. */
export const myCodeCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder().setName('mycode').setDescription('See your own recruiter code (only you can see the reply)'),
  category: 'RECRUITMENT_REFERRALS',
  minimumRole: 'APPLICANT',
  status: 'ACTIVE',
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    const { recruiterCodesRepository } = await import('../../../repositories/index.js');
    const all: any[] = await (recruiterCodesRepository as any).listForTenant(context.communityId);
    const mine = all.filter((c) => (c.recruiterDiscordId || c.recruiterUserId) === interaction.user.id);
    if (!mine.length) {
      await interaction.reply({ content: 'You don’t have a recruiter code yet. Approved members get one automatically when the server has this turned on, or staff can create one for you.', ephemeral: true });
      return;
    }
    const lines = mine.map((c) => {
      const active = (c.status || (c.isActive === false ? 'INACTIVE' : 'ACTIVE')) === 'ACTIVE';
      return `🎟️ **${c.code}** · ${active ? 'active' : 'paused'} · used ${c.totalUses || 0}×${c.usesRemaining ? ` of ${c.usesRemaining}` : ''}`;
    });
    const base = 'https://community-manager.chaloone.com';
    const active = mine.find((c) => (c.status || 'ACTIVE') === 'ACTIVE' && c.isActive !== false) || mine[0];
    const link = `${process.env.APP_URL || base}/join/${encodeURIComponent(context.communityId)}?code=${encodeURIComponent(active.code)}`;
    await interaction.reply({ content: `${lines.join('\n')}\n\n🔗 **Your invite link:** ${link}\nPeople who open it apply on the website with your code already filled in, and get added to the server when approved. You get the credit.`, ephemeral: true });
  },
};
