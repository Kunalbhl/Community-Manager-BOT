/**
 * /community-manager setup — a step-by-step setup wizard inside Discord.
 *
 * - Admin-only (Manage Server or Administrator), private (ephemeral) message that updates in place.
 * - Each step is a small module in STEPS: it renders its page and handles its own menus/buttons.
 * - Every choice is saved immediately to the SAME settings the dashboard uses, so both stay in sync.
 * - Every step has a "Create missing" button (setupProvision.ts): staff channels go in the private
 *   Community Manager category; public channels and roles are created without touching @everyone on
 *   any existing channel. Locking the server (Secure Setup) stays in the dashboard.
 * - The finish step reviews everything, lists what is still pending in the dashboard, and only
 *   "Confirm & finish" marks setup complete and posts a success record in the log channel.
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
import { create, createdNote } from './setupProvision.js';

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
const createBtn = (step: string, label = 'Create missing') => new ButtonBuilder().setCustomId(id(step, 'create')).setStyle(ButtonStyle.Primary).setLabel(label).setEmoji('✨');
async function made(fn: () => Promise<string[]>) { try { return createdNote(await fn()); } catch (e: any) { return `⚠️ ${e?.message || e}`; } }
const row = <T extends ActionRowBuilder<any>>(...c: any[]) => new ActionRowBuilder<any>().addComponents(...c) as T;

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

const STEPS: Step[] = [
  {
    key: 'intro', title: 'Welcome', emoji: '👋',
    async handle({ communityId, guild }, action) {
      if (action !== 'create') return;
      const r = await create.all(guild, communityId);
      return createdNote(r.made, r.errors);
    },
    async render() {
      return {
        embeds: [base('Set up Community Manager', [
          'This takes about **3 minutes**. Each step saves as soon as you pick something, and you can skip any step.',
          '',
          '**What we will set up**',
          ...STEPS.slice(1, -1).map((s, i) => `\`${i + 1}\` ${s.emoji} ${s.title}`),
          '',
          'Everything here also appears in the dashboard, so you can fine-tune it later.',
          '',
          '**New server?** Press **Create everything missing** and I will make the private Community Manager category with its staff channels (applications, recruitment log, server log), a public #apply and #welcome channel, and the Reviewer, Applicant and Member roles. Anything you already set is kept.',
        ].join('\n'))],
        components: [row(createBtn('intro', 'Create everything missing'))],
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
          row(createBtn('staff', 'Create a Reviewer role').setDisabled(Boolean(r.reviewerRoleIds?.length))),
        ],
      };
    },
    async handle({ communityId, interaction, guild }, action) {
      if (action === 'create') return made(() => create.staff(guild, communityId));
      const t = await getToolkit(communityId);
      const values: string[] = interaction.values || [];
      if (action === 'reviewers') await saveToolkit(communityId, { recruitment: { ...t.recruitment, reviewerRoleIds: values } });
      else if (action === 'ping') await saveToolkit(communityId, { recruitment: { ...t.recruitment, pingRoleIds: values } });
      else return;
      return 'Saved.';
    },
  },

  {
    key: 'roles', title: 'Newcomer & member roles', emoji: '🎭',
    async render({ communityId, guild }) {
      const { getGate } = await import('../../services/recruitment/secureGate.service.js');
      const g = await getGate(communityId);
      const has = (x?: string) => Boolean(x && guild.roles.cache.has(x));
      return {
        embeds: [base('Applicant and Member roles', [
          '**Applicant:** given to new people while they apply. They only see the public channels (welcome, rules, apply).',
          '**Member:** given when an application is approved. It opens the rest of the server.',
          '',
          `**Applicant role:** ${has(g.applicantRoleId) ? `<@&${g.applicantRoleId}>` : '`not set`'}`,
          `**Member role:** ${has(g.memberRoleId) ? `<@&${g.memberRoleId}>` : '`not set`'}`,
          '',
          '-# These roles have no permissions by themselves. Secure Setup in the dashboard uses them to lock the server for newcomers.',
        ].join('\n'))],
        components: [
          row(new RoleSelectMenuBuilder().setCustomId(id('roles', 'applicant')).setPlaceholder('Applicant role (newcomers)').setMinValues(1).setMaxValues(1).setDefaultRoles(...(has(g.applicantRoleId) ? [g.applicantRoleId!] : []))),
          row(new RoleSelectMenuBuilder().setCustomId(id('roles', 'member')).setPlaceholder('Member role (approved)').setMinValues(1).setMaxValues(1).setDefaultRoles(...(has(g.memberRoleId) ? [g.memberRoleId!] : []))),
          row(createBtn('roles', 'Create missing roles').setDisabled(has(g.applicantRoleId) && has(g.memberRoleId))),
        ],
      };
    },
    async handle({ communityId, interaction, guild }, action) {
      if (action === 'create') return made(() => create.roles(guild, communityId));
      if (action !== 'applicant' && action !== 'member') return;
      const v = (interaction.values || [])[0];
      if (!v) return;
      const role = guild.roles.cache.get(v);
      if (role?.permissions?.has(P.Administrator) || role?.permissions?.has(P.ManageGuild)) return '⚠️ That role has admin powers. Pick or create a plain role instead.';
      const { getGate, secureGate } = await import('../../services/recruitment/secureGate.service.js');
      const g = await getGate(communityId);
      const next = { applicantRoleId: action === 'applicant' ? v : g.applicantRoleId, memberRoleId: action === 'member' ? v : g.memberRoleId };
      if (!next.applicantRoleId || !next.memberRoleId) {
        // Save the half we have; setRoles needs both, so store directly until the other is chosen.
        const { gateRepository } = await import('../../services/recruitment/secureGate.service.js');
        const doc = { ...g, ...next, id: communityId, communityId, updatedAt: new Date().toISOString() } as any;
        if (await gateRepository.getById(communityId).catch(() => null)) await gateRepository.update(communityId, doc); else await gateRepository.create(communityId, doc);
        return 'Saved. Now pick the other role (or press Create missing roles).';
      }
      await secureGate.setRoles(communityId, { applicantRoleId: next.applicantRoleId, memberRoleId: next.memberRoleId, approvedExtraRoleIds: g.approvedExtraRoleIds || [] });
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
            createBtn('apps', 'Create missing channels').setStyle(ButtonStyle.Secondary).setDisabled(Boolean(r.reviewChannelId && r.panelChannelId && r.logChannelId)),
          ),
        ],
      };
    },
    async handle({ communityId, interaction, guild }, action) {
      if (action === 'create') return made(() => create.apps(guild, communityId));
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
          row(
            new ButtonBuilder().setCustomId(id('welcome', 'dm')).setStyle(w.enablePersonalDm ? ButtonStyle.Secondary : ButtonStyle.Success).setLabel(w.enablePersonalDm ? 'Turn off welcome DM' : 'Turn on welcome DM').setEmoji('✉️'),
            createBtn('welcome', 'Create #welcome').setStyle(ButtonStyle.Secondary).setDisabled(Boolean(w.welcomeChannelId)),
          ),
        ],
      };
    },
    async handle({ communityId, interaction, guild }, action) {
      if (action === 'create') return made(() => create.welcome(guild, communityId));
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
          row(createBtn('logs', 'Create a private log channel').setDisabled(Boolean(f.logs.enabled && f.logs.channelId))),
        ],
      };
    },
    async handle({ communityId, interaction, guild }, action) {
      if (action === 'create') return made(() => create.logs(guild, communityId));
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
    key: 'done', title: 'Review & finish', emoji: '✅',
    async render({ communityId, guild }) {
      const [checks, pend, summary, t] = await Promise.all([runChecks(communityId, guild), pending(communityId), reviewLines(communityId, guild), getToolkit(communityId)]);
      const bad = checks.filter((c) => !c.ok && !c.soft).length;
      const doneAt = (t.recruitment as any).setupCompletedAt as string | undefined;
      const lines = [
        '**Your setup**', ...summary, '',
        '**Checks**', ...checks.map((c) => `${c.ok ? '✅' : c.soft ? '💡' : '⚠️'} ${c.label}${c.note ? `\n> ${c.note}` : ''}`), '',
        pend.length ? '**Still to do in the dashboard**' : '**Dashboard**',
        ...(pend.length ? pend.map((x) => `⏳ ${x}`) : ['✅ Nothing pending.']),
        '',
        bad ? 'Press **Fix my access** (I only ever give **myself** access), or **Create missing** on the step that needs it, then **Re-check**.'
          : doneAt ? `✅ Setup confirmed <t:${Math.floor(Date.parse(doneAt) / 1000)}:R>. Press **Confirm & finish** again after changes to log them.`
          : 'Everything checks out. Press **Confirm & finish** to complete setup and post a record in your log channel.',
      ];
      return {
        embeds: [base(bad ? `Review: ${bad} thing${bad > 1 ? 's' : ''} to fix` : 'Review & confirm', lines.join('\n')).setColor(bad ? 0xf5a524 : 0x3ddc97)],
        components: [row(
          new ButtonBuilder().setCustomId(id('done', 'confirm')).setStyle(ButtonStyle.Success).setLabel('Confirm & finish').setEmoji('✅').setDisabled(bad > 0),
          new ButtonBuilder().setCustomId(id('done', 'fix')).setStyle(ButtonStyle.Primary).setLabel('Fix my access').setEmoji('🛠️').setDisabled(!bad),
          new ButtonBuilder().setCustomId(id('done', 'recheck')).setStyle(ButtonStyle.Secondary).setLabel('Re-check').setEmoji('🔄'),
        )],
      };
    },
    async handle({ communityId, guild, interaction }, action) {
      if (action === 'recheck') return 'Checked again.';
      if (action === 'confirm') return confirmSetup(communityId, guild, interaction);
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
  const out: { ok: boolean; label: string; note?: string; soft?: boolean }[] = [];
  const me = guild.members.me;
  const gp = me?.permissions;
  out.push({ ok: Boolean(gp?.has(P.ManageRoles) && gp?.has(P.ManageChannels)), label: 'Manage Roles and Manage Channels', note: gp?.has(P.ManageRoles) && gp?.has(P.ManageChannels) ? undefined : `Server Settings → Roles → **${me?.roles?.highest?.name || 'Community Manager'}** → turn on Manage Roles and Manage Channels.` });

  const r: any = (await getToolkit(communityId)).recruitment;
  out.push({ ok: Boolean(r.reviewerRoleIds?.length), label: 'Reviewer roles chosen', note: r.reviewerRoleIds?.length ? undefined : 'Staff step → pick reviewer roles or press Create a Reviewer role.' });
  out.push({ ok: Boolean(r.reviewChannelId), label: 'Review channel chosen', note: r.reviewChannelId ? undefined : 'Applications step → pick one or press Create missing channels.' });

  for (const t of await channelTargets(communityId)) {
    const c = await guild.channels.fetch(t.id).catch(() => null);
    if (!c) { out.push({ ok: false, label: `${t.label}`, note: 'That channel no longer exists. Pick another one.' }); continue; }
    const missing = c.permissionsFor(me)?.missing(SEND_PERMS) || [];
    out.push({ ok: missing.length === 0, label: `${t.label}: <#${c.id}>`, note: missing.length ? explainAccess(c, SEND_PERMS) : undefined });
  }

  const f = await getFeatures(communityId, true);
  if (r.reviewChannelId && (r.reviewChannelId === f.logs.channelId || r.reviewChannelId === r.logChannelId)) {
    out.push({ ok: false, soft: true, label: 'Review channel is separate from logs', note: 'Applications would be mixed with log entries. Applications step → Create missing channels makes a dedicated one (recommended).' });
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
/* Review, pending and confirmation                                    */
/* ------------------------------------------------------------------ */

