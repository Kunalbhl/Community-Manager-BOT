/**
 * Recruitment role rules: when an application is approved, every enabled rule whose condition
 * matches adds / removes Discord roles. If the applicant has not joined the server yet,
 * the rules run again automatically when they join.
 */
import { applicationsRepository } from '../../repositories/index.js';
import { logger } from '../../logging/logger.js';
import { getToolkit, guildFor, isSnowflake, RoleRule } from './toolkitConfig.js';

function answersOf(app: any): { q: string; a: string }[] {
  const raw = app?.answers;
  if (Array.isArray(raw)) return raw.map((x: any) => ({ q: String(x.questionText || x.questionId || ''), a: [x.answerText, ...(x.answerValues || [])].filter(Boolean).join(' ') }));
  if (raw && typeof raw === 'object') return Object.entries(raw).map(([q, a]) => ({ q, a: Array.isArray(a) ? a.join(' ') : String(a ?? '') }));
  return [];
}

export function ruleMatches(rule: RoleRule, app: any): boolean {
  const c: any = rule.condition || { type: 'ALWAYS' };
  const code = String(app.recruiterCodeUsed || app.recruiterCode || '').toLowerCase();
  switch (c.type) {
    case 'ALWAYS': return true;
    case 'ANY_RECRUITER_CODE': return Boolean(code);
    case 'RECRUITER_CODE': return code === String(c.code || '').toLowerCase();
    case 'SOURCE': return String(app.source || app.recruitmentSource || '').toLowerCase() === String(c.source || '').toLowerCase();
    case 'ANSWER_CONTAINS': {
      const q = String(c.question || '').toLowerCase();
      const v = String(c.value || '').toLowerCase();
      return answersOf(app).some((x) => (!q || x.q.toLowerCase().includes(q)) && x.a.toLowerCase().includes(v));
    }
    default: return false;
  }
}

export const roleRules = {
  /** Applies matching rules. Returns a summary; marks the application if the member is not in the server yet. */
  async applyForApplication(applicationId: string): Promise<{ applied: string[]; pending: boolean; errors: string[] }> {
    const app: any = await applicationsRepository.getById(applicationId);
    const out = { applied: [] as string[], pending: false, errors: [] as string[] };
    if (!app) return out;
    const cfg = (await getToolkit(app.communityId)).roleRules;
    const rules = cfg.enabled ? cfg.rules.filter((r) => r.enabled && ruleMatches(r, app)) : [];
    if (!rules.length) return out;

    const guild = await guildFor(app.communityId);
    const userId = app.applicantDiscordUserId || app.applicantDiscordId;
    const member = guild && isSnowflake(userId) ? await guild.members.fetch(userId).catch(() => null) : null;
    if (!member) {
      await applicationsRepository.update(applicationId, { pendingRoleRules: true } as any).catch(() => undefined);
      return { ...out, pending: true };
    }
    for (const rule of rules) {
      for (const id of rule.addRoleIds.filter(isSnowflake)) {
        try { await member.roles.add(id, `Role rule: ${rule.name}`); out.applied.push(`+${guild.roles.cache.get(id)?.name || id}`); }
        catch (err: any) { out.errors.push(`${rule.name}: ${err?.message}`); }
      }
      for (const id of rule.removeRoleIds.filter(isSnowflake)) {
        try { await member.roles.remove(id, `Role rule: ${rule.name}`); out.applied.push(`-${guild.roles.cache.get(id)?.name || id}`); }
        catch (err: any) { out.errors.push(`${rule.name}: ${err?.message}`); }
      }
    }
    await applicationsRepository.update(applicationId, { pendingRoleRules: false, roleRulesAppliedAt: new Date().toISOString(), roleRulesResult: out } as any).catch(() => undefined);
    if (out.errors.length) logger.warn(`[RoleRules] ${applicationId}: ${out.errors.join('; ')}`);
    return out;
  },

  /** Called when a member joins: runs rules that were waiting for them. */
  async onMemberJoin(communityId: string, discordUserId: string) {
    const apps = await applicationsRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }, { field: 'applicantDiscordId', operator: '==', value: discordUserId }] });
    for (const a of apps as any[]) if (a.pendingRoleRules) await this.applyForApplication(a.id);
  },

  /** Dry run for the dashboard: which rules would match this application. */
  async preview(applicationId: string) {
    const app: any = await applicationsRepository.getById(applicationId);
    if (!app) return [];
    const cfg = (await getToolkit(app.communityId)).roleRules;
    return cfg.rules.map((r) => ({ id: r.id, name: r.name, enabled: r.enabled, matches: ruleMatches(r, app) }));
  },
};
