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
import { tidyChannelNames, uniqueName } from './channelEmoji.js';

/** Default name for the public apply channel (Discord shows it as #📝・apply-to-join). */
export const APPLY_CHANNEL = 'apply-to-join';
/** Our own log channel, always created inside the Community Manager category. */
export const LOG_CHANNEL_NAME = '📋・community-manager-log';

const unique = uniqueName;

async function counterChannelIds(communityId: string): Promise<string[]> {
  try {
    const { statCountersRepository } = await import('../../services/features/serverStats.service.js');
    return (await statCountersRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] })).map((c: any) => c.channelId);
  } catch { return []; }
}

/** Adds a matching unique emoji to channels/categories without one (counters skipped). */
export async function tidyNames(guild: any, communityId: string) {
  return tidyChannelNames(guild, await counterChannelIds(communityId));
}

/** Bot-made apply channels named just "apply" become "apply-to-join" (emoji kept). */
export async function renameApplyChannels(guild: any, communityId: string) {
  const { getGate } = await import('../../services/recruitment/secureGate.service.js');
  const g: any = await getGate(communityId).catch(() => ({}));
  const r: any = (await getToolkit(communityId)).recruitment;
  for (const id of new Set([g.applyChannelId, r.panelChannelId].filter(Boolean))) {
    const c: any = guild.channels.cache.get(id);
    const m = c?.name?.match(/^((?:\p{Extended_Pictographic}\uFE0F?)?\s*[・·\-]?\s*)apply$/iu);
    if (!c || !m || !c.permissionsFor(guild.members.me)?.has([P.ViewChannel, P.ManageChannels])) continue;
    await c.setName(`${m[1] || ''}${APPLY_CHANNEL}`, 'Community Manager: clearer apply channel name').catch(() => undefined);
  }
}

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
  serverLog: [/^server log$/, /^(mod|moderation|audit|activity|bot) log$/, /^log$/, /\bserver log\b/, /\b(mod|audit) log\b/],
  recruitmentLog: [/^(recruitment|recruit|application|applicant) log$/, /\b(recruitment|application) (log|record)\b/],
  review: [/^application$/, /^(application|app|applicant) review$/, /^(staff )?review$/, /\bapplication review\b/, /^applications?$/],
  apply: [/^apply$/, /^apply to join$/, /^(apply here|apply now|join u|how to join)$/, /\bapply\b/],
  // words() drops plurals and symbols: "Joined & Left" → "joined left", "Welcomes" → "welcome".
  welcome: [/^welcome$/, /^(join|joining|joined|joiner)$/, /^(join|joined|joining) (and |n )?(left|leave|leaving|exit)$/,
    /^(welcome and rule|welcome and goodbye|welcome goodbye|arrival|greeting|new member|new arrival|hello)$/,
    /\bwelcome\b/, /\b(join|joined|joining)\b/, /\b(arrival|greeting)\b/],
  reviewerRole: [/^reviewer$/, /^(application|app) reviewer$/, /^recruiter$/, /\breviewer\b/],
  // Standard: the newcomer role is always exactly "Applicant" (never a look-alike such as Guest or Pending).
  applicantRole: [/^applicant$/],
  memberRole: [/^member$/, /^(verified|approved|verified member|community member)$/, /^member\b/],
};

function best<T extends { name: string }>(items: T[], pats: RegExp[], not?: RegExp): T | undefined {
  for (const re of pats) { const hit = items.find((x) => re.test(words(x.name)) && !(not && not.test(words(x.name)))); if (hit) return hit; }
  return undefined;
}

const isPrivate = (guild: any, c: any) => !c.permissionsFor(guild.roles.everyone)?.has(P.ViewChannel);

/** Existing text channel for a purpose. Staff channels must already be private (never reuse a public one for logs). */
export function findChannel(guild: any, key: keyof typeof PATTERNS, opts: { private?: boolean; exclude?: string[] } = {}) {
  const text = Array.from(guild.channels.cache.values()).filter((c: any) => (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement)
    && !(opts.exclude || []).includes(c.id) && (opts.private === undefined || isPrivate(guild, c) === opts.private)) as any[];
  return best(text, PATTERNS[key], key === 'welcome' ? /\b(apply|how to join|join u)\b/ : undefined);
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
  const c = await guild.channels.create({ name: unique(guild, name), type: ChannelType.GuildText, parent: cat.id, topic, reason: 'Community Manager setup' });
  made.push(`<#${c.id}> (staff only)`);
  await postIntro(c, intro);
  return c;
}

