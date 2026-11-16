/**
 * "Create missing" helpers for /community-manager setup.
 *
 * Everything is created only when an admin presses a Create button, and only when nothing is set yet.
 * - Staff-only channels go inside the private 💠 COMMUNITY MANAGER category (new category: hidden
 *   from @everyone, visible to the bot and the reviewer roles). Existing channels are never changed.
 * - Public channels (apply, welcome) are created with no @everyone overwrite at all.
 * - Roles are created with no permissions, so they can never grant anything dangerous.
 * Every result is saved to the same settings the dashboard reads.
 */
import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { getToolkit, saveToolkit } from '../../services/toolkit/toolkitConfig.js';
import { getFeatures, saveFeatures } from '../../services/features/featuresConfig.js';
import { welcomeOnboardingService } from '../../services/welcomeOnboarding.service.js';
import { CM_CATEGORY_NAME, isCmCategory, postIntro } from '../../services/serverWorkspace.service.js';

const BOT_PERMS = [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory, P.ManageChannels, P.ManageThreads, P.CreatePrivateThreads, P.SendMessagesInThreads, P.AttachFiles];
const live = (guild: any, id?: string) => Boolean(id && guild.channels.cache.has(id));
const liveRole = (guild: any, id?: string) => Boolean(id && guild.roles.cache.has(id));

export type Created = string[];

/* ---------- Finding what already exists (similar names count: Member/Members, Log/Logs/Server-log) ---------- */

/** "📋・Server-Logs" → "server log": lowercase words, emojis/symbols dropped, plural "s" removed. */
export const words = (name: string) => String(name || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()
  .split(' ').filter(Boolean).map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)).join(' ');

/** Name patterns per purpose, tried in order (best first). Matched against words(name). */
export const PATTERNS = {
  serverLog: [/^server log$/, /^(mod|moderation|audit|activity|bot) log$/, /^log$/, /server log/, /(mod|audit) log/],
  recruitmentLog: [/^(recruitment|recruit|application|applicant) log$/, /(recruitment|application) (log|record)/],
  review: [/^application$/, /^(application|app|applicant) review$/, /^(staff )?review$/, /application review/, /^applications?$/],
  apply: [/^apply$/, /^(apply here|apply now|join u|how to join|join)$/, /apply/],
  welcome: [/^welcome$/, /^(welcome and rule|arrival|greeting|new member)$/, /welcome/],
  reviewerRole: [/^reviewer$/, /^(application|app) reviewer$/, /^recruiter$/, /reviewer/],
  applicantRole: [/^applicant$/, /^(pending|unverified|new member|newcomer|guest)$/, /applicant/],
  memberRole: [/^member$/, /^(verified|approved|verified member|community member)$/, /^member/],
};

function best<T extends { name: string }>(items: T[], pats: RegExp[]): T | undefined {
  for (const re of pats) { const hit = items.find((x) => re.test(words(x.name))); if (hit) return hit; }
  return undefined;
}

const isPrivate = (guild: any, c: any) => !c.permissionsFor(guild.roles.everyone)?.has(P.ViewChannel);

/** Existing text channel for a purpose. Staff channels must already be private (never reuse a public one for logs). */
export function findChannel(guild: any, key: keyof typeof PATTERNS, opts: { private?: boolean; exclude?: string[] } = {}) {
  const text = Array.from(guild.channels.cache.values()).filter((c: any) => (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
    && !(opts.exclude || []).includes(c.id) && (opts.private === undefined || isPrivate(guild, c) === opts.private)) as any[];
  return best(text, PATTERNS[key]);
}

/** Existing plain role for a purpose: not managed, no admin powers, below the bot (so it can be given). */
export function findRole(guild: any, key: keyof typeof PATTERNS, exclude: string[] = []) {
  const top = guild.members.me?.roles?.highest?.position ?? 0;
  const ok = Array.from(guild.roles.cache.values()).filter((r: any) => r.id !== guild.id && !r.managed && !exclude.includes(r.id)
    && !r.permissions.has(P.Administrator) && r.position < top) as any[];
  return best(ok, PATTERNS[key]);
}

async function category(guild: any, communityId: string, made: Created) {
  const found = guild.channels.cache.find(isCmCategory);
  if (found) return found;
  const reviewers = (await getToolkit(communityId)).recruitment.reviewerRoleIds.filter((r) => liveRole(guild, r));
  const cat = await guild.channels.create({
    name: CM_CATEGORY_NAME, type: ChannelType.GuildCategory, position: 0, reason: 'Community Manager setup: private staff workspace',
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
      { id: guild.members.me.id, allow: BOT_PERMS },
      ...reviewers.slice(0, 20).map((r) => ({ id: r, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] })),
    ],
  });
  made.push(`📁 ${CM_CATEGORY_NAME} (private category)`);
  return cat;
}

