/**
 * Bulk tools. Each run is a background job with live progress, paced to respect Discord rate limits.
 *
 * Actions:
 *   ADD_ROLE / REMOVE_ROLE   role to / from every member matching the audience
 *   DM_MEMBERS               direct message to every member matching the audience (max 1,000 per job)
 *   CHANNEL_MESSAGE          the same message posted in several channels
 *   NICKNAME_RESET           clear nicknames of matching members
 *   PURGE_MESSAGES           delete the last N messages (under 14 days old) in channels, optionally from one member
 *   KICK_MEMBERS             kick matching members (requires typed confirmation in the dashboard)
 *
 * Audience: all members, members with a role, members without a role, joined within / before N days,
 * bots excluded by default.
 */
import { FirestoreRepository } from '../../repositories/firestore.repository.js';
import { allMembers } from '../../integrations/discord/memberFetch.js';
import { auditService } from '../audit.service.js';
import { logger } from '../../logging/logger.js';
import { guildFor, isSnowflake } from './toolkitConfig.js';

export type BulkAction = 'ADD_ROLE' | 'REMOVE_ROLE' | 'DM_MEMBERS' | 'CHANNEL_MESSAGE' | 'NICKNAME_RESET' | 'PURGE_MESSAGES' | 'KICK_MEMBERS';

export interface BulkAudience {
  mode: 'ALL' | 'HAS_ROLE' | 'MISSING_ROLE' | 'JOINED_WITHIN_DAYS' | 'JOINED_BEFORE_DAYS' | 'USER_IDS';
  roleId?: string;
  days?: number;
  userIds?: string[];
  includeBots?: boolean;
}

export interface BulkJobDoc {
  id: string;
  communityId: string;
  action: BulkAction;
  params: { roleId?: string; message?: string; channelIds?: string[]; count?: number; fromUserId?: string; reason?: string };
  audience?: BulkAudience;
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';
  total: number;
  done: number;
  failed: number;
  errors: string[];
  createdBy: string;
  createdAt: string;
  finishedAt?: string;
}

export const bulkJobsRepository = new FirestoreRepository<BulkJobDoc>('bulkJobs');
const cancelled = new Set<string>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_DMS = 1000;

async function audienceMembers(guild: any, a: BulkAudience): Promise<any[]> {
  const all = Array.from((await allMembers(guild)).values()) as any[];
  const now = Date.now();
  return all.filter((m) => {
    if (!a.includeBots && m.user?.bot) return false;
    if (m.id === guild.ownerId && a.mode !== 'USER_IDS') return true;
    switch (a.mode) {
      case 'ALL': return true;
      case 'HAS_ROLE': return Boolean(a.roleId && m.roles.cache.has(a.roleId));
      case 'MISSING_ROLE': return Boolean(a.roleId && !m.roles.cache.has(a.roleId));
      case 'JOINED_WITHIN_DAYS': return m.joinedTimestamp && now - m.joinedTimestamp <= (a.days || 7) * 86_400_000;
      case 'JOINED_BEFORE_DAYS': return m.joinedTimestamp && now - m.joinedTimestamp > (a.days || 30) * 86_400_000;
      case 'USER_IDS': return (a.userIds || []).includes(m.id);
      default: return false;
    }
  });
}

