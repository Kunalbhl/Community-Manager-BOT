/**
 * Server growth reports: joins, leaves, net growth, who stayed, top inviters and applications,
 * sent weekly / every two weeks / monthly to a channel (optionally pinging roles), to members of
 * roles by DM, or to chosen members by DM.
 */
import { FirestoreRepository } from '../../repositories/firestore.repository.js';
import { allMembers } from '../../integrations/discord/memberFetch.js';
import { guildFor, isSnowflake, communityForGuild } from '../toolkit/toolkitConfig.js';
import { logger } from '../../logging/logger.js';

const flowRepository = new FirestoreRepository<any>('memberFlow');
const settingsRepository = new FirestoreRepository<any>('growthReportSettings');
const DAY = 86_400_000;
const PERIOD_DAYS: Record<string, number> = { WEEKLY: 7, BIWEEKLY: 14, MONTHLY: 30 };

export interface ReportSettings {
  enabled: boolean;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  weekday: number; // 0 = Sunday (weekly / every two weeks)
  monthDay: number; // 1-28 (monthly)
  hour: number; // in timezone
  timezone: string;
  channelId: string;
  pingRoleIds: string[];
  dmRoleIds: string[];
  dmUserIds: string[];
  lastSentAt?: string;
  lastResult?: string;
}

const DEFAULTS: ReportSettings = { enabled: false, frequency: 'WEEKLY', weekday: 1, monthDay: 1, hour: 10, timezone: 'Asia/Kolkata', channelId: '', pingRoleIds: [], dmRoleIds: [], dmUserIds: [] };
const ids = (v: any) => (Array.isArray(v) ? v : []).filter(isSnowflake).slice(0, 25);