async function staffChannel(guild: any, communityId: string, name: string, topic: string, intro: string, made: Created, key?: keyof typeof PATTERNS, exclude: string[] = []) {
  const similar = key ? findChannel(guild, key, { private: true, exclude }) : undefined;
  if (similar) return similar;
  const cat = await category(guild, communityId, made);
  const existing = guild.channels.cache.find((c: any) => c.parentId === cat.id && c.name === name);
  if (existing) return existing;
  const c = await guild.channels.create({ name, type: ChannelType.GuildText, parent: cat.id, topic, reason: 'Community Manager setup' });
  made.push(`<#${c.id}> (staff only)`);
  await postIntro(c, intro);
  return c;
}

async function publicChannel(guild: any, name: string, topic: string, made: Created, key?: keyof typeof PATTERNS) {
  const existing = (key && findChannel(guild, key, { private: false })) || guild.channels.cache.find((c: any) => c.type === ChannelType.GuildText && c.name === name && !c.parent?.name?.includes('𝗖𝗢𝗠𝗠𝗨𝗡𝗜𝗧𝗬'));
  if (existing) return existing;
  // Only overwrite: the bot itself. @everyone is left exactly as the server's defaults.
  const c = await guild.channels.create({
    name, type: ChannelType.GuildText, topic, reason: 'Community Manager setup',
    permissionOverwrites: [{ id: guild.members.me.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory] }],
  });
  made.push(`<#${c.id}>`);
  return c;
}

async function role(guild: any, name: string, color: number, made: Created, key?: keyof typeof PATTERNS, exclude: string[] = []) {
  const existing = (key && findRole(guild, key, exclude)) || guild.roles.cache.find((r: any) => r.name === name && !r.managed && !exclude.includes(r.id));
  if (existing) return existing;
  const r = await guild.roles.create({ name, color, permissions: [], reason: 'Community Manager setup' });
  made.push(`<@&${r.id}> (no permissions)`);
  return r;
}

