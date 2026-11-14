/**
 * Living Discord messages that are edited instead of re-posted:
 *  - Code channel: one message per recruiter code (created, renamed, status, uses ...).
 *  - Reward board: one message per recruiter with invites, rewards, roles and wallet balance.
 * The first time a message is sent; after that the same message is edited.
 */
import { FirestoreRepository } from '../../repositories/firestore.repository.js';
import { logger } from '../../logging/logger.js';
import { getToolkit, guildFor, isSnowflake } from '../toolkit/toolkitConfig.js';

const postsRepository = new FirestoreRepository<any>('discordLivingPosts');
const postId = (communityId: string, kind: string, key: string) => `${kind}_${communityId}_${key}`.replace(/[^\w-]/g, '_').slice(0, 140);
const ts = (iso?: string) => (iso ? `<t:${Math.floor(Date.parse(iso) / 1000)}:R>` : '—');

const locks = new Map<string, Promise<any>>();
/** Runs updates of the same message one after another, so two events never post two messages. */
function upsert(communityId: string, kind: string, key: string, channelId: string, payload: any) {
  const id = postId(communityId, kind, key);
  const run = (locks.get(id) || Promise.resolve()).catch(() => undefined).then(() => upsertNow(communityId, kind, key, channelId, payload));
  locks.set(id, run);
  void run.finally(() => { if (locks.get(id) === run) locks.delete(id); });
  return run;
}

/** Send once, then keep editing the same message. Moves to the new channel if the setting changed. */
async function upsertNow(communityId: string, kind: string, key: string, channelId: string, payload: any) {
  const guild = await guildFor(communityId);
  const ch: any = guild?.channels.cache.get(channelId);
  if (!ch?.send) return null;
  const id = postId(communityId, kind, key);
  const prev: any = await postsRepository.getById(id).catch(() => null);
  if (prev?.messageId && prev.channelId === channelId) {
    const msg = await ch.messages.fetch(prev.messageId).catch(() => null);
    if (msg && (await msg.edit(payload).then(() => true).catch(() => false))) return msg;
  }
  const msg = await ch.send(payload).catch((e: any) => { logger.warn(`[LivingPosts] ${kind} send failed: ${e?.message}`); return null; });
  if (!msg) return null;
  const doc = { communityId, kind, key, channelId, messageId: msg.id, updatedAt: new Date().toISOString() };
  if (prev) await postsRepository.update(id, doc).catch(() => undefined);
  else await postsRepository.create(id, doc).catch(() => undefined);
  return msg;
}

async function codes(communityId: string) {
  const { recruiterCodesRepository } = await import('../../repositories/index.js');
  return ((await (recruiterCodesRepository as any).listForTenant(communityId).catch(() => [])) as any[]);
}

