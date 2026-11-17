/**
 * Workspace setup: scans the server and wires Community Manager into what already exists
 * (staff roles, log channels, application/staff channels). Anything missing is created inside
 * one private "Community Manager" category that only staff can see. Existing settings are never
 * overwritten, so running it again is safe.
 */
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { logger } from '../logging/logger.js';
import { getToolkit, saveToolkit, guildFor } from './toolkit/toolkitConfig.js';
import { getFeatures, saveFeatures } from './features/featuresConfig.js';

// Real moderation powers only. Manage Messages alone is not enough: music/DJ and bot roles often have it.
const STAFF_PERMS = [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers];
const NOT_STAFF_NAME = /\b(dj|music|bots?|muted?|verified|members?|vip|booster|nitro)\b/i;

/** Category name: emoji + bold letters so it stands out in the channel list. */
export const CM_CATEGORY_NAME = '💠 𝗖𝗢𝗠𝗠𝗨𝗡𝗜𝗧𝗬 𝗠𝗔𝗡𝗔𝗚𝗘𝗥';
export const isCmCategory = (c: any) => c.type === ChannelType.GuildCategory && (c.name === CM_CATEGORY_NAME || c.name.toLowerCase() === 'community manager');

/** First message in every channel the bot creates: why it exists and how it is used. */
export const INTROS: Record<string, { title: string; body: string }> = {
  applications: { title: '📥 Application reviews', body: 'Created by **Community Manager** for staff.\n\n• Every new application appears here with the applicant’s answers and quiz score.\n• Press **Approve** or **Reject**, or open it in the dashboard.\n• Each application also gets a private staff thread for discussion and escalation.\n\nOnly staff can see this channel.' },
  recruitmentLog: { title: '📋 Recruitment log', body: 'Created by **Community Manager** as a permanent record.\n\n• Every application, screening result and decision is logged here.\n• Recruiter credit is recorded when a new member joins with a code.\n\nNothing needs to be done here; it is the history you can search later. Only staff can see this channel.' },
  serverLog: { title: '🧾 Server log', body: 'Created by **Community Manager** to keep the server accountable.\n\n• Joins and leaves, edited and deleted messages, role changes and warnings are recorded here.\n\nUse it to check what happened and when. Only staff can see this channel.' },
};

export async function postIntro(ch: any, key: string) {
  const intro = INTROS[key];
  if (!intro || !ch?.send) return;
  try {
    const msg = await ch.send({ embeds: [{ title: intro.title, description: intro.body, color: 0x7c8cff, footer: { text: 'Community Manager · you can rename or move this channel any time' } }] });
    await msg.pin().catch(() => undefined);
  } catch { /* the channel still works without the intro */ }
}