export const create = {
  /** Reviewer role, if no reviewer role is chosen. */
  async staff(guild: any, communityId: string, made: Created = []) {
    const t = await getToolkit(communityId);
    if (!t.recruitment.reviewerRoleIds.some((r) => liveRole(guild, r))) {
      const r = await role(guild, '🛡️ Reviewer', 0x7c8cff, made, 'reviewerRole');
      await saveToolkit(communityId, { recruitment: { ...t.recruitment, reviewerRoleIds: [r.id] } });
      const cat = guild.channels.cache.find(isCmCategory);
      if (cat) await cat.permissionOverwrites.edit(r.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }, { reason: 'Community Manager setup: reviewers see the staff workspace' }).catch(() => undefined);
    }
    return made;
  },

  /** Applicant (newcomer) and Member (approved) roles, saved for Secure Setup. */
  async roles(guild: any, communityId: string, made: Created = []) {
    const { getGate, secureGate } = await import('../../services/recruitment/secureGate.service.js');
    const g = await getGate(communityId);
    const applicant = liveRole(guild, g.applicantRoleId) ? guild.roles.cache.get(g.applicantRoleId) : await role(guild, 'Applicant', 0xf5a524, made, 'applicantRole');
    const member = liveRole(guild, g.memberRoleId) && g.memberRoleId !== applicant.id ? guild.roles.cache.get(g.memberRoleId) : await role(guild, 'Member', 0x3ddc97, made, 'memberRole', [applicant.id]);
    await secureGate.setRoles(communityId, { applicantRoleId: applicant.id, memberRoleId: member.id, approvedExtraRoleIds: g.approvedExtraRoleIds || [] });
    return made;
  },

  /** Review channel (staff only) and a public #apply channel for the panel. */
  async apps(guild: any, communityId: string, made: Created = []) {
    const r: any = (await getToolkit(communityId)).recruitment;
    const patch: any = {};
    if (!live(guild, r.reviewChannelId)) patch.reviewChannelId = (await staffChannel(guild, communityId, '📥・applications', 'New applications with Approve / Reject. Staff only.', 'applications', made, 'review', [r.logChannelId].filter(Boolean))).id;
    if (!live(guild, r.logChannelId)) patch.logChannelId = (await staffChannel(guild, communityId, '📋・recruitment-log', 'Every application, screening result, decision and recruiter credit.', 'recruitmentLog', made, 'recruitmentLog', [patch.reviewChannelId || r.reviewChannelId].filter(Boolean))).id;
    if (!live(guild, r.panelChannelId)) { patch.panelChannelId = (await publicChannel(guild, '📝・apply', 'Press Apply to join. Your answers go privately to the staff.', made, 'apply')).id; patch.panelMessageId = undefined; patch.panelPostedAt = undefined; }
    if (Object.keys(patch).length) { const t = await getToolkit(communityId); await saveToolkit(communityId, { recruitment: { ...t.recruitment, ...patch } }); }
    return made;
  },

  async welcome(guild: any, communityId: string, made: Created = []) {
    const w = await welcomeOnboardingService.getWelcomeConfig(communityId);
    if (!live(guild, w.welcomeChannelId)) {
      const c = await publicChannel(guild, '👋・welcome', 'Welcome to the server!', made, 'welcome');
      await welcomeOnboardingService.updateWelcomeConfig(communityId, { welcomeChannelId: c.id, welcomeChannelNameSnapshot: c.name, enableServerWelcome: true });
    }
    return made;
  },

  async logs(guild: any, communityId: string, made: Created = []) {
    const f = await getFeatures(communityId, true);
    if (!(f.logs.enabled && live(guild, f.logs.channelId))) {
      const t = (await getToolkit(communityId)).recruitment as any;
      const c = await staffChannel(guild, communityId, '🧾・server-log', 'Joins, leaves, edits, deletions, role changes and warnings.', 'serverLog', made, 'serverLog', [t.reviewChannelId, t.logChannelId].filter(Boolean));
      await saveFeatures(communityId, { logs: { ...f.logs, channelId: c.id, enabled: true } });
    }
    return made;
  },

  /** Everything at once, in a safe order (reviewers first so the category includes them). */
  async all(guild: any, communityId: string) {
    const made: Created = [];
    const errors: string[] = [];
    for (const k of ['staff', 'roles', 'apps', 'welcome', 'logs'] as const) {
      try { await (create as any)[k](guild, communityId, made); } catch (e: any) { errors.push(`${k}: ${e?.message || e}`); }
    }
    return { made, errors };
  },
};

/** Short result line for the wizard footer/note. */
export function createdNote(made: Created, errors: string[] = []) {
  const ok = made.length ? `✅ Created: ${made.join(', ')}` : '✅ Nothing was missing.';
  return errors.length ? `${ok}\n⚠️ ${errors.join('\n⚠️ ')}` : ok;
}

/**
 * Runs once when the bot joins a server: reuse what exists (similar names count), create only
 * what is missing, then post a short summary in the server log so the owner sees what happened.
 */
export async function autoProvisionOnJoin(communityId: string) {
  const { guildFor } = await import('../../services/toolkit/toolkitConfig.js');
  const guild: any = await guildFor(communityId);
  if (!guild) return;
  const me = guild.members.me;
  if (!me?.permissions.has(P.ManageChannels) || !me?.permissions.has(P.ManageRoles)) return; // nothing safe to do; setup will explain
  const t0 = await getToolkit(communityId);
  if ((t0.recruitment as any).autoProvisionedAt) return;
  try {
    const { workspace } = await import('../../services/serverWorkspace.service.js');
    await workspace.provision(communityId).catch(() => undefined); // finds existing staff roles + staff channels first
  } catch { /* continue with the rest */ }
  const { made, errors } = await create.all(guild, communityId);
  const t = await getToolkit(communityId);
  await saveToolkit(communityId, { recruitment: { ...t.recruitment, autoProvisionedAt: new Date().toISOString() } as any });
  const f = await getFeatures(communityId, true);
  const logId = f.logs.channelId || (t.recruitment as any).logChannelId;
  const logCh: any = logId ? await guild.channels.fetch(logId).catch(() => null) : null;
  await logCh?.send({
    embeds: [{
      color: 0x7c8cff, title: '⚙️ Community Manager is set up',
      description: [
        made.length ? `**Created**\n${made.map((x) => `• ${x}`).join('\n')}` : 'Everything needed already existed, so I reused it.',
        errors.length ? `\n**Could not do**\n${errors.map((x) => `• ${x}`).join('\n')}` : '',
        '\nRun `/community-manager setup` to review, change anything and confirm.',
      ].join('\n').slice(0, 4000),
    }],
    allowedMentions: { parse: [] },
  }).catch(() => undefined);
}
