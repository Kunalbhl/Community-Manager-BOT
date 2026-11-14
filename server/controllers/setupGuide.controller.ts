/**
 * Setup guide: one checklist per module, computed from real settings and the live server,
 * so an admin can set everything up step by step in one place.
 */
import { Request, Response } from 'express';
import { PermissionFlagsBits } from 'discord.js';
import { getToolkit, guildFor } from '../services/toolkit/toolkitConfig.js';
import { getFeatures } from '../services/features/featuresConfig.js';
import { getGate } from '../services/recruitment/secureGate.service.js';
import { communityQuestionsService } from '../services/communityQuestions.service.js';
import { autoModerationRulesRepository } from '../repositories/index.js';

interface Step { label: string; done: boolean; section: string; tab?: string; hint?: string; required?: boolean; find?: string }
interface Module { key: string; title: string; description: string; steps: Step[] }

export async function setupGuideHandler(req: Request, res: Response) {
  try {
    const { communityId } = req.params;
    const [t, f, gate, guild, qs, iqs, rules, automod] = await Promise.all([
      getToolkit(communityId), getFeatures(communityId, true), getGate(communityId), guildFor(communityId),
      communityQuestionsService.listApplicationQuestions(communityId).catch(() => []),
      communityQuestionsService.listInterviewQuestions(communityId).catch(() => []),
      communityQuestionsService.listGuidelines(communityId).catch(() => []),
      autoModerationRulesRepository.list({ where: [{ field: 'communityId', operator: '==', value: communityId }] } as any).catch(() => []),
    ]);
    const me = guild?.members?.me;
    const perm = (p: bigint) => Boolean(me?.permissions?.has(p));
    const r = t.recruitment;

    const modules: Module[] = [
      {
        key: 'server', title: 'Server connection', description: 'The bot is in your server with the permissions it needs.',
        steps: [
          { required: true, label: 'Bot is online in this server', done: Boolean(guild), section: 'home' },
          { required: true, label: 'Manage Roles and Manage Channels', done: perm(PermissionFlagsBits.ManageRoles) && perm(PermissionFlagsBits.ManageChannels), section: 'home', hint: 'Server Settings → Roles → Community Manager' },
          { label: 'Moderation permissions (timeout, kick, ban)', done: perm(PermissionFlagsBits.ModerateMembers) && perm(PermissionFlagsBits.KickMembers) && perm(PermissionFlagsBits.BanMembers), section: 'home' },
          { required: true, label: 'Workspace channels ready (applications, logs)', done: Boolean(r.reviewChannelId && r.logChannelId), section: 'server-tools', tab: 'recruit', find: '⚙️ Auto-configure', hint: 'Press “Auto-configure workspace”.' },
        ],
      },
      {
        key: 'secure', title: 'Secure Setup', description: 'Newcomers only see your public channels until they are approved.',
        steps: [
          { required: true, label: 'Lock the server for newcomers', done: Boolean(gate.memberRoleId && gate.publicChannelIds?.length && gate.job?.status !== 'FAILED'), section: 'server-tools', tab: 'recruit', find: 'Secure Setup' },
          { required: true, label: 'Confirm Discord’s Apply to Join is off', done: gate.verified, section: 'server-tools', tab: 'recruit', find: 'Secure Setup' },
        ],
      },
      {
        key: 'recruitment', title: 'Recruitment', description: 'People apply in Discord, get a private application chat, and staff decide.',
        steps: [
          { label: 'Rules & guidelines written', done: rules.length > 0, section: 'server-tools', tab: 'recruit', find: 'Server rules', hint: 'Shown to applicants before the quiz.' },
          { required: true, label: 'Application questions', done: qs.length > 0, section: 'recruitment' },
          { label: 'Rules quiz (4-answer questions)', done: r.screening.questions.length > 0, section: 'server-tools', tab: 'recruit', find: 'Rules quiz' },
          { label: 'Messages to applicants', done: true, section: 'server-tools', tab: 'recruit', find: 'Messages' },
          { label: 'Reviewer ranks for escalation', done: t.reviewRooms.tiers.some((x) => x.roleIds.length), section: 'server-tools', tab: 'rooms' },
          { label: 'Roles given on approval', done: Boolean(gate.memberRoleId) || t.roleRules.rules.length > 0, section: 'server-tools', tab: 'roles' },
          { label: 'Apply panel posted', done: Boolean((r as any).panelPostedAt), section: 'server-tools', tab: 'recruit', find: 'Apply panel' },
        ],
      },
      {
        key: 'interviews', title: 'Interviews', description: 'Automatic by Community Manager or manual by your interviewers.',
        steps: [
          { label: `Mode chosen (${r.interview.mode === 'AUTO' ? 'automatic' : 'manual'})`, done: true, section: 'server-tools', tab: 'recruit', find: 'Interview is run by' },
          { label: 'Interview questions', done: r.interview.mode === 'MANUAL' || iqs.length > 0, section: 'server-tools', tab: 'recruit', find: 'Interview questions', hint: 'Needed for automatic interviews.' },
        ],
      },
      {
        key: 'moderation', title: 'Moderation & safety', description: 'Warnings with automatic actions, auto-moderation and logs.',
        steps: [
          { label: 'Warning system on', done: t.warnings.enabled, section: 'server-tools', tab: 'warnings' },
          { label: 'Auto-moderation rules', done: (automod as any[]).length > 0, section: 'moderation' },
          { label: 'Server logs channel', done: Boolean(f.logs.enabled && f.logs.channelId), section: 'community-features', tab: 'logs' },
        ],
      },
      {
        key: 'tickets', title: 'Tickets', description: 'Members open private tickets by type; staff claim and close them.',
        steps: [
          { label: 'Ticket types and staff roles', done: t.tickets.enabled && t.tickets.staffRoleIds.length > 0, section: 'server-tools', tab: 'tickets' },
          { label: 'Ticket panel posted', done: Boolean((t.tickets as any).panelPostedAt), section: 'server-tools', tab: 'tickets' },
        ],
      },
      {
        key: 'community', title: 'Community features', description: 'Levels, giveaways, self-roles, verification, starboard, birthdays.',
        steps: [
          { label: 'Levels & XP', done: f.levels.enabled, section: 'community-features', tab: 'levels' },
          { label: 'Button roles or verification', done: f.verification.enabled, section: 'community-features', tab: 'verification' },
          { label: 'Birthdays or starboard', done: f.birthdays.enabled || f.starboard.enabled, section: 'community-features', tab: 'birthdays' },
        ],
      },
      {
        key: 'integrations', title: 'Integrations', description: 'Google Sheets record and SocialCord social media alerts.',
        steps: [
          { label: 'Google Sheets live record', done: Boolean(r.sheetWebhookUrl), section: 'server-tools', tab: 'recruit', find: '📊 Google Sheets' },
        ],
      },
    ];
    const all = modules.flatMap((m) => m.steps);
    res.json({ success: true, data: { modules, done: all.filter((s) => s.done).length, total: all.length, requiredLeft: all.filter((s) => s.required && !s.done).length } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { message: err?.message } });
  }
}