/** Parts of "now" in a time zone. */
function zoned(tz: string, d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', weekday: 'short' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { day: Number(p.day), hour: Number(p.hour) % 24, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}

export const growthReports = {
  /* --- tracking (from now on every join / leave is kept) --- */
  async track(guildId: string, userId: string, type: 'JOIN' | 'LEAVE', isBot: boolean) {
    const communityId = await communityForGuild(guildId).catch(() => null);
    if (!communityId) return;
    await flowRepository.create({ communityId, userId, type, bot: isBot, at: new Date().toISOString() }).catch(() => undefined);
  },

  async get(communityId: string): Promise<ReportSettings> {
    const s = await settingsRepository.getById(communityId).catch(() => null);
    return { ...DEFAULTS, ...(s || {}) };
  },

  async save(communityId: string, b: any): Promise<ReportSettings> {
    const cur = await this.get(communityId);
    const tz = (() => { try { Intl.DateTimeFormat('en-US', { timeZone: String(b.timezone) }); return String(b.timezone); } catch { return cur.timezone; } })();
    const next: ReportSettings = {
      ...cur,
      enabled: !!b.enabled,
      frequency: ['WEEKLY', 'BIWEEKLY', 'MONTHLY'].includes(b.frequency) ? b.frequency : 'WEEKLY',
      weekday: Math.max(0, Math.min(6, Math.round(Number(b.weekday) || 0))),
      monthDay: Math.max(1, Math.min(28, Math.round(Number(b.monthDay) || 1))),
      hour: Math.max(0, Math.min(23, Math.round(Number(b.hour) || 0))),
      timezone: tz,
      channelId: isSnowflake(b.channelId) ? b.channelId : '',
      pingRoleIds: ids(b.pingRoleIds), dmRoleIds: ids(b.dmRoleIds), dmUserIds: ids(b.dmUserIds),
    };
    if (next.enabled && !next.channelId && !next.dmRoleIds.length && !next.dmUserIds.length) throw new Error('Pick where to send it: a channel, roles to DM, or members to DM.');
    const exists = await settingsRepository.getById(communityId).catch(() => null);
    if (exists) await settingsRepository.update(communityId, next as any); else await settingsRepository.create(communityId, { ...next, communityId } as any);
    return next;
  },

  /** Numbers for the last N days. */
  async build(communityId: string, days: number) {
    const guild: any = await guildFor(communityId);
    if (!guild) throw new Error('The bot is not connected to this server right now.');
    const since = Date.now() - days * DAY;
    const flow = (await flowRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] }).catch(() => [] as any[]))
      .filter((f: any) => Date.parse(f.at) >= since && !f.bot);
    await allMembers(guild).catch(() => undefined);
    // Joins: tracked joins, or (before tracking started) members whose join date is in the period.
    const trackedJoins = new Set(flow.filter((f: any) => f.type === 'JOIN').map((f: any) => f.userId));
    const stillHereRecent = guild.members.cache.filter((m: any) => !m.user.bot && (m.joinedTimestamp || 0) >= since);
    for (const m of stillHereRecent.values()) trackedJoins.add(m.id);
    const joins = trackedJoins.size;
    const leaves = new Set(flow.filter((f: any) => f.type === 'LEAVE').map((f: any) => f.userId)).size;
    const stayed = [...trackedJoins].filter((id) => guild.members.cache.has(id)).length;
    const members = guild.members.cache.filter((m: any) => !m.user.bot).size || guild.memberCount;
    const start = Math.max(1, members - (joins - leaves));
    // Top inviters from recruiter records in the period.
    const { inviteRewards } = await import('../rewards/inviteRewards.service.js');
    const recs = (await inviteRewards.records(communityId).catch(() => [] as any[])).filter((r: any) => Date.parse(r.joinedAt || r.recruitmentSuccessfulAt || '') >= since && /^\d{15,22}$/.test(String(r.recruiterDiscordUserId || '')));
    const counts = new Map<string, number>();
    for (const r of recs) counts.set(r.recruiterDiscordUserId, (counts.get(r.recruiterDiscordUserId) || 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    // Applications in the period.
    const { applicationsRepository } = await import('../../repositories/index.js');
    const apps = (await (applicationsRepository as any).listForTenant(communityId).catch(() => [])).filter((a: any) => Date.parse(a.createdAt) >= since);
    const approved = apps.filter((a: any) => ['APPROVED', 'ACCEPTED'].includes(a.status)).length;
    const rejected = apps.filter((a: any) => a.status === 'REJECTED').length;
    return { guild, days, joins, leaves, net: joins - leaves, stayed, members, growthPct: ((joins - leaves) / start) * 100, top, apps: apps.length, approved, rejected, trackingSince: flow.length ? null : true };
  },

  embed(d: Awaited<ReturnType<typeof growthReports.build>>) {
    const label = d.days === 7 ? 'Weekly' : d.days === 14 ? 'Two-week' : 'Monthly';
    const sign = (n: number) => (n > 0 ? `+${n}` : String(n));
    const retention = d.joins ? Math.round((d.stayed / d.joins) * 100) : 0;
    const bar = (pct: number) => '▰'.repeat(Math.round(pct / 10)) + '▱'.repeat(10 - Math.round(pct / 10));
    const icon = d.guild.iconURL?.({ size: 256 });
    return {
      author: { name: d.guild.name, icon_url: icon || undefined },
      title: `📊 ${label} server report`,
      description: `Growth over the last **${d.days} days** · <t:${Math.floor((Date.now() - d.days * DAY) / 1000)}:D> → <t:${Math.floor(Date.now() / 1000)}:D>`,
      color: d.net >= 0 ? 0x22c55e : 0xef4444,
      thumbnail: icon ? { url: icon } : undefined,
      fields: [
        { name: '📥 Joined', value: `**${sign(d.joins)}**`, inline: true },
        { name: '📤 Left', value: `**-${d.leaves}**`, inline: true },
        { name: d.net >= 0 ? '📈 Net growth' : '📉 Net growth', value: `**${sign(d.net)}** (${d.growthPct >= 0 ? '+' : ''}${d.growthPct.toFixed(1)}%)`, inline: true },
        { name: '👥 Members now', value: `**${d.members}**`, inline: true },
        { name: '🧲 Still here', value: d.joins ? `${d.stayed}/${d.joins} · ${retention}%\n${bar(retention)}` : '—', inline: true },
        { name: '📝 Applications', value: d.apps ? `${d.apps} · ✅ ${d.approved} · ✖️ ${d.rejected}` : 'None', inline: true },
        { name: '🏆 Top inviters', value: d.top.length ? d.top.map(([id, n], i) => `${['🥇', '🥈', '🥉', '4.', '5.'][i]} <@${id}> · **${n}** invite${n === 1 ? '' : 's'}`).join('\n') : 'No tracked invites in this period.' },
      ],
      footer: { text: 'Community Manager · server report' },
      timestamp: new Date().toISOString(),
    };
  },

  /** Build and deliver now. Returns a short result line. */
  async send(communityId: string, override?: Partial<ReportSettings>) {
    const s = { ...(await this.get(communityId)), ...(override || {}) };
    const d = await this.build(communityId, PERIOD_DAYS[s.frequency] || 7);
    const embed = this.embed(d);
    const guild = d.guild;
    const out: string[] = [];
    if (s.channelId) {
      const ch: any = guild.channels.cache.get(s.channelId);
      const pings = s.pingRoleIds.filter((r) => guild.roles.cache.has(r));
      if (!ch?.send) out.push('channel missing');
      else await ch.send({ content: pings.length ? pings.map((r) => `<@&${r}>`).join(' ') : undefined, embeds: [embed], allowedMentions: { roles: pings, users: [] } })
        .then(() => out.push(`posted in #${ch.name}`)).catch((e: any) => out.push(`could not post in #${ch.name}: ${e?.message}`));
    }
    const dmTo = new Set<string>(s.dmUserIds);
    for (const r of s.dmRoleIds) for (const m of guild.roles.cache.get(r)?.members.values() || []) if (!m.user.bot) dmTo.add(m.id);
    let ok = 0, fail = 0;
    for (const id of [...dmTo].slice(0, 100)) {
      const m = guild.members.cache.get(id) || await guild.members.fetch(id).catch(() => null);
      if (!m) { fail++; continue; }
      await m.send({ embeds: [embed] }).then(() => ok++).catch(() => fail++);
    }
    if (dmTo.size) out.push(`DM sent to ${ok}${fail ? `, ${fail} have DMs closed` : ''}`);
    const result = out.join(' · ') || 'nowhere to send';
    return { result, report: { joins: d.joins, leaves: d.leaves, net: d.net, members: d.members } };
  },

  /** Every minute: send reports that are due (once per period, at the chosen day and hour). */
  async tick() {
    const all = await settingsRepository.list({}).catch(() => [] as any[]);
    for (const raw of all as any[]) {
      const s: ReportSettings = { ...DEFAULTS, ...raw };
      if (!s.enabled) continue;
      const days = PERIOD_DAYS[s.frequency] || 7;
      if (s.lastSentAt && Date.now() - Date.parse(s.lastSentAt) < (days - 0.5) * DAY) continue;
      const z = zoned(s.timezone);
      const dayOk = s.frequency === 'MONTHLY' ? z.day === s.monthDay : z.weekday === s.weekday;
      if (!dayOk || z.hour !== s.hour) continue;
      const communityId = raw.communityId || raw.id;
      await settingsRepository.update(raw.id, { lastSentAt: new Date().toISOString() } as any).catch(() => undefined);
      const r = await this.send(communityId).catch((e: any) => ({ result: `failed: ${e?.message}` }));
      await settingsRepository.update(raw.id, { lastResult: r.result } as any).catch(() => undefined);
      logger.info(`[GrowthReports] ${communityId}: ${r.result}`);
    }
  },
};
