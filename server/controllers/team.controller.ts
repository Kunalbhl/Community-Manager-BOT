/**
 * Team & access: who can use the dashboard and what each role can do.
 *
 * Dashboard roles: Owner (Discord server owner/admins, everything), Controller, Interviewer, Recruiter.
 * Members and applicants never need to log in. Each dashboard role can be linked to a Discord role:
 * anyone holding that Discord role gets the dashboard role, and giving someone a dashboard role here
 * also gives them the Discord role (kept in sync both ways). Permissions per role are editable,
 * with a one-click reset to the template. The Platform Owner (bot creator) always has everything.
 */
import { Request, Response } from 'express';
import { allMembers } from '../integrations/discord/memberFetch.js';
import { PermissionFlagsBits } from 'discord.js';
import { DEFAULT_ROLE_PERMISSIONS, ALL_COMMUNITY_PERMISSIONS } from '../../shared/types/rbac.js';
import { communityMemberAccessRepository, rolesRepository } from '../repositories/index.js';
import { settingsService } from '../services/settings.service.js';
import { guildFor, isSnowflake } from '../services/toolkit/toolkitConfig.js';
import { auditService } from '../services/audit.service.js';

export const TEAM_ROLES = ['CONTROLLER', 'INTERVIEWER', 'RECRUITER'] as const;
const LINKABLE = ['OWNER', 'CONTROLLER', 'INTERVIEWER', 'RECRUITER'] as const;
type TeamRole = typeof TEAM_ROLES[number];
const LABEL: Record<string, string> = { OWNER: 'Owner', CONTROLLER: 'Controller', INTERVIEWER: 'Interviewer', RECRUITER: 'Recruiter' };
const actor = (req: Request) => (req as any).user || {};
const ok = (res: Response, data: unknown) => res.json({ success: true, data });
const fail = (res: Response, err: any, code = 400) => res.status(code).json({ success: false, error: { message: err?.message || String(err) } });

function requireOwner(req: Request) {
  const u = actor(req);
  if (!(u.role === 'OWNER' || u.role === 'PLATFORM_OWNER' || u.isPlatformOwner)) throw new Error('Only the server owner can change team access.');
}

async function roleDocs(communityId: string) {
  const list = await rolesRepository.listForTenant(communityId).catch(() => [] as any[]);
  const out: Record<string, any> = {};
  for (const r of list as any[]) {
    const key = r.canonicalRole || r.type || r.role;
    if ((LINKABLE as readonly string[]).includes(key)) out[key] = r;
  }
  return out;
}

async function saveRoleDoc(communityId: string, role: string, patch: { discordRoleIds?: string[]; discordRoleName?: string; permissions?: string[] }) {
  const docs = await roleDocs(communityId);
  const existing = docs[role];
  const data: any = { canonicalRole: role, type: role, ...(patch.discordRoleIds !== undefined ? { discordRoleIds: patch.discordRoleIds, discordRoleId: patch.discordRoleIds[0] || undefined } : {}), ...(patch.discordRoleName !== undefined ? { name: patch.discordRoleName } : {}), ...(patch.permissions ? { permissions: patch.permissions } : {}), updatedAt: new Date().toISOString() };
  if (existing) return rolesRepository.update(existing.id, data);
  return rolesRepository.create({ id: `role_${communityId}_${role}_${Date.now()}`, communityId, name: patch.discordRoleName || LABEL[role], permissions: patch.permissions || [...(DEFAULT_ROLE_PERMISSIONS as any)[role]], createdAt: new Date().toISOString(), ...data } as any);
}

