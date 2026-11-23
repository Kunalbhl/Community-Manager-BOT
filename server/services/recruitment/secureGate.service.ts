/**
 * Secure Setup: makes the server "closed by default" before recruitment runs.
 *
 * Bots cannot read or change Discord's own "Apply to Join" switch, so instead the server is locked
 * with plain Discord permissions, which keep working even if the bot is offline (fail-safe):
 *   - new joiners (only @everyone) see just the public channels the owner picks (welcome, rules, apply)
 *   - everything else is visible to the Member role only
 *   - all current members get the Member role first, so nobody loses access
 *   - the previous permissions are saved, and Undo restores them exactly
 * Recruitment cannot start until the owner confirms Apply to Join is off and the scan shows no leaks.
 */
import { isObfuscated } from '../../integrations/discord/channelAccess.js';
import { PermissionFlagsBits, ChannelType } from 'discord.js';
import { logger } from '../../logging/logger.js';
import { FirestoreRepository } from '../../repositories/firestore.repository.js';
import { guildFor, isSnowflake } from '../toolkit/toolkitConfig.js';

export interface GateDoc {
  id: string; // communityId
  communityId: string;
  verified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
  nativeApplyOffConfirmed: boolean;
  memberRoleId?: string;
  applicantRoleId?: string;
  /** More roles given on approval, besides the Member role (e.g. a starter role). */
  approvedExtraRoleIds?: string[];
  publicChannelIds: string[];
  snapshot?: { channelId: string; overwrites: { id: string; type: number; allow: string; deny: string }[] }[];
  snapshotAt?: string;
  job?: { status: 'RUNNING' | 'DONE' | 'FAILED' | 'UNDONE'; step: string; done: number; total: number; error?: string; at: string };
  lastCheck?: { at: string; leaks: { id: string; name: string }[] };
  lastAlertKey?: string;
  updatedAt: string;
}

export const gateRepository = new FirestoreRepository<GateDoc>('secureGates');

const VISIBLE_TYPES = new Set([ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildStageVoice, ChannelType.GuildMedia, ChannelType.GuildCategory]);

export async function getGate(communityId: string): Promise<GateDoc> {
  const g = await gateRepository.getById(communityId).catch(() => null);
  return g || { id: communityId, communityId, verified: false, nativeApplyOffConfirmed: false, publicChannelIds: [], updatedAt: new Date().toISOString() };
}
async function saveGate(communityId: string, patch: Partial<GateDoc>): Promise<GateDoc> {
  const cur = await getGate(communityId);
  const next = { ...cur, ...patch, id: communityId, communityId, updatedAt: new Date().toISOString() } as GateDoc;
  const exists = await gateRepository.getById(communityId).catch(() => null);
  if (exists) await gateRepository.update(communityId, next as any);
  else await gateRepository.create(communityId, next as any);
  return next;
}

/** Channels a brand-new joiner (only @everyone) can see right now. */
function newcomerVisible(guild: any) {
  const everyone = guild.roles.everyone;
  return Array.from(guild.channels.cache.values())
    .filter((c: any) => VISIBLE_TYPES.has(c.type) && c.type !== ChannelType.GuildCategory && !isObfuscated(c))
    .filter((c: any) => c.permissionsFor(everyone)?.has(PermissionFlagsBits.ViewChannel))
    .sort((a: any, b: any) => a.rawPosition - b.rawPosition)
    .map((c: any) => ({ id: c.id, name: c.name, type: c.type, parent: c.parent?.name || null }));
}

/** Stats counter channels (Members, Bots, Followers...) are meant to be seen by everyone, so they are not leaks. */
async function statChannelIds(communityId: string): Promise<Set<string>> {
  try {
    const { statCountersRepository } = await import('../features/serverStats.service.js');
    const rows = await statCountersRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] });
    return new Set(rows.map((r: any) => String(r.channelId)));
  } catch { return new Set(); }
}

