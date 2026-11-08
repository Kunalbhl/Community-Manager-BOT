import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, ChannelType } from 'discord.js';
import { SlashCommandDefinition, CommandContext } from './types.js';
import { levels } from '../../../services/features/levels.service.js';
import { birthdays, giveaways } from '../../../services/features/community.service.js';
import { getFeatures } from '../../../services/features/featuresConfig.js';

const bar = (into: number, needed: number) => {
  const filled = Math.round((into / needed) * 12);
  return `${'▰'.repeat(filled)}${'▱'.repeat(12 - filled)}`;
};

/** /rank [member] */
export const rankCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Show your level and XP (or another member’s)')
    .addUserOption((o) => o.setName('member').setDescription('Member').setRequired(false)),
  category: 'COMMUNITY_MEMBER',
  minimumRole: 'APPLICANT',
  status: 'ACTIVE',
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    if (!(await getFeatures(context.communityId)).levels.enabled) {
      await interaction.reply({ content: 'Levels are not switched on in this server.', ephemeral: true });
      return;
    }
    const user = interaction.options.getUser('member') || interaction.user;
    const r = await levels.rankOf(context.communityId, user.id);
    if (!r) {
      await interaction.reply({ content: `${user.id === interaction.user.id ? 'You have' : `**${user.username}** has`} no XP yet. Chat to earn some!`, ephemeral: true });
      return;
    }
    await interaction.reply({
      embeds: [{
        author: { name: user.username, icon_url: user.displayAvatarURL() },
        title: `Level ${r.level} · Rank #${r.rank} of ${r.total}`,
        description: `${bar(r.into, r.needed)}  **${r.into} / ${r.needed} XP**\nTotal XP: ${r.xp} · Messages counted: ${r.messages}`,
        color: 0x7c8cff,
      }],
    });
  },
};

/** /leaderboard */
export const leaderboardCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder().setName('leaderboard').setDescription('Top members by XP'),
  category: 'COMMUNITY_MEMBER',
  minimumRole: 'APPLICANT',
  status: 'ACTIVE',
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    const top = await levels.leaderboard(context.communityId, 10);
    if (!top.length) {
      await interaction.reply({ content: 'Nobody has XP yet.', ephemeral: true });
      return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    await interaction.reply({
      embeds: [{ title: `🏆 ${interaction.guild?.name} leaderboard`, color: 0xffc46b, description: top.map((t) => `${medals[t.rank - 1] || `**${t.rank}.**`} <@${t.userId}> · level ${t.level} · ${t.xp} XP`).join('\n') }],
      allowedMentions: { parse: [] },
    });
  },
};

/** /birthday set | remove */
export const birthdayCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Save your birthday so the server can celebrate it')
    .addSubcommand((s) => s.setName('set').setDescription('Save your birthday')
      .addIntegerOption((o) => o.setName('day').setDescription('Day (1-31)').setRequired(true).setMinValue(1).setMaxValue(31))
      .addIntegerOption((o) => o.setName('month').setDescription('Month (1-12)').setRequired(true).setMinValue(1).setMaxValue(12)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove your saved birthday')),
  category: 'COMMUNITY_MEMBER',
  minimumRole: 'APPLICANT',
  status: 'ACTIVE',
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    if (interaction.options.getSubcommand() === 'remove') {
      await birthdays.remove(context.communityId, interaction.user.id);
      await interaction.reply({ content: 'Your birthday was removed.', ephemeral: true });
      return;
    }
    const day = interaction.options.getInteger('day', true);
    const month = interaction.options.getInteger('month', true);
    try {
      await birthdays.set(context.communityId, interaction.user.id, interaction.user.username, day, month);
      const name = new Date(2000, month - 1, day).toLocaleString('en-GB', { day: 'numeric', month: 'long' });
      await interaction.reply({ content: `🎂 Saved: **${name}**. Only the day and month are stored.`, ephemeral: true });
    } catch (err: any) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
    }
  },
};

/** /giveaway start | end | reroll */
export const giveawayCommand: SlashCommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Run giveaways (staff)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('start').setDescription('Start a giveaway in this channel')
      .addStringOption((o) => o.setName('prize').setDescription('What people can win').setRequired(true).setMaxLength(200))
      .addIntegerOption((o) => o.setName('minutes').setDescription('How long it runs, in minutes').setRequired(true).setMinValue(1).setMaxValue(43200))
      .addIntegerOption((o) => o.setName('winners').setDescription('Number of winners').setRequired(false).setMinValue(1).setMaxValue(20))
      .addRoleOption((o) => o.setName('required_role').setDescription('Only members with this role can enter').setRequired(false)))
    .addSubcommand((s) => s.setName('end').setDescription('End a giveaway now').addStringOption((o) => o.setName('id').setDescription('Giveaway ID (from the dashboard) or message ID').setRequired(true)))
    .addSubcommand((s) => s.setName('reroll').setDescription('Pick new winners').addStringOption((o) => o.setName('id').setDescription('Giveaway ID or message ID').setRequired(true))),
  category: 'COMMUNITY_MEMBER',
  minimumRole: 'MEMBER',
  status: 'ACTIVE',
  async execute(interaction: ChatInputCommandInteraction, context: CommandContext) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: '⛔ You need **Manage Server** to run giveaways.', ephemeral: true });
      return;
    }
    const sub = interaction.options.getSubcommand();
    try {
      if (sub === 'start') {
        if (interaction.channel?.type !== ChannelType.GuildText && interaction.channel?.type !== ChannelType.GuildAnnouncement) throw new Error('Run this in a text channel.');
        await giveaways.start({
          communityId: context.communityId, channel: interaction.channel, prize: interaction.options.getString('prize', true),
          durationMinutes: interaction.options.getInteger('minutes', true), winners: interaction.options.getInteger('winners') || 1,
          hostId: interaction.user.id, requiredRoleId: interaction.options.getRole('required_role')?.id,
        });
        await interaction.reply({ content: '🎁 Giveaway started.', ephemeral: true });
        return;
      }
      const ref = interaction.options.getString('id', true).trim();
      const all = await giveaways.list(context.communityId);
      const g = all.find((x) => x.id === ref || x.messageId === ref);
      if (!g) throw new Error('Giveaway not found.');
      await giveaways.end(g.id, sub === 'reroll');
      await interaction.reply({ content: sub === 'reroll' ? '🔁 New winners picked.' : '✅ Giveaway ended.', ephemeral: true });
    } catch (err: any) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
    }
  },
};