async function publicChannel(guild: any, name: string, topic: string, made: Created, key?: keyof typeof PATTERNS, communityId?: string) {
  const existing = (key && (findChannel(guild, key, { private: false }) || (key === 'welcome' ? findChannel(guild, key) : undefined))) || guild.channels.cache.find((c: any) => c.type === ChannelType.GuildText && c.name === name && !c.parent?.name?.includes('𝗖𝗢𝗠𝗠𝗨𝗡𝗜𝗧𝗬'));
  if (existing) return existing;
  // New public channels live in our category. The category is staff-only, so everyone is explicitly let in (read only).
  const parent = communityId ? await category(guild, communityId, made) : undefined;
  const c = await guild.channels.create({
    name: unique(guild, name), type: ChannelType.GuildText, topic, reason: 'Community Manager setup', ...(parent ? { parent: parent.id } : {}),
    permissionOverwrites: [
      { id: guild.members.me.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory] },
      ...(parent ? [{ id: guild.roles.everyone.id, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages] }] : []),
    ],
  });
  made.push(`<#${c.id}>`);
  return c;
}

/**
 * The joining channel: visible to the Applicant role only (nobody else, not even @everyone or Members).
 * It is the one channel we create outside the Community Manager category, because its audience is different.
 */
async function applyChannel(guild: any, applicantRoleId: string | undefined, memberRoleId: string | undefined, made: Created) {
  const existing = findChannel(guild, 'apply') || guild.channels.cache.find((c: any) => c.type === ChannelType.GuildText && c.name.includes(APPLY_CHANNEL));
  if (existing) return existing;
  const overwrites: any[] = [
    { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
    { id: guild.members.me.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory] },
  ];
  if (applicantRoleId) overwrites.push({ id: applicantRoleId, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages, P.AddReactions, P.CreatePublicThreads] });
  if (memberRoleId && memberRoleId !== applicantRoleId) overwrites.push({ id: memberRoleId, deny: [P.ViewChannel] });
  const c = await guild.channels.create({
    name: unique(guild, `📝・${APPLY_CHANNEL}`), type: ChannelType.GuildText, reason: 'Community Manager setup: joining channel, Applicant role only',
    topic: 'Press Apply to join. Only new people waiting for approval can see this channel.', permissionOverwrites: overwrites,
  });
  made.push(`<#${c.id}> (Applicant role only)`);
  return c;
}

async function role(guild: any, name: string, color: number, made: Created, key?: keyof typeof PATTERNS, exclude: string[] = []) {
  const existing = (key && findRole(guild, key, exclude)) || guild.roles.cache.find((r: any) => r.name === name && !r.managed && !exclude.includes(r.id));
  if (existing) return existing;
  const r = await guild.roles.create({ name, color, permissions: [], reason: 'Community Manager setup' });
  made.push(`<@&${r.id}> (no permissions)`);
  return r;
}


/** Old look-alike names that earlier setups reused as the newcomer role; these are renamed to the standard name. */
const LOOKALIKE_APPLICANT = /^(pending|unverified|new member|newcomer|guest|new joiner)$/;
export const APPLICANT_ROLE_NAME = 'Applicant';

/**
 * The one standard newcomer role: named exactly "Applicant", no permissions, below the bot.
 * A saved look-alike (e.g. "NEW MEMBER") is renamed in place so its holders keep it; anything else is left alone
 * and a fresh Applicant role is made.
 */
export async function standardApplicant(guild: any, savedId: string | undefined, made: Created) {
  const top = guild.members.me?.roles?.highest?.position ?? 0;
  const usable = (r: any) => r && !r.managed && r.id !== guild.id && r.position < top && !r.permissions.has(P.Administrator);
  const cur = liveRole(guild, savedId) ? guild.roles.cache.get(savedId) : null;
  if (cur && words(cur.name) === 'applicant') return cur;
  if (cur && usable(cur) && LOOKALIKE_APPLICANT.test(words(cur.name))) {
    const was = cur.name;
    await cur.setName(APPLICANT_ROLE_NAME, 'Community Manager setup: standard Applicant role');
    made.push(`<@&${cur.id}> (renamed from "${was}" to the standard Applicant role)`);
    return cur;
  }
  const exact = Array.from(guild.roles.cache.values()).find((r: any) => words(r.name) === 'applicant' && usable(r));
  if (exact) return exact;
  const r = await guild.roles.create({ name: APPLICANT_ROLE_NAME, color: 0xf5a524, permissions: [], reason: 'Community Manager setup: standard Applicant role' });
  made.push(`<@&${r.id}> (no permissions)`);
  return r;
}