export const bulkTools = {
  async preview(communityId: string, audience: BulkAudience) {
    const guild = await guildFor(communityId);
    if (!guild) throw new Error('The bot is not connected to this server right now.');
    const members = await audienceMembers(guild, audience);
    return { count: members.length, sample: members.slice(0, 8).map((m) => ({ id: m.id, name: m.displayName || m.user?.username })) };
  },

  async start(communityId: string, actorId: string, action: BulkAction, params: BulkJobDoc['params'], audience?: BulkAudience): Promise<BulkJobDoc> {
    const guild = await guildFor(communityId);
    if (!guild) throw new Error('The bot is not connected to this server right now.');
    const running = (await bulkJobsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] })).find((j) => j.status === 'RUNNING' || j.status === 'QUEUED');
    if (running) throw new Error('Another bulk job is still running on this server. Wait for it to finish or cancel it.');
    if ((action === 'ADD_ROLE' || action === 'REMOVE_ROLE') && !isSnowflake(params.roleId)) throw new Error('Pick a role.');
    if ((action === 'DM_MEMBERS' || action === 'CHANNEL_MESSAGE') && !String(params.message || '').trim()) throw new Error('Write a message.');
    if ((action === 'CHANNEL_MESSAGE' || action === 'PURGE_MESSAGES') && !(params.channelIds || []).length) throw new Error('Pick at least one channel.');
    if (params.message && params.message.length > 2000) throw new Error('Messages can be at most 2,000 characters.');

    const job = await bulkJobsRepository.create({
      communityId, action, params, audience, status: 'QUEUED', total: 0, done: 0, failed: 0, errors: [], createdBy: actorId, createdAt: new Date().toISOString(),
    } as any);
    await auditService.log({ communityId, actorUserId: actorId, actorRole: 'CONTROLLER', action: 'BULK_JOB_STARTED' as any, targetType: 'bulk_job', targetId: job.id, metadata: { action, audience } }).catch(() => undefined);
    this.run(job.id).catch((err) => logger.error(`[Bulk] job ${job.id} crashed: ${err?.message}`));
    return job;
  },

  cancel(jobId: string) { cancelled.add(jobId); },

  /** Run the same action again (new job, same settings). Only for runs that failed, were cancelled, or had failures. */
  async retry(communityId: string, jobId: string, actorId: string): Promise<BulkJobDoc> {
    const old = await bulkJobsRepository.getById(jobId);
    if (!old || old.communityId !== communityId) throw new Error('Run not found.');
    if (old.status === 'RUNNING' || old.status === 'QUEUED') throw new Error('This run is still going.');
    if (old.status === 'DONE' && !old.failed) throw new Error('This run finished without problems.');
    return this.start(communityId, actorId, old.action, old.params, old.audience);
  },

  /** Remove a finished run from the history (a run that is still going must be cancelled first). */
  async remove(communityId: string, jobId: string) {
    const old = await bulkJobsRepository.getById(jobId);
    if (!old || old.communityId !== communityId) throw new Error('Run not found.');
    if (old.status === 'RUNNING' || old.status === 'QUEUED') throw new Error('Cancel this run first.');
    await bulkJobsRepository.delete(jobId);
  },

  async run(jobId: string) {
    const job = await bulkJobsRepository.getById(jobId);
    if (!job) return;
    const guild = await guildFor(job.communityId);
    const errors: string[] = [];
    let done = 0, failed = 0;
    const save = (extra: Partial<BulkJobDoc> = {}) => bulkJobsRepository.update(jobId, { done, failed, errors: errors.slice(-20), ...extra } as any);
    const fail = (e: any, who: string) => { failed++; if (errors.length < 200) errors.push(`${who}: ${e?.message || e}`); };

    try {
      if (!guild) throw new Error('Server not reachable.');
      const p = job.params;

      if (job.action === 'CHANNEL_MESSAGE' || job.action === 'PURGE_MESSAGES') {
        const channels = (p.channelIds || []).map((id) => guild.channels.cache.get(id)).filter(Boolean);
        await save({ status: 'RUNNING', total: channels.length });
        for (const ch of channels as any[]) {
          if (cancelled.has(jobId)) break;
          try {
            if (job.action === 'CHANNEL_MESSAGE') await ch.send({ content: p.message, allowedMentions: { parse: ['users', 'roles'] } });
            else {
              let msgs = await ch.messages.fetch({ limit: Math.min(Math.max(p.count || 50, 1), 100) });
              if (isSnowflake(p.fromUserId)) msgs = msgs.filter((m: any) => m.author?.id === p.fromUserId);
              await ch.bulkDelete(msgs, true);
            }
            done++;
          } catch (e) { fail(e, `#${ch.name}`); }
          await save();
          await sleep(1200);
        }
      } else {
        let members = await audienceMembers(guild, job.audience || { mode: 'ALL' });
        if (job.action === 'DM_MEMBERS') members = members.slice(0, MAX_DMS);
        if (job.action === 'KICK_MEMBERS') members = members.filter((m) => m.id !== guild.ownerId && m.kickable);
        await save({ status: 'RUNNING', total: members.length });
        const pace = job.action === 'DM_MEMBERS' ? 1500 : 400;
        for (const m of members) {
          if (cancelled.has(jobId)) break;
          try {
            switch (job.action) {
              case 'ADD_ROLE': if (!m.roles.cache.has(p.roleId)) await m.roles.add(p.roleId!, p.reason || 'Bulk role'); break;
              case 'REMOVE_ROLE': if (m.roles.cache.has(p.roleId)) await m.roles.remove(p.roleId!, p.reason || 'Bulk role'); break;
              case 'DM_MEMBERS': await m.send({ content: `${String(p.message).replace(/{user}/g, `<@${m.id}>`)}\n\n— *${guild.name}*` }); break;
              case 'NICKNAME_RESET': if (m.nickname && m.manageable) await m.setNickname(null, p.reason || 'Bulk nickname reset'); break;
              case 'KICK_MEMBERS': await m.kick(p.reason || 'Bulk kick'); break;
            }
            done++;
          } catch (e) { fail(e, m.user?.username || m.id); }
          if ((done + failed) % 10 === 0) await save();
          await sleep(pace);
        }
      }
      await save({ status: cancelled.has(jobId) ? 'CANCELLED' : 'DONE', finishedAt: new Date().toISOString() });
    } catch (e: any) {
      errors.push(e?.message || String(e));
      await save({ status: 'FAILED', finishedAt: new Date().toISOString() });
    } finally {
      cancelled.delete(jobId);
    }
  },

  async list(communityId: string) {
    const all = await bulkJobsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] });
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30);
  },
};