async function reviewLines(communityId: string, guild: any) {
  const { getGate } = await import('../../services/recruitment/secureGate.service.js');
  const [t, f, w, g] = await Promise.all([getToolkit(communityId), getFeatures(communityId, true), welcomeOnboardingService.getWelcomeConfig(communityId), getGate(communityId)]);
  const r: any = t.recruitment;
  const role1 = (x?: string) => (x && guild.roles.cache.has(x) ? `<@&${x}>` : '`not set`');
  const on2 = EXTRAS.filter((e) => extrasState(t, f)[e.key]).map((e) => e.label);
  return [
    `🛡️ Reviewers: ${roles(r.reviewerRoleIds)}`,
    `🎭 Applicant: ${role1(g.applicantRoleId)} · Member: ${role1(g.memberRoleId)}`,
    `📋 Review: ${ch(r.reviewChannelId)} · Apply panel: ${ch(r.panelChannelId)}${r.panelPostedAt ? ' (posted)' : ''} · Applications ${r.applyEnabled ? 'open' : 'paused'}`,
    `🎉 Welcome: ${ch(w.welcomeChannelId)} · DM ${w.enablePersonalDm ? 'on' : 'off'}`,
    `🧾 Logs: ${f.logs.enabled ? ch(f.logs.channelId) : '`off`'} · Recruitment log: ${ch(r.logChannelId)}`,
    `✨ Features: ${on2.length ? on2.join(', ') : 'none'}`,
  ];
}

