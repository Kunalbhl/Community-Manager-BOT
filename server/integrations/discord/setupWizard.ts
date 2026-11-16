/**
 * /community-manager setup — a step-by-step setup wizard inside Discord.
 *
 * - Admin-only (Manage Server or Administrator), private (ephemeral) message that updates in place.
 * - Each step is a small module in STEPS: it renders its page and handles its own menus/buttons.
 * - Every choice is saved immediately to the SAME settings the dashboard uses, so both stay in sync.
 * - The bot never changes @everyone here. Locking the server (Secure Setup) stays in the dashboard.
 *
 * Custom ids: cm:su:<step>:<action>  (routed from toolkitInteractions.ts)
 */
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, EmbedBuilder,
  PermissionFlagsBits, RoleSelectMenuBuilder, StringSelectMenuBuilder,
} from 'discord.js';
import { config } from '../../config/env.js';
import { communityForGuild, getToolkit, saveToolkit } from '../../services/toolkit/toolkitConfig.js';
import { getFeatures, saveFeatures } from '../../services/features/featuresConfig.js';
import { welcomeOnboardingService } from '../../services/welcomeOnboarding.service.js';
import { explainAccess, ensureSelfPerms } from './selfAccess.js';

const BRAND = 0x7c8cff;
const P = PermissionFlagsBits;
const SEND_PERMS = [P.ViewChannel, P.SendMessages, P.EmbedLinks];

type Ctx = { communityId: string; guild: any; interaction: any };
type Page = { embeds: EmbedBuilder[]; components: ActionRowBuilder<any>[] };
interface Step {
  key: string;
  title: string;
  emoji: string;
  render(c: Ctx): Promise<Page>;
  /** Handle a menu/button for this step; return false if the action isn't this step's. */
  handle?(c: Ctx, action: string): Promise<string | void>;
}

const dashboardUrl = (communityId: string, section = '') =>
  `${(config.APP_URL || 'https://community-manager.chaloone.com').replace(/\/$/, '')}/dashboard${section ? `?s=${section}` : ''}${communityId ? '' : ''}`;
const ch = (id?: string) => (id ? `<#${id}>` : '`not set`');
const roles = (ids?: string[]) => (ids && ids.length ? ids.map((r) => `<@&${r}>`).join(' ') : '`not set`');
const on = (v: boolean) => (v ? '🟢 On' : '⚪ Off');
const id = (step: string, action: string) => `cm:su:${step}:${action}`;
const row = <T extends ActionRowBuilder<any>>(...c: any[]) => new ActionRowBuilder<any>().addComponents(...c) as T;

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

