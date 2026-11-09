import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';

/** /myrewards — your invites, the rewards you have earned and how close you are to the next one. Private reply. */
export const myRewardsCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder().setName('myrewards').setDescription('See your invites and rewards (only you can see the reply)'),
  category: 'RECRUITMENT_REFERRALS',
  minimumRole: 'APPLICANT',
  status: 'ACTIVE',
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    const { inviteRewards } = await import('../../../services/rewards/inviteRewards.service.js');
    const c = context.communityId;
    const [rules, records, credits, grants] = await Promise.all([inviteRewards.listRules(c), inviteRewards.records(c), inviteRewards.credits(c), inviteRewards.grants(c)]);
    const e = inviteRewards.tally(records, credits).get(interaction.user.id) || { recs: [], bonus: 0, joined: 0, left: 0 } as any;
    const mine = grants.filter((g) => g.recruiterId === interaction.user.id);
    const bar = (a: number, b: number) => { const n = Math.max(0, Math.min(10, Math.round((a / Math.max(1, b)) * 10))); return '▰'.repeat(n) + '▱'.repeat(10 - n); };
    const lines = [`👥 **Invites:** ${e.joined + e.bonus}${e.left ? ` · ${e.left} left the server` : ''}${e.bonus ? ` · includes ${e.bonus} bonus` : ''}`];
    const prog = inviteRewards.progress(rules, e, grants, interaction.user.id).filter((p) => !p.done);
    if (prog.length) lines.push('', '**Next rewards**', ...prog.slice(0, 6).map((p) => `${p.emoji} ${p.name}: ${bar(p.have, p.target)} ${Math.min(p.have, p.target)}/${p.target}${p.waiting ? ` (${p.waiting} still counting)` : ''}`));
    const got = mine.filter((g) => g.status === 'GRANTED' || g.status === 'PENDING_APPROVAL');
    if (got.length) lines.push('', '**Earned**', ...got.slice(0, 8).map((g) => `${g.emoji} ${g.ruleName} · ${g.status === 'GRANTED' ? 'given' : 'waiting for staff'}`));
    const { wallet } = await import('../../../services/rewards/wallet.service.js');
    const wl = await wallet.describeBalances(c, interaction.user.id).catch(() => [] as string[]);
    if (wl.length) lines.push('', '**Wallet** · use with `/reward use`', ...wl);
    if (!rules.length && !wl.length) lines.push('', 'This server has no invite rewards yet.');
    await interaction.reply({ content: lines.join('\n').slice(0, 1900), ephemeral: true });
  },
};