export const secureGate = {
  async status(communityId: string) {
    const gate = await getGate(communityId);
    const guild = await guildFor(communityId);
    if (!guild) return { gate, connected: false, visible: [], leaks: [], botOk: false, problems: ['The bot is not connected to this server.'] };
    const visible = newcomerVisible(guild);
    const statIds = await statChannelIds(communityId);
    const leaks = visible.filter((c) => !gate.publicChannelIds.includes(c.id) && !statIds.has(c.id));
    const me = guild.members.me;
    const problems: string[] = [];
    if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) problems.push('The bot needs the **Manage Roles** permission.');
    if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) problems.push('The bot needs the **Manage Channels** permission.');
    const memberRole = gate.memberRoleId ? guild.roles.cache.get(gate.memberRoleId) : null;
    if (memberRole && me && memberRole.position >= me.roles.highest.position) problems.push(`Move the bot’s role above **${memberRole.name}** (Server Settings → Roles).`);
    if (/Missing Permissions/i.test(gate.job?.error || '') && !me?.permissions.has(PermissionFlagsBits.Administrator)) {
      problems.push('Discord blocked some channel changes. Give **Community Manager** the **Administrator** permission (Server Settings → Roles), run Lock again, then you may remove it.');
    }
    const humans = guild.members.cache.filter((m: any) => !m.user.bot).size;
    return { gate, connected: true, visible, leaks, problems, memberCount: guild.memberCount, cachedHumans: humans, botOk: problems.length === 0 };
  },

  /** Lock the server. Runs in the background; progress is saved on the gate document. */
  async lock(communityId: string, params: { memberRoleId?: string; createMemberRole?: boolean; publicChannelIds: string[]; actorId: string }) {
    const guild = await guildFor(communityId);
    if (!guild) throw new Error('The bot is not connected to this server right now.');
    const me = guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageRoles) || !me?.permissions.has(PermissionFlagsBits.ManageChannels)) throw new Error('Give the bot Manage Roles and Manage Channels first.');
    const publicIds = params.publicChannelIds.filter((id) => isSnowflake(id) && guild.channels.cache.has(id));
    if (!publicIds.length) throw new Error('Choose at least one public channel (for example welcome or apply).');
    // Discord Onboarding channels must stay readable by everyone; keep them public instead of failing.
    const onboarding: any = await (guild as any).fetchOnboarding?.().catch(() => null);
    for (const id of (onboarding?.enabled ? onboarding.defaultChannels?.keys?.() || [] : [])) if (!publicIds.includes(id)) publicIds.push(id);
    const cur = await getGate(communityId);
    if (cur.job?.status === 'RUNNING') throw new Error('Secure Setup is already running.');

    let memberRole: any = params.memberRoleId ? guild.roles.cache.get(params.memberRoleId) : null;
    if (!memberRole && params.createMemberRole) memberRole = await guild.roles.create({ name: 'Member', reason: 'Community Manager Secure Setup', permissions: [] });
    if (!memberRole) throw new Error('Choose the Member role (or let the bot create one).');
    if (memberRole.managed || memberRole.id === guild.id) throw new Error('That role cannot be used as the Member role.');
    if (memberRole.position >= me.roles.highest.position) throw new Error(`Move the bot’s role above “${memberRole.name}” first (Server Settings → Roles).`);
    let applicantRole: any = cur.applicantRoleId ? guild.roles.cache.get(cur.applicantRoleId) : null;
    if (!applicantRole) applicantRole = guild.roles.cache.find((r: any) => r.name === 'Applicant') || (await guild.roles.create({ name: 'Applicant', reason: 'Community Manager Secure Setup', permissions: [] }));

    // Snapshot every channel's permissions first (Undo restores these exactly).
    const snapshot = Array.from(guild.channels.cache.values()).filter((c: any) => c.permissionOverwrites && !isObfuscated(c)).map((c: any) => ({
      channelId: c.id,
      overwrites: Array.from(c.permissionOverwrites.cache.values()).map((o: any) => ({ id: o.id, type: o.type, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() })),
    }));
    await saveGate(communityId, {
      memberRoleId: memberRole.id, applicantRoleId: applicantRole.id, publicChannelIds: publicIds, snapshot, snapshotAt: new Date().toISOString(),
      verified: false, job: { status: 'RUNNING', step: 'Giving the Member role to current members', done: 0, total: 0, at: new Date().toISOString() },
    });

    const errors = new Set<string>();
    const note = (where: string) => (err: any) => { if (errors.size < 4) errors.add(`${where}: ${err?.message || err}`); };
    void (async () => {
      try {
        // 1. Every current human member gets the Member role (nobody loses access).
        const members = await guild.members.fetch();
        const todo = Array.from(members.values()).filter((m: any) => !m.user.bot && !m.roles.cache.has(memberRole.id));
        let done = 0;
        for (const m of todo as any[]) {
          await m.roles.add(memberRole.id, 'Secure Setup: existing member keeps access').catch(note(`role for ${m.user?.username}`));
          done++;
          if (done % 10 === 0) await saveGate(communityId, { job: { status: 'RUNNING', step: 'Giving the Member role to current members', done, total: todo.length, at: new Date().toISOString() } });
        }
        // 2. Hide everything except the public channels from newcomers; Member keeps access.
        const channels = Array.from(guild.channels.cache.values()).filter((c: any) => VISIBLE_TYPES.has(c.type)) as any[];
        const everyone = guild.roles.everyone;
        const keptForOnboarding: string[] = [];
        let i = 0;
        for (const c of channels) {
          i++;
          const isPublic = publicIds.includes(c.id);
          if (isPublic) {
            await c.permissionOverwrites.edit(everyone, { ViewChannel: true }, { reason: 'Secure Setup: public channel' }).catch(note(`#${c.name}`));
            continue;
          }
          // Children of a public category stay hidden unless they are public themselves.
          if (c.permissionsFor(everyone)?.has(PermissionFlagsBits.ViewChannel) || c.type === ChannelType.GuildCategory) {
            const memberCanSee = c.permissionsFor(memberRole)?.has(PermissionFlagsBits.ViewChannel);
            const hidden = await c.permissionOverwrites.edit(everyone, { ViewChannel: false }, { reason: 'Secure Setup: hidden from newcomers' }).then(() => true).catch((e: any) => {
              // Discord forces Onboarding channels to stay readable by everyone: keep it public instead of failing.
              if (/onboarding/i.test(e?.message || '')) { publicIds.push(c.id); keptForOnboarding.push(c.name); return false; }
              note(`#${c.name}`)(e); return false;
            });
            if (!hidden && publicIds.includes(c.id)) continue;
            if (memberCanSee !== false) await c.permissionOverwrites.edit(memberRole, { ViewChannel: true }, { reason: 'Secure Setup: members keep access' }).catch(note(`#${c.name} (member)`));
          }
          if (i % 10 === 0) await saveGate(communityId, { job: { status: 'RUNNING', step: 'Locking channels', done: i, total: channels.length, at: new Date().toISOString() } });
        }
        // Public channels inside a now-hidden category: make sure they stay visible.
        for (const id of publicIds) await (guild.channels.cache.get(id) as any)?.permissionOverwrites.edit(everyone, { ViewChannel: true }).catch(() => undefined);

        const leaks = newcomerVisible(guild).filter((c) => !publicIds.includes(c.id));
        await saveGate(communityId, {
          publicChannelIds: publicIds,
          job: { status: leaks.length ? 'FAILED' : 'DONE', step: leaks.length ? `${leaks.length} channel(s) are still visible to newcomers` : `Server locked${keptForOnboarding.length ? `. Kept public because Discord Onboarding uses them: ${keptForOnboarding.map((n) => '#' + n).join(', ')}` : ''}`, done: channels.length, total: channels.length, at: new Date().toISOString(), error: leaks.length ? `${errors.size ? `Discord said: ${[...errors].join(' | ')}. ` : ''}Still visible: ${leaks.map((l) => l.name).join(', ')}` : undefined },
          lastCheck: { at: new Date().toISOString(), leaks: leaks.map((l) => ({ id: l.id, name: l.name })) },
        });
      } catch (err: any) {
        logger.warn(`[SecureGate] lock failed: ${err?.message}`);
        await saveGate(communityId, { job: { status: 'FAILED', step: 'Stopped', done: 0, total: 0, error: err?.message, at: new Date().toISOString() } });
      }
    })();
    return getGate(communityId);
  },

  /** Read-only check of how the Applicant / Member roles are set up (nothing is changed). */
  async diagnose(communityId: string) {
    const guild: any = await guildFor(communityId);
    if (!guild) throw new Error('The bot is not connected to this server right now.');
    const g = await getGate(communityId);
    const members = await guild.members.fetch();
    const humans = Array.from(members.values()).filter((m: any) => !m.user.bot) as any[];
    const roleInfo = (id?: string) => {
      const r = id ? guild.roles.cache.get(id) : null;
      if (!r) return null;
      const chans = Array.from(guild.channels.cache.values()).filter((c: any) => c.permissionOverwrites?.cache?.get(r.id)?.allow?.has?.(PermissionFlagsBits.ViewChannel)) as any[];
      return { id: r.id, name: r.name, holders: humans.filter((m) => m.roles.cache.has(r.id)).length, channelsItOpens: chans.length, sampleChannels: chans.slice(0, 15).map((c) => c.name) };
    };
    return {
      humans: humans.length,
      sameRole: !!g.memberRoleId && g.memberRoleId === g.applicantRoleId,
      memberRole: roleInfo(g.memberRoleId),
      applicantRole: roleInfo(g.applicantRoleId),
      newcomerVisible: newcomerVisible(guild).map((c: any) => c.name),
      publicChannels: (g.publicChannelIds || []).map((id: string) => guild.channels.cache.get(id)?.name || id),
    };
  },

  /**
   * Fixes a setup where the same role was used for newcomers (Applicant) and approved members.
   * - The access the Applicant role had on channels moves to the new Member role.
   * - Current members (anyone holding another role besides Applicant) get the Member role and lose Applicant;
   *   people with only Applicant stay newcomers.
   * - Staff channels (applications review, recruitment log) are taken off the public list and hidden.
   * - A private #apply channel is created that only the Applicant role (and staff) can see, with the Apply panel.
   */
  async repairRoles(communityId: string, params: { memberRoleId: string; actorId: string }) {
    const guild: any = await guildFor(communityId);
    if (!guild) throw new Error('The bot is not connected to this server right now.');
    const g = await getGate(communityId);
    const applicant: any = g.applicantRoleId ? guild.roles.cache.get(g.applicantRoleId) : guild.roles.cache.find((r: any) => r.name === 'Applicant');
    const member: any = guild.roles.cache.get(params.memberRoleId);
    if (!applicant) throw new Error('No Applicant role found.');
    if (!member || member.id === applicant.id || member.managed || member.id === guild.id) throw new Error('Choose a different role for approved members.');
    const me = guild.members.me;
    if (member.position >= me.roles.highest.position || applicant.position >= me.roles.highest.position) throw new Error('Move the bot’s role above both roles first (Server Settings → Roles).');
    const { getToolkit } = await import('../toolkit/toolkitConfig.js');
    const rc: any = (await getToolkit(communityId)).recruitment;
    const staffChannelIds = [rc.reviewChannelId, rc.logChannelId].filter(Boolean);
    const report = { channelsMoved: 0, membersUpdated: [] as string[], keptAsApplicants: [] as string[], staffChannelsHidden: [] as string[], applyChannel: '' };
    const V = PermissionFlagsBits.ViewChannel;

    // 1. Channel access: Applicant's view access moves to Member (staff channels: removed, not moved).
    for (const c of Array.from(guild.channels.cache.values()) as any[]) {
      const ow = c.permissionOverwrites?.cache?.get(applicant.id);
      if (!ow || !ow.allow.has(V)) continue;
      if (!staffChannelIds.includes(c.id)) {
        await c.permissionOverwrites.edit(member, { ViewChannel: true }, { reason: 'Secure Setup repair: member access' }).catch(() => undefined);
        report.channelsMoved++;
      }
      await c.permissionOverwrites.delete(applicant, 'Secure Setup repair: Applicant is for newcomers only').catch(() => undefined);
    }
    // 2. Staff channels never public; hidden from everyone except staff (their own overwrites stay).
    for (const id of staffChannelIds) {
      const c: any = guild.channels.cache.get(id);
      if (!c) continue;
      await c.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false }, { reason: 'Secure Setup repair: staff only' }).catch(() => undefined);
      await c.permissionOverwrites.delete(member, 'Secure Setup repair: staff only').catch(() => undefined);
      report.staffChannelsHidden.push(c.name);
    }
    // 3. People: existing members get Member and lose Applicant; plain newcomers keep Applicant.
    const all = await guild.members.fetch();
    for (const m of Array.from(all.values()) as any[]) {
      if (m.user.bot || !m.roles.cache.has(applicant.id)) continue;
      const others = m.roles.cache.filter((r: any) => r.id !== guild.id && r.id !== applicant.id);
      if (!others.size) { report.keptAsApplicants.push(m.user.username); continue; }
      await m.roles.add(member.id, 'Secure Setup repair').catch(() => undefined);
      await m.roles.remove(applicant.id, 'Secure Setup repair').catch(() => undefined);
      report.membersUpdated.push(m.user.username);
    }
    // 4. Private apply channel for newcomers.
    let apply: any = guild.channels.cache.find((c: any) => c.type === ChannelType.GuildText && /(^|[^a-z])apply([^a-z]|$)/i.test(c.name) && c.permissionOverwrites?.cache?.get(applicant.id)?.allow?.has(V));
    if (!apply) {
      apply = await guild.channels.create({
        name: (await import('../../integrations/discord/channelEmoji.js')).uniqueName(guild, '📝・apply-to-join'), type: ChannelType.GuildText, position: 0, reason: 'Secure Setup: where newcomers apply',
        topic: 'Press Apply to join. Only new people waiting for approval can see this channel.',
        permissionOverwrites: [
          { id: guild.roles.everyone.id, deny: [V] },
          { id: applicant.id, allow: [V, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.CreatePublicThreads] },
          { id: member.id, deny: [V] },
          { id: me.id, allow: [V, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory] },
        ],
      });
    }
    report.applyChannel = apply.name;
    const pubs = (g.publicChannelIds || []).filter((id: string) => !staffChannelIds.includes(id));
    await saveGate(communityId, { memberRoleId: member.id, applicantRoleId: applicant.id, publicChannelIds: pubs, applyChannelId: apply.id } as any);
    // 5. Apply panel in it (once).
    const { discordRecruitment } = await import('./discordRecruitment.service.js');
    const recent = await apply.messages.fetch({ limit: 20 }).catch(() => null);
    const hasPanel = recent && Array.from(recent.values()).some((m: any) => m.author?.id === me.id && m.components?.length);
    if (!hasPanel) await apply.send(discordRecruitment.panel(rc, apply.guild?.name)).catch(() => undefined);
    return report;
  },

  /** Read-only: which roles open which hidden channels, and what one role can see. */
  async access(communityId: string, roleId?: string) {
    const guild: any = await guildFor(communityId);
    if (!guild) throw new Error('The bot is not connected to this server right now.');
    const V = PermissionFlagsBits.ViewChannel;
    const chans = Array.from(guild.channels.cache.values()).filter((c: any) => VISIBLE_TYPES.has(c.type)) as any[];
    const hidden = chans.filter((c) => !c.permissionsFor(guild.roles.everyone)?.has(V));
    const opens = new Map<string, number>();
    for (const c of hidden) for (const o of c.permissionOverwrites.cache.values() as any) if (o.type === 0 && o.allow.has(V)) opens.set(o.id, (opens.get(o.id) || 0) + 1);
    const role = roleId ? guild.roles.cache.get(roleId) : null;
    return {
      hiddenChannels: hidden.length, totalChannels: chans.length,
      rolesOpeningHidden: Array.from(opens.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([id, n]) => ({ id, name: guild.roles.cache.get(id)?.name || id, channels: n })),
      role: role ? { name: role.name, canSee: chans.filter((c) => c.permissionsFor(role)?.has(V)).map((c) => c.name).slice(0, 60), explicitlyDenied: chans.filter((c) => c.permissionOverwrites.cache.get(role.id)?.deny?.has(V)).map((c) => c.name) } : null,
    };
  },

  /**
   * Game-role access after Secure Setup. Before the lock, many channels were open to @everyone and a
   * game channel was kept apart by DENYING the other games' roles (e.g. Minecraft channels deny @GTA).
   * Hiding them from @everyone broke that. This rebuilds it with allows, keeping the separation:
   * - channel was open to everyone and denied nobody      -> allow the approved role (general channel)
   * - channel was open to everyone but denied some roles   -> allow each access role that was NOT denied
   * Access roles = the approved role + every role that some channel denies (the game roles).
   * dryRun lists the changes without making them.
   */
  async gameAccess(communityId: string, dryRun: boolean, only?: { roleIds?: string[]; excludeChannels?: string[] }) {
    const guild: any = await guildFor(communityId);
    if (!guild) throw new Error('The bot is not connected to this server right now.');
    const g = await getGate(communityId);
    const V = PermissionFlagsBits.ViewChannel;
    const everyone = guild.id;
    const skip = new Set([everyone, g.applicantRoleId, g.memberRoleId].filter(Boolean) as string[]);
    const chans = Array.from(guild.channels.cache.values()).filter((c: any) => VISIBLE_TYPES.has(c.type)) as any[];
    const deniesOf = (c: any) => Array.from(c.permissionOverwrites.cache.values()).filter((o: any) => o.type === 0 && !skip.has(o.id) && o.deny.has(V)).map((o: any) => o.id) as string[];
    // Game roles: roles some channel explicitly hides from (that is how game sections were kept apart).
    const gameRoles = new Set<string>();
    for (const c of chans) for (const id of deniesOf(c)) { const r = guild.roles.cache.get(id); if (r && !r.managed) gameRoles.add(id); }
    const plan: { channel: string; allow: string[] }[] = [];
    for (const c of chans) {
      if (c.permissionsFor(guild.roles.everyone)?.has(V)) continue; // public anyway
      const denied = new Set(deniesOf(c));
      if (!denied.size) continue; // private/staff channel: leave as it is
      if (only?.excludeChannels?.some((n) => c.name.includes(n))) continue;
      const allow = Array.from(gameRoles).filter((id) => (!only?.roleIds?.length || only.roleIds.includes(id)) && !denied.has(id) && !c.permissionOverwrites.cache.get(id)?.allow?.has(V));
      if (!allow.length) continue;
      plan.push({ channel: c.name, allow });
      if (!dryRun) for (const id of allow) await c.permissionOverwrites.edit(id, { ViewChannel: true }, { reason: 'Secure Setup: game-role access' }).catch(() => undefined);
    }
    const name = (id: string) => guild.roles.cache.get(id)?.name || id;
    return { gameRoles: Array.from(gameRoles).map(name), changes: plan.length, plan: plan.slice(0, 150).map((p) => ({ channel: p.channel, allow: p.allow.map(name) })), applied: !dryRun };
  },

  /** Change the newcomer / approved roles without re-locking. */
  async setRoles(communityId: string, p: { applicantRoleId: string; memberRoleId: string; approvedExtraRoleIds: string[] }) {
    const guild: any = await guildFor(communityId);
    if (!guild) throw new Error('The bot is not connected to this server right now.');
    const top = guild.members.me.roles.highest.position;
    const check = (id: string, what: string) => {
      const r = guild.roles.cache.get(id);
      if (!r || r.managed || r.id === guild.id) throw new Error(`Choose a valid ${what}.`);
      if (r.position >= top) throw new Error(`Move the bot’s role above @${r.name} first (Server Settings → Roles).`);
      return r;
    };
    check(p.applicantRoleId, 'newcomer role'); check(p.memberRoleId, 'approved role');
    if (p.applicantRoleId === p.memberRoleId) throw new Error('The newcomer role and the approved role must be different.');
    const extras = p.approvedExtraRoleIds.filter((id) => id !== p.memberRoleId && id !== p.applicantRoleId);
    extras.forEach((id) => check(id, 'extra role'));
    const cur = await getGate(communityId);
    // Newcomer role changed: move the private apply channel's access to it.
    if (cur.applicantRoleId && cur.applicantRoleId !== p.applicantRoleId && (cur as any).applyChannelId) {
      const ch: any = guild.channels.cache.get((cur as any).applyChannelId);
      if (ch) {
        await ch.permissionOverwrites.edit(p.applicantRoleId, { ViewChannel: true, ReadMessageHistory: true, SendMessages: false }).catch(() => undefined);
        await ch.permissionOverwrites.delete(cur.applicantRoleId).catch(() => undefined);
      }
    }
    await saveGate(communityId, { applicantRoleId: p.applicantRoleId, memberRoleId: p.memberRoleId, approvedExtraRoleIds: extras });
    return getGate(communityId);
  },

  /** Restore every channel's permissions from the snapshot. */
  async undo(communityId: string) {
    const guild = await guildFor(communityId);
    if (!guild) throw new Error('The bot is not connected to this server right now.');
    const gate = await getGate(communityId);
    if (!gate.snapshot?.length) throw new Error('There is nothing to undo.');
    let restored = 0;
    for (const s of gate.snapshot) {
      const c: any = guild.channels.cache.get(s.channelId);
      if (!c?.permissionOverwrites || isObfuscated(c)) continue; // never restore from data Discord hides
      await c.permissionOverwrites.set(s.overwrites.map((o) => ({ id: o.id, type: o.type, allow: BigInt(o.allow), deny: BigInt(o.deny) })), 'Secure Setup undone').catch(() => undefined);
      restored++;
    }
    await saveGate(communityId, { verified: false, job: { status: 'UNDONE', step: `Restored ${restored} channel(s)`, done: restored, total: gate.snapshot.length, at: new Date().toISOString() } });
    return restored;
  },

  /** Owner confirms Apply to Join is off; passes only if nothing leaks. */
  async confirm(communityId: string, actorId: string, nativeApplyOff: boolean) {
    if (!nativeApplyOff) throw new Error('Please turn off Discord’s Apply to Join first and tick the box.');
    const s = await this.status(communityId);
    if (!s.connected) throw new Error('The bot is not connected to this server right now.');
    if (!s.gate.memberRoleId) throw new Error('Run the lock step first.');
    if (s.leaks.length) throw new Error(`These channels are still visible to newcomers: ${s.leaks.map((l: any) => `#${l.name}`).join(', ')}. Lock them or mark them public.`);
    const saved = await saveGate(communityId, { verified: true, nativeApplyOffConfirmed: true, verifiedAt: new Date().toISOString(), verifiedBy: actorId, lastCheck: { at: new Date().toISOString(), leaks: [] } });
    // Setup is confirmed: tell people what each channel is for (never blocks the confirmation).
    guildFor(communityId).then(async (guild: any) => { if (guild) await (await import('../channelGuides.service.js')).postChannelGuides(communityId, guild); }).catch(() => undefined);
    return saved;
  },

  async isVerified(communityId: string) {
    return (await getGate(communityId)).verified;
  },

  /** Newcomer joined: give the Applicant role (if set up). */
  async onJoin(communityId: string, member: any) {
    const g = await getGate(communityId);
    if (g.verified && g.applicantRoleId && !member.user.bot) await member.roles.add(g.applicantRoleId, 'New joiner').catch(() => undefined);
  },

  /** Approved: open the server for them. */
  async onApproved(communityId: string, discordUserId: string) {
    const g = await getGate(communityId);
    if (!g.memberRoleId || g.memberRoleId === g.applicantRoleId) return;
    const guild = await guildFor(communityId);
    const m = await guild?.members.fetch(discordUserId).catch(() => null);
    if (!m) return;
    await m.roles.add(g.memberRoleId, 'Application approved').catch(() => undefined);
    for (const id of g.approvedExtraRoleIds || []) await m.roles.add(id, 'Application approved').catch(() => undefined);
    if (g.applicantRoleId) await m.roles.remove(g.applicantRoleId, 'Application approved').catch(() => undefined);
  },

  /** Daily: re-scan; if something became visible to newcomers, pause recruitment and alert. */
  async recheckAll() {
    const all = await gateRepository.list({ where: [{ field: 'verified', operator: '==', value: true }] }).catch(() => [] as GateDoc[]);
    for (const g of all) {
      if (g.lastCheck && Date.now() - Date.parse(g.lastCheck.at) < 23 * 3_600_000) continue;
      const s = await this.status(g.communityId).catch(() => null);
      if (!s?.connected) continue;
      const key = s.leaks.map((l: any) => l.id).sort().join(',');
      await saveGate(g.communityId, { lastCheck: { at: new Date().toISOString(), leaks: s.leaks.map((l: any) => ({ id: l.id, name: l.name })) }, lastAlertKey: key } as any);
      // Only post when the list of exposed channels is new; the same list is not repeated every day.
      if (s.leaks.length && key !== (g as any).lastAlertKey) {
        const { recruitmentLog } = await import('./recruitmentLog.service.js');
        await recruitmentLog.post(g.communityId, `⚠️ **Secure Setup check:** these channels are now visible to newcomers: ${s.leaks.map((l: any) => `<#${l.id}>`).join(', ')}. Recruitment stays on, but please lock them or mark them public in the dashboard.`, true);
      }
    }
  },
};