/** Keep our category easy to find: bold name and at the top of the channel list (owners can move it later). */
async function brandCategory(category: any) {
  try {
    if (category.name !== CM_CATEGORY_NAME) await category.setName(CM_CATEGORY_NAME, 'Community Manager: clearer category name');
  } catch { /* missing Manage Channels on it */ }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ');

export interface WorkspaceReport {
  staffRoles: string[];
  used: { purpose: string; channel: string; created: boolean }[];
  categoryCreated: boolean;
  notes: string[];
}

export const workspace = {
  async provision(communityId: string): Promise<WorkspaceReport> {
    const guild = await guildFor(communityId);
    if (!guild) throw new Error('The bot is not connected to this server right now.');
    const me = guild.members.me;
    const everyone = guild.roles.everyone;
    const report: WorkspaceReport = { staffRoles: [], used: [], categoryCreated: false, notes: [] };

    // 1. Staff roles = roles that can moderate (not bots/integrations).
    const staffRoles = Array.from(guild.roles.cache.values())
      .filter((r: any) => r.id !== guild.id && !r.managed && !NOT_STAFF_NAME.test(r.name) && STAFF_PERMS.some((p) => r.permissions.has(p))
        && !(r.members.size > 0 && r.members.every((m: any) => m.user.bot)))
      .sort((a: any, b: any) => b.position - a.position) as any[];
    report.staffRoles = staffRoles.map((r) => r.name);

    // 2. Find existing private (staff-only) text channels by purpose.
    const text = Array.from(guild.channels.cache.values()).filter((c: any) => c.type === ChannelType.GuildText) as any[];
    const isPrivate = (c: any) => !c.permissionsFor(everyone)?.has(PermissionFlagsBits.ViewChannel);
    const find = (re: RegExp) => text.find((c) => isPrivate(c) && re.test(norm(c.name)));

    const purposes: { key: 'applications' | 'recruitmentLog' | 'serverLog'; label: string; re: RegExp; name: string; topic: string }[] = [
      { key: 'applications', label: 'Application reviews', re: /\b(application|applications|apply review|recruit review|review)\b/, name: '📥・applications', topic: 'New applications with Approve / Reject. Staff only.' },
      { key: 'recruitmentLog', label: 'Recruitment log', re: /\b(recruit\w* (log|record)s?|application logs?)\b/, name: '📋・recruitment-log', topic: 'Every application, screening result, decision and recruiter credit.' },
      { key: 'serverLog', label: 'Server log', re: /\b(server logs?|mod logs?|modlogs?|audit|logs?)\b/, name: '🧾・server-log', topic: 'Joins, leaves, edits, deletions, role changes and warnings.' },
    ];

    let category: any = guild.channels.cache.find(isCmCategory) || null;
    if (category) await brandCategory(category);
    const ensureCategory = async () => {
      if (category) return category;
      category = await guild.channels.create({
        name: CM_CATEGORY_NAME,
        type: ChannelType.GuildCategory,
        position: 0,
        reason: 'Community Manager workspace',
        permissionOverwrites: [
          { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageThreads, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.ReadMessageHistory] },
          ...staffRoles.slice(0, 20).map((r) => ({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] })),
        ],
      });
      report.categoryCreated = true;
      await category.setPosition(0, { reason: 'Community Manager: keep the workspace easy to find' }).catch(() => undefined);
      return category;
    };

    const chosen: Record<string, string> = {};
    for (const p of purposes) {
      const existing = find(p.re);
      if (existing && !Object.values(chosen).includes(existing.id)) {
        chosen[p.key] = existing.id;
        report.used.push({ purpose: p.label, channel: existing.name, created: false });
        continue;
      }
      const inCat = category && text.find((c) => c.parentId === category.id && c.name === p.name);
      if (inCat) { chosen[p.key] = inCat.id; report.used.push({ purpose: p.label, channel: inCat.name, created: false }); continue; }
      try {
        const parent = await ensureCategory();
        const { uniqueName } = await import('../integrations/discord/channelEmoji.js');
        const ch = await guild.channels.create({ name: uniqueName(guild, p.name), type: ChannelType.GuildText, parent: parent.id, topic: p.topic, reason: 'Community Manager workspace' });
        chosen[p.key] = ch.id;
        report.used.push({ purpose: p.label, channel: ch.name, created: true });
        await postIntro(ch, p.key);
      } catch (err: any) {
        report.notes.push(`Could not create a ${p.label.toLowerCase()} channel: ${err?.message}`);
      }
    }

    // 3. Wire settings (only where nothing is set yet).
    const t = await getToolkit(communityId);
    const staffIds = staffRoles.slice(0, 10).map((r) => r.id);
    const rec = { ...t.recruitment };
    if (!rec.reviewChannelId && chosen.applications) rec.reviewChannelId = chosen.applications;
    if (!rec.logChannelId && chosen.recruitmentLog) rec.logChannelId = chosen.recruitmentLog;
    if (!rec.reviewerRoleIds.length) rec.reviewerRoleIds = staffIds;
    const rooms = { ...t.reviewRooms };
    if (!rooms.categoryId && category) rooms.categoryId = category.id;
    if (!rooms.tiers.some((x) => x.roleIds.length) && staffRoles.length) {
      const low = staffRoles.filter((r) => !r.permissions.has(PermissionFlagsBits.Administrator)).map((r) => r.id);
      const admins = staffRoles.filter((r) => r.permissions.has(PermissionFlagsBits.Administrator)).map((r) => r.id);
      rooms.tiers = [
        { name: 'Interviewers', roleIds: (low.length ? low : admins).slice(-3) },
        { name: 'Senior staff', roleIds: low.slice(0, 2) },
        { name: 'Leadership', roleIds: admins.slice(0, 3) },
      ];
    }
    const tickets = { ...t.tickets };
    if (!tickets.logChannelId && chosen.serverLog) tickets.logChannelId = chosen.serverLog;
    if (!tickets.staffRoleIds.length) tickets.staffRoleIds = staffIds;
    await saveToolkit(communityId, { recruitment: rec, reviewRooms: rooms, tickets });

    const f = await getFeatures(communityId, true);
    if (!f.logs.channelId && chosen.serverLog) await saveFeatures(communityId, { logs: { ...f.logs, channelId: chosen.serverLog } });

    // Roles picked by an older version that are not really staff (e.g. DJ / music roles) are removed.
    try {
      const real = new Set(staffRoles.map((r) => r.id));
      const isWrong = (id: string) => { const r: any = guild.roles.cache.get(id); return r && !real.has(id) && (NOT_STAFF_NAME.test(r.name) || !STAFF_PERMS.some((p) => r.permissions.has(p))); };
      const t2 = await getToolkit(communityId);
      const clean = (ids: string[]) => ids.filter((id) => !isWrong(id));
      const removed = [...t2.recruitment.reviewerRoleIds, ...t2.tickets.staffRoleIds, ...t2.reviewRooms.tiers.flatMap((x) => x.roleIds)].filter(isWrong);
      if (removed.length) {
        await saveToolkit(communityId, {
          recruitment: { ...t2.recruitment, reviewerRoleIds: clean(t2.recruitment.reviewerRoleIds) },
          tickets: { ...t2.tickets, staffRoleIds: clean(t2.tickets.staffRoleIds) },
          reviewRooms: { ...t2.reviewRooms, tiers: t2.reviewRooms.tiers.map((x) => ({ ...x, roleIds: clean(x.roleIds) })) },
        });
        report.notes.push(`Removed roles that are not staff: ${Array.from(new Set(removed)).map((id) => guild.roles.cache.get(id)?.name).join(', ')}`);
      }
    } catch { /* best effort */ }

    logger.info(`[Workspace] ${guild.name}: staff roles ${report.staffRoles.length}, channels ${report.used.map((u) => `${u.purpose}=${u.channel}${u.created ? ' (new)' : ''}`).join(', ')}`);
    return report;
  },
};

