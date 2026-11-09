import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';

/**
 * /reward — countable rewards recruiters earn (e.g. Modded Heist).
 *   balance  your balance (staff can look up someone)
 *   use      spend your own rewards
 *   record   staff: record that members used rewards (several at once)
 *   add      staff: add or remove rewards with a reason
 *   panel    staff: post a message with Use buttons before an event
 */
const itemOpt = (o: any) => o.setName('item').setDescription('Which reward').setRequired(true).setAutocomplete(true);
export const rewardCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder().setName('reward').setDescription('Your recruitment rewards: balance and use')
    .addSubcommand((s) => s.setName('balance').setDescription('See your rewards balance').addUserOption((o) => o.setName('member').setDescription('Staff: someone else')))
    .addSubcommand((s) => s.setName('use').setDescription('Use your rewards').addStringOption(itemOpt)
      .addIntegerOption((o) => o.setName('amount').setDescription('How many (default 1)').setMinValue(1).setMaxValue(100))
      .addStringOption((o) => o.setName('for').setDescription('What it is for, e.g. Heist night Friday').setMaxLength(60)))
    .addSubcommand((s) => s.setName('record').setDescription('Staff: record that members used rewards').addStringOption(itemOpt)
      .addUserOption((o) => o.setName('member').setDescription('Member').setRequired(true))
      .addIntegerOption((o) => o.setName('amount').setDescription('How many each (default 1)').setMinValue(1).setMaxValue(100))
      .addStringOption((o) => o.setName('for').setDescription('Event').setMaxLength(60))
      .addUserOption((o) => o.setName('member2').setDescription('Another member'))
      .addUserOption((o) => o.setName('member3').setDescription('Another member'))
      .addUserOption((o) => o.setName('member4').setDescription('Another member')))
    .addSubcommand((s) => s.setName('add').setDescription('Staff: add (or remove with a minus number) rewards').addStringOption(itemOpt)
      .addUserOption((o) => o.setName('member').setDescription('Member').setRequired(true))
      .addIntegerOption((o) => o.setName('amount').setDescription('e.g. 2 or -1').setRequired(true).setMinValue(-100).setMaxValue(100))
      .addStringOption((o) => o.setName('reason').setDescription('Why').setRequired(true).setMaxLength(200)))
    .addSubcommand((s) => s.setName('panel').setDescription('Staff: post Use buttons for an event').addStringOption(itemOpt)
      .addStringOption((o) => o.setName('for').setDescription('Event, e.g. Heist night Friday').setMaxLength(60))),
  category: 'RECRUITMENT_REFERRALS',
  minimumRole: 'MEMBER' as any,
  status: 'ACTIVE',
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    const { wallet } = await import('../../../services/rewards/wallet.service.js');
    const c = context.communityId;
    const sub = interaction.options.getSubcommand();
    const perms = interaction.memberPermissions;
    const isStaff = !!(perms?.has(PermissionFlagsBits.ManageGuild) || perms?.has(PermissionFlagsBits.ManageRoles) || perms?.has(PermissionFlagsBits.ModerateMembers) || ['PLATFORM_OWNER', 'OWNER', 'CONTROLLER', 'INTERVIEWER'].includes(context.effectiveRole as any));
    const staffOnly = async () => { await interaction.reply({ content: '⛔ Only staff can do this.', ephemeral: true }); };
    const findItem = async () => {
      const it = await wallet.findItem(c, interaction.options.getString('item', true));
      if (!it) await interaction.reply({ content: 'No reward item with that name. Staff set them up in the dashboard → Recruitment → Rewards → Wallet.', ephemeral: true });
      return it;
    };
    try {
      if (sub === 'balance') {
        const target = interaction.options.getUser('member');
        if (target && target.id !== interaction.user.id && !isStaff) return staffOnly();
        const id = target?.id || interaction.user.id;
        const lines = await wallet.describeBalances(c, id);
        await interaction.reply({ content: lines.length ? `${target ? `**${target.username}**’s rewards` : '**Your rewards**'}\n${lines.join('\n')}` : 'This server has no countable rewards yet.', ephemeral: true });
        return;
      }
      if (sub === 'use') {
        const item = await findItem(); if (!item) return;
        const r = await wallet.claim(c, { itemId: item.id, memberId: interaction.user.id, memberName: (interaction.member as any)?.displayName || interaction.user.username, amount: interaction.options.getInteger('amount') || 1, forEvent: interaction.options.getString('for') || '', by: interaction.user.username, byStaff: false });
        await interaction.reply({ content: r.pending ? `⏳ Asked staff to approve **${-r.tx.amount}× ${item.emoji} ${item.name}**. It is held from your balance until they decide. **${r.left}** left after this.` : `✅ Used **${-r.tx.amount}× ${item.emoji} ${item.name}**. **${r.left}** left.`, ephemeral: true });
        return;
      }
      if (!isStaff) return staffOnly();
      if (sub === 'record') {
        const item = await findItem(); if (!item) return;
        const users = ['member', 'member2', 'member3', 'member4'].map((k) => interaction.options.getUser(k)).filter(Boolean) as any[];
        const out: string[] = [];
        for (const u of users) {
          try { const r = await wallet.claim(c, { itemId: item.id, memberId: u.id, memberName: u.username, amount: interaction.options.getInteger('amount') || 1, forEvent: interaction.options.getString('for') || '', by: interaction.user.username, byStaff: true }); out.push(`✅ ${u} · ${r.left} left`); }
          catch (e: any) { out.push(`⚠️ ${u} · ${e.message}`); }
        }
        await interaction.reply({ content: `${item.emoji} **${item.name}** used:\n${out.join('\n')}`, allowedMentions: { parse: [] } });
        return;
      }
      if (sub === 'add') {
        const item = await findItem(); if (!item) return;
        const u = interaction.options.getUser('member', true);
        await wallet.adjust(c, { itemId: item.id, memberId: u.id, memberName: u.username, amount: interaction.options.getInteger('amount', true), note: interaction.options.getString('reason', true), by: interaction.user.username });
        const b = await wallet.balance(c, u.id, item.id);
        await interaction.reply({ content: `✏️ Updated ${u}: **${b.available}× ${item.emoji} ${item.name}** available.`, allowedMentions: { parse: [] } });
        return;
      }
      if (sub === 'panel') {
        const item = await findItem(); if (!item) return;
        await (interaction.channel as any).send(wallet.panel(item, interaction.options.getString('for') || ''));
        await interaction.reply({ content: 'Posted. Members press **Use** to spend their rewards.', ephemeral: true });
      }
    } catch (e: any) {
      const m = { content: `⚠️ ${e.message}`, ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(m).catch(() => undefined); else await interaction.reply(m).catch(() => undefined);
    }
  },
};