/** Roles, their Discord links and permissions, plus everyone who can use the dashboard. */
export async function getTeamHandler(req: Request, res: Response) {
  try {
    const { communityId } = req.params;
    const guild = await guildFor(communityId);
    const docs = await roleDocs(communityId);
    const idsOf = (d: any): string[] => (Array.isArray(d?.discordRoleIds) ? d.discordRoleIds : d?.discordRoleId ? [d.discordRoleId] : []);
    const adminRoles = guild ? (Array.from(guild.roles.cache.values()) as any[]).filter((x) => x.id !== guild.id && !x.managed && x.permissions.has(PermissionFlagsBits.Administrator)).map((x) => x.id) : [];
    const roles = (LINKABLE as readonly string[]).map((r) => {
      const d = docs[r];
      const saved = idsOf(d);
      const linked = (r === 'OWNER' ? [...new Set([...adminRoles, ...saved])] : saved).filter((id) => guild?.roles?.cache?.has(id));
      return {
        role: r, label: LABEL[r],
        discordRoles: linked.map((id) => ({ id, name: guild.roles.cache.get(id).name, auto: r === 'OWNER' && adminRoles.includes(id) })),
        linkBroken: saved.some((id) => guild && !guild.roles.cache.has(id)),
        permissions: (r === 'OWNER' ? ALL_COMMUNITY_PERMISSIONS : d?.permissions?.length ? d.permissions : (DEFAULT_ROLE_PERMISSIONS as any)[r]) as string[],
        template: (r === 'OWNER' ? ALL_COMMUNITY_PERMISSIONS : (DEFAULT_ROLE_PERMISSIONS as any)[r]) as string[],
        fixed: r === 'OWNER',
      };
    });

    // People: owner + admins, members holding linked Discord roles, and manual assignments.
    const people = new Map<string, any>();
    const add = (id: string, role: string, source: string) => {
      const m: any = guild?.members?.cache?.get(id);
      const cur = people.get(id);
      const rank = (x: string) => ['OWNER', 'CONTROLLER', 'INTERVIEWER', 'RECRUITER'].indexOf(x);
      if (cur && rank(cur.role) <= rank(role)) { cur.sources.push(source); return; }
      people.set(id, { discordUserId: id, name: m?.displayName || id, username: m?.user?.username || '', avatar: m?.user?.displayAvatarURL?.({ size: 64 }) || null, role, sources: [...(cur?.sources || []), source], inServer: Boolean(m) });
    };
    if (guild) {
      add(guild.ownerId, 'OWNER', 'Server owner');
      await allMembers(guild).catch(() => undefined);
      for (const m of guild.members.cache.values() as any) {
        if (m.user.bot) continue;
        if (m.permissions.has(PermissionFlagsBits.Administrator) && m.id !== guild.ownerId) add(m.id, 'OWNER', 'Discord Administrator');
        for (const r of roles) for (const dr of r.discordRoles) if (m.roles.cache.has(dr.id)) add(m.id, r.role, `@${dr.name}`);
      }
    }
    const manual = await communityMemberAccessRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] } as any).catch(() => []);
    for (const a of manual as any[]) if (TEAM_ROLES.includes(a.role) && isSnowflake(a.discordUserId)) add(a.discordUserId, a.role, 'Added in dashboard');

    ok(res, { roles, people: Array.from(people.values()), allPermissions: ALL_COMMUNITY_PERMISSIONS, botCanManageRoles: Boolean(guild?.members?.me?.permissions?.has(PermissionFlagsBits.ManageRoles)) });
  } catch (err) { fail(res, err, 500); }
}

/** Link a dashboard role to an existing Discord role, or create one in Discord. */
export async function linkRoleHandler(req: Request, res: Response) {
  try {
    requireOwner(req);
    const { communityId } = req.params;
    const role = String(req.body?.role);
    if (!(LINKABLE as readonly string[]).includes(role)) throw new Error('Unknown role.');
    const guild = await guildFor(communityId);
    if (!guild) throw new Error('The bot is not connected to this server right now.');
    let ids: string[] = (Array.isArray(req.body?.discordRoleIds) ? req.body.discordRoleIds : []).filter((id: string) => isSnowflake(id) && guild.roles.cache.has(id) && id !== guild.id && !guild.roles.cache.get(id).managed).slice(0, 10);
    if (req.body?.create) {
      const created = guild.roles.cache.find((r: any) => r.name === LABEL[role]) || (await guild.roles.create({ name: LABEL[role], reason: 'Community Manager dashboard role', permissions: [] }));
      ids = [...new Set([...ids, created.id])];
    }
    await saveRoleDoc(communityId, role, { discordRoleIds: ids, discordRoleName: ids[0] ? guild.roles.cache.get(ids[0]).name : LABEL[role] });
    await auditService.log({ communityId, actorUserId: actor(req).userId, actorRole: 'OWNER', action: 'TEAM_ROLE_LINKED' as any, targetType: 'role', targetId: role, metadata: { discordRoleIds: ids } }).catch(() => undefined);
    ok(res, { role, discordRoleIds: ids });
  } catch (err) { fail(res, err); }
}

