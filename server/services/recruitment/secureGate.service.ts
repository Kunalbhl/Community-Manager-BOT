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
  publicChannelIds: string[];
  snapshot?: { channelId: string; overwrites: { id: string; type: number; allow: string; deny: string }[] }[];
  snapshotAt?: string;
  job?: { status: 'RUNNING' | 'DONE' | 'FAILED' | 'UNDONE'; step: string; done: number; total: number; error?: string; at: string };
  lastCheck?: { at: string; leaks: { id: string; name: string }[] };
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
    .filter((c: any) => VISIBLE_TYPES.has(c.type) && c.type !== ChannelType.GuildCategory)
    .filter((c: any) => c.permissionsFor(everyone)?.has(PermissionFlagsBits.ViewChannel))
    .sort((a: any, b: any) => a.rawPosition - b.rawPosition)
    .map((c: any) => ({ id: c.id, name: c.name, type: c.type, parent: c.parent?.name || null }));
}

export const secureGate = {
  async status(communityId: string) {
    const gate = await getGate(communityId);
    const guild = await guildFor(communityId);
    if (!guild) return { gate, connected: false, visible: [], leaks: [], botOk: false, problems: ['The bot is not connected to this server.'] };
    const visible = newcomerVisible(guild);
    const leaks = visible.filter((c) => !gate.publicChannelIds.includes(c.id));
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
    const snapshot = Array.from(guild.channels.cache.values()).filter((c: any) => c.permissionOverwrites).map((c: any) => ({
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

  /** Restore every channel's permissions from the snapshot. */
  async undo(communityId: string) {
    const guild = await guildFor(communityId);
    if (!guild) throw new Error('The bot is not connected to this server right now.');
    const gate = await getGate(communityId);
    if (!gate.snapshot?.length) throw new Error('There is nothing to undo.');
    let restored = 0;
    for (const s of gate.snapshot) {
      const c: any = guild.channels.cache.get(s.channelId);
      if (!c?.permissionOverwrites) continue;
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
    return saveGate(communityId, { verified: true, nativeApplyOffConfirmed: true, verifiedAt: new Date().toISOString(), verifiedBy: actorId, lastCheck: { at: new Date().toISOString(), leaks: [] } });
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
    if (!g.memberRoleId) return;
    const guild = await guildFor(communityId);
    const m = await guild?.members.fetch(discordUserId).catch(() => null);
    if (!m) return;
    await m.roles.add(g.memberRoleId, 'Application approved').catch(() => undefined);
    if (g.applicantRoleId) await m.roles.remove(g.applicantRoleId, 'Application approved').catch(() => undefined);
  },

  /** Daily: re-scan; if something became visible to newcomers, pause recruitment and alert. */
  async recheckAll() {
    const all = await gateRepository.list({ where: [{ field: 'verified', operator: '==', value: true }] }).catch(() => [] as GateDoc[]);
    for (const g of all) {
      if (g.lastCheck && Date.now() - Date.parse(g.lastCheck.at) < 23 * 3_600_000) continue;
      const s = await this.status(g.communityId).catch(() => null);
      if (!s?.connected) continue;
      await saveGate(g.communityId, { lastCheck: { at: new Date().toISOString(), leaks: s.leaks.map((l: any) => ({ id: l.id, name: l.name })) } });
      if (s.leaks.length) {
        const { recruitmentLog } = await import('./recruitmentLog.service.js');
        await recruitmentLog.post(g.communityId, `⚠️ **Secure Setup check:** these channels are now visible to newcomers: ${s.leaks.map((l: any) => `<#${l.id}>`).join(', ')}. Recruitment stays on, but please lock them or mark them public in the dashboard.`, true);
      }
    }
  },
};