export type FeatureKind = 'recruitment' | 'logs' | 'welcome';

/** Which features are switched on for a server (channels are only ever created for these). */
export async function enabledFeatures(communityId: string) {
  const [t, f, w] = await Promise.all([getToolkit(communityId), getFeatures(communityId, true), welcomeOnboardingService.getWelcomeConfig(communityId)]);
  return { recruitment: Boolean(t.recruitment.applyEnabled), logs: Boolean(f.logs.enabled), welcome: Boolean(w.enableServerWelcome) };
}

const NEEDS: Record<FeatureKind, { perms: bigint[]; label: string }> = {
  recruitment: { perms: [P.ManageChannels, P.ManageRoles], label: 'Manage Channels and Manage Roles' },
  logs: { perms: [P.ManageChannels], label: 'Manage Channels' },
  welcome: { perms: [P.ManageChannels], label: 'Manage Channels' },
};

/**
 * Create what one feature needs (reusing channels and roles that already exist, creating only what is missing).
 * Used when the feature is switched on and by the "Create it for me" buttons.
 */
export async function provisionForFeature(communityId: string, kind: FeatureKind): Promise<{ made: Created; errors: string[] }> {
  const { guildFor } = await import('../../services/toolkit/toolkitConfig.js');
  const guild: any = await guildFor(communityId);
  const made: Created = [];
  const errors: string[] = [];
  if (!guild) return { made, errors: ['The bot is not connected to this server right now.'] };
  const need = NEEDS[kind];
  const missing = need.perms.filter((x) => !guild.members.me?.permissions.has(x));
  if (missing.length) return { made, errors: [`The Community Manager role needs ${need.label} (or Administrator) to create this. Give it that in Server Settings → Roles, then try again.`] };
  const steps = kind === 'recruitment' ? ['staff', 'roles', 'apps'] : [kind];
  for (const k of steps) {
    try { await (create as any)[k](guild, communityId, made); } catch (e: any) { errors.push(`${k}: ${e?.message || e}`); }
  }
  return { made, errors };
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
    const applicant = await standardApplicant(guild, g.applicantRoleId, made);
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
    if (!live(guild, r.panelChannelId)) { const gate: any = await (await import('../../services/recruitment/secureGate.service.js')).getGate(communityId); patch.panelChannelId = (await applyChannel(guild, gate.applicantRoleId, gate.memberRoleId, made)).id; patch.panelMessageId = undefined; patch.panelPostedAt = undefined; }
    if (Object.keys(patch).length) { const t = await getToolkit(communityId); await saveToolkit(communityId, { recruitment: { ...t.recruitment, ...patch } }); }
    return made;
  },

  async welcome(guild: any, communityId: string, made: Created = []) {
    const w = await welcomeOnboardingService.getWelcomeConfig(communityId);
    if (!live(guild, w.welcomeChannelId)) {
      const c = await publicChannel(guild, '👋・welcome', 'Welcome to the server!', made, 'welcome', communityId);
      await welcomeOnboardingService.updateWelcomeConfig(communityId, { welcomeChannelId: c.id, welcomeChannelNameSnapshot: c.name });
    }
    return made;
  },

  async logs(guild: any, communityId: string, made: Created = []) {
    const f = await getFeatures(communityId, true);
    if (!live(guild, f.logs.channelId)) {
      // Our own channel inside the Community Manager category; other log channels in the server are left alone.
      const c = await staffChannel(guild, communityId, LOG_CHANNEL_NAME, 'Community Manager log: joins, leaves, edits, deletions, role changes and warnings.', 'serverLog', made);
      await saveFeatures(communityId, { logs: { ...f.logs, channelId: c.id } });
    }
    return made;
  },

  /** Everything for the features that are switched on, in a safe order (reviewers first so the category includes them). */
  async all(guild: any, communityId: string) {
    const made: Created = [];
    const errors: string[] = [];
    const on = await enabledFeatures(communityId);
    const steps = ([...(on.recruitment ? ['staff', 'roles', 'apps'] : []), ...(on.welcome ? ['welcome'] : []), ...(on.logs ? ['logs'] : [])]) as ('staff' | 'roles' | 'apps' | 'welcome' | 'logs')[];
    for (const k of steps) {
      try { await (create as any)[k](guild, communityId, made); } catch (e: any) { errors.push(`${k}: ${e?.message || e}`); }
    }
    try { await renameApplyChannels(guild, communityId); } catch { /* optional */ }
    try { const t = await tidyNames(guild, communityId); if (t.renamed.length) made.push(`emoji added to ${t.renamed.length} channel name${t.renamed.length > 1 ? 's' : ''}`); } catch { /* optional */ }
    return { made, errors };
  },
};

