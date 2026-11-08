/**
 * Runtime leadership: guarantees exactly ONE process runs the Discord bot and the schedulers.
 *
 *   Oracle VM  (BOT_LEADER_PRIORITY=100) -> always wins, runs the bot 24/7
 *   Cloud Run  (BOT_LEADER_PRIORITY=10)  -> serves the website; takes over the bot only
 *                                           if the VM has been silent for LEASE_TTL seconds
 *
 * Without DATABASE_URL (single instance / local dev) the process simply becomes leader.
 * Set BOT_ENABLED=false to run a website-only instance that never starts the bot.
 */
import os from 'os';
import crypto from 'crypto';
import { logger } from '../logging/logger.js';
import { isPostgresEnabled, postgresStore } from '../repositories/postgres.store.js';

const LEASE_NAME = 'discord-bot';
const LEASE_TTL_SECONDS = 60;
const RENEW_EVERY_MS = 20_000;
/** How often a standby checks whether it can take over (the VM's next container uses a short value for fast handoffs). */
const STANDBY_POLL_MS = Math.max(1000, Number(process.env.BOT_STANDBY_POLL_MS || RENEW_EVERY_MS));

export interface LeadershipHooks {
  onBecomeLeader: () => Promise<void> | void;
  onLoseLeadership: () => Promise<void> | void;
}

const holderId = `${process.env.BOT_INSTANCE_ROLE || 'web'}:${os.hostname()}:${crypto.randomBytes(3).toString('hex')}`;
const priority = Number(process.env.BOT_LEADER_PRIORITY || 10);
let isLeader = false;
let timer: NodeJS.Timeout | null = null;
let stopped = false;
let lastError: string | undefined;
let lastLeaseOkAt = Date.now();
const startedAt = new Date().toISOString();
let leaderSince: string | undefined;
/** Gap between the previous bot stepping down and this one taking over (measured on handoff). */
let lastHandoff: { previousStoppedAt: string; tookOverAt: string; gapMs: number } | undefined;
const handoffFlags = () => import('../repositories/firestore.repository.js').then((m) => new m.FirestoreRepository<any>('platformFlags'));

export function getLeadershipStatus() {
  return { holderId, priority, isLeader, lastError, leaseBacked: isPostgresEnabled(), startedAt, leaderSince, lastHandoff, version: process.env.GIT_SHA };
}

export async function startLeadership(hooks: LeadershipHooks): Promise<void> {
  if (String(process.env.BOT_ENABLED ?? 'true').toLowerCase() === 'false') {
    logger.info('[Leadership] BOT_ENABLED=false: website-only instance, Discord bot will not start here.');
    return;
  }

  const become = async () => {
    if (isLeader) return;
    isLeader = true;
    leaderSince = new Date().toISOString();
    logger.info(`[Leadership] ${holderId} is now the ACTIVE bot (leader, priority ${priority}).`);
    try { await hooks.onBecomeLeader(); } catch (err: any) { logger.error(`[Leadership] onBecomeLeader failed: ${err?.message}`); }
    // Record how long the bot was unattended during this handoff (after Discord is back).
    handoffFlags().then(async (f) => {
      const prev = await f.getById('botHandoff').catch(() => null);
      if (prev?.stoppedAt && !prev.measured) {
        lastHandoff = { previousStoppedAt: prev.stoppedAt, tookOverAt: new Date().toISOString(), gapMs: Date.now() - new Date(prev.stoppedAt).getTime() };
        await f.update('botHandoff', { ...prev, measured: true, ...lastHandoff });
        logger.info(`[Leadership] Handoff complete: bot was unattended for ${lastHandoff.gapMs} ms.`);
      }
    }).catch(() => undefined);
  };
  const lose = async (reason: string) => {
    if (!isLeader) return;
    isLeader = false;
    logger.warn(`[Leadership] ${holderId} lost leadership (${reason}). Stopping bot on this instance.`);
    try { await hooks.onLoseLeadership(); } catch (err: any) { logger.error(`[Leadership] onLoseLeadership failed: ${err?.message}`); }
  };

  if (!isPostgresEnabled()) {
    await become();
    return;
  }

  const tick = async () => {
    try {
      const got = await postgresStore.tryAcquireLease(LEASE_NAME, holderId, priority, LEASE_TTL_SECONDS);
      lastError = undefined;
      lastLeaseOkAt = Date.now();
      if (got) await become();
      else await lose('another higher-priority instance holds the lease');
    } catch (err: any) {
      lastError = err?.message || String(err);
      logger.warn(`[Leadership] Lease check failed: ${lastError}`);
      // Database briefly unreachable: keep current role, but step down once our lease could
      // have expired, so another instance can never run a second copy of the bot.
      if (isLeader && Date.now() - lastLeaseOkAt > (LEASE_TTL_SECONDS - 10) * 1000) {
        await lose('lease could not be renewed');
      }
    }
  };

  const loop = async () => {
    await tick();
    if (!stopped) timer = setTimeout(loop, isLeader ? RENEW_EVERY_MS : STANDBY_POLL_MS);
  };
  await loop();
}

export async function stopLeadership(): Promise<void> {
  stopped = true;
  if (timer) clearTimeout(timer);
  timer = null;
  if (isLeader && isPostgresEnabled()) {
    try { await postgresStore.releaseLease(LEASE_NAME, holderId); } catch { /* best effort */ }
  }
  isLeader = false;
}

/** Called first on shutdown (before Discord disconnects) so the next bot can measure the real gap. */
export async function noteShutdownStarting(): Promise<void> {
  if (!isLeader || !isPostgresEnabled()) return;
  try {
    const f = await handoffFlags();
    const doc = { id: 'botHandoff', stoppedAt: new Date().toISOString(), stoppedBy: holderId, measured: false };
    if (await f.getById('botHandoff').catch(() => null)) await f.update('botHandoff', doc); else await f.create('botHandoff', doc);
  } catch { /* best effort */ }
}
