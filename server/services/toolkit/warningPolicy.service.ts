/**
 * Warning rules: each reason carries points; when a member's active points reach a threshold,
 * the configured action runs automatically (timeout for N minutes, kick, or ban).
 * Points expire after `expiryDays`. The member is DM'd the reason, their points and what happened.
 */
import { FirestoreRepository } from '../../repositories/firestore.repository.js';
import { warningService, moderationActionService } from '../moderation.service.js';
import { logger } from '../../logging/logger.js';
import { getToolkit, guildFor, WarningThreshold } from './toolkitConfig.js';

export interface StrikeDoc {
  id: string;
  communityId: string;
  discordUserId: string;
  reasonKey: string;
  reasonLabel: string;
  note?: string;
  points: number;
  moderatorId: string;
  createdAt: string;
  expiresAt: string;
  revoked?: boolean;
}

export const strikesRepository = new FirestoreRepository<StrikeDoc>('warningStrikes');

const describe = (t: WarningThreshold) =>
  t.action === 'TIMEOUT' ? `timeout for ${fmtMinutes(t.durationMinutes || 60)}` : t.action === 'KICK' ? 'kick from the server' : 'ban from the server';

function fmtMinutes(m: number) {
  if (m % (24 * 60) === 0) return `${m / (24 * 60)} day(s)`;
  if (m % 60 === 0) return `${m / 60} hour(s)`;
  return `${m} minute(s)`;
}

export const warningPolicy = {
  async activePoints(communityId: string, discordUserId: string): Promise<{ points: number; strikes: StrikeDoc[] }> {
    const now = Date.now();
    const strikes = (await strikesRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }, { field: 'discordUserId', operator: '==', value: discordUserId }] }))
      .filter((s) => !s.revoked && Date.parse(s.expiresAt) > now)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { points: strikes.reduce((n, s) => n + s.points, 0), strikes };
  },

  /** Issue a warning by reason. Returns what happened so the caller can tell the moderator. */
  async warn(params: { communityId: string; discordUserId: string; reasonKey: string; note?: string; moderatorId: string }) {
    const cfg = (await getToolkit(params.communityId)).warnings;
    const reason = cfg.reasons.find((r) => r.key === params.reasonKey) || { key: 'custom', label: params.note || 'Rule violation', points: 1 };
    const before = (await this.activePoints(params.communityId, params.discordUserId)).points;

    const now = new Date();
    await strikesRepository.create({
      communityId: params.communityId,
      discordUserId: params.discordUserId,
      reasonKey: reason.key,
      reasonLabel: reason.label,
      note: params.note,
      points: reason.points,
      moderatorId: params.moderatorId,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + cfg.expiryDays * 86_400_000).toISOString(),
    } as any);
    // Keep the existing warnings history (dashboard, audit, incident escalation) in sync.
    await warningService.createWarning({
      communityId: params.communityId,
      discordUserId: params.discordUserId,
      reason: params.note ? `${reason.label}: ${params.note}` : reason.label,
      moderatorId: params.moderatorId,
      severity: reason.points >= 5 ? 'CRITICAL' : reason.points >= 3 ? 'HIGH' : reason.points >= 2 ? 'MEDIUM' : 'LOW',
      expiresDays: cfg.expiryDays,
    }).catch((err: any) => logger.warn(`[WarningPolicy] history write failed: ${err?.message}`));

    const after = before + reason.points;
    // Highest threshold crossed by this warning.
    const crossed = [...cfg.thresholds].sort((a, b) => b.points - a.points).find((t) => before < t.points && after >= t.points) || null;

    let actionResult: string | null = null;
    if (crossed) {
      const exec: any = await moderationActionService.executeDiscordAction({
        communityId: params.communityId,
        actionType: crossed.action,
        targetDiscordUserId: params.discordUserId,
        actorDiscordUserId: params.moderatorId,
        reason: `Reached ${after} warning points (${reason.label})`,
        durationMinutes: crossed.durationMinutes,
      });
      actionResult = exec?.status === 'COMPLETED' ? `Applied: ${describe(crossed)}` : `Could not apply ${describe(crossed)}: ${exec?.failureReason || exec?.status}`;
    }

    if (cfg.dmMember) {
      const guild = await guildFor(params.communityId);
      const user = await guild?.client?.users?.fetch(params.discordUserId).catch(() => null);
      const next = [...cfg.thresholds].sort((a, b) => a.points - b.points).find((t) => t.points > after);
      const lines = [
        `⚠️ **You received a warning in ${guild?.name || 'the server'}**`,
        `Reason: **${reason.label}**${params.note ? ` · ${params.note}` : ''}`,
        `Points: **${after}** active (each warning expires after ${cfg.expiryDays} days)`,
        crossed ? `Action taken: **${describe(crossed)}**` : next ? `At ${next.points} points: ${describe(next)}` : '',
      ].filter(Boolean);
      await user?.send(lines.join('\n')).catch(() => undefined);
    }

    import('../features/community.service.js').then(async ({ serverLogs }) => {
      const g = await guildFor(params.communityId);
      if (g) await serverLogs.send(params.communityId, g, 'moderation', '⚠️ Member warned', `<@${params.discordUserId}> · ${reason.label} (+${reason.points})`, [
        { name: 'Moderator', value: `<@${params.moderatorId}>`, inline: true },
        { name: 'Points', value: `${before} → ${after}`, inline: true },
        ...(actionResult ? [{ name: 'Automatic action', value: String(actionResult) }] : []),
        ...(params.note ? [{ name: 'Note', value: params.note }] : []),
      ]);
    }).catch(() => undefined);
    return { reason, pointsBefore: before, pointsAfter: after, threshold: crossed, actionResult };
  },

  async revoke(communityId: string, strikeId: string) {
    const s = await strikesRepository.getById(strikeId);
    if (!s || s.communityId !== communityId) throw new Error('Warning not found.');
    return strikesRepository.update(strikeId, { revoked: true } as any);
  },

  async recent(communityId: string, limit = 100) {
    const all = await strikesRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] });
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
  },
};