/**
 * One-time tidy-up for servers set up before: bold category name, move it to the top once,
 * and post the purpose message in our channels that never had one.
 */
export async function refreshWorkspaceLook(communityId: string): Promise<void> {
  const guild: any = await guildFor(communityId);
  if (!guild) return;
  const t: any = await getToolkit(communityId);
  if (t.recruitment.workspaceLookVersion === 1) return;
  await workspace.provision(communityId).catch(() => undefined); // also removes non-staff roles picked earlier
  const category: any = guild.channels.cache.find(isCmCategory);
  if (category) {
    await brandCategory(category);
    await category.setPosition(0, { reason: 'Community Manager: keep the workspace easy to find' }).catch(() => undefined);
    const keys: Record<string, string> = { '📥・applications': 'applications', '📋・recruitment-log': 'recruitmentLog', '🧾・server-log': 'serverLog' };
    for (const ch of guild.channels.cache.filter((c: any) => c.parentId === category.id && keys[c.name]).values()) {
      const recent = await ch.messages.fetch({ limit: 50 }).catch(() => null);
      const hasIntro = recent?.some((m: any) => m.author.id === guild.members.me.id && m.embeds?.[0]?.footer?.text?.startsWith('Community Manager'));
      if (!hasIntro) await postIntro(ch, keys[ch.name]);
    }
  }
  await saveToolkit(communityId, { recruitment: { ...t.recruitment, workspaceLookVersion: 1 } } as any);
}
