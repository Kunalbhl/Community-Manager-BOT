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

const STAFF_PERMS = [PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages];

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
      .filter((r: any) => r.id !== guild.id && !r.managed && STAFF_PERMS.some((p) => r.permissions.has(p)))
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

    let category: any = guild.channels.cache.find((c: any) => c.type === ChannelType.GuildCategory && c.name === 'Community Manager') || null;
    const ensureCategory = async () => {
      if (category) return category;
      category = await guild.channels.create({
        name: 'Community Manager',
        type: ChannelType.GuildCategory,
        reason: 'Community Manager workspace',
        permissionOverwrites: [
          { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageThreads, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.ReadMessageHistory] },
          ...staffRoles.slice(0, 20).map((r) => ({ id: r.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] })),
        ],
      });
      report.categoryCreated = true;
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
        const ch = await guild.channels.create({ name: p.name, type: ChannelType.GuildText, parent: parent.id, topic: p.topic, reason: 'Community Manager workspace' });
        chosen[p.key] = ch.id;
        report.used.push({ purpose: p.label, channel: ch.name, created: true });
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

    logger.info(`[Workspace] ${guild.name}: staff roles ${report.staffRoles.length}, channels ${report.used.map((u) => `${u.purpose}=${u.channel}${u.created ? ' (new)' : ''}`).join(', ')}`);
    return report;
  },
};