const STEPS: Step[] = [
  {
    key: 'intro', title: 'Welcome', emoji: '👋',
    async render() {
      return {
        embeds: [base('Set up Community Manager', [
          'This takes about **3 minutes**. Each step saves as soon as you pick something, and you can skip any step.',
          '',
          '**What we will set up**',
          ...STEPS.slice(1, -1).map((s, i) => `\`${i + 1}\` ${s.emoji} ${s.title}`),
          '',
          'Everything here also appears in the dashboard, so you can fine-tune it later.',
        ].join('\n'))],
        components: [],
      };
    },
  },

  {
    key: 'staff', title: 'Staff & reviewers', emoji: '🛡️',
    async render({ communityId }) {
      const r = (await getToolkit(communityId)).recruitment;
      return {
        embeds: [base('Who reviews applications?', [
          'Pick the roles that can **see, approve and reject** applications. They are also pinged when a new application arrives.',
          '',
          `**Reviewers:** ${roles(r.reviewerRoleIds)}`,
          `**Pinged on new application:** ${roles(r.pingRoleIds)}`,
        ].join('\n'))],
        components: [
          row(new RoleSelectMenuBuilder().setCustomId(id('staff', 'reviewers')).setPlaceholder('Reviewer roles').setMinValues(0).setMaxValues(10).setDefaultRoles(...(r.reviewerRoleIds || []).slice(0, 10))),
          row(new RoleSelectMenuBuilder().setCustomId(id('staff', 'ping')).setPlaceholder('Roles to ping on new applications (optional)').setMinValues(0).setMaxValues(10).setDefaultRoles(...(r.pingRoleIds || []).slice(0, 10))),
        ],
      };
    },
    async handle({ communityId, interaction }, action) {
      const t = await getToolkit(communityId);
      const values: string[] = interaction.values || [];
      if (action === 'reviewers') await saveToolkit(communityId, { recruitment: { ...t.recruitment, reviewerRoleIds: values } });
      else if (action === 'ping') await saveToolkit(communityId, { recruitment: { ...t.recruitment, pingRoleIds: values } });
      else return;
      return 'Saved.';
    },
  },

  {
    key: 'apps', title: 'Applications', emoji: '📋',
    async render({ communityId }) {
      const r: any = (await getToolkit(communityId)).recruitment;
      return {
        embeds: [base('Where do applications go?', [
          '**Review channel:** private staff channel where each new application appears with Approve / Reject buttons.',
          '**Apply panel:** the public message with the **Apply** button (for example #apply or #join-us).',
          '',
          `**Applications:** ${on(r.applyEnabled)}`,
          `**Review channel:** ${ch(r.reviewChannelId)}`,
          `**Apply panel:** ${r.panelChannelId ? `${ch(r.panelChannelId)}${r.panelPostedAt ? ' · posted' : ''}` : '`not posted`'}`,
          '',
          '-# Posting the panel needs Secure Setup and application questions; I will tell you if anything is missing.',
        ].join('\n'))],
        components: [
          row(new ChannelSelectMenuBuilder().setCustomId(id('apps', 'review')).setPlaceholder('Review channel (staff only)').setChannelTypes(ChannelType.GuildText).setMinValues(0).setMaxValues(1).setDefaultChannels(...(r.reviewChannelId ? [r.reviewChannelId] : []))),
          row(new ChannelSelectMenuBuilder().setCustomId(id('apps', 'panelch')).setPlaceholder('Channel for the Apply panel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1).setDefaultChannels(...(r.panelChannelId ? [r.panelChannelId] : []))),
          row(
            new ButtonBuilder().setCustomId(id('apps', 'toggle')).setStyle(r.applyEnabled ? ButtonStyle.Secondary : ButtonStyle.Success).setLabel(r.applyEnabled ? 'Pause applications' : 'Open applications').setEmoji(r.applyEnabled ? '⏸️' : '▶️'),
            new ButtonBuilder().setCustomId(id('apps', 'post')).setStyle(ButtonStyle.Primary).setLabel(r.panelPostedAt ? 'Update Apply panel' : 'Post Apply panel').setEmoji('📌').setDisabled(!r.panelChannelId),
          ),
        ],
      };
    },
    async handle({ communityId, interaction, guild }, action) {
      const t = await getToolkit(communityId);
      const r: any = t.recruitment;
      const v = (interaction.values || [])[0];
      if (action === 'review') { await saveToolkit(communityId, { recruitment: { ...r, reviewChannelId: v || undefined } }); return v ? await accessNote(guild, v, 'show new applications') : 'Review channel cleared.'; }
      if (action === 'panelch') { await saveToolkit(communityId, { recruitment: { ...r, panelChannelId: v || undefined, ...(v && v !== r.panelChannelId ? { panelMessageId: undefined, panelPostedAt: undefined } : {}) } as any }); return v ? 'Saved. Press **Post Apply panel** when you are ready.' : 'Cleared.'; }
      if (action === 'toggle') { await saveToolkit(communityId, { recruitment: { ...r, applyEnabled: !r.applyEnabled } }); return r.applyEnabled ? 'Applications paused.' : 'Applications open.'; }
      if (action === 'post') {
        const channel = r.panelChannelId ? await guild.channels.fetch(r.panelChannelId).catch(() => null) : null;
        if (!channel) return '⚠️ Pick the Apply panel channel first.';
        await ensureSelfPerms(channel, SEND_PERMS, 'post the Apply panel').catch(() => undefined);
        const { discordRecruitment } = await import('../../services/recruitment/discordRecruitment.service.js');
        await discordRecruitment.postPanel(communityId, channel);
        return `✅ Apply panel is live in <#${channel.id}>.`;
      }
    },
  },

  {
    key: 'welcome', title: 'Welcome new members', emoji: '🎉',
    async render({ communityId }) {
      const w = await welcomeOnboardingService.getWelcomeConfig(communityId);
      return {
        embeds: [base('Greet people who join', [
          'Post a welcome in a channel, send a private welcome DM, and optionally give a starter role.',
          '',
          `**Welcome channel:** ${ch(w.welcomeChannelId)} · ${on(Boolean(w.enableServerWelcome && w.welcomeChannelId))}`,
          `**Welcome DM:** ${on(w.enablePersonalDm)}`,
          `**Role on join:** ${w.newMemberRoleId ? `<@&${w.newMemberRoleId}>` : '`none`'}`,
          '',
          '-# Edit the welcome text and rules in the dashboard → Welcome & rules.',
        ].join('\n'))],
        components: [
          row(new ChannelSelectMenuBuilder().setCustomId(id('welcome', 'ch')).setPlaceholder('Welcome channel').setChannelTypes(ChannelType.GuildText).setMinValues(0).setMaxValues(1).setDefaultChannels(...(w.welcomeChannelId ? [w.welcomeChannelId] : []))),
          row(new RoleSelectMenuBuilder().setCustomId(id('welcome', 'role')).setPlaceholder('Role to give on join (optional)').setMinValues(0).setMaxValues(1).setDefaultRoles(...(w.newMemberRoleId ? [w.newMemberRoleId] : []))),
          row(new ButtonBuilder().setCustomId(id('welcome', 'dm')).setStyle(w.enablePersonalDm ? ButtonStyle.Secondary : ButtonStyle.Success).setLabel(w.enablePersonalDm ? 'Turn off welcome DM' : 'Turn on welcome DM').setEmoji('✉️')),
        ],
      };
    },
    async handle({ communityId, interaction, guild }, action) {
      const w = await welcomeOnboardingService.getWelcomeConfig(communityId);
      const v = (interaction.values || [])[0];
      if (action === 'ch') {
        const c = v ? guild.channels.cache.get(v) : null;
        await welcomeOnboardingService.updateWelcomeConfig(communityId, { welcomeChannelId: v || undefined, welcomeChannelNameSnapshot: c?.name, enableServerWelcome: Boolean(v) });
        return v ? await accessNote(guild, v, 'post welcome messages') : 'Welcome channel cleared.';
      }
      if (action === 'role') {
        if (v) {
          const role = guild.roles.cache.get(v);
          const me = guild.members.me;
          if (role?.managed) return '⚠️ That role is managed by an integration and can’t be given. Pick another role.';
          if (role && me && role.position >= me.roles.highest.position) return `⚠️ I can’t give **${role.name}**: it is above my role. In Server Settings → Roles, drag **${me.roles.highest.name}** above it, then pick it again.`;
          if (role && role.permissions.has(P.Administrator)) return '⚠️ That role has Administrator. For safety, I won’t give it automatically to new members.';
          await welcomeOnboardingService.updateWelcomeConfig(communityId, { newMemberRoleId: v, newMemberRoleNameSnapshot: role?.name, enableAutoRoleAssignment: true });
        } else await welcomeOnboardingService.updateWelcomeConfig(communityId, { newMemberRoleId: undefined, enableAutoRoleAssignment: false });
        return 'Saved.';
      }
      if (action === 'dm') { await welcomeOnboardingService.updateWelcomeConfig(communityId, { enablePersonalDm: !w.enablePersonalDm }); return w.enablePersonalDm ? 'Welcome DM off.' : 'Welcome DM on.'; }
    },
  },

  {
    key: 'logs', title: 'Logs', emoji: '🧾',
    async render({ communityId }) {
      const f = await getFeatures(communityId, true);
      return {
        embeds: [base('Keep a record', [
          'One private channel where I log joins and leaves, deleted and edited messages, role changes, moderation and application decisions.',
          '',
          `**Log channel:** ${ch(f.logs.channelId)} · ${on(Boolean(f.logs.enabled && f.logs.channelId))}`,
          '',
          '-# Choose exactly which events are logged in the dashboard → Community features → Server logs.',
        ].join('\n'))],
        components: [
          row(new ChannelSelectMenuBuilder().setCustomId(id('logs', 'ch')).setPlaceholder('Log channel (staff only)').setChannelTypes(ChannelType.GuildText).setMinValues(0).setMaxValues(1).setDefaultChannels(...(f.logs.channelId ? [f.logs.channelId] : []))),
        ],
      };
    },
    async handle({ communityId, interaction, guild }, action) {
      if (action !== 'ch') return;
      const v = (interaction.values || [])[0];
      const f = await getFeatures(communityId, true);
      await saveFeatures(communityId, { logs: { ...f.logs, channelId: v || undefined, enabled: Boolean(v) } });
      const t = await getToolkit(communityId);
      if (!t.recruitment.logChannelId || !v) await saveToolkit(communityId, { recruitment: { ...t.recruitment, logChannelId: v || undefined } });
      return v ? await accessNote(guild, v, 'write logs') : 'Logs turned off.';
    },
  },

  {
    key: 'extras', title: 'Extra features', emoji: '✨',
    async render({ communityId }) {
      const [t, f] = await Promise.all([getToolkit(communityId), getFeatures(communityId, true)]);
      const state = extrasState(t, f);
      return {
        embeds: [base('Turn on what you need', [
          'Pick the features to switch on. Unpicked ones are switched off. You can change this any time.',
          '',
          ...EXTRAS.map((e) => `${state[e.key] ? '🟢' : '⚪'} ${e.emoji} **${e.label}** · ${e.desc}`),
        ].join('\n'))],
        components: [
          row(new StringSelectMenuBuilder().setCustomId(id('extras', 'pick')).setPlaceholder('Choose features').setMinValues(0).setMaxValues(EXTRAS.length)
            .addOptions(EXTRAS.map((e) => ({ label: e.label, value: e.key, description: e.desc.slice(0, 100), emoji: e.emoji, default: Boolean(state[e.key]) })))),
        ],
      };
    },
    async handle({ communityId, interaction }, action) {
      if (action !== 'pick') return;
      const want = new Set<string>(interaction.values || []);
      const [t, f] = await Promise.all([getToolkit(communityId), getFeatures(communityId, true)]);
      await saveToolkit(communityId, { tickets: { ...t.tickets, enabled: want.has('tickets') }, warnings: { ...t.warnings, enabled: want.has('warnings') } });
      await saveFeatures(communityId, {
        levels: { ...f.levels, enabled: want.has('levels') },
        birthdays: { ...f.birthdays, enabled: want.has('birthdays') },
        starboard: { ...f.starboard, enabled: want.has('starboard') },
      });
      return want.size ? `Saved: ${EXTRAS.filter((e) => want.has(e.key)).map((e) => e.label).join(', ')}.` : 'All extra features are off.';
    },
  },

  {
    key: 'done', title: 'Check & finish', emoji: '✅',
    async render({ communityId, guild }) {
      const checks = await runChecks(communityId, guild);
      const bad = checks.filter((c) => !c.ok).length;
      return {
        embeds: [base(bad ? `Almost there: ${bad} thing${bad > 1 ? 's' : ''} to fix` : 'All set! 🎉', [
          ...checks.map((c) => `${c.ok ? '✅' : '⚠️'} **${c.label}**${c.note ? `\n> ${c.note}` : ''}`),
          '',
          bad ? 'Press **Fix my access** to let me give **myself** the channel access I need (I never change @everyone), then **Re-check**.'
              : 'Community Manager is ready. Run this again any time with `/community-manager setup`.',
          '',
          `🔒 **Lock the server for newcomers** (Secure Setup) and **application questions** are in the [dashboard](${dashboardUrl(communityId, 'server-tools')}).`,
        ].join('\n')).setColor(bad ? 0xf5a524 : 0x3ddc97)],
        components: [row(
          new ButtonBuilder().setCustomId(id('done', 'fix')).setStyle(ButtonStyle.Primary).setLabel('Fix my access').setEmoji('🛠️').setDisabled(!bad),
          new ButtonBuilder().setCustomId(id('done', 'recheck')).setStyle(ButtonStyle.Secondary).setLabel('Re-check').setEmoji('🔄'),
          new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(dashboardUrl(communityId)).setLabel('Open dashboard').setEmoji('🌐'),
        )],
      };
    },
    async handle({ communityId, guild }, action) {
      if (action === 'recheck') return 'Checked again.';
      if (action !== 'fix') return;
      const targets = await channelTargets(communityId);
      let fixed = 0;
      for (const t of targets) {
        const c = await guild.channels.fetch(t.id).catch(() => null);
        if (!c) continue;
        const missing = c.permissionsFor(guild.members.me)?.missing(SEND_PERMS) || SEND_PERMS;
        if (!missing.length) continue;
        const r = await ensureSelfPerms(c, SEND_PERMS, t.why).catch(() => 'failed');
        if (!r || /ok|added|granted/i.test(String(r))) fixed++;
      }
      return fixed ? `Gave myself access in ${fixed} channel${fixed > 1 ? 's' : ''}.` : 'Nothing I could fix myself; see the notes below.';
    },
  },
];

const EXTRAS = [
  { key: 'levels', emoji: '⭐', label: 'Levels & XP', desc: 'Members earn XP for chatting; /rank and /leaderboard' },
  { key: 'tickets', emoji: '🎫', label: 'Support tickets', desc: 'Private tickets with your staff (/ticket open)' },
  { key: 'warnings', emoji: '⚠️', label: 'Warning system', desc: 'Warnings add points; automatic timeout, kick or ban' },
  { key: 'birthdays', emoji: '🎂', label: 'Birthdays', desc: 'Members save a birthday; the server celebrates it' },
  { key: 'starboard', emoji: '🌟', label: 'Starboard', desc: 'Popular messages get reposted to a highlights channel' },
];
function extrasState(t: any, f: any): Record<string, boolean> {
  return { levels: f.levels.enabled, tickets: t.tickets.enabled, warnings: t.warnings.enabled, birthdays: f.birthdays.enabled, starboard: f.starboard.enabled };
}

/* ------------------------------------------------------------------ */
/* Checks                                                              */
/* ------------------------------------------------------------------ */

async function channelTargets(communityId: string) {
  const [t, f, w] = await Promise.all([getToolkit(communityId), getFeatures(communityId, true), welcomeOnboardingService.getWelcomeConfig(communityId)]);
  const r: any = t.recruitment;
  return [
    { id: r.reviewChannelId, label: 'Review channel', why: 'show new applications' },
    { id: r.panelChannelId, label: 'Apply panel channel', why: 'post the Apply panel' },
    { id: w.welcomeChannelId, label: 'Welcome channel', why: 'post welcome messages' },
    { id: f.logs.enabled ? f.logs.channelId : undefined, label: 'Log channel', why: 'write logs' },
  ].filter((x): x is { id: string; label: string; why: string } => Boolean(x.id));
}

async function runChecks(communityId: string, guild: any) {
  const out: { ok: boolean; label: string; note?: string }[] = [];
  const me = guild.members.me;
  const gp = me?.permissions;
  out.push({ ok: Boolean(gp?.has(P.ManageRoles) && gp?.has(P.ManageChannels)), label: 'Manage Roles and Manage Channels', note: gp?.has(P.ManageRoles) && gp?.has(P.ManageChannels) ? undefined : `Server Settings → Roles → **${me?.roles?.highest?.name || 'Community Manager'}** → turn on Manage Roles and Manage Channels.` });

  const r: any = (await getToolkit(communityId)).recruitment;
  out.push({ ok: Boolean(r.reviewerRoleIds?.length), label: 'Reviewer roles chosen', note: r.reviewerRoleIds?.length ? undefined : 'Step 1 → pick who reviews applications.' });
  out.push({ ok: Boolean(r.reviewChannelId), label: 'Review channel chosen', note: r.reviewChannelId ? undefined : 'Step 2 → pick a private staff channel.' });

  for (const t of await channelTargets(communityId)) {
    const c = await guild.channels.fetch(t.id).catch(() => null);
    if (!c) { out.push({ ok: false, label: `${t.label}`, note: 'That channel no longer exists. Pick another one.' }); continue; }
    const missing = c.permissionsFor(me)?.missing(SEND_PERMS) || [];
    out.push({ ok: missing.length === 0, label: `${t.label}: <#${c.id}>`, note: missing.length ? explainAccess(c, SEND_PERMS) : undefined });
  }

  const w = await welcomeOnboardingService.getWelcomeConfig(communityId);
  if (w.newMemberRoleId) {
    const role = guild.roles.cache.get(w.newMemberRoleId);
    const ok = Boolean(role && me && role.position < me.roles.highest.position);
    out.push({ ok, label: 'Role on join can be given', note: ok ? undefined : role ? `Drag **${me?.roles?.highest?.name}** above **${role.name}** in Server Settings → Roles.` : 'That role no longer exists. Pick another one.' });
  }
  return out;
}

async function accessNote(guild: any, channelId: string, why: string): Promise<string> {
  const c = await guild.channels.fetch(channelId).catch(() => null);
  if (!c) return 'Saved.';
  const missing = c.permissionsFor(guild.members.me)?.missing(SEND_PERMS) || [];
  if (!missing.length) return 'Saved.';
  await ensureSelfPerms(c, SEND_PERMS, why).catch(() => undefined);
  const still = c.permissionsFor(guild.members.me)?.missing(SEND_PERMS) || [];
  return still.length ? `Saved, but ${explainAccess(c, SEND_PERMS)}` : 'Saved. I gave myself access to that channel.';
}

/* ------------------------------------------------------------------ */
/* Page frame and navigation                                           */
/* ------------------------------------------------------------------ */

function base(title: string, body: string) {
  return new EmbedBuilder().setColor(BRAND).setTitle(title).setDescription(body.slice(0, 4000));
}

async function page(c: Ctx, index: number, note?: string) {
  const step = STEPS[index];
  const p = await step.render(c);
  const total = STEPS.length - 2; // exclude intro and finish from the count
  const embed = p.embeds[0];
  const progress = index === 0 ? 'Setup' : index === STEPS.length - 1 ? 'Finish' : `Step ${index} of ${total} · ${'●'.repeat(index)}${'○'.repeat(total - index)}`;
  embed.setAuthor({ name: `Community Manager setup · ${progress}`, iconURL: c.guild?.client?.user?.displayAvatarURL?.() });
  embed.setFooter({ text: `${step.emoji} ${step.title}${note ? '  ·  ' : ''}${note ? note.replace(/[*_`>]/g, '').slice(0, 180) : ''}` });
  if (note && /⚠️|can’t|can't|missing|Finish Secure Setup|Add your application/i.test(note)) embed.addFields({ name: 'Note', value: note.slice(0, 1000) });

  const nav = row(
    new ButtonBuilder().setCustomId(id('nav', `go-${Math.max(0, index - 1)}`)).setStyle(ButtonStyle.Secondary).setLabel('Back').setEmoji('⬅️').setDisabled(index === 0),
    ...(index === 0
      ? [new ButtonBuilder().setCustomId(id('nav', 'go-1')).setStyle(ButtonStyle.Success).setLabel('Start setup').setEmoji('🚀')]
      : index < STEPS.length - 1
        ? [
            new ButtonBuilder().setCustomId(id('nav', `go-${index + 1}`)).setStyle(ButtonStyle.Success).setLabel(index === STEPS.length - 2 ? 'Check & finish' : 'Next').setEmoji('➡️'),
            new ButtonBuilder().setCustomId(id('nav', `go-${STEPS.length - 1}`)).setStyle(ButtonStyle.Secondary).setLabel('Skip to finish'),
          ]
        : [new ButtonBuilder().setCustomId(id('nav', 'go-0')).setStyle(ButtonStyle.Secondary).setLabel('Start over')]),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(dashboardUrl(c.communityId)).setLabel('Dashboard'),
  );
  return { embeds: [embed], components: [...p.components, nav].slice(0, 5) };
}

function isAdmin(interaction: any) {
  const p = interaction.memberPermissions;
  return Boolean(p?.has(P.Administrator) || p?.has(P.ManageGuild));
}

/** Slash command entry: `/community-manager setup`. */
export async function startSetupWizard(interaction: any) {
  if (!interaction.guild) { await interaction.reply({ content: 'Run this inside your server.', ephemeral: true }); return; }
  if (!isAdmin(interaction)) { await interaction.reply({ content: '⛔ Only server admins (Manage Server) can run setup.', ephemeral: true }); return; }
  await interaction.deferReply({ ephemeral: true });
  const communityId = await communityForGuild(interaction.guildId);
  const c: Ctx = { communityId, guild: interaction.guild, interaction };
  await interaction.editReply(await page(c, 0));
}

/** Component handler for cm:su:* ids. */
export async function handleSetupWizard(interaction: any): Promise<boolean> {
  const [, area, stepKey, action = ''] = String(interaction.customId || '').split(':');
  if (area !== 'su') return false;
  if (!isAdmin(interaction)) { await interaction.reply({ content: '⛔ Only server admins (Manage Server) can change setup.', ephemeral: true }).catch(() => undefined); return true; }
  await interaction.deferUpdate().catch(() => undefined);
  const communityId = await communityForGuild(interaction.guildId);
  const c: Ctx = { communityId, guild: interaction.guild, interaction };
  try {
    if (stepKey === 'nav') {
      const to = Math.min(STEPS.length - 1, Math.max(0, Number(action.replace('go-', '')) || 0));
      await interaction.editReply(await page(c, to));
      return true;
    }
    const index = STEPS.findIndex((s) => s.key === stepKey);
    if (index < 0) return true;
    let note: string | void;
    try { note = await STEPS[index].handle?.(c, action); } catch (e: any) { note = `⚠️ ${e?.message || 'Something went wrong.'}`; }
    await interaction.editReply(await page(c, index, note || undefined));
  } catch (e: any) {
    await interaction.followUp({ content: `⚠️ ${e?.message || 'Something went wrong.'}`, ephemeral: true }).catch(() => undefined);
  }
  return true;
}