/** Short result line for the wizard footer/note. */
export function createdNote(made: Created, errors: string[] = []) {
  const ok = made.length ? `✅ Created: ${made.join(', ')}` : '✅ Nothing was missing.';
  return errors.length ? `${ok}\n⚠️ ${errors.join('\n⚠️ ')}` : ok;
}

/**
 * Makes sure the server has its own Community Manager log channel, inside the Community Manager category,
 * visible only to the bot, the reviewer roles and roles with real power (Administrator / Manage Server).
 * Used when the bot joins and once for servers it was already in. Anything that already exists is left alone:
 * a channel with this name anywhere in the server is reused, and an existing log setting is not changed.
 */
export async function ensureCommunityLog(communityId: string, guildArg?: any): Promise<{ created: boolean; channelId?: string; skipped?: string }> {
  const { guildFor } = await import('../../services/toolkit/toolkitConfig.js');
  const guild: any = guildArg || await guildFor(communityId);
  if (!guild) return { created: false, skipped: 'not connected' };
  const { communitiesRepository } = await import('../../repositories/index.js');
  if (!(await communitiesRepository.getById(communityId).catch(() => null))) return { created: false, skipped: 'server is not linked to a community' };
  const me = guild.members.me;
  if (!me?.permissions.has(P.ManageChannels)) return { created: false, skipped: 'bot lacks Manage Channels' };
  // Only for servers that switched Server logs on and have no working log channel yet.
  const f0 = await getFeatures(communityId, true);
  if (!f0.logs.enabled) return { created: false, skipped: 'server logs are off' };
  if (live(guild, f0.logs.channelId)) return { created: false, channelId: f0.logs.channelId, skipped: 'a log channel is already set' };
  const t0: any = await getToolkit(communityId);
  const mark = async (extra: any) => { const t = await getToolkit(communityId); await saveToolkit(communityId, { recruitment: { ...t.recruitment, communityLogEnsuredAt: new Date().toISOString(), ...extra } as any }); };

  const wanted = words(LOG_CHANNEL_NAME);
  const existing = Array.from(guild.channels.cache.values()).find((c: any) => c.type === ChannelType.GuildText && words(c.name) === wanted) as any;
  let channel = existing;
  const made: Created = [];
  if (!channel) {
    // A server where we already ran and the owner then deleted the channel keeps it deleted.
    if (t0.recruitment?.communityLogEnsuredAt) return { created: false, skipped: 'already handled earlier' };
    const cat = await category(guild, communityId, made);
    const reviewers: string[] = (t0.recruitment?.reviewerRoleIds || []).filter((r: string) => liveRole(guild, r));
    const powerful = Array.from(guild.roles.cache.values())
      .filter((r: any) => r.id !== guild.id && !r.managed && (r.permissions.has(P.Administrator) || r.permissions.has(P.ManageGuild)))
      .map((r: any) => r.id);
    const staff = Array.from(new Set([...reviewers, ...powerful])).slice(0, 25);
    const base = [
      { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
      { id: me.id, allow: BOT_PERMS },
    ];
    const withStaff = [...base, ...staff.map((id) => ({ id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] }))];
    const make = (overwrites: any[]) => guild.channels.create({
      name: unique(guild, LOG_CHANNEL_NAME), type: ChannelType.GuildText, parent: cat.id, reason: 'Community Manager: own log channel',
      topic: 'Community Manager log: joins, leaves, edits, deletions, role changes and warnings. Staff only.', permissionOverwrites: overwrites,
    });
    channel = await make(withStaff).catch(() => make(base)); // retry with only the bot if a role could not be added
    await postIntro(channel, 'serverLog');
  }
  const f = await getFeatures(communityId, true);
  await saveFeatures(communityId, { logs: { ...f.logs, channelId: channel.id } });
  await mark({ communityLogChannelId: channel.id });
  return { created: !existing, channelId: channel.id };
}

/**
 * Runs when the bot joins a server. It no longer creates anything: features start switched off.
 * what is missing, then post a short summary in the server log so the owner sees what happened.
 */
export async function autoProvisionOnJoin(communityId: string) {
  // Nothing is created automatically any more: every feature starts switched off, and its channels and roles are
  // created when the feature is switched on (or from its "Create it for me" button). Just remember the bot has joined.
  const t = await getToolkit(communityId);
  if ((t.recruitment as any).autoProvisionedAt) return;
  await saveToolkit(communityId, { recruitment: { ...t.recruitment, autoProvisionedAt: new Date().toISOString() } as any });
}