/** Edit what a role can do (or reset to its template). */
export async function setRolePermissionsHandler(req: Request, res: Response) {
  try {
    requireOwner(req);
    const { communityId } = req.params;
    const role = String(req.body?.role) as TeamRole;
    if (!TEAM_ROLES.includes(role)) throw new Error('Unknown role.');
    const perms = req.body?.reset ? [...DEFAULT_ROLE_PERMISSIONS[role]] : (Array.isArray(req.body?.permissions) ? req.body.permissions : []).filter((p: string) => (ALL_COMMUNITY_PERMISSIONS as string[]).includes(p));
    if (!perms.includes('community.view')) perms.unshift('community.view');
    await saveRoleDoc(communityId, role, { permissions: perms });
    // Manual assignments carry their own copy; keep them in step.
    const manual = await communityMemberAccessRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] } as any).catch(() => []);
    for (const a of manual as any[]) if (a.role === role) await communityMemberAccessRepository.update(a.id, { permissions: perms, updatedAt: new Date().toISOString() } as any).catch(() => undefined);
    void settingsService;
    await auditService.log({ communityId, actorUserId: actor(req).userId, actorRole: 'OWNER', action: 'TEAM_ROLE_PERMISSIONS_UPDATED' as any, targetType: 'role', targetId: role, metadata: { count: perms.length } }).catch(() => undefined);
    ok(res, { role, permissions: perms });
  } catch (err) { fail(res, err); }
}

/** Give someone a dashboard role (also gives the linked Discord role), or remove it. */
export async function setMemberRoleHandler(req: Request, res: Response) {
  try {
    requireOwner(req);
    const { communityId } = req.params;
    const userId = String(req.body?.discordUserId || '');
    if (!isSnowflake(userId)) throw new Error('Pick a member.');
    const role = req.body?.role ? (String(req.body.role) as TeamRole) : null;
    if (role && !TEAM_ROLES.includes(role)) throw new Error('Unknown role.');
    const guild = await guildFor(communityId);
    if (guild && userId === guild.ownerId) throw new Error('The server owner always has full access.');
    const docs = await roleDocs(communityId);
    const member: any = guild ? await guild.members.fetch(userId).catch(() => null) : null;
    const accessId = `${communityId}_${userId}`;
    const existing = await communityMemberAccessRepository.getById(accessId).catch(() => null);

    // Remove previous linked Discord roles, then apply the new one.
    if (member) {
      for (const r of TEAM_ROLES) {
        for (const id of (docs[r]?.discordRoleIds || (docs[r]?.discordRoleId ? [docs[r].discordRoleId] : [])) as string[]) {
          if (r !== role && member.roles.cache.has(id)) await member.roles.remove(id, 'Dashboard role changed').catch(() => undefined);
        }
      }
      const newId = role ? (docs[role]?.discordRoleIds?.[0] || docs[role]?.discordRoleId) : null;
      if (newId && !member.roles.cache.has(newId)) await member.roles.add(newId, 'Dashboard role granted').catch((e: any) => { throw new Error(`Could not give the Discord role: ${e?.message}. Move the bot’s role above it.`); });
    }

    if (!role) {
      if (existing) await communityMemberAccessRepository.delete(accessId).catch(() => undefined);
    } else {
      const perms = (docs[role]?.permissions?.length ? docs[role].permissions : DEFAULT_ROLE_PERMISSIONS[role]) as string[];
      const data: any = { communityId, discordUserId: userId, role, permissions: perms, source: 'MANUAL_ASSIGNMENT', updatedAt: new Date().toISOString() };
      if (existing) await communityMemberAccessRepository.update(accessId, data);
      else await communityMemberAccessRepository.create({ id: accessId, createdAt: new Date().toISOString(), ...data });
    }
    await auditService.log({ communityId, actorUserId: actor(req).userId, actorRole: 'OWNER', action: 'USER_ROLE_CHANGED' as any, targetType: 'USER', targetId: userId, metadata: { role: role || 'REMOVED' } }).catch(() => undefined);
    ok(res, { discordUserId: userId, role });
  } catch (err) { fail(res, err); }
}