/** Things only the dashboard can finish. */
async function pending(communityId: string) {
  const out: string[] = [];
  const { getGate } = await import('../../services/recruitment/secureGate.service.js');
  const { communityQuestionsService } = await import('../../services/communityQuestions.service.js');
  const [g, qs, t] = await Promise.all([getGate(communityId), communityQuestionsService.listApplicationQuestions(communityId).catch(() => [] as any[]), getToolkit(communityId)]);
  const url = dashboardUrl(communityId, 'server-tools');
  if (!qs.filter((q: any) => q.enabled !== false).length) out.push(`**Application questions**: add what applicants answer → [Recruitment → Questions](${url})`);
  if (!g.verified) out.push(`**Secure Setup**: lock the server so newcomers only see public channels → [Server tools → Recruitment](${url})`);
  else if (!(t.recruitment as any).panelPostedAt) out.push('**Apply panel**: go back to Applications and press **Post Apply panel**');
  return out;
}

async function confirmSetup(communityId: string, guild: any, interaction: any) {
  const checks = await runChecks(communityId, guild);
  if (checks.some((c) => !c.ok && !c.soft)) return '⚠️ Fix the items marked ⚠️ first, then confirm.';
  const [summary, pend, t, f] = await Promise.all([reviewLines(communityId, guild), pending(communityId), getToolkit(communityId), getFeatures(communityId, true)]);
  const at = new Date().toISOString();
  await saveToolkit(communityId, { recruitment: { ...t.recruitment, setupCompletedAt: at, setupCompletedBy: interaction.user?.id } as any });
  const embed = new EmbedBuilder().setColor(0x3ddc97).setTitle('✅ Community Manager setup completed')
    .setDescription([`Confirmed by <@${interaction.user?.id}> <t:${Math.floor(Date.now() / 1000)}:f>`, '', ...summary, '',
      pend.length ? '**Still to do in the dashboard**' : '', ...pend.map((x) => `⏳ ${x}`)].filter((x, i, a) => x || a[i - 1]).join('\n').slice(0, 4000))
    .setFooter({ text: 'Community Manager · run /community-manager setup any time to change this' });
  const targets = Array.from(new Set([f.logs.enabled ? f.logs.channelId : undefined, (t.recruitment as any).logChannelId].filter(Boolean))) as string[];
  let posted = 0;
  for (const cid of targets) {
    const c = await guild.channels.fetch(cid).catch(() => null);
    if (c?.send && (await c.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null))) posted++;
  }
  return `✅ Setup confirmed${posted ? ` and logged in ${targets.map((x) => `<#${x}>`).join(' ')}` : ''}.${pend.length ? ` ${pend.length} item${pend.length > 1 ? 's' : ''} still pending in the dashboard.` : ''}`;
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
  if (note && /⚠️|✅ Created|Setup confirmed|can’t|can't|missing|Finish Secure Setup|Add your application/i.test(note)) embed.addFields({ name: 'Note', value: note.slice(0, 1000) });

  const nav = row(
    new ButtonBuilder().setCustomId(id('nav', `go-${Math.max(0, index - 1)}`)).setStyle(ButtonStyle.Secondary).setLabel('Back').setEmoji('⬅️').setDisabled(index === 0),
    ...(index === 0
      ? [new ButtonBuilder().setCustomId(id('nav', 'go-1')).setStyle(ButtonStyle.Success).setLabel('Start setup').setEmoji('🚀')]
      : index < STEPS.length - 1
        ? [
            new ButtonBuilder().setCustomId(id('nav', `go-${index + 1}`)).setStyle(ButtonStyle.Success).setLabel(index === STEPS.length - 2 ? 'Review & finish' : 'Next').setEmoji('➡️'),
            // On the last step before "done", Next already goes to finish; a second button with the
            // same custom id makes Discord reject the whole message.
            ...(index < STEPS.length - 2
              ? [new ButtonBuilder().setCustomId(id('nav', `go-${STEPS.length - 1}`)).setStyle(ButtonStyle.Secondary).setLabel('Skip to finish')]
              : []),
          ]
        : [new ButtonBuilder().setCustomId(id('nav', 'close')).setStyle(ButtonStyle.Secondary).setLabel('Close').setEmoji('✖️')]),
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
      if (action === 'close') { await interaction.deleteReply().catch(() => interaction.editReply({ content: 'Setup closed. Run `/community-manager setup` any time.', embeds: [], components: [] })); return true; }
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