export const recruiterBoards = {
  /* ----------------------------- Code channel ----------------------------- */
  async syncCode(communityId: string, codeId: string, deleted?: { code: string; owner?: string }) {
    try {
      const cfg: any = (await getToolkit(communityId)).recruitment;
      const { recruiterCodesRepository } = await import('../../repositories/index.js');
      const c: any = deleted ? null : await (recruiterCodesRepository as any).getById(codeId).catch(() => null);
      if (cfg.codeChannelId && isSnowflake(cfg.codeChannelId)) {
        const owner = c?.recruiterDiscordId || c?.recruiterUserId || deleted?.owner;
        const active = c && c.status !== 'INACTIVE' && c.isActive !== false;
        const embed = deleted || !c
          ? { title: `🗑️ ${deleted?.code || 'Recruiter code'} · deleted`, color: 0x94a3b8, description: `${owner ? `Was owned by <@${owner}>. ` : ''}This code no longer works.`, timestamp: new Date().toISOString() }
          : {
              title: `🎟️ ${c.code}`,
              color: active ? 0x7fe0b0 : 0xffc46b,
              description: `Owner: ${owner ? `<@${owner}>` : '—'}${c.recruiterName ? ` (${c.recruiterName})` : ''}`,
              fields: [
                { name: 'Status', value: active ? '🟢 Active' : '🟠 Inactive', inline: true },
                { name: 'Used', value: `${c.totalUses || 0}${c.usesRemaining ? ` · ${c.usesRemaining} left` : ''}`, inline: true },
                { name: 'Expires', value: c.expiresAt ? `<t:${Math.floor(Date.parse(c.expiresAt) / 1000)}:D>` : 'Never', inline: true },
                { name: 'Created', value: ts(c.createdAt), inline: true },
                { name: 'Updated', value: ts(c.updatedAt || c.createdAt), inline: true },
                ...(c.notes ? [{ name: 'Notes', value: String(c.notes).slice(0, 300) }] : []),
              ],
              footer: { text: c.source === 'AUTO_ON_APPROVAL' ? 'Given automatically on approval' : 'Recruiter code' },
            };
        await upsert(communityId, 'code', codeId, cfg.codeChannelId, { embeds: [embed], allowedMentions: { parse: [] } });
      }
      // The member's own code also goes on their closed-application message.
      if (c) await this.stampClosedApplication(communityId, c.recruiterDiscordId || c.recruiterUserId, c.code);
    } catch (e: any) { logger.warn(`[LivingPosts] code ${codeId}: ${e?.message}`); }
  },

  /** Adds or updates the "Recruiter code" field on the applications-log message of this member. */
  async stampClosedApplication(communityId: string, memberId: string, code: string) {
    if (!isSnowflake(memberId)) return;
    const { reviewRoomsRepository } = await import('../toolkit/reviewRooms.service.js');
    const rooms = (await reviewRoomsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] }).catch(() => [] as any[]))
      .filter((r: any) => r.applicantId === memberId && r.archiveMessageId && r.archiveChannelId);
    const guild = await guildFor(communityId);
    for (const r of rooms as any[]) {
      const ch: any = guild?.channels.cache.get(r.archiveChannelId);
      const msg = await ch?.messages.fetch(r.archiveMessageId).catch(() => null);
      if (!msg?.embeds?.[0]) continue;
      const e = msg.embeds[0].toJSON();
      const fields = (e.fields || []).filter((f: any) => f.name !== '🎟️ Their recruiter code');
      fields.push({ name: '🎟️ Their recruiter code', value: `**${code}**`, inline: true });
      await msg.edit({ embeds: [{ ...e, fields }], allowedMentions: { parse: [] } }).catch(() => undefined);
    }
  },

  /* ----------------------------- Reward board ----------------------------- */
  async syncRecruiter(communityId: string, memberId: string, fallbackChannelId?: string, latest?: string) {
    try {
      const cfg: any = (await getToolkit(communityId)).recruitment;
      const channelId = isSnowflake(cfg.rewardBoardChannelId) ? cfg.rewardBoardChannelId : fallbackChannelId;
      if (!channelId || !isSnowflake(memberId)) return false;
      const { inviteRewards } = await import('../rewards/inviteRewards.service.js');
      const { wallet } = await import('../rewards/wallet.service.js');
      const [records, credits, grants, myCodes, balances] = await Promise.all([
        inviteRewards.records(communityId), inviteRewards.credits(communityId), inviteRewards.grants(communityId),
        codes(communityId).then((l) => l.filter((c) => (c.recruiterDiscordId || c.recruiterUserId) === memberId)),
        wallet.describeBalances(communityId, memberId).catch(() => [] as string[]),
      ]);
      const t = inviteRewards.tally(records, credits).get(memberId);
      const mine = grants.filter((g) => g.recruiterId === memberId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const guild = await guildFor(communityId);
      const member: any = guild ? await guild.members.fetch(memberId).catch(() => null) : null;
      const roles = [...new Set(mine.filter((g) => g.status === 'GRANTED').flatMap((g: any) => g.roleIdsGiven || []))].filter((id) => !member || member.roles.cache.has(id));
      const status = (s: string) => ({ GRANTED: '✅', PENDING: '⏳', FAILED: '⚠️', REVOKED: '↩️', EXPIRED: '⌛', REJECTED: '✖️' } as any)[s] || '•';
      const embed = {
        title: `🏆 ${member?.displayName || t?.name || 'Recruiter'}`,
        color: 0x7c8cff,
        thumbnail: member?.user?.displayAvatarURL ? { url: member.user.displayAvatarURL({ size: 128 }) } : undefined,
        description: `<@${memberId}>${myCodes.length ? ` · code ${myCodes.map((c) => `**${c.code}**`).join(', ')}` : ''}`,
        fields: [
          { name: '👥 Invites', value: `${t?.joined || 0} in the server${t?.left ? ` · ${t.left} left` : ''}${t?.bonus ? ` · ${t.bonus > 0 ? '+' : ''}${t.bonus} bonus` : ''}`, inline: true },
          { name: '🏷️ Reward roles', value: roles.length ? roles.map((id) => `<@&${id}>`).join(' ') : 'None yet', inline: true },
          { name: '💰 Balance', value: (balances.length ? balances.join('\n') : 'No wallet items').slice(0, 1000) },
          { name: '🎁 Latest rewards', value: (mine.slice(0, 6).map((g) => `${status(g.status)} ${g.emoji || ''} ${g.ruleName} · ${ts(g.createdAt)}`).join('\n') || 'None yet').slice(0, 1000) },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'Updated automatically' },
      };
      const msg = await upsert(communityId, 'board', memberId, channelId, { content: latest ? latest.slice(0, 1900) : undefined, embeds: [embed], allowedMentions: { users: [memberId] } });
      return Boolean(msg);
    } catch (e: any) { logger.warn(`[LivingPosts] board ${memberId}: ${e?.message}`); return false; }
  },

  /** Board channel for a member: the setting, else the announcement channel of their last reward rule. */
  async refreshRecruiter(communityId: string, memberId: string) {
    const cfg: any = (await getToolkit(communityId)).recruitment;
    if (isSnowflake(cfg.rewardBoardChannelId)) return this.syncRecruiter(communityId, memberId);
    const prev: any = await postsRepository.getById(postId(communityId, 'board', memberId)).catch(() => null);
    if (prev?.channelId) return this.syncRecruiter(communityId, memberId, prev.channelId);
    return false;
  },

  /** Finds older closed-application messages (posted before ids were saved) and links them. */
  async backfillClosed(communityId: string) {
    const { reviewRoomsRepository } = await import('../toolkit/reviewRooms.service.js');
    const rooms: any[] = (await reviewRoomsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] }).catch(() => [])).filter((r: any) => r.status === 'CLOSED' && !r.archiveMessageId);
    if (!rooms.length) return 0;
    const cfg: any = (await getToolkit(communityId)).recruitment;
    const guild = await guildFor(communityId);
    let found = 0;
    for (const chId of [cfg.reviewChannelId, cfg.logChannelId].filter(isSnowflake)) {
      const ch: any = guild?.channels.cache.get(chId);
      if (!ch?.messages) continue;
      let before: string | undefined;
      for (let i = 0; i < 5; i++) {
        const batch: any = await ch.messages.fetch({ limit: 100, before }).catch(() => null);
        if (!batch?.size) break;
        for (const m of batch.values()) {
          const e = m.embeds?.[0];
          if (m.author?.id !== guild.client.user.id || !String(e?.title || '').includes('Closed application')) continue;
          const room = rooms.find((r) => !r.archiveMessageId && String(e.description || '').startsWith(`<@${r.applicantId}>`));
          if (room) { room.archiveMessageId = m.id; await reviewRoomsRepository.update(room.id, { archiveChannelId: ch.id, archiveMessageId: m.id } as any).catch(() => undefined); found++; }
        }
        before = batch.last()?.id;
        if (batch.size < 100) break;
      }
    }
    return found;
  },

  /** Re-post or refresh every code (after the channel was picked), and fill codes into closed applications. */
  async syncAllCodes(communityId: string) {
    await this.backfillClosed(communityId).catch(() => undefined);
    const list = await codes(communityId);
    for (const c of list) await this.syncCode(communityId, c.id);
    return list.length;
  },
};
